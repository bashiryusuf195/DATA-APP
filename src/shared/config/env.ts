export const env = {
  BCRYPT_ROUNDS: Number(process.env.BCRYPT_ROUNDS ?? 12),
  MAX_FAILED_LOGINS: Number(process.env.MAX_FAILED_LOGINS ?? 5),
  LOCKOUT_MINUTES: Number(process.env.LOCKOUT_MINUTES ?? 15),

  SUPABASE_URL: process.env.SUPABASE_URL ?? "",
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? "",
  SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  SUPABASE_JWT_SECRET: process.env.SUPABASE_JWT_SECRET ?? "",

  // Customer-facing frontend URL — used as the redirectTo base in password-reset emails.
  CUSTOMER_APP_URL: process.env.CUSTOMER_APP_URL ?? "http://localhost:5174",

  // HMAC key used server-side to hash biometric device secrets before storage.
  // Must be set in production; in dev a fallback is used so the server starts.
  BIOMETRIC_HMAC_SECRET: process.env.BIOMETRIC_HMAC_SECRET ?? "dev-biometric-hmac-secret-change-in-prod",

  // HS256 signing secret for biometric-issued JWTs.
  // Separate from SUPABASE_JWT_SECRET (which is RS256 JWKS-verified).
  // Must be set in production (min 32 chars); dev fallback keeps server startable.
  BACKEND_JWT_SECRET: process.env.BACKEND_JWT_SECRET ?? "dev-backend-jwt-secret-change-in-prod-min-32-chars",
};