import { useEffect, useState } from 'react'

let toastId = 0

/** 全局轻提示（命令式调用 Toast.show('...')） */
export function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2600)
    return () => clearTimeout(t)
  }, [onDone])
  return <div className="toast">{message}</div>
}

export function useToast() {
  const [msg, setMsg] = useState<{ id: number; text: string } | null>(null)
  return {
    show: (text: string) => setMsg({ id: ++toastId, text }),
    node: msg ? <Toast key={msg.id} message={msg.text} onDone={() => setMsg(null)} /> : null
  }
}

/** 数值输入框（受控，空字符串安全处理） */
export function NumberField({
  label,
  value,
  onChange,
  step = 1,
  min,
  max,
  unit,
  disabled
}: {
  label: string
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  max?: number
  unit?: string
  disabled?: boolean
}) {
  return (
    <div className="field">
      <label>
        {label} {unit && <span className="muted">({unit})</span>}
      </label>
      <input
        type="number"
        value={Number.isFinite(value) ? value : ''}
        step={step}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => {
          const v = parseFloat(e.target.value)
          if (Number.isFinite(v)) onChange(v)
        }}
      />
    </div>
  )
}

export function TextField({
  label,
  value,
  onChange
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

/** 伪彩色映射：蓝→青→绿→黄→红（亮度 0..max 对数压缩可选） */
const COLOR_STOPS: Array<[number, [number, number, number]]> = [
  [0.0, [24, 42, 96]],
  [0.2, [32, 110, 180]],
  [0.4, [40, 175, 165]],
  [0.6, [90, 190, 90]],
  [0.75, [225, 205, 70]],
  [0.9, [235, 130, 50]],
  [1.0, [225, 55, 65]]
]

export function falseColor(t: number): string {
  const x = Math.max(0, Math.min(1, t))
  for (let i = 0; i < COLOR_STOPS.length - 1; i++) {
    const [t0, c0] = COLOR_STOPS[i]
    const [t1, c1] = COLOR_STOPS[i + 1]
    if (x <= t1) {
      const k = (x - t0) / (t1 - t0)
      const r = Math.round(c0[0] + (c1[0] - c0[0]) * k)
      const g = Math.round(c0[1] + (c1[1] - c0[1]) * k)
      const b = Math.round(c0[2] + (c1[2] - c0[2]) * k)
      return `rgb(${r},${g},${b})`
    }
  }
  const c = COLOR_STOPS[COLOR_STOPS.length - 1][1]
  return `rgb(${c[0]},${c[1]},${c[2]})`
}

export function downloadBlob(filename: string, content: string, mime = 'text/plain') {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
