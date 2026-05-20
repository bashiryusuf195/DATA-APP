import { randomUUID } from "crypto";
import { getDbInstance } from "../../../db/knex";
import type { ProviderServiceType } from "../types/provider.types";

const db = getDbInstance();

export interface ProviderConfigRow {
  id:                 string;
  provider_code:      string;
  name:               string;
  is_active:          boolean;
  priority:           number;
  supported_services: ProviderServiceType[];
  health_status:      string;
  notes:              string | null;
  metadata:           Record<string, unknown>;
  created_at:         Date;
  updated_at:         Date;
}

export interface CreateProviderConfigInput {
  provider_code:       string;
  name:                string;
  is_active?:          boolean;
  priority?:           number;
  supported_services?: ProviderServiceType[];
  health_status?:      string;
  notes?:              string | null;
  metadata?:           Record<string, unknown>;
}

export type UpdateProviderConfigInput = Partial<Omit<CreateProviderConfigInput, "provider_code">>;

// ── Create ────────────────────────────────────────────────────────────────────

export async function createProviderConfig(
  input: CreateProviderConfigInput
): Promise<ProviderConfigRow> {
  const now = new Date();
  const [row] = await db("provider_configs")
    .insert({
      id:                 randomUUID(),
      provider_code:      input.provider_code,
      name:               input.name,
      is_active:          input.is_active          ?? false,
      priority:           input.priority           ?? 100,
      supported_services: JSON.stringify(input.supported_services ?? []),
      health_status:      input.health_status      ?? "unknown",
      notes:              input.notes              ?? null,
      metadata:           JSON.stringify(input.metadata ?? {}),
      created_at:         now,
      updated_at:         now,
    })
    .returning("*");
  return row as ProviderConfigRow;
}

// ── Update (partial) ──────────────────────────────────────────────────────────

export async function updateProviderConfig(
  providerCode: string,
  input: UpdateProviderConfigInput
): Promise<ProviderConfigRow | null> {
  const patch: Record<string, unknown> = { updated_at: new Date() };

  if (input.name               !== undefined) patch.name               = input.name;
  if (input.is_active          !== undefined) patch.is_active          = input.is_active;
  if (input.priority           !== undefined) patch.priority           = input.priority;
  if (input.supported_services !== undefined) patch.supported_services = JSON.stringify(input.supported_services);
  if (input.health_status      !== undefined) patch.health_status      = input.health_status;
  if (input.notes              !== undefined) patch.notes              = input.notes;
  if (input.metadata           !== undefined) patch.metadata           = JSON.stringify(input.metadata);

  const [row] = await db("provider_configs")
    .where({ provider_code: providerCode })
    .update(patch)
    .returning("*");

  return (row as ProviderConfigRow) ?? null;
}

// ── Soft disable ──────────────────────────────────────────────────────────────

export async function disableProviderConfig(
  providerCode: string
): Promise<ProviderConfigRow | null> {
  return updateProviderConfig(providerCode, { is_active: false });
}
