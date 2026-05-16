import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { getWebhookEvents } from "../services/webhook.service";

const QuerySchema = z.object({
  limit:         z.coerce.number().int().min(1).max(100).default(20),
  offset:        z.coerce.number().int().min(0).default(0),
  provider_code: z.string().min(1).optional(),
});

export async function listWebhookEventsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const query = QuerySchema.parse(req.query);

    console.log(
      "[WEBHOOK ADMIN] Querying webhook_events",
      "| limit:", query.limit,
      "| offset:", query.offset,
      "| provider_code:", query.provider_code ?? "all"
    );

    const events = await getWebhookEvents(query);

    console.log("[WEBHOOK ADMIN] Found:", events.length, "rows");

    res.status(200).json({
      success: true,
      data:    events,
      meta:    { limit: query.limit, offset: query.offset },
    });
  } catch (err) {
    next(err);
  }
}
