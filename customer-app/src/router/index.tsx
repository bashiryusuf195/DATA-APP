import { lazy } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'

// Layout/infrastructure — kept static so they're always in the initial chunk
import { AppLayout }      from '@/components/layout/AppLayout'
import { AuthLayout }     from '@/components/layout/AuthLayout'
import { LegalLayout }    from '@/pages/legal/LegalLayout'
import { ProtectedRoute } from './ProtectedRoute'
import { RouteError }     from '@/components/shared/RouteError'
import { useAuthStore }   from '@/store/auth.store'

// ── Lazy page chunks ──────────────────────────────────────────────────────────
// Each import() becomes its own JS chunk loaded on-demand. Vite auto-splits
// the 839 KB bundle into ~25 smaller chunks (most < 80 KB). On Android the
// chunks are served from the APK asset store (<50 ms each), so Suspense
// fallbacks are imperceptible. The startup chunk drops to ~250 KB, cutting
// cold-parse time by ~65%.

const LandingPage    = lazy(() => import('@/pages/landing/Landing').then(m => ({ default: m.LandingPage })))
const OnboardingPage = lazy(() => import('@/pages/onboarding/Onboarding').then(m => ({ default: m.OnboardingPage })))

const AboutPage          = lazy(() => import('@/pages/legal/About').then(m => ({ default: m.AboutPage })))
const ContactPage        = lazy(() => import('@/pages/legal/Contact').then(m => ({ default: m.ContactPage })))
const PrivacyPolicyPage  = lazy(() => import('@/pages/legal/PrivacyPolicy').then(m => ({ default: m.PrivacyPolicyPage })))
const TermsOfServicePage = lazy(() => import('@/pages/legal/TermsOfService').then(m => ({ default: m.TermsOfServicePage })))
const RefundPolicyPage   = lazy(() => import('@/pages/legal/RefundPolicy').then(m => ({ default: m.RefundPolicyPage })))

const LoginPage          = lazy(() => import('@/pages/auth/Login').then(m => ({ default: m.LoginPage })))
const RegisterPage       = lazy(() => import('@/pages/auth/Register').then(m => ({ default: m.RegisterPage })))
const ForgotPasswordPage = lazy(() => import('@/pages/auth/ForgotPassword').then(m => ({ default: m.ForgotPasswordPage })))
const ResetPasswordPage  = lazy(() => import('@/pages/auth/ResetPassword').then(m => ({ default: m.ResetPasswordPage })))

const DashboardPage         = lazy(() => import('@/pages/dashboard/Dashboard').then(m => ({ default: m.DashboardPage })))
const WalletPage            = lazy(() => import('@/pages/wallet/Wallet').then(m => ({ default: m.WalletPage })))
const FundWalletPage        = lazy(() => import('@/pages/wallet/FundWallet').then(m => ({ default: m.FundWalletPage })))
const TransactionsPage      = lazy(() => import('@/pages/transactions/Transactions').then(m => ({ default: m.TransactionsPage })))
const TransactionDetailPage = lazy(() => import('@/pages/transactions/TransactionDetail').then(m => ({ default: m.TransactionDetailPage })))
const ServicesPage          = lazy(() => import('@/pages/services/Services').then(m => ({ default: m.ServicesPage })))
const AirtimePage           = lazy(() => import('@/pages/services/Airtime').then(m => ({ default: m.AirtimePage })))
const DataPage              = lazy(() => import('@/pages/services/Data').then(m => ({ default: m.DataPage })))
const ElectricityPage       = lazy(() => import('@/pages/services/Electricity').then(m => ({ default: m.ElectricityPage })))
const CableTvPage           = lazy(() => import('@/pages/services/CableTV').then(m => ({ default: m.CableTvPage })))
const ExamPinPage           = lazy(() => import('@/pages/services/ExamPin').then(m => ({ default: m.ExamPinPage })))
const IdentityPage          = lazy(() => import('@/pages/services/Identity').then(m => ({ default: m.IdentityPage })))
const ProfilePage           = lazy(() => import('@/pages/profile/Profile').then(m => ({ default: m.ProfilePage })))
const EditProfilePage       = lazy(() => import('@/pages/profile/EditProfile').then(m => ({ default: m.EditProfilePage })))
const SettingsPage          = lazy(() => import('@/pages/settings/Settings').then(m => ({ default: m.SettingsPage })))
const NotificationsPage     = lazy(() => import('@/pages/notifications/Notifications').then(m => ({ default: m.NotificationsPage })))
const ReferralsPage         = lazy(() => import('@/pages/referrals/Referrals').then(m => ({ default: m.ReferralsPage })))
const KycPage               = lazy(() => import('@/pages/kyc/Kyc').then(m => ({ default: m.KycPage })))
const SupportPage           = lazy(() => import('@/pages/support/Support').then(m => ({ default: m.SupportPage })))
const NotFoundPage          = lazy(() => import('@/pages/NotFound').then(m => ({ default: m.NotFoundPage })))

