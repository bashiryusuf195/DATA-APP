import type { Job } from "bullmq";
import { createWorker } from "../config/queue.config";
import type { SquadWebhookJobPayload } from "../jobs/squad-webhook.job";
import { squadGateway } from "../../wallet/services/squad.service";
import {
  createFundingTransaction,
  getFundingTransactionByReference,
  updateFundingTransaction,
} from "../../wallet/services/funding-transaction.service";
import {
  createTransaction,
  getTransactionByReference,
} from "../../transactions/services/transaction.service";
import { createNotification } from "../../notifications/services/notification.service";
import { markWebhookProcessed } from "../../webhooks/services/webhook.service";
import { getSquadVirtualAccountByCustomerIdentifier } from "../../wallet/services/squad-dva.service";
import { getDbInstance } from "../../../db/knex";
import { WalletService } from "../../../services/wallet/WalletService";
import { logger } from "../../../lib/logger";

const db            = getDbInstance();
const walletService = new WalletService(db);

export const squadWebhookWorker = createWorker("squad-webhooks", async (job: Job) => {
  const payload = job.data as SquadWebhookJobPayload;
  const { webhook_event_id, reference, event, channel, squad_ref, amount_kobo, paid_at } = payload;

  logger.info("squad_webhook_job_start", { job_id: job.id, reference, event, channel });

  if (event === "virtual-account.credit") {
    await processSquadVaCredit(payload);
    return;
  }

  if (event !== "charge_successful") {
    logger.info("squad_webhook_job_skip", { event, reason: "non_charge_event" });
    await markWebhookProcessed(webhook_event_id).catch(() => {});
    return;
  }

  // 1. Load funding transaction
  const fundingTx = await getFundingTransactionByReference(reference);

  if (!fundingTx) {
    logger.warn("squad_webhook_no_funding_tx", { reference });
    await markWebhookProcessed(webhook_event_id).catch(() => {});
    return;
  }

  // 2. Idempotency gate
  if (fundingTx.verified) {
    logger.info("squad_webhook_already_verified", { reference, reason: "idempotent_replay" });
    await markWebhookProcessed(webhook_event_id).catch(() => {});
    return;
  }

  // 3. Verify with Squad API — NEVER trust webhook payload alone
  logger.info("squad_webhook_verify_start", { reference });
  const verifyResult = await squadGateway.verifyPayment(reference);

  logger.info("squad_webhook_verify_result", {
    reference,
    status:  verifyResult.status,
    channel: verifyResult.channel ?? "unknown",
  });

  if (verifyResult.status !== "success") {
    await updateFundingTransaction(fundingTx.id, {
      status:             verifyResult.status === "abandoned" ? "abandoned" : "failed",
      provider_reference: verifyResult.gateway_reference,
    });
    await markWebhookProcessed(webhook_event_id).catch(() => {});
    logger.warn("squad_webhook_payment_not_successful", {
      reference,
      squad_status: verifyResult.status,
    });
    return;
  }

  // 4. Credit the user's wallet
  const settlementWalletId = process.env.SYSTEM_SETTLEMENT_WALLET_ID;
  if (!settlementWalletId) {
    throw new Error("SYSTEM_SETTLEMENT_WALLET_ID is not set — cannot credit wallet");
  }

  const userWallet = await db("wallets")
    .where({ user_id: fundingTx.user_id, wallet_type: "user" })
    .first();

  if (!userWallet) {
    throw new Error(`Wallet not found for user ${fundingTx.user_id}`);
  }

  const paidAmountNgn = verifyResult.amount_kobo / 100;
  const amountNgn     = fundingTx.credited_amount ?? paidAmountNgn;

  const walletResult = await walletService.credit({
    wallet_id:        userWallet.id,
    contra_wallet_id: settlementWalletId,
    amount:           amountNgn,
    currency:         "NGN",
    description:      `Wallet funding via Squad (${reference})`,
    idempotency_key:  `squad_credit_${reference}`,
    reference_type:   "squad_funding",
    reference_id:     fundingTx.id,
    metadata:         { reference, gateway: "squad" },
  });

  logger.info("squad_webhook_wallet_credited", {
    reference,
    paid_amount_ngn:  paidAmountNgn,
    amount_ngn:       amountNgn,
    charge_amount:    fundingTx.charge_amount ?? 0,
    journal_batch_id: walletResult.journal_batch_id,
    idempotent:       walletResult.idempotent,
  });

  // 5. Create transactions record (idempotent: skip if already exists)
  const existingTx = await getTransactionByReference(reference).catch(() => null);
  if (!existingTx) {
    await createTransaction({
      user_id:               fundingTx.user_id,
      reference,
      type:                  "wallet_funding",
      status:                "successful",
      amount:                amountNgn,
      currency:              "NGN",
      source_wallet_id:      settlementWalletId,
      destination_wallet_id: userWallet.id,
      journal_batch_id:      walletResult.journal_batch_id,
      provider:              "squad",
      provider_reference:    verifyResult.gateway_reference,
      description:           "Wallet funding via Squad",
      metadata: {
        payment_channel:        verifyResult.channel,
        paid_at:                verifyResult.paid_at?.toISOString() ?? null,
        funding_transaction_id: fundingTx.id,
        squad_ref:              squad_ref ?? null,
      },
      processed_at: verifyResult.paid_at ?? new Date(),
    });
  }

  // 6. Mark funding transaction as verified (last step — idempotency gate)
  await updateFundingTransaction(fundingTx.id, {
    status:             "successful",
    verified:           true,
    provider_reference: verifyResult.gateway_reference,
    payment_channel:    verifyResult.channel,
    paid_at:            verifyResult.paid_at,
  });

  // 7. Notify user
  try {
    await createNotification({
      user_id: fundingTx.user_id,
      channel: "in_app",
      type:    "wallet_funded",
      title:   "Wallet Funded",
      message: `Your wallet has been credited ₦${amountNgn.toLocaleString("en-NG", { minimumFractionDigits: 2 })} via ${verifyResult.channel ?? "Squad"}.`,
      metadata: {
        reference,
        paid_amount_ngn:  paidAmountNgn,
        amount_ngn:       amountNgn,
        charge_amount:    fundingTx.charge_amount ?? 0,
        payment_channel:  verifyResult.channel,
      },
    });
  } catch (notifErr) {
    logger.warn("squad_webhook_notification_failed", {
      reference,
      error: (notifErr as Error).message,
    });
  }

  // 8. Mark webhook processed
  await markWebhookProcessed(webhook_event_id).catch((e: unknown) => {
    logger.warn("squad_webhook_mark_processed_failed", {
      webhook_event_id,
      error: (e as Error).message,
    });
  });

  logger.info("squad_webhook_job_complete", { reference, amount_ngn: amountNgn });
});

