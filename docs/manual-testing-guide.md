# Manual Testing Guide

Complete step-by-step curl tests for the VTU backend. All commands use Windows CMD format.
The mock provider (`mock_vtu_provider`) is used for all VTU purchases — no real provider credentials needed.

## Prerequisites

1. Backend running on `http://localhost:3000`  
   ```cmd
   npm run dev
   ```
2. Supabase/PostgreSQL accessible (connection string in `.env`)
3. Redis running (BullMQ queues)
4. `SYSTEM_SETTLEMENT_WALLET_ID` set in `.env`

---

## Placeholders

Throughout this guide, replace these placeholders with real values as you collect them:

| Placeholder | Where to get it |
|---|---|
| `ACCESS_TOKEN` | Login response → `data.tokens.access_token` |
| `REFRESH_TOKEN` | Login response → `data.tokens.refresh_token` |
| `USER_ID` | Login response → `data.user.id` |
| `IDEMPOTENCY_KEY` | Generate any unique string (e.g. `test-key-001`) |
| `TRANSACTION_REFERENCE` | Purchase response → `data.reference` |
| `PAYSTACK_REFERENCE` | Fund initialize response → `data.reference` |
| `NOTIFICATION_ID` | Notifications list → `data[0].id` |
| `FAILED_JOB_ID` | Failed jobs list → `data[0].id` |
| `ADMIN_TOKEN` | Login with an admin account |

---

## 1. Health Check

**No authentication required.**

```cmd
curl "http://localhost:3000/health"
```

**Expected response (200):**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

---

## 2. User Registration

```cmd
curl -X POST "http://localhost:3000/auth/register" -H "Content-Type: application/json" -d "{\"email\":\"testuser@example.com\",\"password\":\"Password123!\",\"first_name\":\"Test\",\"last_name\":\"User\"}"
```

**Expected response (201):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid-here",
      "email": "testuser@example.com",
      "status": "active",
      "kyc_level": 0,
      "is_email_verified": false,
      "roles": ["user"],
      "permissions": []
    },
    "tokens": {
      "access_token": "eyJ...",
      "refresh_token": "eyJ...",
      "access_token_expires_at": "2024-01-01T01:00:00.000Z",
      "refresh_token_expires_at": "2024-02-01T00:00:00.000Z"
    },
    "session_id": "uuid-here"
  }
}
```

**Save:** `data.tokens.access_token` → `ACCESS_TOKEN`  
**Save:** `data.tokens.refresh_token` → `REFRESH_TOKEN`  
**Save:** `data.user.id` → `USER_ID`

**SQL verification:**
```sql
SELECT id, email, status, kyc_level, created_at FROM users WHERE email = 'testuser@example.com';
SELECT id, wallet_type, currency, status FROM wallets WHERE user_id = '<USER_ID>';
```
A wallet row should exist automatically after registration.

---

## 3. User Login

```cmd
curl -X POST "http://localhost:3000/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"testuser@example.com\",\"password\":\"Password123!\"}"
```

**Expected response (200):** Same shape as registration.

**Error — wrong password (401):**
```json
{
  "success": false,
  "code": "INVALID_CREDENTIALS",
  "message": "Invalid email or password"
}
```

**Error — rate limited after repeated failures (429):**
```json
{
  "success": false,
  "code": "RATE_LIMIT_EXCEEDED",
  "message": "Too many failed login attempts. Try again in 60 seconds.",
  "retryAfter": 60
}
```

---

## 4. Get Current User

```cmd
curl "http://localhost:3000/auth/me" -H "Authorization: Bearer ACCESS_TOKEN"
```

**Expected response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid-here",
    "email": "testuser@example.com",
    "phone": null,
    "username": null,
    "status": "active",
    "kyc_level": 0,
    "is_email_verified": false,
    "is_phone_verified": false,
    "last_login_at": "2024-01-01T00:00:00.000Z",
    "created_at": "2024-01-01T00:00:00.000Z",
    "profile": null,
    "roles": ["user"],
    "permissions": []
  }
}
```

