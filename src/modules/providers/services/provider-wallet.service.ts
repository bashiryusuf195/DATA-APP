import { randomUUID } from "crypto";
import { getDbInstance } from "../../../db/knex";
import { providerRegistry } from "./provider-registry.service";
import { HttpVTUProvider } from "./http-vtu.provider";
import { createNotification } from "../../notifications/services/notification.service";

const db = getDbInstance();

// ── Row types ─────────────────────────────────────────────────────────────────

export interface ProviderWalletRow {
  id: string;
  provider_code: string;
  funding_bank_name: string | null;
  funding_account_number: string | null;
  funding_account_name: string | null;
  wallet_balance: string | null;
  balance_currency: string;
  low_balance_threshold: string | null;
  last_balance_check_at: Date | null;
  balance_check_status: "ok" | "low" | "unknown" | "error";
  balance_check_message: string | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

// Joined view returned to API callers — provider_configs fields merged in
export interface ProviderWalletView extends ProviderWalletRow {
  name: string;
  is_active: boolean;
  supported_services: string[];
  health_status: string;
  priority: number;
  base_url: string | null;
  is_live: boolean | null;
}

export interface UpsertWalletInfoInput {
  provider_code: string;
  funding_bank_name?: string | null;
  funding_account_number?: string | null;
  funding_account_name?: string | null;
  low_balance_threshold?: number | null;
  notes?: string | null;
}

export interface ManualBalanceInput {
  provider_code: string;
  balance: number;
  currency?: string;
  notes?: string | null;
}

// ── Read ──────────────────────────────────────────────────────────────────────

export async function listProviderWallets(): Promise<ProviderWalletView[]> {
  const rows = await db("provider_configs as pc")
    .leftJoin("provider_wallet_info as pw", "pc.provider_code", "pw.provider_code")
    .leftJoin("provider_credentials as cred", "pc.provider_code", "cred.provider_code")
    .select(
      "pc.provider_code",
      "pc.name",
      "pc.is_active",
      "pc.supported_services",
      "pc.health_status",
      "pc.priority",
      "cred.base_url",
      "cred.is_live",
      db.raw("COALESCE(pw.id, NULL) AS id"),
      "pw.funding_bank_name",
      "pw.funding_account_number",
      "pw.funding_account_name",
      "pw.wallet_balance",
      db.raw("COALESCE(pw.balance_currency, 'NGN') AS balance_currency"),
      "pw.low_balance_threshold",
      "pw.last_balance_check_at",
      db.raw("COALESCE(pw.balance_check_status, 'unknown') AS balance_check_status"),
      "pw.balance_check_message",
      "pw.notes",
      db.raw("COALESCE(pw.created_at, pc.created_at) AS created_at"),
      db.raw("COALESCE(pw.updated_at, pc.updated_at) AS updated_at"),
    )
    .orderBy("pc.priority", "asc");

  return rows as ProviderWalletView[];
}

export async function getProviderWallet(
  providerCode: string
): Promise<ProviderWalletView | null> {
  const row = await db("provider_configs as pc")
    .leftJoin("provider_wallet_info as pw", "pc.provider_code", "pw.provider_code")
    .leftJoin("provider_credentials as cred", "pc.provider_code", "cred.provider_code")
    .where("pc.provider_code", providerCode)
    .select(
      "pc.provider_code",
      "pc.name",
      "pc.is_active",
      "pc.supported_services",
      "pc.health_status",
      "pc.priority",
      "cred.base_url",
      "cred.is_live",
      db.raw("COALESCE(pw.id, NULL) AS id"),
      "pw.funding_bank_name",
      "pw.funding_account_number",
      "pw.funding_account_name",
      "pw.wallet_balance",
      db.raw("COALESCE(pw.balance_currency, 'NGN') AS balance_currency"),
      "pw.low_balance_threshold",
      "pw.last_balance_check_at",
      db.raw("COALESCE(pw.balance_check_status, 'unknown') AS balance_check_status"),
      "pw.balance_check_message",
      "pw.notes",
      db.raw("COALESCE(pw.created_at, pc.created_at) AS created_at"),
      db.raw("COALESCE(pw.updated_at, pc.updated_at) AS updated_at"),
    )
    .first();

  return (row as ProviderWalletView) ?? null;
}

// ── Write ─────────────────────────────────────────────────────────────────────

export async function upsertProviderWalletInfo(
  input: UpsertWalletInfoInput
): Promise<ProviderWalletRow> {
  const now = new Date();
  const patch: Record<string, unknown> = { updated_at: now };

  if (input.funding_bank_name      !== undefined) patch.funding_bank_name      = input.funding_bank_name;
  if (input.funding_account_number !== undefined) patch.funding_account_number = input.funding_account_number;
  if (input.funding_account_name   !== undefined) patch.funding_account_name   = input.funding_account_name;
  if (input.low_balance_threshold  !== undefined) patch.low_balance_threshold  = input.low_balance_threshold;
  if (input.notes                  !== undefined) patch.notes                  = input.notes;

  const existing = await db("provider_wallet_info")
    .where({ provider_code: input.provider_code })
    .first<ProviderWalletRow>();

  if (existing) {
    const [updated] = await db("provider_wallet_info")
      .where({ provider_code: input.provider_code })
      .update(patch)
      .returning("*");
    return updated as ProviderWalletRow;
  }

  const [created] = await db("provider_wallet_info")
    .insert({
      id:                      randomUUID(),
      provider_code:           input.provider_code,
      funding_bank_name:       input.funding_bank_name       ?? null,
      funding_account_number:  input.funding_account_number  ?? null,
      funding_account_name:    input.funding_account_name    ?? null,
      low_balance_threshold:   input.low_balance_threshold   ?? null,
      notes:                   input.notes                   ?? null,
      balance_check_status:    "unknown",
      balance_currency:        "NGN",
      created_at:              now,
      updated_at:              now,
    })
    .returning("*");
  return created as ProviderWalletRow;
}

// ── Balance update (internal) ─────────────────────────────────────────────────

async function persistBalance(
  providerCode: string,
  balance: number,
  currency: string,
  message: string | null,
): Promise<ProviderWalletRow> {
  const now = new Date();

  const existing = await db("provider_wallet_info")
    .where({ provider_code: providerCode })
    .first<ProviderWalletRow>();

  const threshold = existing?.low_balance_threshold
    ? parseFloat(existing.low_balance_threshold)
    : null;

  const status: "ok" | "low" =
    threshold !== null && balance < threshold ? "low" : "ok";

  const patch = {
    wallet_balance:       balance,
    balance_currency:     currency,
    balance_check_status: status,
    balance_check_message: message,
    last_balance_check_at: now,
    updated_at:           now,
  };

  let row: ProviderWalletRow;

  if (existing) {
    const [updated] = await db("provider_wallet_info")
      .where({ provider_code: providerCode })
      .update(patch)
      .returning("*");
    row = updated as ProviderWalletRow;
  } else {
    const [created] = await db("provider_wallet_info")
      .insert({ id: randomUUID(), provider_code: providerCode, ...patch, created_at: now })
      .returning("*");
    row = created as ProviderWalletRow;
  }

  // Fire-and-forget low-balance notification (system notification, no user_id)
  if (status === "low") {
    createNotification({
      user_id: null,
      channel: "in_app",
      type: "provider_low_balance",
      title: `Low Balance: ${providerCode}`,
      message: `Provider ${providerCode} wallet balance ${currency} ${balance.toLocaleString()} is below threshold of ${currency} ${threshold?.toLocaleString() ?? "?"}. Please top up.`,
      metadata: { provider_code: providerCode, balance, currency, threshold },
    }).catch(() => { /* never surface notification failures */ });
  }

  return row;
}

// ── Check balance via provider API ────────────────────────────────────────────

export interface BalanceCheckResult {
  provider_code: string;
  supported: boolean;
  balance: number | null;
  currency: string;
  message: string;
  status: "ok" | "low" | "unknown" | "error";
  checked_at: Date;
}

export async function checkProviderBalance(
  providerCode: string
): Promise<BalanceCheckResult> {
  const checked_at = new Date();

  let provider;
  try {
    provider = providerRegistry.getProvider(providerCode);
  } catch {
    provider = new HttpVTUProvider(providerCode);
  }

  try {
    const result = await provider.getBalance();

    if (result.available === -1) {
      // Convention: -1 means "not supported"
      await db("provider_wallet_info")
        .where({ provider_code: providerCode })
        .update({
          balance_check_status:  "unknown",
          balance_check_message: "Balance API not supported by this provider",
          last_balance_check_at: checked_at,
          updated_at:            checked_at,
        })
        .catch(() => undefined);

      return {
        provider_code: providerCode,
        supported: false,
        balance: null,
        currency: result.currency,
        message: "Balance API not supported by this provider. Use manual update.",
        status: "unknown",
        checked_at,
      };
    }

    const row = await persistBalance(
      providerCode,
      result.available,
      result.currency,
      null,
    );

    return {
      provider_code: providerCode,
      supported: true,
      balance: result.available,
      currency: result.currency,
      message: `Balance fetched successfully`,
      status: row.balance_check_status,
      checked_at,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";

    await db("provider_wallet_info")
      .where({ provider_code: providerCode })
      .update({
        balance_check_status:  "error",
        balance_check_message: errorMessage,
        last_balance_check_at: checked_at,
        updated_at:            checked_at,
      })
      .catch(() => undefined);

    return {
      provider_code: providerCode,
      supported: false,
      balance: null,
      currency: "NGN",
      message: `Balance check failed: ${errorMessage}`,
      status: "error",
      checked_at,
    };
  }
}

// ── Manual balance update ─────────────────────────────────────────────────────

export async function manualBalanceUpdate(
  input: ManualBalanceInput
): Promise<ProviderWalletRow> {
  const { provider_code, balance, currency = "NGN", notes } = input;

  const row = await persistBalance(provider_code, balance, currency, "Manual update");

  // Persist any note change
  if (notes !== undefined) {
    await db("provider_wallet_info")
      .where({ provider_code })
      .update({ notes, updated_at: new Date() });
    return { ...row, notes };
  }

  return row;
}
