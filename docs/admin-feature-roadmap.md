# Admin Feature Roadmap

**Status:** Planning document — no implementation code  
**Date:** 2026-05-18  
**Scope:** Features 1–7 detailed below. Feature 8 (customer theme presets) noted as plan-only.

---

## Table of Contents

1. [Admin Settings: Password & 2FA](#1-admin-settings-password--2fa)
2. [Dynamic Payment Gateways](#2-dynamic-payment-gateways)
3. [Provider Wallet Management](#3-provider-wallet-management)
4. [Service / API Management](#4-service--api-management)
5. [Plan Catalogue Management](#5-plan-catalogue-management)
6. [Manual Wallet Credit / Debit](#6-manual-wallet-credit--debit)
7. [Referral Program](#7-referral-program)
8. [What Already Exists](#8-what-already-exists-reuse-this)
9. [Risky Areas](#9-risky-areas)
10. [Recommended Build Order](#10-recommended-build-order)

---

## 1. Admin Settings: Password & 2FA

### 1.1 Update Password

#### Current system compatibility
`POST /auth/change-password` **already fully implemented**. It uses `ChangePasswordSchema` (`current_password`, `new_password`, `confirm_password`), calls `changePassword()` in `auth.service.ts` which calls `supabaseUpdatePassword()`, then revokes all active sessions and forces re-login. Admin users use the same endpoint as regular users.

The admin dashboard `SettingsPage` currently shows a general settings form but has no password-change UI section.

**Backend work needed:** None — route exists.  
**Frontend work needed:** Add a "Change Password" section/tab to `admin-dashboard/src/pages/Settings.tsx`.

#### Required DB changes
None.

#### Backend routes needed
None new. Existing: `POST /auth/change-password` (authenticated, any role).

#### Frontend pages / components needed
- `Settings.tsx`: new `ChangePasswordCard` component with current/new/confirm fields.  
- Re-use the existing `Input`, `Button`, `Card` from `@/components/ui`.

#### RBAC permissions
None — self-service, no special permission required.

#### Audit log events
`password_change` already exists in the `audit_action` enum in migration 5. `auth.service.ts` should (and likely does) write an audit entry on successful change.

#### Implementation difficulty: ★☆☆☆☆ (trivial frontend only)

---

### 1.2 2FA Enable / Disable for Admin Login

#### Current system compatibility
No 2FA infrastructure exists. The `users` table has a `metadata JSONB` column where a TOTP secret could be stored, but there is no dedicated table, no TOTP library, and no enforcement hook in the login flow. Supabase (used for JWT issuance) has its own TOTP support — this plan does not use it, because we manage sessions independently via the `sessions` table and the `authenticate` middleware validates Supabase JWTs locally.

The simplest path: store TOTP secret encrypted in `user_profiles.metadata` or a new `admin_2fa_configs` table, verify on login, and enforce only for users with admin/super_admin roles.

#### Required DB changes
**New table: `admin_2fa_configs`**

```sql
CREATE TABLE admin_2fa_configs (
  id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID         NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  totp_secret_enc TEXT         NOT NULL,          -- AES-256-GCM via src/lib/crypto.ts
  is_enabled      BOOLEAN      NOT NULL DEFAULT FALSE,
  backup_codes    TEXT[]       NOT NULL DEFAULT '{}', -- bcrypt-hashed codes
  enabled_at      TIMESTAMPTZ,
  last_used_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_2fa_user_id ON admin_2fa_configs (user_id);
```

#### Backend routes needed
```
POST /auth/2fa/setup          → generate TOTP secret, return QR-code URI (unenrolled)
POST /auth/2fa/verify-setup   → confirm first TOTP code to activate
POST /auth/2fa/disable        → require current TOTP code + password to disable
GET  /auth/2fa/status         → is 2FA enabled for current user?
POST /auth/login (modify)     → after credential check, if user has 2FA enabled,
                                return { requires_2fa: true, temp_token } instead of
                                access_token; client sends TOTP code to:
POST /auth/2fa/challenge      → validate TOTP, exchange temp_token for access_token
```

Login flow change: the `loginController` checks whether the user has an active `admin_2fa_configs` record. If yes, it issues a short-lived `temp_token` (signed JWT, no session created yet) and returns `{ requires_2fa: true }`. The 2FA challenge endpoint validates the TOTP code and only then creates the session and returns the full `access_token`.

#### Frontend pages / components needed
- `Settings.tsx`: "Two-Factor Authentication" card — setup button, QR code display, verification input, disable button.
- `Login.tsx`: detect `requires_2fa: true` in login response, show TOTP input step.
- New `admin-dashboard/src/api/twofa.api.ts`.

#### RBAC permissions
No special permission — self-service for any authenticated user.  
Admin can force-disable 2FA for another user: requires `user:update` permission.

#### Audit log events
- `password_change` (reuse for 2FA setup/disable — or add `2fa_enable`, `2fa_disable` to `audit_action` enum)

#### Risky areas
- Login flow change is high-risk — any bug locks admins out entirely. Must be behind a feature flag (`admin_settings.key = '2fa_enabled'`) that can be toggled via DB before deployment.
- `temp_token` must have a very short TTL (5 minutes) and be single-use.
- Backup codes must be hashed (bcrypt) and single-use.
- TOTP library dependency: recommend `otplib` (maintained, TypeScript-native).

#### Implementation difficulty: ★★★☆☆ (medium — login flow modification is risky)

---

## 2. Dynamic Payment Gateways

### Current system compatibility
Paystack is hard-coded as a singleton (`paystackGateway`) in `src/modules/wallet/services/paystack.service.ts`. The `PaymentGateway` interface in `src/modules/wallet/types/payment-gateway.types.ts` **already exists** and is implemented by `PaystackGateway` — this is the right abstraction to build on.

The `wallet-funding.controller.ts` references `paystackGateway` directly. This coupling needs to be replaced by a gateway registry.

No `payment_gateways` table exists. Config lives entirely in `.env` (`PAYSTACK_SECRET_KEY`, etc.).

#### Required DB changes
**New table: `payment_gateways`**

```sql
CREATE TABLE payment_gateways (
  id                  UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  code                TEXT          NOT NULL UNIQUE,  -- 'paystack' | 'monnify' | 'billstack'
  display_name        TEXT          NOT NULL,
  is_active           BOOLEAN       NOT NULL DEFAULT FALSE,
  is_live             BOOLEAN       NOT NULL DEFAULT FALSE,
  base_url            TEXT,
  -- Encrypted credentials (AES-256-GCM via src/lib/crypto.ts)
  public_key_enc      TEXT,
  secret_key_enc      TEXT,
  webhook_secret_enc  TEXT,
  callback_url        TEXT,
  -- Top-up charge configuration
  charge_type         TEXT          NOT NULL DEFAULT 'none'  -- 'none' | 'flat' | 'percentage'
                      CHECK (charge_type IN ('none', 'flat', 'percentage')),
  charge_amount       NUMERIC(18,2) NOT NULL DEFAULT 0,  -- ₦ if flat, % if percentage
  charge_cap          NUMERIC(18,2),                      -- max charge when type = 'percentage'
  -- Sort / display
  priority            INTEGER       NOT NULL DEFAULT 100,
  metadata            JSONB         NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_pg_is_active ON payment_gateways (is_active, priority);
```

**Modify `funding_transactions`** — add gateway reference:
```sql
ALTER TABLE funding_transactions
  ADD COLUMN gateway_id UUID REFERENCES payment_gateways(id) ON DELETE SET NULL,
  ADD COLUMN charge_amount NUMERIC(18,2) DEFAULT 0,
  ADD COLUMN net_amount NUMERIC(18,2);  -- amount - charge_amount
```

#### Backend routes needed
```
GET    /admin/payment-gateways           → list all (admin)
POST   /admin/payment-gateways           → create/register new gateway
PATCH  /admin/payment-gateways/:code     → update name, status, charge config
DELETE /admin/payment-gateways/:code     → soft-disable (never hard delete)
POST   /admin/payment-gateways/:code/credentials → upsert encrypted secrets
GET    /admin/payment-gateways/active    → list active gateways (used by frontend checkout)
```

#### Gateway registry service
Create `src/modules/wallet/services/gateway-registry.service.ts`:
- On startup (or on first request), loads active gateways from DB.
- For each gateway `code`, maps to the corresponding class (`PaystackGateway`, `MonnifyGateway`, etc.).
- Exposes `getGateway(code): PaymentGateway` and `listActiveGateways(): GatewayEntry[]`.
- Refresh cache periodically or on admin update.

`wallet-funding.controller.ts` change: accept `gateway` param in the initialize request body; call `gatewayRegistry.getGateway(gateway)` instead of `paystackGateway` directly.

#### Charge calculation (wallet top-up)
In `initializeFundingController`:
```
1. Load selected gateway from DB (including charge config)
2. Compute charge:
   - flat:       charge_amount
   - percentage: min(amount * charge_amount / 100, charge_cap ?? ∞)
   - none:       0
3. net_credit = amount - charge
4. Credit user wallet with net_credit
5. Credit fee wallet with charge (double-entry)
6. Record charge_amount + net_amount on funding_transactions row
```

A "fee wallet" must exist (the settlement wallet already supports `wallet_type = 'fee'` — confirm `SYSTEM_FEE_WALLET_ID` env var is set).

#### Frontend pages / components needed
- **New page**: `admin-dashboard/src/pages/PaymentGateways.tsx`
  - List of gateways (Paystack, Monnify, BillStack…)
  - Toggle active/inactive per gateway
  - Edit charge config: flat/percentage/none
  - Credential update form (masked inputs)
- Add sidebar entry under Payments section.
- **New api module**: `admin-dashboard/src/api/gateways.api.ts`
- **Modify wallet funding page** (customer-facing, not admin) to show available gateways.

#### RBAC permissions
New permissions to seed:
```
{ resource: "gateway", action: "read" }
{ resource: "gateway", action: "create" }
{ resource: "gateway", action: "update" }
```
Add `gateway:read`, `gateway:create`, `gateway:update` to `admin` and `super_admin` role permissions.

#### Audit log events
- `gateway_create`, `gateway_update`, `gateway_credentials_update` — add to `adminAudit.ts` resolver.

#### Implementation difficulty: ★★★★☆ (complex — touches payment flow, charge accounting, encryption)

---

## 3. Provider Wallet Management

### Current system compatibility
**Substantial infrastructure already exists:**

| Existing | Location |
|---|---|
| `provider_configs` table | migration 20260515000003 |
| `provider_credentials` table | migration 20260516000009 |
| AES-256-GCM encryption | `src/lib/crypto.ts` |
| `upsertProviderCredentials()` | `provider-credentials.service.ts` |
| `ProviderBalance` interface | `provider.types.ts` |
| Admin CRUD for providers | `admin-providers.routes.ts` |

**What is missing:**
- No `wallet_balance`, `balance_threshold`, `balance_last_checked_at`, or `funding_account_details` on `provider_credentials`.
- No balance-check endpoint that calls the provider's balance API and stores the result.
- No low-balance alerting.
- No manual balance override.

#### Required DB changes
**Alter `provider_credentials`:**
```sql
ALTER TABLE provider_credentials
  ADD COLUMN wallet_balance           NUMERIC(18,2),
  ADD COLUMN balance_threshold        NUMERIC(18,2) DEFAULT 0,
  ADD COLUMN balance_last_checked_at  TIMESTAMPTZ,
  ADD COLUMN balance_auto_check       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN funding_account_details  JSONB NOT NULL DEFAULT '{}';
  -- funding_account_details stores: { bank_name, account_number, account_name, sort_code }
```

#### Backend routes needed
```
GET  /admin/providers/:code/balance           → call provider API for live balance, store result
POST /admin/providers/:code/balance           → manual balance override (when API unavailable)
PATCH /admin/providers/:code/balance-settings → update threshold, auto_check flag
```

Modify `listProvidersWithCredentialStatus()` in `provider-credentials.service.ts` to include `wallet_balance`, `balance_threshold`, `balance_last_checked_at`.

#### Balance check service
`getProviderBalance()` already defined on the `VTPassProvider` class (returns `ProviderBalance`). Add `getBalance()` to the `ProviderInterface` and implement for each gateway. When a balance check is triggered (cron or admin action), call it, persist result, and evaluate threshold.

#### Low-balance alerting
If `wallet_balance < balance_threshold` after a check, create a notification (via the existing `createNotification()` service) targeting admin users. Notification type: `provider_low_balance`.

#### Frontend pages / components needed
**Modify existing** `admin-dashboard/src/pages/Providers.tsx`:
- Show `wallet_balance` in provider detail drawer.
- "Check Balance" button → calls `GET /admin/providers/:code/balance`.
- "Override Balance" form → calls `POST /admin/providers/:code/balance`.
- "Balance Threshold" field → calls `PATCH`.
- "Funding Account" section (read-only display, edit in credentials form).
- Low-balance badge on provider list rows where `balance < threshold`.

#### RBAC permissions
Reuse existing `provider:read` and `provider:update`.

#### Audit log events
Add to `adminAudit.ts` resolver: `provider_balance_check`, `provider_balance_override`.

#### Implementation difficulty: ★★☆☆☆ (easy — mostly DB columns + new route handlers)

---

## 4. Service / API Management

### Current system compatibility
**What exists:**
- `catalog_services`: `slug`, `name`, `service_type`, `is_active` — toggle service on/off
- `service_plans`: `provider_code`, `variation_code`, `is_active`, `primary_provider_code`, `fallback_provider_code`
- Admin CRUD routes exist for both tables

**What is missing:**
- No `network_operator` column (MTN, Airtel, Glo, 9mobile, DSTV, etc.)
- No `plan_category` column (SME, corporate, gifting, DND)
- No per-provider-per-service-type enable/disable (currently you must disable each plan individually)
- No bulk enable/disable by operator or category

#### Required DB changes
**Alter `service_plans`:**
```sql
ALTER TABLE service_plans
  ADD COLUMN network_operator  TEXT,          -- 'mtn' | 'airtel' | 'glo' | '9mobile' | 'dstv' | 'gotv' | etc.
  ADD COLUMN plan_category     TEXT,          -- 'sme' | 'corporate' | 'gifting' | 'dnd' | 'standard' | etc.
  ADD COLUMN duration_days     INTEGER;       -- null = unlimited / variable
```

**New table: `provider_service_toggles`** — per-provider, per-service-type enable/disable:
```sql
CREATE TABLE provider_service_toggles (
  id                UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_code     TEXT    NOT NULL,
  service_type      TEXT    NOT NULL,   -- 'airtime' | 'data' | etc.
  network_operator  TEXT,              -- NULL = applies to all operators for this service
  is_enabled        BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by        UUID    REFERENCES users(id) ON DELETE SET NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider_code, service_type, COALESCE(network_operator, ''))
);
```

#### Backend routes needed
```
GET    /admin/service-toggles                → list per-provider toggles
POST   /admin/service-toggles               → create toggle entry
PATCH  /admin/service-toggles/:id           → enable/disable
DELETE /admin/service-toggles/:id           → remove override
POST   /admin/service-plans/bulk-update     → bulk is_active by filters (operator, category, provider)
```

The purchase routing service (`provider-routing.service.ts`) must respect `provider_service_toggles` when selecting a provider — check the toggle table before allowing a provider for a given service type.

#### Frontend pages / components needed
**Modify existing** `admin-dashboard/src/pages/Services.tsx` and `ServicePlans.tsx`:
- Add `network_operator` and `plan_category` columns to service plans table.
- Filter controls: operator dropdown, category dropdown, provider dropdown.
- Bulk action bar: select multiple plans → enable/disable/change provider.
**New section** in Services page: "Provider-Service Toggles" table with toggle switches.

#### RBAC permissions
Reuse `catalog:update`.

#### Audit log events
`catalog_update` (already in audit resolver) with detailed `resource_id`.

#### Implementation difficulty: ★★☆☆☆ (easy — additive DB changes + filter/bulk endpoints)

---

## 5. Plan Catalogue Management

### Current system compatibility
**What exists:**
- `service_plans` table with most required fields: `service_id`, `provider_code`, `name`, `variation_code`, `amount`, `cost_price`, `selling_price`, `is_variable_amount`, `metadata`, `is_active`, `primary_provider_code`, `fallback_provider_code`, `provider_variation_code`, `provider_metadata`
- Admin CRUD in `admin-catalog.routes.ts` (list, create, update by ID)
- `provider_configs` table for registered providers

**What is missing:**
- `network_operator`, `plan_category`, `duration_days` (see Feature 4)
- No `DELETE` endpoint for plans (only `is_active = false`)
- No pagination on `GET /admin/service-plans` (returns all, will slow down as plans grow)
- Plan creation form doesn't enforce provider-from-registry — `provider_code` is free text; no FK to `provider_configs`

#### Required DB changes
Add the three columns from Feature 4 (`network_operator`, `plan_category`, `duration_days`) — same migration covers both features.

Add soft-FK hint (not a hard FK, because `service_plans.provider_code` is a string and `provider_configs.provider_code` is also a string — they already match semantically):
```sql
-- Optional: add CHECK constraint for data integrity
-- Hard FK: ALTER TABLE service_plans ADD CONSTRAINT fk_sp_provider
--          FOREIGN KEY (provider_code) REFERENCES provider_configs (provider_code);
-- Note: this would break seed data that creates plans before providers.
-- Recommend: enforce at application layer only.
```

#### Backend routes needed
```
GET    /admin/service-plans          → paginate (add limit/offset, filter by operator/category/provider/is_active)
POST   /admin/service-plans          → create (provider_code validated against provider_configs)
PATCH  /admin/service-plans/:id      → update price, category, provider mapping, status
DELETE /admin/service-plans/:id      → soft-delete (set is_active = false, add deleted_at)
POST   /admin/service-plans/import   → bulk CSV/JSON import (optional, future)
```

**Modify** `adminListServicePlans()` in `catalog.service.ts` to support pagination and the new filter columns.

#### Frontend pages / components needed
**Modify existing** `admin-dashboard/src/pages/ServicePlans.tsx`:
- Add pagination (currently loads all).
- Add filter bar: service type, network operator, category, provider, status.
- Add `network_operator`, `plan_category`, `duration_days` columns to table and edit form.
- Provider selector in create/edit form — dropdown populated from `GET /admin/providers`.
- Inline price edit (selling price, cost price) without opening full modal.
- Bulk status toggle via row selection.

#### RBAC permissions
Reuse `catalog:create`, `catalog:update`, `catalog:delete`.

#### Audit log events
`catalog_create`, `catalog_update`, `catalog_delete` (all already in audit resolver).

#### Implementation difficulty: ★★☆☆☆ (easy — mostly UI improvements + pagination + new columns shared with Feature 4)

---

## 6. Manual Wallet Credit / Debit

### Current system compatibility
**The entire infrastructure already exists:**

| Component | Location |
|---|---|
| `WalletService.credit()` | `src/services/wallet/WalletService.ts` |
| `WalletService.debit()` | `src/services/wallet/WalletService.ts` |
| Double-entry ledger | `wallet_ledger`, `wallet_journal_batches` |
| `createTransaction()` | `transactions.service.ts` |
| `wallet:execute` permission | migration 20260517000008 |
| Admin audit middleware | `src/middleware/adminAudit.ts` |
| `admin_activity_logs` table | migration 20240101000005 |

The only thing missing is the admin route that calls these services, the RBAC gate, and the frontend page.

#### Required DB changes
None — all tables exist.

#### Backend routes needed
```
POST /admin/wallet/credit          → credit a user's wallet
POST /admin/wallet/debit           → debit a user's wallet
GET  /admin/wallet/users/search    → search user by email, phone, or username (return id + wallet id)
```

Request body for credit/debit:
```json
{
  "user_id": "uuid",
  "wallet_id": "uuid",            // optional — defaults to user's primary wallet
  "amount": 5000.00,
  "currency": "NGN",
  "reason": "Customer support refund for ticket #TKT-001",
  "reference": "ADMIN-CREDIT-xxxx"  // auto-generated if omitted
}
```

Controller logic:
1. Validate input (require `reason`, min 10 chars)
2. Load user wallet, confirm ownership
3. For debit: check balance ≥ amount (unless overdraft configured)
4. Call `walletService.credit()` or `walletService.debit()` with `contra_wallet_id = SYSTEM_SETTLEMENT_WALLET_ID`
5. Call `createTransaction()` with `type = 'wallet_credit'` or `'wallet_debit'`, `status = 'successful'`
6. Audit entry written automatically by `adminAuditMiddleware` via `res.on('finish')`

#### Frontend pages / components needed
**New page**: `admin-dashboard/src/pages/ManualWalletOps.tsx`
- User search bar (email / phone / username)
- User card: shows name, email, current balance
- Credit / Debit form: amount, reason, reference (auto-generated)
- Confirmation modal: "You are about to credit ₦X,XXX to [user email]. This cannot be reversed without another manual operation."
- Recent operations table (last 20 admin-initiated wallet ops)

Add sidebar entry under System section.

**New api module**: `admin-dashboard/src/api/walletOps.api.ts`

#### RBAC permissions
Gate with `requirePermission("wallet:execute")`.  
`wallet:execute` is already seeded and assigned to `admin` and `super_admin` roles.

Also add a new permission for explicitness:
```
{ resource: "wallet", action: "admin_adjust", description: "Manual admin credit/debit" }
```
(Optional — existing `wallet:execute` already covers this.)

#### Audit log events
`wallet_credit` and `wallet_debit` already exist in the `audit_action` enum.  
The `adminAuditMiddleware` will write to `admin_activity_logs` automatically.  
**Additionally**: write to `audit_logs` (the append-only, compliance-grade table) for every manual operation — this is not done automatically and must be explicit in the controller.

#### Risky areas
- Must never allow negative wallet balance unless overdraft_limit > 0.
- The `reason` field must be enforced (minimum length) — a silent credit/debit with no reason is a compliance failure.
- Require a second confirmation step in the UI for amounts above a configurable threshold (e.g., ₦50,000).
- The `contra_wallet_id` must be the system settlement wallet, not null — a missing `SYSTEM_SETTLEMENT_WALLET_ID` env var should return 503, not silently skip the contra entry.

#### Implementation difficulty: ★★☆☆☆ (easy — all core logic exists, just needs route + UI)

---

## 7. Referral Program

### Current system compatibility
**Schema foundation exists:**
- `users.referral_code` (TEXT UNIQUE) — present in migration 1
- `users.referred_by_id` (UUID, self-referential FK) — present in migration 1
- `users.metadata` JSONB — can store referral state flags
- `commissions` table — already designed for commission payouts with `commission_type = 'referral'`

**What is missing:**
- No referral reward rules table (configurable amounts/triggers)
- No referral events tracking table
- No duplicate reward prevention (reward idempotency)
- No referral dashboard data

#### Required DB changes
**New table: `referral_rules`** — configurable reward rules:
```sql
CREATE TABLE referral_rules (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  rule_code       TEXT          NOT NULL UNIQUE,  -- 'signup' | 'first_funding' | 'first_purchase' | custom
  is_enabled      BOOLEAN       NOT NULL DEFAULT FALSE,
  description     TEXT          NOT NULL,
  reward_type     TEXT          NOT NULL DEFAULT 'flat'  -- 'flat' | 'percentage'
                  CHECK (reward_type IN ('flat', 'percentage')),
  reward_amount   NUMERIC(18,2) NOT NULL DEFAULT 0,  -- ₦ if flat, % if percentage
  reward_cap      NUMERIC(18,2),                     -- max payout for percentage type
  reward_target   TEXT          NOT NULL DEFAULT 'referrer'  -- 'referrer' | 'referee' | 'both'
                  CHECK (reward_target IN ('referrer', 'referee', 'both')),
  min_amount      NUMERIC(18,2),  -- e.g., first_funding must be >= ₦1,000 to trigger
  max_uses        INTEGER,        -- NULL = unlimited
  expiry_at       TIMESTAMPTZ,
  metadata        JSONB         NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
```

**New table: `referral_rewards`** — records of awarded rewards (prevents duplicates):
```sql
CREATE TABLE referral_rewards (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  rule_id         UUID          NOT NULL REFERENCES referral_rules(id),
  referrer_id     UUID          NOT NULL REFERENCES users(id),
  referee_id      UUID          NOT NULL REFERENCES users(id),
  trigger_type    TEXT          NOT NULL,   -- 'signup' | 'first_funding' | 'first_purchase'
  trigger_ref     TEXT,                     -- transaction reference or event that triggered
  reward_amount   NUMERIC(18,2) NOT NULL,
  reward_target   TEXT          NOT NULL,
  wallet_credit_id UUID,                    -- journal_batch_id of the credit operation
  transaction_id  TEXT,                     -- reference of the created transaction
  status          TEXT          NOT NULL DEFAULT 'pending'  -- 'pending' | 'credited' | 'reversed' | 'failed'
                  CHECK (status IN ('pending', 'credited', 'reversed', 'failed')),
  credited_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  UNIQUE (rule_id, referee_id, trigger_type)  -- prevents duplicate rewards per referee per rule
);
CREATE INDEX idx_rr_referrer ON referral_rewards (referrer_id);
CREATE INDEX idx_rr_referee ON referral_rewards (referee_id);
CREATE INDEX idx_rr_status ON referral_rewards (status);
```

#### Backend routes needed
**Admin referral management:**
```
GET    /admin/referrals/rules             → list all rules
POST   /admin/referrals/rules             → create rule
PATCH  /admin/referrals/rules/:id         → update rule (amount, enabled, etc.)
GET    /admin/referrals/rewards           → paginated list of awarded rewards
GET    /admin/referrals/reports           → aggregate stats (total rewarded, top referrers)
POST   /admin/referrals/rewards/:id/reverse → manually reverse a reward
```

**Referral processing hooks** (internal, triggered by existing services):
- Hook into `register()` in `auth.service.ts`: when `referral_code` is present, look up referrer, log referral relationship (already stored via `referred_by_id`), trigger `signup` rule if enabled.
- Hook into `verifyFundingController` and the webhook handler: on first successful funding, trigger `first_funding` rule.
- Hook into the purchase execution service: on first successful purchase, trigger `first_purchase` rule.

Each hook calls a `processReferralReward(event)` service function that:
1. Checks if rule is enabled
2. Checks `referral_rewards` for duplicate (UNIQUE constraint is the idempotency gate)
3. Computes reward amount
4. Calls `WalletService.credit()` to credit the reward
5. Creates a `transaction` record with `type = 'commission_payout'`
6. Updates `referral_rewards.status = 'credited'`

#### Frontend pages / components needed
**New page**: `admin-dashboard/src/pages/ReferralProgram.tsx`
- "Rules" tab: list of rules with enable/disable toggle, edit amount/type
- "Rewards" tab: table of awarded rewards, filterable by date / referrer / status
- "Reports" tab: total rewards paid out, top 10 referrers, reward by type breakdown
- Stat cards: total rewards issued, total reward amount, active referrers

Add sidebar entry under Finance or System section.

**New api module**: `admin-dashboard/src/api/referral.api.ts`

#### RBAC permissions
New permissions to seed:
```
{ resource: "referral", action: "read" }
{ resource: "referral", action: "create" }
{ resource: "referral", action: "update" }
{ resource: "referral", action: "execute" }
```
Assign to `admin`, `super_admin`, and optionally `finance`.

#### Audit log events
`config_change` (for rule updates), `wallet_credit` (for reward payouts — already in enum).

#### Risky areas
- Referral fraud: must enforce `UNIQUE (rule_id, referee_id, trigger_type)` at DB level, not just application level.
- Race condition on "first purchase" event: if two purchases complete simultaneously, both could attempt to award the reward before either commits. The DB UNIQUE constraint is the final arbiter — one will fail with a constraint violation, which must be caught and swallowed.
- Do not award referral rewards to self-referred accounts (`referrer_id == referee_id`).
- Referral code generation: `users.referral_code` exists but the code to generate and assign it on signup may not be in `auth.service.ts` — verify and add if missing.

#### Implementation difficulty: ★★★☆☆ (medium — new tables + hooks in existing flows + deduplication logic)

---

## 8. What Already Exists (Reuse This)

| Needed for | Existing asset | Location |
|---|---|---|
| Admin password change | `POST /auth/change-password` | `auth.controller.ts` |
| Encryption for secrets | `encrypt()` / `decrypt()` | `src/lib/crypto.ts` |
| Provider credential storage | `provider_credentials` table + service | `provider-credentials.service.ts` |
| Double-entry wallet credit/debit | `WalletService.credit()` / `.debit()` | `src/services/wallet/WalletService.ts` |
| Audit middleware | `adminAuditMiddleware` | `src/middleware/adminAudit.ts` |
| Audit log table | `admin_activity_logs` (auto) + `audit_logs` (manual) | migration 5 |
| RBAC permission gating | `requirePermission()` | `src/modules/auth/middleware/authorize.ts` |
| Permission seeding | `PERMISSIONS` / `ROLE_PERMISSIONS` | migration 20260517000008 |
| Referral fields | `users.referral_code`, `users.referred_by_id` | migration 1 |
| Commission payout table | `commissions` table | migration 4 |
| Admin settings store | `admin_settings` table + PATCH route | migration 20260517000009 |
| Service types | `catalog_services` + `service_plans` | migrations 20260515000001/2 |
| Provider configs | `provider_configs` table + CRUD | migration 20260515000003 |
| Payment gateway interface | `PaymentGateway` interface | `payment-gateway.types.ts` |
| Plan provider routing | `primary_provider_code`, `fallback_provider_code` | migration 20260517000010 |
| Notification service | `createNotification()` | `notification.service.ts` |
| Wallet types | `wallet_type` enum: `fee`, `settlement`, `commission` | migration 3 |

---

## 9. Risky Areas

| Risk | Feature | Mitigation |
|---|---|---|
| **Auth lockout from 2FA bug** | Feature 1.2 | Feature flag in `admin_settings`. Disable via DB before rollout. Keep backup codes. Test thoroughly with temp accounts. |
| **Payment flow regression** | Feature 2 | Gateway registry must fall back to Paystack if DB lookup fails. Write integration tests for Paystack path before adding new gateways. |
| **Double credits on wallet funding** | Feature 2 | The existing `idempotency_key` on `walletService.credit()` prevents double credit. The `funding_transactions.verified` flag is the idempotency gate for Paystack verification. Charge calculation must happen inside the same DB transaction as the credit. |
| **Encryption key rotation** | Features 2 & 3 | All encrypted fields use `src/lib/crypto.ts` AES-256-GCM. If `ENCRYPTION_KEY` rotates, existing records become unreadable. Plan a key-rotation migration before storing more secrets. |
| **Unbalanced double-entry on manual credit** | Feature 6 | `WalletService` enforces balance on journal batches at DB level. `SYSTEM_SETTLEMENT_WALLET_ID` must be set. Add a startup check that fails loudly if missing. |
| **Referral fraud / race condition** | Feature 7 | DB UNIQUE constraint `(rule_id, referee_id, trigger_type)` is the authoritative gate. Application-layer checks are best-effort only. |
| **Self-referral** | Feature 7 | Enforce `referrer_id != referee_id` at the `processReferralReward` service layer. |
| **Breaking existing plan routing** | Features 4 & 5 | `network_operator` and `plan_category` are nullable columns — existing plans are unaffected. Migration is additive. |
| **Provider service toggle not respected** | Feature 4 | The `provider-routing.service.ts` must query `provider_service_toggles` before selecting a provider. Missing this breaks purchases silently. Write a test that verifies a disabled provider is not selected. |

---

## 10. Recommended Build Order

The order minimizes risk, respects dependencies, and delivers working value incrementally.

| Step | Feature | Why this order |
|---|---|---|
| **1** | **Feature 6: Manual Wallet Credit/Debit** | Highest ROI for least effort. All backend infrastructure exists. Immediately useful for support ops. No risky changes. |
| **2** | **Feature 1.1: Admin Password Change (frontend only)** | Trivial — backend exists. No dependencies. |
| **3** | **Features 4+5 together: Service/Plan Management** | Share the same DB migration (add `network_operator`, `plan_category`, `duration_days`). Additive, non-breaking. Unlocks improved catalog UX. |
| **4** | **Feature 3: Provider Wallet Management** | Builds on existing `provider_credentials` table. Additive DB changes only. Useful for operations monitoring. |
| **5** | **Feature 2: Dynamic Payment Gateways** | Moderate complexity. Must be feature-flagged. Lays groundwork for BillStack/Monnify integrations. |
| **6** | **Feature 7: Referral Program** | New tables + hooks into existing flows. No urgency until user growth warrants it. |
| **7** | **Feature 1.2: 2FA** | Highest risk (login flow). Build last, behind a feature flag. Requires thorough testing before enablement. |
| **8** | **Feature 8: Customer Theme Presets** | Plan only — do not implement yet. |

---

## First Implementation Task

**Feature 6: Manual Wallet Credit/Debit**

Exact deliverables:
1. New route file: `src/modules/wallet/routes/admin-wallet-ops.routes.ts`  
   - `POST /admin/wallet/credit` and `POST /admin/wallet/debit`
   - Guard: `authenticate + requireRole("admin","super_admin") + requirePermission("wallet:execute")`
2. New controller: `src/modules/wallet/controllers/admin-wallet-ops.controller.ts`
3. New service function: `manualWalletAdjust(input)` in `src/modules/wallet/services/admin-wallet-ops.service.ts`  
   - Calls `WalletService.credit()` or `.debit()`
   - Calls `createTransaction()` with appropriate type
   - Writes to `audit_logs` explicitly
4. Mount in `src/app.ts`
5. Frontend: new `ManualWalletOps.tsx` page + `walletOps.api.ts` + sidebar entry
6. Type-check and build

---

## Files Inspected

| File | Purpose |
|---|---|
| `src/app.ts` | Confirms all mounted routers and middleware order |
| `src/database/migrations/20240101000001_auth_rbac.ts` | users, roles, permissions, sessions schema |
| `src/database/migrations/20240101000003_wallets_ledger.ts` | wallets, wallet_ledger, v_wallet_balances |
| `src/database/migrations/20240101000004_transactions.ts` | transactions, refunds, reversals, commissions |
| `src/database/migrations/20240101000005_system_audit.ts` | audit_logs, admin_activity_logs |
| `src/database/migrations/20260514211000_create_transactions_table.ts` | Active transactions table (simpler schema) |
| `src/database/migrations/20260515000001_create_catalog_services.ts` | catalog_services |
| `src/database/migrations/20260515000002_create_service_plans.ts` | service_plans |
| `src/database/migrations/20260515000003_create_provider_configs.ts` | provider_configs |
| `src/database/migrations/20260516000009_create_provider_credentials.ts` | provider_credentials + encryption columns |
| `src/database/migrations/20260516000012_create_funding_transactions.ts` | funding_transactions |
| `src/database/migrations/20260517000008_seed_permissions.ts` | Full RBAC permission + role assignments |
| `src/database/migrations/20260517000009_create_admin_settings.ts` | admin_settings table + seeds |
| `src/database/migrations/20260517000010_add_provider_routing_to_service_plans.ts` | provider routing overrides on plans |
| `src/modules/auth/controllers/auth.controller.ts` | Login, register, change-password flow |
| `src/modules/auth/validators/auth.validators.ts` | ChangePasswordSchema |
| `src/modules/auth/services/auth.service.ts` | Auth business logic, Supabase integration |
| `src/modules/auth/services/supabase.service.ts` | Supabase client (TOTP not used) |
| `src/modules/auth/middleware/authorize.ts` | requireRole, requirePermission |
| `src/modules/wallet/controllers/wallet-funding.controller.ts` | Paystack init + verify, wallet credit |
| `src/modules/wallet/services/paystack.service.ts` | PaystackGateway class |
| `src/modules/wallet/types/payment-gateway.types.ts` | PaymentGateway interface |
| `src/modules/wallet/routes/wallet.routes.ts` | Customer wallet routes |
| `src/modules/wallet/routes/admin-wallet.routes.ts` | Admin ledger/funding routes |
| `src/modules/providers/services/provider-credentials.service.ts` | Credential CRUD + toSafe() |
| `src/modules/providers/services/provider-config.service.ts` | Provider config CRUD |
| `src/modules/providers/types/provider.types.ts` | ProviderBalance, ProviderPurchaseInput |
| `src/modules/providers/controllers/admin-providers.controller.ts` | Provider CRUD handlers |
| `src/modules/catalog/controllers/admin-catalog.controller.ts` | Service + plan CRUD |
| `src/modules/catalog/routes/admin-catalog.routes.ts` | Admin catalog routes |
| `src/modules/settings/controllers/settings.controller.ts` | Admin settings read/write |
| `src/modules/settings/routes/admin-settings.routes.ts` | Settings routes |
| `src/modules/audit/routes/admin-audit.routes.ts` | Audit log query routes |
| `src/middleware/adminAudit.ts` | Auto-audit for mutating admin requests |
| `src/services/wallet/WalletService.ts` | credit(), debit(), transfer() |
| `src/lib/crypto.ts` | AES-256-GCM encrypt/decrypt |
