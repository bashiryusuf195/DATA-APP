import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import {
  listUserNotifications,
  markAsRead,
} from "../services/notification.service";

const ListQuerySchema = z.object({
  limit:  z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(["pending", "sent", "failed", "read"]).optional(),
});

export async function listNotificationsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const query         = ListQuerySchema.parse(req.query);
    const notifications = await listUserNotifications(req.user!.id, query);

    res.status(200).json({
      success: true,
      data:    notifications,
      meta:    { limit: query.limit, offset: query.offset },
    });
  } catch (err) {
    next(err);
  }
}

export async function markNotificationReadController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id }  = req.params;
    const userId  = req.user!.id;
    const updated = await markAsRead(id, userId);

    if (!updated) {
      res.status(404).json({
        success: false,
        error:   "Notification not found or already read",
      });
      return;
    }

    res.status(200).json({ success: true, message: "Notification marked as read" });
  } catch (err) {
    next(err);
  }
}
