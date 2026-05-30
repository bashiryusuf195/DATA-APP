// ── User ─────────────────────────────────────────────────────────────────────

export interface User {
  id: string
  email: string
  phone?: string | null
  first_name?: string | null
  last_name?: string | null
  username?: string | null
  role: 'user' | 'admin' | 'super_admin'
  status: 'active' | 'suspended' | 'pending'
  kyc_level: number
  is_email_verified: boolean
  has_transaction_pin: boolean
  referral_code?: string | null
  created_at?: string
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthTokens {
  access_token: string
  refresh_token: string
}

export interface LoginInput {
  email: string
  password: string
}

export interface RegisterInput {
  email: string
  password: string
  first_name: string
  last_name: string
  phone?: string
  referral_code?: string
}

export interface LoginResponse {
  requires_2fa: false
  access_token: string
  refresh_token: string
  session_id: string
  user: User
}

export interface TwoFactorChallengeResponse {
  requires_2fa: true
  challenge_id: string
}

export type LoginResult = LoginResponse | TwoFactorChallengeResponse

// ── Wallet ────────────────────────────────────────────────────────────────────

export interface WalletBalance {
  wallet_id: string
  balance: number
  currency: string
  wallet_type: string
  is_default: boolean
}

export interface FundingInitResponse {
  reference: string
  authorization_url: string
  access_code?: string
  gateway: string
  amount: number
  charge: number
  credited_amount: number
  currency: string
}

export interface FundingVerifyResponse {
  status: 'success' | 'pending' | 'failed'
  reference: string
  amount: number
  credited_amount: number
  new_balance: number
  currency: string
  message?: string
}

export interface DedicatedAccount {
  account_number: string
  account_name:   string
  bank_name:      string
  bank_slug:      string
}

export interface LedgerEntry {
  id: string
  type: 'credit' | 'debit'
  amount: number
  balance_after: number
  description: string
  reference?: string
  created_at: string
}

// ── Transactions ──────────────────────────────────────────────────────────────

export type TransactionStatus = 'pending' | 'processing' | 'success' | 'failed' | 'refunded' | 'reversed' | 'requires_review'

export type TransactionType =
  | 'airtime'
  | 'data'
  | 'electricity'
  | 'cable_tv'
  | 'exam_pin'
  | 'identity_verification'
  | 'wallet_funding'
  | 'transfer'

export type ServiceType =
  | 'airtime'
  | 'data'
  | 'electricity'
  | 'cable_tv'
  | 'exam_pin'
  | 'identity_verification'

export interface Transaction {
  id: string
  reference: string
  type: TransactionType
  status: TransactionStatus
  amount: number
  currency: string
  description: string
  phone?: string | null
  metadata?: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface TransactionListResponse {
  data: Transaction[]
  total: number
  page: number
  limit: number
}

// Purchase request shapes
export interface AirtimePurchaseInput {
  phone: string
  amount: number
  variation_code: string
  description: string
  plan?: PlanMeta
  transaction_pin: string
}

export interface DataPurchaseInput {
  phone: string
  amount: number
  variation_code: string
  description: string
  plan?: PlanMeta
  transaction_pin: string
}

export interface ElectricityVerifyInput {
  meter_number:   string
  variation_code: string
}

export interface MeterVerifyResult {
  success:       boolean
  customer_name: string
  address?:      string
  meter_number:  string
  message:       string
}

export interface ElectricityPurchaseInput {
  meter_number:           string
  amount:                 number
  variation_code:         string
  phone?:                 string
  verified_customer_name?: string
  transaction_pin:        string
}

export interface CableTvVerifyInput {
  smartcard_number: string
  biller_code:      string
}

export interface CableVerifyResult {
  success:          boolean
  customer_name?:   string
  current_package?: string
  due_date?:        string
  smartcard_number?: string
  message:          string
}

export interface CableTvPurchaseInput {
  smartcard_number:       string
  variation_code:         string
  phone?:                 string
  verified_customer_name?: string
  transaction_pin:        string
}

export interface ExamPinPurchaseInput {
  phone: string
  amount: number
  variation_code: string
  description: string
  plan?: PlanMeta
  transaction_pin: string
}

export interface IdentityVerificationInput {
  id_number?: string
  phone?: string
  amount: number
  variation_code: string
  description: string
  plan?: PlanMeta
  transaction_pin: string
}

// ── Services / Plans ──────────────────────────────────────────────────────────

export interface Service {
  id: string
  slug: string
  name: string
  service_type: ServiceType
}

export interface ServicePlan {
  id: string
  variation_code: string
  name: string
  amount: number
  selling_price: number
  is_variable_amount: boolean
  network_operator?: string | null
  plan_category?: string | null
  description?: string | null
}

export interface PlanMeta {
  plan_id: string
  variation_code: string
  plan_name: string
  service_slug: string
  service_name: string
}

// ── Notifications ─────────────────────────────────────────────────────────────

export interface Notification {
  id: string
  type: string
  title: string
  body: string
  is_read: boolean
  metadata?: Record<string, unknown>
  created_at: string
}

export interface NotificationPreferences {
  email: boolean
  sms: boolean
  push: boolean
  in_app: boolean
}

// ── Referrals ─────────────────────────────────────────────────────────────────

export interface ReferralSummary {
  referral_code: string
  total_referrals: number
  successful_referrals: number
  total_rewards: number
  pending_rewards: number
  currency: string
  rewards: ReferralReward[]
}

export interface ReferralReward {
  id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  amount: number
  currency: string
  referred_user_email: string
  created_at: string
}

// ── KYC ───────────────────────────────────────────────────────────────────────

export type KycLevel             = 'none' | 'tier_1' | 'tier_2' | 'tier_3'
export type KycVerificationType  = 'nin' | 'bvn'
export type KycVerificationStatus = 'pending' | 'in_progress' | 'verified' | 'failed' | 'expired' | 'manual_review'

export interface KycVerificationRecord {
  id:                string
  verification_type: KycVerificationType
  status:            KycVerificationStatus
  failure_reason:    string | null
  verified_at:       string | null
  created_at:        string
  updated_at:        string
}

export interface KycStatus {
  kyc_level:     KycLevel
  bvn_verified:  boolean
  nin_verified:  boolean
  has_bvn:       boolean
  has_nin:       boolean
  verifications: KycVerificationRecord[]
}

// ── API envelope ──────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean
  data: T
  message?: string
}

export interface ApiErrorResponse {
  success: false
  error: string
  message?: string
  code?: string
}
