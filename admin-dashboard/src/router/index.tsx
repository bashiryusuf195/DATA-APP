import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { ProtectedRoute } from './ProtectedRoute'
import { PlaceholderPage } from '@/components/shared/PlaceholderPage'

import { LoginPage }          from '@/pages/Login'
import { DashboardPage }      from '@/pages/Dashboard'
import { UsersPage }          from '@/pages/Users'
import { LedgerExplorerPage } from '@/pages/LedgerExplorer'
import { FundingPage }        from '@/pages/Funding'
import { RevenuePage }        from '@/pages/Revenue'
import { ProvidersPage }      from '@/pages/Providers'
import { RoutingRulesPage }   from '@/pages/RoutingRules'
import { TransactionsPage }   from '@/pages/Transactions'
import { AttemptsPage }       from '@/pages/Attempts'
import { HealthMetricsPage }  from '@/pages/HealthMetrics'
import { WalletPage }         from '@/pages/Wallets'
import { NotificationsPage }           from '@/pages/Notifications'
import { NotificationTemplatesPage }  from '@/pages/NotificationTemplates'
import { NotificationQueuePage }      from '@/pages/NotificationQueue'
import { BroadcastCenterPage }        from '@/pages/BroadcastCenter'
import { QueueMonitorPage }   from '@/pages/QueueMonitor'
import { FailedJobsPage }     from '@/pages/FailedJobs'
import { WebhookEventsPage }    from '@/pages/WebhookEvents'
import { JournalBatchesPage }   from '@/pages/JournalBatches'
import { AuditLogsPage }        from '@/pages/AuditLogs'
import { RolesPage }            from '@/pages/Roles'
import { SettingsPage }         from '@/pages/Settings'
import { ServicesPage }         from '@/pages/Services'
import { ServicePlansPage }     from '@/pages/ServicePlans'
import { PricingPage }          from '@/pages/Pricing'
import { TicketsPage }              from '@/pages/Tickets'
import { DisputesPage }             from '@/pages/Disputes'
import { ComplaintsPage }           from '@/pages/Complaints'
import { ReconciliationPage }       from '@/pages/Reconciliation'
import { ReconciliationIssuesPage } from '@/pages/ReconciliationIssues'
import { ProviderBalancesPage }     from '@/pages/ProviderBalances'
import { RefundsPage }              from '@/pages/Refunds'
import { ProfitAnalysisPage }       from '@/pages/ProfitAnalysis'
import { NotFoundPage }             from '@/pages/NotFound'

