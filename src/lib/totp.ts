/**
 * Pure-Node TOTP implementation (RFC 6238 / HOTP RFC 4226).
 * No external dependencies — uses built-in `crypto` only.
 */

import { createHmac, randomBytes, createHash } from "crypto";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/=+$/, "");
  const bytes: number[] = [];
  let bits = 0;
  let val  = 0;
  for (const c of clean) {
    const i = BASE32.indexOf(c);
    if (i < 0) throw new Error(`Invalid base32 character: ${c}`);
    val   = (val << 5) | i;
    bits += 5;
    if (bits >= 8) {
      bytes.push((val >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function base32Encode(buf: Buffer): string {
  let result = "";
  let bits   = 0;
  let val    = 0;
  for (const byte of buf) {
    val   = (val << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += BASE32[(val >>> (bits - 5)) & 31];
      bits   -= 5;
    }
  }
  if (bits > 0) result += BASE32[(val << (5 - bits)) & 31];
  return result;
}

function hotp(secret: string, counter: bigint): number {
  const key = base32Decode(secret);
  const msg = Buffer.alloc(8);
  msg.writeUInt32BE(Number((counter >> 32n) & 0xffffffffn), 0);
  msg.writeUInt32BE(Number( counter         & 0xffffffffn), 4);
  const digest = createHmac("sha1", key).update(msg).digest();
  const off    = digest[digest.length - 1] & 0x0f;
  return (
    (((digest[off]     & 0x7f) << 24) |
     ((digest[off + 1] & 0xff) << 16) |
     ((digest[off + 2] & 0xff) << 8)  |
      (digest[off + 3] & 0xff))
  ) % 1_000_000;
}

/** Generate a new random TOTP secret (base32-encoded, 160 bits). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/**
 * Verify a 6-digit TOTP token.
 * `drift` accepts codes from ±1 time-step (±30 s) to tolerate clock skew.
 */
export function verifyTotpToken(
  secret: string,
  token:  string,
  drift   = 1
): boolean {
  const code = parseInt(token.replace(/\s/g, ""), 10);
  if (isNaN(code)) return false;
  const t = BigInt(Math.floor(Date.now() / 30_000));
  for (let i = -drift; i <= drift; i++) {
    if (hotp(secret, t + BigInt(i)) === code) return true;
  }
  return false;
}

/** Build an otpauth:// URI suitable for QR-code generation or manual entry. */
export function getTotpUri(
  secret: string,
  email:  string,
  issuer  = "VTU Admin"
): string {
  const enc = encodeURIComponent;
  return (
    `otpauth://totp/${enc(issuer)}:${enc(email)}` +
    `?secret=${secret}&issuer=${enc(issuer)}&algorithm=SHA1&digits=6&period=30`
  );
}

/** Generate one-time backup codes (shown to the user once; stored hashed). */
export function generateBackupCodes(count = 8): string[] {
  return Array.from({ length: count }, () =>
    randomBytes(5).toString("hex").toUpperCase()  // 10-char hex, easy to type
  );
}

/** SHA-256 hash a backup code for safe storage. */
export function hashBackupCode(code: string): string {
  return createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}
