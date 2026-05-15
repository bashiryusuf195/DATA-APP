export type TransactionStatus =
  | "pending"
  | "processing"
  | "successful"
  | "failed"
  | "reversed"
  | "cancelled";

export type TransactionType =
  | "wallet_funding"
  | "wallet_transfer"
  | "airtime"
  | "data"
  | "electricity"
  | "cable_tv"
  | "exam_pin";

export interface CreateTransactionInput {
  user_id: string;

  reference: string;

  type: TransactionType;

  status?: TransactionStatus;

  amount: number;

  currency?: string;

  source_wallet_id?: string | null;

  destination_wallet_id?: string | null;

  journal_batch_id?: string | null;

  provider?: string | null;

  provider_reference?: string | null;

  description?: string | null;

  metadata?: Record<string, unknown>;

  processed_at?: Date | null;

  failed_at?: Date | null;

  failure_reason?: string | null;
}