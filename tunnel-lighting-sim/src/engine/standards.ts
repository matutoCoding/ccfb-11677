import type { LightingZone, TunnelAlignment, ZoneType } from '../types'

/**
 * 规范参数（JTG/T D70/2-01-2014《公路隧道照明设计细则》默认值）
 * 所有数值均可在「设置」页修改，修改后保存在浏览器本地。
 */
export interface StandardTables {
  /** 入口段亮度折减系数 k（按设计车速 km/h） */
  kBySpeed: Record<number, number>
  /** TH2 相对 TH1 的比例 */
  th2Ratio: number
  /** 过渡段相对入口段 TH1 的比例 */
  trRatios: { TR1: number; TR2: number; TR3: number }
  /** 中间段维持平均亮度 Lin cd/m²（按车速与交通量） */
  middleLin: Record<number, { high: number; low: number }>
  /** 出口段相对中间段的倍数 */
  exitRatios: { exit1: number; exit2: number }
  /** 各区段默认长度 m（按设计车速 km/h） */
  zoneLengths: Record<number, Record<string, number>>
  /** 眩光 TI 限值 % */
  tiLimitPct: number
  /** 总均匀度 U0 限值 */
  u0Limit: number
}

export const DEFAULT_STANDARDS: StandardTables = {
  kBySpeed: { 120: 0.035, 100: 0.03, 80: 0.025, 60: 0.022, 40: 0.02 },
  th2Ratio: 0.5,
  trRatios: { TR1: 0.15, TR2: 0.05, TR3: 0.02 },
  exitRatios: { exit1: 3, exit2: 1.5 },
  middleLin: {
    120: { high: 9, low: 4 },
    100: { high: 6, low: 3 },
    80: { high: 3.5, low: 1.5 },
    60: { high: 2, low: 1 },
    40: { high: 1, low: 1 }
  },
  // 工程常用默认长度（细则条文以适应时间/停车视距推导，可在建模页逐段调整）
  zoneLengths: {
    120: { TH1: 70, TH2: 70, TR1: 90, TR2: 110, TR3: 130, exit1: 30, exit2: 30 },
    100: { TH1: 60, TH2: 60, TR1: 75, TR2: 90, TR3: 110, exit1: 30, exit2: 30 },
    80: { TH1: 50, TH2: 50, TR1: 60, TR2: 70, TR3: 90, exit1: 30, exit2: 30 },
    60: { TH1: 30, TH2: 30, TR1: 45, TR2: 55, TR3: 70, exit1: 25, exit2: 25 },
    40: { TH1: 20, TH2: 20, TR1: 30, TR2: 40, TR3: 50, exit1: 20, exit2: 20 }
  },
  tiLimitPct: 15,
  u0Limit: 0.4
}

export const ZONE_META: Record<ZoneType, { name: string; color: string; short: string }> = {
  access: { name: '接近段（洞外）', color: '#f5c542', short: '接近' },
  TH1: { name: '入口段 TH1（阈值段1）', color: '#ef6b5b', short: 'TH1' },
  TH2: { name: '入口段 TH2（阈值段2）', color: '#f0915e', short: 'TH2' },
  TR1: { name: '过渡段 TR1', color: '#e8b85a', short: 'TR1' },
  TR2: { name: '过渡段 TR2', color: '#c9c96a', short: 'TR2' },
  TR3: { name: '过渡段 TR3', color: '#9ec27a', short: 'TR3' },
  middle: { name: '中间段', color: '#6fbf9e', short: '中间' },
  exit1: { name: '出口段 EX1', color: '#7aa9d8', short: 'EX1' },
  exit2: { name: '出口段 EX2', color: '#9d8fd0', short: 'EX2' }
}

function nearestSpeed(speeds: number[], speed: number): number {
  return speeds.reduce((a, b) => (Math.abs(b - speed) < Math.abs(a - speed) ? b : a))
}

