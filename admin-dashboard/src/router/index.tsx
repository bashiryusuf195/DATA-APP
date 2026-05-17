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
import { NotificationsPage }  from '@/pages/Notifications'
import { QueueMonitorPage }   from '@/pages/QueueMonitor'
import { FailedJobsPage }     from '@/pages/FailedJobs'
import { WebhookEventsPage }    from '@/pages/WebhookEvents'
import { JournalBatchesPage }   from '@/pages/JournalBatches'
import { AuditLogsPage }        from '@/pages/AuditLogs'
import { RolesPage }            from '@/pages/Roles'
import { SettingsPage }         from '@/pages/Settings'
import { NotFoundPage }         from '@/pages/NotFound'

import {
  Tag, Globe, Landmark,
  UserCheck, Lock, Gauge, Scale, Cpu, MessageSquare, Flag, Megaphone,
  RotateCcw, Package, List, AlertTriangle,
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

      // ── Finance ────────────────────────────────────────────────────────────
      { path: '/ledger',           element: <LedgerExplorerPage /> },
      { path: '/journal-batches', element: <JournalBatchesPage /> },
      { path: '/funding', element: <FundingPage /> },
      {
        path: '/refunds',
        element: (
          <PlaceholderPage
            title="Refunds & Reversals"
            subtitle="Manage transaction refunds and account reversals"
            icon={<RotateCcw className="h-10 w-10" />}
            features={[
              'Initiate full and partial refunds',
              'Automated reversal for failed debits',
              'Refund approval queue',
              'Refund status tracking',
              'Provider-level reversal support',
            ]}
          />
        ),
      },
      { path: '/revenue', element: <RevenuePage /> },

      // ── Services ───────────────────────────────────────────────────────────
      {
        path: '/services',
        element: (
          <PlaceholderPage
            title="Services Catalog"
            subtitle="Manage VTU services offered on the platform"
            icon={<Package className="h-10 w-10" />}
            features={[
              'Add and configure service types',
              'Enable / disable per service',
              'Service metadata and descriptions',
              'Provider-to-service mapping',
            ]}
          />
        ),
      },
      {
        path: '/service-plans',
        element: (
          <PlaceholderPage
            title="Service Plans"
            subtitle="Data plans, cable bouquets and electricity token types"
            icon={<List className="h-10 w-10" />}
            features={[
              'Import plans from providers',
              'Custom plan creation',
              'Plan availability toggle',
              'Plan metadata and descriptions',
            ]}
          />
        ),
      },
      {
        path: '/pricing',
        element: (
          <PlaceholderPage
            title="Pricing"
            subtitle="Service pricing, margins and fee configuration"
            icon={<Tag className="h-10 w-10" />}
            features={[
              'Set markup percentages per service',
              'User-tier based pricing',
              'Promotional pricing windows',
              'Fee transparency configuration',
            ]}
          />
        ),
      },
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
      { path: '/queue-monitor', element: <QueueMonitorPage /> },
      { path: '/failed-jobs',   element: <FailedJobsPage /> },
      {
        path: '/reconciliation',
        element: (
          <PlaceholderPage
            title="Reconciliation Reports"
            subtitle="Match platform records against provider statements"
            icon={<Scale className="h-10 w-10" />}
            features={[
              'Automated daily reconciliation runs',
              'Provider statement import',
              'Discrepancy detection and alerting',
              'Manual match and override',
              'Export reconciliation certificates',
            ]}
          />
        ),
      },
      {
        path: '/reconciliation-issues',
        element: (
          <PlaceholderPage
            title="Reconciliation Issues"
            subtitle="Unresolved discrepancies requiring investigation"
            icon={<AlertTriangle className="h-10 w-10" />}
            features={[
              'Open issue queue',
              'Assign issues to team members',
              'Resolution workflow and notes',
              'Auto-close on reconciliation pass',
            ]}
          />
        ),
      },
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

      // ── Support ────────────────────────────────────────────────────────────
      {
        path: '/disputes',
        element: (
          <PlaceholderPage
            title="Disputes"
            subtitle="User-raised transaction disputes and resolutions"
            icon={<MessageSquare className="h-10 w-10" />}
            features={[
              'Dispute submission and tracking',
              'Link disputes to transactions',
              'Resolution workflow with SLA',
              'Automated refund on resolution',
              'Dispute analytics and trends',
            ]}
          />
        ),
      },
      {
        path: '/complaints',
        element: (
          <PlaceholderPage
            title="Complaints"
            subtitle="General user complaints and support tickets"
            icon={<Flag className="h-10 w-10" />}
            features={[
              'Complaint intake and triage',
              'Assign to support agents',
              'SLA tracking and escalation',
              'Resolution notes and history',
              'NPS and satisfaction scoring',
            ]}
          />
        ),
      },
      {
        path: '/broadcast',
        element: (
          <PlaceholderPage
            title="Broadcast Notifications"
            subtitle="Send system-wide messages to users"
            icon={<Megaphone className="h-10 w-10" />}
            features={[
              'Send to all users or targeted segments',
              'In-app, email and SMS channels',
              'Scheduled and recurring broadcasts',
              'Delivery and open rate analytics',
              'Template library',
            ]}
          />
        ),
      },

      // ── System ─────────────────────────────────────────────────────────────
      { path: '/wallets',       element: <WalletPage /> },
      { path: '/notifications', element: <NotificationsPage /> },
      { path: '/settings',      element: <SettingsPage /> },

      // ── Catch-all ──────────────────────────────────────────────────────────
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
