import { useRef, useState } from 'react'
import { BUILTIN_LUMINAIRES } from '../engine/luminaireLibrary'
import { parseIes } from '../engine/iesParser'
import { autoPlaceLuminaires, uid } from '../engine/layout'
import { useAppStore, useCurrentProject } from '../store/appStore'
import { NumberField, useToast } from '../components/ui'
import TunnelViewer from '../components/TunnelViewer'
import { ZONE_META } from '../engine/standards'
import type { LightingZone, PlacedLuminaire } from '../types'

export default function LuminaireLayoutPage() {
  const project = useCurrentProject()!
  const update = useAppStore((s) => s.updateProject)
  const customLuminaires = useAppStore((s) => s.customLuminaires)
  const addCustom = useAppStore((s) => s.addCustomLuminaire)
  const removeCustom = useAppStore((s) => s.removeCustomLuminaire)
  const fileRef = useRef<HTMLInputElement>(null)
  const toast = useToast()
  const [selectedLampId, setSelectedLampId] = useState<string | null>(null)
  const [viewerS, setViewerS] = useState<number | null>(null)

  const allLamps = [...BUILTIN_LUMINAIRES, ...customLuminaires]
  const lampName = (id: string) => allLamps.find((l) => l.id === id)?.name ?? id

  const updateZone = (zoneId: string, patch: Partial<LightingZone>) =>
    update(project.id, {
      zones: project.zones.map((z) => (z.id === zoneId ? { ...z, ...patch } : z))
    })

  const relayout = () => {
    if (project.zones.length === 0) {
      toast.show('请先在「隧道建模」页生成照明区段')
      return
    }
    const luminaires = autoPlaceLuminaires(project.zones)
    update(project.id, { luminaires })
    toast.show(`已按区段参数重新布置 ${luminaires.length} 盏灯`)
  }

  const onIes = async (file: File) => {
    try {
      const text = await file.text()
      const item = parseIes(text, file.name.replace(/\.ies$/i, ''))
      addCustom(item)
      toast.show(`IES 导入成功：${item.name}（${item.photometric.gammaAngles.length} 个 γ 角）`)
    } catch (e) {
      toast.show(`IES 解析失败：${(e as Error).message}`)
    }
  }

  const selected = project.luminaires.find((l) => l.id === selectedLampId) ?? null
  const updateLamp = (patch: Partial<PlacedLuminaire>) => {
    if (!selected) return
    update(project.id, {
      luminaires: project.luminaires.map((l) => (l.id === selected.id ? { ...l, ...patch } : l))
    })
  }
  const deleteLamp = () => {
    if (!selected) return
    update(project.id, { luminaires: project.luminaires.filter((l) => l.id !== selected.id) })
    setSelectedLampId(null)
  }
  const addLamp = () => {
    const lib = allLamps[0]
    const lamp: PlacedLuminaire = {
      id: uid('lamp'),
      libraryId: lib.id,
      s: 10,
      lateral: 0,
      height: project.crossSection.crownHeight - 0.8,
      yawDeg: 0,
      tiltDeg: 0,
      rollDeg: 0,
      dimFactor: 1,
      enabled: true
    }
    update(project.id, { luminaires: [...project.luminaires, lamp] })
    setSelectedLampId(lamp.id)
  }

  return (
    <div className="page">
      <h1 className="page-title">
        灯具布置
        <span className="sub">灯具库选型 · 区段批量布置 · 单灯微调 · IES 导入</span>
      </h1>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="panel">
            <h3>灯具库</h3>
            <table>
              <thead>
                <tr><th>型号</th><th>光通量(lm)</th><th>功率(W)</th><th>MF</th><th>来源</th><th></th></tr>
              </thead>
              <tbody>
                {allLamps.map((l) => (
                  <tr key={l.id}>
                    <td>{l.name}</td>
                    <td className="mono">{l.ratedFlux}</td>
                    <td className="mono">{l.powerW}</td>
                    <td className="mono">{l.maintenanceFactor}</td>
                    <td className="muted">{l.photometric.source === 'ies-import' ? 'IES' : '内置'}</td>
                    <td>
                      {l.photometric.source === 'ies-import' && (
                        <button className="small danger" onClick={() => removeCustom(l.id)}>移除</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 10, display: 'flex', gap: 10 }}>
              <button onClick={() => fileRef.current?.click()}>导入 IES 配光文件</button>
              <input
                ref={fileRef}
                type="file"
                accept=".ies"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) onIes(f)
                  e.target.value = ''
                }}
              />
            </div>
          </div>

          <div className="panel">
            <h3>区段批量布灯参数</h3>
            <div className="scroll" style={{ maxHeight: 260 }}>
              <table>
                <thead>
                  <tr>
                    <th>区段</th><th>灯具型号</th><th>间距(m)</th><th>横向(m)</th>
                    <th>高度(m)</th><th>调光</th><th>双排</th>
                  </tr>
                </thead>
                <tbody>
                  {project.zones.map((z) => (
                    <tr key={z.id}>
                      <td style={{ color: ZONE_META[z.type].color }}>{ZONE_META[z.type].short}</td>
                      <td>
                        <select
                          value={z.libraryId}
                          onChange={(e) => updateZone(z.id, { libraryId: e.target.value })}
                          style={{ width: 150 }}
                        >
                          {allLamps.map((l) => (
                            <option key={l.id} value={l.id}>{l.name}</option>
                          ))}
                        </select>
                      </td>
                      <td><input type="number" value={z.spacing} style={{ width: 70 }}
                        onChange={(e) => updateZone(z.id, { spacing: parseFloat(e.target.value) || 1 })} /></td>
                      <td><input type="number" value={z.lateral} style={{ width: 65 }} step={0.1}
                        onChange={(e) => updateZone(z.id, { lateral: parseFloat(e.target.value) || 0 })} /></td>
                      <td><input type="number" value={z.height} style={{ width: 65 }} step={0.1}
                        onChange={(e) => updateZone(z.id, { height: parseFloat(e.target.value) || 1 })} /></td>
                      <td><input type="number" value={z.dimFactor} style={{ width: 60 }} step={0.1} min={0} max={1}
                        onChange={(e) => updateZone(z.id, { dimFactor: parseFloat(e.target.value) || 0 })} /></td>
                      <td>
                        <input type="checkbox" checked={z.dualRow}
                          onChange={(e) => updateZone(z.id, { dualRow: e.target.checked })} />
                      </td>
                    </tr>
                  ))}
                  {project.zones.length === 0 && (
                    <tr><td colSpan={7} className="muted" style={{ textAlign: 'center' }}>
                      尚无区段，请先到「隧道建模」页生成
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: 10, display: 'flex', gap: 10 }}>
              <button className="primary" onClick={relayout}>按区段重新批量布灯</button>
              <button onClick={addLamp}>+ 手动添加单灯</button>
              <span className="muted" style={{ alignSelf: 'center' }}>当前共 {project.luminaires.length} 盏</span>
            </div>
          </div>

          <div className="panel">
            <h3>单灯编辑</h3>
            {!selected ? (
              <p className="muted">在下方灯具清单中点选一盏进行编辑</p>
            ) : (
              <>
                <div className="field">
                  <label>灯具型号</label>
                  <select value={selected.libraryId} onChange={(e) => updateLamp({ libraryId: e.target.value })}>
                    {allLamps.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
                <div className="field-row">
                  <NumberField label="桩号 s" unit="m" value={selected.s} step={0.5}
                    onChange={(v) => { updateLamp({ s: v }); setViewerS(v) }} />
                  <NumberField label="横向偏移" unit="m" value={selected.lateral} step={0.1}
                    onChange={(v) => updateLamp({ lateral: v })} />
                  <NumberField label="安装高度" unit="m" value={selected.height} step={0.1}
                    onChange={(v) => updateLamp({ height: v })} />
                </div>
                <div className="field-row">
                  <NumberField label="偏航 yaw" unit="°" value={selected.yawDeg} step={5}
                    onChange={(v) => updateLamp({ yawDeg: v })} />
                  <NumberField label="俯仰 tilt" unit="°" value={selected.tiltDeg} step={5}
                    onChange={(v) => updateLamp({ tiltDeg: v })} />
                  <NumberField label="调光系数" value={selected.dimFactor} step={0.1} min={0} max={1}
                    onChange={(v) => updateLamp({ dimFactor: v })} />
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="small" onClick={() => updateLamp({ enabled: !selected.enabled })}>
                    {selected.enabled ? '停用该灯' : '启用该灯'}
                  </button>
                  <button className="small danger" onClick={deleteLamp}>删除该灯</button>
                </div>
              </>
            )}
          </div>
        </div>

        <div>
          <TunnelViewer project={project} highlightS={viewerS} height={420} />
          <div className="panel" style={{ marginTop: 12, padding: 0 }}>
            <div className="scroll" style={{ maxHeight: 260 }}>
              <table>
                <thead>
                  <tr><th>#</th><th>型号</th><th>桩号(m)</th><th>横向(m)</th><th>高度(m)</th><th>调光</th><th>状态</th></tr>
                </thead>
                <tbody>
                  {project.luminaires.map((l, i) => (
                    <tr
                      key={l.id}
                      style={{ cursor: 'pointer', background: l.id === selectedLampId ? 'rgba(77,163,255,0.12)' : undefined }}
                      onClick={() => { setSelectedLampId(l.id); setViewerS(l.s) }}
                    >
                      <td className="muted">{i + 1}</td>
                      <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>{lampName(l.libraryId)}</td>
                      <td className="mono">{l.s.toFixed(2)}</td>
                      <td className="mono">{l.lateral.toFixed(2)}</td>
                      <td className="mono">{l.height.toFixed(2)}</td>
                      <td className="mono">{l.dimFactor}</td>
                      <td>{l.enabled ? <span className="badge ok">启用</span> : <span className="badge bad">停用</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      {toast.node}
    </div>
  )
}
