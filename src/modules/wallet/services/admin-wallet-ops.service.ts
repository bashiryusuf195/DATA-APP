// src/modules/wallet/services/admin-wallet-ops.service.ts
// Business logic for POST /admin/wallet/credit and POST /admin/wallet/debit.
// All balance mutations go through WalletService (PostgreSQL advisory locking,
// double-entry ledger). An explicit audit_logs row is written in addition to
// the automatic admin_activity_logs entry from adminAuditMiddleware.

import { randomUUID } from "crypto";
import { getDbInstance } from "../../../db/knex";
import { WalletService } from "../../../services/wallet/WalletService";
import { createTransaction } from "../../transactions/services/transaction.service";
import { NotFoundError, ValidationError, InternalError } from "../../../lib/errors";
import { generateTransactionReference } from "../../../lib/reference";

const db            = getDbInstance();
const walletService = new WalletService(db);

export interface ManualWalletAdjustInput {
  identifier:  string;            // email | phone | username | UUID
  amount:      number;
  reason:      string;
  operation:   "credit" | "debit";
  admin_id:    string;
  ip_address?: string | null;
  user_agent?: string | null;
  request_id?: string | null;
}

export interface ManualWalletAdjustResult {
  user: {
    id:        string;
    email:     string;
    full_name: string | null;
  };
  wallet_id:        string;
  operation:        "credit" | "debit";
  amount:           number;
  balance_before:   number;
  balance_after:    number;
  reference:        string;
  journal_batch_id: string;
  transaction_id:   string;
}

// ── User lookup ───────────────────────────────────────────────────────────────

async function resolveUser(identifier: string) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    identifier
  );

  const row = await db("users")
    .leftJoin("user_profiles", "users.id", "user_profiles.user_id")
    .select(
      "users.id        as id",
      "users.email     as email",
      "users.phone     as phone",
      "users.username  as username",
      db.raw(
        "TRIM(COALESCE(user_profiles.first_name, '') || ' ' || COALESCE(user_profiles.last_name, '')) AS full_name"
      )
    )
    .where((q) => {
      if (isUuid) {
        q.where("users.id", identifier);
      } else {
        q.where("users.email", identifier.toLowerCase())
          .orWhere("users.phone", identifier)
          .orWhere("users.username", identifier);
      }
    })
    .first();

  if (!row) throw new NotFoundError("User");
  return row as { id: string; email: string; phone: string | null; username: string | null; full_name: string };
}

// ── Settlement wallet guard ───────────────────────────────────────────────────

function getSettlementWalletId(): string {
  const id = process.env.SYSTEM_SETTLEMENT_WALLET_ID;
  if (!id) {
    throw new InternalError(
      "SYSTEM_SETTLEMENT_WALLET_ID is not configured — manual wallet operations are unavailable."
    );
  }
  return id;
}

// ── Core service ──────────────────────────────────────────────────────────────

export async function manualWalletAdjust(
  input: ManualWalletAdjustInput
): Promise<ManualWalletAdjustResult> {
  const { identifier, amount, reason, operation, admin_id, ip_address, user_agent, request_id } =
    input;

  if (amount <= 0) {
    throw new ValidationError("amount must be greater than 0");
  }
  if (!reason || reason.trim().length < 5) {
    throw new ValidationError("reason must be at least 5 characters");
  }

  const settlementWalletId = getSettlementWalletId();

  // ── Resolve user ──────────────────────────────────────────────────────────
  const user = await resolveUser(identifier);

  // ── Find user's default wallet ─────────────────────────────────────────
  const userWallet = await db("wallets")
    .where({ user_id: user.id, wallet_type: "user" })
    .orderBy("is_default", "desc")
    .first();

  if (!userWallet) {
    throw new NotFoundError("Wallet for this user");
  }

  // ── Snapshot balance before ──────────────────────────────────────────────
  const balanceBefore = await walletService.getBalance(userWallet.id);

  // ── Generate reference ───────────────────────────────────────────────────
  const reference = generateTransactionReference(
    operation === "credit" ? "ACR" : "ADR"
  );
  const idempotencyKey = `admin_${operation}_${reference}`;

  // ── Execute ledger operation ──────────────────────────────────────────────
  let journalResult: { journal_batch_id: string };

  if (operation === "credit") {
    journalResult = await walletService.credit({
      wallet_id:        userWallet.id,
      contra_wallet_id: settlementWalletId,
      amount,
      currency:         "NGN",
      description:      `Admin manual credit — ${reason}`,
      idempotency_key:  idempotencyKey,
      reference_type:   "admin_adjustment",
      metadata:         { admin_id, reason, reference },
    });
  } else {
    journalResult = await walletService.debit({
      wallet_id:        userWallet.id,
      contra_wallet_id: settlementWalletId,
      amount,
      currency:         "NGN",
      description:      `Admin manual debit — ${reason}`,
      idempotency_key:  idempotencyKey,
      reference_type:   "admin_adjustment",
      metadata:         { admin_id, reason, reference },
    });
  }

  // ── Create transaction record ─────────────────────────────────────────────
  const txRecord = await createTransaction({
    user_id:               user.id,
    reference,
    type:                  operation === "credit" ? "manual_credit" : "manual_debit",
    status:                "successful",
    amount,
    currency:              "NGN",
    source_wallet_id:      operation === "credit" ? settlementWalletId : userWallet.id,
    destination_wallet_id: operation === "credit" ? userWallet.id : settlementWalletId,
    journal_batch_id:      journalResult.journal_batch_id,
    description:           `Admin manual ${operation} — ${reason}`,
    metadata: {
      admin_id,
      reason,
      operation,
    },
    processed_at: new Date(),
  });

  // ── Get updated balance ───────────────────────────────────────────────────
  const balanceAfter = await walletService.getBalance(userWallet.id);

  // ── Write explicit audit_logs entry (compliance-grade, append-only) ───────
  const auditAction = operation === "credit" ? "wallet_credit" : "wallet_debit";

  db("audit_logs")
    .insert({
      id:            randomUUID(),
      actor_id:      admin_id,
      actor_type:    "user",
      action:        auditAction,
      outcome:       "success",
      resource_type: "wallet",
      resource_id:   userWallet.id,
      old_values:    JSON.stringify({ balance: balanceBefore }),
      new_values:    JSON.stringify({ balance: balanceAfter }),
      diff:          JSON.stringify({ amount, operation, reason, admin_id, reference }),
      ip_address:    ip_address ?? null,
      user_agent:    user_agent ?? null,
      request_id:    request_id ?? null,
      metadata:      JSON.stringify({
        target_user_id:   user.id,
        target_user_email: user.email,
        journal_batch_id: journalResult.journal_batch_id,
        transaction_ref:  reference,
      }),
      created_at: new Date(),
    })
    .catch(() => { /* never surface audit failures */ });

  return {
    user: {
      id:        user.id,
      email:     user.email,
      full_name: user.full_name?.trim() || null,
    },
    wallet_id:        userWallet.id,
    operation,
    amount,
    balance_before:   balanceBefore,
    balance_after:    balanceAfter,
    reference,
    journal_batch_id: journalResult.journal_batch_id,
    transaction_id:   txRecord.id,
  };
}
