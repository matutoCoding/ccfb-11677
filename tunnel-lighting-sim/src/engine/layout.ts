import type { LightingZone, PlacedLuminaire } from '../types'

let uidCounter = 0
export function uid(prefix = 'id'): string {
  uidCounter += 1
  return `${prefix}-${Date.now().toString(36)}-${uidCounter}-${Math.floor(
    performance.now() % 100000
  ).toString(36)}`
}

/**
 * 按区段参数批量布灯（覆盖式，返回新的灯具列表）
 * 单排：中线 lateral=zone.lateral；双排：±zone.lateral
 */
export function autoPlaceLuminaires(
  zones: LightingZone[],
  existing: PlacedLuminaire[] = [],
  options: { keepManual?: boolean } = {}
): PlacedLuminaire[] {
  const manual = options.keepManual
    ? existing.filter((l) => (l as PlacedLuminaire & { manual?: boolean }).manual)
    : []
  const out: PlacedLuminaire[] = [...manual]
  zones.forEach((z) => {
    if (!z.libraryId || z.spacing <= 0) return
    const first = Math.ceil(z.startS / z.spacing) * z.spacing
    for (let s = first; s < z.endS - 1e-6; s += z.spacing) {
      const laterals = z.dualRow ? [Math.abs(z.lateral) || 1.2, -(Math.abs(z.lateral) || 1.2)] : [z.lateral]
      laterals.forEach((lateral) => {
        out.push({
          id: uid('lamp'),
          libraryId: z.libraryId,
          s: Math.round(s * 1000) / 1000,
          lateral,
          height: z.height,
          yawDeg: z.yawDeg,
          tiltDeg: z.tiltDeg,
          rollDeg: 0,
          dimFactor: z.dimFactor,
          enabled: true
        })
      })
    }
  })
  return out.sort((a, b) => a.s - b.s || a.lateral - b.lateral)
}
