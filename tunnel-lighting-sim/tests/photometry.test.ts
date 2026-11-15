import { describe, it, expect } from 'vitest'
import { interpolatePhotometry, pointIlluminance } from '../src/engine/photometry'
import { BUILTIN_LUMINAIRES } from '../src/engine/luminaireLibrary'
import type { LuminaireLibraryItem, PlacedLuminaire, PhotometricData } from '../src/types'

/** 构造朗伯测试灯：cd/1000lm 表按 I0=1000/π 生成；γ 网格 1° 加密，隔离插值误差 */
function lambertLamp(flux = 1000, mf = 1): LuminaireLibraryItem {
  const gammas: number[] = []
  for (let g = 0; g <= 90; g++) gammas.push(g)
  const I0 = 1000 / Math.PI
  const lut = gammas.map((g) => I0 * Math.cos((g * Math.PI) / 180))
  const ph: PhotometricData = {
    id: 'ph-test-lambert',
    name: '测试朗伯',
    cAngles: [0, 90, 180, 270, 360],
    gammaAngles: gammas,
    cdPerKlmLUT: [0, 1, 2, 3, 4].map(() => [...lut]),
    source: 'builtin'
  }
  return {
    id: 'test-lamp',
    name: '测试灯',
    manufacturer: 'test',
    ratedFlux: flux,
    powerW: 100,
    colorTempK: 4500,
    maintenanceFactor: mf,
    photometric: ph
  }
}

const straight = { length: 200, gradePct: 0, curveRadius: 0, curveDirection: 1 as const }

function baseLamp(over: Partial<PlacedLuminaire> = {}): PlacedLuminaire {
  return {
    id: 'L1',
    libraryId: 'test-lamp',
    s: 0,
    lateral: 0,
    height: 6,
    yawDeg: 0,
    tiltDeg: 0,
    rollDeg: 0,
    dimFactor: 1,
    enabled: true,
    ...over
  }
}

describe('单灯点照度 — 平方反比余弦公式手算核对（误差 <1%）', () => {
  const item = lambertLamp()

  it('斜射点：h=6m, 水平距离 4m', () => {
    // d=√52=7.2111, cosγ=cosθ=6/d, γ=33.6901°
    // I = I0·cosγ·(flux/1000) = 318.31·cosγ
    // E = I·cosθ/d²
    const h = 6
    const x = 4
    const d = Math.hypot(h, x)
    const cosG = h / d
    const gamma = (Math.acos(cosG) * 180) / Math.PI
    const I = (1000 / Math.PI) * cosG
    const expected = (I * cosG) / (d * d)

    const r = pointIlluminance({
      lamp: baseLamp({ height: h }),
      item,
      point: { x: x, y: 0, z: 0 },
      normal: { x: 0, y: 0, z: 1 },
      alignment: straight
    })
    expect(r.distance).toBeCloseTo(d, 9)
    expect(r.gammaDeg).toBeCloseTo(gamma, 6)
    // 光强插值相对误差 < 0.1%（1° 网格）
    expect(Math.abs(r.intensity - I) / I).toBeLessThan(0.001)
    // 照度与手算值相对误差 < 1%（验收标准）
    expect(Math.abs(r.e - expected) / expected).toBeLessThan(0.01)
  })

  it('正下方点：γ=0，E = I0/h²', () => {
    const h = 8
    const expected = 1000 / Math.PI / (h * h)
    const r = pointIlluminance({
      lamp: baseLamp({ height: h }),
      item,
      point: { x: 0, y: 0, z: 0 },
      normal: { x: 0, y: 0, z: 1 },
      alignment: straight
    })
    expect(r.gammaDeg).toBeCloseTo(0, 9)
    expect(r.cDeg).toBeCloseTo(0, 6)
    expect(Math.abs(r.e - expected) / expected).toBeLessThan(0.01)
  })

  it('横向偏移点与纵向偏移点结果一致（轴对称配光）', () => {
    const r1 = pointIlluminance({
      lamp: baseLamp(),
      item,
      point: { x: 5, y: 0, z: 0 },
      normal: { x: 0, y: 0, z: 1 },
      alignment: straight
    })
    const r2 = pointIlluminance({
      lamp: baseLamp(),
      item,
      point: { x: 0, y: 5, z: 0 },
      normal: { x: 0, y: 0, z: 1 },
      alignment: straight
    })
    expect(r2.e).toBeCloseTo(r1.e, 6)
    expect(r2.cDeg).toBeCloseTo(r1.cDeg + 90, 5)
  })

  it('维护系数与调光系数线性生效', () => {
    const itemMF = lambertLamp(1000, 0.7)
    const r0 = pointIlluminance({
      lamp: baseLamp(),
      item,
      point: { x: 3, y: 0, z: 0 },
      normal: { x: 0, y: 0, z: 1 },
      alignment: straight
    })
    const r1 = pointIlluminance({
      lamp: baseLamp({ dimFactor: 0.5 }),
      item: itemMF,
      point: { x: 3, y: 0, z: 0 },
      normal: { x: 0, y: 0, z: 1 },
      alignment: straight
    })
    expect(r1.e).toBeCloseTo(r0.e * 0.7 * 0.5, 5)
  })

  it('非 1000lm 灯具按光通量比例换算', () => {
    const item24k = lambertLamp(24000)
    const r1k = pointIlluminance({
      lamp: baseLamp(),
      item,
      point: { x: 4, y: 0, z: 0 },
      normal: { x: 0, y: 0, z: 1 },
      alignment: straight
    })
    const r24k = pointIlluminance({
      lamp: baseLamp(),
      item: item24k,
      point: { x: 4, y: 0, z: 0 },
      normal: { x: 0, y: 0, z: 1 },
      alignment: straight
    })
    expect(r24k.e).toBeCloseTo(r1k.e * 24, 4)
  })

  it('灯具背向点（γ>90°）照度为 0', () => {
    const r = pointIlluminance({
      lamp: baseLamp({ height: 6, tiltDeg: 0 }),
      item,
      point: { x: 0, y: 0, z: 9 }, // 位于灯具上方
      normal: { x: 0, y: 0, z: 1 },
      alignment: straight
    })
    expect(r.e).toBe(0)
  })

  it('倾斜灯具：tilt=30° 后几何手算复核', () => {
    // 灯高 6m 竖直向下，tilt 30°（绕 +Y，Rodrigues）后：
    // 光轴 = (-sin30, 0, -cos30)，目标点取光轴朝向的 (-10,0,0)
    const d = Math.hypot(10, 6)
    const r = pointIlluminance({
      lamp: baseLamp({ tiltDeg: 30 }),
      item,
      point: { x: -10, y: 0, z: 0 },
      normal: { x: 0, y: 0, z: 1 },
      alignment: straight
    })
    const rvec = { x: -10 / d, y: 0, z: -6 / d }
    const axis = { x: -0.5, y: 0, z: -Math.cos(Math.PI / 6) }
    const cosG = rvec.x * axis.x + rvec.z * axis.z
    const gamma = (Math.acos(Math.min(1, cosG)) * 180) / Math.PI
    const I = (1000 / Math.PI) * cosG
    const cosTheta = 6 / d
    const expected = (I * cosTheta) / (d * d)
    expect(r.gammaDeg).toBeCloseTo(gamma, 5)
    expect(Math.abs(r.e - expected) / expected).toBeLessThan(0.01)
  })
})