---

## 5. Token Refresh

```cmd
curl -X POST "http://localhost:3000/auth/refresh" -H "Content-Type: application/json" -d "{\"refresh_token\":\"REFRESH_TOKEN\"}"
```

**Expected response (200):**
```json
{
  "success": true,
  "data": {
    "tokens": {
      "access_token": "eyJ...",
      "refresh_token": "eyJ...",
      "access_token_expires_at": "2024-01-01T02:00:00.000Z",
      "refresh_token_expires_at": "2024-02-01T00:00:00.000Z"
    },
    "session_id": "uuid-here"
  }
}
```

---

## 6. Wallet Balance

```cmd
curl "http://localhost:3000/wallet/balance" -H "Authorization: Bearer ACCESS_TOKEN"
```

**Expected response (200) — new account has ₦0:**
```json
{
  "success": true,
  "data": {
    "wallet_id": "uuid-here",
    "balance": 0,
    "currency": "NGN",
    "status": "active"
  }
}
```

**SQL verification:**
```sql
-- Balance is derived from ledger, not stored. View v_wallet_balances:
SELECT w.id, w.wallet_type, w.currency, w.status,
       COALESCE(SUM(CASE WHEN wl.entry_type = 'credit' THEN wl.amount ELSE -wl.amount END), 0) AS balance
FROM wallets w
LEFT JOIN wallet_ledger wl ON wl.wallet_id = w.id
WHERE w.user_id = '<USER_ID>'
GROUP BY w.id, w.wallet_type, w.currency, w.status;
```

---

## 7. Fund Wallet (Test Mode — No Paystack Required)

Use this shortcut to add funds without going through Paystack.

```cmd
curl -X POST "http://localhost:3000/wallet/fund-test" -H "Authorization: Bearer ACCESS_TOKEN" -H "Content-Type: application/json" -d "{\"amount\":10000}"
```

**Expected response (200):**
```json
{
  "success": true,
  "data": {
    "wallet_id": "uuid-here",
    "balance": 10000,
    "amount_credited": 10000,
    "currency": "NGN"
  }
}
```

**SQL verification:**
```sql
SELECT entry_type, amount, description, created_at
FROM wallet_ledger
WHERE wallet_id = (SELECT id FROM wallets WHERE user_id = '<USER_ID>' AND wallet_type = 'user')
ORDER BY created_at DESC
LIMIT 5;
```

---

## 8. Paystack Funding Flow (Requires Paystack Keys)

> Skip this section if `PAYSTACK_SECRET_KEY` is not set. Use Section 7 instead.

### 8a. Initialize Payment

```cmd
curl -X POST "http://localhost:3000/wallet/fund/initialize" ^
  -H "Authorization: Bearer ACCESS_TOKEN" ^
  -H "Content-Type: application/json" ^
  -H "Idempotency-Key: IDEMPOTENCY_KEY" ^
  -d "{\"amount\":5000}"
```

**Expected response (200):**
```json
{
  "success": true,
  "data": {
    "reference": "FND-20240101-XXXXXXXX",
    "authorization_url": "https://checkout.paystack.com/...",
    "access_code": "access_code_here",
    "amount": 5000,
    "currency": "NGN"
  }
}
```

**Save:** `data.reference` → `PAYSTACK_REFERENCE`

### 8b. Verify Payment (after completing payment on Paystack)

```cmd
curl -X POST "http://localhost:3000/wallet/fund/verify/PAYSTACK_REFERENCE" -H "Authorization: Bearer ACCESS_TOKEN"
```

**Expected response (200) — successful payment:**
```json
{
  "success": true,
  "data": {
    "funding_transaction": { "status": "successful", "verified": true },
    "credited": true,
    "journal_batch_id": "uuid-here",
    "amount_ngn": 5000
  }
}
```

**SQL verification:**
```sql
SELECT reference, status, amount, verified, payment_channel, paid_at
FROM funding_transactions
WHERE reference = 'PAYSTACK_REFERENCE';
```

---

