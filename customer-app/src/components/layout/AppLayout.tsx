import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar }       from './Sidebar'
import { BottomNav }     from './BottomNav'
import { AppHeader }     from './AppHeader'
import { PinSetupModal } from '@/components/shared/PinSetupModal'
import { useAuthStore }  from '@/store/auth.store'

export function AppLayout() {
  const user    = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)

  // Show setup modal once per session if no PIN is configured.
  // "Set up later" hides it for this session; the API will still reject
  // purchases until a PIN is created.
  const [dismissed, setDismissed] = useState(false)
  const showSetup = !!user && !user.has_transaction_pin && !dismissed

  // Temporary: log PIN state on every render so we can confirm the value in DevTools
  console.log('[PIN-STATE] user.has_transaction_pin =', user?.has_transaction_pin ?? '(no user)')

  const handlePinSetupSuccess = () => {
    if (user) setUser({ ...user, has_transaction_pin: true })
  }

  return (
    <div className="flex min-h-screen bg-surface-0">
      {/* Desktop sidebar */}
      <Sidebar />

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <AppHeader />

        {/* Page content */}
        <main className="flex-1 px-4 pt-[72px] pb-24 md:pt-8 md:pb-8 md:px-8 max-w-lg w-full mx-auto md:max-w-2xl">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom nav */}
      <BottomNav />

      {/* Mandatory PIN setup — shown once per session until PIN is created */}
      {showSetup && (
        <PinSetupModal
          onSuccess={handlePinSetupSuccess}
          onDismiss={() => setDismissed(true)}
        />
      )}
    </div>
  )
}