describe('配光表插值', () => {
  const item = lambertLamp()
  it('表点上取值与表值一致', () => {
    const v = interpolatePhotometry(item.photometric, 123, 30)
    const expected = (1000 / Math.PI) * Math.cos((30 * Math.PI) / 180)
    expect(v).toBeCloseTo(expected, 6)
  })
  it('C 角 350° 与 -10° 周期一致', () => {
    const a = interpolatePhotometry(item.photometric, 350, 20)
    const b = interpolatePhotometry(item.photometric, -10, 20)
    expect(a).toBeCloseTo(b, 8)
  })
  it('超出截止 γ 返回 0', () => {
    expect(interpolatePhotometry(item.photometric, 0, 91)).toBe(0)
  })
})

describe('内置灯具配光归一化（总光通量 ≈ 额定 1000lm 基准）', () => {
  it('每个内置灯配光积分通量在 1000lm ±2% 内', () => {
    for (const lamp of BUILTIN_LUMINAIRES) {
      const ph = lamp.photometric
      const g = ph.gammaAngles
      let flux = 0
      for (let i = 0; i < g.length - 1; i++) {
        const g0 = (g[i] * Math.PI) / 180
        const g1 = (g[i + 1] * Math.PI) / 180
        const I0 = ph.cdPerKlmLUT[0][i]
        const I1 = ph.cdPerKlmLUT[0][i + 1]
        // 梯形积分 2π∫I sinγ dγ
        flux += Math.PI * (I0 * Math.sin(g0) + I1 * Math.sin(g1)) * (g1 - g0)
      }
      expect(Math.abs(flux - 1000) / 1000, `灯 ${lamp.name} 通量=${flux}`).toBeLessThan(0.02)
    }
  })
})

describe('多灯叠加 = 单灯之和（线性叠加原理）', () => {
  it('两灯在 (5,0,0) 的总照度与手算叠加一致', () => {
    const item = lambertLamp()
    const point = { x: 5, y: 0, z: 0 }
    const normal = { x: 0, y: 0, z: 1 }
    const e1 = pointIlluminance({
      lamp: baseLamp({ s: 3, lateral: 0 }),
      item, point, normal, alignment: straight
    }).e
    const e2 = pointIlluminance({
      lamp: baseLamp({ s: -3, lateral: 0 }),
      item, point, normal, alignment: straight
    }).e
    // 手算：灯1 d=√40，灯2 d=10；朗伯 I=I0·cosγ，E=I0·cos²γ/d²
    const I0 = 1000 / Math.PI
    const d1 = Math.hypot(2, 6)
    const d2 = 10
    const exp1 = (I0 * (6 / d1) ** 2) / (d1 * d1)
    const exp2 = (I0 * 0.6 ** 2) / (d2 * d2)
    expect(Math.abs(e1 - exp1) / exp1).toBeLessThan(0.01)
    expect(Math.abs(e2 - exp2) / exp2).toBeLessThan(0.01)
    // 对称性：左右偏置两灯到 (5,0,0) 距离相同 → 贡献相同
    const a = pointIlluminance({
      lamp: baseLamp({ s: 0, lateral: -2 }),
      item, point, normal, alignment: straight
    }).e
    const b = pointIlluminance({
      lamp: baseLamp({ s: 0, lateral: 2 }),
      item, point, normal, alignment: straight
    }).e
    expect(a).toBeCloseTo(b, 8)
  })
})
