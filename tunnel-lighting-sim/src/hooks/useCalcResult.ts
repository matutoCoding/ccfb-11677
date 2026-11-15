import { useMemo } from 'react'
import { runCalculation } from '../engine/calculation'
import { useAppStore, useCurrentProject } from '../store/appStore'
import type { CalcResult } from '../types'

/** 计算结果缓存 hook：项目或规范参数变化时自动重算 */
export function useCalcResult(): CalcResult | null {
  const project = useCurrentProject()
  const standards = useAppStore((s) => s.standards)
  const customLuminaires = useAppStore((s) => s.customLuminaires)
  return useMemo(() => {
    if (!project) return null
    return runCalculation(project, { standards, extraLuminaires: customLuminaires })
    // 依赖项目的完整序列化内容，确保灯具/网格设置变更触发重算
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, standards, customLuminaires])
}
