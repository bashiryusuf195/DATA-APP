import type { Job } from "bullmq";
import { createWorker } from "../config/queue.config";
import type { PaystackWebhookJobPayload } from "../jobs/paystack-webhook.job";
import { paystackGateway } from "../../wallet/services/paystack.service";
import {
  getFundingTransactionByReference,
  updateFundingTransaction,
} from "../../wallet/services/funding-transaction.service";
import {
  createTransaction,
  getTransactionByReference,
} from "../../transactions/services/transaction.service";
import { createNotification } from "../../notifications/services/notification.service";
import { markWebhookProcessed } from "../../webhooks/services/webhook.service";
import { getDbInstance } from "../../../db/knex";
import { WalletService } from "../../../services/wallet/WalletService";

const db           = getDbInstance();
const walletService = new WalletService(db);

// ── Worker ────────────────────────────────────────────────────────────────────

createWorker("paystack-webhooks", async (job: Job) => {
  const { webhook_event_id, reference, event } = job.data as PaystackWebhookJobPayload;
  const log = (msg: string, extra?: Record<string, unknown>) =>
    console.log(`[PAYSTACK-WORKER] ${msg}`, extra ? JSON.stringify(extra) : "");
  const warn = (msg: string, extra?: Record<string, unknown>) =>
    console.warn(`[PAYSTACK-WORKER] ${msg}`, extra ? JSON.stringify(extra) : "");
  const err = (msg: string, e?: unknown) =>
    console.error(`[PAYSTACK-WORKER] ${msg}`, (e as Error)?.message ?? e);

  log("Processing job", { job_id: job.id, reference, event });

  // Only handle charge.success events
  if (event !== "charge.success") {
    log("Skipping non-charge event", { event });
    await markWebhookProcessed(webhook_event_id).catch(() => {});
    return;
  }

  // ── 1. Load funding transaction ───────────────────────────────────────────
  const fundingTx = await getFundingTransactionByReference(reference);

  if (!fundingTx) {
    warn("No funding_transaction found for reference — skipping", { reference });
    await markWebhookProcessed(webhook_event_id).catch(() => {});
    return;
  }

  // ── 2. Idempotency gate ───────────────────────────────────────────────────
  if (fundingTx.verified) {
    log("Already verified — skipping (idempotent replay)", { reference });
    await markWebhookProcessed(webhook_event_id).catch(() => {});
    return;
  }

  // ── 3. Verify with Paystack API — NEVER trust webhook payload alone ───────
  log("Verifying with Paystack API", { reference });
  const verifyResult = await paystackGateway.verifyPayment(reference);

  log("Paystack verify result", {
    reference,
    status:  verifyResult.status,
    channel: verifyResult.channel ?? "unknown",
  });

  if (verifyResult.status !== "success") {
    await updateFundingTransaction(fundingTx.id, {
      status:          verifyResult.status === "abandoned" ? "abandoned" : "failed",
      provider_reference: verifyResult.gateway_reference,
    });
    await markWebhookProcessed(webhook_event_id).catch(() => {});
    warn("Payment not successful — marked failed/abandoned", {
      reference,
      paystack_status: verifyResult.status,
    });
    return;
  }

  // ── 4. Credit the user's wallet ───────────────────────────────────────────
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

  // Amount in kobo → NGN
  const amountNgn = verifyResult.amount_kobo / 100;

  // Idempotent: if idempotency_key was already processed, WalletService returns
  // the existing journal_batch_id without double-crediting.
  const walletResult = await walletService.credit({
    wallet_id:       userWallet.id,
    contra_wallet_id: settlementWalletId,
    amount:          amountNgn,
    currency:        "NGN",
    description:     `Wallet funding via Paystack (${reference})`,
    idempotency_key: `paystack_credit_${reference}`,
    reference_type:  "paystack_funding",
    reference_id:    fundingTx.id,
    metadata:        { reference, gateway: "paystack" },
  });

  log("Wallet credited", {
    reference,
    amount_ngn:      amountNgn,
    journal_batch_id: walletResult.journal_batch_id,
    idempotent:      walletResult.idempotent,
  });

  // ── 5. Create transactions record (idempotent: skip if already exists) ────
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
      provider:              "paystack",
      provider_reference:    verifyResult.gateway_reference,
      description:           "Wallet funding via Paystack",
      metadata: {
        payment_channel:       verifyResult.channel,
        paid_at:               verifyResult.paid_at?.toISOString() ?? null,
        funding_transaction_id: fundingTx.id,
      },
      processed_at: verifyResult.paid_at ?? new Date(),
    });
  }

  // ── 6. Mark funding transaction as verified (last step — idempotency gate) ─
  await updateFundingTransaction(fundingTx.id, {
    status:             "successful",
    verified:           true,
    provider_reference: verifyResult.gateway_reference,
    payment_channel:    verifyResult.channel,
    paid_at:            verifyResult.paid_at,
  });

  // ── 7. Notify user ────────────────────────────────────────────────────────
  try {
    await createNotification({
      user_id: fundingTx.user_id,
      channel: "in_app",
      type:    "wallet_funded",
      title:   "Wallet Funded",
      message: `Your wallet has been credited ₦${amountNgn.toLocaleString("en-NG", { minimumFractionDigits: 2 })} via ${verifyResult.channel ?? "Paystack"}.`,
      metadata: {
        reference,
        amount_ngn:     amountNgn,
        payment_channel: verifyResult.channel,
      },
    });
  } catch (notifErr) {
    err("Failed to send wallet_funded notification (non-fatal)", notifErr);
  }

  // ── 8. Mark webhook processed ─────────────────────────────────────────────
  await markWebhookProcessed(webhook_event_id).catch((e) => {
    err("Failed to mark webhook processed (non-fatal)", e);
  });

  log("Job complete", { reference, amount_ngn: amountNgn });
});
