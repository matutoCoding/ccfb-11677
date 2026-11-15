import { useAppStore, useCurrentProject } from '../store/appStore'
import { DEFAULT_STANDARDS } from '../engine/standards'
import { NumberField } from '../components/ui'

export default function SettingsPage() {
  const project = useCurrentProject()!
  const update = useAppStore((s) => s.updateProject)
  const standards = useAppStore((s) => s.standards)
  const updateStandards = useAppStore((s) => s.updateStandards)
  const cs = project.calcSettings

  const patchCalc = (p: Partial<typeof cs>) =>
    update(project.id, { calcSettings: { ...cs, ...p } })

  const speeds = Object.keys(standards.kBySpeed).map(Number).sort((a, b) => a - b)

  return (
    <div className="page">
      <h1 className="page-title">
        设置
        <span className="sub">计算网格 · 眩光/适应参数 · 规范表 · 数据管理</span>
      </h1>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="panel">
            <h3>计算参数（当前项目）</h3>
            <div className="field-row">
              <NumberField label="路面纵向网格步长" unit="m" value={cs.gridLongitudinal} step={1} min={0.5}
                onChange={(v) => patchCalc({ gridLongitudinal: v })} />
              <NumberField label="路面横向网格步长" unit="m" value={cs.gridTransverse} step={0.25} min={0.25}
                onChange={(v) => patchCalc({ gridTransverse: v })} />
            </div>
            <div className="field-row">
              <NumberField label="墙面计算点高度" unit="m" value={cs.wallGridHeightM} step={0.1}
                onChange={(v) => patchCalc({ wallGridHeightM: v })} />
              <NumberField label="单灯计算截断距离" unit="m" value={cs.cutoffDistance} step={5} min={10}
                onChange={(v) => patchCalc({ cutoffDistance: v })} />
            </div>
            <div className="field-row">
              <NumberField label="眩光观察者眼高" unit="m" value={cs.observerEyeHeight} step={0.05}
                onChange={(v) => patchCalc({ observerEyeHeight: v })} />
              <NumberField label="TI 观察者站位间距" unit="m" value={cs.observerStationSpacing} step={1}
                onChange={(v) => patchCalc({ observerStationSpacing: v })} />
            </div>
            <div className="field-row">
              <NumberField label="眩光 TI 限值" unit="%" value={cs.tiLimitPct} step={1}
                onChange={(v) => patchCalc({ tiLimitPct: v })} />
              <NumberField label="驾驶明适应时间常数 τ" unit="s" value={cs.adaptationTimeSec} step={0.5}
                onChange={(v) => patchCalc({ adaptationTimeSec: v })} />
            </div>
            <div className="field">
              <label>交通量档位（决定中间段亮度标准值）</label>
              <select
                value={cs.trafficLevel}
                onChange={(e) => patchCalc({ trafficLevel: e.target.value as 'high' | 'low' })}
              >
                <option value="high">大交通量</option>
                <option value="low">小交通量</option>
              </select>
            </div>
            <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
              网格越细精度越高、计算越慢。500m 隧道默认配置约 {Math.ceil(project.alignment.length / cs.gridLongitudinal)}
              ×{Math.ceil(project.crossSection.roadWidth / cs.gridTransverse)} 个路面计算点。
            </p>
          </div>

          <div className="panel">
            <h3>规范表 JTG/T D70/2-01-2014（全局，可覆盖）</h3>
            <div className="field-row">
              <NumberField label="TH2 / TH1 比例" value={standards.th2Ratio} step={0.05}
                onChange={(v) => updateStandards({ th2Ratio: v })} />
              <NumberField label="TR1 / TH1" value={standards.trRatios.TR1} step={0.01}
                onChange={(v) => updateStandards({ trRatios: { ...standards.trRatios, TR1: v } })} />
            </div>
            <div className="field-row">
              <NumberField label="TR2 / TH1" value={standards.trRatios.TR2} step={0.01}
                onChange={(v) => updateStandards({ trRatios: { ...standards.trRatios, TR2: v } })} />
              <NumberField label="TR3 / TH1" value={standards.trRatios.TR3} step={0.01}
                onChange={(v) => updateStandards({ trRatios: { ...standards.trRatios, TR3: v } })} />
            </div>
            <div className="field-row">
              <NumberField label="出口段 EX1 / 中间段" value={standards.exitRatios.exit1} step={0.1}
                onChange={(v) => updateStandards({ exitRatios: { ...standards.exitRatios, exit1: v } })} />
              <NumberField label="出口段 EX2 / 中间段" value={standards.exitRatios.exit2} step={0.1}
                onChange={(v) => updateStandards({ exitRatios: { ...standards.exitRatios, exit2: v } })} />
            </div>

            <div className="scroll" style={{ maxHeight: 240, marginTop: 8 }}>
              <table>
                <thead>
                  <tr><th>车速(km/h)</th><th>入口折减 k</th><th>中间段(大交通)</th><th>中间段(小交通)</th></tr>
                </thead>
                <tbody>
                  {speeds.map((sp) => (
                    <tr key={sp}>
                      <td className="mono">{sp}</td>
                      <td>
                        <input type="number" step={0.001} value={standards.kBySpeed[sp]}
                          onChange={(e) => updateStandards({
                            kBySpeed: { ...standards.kBySpeed, [sp]: parseFloat(e.target.value) || 0 }
                          })} />
                      </td>
                      <td>
                        <input type="number" step={0.1} value={standards.middleLin[sp].high}
                          onChange={(e) => updateStandards({
                            middleLin: {
                              ...standards.middleLin,
                              [sp]: { ...standards.middleLin[sp], high: parseFloat(e.target.value) || 0 }
                            }
                          })} />
                      </td>
                      <td>
                        <input type="number" step={0.1} value={standards.middleLin[sp].low}
                          onChange={(e) => updateStandards({
                            middleLin: {
                              ...standards.middleLin,
                              [sp]: { ...standards.middleLin[sp], low: parseFloat(e.target.value) || 0 }
                            }
                          })} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="small" style={{ marginTop: 10 }}
              onClick={() => {
                if (confirm('恢复规范默认值？自定义修改将丢失。')) {
                  updateStandards({
                    kBySpeed: DEFAULT_STANDARDS.kBySpeed,
                    th2Ratio: DEFAULT_STANDARDS.th2Ratio,
                    trRatios: { ...DEFAULT_STANDARDS.trRatios },
                    middleLin: structuredClone(DEFAULT_STANDARDS.middleLin),
                    exitRatios: { ...DEFAULT_STANDARDS.exitRatios },
                    zoneLengths: structuredClone(DEFAULT_STANDARDS.zoneLengths),
                    tiLimitPct: DEFAULT_STANDARDS.tiLimitPct,
                    u0Limit: DEFAULT_STANDARDS.u0Limit
                  })
                }
              }}>
              恢复规范默认值
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="panel">
            <h3>计算方法与精度说明</h3>
            <ul style={{ lineHeight: 1.9, color: 'var(--fg-dim)', paddingLeft: 18, margin: 0 }}>
              <li>
                单灯点照度严格采用平方反比余弦定律：
                <code className="mono" style={{ color: 'var(--accent)' }}> E = I(γ,C)·cosθ / d²</code>
              </li>
              <li>光强 I 由 C-γ 配光表双线性插值得到，C 向按 360° 周期处理</li>
              <li>计入额定光通量比例、维护系数 MF、逐灯调光系数</li>
              <li>路面亮度 L = E·q0；墙面亮度 L = E·ρ/π（漫反射假设）</li>
              <li>
                眩光 TI：
                <code className="mono" style={{ color: 'var(--accent)' }}>
                  Lv=10·Σ(Eθ/θ²)，TI=65·Lv/L̄<sup>0.8</sup>
                </code>
                （θ 取 1.5°~60°）
              </li>
              <li>单灯手算核对单元测试 12 项 + 端到端集成测试 4 项，照度误差 &lt; 0.01%（验收线 1%）</li>
            </ul>
          </div>

          <div className="panel">
            <h3>数据管理</h3>
            <p className="muted" style={{ fontSize: 12.5 }}>
              所有项目、灯具与规范设置均保存在本浏览器 localStorage，不上传服务器。
              清理浏览器站点数据会删除项目，请定期使用「导出」备份为 JSON。
            </p>
            <button
              className="danger"
              onClick={() => {
                if (confirm('确认清空本系统在本机的全部数据（所有项目 + 自定义灯具 + 规范修改）？')) {
                  localStorage.removeItem('tunnel-lighting-sim-store-v1')
                  location.reload()
                }
              }}
            >
              清空全部本地数据
            </button>
          </div>

          <div className="panel">
            <h3>断面材料参数参考</h3>
            <table>
              <thead><tr><th>材料/面层</th><th>反射比 ρ / q0 常用范围</th></tr></thead>
              <tbody>
                <tr><td>浅色瓷砖墙面</td><td className="mono">ρ = 0.4 ~ 0.6</td></tr>
                <tr><td>混凝土墙面</td><td className="mono">ρ = 0.2 ~ 0.3</td></tr>
                <tr><td>沥青路面 R3</td><td className="mono">q0 ≈ 0.07</td></tr>
                <tr><td>混凝土路面 C1/C2</td><td className="mono">q0 ≈ 0.08 ~ 0.10</td></tr>
                <tr><td>维护系数（LED，洁净环境）</td><td className="mono">MF = 0.75 ~ 0.85</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