// ── Native entry ──────────────────────────────────────────────────────────────
// On Android/iOS skip the web marketing landing page entirely.
// Shows a plain dark screen while Zustand rehydrates from localStorage,
// then immediately navigates to /dashboard (logged in) or /login (logged out).
function NativeEntry() {
  const token    = useAuthStore((s) => s.access_token)
  const hydrated = useAuthStore((s) => s._hasHydrated)
  if (!hydrated) return <div className="min-h-screen bg-[#070B12]" />
  return <Navigate to={token ? '/dashboard' : '/login'} replace />
}

const rootElement = Capacitor.isNativePlatform() ? <NativeEntry /> : <LandingPage />

export const router = createBrowserRouter([
  // ── Public pages ─────────────────────────────────────────────────────────────
  { path: '/',           element: rootElement,         errorElement: <RouteError /> },
  { path: '/onboarding', element: <OnboardingPage />,  errorElement: <RouteError /> },

  // ── Auth ────────────────────────────────────────────────────────────────────
  {
    element:      <AuthLayout />,
    errorElement: <RouteError />,
    children: [
      { path: '/login',           element: <LoginPage /> },
      { path: '/register',        element: <RegisterPage /> },
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
      { path: '/reset-password',  element: <ResetPasswordPage /> },
    ],
  },

  // ── App (protected) ──────────────────────────────────────────────────────────
  {
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    errorElement: <RouteError />,
    children: [
      { path: '/dashboard',     element: <DashboardPage /> },

      { path: '/wallet',        element: <WalletPage /> },
      { path: '/wallet/fund',   element: <FundWalletPage /> },

      { path: '/transactions',            element: <TransactionsPage /> },
      { path: '/transactions/:reference', element: <TransactionDetailPage /> },

      { path: '/services',               element: <ServicesPage /> },
      { path: '/services/airtime',       element: <AirtimePage /> },
      { path: '/services/data',          element: <DataPage /> },
      { path: '/services/electricity',   element: <ElectricityPage /> },
      { path: '/services/cable-tv',      element: <CableTvPage /> },
      { path: '/services/exam-pin',      element: <ExamPinPage /> },
      { path: '/services/identity',      element: <IdentityPage /> },

      { path: '/kyc',            element: <KycPage /> },
      { path: '/profile',        element: <ProfilePage /> },
      { path: '/profile/edit',   element: <EditProfilePage /> },
      { path: '/settings',       element: <SettingsPage /> },
      { path: '/notifications',  element: <NotificationsPage /> },
      { path: '/referrals',      element: <ReferralsPage /> },
      { path: '/support',        element: <SupportPage /> },
    ],
  },

  // ── Legal (public) ───────────────────────────────────────────────────────────
  {
    element:      <LegalLayout />,
    errorElement: <RouteError />,
    children: [
      { path: '/about',            element: <AboutPage /> },
      { path: '/contact',          element: <ContactPage /> },
      { path: '/privacy-policy',   element: <PrivacyPolicyPage /> },
      { path: '/terms-of-service', element: <TermsOfServicePage /> },
      { path: '/refund-policy',    element: <RefundPolicyPage /> },
    ],
  },

  // ── Catch-all ────────────────────────────────────────────────────────────────
  { path: '*', element: <NotFoundPage /> },
])
