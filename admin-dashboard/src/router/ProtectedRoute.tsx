import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth.store'
import { PageSpinner } from '@/components/ui/Spinner'
import { ShieldOff } from 'lucide-react'
import type { ReactNode } from 'react'

function AccessDenied() {
  const clearAuth = useAuthStore((s) => s.clearAuth)
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-0">
      <div className="flex flex-col items-center gap-4 text-center max-w-sm p-8">
        <div className="p-4 rounded-2xl bg-rose-500/10">
          <ShieldOff className="h-8 w-8 text-rose-400" />
        </div>
        <div>
          <p className="text-base font-semibold text-ink mb-1">Access Denied</p>
          <p className="text-sm text-ink-muted">
            Your account does not have admin privileges. Contact a super administrator if you need access.
          </p>
        </div>
        <button
          onClick={() => { clearAuth(); window.location.href = '/login' }}
          className="text-sm text-accent hover:underline"
        >
          Sign out and return to login
        </button>
      </div>
    </div>
  )
}

export function ProtectedRoute({ children }: { children?: ReactNode }) {
  const token    = useAuthStore((s) => s.access_token)
  const hydrated = useAuthStore((s) => s._hasHydrated)
  const isAdmin  = useAuthStore((s) => s.isAdmin())

  if (!hydrated) return <PageSpinner />
  if (!token)    return <Navigate to="/login" replace />
  if (!isAdmin)  return <AccessDenied />

  return <>{children}</>
}
