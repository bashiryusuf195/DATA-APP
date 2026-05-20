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
  /** Display name — matches the `name` column returned by GET /admin/providers */
  name: string
  is_active: boolean
  health_status: ProviderHealthStatus
  priority: number
  supported_services: string[]
  base_url?: string
  created_at: string
  updated_at: string
}

export interface UpdateProviderInput {
  name?: string
  is_active?: boolean
  health_status?: ProviderHealthStatus
  priority?: number
  supported_services?: string[]
}

// ── API Integrations (provider registry) ─────────────────────────────────────

/** Shape returned by GET /admin/providers (list) — joined config + credential status */
export interface ProviderRegistryRow {
  id: string
  provider_code: string
  name: string
  is_active: boolean
  priority: number
  supported_services: string[]
  health_status: string
  notes: string | null
  config_metadata: Record<string, unknown>
  has_credentials: boolean
  // Credential presence flags (false when no credentials row exists)
  has_api_key: boolean
  has_secret_key: boolean
  has_username: boolean
  has_password: boolean
  has_bearer_token: boolean
  has_webhook_secret: boolean
  has_custom_headers: boolean
  // Credential meta (null when no credentials row)
  base_url: string | null
  is_live: boolean | null
  auth_type: string | null
  created_at: string
  updated_at: string
}

/** Shape returned by GET /admin/providers/:code — includes safe credentials */
export interface ProviderRegistryDetail extends ProviderRegistryRow {
  credentials: SafeProviderCredentials | null
}

