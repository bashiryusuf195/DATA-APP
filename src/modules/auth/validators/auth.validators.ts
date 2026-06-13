// src/modules/auth/validators/auth.validators.ts
// All Zod schemas for auth request bodies.

import { z } from "zod";

// ── Shared primitives ──────────────────────────────────────────

const emailField = z
  .string({ required_error: "Email is required" })
  .email("Must be a valid email address")
  .toLowerCase()
  .trim();

const passwordField = z
  .string({ required_error: "Password is required" })
  .min(8,   "Password must be at least 8 characters")
  .max(72,  "Password must be at most 72 characters")
  .regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
    "Password must contain uppercase, lowercase, and a digit"
  );

const phoneField = z
  .string()
  .regex(/^\+[1-9]\d{6,14}$/, "Phone must be E.164 format e.g. +2348012345678")
  .optional();

const deviceFingerprintField = z.string().max(512).optional();

// ── Register ───────────────────────────────────────────────────

export const RegisterSchema = z.object({
  email:              emailField,
  password:           passwordField,
  phone:              phoneField,
  first_name:         z.string().trim().min(1).max(50).optional(),
  last_name:          z.string().trim().min(1).max(50).optional(),
  referral_code:      z.string().trim().max(20).optional(),
  device_fingerprint: deviceFingerprintField,
  device_name:        z.string().max(100).optional(),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;

// ── Login ──────────────────────────────────────────────────────

export const LoginSchema = z.object({
  identifier:         z.string({ required_error: "Email or phone number is required" }).min(1).trim(),
  password:           z.string({ required_error: "Password is required" }).min(1),
  device_fingerprint: deviceFingerprintField,
  device_name:        z.string().max(100).optional(),
  remember_me:        z.boolean().optional().default(false),
});

export type LoginInput = z.infer<typeof LoginSchema>;

// ── Logout ─────────────────────────────────────────────────────

export const LogoutSchema = z.object({
  all_devices: z.boolean().optional().default(false),
});

export type LogoutInput = z.infer<typeof LogoutSchema>;

// ── Refresh ────────────────────────────────────────────────────

export const RefreshSchema = z.object({
  refresh_token: z.string().optional(),
});

export type RefreshInput = z.infer<typeof RefreshSchema>;

// ── Forgot / Reset password ────────────────────────────────────

export const ForgotPasswordSchema = z.object({
  email: emailField,
});

export const ResetPasswordSchema = z.object({
  access_token:  z.string().min(1, "access_token is required"),
  refresh_token: z.string().min(1, "refresh_token is required"),
  password:      passwordField,
});

export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;
export type ResetPasswordInput  = z.infer<typeof ResetPasswordSchema>;

// ── Change password ────────────────────────────────────────────

export const ChangePasswordSchema = z
  .object({
    current_password: z.string({ required_error: "Current password is required" }).min(1),
    new_password:     passwordField,
    confirm_password: z.string({ required_error: "Confirm password is required" }),
  })
  .refine((d) => d.new_password === d.confirm_password, {
    message: "Passwords do not match",
    path:    ["confirm_password"],
  })
  .refine((d) => d.current_password !== d.new_password, {
    message: "New password must differ from current password",
    path:    ["new_password"],
  });

export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;