## 9. Wallet Ledger

```cmd
curl "http://localhost:3000/wallet/ledger" -H "Authorization: Bearer ACCESS_TOKEN"
```

**Expected response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "entry_type": "credit",
      "amount": 10000,
      "description": "Test wallet funding",
      "created_at": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

---

## 10. Service Catalog

### List all services

```cmd
curl "http://localhost:3000/services"
```

**Expected response (200):**
```json
{
  "success": true,
  "data": [
    { "id": "uuid", "slug": "mtn-data", "name": "MTN Data", "service_type": "data", "is_active": true },
    { "id": "uuid", "slug": "airtel-data", "name": "Airtel Data", "service_type": "data", "is_active": true }
  ]
}
```

### List plans for a service type

```cmd
curl "http://localhost:3000/services/data/plans"
```

Valid service types: `airtime`, `data`, `electricity`, `cable_tv`, `exam_pin`, `identity_verification`

**Expected response (200) — data plans:**
```json
{
  "success": true,
  "data": [
    { "variation_code": "mtn-1gb-30days", "name": "MTN 1GB – 30 Days", "amount": 300, "provider_code": "mock_vtu_provider" },
    { "variation_code": "mtn-2gb-30days", "name": "MTN 2GB – 30 Days", "amount": 500, "provider_code": "mock_vtu_provider" }
  ]
}
```

**Available variation codes:**

| Type | variation_code | Amount (₦) |
|---|---|---|
| Data | `mtn-500mb-7days` | 150 |
| Data | `mtn-1gb-30days` | 300 |
| Data | `mtn-2gb-30days` | 500 |
| Data | `airtel-1gb-30days` | 300 |
| Data | `glo-1gb-30days` | 275 |
| Data | `9mobile-1gb-30days` | 500 |
| Cable TV | `dstv-padi` | 1850 |
| Cable TV | `dstv-compact` | 9000 |
| Cable TV | `gotv-smallie` | 900 |
| Cable TV | `startimes-nova` | 900 |
| Exam PIN | `waec-result-checker` | 1050 |
| Exam PIN | `neco-result-checker` | 750 |
| Electricity | `prepaid` | variable |
| Electricity | `postpaid` | variable |
| Identity | `nin` | 150 |
| Identity | `bvn` | 150 |

---

## 11. Airtime Purchase

**Requires:** wallet balance ≥ purchase amount. Fund wallet first (Section 7).

```cmd
curl -X POST "http://localhost:3000/transactions/airtime" ^
  -H "Authorization: Bearer ACCESS_TOKEN" ^
  -H "Content-Type: application/json" ^
  -H "Idempotency-Key: air-test-001" ^
  -d "{\"phone\":\"08012345678\",\"amount\":100}"
```

**Expected response (202 or 200):**
```json
{
  "success": true,
  "data": {
    "reference": "AIR-20240101-XXXXXXXX",
    "status": "processing",
    "amount": 100,
    "phone": "08012345678",
    "message": "Purchase queued for processing"
  }
}
```

**Save:** `data.reference` → `TRANSACTION_REFERENCE`

> The purchase is queued via BullMQ. Wait ~2 seconds, then check the transaction status.

**Check status:**
```cmd
curl "http://localhost:3000/transactions/TRANSACTION_REFERENCE" -H "Authorization: Bearer ACCESS_TOKEN"
```

**Expected response (after processing):**
```json
{
  "success": true,
  "data": {
    "reference": "AIR-20240101-XXXXXXXX",
    "type": "airtime",
    "status": "successful",
    "amount": 100,
    "provider": "mock_vtu_provider",
    "provider_reference": "uuid-from-mock",
    "processed_at": "2024-01-01T00:00:01.000Z"
  }
}
```

**SQL verification:**
```sql
SELECT reference, type, status, amount, provider, provider_reference, processed_at
FROM transactions
WHERE reference = 'TRANSACTION_REFERENCE';

-- Provider attempt record:
SELECT provider_code, attempt_number, success, latency_ms, created_at
FROM provider_attempts
WHERE transaction_reference = 'TRANSACTION_REFERENCE';
```

