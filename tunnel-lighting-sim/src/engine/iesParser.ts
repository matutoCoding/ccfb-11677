import type { LuminaireLibraryItem, PhotometricData } from '../types'
import { uid } from './layout'

/**
 * 极简 IES LM-63 解析器（支持 TILT=NONE 常见格式）
 * 仅处理 C-γ（Type C，室内/道路灯具）数据，足够导入 DIALux 导出的 IES 文件。
 * 不支持的字段会跳过；解析失败抛出带行号信息的 Error。
 */
export function parseIes(text: string, fallbackName: string): LuminaireLibraryItem {
  const lines = text.split(/\r?\n/)
  let idx = 0
  const labels: Record<string, string> = {}

  // 标签段
  while (idx < lines.length) {
    const line = lines[idx].trim()
    idx++
    if (line.startsWith('[')) {
      const m = line.match(/^\[(\w+)\]\s*(.*)$/)
      if (m) labels[m[1].toUpperCase()] = m[2]
      continue
    }
    if (line === 'TILT=NONE' || line.startsWith('TILT=')) break
  }

  const nums: number[] = []
  while (idx < lines.length) {
    lines[idx].split(/[\s,]+/).filter(Boolean).forEach((tok) => {
      const n = Number(tok)
      if (!Number.isNaN(n)) nums.push(n)
    })
    idx++
  }
  if (nums.length < 20) throw new Error('IES 文件数据段过短或格式不受支持')

  let p = 0
  const nLamps = nums[p++]
  const lumensPerLamp = nums[p++]
  const multiplier = nums[p++]
  const nC = nums[p++]
  const nG = nums[p++]
  p += 6 // photometric type, units, width/length/height, ballast factor, file generation
  const inputWatts = nums[p++]
  const nCn = nC
  const nGn = nG
  void nLamps

  const cAngles: number[] = []
  for (let i = 0; i < nCn; i++) cAngles.push(nums[p++])
  const gammaAngles: number[] = []
  for (let i = 0; i < nGn; i++) gammaAngles.push(nums[p++])

  // IES 表：先按 γ 再按 C（每个 C 平面给出 nG 个值），值单位 cd（乘 multiplier）
  const lutByC: number[][] = []
  for (let i = 0; i < nCn; i++) {
    const row: number[] = []
    for (let j = 0; j < nGn; j++) row.push(nums[p++] * multiplier)
    lutByC.push(row)
  }
  if (p > nums.length + 2) throw new Error('IES 数据点数与声明不一致')

  // 转为 cd/1000lm：除以每千流明（IES 值通常已是 cd @1000lm 或绝对 cd，按 lumensPerLamp 归一）
  const flux = lumensPerLamp > 0 ? lumensPerLamp : 1000
  const cdPerKlmLUT = lutByC.map((row) => row.map((v) => (v / flux) * 1000))

  const photometric: PhotometricData = {
    id: uid('ph-ies'),
    name: labels.LUMCAT || `${fallbackName} 配光`,
    cAngles,
    gammaAngles,
    cdPerKlmLUT,
    source: 'ies-import'
  }

  return {
    id: uid('lamp-ies'),
    name: labels.LUMINAIRE || labels.MANUFAC ? `${labels.MANUFAC || ''} ${labels.LUMINAIRE || ''}`.trim() : fallbackName,
    manufacturer: labels.MANUFAC || 'IES 导入',
    ratedFlux: flux,
    powerW: inputWatts,
    colorTempK: 4500,
    maintenanceFactor: 0.8,
    photometric
  }
}