/** 计算某区段规范要求的维持平均路面亮度 cd/m² */
export function requiredLuminance(
  type: ZoneType,
  speedKmh: number,
  l20: number,
  traffic: 'high' | 'low',
  t: StandardTables
): number | null {
  const speeds = Object.keys(t.kBySpeed).map(Number)
  const sp = nearestSpeed(speeds, speedKmh)
  const lth1 = t.kBySpeed[sp] * l20
  switch (type) {
    case 'TH1':
      return lth1
    case 'TH2':
      return lth1 * t.th2Ratio
    case 'TR1':
      return lth1 * t.trRatios.TR1
    case 'TR2':
      return lth1 * t.trRatios.TR2
    case 'TR3':
      return lth1 * t.trRatios.TR3
    case 'middle':
      return t.middleLin[sp][traffic]
    case 'exit1':
      return t.middleLin[sp][traffic] * t.exitRatios.exit1
    case 'exit2':
      return t.middleLin[sp][traffic] * t.exitRatios.exit2
    default:
      return null
  }
}

/** L20(S) 简化计算：天空/路面/环境亮度按 20° 视场面积占比加权 */
export function calcL20(input: {
  skyL: number
  roadL: number
  envL: number
  kSky: number
  kRoad: number
  kEnv: number
}): number {
  const wSum = input.kSky + input.kRoad + input.kEnv
  if (wSum <= 0) return 0
  return (
    (input.skyL * input.kSky + input.roadL * input.kRoad + input.envL * input.kEnv) / wSum
  )
}

/**
 * 按规范默认长度自动生成照明区段（若总长不足则按比例压缩，中间段吸收剩余长度）
 */
export function buildDefaultZones(
  al: TunnelAlignment,
  speedKmh: number,
  t: StandardTables,
  basicLampId: string,
  reinforceLampId: string
): LightingZone[] {
  const speeds = Object.keys(t.zoneLengths).map(Number)
  const sp = nearestSpeed(speeds, speedKmh)
  const zl = t.zoneLengths[sp]
  const order: Array<{ type: ZoneType; len: number; lamp: string; spacing: number; dim: number }> = [
    { type: 'TH1', len: zl.TH1, lamp: reinforceLampId, spacing: 2, dim: 1 },
    { type: 'TH2', len: zl.TH2, lamp: reinforceLampId, spacing: 3, dim: 1 },
    { type: 'TR1', len: zl.TR1, lamp: reinforceLampId, spacing: 5, dim: 0.8 },
    { type: 'TR2', len: zl.TR2, lamp: basicLampId, spacing: 8, dim: 1 },
    { type: 'TR3', len: zl.TR3, lamp: basicLampId, spacing: 10, dim: 1 },
    { type: 'middle', len: 0, lamp: basicLampId, spacing: 12, dim: 1 },
    { type: 'exit1', len: zl.exit1, lamp: reinforceLampId, spacing: 6, dim: 0.9 },
    { type: 'exit2', len: zl.exit2, lamp: basicLampId, spacing: 10, dim: 1 }
  ]
  const fixedTotal = order.reduce((s, z) => s + z.len, 0)
  let scale = 1
  if (fixedTotal > al.length * 0.98) scale = (al.length * 0.98) / fixedTotal
  let cursor = 0
  const zones: LightingZone[] = []
  order.forEach((z, i) => {
    let len: number
    if (z.type === 'middle') {
      len = Math.max(0, al.length - cursor - order.slice(i + 1).reduce((s, x) => s + x.len * scale, 0))
    } else {
      len = z.len * scale
    }
    if (len <= 0.5) return
    zones.push({
      id: `zone-${z.type}-${i}`,
      type: z.type,
      startS: cursor,
      endS: cursor + len,
      libraryId: z.lamp,
      spacing: z.spacing,
      lateral: 0,
      height: 5.2,
      yawDeg: 0,
      tiltDeg: 0,
      dimFactor: z.dim,
      dualRow: z.type === 'TH1' || z.type === 'TH2'
    })
    cursor += len
  })
  return zones
}
