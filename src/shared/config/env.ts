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
};