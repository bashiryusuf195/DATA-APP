# VTU Platform — Production Operations Guide

## 1. Railway Environment Variables

### Required (server will not start without these)

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Runtime environment | `production` |
| `PORT` | HTTP port | `3000` |
| `SUPABASE_URL` | Supabase project URL | `https://xxxx.supabase.co` |
| `SUPABASE_ANON_KEY` | Supabase anon/public key | `eyJ...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key (never expose to client) | `eyJ...` |
| `DATABASE_URL` | Postgres connection string (pooler/pgbouncer for prod) | `postgresql://...?pgbouncer=true` |
| `REDIS_URL` | Upstash Redis URL | `rediss://default:TOKEN@host.upstash.io:6380` |
| `JWT_SECRET` | Supabase JWT secret (from project settings) | 64-char string |
| `ENCRYPTION_KEY` | AES-256 key for NIN/BVN at rest (exactly 64 hex chars) | `a1b2c3...` |
| `SYSTEM_TREASURY_WALLET_ID` | UUID of the platform treasury wallet | `uuid` |
| `GENESIS_EQUITY_WALLET_ID` | UUID of the equity/float wallet | `uuid` |
| `SYSTEM_SETTLEMENT_WALLET_ID` | UUID of the settlement wallet (receives gateway credits) | `uuid` |

### Payment Gateways (at least one required for wallet funding)

| Variable | Description |
|----------|-------------|
| `PAYSTACK_SECRET_KEY` | Paystack secret key (`sk_live_...`) |
| `PAYSTACK_PUBLIC_KEY` | Paystack public key (`pk_live_...`) |
| `PAYSTACK_WEBHOOK_SECRET` | Optional; falls back to `PAYSTACK_SECRET_KEY` for HMAC validation |
| `PAYSTACK_CALLBACK_URL` | Redirect URL after card payment (optional for in-app transfer flow) |
| `SQUAD_SECRET_KEY` | Squad secret key |
| `SQUAD_PUBLIC_KEY` | Squad public key |
| `SQUAD_BASE_URL` | `https://api-d.squadco.com` (live) or `https://sandbox-api-d.squadco.com` (sandbox) |
| `SQUAD_WEBHOOK_SECRET` | Optional; falls back to `SQUAD_SECRET_KEY` |

### VTPass (service purchases)

| Variable | Description |
|----------|-------------|
| `VTPASS_BASE_URL` | `https://vtpass.com/api` (live) or `https://sandbox.vtpass.com/api` |
| `VTPASS_USERNAME` | VTPass account email |
| `VTPASS_PASSWORD` | VTPass account password |
| `VTPASS_API_KEY` | VTPass API key |
| `VTPASS_PUBLIC_KEY` | VTPass public key |
| `VTPASS_SECRET_KEY` | VTPass secret key |

### WebAuthn / Passkeys

| Variable | Description | Default |
|----------|-------------|---------|
| `WEBAUTHN_RP_ID` | Domain name (no protocol/port) | `localhost` |
| `WEBAUTHN_RP_NAME` | Display name shown in OS biometric prompt | `VTU Platform` |
| `WEBAUTHN_ORIGIN` | Full frontend URL | `http://localhost:5174` |

### Customer App

| Variable | Description |
|----------|-------------|
| `CUSTOMER_APP_URL` | Full URL of the customer frontend (used in password-reset emails) | `https://app.hivedata.com.ng` |

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_READ_URL` | Read-replica connection string | Falls back to `DATABASE_URL` |
| `LOG_LEVEL` | `debug` / `info` / `warn` / `error` | `info` |
| `RATE_LIMIT_WINDOW_MS` | Rate-limit window in ms | `60000` |
| `RATE_LIMIT_MAX` | Max requests per window | `60` |
| `CORS_ORIGINS` | Comma-separated allowed origins | `http://localhost:5173` |
| `DISABLE_WORKERS` | Set `true` to run API only (no BullMQ workers) | `false` |
| `APP_VERSION` | Semantic version — shown in health endpoints | `1.0.0` |
| `SENTRY_DSN` | Sentry project DSN (register adapter in `src/lib/error-reporter.ts`) | — |

---

## 2. Webhook URLs

Register these in the respective provider dashboards:

