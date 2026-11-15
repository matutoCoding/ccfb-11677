import type { PhotometricData, PlacedLuminaire, LuminaireLibraryItem, Vec3 } from '../types'
import { frameAt, v3 } from './geometry'

const DEG = Math.PI / 180

/** 角度归一化到 [0, 360) */
export function norm360(deg: number): number {
  let d = deg % 360
  if (d < 0) d += 360
  return d
}

/**
 * C-γ 配光表双线性插值，返回 cd/1000lm
 * C 方向按 360° 周期处理；γ 超界返回 0（灯具背面/截止角外无配光数据）
 */
export function interpolatePhotometry(ph: PhotometricData, cDeg: number, gammaDeg: number): number {
  const gammas = ph.gammaAngles
  const cs = ph.cAngles
  const g = Math.max(0, gammaDeg)

  // γ 方向定位
  if (g > gammas[gammas.length - 1]) return 0
  let ig = 0
  while (ig < gammas.length - 2 && gammas[ig + 1] <= g) ig++
  const g0 = gammas[ig]
  const g1 = gammas[ig + 1]
  const tg = g1 > g0 ? (g - g0) / (g1 - g0) : 0

  // C 方向定位（周期）
  const c = norm360(cDeg)
  const cLast = cs[cs.length - 1]
  const cExt = [...cs]
  if (cLast < 360 - 1e-9) cExt.push(cLast + (360 - cLast)) // 末角度不足 360 时补一个周期点
  let ic = 0
  while (ic < cExt.length - 2 && cExt[ic + 1] <= c) ic++
  const c0 = cExt[ic]
  const c1 = cExt[ic + 1]
  const tc = c1 > c0 ? (c - c0) / (c1 - c0) : 0

  const row = (i: number): number[] => ph.cdPerKlmLUT[i % ph.cdPerKlmLUT.length]
  const v00 = row(ic)[ig]
  const v10 = row(ic + 1)[ig]
  const v01 = row(ic)[Math.min(ig + 1, gammas.length - 1)]
  const v11 = row(ic + 1)[Math.min(ig + 1, gammas.length - 1)]
  const a = v00 + (v10 - v00) * tc
  const b = v01 + (v11 - v01) * tc
  return Math.max(0, a + (b - a) * tg)
}

/** Rodrigues 旋转：向量 v 绕单位轴 k 转 angRad */
function rotateAxis(v: Vec3, k: Vec3, angRad: number): Vec3 {
  const c = Math.cos(angRad)
  const s = Math.sin(angRad)
  const dot = v3.dot(v, k)
  const cross = v3.cross(k, v)
  return v3.add(v3.add(v3.scale(v, c), v3.scale(cross, s)), v3.scale(k, dot * (1 - c)))
}

export interface LampBasis {
  /** 光轴单位向量（世界坐标） */
  axis: Vec3
  /** 局部 X：桩号方向参考 */
  ex: Vec3
  /** 局部 Y：横向参考 */
  ey: Vec3
  origin: Vec3
}

/**
 * 计算灯具姿态。零位姿态：光轴 = -u（竖直向下），ex = t（桩号方向），ey = n（右横）
 * 依次施加 yaw（绕 u）、tilt（绕 ey）、roll（绕光轴）
 */
export function lampBasisWithAlignment(
  lamp: PlacedLuminaire,
  alignment: import('../types').TunnelAlignment
): LampBasis {
  const f = frameAt(alignment, lamp.s)
  let ex: Vec3 = f.t
  let ey: Vec3 = f.n
  let ez: Vec3 = v3.scale(f.u, -1)

  if (lamp.yawDeg) {
    const k = f.u
    ex = rotateAxis(ex, k, lamp.yawDeg * DEG)
    ey = rotateAxis(ey, k, lamp.yawDeg * DEG)
    ez = rotateAxis(ez, k, lamp.yawDeg * DEG)
  }
  if (lamp.tiltDeg) {
    const k = ey
    ex = rotateAxis(ex, k, lamp.tiltDeg * DEG)
    ez = rotateAxis(ez, k, lamp.tiltDeg * DEG)
  }
  if (lamp.rollDeg) {
    const k = ez
    ex = rotateAxis(ex, k, lamp.rollDeg * DEG)
    ey = rotateAxis(ey, k, lamp.rollDeg * DEG)
  }
  const origin = v3.add(
    f.p,
    v3.add(v3.scale(f.n, lamp.lateral), v3.scale(f.u, lamp.height))
  )
  return { axis: ez, ex, ey, origin }
}

export interface IlluminanceInput {
  lamp: PlacedLuminaire
  item: LuminaireLibraryItem
  /** 计算点世界坐标 */
  point: Vec3
  /** 计算点表面法线（世界坐标，单位向量） */
  normal: Vec3
  alignment: import('../types').TunnelAlignment
  cutoff?: number
}

export interface IlluminanceContrib {
  /** 照度 lx */
  e: number
  distance: number
  gammaDeg: number
  cDeg: number
  /** 该方向光强 cd */
  intensity: number
  cosIncidence: number
}

/**
 * 单个灯具对表面某点的照度（平方反比余弦定律）
 *
 *   E = I(γ,C) · cosθ / d²   (lx = lm/m²)
 *
 * 其中 I 由配光表按 C-γ 双线性插值得出，并乘以额定光通量、维护系数、调光系数。
 */
export function pointIlluminance(inp: IlluminanceInput): IlluminanceContrib {
  const { lamp, item, point, normal, alignment, cutoff } = inp
  const b = lampBasisWithAlignment(lamp, alignment)
  const dvec = v3.sub(point, b.origin)
  const d = v3.len(dvec)
  if (d < 1e-6) return { e: 0, distance: d, gammaDeg: 0, cDeg: 0, intensity: 0, cosIncidence: 0 }
  if (cutoff && d > cutoff) return { e: 0, distance: d, gammaDeg: 180, cDeg: 0, intensity: 0, cosIncidence: 0 }

  const r = v3.scale(dvec, 1 / d)
  const cosGamma = Math.max(-1, Math.min(1, v3.dot(r, b.axis)))
  const gammaDeg = Math.acos(cosGamma) / DEG
  const rx = v3.dot(r, b.ex)
  const ry = v3.dot(r, b.ey)
  const cDeg = norm360(Math.atan2(ry, rx) / DEG)

  const ph = item.photometric
  const cdPerKlm = interpolatePhotometry(ph, cDeg, gammaDeg)
  const fluxFactor = item.ratedFlux / 1000
  const intensity =
    cdPerKlm * fluxFactor * item.maintenanceFactor * lamp.dimFactor
  // 入射角 θ：表面法线与「计算点→光源」方向（即 -r）的夹角
  const cosIncidence = -v3.dot(r, normal)
  if (cosIncidence <= 0) {
    return { e: 0, distance: d, gammaDeg, cDeg, intensity, cosIncidence }
  }
  const e = (intensity * cosIncidence) / (d * d)
  return { e, distance: d, gammaDeg, cDeg, intensity, cosIncidence }
}
