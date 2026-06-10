import { useState, useEffect, useCallback } from 'react'
import { Link, ScrollRestoration } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Sidebar }                from './Sidebar'
import { BottomNav }              from './BottomNav'
import { AppHeader }              from './AppHeader'
import { PinSetupModal }          from '@/components/shared/PinSetupModal'
import { PopupAnnouncement }      from '@/components/shared/PopupAnnouncement'
import { AnnouncementTicker }     from '@/components/shared/AnnouncementTicker'
import { NotificationPromptModal, shouldShowNotificationPrompt } from '@/components/shared/NotificationPromptModal'
import { SupportWidget }          from '@/components/shared/SupportWidget'
import { PwaInstallSheet }        from '@/components/shared/PwaInstallSheet'
import { PageTransition }         from '@/components/shared/PageTransition'
import { PullToRefreshIndicator } from '@/components/shared/PullToRefresh'
import { useAnnouncements }       from '@/hooks/useAnnouncements'
import { useAuthStore }           from '@/store/auth.store'
import { useThemeStore }          from '@/store/theme.store'
import { usePwaInstall }          from '@/hooks/usePwaInstall'
import { usePullToRefresh }       from '@/hooks/usePullToRefresh'
import { authApi }                from '@/api/auth.api'

export function AppLayout() {
  const user             = useAuthStore((s) => s.user)
  const setUser          = useAuthStore((s) => s.setUser)
  const setBalanceHidden = useThemeStore((s) => s.setBalanceHidden)
  const dark             = useThemeStore((s) => s.dark)

  // Sync Android status-bar / browser chrome colour with the app theme
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (meta) meta.content = dark ? '#0D1117' : '#ECEEF6'
  }, [dark])

  // Refresh user profile from /auth/me on every app load so the store is never
  // stale. Also syncs balance_hidden preference from the server so the setting
  // persists across devices and after logout/login.
  useEffect(() => {
    if (!user) return
    authApi.me()
      .then((fresh) => {
        setUser(fresh)
        if (fresh.preferences?.balance_hidden !== undefined) {
          setBalanceHidden(fresh.preferences.balance_hidden as boolean)
        }
      })
      .catch(() => { /* keep existing store data on network error */ })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Show setup modal once per session if no PIN is configured.
  // "Set up later" hides it for this session; the API will still reject
  // purchases until a PIN is created.
  const [dismissed, setDismissed] = useState(false)
  const showSetup = !!user && !user.has_transaction_pin && !dismissed

  // Push notification onboarding prompt — shown once on first visit,
  // re-shown after 30 days if dismissed with "Maybe Later".
  const [showNotifPrompt, setShowNotifPrompt] = useState(false)

  useEffect(() => {
    if (!user) return
    if (!shouldShowNotificationPrompt()) return
    // Slight delay so the prompt doesn't collide with page load animations
    const t = setTimeout(() => setShowNotifPrompt(true), 2500)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!user])

  // Pull-to-refresh — invalidates all active queries; disabled until user is loaded
  const queryClient  = useQueryClient()
  const handleRefresh = useCallback(
    () => queryClient.invalidateQueries(),
    [queryClient],
  )
  const { ptrState, distance } = usePullToRefresh(handleRefresh, !!user)

  // PWA install prompt — event listeners registered early so beforeinstallprompt is never missed.
  // Shown 4.5 s after page load, only after second visit, and only if no higher-priority
  // modal (PIN setup, notification prompt) is currently visible.
  const pwa = usePwaInstall()
  const [showPwaSheet, setShowPwaSheet] = useState(false)

  useEffect(() => {
    if (!pwa.shouldShow) return
    const t = setTimeout(() => setShowPwaSheet(true), 4500)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pwa.shouldShow])

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
        <main className={`flex-1 px-4 pb-28 md:pt-8 md:pb-4 md:px-8 lg:px-10 xl:px-12 w-full mx-auto md:max-w-5xl lg:max-w-6xl xl:max-w-7xl ${tickers.length > 0 ? 'app-content-offset-ticker' : 'app-content-offset'}`}>
          <PageTransition />
        </main>

        {/* Desktop legal footer */}
        <footer className="hidden md:flex border-t border-border py-4 px-8 lg:px-10 xl:px-12">
          <div className="w-full flex flex-wrap items-center gap-x-5 gap-y-1">
            <Link to="/about"            className="text-xs text-ink-faint hover:text-ink-muted transition-colors">About</Link>
            <Link to="/contact"          className="text-xs text-ink-faint hover:text-ink-muted transition-colors">Contact</Link>
            <Link to="/privacy-policy"   className="text-xs text-ink-faint hover:text-ink-muted transition-colors">Privacy</Link>
            <Link to="/terms-of-service" className="text-xs text-ink-faint hover:text-ink-muted transition-colors">Terms</Link>
            <Link to="/refund-policy"    className="text-xs text-ink-faint hover:text-ink-muted transition-colors">Refunds</Link>
          </div>
        </footer>
      </div>

      {/* Mobile bottom nav */}
      <BottomNav />

      {/* Pull-to-refresh indicator — mobile only, renders above content below header */}
      <PullToRefreshIndicator ptrState={ptrState} distance={distance} />

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

      {/* Push notification onboarding — only after higher-priority modals are gone */}
      {!showSetup && showNotifPrompt && (
        <NotificationPromptModal onClose={() => setShowNotifPrompt(false)} />
      )}

      {/* PWA install prompt — deferred until higher-priority modals are gone */}
      {!showSetup && !showNotifPrompt && showPwaSheet && (
        <PwaInstallSheet
          isIos={pwa.isIos}
          onInstall={pwa.install}
          onDismiss={() => { pwa.dismiss(); setShowPwaSheet(false) }}
          onClose={() => setShowPwaSheet(false)}
        />
      )}

      {/* Floating support widget */}
      <SupportWidget />

      {/* Scroll to top on every route change, restore on back/forward */}
      <ScrollRestoration />
    </div>
  )
}
