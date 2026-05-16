import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import {
  getOrCreateNotificationPreferences,
  updateNotificationPreferences,
} from "../services/notification-preferences.service";

const UpdatePreferencesSchema = z
  .object({
    email_enabled:      z.boolean(),
    sms_enabled:        z.boolean(),
    push_enabled:       z.boolean(),
    transaction_alerts: z.boolean(),
    security_alerts:    z.boolean(),
    marketing_messages: z.boolean(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one preference field must be provided",
  });

export async function getPreferencesController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const prefs = await getOrCreateNotificationPreferences(req.user!.id);
    res.status(200).json({ success: true, data: prefs });
  } catch (err) {
    next(err);
  }
}

export async function updatePreferencesController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const input = UpdatePreferencesSchema.parse(req.body);
    const prefs = await updateNotificationPreferences(req.user!.id, input);
    res.status(200).json({ success: true, data: prefs });
  } catch (err) {
    next(err);
  }
}
