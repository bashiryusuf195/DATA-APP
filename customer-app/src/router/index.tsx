import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppLayout }  from '@/components/layout/AppLayout'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { ProtectedRoute } from './ProtectedRoute'
import { RouteError } from '@/components/shared/RouteError'

// Auth pages
import { LoginPage }          from '@/pages/auth/Login'
import { RegisterPage }       from '@/pages/auth/Register'
import { ForgotPasswordPage } from '@/pages/auth/ForgotPassword'

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
import { SettingsPage }      from '@/pages/settings/Settings'
import { NotificationsPage } from '@/pages/notifications/Notifications'
import { ReferralsPage }     from '@/pages/referrals/Referrals'
import { NotFoundPage }      from '@/pages/NotFound'
import { KycPage }           from '@/pages/kyc/Kyc'

export const router = createBrowserRouter([
  // ── Auth ────────────────────────────────────────────────────────────────────
  {
    element:      <AuthLayout />,
    errorElement: <RouteError />,
    children: [
      { path: '/login',           element: <LoginPage /> },
      { path: '/register',        element: <RegisterPage /> },
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
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
      { path: '/',              element: <Navigate to="/dashboard" replace /> },
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
      { path: '/settings',       element: <SettingsPage /> },
      { path: '/notifications',  element: <NotificationsPage /> },
      { path: '/referrals',      element: <ReferralsPage /> },
    ],
  },

  // ── Catch-all ────────────────────────────────────────────────────────────────
  { path: '*', element: <NotFoundPage /> },
])
