import type { Job } from "bullmq";
import { createWorker } from "../config/queue.config";
import type { SquadWebhookJobPayload } from "../jobs/squad-webhook.job";
import { squadGateway } from "../../wallet/services/squad.service";
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
import { logger } from "../../../lib/logger";

const db            = getDbInstance();
const walletService = new WalletService(db);

export const squadWebhookWorker = createWorker("squad-webhooks", async (job: Job) => {
  const { webhook_event_id, reference, event, channel, squad_ref, amount_kobo, paid_at } =
    job.data as SquadWebhookJobPayload;

  logger.info("squad_webhook_job_start", { job_id: job.id, reference, event, channel });

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
