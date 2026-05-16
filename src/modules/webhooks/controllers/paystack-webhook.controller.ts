import type { Request, Response, NextFunction } from "express";
import { paystackGateway } from "../../wallet/services/paystack.service";
import { storeWebhookEvent } from "../services/webhook.service";
import { paystackWebhookQueue } from "../../queue/queues/paystack-webhook.queue";
import type { PaystackWebhookJobPayload } from "../../queue/jobs/paystack-webhook.job";

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
    const rawBody  = req.rawBody;
    const payload  = (req.body ?? {}) as Record<string, unknown>;
    const signature = (req.headers["x-paystack-signature"] as string) ?? "";

    // ── Signature verification ────────────────────────────────────────────────
    let signatureValid = false;

    if (rawBody && rawBody.length > 0) {
      signatureValid = paystackGateway.validateWebhookSignature(rawBody, signature);
    }

    if (!signatureValid) {
      console.warn("[PAYSTACK-WEBHOOK] Invalid or missing signature — storing but not processing", {
        has_raw_body: Boolean(rawBody),
        signature_present: Boolean(signature),
      });
    }

    const event     = typeof payload.event === "string" ? payload.event : null;
    const data      = (payload.data && typeof payload.data === "object")
      ? (payload.data as Record<string, unknown>)
      : {};
    const reference = typeof data.reference === "string" ? data.reference : null;

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
    } catch (storeErr) {
      console.error("[PAYSTACK-WEBHOOK] Failed to store webhook event", storeErr);
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

      console.log("[PAYSTACK-WEBHOOK] Enqueued processing job", {
        reference,
        webhook_event_id: eventRecord.id,
      });
    } else if (event === "charge.success" && !signatureValid) {
      console.warn("[PAYSTACK-WEBHOOK] charge.success received but signature invalid — not processing", {
        reference,
        webhook_event_id: eventRecord.id,
      });
    }

    // Always 200 — Paystack retries on any non-2xx response
    res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
}
