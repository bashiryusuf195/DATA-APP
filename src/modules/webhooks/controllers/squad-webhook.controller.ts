import type { Request, Response, NextFunction } from "express";
import { squadGateway } from "../../wallet/services/squad.service";
import { storeWebhookEvent } from "../services/webhook.service";
import { squadWebhookQueue } from "../../queue/queues/squad-webhook.queue";
import type { SquadWebhookJobPayload } from "../../queue/jobs/squad-webhook.job";
import { logger } from "../../../lib/logger";

// ── POST /webhooks/squad ──────────────────────────────────────────────────────
//
// 1. Validate x-squad-encrypted-body (HMAC-SHA512 of raw body)
// 2. Store webhook event regardless of signature validity
// 3. Enqueue async processing for charge_successful events
// 4. Always return 200 immediately — Squad retries on non-2xx

export async function squadWebhookController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const rawBody   = req.rawBody;
    const payload   = (req.body ?? {}) as Record<string, unknown>;
    const signature = (req.headers["x-squad-encrypted-body"] as string) ?? "";

    // Squad webhook structure: { Event, TransactionRef, Body }
    const event     = typeof payload.Event === "string" ? payload.Event : null;
    const reference = typeof payload.TransactionRef === "string" ? payload.TransactionRef : null;
    const body      = (payload.Body && typeof payload.Body === "object")
      ? (payload.Body as Record<string, unknown>)
      : {};

    const squadRef   = typeof body.transaction_ref  === "string" ? body.transaction_ref  : null;
    const channel    = typeof body.channel          === "string" ? body.channel          :
                       typeof body.payment_type     === "string" ? body.payment_type     : null;
    const amountKobo = typeof body.merchant_amount  === "number" ? body.merchant_amount  : null;
    const paidAt     = typeof body.paid_at          === "string" ? body.paid_at          : null;

    logger.info("squad_webhook_received", {
      event,
      reference,
      has_raw_body:      Boolean(rawBody && rawBody.length > 0),
      signature_present: Boolean(signature),
      content_length:    req.headers["content-length"] ?? null,
    });

    // ── Signature verification ────────────────────────────────────────────────
    let signatureValid = false;

    if (rawBody && rawBody.length > 0) {
      signatureValid = squadGateway.validateWebhookSignature(rawBody, signature);
    }

    if (!signatureValid) {
      logger.warn("squad_webhook_invalid_signature", {
        event,
        reference,
        has_raw_body:      Boolean(rawBody),
        signature_present: Boolean(signature),
      });
    } else {
      logger.info("squad_webhook_signature_ok", { event, reference });
    }

    // ── Store webhook event (always, for audit trail) ─────────────────────────
    let eventRecord: { id: string };
    try {
      eventRecord = await storeWebhookEvent({
        provider_code:         "squad",
        event_type:            event,
        provider_reference:    squadRef,
        transaction_reference: reference,
        payload,
        headers: Object.fromEntries(
          Object.entries(req.headers).filter(([, v]) => v !== undefined)
        ),
        signature_valid: signatureValid,
      });

      logger.info("squad_webhook_stored", {
        webhook_event_id: eventRecord.id,
        event,
        reference,
        signature_valid:  signatureValid,
      });
    } catch (storeErr) {
      logger.error("squad_webhook_store_failed", { error: (storeErr as Error).message });
      return next(storeErr);
    }

    // ── Enqueue processing for charge_successful with valid signature ──────────
    if (event === "charge_successful" && reference && signatureValid) {
      const jobPayload: SquadWebhookJobPayload = {
        webhook_event_id: eventRecord.id,
        reference,
        event,
        channel:     channel   ?? null,
        squad_ref:   squadRef  ?? null,
        amount_kobo: amountKobo ?? null,
        paid_at:     paidAt    ?? null,
      };

      await squadWebhookQueue.add("process-payment", jobPayload, {
        jobId:    `squad_${reference}`,  // deduplication key
        attempts: 5,
        backoff:  { type: "exponential", delay: 5_000 },
      });

      logger.info("squad_webhook_enqueued", {
        reference,
        channel:          channel ?? null,
        webhook_event_id: eventRecord.id,
      });
    } else if (event === "charge_successful" && !signatureValid) {
      logger.warn("squad_webhook_charge_success_rejected", {
        reason:           "invalid_signature",
        reference,
        webhook_event_id: eventRecord.id,
      });
    } else if (event && event !== "charge_successful") {
      logger.info("squad_webhook_event_unhandled", {
        event,
        webhook_event_id: eventRecord.id,
      });
    }

    // Always 200 — Squad retries on any non-2xx response
    res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
}
