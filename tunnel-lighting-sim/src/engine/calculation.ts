import type {
  CalcResult,
  GridPoint,
  LuminaireLibraryItem,
  PlacedLuminaire,
  TiStation,
  TunnelProject,
  WallGridPoint,
  ZoneStat
} from '../types'
import { worldAt, frameAt, v3 } from './geometry'
import { lampBasisWithAlignment, pointIlluminance } from './photometry'
import { findLuminaire } from './luminaireLibrary'
import { requiredLuminance } from './standards'
import type { StandardTables } from './standards'

/** 路面横向网格点（含车道划分） */
function roadLateralGrid(p: TunnelProject): number[] {
  const step = p.calcSettings.gridTransverse
  const half = p.crossSection.roadWidth / 2
  const pts: number[] = []
  for (let x = -half + step / 2; x < half - 1e-9; x += step) pts.push(x)
  return pts
}

function stationGrid(p: TunnelProject): number[] {
  const step = p.calcSettings.gridLongitudinal
  const pts: number[] = []
  for (let s = step / 2; s < p.alignment.length - 1e-9; s += step) pts.push(s)
  return pts
}

interface ResolvedLamp {
  lamp: PlacedLuminaire
  item: LuminaireLibraryItem
}

function resolveLamps(p: TunnelProject, extra: LuminaireLibraryItem[]): ResolvedLamp[] {
  return p.luminaires
    .filter((l) => l.enabled)
    .map((lamp) => {
      const item = findLuminaire(lamp.libraryId, extra)
      return item ? { lamp, item } : null
    })
    .filter((x): x is ResolvedLamp => x !== null)
}

/** 路面网格照度/亮度主计算 */
export function calcRoadGrid(p: TunnelProject, extra: LuminaireLibraryItem[] = []): GridPoint[][] {
  const { alignment, crossSection, calcSettings } = p
  const lamps = resolveLamps(p, extra)
  const sPts = stationGrid(p)
  const xPts = roadLateralGrid(p)
  const q0 = crossSection.roadLuminanceCoeff

  const grid: GridPoint[][] = []
  for (const s of sPts) {
    const row: GridPoint[] = []
    for (const lateral of xPts) {
      const point = worldAt(alignment, s, lateral, 0)
      const f = frameAt(alignment, s)
      let e = 0
      for (const { lamp, item } of lamps) {
        const c = pointIlluminance({
          lamp,
          item,
          point,
          normal: f.u,
          alignment,
          cutoff: calcSettings.cutoffDistance
        })
        e += c.e
      }
      row.push({ s, lateral, illuminance: e, luminance: e * q0 })
    }
    grid.push(row)
  }
  return grid
}

/** 墙面 2m 高度带亮度（左右墙各取一列点） */
export function calcWallGrid(p: TunnelProject, extra: LuminaireLibraryItem[] = []): WallGridPoint[] {
  const { alignment, crossSection, calcSettings } = p
  const lamps = resolveLamps(p, extra)
  const half = crossSection.roadWidth / 2
  const h = Math.min(calcSettings.wallGridHeightM, crossSection.wallHeight)
  const rho = crossSection.wallReflectance
  const pi = Math.PI
  const out: WallGridPoint[] = []
  for (const s of stationGrid(p)) {
    const f = frameAt(alignment, s)
    for (const side of ['left', 'right'] as const) {
      const sign = side === 'left' ? -1 : 1
      const lateral = sign * half
      const point = worldAt(alignment, s, lateral, h)
      // 墙面内法线：左墙(lateral=-half)朝 +n，右墙朝 -n，即 f.n × (-sign)
      const normal = v3.scale(f.n, -sign)
      let e = 0
      for (const { lamp, item } of lamps) {
        e += pointIlluminance({ lamp, item, point, normal, alignment, cutoff: calcSettings.cutoffDistance }).e
      }
      out.push({
        s,
        lateral,
        height: h,
        side,
        illuminance: e,
        luminance: (e * rho) / pi
      })
    }
  }
  return out
}