---

## 12. Data Purchase

```cmd
curl -X POST "http://localhost:3000/transactions/data" ^
  -H "Authorization: Bearer ACCESS_TOKEN" ^
  -H "Content-Type: application/json" ^
  -H "Idempotency-Key: dat-test-001" ^
  -d "{\"phone\":\"08012345678\",\"variation_code\":\"mtn-1gb-30days\"}"
```

**Expected response (202 or 200):**
```json
{
  "success": true,
  "data": {
    "reference": "DAT-20240101-XXXXXXXX",
    "status": "processing",
    "amount": 300,
    "phone": "08012345678",
    "variation_code": "mtn-1gb-30days"
  }
}
```

**Check status** (same as Section 11 — replace reference).

**SQL verification:**
```sql
SELECT reference, type, status, amount, provider, metadata FROM transactions
WHERE reference LIKE 'DAT-%' ORDER BY created_at DESC LIMIT 5;
```

---

## 13. Electricity Purchase

```cmd
curl -X POST "http://localhost:3000/transactions/electricity" ^
  -H "Authorization: Bearer ACCESS_TOKEN" ^
  -H "Content-Type: application/json" ^
  -H "Idempotency-Key: elc-test-001" ^
  -d "{\"meter_number\":\"12345678901\",\"amount\":2000,\"variation_code\":\"prepaid\",\"phone\":\"08012345678\"}"
```

**Expected response (202 or 200):**
```json
{
  "success": true,
  "data": {
    "reference": "ELC-20240101-XXXXXXXX",
    "status": "processing",
    "amount": 2000,
    "meter_number": "12345678901",
    "variation_code": "prepaid"
  }
}
```

---

## 14. Cable TV Purchase

```cmd
curl -X POST "http://localhost:3000/transactions/cable-tv" ^
  -H "Authorization: Bearer ACCESS_TOKEN" ^
  -H "Content-Type: application/json" ^
  -H "Idempotency-Key: cab-test-001" ^
  -d "{\"smartcard_number\":\"1234567890\",\"variation_code\":\"dstv-padi\"}"
```

**Expected response (202 or 200):**
```json
{
  "success": true,
  "data": {
    "reference": "CAB-20240101-XXXXXXXX",
    "status": "processing",
    "amount": 1850,
    "smartcard_number": "1234567890",
    "variation_code": "dstv-padi"
  }
}
```

---

## 15. Exam PIN Purchase

```cmd
curl -X POST "http://localhost:3000/transactions/exam-pin" ^
  -H "Authorization: Bearer ACCESS_TOKEN" ^
  -H "Content-Type: application/json" ^
  -H "Idempotency-Key: exm-test-001" ^
  -d "{\"phone\":\"08012345678\",\"variation_code\":\"waec-result-checker\"}"
```

**Expected response (202 or 200):**
```json
{
  "success": true,
  "data": {
    "reference": "EXM-20240101-XXXXXXXX",
    "status": "processing",
    "amount": 1050,
    "variation_code": "waec-result-checker"
  }
}
```

---

## 16. Identity Verification Purchase

Either `phone` or `customer_name` is required (not both).

```cmd
curl -X POST "http://localhost:3000/transactions/identity-verification" ^
  -H "Authorization: Bearer ACCESS_TOKEN" ^
  -H "Content-Type: application/json" ^
  -H "Idempotency-Key: idv-test-001" ^
  -d "{\"phone\":\"08012345678\",\"variation_code\":\"nin\"}"
```

**Expected response (202 or 200):**
```json
{
  "success": true,
  "data": {
    "reference": "IDV-20240101-XXXXXXXX",
    "status": "processing",
    "amount": 150,
    "variation_code": "nin"
  }
}
```

**Error — neither phone nor customer_name supplied (400):**
```json
{
  "success": false,
  "code": "VALIDATION_ERROR",
  "message": "Either phone or customer_name is required"
}
```

---

