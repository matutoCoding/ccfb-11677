import { useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../store/appStore'
import { downloadBlob, useToast } from '../components/ui'

export default function ProjectListPage() {
  const projects = useAppStore((s) => s.projects)
  const create = useAppStore((s) => s.createProject)
  const duplicate = useAppStore((s) => s.duplicateProject)
  const remove = useAppStore((s) => s.deleteProject)
  const exportProject = useAppStore((s) => s.exportProject)
  const importProject = useAppStore((s) => s.importProject)
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const toast = useToast()

  const handleImport = async (file: File) => {
    try {
      const text = await file.text()
      const id = importProject(text)
      toast.show('项目导入成功')
      navigate(`/project/${id}/model`)
    } catch (e) {
      toast.show(`导入失败：${(e as Error).message}`)
    }
  }

  return (
    <div className="page" style={{ maxWidth: 1050 }}>
      <h1 className="page-title">
        公路隧道照明仿真与驾驶预览系统
        <span className="sub">TypeScript + three.js · 本地数据</span>
      </h1>

      <div className="section-bar">
        <div style={{ fontSize: 15, fontWeight: 600 }}>项目列表（{projects.length}）</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="primary"
            onClick={() => {
              const id = create()
              navigate(`/project/${id}/model`)
            }}
          >
            + 新建项目
          </button>
          <button onClick={() => fileRef.current?.click()}>导入项目</button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleImport(f)
              e.target.value = ''
            }}
          />
        </div>
      </div>

      <div className="panel" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>项目名称</th>
              <th>隧道长度(m)</th>
              <th>设计车速(km/h)</th>
              <th>灯具数</th>
              <th>更新时间</th>
              <th style={{ width: 340 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {projects.length === 0 && (
              <tr>
                <td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 36 }}>
                  暂无项目，点击右上角「新建项目」开始
                </td>
              </tr>
            )}
            {projects.map((p) => (
              <tr key={p.id}>
                <td style={{ fontWeight: 600 }}>{p.name}</td>
                <td className="mono">{p.alignment.length}</td>
                <td className="mono">{p.designSpeedKmh}</td>
                <td className="mono">{p.luminaires.length}</td>
                <td className="muted">{new Date(p.updatedAt).toLocaleString('zh-CN')}</td>
                <td>
                  <div style={{ display: 'flex', gap: 7 }}>
                    <button className="small primary" onClick={() => navigate(`/project/${p.id}/model`)}>
                      打开
                    </button>
                    <button className="small" onClick={() => duplicate(p.id)}>
                      复制
                    </button>
                    <button
                      className="small"
                      onClick={() => downloadBlob(`${p.name}.json`, exportProject(p.id), 'application/json')}
                    >
                      导出
                    </button>
                    <button
                      className="small danger"
                      onClick={() => {
                        if (confirm(`确认删除项目「${p.name}」？此操作不可恢复。`)) remove(p.id)
                      }}
                    >
                      删除
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel" style={{ marginTop: 18 }}>
        <h3>工作流程</h3>
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 2, color: 'var(--fg-dim)' }}>
          <li>新建项目 → 在「隧道建模」设置断面、线形、设计车速与洞外亮度 L20(S)</li>
          <li>「灯具布置」从灯具库选型，按区段间距/高度批量布灯，可逐灯微调，支持 IES 导入</li>
          <li>「亮度计算」查看路面/墙面伪彩图、分区亮度规范对照曲线与眩光 TI 超标段</li>
          <li>「驾驶预览」按设计车速模拟洞外→洞内适应过程</li>
          <li>计算报告可在「亮度计算」页一键导出 CSV</li>
        </ol>
      </div>
      {toast.node}
    </div>
  )
}
