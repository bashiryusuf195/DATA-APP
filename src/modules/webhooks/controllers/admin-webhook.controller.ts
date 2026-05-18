import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { getWebhookEvents, getWebhookDiagnostics } from "../services/webhook.service";
import { logger } from "../../../lib/logger";

const QuerySchema = z.object({
  limit:         z.coerce.number().int().min(1).max(100).default(20),
  offset:        z.coerce.number().int().min(0).default(0),
  provider_code: z.string().min(1).optional(),
  event_type:    z.string().min(1).optional(),
});

// Derives the frontend-facing status from the stored boolean flags.
function deriveStatus(
  processed: boolean,
  signatureValid: boolean,
  eventType: string | null,
): "processed" | "failed" | "unhandled" | "pending" {
  if (processed)      return "processed";
  if (!signatureValid) return "failed";
  if (eventType && eventType !== "charge.success") return "unhandled";
  return "pending";
}

export async function listWebhookEventsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const query = QuerySchema.parse(req.query);

    logger.info("admin_webhook_events_query", {
      limit:         query.limit,
      offset:        query.offset,
      provider_code: query.provider_code ?? "all",
      event_type:    query.event_type    ?? "all",
    });

    const rows = await getWebhookEvents({
      limit:         query.limit,
      offset:        query.offset,
      provider_code: query.provider_code,
      event_type:    query.event_type,
    });

    // Map raw DB rows to the shape expected by the frontend WebhookEvent type.
    // DB columns:     provider_code, transaction_reference, signature_valid, processed
    // Frontend fields: source,        reference,             signature_valid, status (derived)
    const data = rows.map((row: Record<string, unknown>) => {
      const r = row;
      return {
        id:              r.id,
        source:          r.provider_code,
        event_type:      r.event_type ?? null,
        reference:       r.transaction_reference ?? null,
        status:          deriveStatus(
          Boolean(r.processed),
          Boolean(r.signature_valid),
          typeof r.event_type === "string" ? r.event_type : null,
        ),
        signature_valid: Boolean(r.signature_valid),
        payload:         r.payload ?? {},
        error_message:   null,
        created_at:      r.created_at,
        processed_at:    r.processed_at ?? null,
      };
    });

    logger.info("admin_webhook_events_result", { count: data.length });

    res.status(200).json({
      success: true,
      data,
      meta: { limit: query.limit, offset: query.offset },
    });
  } catch (err) {
    next(err);
  }
}

// ── GET /admin/webhook-events/diagnostics ────────────────────────────────────

export async function webhookDiagnosticsController(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    logger.info("admin_webhook_diagnostics_query");
    const data = await getWebhookDiagnostics();
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
