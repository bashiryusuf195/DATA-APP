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