function statsOf(grid: GridPoint[][]): { avgL: number; minL: number; maxL: number; avgE: number; u0: number; u1: number } {
  let sumL = 0
  let sumE = 0
  let minL = Infinity
  let maxL = -Infinity
  let n = 0
  for (const row of grid)
    for (const pt of row) {
      sumL += pt.luminance
      sumE += pt.illuminance
      minL = Math.min(minL, pt.luminance)
      maxL = Math.max(maxL, pt.luminance)
      n++
    }
  if (n === 0) return { avgL: 0, minL: 0, maxL: 0, avgE: 0, u0: 0, u1: 0 }
  const avgL = sumL / n
  const avgE = sumE / n
  return { avgL, minL, maxL, avgE, u0: minL / (avgL || 1), u1: minL / (maxL || 1) }
}

/**
 * 车道范围内统计（JTG 细则 U0/U1 只考核车道，不含检修道/路缘）
 * 车道总宽 = laneCount × laneWidth，居中布置
 */
function laneStatsOf(p: TunnelProject, grid: GridPoint[][]) {
  const laneHalf = (p.crossSection.laneCount * p.crossSection.laneWidth) / 2
  const lanePts: GridPoint[] = []
  for (const row of grid)
    for (const pt of row) if (Math.abs(pt.lateral) <= laneHalf + 1e-6) lanePts.push(pt)
  return statsOf([lanePts])
}

/** 全洞 U0：取各区段 U0 的最小值（U0 按区段考核，不跨亮度量级合并） */
function r_ZoneMinU0(zoneStats: ZoneStat[]): number {
  const valid = zoneStats.filter((z) => z.uniformityU0 > 0)
  return valid.length ? Math.min(...valid.map((z) => z.uniformityU0)) : 0
}

function zoneGridSlice(grid: GridPoint[][], startS: number, endS: number): GridPoint[][] {
  return grid.filter((row) => row[0] && row[0].s >= startS && row[0].s < endS)
}

/**
 * 眩光阈值增量 TI（CIE 88 / JTG 细则方法）
 *   Lv = 10 · Σ(Eθᵢ / θᵢ²)   [cd/m²，θ 以度计，E 为眼点垂直于视线平面的照度 lx]
 *   TI(%) = 65 · Lv / (L̄av)^0.8
 * 观察者沿车道中线行驶，眼高 1.5m，视线沿桩号方向
 */
export function calcTiStations(
  p: TunnelProject,
  roadGrid: GridPoint[][],
  extra: LuminaireLibraryItem[] = []
): TiStation[] {
  const { alignment, calcSettings } = p
  const lamps = resolveLamps(p, extra)
  const stations: TiStation[] = []
  const step = calcSettings.observerStationSpacing

  for (let s = step; s < alignment.length - 10; s += step) {
    const f = frameAt(alignment, s)
    const eye = v3.add(f.p, v3.scale(f.u, calcSettings.observerEyeHeight))
    const view = f.t // 视线沿桩号方向
    let lv = 0
    let used = 0
    for (const { lamp, item } of lamps) {
      const b = lampBasisWithAlignment(lamp, alignment)
      const dvec = v3.sub(b.origin, eye)
      const d = v3.len(dvec)
      if (d < 1.5 || d > calcSettings.cutoffDistance) continue
      const r = v3.scale(dvec, 1 / d)
      const cosA = v3.dot(r, view)
      if (cosA <= 0) continue // 只计前方灯具
      const thetaRad = Math.acos(Math.min(1, cosA))
      const thetaDeg = thetaRad * 180 / Math.PI
      if (thetaDeg < 1.5 || thetaDeg > 60) continue
      // 眼点处垂直于视线平面的照度：E · cos(光线与视线夹角)= E·cos(90-θ)= E·sinθ
      // CIE 140：Eθ 为垂直于视线平面上的照度 = I·cosθ/d²
      // 法线取视线 view；引擎内部 -r·normal 恰得 cosθ（r 为眼→灯，与灯→眼光线反向）
      const c = pointIlluminance({
        lamp,
        item,
        point: eye,
        normal: view,
        alignment,
        cutoff: calcSettings.cutoffDistance
      })
      const ePlane = c.e
      void ePlane
      // 垂直视线平面的照度 = I·cos(90°-θ)/d² = I·sinθ/d²，已由 normal=r 给出
      lv += (10 * c.e) / (thetaDeg * thetaDeg)
      used++
    }
    // 适应亮度取本站附近路面平均亮度
    const nearby = zoneGridSlice(roadGrid, Math.max(0, s - 10), Math.min(alignment.length, s + 10))
    const st = statsOf(nearby)
    const ladapt = Math.max(st.avgL, 0.5)
    const tiPct = (65 * lv) / Math.pow(ladapt, 0.8)
    stations.push({
      s,
      tiPct,
      veilLv: lv,
      adaptationL: ladapt,
      pass: tiPct <= calcSettings.tiLimitPct,
      lampCount: used
    })
  }
  return stations
}

