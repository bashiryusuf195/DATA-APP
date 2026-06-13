import { Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Sentry } from '@/lib/sentry'
import { Button } from '@/components/ui'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
    Sentry.captureException(error, {
      contexts: { react: { componentStack: info.componentStack } },
    })
  }

  reset = () => this.setState({ hasError: false, error: null })

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div className="flex flex-col items-center justify-center text-center py-20 px-6 gap-4">
          <div className="p-4 rounded-2xl bg-rose-500/10">
            <AlertTriangle className="h-8 w-8 text-rose-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-ink mb-1">Something went wrong</p>
            <p className="text-xs text-ink-muted max-w-xs">
              {this.state.error?.message ?? 'An unexpected render error occurred.'}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            icon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={this.reset}
          >
            Try again
          </Button>
        </div>
      )
    }

    return this.props.children
  }
}

/** Thin wrapper for use around individual page content sections. */
export function PageErrorBoundary({ children }: { children: ReactNode }) {
  return <ErrorBoundary>{children}</ErrorBoundary>
}
