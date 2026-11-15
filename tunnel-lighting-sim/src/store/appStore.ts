import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { LuminaireLibraryItem, TunnelProject } from '../types'
import { createDefaultProject } from '../engine/projectFactory'
import { DEFAULT_STANDARDS, type StandardTables } from '../engine/standards'
import { uid } from '../engine/layout'

interface AppState {
  projects: TunnelProject[]
  currentId: string | null
  /** 用户导入的自定义灯具（IES） */
  customLuminaires: LuminaireLibraryItem[]
  standards: StandardTables
  createProject: (name?: string) => string
  duplicateProject: (id: string) => void
  deleteProject: (id: string) => void
  selectProject: (id: string) => void
  updateProject: (id: string, patch: Partial<TunnelProject>) => void
  importProject: (json: string) => string
  exportProject: (id: string) => string
  addCustomLuminaire: (item: LuminaireLibraryItem) => void
  removeCustomLuminaire: (id: string) => void
  updateStandards: (patch: Partial<StandardTables>) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      projects: [],
      currentId: null,
      customLuminaires: [],
      standards: DEFAULT_STANDARDS,

      createProject: (name) => {
        const p = createDefaultProject(name || `新建隧道项目 ${get().projects.length + 1}`)
        set((s) => ({ projects: [...s.projects, p], currentId: p.id }))
        return p.id
      },

      duplicateProject: (id) => {
        const src = get().projects.find((p) => p.id === id)
        if (!src) return
        const copy: TunnelProject = structuredClone(src)
        copy.id = uid('proj')
        copy.name = `${src.name} - 副本`
        copy.createdAt = Date.now()
        copy.updatedAt = Date.now()
        copy.luminaires = src.luminaires.map((l) => ({ ...l, id: uid('lamp') }))
        copy.zones = src.zones.map((z) => ({ ...z, id: uid('zone') }))
        set((s) => ({ projects: [...s.projects, copy], currentId: copy.id }))
      },

      deleteProject: (id) =>
        set((s) => ({
          projects: s.projects.filter((p) => p.id !== id),
          currentId: s.currentId === id ? null : s.currentId
        })),

      selectProject: (id) => set({ currentId: id }),

      updateProject: (id, patch) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p
          )
        })),

      exportProject: (id) => {
        const p = get().projects.find((x) => x.id === id)
        if (!p) throw new Error('项目不存在')
        return JSON.stringify(
          { format: 'tunnel-lighting-sim', formatVersion: 1, exportedAt: Date.now(), project: p },
          null,
          2
        )
      },

      importProject: (json) => {
        const data = JSON.parse(json)
        const p: TunnelProject = data.project ?? data
        if (!p || !p.alignment || !p.crossSection) throw new Error('文件不是有效的项目数据')
        const imported: TunnelProject = {
          ...structuredClone(p),
          id: uid('proj'),
          name: `${p.name}（导入）`,
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
        set((s) => ({ projects: [...s.projects, imported], currentId: imported.id }))
        // 同时并入自定义灯具
        const existing = new Set(get().customLuminaires.map((l) => l.id))
        const incoming: LuminaireLibraryItem[] = (data.customLuminaires ?? []).filter(
          (l: LuminaireLibraryItem) => !existing.has(l.id)
        )
        if (incoming.length) set((s) => ({ customLuminaires: [...s.customLuminaires, ...incoming] }))
        return imported.id
      },

      addCustomLuminaire: (item) =>
        set((s) => ({ customLuminaires: [...s.customLuminaires, item] })),

      removeCustomLuminaire: (id) =>
        set((s) => ({ customLuminaires: s.customLuminaires.filter((l) => l.id !== id) })),

      updateStandards: (patch) =>
        set((s) => ({ standards: { ...s.standards, ...patch } }))
    }),
    { name: 'tunnel-lighting-sim-store-v1' }
  )
)

/** 当前项目的便捷选择器 */
export function useCurrentProject(): TunnelProject | null {
  return useAppStore((s) => s.projects.find((p) => p.id === s.currentId) ?? null)
}
