import { useState } from 'react'
import { useAppStore, useCurrentProject } from '../store/appStore'
import { NumberField, TextField, useToast } from '../components/ui'
import TunnelViewer from '../components/TunnelViewer'
import { buildDefaultZones, DEFAULT_STANDARDS } from '../engine/standards'
import { autoPlaceLuminaires } from '../engine/layout'
import { calcL20 } from '../engine/standards'
import type { CrossSectionShape } from '../types'

export default function TunnelModelPage() {
  const project = useCurrentProject()!
  const update = useAppStore((s) => s.updateProject)
  const standards = useAppStore((s) => s.standards)
  const [tab, setTab] = useState<'geometry' | 'zone'>('geometry')
  const toast = useToast()

  const patch = (p: Partial<typeof project>) => update(project.id, p)
  const al = project.alignment
  const cs = project.crossSection

  const autoBuild = () => {
    const zones = buildDefaultZones(
      project.alignment,
      project.designSpeedKmh,
      standards,
      'lamp-led-basic-100',
      'lamp-led-reinforce-200'
    )
    const luminaires = autoPlaceLuminaires(zones, project.luminaires)
    patch({ zones, luminaires })
    toast.show(`已按 ${project.designSpeedKmh}km/h 规范生成 ${zones.length} 个区段、${luminaires.length} 盏灯`)
  }

  return (
    <div className="page">
      <h1 className="page-title">
        隧道建模
        <span className="sub">参数化断面 · 平纵线形 · 设计输入</span>
      </h1>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div>
          <div className="panel">
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <button className={tab === 'geometry' ? 'primary small' : 'small'} onClick={() => setTab('geometry')}>
                几何与设计参数
              </button>
              <button className={tab === 'zone' ? 'primary small' : 'small'} onClick={() => setTab('zone')}>
                照明区段
              </button>
            </div>

            {tab === 'geometry' && (
              <>
                <TextField label="项目名称" value={project.name} onChange={(v) => patch({ name: v })} />
                <h3>平面与纵断面线形</h3>
                <div className="field-row">
                  <NumberField label="隧道长度" unit="m" value={al.length} min={20} step={10}
                    onChange={(v) => patch({ alignment: { ...al, length: v } })} />
                  <NumberField label="纵坡" unit="%" value={al.gradePct} step={0.1}
                    onChange={(v) => patch({ alignment: { ...al, gradePct: v } })} />
                </div>
                <div className="field-row">
                  <NumberField label="平曲线半径（0=直线）" unit="m" value={al.curveRadius} step={50} min={0}
                    onChange={(v) => patch({ alignment: { ...al, curveRadius: Math.max(0, v) } })} />
                  <div className="field">
                    <label>弯道方向</label>
                    <select
                      value={al.curveDirection}
                      onChange={(e) => patch({
                        alignment: { ...al, curveDirection: Number(e.target.value) as 1 | -1 }
                      })}
                    >
                      <option value={1}>右转</option>
                      <option value={-1}>左转</option>
                    </select>
                  </div>
                </div>

                <h3 style={{ marginTop: 18 }}>横断面</h3>
                <div className="field">
                  <label>断面形式</label>
                  <select
                    value={cs.shape}
                    onChange={(e) => patch({ crossSection: { ...cs, shape: e.target.value as CrossSectionShape } })}
                  >
                    <option value="three-center-arch">三心拱</option>
                    <option value="rectangular">矩形</option>
                    <option value="circular">圆形（盾构）</option>
                  </select>
                </div>
                <div className="field-row">
                  <NumberField label="路面总宽" unit="m" value={cs.roadWidth} step={0.25}
                    onChange={(v) => patch({ crossSection: { ...cs, roadWidth: v } })} />
                  <NumberField label="车道数" value={cs.laneCount} min={1} step={1}
                    onChange={(v) => patch({ crossSection: { ...cs, laneCount: Math.round(v) } })} />
                  <NumberField label="单车道宽" unit="m" value={cs.laneWidth} step={0.25}
                    onChange={(v) => patch({ crossSection: { ...cs, laneWidth: v } })} />
                </div>
                <div className="field-row">
                  <NumberField label="直墙高度" unit="m" value={cs.wallHeight} step={0.1}
                    onChange={(v) => patch({ crossSection: { ...cs, wallHeight: v } })} />
                  <NumberField label="拱顶净高" unit="m" value={cs.crownHeight} step={0.1}
                    onChange={(v) => patch({ crossSection: { ...cs, crownHeight: v } })} />
                </div>
                <div className="field-row">
                  <NumberField label="侧拱半径 R1" unit="m" value={cs.archRadius1} step={0.1}
                    onChange={(v) => patch({ crossSection: { ...cs, archRadius1: v } })} />
                  <NumberField label="顶拱半径 R2" unit="m" value={cs.archRadius2} step={0.1}
                    onChange={(v) => patch({ crossSection: { ...cs, archRadius2: v } })} />
                </div>
                <div className="field-row">
                  <NumberField label="墙面反射比 ρ" value={cs.wallReflectance} step={0.05} min={0.05} max={0.9}
                    onChange={(v) => patch({ crossSection: { ...cs, wallReflectance: v } })} />
                  <NumberField label="路面亮度系数 q0" unit="cd/m²/lx" value={cs.roadLuminanceCoeff}
                    step={0.005} min={0.01} max={0.3}
                    onChange={(v) => patch({ crossSection: { ...cs, roadLuminanceCoeff: v } })} />
                </div>

                <h3 style={{ marginTop: 18 }}>照明设计输入</h3>
                <div className="field-row">
                  <NumberField label="设计车速" unit="km/h" value={project.designSpeedKmh} step={10} min={20} max={120}
                    onChange={(v) => patch({ designSpeedKmh: v })} />
                  <NumberField label="洞外亮度 L20(S)" unit="cd/m²" value={project.l20} step={100} min={0}
                    onChange={(v) => patch({ l20: v })} />
                </div>
                {project.l20Calc && (
                  <div className="panel" style={{ background: 'var(--bg-panel-2)', padding: 12 }}>
                    <div className="muted" style={{ marginBottom: 8, fontSize: 12 }}>
                      L20(S) 按 20° 视场天空/路面/环境亮度加权计算
                    </div>
                    <div className="field-row">
                      <NumberField label="天空亮度" value={project.l20Calc.skyL} step={100}
                        onChange={(v) => patch({ l20Calc: { ...project.l20Calc!, skyL: v } })} />
                      <NumberField label="路面亮度" value={project.l20Calc.roadL} step={100}
                        onChange={(v) => patch({ l20Calc: { ...project.l20Calc!, roadL: v } })} />
                      <NumberField label="环境亮度" value={project.l20Calc.envL} step={100}
                        onChange={(v) => patch({ l20Calc: { ...project.l20Calc!, envL: v } })} />
                    </div>
                    <div className="field-row">
                      <NumberField label="天空占比 k1" value={project.l20Calc.kSky} step={0.05} min={0} max={1}
                        onChange={(v) => patch({ l20Calc: { ...project.l20Calc!, kSky: v } })} />
                      <NumberField label="路面占比 k2" value={project.l20Calc.kRoad} step={0.05} min={0} max={1}
                        onChange={(v) => patch({ l20Calc: { ...project.l20Calc!, kRoad: v } })} />
                      <NumberField label="环境占比 k3" value={project.l20Calc.kEnv} step={0.05} min={0} max={1}
                        onChange={(v) => patch({ l20Calc: { ...project.l20Calc!, kEnv: v } })} />
                    </div>
                    <button className="small" onClick={() => patch({ l20: Math.round(calcL20(project.l20Calc!)) })}>
                      计算 L20(S) = {Math.round(calcL20(project.l20Calc!))} cd/m² 并回填
                    </button>
                  </div>
                )}
              </>
            )}

            {tab === 'zone' && (
              <>
                <p className="muted" style={{ marginTop: 0 }}>
                  按 JTG/T D70/2-01-2014 默认区段长度与当前设计车速自动生成 TH1/TH2 → TR1~TR3 → 中间段 → 出口段，
                  之后可在「灯具布置」页逐段调整间距、高度、双排等参数。
                </p>
                <button className="primary" onClick={autoBuild}>
                  一键生成规范照明区段并自动布灯
                </button>
                {project.zones.length > 0 && (
                  <table style={{ marginTop: 14 }}>
                    <thead>
                      <tr><th>区段</th><th>起(m)</th><th>止(m)</th><th>长度(m)</th></tr>
                    </thead>
                    <tbody>
                      {project.zones.map((z) => (
                        <tr key={z.id}>
                          <td>{z.type}</td>
                          <td className="mono">{z.startS.toFixed(1)}</td>
                          <td className="mono">{z.endS.toFixed(1)}</td>
                          <td className="mono">{(z.endS - z.startS).toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            )}
          </div>
        </div>

        <div>
          <TunnelViewer project={project} height={560} />
          <div className="legend-row" style={{ marginTop: 10 }}>
            <span><span className="dot" style={{ background: '#4cc38a' }} />入口方向</span>
            <span><span className="dot" style={{ background: '#ffd76e' }} />灯具</span>
            <span className="muted">鼠标拖拽旋转 · 滚轮缩放</span>
          </div>
        </div>
      </div>
      {toast.node}
    </div>
  )
}
