export const env = {
  BCRYPT_ROUNDS: Number(process.env.BCRYPT_ROUNDS ?? 12),
  MAX_FAILED_LOGINS: Number(process.env.MAX_FAILED_LOGINS ?? 5),
  LOCKOUT_MINUTES: Number(process.env.LOCKOUT_MINUTES ?? 15),

  SUPABASE_URL: process.env.SUPABASE_URL ?? "",
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? "",
  SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  SUPABASE_JWT_SECRET: process.env.SUPABASE_JWT_SECRET ?? "",
};