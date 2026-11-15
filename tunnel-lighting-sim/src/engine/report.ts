import type { CalcResult, TunnelProject } from '../types'
import { ZONE_META } from './standards'

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function row(cells: unknown[]): string {
  return cells.map(csvCell).join(',')
}

/** 生成完整计算报告 CSV（UTF-8 BOM，Excel 直接打开不乱码） */
export function buildReportCsv(p: TunnelProject, r: CalcResult): string {
  const lines: string[] = []
  lines.push(row(['公路隧道照明计算报告']))
  lines.push(row(['生成时间', new Date(r.timestamp).toLocaleString('zh-CN')]))
  lines.push(row([]))
  lines.push(row(['一、项目与隧道参数']))
  lines.push(row(['项目名称', p.name]))
  lines.push(row(['隧道长度(m)', p.alignment.length]))
  lines.push(row(['纵坡(%)', p.alignment.gradePct]))
  lines.push(row(['平曲线半径(m)', p.alignment.curveRadius || '直线']))
  lines.push(row(['设计车速(km/h)', p.designSpeedKmh]))
  lines.push(row(['洞外亮度L20(S)(cd/m2)', p.l20]))
  lines.push(row(['断面形式', p.crossSection.shape]))
  lines.push(row(['路面宽度(m)', p.crossSection.roadWidth]))
  lines.push(row(['车道数', p.crossSection.laneCount]))
  lines.push(row(['墙面反射比', p.crossSection.wallReflectance]))
  lines.push(row(['路面亮度系数q0', p.crossSection.roadLuminanceCoeff]))
  lines.push(row([]))

  lines.push(row(['二、总体结果']))
  lines.push(row(['启用灯具数', r.lampCount]))
  lines.push(row(['总功率(W)', Math.round(r.totalPowerW * 10) / 10]))
  lines.push(row(['全洞平均路面亮度(cd/m2)', r.overallAvgL.toFixed(3)]))
  lines.push(row(['区段最小总均匀度U0（按区段考核）', r.overallU0.toFixed(3)]))
  lines.push(row([]))

  lines.push(row(['三、分区亮度与规范对照']))
  lines.push(row([
    '区段', '起点(m)', '终点(m)', '长度(m)', '灯具数',
    '平均照度(lx)', '平均亮度(cd/m2)', '最低亮度', '最高亮度',
    '均匀度U0', '纵向均匀度U1', '规范要求亮度', '亮度判定',
    '最大TI(%)', 'TI判定'
  ]))
  r.zoneStats.forEach((z) => {
    lines.push(row([
      ZONE_META[z.type].name,
      z.startS.toFixed(1), z.endS.toFixed(1), (z.endS - z.startS).toFixed(1),
      z.lampCount,
      z.avgIlluminance.toFixed(2), z.avgLuminance.toFixed(3),
      z.minLuminance.toFixed(3), z.maxLuminance.toFixed(3),
      z.uniformityU0.toFixed(3), z.uniformityU1.toFixed(3),
      z.requiredLuminance === null ? '-' : z.requiredLuminance.toFixed(3),
      z.pass === null ? '-' : z.pass ? '满足' : '不满足',
      z.maxTiPct.toFixed(2),
      z.tiPass === null ? '-' : z.tiPass ? '满足' : '不满足'
    ]))
  })
  lines.push(row([]))

  lines.push(row(['四、眩光 TI 站位明细']))
  lines.push(row(['桩号(m)', 'TI(%)', '光幕亮度Lv(cd/m2)', '适应亮度(cd/m2)', '参与灯具数', '判定']))
  r.tiStations.forEach((t) => {
    lines.push(row([
      t.s.toFixed(1), t.tiPct.toFixed(2), t.veilLv.toFixed(3),
      t.adaptationL.toFixed(3), t.lampCount, t.pass ? '满足' : '超标'
    ]))
  })
  lines.push(row([]))

  lines.push(row(['五、路面亮度伪彩网格数据 (cd/m2)']))
  const laterals = r.roadGrid[0]?.map((g) => g.lateral) ?? []
  lines.push(row(['桩号\\横向(m)', ...laterals.map((x) => x.toFixed(2))]))
  r.roadGrid.forEach((r0) => {
    lines.push(row([r0[0].s.toFixed(2), ...r0.map((g) => g.luminance.toFixed(3))]))
  })
  lines.push(row([]))

  lines.push(row(['六、墙面亮度明细 (cd/m2)']))
  lines.push(row(['桩号(m)', '侧', '高度(m)', '照度(lx)', '亮度(cd/m2)']))
  r.wallGrid.forEach((w) => {
    lines.push(row([
      w.s.toFixed(2), w.side === 'left' ? '左墙' : '右墙',
      w.height.toFixed(2), w.illuminance.toFixed(2), w.luminance.toFixed(3)
    ]))
  })

  return '﻿' + lines.join('\r\n')
}

export function downloadText(filename: string, content: string, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
