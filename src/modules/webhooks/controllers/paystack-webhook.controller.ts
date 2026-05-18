import type { Request, Response, NextFunction } from "express";
import { paystackGateway } from "../../wallet/services/paystack.service";
import { storeWebhookEvent } from "../services/webhook.service";
import { paystackWebhookQueue } from "../../queue/queues/paystack-webhook.queue";
import type { PaystackWebhookJobPayload } from "../../queue/jobs/paystack-webhook.job";
import { logger } from "../../../lib/logger";

// ── POST /webhooks/paystack ───────────────────────────────────────────────────
//
// 1. Validate x-paystack-signature (HMAC-SHA512 of raw body)
// 2. Store webhook event regardless of signature validity
// 3. Enqueue async processing for charge.success events
// 4. Always return 200 immediately — Paystack retries on non-2xx

export async function paystackWebhookController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const rawBody   = req.rawBody;
    const payload   = (req.body ?? {}) as Record<string, unknown>;
    const signature = (req.headers["x-paystack-signature"] as string) ?? "";

    const event     = typeof payload.event === "string" ? payload.event : null;
    const data      = (payload.data && typeof payload.data === "object")
      ? (payload.data as Record<string, unknown>)
      : {};
    const reference = typeof data.reference === "string" ? data.reference : null;

    // ── Clear "received" log — satisfies requirement 4 ───────────────────────
    logger.info("paystack_webhook_received", {
      event,
      reference,
      has_raw_body:       Boolean(rawBody && rawBody.length > 0),
      signature_present:  Boolean(signature),
      content_length:     req.headers["content-length"] ?? null,
    });

    // ── Signature verification ────────────────────────────────────────────────
    let signatureValid = false;

    if (rawBody && rawBody.length > 0) {
      signatureValid = paystackGateway.validateWebhookSignature(rawBody, signature);
    }

    if (!signatureValid) {
      logger.warn("paystack_webhook_invalid_signature", {
        event,
        reference,
        has_raw_body:      Boolean(rawBody),
        signature_present: Boolean(signature),
      });
    } else {
      logger.info("paystack_webhook_signature_ok", { event, reference });
    }

    // ── Store webhook event (always, for audit trail) ─────────────────────────
    let eventRecord: { id: string };
    try {
      eventRecord = await storeWebhookEvent({
        provider_code:         "paystack",
        event_type:            event,
        provider_reference:    typeof data.id === "number" ? String(data.id) : null,
        transaction_reference: reference,
        payload,
        headers: Object.fromEntries(
          Object.entries(req.headers).filter(([, v]) => v !== undefined)
        ),
        signature_valid: signatureValid,
      });

      logger.info("paystack_webhook_stored", {
        webhook_event_id: eventRecord.id,
        event,
        reference,
        signature_valid:  signatureValid,
      });
    } catch (storeErr) {
      logger.error("paystack_webhook_store_failed", { error: (storeErr as Error).message });
      return next(storeErr);
    }

    // ── Enqueue processing for charge.success with valid signature ────────────
    if (event === "charge.success" && reference && signatureValid) {
      const jobPayload: PaystackWebhookJobPayload = {
        webhook_event_id: eventRecord.id,
        reference,
        event,
      };

      await paystackWebhookQueue.add("process-payment", jobPayload, {
        jobId:    `paystack_${reference}`, // deduplication key — one job per reference
        attempts: 5,
        backoff:  { type: "exponential", delay: 5_000 },
      });

      logger.info("paystack_webhook_enqueued", {
        reference,
        webhook_event_id: eventRecord.id,
      });
    } else if (event === "charge.success" && !signatureValid) {
      logger.warn("paystack_webhook_charge_success_rejected", {
        reason:           "invalid_signature",
        reference,
        webhook_event_id: eventRecord.id,
      });
    } else if (event && event !== "charge.success") {
      logger.info("paystack_webhook_event_unhandled", {
        event,
        webhook_event_id: eventRecord.id,
      });
    }

    // Always 200 — Paystack retries on any non-2xx response
    res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
}
