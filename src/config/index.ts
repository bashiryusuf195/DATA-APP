// src/config/index.ts
//
// Single source of truth for all environment variables.
// Every other file imports from here — never from process.env directly.
// If a required variable is missing, the server crashes immediately with a
// clear message rather than failing silently later.

import dotenv from 'dotenv';
dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `\n[CONFIG ERROR] Missing required environment variable: "${name}"\n` +
      `→ Copy .env.example to .env and fill in the value.\n`
    );
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const config = {
  // ── App ────────────────────────────────────────────────────────────────────
  env:        optional('NODE_ENV',     'development'),
  port:       parseInt(optional('PORT', '3000'), 10),
  appName:    optional('APP_NAME',     'vtu-api'),
  appVersion: optional('APP_VERSION',  '1.0.0'),

  // Convenience booleans — used throughout the codebase
  isDev:  optional('NODE_ENV', 'development') === 'development',
  isProd: optional('NODE_ENV', 'development') === 'production',

  // ── Supabase ───────────────────────────────────────────────────────────────
  supabase: {
    url:            required('SUPABASE_URL'),
    anonKey:        required('SUPABASE_ANON_KEY'),
    serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  },

  // ── Database (Knex / raw SQL) ──────────────────────────────────────────────
  database: {
    writeUrl: required('DATABASE_URL'),
    // Falls back to the write URL in development (same DB)
    readUrl:  optional('DATABASE_READ_URL', process.env['DATABASE_URL'] ?? ''),
  },

  // ── Redis ──────────────────────────────────────────────────────────────────
  redis: {
    url: required('REDIS_URL'),
  },

  // ── Auth ───────────────────────────────────────────────────────────────────
  jwt: {
    secret: required('JWT_SECRET'),
  },

  // ── Encryption ─────────────────────────────────────────────────────────────
  encryption: {
    key: required('ENCRYPTION_KEY'),
  },

  // ── Rate Limiting ──────────────────────────────────────────────────────────
  rateLimit: {
    windowMs: parseInt(optional('RATE_LIMIT_WINDOW_MS', '60000'), 10),
    max:      parseInt(optional('RATE_LIMIT_MAX',       '60'),    10),
  },

  // ── CORS ───────────────────────────────────────────────────────────────────
  corsOrigins: optional('CORS_ORIGINS', 'http://localhost:3001')
    .split(',')
    .map(o => o.trim()),

  // ── Logging ────────────────────────────────────────────────────────────────
  logLevel: optional('LOG_LEVEL', 'info'),

  // ── VTPass ─────────────────────────────────────────────────────────────────
  // All optional — system falls back to mock provider when absent.
  // Populate VTPASS_* env vars to enable the live adapter.
  vtpass: {
    baseUrl:   optional('VTPASS_BASE_URL',   ''),
    username:  optional('VTPASS_USERNAME',   ''),
    password:  optional('VTPASS_PASSWORD',   ''),
    apiKey:    optional('VTPASS_API_KEY',    ''),
    publicKey: optional('VTPASS_PUBLIC_KEY', ''),
    secretKey: optional('VTPASS_SECRET_KEY', ''),
  },

  // ── Paystack ───────────────────────────────────────────────────────────────
  // All optional — wallet funding endpoint will return 503 if absent.
  // Populate PAYSTACK_* env vars to enable live funding.
  paystack: {
    secretKey:     optional('PAYSTACK_SECRET_KEY',     ''),
    publicKey:     optional('PAYSTACK_PUBLIC_KEY',     ''),
    baseUrl:       optional('PAYSTACK_BASE_URL',        'https://api.paystack.co'),
    callbackUrl:   optional('PAYSTACK_CALLBACK_URL',   ''),
    webhookSecret: optional('PAYSTACK_WEBHOOK_SECRET', ''),
  },

  // ── Squad (production) ────────────────────────────────────────────────────
  // All optional — wallet funding endpoint will return 503 if absent.
  // Production base URL: see Squad dashboard.
  squad: {
    secretKey:          optional('SQUAD_SECRET_KEY',          ''),
    publicKey:          optional('SQUAD_PUBLIC_KEY',          ''),
    baseUrl:            optional('SQUAD_BASE_URL',             'https://sandbox-api-d.squadco.com'),
    callbackUrl:        optional('SQUAD_CALLBACK_URL',        ''),
    webhookSecret:      optional('SQUAD_WEBHOOK_SECRET',      ''),
    // Settlement account: the merchant bank account where DVA inflows settle.
    // Required for POST /virtual-account — set in Squad dashboard then copy here.
    beneficiaryAccount: optional('SQUAD_BENEFICIARY_ACCOUNT', ''),
  },

  // ── Squad sandbox (UAT only) ───────────────────────────────────────────────
  // Separate credentials for UAT testing against Squad's sandbox environment.
  // Both SQUAD_SANDBOX_SECRET_KEY and SQUAD_SANDBOX_BASE_URL MUST be explicitly
  // set — there is no fallback to production values. UAT endpoints return 503
  // (SQUAD_SANDBOX_NOT_CONFIGURED) if either variable is absent.
  squadSandbox: {
    secretKey:          optional('SQUAD_SANDBOX_SECRET_KEY',          ''),
    publicKey:          optional('SQUAD_SANDBOX_PUBLIC_KEY',          ''),
    baseUrl:            optional('SQUAD_SANDBOX_BASE_URL',            ''),
    beneficiaryAccount: optional('SQUAD_SANDBOX_BENEFICIARY_ACCOUNT', ''),
  },

  // ── WebAuthn / Passkeys ────────────────────────────────────────────────────
  // rpId: the domain (no protocol/port). Must match the origin's hostname.
  // origin: the exact URL the frontend is served from.
  // Defaults are for local development; override in production env vars.
  webauthn: {
    rpId:     optional("WEBAUTHN_RP_ID",     "localhost"),
    rpName:   optional("WEBAUTHN_RP_NAME",   "VTU Platform"),
    origin:   optional("WEBAUTHN_ORIGIN",    "http://localhost:5174"),
  },

  // ── Firebase / FCM ────────────────────────────────────────────────────────
  // All optional — push notifications are silently skipped when absent.
  // Set FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY
  // (and FIREBASE_VAPID_KEY for web push) to enable FCM.
  firebase: {
    projectId:   optional('FIREBASE_PROJECT_ID',   ''),
    clientEmail: optional('FIREBASE_CLIENT_EMAIL', ''),
    // Railway/Render store multi-line values URL-encoded; restore newlines.
    privateKey:  optional('FIREBASE_PRIVATE_KEY',  '').replace(/\\n/g, '\n'),
    vapidKey:    optional('FIREBASE_VAPID_KEY',    ''),
  },

  // ── Workers ───────────────────────────────────────────────────────────────
  // Set DISABLE_WORKERS=true to prevent BullMQ workers from starting.
  // Useful when developing the frontend against the API without local Redis.
  // API routes still respond; background jobs are simply not processed.
  workers: {
    disabled: optional('DISABLE_WORKERS', 'false') === 'true',
  },

  // ── SecureIDVerify portal automation (temporary PDF slip solution) ─────────
  // When SECUREIDVERIFY_USE_PORTAL_PDF=true the worker logs into the
  // SecureIDVerify web portal via Playwright to download the official PDF slip
  // after a successful API verification.  Set to false to use the template-
  // rendered PDF only (existing behaviour).
  // Credentials are loaded from env vars only — never from code or DB.
  secureidverifyPortal: {
    usePdf:     optional('SECUREIDVERIFY_USE_PORTAL_PDF',    'false') === 'true',
    url:        optional('SECUREIDVERIFY_PORTAL_URL',        ''),
    username:   optional('SECUREIDVERIFY_PORTAL_USERNAME',   ''),
    password:   optional('SECUREIDVERIFY_PORTAL_PASSWORD',   ''),
    timeoutMs:  parseInt(optional('SECUREIDVERIFY_PORTAL_TIMEOUT_MS', '120000'), 10),
  },
} as const;
