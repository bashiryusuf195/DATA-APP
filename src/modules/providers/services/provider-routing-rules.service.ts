import { randomUUID } from "crypto";
import { getDbInstance } from "../../../db/knex";
import type { ProviderServiceType } from "../types/provider.types";

const db = getDbInstance();

export interface RoutingRule {
  id:                     string;
  service_type:           ProviderServiceType;
  primary_provider_code:  string;
  fallback_provider_code: string | null;
  is_active:              boolean;
  metadata:               Record<string, unknown>;
  created_at:             Date;
  updated_at:             Date;
}

export interface CreateRoutingRuleInput {
  service_type:           ProviderServiceType;
  primary_provider_code:  string;
  fallback_provider_code?: string | null;
  is_active?:             boolean;
  metadata?:              Record<string, unknown>;
}

export type UpdateRoutingRuleInput = Partial<CreateRoutingRuleInput>;

// ── Read ──────────────────────────────────────────────────────────────────────

export async function listRoutingRules(): Promise<RoutingRule[]> {
  return db("provider_routing_rules")
    .orderBy("service_type", "asc")
    .orderBy("is_active", "desc") as Promise<RoutingRule[]>;
}

export async function getActiveRoutingRule(
  serviceType: ProviderServiceType
): Promise<RoutingRule | null> {
  const row = await db("provider_routing_rules")
    .where({ service_type: serviceType, is_active: true })
    .orderBy("created_at", "desc") // most recently created rule wins
    .first();
  return (row as RoutingRule) ?? null;
}

// ── Create ────────────────────────────────────────────────────────────────────

export async function createRoutingRule(
  input: CreateRoutingRuleInput
): Promise<RoutingRule> {
  const now = new Date();
  const [row] = await db("provider_routing_rules")
    .insert({
      id:                     randomUUID(),
      service_type:           input.service_type,
      primary_provider_code:  input.primary_provider_code,
      fallback_provider_code: input.fallback_provider_code ?? null,
      is_active:              input.is_active ?? true,
      metadata:               JSON.stringify(input.metadata ?? {}),
      created_at:             now,
      updated_at:             now,
    })
    .returning("*");
  return row as RoutingRule;
}

// ── Update (partial) ──────────────────────────────────────────────────────────

export async function updateRoutingRule(
  id: string,
  input: UpdateRoutingRuleInput
): Promise<RoutingRule | null> {
  const patch: Record<string, unknown> = { updated_at: new Date() };

  if (input.service_type           !== undefined) patch.service_type           = input.service_type;
  if (input.primary_provider_code  !== undefined) patch.primary_provider_code  = input.primary_provider_code;
  if (input.fallback_provider_code !== undefined) patch.fallback_provider_code = input.fallback_provider_code;
  if (input.is_active              !== undefined) patch.is_active              = input.is_active;
  if (input.metadata               !== undefined) patch.metadata               = JSON.stringify(input.metadata);

  const [row] = await db("provider_routing_rules")
    .where({ id })
    .update(patch)
    .returning("*");

  return (row as RoutingRule) ?? null;
}
