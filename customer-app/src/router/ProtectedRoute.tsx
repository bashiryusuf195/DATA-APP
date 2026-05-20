import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth.store'
import { Spinner } from '@/components/ui'
import type { ReactNode } from 'react'

export function ProtectedRoute({ children }: { children?: ReactNode }) {
  const token    = useAuthStore((s) => s.access_token)
  const hydrated = useAuthStore((s) => s._hasHydrated)

  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-0">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!token) return <Navigate to="/login" replace />

  return <>{children}</>
}
