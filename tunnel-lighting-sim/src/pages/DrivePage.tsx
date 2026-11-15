import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useCurrentProject } from '../store/appStore'
import { useCalcResult } from '../hooks/useCalcResult'
import { frameAt, v3, worldAt, crossSectionOutline } from '../engine/geometry'
import { ZONE_META } from '../engine/standards'

interface DriveInfo {
  s: number
  speedKmh: number
  ambientL: number
  adaptL: number
  zone: string
  inside: boolean
}

/**
 * 第一人称驾驶渲染器
 * 适应模型：L_adapt 以时间常数 τ 指数趋近环境亮度；
 * 曝光 exposure = K / L_adapt，未适应时洞内漆黑（黑洞效应），适应后逐渐看清。
 */
function DriveCanvas({
  playing,
  speedKmh,
  seekS,
  onInfo
}: {
  playing: boolean
  speedKmh: number
  seekS: { s: number; nonce: number } | null
  onInfo: (info: DriveInfo) => void
}) {
  const project = useCurrentProject()!
  const result = useCalcResult()!
  const mountRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef({
    s: -150,
    playing,
    speedKmh,
    adaptL: project.l20,
    lastInfo: 0
  })
  stateRef.current.playing = playing
  stateRef.current.speedKmh = speedKmh

  // 进度条拖动定位
  useEffect(() => {
    if (seekS) stateRef.current.s = seekS.s
  }, [seekS])

  // 桩号 → 环境亮度（洞外取 L20，洞内取计算的纵向平均亮度，线性插值）
  const ambientAt = useMemo(() => {
    const curve = result.roadGrid.map((row) => ({
      s: row[0].s,
      l: row.reduce((a, g) => a + g.luminance, 0) / row.length
    }))
    return (s: number): number => {
      if (s < 0) return project.l20
      if (s >= project.alignment.length) return project.l20 * 0.8 // 出口外
      for (let i = 0; i < curve.length - 1; i++) {
        if (curve[i + 1].s >= s) {
          const k = (s - curve[i].s) / (curve[i + 1].s - curve[i].s || 1)
          return curve[i].l + (curve[i + 1].l - curve[i].l) * k
        }
      }
      return curve[curve.length - 1]?.l ?? 1
    }
  }, [result, project.l20, project.alignment.length])

  useEffect(() => {
    const mount = mountRef.current!
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 0.1
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(62, mount.clientWidth / mount.clientHeight, 0.05, 3000)
    scene.background = new THREE.Color(0xbfe3ff)
    scene.fog = new THREE.Fog(0xbfe3ff, 120, 900)

    // 洞外：太阳 + 地面 + 山体
    const sun = new THREE.DirectionalLight(0xfff4e0, 3.2)
    sun.position.set(-120, 160, 80)
    scene.add(sun)
    scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x5a5347, 0.9))

    const outsideGround = new THREE.Mesh(
      new THREE.PlaneGeometry(2000, 600),
      new THREE.MeshStandardMaterial({ color: 0x6d7a55, roughness: 1 })
    )
    outsideGround.rotation.x = -Math.PI / 2
    outsideGround.position.x = -600
    scene.add(outsideGround)

    // 洞门山体（沿行车方向 6m 厚的边墙 + 顶梁，洞口位于 s=0）
    const portalMat = new THREE.MeshStandardMaterial({ color: 0x5d6570, roughness: 0.9 })
    const half = project.crossSection.roadWidth / 2
    const ch = project.crossSection.crownHeight
    const mkBox = (w: number, h: number, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 8), portalMat)
      m.position.set(x, y, z)
      scene.add(m)
    }
    const wallH = ch + 5
    mkBox(6, wallH, -3, wallH / 2, -(half + 3))
    mkBox(6, wallH, -3, wallH / 2, half + 3)
    mkBox(6, 4, -3, ch + 2, 0)

    // 隧道内壁（内表面）
    const outline = crossSectionOutline(project.crossSection, 24)
    const segLen = 4
    const nSeg = Math.ceil(project.alignment.length / segLen)
    const rings: THREE.Vector3[][] = []
    for (let i = 0; i <= nSeg; i++) {
      const s = Math.min(project.alignment.length, i * segLen)
      const f = frameAt(project.alignment, s)
      rings.push(outline.map(([lat, v]) => {
        const w = v3.add(f.p, v3.add(v3.scale(f.n, lat), v3.scale(f.u, v)))
        return new THREE.Vector3(w.x, w.y, w.z)
      }))
    }
    const wallPos: number[] = []
    for (let i = 0; i < nSeg; i++) {
      for (let j = 0; j < outline.length - 1; j++) {
        const a = rings[i][j], b = rings[i][j + 1], c = rings[i + 1][j], d = rings[i + 1][j + 1]
        // 反向绕序使法线朝洞内
        wallPos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
        wallPos.push(b.x, b.y, b.z, d.x, d.y, d.z, c.x, c.y, c.z)
      }
    }
    const wallGeo = new THREE.BufferGeometry()
    wallGeo.setAttribute('position', new THREE.Float32BufferAttribute(wallPos, 3))
    wallGeo.computeVertexNormals()
    scene.add(new THREE.Mesh(
      wallGeo,
      new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.92, side: THREE.DoubleSide })
    ))

    // 路面 + 车道虚线
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 1 })
    const roadPositions: number[] = []
    for (let i = 0; i < nSeg; i++) {
      const s0 = i * segLen
      const s1 = Math.min(project.alignment.length, (i + 1) * segLen)
      const aL = worldAt(project.alignment, s0, -half, 0.01)
      const aR = worldAt(project.alignment, s0, half, 0.01)
      const bL = worldAt(project.alignment, s1, -half, 0.01)
      const bR = worldAt(project.alignment, s1, half, 0.01)
      roadPositions.push(aL.x, aL.y, aL.z, bL.x, bL.y, bL.z, aR.x, aR.y, aR.z)
      roadPositions.push(aR.x, aR.y, aR.z, bL.x, bL.y, bL.z, bR.x, bR.y, bR.z)
    }
    const roadGeo = new THREE.BufferGeometry()
    roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(roadPositions, 3))
    roadGeo.computeVertexNormals()
    scene.add(new THREE.Mesh(roadGeo, roadMat))

    // 车道虚线：用四元数对齐桩号切线，保证弯坡段也沿行车方向
    const dashGeo = new THREE.BoxGeometry(3, 0.02, 0.18)
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8dde3 })
    const dashCount = Math.floor(project.alignment.length / 8)
    const dashes = new THREE.InstancedMesh(dashGeo, dashMat, dashCount)
    const m4 = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const xAxis = new THREE.Vector3(1, 0, 0)
    const scaleV = new THREE.Vector3(1, 1, 1)
    for (let i = 0; i < dashCount; i++) {
      const s = i * 8 + 4
      const w = worldAt(project.alignment, s, 0, 0.03)
      const f = frameAt(project.alignment, s)
      q.setFromUnitVectors(xAxis, f.t)
      m4.compose(new THREE.Vector3(w.x, w.y, w.z), q, scaleV)
      dashes.setMatrixAt(i, m4)
    }
    scene.add(dashes)

    // 灯具：发光小球 + 循环使用的点光源（仅取相机附近若干盏）
    const lamps = project.luminaires.filter((l) => l.enabled)
    const bulbGeo = new THREE.SphereGeometry(0.18, 8, 6)
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfff2c8 })
    const bulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, lamps.length)
    lamps.forEach((l, i) => {
      const w = worldAt(project.alignment, l.s, l.lateral, l.height)
      m4.makeTranslation(w.x, w.y, w.z)
      bulbs.setMatrixAt(i, m4)
    })
    scene.add(bulbs)

    const LIGHT_POOL = 8
    const pointLights = Array.from({ length: LIGHT_POOL }, () => {
      const pl = new THREE.PointLight(0xffe6b0, 0, 26, 1.6)
      scene.add(pl)
      return pl
    })
    const innerHemi = new THREE.HemisphereLight(0xcfd8e6, 0x2a2d33, 0.25)
    scene.add(innerHemi)

    const clock = new THREE.Clock()
    let raf = 0
    const tmpV = new THREE.Vector3()

    const tick = () => {
      raf = requestAnimationFrame(tick)
      const dt = Math.min(clock.getDelta(), 0.05)
      const st = stateRef.current
      if (st.playing) {
        st.s += (st.speedKmh / 3.6) * dt
        if (st.s > project.alignment.length + 60) st.s = -150 // 循环
      }

      // 相机：眼高 1.5m，视线沿切线
      const f = frameAt(project.alignment, Math.max(0, st.s))
      const eyeS = Math.max(0, st.s)
      const eye = worldAt(project.alignment, eyeS, 0, project.calcSettings.observerEyeHeight)
      camera.position.set(eye.x, eye.y, eye.z)
      const look = v3.add(eye, v3.scale(f.t, 20))
      tmpV.set(look.x, look.y + 0.4, look.z)
      camera.lookAt(tmpV)

      // 适应过程
      const targetL = ambientAt(st.s)
      const tau = project.calcSettings.adaptationTimeSec
      st.adaptL += (targetL - st.adaptL) * (1 - Math.exp(-dt / tau))

      // 曝光与环境：洞内/洞外两套光照基调
      const inside = st.s >= 0 && st.s <= project.alignment.length
      const exposure = THREE.MathUtils.clamp(150 / Math.max(st.adaptL, 0.5), 0.04, 6)
      renderer.toneMappingExposure = exposure
      sun.intensity = inside ? 0.15 : 3.2
      if (inside) {
        scene.background = new THREE.Color(0x14181f)
        scene.fog = new THREE.Fog(0x14181f, 30, 220)
      } else if (st.s < 0) {
        scene.background = new THREE.Color(0xbfe3ff)
        scene.fog = new THREE.Fog(0xbfe3ff, 150, 900)
      } else {
        scene.background = new THREE.Color(0xd8ecff)
        scene.fog = new THREE.Fog(0xd8ecff, 150, 900)
      }

      // 动态点光源：最近 8 盏
      const nearest = lamps
        .map((l) => ({ l, d: Math.abs(l.s - eyeS) }))
        .filter((x) => x.d < 30)
        .sort((a, b) => a.d - b.d)
        .slice(0, LIGHT_POOL)
      pointLights.forEach((pl, i) => {
        const hit = nearest[i]
        if (!hit) {
          pl.intensity = 0
          return
        }
        const w = worldAt(project.alignment, hit.l.s, hit.l.lateral, hit.l.height)
        pl.position.set(w.x, w.y, w.z)
        pl.intensity = 14 * hit.l.dimFactor * Math.max(0.2, 1 - hit.d / 30)
      })
      innerHemi.intensity = inside ? 0.25 : 0.05

      renderer.render(scene, camera)

      if (performance.now() - st.lastInfo > 120) {
        st.lastInfo = performance.now()
        const zone = project.zones.find((z) => st.s >= z.startS && st.s < z.endS)
        onInfo({
          s: st.s,
          speedKmh: st.speedKmh,
          ambientL: targetL,
          adaptL: st.adaptL,
          zone: zone ? ZONE_META[zone.type].name : st.s < 0 ? '洞外接近段' : '出口外',
          inside
        })
      }
    }
    tick()

    const onResize = () => {
      renderer.setSize(mount.clientWidth, mount.clientHeight)
      camera.aspect = mount.clientWidth / mount.clientHeight
      camera.updateProjectionMatrix()
    }
    window.addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      renderer.dispose()
      mount.removeChild(renderer.domElement)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, result])

  return <div ref={mountRef} className="canvas-wrap" style={{ height: 520 }} />
}