## 17. Transaction History

### List all user transactions

```cmd
curl "http://localhost:3000/transactions" -H "Authorization: Bearer ACCESS_TOKEN"
```

### Filter by status

```cmd
curl "http://localhost:3000/transactions?status=successful&limit=10" -H "Authorization: Bearer ACCESS_TOKEN"
```

### Filter by type

```cmd
curl "http://localhost:3000/transactions?type=airtime&limit=10" -H "Authorization: Bearer ACCESS_TOKEN"
```

Valid statuses: `pending`, `processing`, `successful`, `failed`, `reversed`, `cancelled`  
Valid types: `wallet_funding`, `wallet_transfer`, `airtime`, `data`, `electricity`, `cable_tv`, `exam_pin`, `identity_verification`

**Expected response (200):**
```json
{
  "success": true,
  "data": [
    {
      "reference": "AIR-20240101-XXXXXXXX",
      "type": "airtime",
      "status": "successful",
      "amount": 100,
      "provider": "mock_vtu_provider",
      "created_at": "2024-01-01T00:00:00.000Z"
    }
  ],
  "meta": { "limit": 20, "offset": 0 }
}
```

### Get a single transaction

```cmd
curl "http://localhost:3000/transactions/TRANSACTION_REFERENCE" -H "Authorization: Bearer ACCESS_TOKEN"
```

---

## 18. Forced Provider Failure

Phone `08000000000` triggers a guaranteed failure in the mock provider.

**First fund the wallet with enough balance:**
```cmd
curl -X POST "http://localhost:3000/wallet/fund-test" -H "Authorization: Bearer ACCESS_TOKEN" -H "Content-Type: application/json" -d "{\"amount\":5000}"
```

**Trigger forced failure:**
```cmd
curl -X POST "http://localhost:3000/transactions/airtime" ^
  -H "Authorization: Bearer ACCESS_TOKEN" ^
  -H "Content-Type: application/json" ^
  -H "Idempotency-Key: air-fail-001" ^
  -d "{\"phone\":\"08000000000\",\"amount\":100}"
```

**Check transaction status after ~2 seconds:**
```cmd
curl "http://localhost:3000/transactions/TRANSACTION_REFERENCE" -H "Authorization: Bearer ACCESS_TOKEN"
```

**Expected response (status = `failed`):**
```json
{
  "success": true,
  "data": {
    "reference": "AIR-20240101-XXXXXXXX",
    "type": "airtime",
    "status": "failed",
    "amount": 100,
    "provider": "mock_vtu_provider",
    "failure_reason": "Mock provider failure"
  }
}
```

**SQL verification — provider attempt with success=false:**
```sql
SELECT provider_code, attempt_number, success, error_message, latency_ms
FROM provider_attempts
WHERE transaction_reference = 'TRANSACTION_REFERENCE';
```

---

## 19. Wallet Refund After Provider Failure

When a VTU purchase fails, the wallet debit is reversed automatically by the worker.
Check the ledger to confirm the refund credit was posted.

```cmd
curl "http://localhost:3000/wallet/ledger" -H "Authorization: Bearer ACCESS_TOKEN"
```

**Look for a `credit` entry with description mentioning the failed reference:**
```json
{
  "success": true,
  "data": [
    {
      "entry_type": "credit",
      "amount": 100,
      "description": "Refund for failed purchase AIR-20240101-XXXXXXXX",
      "created_at": "2024-01-01T00:00:02.000Z"
    }
  ]
}
```

**SQL verification:**
```sql
SELECT entry_type, amount, description, created_at
FROM wallet_ledger
WHERE wallet_id = (SELECT id FROM wallets WHERE user_id = '<USER_ID>' AND wallet_type = 'user')
ORDER BY created_at DESC
LIMIT 10;
```

---

## 20. Provider Attempts Log (Admin)

**Requires an admin account.**

```cmd
curl "http://localhost:3000/admin/provider-attempts?limit=10" -H "Authorization: Bearer ADMIN_TOKEN"
```

