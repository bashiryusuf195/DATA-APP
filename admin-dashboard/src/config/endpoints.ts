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
  providers:         ep('/admin/providers',               'GET', 'available', 'Providers'),
  routingRules:      ep('/admin/provider-routing-rules',  'GET', 'available', 'Routing Rules'),
  attempts:          ep('/admin/provider-attempts',        'GET', 'available', 'Provider Attempts'),
  healthMetrics:     ep('/admin/provider-health-metrics', 'GET', 'available', 'Health Metrics'),
  fundingTxns:       ep('/admin/funding-transactions',    'GET', 'available', 'Funding'),
  failedJobs:        ep('/admin/failed-jobs',             'GET', 'available', 'Failed Jobs'),
  webhookEvents:     ep('/admin/webhook-events',          'GET', 'available', 'Webhook Events'),
  notifications:     ep('/notifications',                 'GET', 'available', 'Notifications'),
  walletBalance:     ep('/wallet/balance',                'GET', 'available', 'Wallet Monitor'),
  transactions:      ep('/transactions',                  'GET', 'available', 'Transactions'),

  // ─── Planned (backend route not yet implemented) ─────────────────────────
  adminUsers:             ep('/admin/users',                   'GET',  'planned', 'Users'),
  walletLedger:           ep('/wallet/ledger',                 'GET',  'planned', 'Ledger Explorer',
                             'Admin-scoped wallet ledger with filtering'),
  auditLogs:              ep('/admin/audit-logs',              'GET',  'planned', 'Audit Logs'),
  adminActivity:          ep('/admin/admin-activity',          'GET',  'planned', 'Admin Activity'),
  sessions:               ep('/admin/sessions',                'GET',  'planned', 'Sessions'),
  rateLimits:             ep('/admin/rate-limits',             'GET',  'planned', 'Rate Limits'),
  reconciliation:         ep('/admin/reconciliation-reports',  'GET',  'planned', 'Reconciliation'),
  reconciliationIssues:   ep('/admin/reconciliation-issues',   'GET',  'planned', 'Reconciliation Issues'),
  workerHealth:           ep('/admin/worker-health',           'GET',  'planned', 'Worker Health'),
  disputes:               ep('/admin/disputes',                'GET',  'planned', 'Disputes'),
  complaints:             ep('/admin/complaints',              'GET',  'planned', 'Complaints'),
  broadcast:              ep('/admin/broadcast',               'POST', 'planned', 'Broadcast Notifications'),
  journalBatches:         ep('/admin/journal-batches',         'GET',  'planned', 'Journal Batches'),
  refunds:                ep('/admin/refunds',                 'GET',  'planned', 'Refunds'),
  services:               ep('/admin/services',                'GET',  'planned', 'Services Catalog'),
  servicePlans:           ep('/admin/service-plans',           'GET',  'planned', 'Service Plans'),
  pricing:                ep('/admin/pricing',                 'GET',  'planned', 'Pricing'),
  serviceAvailability:    ep('/admin/service-availability',    'GET',  'planned', 'Service Availability'),
  paystackTxns:           ep('/admin/paystack-transactions',   'GET',  'planned', 'Paystack Transactions'),
  virtualAccounts:        ep('/admin/virtual-accounts',        'GET',  'planned', 'Virtual Accounts'),
  roles:                  ep('/admin/roles',                   'GET',  'planned', 'Roles & Permissions'),
  revenueAnalytics:       ep('/admin/revenue/analytics',       'GET',  'planned', 'Revenue Analytics'),
} as const

export type EndpointKey = keyof typeof ENDPOINTS

export const isAvailable = (key: EndpointKey): boolean =>
  ENDPOINTS[key].status === 'available'