export default function DrivePage() {
  const project = useCurrentProject()!
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(project.designSpeedKmh)
  const [seek, setSeek] = useState<{ s: number; nonce: number } | null>(null)
  const [info, setInfo] = useState<DriveInfo>({
    s: -150, speedKmh: speed, ambientL: project.l20, adaptL: project.l20, zone: '洞外接近段', inside: false
  })

  const adaptPct = info.ambientL > 0
    ? THREE_clamp(info.adaptL / info.ambientL, 0, 1) * 100
    : 100

  return (
    <div className="page">
      <h1 className="page-title">
        驾驶视角预览
        <span className="sub">洞外阳光 → 入口黑洞效应 → 暗适应全过程模拟</span>
      </h1>

      <DriveCanvas playing={playing} speedKmh={speed} seekS={seek} onInfo={setInfo} />

      <div className="grid-3" style={{ marginTop: 14 }}>
        <div className="kpi">
          <div className="v mono">{info.s < 0 ? info.s.toFixed(1) : `K${info.s.toFixed(1)}`}</div>
          <div className="k">桩号 (m){info.inside ? ' · 洞内' : ' · 洞外'}</div>
        </div>
        <div className="kpi">
          <div className="v mono">{speed} <span style={{ fontSize: 13 }} className="muted">km/h</span></div>
          <div className="k">行驶车速（当前区段：{info.zone}）</div>
        </div>
        <div className="kpi">
          <div className="v mono">{info.ambientL.toFixed(1)} → {info.adaptL.toFixed(1)}</div>
          <div className="k">环境亮度 → 眼睛适应亮度 (cd/m²)</div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="primary" onClick={() => setPlaying(!playing)}>
            {playing ? '⏸ 暂停' : '▶ 行驶'}
          </button>
          <label style={{ margin: 0, minWidth: 260, flex: 1, maxWidth: 420 }}>
            车速 {speed} km/h
            <input
              type="range"
              min={20}
              max={120}
              step={5}
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              style={{ width: '100%' }}
            />
          </label>
          <label style={{ margin: 0, minWidth: 260, flex: 1, maxWidth: 420 }}>
            行驶位置（拖动定位演示）{info.s.toFixed(0)} m
            <input
              type="range"
              min={-150}
              max={project.alignment.length}
              step={2}
              value={Math.max(-150, Math.min(project.alignment.length, info.s))}
              onChange={(e) => setSeek({ s: Number(e.target.value), nonce: Date.now() })}
              style={{ width: '100%' }}
            />
          </label>
          <div style={{ flex: 1, minWidth: 240 }}>
            <label>视觉适应进度（τ = {project.calcSettings.adaptationTimeSec}s，可在设置页调整）</label>
            <div style={{ height: 10, background: 'var(--bg-input)', borderRadius: 5, overflow: 'hidden' }}>
              <div
                style={{
                  width: `${adaptPct}%`,
                  height: '100%',
                  background: adaptPct > 90 ? 'var(--ok)' : 'var(--warn)',
                  transition: 'width 0.15s'
                }}
              />
            </div>
          </div>
        </div>
        <p className="muted" style={{ marginBottom: 0, fontSize: 12, marginTop: 12 }}>
          模拟原理：人眼适应亮度按一阶惯性环节 L<sub>adapt</sub> 趋近环境亮度（时间常数 τ），
          渲染曝光 ∝ 1/L<sub>adapt</sub>。车辆驶入洞口瞬间适应亮度仍为洞外 L20 水平，
          洞内路面相对极暗即呈现「黑洞效应」；随适应推进画面逐渐清晰，可直观检验入口段加强照明是否足够。
        </p>
      </div>
    </div>
  )
}

function THREE_clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}
