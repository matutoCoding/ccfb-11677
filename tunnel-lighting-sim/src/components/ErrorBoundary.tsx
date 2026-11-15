import { Component, type ReactNode } from 'react'

interface State {
  hasError: boolean
  message?: string
}

/** 全局错误边界：子组件渲染异常时显示可恢复的提示而不是白屏 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="page" style={{ paddingTop: 60 }}>
          <div className="panel" style={{ maxWidth: 640, margin: '0 auto' }}>
            <h3 style={{ color: 'var(--bad)' }}>页面渲染出错</h3>
            <p className="mono" style={{ wordBreak: 'break-all' }}>{this.state.message}</p>
            <button className="primary" onClick={() => this.setState({ hasError: false })}>
              重试
            </button>
            <button style={{ marginLeft: 10 }} onClick={() => location.reload()}>
              刷新页面
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
