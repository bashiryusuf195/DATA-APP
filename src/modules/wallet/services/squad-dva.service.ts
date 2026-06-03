import { randomUUID } from "crypto";
import { getDbInstance } from "../../../db/knex";
import { squadGateway } from "./squad.service";
import { logger } from "../../../lib/logger";
import { AppError } from "../../../shared/errors/AppError";

const db = getDbInstance();

export interface SquadVirtualAccountRecord {
  id:                     string;
  user_id:                string;
  customer_identifier:    string;
  virtual_account_number: string;
  account_name:           string;
  bank_name:              string;
  bank_code:              string;
  is_active:              boolean;
  created_at:             Date;
  updated_at:             Date;
}

export async function getOrCreateSquadVirtualAccount(
  userId: string
): Promise<SquadVirtualAccountRecord> {
  // ── 1. Return existing record if already provisioned ────────────────────────
  const existing = await db("squad_virtual_accounts").where({ user_id: userId }).first();
  if (existing) return coerce(existing);

  if (!squadGateway.isConfigured()) {
    throw new Error("Squad is not configured — virtual accounts unavailable");
  }

  // ── 2. Load user profile ────────────────────────────────────────────────────
  const user = await db("users")
    .leftJoin("user_profiles as p", "p.user_id", "users.id")
    .where("users.id", userId)
    .select(
      "users.id",
      "users.email",
      "users.phone",
      "p.first_name",
      "p.last_name",
      "p.date_of_birth",
    )
    .first();

  if (!user) throw new Error("User not found");

  // ── 3. Validate required profile fields ─────────────────────────────────────
  const missingFields: string[] = [];
  if (!user.first_name)    missingFields.push("first name");
  if (!user.last_name)     missingFields.push("last name");
  if (!user.phone)         missingFields.push("phone number");
  if (!user.date_of_birth) missingFields.push("date of birth");

  if (missingFields.length > 0) {
    const list = missingFields.join(", ");
    throw new AppError(
      422,
      "PROFILE_INCOMPLETE",
      `Complete your profile: ${list} is required to generate your Squad transfer account.`,
    );
  }

  const customerIdentifier = userId;

  // ── 4. Check if account already exists on Squad side ────────────────────────
  const existingOnSquad = await squadGateway.fetchVirtualAccount(customerIdentifier);

  let details: { virtual_account_number: string; account_name: string; bank_name: string; bank_code: string };

  if (existingOnSquad) {
    details = existingOnSquad;
    logger.info("squad_dva_existing_found", {
      user_id:                userId,
      virtual_account_number: existingOnSquad.virtual_account_number,
    });
  } else {
    // ── 5. Create new virtual account on Squad ─────────────────────────────────
    // Squad's mobile_num expects local Nigerian format (09XXXXXXXXX).
    // Phones stored in DB are E.164 (+2349XXXXXXXXX) — convert before sending.
    const rawPhone = user.phone as string;
    const mobileNum = rawPhone.startsWith("+234")
      ? `0${rawPhone.slice(4)}`
      : rawPhone;

    // Squad's dob expects MM/DD/YYYY; DB stores DATE as "YYYY-MM-DD" or a Date object.
    const rawDob = user.date_of_birth;
    const dobIso = rawDob instanceof Date
      ? rawDob.toISOString().slice(0, 10)
      : String(rawDob).slice(0, 10);
    const [yyyy, mm, dd] = dobIso.split("-");
    const squadDob = `${mm}/${dd}/${yyyy}`;

    const created = await squadGateway.createVirtualAccount({
      customer_identifier: customerIdentifier,
      first_name:          user.first_name as string,
      last_name:           user.last_name  as string,
      mobile_num:          mobileNum,
      email:               user.email      as string,
      dob:                 squadDob,
    });

    details = created;
    logger.info("squad_dva_created", {
      user_id:                userId,
      customer_identifier:    customerIdentifier,
      virtual_account_number: created.virtual_account_number,
      bank_name:              created.bank_name,
    });
  }

  // ── 6. Persist in our DB (race-safe: ON CONFLICT DO NOTHING) ─────────────────
  const now = new Date();
  const [record] = await db("squad_virtual_accounts")
    .insert({
      id:                     randomUUID(),
      user_id:                userId,
      customer_identifier:    customerIdentifier,
      virtual_account_number: details.virtual_account_number,
      account_name:           details.account_name,
      bank_name:              details.bank_name,
      bank_code:              details.bank_code,
      is_active:              true,
      created_at:             now,
      updated_at:             now,
    })
    .onConflict("user_id")
    .ignore()
    .returning("*");

  // If another request won the race and inserted first, fetch the winning row
  if (!record) {
    const row = await db("squad_virtual_accounts").where({ user_id: userId }).first();
    return coerce(row);
  }

  return coerce(record);
}

export async function getSquadVirtualAccountByCustomerIdentifier(
  customerIdentifier: string
): Promise<SquadVirtualAccountRecord | null> {
  const row = await db("squad_virtual_accounts")
    .where({ customer_identifier: customerIdentifier })
    .first();
  return row ? coerce(row) : null;
}

export async function listSquadVirtualAccounts(options: {
  limit:  number;
  offset: number;
}): Promise<SquadVirtualAccountRecord[]> {
  const rows = await db("squad_virtual_accounts")
    .orderBy("created_at", "desc")
    .limit(options.limit)
    .offset(options.offset);
  return rows.map(coerce);
}

function coerce(row: Record<string, unknown>): SquadVirtualAccountRecord {
  return {
    id:                     row.id                     as string,
    user_id:                row.user_id                as string,
    customer_identifier:    row.customer_identifier    as string,
    virtual_account_number: row.virtual_account_number as string,
    account_name:           row.account_name           as string,
    bank_name:              row.bank_name              as string,
    bank_code:              row.bank_code              as string,
    is_active:              row.is_active              as boolean,
    created_at:             new Date(row.created_at    as string),
    updated_at:             new Date(row.updated_at    as string),
  };
}