| Provider | Event | URL |
|----------|-------|-----|
| Paystack | `charge.success`, `dedicatedaccount.assign.success` | `https://api.hivedata.com.ng/api/v1/webhooks/paystack` |
| Squad | `charge.success` (DVA transfers) | `https://api.hivedata.com.ng/api/v1/webhooks/squad` |

**Signature verification is enforced.** Paystack signs with HMAC-SHA512 of the raw body using `PAYSTACK_SECRET_KEY` (or `PAYSTACK_WEBHOOK_SECRET` if set) in `x-paystack-signature`. Squad uses `x-squad-encrypted-body`.

Test with:
```bash
curl -X POST https://api.hivedata.com.ng/api/v1/webhooks/paystack \
  -H "Content-Type: application/json" \
  -H "x-paystack-signature: <computed-hmac>" \
  -d '{"event":"charge.success","data":{"reference":"TEST_REF"}}'
```
Expected: `{"success":true}` (always 200; processing is async).

---

## 3. Monitoring Endpoints

All health endpoints are prefixed `/api/v1/health`.

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /health` | Public | Liveness — load balancer probe |
| `GET /health/ready` | Public | Readiness — DB + Redis reachable |
| `GET /health/database` | Public | DB latency in ms |
| `GET /health/deep` | Admin JWT | Full: DB + Redis + queues + providers + gateway config |
| `GET /health/queues` | Admin JWT | BullMQ queue depths and failure counts |
| `GET /health/providers` | Admin JWT | Provider circuit-breaker status |
| `GET /health/build` | Admin JWT | Git commit SHA, deploy ID, field-map hash |
| `GET /admin/system-health` | Admin JWT | Identical to `/health/deep` plus commit SHA |

**Railway health check:** set to `GET /api/v1/health` (liveness). Do not use `/health/ready` — a Redis blip would cause Railway to restart a healthy container.

---

## 4. Alert Events (structured log fields)

These `alert_type` values appear in production logs. Filter on them in your log aggregator (BetterStack, Grafana, etc.):

| `alert_type` | Severity | Meaning |
|---|---|---|
| `db_connection_failed` | critical | Database unreachable |
| `redis_connection_failed` | critical | Redis unreachable — queues and rate limiting degraded |
| `webhook_credit_failed` | **critical** | Paystack/Squad webhook exhausted all retries; user paid but wallet NOT credited |
| `wallet_credit_failed` | critical | Wallet credit failed inside funding path |
| `queue_backlog_high` | warning | Queue backlog > 500 jobs |
| `queue_failure_spiked` | error | > 50 failed jobs in queue |
| `failed_queue_job` | error | BullMQ job reached terminal failure state |
| `purchase_failure_spike` | error | Provider purchase failures spiking |
| `repeated_500_errors` | error | ≥ 10 HTTP 5xx errors in a 5-minute window |
| `wallet_balance_mismatch` | critical | Wallet balance diverged from ledger sum |
| `provider_timeout_repeated` | error | Provider ≥ 5 consecutive failures, circuit open |
| `reconciliation_backlog_high` | warning | Reconciliation queue > 20 unprocessed |

---

## 5. Scheduled Jobs

| Job | Schedule | Description |
|-----|----------|-------------|
| Integrity checks | 02:00 AM daily | Checks: orphan txns, negative balances, duplicate provider refs, duplicate purchases, ghost journal batches |
| Reconciliation | Every 15 minutes | Matches wallet ledger entries against transaction records |

Jobs are registered by the worker process (`npm run worker:prod`) via BullMQ repeating-job schedule. They are idempotent — re-registering on restart updates rather than duplicates the schedule.

**Trigger integrity check manually** (admin API):
```bash
POST /api/v1/admin/integrity/run
Authorization: Bearer <admin-jwt>
```

---

## 6. Emergency Playbook

### Webhook fails — user paid but wallet not credited

**Symptoms:**
- Alert `webhook_credit_failed` in logs with a `reference`
- User reports payment deducted but balance unchanged

**Steps:**
1. Find the funding transaction:
   ```sql
   SELECT * FROM funding_transactions WHERE reference = '<reference>';
   ```
2. Check if webhook was received:
   ```sql
   SELECT * FROM webhook_events WHERE transaction_reference = '<reference>';
   ```
3. Verify payment status directly with Paystack:
   ```bash
   curl https://api.paystack.co/transaction/verify/<reference> \
     -H "Authorization: Bearer $PAYSTACK_SECRET_KEY"
   ```
4. If Paystack confirms `status: "success"`, manually credit via admin API:
   ```bash
   POST /api/v1/admin/wallet-ops/manual-credit
   Authorization: Bearer <admin-jwt>
   { "user_id": "<uuid>", "amount": <ngn>, "reference": "<reference>", "reason": "webhook_recovery" }
   ```
5. Mark the funding transaction verified and create the transaction record via the same endpoint.
6. Notify the user via in-app notification.

### Redis unavailable

**Symptoms:** Alert `redis_connection_failed` in logs.

**Impact:**
- BullMQ cannot enqueue or process jobs (webhook processing paused)
- Rate limiting falls back to in-memory (less accurate but app stays up)
- WebAuthn challenges cannot be stored/consumed (passkey login fails temporarily)

**Steps:**
1. Check Upstash dashboard for quota exceeded or outage.
2. If quota: upgrade plan or set `DISABLE_WORKERS=true` to stop polling.
3. Missed webhooks: Paystack retries for 72 hours — they will reprocess once Redis recovers.
4. After recovery, check `webhook_events` for `processed_at IS NULL` rows and manually requeue if needed.

### Database unavailable

**Symptoms:** Alert `db_connection_failed`, all API endpoints return 503.

**Impact:** Complete service outage.

**Steps:**
1. Check Supabase status page.
2. If connection-pool exhaustion: restart API containers, check `DATABASE_URL` uses `?pgbouncer=true`.
3. If Supabase outage: no manual mitigation — wait for recovery.
4. After recovery, run `GET /api/v1/health/ready` to confirm readiness before routing traffic.

### Negative wallet balance detected

**Symptoms:** Alert `wallet_balance_mismatch` with `actual < 0`.

**Steps:**
1. Pull the integrity report:
   ```bash
   GET /api/v1/admin/integrity/latest
   Authorization: Bearer <admin-jwt>
   ```
2. Identify the wallet and review its ledger:
   ```sql
   SELECT * FROM wallet_ledger WHERE wallet_id = '<id>' ORDER BY created_at DESC LIMIT 50;
   ```
3. Find the double-spend or missing debit guard.
4. Freeze the wallet:
   ```bash
   POST /api/v1/admin/wallet-ops/freeze
   { "wallet_id": "<id>", "reason": "negative_balance_investigation" }
   ```
5. Correct via manual adjustment after root-cause analysis.

### Provider purchase failures spiking

**Symptoms:** Alert `purchase_failure_spike`, users reporting failed airtime/data purchases.

**Steps:**
1. Check `/api/v1/health/providers` for circuit breaker state.
2. If circuit open: wait for auto-recovery (circuit resets after `circuit_reset_after_seconds`).
3. Check VTPass / provider status page.
4. If provider is down: disable the service in admin catalog:
   ```bash
   PATCH /api/v1/admin/availability/<service-slug>
   { "is_available": false, "unavailability_reason": "Provider maintenance" }
   ```
5. Re-enable when provider recovers.

---

## 7. Testing Each Monitoring Feature

### Health endpoints
```bash
# Liveness
curl https://api.hivedata.com.ng/api/v1/health

# Readiness
curl https://api.hivedata.com.ng/api/v1/health/ready

# Deep health (admin)
curl https://api.hivedata.com.ng/api/v1/health/deep \
  -H "Authorization: Bearer <admin-jwt>"
```

### 5xx spike alert
Trigger 10+ errors in 5 minutes. Watch for log line with `alert_type: "repeated_500_errors"`.

### Webhook failure alert
Set `PAYSTACK_WEBHOOK_SECRET` to a wrong value, send a valid Paystack webhook. The job will fail signature validation and the `webhook_credit_failed` alert fires after all retries.

### Integrity checks
```bash
# Run immediately (don't wait for 02:00 AM)
POST /api/v1/admin/integrity/run
Authorization: Bearer <admin-jwt>

# View latest report
GET /api/v1/admin/integrity/latest
Authorization: Bearer <admin-jwt>
```

### Queue failure alert
```bash
# View queue stats
GET /api/v1/health/queues
Authorization: Bearer <admin-jwt>
```
Failed jobs appear in the `failed` count per queue.

### System health dashboard
```bash
GET /api/v1/admin/system-health
Authorization: Bearer <admin-jwt>
```
Returns: database latency, Redis status, queue depths, provider circuit states, payment gateway config.
