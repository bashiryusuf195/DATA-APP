import { randomUUID } from "crypto";
import { getDbInstance } from "../../../db/knex";
import { config } from "../../../config";
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

  // ── 2. Load user profile ─────────────────────────────────────────────────────
  // bvn is selected here but NEVER logged — it is only forwarded to Squad.
  const user = await db("users")
    .leftJoin("user_profiles as p", "p.user_id", "users.id")
    .where("users.id", userId)
    .select(
      "users.id",
      "users.email",
      "users.phone",
      "p.first_name",
      "p.last_name",
      "p.address_line1",
      "p.gender",
      "p.date_of_birth",
      "p.bvn",
    )
    .first();

  if (!user) throw new Error("User not found");

  // ── 3. Validate required profile fields ─────────────────────────────────────
  // Squad only accepts "1" (male) or "2" (female) — any other value is treated as missing.
  const SQUAD_GENDER: Record<string, string> = { male: "1", female: "2" };

  // Non-BVN fields live on /profile/edit — group them separately from BVN (/kyc).
  const missingProfile: string[] = [];
  if (!user.first_name)    missingProfile.push("first name");
  if (!user.last_name)     missingProfile.push("last name");
  if (!user.phone)         missingProfile.push("phone number");
  if (!user.date_of_birth) missingProfile.push("date of birth");
  if (!user.address_line1) missingProfile.push("address");
  if (!user.gender || !SQUAD_GENDER[user.gender as string]) missingProfile.push("gender (Male or Female)");

  if (missingProfile.length > 0) {
    const list = missingProfile.join(", ");
    throw new AppError(
      422,
      "PROFILE_INCOMPLETE",
      `Complete your profile: ${list} required to activate your Squad transfer account.`,
    );
  }

  // BVN is checked separately so the frontend can route the user to /kyc, not /profile/edit.
  if (!user.bvn) {
    throw new AppError(
      422,
      "MISSING_BVN",
      "Add your BVN on the KYC page to activate your Squad transfer account. Dial *565*0# to retrieve it.",
    );
  }

  const customerIdentifier = userId;

  // ── 4. Guard: beneficiary_account is a merchant-level config required by Squad ─
  // WARN-level so this appears regardless of LOG_LEVEL setting.
  logger.warn("squad_beneficiary_check", {
    configured: !!config.squad.beneficiaryAccount,
    length:     config.squad.beneficiaryAccount?.length ?? 0,
  });

  if (!config.squad.beneficiaryAccount) {
    throw new AppError(
      503,
      "PROVIDER_NOT_CONFIGURED",
      "Squad beneficiary account is not configured. Contact support.",
    );
  }

  // ── 5. Check if account already exists on Squad side ────────────────────────
  const existingOnSquad = await squadGateway.fetchVirtualAccount(customerIdentifier);

  let details: { virtual_account_number: string; account_name: string; bank_name: string; bank_code: string };

  if (existingOnSquad) {
    details = existingOnSquad;
    logger.info("squad_dva_existing_found", {
      user_id:                userId,
      virtual_account_number: existingOnSquad.virtual_account_number,
    });
  } else {
    // ── 6. Create new virtual account on Squad ─────────────────────────────────
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

    // bvn is forwarded to Squad but never appears in logs (see logger.info below)
    try {
      const created = await squadGateway.createVirtualAccount({
        customer_identifier: customerIdentifier,
        first_name:          user.first_name    as string,
        last_name:           user.last_name     as string,
        mobile_num:          mobileNum,
        email:               user.email         as string,
        bvn:                 user.bvn           as string,  // never logged
        dob:                 squadDob,
        address:             user.address_line1 as string,
        gender:              SQUAD_GENDER[user.gender as string],
        beneficiary_account: config.squad.beneficiaryAccount,
      });
      details = created;
    } catch (err) {
      // The error text from squadFetch is: "Squad POST /virtual-account failed: <Squad message>"
      const msg = (err as Error).message ?? "";
      const lmsg = msg.toLowerCase();

      if (lmsg.includes("invalid bvn") || (lmsg.includes("validation") && lmsg.includes("bvn"))) {
        throw new AppError(
          422,
          "INVALID_BVN",
          "Invalid BVN. Please enter a valid 11-digit BVN that matches your registered bank details.",
        );
      }

      // Squad rejects beneficiary_account values that are not registered settlement
      // accounts in the merchant portal. Map to PROVIDER_NOT_CONFIGURED so the
      // error is actionable in Railway logs and clearly not a user fault.
      if (lmsg.includes("beneficiary account") || lmsg.includes("beneficiary_account")) {
        throw new AppError(
          503,
          "PROVIDER_NOT_CONFIGURED",
          "Squad beneficiary account is invalid or not registered. Check SQUAD_BENEFICIARY_ACCOUNT and Squad merchant settings.",
        );
      }

      throw err;
    }

    logger.info("squad_dva_created", {
      user_id:                userId,
      customer_identifier:    customerIdentifier,
      virtual_account_number: details.virtual_account_number,
      bank_name:              details.bank_name,
      // bvn intentionally omitted from logs
    });
  }

  // ── 7. Persist in our DB (race-safe: ON CONFLICT DO NOTHING) ─────────────────
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