**Filter by transaction reference:**
```cmd
curl "http://localhost:3000/admin/provider-attempts?transaction_reference=TRANSACTION_REFERENCE" -H "Authorization: Bearer ADMIN_TOKEN"
```

**Expected response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "transaction_reference": "AIR-20240101-XXXXXXXX",
      "provider_code": "mock_vtu_provider",
      "attempt_number": 1,
      "success": false,
      "error_message": "Mock provider failure",
      "latency_ms": 1001,
      "created_at": "2024-01-01T00:00:01.000Z"
    }
  ]
}
```

**SQL verification:**
```sql
SELECT transaction_reference, provider_code, attempt_number, success, error_message, latency_ms
FROM provider_attempts
ORDER BY created_at DESC
LIMIT 20;
```

---

## 21. Failed Jobs (Admin)

Workers move permanently-failed jobs to the `failed_jobs` table after exhausting retries.

```cmd
curl "http://localhost:3000/admin/failed-jobs?limit=10" -H "Authorization: Bearer ADMIN_TOKEN"
```

**Filter by queue:**
```cmd
curl "http://localhost:3000/admin/failed-jobs?queue_name=vtu-purchases&limit=10" -H "Authorization: Bearer ADMIN_TOKEN"
```

Valid queue names: `airtime-purchases`, `vtu-purchases`, `paystack-webhooks`

**Expected response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "queue_name": "vtu-purchases",
      "job_name": "process-vtu-purchase",
      "reference": "AIR-20240101-XXXXXXXX",
      "error_message": "Mock provider failure",
      "retry_count": 3,
      "failed_at": "2024-01-01T00:00:10.000Z"
    }
  ]
}
```

**Save:** `data[0].id` → `FAILED_JOB_ID`

**Retry a failed job:**
```cmd
curl -X POST "http://localhost:3000/admin/failed-jobs/FAILED_JOB_ID/retry" -H "Authorization: Bearer ADMIN_TOKEN"
```

**Expected response (200):**
```json
{
  "success": true,
  "data": { "queued_job_id": "bullmq-job-id" }
}
```

**SQL verification:**
```sql
SELECT id, queue_name, job_name, reference, error_message, retry_count, failed_at
FROM failed_jobs
ORDER BY failed_at DESC
LIMIT 10;
```

---

## 22. Notifications

### List notifications

```cmd
curl "http://localhost:3000/notifications" -H "Authorization: Bearer ACCESS_TOKEN"
```

**Expected response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "channel": "in_app",
      "type": "purchase_successful",
      "title": "Purchase Successful",
      "message": "Your airtime purchase of ₦100 was successful.",
      "status": "sent",
      "read_at": null,
      "created_at": "2024-01-01T00:00:02.000Z"
    }
  ]
}
```

**Save:** `data[0].id` → `NOTIFICATION_ID`

### Mark notification as read

```cmd
curl -X PATCH "http://localhost:3000/notifications/NOTIFICATION_ID/read" -H "Authorization: Bearer ACCESS_TOKEN"
```

**Expected response (200):**
```json
{
  "success": true,
  "data": { "id": "uuid", "status": "read", "read_at": "2024-01-01T00:00:05.000Z" }
}
```

### Get notification preferences

```cmd
curl "http://localhost:3000/notifications/preferences" -H "Authorization: Bearer ACCESS_TOKEN"
```

**SQL verification:**
```sql
SELECT user_id, channel, type, title, status, read_at, created_at
FROM notifications
WHERE user_id = '<USER_ID>'
ORDER BY created_at DESC
LIMIT 10;
```

---

## 23. Webhook Events (Admin)

### List webhook events

```cmd
curl "http://localhost:3000/admin/webhook-events?limit=10" -H "Authorization: Bearer ADMIN_TOKEN"
```

**Filter by provider:**
```cmd
curl "http://localhost:3000/admin/webhook-events?provider_code=paystack&limit=10" -H "Authorization: Bearer ADMIN_TOKEN"
```

**Filter by event type:**
```cmd
curl "http://localhost:3000/admin/webhook-events?event_type=charge.success&limit=10" -H "Authorization: Bearer ADMIN_TOKEN"
```

**Expected response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "source": "paystack",
      "event_type": "charge.success",
      "signature_valid": true,
      "processed": true,
      "reference": "FND-20240101-XXXXXXXX",
      "status": "processed",
      "created_at": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

### Webhook diagnostics

```cmd
curl "http://localhost:3000/admin/webhook-events/diagnostics" -H "Authorization: Bearer ADMIN_TOKEN"
```

**Expected response (200):**
```json
{
  "success": true,
  "data": {
    "webhook_url_path": "/webhooks/paystack",
    "total_events": 42,
    "total_today": 5,
    "processed_today": 4,
    "invalid_sig_today": 0,
    "last_event": {
      "event_type": "charge.success",
      "signature_valid": true,
      "processed": true,
      "created_at": "2024-01-01T00:00:00.000Z"
    },
    "last_invalid_signature": null,
    "last_processing_error": null
  }
}
```

**SQL verification:**
```sql
SELECT provider_code, event_type, signature_valid, processed, transaction_reference, created_at
FROM webhook_events
ORDER BY created_at DESC
LIMIT 10;

