// 领域模型类型定义

export interface Vec3 {
  x: number
  y: number
  z: number
}

/**
 * 配光曲线（C-γ 坐标测光数据）
 * C: 水平方位角(度)，γ: 垂直角(度)，0 = 光轴正方向（默认竖直向下）
 * 数值单位：cd / 1000 lm（IES 标准 convention）
 */
export interface PhotometricData {
  id: string
  name: string
  /** C 平面角度(度)，升序，首个 0，末个通常 360（可循环） */
  cAngles: number[]
  /** 垂直角 γ(度)，升序，0 = 光轴 */
  gammaAngles: number[]
  /** 光强表 cd/1000lm，行=cAngles，列=gammaAngles */
  cdPerKlmLUT: number[][]
  source: 'builtin' | 'ies-import'
}

/** 灯具库条目（型号） */
export interface LuminaireLibraryItem {
  id: string
  name: string
  manufacturer: string
  /** 额定光通量 lm */
  ratedFlux: number
  /** 功率 W */
  powerW: number
  colorTempK: number
  /** 维护系数 MF（0..1） */
  maintenanceFactor: number
  photometric: PhotometricData
}

/** 已布置的灯具实例 */
export interface PlacedLuminaire {
  id: string
  libraryId: string
  /** 沿隧道中线桩号 m */
  s: number
  /** 横向偏移 m（相对中线，右正） */
  lateral: number
  /** 安装高度 m（相对路面） */
  height: number
  /** 偏航角(度)，绕竖直轴 */
  yawDeg: number
  /** 俯仰角(度)，绕横向轴，正值=光轴朝大桩号方向倾斜 */
  tiltDeg: number
  /** 滚转角(度)，绕光轴自旋 */
  rollDeg: number
  /** 调光系数 0..1 */
  dimFactor: number
  enabled: boolean
}

export type CrossSectionShape = 'three-center-arch' | 'rectangular' | 'circular'

export interface TunnelCrossSection {
  shape: CrossSectionShape
  /** 路面总宽 m */
  roadWidth: number
  laneCount: number
  /** 单车道宽 m */
  laneWidth: number
  /** 单侧检修道宽 m */
  sidewalkWidth: number
  /** 直墙高度 m（矩形断面即总净高） */
  wallHeight: number
  /** 三心拱侧圆弧半径 m */
  archRadius1: number
  /** 三心拱顶圆弧半径 m */
  archRadius2: number
  /** 拱顶距路面高度 m */
  crownHeight: number
  /** 墙面反射比 ρ */
  wallReflectance: number
  /** 路面平均亮度系数 q0（cd/m² 每 lx） */
  roadLuminanceCoeff: number
}

export interface TunnelAlignment {
  /** 隧道长度 m */
  length: number
  /** 纵坡 % */
  gradePct: number
  /** 平曲线半径 m，0 = 直线 */
  curveRadius: number
  /** 弯道方向：1=向右，-1=向左 */
  curveDirection: 1 | -1
}

export type ZoneType =
  | 'access'
  | 'TH1'
  | 'TH2'
  | 'TR1'
  | 'TR2'
  | 'TR3'
  | 'middle'
  | 'exit1'
  | 'exit2'

export interface LightingZone {
  id: string
  type: ZoneType
  startS: number
  endS: number
  /** 该区段批量布灯使用的灯具库 ID */
  libraryId: string
  /** 纵向间距 m */
  spacing: number
  /** 横向偏移 m（单排时）；双排时为左右偏移量 */
  lateral: number
  /** 安装高度 m */
  height: number
  yawDeg: number
  tiltDeg: number
  /** 调光系数（加强灯常在过渡段调暗/关闭） */
  dimFactor: number
  /** 是否双排布置 */
  dualRow: boolean
}

export interface L20CalcInput {
  skyL: number
  roadL: number
  envL: number
  kSky: number
  kRoad: number
  kEnv: number
}

export interface CalcSettings {
  /** 路面纵向网格步长 m */
  gridLongitudinal: number
  /** 路面横向网格步长 m */
  gridTransverse: number
  /** 墙面计算点最大高度 m */
  wallGridHeightM: number
  /** TI 观察者眼高 m */
  observerEyeHeight: number
  /** TI 观察者站位间距 m */
  observerStationSpacing: number
  /** 眩光 TI 限值 % */
  tiLimitPct: number
  /** 驾驶预览明适应时间常数 s */
  adaptationTimeSec: number
  /** 单灯计算截断距离 m（超出贡献按 0） */
  cutoffDistance: number
  /** 交通量档位（决定中间段亮度标准值） */
  trafficLevel: 'high' | 'low'
}

export interface TunnelProject {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  alignment: TunnelAlignment
  crossSection: TunnelCrossSection
  /** 设计车速 km/h */
  designSpeedKmh: number
  /** 洞外亮度 L20(S) cd/m² */
  l20: number
  l20Calc?: L20CalcInput
  zones: LightingZone[]
  luminaires: PlacedLuminaire[]
  calcSettings: CalcSettings
  notes?: string
}

/** 路面/墙面网格单点计算结果 */
export interface GridPoint {
  s: number
  lateral: number
  /** 垂直面照度 lx */
  illuminance: number
  /** 亮度 cd/m² */
  luminance: number
}

export interface WallGridPoint extends GridPoint {
  /** 距路面高度 m */
  height: number
  side: 'left' | 'right'
}

export interface ZoneStat {
  zoneId: string
  type: ZoneType
  startS: number
  endS: number
  avgIlluminance: number
  avgLuminance: number
  minLuminance: number
  maxLuminance: number
  /** 总均匀度 U0 = Lmin/Lavg */
  uniformityU0: number
  /** 纵向均匀度 U1 = Lmin/Lmax */
  uniformityU1: number
  /** 规范要求亮度 cd/m² */
  requiredLuminance: number | null
  /** 是否满足规范 */
  pass: boolean | null
  /** 该区最大眩光 TI % */
  maxTiPct: number
  tiPass: boolean | null
  lampCount: number
}

export interface TiStation {
  s: number
  tiPct: number
  veilLv: number
  adaptationL: number
  pass: boolean
  /** 参与计算的灯具数 */
  lampCount: number
}

export interface CalcResult {
  version: number
  timestamp: number
  /** 路面网格 [纵向站][横向点] */
  roadGrid: GridPoint[][]
  wallGrid: WallGridPoint[]
  zoneStats: ZoneStat[]
  tiStations: TiStation[]
  /** 全洞路面平均亮度 */
  overallAvgL: number
  overallU0: number
  lampCount: number
  totalPowerW: number
  warnings: string[]
}
