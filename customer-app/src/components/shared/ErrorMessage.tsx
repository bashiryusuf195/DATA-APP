import { Button } from '@/components/ui'
import { AlertCircle, RefreshCw, WifiOff } from 'lucide-react'
import { isAxiosError } from 'axios'

interface ErrorMessageProps {
  error?: unknown
  onRetry?: () => void
}

export function ErrorMessage({ error, onRetry }: ErrorMessageProps) {
  const status = isAxiosError(error) ? error.response?.status : null
  const message = isAxiosError(error)
    ? (error.response?.data?.error ?? error.response?.data?.message ?? error.message)
    : error instanceof Error
    ? error.message
    : 'Something went wrong. Please try again.'

  const isNetwork = isAxiosError(error) && !error.response

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="h-14 w-14 rounded-2xl bg-danger-light flex items-center justify-center mb-4">
        {isNetwork ? (
          <WifiOff className="h-7 w-7 text-danger" />
        ) : (
          <AlertCircle className="h-7 w-7 text-danger" />
        )}
      </div>
      <p className="text-sm font-semibold text-ink mb-1">
        {status === 404 ? 'Not Found' : isNetwork ? 'No Connection' : 'Error'}
      </p>
      <p className="text-xs text-ink-muted max-w-xs mb-4">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry} icon={<RefreshCw className="h-4 w-4" />}>
          Retry
        </Button>
      )}
    </div>
  )
}
