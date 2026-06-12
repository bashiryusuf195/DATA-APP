import { useState, useEffect, useCallback } from 'react'
import { Link, ScrollRestoration } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Capacitor } from '@capacitor/core'
import { Sidebar }                from './Sidebar'
import { BottomNav }              from './BottomNav'
import { AppHeader }              from './AppHeader'
import { PinSetupModal }          from '@/components/shared/PinSetupModal'
import { PopupAnnouncement }      from '@/components/shared/PopupAnnouncement'
import { AnnouncementTicker }     from '@/components/shared/AnnouncementTicker'
import { NotificationPromptModal, shouldShowNotificationPrompt, isPushPromptSuppressed } from '@/components/shared/NotificationPromptModal'
import { BiometricPromptModal, isBiometricPromptSuppressed } from '@/components/shared/BiometricPromptModal'
import { SupportWidget }          from '@/components/shared/SupportWidget'
import { OfflineBanner }          from '@/components/shared/OfflineBanner'
import { PwaInstallSheet }        from '@/components/shared/PwaInstallSheet'
import { PageTransition }         from '@/components/shared/PageTransition'
import { PullToRefreshIndicator } from '@/components/shared/PullToRefresh'
import { useAnnouncements }       from '@/hooks/useAnnouncements'
import { useAuthStore }           from '@/store/auth.store'
import { useThemeStore }          from '@/store/theme.store'
import { usePwaInstall }          from '@/hooks/usePwaInstall'
import { usePullToRefresh }       from '@/hooks/usePullToRefresh'
import { usePushNotifications }   from '@/hooks/usePushNotifications'
import { checkNativeBiometricAvailable } from '@/hooks/useBiometricAuth'
import { authApi }                from '@/api/auth.api'

export function AppLayout() {
  const user             = useAuthStore((s) => s.user)
  const setUser          = useAuthStore((s) => s.setUser)
  const biometricEnabled = useAuthStore((s) => s.biometric_enabled)
  const setBalanceHidden = useThemeStore((s) => s.setBalanceHidden)
  const dark             = useThemeStore((s) => s.dark)
  const push             = usePushNotifications()

  // Sync Android status-bar / browser chrome colour with the app theme
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (meta) meta.content = dark ? '#0D1117' : '#ECEEF6'
  }, [dark])

  // Refresh user profile at most once per 5 min — React Query caches the result
  // so repeated AppLayout mounts (navigation back, StrictMode) skip the request.
  const { data: freshUser } = useQuery({
    queryKey: ['auth-me'],
    queryFn:  authApi.me,
    staleTime: 5 * 60 * 1000,
    enabled:  !!user,
  })

  useEffect(() => {
    if (!freshUser) return
    setUser(freshUser)
    if (freshUser.preferences?.balance_hidden !== undefined) {
      setBalanceHidden(freshUser.preferences.balance_hidden as boolean)
    }
  }, [freshUser, setUser, setBalanceHidden])

  // Show setup modal once per session if no PIN is configured.
  // "Set up later" hides it for this session; the API will still reject
  // purchases until a PIN is created.
  const [dismissed, setDismissed] = useState(false)
  const showSetup = !!user && !user.has_transaction_pin && !dismissed

  // ── Biometric onboarding prompt (Android native only) ─────────────────────
  const [showBiometricPrompt, setShowBiometricPrompt] = useState(false)

  useEffect(() => {
    if (!user || !Capacitor.isNativePlatform()) return
    if (isBiometricPromptSuppressed(biometricEnabled)) return
    let cancelled = false
    checkNativeBiometricAvailable().then((available) => {
      if (!cancelled && available) {
        // Slight delay so the prompt doesn't collide with page load animations
        setTimeout(() => setShowBiometricPrompt(true), 2500)
      }
    })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!user, biometricEnabled])

  // ── Push notification onboarding prompt ────────────────────────────────────
  // Web: uses Notification browser API. Native Android: uses push.permission.
  // Re-shown after 30 days if dismissed with "Maybe Later".
  const [showNotifPrompt, setShowNotifPrompt] = useState(false)

  // Compute at render time so the check uses the latest push.permission value
  // (avoids a race where permission resolves to 'granted' after scheduling).
  const pushPromptAllowed = Capacitor.isNativePlatform()
    ? push.permission === 'default' && !isPushPromptSuppressed()
    : shouldShowNotificationPrompt()

  useEffect(() => {
    if (!user) return
    if (!pushPromptAllowed) return
    const t = setTimeout(() => setShowNotifPrompt(true), 3500)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!user, pushPromptAllowed])

  // Pull-to-refresh — invalidates only dashboard-relevant queries so static
  // data (accounts, referral config) and auth-me are not unnecessarily refetched.
  const queryClient  = useQueryClient()
  const handleRefresh = useCallback(
    () => queryClient.invalidateQueries({
      predicate: (q) => {
        const key = q.queryKey[0] as string
        return [
          'wallet-balance', 'wallet-dedicated-account', 'wallet-squad-account',
          'transactions', 'notifications', 'notifications-count',
          'kyc-status', 'service-status', 'announcements-active',
        ].includes(key)
      },
    }),
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

        {/* Scrolling ticker.
            On mobile the AppHeader is position:fixed (z-40), so any in-flow
            sibling at y=0 is hidden behind it.  We therefore make the ticker
            fixed too on mobile (z-30, just below the header) and position it
            flush below the header using the same safe-area-aware calculation.
            On desktop the AppHeader is md:hidden, so the ticker stays in-flow
            at the natural top of the content column (md:static resets it).   */}
        {tickers.length > 0 && (
          <div
            className="fixed inset-x-0 z-30 md:static md:z-auto"
            style={{ top: 'calc(3.5rem + env(safe-area-inset-top, 0px))' }}
          >
            <AnnouncementTicker items={tickers} />
          </div>
        )}

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

      {/* Biometric login onboarding — Android only, after PIN setup */}
      {!showSetup && showBiometricPrompt && (
        <BiometricPromptModal onClose={() => setShowBiometricPrompt(false)} />
      )}

      {/* Push notification onboarding — after biometric prompt */}
      {!showSetup && !showBiometricPrompt && showNotifPrompt && pushPromptAllowed && (
        <NotificationPromptModal onClose={() => setShowNotifPrompt(false)} />
      )}

      {/* PWA install prompt — deferred until higher-priority modals are gone */}
      {!showSetup && !showBiometricPrompt && !showNotifPrompt && showPwaSheet && (
        <PwaInstallSheet
          isIos={pwa.isIos}
          onInstall={pwa.install}
          onDismiss={() => { pwa.dismiss(); setShowPwaSheet(false) }}
          onClose={() => setShowPwaSheet(false)}
        />
      )}

      {/* Floating support widget */}
      <SupportWidget />

      {/* Offline detection banner — fixed at top above header */}
      <OfflineBanner />

      {/* Scroll to top on every route change, restore on back/forward */}
      <ScrollRestoration />
    </div>
  )
}
