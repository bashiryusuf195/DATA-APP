export type ErrorClassification =
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "AUTH_ERROR"
  | "PROVIDER_ERROR"
  | "VALIDATION_ERROR"
  | "CIRCUIT_OPEN"
  | "UNSUPPORTED_SERVICE";

const NETWORK_PATTERNS = [
  /ECONNREFUSED/i,
  /ENOTFOUND/i,
  /ECONNRESET/i,
  /ETIMEDOUT/i,
  /network/i,
  /socket hang up/i,
  /connection refused/i,
  /failed to fetch/i,
];

const TIMEOUT_PATTERNS = [
  /timeout/i,
  /timed out/i,
  /abort/i,
  /request aborted/i,
];

const AUTH_PATTERNS = [
  /unauthorized/i,
  /authentication/i,
  /invalid.*key/i,
  /api.?key/i,
  /forbidden/i,
  /401/,
  /403/,
];

const VALIDATION_PATTERNS = [
  /invalid.*phone/i,
  /invalid.*number/i,
  /invalid.*meter/i,
  /invalid.*smartcard/i,
  /invalid.*amount/i,
  /validation/i,
  /400/,
  /bad request/i,
];

export function classifyError(error: Error | string): ErrorClassification {
  const message = typeof error === "string" ? error : (error.message ?? "");

  if (message === "CIRCUIT_OPEN" || /circuit.*open/i.test(message)) {
    return "CIRCUIT_OPEN";
  }

  if (message === "UNSUPPORTED_SERVICE" || /unsupported.*service/i.test(message)) {
    return "UNSUPPORTED_SERVICE";
  }

  for (const pattern of TIMEOUT_PATTERNS) {
    if (pattern.test(message)) return "TIMEOUT";
  }

  for (const pattern of NETWORK_PATTERNS) {
    if (pattern.test(message)) return "NETWORK_ERROR";
  }

  for (const pattern of AUTH_PATTERNS) {
    if (pattern.test(message)) return "AUTH_ERROR";
  }

  for (const pattern of VALIDATION_PATTERNS) {
    if (pattern.test(message)) return "VALIDATION_ERROR";
  }

  return "PROVIDER_ERROR";
}

export function isRetryable(classification: ErrorClassification): boolean {
  switch (classification) {
    case "NETWORK_ERROR":
    case "TIMEOUT":
    case "PROVIDER_ERROR":
      return true;
    case "AUTH_ERROR":
    case "VALIDATION_ERROR":
    case "CIRCUIT_OPEN":
    case "UNSUPPORTED_SERVICE":
      return false;
  }
}