-- Today's stats:
SELECT
  COUNT(*) AS total_today,
  COUNT(*) FILTER (WHERE processed = true) AS processed_today,
  COUNT(*) FILTER (WHERE signature_valid = false) AS invalid_sig_today
FROM webhook_events
WHERE provider_code = 'paystack'
  AND created_at >= CURRENT_DATE;
```

---

## 24. Admin Routes

### Users

```cmd
curl "http://localhost:3000/admin/users?limit=10" -H "Authorization: Bearer ADMIN_TOKEN"
```

### Providers

```cmd
curl "http://localhost:3000/admin/providers" -H "Authorization: Bearer ADMIN_TOKEN"
```

### Provider health metrics

```cmd
curl "http://localhost:3000/admin/provider-health-metrics" -H "Authorization: Bearer ADMIN_TOKEN"
```

### Routing rules

```cmd
curl "http://localhost:3000/admin/provider-routing-rules" -H "Authorization: Bearer ADMIN_TOKEN"
```

### Funding transactions

```cmd
curl "http://localhost:3000/admin/funding-transactions?limit=10" -H "Authorization: Bearer ADMIN_TOKEN"
```

**Filter by gateway:**
```cmd
curl "http://localhost:3000/admin/funding-transactions?payment_gateway=paystack&limit=10" -H "Authorization: Bearer ADMIN_TOKEN"
```

### Audit logs

```cmd
curl "http://localhost:3000/admin/audit-logs?limit=10" -H "Authorization: Bearer ADMIN_TOKEN"
```

### Wallet ledger (admin-scoped)

```cmd
curl "http://localhost:3000/admin/wallet-ledger?limit=20" -H "Authorization: Bearer ADMIN_TOKEN"
```

### Journal batches

```cmd
curl "http://localhost:3000/admin/journal-batches?limit=10" -H "Authorization: Bearer ADMIN_TOKEN"
```

### Settings

```cmd
curl "http://localhost:3000/admin/settings" -H "Authorization: Bearer ADMIN_TOKEN"
```

---

## 25. Simulate Paystack Webhook (Local Testing)

See [webhook-testing.md](./webhook-testing.md) for the full ngrok setup.
Quick test without ngrok — sends a `charge.success` event directly to `localhost`.

**PowerShell** (generates correct HMAC-SHA512 signature):
```powershell
$secret = $env:PAYSTACK_SECRET_KEY
$body = '{"event":"charge.success","data":{"reference":"FND-TEST-001","status":"success","amount":500000,"customer":{"email":"testuser@example.com"}}}'
$hmac = [System.Security.Cryptography.HMACSHA512]::new([System.Text.Encoding]::UTF8.GetBytes($secret))
$sig = [System.BitConverter]::ToString($hmac.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($body))).Replace("-","").ToLower()
Invoke-RestMethod -Uri "http://localhost:3000/webhooks/paystack" -Method POST -Body $body -ContentType "application/json" -Headers @{"x-paystack-signature"=$sig}
```

**Expected response (200):**
```json
{ "status": "ok" }
```

**SQL verification:**
```sql
SELECT event_type, signature_valid, processed, transaction_reference, created_at
FROM webhook_events
WHERE provider_code = 'paystack'
ORDER BY created_at DESC
LIMIT 3;
```

---

## 26. Idempotency Behaviour

All purchase endpoints require an `Idempotency-Key` header. Sending the same key twice returns the original response without re-processing.

```cmd
curl -X POST "http://localhost:3000/transactions/airtime" ^
  -H "Authorization: Bearer ACCESS_TOKEN" ^
  -H "Content-Type: application/json" ^
  -H "Idempotency-Key: air-test-001" ^
  -d "{\"phone\":\"08012345678\",\"amount\":100}"
