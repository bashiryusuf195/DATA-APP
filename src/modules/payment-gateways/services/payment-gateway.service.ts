import { getDbInstance } from "../../../db/knex";
import type { Knex } from "knex";

const db = getDbInstance();

export interface PaymentGateway {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  is_default: boolean;
  is_live: boolean;
  is_supported: boolean;
  base_url: string | null;
  public_key: string | null;
  // secret_key_encrypted and webhook_secret_encrypted intentionally omitted
  charge_type: "flat" | "percentage" | "none";
  charge_value: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// The safe shape — never includes encrypted secrets
export type PaymentGatewaySafe = PaymentGateway & {
  has_secret_key: boolean;
  has_webhook_secret: boolean;
};

export interface CreatePaymentGatewayInput {
  code: string;
  name: string;
  is_active?: boolean;
  is_live?: boolean;
  base_url?: string | null;
  public_key?: string | null;
  secret_key?: string | null;
  webhook_secret?: string | null;
  charge_type?: "flat" | "percentage" | "none";
  charge_value?: number;
  notes?: string | null;
}

export interface UpdatePaymentGatewayInput {
  name?: string;
  is_active?: boolean;
  is_live?: boolean;
  base_url?: string | null;
  public_key?: string | null;
  secret_key?: string | null;
  webhook_secret?: string | null;
  charge_type?: "flat" | "percentage" | "none";
  charge_value?: number;
  notes?: string | null;
}

export interface ChargeCalculation {
  paid_amount: number;
  charge_type: string;
  charge_value: number;
  charge_amount: number;
  credited_amount: number;
}

const SAFE_COLUMNS = [
  "id", "code", "name", "is_active", "is_default", "is_live", "is_supported",
  "base_url", "public_key", "charge_type", "charge_value", "notes",
  "created_at", "updated_at",
  db.raw("(secret_key_encrypted IS NOT NULL AND secret_key_encrypted <> '') AS has_secret_key"),
  db.raw("(webhook_secret_encrypted IS NOT NULL AND webhook_secret_encrypted <> '') AS has_webhook_secret"),
];

export async function listPaymentGateways(): Promise<PaymentGatewaySafe[]> {
  return db("payment_gateways")
    .select(SAFE_COLUMNS)
    .orderBy("is_default", "desc")
    .orderBy("name", "asc");
}

export async function getPaymentGateway(id: string): Promise<PaymentGatewaySafe | null> {
  const row = await db("payment_gateways").select(SAFE_COLUMNS).where({ id }).first();
  return row ?? null;
}

export async function getPaymentGatewayByCode(code: string): Promise<PaymentGatewaySafe | null> {
  const row = await db("payment_gateways").select(SAFE_COLUMNS).where({ code }).first();
  return row ?? null;
}

export async function getDefaultActiveGateway(): Promise<PaymentGatewaySafe | null> {
  const row = await db("payment_gateways")
    .select(SAFE_COLUMNS)
    .where({ is_active: true, is_default: true })
    .first();
  if (row) return row;
  // Fallback: any active gateway
  return db("payment_gateways").select(SAFE_COLUMNS).where({ is_active: true }).first() ?? null;
}

/** Retrieve full row including secrets — only used internally by funding flow */
export async function getGatewaySecrets(id: string): Promise<{
  secret_key_encrypted: string | null;
  webhook_secret_encrypted: string | null;
} | null> {
  return db("payment_gateways")
    .select("secret_key_encrypted", "webhook_secret_encrypted")
    .where({ id })
    .first() ?? null;
}

export async function createPaymentGateway(input: CreatePaymentGatewayInput): Promise<PaymentGatewaySafe> {
  const [row] = await db("payment_gateways")
    .insert({
      code: input.code.toLowerCase().trim(),
      name: input.name,
      is_active: input.is_active ?? false,
      is_default: false, // use setDefault to change
      is_live: input.is_live ?? false,
      is_supported: false,
      base_url: input.base_url ?? null,
      public_key: input.public_key ?? null,
      secret_key_encrypted: input.secret_key ?? null,
      webhook_secret_encrypted: input.webhook_secret ?? null,
      charge_type: input.charge_type ?? "none",
      charge_value: input.charge_value ?? 0,
      notes: input.notes ?? null,
    })
    .returning("id");

  return getPaymentGateway(row.id) as Promise<PaymentGatewaySafe>;
}

export async function updatePaymentGateway(id: string, input: UpdatePaymentGatewayInput): Promise<PaymentGatewaySafe> {
  const patch: Record<string, unknown> = { updated_at: db.fn.now() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.is_active !== undefined) patch.is_active = input.is_active;
  if (input.is_live !== undefined) patch.is_live = input.is_live;
  if (input.base_url !== undefined) patch.base_url = input.base_url;
  if (input.public_key !== undefined) patch.public_key = input.public_key;
  if (input.secret_key !== undefined) patch.secret_key_encrypted = input.secret_key;
  if (input.webhook_secret !== undefined) patch.webhook_secret_encrypted = input.webhook_secret;
  if (input.charge_type !== undefined) patch.charge_type = input.charge_type;
  if (input.charge_value !== undefined) patch.charge_value = input.charge_value;
  if (input.notes !== undefined) patch.notes = input.notes;

  await db("payment_gateways").where({ id }).update(patch);
  return getPaymentGateway(id) as Promise<PaymentGatewaySafe>;
}

export async function setDefaultGateway(id: string): Promise<PaymentGatewaySafe> {
  await db.transaction(async (trx: Knex.Transaction) => {
    await trx("payment_gateways").update({ is_default: false, updated_at: db.fn.now() });
    await trx("payment_gateways").where({ id }).update({ is_default: true, updated_at: db.fn.now() });
  });
  return getPaymentGateway(id) as Promise<PaymentGatewaySafe>;
}

export async function enableGateway(id: string): Promise<PaymentGatewaySafe> {
  await db("payment_gateways").where({ id }).update({ is_active: true, updated_at: db.fn.now() });
  return getPaymentGateway(id) as Promise<PaymentGatewaySafe>;
}

export async function disableGateway(id: string): Promise<PaymentGatewaySafe> {
  await db("payment_gateways").where({ id }).update({ is_active: false, updated_at: db.fn.now() });
  return getPaymentGateway(id) as Promise<PaymentGatewaySafe>;
}

export function calculateCharge(amount: number, chargeType: string, chargeValue: number): ChargeCalculation {
  let chargeAmount = 0;
  if (chargeType === "flat") {
    chargeAmount = chargeValue;
  } else if (chargeType === "percentage") {
    chargeAmount = Math.round((amount * chargeValue) / 100 * 100) / 100;
  }
  // Ensure charge never exceeds amount
  chargeAmount = Math.min(chargeAmount, amount);
  return {
    paid_amount: amount,
    charge_type: chargeType,
    charge_value: chargeValue,
    charge_amount: chargeAmount,
    credited_amount: Math.round((amount - chargeAmount) * 100) / 100,
  };
}
