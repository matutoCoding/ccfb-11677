import type { LuminaireLibraryItem, PhotometricData } from '../types'

const GAMMA_MAX = 90
const GAMMA_STEP = 5
const C_STEP = 15

const gammaAngles: number[] = []
for (let g = 0; g <= GAMMA_MAX; g += GAMMA_STEP) gammaAngles.push(g)
const cAngles: number[] = []
for (let c = 0; c < 360; c += C_STEP) cAngles.push(c)

/**
 * 将一维 γ 光型函数（相对值）归一化为 cd/1000lm
 * Φ = 2π ∫ I(γ) sinγ dγ，令 Φ = 1000 lm 求归一化系数
 * 数值积分（Simpson），仅在构建表时执行一次
 */
function normalizeShape(shape: (gammaRad: number) => number): number[] {
  const n = 1800
  const a = 0
  const b = (GAMMA_MAX * Math.PI) / 180
  const h = (b - a) / n
  let sum = shape(a) * Math.sin(a) + shape(b) * Math.sin(b)
  for (let i = 1; i < n; i++) {
    const x = a + i * h
    const w = i % 2 === 0 ? 2 : 4
    sum += w * shape(x) * Math.sin(x)
  }
  const integral = (h / 3) * sum
  const flux = 2 * Math.PI * integral
  const k = 1000 / flux
  return gammaAngles.map((g) => {
    const v = shape((g * Math.PI) / 180) * k
    return Math.round(v * 100) / 100
  })
}

/** 朗伯型：I(γ)=I0·cosγ，归一化后 I0 = 1000/π ≈ 318.31 */
function lambertian(): number[] {
  return normalizeShape((g) => Math.max(0, Math.cos(g)))
}

/** 轴对称高斯光型：集中在小角度，适合加强灯 */
function symmetricCone(sigmaDeg: number): number[] {
  const s = (sigmaDeg * Math.PI) / 180
  return normalizeShape((g) => Math.exp(-((g / s) ** 2)))
}

/** 蝙蝠翼（隧道基本灯常用宽光型）：峰值在 γ≈55°，γ=0 处有凹陷 */
function batwing(peakDeg: number, sigmaDeg: number): number[] {
  const p = (peakDeg * Math.PI) / 180
  const s = (sigmaDeg * Math.PI) / 180
  return normalizeShape((g) => {
    const lobe = Math.exp(-(((g - p) / s) ** 2)) + Math.exp(-(((g + p) / s) ** 2))
    // 轴向保留约 35% 光强，避免完全凹陷
    return 0.35 * Math.exp(-((g / (s * 1.6)) ** 2)) + lobe
  })
}

/** C 轴对称光型 → 完整 C-γ 表 */
function axialLUT(values: number[]): number[][] {
  return cAngles.map(() => [...values])
}

let seq = 0
function makePhotometric(name: string, values: number[]): PhotometricData {
  return {
    id: `ph-builtin-${seq++}`,
    name,
    cAngles: [...cAngles],
    gammaAngles: [...gammaAngles],
    cdPerKlmLUT: axialLUT(values),
    source: 'builtin'
  }
}

export const BUILTIN_LUMINAIRES: LuminaireLibraryItem[] = [
  {
    id: 'lamp-led-reinforce-200',
    name: 'LED 隧道加强灯 200W',
    manufacturer: '内置示例库',
    ratedFlux: 24000,
    powerW: 200,
    colorTempK: 5000,
    maintenanceFactor: 0.8,
    photometric: makePhotometric('窄配光 高斯 σ=32°', symmetricCone(32))
  },
  {
    id: 'lamp-led-basic-100',
    name: 'LED 隧道基本灯 100W',
    manufacturer: '内置示例库',
    ratedFlux: 13000,
    powerW: 100,
    colorTempK: 4500,
    maintenanceFactor: 0.8,
    photometric: makePhotometric('蝙蝠翼宽光型 峰55°', batwing(55, 22))
  },
  {
    id: 'lamp-led-basic-60',
    name: 'LED 隧道基本灯 60W',
    manufacturer: '内置示例库',
    ratedFlux: 7200,
    powerW: 60,
    colorTempK: 4500,
    maintenanceFactor: 0.8,
    photometric: makePhotometric('蝙蝠翼宽光型 峰60°', batwing(60, 24))
  },
  {
    id: 'lamp-hps-150',
    name: '高压钠灯 150W（传统）',
    manufacturer: '内置示例库',
    ratedFlux: 16000,
    powerW: 150,
    colorTempK: 2200,
    maintenanceFactor: 0.7,
    photometric: makePhotometric('朗伯型配光', lambertian())
  },
  {
    id: 'lamp-led-reinforce-150',
    name: 'LED 隧道加强灯 150W',
    manufacturer: '内置示例库',
    ratedFlux: 18000,
    powerW: 150,
    colorTempK: 5000,
    maintenanceFactor: 0.8,
    photometric: makePhotometric('中窄配光 高斯 σ=40°', symmetricCone(40))
  }
]

/** 用户导入的 IES 灯具也放这里（内存态，项目导出时随项目保存） */
export function findLuminaire(id: string, extra: LuminaireLibraryItem[] = []): LuminaireLibraryItem | undefined {
  return [...BUILTIN_LUMINAIRES, ...extra].find((l) => l.id === id)
}
