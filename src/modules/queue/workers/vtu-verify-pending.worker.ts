import { createWorker } from "../config/queue.config";
import { vtuVerifyPendingQueue } from "../queues/vtu-verify-pending.queue";
import type { VtuVerifyPendingJobPayload } from "../jobs/vtu-verify-pending.job";
import { providerRegistry } from "../../providers/services/provider-registry.service";
import { HttpVTUProvider } from "../../providers/services/http-vtu.provider";
import {
  updateTransactionStatus,
  getTransactionByReference,
} from "../../transactions/services/transaction.service";
import { createNotification } from "../../notifications/services/notification.service";
import { processReferralReward } from "../../referral/services/referral-reward.service";
import { WalletService } from "../../../services/wallet/WalletService";
import { getDbInstance } from "../../../db/knex";
import { logger } from "../../../lib/logger";

const db            = getDbInstance();
const walletService = new WalletService(db);

// ── Polling schedule ──────────────────────────────────────────────────────────
// attempt_count 0 → fires after 5s  (enqueued with delay: 5_000 by engine)
// attempt_count 1 → re-enqueued with delay: 10_000
// attempt_count 2 → re-enqueued with delay: 20_000
// attempt_count 3 → re-enqueued with delay: 60_000
// attempt_count 4+ → mark requires_review (delivery outcome unknown)
const POLL_DELAYS_MS = [5_000, 10_000, 20_000, 60_000] as const;
const MAX_ATTEMPTS   = POLL_DELAYS_MS.length;  // = 4

export const vtuVerifyPendingWorker = createWorker(
  "vtu-verify-pending",

  async (job) => {
    const data = job.data as VtuVerifyPendingJobPayload;
    const {
      reference,
      provider_code,
      provider_reference,
      user_id,
      service_type,
      amount,
      source_wallet_id,
      destination_wallet_id,
      currency,
      attempt_count,
    } = data;

    logger.info("vtu_verify_pending_start", {
      reference,
      provider_code,
      provider_reference,
      attempt: attempt_count + 1,
      max:     MAX_ATTEMPTS,
    });

    // ── Guard: skip if already finalized ─────────────────────────────────────
    const tx = await getTransactionByReference(reference).catch(() => null);
    if (!tx) {
      logger.warn("vtu_verify_pending_tx_missing", { reference });
      return;
    }
    if (tx.status === "successful" || tx.status === "failed" || tx.status === "requires_review") {
      logger.info("vtu_verify_pending_skip_terminal", { reference, status: tx.status });
      return;
    }

    // ── Resolve provider ──────────────────────────────────────────────────────
    let provider;
    try {
      provider = providerRegistry.getProvider(provider_code);
    } catch {
      provider = new HttpVTUProvider(provider_code);
    }

    // ── Call verifyTransaction (optional on provider interface) ───────────────
    let verifyResult;
    if (typeof provider.verifyTransaction !== "function") {
      // Provider does not support transaction verification.
      // Treat as still-pending and let the retry/timeout logic handle it.
      logger.warn("vtu_verify_pending_no_verify_support", {
        reference,
        provider_code,
        attempt: attempt_count + 1,
      });
      verifyResult = { found: false, status: "pending" as const, message: `${provider_code} does not support transaction verification` };
    } else {
      try {
        verifyResult = await provider.verifyTransaction(reference);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown verify error";
        logger.warn("vtu_verify_pending_query_failed", { reference, attempt: attempt_count + 1, error: msg });
        // Treat network/timeout errors as still-pending and retry if budget allows.
        verifyResult = { found: false, status: "pending" as const, message: msg };
      }
    }

    logger.info("vtu_verify_pending_result", {
      reference,
      provider_code,
      status:  verifyResult.status,
      found:   verifyResult.found,
      attempt: attempt_count + 1,
    });

    // ── SUCCESS ───────────────────────────────────────────────────────────────
    if (verifyResult.status === "successful") {
      await updateTransactionStatus(reference, {
        status:             "successful",
        provider:           provider_code,
        provider_reference: verifyResult.provider_reference ?? provider_reference,
        metadata: {
          provider_response: verifyResult.raw_response ?? null,
          verification: {
            verified_at:     new Date().toISOString(),
            attempt_number:  attempt_count + 1,
            provider_code,
          },
        },
      });

      logger.info("vtu_verify_pending_finalized_success", { reference });

      // Idempotent notification — key prevents duplicates if job retries
      createNotification({
        user_id,
        channel:          "in_app",
        type:             "purchase_successful",
        title:            "Transaction Successful",
        message:          `Your ${service_type} purchase was successful.`,
        notification_key: `purchase_successful:${reference}`,
        metadata: {
          reference,
          type:     service_type,
          amount,
          provider: provider_code,
        },
      }).catch((err: Error) =>
        logger.warn("vtu_verify_success_notification_failed", { reference, error: err.message })
      );

      processReferralReward("first_purchase", user_id, amount).catch((err: Error) =>
        logger.warn("vtu_verify_referral_failed", { reference, error: err.message })
      );

      return;
    }

    // ── STILL PENDING — retry or mark requires_review ─────────────────────────
    if (verifyResult.status === "pending") {
      const nextAttempt = attempt_count + 1;

      if (nextAttempt >= MAX_ATTEMPTS) {
        // All retries exhausted and outcome is still unknown.
        // Do NOT refund — service may have been delivered. Mark for manual review.
        logger.warn("vtu_verify_pending_timeout_requires_review", {
          reference,
          attempts:   nextAttempt,
          found:      verifyResult.found,
          provider_code,
        });
        await finalizeRequiresReview(reference, service_type, user_id, amount);
        return;
      }

      const nextDelay = POLL_DELAYS_MS[nextAttempt];
      logger.info("vtu_verify_pending_requeue", { reference, next_attempt: nextAttempt + 1, delay_ms: nextDelay });

      await vtuVerifyPendingQueue.add(
        "verify_pending",
        { ...data, attempt_count: nextAttempt } satisfies VtuVerifyPendingJobPayload,
        { delay: nextDelay, removeOnComplete: 100, removeOnFail: 500 },
      );

      return;
    }

    // ── PROVIDER CONFIRMED FAILED ─────────────────────────────────────────────
    logger.info("vtu_verify_pending_finalized_failed", { reference, message: verifyResult.message });
    await finalizeFailed(
      reference, service_type,
      verifyResult.message ?? "Provider confirmed transaction failed.",
      source_wallet_id, destination_wallet_id, amount, currency, user_id,
    );
  }
);

