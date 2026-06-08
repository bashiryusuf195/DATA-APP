import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { getDbInstance } from "../../../db/knex";
import { AppError } from "../../../shared/errors/AppError";
import { isFcmConfigured } from "../services/fcm.service";

const db = getDbInstance();

const RegisterSchema = z.object({
  token:       z.string().min(10),
  platform:    z.enum(["web", "android", "ios"]).default("web"),
  device_name: z.string().max(100).optional().nullable(),
  browser:     z.string().max(100).optional().nullable(),
});

function getUserId(req: Request): string {
  const id = (req as Request & { user?: { id: string } }).user?.id;
  if (!id) throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  return id;
}

export async function registerPushTokenController(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    // Token registration only persists the browser FCM token to the database.
    // It does not call the Firebase Admin SDK, so it works regardless of whether
    // Admin credentials (FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY) are set.
    // The Admin SDK is only required when sending notifications (sendPushToUsers /
    // sendPushToAll), which already returns { disabled: true } gracefully when
    // credentials are absent.
    const userId = getUserId(req);
    const body   = RegisterSchema.parse(req.body);
    const now    = new Date();

    // Upsert: update if token already exists, insert otherwise.
    const existing = await db("user_push_tokens").where("token", body.token).first();

    const tokenPrefix = body.token.slice(0, 20);

    if (existing) {
      await db("user_push_tokens").where("token", body.token).update({
        user_id:      userId,
        platform:     body.platform,
        device_name:  body.device_name ?? existing.device_name,
        browser:      body.browser     ?? existing.browser,
        is_active:    true,
        last_seen_at: now,
        updated_at:   now,
      });
      console.log(
        `[PUSH TOKEN] Updated token for user=${userId}` +
        ` | platform=${body.platform} | browser=${body.browser ?? "?"} | token=${tokenPrefix}...`,
      );
    } else {
      await db("user_push_tokens").insert({
        user_id:      userId,
        token:        body.token,
        platform:     body.platform,
        device_name:  body.device_name ?? null,
        browser:      body.browser     ?? null,
        is_active:    true,
        last_seen_at: now,
        created_at:   now,
        updated_at:   now,
      });
      console.log(
        `[PUSH TOKEN] Inserted token for user=${userId}` +
        ` | platform=${body.platform} | browser=${body.browser ?? "?"} | token=${tokenPrefix}...`,
      );
    }

    res.json({ success: true, message: "Push token registered" });
  } catch (err) { next(err); }
}

export async function deregisterPushTokenController(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const userId = getUserId(req);
    const { token } = z.object({ token: z.string().min(10) }).parse(req.body);

    // Only deactivate tokens belonging to this user
    await db("user_push_tokens")
      .where({ token, user_id: userId })
      .update({ is_active: false, updated_at: new Date() });

    console.log(`[PUSH TOKEN] Deregistered token for user=${userId} | token=${token.slice(0, 20)}...`);
    res.json({ success: true, message: "Push token deregistered" });
  } catch (err) { next(err); }
}

export async function getPushStatusController(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const userId = getUserId(req);
    const active = await db("user_push_tokens")
      .where({ user_id: userId, is_active: true })
      .count<{ count: string }[]>("id as count")
      .first();

    res.json({
      success:       true,
      data: {
        has_active_token: parseInt(active?.count ?? "0", 10) > 0,
        configured:       isFcmConfigured(),
      },
    });
  } catch (err) { next(err); }
}
