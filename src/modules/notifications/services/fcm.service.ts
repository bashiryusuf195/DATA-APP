// FCM service — wraps Firebase Admin SDK for push notification delivery.
// All exported functions return gracefully when Firebase credentials are not
// configured so the rest of the app is never blocked by missing env vars.

import type { App as FirebaseApp } from "firebase-admin/app";
import { config } from "../../../config";
import { getDbInstance } from "../../../db/knex";
import { shouldNotify } from "./notification-preferences.service";

const db = getDbInstance();

// ── Lazy Firebase initialisation ──────────────────────────────────────────────

let _app: FirebaseApp | null = null;
let _initAttempted = false;

function getFirebaseApp(): FirebaseApp | null {
  if (_initAttempted) return _app;
  _initAttempted = true;

  const { projectId, clientEmail, privateKey } = config.firebase;
  if (!projectId || !clientEmail || !privateKey) {
    console.warn("[FCM] Firebase credentials not configured — push notifications disabled");
    return null;
  }

  try {
    const { initializeApp, getApps, cert } = require("firebase-admin/app") as typeof import("firebase-admin/app");
    const existing = getApps().find((a) => a.name === "hive-fcm");
    if (existing) { _app = existing; return _app; }
    _app = initializeApp(
      { credential: cert({ projectId, clientEmail, privateKey }) },
      "hive-fcm",
    );
    console.log("[FCM] Firebase Admin SDK initialised");
  } catch (err) {
    console.error("[FCM] Failed to initialise Firebase Admin SDK:", (err as Error).message);
    _app = null;
  }
  return _app;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PushPayload {
  title:             string;
  body:              string;
  icon?:             string;
  badge?:            string;
  image?:            string;
  deep_link?:        string;
  notification_type: string;
  tag?:              string; // collapses duplicate notifications for the same event
  reference?:        string; // transaction / funding reference for deep-link context
  metadata?:         Record<string, string>;
}

export interface PushResult {
  sent:     number;
  failed:   number;
  disabled: boolean; // true when Firebase not configured
}

// ── Token management ──────────────────────────────────────────────────────────

async function markTokensInactive(tokens: string[]): Promise<void> {
  if (!tokens.length) return;
  console.log(
    `[FCM] Deactivating ${tokens.length} invalid token(s): ` +
    tokens.map((t) => t.slice(0, 20) + "...").join(", "),
  );
  await db("user_push_tokens")
    .whereIn("token", tokens)
    .update({ is_active: false, updated_at: new Date() });
  console.log(`[FCM] ${tokens.length} token(s) marked inactive`);
}

// ── Core send ─────────────────────────────────────────────────────────────────

// Send to up to 500 tokens at once (FCM limit for sendEachForMulticast).
async function sendBatch(
  app: FirebaseApp,
  tokens: string[],
  payload: PushPayload,
): Promise<{ sent: number; failed: number; invalidTokens: string[] }> {
  const { getMessaging } = require("firebase-admin/messaging") as typeof import("firebase-admin/messaging");
  const messaging = getMessaging(app);

  const deepLink = payload.deep_link ?? "/notifications";
  const tag      = payload.tag ?? `${payload.notification_type}${payload.reference ? `:${payload.reference}` : ""}`;

  const message = {
    tokens,
    notification: {
      title: payload.title,
      body:  payload.body,
      ...(payload.image ? { imageUrl: payload.image } : {}),
    },
    webpush: {
      notification: {
        title: payload.title,
        body:  payload.body,
        icon:  payload.icon  ?? "/icons/icon-192x192.png",
        badge: payload.badge ?? "/icons/badge-72x72.png",
        tag,
        ...(payload.image ? { image: payload.image } : {}),
      },
      data: {
        deep_link:         deepLink,
        notification_type: payload.notification_type ?? "broadcast",
        reference:         payload.reference ?? "",
        tag,
      },
      fcmOptions: {
        link: deepLink,
      },
    },
    android: {
      notification: {
        title:        payload.title,
        body:         payload.body,
        icon:         payload.icon ?? "ic_notification",
        clickAction:  "FLUTTER_NOTIFICATION_CLICK",
        ...(payload.image ? { imageUrl: payload.image } : {}),
      },
      data: {
        deep_link:         deepLink,
        notification_type: payload.notification_type ?? "broadcast",
        reference:         payload.reference ?? "",
        tag,
        ...(payload.metadata ?? {}),
      },
    },
    data: {
      deep_link:         deepLink,
      notification_type: payload.notification_type ?? "broadcast",
      reference:         payload.reference ?? "",
      tag,
      ...(payload.metadata ?? {}),
    },
  };

  console.log(`[FCM] Dispatching batch of ${tokens.length} token(s) | title="${payload.title}"`);
  const response = await messaging.sendEachForMulticast(message);
  console.log(
    `[FCM] FCM response | successCount=${response.successCount}` +
    ` failureCount=${response.failureCount} batchSize=${tokens.length}`,
  );

  let sent = 0;
  const invalidTokens: string[] = [];

  response.responses.forEach((r, i) => {
    if (r.success) {
      sent++;
    } else {
      const code    = r.error?.code    ?? "unknown";
      const message = r.error?.message ?? "";
      console.warn(
        `[FCM] Token failed | code=${code} | message=${message}` +
        ` | token=${tokens[i].slice(0, 20)}...`,
      );
      // These codes mean the token is no longer valid and should be deactivated.
      if (
        code === "messaging/invalid-registration-token" ||
        code === "messaging/registration-token-not-registered" ||
        code === "messaging/invalid-argument"
      ) {
        invalidTokens.push(tokens[i]);
      }
    }
  });

  return { sent, failed: response.failureCount, invalidTokens };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload,
): Promise<PushResult> {
  const app = getFirebaseApp();
  if (!app) return { sent: 0, failed: 0, disabled: true };

  const rows = await db("user_push_tokens")
    .whereIn("user_id", userIds)
    .where("is_active", true)
    .select("token");

  console.log(
    `[FCM] sendPushToUsers | userIds=${userIds.length} | active_tokens=${rows.length}`,
  );
  if (!rows.length) return { sent: 0, failed: 0, disabled: false };

  const tokens     = rows.map((r: { token: string }) => r.token);
  const BATCH_SIZE = 500;

  let totalSent   = 0;
  let totalFailed = 0;
  const allInvalid: string[] = [];

  for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
    const batch = tokens.slice(i, i + BATCH_SIZE);
    const res   = await sendBatch(app, batch, payload);
    totalSent   += res.sent;
    totalFailed += res.failed;
    allInvalid.push(...res.invalidTokens);
  }

  if (allInvalid.length) await markTokensInactive(allInvalid);

  return { sent: totalSent, failed: totalFailed, disabled: false };
}

