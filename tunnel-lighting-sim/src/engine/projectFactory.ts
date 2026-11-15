import type { CalcSettings, TunnelProject } from '../types'
import { uid } from './layout'

export const DEFAULT_CALC_SETTINGS: CalcSettings = {
  gridLongitudinal: 5,
  gridTransverse: 1,
  wallGridHeightM: 2,
  observerEyeHeight: 1.5,
  observerStationSpacing: 10,
  tiLimitPct: 15,
  adaptationTimeSec: 10,
  cutoffDistance: 60,
  trafficLevel: 'high'
}

export function createDefaultProject(name: string): TunnelProject {
  const now = Date.now()
  return {
    id: uid('proj'),
    name,
    createdAt: now,
    updatedAt: now,
    alignment: {
      length: 500,
      gradePct: 0,
      curveRadius: 0,
      curveDirection: 1
    },
    crossSection: {
      shape: 'three-center-arch',
      roadWidth: 10.5,
      laneCount: 2,
      laneWidth: 3.75,
      sidewalkWidth: 0.75,
      wallHeight: 2.8,
      archRadius1: 6.2,
      archRadius2: 5.4,
      crownHeight: 7.0,
      wallReflectance: 0.25,
      roadLuminanceCoeff: 0.07
    },
    designSpeedKmh: 80,
    l20: 4000,
    l20Calc: { skyL: 6000, roadL: 3000, envL: 2000, kSky: 0.4, kRoad: 0.3, kEnv: 0.3 },
    zones: [],
    luminaires: [],
    calcSettings: { ...DEFAULT_CALC_SETTINGS },
    notes: ''
  }
}
