export type EndpointStatus = 'available' | 'planned'
export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE'

export interface EndpointEntry {
  path: string
  method: HttpMethod
  status: EndpointStatus
  page: string
  description?: string
}

function ep(
  path: string,
  method: HttpMethod,
  status: EndpointStatus,
  page: string,
  description?: string,
): EndpointEntry {
  return { path, method, status, page, description }
}

// ─── Confirmed working endpoints ──────────────────────────────────────────────
// Only add here when the backend route is tested and returns expected data.

export const ENDPOINTS = {
  // ── Core ─────────────────────────────────────────────────────────────────────
  dashboardMetrics:  ep('/admin/dashboard/metrics',          'GET',  'available', 'Dashboard',
                        'Authoritative platform-wide aggregates'),

  providers:         ep('/admin/providers',               'GET', 'available', 'Providers'),
  routingRules:      ep('/admin/provider-routing-rules',  'GET', 'available', 'Routing Rules'),
  attempts:          ep('/admin/provider-attempts',        'GET', 'available', 'Provider Attempts'),
  healthMetrics:     ep('/admin/provider-health-metrics', 'GET', 'available', 'Health Metrics'),
  fundingTxns:       ep('/admin/funding-transactions',    'GET', 'available', 'Funding'),
  failedJobs:           ep('/admin/failed-jobs',             'GET',  'available', 'Failed Jobs'),
  retryFailedJob:       ep('/admin/failed-jobs/:id/retry', 'POST', 'available', 'Failed Deliveries'),
  paystackTransactions: ep('/admin/funding-transactions',  'GET',  'available', 'Paystack Transactions',
                           'Funding transactions filtered by payment_gateway=paystack'),
  fundingOperations:    ep('/admin/funding-transactions',  'GET',  'available', 'Funding Operations'),
  webhookEvents:       ep('/admin/webhook-events',              'GET', 'available', 'Webhook Events'),
  webhookDiagnostics: ep('/admin/webhook-events/diagnostics', 'GET', 'available', 'Webhook Diagnostics'),
  notifications:     ep('/notifications',                 'GET', 'available', 'Notifications'),
  walletBalance:     ep('/wallet/balance',                'GET', 'available', 'Wallet Monitor'),
  transactions:      ep('/transactions',                  'GET', 'available', 'Transactions'),

  adminUsers:             ep('/admin/users',                   'GET',  'available', 'Users'),

  walletLedger:           ep('/admin/wallet-ledger',           'GET',  'available', 'Ledger Explorer',
                             'Admin-scoped wallet ledger with filtering'),
  auditLogs:              ep('/admin/audit-logs',              'GET',  'available', 'Audit Logs'),
  supportTickets:         ep('/admin/support/tickets',         'GET',  'available', 'Tickets'),
  disputes:               ep('/admin/disputes',                'GET',  'available', 'Disputes'),
  complaints:             ep('/admin/support/tickets',         'GET',  'available', 'Complaints'),
  journalBatches:         ep('/admin/journal-batches',         'GET',  'available', 'Journal Batches'),
  adminServices:          ep('/admin/services',                'GET',  'available', 'Services Catalog'),
  adminServicePlans:      ep('/admin/service-plans',           'GET',  'available', 'Service Plans'),
  roles:                  ep('/admin/roles',                   'GET',  'available', 'Roles & Permissions'),
  permissions:            ep('/admin/permissions',             'GET',  'available', 'Permissions Matrix'),
  settings:               ep('/admin/settings',                'GET',  'available', 'Settings'),
  settingsEnvironment:    ep('/admin/settings/environment',    'GET',  'available', 'Environment Info'),

  // ── Finance (routes confirmed in admin-finance.routes.ts) ────────────────────
  revenueAnalytics:       ep('/admin/finance/revenue-summary', 'GET',  'available', 'Revenue Analytics'),
  refunds:                ep('/admin/finance/refunds',         'GET',  'available', 'Refunds'),

  // ── Reconciliation (routes confirmed in admin-reconciliation.routes.ts) ───────
  reconciliation:         ep('/admin/reconciliation/reports',  'GET',  'available', 'Reconciliation'),
  reconciliationIssues:   ep('/admin/reconciliation/issues',   'GET',  'available', 'Reconciliation Issues'),

  // ── Notifications (broadcast send confirmed in admin-notifications.routes.ts) ─
  broadcast:              ep('/admin/notifications/send',      'POST', 'available', 'Broadcast Notifications'),

  // ── Planned (no backend route implemented yet) ────────────────────────────────
  adminActivity:          ep('/admin/admin-activity',          'GET',  'planned', 'Admin Activity'),
  sessions:               ep('/admin/sessions',                'GET',  'planned', 'Sessions'),
  rateLimits:             ep('/admin/rate-limits',             'GET',  'planned', 'Rate Limits'),
  workerHealth:           ep('/admin/worker-health',           'GET',  'planned', 'Worker Health'),
  services:               ep('/admin/services',                'GET',  'planned', 'Services Catalog'),
  servicePlans:           ep('/admin/service-plans',           'GET',  'planned', 'Service Plans'),
  pricing:                ep('/admin/pricing',                 'GET',  'planned', 'Pricing'),
  serviceAvailability:    ep('/admin/service-availability',    'GET',  'planned', 'Service Availability'),
  paystackTxns:           ep('/admin/paystack-transactions',   'GET',  'planned', 'Paystack Transactions'),
  virtualAccounts:        ep('/admin/virtual-accounts',        'GET',  'planned', 'Virtual Accounts'),
} as const

export type EndpointKey = keyof typeof ENDPOINTS

export const isAvailable = (key: EndpointKey): boolean =>
  ENDPOINTS[key].status === 'available'
