import { createBrowserRouter, Navigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { AppLayout }  from '@/components/layout/AppLayout'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { ProtectedRoute } from './ProtectedRoute'
import { RouteError } from '@/components/shared/RouteError'
import { useAuthStore } from '@/store/auth.store'

// Public pages
import { LandingPage }    from '@/pages/landing/Landing'
import { OnboardingPage } from '@/pages/onboarding/Onboarding'

// On native (Android/iOS) skip the web marketing landing page entirely.
// Show a plain dark screen while Zustand rehydrates from localStorage,
// then immediately navigate to /dashboard (logged in) or /login (logged out).
function NativeEntry() {
  const token    = useAuthStore((s) => s.access_token)
  const hydrated = useAuthStore((s) => s._hasHydrated)
  if (!hydrated) return <div className="min-h-screen bg-[#070B12]" />
  return <Navigate to={token ? '/dashboard' : '/login'} replace />
}

const rootElement = Capacitor.isNativePlatform() ? <NativeEntry /> : <LandingPage />

// Legal pages
import { LegalLayout }        from '@/pages/legal/LegalLayout'
import { AboutPage }          from '@/pages/legal/About'
import { ContactPage }        from '@/pages/legal/Contact'
import { PrivacyPolicyPage }  from '@/pages/legal/PrivacyPolicy'
import { TermsOfServicePage } from '@/pages/legal/TermsOfService'
import { RefundPolicyPage }   from '@/pages/legal/RefundPolicy'

// Auth pages
import { LoginPage }          from '@/pages/auth/Login'
import { RegisterPage }       from '@/pages/auth/Register'
import { ForgotPasswordPage }  from '@/pages/auth/ForgotPassword'
import { ResetPasswordPage }   from '@/pages/auth/ResetPassword'

// App pages
import { DashboardPage }     from '@/pages/dashboard/Dashboard'
import { WalletPage }        from '@/pages/wallet/Wallet'
import { FundWalletPage }    from '@/pages/wallet/FundWallet'
import { TransactionsPage }  from '@/pages/transactions/Transactions'
import { TransactionDetailPage } from '@/pages/transactions/TransactionDetail'
import { ServicesPage }      from '@/pages/services/Services'
import { AirtimePage }       from '@/pages/services/Airtime'
import { DataPage }          from '@/pages/services/Data'
import { ElectricityPage }   from '@/pages/services/Electricity'
import { CableTvPage }       from '@/pages/services/CableTV'
import { ExamPinPage }       from '@/pages/services/ExamPin'
import { IdentityPage }      from '@/pages/services/Identity'
import { ProfilePage }       from '@/pages/profile/Profile'
import { EditProfilePage }   from '@/pages/profile/EditProfile'
import { SettingsPage }      from '@/pages/settings/Settings'
import { NotificationsPage } from '@/pages/notifications/Notifications'
import { ReferralsPage }     from '@/pages/referrals/Referrals'
import { NotFoundPage }      from '@/pages/NotFound'
import { KycPage }           from '@/pages/kyc/Kyc'
import { SupportPage }       from '@/pages/support/Support'

export const router = createBrowserRouter([
  // ── Public pages ─────────────────────────────────────────────────────────────
  { path: '/',           element: rootElement,         errorElement: <RouteError /> },
  { path: '/onboarding', element: <OnboardingPage />, errorElement: <RouteError /> },

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

      // Wallet
      { path: '/wallet',        element: <WalletPage /> },
      { path: '/wallet/fund',   element: <FundWalletPage /> },

      // Transactions
      { path: '/transactions',            element: <TransactionsPage /> },
      { path: '/transactions/:reference', element: <TransactionDetailPage /> },

      // Services hub
      { path: '/services',               element: <ServicesPage /> },
      { path: '/services/airtime',       element: <AirtimePage /> },
      { path: '/services/data',          element: <DataPage /> },
      { path: '/services/electricity',   element: <ElectricityPage /> },
      { path: '/services/cable-tv',      element: <CableTvPage /> },
      { path: '/services/exam-pin',      element: <ExamPinPage /> },
      { path: '/services/identity',      element: <IdentityPage /> },

      // Profile & account
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
      { path: '/about',           element: <AboutPage /> },
      { path: '/contact',         element: <ContactPage /> },
      { path: '/privacy-policy',  element: <PrivacyPolicyPage /> },
      { path: '/terms-of-service', element: <TermsOfServicePage /> },
      { path: '/refund-policy',   element: <RefundPolicyPage /> },
    ],
  },

  // ── Catch-all ────────────────────────────────────────────────────────────────
  { path: '*', element: <NotFoundPage /> },
])
