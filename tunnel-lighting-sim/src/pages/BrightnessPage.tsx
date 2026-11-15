import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import { useAppStore, useCurrentProject } from '../store/appStore'
import { useCalcResult } from '../hooks/useCalcResult'
import { falseColor, downloadBlob, useToast } from '../components/ui'
import { buildReportCsv } from '../engine/report'
import { ZONE_META } from '../engine/standards'
import type { GridPoint } from '../types'

type HeatMode = 'luminance' | 'illuminance'

/** 路面伪彩热力图（Canvas 逐格绘制，对数色标） */
function RoadHeatmap({ grid, mode }: { grid: GridPoint[][]; mode: HeatMode }) {
  const ref = useMemo(() => ({ current: null as HTMLCanvasElement | null }), [])
  const { maxVal, minVal } = useMemo(() => {
    let max = 0
    let min = Infinity
    grid.forEach((row) =>
      row.forEach((g) => {
        const v = mode === 'luminance' ? g.luminance : g.illuminance
        max = Math.max(max, v)
        min = Math.min(min, v)
      })
    )
    return { maxVal: max, minVal: grid.length ? min : 0 }
  }, [grid, mode])

  const draw = (canvas: HTMLCanvasElement | null) => {
    ref.current = canvas
    if (!canvas || grid.length === 0) return
    const ctx = canvas.getContext('2d')!
    const rows = grid.length
    const cols = grid[0].length
    canvas.width = cols * 26
    canvas.height = rows * 14
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const logMin = Math.log10(Math.max(minVal, 1e-3))
    const logMax = Math.log10(Math.max(maxVal, 1e-3))
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const v = mode === 'luminance' ? grid[i][j].luminance : grid[i][j].illuminance
        const t = logMax > logMin ? (Math.log10(Math.max(v, 1e-3)) - logMin) / (logMax - logMin) : 0
        ctx.fillStyle = falseColor(t)
        ctx.fillRect(j * 26, i * 14, 25, 13)
      }
    }
  }

  return (
    <div>
      <div className="scroll" style={{ maxHeight: 420 }}>
        <canvas ref={draw} style={{ width: '100%', maxWidth: 760 }} />
      </div>
      <div className="legend-row" style={{ marginTop: 8 }}>
        <span>低</span>
        {[0, 0.2, 0.4, 0.6, 0.75, 0.9, 1].map((t) => (
          <span key={t} className="dot" style={{ background: falseColor(t), width: 22, height: 12 }} />
        ))}
        <span>高（对数色标）</span>
        <span className="muted">
          范围 {minVal.toFixed(2)} ~ {maxVal.toFixed(2)} {mode === 'luminance' ? 'cd/m²' : 'lx'}
        </span>
      </div>
      <div className="muted" style={{ marginTop: 4, fontSize: 11.5 }}>
        纵轴为桩号方向（入口→出口），横轴为路面横向
      </div>
    </div>
  )
}

