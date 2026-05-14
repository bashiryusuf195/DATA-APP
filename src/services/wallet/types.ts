// ============================================================
// src/wallet/types.ts
// ============================================================

export type WalletType =
  | "user"
  | "merchant"
  | "agent"
  | "commission"
  | "escrow"
  | "fee"
  | "settlement";

export type WalletStatus = "active" | "suspended" | "frozen" | "closed";

export type LedgerEntryType = "debit" | "credit";

export type JournalStatus = "pending" | "posted" | "reversed" | "failed";

// ── Domain objects ────────────────────────────────────────────

export interface Wallet {
  id: string;
  user_id: string | null;
  wallet_type: WalletType;
  currency: string;
  status: WalletStatus;
  daily_debit_limit: number;
  monthly_debit_limit: number;
  single_txn_limit: number;
  overdraft_limit: number;
  is_default: boolean;
  label: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface WalletBalance {
  wallet_id: string;
  user_id: string | null;
  wallet_type: WalletType;
  currency: string;
  status: WalletStatus;
  balance: number;
  ledger_entry_count: number;
  last_activity_at: Date | null;
}

export interface JournalBatch {
  id: string;
  status: JournalStatus;
  description: string;
  reference_type: string | null;
  reference_id: string | null;
  idempotency_key: string | null;
  posted_at: Date | null;
  reversed_at: Date | null;
  reversed_by: string | null;
  reversal_batch_id: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface LedgerEntry {
  id: string;
  journal_batch_id: string;
  wallet_id: string;
  entry_type: LedgerEntryType;
  amount: number;
  signed_amount: number;
  currency: string;
  running_balance: number | null;
  description: string;
  reference_type: string | null;
  reference_id: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}

// ── Input types ───────────────────────────────────────────────

export interface CreateWalletInput {
  user_id?: string | null;
  wallet_type?: WalletType;
  currency?: string;
  is_default?: boolean;
  label?: string;
  daily_debit_limit?: number;
  monthly_debit_limit?: number;
  single_txn_limit?: number;
  overdraft_limit?: number;
  metadata?: Record<string, unknown>;
}

export interface CreditWalletInput {
  wallet_id: string;
  contra_wallet_id: string;
  amount: number;
  currency?: string;
  description: string;
  idempotency_key?: string;
  reference_type?: string;
  reference_id?: string;
  metadata?: Record<string, unknown>;
}

export interface DebitWalletInput {
  wallet_id: string;
  contra_wallet_id: string;
  amount: number;
  currency?: string;
  description: string;
  idempotency_key?: string;
  reference_type?: string;
  reference_id?: string;
  metadata?: Record<string, unknown>;
}

export interface TransferWalletInput {
  from_wallet_id: string;
  to_wallet_id: string;
  amount: number;
  currency?: string;
  description: string;
  idempotency_key?: string;
  reference_type?: string;
  reference_id?: string;
  metadata?: Record<string, unknown>;
}

export interface GetLedgerPageInput {
  wallet_id: string;
  limit?: number;
  offset?: number;
}

// ── Results ───────────────────────────────────────────────────

export interface JournalResult {
  journal_batch_id: string;
  /** true when the idempotency_key matched an existing batch (no new write) */
  idempotent: boolean;
}
