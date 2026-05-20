// src/modules/auth/services/challenge.service.ts
// Short-lived Redis-backed 2FA login challenges.
//
// Flow:
//   1. login() creates a challenge and returns its ID to the client.
//   2. Client submits ID + TOTP code to POST /auth/2fa/verify-login.
//   3. getChallenge() reads state (non-consuming).
//   4. After TOTP passes, consumeChallenge() atomically deletes the key.
//
// Supabase tokens are stored server-side; they never reach the client.

import { randomUUID } from "crypto";
import { cacheSet, cacheGet } from "../../../config/redis";
import { redis } from "../../../config/redis";
import { AppError } from "../../../shared/errors/AppError";

const CHALLENGE_TTL_S = 300; // 5 minutes
const KEY = (id: string) => `2fa_challenge:${id}`;

export interface ChallengeState {
  userId:               string;
  email:                string;
  supabaseAccessToken:  string;
  supabaseRefreshToken: string;
  /** Unix timestamp (seconds) when the Supabase access token expires. */
  supabaseExpiresAt:    number;
}

export async function createChallenge(
  userId:               string,
  email:                string,
  supabaseAccessToken:  string,
  supabaseRefreshToken: string,
  supabaseExpiresAt:    number,
): Promise<string> {
  const id = randomUUID();
  await cacheSet(
    KEY(id),
    { userId, email, supabaseAccessToken, supabaseRefreshToken, supabaseExpiresAt } satisfies ChallengeState,
    CHALLENGE_TTL_S,
  );
  return id;
}

/** Read challenge state without consuming it (allows multiple TOTP retries). */
export async function getChallenge(challengeId: string): Promise<ChallengeState> {
  const state = await cacheGet<ChallengeState>(KEY(challengeId));
  if (!state) {
    throw new AppError(
      400,
      "CHALLENGE_EXPIRED",
      "2FA session expired or not found. Please sign in again.",
    );
  }
  return state;
}

/**
 * Atomically delete the challenge after a successful TOTP verification.
 * Returns true if the key existed (consumed for the first time).
 * Returns false if it was already consumed or expired — caller should error.
 */
export async function consumeChallenge(challengeId: string): Promise<boolean> {
  const deleted = await redis.del(KEY(challengeId));
  return deleted > 0;
}
