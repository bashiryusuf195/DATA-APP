import { useNavigate } from 'react-router-dom'
import { Home, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui'

export function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-0 px-4">
      <div className="text-center max-w-sm">
        <p className="text-7xl font-bold text-brand-600 mb-4">404</p>
        <p className="text-xl font-semibold text-ink mb-2">Page not found</p>
        <p className="text-sm text-ink-muted mb-8">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button variant="outline" onClick={() => navigate(-1)} className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" /> Go back
          </Button>
          <Button onClick={() => navigate('/dashboard')} className="flex items-center gap-2">
            <Home className="h-4 w-4" /> Home
          </Button>
        </div>
      </div>
    </div>
  )
}
