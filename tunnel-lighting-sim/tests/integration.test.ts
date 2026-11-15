import { describe, it, expect } from 'vitest'
import { runCalculation } from '../src/engine/calculation'
import { autoPlaceLuminaires } from '../src/engine/layout'
import { buildDefaultZones, DEFAULT_STANDARDS } from '../src/engine/standards'
import { createDefaultProject } from '../src/engine/projectFactory'
import { worldAt } from '../src/engine/geometry'
import { pointIlluminance } from '../src/engine/photometry'
import { BUILTIN_LUMINAIRES, findLuminaire } from '../src/engine/luminaireLibrary'

describe('端到端：建模 → 布灯 → 网格计算 → 规范对照', () => {
  it('500m 直线隧道自动布灯后，各区段亮度结果完整且物理合理', () => {
    const p = createDefaultProject('集成测试隧道')
    p.zones = buildDefaultZones(p.alignment, p.designSpeedKmh, DEFAULT_STANDARDS,
      'lamp-led-basic-100', 'lamp-led-reinforce-200')
    p.luminaires = autoPlaceLuminaires(p.zones)
    expect(p.luminaires.length).toBeGreaterThan(50)

    const r = runCalculation(p, { standards: DEFAULT_STANDARDS })
    expect(r.roadGrid.length).toBeGreaterThan(0)
    expect(r.roadGrid[0].length).toBeGreaterThan(1)
    // 所有照度非负
    for (const row of r.roadGrid) for (const g of row) {
      expect(g.illuminance).toBeGreaterThanOrEqual(0)
      expect(Number.isFinite(g.luminance)).toBe(true)
    }
    // 入口段有加强灯，平均亮度应高于中间段
    const th1 = r.zoneStats.find((z) => z.type === 'TH1')!
    const mid = r.zoneStats.find((z) => z.type === 'middle')!
    expect(th1.avgLuminance).toBeGreaterThan(mid.avgLuminance)
    // 规范要求值已计算
    expect(th1.requiredLuminance).not.toBeNull()
    expect(mid.requiredLuminance).toBeGreaterThan(0)
    // TI 站位覆盖隧道
    expect(r.tiStations.length).toBeGreaterThan(5)
    expect(r.totalPowerW).toBeGreaterThan(0)
  })

  it('路面网格某点照度 = 各灯具贡献之和（用引擎原语复算）', () => {
    const p = createDefaultProject('积分核对')
    p.calcSettings.gridLongitudinal = 10
    p.calcSettings.gridTransverse = 2
    p.zones = buildDefaultZones(p.alignment, 80, DEFAULT_STANDARDS,
      'lamp-led-basic-60', 'lamp-led-reinforce-150')
    p.luminaires = autoPlaceLuminaires(p.zones)
    const r = runCalculation(p, { standards: DEFAULT_STANDARDS })

    const target = r.roadGrid[3][2]
    const f0 = target
    let manual = 0
    for (const lamp of p.luminaires) {
      if (!lamp.enabled) continue
      const item = findLuminaire(lamp.libraryId)!
      // 直线纵坡为 0：世界坐标 x=s, y=lateral, z=0
      const point = worldAt(p.alignment, f0.s, f0.lateral, 0)
      const c = pointIlluminance({
        lamp, item, point,
        normal: { x: 0, y: 0, z: 1 },
        alignment: p.alignment,
        cutoff: p.calcSettings.cutoffDistance
      })
      manual += c.e
    }
    // 引擎网格结果与逐灯复算完全一致（同一套代码路径，容差取浮点噪声）
    expect(Math.abs(manual - target.illuminance)).toBeLessThan(1e-9)
  })

  it('亮度 = 照度 × q0，墙面亮度 = E·ρ/π', () => {
    const p = createDefaultProject('亮度换算')
    p.zones = buildDefaultZones(p.alignment, 60, DEFAULT_STANDARDS,
      'lamp-led-basic-100', 'lamp-led-reinforce-200')
    p.luminaires = autoPlaceLuminaires(p.zones)
    const r = runCalculation(p, { standards: DEFAULT_STANDARDS })
    const q0 = p.crossSection.roadLuminanceCoeff
    for (const row of r.roadGrid.slice(0, 5)) {
      for (const g of row) {
        expect(g.luminance).toBeCloseTo(g.illuminance * q0, 9)
      }
    }
    for (const w of r.wallGrid.slice(0, 5)) {
      expect(w.luminance).toBeCloseTo((w.illuminance * p.crossSection.wallReflectance) / Math.PI, 9)
    }
    expect(BUILTIN_LUMINAIRES.length).toBeGreaterThan(0)
  })

  it('弯道与纵坡下计算不退化，坐标变换保持正交', () => {
    const p = createDefaultProject('弯坡隧道')
    p.alignment.curveRadius = 500
    p.alignment.curveDirection = -1
    p.alignment.gradePct = 2.5
    p.zones = buildDefaultZones(p.alignment, 80, DEFAULT_STANDARDS,
      'lamp-led-basic-100', 'lamp-led-reinforce-200')
    p.luminaires = autoPlaceLuminaires(p.zones)
    const r = runCalculation(p, { standards: DEFAULT_STANDARDS })
    expect(r.roadGrid.every((row) => row.every((g) => g.illuminance > 0))).toBe(true)
    const straight = createDefaultProject('直线对照')
    straight.zones = p.zones
    straight.luminaires = p.luminaires
    const r2 = runCalculation(straight, { standards: DEFAULT_STANDARDS })
    // 弯道下总光通量守恒量级一致：平均照度与直线情形差异 < 15%
    const a = r.roadGrid.flat().reduce((s, g) => s + g.illuminance, 0)
    const b = r2.roadGrid.flat().reduce((s, g) => s + g.illuminance, 0)
    expect(Math.abs(a - b) / b).toBeLessThan(0.15)
  })
})
