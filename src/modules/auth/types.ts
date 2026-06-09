// src/modules/auth/types.ts
// Domain types for the auth module.

// ── Enums ──────────────────────────────────────────────────────

export type UserStatus =
  | "pending_verification"
  | "active"
  | "suspended"
  | "deactivated"
  | "banned";

export type KycLevel = "none" | "tier_1" | "tier_2" | "tier_3";

// ── Core domain objects ────────────────────────────────────────

export interface AuthUser {
  id:                  string;
  auth_id:             string | null;
  email:               string;
  phone:               string | null;
  username:            string | null;
  status:              UserStatus;
  kyc_level:           KycLevel;
  is_email_verified:   boolean;
  is_phone_verified:   boolean;
  last_login_at:       Date | null;
  created_at:          Date;
  has_transaction_pin: boolean;
}

export interface UserProfile {
  id:             string;
  user_id:        string;
  first_name:     string | null;
  last_name:      string | null;
  display_name:   string | null;
  avatar_url:     string | null;
  country:        string | null;
  city:           string | null;
  address_line1:  string | null;
  gender:         string | null;  // "male" | "female" | "other" | "prefer_not_to_say"
  date_of_birth:  string | null;  // ISO "YYYY-MM-DD"
}

export interface UserPreferences {
  balance_hidden?: boolean;
  [key: string]: unknown;
}

export interface AuthUserWithProfile extends AuthUser {
  profile:              UserProfile | null;
  roles:                string[];
  permissions:          string[];
  has_transaction_pin:  boolean;
  preferences:          UserPreferences;
}

// ── Token types ────────────────────────────────────────────────

/**
 * The shape embedded in req.user after JWT verification.
 * sub = users.id (our UUID), NOT the Supabase auth.users.id.
 */
export interface AccessTokenPayload {
  sub:         string;   // users.id
  id:          string;   // alias for sub
  auth_id:     string;   // Supabase auth.users.id
  email:       string;
  status:      string;
  roles:       string[];
  permissions: string[];
  session:     string;   // sessions.id
  iat?:        number;
  exp?:        number;
}

export interface TokenPair {
  access_token:             string;
  refresh_token:            string;
  access_token_expires_at:  Date;
  refresh_token_expires_at: Date;
}

// ── RBAC ──────────────────────────────────────────────────────

export interface RbacContext {
  roles:       string[];   // slug array
  permissions: string[];   // 'resource:action' array
}

export interface Role {
  id:          string;
  name:        string;
  slug:        string;
  description: string | null;
  is_system:   boolean;
  is_active:   boolean;
}

export interface Permission {
  id:       string;
  resource: string;
  action:   string;
}

// ── Session ────────────────────────────────────────────────────

export interface Session {
  id:                 string;
  user_id:            string;
  token_hash:         string;
  refresh_token_hash: string | null;
  device_id:          string | null;
  ip_address:         string | null;
  user_agent:         string | null;
  is_revoked:         boolean;
  expires_at:         Date;
  created_at:         Date;
}
