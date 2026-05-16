import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { listAdminNotifications } from "../services/notification.service";

const AdminQuerySchema = z.object({
  limit:   z.coerce.number().int().min(1).max(100).default(20),
  offset:  z.coerce.number().int().min(0).default(0),
  channel: z.enum(["email", "sms", "in_app", "push", "webhook"]).optional(),
  type:    z.string().min(1).optional(),
  status:  z.enum(["pending", "sent", "failed", "read"]).optional(),
});

export async function listAdminNotificationsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const query         = AdminQuerySchema.parse(req.query);
    const notifications = await listAdminNotifications(query);

    res.status(200).json({
      success: true,
      data:    notifications,
      meta:    { limit: query.limit, offset: query.offset },
    });
  } catch (err) {
    next(err);
  }
}
