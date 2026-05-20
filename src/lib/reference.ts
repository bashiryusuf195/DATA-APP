import { randomBytes } from "crypto";

function randomCode(length = 6): string {
  return randomBytes(8)
    .toString("base64url")
    .replace(/[^A-Z0-9]/gi, "")
    .toUpperCase()
    .slice(0, length);
}

function dateStamp(): string {
  const now = new Date();

  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");

  return `${yyyy}${mm}${dd}`;
}

export function generateTransactionReference(prefix = "VTU"): string {
  return `${prefix}-${dateStamp()}-${randomCode(6)}`;
}

export function generateTransferReference(): string {
  return generateTransactionReference("TRF");
}

export function generateFundingReference(): string {
  return generateTransactionReference("FND");
}

export function generateReferralCode(): string {
  return randomCode(8);
}