// ── Generic API envelope ───────────────────────────────────────────────────────

export interface ApiList<T> {
  data: T[]
  total?: number
  page?: number
  limit?: number
}

export interface ApiResponse<T> {
  data: T
  message?: string
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export interface User {
  id: string
  email: string
  /** Derived from the roles array — set to the highest-privilege role present. */
  role: 'user' | 'admin' | 'super_admin'
  roles?: string[]
  permissions?: string[]
  status?: string
  kyc_level?: number
  is_email_verified?: boolean
  first_name?: string
  last_name?: string
  created_at?: string
}

export interface AuthTokens {
  access_token: string
  refresh_token: string
  access_token_expires_at?: string
  refresh_token_expires_at?: string
}

/** Exact shape returned by POST /auth/login and POST /auth/register */
export interface BackendAuthResponse {
  success: boolean
  data: {
    user: {
      id: string
      email: string
      status?: string
      kyc_level?: number
      is_email_verified?: boolean
      roles?: string[]
      permissions?: string[]
    }
    tokens: AuthTokens
    session_id: string
  }
}

// ── Providers ─────────────────────────────────────────────────────────────────

export type ProviderHealthStatus = 'healthy' | 'degraded' | 'unhealthy'

export interface Provider {
  id: string
  provider_code: string
  display_name: string
  is_active: boolean
  health_status: ProviderHealthStatus
  priority: number
  supported_services: string[]
  base_url?: string
  created_at: string
  updated_at: string
}

export interface UpdateProviderInput {
  display_name?: string
  is_active?: boolean
  health_status?: ProviderHealthStatus
  priority?: number
  supported_services?: string[]
}

// ── Routing Rules ─────────────────────────────────────────────────────────────

export interface RoutingRule {
  id: string
  service_type: string
  primary_provider_code: string
  fallback_provider_code: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface CreateRoutingRuleInput {
  service_type: string
  primary_provider_code: string
  fallback_provider_code?: string
  is_active?: boolean
}

// ── Transactions ──────────────────────────────────────────────────────────────

export type TransactionStatus = 'pending' | 'processing' | 'successful' | 'failed' | 'refunded'

export interface Transaction {
  id: string
  reference: string
  user_id: string
  service_type: string
  amount: number
  currency: string
  status: TransactionStatus
  provider?: string
  provider_reference?: string
  failure_reason?: string
  metadata?: Record<string, unknown>
  created_at: string
  updated_at: string
}

// ── Funding Transactions ──────────────────────────────────────────────────────

export type FundingStatus = 'pending' | 'successful' | 'failed' | 'abandoned'

export interface FundingTransaction {
  id: string
  user_id: string
  reference: string
  provider_reference?: string
  payment_gateway: string
  amount: number
  currency: string
  status: FundingStatus
  payment_channel?: string
  verified: boolean
  metadata?: Record<string, unknown>
  paid_at?: string
  created_at: string
  updated_at: string
}

// ── Provider Attempts ─────────────────────────────────────────────────────────

export interface ProviderAttempt {
  id: string
  transaction_reference: string
  provider_code: string
  attempt_number: number
  request_payload: Record<string, unknown>
  response_payload: Record<string, unknown>
  success: boolean
  error_message: string | null
  error_classification: string | null
  latency_ms: number | null
  created_at: string
}

// ── Provider Health / Circuit State ───────────────────────────────────────────

export interface ProviderCircuitState {
  id: number
  provider_code: string
  failure_count: number
  success_count: number
  consecutive_failures: number
  last_failure_at: string | null
  last_success_at: string | null
  circuit_open: boolean
  circuit_opened_at: string | null
  created_at: string
  updated_at: string
}

// ── Wallet ────────────────────────────────────────────────────────────────────

export interface WalletBalance {
  wallet_id: string
  user_id: string
  ledger_balance: number
  available_balance: number
  currency: string
}

export interface LedgerEntry {
  id: string
  wallet_id: string
  direction: 'credit' | 'debit'
  amount: number
  currency: string
  description: string
  reference_type: string
  created_at: string
}

// ── Notifications ─────────────────────────────────────────────────────────────

export type NotificationChannel = 'in_app' | 'email' | 'sms' | 'push' | 'webhook'
export type NotificationType = string

export interface Notification {
  id: string
  user_id: string | null
  channel: NotificationChannel
  type: NotificationType
  title: string
  message: string
  read: boolean
  metadata?: Record<string, unknown>
  created_at: string
}

// ── Failed Jobs ───────────────────────────────────────────────────────────────

export interface FailedJob {
  id: string
  queue_name: string
  job_name: string
  reference: string | null
  payload: Record<string, unknown>
  error_message: string
  stack_trace: string | null
  retry_count: number
  created_at: string
}

// ── Webhook Events ────────────────────────────────────────────────────────

export type WebhookEventStatus = 'processed' | 'failed' | 'duplicate' | 'unhandled' | 'pending'

export interface WebhookEvent {
  id: string
  source: string
  event_type: string
  reference?: string | null
  status: WebhookEventStatus
  payload: Record<string, unknown>
  error_message?: string | null
  created_at: string
}

// ── Admin Audit Logs ─────────────────────────────────────────────────────────

export type AuditOutcome = 'success' | 'failure' | 'partial'

export interface AdminAuditLog {
  id: string
  admin_id: string
  admin_email: string | null
  action: string
  description: string
  resource_type: string | null
  resource_id: string | null
  outcome: AuditOutcome
  error_message: string | null
  ip_address: string | null
  user_agent: string | null
  request_id: string | null
  request_method: string | null
  endpoint_path: string | null
  response_status: number | null
  created_at: string
}

export interface AdminAuditLogDetail extends AdminAuditLog {
  old_values: Record<string, unknown>
  new_values: Record<string, unknown>
  request_body: Record<string, unknown> | null
  request_params: Record<string, unknown> | null
  request_query: Record<string, unknown> | null
  metadata: Record<string, unknown>
}

// ── Admin Ledger ──────────────────────────────────────────────────────────────

export interface AdminLedgerEntry {
  id: string
  wallet_id: string
  user_id: string | null
  journal_batch_id: string
  entry_type: 'debit' | 'credit'
  amount: number
  signed_amount: number
  currency: string
  running_balance: number | null
  description: string
  reference_type: string | null
  reference_id: string | null
  created_at: string
}

export interface AdminJournalBatch {
  id: string
  status: string
  description: string
  reference_type: string | null
  reference_id: string | null
  idempotency_key: string | null
  total_credit: number
  total_debit: number
  entry_count: number
  balanced: boolean
  created_at: string
}

export interface AdminJournalBatchDetail {
  id: string
  status: string
  description: string
  reference_type: string | null
  reference_id: string | null
  idempotency_key: string | null
  posted_at: string | null
  reversed_at: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  summary: {
    total_credit: number
    total_debit: number
    net: number
    entry_count: number
    balanced: boolean
  }
  entries: AdminLedgerEntry[]
  linked_transaction: {
    id: string
    reference: string
    type: string
    status: string
    amount: number
    currency: string
  } | null
}

// ── Roles & Permissions ───────────────────────────────────────────────────────

export interface AdminRole {
  id: string
  name: string
  slug: string
  description: string | null
  is_system: boolean
  is_active: boolean
  created_at: string
  updated_at: string
  permission_count: number
  user_count: number
}

export interface PermissionEntry {
  id: string
  action: string
  description: string | null
}

export interface PermissionGroup {
  resource: string
  permissions: PermissionEntry[]
}

export interface UserRole {
  role_id: string
  role_name: string
  role_slug: string
  assigned_at: string
  assigned_by: string | null
  assigned_by_email: string | null
  expires_at: string | null
}

// ── Service Catalog ───────────────────────────────────────────────────────────

export type ServiceType = 'airtime' | 'data' | 'electricity' | 'cable_tv' | 'exam_pin' | 'identity_verification'

export interface CatalogService {
  id: string
  slug: string
  name: string
  service_type: ServiceType
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ServicePlan {
  id: string
  service_id: string
  provider_code: string
  name: string
  variation_code: string
  amount: string        // DECIMAL comes back as string from Postgres
  cost_price: string | null
  selling_price: string | null
  is_variable_amount: boolean
  metadata: Record<string, unknown>
  is_active: boolean
  created_at: string
  updated_at: string
  // provider routing overrides
  primary_provider_code: string | null
  fallback_provider_code: string | null
  provider_variation_code: string | null
  provider_metadata: Record<string, unknown>
  // joined
  service_slug: string
  service_name: string
  service_type: ServiceType
}

export interface CreateServiceInput {
  slug: string
  name: string
  service_type: ServiceType
  is_active?: boolean
}

export interface UpdateServiceInput {
  slug?: string
  name?: string
  service_type?: ServiceType
  is_active?: boolean
}

export interface CreateServicePlanInput {
  service_id: string
  provider_code: string
  name: string
  variation_code: string
  amount: number
  cost_price?: number | null
  selling_price?: number | null
  is_variable_amount?: boolean
  metadata?: Record<string, unknown>
  is_active?: boolean
  primary_provider_code?: string | null
  fallback_provider_code?: string | null
  provider_variation_code?: string | null
  provider_metadata?: Record<string, unknown>
}

export interface UpdateServicePlanInput {
  service_id?: string
  provider_code?: string
  name?: string
  variation_code?: string
  amount?: number
  cost_price?: number | null
  selling_price?: number | null
  is_variable_amount?: boolean
  metadata?: Record<string, unknown>
  is_active?: boolean
  primary_provider_code?: string | null
  fallback_provider_code?: string | null
  provider_variation_code?: string | null
  provider_metadata?: Record<string, unknown>
}

// ── Support Tickets ───────────────────────────────────────────────────────────

export type TicketStatus       = 'open' | 'pending' | 'resolved' | 'closed'
export type TicketPriority     = 'low' | 'medium' | 'high' | 'urgent'
export type TicketCategory     = 'complaint' | 'dispute' | 'inquiry' | 'technical' | 'billing'
export type MessageSenderType  = 'admin' | 'customer' | 'system'

export interface SupportTicket {
  id: string
  reference: string
  user_id: string | null
  user_email: string | null
  transaction_reference: string | null
  subject: string
  description: string | null
  status: TicketStatus
  priority: TicketPriority
  category: TicketCategory | null
  assigned_to: string | null
  assigned_to_email: string | null
  resolution_notes: string | null
  resolved_at: string | null
  closed_at: string | null
  created_at: string
  updated_at: string
}

export interface SupportMessage {
  id: string
  ticket_id: string
  sender_type: MessageSenderType
  sender_id: string | null
  sender_email: string | null
  body: string
  is_internal: boolean
  attachments: unknown[]
  created_at: string
}

export interface SupportTicketDetail extends SupportTicket {
  messages: SupportMessage[]
}

export interface CreateTicketInput {
  user_id?: string | null
  user_email?: string | null
  transaction_reference?: string | null
  subject: string
  description?: string | null
  status?: TicketStatus
  priority?: TicketPriority
  category?: TicketCategory | null
  assigned_to?: string | null
  assigned_to_email?: string | null
}

export interface UpdateTicketInput {
  status?: TicketStatus
  priority?: TicketPriority
  category?: TicketCategory | null
  assigned_to?: string | null
  assigned_to_email?: string | null
  resolution_notes?: string | null
}

export interface AddMessageInput {
  sender_type: MessageSenderType
  sender_id?: string | null
  sender_email?: string | null
  body: string
  is_internal?: boolean
}

// ── Disputes ──────────────────────────────────────────────────────────────────

export type DisputeStatus     = 'open' | 'under_review' | 'escalated' | 'resolved' | 'rejected' | 'closed'
export type DisputeType       = 'wrong_amount' | 'not_delivered' | 'duplicate_charge' | 'unauthorized' | 'provider_error' | 'other'
export type DisputeResolution = 'refund_issued' | 'partial_refund' | 'no_action' | 'provider_credited' | 'rejected'

export interface Dispute {
  id: string
  reference: string
  ticket_id: string | null
  user_id: string | null
  user_email: string | null
  transaction_reference: string | null
  dispute_type: DisputeType
  amount_disputed: string | null   // DECIMAL comes back as string from Postgres
  currency: string
  status: DisputeStatus
  resolution: DisputeResolution | null
  resolution_notes: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
}

export interface CreateDisputeInput {
  ticket_id?: string | null
  user_id?: string | null
  user_email?: string | null
  transaction_reference?: string | null
  dispute_type: DisputeType
  amount_disputed?: number | null
  currency?: string
}

export interface UpdateDisputeInput {
  status?: DisputeStatus
  resolution?: DisputeResolution | null
  resolution_notes?: string | null
  ticket_id?: string | null
}

// ── Settings ──────────────────────────────────────────────────────────────────

export type SettingValueType = 'text' | 'number' | 'boolean' | 'json'

export interface SettingEntry {
  key: string
  value: string | null
  value_type: SettingValueType
  label: string
  description: string | null
  category: string
  is_secret: boolean
  updated_by: string | null
  updated_at: string
}

export interface SettingsByCategory {
  [category: string]: SettingEntry[]
}

export interface EnvironmentInfo {
  node_version: string
  uptime_seconds: number
  memory_mb: { rss: number; heap_used: number; heap_total: number }
  redis_healthy: boolean
  db_healthy: boolean
  env: string
}

// ── Reconciliation ────────────────────────────────────────────────────────────

export type ReconReportStatus = 'pending' | 'running' | 'completed' | 'failed'
export type IssueSeverity     = 'low' | 'medium' | 'high' | 'critical'

export interface ReconciliationReport {
  id: string
  report_type: string
  started_at: string
  completed_at: string | null
  status: ReconReportStatus
  total_checked: number
  total_issues: number
  metadata: Record<string, unknown>
  created_at: string
}

export interface ReconciliationIssue {
  id: string
  report_id: string
  transaction_reference: string | null
  issue_type: string
  severity: IssueSeverity
  description: string
  metadata: Record<string, unknown>
  resolved: boolean
  created_at: string
}

// ── Finance ───────────────────────────────────────────────────────────────────

export interface RevenueSummary {
  total_transactions: number
  successful_count: number
  failed_count: number
  pending_count: number
  total_volume: number
  total_fees: number
  net_volume: number
}

export interface ServiceBreakdown {
  service: string
  count: number
  volume: number
  fees: number
}

export interface DailyTrend {
  date: string
  total: number
  successful: number
  failed: number
  volume: number
  fees: number
}

export interface ProviderBalance {
  provider_code: string
  display_name: string
  is_active: boolean
  total_transactions: number
  successful_count: number
  failed_count: number
  volume_processed: number
  fees_generated: number
  success_rate: number
}

export interface ProfitTotals {
  gross_revenue: number
  total_gmv: number
  transaction_count: number
  avg_fee: number
  avg_transaction_value: number
}

export interface ServiceProfitRow {
  service: string
  count: number
  volume: number
  revenue: number
  margin_pct: number
}

export interface WeeklyTrend {
  week: string
  count: number
  volume: number
  revenue: number
}

export interface Refund {
  id: string
  transaction_id: string
  user_id: string
  wallet_id: string | null
  status: string
  amount: string
  currency: string
  reason: string
  notes: string | null
  requested_by: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  processed_at: string | null
  failure_reason: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  transaction_reference: string | null
  transaction_amount: string | null
  transaction_status: string | null
}

export interface Reversal {
  id: string
  transaction_id: string
  user_id: string
  status: string
  amount: string
  currency: string
  reason: string
  initiated_by: string | null
  processed_at: string | null
  failure_reason: string | null
  provider_reversal_ref: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  transaction_reference: string | null
  transaction_amount: string | null
  transaction_status: string | null
}

// ── Pagination ────────────────────────────────────────────────────────────────

export interface PaginationParams {
  page: number
  limit: number
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
}
