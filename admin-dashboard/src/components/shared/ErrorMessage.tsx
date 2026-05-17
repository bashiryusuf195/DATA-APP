import { AlertTriangle, RefreshCw, ServerCrash, Unplug } from 'lucide-react'
import { Button } from '@/components/ui'
import { isAxiosError } from 'axios'
import { cn } from '@/utils/cn'

interface ErrorMessageProps {
  error?: unknown
  onRetry?: () => void
  /** Optional: the endpoint path that failed, shown in 404 messages. */
  endpoint?: string
  /** Render as a compact inline card instead of a centered full-page block. */
  inline?: boolean
  /** Override HTTP status instead of reading it from the Axios error. */
  statusOverride?: number
}

function httpStatus(error: unknown): number | null {
  return isAxiosError(error) ? (error.response?.status ?? null) : null
}

export function ErrorMessage({ error, onRetry, endpoint, inline = false, statusOverride }: ErrorMessageProps) {
  const status = statusOverride ?? httpStatus(error)

  const outer = cn(
    'flex flex-col items-center text-center gap-3',
    inline
      ? 'rounded-xl bg-surface-1 border border-border p-8'
      : 'py-16'
  )

  // ── 404: endpoint does not exist ──────────────────────────────────────────
  if (status === 404) {
    return (
      <div className={outer}>
        <div className="p-3 rounded-xl bg-amber-500/10">
          <Unplug className="h-6 w-6 text-amber-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-ink mb-1">Backend Endpoint Not Available</p>
          <p className="text-xs text-ink-muted max-w-xs">
            {endpoint
              ? <>The backend route <code className="font-mono text-amber-400">{endpoint}</code> has not been implemented yet.</>
              : 'This backend feature is still in development.'}
          </p>
        </div>
        {onRetry && (
          <Button variant="secondary" size="sm" onClick={onRetry} icon={<RefreshCw className="h-3.5 w-3.5" />}>
            Retry
          </Button>
        )}
      </div>
    )
  }

  // ── 5xx: server error ──────────────────────────────────────────────────────
  if (status !== null && status >= 500) {
    return (
      <div className={outer}>
        <div className="p-3 rounded-xl bg-rose-500/10">
          <ServerCrash className="h-6 w-6 text-rose-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-ink mb-1">Server Error ({status})</p>
          <p className="text-xs text-ink-muted max-w-xs">
            The server returned an unexpected error. This may be temporary.
          </p>
        </div>
        {onRetry && (
          <Button variant="secondary" size="sm" onClick={onRetry} icon={<RefreshCw className="h-3.5 w-3.5" />}>
            Retry
          </Button>
        )}
      </div>
    )
  }

  // ── Generic / network error ────────────────────────────────────────────────
  const message = isAxiosError(error)
    ? (error.message ?? 'Request failed.')
    : error instanceof Error
    ? error.message
    : 'Something went wrong. Please try again.'

  return (
    <div className={outer}>
      <AlertTriangle className="h-7 w-7 text-amber-400" />
      <p className="text-sm text-ink-muted max-w-xs">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry} icon={<RefreshCw className="h-3.5 w-3.5" />}>
          Retry
        </Button>
      )}
    </div>
  )
}