export interface SafeProviderCredentials {
  id: string
  provider_code: string
  base_url: string | null
  auth_type: string
  is_live: boolean
  has_api_key: boolean
  has_secret_key: boolean
  has_username: boolean
  has_password: boolean
  has_bearer_token: boolean
  has_webhook_secret: boolean
  has_custom_headers: boolean
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface CreateProviderInput {
  provider_code: string
  name: string
  is_active?: boolean
  priority?: number
  supported_services?: string[]
  notes?: string | null
  metadata?: Record<string, unknown>
}

export interface UpdateProviderRegistryInput {
  name?: string
  is_active?: boolean
  priority?: number
  supported_services?: string[]
  notes?: string | null
  metadata?: Record<string, unknown>
}

export type ProviderAuthType =
  | 'api_key'
  | 'api_key_secret'
  | 'bearer_token'
  | 'username_password'
  | 'custom_headers'
  | 'none'
  | 'advanced'

export interface UpsertProviderCredentialsInput {
  auth_type?: ProviderAuthType
  base_url?: string | null
  api_key?: string | null
  secret_key?: string | null
  username?: string | null
  password?: string | null
  bearer_token?: string | null
  webhook_secret?: string | null
  custom_headers?: string | null
  is_live?: boolean
  metadata?: Record<string, unknown>
}

// ── Provider Wallets ──────────────────────────────────────────────────────────

export type BalanceCheckStatus = 'ok' | 'low' | 'unknown' | 'error'

export interface ProviderWallet {
  id: string | null
  provider_code: string
  name: string
  is_active: boolean
  supported_services: string[]
  health_status: string
  priority: number
  base_url: string | null
  is_live: boolean | null
  funding_bank_name: string | null
  funding_account_number: string | null
  funding_account_name: string | null
  wallet_balance: string | null
  balance_currency: string
  low_balance_threshold: string | null
  last_balance_check_at: string | null
  balance_check_status: BalanceCheckStatus
  balance_check_message: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface UpdateProviderWalletInput {
  funding_bank_name?: string | null
  funding_account_number?: string | null
  funding_account_name?: string | null
  low_balance_threshold?: number | null
  notes?: string | null
}

export interface ManualBalanceUpdateInput {
  balance: number
  currency?: string
  notes?: string | null
}

export interface BalanceCheckResult {
  provider_code: string
  supported: boolean
  balance: number | null
  currency: string
  message: string
  status: BalanceCheckStatus
  checked_at: string
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
  fallback_provider_code?: string | null
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
  status: string
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
  event_type: string | null
  reference?: string | null
  status: WebhookEventStatus
  signature_valid: boolean
  payload: Record<string, unknown>
  error_message?: string | null
  processed_at?: string | null
  created_at: string
}

// ── Webhook Diagnostics ───────────────────────────────────────────────────────

export interface WebhookLastEvent {
  id: string
  event_type: string | null
  transaction_reference: string | null
  signature_valid: boolean
  processed: boolean
  created_at: string
  processed_at: string | null
}

export interface WebhookProcessingError {
  error_message: string
  failed_at: string
  reference: string | null
}

export interface WebhookDiagnostics {
  webhook_url_path:       string
  total_events:           number
  total_today:            number
  processed_today:        number
  invalid_sig_today:      number
  last_event:             WebhookLastEvent | null
  last_invalid_signature: WebhookLastEvent | null
  last_processing_error:  WebhookProcessingError | null
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
  network_operator: string | null
  plan_category: string | null
  duration_days: number | null
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
  network_operator?: string | null
  plan_category?: string | null
  duration_days?: number | null
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
  network_operator?: string | null
  plan_category?: string | null
  duration_days?: number | null
  primary_provider_code?: string | null
  fallback_provider_code?: string | null
  provider_variation_code?: string | null
  provider_metadata?: Record<string, unknown>
}

export interface BulkTogglePlansInput {
  service_id?: string
  service_type?: ServiceType
  network_operator?: string
  plan_category?: string
  is_active: boolean
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

// ── Notification System ───────────────────────────────────────────────────────

export type NotificationJobChannel = 'email' | 'sms' | 'push' | 'in_app' | 'broadcast'
export type NotificationJobStatus = 'pending' | 'processing' | 'sent' | 'failed' | 'cancelled'
export type NotificationRecipientType = 'user' | 'all' | 'segment'

export interface NotificationTemplate {
  id: string
  name: string
  type: string
  notification_type: string
  subject: string | null
  body: string
  variables: string[]
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface NotificationJob {
  id: string
  type: NotificationJobChannel
  notification_type: string
  recipient_type: NotificationRecipientType
  recipient_id: string | null
  recipient_email: string | null
  recipient_phone: string | null
  recipient_user_email: string | null
  recipient_name: string | null
  subject: string | null
  body: string
  status: NotificationJobStatus
  retry_count: number
  max_retries: number
  scheduled_at: string | null
  processed_at: string | null
  failed_at: string | null
  failure_reason: string | null
  template_id: string | null
  metadata: Record<string, unknown>
  idempotency_key: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface NotificationJobStats {
  pending:    number
  processing: number
  sent:       number
  failed:     number
  cancelled:  number
}

// ── KYC / Compliance / Risk ────────────────────────────────────────────────────

export type KycLevel = 'none' | 'tier_1' | 'tier_2' | 'tier_3'
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'
export type FlagType = 'suspicious_volume' | 'duplicate_funding' | 'fraud_suspected' | 'chargeback_risk' | 'account_takeover' | 'manual_review'
export type FlagSeverity = 'low' | 'medium' | 'high' | 'critical'
export type FlagStatus = 'open' | 'investigating' | 'resolved' | 'dismissed'
export type BlacklistEntityType = 'user' | 'email' | 'phone' | 'bvn' | 'nin' | 'ip' | 'card'

export interface KycUser {
  id: string
  email: string
  phone: string | null
  username: string | null
  status: string
  kyc_level: KycLevel
  created_at: string
  first_name: string | null
  last_name: string | null
  user_name: string
  bvn: string | null
  nin: string | null
  bvn_verified: boolean
  nin_verified: boolean
  risk_score: number | null
  risk_level: RiskLevel | null
}

export interface KycStats {
  total_users: number
  verified_tier1: number
  verified_tier2: number
  verified_tier3: number
  pending: number
  bvn_verified: number
  nin_verified: number
}

export interface KycVerification {
  id: string
  user_id: string | null
  verification_type: string
  status: string
  provider: string | null
  provider_ref: string | null
  verified_at: string | null
  failure_reason: string | null
  initiated_by: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
  email: string | null
  phone: string | null
  username: string | null
  user_name: string | null
}

export interface RiskFlag {
  id: string
  user_id: string | null
  flag_type: FlagType
  severity: FlagSeverity
  status: FlagStatus
  title: string
  description: string | null
  evidence: Record<string, unknown>
  transaction_ref: string | null
  flagged_by: string | null
  assigned_to: string | null
  resolved_by: string | null
  resolved_at: string | null
  resolution_notes: string | null
  created_at: string
  updated_at: string
  email: string | null
  phone: string | null
  username: string | null
  user_name: string | null
}

export interface RiskFlagStats {
  open: number
  investigating: number
  resolved: number
  dismissed: number
  critical: number
  high: number
}

export interface ComplianceReport {
  id: string
  report_type: string
  title: string
  period_start: string | null
  period_end: string | null
  summary: string | null
  status: string
  generated_by: string | null
  created_at: string
  updated_at: string
}

export interface BlacklistEntry {
  id: string
  entity_type: BlacklistEntityType
  entity_value: string
  reason: string
  notes: string | null
  added_by: string | null
  removed_by: string | null
  removed_at: string | null
  is_active: boolean
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface FrozenAccount {
  id: string
  email: string
  phone: string | null
  username: string | null
  status: string
  kyc_level: KycLevel
  frozen_at: string | null
  frozen_by: string | null
  frozen_reason: string | null
  created_at: string
  updated_at: string
  first_name?: string | null
  last_name?: string | null
  user_name?: string | null
}

// ── Dashboard Metrics ─────────────────────────────────────────────────────────

export interface DashboardMetrics {
  users: {
    total: number
    active: number
    suspended: number
    new_today: number
  }
  wallets: {
    total: number
    total_balance: number
  }
  transactions: {
    total: number
    successful: number
    failed: number
    pending: number
    total_volume: number
    purchase_volume: number
    today_count: number
    today_successful_volume: number
    recent_failed_24h: number
  }
  funding: {
    total_volume: number
    total_count: number
    successful_count: number
  }
  providers: {
    overall_success_rate: number
    total_attempts: number
  }
  refunds: {
    total: number
    total_amount: number
  }
  support: {
    open_tickets: number
    pending_tickets: number
  }
  generated_at: string
}

// ── Service Availability Group Controls ───────────────────────────────────────

export interface GroupSummaryRow {
  service_type: ServiceType
  network_operator: string
  plan_category: string | null   // null = network-level control
  plan_count: number
  active_plan_count: number
  is_active: boolean             // state from control record; defaults to true if no record
  reason: string | null
  control_id: string | null
}

export interface SetGroupControlInput {
  service_type: ServiceType
  network_operator: string
  plan_category?: string | null
  is_active: boolean
  reason?: string | null
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

// ── Payment Gateways ──────────────────────────────────────────────────────────

export type ChargeType = 'flat' | 'percentage' | 'none'

export interface PaymentGateway {
  id: string
  code: string
  name: string
  is_active: boolean
  is_default: boolean
  is_live: boolean
  is_supported: boolean
  base_url: string | null
  public_key: string | null
  // Secrets never returned; replaced by boolean flags
  has_secret_key: boolean
  has_webhook_secret: boolean
  charge_type: ChargeType
  charge_value: number
  notes: string | null
  created_at: string
  updated_at: string
}

export interface CreatePaymentGatewayInput {
  code: string
  name: string
  is_active?: boolean
  is_live?: boolean
  base_url?: string | null
  public_key?: string | null
  secret_key?: string | null
  webhook_secret?: string | null
  charge_type?: ChargeType
  charge_value?: number
  notes?: string | null
}

export interface UpdatePaymentGatewayInput {
  name?: string
  is_active?: boolean
  is_live?: boolean
  base_url?: string | null
  public_key?: string | null
  secret_key?: string | null
  webhook_secret?: string | null
  charge_type?: ChargeType
  charge_value?: number
  notes?: string | null
}

// ── Category Provider Mapping ─────────────────────────────────────────────────

export interface CategoryProviderRow {
  service_type: string
  network_operator: string | null
  plan_category: string | null
  plan_count: number
  primary_provider_code: string | null
  fallback_provider_code: string | null
}

export interface BulkAssignProviderInput {
  service_type: string
  network_operator?: string | null
  plan_category?: string | null
  primary_provider_code: string
  fallback_provider_code?: string | null
}

// ── Referral Program ──────────────────────────────────────────────────────────

export interface ReferralSettings {
  id: string
  is_enabled: boolean
  reward_trigger: 'signup' | 'first_funding' | 'first_purchase'
  reward_type: 'fixed' | 'percentage'
  reward_value: number
  min_amount: number | null
  max_reward_cap: number | null
  reward_recipient: 'referrer' | 'both'
  referred_reward_value: number | null
  created_at: string
  updated_at: string
}

export interface ReferralReward {
  id: string
  referrer_id: string
  referred_id: string
  trigger_type: string
  reward_type: string
  referrer_amount: number
  referred_amount: number
  status: string
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  referrer_email?: string
  referred_email?: string
}

export interface ReferralSummary {
  total_referrals: number
  total_rewards_paid: number
  pending_rewards: number
  active_referrers: number
}

export interface UserReferralInfo {
  referral_code: string | null
  referral_link: string | null
  total_referrals: number
  rewards_earned: number
  referred_users: Array<{
    id: string
    email: string
    created_at: string
    reward_status: string | null
  }>
}