export default function BrightnessPage() {
  const project = useCurrentProject()!
  const result = useCalcResult()
  const standards = useAppStore((s) => s.standards)
  const [mode, setMode] = useState<HeatMode>('luminance')
  const toast = useToast()

  const curveData = useMemo(() => {
    if (!result) return []
    // 每个纵向站取该行平均亮度，并对照所在区段规范值
    return result.roadGrid.map((row) => {
      const s = row[0].s
      const avgL = row.reduce((a, g) => a + g.luminance, 0) / row.length
      const zone = project.zones.find((z) => s >= z.startS && s < z.endS)
      const req = zone ? result.zoneStats.find((z) => z.zoneId === zone.id)?.requiredLuminance ?? null : null
      return {
        s: Number(s.toFixed(1)),
        avgL: Number(avgL.toFixed(3)),
        req: req === null ? undefined : Number(req.toFixed(3)),
        zone: zone ? ZONE_META[zone.type].short : ''
      }
    })
  }, [result, project.zones])

  const tiData = useMemo(
    () =>
      result?.tiStations.map((t) => ({
        s: Number(t.s.toFixed(1)),
        ti: Number(t.tiPct.toFixed(2)),
        limit: project.calcSettings.tiLimitPct
      })) ?? [],
    [result, project.calcSettings.tiLimitPct]
  )

  if (!result) return null

  const exportCsv = () => {
    downloadBlob(`${project.name}-照明计算报告.csv`, buildReportCsv(project, result))
    toast.show('CSV 报告已导出')
  }

  return (
    <div className="page">
      <h1 className="page-title">
        亮度计算
        <span className="sub">配光曲线积分 · 平方反比余弦法 · JTG/T D70/2-01-2014 对照</span>
        <button className="primary" style={{ marginLeft: 'auto' }} onClick={exportCsv}>
          导出计算报告 CSV
        </button>
      </h1>

      {result.warnings.length > 0 && (
        <div className="panel" style={{ borderColor: '#7a5a37', marginBottom: 14 }}>
          {result.warnings.map((w) => (
            <div key={w} style={{ color: 'var(--warn)' }}>⚠ {w}</div>
          ))}
        </div>
      )}

      <div className="grid-3" style={{ marginBottom: 14 }}>
        <div className="kpi"><div className="v">{result.lampCount}</div><div className="k">启用灯具数</div></div>
        <div className="kpi"><div className="v">{(result.totalPowerW / 1000).toFixed(2)} kW</div><div className="k">总装机功率</div></div>
        <div className="kpi"><div className="v">{result.overallAvgL.toFixed(2)}</div><div className="k">全洞平均亮度 cd/m²</div></div>
        <div className="kpi"><div className="v">{result.overallU0.toFixed(3)}</div><div className="k">区段最小 U0（限值 {standards.u0Limit}，按区段考核）</div></div>
        <div className="kpi">
          <div className="v" style={{ color: result.zoneStats.some((z) => z.pass === false) ? 'var(--bad)' : 'var(--ok)' }}>
            {result.zoneStats.filter((z) => z.pass === false).length}
          </div>
          <div className="k">亮度不达标区段数</div>
        </div>
        <div className="kpi">
          <div className="v" style={{ color: result.tiStations.some((t) => !t.pass) ? 'var(--bad)' : 'var(--ok)' }}>
            {result.tiStations.filter((t) => !t.pass).length}
          </div>
          <div className="k">TI 超标站位数（限值 {project.calcSettings.tiLimitPct}%）</div>
        </div>
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="panel">
          <h3>
            路面{mode === 'luminance' ? '亮度' : '照度'}伪彩图
            <button className="small" style={{ float: 'right' }}
              onClick={() => setMode(mode === 'luminance' ? 'illuminance' : 'luminance')}>
              切换为{mode === 'luminance' ? '照度(lx)' : '亮度(cd/m²)'}
            </button>
          </h3>
          <RoadHeatmap grid={result.roadGrid} mode={mode} />
        </div>

        <div className="panel">
          <h3>墙面 2m 高度带亮度（左右墙，cd/m²）</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart
              data={result.wallGrid.reduce<Array<{ s: number; left: number; right: number }>>((acc, w, i) => {
                const row = acc.find((a) => a.s === Number(w.s.toFixed(1))) ?? {
                  s: Number(w.s.toFixed(1)),
                  left: 0,
                  right: 0
                }
                row[w.side] = Number(w.luminance.toFixed(3))
                if (!acc.includes(row)) acc.push(row)
                return acc
              }, [])}
              margin={{ top: 8, right: 16, bottom: 4, left: -14 }}
            >
              <CartesianGrid stroke="#2a3648" />
              <XAxis dataKey="s" stroke="#93a1b3" name="桩号 m" />
              <YAxis stroke="#93a1b3" />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="left" name="左墙" stroke="#4da3ff" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="right" name="右墙" stroke="#e8a94c" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        <h3>纵向平均亮度曲线 vs 规范要求值</h3>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={curveData} margin={{ top: 8, right: 20, bottom: 4, left: -10 }}>
            <CartesianGrid stroke="#2a3648" />
            <XAxis dataKey="s" stroke="#93a1b3" label={{ value: '桩号 (m)', position: 'insideBottom', offset: -2, fill: '#93a1b3' }} />
            <YAxis stroke="#93a1b3" label={{ value: 'cd/m²', angle: -90, position: 'insideLeft', fill: '#93a1b3' }} />
            <Tooltip formatter={(v, name) => [v, name === 'avgL' ? '计算平均亮度' : '规范要求亮度']} />
            <Legend />
            <Line type="monotone" dataKey="avgL" name="计算平均亮度" stroke="#4cc38a" dot={false} strokeWidth={2.2} />
            <Line type="stepAfter" dataKey="req" name="规范要求亮度" stroke="#ef5f6b" dot={false}
              strokeWidth={2} strokeDasharray="7 4" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        <h3>眩光阈值增量 TI 沿程曲线（超标段标红）</h3>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={tiData} margin={{ top: 8, right: 20, bottom: 4, left: -10 }}>
            <CartesianGrid stroke="#2a3648" />
            <XAxis dataKey="s" stroke="#93a1b3" label={{ value: '桩号 (m)', position: 'insideBottom', offset: -2, fill: '#93a1b3' }} />
            <YAxis stroke="#93a1b3" label={{ value: 'TI (%)', angle: -90, position: 'insideLeft', fill: '#93a1b3' }} />
            <Tooltip />
            <ReferenceLine y={project.calcSettings.tiLimitPct} stroke="#ef5f6b" strokeDasharray="6 4"
              label={{ value: `限值 ${project.calcSettings.tiLimitPct}%`, fill: '#ef5f6b', fontSize: 11 }} />
            <Line type="monotone" dataKey="ti" name="TI (%)" stroke="#4da3ff" dot={false} strokeWidth={2}
              activeDot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="panel" style={{ marginTop: 14, padding: 0 }}>
        <h3 style={{ padding: '14px 16px 0' }}>分区亮度与规范对照明细</h3>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>区段</th><th>起-止(m)</th><th>灯具</th>
                <th>平均照度(lx)</th><th>平均亮度</th><th>最低/最高</th>
                <th>U0</th><th>U1</th><th>规范要求</th><th>亮度判定</th>
                <th>最大TI(%)</th><th>TI判定</th>
              </tr>
            </thead>
            <tbody>
              {result.zoneStats.map((z) => (
                <tr key={z.zoneId}>
                  <td style={{ color: ZONE_META[z.type].color }}>{ZONE_META[z.type].name}</td>
                  <td className="mono">{z.startS.toFixed(1)}–{z.endS.toFixed(1)}</td>
                  <td className="mono">{z.lampCount}</td>
                  <td className="mono">{z.avgIlluminance.toFixed(1)}</td>
                  <td className="mono">{z.avgLuminance.toFixed(2)}</td>
                  <td className="mono">{z.minLuminance.toFixed(2)} / {z.maxLuminance.toFixed(2)}</td>
                  <td className="mono">{z.uniformityU0.toFixed(3)}</td>
                  <td className="mono">{z.uniformityU1.toFixed(3)}</td>
                  <td className="mono">{z.requiredLuminance === null ? '—' : z.requiredLuminance.toFixed(2)}</td>
                  <td>
                    {z.pass === null ? <span className="muted">—</span>
                      : z.pass ? <span className="badge ok">满足</span>
                      : <span className="badge bad">不满足</span>}
                  </td>
                  <td className="mono" style={{ color: z.tiPass === false ? 'var(--bad)' : undefined }}>
                    {z.maxTiPct.toFixed(2)}
                  </td>
                  <td>
                    {z.tiPass === null ? <span className="muted">—</span>
                      : z.tiPass ? <span className="badge ok">满足</span>
                      : <span className="badge bad">超标</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {toast.node}
    </div>
  )
}
