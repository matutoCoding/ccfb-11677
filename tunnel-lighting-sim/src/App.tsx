import { NavLink, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { useAppStore } from './store/appStore'
import ProjectListPage from './pages/ProjectListPage'
import TunnelModelPage from './pages/TunnelModelPage'
import LuminaireLayoutPage from './pages/LuminaireLayoutPage'
import BrightnessPage from './pages/BrightnessPage'
import DrivePage from './pages/DrivePage'
import SettingsPage from './pages/SettingsPage'

const NAV = [
  { to: 'model', label: '隧道建模', icon: '⛰' },
  { to: 'luminaires', label: '灯具布置', icon: '💡' },
  { to: 'brightness', label: '亮度计算', icon: '📊' },
  { to: 'drive', label: '驾驶预览', icon: '🚗' },
  { to: 'settings', label: '设置', icon: '⚙' }
]

function ProjectShell() {
  const { id } = useParams()
  const project = useAppStore((s) => s.projects.find((p) => p.id === id))
  if (!project) return <Navigate to="/" replace />

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <aside
        style={{
          width: 172,
          flexShrink: 0,
          background: 'var(--bg-panel)',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <div style={{ padding: '16px 14px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, color: 'var(--fg-faint)' }}>当前项目</div>
          <div style={{ fontWeight: 700, fontSize: 14, marginTop: 3, lineHeight: 1.35 }}>
            {project.name}
          </div>
          <NavLink to="/" style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none' }}>
            ← 返回项目列表
          </NavLink>
        </div>
        <nav style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={`/project/${id}/${n.to}`}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                padding: '9px 12px',
                borderRadius: 7,
                textDecoration: 'none',
                color: isActive ? '#fff' : 'var(--fg-dim)',
                background: isActive ? 'var(--accent-dim)' : 'transparent',
                fontWeight: isActive ? 600 : 400
              })}
            >
              <span style={{ fontSize: 15 }}>{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--fg-faint)' }}>
          数据保存在本机浏览器
        </div>
      </aside>
      <main style={{ flex: 1, overflow: 'auto' }}>
        <Routes>
          <Route index element={<Navigate to="model" replace />} />
          <Route path="model" element={<TunnelModelPage />} />
          <Route path="luminaires" element={<LuminaireLayoutPage />} />
          <Route path="brightness" element={<BrightnessPage />} />
          <Route path="drive" element={<DrivePage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<ProjectListPage />} />
      <Route path="/project/:id/*" element={<ProjectShell />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
