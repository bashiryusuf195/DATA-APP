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