export interface RunOptions {
  extraLuminaires?: LuminaireLibraryItem[]
  standards: StandardTables
}

/** 计算总入口 */
export function runCalculation(p: TunnelProject, opts: RunOptions): CalcResult {
  const warnings: string[] = []
  const extra = opts.extraLuminaires ?? []
  if (p.luminaires.length === 0) warnings.push('当前没有任何已布置灯具，请先在「灯具布置」页布灯。')
  const missing = new Set(
    p.luminaires.filter((l) => !findLuminaire(l.libraryId, extra)).map((l) => l.libraryId)
  )
  missing.forEach((id) => warnings.push(`灯具库中找不到型号 ${id}，相关灯具已跳过。`))

  const roadGrid = calcRoadGrid(p, extra)
  const wallGrid = calcWallGrid(p, extra)
  const tiStations = calcTiStations(p, roadGrid, extra)

  const zoneStats: ZoneStat[] = p.zones.map((z) => {
    const slice = zoneGridSlice(roadGrid, z.startS, z.endS)
    const st = statsOf(slice)
    const lane = laneStatsOf(p, slice)
    const req = requiredLuminance(
      z.type,
      p.designSpeedKmh,
      p.l20,
      p.calcSettings.trafficLevel,
      opts.standards
    )
    const tiInZone = tiStations.filter((t) => t.s >= z.startS && t.s < z.endS)
    const maxTi = tiInZone.reduce((m, t) => Math.max(m, t.tiPct), 0)
    const lampCount = p.luminaires.filter(
      (l) => l.enabled && l.s >= z.startS && l.s < z.endS
    ).length
    return {
      zoneId: z.id,
      type: z.type,
      startS: z.startS,
      endS: z.endS,
      avgIlluminance: st.avgE,
      avgLuminance: lane.avgL,
      minLuminance: lane.minL,
      maxLuminance: lane.maxL,
      uniformityU0: lane.u0,
      uniformityU1: lane.u1,
      requiredLuminance: req,
      pass: req === null ? null : st.avgL >= req,
      maxTiPct: maxTi,
      tiPass: tiInZone.length === 0 ? null : maxTi <= p.calcSettings.tiLimitPct,
      lampCount
    }
  })

  const overall = laneStatsOf(p, roadGrid)
  // 全洞 U0 取各区段（同照明水平内）U0 的最小值——跨亮度量级的区段不可合并统计
  const overallU0 = r_ZoneMinU0(zoneStats)
  const totalPowerW = p.luminaires
    .filter((l) => l.enabled)
    .reduce((sum, l) => {
      const item = findLuminaire(l.libraryId, extra)
      return sum + (item ? item.powerW * l.dimFactor : 0)
    }, 0)

  return {
    version: 1,
    timestamp: Date.now(),
    roadGrid,
    wallGrid,
    zoneStats,
    tiStations,
    overallAvgL: overall.avgL,
    overallU0,
    lampCount: p.luminaires.filter((l) => l.enabled).length,
    totalPowerW,
    warnings
  }
}
