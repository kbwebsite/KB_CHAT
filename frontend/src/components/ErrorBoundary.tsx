import { Component, ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
  // Static node, or a render function receiving the caught error + the
  // React component stack so fallbacks can surface both (one screenshot
  // = diagnosis).
  fallback?: ReactNode | ((error: Error | null, stack?: string | null) => ReactNode)
}
interface State { hasError: boolean; error: Error | null; stack: string | null }

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, stack: null }
  }
  static getDerivedStateFromError(error: Error) { return { hasError: true, error } }
  componentDidCatch(error: Error, info: any) {
    console.error('ErrorBoundary:', error, info)
    try { this.setState({ stack: info?.componentStack || null }) } catch {}
  }
  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return typeof this.props.fallback === 'function'
          ? this.props.fallback(this.state.error, this.state.stack)
          : this.props.fallback
      }
      return (
        <div className="h-screen flex items-center justify-center bg-background p-8">
          <div className="max-w-md w-full text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-8 h-8 text-destructive" />
            </div>
            <h2 className="text-lg font-semibold">Something went wrong</h2>
            <p className="text-sm text-muted-foreground">{this.state.error?.message || 'An unexpected error occurred'}</p>
            <button onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload() }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90">
              <RefreshCw className="w-4 h-4" /> Reload
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
