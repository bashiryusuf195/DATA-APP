// src/lib/crypto.ts
//
// Encryption helpers for Personally Identifiable Information (PII).
// NIN and BVN must be encrypted before being stored in the database.
//
// Algorithm: AES-256-GCM
//   "Authenticated" encryption — detects if the ciphertext has been tampered with.
//   Each call produces a unique result (random IV) so two identical
//   values look different in the database.
//
// PIN hashing uses bcrypt (one-way — can verify but cannot reverse).

import crypto from 'crypto';
import bcrypt  from 'bcrypt';
import { config } from '../config';

const ALGORITHM  = 'aes-256-gcm';
const IV_BYTES   = 16;
const TAG_BYTES  = 16;

// Key must be exactly 32 bytes (64 hex characters in .env)
const KEY = Buffer.from(config.encryption.key, 'hex');

// ── Symmetric encryption (reversible) ─────────────────────────────────────────

/**
 * Encrypt a plaintext string.
 * Returns a single colon-delimited string: ivHex:authTagHex:ciphertextHex
 */
export function encrypt(plaintext: string): string {
  const iv        = crypto.randomBytes(IV_BYTES);
  const cipher    = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [iv.toString('hex'), authTag.toString('hex'), encrypted.toString('hex')].join(':');
}

/**
 * Decrypt a string produced by `encrypt()`.
 * Throws if the ciphertext has been tampered with.
 */
export function decrypt(encryptedStr: string): string {
  const parts = encryptedStr.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted string format.');

  const [ivHex, authTagHex, encHex] = parts as [string, string, string];
  const iv        = Buffer.from(ivHex,       'hex');
  const authTag   = Buffer.from(authTagHex,  'hex');
  const encrypted = Buffer.from(encHex,      'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(authTag);

  return decipher.update(encrypted).toString('utf8') + decipher.final('utf8');
}

// ── PIN hashing (one-way) ─────────────────────────────────────────────────────

/** Hash a 4-digit transaction PIN. Cost factor 12 ≈ 300ms — strong but usable. */
export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 12);
}

/** Verify a plain PIN against a stored bcrypt hash. */
export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}

// ── Misc ──────────────────────────────────────────────────────────────────────

/** Generate a cryptographically random UUID v4. */
export function generateId(): string {
  return crypto.randomUUID();
}
import { createHash } from "crypto";

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function deriveDeviceFingerprint(data: {
  userAgent?: unknown;
  acceptLanguage?: string;
  ip?: string;
  extra?: string;
}): string {
  return sha256(JSON.stringify(data));
}