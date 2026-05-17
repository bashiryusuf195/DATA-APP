import { Link } from 'react-router-dom'
import { Button } from '@/components/ui'
import { Home, Compass } from 'lucide-react'

export function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div className="mb-4 p-4 rounded-full bg-surface-2">
        <Compass className="h-10 w-10 text-ink-faint" />
      </div>
      <h1 className="text-4xl font-bold text-ink mb-2">404</h1>
      <p className="text-sm text-ink-muted mb-6">This page doesn't exist.</p>
      <Link to="/">
        <Button icon={<Home className="h-3.5 w-3.5" />}>Back to Dashboard</Button>
      </Link>
    </div>
  )
}
