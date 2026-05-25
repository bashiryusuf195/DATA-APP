import { randomUUID } from "crypto";
import { getDbInstance } from "../../../db/knex";
import { shouldNotify } from "./notification-preferences.service";

const db = getDbInstance();

export type NotificationChannel = "email" | "sms" | "in_app" | "push" | "webhook";
export type NotificationStatus  = "pending" | "sent" | "failed" | "read";

export interface CreateNotificationInput {
  user_id?:          string | null;
  channel:           NotificationChannel;
  type:              string;
  title:             string;
  message:           string;
  metadata?:         Record<string, unknown>;
  notification_key?: string | null;
}

// ── Create ────────────────────────────────────────────────────────────────────
// Returns the new notification id, or null when suppressed by user preferences.
// Preference lookup failures are logged and treated as "allow" so they never
// block transaction processing.

export async function createNotification(
  input: CreateNotificationInput
): Promise<string | null> {
  // null user_id means system/admin notification — bypass user preferences.
  if (input.user_id) {
    try {
      const allowed = await shouldNotify(input.user_id, input.type, input.channel);
      if (!allowed) return null;
    } catch (err) {
      console.error(
        "[NOTIFICATION] Preference check failed — proceeding with notification:",
        (err as Error).message
      );
    }
  }
  return createNotificationIdempotent({ ...input, notification_key: input.notification_key ?? null });
}

// ── Idempotent create ─────────────────────────────────────────────────────────
// Pass a notification_key (e.g. "purchase_successful:REF-123") to prevent
// duplicate rows when the caller is retried.  If a row with the same key
// already exists in metadata, the existing id is returned without a new INSERT.

export async function createNotificationIdempotent(
  input: CreateNotificationInput & { notification_key: string | null }
): Promise<string> {
  if (input.notification_key) {
    const existing = await db("notifications")
      .whereRaw("metadata->>'notification_key' = ?", [input.notification_key])
      .first("id");
    if (existing) return existing.id as string;
  }

  return _insertNotification({
    ...input,
    metadata: input.notification_key
      ? { ...input.metadata, notification_key: input.notification_key }
      : input.metadata,
  });
}

async function _insertNotification(
  input: CreateNotificationInput
): Promise<string> {
  const now = new Date();

  // in_app notifications are readable directly from the DB — immediately "sent".
  // email/sms/webhook would need a delivery queue.
  const isImmediate = input.channel === "in_app";
  const status: NotificationStatus = isImmediate ? "sent" : "pending";

  const id = randomUUID();
  await db("notifications").insert({
    id,
    user_id:    input.user_id ?? null,
    channel:    input.channel,
    type:       input.type,
    title:      input.title,
    message:    input.message,
    body:       input.message,   // mirrors message; satisfies legacy NOT NULL body column
    status,
    metadata:   JSON.stringify(input.metadata ?? {}),
    sent_at:    isImmediate ? now : null,
    read_at:    null,
    created_at: now,
    updated_at: now,
  });

  return id;
}

// ── Mark as read ──────────────────────────────────────────────────────────────

export async function markAsRead(
  notificationId: string,
  userId: string
): Promise<boolean> {
  const now   = new Date();
  const count = await db("notifications")
    .where({ id: notificationId, user_id: userId })
    .whereNot("status", "read")
    .update({ status: "read", read_at: now, updated_at: now });
  return count > 0;
}

// ── User inbox — in_app channel only ─────────────────────────────────────────

export async function listUserNotifications(
  userId: string,
  options: {
    limit:   number;
    offset:  number;
    status?: string;
  }
) {
  return db("notifications")
    .where({ user_id: userId, channel: "in_app" })
    .modify((q) => {
      if (options.status) q.where("status", options.status);
    })
    .orderBy("created_at", "desc")
    .limit(options.limit)
    .offset(options.offset);
}

// ── Admin view — all channels, filterable ─────────────────────────────────────

export async function listAdminNotifications(options: {
  limit:    number;
  offset:   number;
  channel?: string;
  type?:    string;
  status?:  string;
}) {
  return db("notifications")
    .modify((q) => {
      if (options.channel) q.where("channel", options.channel);
      if (options.type)    q.where("type",    options.type);
      if (options.status)  q.where("status",  options.status);
    })
    .orderBy("created_at", "desc")
    .limit(options.limit)
    .offset(options.offset);
}
