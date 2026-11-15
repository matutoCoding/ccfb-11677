import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { LightingZone, PlacedLuminaire, TunnelProject } from '../types'
import { crossSectionOutline, frameAt, v3, worldAt } from '../engine/geometry'
import { ZONE_META } from '../engine/standards'

export interface ViewerHandle {
  flyTo: (s: number) => void
}

/**
 * 隧道三维查看器
 * 沿桩号逐段放置断面环并连接成壳（直/弯/坡统一走 frameAt 坐标变换）
 */
export default function TunnelViewer({
  project,
  highlightS,
  height = 460
}: {
  project: TunnelProject
  highlightS?: number | null
  height?: number
}) {
  const mountRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef<{
    renderer?: THREE.WebGLRenderer
    camera?: THREE.PerspectiveCamera
    scene?: THREE.Scene
    camTarget: THREE.Vector3
    camPos: THREE.Vector3
    drag?: { x: number; y: number }
  }>({} as {
    renderer?: THREE.WebGLRenderer
    camera?: THREE.PerspectiveCamera
    scene?: THREE.Scene
    camTarget: THREE.Vector3
    camPos: THREE.Vector3
    drag?: { x: number; y: number }
  })
  const projectRef = useRef(project)
  projectRef.current = project
  const flyRef = useRef<number | null>(null)

  useEffect(() => {
    const mount = mountRef.current!
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    renderer.setSize(mount.clientWidth, height)
    renderer.shadowMap.enabled = false
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0a0e14)
    const camera = new THREE.PerspectiveCamera(55, mount.clientWidth / height, 0.1, 5000)
    camera.position.set(20, 25, 60)

    scene.add(new THREE.AmbientLight(0xffffff, 0.85))
    const dir = new THREE.DirectionalLight(0xffffff, 1.1)
    dir.position.set(40, 80, 30)
    scene.add(dir)

    const grid = new THREE.GridHelper(2000, 100, 0x223044, 0x182230)
    grid.position.y = -0.02
    scene.add(grid)

    stateRef.current = {
      renderer,
      camera,
      scene,
      camTarget: new THREE.Vector3(0, 4, 0),
      camPos: camera.position.clone()
    }

    // 简单轨道控制（自实现，避免引额外依赖）
    const el = renderer.domElement
    let yaw = -0.7
    let pitch = 0.42
    let dist = 90
    const applyCam = () => {
      const t = stateRef.current.camTarget
      camera.position.set(
        t.x + dist * Math.cos(pitch) * Math.cos(yaw),
        t.y + dist * Math.sin(pitch),
        t.z + dist * Math.cos(pitch) * Math.sin(yaw)
      )
      camera.lookAt(t)
    }
    applyCam()

    const onDown = (e: MouseEvent) => {
      stateRef.current.drag = { x: e.clientX, y: e.clientY }
    }
    const onMove = (e: MouseEvent) => {
      const d = stateRef.current.drag
      if (!d) return
      yaw -= (e.clientX - d.x) * 0.006
      pitch = Math.max(-0.2, Math.min(1.45, pitch + (e.clientY - d.y) * 0.006))
      d.x = e.clientX
      d.y = e.clientY
      applyCam()
    }
    const onUp = () => (stateRef.current.drag = undefined)
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      dist = Math.max(8, Math.min(900, dist * (1 + Math.sign(e.deltaY) * 0.12)))
      applyCam()
    }
    el.addEventListener('mousedown', onDown)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    el.addEventListener('wheel', onWheel, { passive: false })

    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      if (flyRef.current !== null) {
        const p = projectRef.current
        const w = worldAt(p.alignment, flyRef.current, 0, 3)
        stateRef.current.camTarget.lerp(new THREE.Vector3(w.x, w.y, w.z), 0.08)
        applyCam()
      }
      renderer.render(scene, camera)
    }
    tick()

    const onResize = () => {
      if (!mount.clientWidth) return
      renderer.setSize(mount.clientWidth, height)
      camera.aspect = mount.clientWidth / height
      camera.updateProjectionMatrix()
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      el.removeEventListener('mousedown', onDown)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      el.removeEventListener('wheel', onWheel)
      renderer.dispose()
      mount.removeChild(renderer.domElement)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height])

  // 场景内容随项目重建
  useEffect(() => {
    const st = stateRef.current
    if (!st.scene) return
    // 移除旧组
    const old = st.scene.getObjectByName('tunnel-group')
    if (old) st.scene.remove(old)
    const group = new THREE.Group()
    group.name = 'tunnel-group'
    const p = project

    const outline = crossSectionOutline(p.crossSection, 20)
    const segLen = 4
    const nSeg = Math.max(2, Math.ceil(p.alignment.length / segLen))
    const ringPts: THREE.Vector3[][] = []
    for (let i = 0; i <= nSeg; i++) {
      const s = Math.min(p.alignment.length, i * segLen)
      const f = frameAt(p.alignment, s)
      ringPts.push(
        outline.map(([lat, v]) => {
          const w = v3.add(f.p, v3.add(v3.scale(f.n, lat), v3.scale(f.u, v)))
          return new THREE.Vector3(w.x, w.y, w.z)
        })
      )
    }

    // 隧道壳体（双面半透明混凝土色）
    const positions: number[] = []
    for (let i = 0; i < nSeg; i++) {
      for (let j = 0; j < outline.length - 1; j++) {
        const a = ringPts[i][j]
        const b = ringPts[i][j + 1]
        const c = ringPts[i + 1][j]
        const d = ringPts[i + 1][j + 1]
        positions.push(a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z)
        positions.push(b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z)
      }
    }
    const shellGeo = new THREE.BufferGeometry()
    shellGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    shellGeo.computeVertexNormals()
    const shell = new THREE.Mesh(
      shellGeo,
      new THREE.MeshStandardMaterial({
        color: 0x8d99a8,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.28,
        roughness: 0.95,
        depthWrite: false
      })
    )
    group.add(shell)

    // 路面
    const half = p.crossSection.roadWidth / 2
    const roadPos: number[] = []
    for (let i = 0; i < nSeg; i++) {
      const s0 = Math.min(p.alignment.length, i * segLen)
      const s1 = Math.min(p.alignment.length, (i + 1) * segLen)
      const w0l = worldAt(p.alignment, s0, -half, 0.02)
      const w0r = worldAt(p.alignment, s0, half, 0.02)
      const w1l = worldAt(p.alignment, s1, -half, 0.02)
      const w1r = worldAt(p.alignment, s1, half, 0.02)
      roadPos.push(
        w0l.x, w0l.y, w0l.z, w1l.x, w1l.y, w1l.z, w0r.x, w0r.y, w0r.z,
        w0r.x, w0r.y, w0r.z, w1l.x, w1l.y, w1l.z, w1r.x, w1r.y, w1r.z
      )
    }
    const roadGeo = new THREE.BufferGeometry()
    roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(roadPos, 3))
    roadGeo.computeVertexNormals()
    group.add(new THREE.Mesh(roadGeo, new THREE.MeshStandardMaterial({ color: 0x353c46, roughness: 1 })))

    // 区段着色条（路面上方 0.15m 的细带）
    p.zones.forEach((z: LightingZone) => {
      const color = new THREE.Color(ZONE_META[z.type].color)
      const zPos: number[] = []
      const steps = Math.max(1, Math.ceil((z.endS - z.startS) / 5))
      for (let i = 0; i < steps; i++) {
        const a = z.startS + ((z.endS - z.startS) * i) / steps
        const b = z.startS + ((z.endS - z.startS) * (i + 1)) / steps
        const wa = worldAt(p.alignment, a, -half * 0.96, 0.06)
        const wb = worldAt(p.alignment, b, -half * 0.96, 0.06)
        const wa2 = worldAt(p.alignment, a, half * 0.96, 0.06)
        const wb2 = worldAt(p.alignment, b, half * 0.96, 0.06)
        zPos.push(wa.x, wa.y, wa.z, wb.x, wb.y, wb.z, wa2.x, wa2.y, wa2.z)
        zPos.push(wa2.x, wa2.y, wa2.z, wb.x, wb.y, wb.z, wb2.x, wb2.y, wb2.z)
      }
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(zPos, 3))
      const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55 }))
      group.add(mesh)
    })

    // 灯具标记（实例化小球）
    const lamps = p.luminaires.filter((l) => l.enabled)
    if (lamps.length) {
      const sphere = new THREE.SphereGeometry(0.22, 10, 8)
      const mat = new THREE.MeshStandardMaterial({ color: 0xffd76e, emissive: 0x9a6b12, emissiveIntensity: 0.7 })
      const inst = new THREE.InstancedMesh(sphere, mat, lamps.length)
      const m4 = new THREE.Matrix4()
      lamps.forEach((l: PlacedLuminaire, i: number) => {
        const w = worldAt(p.alignment, l.s, l.lateral, l.height)
        m4.makeTranslation(w.x, w.y, w.z)
        inst.setMatrixAt(i, m4)
      })
      group.add(inst)
    }

    // 高亮点位
    if (highlightS !== null && highlightS !== undefined) {
      const w = worldAt(p.alignment, highlightS, 0, p.crossSection.crownHeight)
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.6, 14, 12),
        new THREE.MeshBasicMaterial({ color: 0x4da3ff })
      )
      marker.position.set(w.x, w.y, w.z)
      group.add(marker)
    }

    // 入口方向标记
    const portal = worldAt(p.alignment, 0, 0, p.crossSection.crownHeight / 2)
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(1.2, 3, 12),
      new THREE.MeshBasicMaterial({ color: 0x4cc38a })
    )
    cone.position.set(portal.x - 3, portal.y, portal.z)
    group.add(cone)

    st.scene.add(group)
  }, [project, highlightS])

  // 飞行定位
  useEffect(() => {
    if (highlightS !== null && highlightS !== undefined) flyRef.current = highlightS
  }, [highlightS])

  return <div ref={mountRef} className="canvas-wrap" style={{ height }} />
}
