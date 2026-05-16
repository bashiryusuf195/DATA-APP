import { randomUUID } from "crypto";
import { getDbInstance } from "../../../db/knex";
import type { NotificationChannel } from "./notification.service";

const db = getDbInstance();

export interface NotificationPreferences {
  id:                  string;
  user_id:             string;
  email_enabled:       boolean;
  sms_enabled:         boolean;
  push_enabled:        boolean;
  transaction_alerts:  boolean;
  security_alerts:     boolean;
  marketing_messages:  boolean;
  created_at:          Date;
  updated_at:          Date;
}

export type UpdatePreferencesInput = Partial<Pick<
  NotificationPreferences,
  | "email_enabled"
  | "sms_enabled"
  | "push_enabled"
  | "transaction_alerts"
  | "security_alerts"
  | "marketing_messages"
>>;

// ── Get or create ─────────────────────────────────────────────────────────────

export async function getOrCreateNotificationPreferences(
  userId: string
): Promise<NotificationPreferences> {
  const now = new Date();

  // Attempt insert; ignore conflict on unique user_id.
  await db("notification_preferences")
    .insert({
      id:                 randomUUID(),
      user_id:            userId,
      email_enabled:      true,
      sms_enabled:        false,
      push_enabled:       false,
      transaction_alerts: true,
      security_alerts:    true,
      marketing_messages: false,
      created_at:         now,
      updated_at:         now,
    })
    .onConflict("user_id")
    .ignore();

  return db("notification_preferences")
    .where({ user_id: userId })
    .first() as Promise<NotificationPreferences>;
}

// ── Update ────────────────────────────────────────────────────────────────────

export async function updateNotificationPreferences(
  userId: string,
  input: UpdatePreferencesInput
): Promise<NotificationPreferences> {
  // Ensure the row exists before updating.
  await getOrCreateNotificationPreferences(userId);

  const [updated] = await db("notification_preferences")
    .where({ user_id: userId })
    .update({ ...input, updated_at: new Date() })
    .returning("*");

  return updated as NotificationPreferences;
}

// ── Preference gate ───────────────────────────────────────────────────────────

type NotificationCategory = "transaction" | "security" | "marketing" | "system";

function classifyType(notificationType: string): NotificationCategory {
  const t = notificationType.toLowerCase();
  if (/purchase|transaction|refund|payment|airtime|data|cable|electricity|wallet|transfer/.test(t)) {
    return "transaction";
  }
  if (/security|login|password|otp|2fa|session|logout|auth|suspicious/.test(t)) {
    return "security";
  }
  if (/marketing|promo|offer|deal|discount|campaign|newsletter/.test(t)) {
    return "marketing";
  }
  return "system";
}

export async function shouldNotify(
  userId: string,
  notificationType: string,
  channel: NotificationChannel
): Promise<boolean> {
  const prefs = await getOrCreateNotificationPreferences(userId);

  // Channel checks
  if (channel === "email" && !prefs.email_enabled) return false;
  if (channel === "sms"   && !prefs.sms_enabled)   return false;
  if (channel === "push"  && !prefs.push_enabled)   return false;
  // in_app: no channel-level toggle — only category applies

  // Category checks
  const category = classifyType(notificationType);
  if (category === "transaction" && !prefs.transaction_alerts)  return false;
  if (category === "security"    && !prefs.security_alerts)     return false;
  if (category === "marketing"   && !prefs.marketing_messages)  return false;
  // "system" category always passes

  return true;
}
