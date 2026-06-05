import { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar }                from './Sidebar'
import { BottomNav }              from './BottomNav'
import { AppHeader }              from './AppHeader'
import { PinSetupModal }          from '@/components/shared/PinSetupModal'
import { PopupAnnouncement }      from '@/components/shared/PopupAnnouncement'
import { AnnouncementTicker }     from '@/components/shared/AnnouncementTicker'
import { useAnnouncements }       from '@/hooks/useAnnouncements'
import { useAuthStore }           from '@/store/auth.store'
import { authApi }                from '@/api/auth.api'

export function AppLayout() {
  const user    = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)

  // Refresh user profile from /auth/me on every app load so the store is never
  // stale. The login response historically omitted profile fields (first_name,
  // last_name, phone, etc.) — this call hydrates them after the persisted state
  // is loaded. Silently ignored on network error so the cached store is used.
  useEffect(() => {
    if (!user) return
    authApi.me()
      .then((fresh) => setUser(fresh))
      .catch(() => { /* keep existing store data on network error */ })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Show setup modal once per session if no PIN is configured.
  // "Set up later" hides it for this session; the API will still reject
  // purchases until a PIN is created.
  const [dismissed, setDismissed] = useState(false)
  const showSetup = !!user && !user.has_transaction_pin && !dismissed

  const { data: announcements = [] } = useAnnouncements()
  const popups  = announcements.filter((a) => a.display_type === 'popup')
  const tickers = announcements.filter((a) => a.display_type === 'ticker')

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

        {/* Scrolling ticker — sits flush below the mobile header */}
        {tickers.length > 0 && <AnnouncementTicker items={tickers} />}

        {/* Page content */}
        <main className={`flex-1 px-4 pb-24 md:pt-8 md:pb-8 md:px-8 lg:px-10 xl:px-12 w-full mx-auto md:max-w-5xl lg:max-w-6xl xl:max-w-7xl ${tickers.length > 0 ? 'pt-[80px]' : 'pt-[72px]'}`}>
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

      {/* Popup announcements — rendered above PIN modal so PIN takes precedence */}
      {!showSetup && popups.length > 0 && (
        <PopupAnnouncement announcements={popups} />
      )}
    </div>
  )
}
