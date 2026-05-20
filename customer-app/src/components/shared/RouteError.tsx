import { useRouteError, isRouteErrorResponse, Link } from 'react-router-dom'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui'

// Button does not support an `as` prop — navigate via Link wrapper instead.

export function RouteError() {
  const error = useRouteError()

  let heading = 'Something went wrong'
  let detail  = 'An unexpected error occurred. Please try refreshing the page.'

  if (isRouteErrorResponse(error)) {
    heading = error.status === 404 ? 'Page not found' : `Error ${error.status}`
    detail  = error.statusText || detail
  } else if (error instanceof Error) {
    detail = error.message
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-0 px-4">
      <div className="text-center max-w-sm">
        <div className="h-16 w-16 rounded-2xl bg-danger-light flex items-center justify-center mx-auto mb-5">
          <AlertCircle className="h-8 w-8 text-danger" />
        </div>
        <h1 className="text-xl font-bold text-ink mb-2">{heading}</h1>
        <p className="text-sm text-ink-muted mb-6">{detail}</p>
        <div className="flex gap-3 justify-center">
          <Button variant="outline" onClick={() => window.location.reload()}>
            Refresh page
          </Button>
          <Link to="/dashboard">
            <Button>Go home</Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
