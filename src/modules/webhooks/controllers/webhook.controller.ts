import type { Request, Response, NextFunction } from "express";

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

  // ── Diagnostic log: confirm route was entered ─────────────────────────────
  console.log(
    "[WEBHOOK] Route hit",
    "| provider:", providerCode,
    "| event_type:", eventType ?? "none",
    "| transaction_reference:", transactionReference ?? "none",
    "| signature_valid:", signatureValid
  );

  // ── Step 1: Persist the raw event ────────────────────────────────────────
  // NOT wrapped in a catch-all — if the INSERT fails the real DB error
  // propagates to Express's error handler and is returned to the caller.
  // This is intentional: a swallowed 200 makes DB problems invisible.
  const insertPayload = {
    provider_code:         providerCode,
    event_type:            eventType,
    provider_reference:    providerReference,
    transaction_reference: transactionReference,
    signature_valid:       signatureValid,
  };

  console.log("[WEBHOOK] Insert payload:", JSON.stringify(insertPayload));

  let eventId: string;

  try {
    const stored = await storeWebhookEvent({
      ...insertPayload,
      payload,
      headers,
    });

    eventId = stored.id as string;
    console.log("[WEBHOOK] Inserted row id:", eventId);
  } catch (storeErr) {
    // Surface the real error — do NOT return 200 here.
    console.error("[WEBHOOK] storeWebhookEvent FAILED:", storeErr);
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
        console.log("[WEBHOOK] Transaction metadata updated:", transactionReference);
      } else {
        console.warn(
          "[WEBHOOK] transaction_reference not found — no metadata update:",
          transactionReference
        );
      }
    } catch (updateErr) {
      console.error(
        "[WEBHOOK] Failed to update transaction metadata (non-fatal):",
        transactionReference,
        updateErr
      );
    }

    // Mark processed whenever an update was attempted — requirement 5.
    try {
      await markWebhookProcessed(eventId);
      console.log("[WEBHOOK] Marked processed:", eventId);
    } catch (markErr) {
      console.error("[WEBHOOK] Failed to mark processed (non-fatal):", eventId, markErr);
    }
  }

  res.status(200).json({ success: true, message: "Webhook received" });
}