import {
  Globe, Landmark,
  UserCheck, Lock, Gauge, Cpu,
} from 'lucide-react'

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      // ── Overview ───────────────────────────────────────────────────────────
      { path: '/',          element: <Navigate to="/dashboard" replace /> },
      { path: '/dashboard', element: <DashboardPage /> },

      // ── Users ──────────────────────────────────────────────────────────────
      { path: '/users', element: <UsersPage /> },
      { path: '/roles', element: <RolesPage /> },

      // ── Finance (canonical /finance/* routes) ─────────────────────────────
      { path: '/finance/reconciliation-reports', element: <ReconciliationPage /> },
      { path: '/finance/reconciliation-issues',  element: <ReconciliationIssuesPage /> },
      { path: '/finance/revenue',                element: <RevenuePage /> },
      { path: '/finance/provider-balances',      element: <ProviderBalancesPage /> },
      { path: '/finance/profit-analysis',        element: <ProfitAnalysisPage /> },
      { path: '/finance/refunds-reversals',      element: <RefundsPage /> },

      // ── Finance (ledger / journal / funding keep flat paths) ───────────────
      { path: '/ledger',          element: <LedgerExplorerPage /> },
      { path: '/journal-batches', element: <JournalBatchesPage /> },
      { path: '/funding',         element: <FundingPage /> },

      // ── Finance (legacy path redirects so bookmarks keep working) ──────────
      { path: '/refunds',         element: <Navigate to="/finance/refunds-reversals"      replace /> },
      { path: '/revenue',         element: <Navigate to="/finance/revenue"                replace /> },

      // ── Services ───────────────────────────────────────────────────────────
      { path: '/services',       element: <ServicesPage /> },
      { path: '/service-plans',  element: <ServicePlansPage /> },
      { path: '/pricing',        element: <PricingPage /> },
      {
        path: '/service-availability',
        element: (
          <PlaceholderPage
            title="Service Availability"
            subtitle="Monitor and control service uptime per region"
            icon={<Globe className="h-10 w-10" />}
            features={[
              'Real-time availability dashboard',
              'Maintenance window scheduling',
              'Regional availability toggles',
              'Availability history and SLA reports',
            ]}
          />
        ),
      },

      // ── Payments ───────────────────────────────────────────────────────────
      {
        path: '/paystack',
        element: (
          <PlaceholderPage
            title="Paystack Transactions"
            subtitle="Paystack payment gateway transaction history"
            icon={<Landmark className="h-10 w-10" />}
            features={[
              'Full Paystack transaction log',
              'Charge and split history',
              'Dispute and chargeback tracking',
              'Settlement reconciliation',
            ]}
          />
        ),
      },
      { path: '/webhooks', element: <WebhookEventsPage /> },
      {
        path: '/virtual-accounts',
        element: (
          <PlaceholderPage
            title="Virtual Accounts"
            subtitle="Dedicated virtual bank accounts for users"
            icon={<Landmark className="h-10 w-10" />}
            features={[
              'Issue virtual accounts to users',
              'Inbound transfer monitoring',
              'Account assignment and revocation',
              'Balance reconciliation',
            ]}
          />
        ),
      },

      // ── Providers ──────────────────────────────────────────────────────────
      { path: '/providers',      element: <ProvidersPage /> },
      { path: '/routing-rules',  element: <RoutingRulesPage /> },
      { path: '/health-metrics', element: <HealthMetricsPage /> },

      // ── Transactions ───────────────────────────────────────────────────────
      { path: '/transactions', element: <TransactionsPage /> },
      { path: '/attempts',     element: <AttemptsPage /> },

      // ── Security ───────────────────────────────────────────────────────────
      { path: '/audit-logs', element: <AuditLogsPage /> },
      {
        path: '/admin-activity',
        element: (
          <PlaceholderPage
            title="Admin Activity Logs"
            subtitle="Track what admin users have been doing"
            icon={<UserCheck className="h-10 w-10" />}
            features={[
              'Login and logout history',
              'Page and API access log',
              'Bulk action history',
              'Alert on unusual admin behaviour',
            ]}
          />
        ),
      },
      {
        path: '/sessions',
        element: (
          <PlaceholderPage
            title="Sessions"
            subtitle="Active user and admin sessions"
            icon={<Lock className="h-10 w-10" />}
            features={[
              'View all active sessions',
              'Force-revoke sessions',
              'Session device and IP tracking',
              'Concurrent session limits',
            ]}
          />
        ),
      },
      {
        path: '/rate-limits',
        element: (
          <PlaceholderPage
            title="Rate Limits"
            subtitle="API rate limit rules and current usage"
            icon={<Gauge className="h-10 w-10" />}
            features={[
              'Per-user and per-IP rate limit rules',
              'Burst and sustained limit configuration',
              'Real-time limit usage monitoring',
              'Allowlist / denylist management',
            ]}
          />
        ),
      },

      // ── Operations ─────────────────────────────────────────────────────────
      { path: '/queue-monitor',         element: <QueueMonitorPage /> },
      { path: '/failed-jobs',           element: <FailedJobsPage /> },
      { path: '/reconciliation',        element: <Navigate to="/finance/reconciliation-reports" replace /> },
      { path: '/reconciliation-issues', element: <Navigate to="/finance/reconciliation-issues"  replace /> },
      {
        path: '/worker-health',
        element: (
          <PlaceholderPage
            title="Worker Health"
            subtitle="BullMQ worker process health and throughput"
            icon={<Cpu className="h-10 w-10" />}
            features={[
              'Worker process uptime monitoring',
              'Job processing throughput per queue',
              'Memory and CPU usage per worker',
              'Restart and scale workers',
              'Throughput and latency charts',
            ]}
          />
        ),
      },

      // ── Customer Support ───────────────────────────────────────────────────
      { path: '/support/tickets',    element: <TicketsPage /> },
      { path: '/support/disputes',   element: <DisputesPage /> },
      { path: '/support/complaints', element: <ComplaintsPage /> },
      // Legacy flat paths — redirect so bookmarks don't break
      { path: '/tickets',    element: <Navigate to="/support/tickets"    replace /> },
      { path: '/disputes',   element: <Navigate to="/support/disputes"   replace /> },
      { path: '/complaints', element: <Navigate to="/support/complaints" replace /> },
      // ── Communication ──────────────────────────────────────────────────────
      { path: '/communication/notifications', element: <NotificationsPage /> },
      { path: '/communication/templates',     element: <NotificationTemplatesPage /> },
      { path: '/communication/queue',         element: <NotificationQueuePage /> },
      { path: '/communication/broadcasts',    element: <BroadcastCenterPage /> },
      // Legacy paths — redirect so old bookmarks keep working
      { path: '/notifications',          element: <Navigate to="/communication/notifications" replace /> },
      { path: '/notification-templates', element: <Navigate to="/communication/templates"     replace /> },
      { path: '/notification-queue',     element: <Navigate to="/communication/queue"         replace /> },
      { path: '/broadcast',              element: <Navigate to="/communication/broadcasts"    replace /> },

      // ── System ─────────────────────────────────────────────────────────────
      { path: '/wallets',   element: <WalletPage /> },
      { path: '/settings',  element: <SettingsPage /> },

      // ── Catch-all ──────────────────────────────────────────────────────────
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