```

Run this command twice. The second call returns the same response as the first — the worker is **not** triggered again and the wallet is **not** debited a second time.

**SQL verification:**
```sql
SELECT idempotency_key, created_at FROM idempotency_keys WHERE idempotency_key = 'air-test-001';
```

---

## 27. Logout

```cmd
curl -X POST "http://localhost:3000/auth/logout" -H "Authorization: Bearer ACCESS_TOKEN" -H "Content-Type: application/json" -d "{}"
```

**Expected response: 204 No Content**

**Logout all devices:**
```cmd
curl -X POST "http://localhost:3000/auth/logout" -H "Authorization: Bearer ACCESS_TOKEN" -H "Content-Type: application/json" -d "{\"all_devices\":true}"
```

---

## Common Error Codes

| Code | HTTP | Meaning |
|---|---|---|
| `UNAUTHORIZED` | 401 | Missing or invalid access token |
| `FORBIDDEN` | 403 | Authenticated but insufficient permissions |
| `INVALID_CREDENTIALS` | 401 | Wrong email or password |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `INSUFFICIENT_BALANCE` | 400 | Wallet balance too low |
| `IDEMPOTENCY_CONFLICT` | 409 | Duplicate Idempotency-Key with different body |
| `VALIDATION_ERROR` | 400 | Request body failed schema validation |
| `NOT_FOUND` | 404 | Resource not found |
| `SERVICE_UNAVAILABLE` | 503 | Payment gateway not configured |

---

## Quick SQL Reference

```sql
-- User wallet balance
SELECT w.id AS wallet_id,
       COALESCE(SUM(CASE WHEN l.entry_type = 'credit' THEN l.amount ELSE -l.amount END), 0) AS balance
FROM wallets w
LEFT JOIN wallet_ledger l ON l.wallet_id = w.id
WHERE w.user_id = '<USER_ID>' AND w.wallet_type = 'user'
GROUP BY w.id;

-- Recent transactions
SELECT reference, type, status, amount, provider, created_at
FROM transactions
WHERE user_id = '<USER_ID>'
ORDER BY created_at DESC
LIMIT 10;

-- Provider attempts for a transaction
SELECT provider_code, attempt_number, success, error_message, latency_ms
FROM provider_attempts
WHERE transaction_reference = '<REFERENCE>';

-- Recent webhook events
SELECT provider_code, event_type, signature_valid, processed, created_at
FROM webhook_events
ORDER BY created_at DESC
LIMIT 10;

-- Failed jobs
SELECT queue_name, job_name, reference, error_message, retry_count, failed_at
FROM failed_jobs
ORDER BY failed_at DESC
LIMIT 10;

-- User notifications
SELECT type, title, status, read_at, created_at
FROM notifications
WHERE user_id = '<USER_ID>'
ORDER BY created_at DESC
LIMIT 10;

-- Funding transactions
SELECT reference, status, amount, verified, payment_channel, created_at
FROM funding_transactions
WHERE user_id = '<USER_ID>'
ORDER BY created_at DESC
LIMIT 10;
```
