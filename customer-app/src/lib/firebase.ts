// Firebase client SDK — lazily initialised.
// Returns null (not throws) when env vars are not configured so the rest of
// the app is never broken by a missing VITE_FIREBASE_* variable.

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getMessaging, type Messaging } from "firebase/messaging";

const {
  VITE_FIREBASE_API_KEY:               apiKey,
  VITE_FIREBASE_AUTH_DOMAIN:           authDomain,
  VITE_FIREBASE_PROJECT_ID:            projectId,
  VITE_FIREBASE_MESSAGING_SENDER_ID:   messagingSenderId,
  VITE_FIREBASE_APP_ID:                appId,
} = import.meta.env;

export const VAPID_KEY: string = import.meta.env.VITE_FIREBASE_VAPID_KEY ?? "";

function isConfigured(): boolean {
  return Boolean(apiKey && projectId && messagingSenderId && appId);
}

let _app: FirebaseApp | null = null;

export function getFirebaseApp(): FirebaseApp | null {
  if (!isConfigured()) return null;
  if (_app) return _app;
  const existing = getApps().find((a) => a.name === "[DEFAULT]");
  if (existing) { _app = existing; return _app; }
  _app = initializeApp({ apiKey, authDomain, projectId, messagingSenderId, appId });
  console.log('[FIREBASE] App initialised | project:', projectId);
  return _app;
}

let _messaging: Messaging | null = null;

export function getFirebaseMessaging(): Messaging | null {
  const app = getFirebaseApp();
  if (!app) return null;
  try {
    if (_messaging) return _messaging;
    _messaging = getMessaging(app);
    return _messaging;
  } catch {
    return null;
  }
}
