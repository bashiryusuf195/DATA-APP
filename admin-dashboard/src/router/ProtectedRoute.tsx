import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth.store'
import { PageSpinner } from '@/components/ui/Spinner'
import type { ReactNode } from 'react'

export function ProtectedRoute({ children }: { children?: ReactNode }) {
  const token = useAuthStore((s) => s.access_token)
  const hydrated = useAuthStore((s) => s._hasHydrated)

  console.log('[ProtectedRoute] hydrated:', hydrated, '| token:', token ? '[present]' : null)

  // Wait for the persist middleware to read from localStorage before deciding.
  // Without this guard, the first render always sees token=null and bounces
  // the user back to /login even when they have a valid stored session.
  if (!hydrated) return <PageSpinner />

  if (!token) return <Navigate to="/login" replace />

  return <>{children}</>
}