// ── Virtual Account credit processor ─────────────────────────────────────────
//
// When a customer bank-transfers to their Squad virtual account, Squad sends
// virtual-account.credit. There is no pre-existing funding_transaction; we
// look up the customer from squad_virtual_accounts and create records on-the-fly.

async function processSquadVaCredit(payload: SquadWebhookJobPayload): Promise<void> {
  const {
    webhook_event_id,
    reference,        // Squad transaction_ref used as idempotency key
    customer_identifier,
    amount_ngn,
    virtual_account_number,
    sender_name,
    paid_at,
  } = payload;

  logger.info("squad_va_credit_start", { reference, customer_identifier });

  // Idempotency: if a funding_transaction for this reference already exists, skip
  const existingFunding = await getFundingTransactionByReference(reference);
  if (existingFunding?.verified) {
    logger.info("squad_va_credit_already_processed", { reference });
    await markWebhookProcessed(webhook_event_id).catch(() => {});
    return;
  }

  if (!customer_identifier) {
    logger.warn("squad_va_credit_no_customer_identifier", { reference });
    await markWebhookProcessed(webhook_event_id).catch(() => {});
    return;
  }

  // Look up which user owns this virtual account
  const vaRecord = await getSquadVirtualAccountByCustomerIdentifier(customer_identifier);
  if (!vaRecord) {
    logger.warn("squad_va_credit_unknown_customer", { reference, customer_identifier });
    await markWebhookProcessed(webhook_event_id).catch(() => {});
    return;
  }

  if (!amount_ngn || isNaN(amount_ngn) || amount_ngn <= 0) {
    logger.warn("squad_va_credit_invalid_amount", { reference, amount_ngn });
    await markWebhookProcessed(webhook_event_id).catch(() => {});
    return;
  }

  const userId    = vaRecord.user_id;
  const paidAtDate = paid_at ? new Date(paid_at) : new Date();

  const settlementWalletId = process.env.SYSTEM_SETTLEMENT_WALLET_ID;
  if (!settlementWalletId) {
    throw new Error("SYSTEM_SETTLEMENT_WALLET_ID is not set — cannot credit wallet");
  }

  const userWallet = await db("wallets")
    .where({ user_id: userId, wallet_type: "user" })
    .first();

  if (!userWallet) {
    throw new Error(`Wallet not found for user ${userId}`);
  }

  // Create a funding_transaction record so admin tooling and ledger work correctly
  const fundingTx = existingFunding ?? await createFundingTransaction({
    user_id:         userId,
    reference,
    payment_gateway: "squad",
    amount:          amount_ngn,
    currency:        "NGN",
    charge_type:     "none",
    charge_value:    0,
    charge_amount:   0,
    credited_amount: amount_ngn,
    metadata: {
      channel:                "virtual_account",
      customer_identifier,
      virtual_account_number: virtual_account_number ?? vaRecord.virtual_account_number,
      bank_name:              vaRecord.bank_name,
      sender_name:            sender_name ?? null,
    },
  });

  // Credit the wallet (idempotent via idempotency_key)
  const walletResult = await walletService.credit({
    wallet_id:        userWallet.id,
    contra_wallet_id: settlementWalletId,
    amount:           amount_ngn,
    currency:         "NGN",
    description:      `Bank transfer via Squad virtual account (${vaRecord.bank_name})`,
    idempotency_key:  `squad_credit_${reference}`,
    reference_type:   "squad_funding",
    reference_id:     fundingTx.id,
    metadata:         { reference, gateway: "squad", channel: "virtual_account" },
  });

  logger.info("squad_va_credit_wallet_credited", {
    reference,
    user_id:          userId,
    amount_ngn,
    journal_batch_id: walletResult.journal_batch_id,
    idempotent:       walletResult.idempotent,
  });

  // Create transaction history entry
  const existingTx = await getTransactionByReference(reference).catch(() => null);
  if (!existingTx) {
    await createTransaction({
      user_id:               userId,
      reference,
      type:                  "wallet_funding",
      status:                "successful",
      amount:                amount_ngn,
      currency:              "NGN",
      source_wallet_id:      settlementWalletId,
      destination_wallet_id: userWallet.id,
      journal_batch_id:      walletResult.journal_batch_id,
      provider:              "squad",
      provider_reference:    reference,
      description:           `Bank transfer via ${vaRecord.bank_name} virtual account`,
      metadata: {
        payment_channel:        "virtual_account",
        paid_at:                paidAtDate.toISOString(),
        bank_name:              vaRecord.bank_name,
        virtual_account_number: vaRecord.virtual_account_number,
        sender_name:            sender_name ?? null,
        funding_transaction_id: fundingTx.id,
      },
      processed_at: paidAtDate,
    });
  }

  // Mark funding transaction verified
  await updateFundingTransaction(fundingTx.id, {
    status:             "successful",
    verified:           true,
    provider_reference: reference,
    payment_channel:    "virtual_account",
    paid_at:            paidAtDate,
  });

  // Notify the user
  try {
    await createNotification({
      user_id: userId,
      channel: "in_app",
      type:    "wallet_funded",
      title:   "Wallet Funded",
      message: `Your wallet has been credited ₦${amount_ngn.toLocaleString("en-NG", { minimumFractionDigits: 2 })} via bank transfer.`,
      metadata: {
        reference,
        amount_ngn,
        payment_channel: "virtual_account",
        bank_name:       vaRecord.bank_name,
        sender_name:     sender_name ?? null,
      },
    });
  } catch (notifErr) {
    logger.warn("squad_va_credit_notification_failed", {
      reference,
      error: (notifErr as Error).message,
    });
  }

  await markWebhookProcessed(webhook_event_id).catch(() => {});

  logger.info("squad_va_credit_complete", { reference, user_id: userId, amount_ngn });
}
