import type { TunnelAlignment, TunnelCrossSection, Vec3 } from '../types'

/** 局部坐标系：p=原点，t=切线(桩号方向)，n=右法向，u=竖直 */
export interface Frame {
  p: Vec3
  t: Vec3
  n: Vec3
  u: Vec3
}

export const v3 = {
  add: (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }),
  sub: (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }),
  scale: (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k }),
  dot: (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z,
  cross: (a: Vec3, b: Vec3): Vec3 => ({
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  }),
  len: (a: Vec3): number => Math.hypot(a.x, a.y, a.z),
  norm: (a: Vec3): Vec3 => {
    const L = Math.hypot(a.x, a.y, a.z) || 1
    return { x: a.x / L, y: a.y / L, z: a.z / L }
  },
  zero: (): Vec3 => ({ x: 0, y: 0, z: 0 })
}

/**
 * 桩号 s 处的局部坐标系
 * 平曲线：水平面内圆弧，R 为半径；纵坡：切线沿桩号方向抬升
 * 竖直分量由纵坡主导（平曲线引起的超高忽略）
 */
export function frameAt(al: TunnelAlignment, s: number): Frame {
  const R = al.curveRadius
  const g = al.gradePct / 100
  const horizLen = 1 / Math.sqrt(1 + g * g) // 切线水平分量
  const vertComp = g * horizLen

  let t: Vec3
  let n: Vec3
  let p: Vec3

  if (R > 0) {
    const dir = al.curveDirection
    const phi = (s / R) * dir // 转角
    const cp = Math.cos(phi)
    const sp = Math.sin(phi)
    // 初始切线 +X；右转 R 圆心在 +Y
    t = { x: cp * horizLen, y: sp * dir * horizLen, z: vertComp }
    // 水平面内右法向（与 t 的水平分量垂直，指向右侧）
    n = { x: -sp, y: cp * dir, z: 0 }
    p = {
      x: dir * R * sp,
      y: dir * R * (1 - cp),
      z: g * s
    }
  } else {
    t = { x: horizLen, y: 0, z: vertComp }
    n = { x: 0, y: 1, z: 0 }
    p = { x: s * horizLen, y: 0, z: g * s }
  }
  // u 与 t、n 正交：u = t × n
  const u = v3.norm(v3.cross(t, n))
  return { p, t, n, u }
}

/** 桩号 s、横向偏移 lateral、竖直偏移 vertical（相对路面）处的世界坐标 */
export function worldAt(al: TunnelAlignment, s: number, lateral: number, vertical: number): Vec3 {
  const f = frameAt(al, s)
  return v3.add(
    f.p,
    v3.add(v3.scale(f.n, lateral), v3.scale(f.u, vertical))
  )
}

/** 世界坐标转回局部 (s, lateral, vertical)，用于调试/拾取 */
export function localFromWorld(al: TunnelAlignment, w: Vec3): { s: number; lateral: number; vertical: number } {
  const R = al.curveRadius
  const g = al.gradePct / 100
  if (R > 0) {
    const dir = al.curveDirection
    const cx = 0
    const cy = dir * R
    const dx = w.x - cx
    const dy = w.y - cy
    let phi = Math.atan2(dy, dx) - Math.PI / 2
    if (dir < 0) phi = -phi
    if (phi < 0) phi += 2 * Math.PI
    const s = phi * R
    const f = frameAt(al, s)
    const d = v3.sub(w, f.p)
    return { s, lateral: v3.dot(d, f.n), vertical: v3.dot(d, f.u) }
  }
  const horizLen = 1 / Math.sqrt(1 + g * g)
  const s = (w.x / horizLen)
  const f = frameAt(al, s)
  const d = v3.sub(w, f.p)
  return { s, lateral: v3.dot(d, f.n), vertical: v3.dot(d, f.u) }
}

/** 路面边缘横向坐标（左负右正） */
export function roadEdges(cs: TunnelCrossSection): { left: number; right: number } {
  return { left: -cs.roadWidth / 2, right: cs.roadWidth / 2 }
}

/**
 * 断面内壁在横向位置 lateral 处的可用高度（决定灯具可安装高度上限）
 * 三心拱：直墙段等宽，拱部按圆弧收缩
 */
