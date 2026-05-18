import type { Request, Response, NextFunction } from "express";
import { logger } from "../../../lib/logger";

import {
  storeWebhookEvent,
  markWebhookProcessed,
} from "../services/webhook.service";

import {
  getTransactionByReference,
  mergeTransactionMetadata,
} from "../../transactions/services/transaction.service";

const TRUSTED_WITHOUT_SIGNATURE = new Set(["mock_vtu_provider"]);

function extractString(
  obj: Record<string, unknown>,
  key: string
): string | null {
  const v = obj[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

export async function receiveWebhookController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const { providerCode } = req.params as { providerCode: string };
  const payload = (req.body ?? {}) as Record<string, unknown>;

  const headers: Record<string, unknown> = Object.fromEntries(
    Object.entries(req.headers).filter(([, v]) => v !== undefined)
  );

  const eventType            = extractString(payload, "event_type");
  const providerReference    = extractString(payload, "provider_reference");
  const transactionReference = extractString(payload, "transaction_reference");
  const signatureValid       = TRUSTED_WITHOUT_SIGNATURE.has(providerCode);

  logger.info("webhook_received", {
    provider:              providerCode,
    event_type:            eventType ?? null,
    transaction_reference: transactionReference ?? null,
    signature_valid:       signatureValid,
  });

  // ── Step 1: Persist the raw event ────────────────────────────────────────
  const insertPayload = {
    provider_code:         providerCode,
    event_type:            eventType,
    provider_reference:    providerReference,
    transaction_reference: transactionReference,
    signature_valid:       signatureValid,
  };

  let eventId: string;

  try {
    const stored = await storeWebhookEvent({
      ...insertPayload,
      payload,
      headers,
    });

    eventId = stored.id as string;
    logger.info("webhook_stored", { webhook_event_id: eventId, provider: providerCode });
  } catch (storeErr) {
    logger.error("webhook_store_failed", {
      provider: providerCode,
      error:    (storeErr as Error).message,
    });
    return next(storeErr);
  }

  // ── Step 2: Update matching transaction (optional, never fatal) ──────────
  if (transactionReference) {
    try {
      const transaction = await getTransactionByReference(transactionReference);

      if (transaction) {
        await mergeTransactionMetadata(transactionReference, {
          webhook_payload:     payload,
          webhook_received_at: new Date().toISOString(),
        });
        logger.info("webhook_transaction_metadata_updated", { reference: transactionReference });
      } else {
        logger.warn("webhook_transaction_not_found", { reference: transactionReference });
      }
    } catch (updateErr) {
      logger.error("webhook_transaction_update_failed", {
        reference: transactionReference,
        error:     (updateErr as Error).message,
      });
    }

    try {
      await markWebhookProcessed(eventId);
      logger.info("webhook_marked_processed", { webhook_event_id: eventId });
    } catch (markErr) {
      logger.error("webhook_mark_processed_failed", {
        webhook_event_id: eventId,
        error:            (markErr as Error).message,
      });
    }
  }

  res.status(200).json({ success: true, message: "Webhook received" });
}
