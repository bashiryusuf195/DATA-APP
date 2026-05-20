import { randomUUID } from "crypto";
import { getDbInstance } from "../../../db/knex";

const db = getDbInstance();

// ── Internal row type (never sent to API callers) ─────────────────────────────

export interface ProviderCredentials {
  id:                          string;
  provider_code:               string;
  base_url:                    string | null;
  api_key_encrypted:           string | null;
  secret_key_encrypted:        string | null;
  username_encrypted:          string | null;
  password_encrypted:          string | null;
  bearer_token_encrypted:      string | null;
  webhook_secret_encrypted:    string | null;
  custom_headers_encrypted:    string | null;
  auth_type:                   string;
  is_live:                     boolean;
  metadata:                    Record<string, unknown>;
  created_at:                  Date;
  updated_at:                  Date;
}

// ── Safe public type — secrets replaced with presence booleans ─────────────────

export interface SafeProviderCredentials {
  id:                  string;
  provider_code:       string;
  base_url:            string | null;
  auth_type:           string;
  is_live:             boolean;
  has_api_key:         boolean;
  has_secret_key:      boolean;
  has_username:        boolean;
  has_password:        boolean;
  has_bearer_token:    boolean;
  has_webhook_secret:  boolean;
  has_custom_headers:  boolean;
  metadata:            Record<string, unknown>;
  created_at:          Date;
  updated_at:          Date;
}

function toSafe(row: ProviderCredentials): SafeProviderCredentials {
  return {
    id:                  row.id,
    provider_code:       row.provider_code,
    base_url:            row.base_url,
    auth_type:           row.auth_type,
    is_live:             row.is_live,
    has_api_key:         !!row.api_key_encrypted,
    has_secret_key:      !!row.secret_key_encrypted,
    has_username:        !!row.username_encrypted,
    has_password:        !!row.password_encrypted,
    has_bearer_token:    !!row.bearer_token_encrypted,
    has_webhook_secret:  !!row.webhook_secret_encrypted,
    has_custom_headers:  !!row.custom_headers_encrypted,
    metadata:            row.metadata,
    created_at:          row.created_at,
    updated_at:          row.updated_at,
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
      "pc.notes",
      "pc.metadata as config_metadata",
      "pc.created_at",
      "pc.updated_at",
      db.raw("CASE WHEN cred.id IS NOT NULL THEN true ELSE false END AS has_credentials"),
      db.raw("CASE WHEN cred.api_key_encrypted        IS NOT NULL THEN true ELSE false END AS has_api_key"),
      db.raw("CASE WHEN cred.secret_key_encrypted     IS NOT NULL THEN true ELSE false END AS has_secret_key"),
      db.raw("CASE WHEN cred.username_encrypted       IS NOT NULL THEN true ELSE false END AS has_username"),
      db.raw("CASE WHEN cred.password_encrypted       IS NOT NULL THEN true ELSE false END AS has_password"),
      db.raw("CASE WHEN cred.bearer_token_encrypted   IS NOT NULL THEN true ELSE false END AS has_bearer_token"),
      db.raw("CASE WHEN cred.webhook_secret_encrypted IS NOT NULL THEN true ELSE false END AS has_webhook_secret"),
      db.raw("CASE WHEN cred.custom_headers_encrypted IS NOT NULL THEN true ELSE false END AS has_custom_headers"),
      "cred.base_url",
      "cred.is_live",
      "cred.auth_type",
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
  provider_code:    string;
  base_url?:        string | null;
  // Accepted as plaintext from the admin API; stored as-is in _encrypted columns.
  // Production deployments should encrypt these values before calling this function.
  api_key?:         string | null;
  secret_key?:      string | null;
  username?:        string | null;
  password?:        string | null;
  bearer_token?:    string | null;
  webhook_secret?:  string | null;
  // Stored as a JSON string; header keys are safe to show, values are secrets.
  custom_headers?:  string | null;
  auth_type?:       string;
  is_live?:         boolean;
  metadata?:        Record<string, unknown>;
}

export async function upsertProviderCredentials(
  input: UpsertCredentialsInput
): Promise<SafeProviderCredentials> {
  const now = new Date();

  const patch: Record<string, unknown> = { updated_at: now };
  if (input.base_url        !== undefined) patch.base_url                   = input.base_url;
  if (input.api_key         !== undefined) patch.api_key_encrypted          = input.api_key;
  if (input.secret_key      !== undefined) patch.secret_key_encrypted       = input.secret_key;
  if (input.username        !== undefined) patch.username_encrypted         = input.username;
  if (input.password        !== undefined) patch.password_encrypted         = input.password;
  if (input.bearer_token    !== undefined) patch.bearer_token_encrypted     = input.bearer_token;
  if (input.webhook_secret  !== undefined) patch.webhook_secret_encrypted   = input.webhook_secret;
  if (input.custom_headers  !== undefined) patch.custom_headers_encrypted   = input.custom_headers;
  if (input.auth_type       !== undefined) patch.auth_type                  = input.auth_type;
  if (input.is_live         !== undefined) patch.is_live                    = input.is_live;
  if (input.metadata        !== undefined) patch.metadata                   = JSON.stringify(input.metadata);

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
      id:                         randomUUID(),
      provider_code:              input.provider_code,
      base_url:                   input.base_url             ?? null,
      api_key_encrypted:          input.api_key              ?? null,
      secret_key_encrypted:       input.secret_key           ?? null,
      username_encrypted:         input.username             ?? null,
      password_encrypted:         input.password             ?? null,
      bearer_token_encrypted:     input.bearer_token         ?? null,
      webhook_secret_encrypted:   input.webhook_secret       ?? null,
      custom_headers_encrypted:   input.custom_headers       ?? null,
      auth_type:                  input.auth_type            ?? "api_key",
      is_live:                    input.is_live              ?? false,
      metadata:                   JSON.stringify(input.metadata ?? {}),
      created_at:                 now,
      updated_at:                 now,
    })
    .returning("*");
  return toSafe(created as ProviderCredentials);
}