export function profileHeightAt(cs: TunnelCrossSection, lateral: number): number {
  const half = cs.roadWidth / 2
  const x = Math.min(Math.abs(lateral), half)
  switch (cs.shape) {
    case 'rectangular':
      return cs.crownHeight
    case 'circular': {
      const rc = cs.archRadius2
      const xr = Math.min(x, rc)
      return Math.sqrt(Math.max(0, rc * rc - xr * xr))
    }
    case 'three-center-arch':
    default: {
      if (x <= half - (cs.crownHeight - cs.wallHeight) * 0 && x < half * 0.62) {
        // 直墙段（简化：路缘到侧圆起拱点按直墙处理）
      }
      // 侧圆：圆心位于 (half - R1, wallHeight)
      const r1 = cs.archRadius1
      const c1x = half - r1
      if (x <= c1x) return cs.crownHeight // 顶圆覆盖的中部，取全高
      const dy1 = r1 * r1 - (x - c1x) * (x - c1x)
      if (dy1 >= 0) return cs.wallHeight + Math.sqrt(dy1)
      // 兜底
      return cs.wallHeight
    }
  }
}

/**
 * 生成断面轮廓点（左墙脚 → 拱顶 → 右墙脚），用于 three.js 拉伸建模
 * 返回局部坐标点 [lateral, vertical][]
 */
export function crossSectionOutline(cs: TunnelCrossSection, segments = 24): Array<[number, number]> {
  const half = cs.roadWidth / 2
  const pts: Array<[number, number]> = []
  pts.push([-half, 0])

  if (cs.shape === 'rectangular') {
    pts.push([-half, cs.crownHeight], [half, cs.crownHeight], [half, 0])
    return pts
  }
  if (cs.shape === 'circular') {
    const rc = cs.archRadius2
    for (let i = 0; i <= segments; i++) {
      const ang = Math.PI - (i / segments) * Math.PI
      pts.push([rc * Math.cos(ang), Math.max(0, rc * Math.sin(ang))])
    }
    pts.push([half, 0])
    return pts
  }

  // 三心拱
  const r1 = cs.archRadius1
  const r2 = cs.archRadius2
  const c1L = { x: -(half - r1), y: cs.wallHeight }
  const c1R = { x: half - r1, y: cs.wallHeight }
  // 顶圆与侧圆内切：圆心距 = R1 - R2
  const d = r1 - r2
  const cTopY = cs.wallHeight + Math.sqrt(Math.max(0, d * d - c1R.x * c1R.x))
  // 顶圆经过拱顶 (0, crownHeight)
  const cTop = { x: 0, y: cs.crownHeight - r2 }
  void cTopY

  // 求侧圆与顶圆切点（右侧）：两圆心连线上
  const vx = cTop.x - c1R.x
  const vy = cTop.y - c1R.y
  const vl = Math.hypot(vx, vy) || 1
  const tangR = {
    x: c1R.x + (vx / vl) * r1,
    y: c1R.y + (vy / vl) * r1
  }
  const aSideStartR = Math.atan2(0 - c1R.y, half - c1R.x) // 墙脚处角度
  const aSideEndR = Math.atan2(tangR.y - c1R.y, tangR.x - c1R.x)

  // 左墙
  pts.push([-half, cs.wallHeight])
  // 左侧圆（逆时针）
  const c1LAngStart = Math.atan2(0, 0) // 墙脚点相对左圆心方向
  void c1LAngStart
  const tangL = { x: -tangR.x, y: tangR.y }
  const aSideStartL = Math.atan2(0 - c1L.y, -half - c1L.x)
  const aSideEndL = Math.atan2(tangL.y - c1L.y, tangL.x - c1L.x)
  for (let i = 1; i <= segments / 2; i++) {
    const a = aSideStartL + (aSideEndL - aSideStartL) * (i / (segments / 2))
    pts.push([c1L.x + r1 * Math.cos(a), c1L.y + r1 * Math.sin(a)])
  }
  // 顶圆
  const aTopL = Math.atan2(tangL.y - cTop.y, tangL.x - cTop.x)
  const aTopR = Math.atan2(tangR.y - cTop.y, tangR.x - cTop.x)
  for (let i = 1; i < segments / 2; i++) {
    const a = aTopL + (aTopR - aTopL) * (i / (segments / 2))
    pts.push([cTop.x + r2 * Math.cos(a), cTop.y + r2 * Math.sin(a)])
  }
  pts.push([tangR.x, tangR.y])
  // 右侧圆
  for (let i = 1; i <= segments / 2; i++) {
    const a = aSideEndR + (aSideStartR - aSideEndR) * (i / (segments / 2))
    pts.push([c1R.x + r1 * Math.cos(a), c1R.y + r1 * Math.sin(a)])
  }
  pts.push([half, 0])
  return pts
}
