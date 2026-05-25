import { randomUUID } from "crypto";
import { getDbInstance } from "../../../db/knex";
import { paystackGateway } from "./paystack.service";
import { logger } from "../../../lib/logger";
import { AppError } from "../../../shared/errors/AppError";

const db = getDbInstance();

export interface DedicatedAccountRecord {
  id:                     string;
  user_id:                string;
  paystack_customer_code: string;
  account_number:         string;
  account_name:           string;
  bank_name:              string;
  bank_slug:              string;
  is_active:              boolean;
  created_at:             Date;
  updated_at:             Date;
}

// Preferred banks in order — Wema is available on all Paystack plans.
// Titan requires a higher-tier plan; fall back automatically.
const PREFERRED_BANKS = ["wema-bank", "titan-paystack"];

export async function getOrCreateDedicatedAccount(
  userId: string
): Promise<DedicatedAccountRecord> {
  // ── 1. Return existing record if already provisioned ────────────────────────
  const existing = await db("dedicated_accounts").where({ user_id: userId }).first();
  if (existing) return coerce(existing);

  if (!paystackGateway.isConfigured()) {
    throw new Error("Paystack is not configured — dedicated accounts unavailable");
  }

  // ── 2. Load user (name lives in user_profiles, not users) ──────────────────
  const user = await db("users")
    .leftJoin("user_profiles as p", "p.user_id", "users.id")
    .where("users.id", userId)
    .select(
      "users.id",
      "users.email",
      "users.phone",
      "p.first_name",
      "p.last_name",
    )
    .first();

  if (!user) throw new Error("User not found");

  // ── 3. Validate required profile fields before calling Paystack ─────────────
  const missingFields: string[] = [];
  if (!user.first_name) missingFields.push("first name");
  if (!user.last_name)  missingFields.push("last name");
  if (!user.phone)      missingFields.push("phone number");

  if (missingFields.length > 0) {
    throw new AppError(
      422,
      "PROFILE_INCOMPLETE",
      "Complete your profile with first name, last name, and phone number to generate a bank account.",
    );
  }

  // ── 4. Create or fetch Paystack customer (always updates with latest profile) ─
  const { customer_code } = await paystackGateway.createOrFetchCustomer({
    email:      user.email,
    first_name: user.first_name,
    last_name:  user.last_name,
    phone:      user.phone,
  });

  logger.info("dva_customer_resolved", {
    user_id:        userId,
    customer_code,
    has_first_name: true,
    has_last_name:  true,
    has_phone:      true,
  });

  // ── 5. Check if customer already has a DVA on Paystack ─────────────────────
  const existing_dva = await paystackGateway.fetchDedicatedAccounts(customer_code);

  let dva: { account_number: string; account_name: string; bank_name: string; bank_slug: string };

  if (existing_dva.length > 0) {
    dva = existing_dva[0];
    logger.info("dva_existing_found", { user_id: userId, account_number: dva.account_number });
  } else {
    // ── 6. Create new DVA — try each bank until one succeeds ─────────────────
    let lastError: Error | null = null;

    for (const bank of PREFERRED_BANKS) {
      try {
        dva = await paystackGateway.createDedicatedAccount(customer_code, bank);
        logger.info("dva_created", {
          user_id:        userId,
          customer_code,
          preferred_bank: bank,
          account_number: dva.account_number,
        });
        break;
      } catch (err) {
        lastError = err as Error;
        logger.warn("dva_bank_failed", { user_id: userId, bank, error: (err as Error).message });
      }
    }

    if (!dva!) {
      throw lastError ?? new Error("Could not create dedicated account — all banks failed");
    }
  }

  // ── 7. Persist in our DB ────────────────────────────────────────────────────
  const now = new Date();
  const [record] = await db("dedicated_accounts")
    .insert({
      id:                     randomUUID(),
      user_id:                userId,
      paystack_customer_code: customer_code,
      account_number:         dva.account_number,
      account_name:           dva.account_name,
      bank_name:              dva.bank_name,
      bank_slug:              dva.bank_slug,
      is_active:              true,
      created_at:             now,
      updated_at:             now,
    })
    .returning("*");

  return coerce(record);
}

export async function getDedicatedAccountByCustomerCode(
  customerCode: string
): Promise<DedicatedAccountRecord | null> {
  const row = await db("dedicated_accounts")
    .where({ paystack_customer_code: customerCode })
    .first();
  return row ? coerce(row) : null;
}

function coerce(row: Record<string, unknown>): DedicatedAccountRecord {
  return {
    id:                     row.id as string,
    user_id:                row.user_id as string,
    paystack_customer_code: row.paystack_customer_code as string,
    account_number:         row.account_number as string,
    account_name:           row.account_name as string,
    bank_name:              row.bank_name as string,
    bank_slug:              row.bank_slug as string,
    is_active:              row.is_active as boolean,
    created_at:             new Date(row.created_at as string),
    updated_at:             new Date(row.updated_at as string),
  };
}