export async function sendPushToAll(payload: PushPayload): Promise<PushResult> {
  const app = getFirebaseApp();
  if (!app) return { sent: 0, failed: 0, disabled: true };

  const rows = await db("user_push_tokens")
    .where("is_active", true)
    .select("token");

  console.log(`[FCM] sendPushToAll | active_tokens=${rows.length}`);
  if (!rows.length) return { sent: 0, failed: 0, disabled: false };

  const tokens     = rows.map((r: { token: string }) => r.token);
  const BATCH_SIZE = 500;

  let totalSent   = 0;
  let totalFailed = 0;
  const allInvalid: string[] = [];

  for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
    const batch = tokens.slice(i, i + BATCH_SIZE);
    const res   = await sendBatch(app, batch, payload);
    totalSent   += res.sent;
    totalFailed += res.failed;
    allInvalid.push(...res.invalidTokens);
  }

  if (allInvalid.length) await markTokensInactive(allInvalid);

  return { sent: totalSent, failed: totalFailed, disabled: false };
}

export function isFcmConfigured(): boolean {
  const { projectId, clientEmail, privateKey } = config.firebase;
  return Boolean(projectId && clientEmail && privateKey);
}

// Send a push notification to a single user, gated by their notification preferences.
// Safe to call fire-and-forget — catches all errors internally.
export async function sendTransactionPush(
  userId: string,
  type:   string,
  payload: PushPayload,
): Promise<void> {
  try {
    const allowed = await shouldNotify(userId, type, "push");
    if (!allowed) {
      console.log(`[FCM] push skipped | user=${userId} type=${type} reason=preference_gate`);
      return;
    }
    const result = await sendPushToUsers([userId], payload);
    console.log(
      `[FCM] transaction push | user=${userId} type=${type}` +
      ` sent=${result.sent} failed=${result.failed} disabled=${result.disabled}`,
    );
  } catch (err) {
    console.error(
      `[FCM] sendTransactionPush error | user=${userId} type=${type}: ${(err as Error).message}`,
    );
  }
}