// ── Requires-review (outcome unknown after polling window) ────────────────────
// The wallet is NOT refunded because the service may have been delivered.
// An admin must verify the outcome and either mark successful or issue a refund.

async function finalizeRequiresReview(
  reference:   string,
  serviceType: string,
  userId:      string,
  amount:      number,
): Promise<void> {
  await updateTransactionStatus(reference, {
    status:         "requires_review",
    failure_reason: "Provider did not confirm delivery within the verification window. Awaiting manual review.",
    metadata: {
      requires_review_at: new Date().toISOString(),
      review_reason:      "verification_timeout",
    },
  });

  logger.warn("vtu_verify_pending_requires_review", { reference, service_type: serviceType });

  // Idempotent — won't fire twice even if the job retries
  createNotification({
    user_id:          userId,
    channel:          "in_app",
    type:             "purchase_requires_review",
    title:            "Transaction Under Review",
    message:          `Your ${serviceType} purchase is being reviewed by our team. You will be notified of the outcome shortly.`,
    notification_key: `purchase_requires_review:${reference}`,
    metadata:         { reference, type: serviceType, amount },
  }).catch((err: Error) =>
    logger.warn("vtu_verify_review_notification_failed", { reference, error: err.message })
  );
}

// ── Finalize as failed (with refund) ─────────────────────────────────────────

async function finalizeFailed(
  reference:            string,
  serviceType:          string,
  reason:               string,
  sourceWalletId:       string | null,
  destinationWalletId:  string | null,
  amount:               number,
  currency:             string,
  userId:               string,
): Promise<void> {
  let refundBatchId: string | null = null;

  if (sourceWalletId && destinationWalletId) {
    try {
      const refundResult = await walletService.transfer({
        from_wallet_id:  destinationWalletId,
        to_wallet_id:    sourceWalletId,
        amount,
        currency,
        description:     `Refund for failed ${serviceType} purchase ${reference}`,
        idempotency_key: `${reference}_refund`,
        reference_type:  `${serviceType}_refund`,
        metadata:        { reference },
      });
      refundBatchId = refundResult.journal_batch_id;
      logger.info("vtu_verify_refund_issued", { reference, batch_id: refundBatchId });
    } catch (err) {
      logger.error("vtu_verify_refund_failed", {
        reference,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  await updateTransactionStatus(reference, {
    status:         "failed",
    failure_reason: reason,
    metadata: {
      verification_failed_at: new Date().toISOString(),
      refund: refundBatchId ? { journal_batch_id: refundBatchId } : null,
    },
  });

  // Idempotent — won't fire twice even if the job retries
  createNotification({
    user_id:          userId,
    channel:          "in_app",
    type:             "purchase_failed",
    title:            "Transaction Failed",
    message:          `Your ${serviceType} purchase failed and has been refunded.`,
    notification_key: `purchase_failed:${reference}`,
    metadata:         { reference, type: serviceType, amount },
  }).catch((err: Error) =>
    logger.warn("vtu_verify_failure_notification_failed", { reference, error: err.message })
  );
}

// ── Event hooks ───────────────────────────────────────────────────────────────

vtuVerifyPendingWorker.on("failed", (job, err) => {
  logger.error("vtu_verify_job_failed", {
    job_id:    job?.id,
    reference: (job?.data as VtuVerifyPendingJobPayload | undefined)?.reference ?? "unknown",
    error:     err.message,
  });
});
