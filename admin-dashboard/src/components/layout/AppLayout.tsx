import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'

export function AppLayout() {
  const location = useLocation()
  const navigate  = useNavigate()

  // Handle deep-link navigation posted by the FCM service worker on notification click
  useEffect(() => {
    function onSwMessage(event: MessageEvent) {
      if (event.data?.type === 'NAVIGATE' && typeof event.data.path === 'string') {
        navigate(event.data.path)
      }
    }
    navigator.serviceWorker?.addEventListener('message', onSwMessage)
    return () => navigator.serviceWorker?.removeEventListener('message', onSwMessage)
  }, [navigate])

  return (
    <div className="flex h-screen bg-surface-0 overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-6">
          {/* Reset the boundary on every navigation so a crashed page doesn't stay crashed */}
          <ErrorBoundary key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  )
}
