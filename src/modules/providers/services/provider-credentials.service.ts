import { randomUUID } from "crypto";
import { getDbInstance } from "../../../db/knex";

const db = getDbInstance();

// ── Internal row type (never sent to API callers) ─────────────────────────────

export interface ProviderCredentials {
  id:                   string;
  provider_code:        string;
  base_url:             string | null;
  api_key_encrypted:    string | null;
  secret_key_encrypted: string | null;
  username_encrypted:   string | null;
  password_encrypted:   string | null;
  is_live:              boolean;
  metadata:             Record<string, unknown>;
  created_at:           Date;
  updated_at:           Date;
}

// ── Safe public type — secrets replaced with presence booleans ─────────────────

export interface SafeProviderCredentials {
  id:             string;
  provider_code:  string;
  base_url:       string | null;
  is_live:        boolean;
  has_api_key:    boolean;
  has_secret_key: boolean;
  has_username:   boolean;
  has_password:   boolean;
  metadata:       Record<string, unknown>;
  created_at:     Date;
  updated_at:     Date;
}

function toSafe(row: ProviderCredentials): SafeProviderCredentials {
  return {
    id:             row.id,
    provider_code:  row.provider_code,
    base_url:       row.base_url,
    is_live:        row.is_live,
    has_api_key:    !!row.api_key_encrypted,
    has_secret_key: !!row.secret_key_encrypted,
    has_username:   !!row.username_encrypted,
    has_password:   !!row.password_encrypted,
    metadata:       row.metadata,
    created_at:     row.created_at,
    updated_at:     row.updated_at,
  };
}

// ── Read ──────────────────────────────────────────────────────────────────────

export async function getProviderCredentials(
  providerCode: string
): Promise<ProviderCredentials | null> {
  const row = await db("provider_credentials")
    .where({ provider_code: providerCode })
    .first();
  return row ?? null;
}

export async function getSafeProviderCredentials(
  providerCode: string
): Promise<SafeProviderCredentials | null> {
  const row = await getProviderCredentials(providerCode);
  return row ? toSafe(row) : null;
}

// ── List — joined with provider_configs ───────────────────────────────────────

export async function listProvidersWithCredentialStatus() {
  return db("provider_configs as pc")
    .leftJoin("provider_credentials as cred", "pc.provider_code", "cred.provider_code")
    .select(
      "pc.id",
      "pc.provider_code",
      "pc.name",
      "pc.is_active",
      "pc.priority",
      "pc.supported_services",
      "pc.health_status",
      "pc.metadata as config_metadata",
      "pc.created_at",
      "pc.updated_at",
      db.raw("CASE WHEN cred.id IS NOT NULL THEN true ELSE false END AS has_credentials"),
      "cred.base_url",
      "cred.is_live"
    )
    .orderBy("pc.priority", "asc");
}

export async function getProviderConfigWithCredentials(providerCode: string) {
  const config = await db("provider_configs")
    .where({ provider_code: providerCode })
    .first();
  if (!config) return null;

  const creds = await getProviderCredentials(providerCode);
  return {
    ...config,
    credentials: creds ? toSafe(creds) : null,
  };
}

// ── Upsert ────────────────────────────────────────────────────────────────────

export interface UpsertCredentialsInput {
  provider_code:   string;
  base_url?:       string | null;
  // Accepted as plaintext from the admin API; stored as-is in _encrypted columns.
  // Production deployments should encrypt these values before calling this function.
  api_key?:        string | null;
  secret_key?:     string | null;
  username?:       string | null;
  password?:       string | null;
  is_live?:        boolean;
  metadata?:       Record<string, unknown>;
}

export async function upsertProviderCredentials(
  input: UpsertCredentialsInput
): Promise<SafeProviderCredentials> {
  const now = new Date();

  const patch: Record<string, unknown> = { updated_at: now };
  if (input.base_url    !== undefined) patch.base_url             = input.base_url;
  if (input.api_key     !== undefined) patch.api_key_encrypted    = input.api_key;
  if (input.secret_key  !== undefined) patch.secret_key_encrypted = input.secret_key;
  if (input.username    !== undefined) patch.username_encrypted   = input.username;
  if (input.password    !== undefined) patch.password_encrypted   = input.password;
  if (input.is_live     !== undefined) patch.is_live              = input.is_live;
  if (input.metadata    !== undefined) patch.metadata             = JSON.stringify(input.metadata);

  const existing = await db("provider_credentials")
    .where({ provider_code: input.provider_code })
    .first();

  if (existing) {
    const [updated] = await db("provider_credentials")
      .where({ provider_code: input.provider_code })
      .update(patch)
      .returning("*");
    return toSafe(updated as ProviderCredentials);
  }

  const [created] = await db("provider_credentials")
    .insert({
      id:                   randomUUID(),
      provider_code:        input.provider_code,
      base_url:             input.base_url             ?? null,
      api_key_encrypted:    input.api_key              ?? null,
      secret_key_encrypted: input.secret_key           ?? null,
      username_encrypted:   input.username             ?? null,
      password_encrypted:   input.password             ?? null,
      is_live:              input.is_live              ?? false,
      metadata:             JSON.stringify(input.metadata ?? {}),
      created_at:           now,
      updated_at:           now,
    })
    .returning("*");
  return toSafe(created as ProviderCredentials);
}
