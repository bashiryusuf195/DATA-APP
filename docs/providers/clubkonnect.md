# Clubkonnect Provider

Provider code: `clubkonnect`
Base URL: `https://www.nellobytesystems.com` (default — override via `base_url` credential)
Supported services: **Airtime**, **Data**, **Electricity**, **Cable TV**, **Exam Pins (WAEC / JAMB)**

---

## Required Credentials

| Field              | Where set                      | Purpose                                          |
|--------------------|--------------------------------|--------------------------------------------------|
| `username`         | API Integrations → Clubkonnect | Clubkonnect **UserID** (account login username)  |
| `api_key`          | API Integrations → Clubkonnect | Clubkonnect **APIKey** (from account dashboard)  |
| `base_url`         | API Integrations → Clubkonnect | Optional override. Defaults to `https://www.nellobytesystems.com` |
| `auth_type`        | API Integrations → Clubkonnect | Set to `api_key`                                 |

Both `username` (UserID) and `api_key` (APIKey) are required. All API calls are GET requests with `UserID` and `APIKey` as query parameters.

---

## Authentication

All requests append `UserID` and `APIKey` as query parameters. The APIKey is never logged — it is replaced with `[REDACTED]` in all log output.

---

## Status Normalization

| Clubkonnect `status`                    | Internal status  |
|-----------------------------------------|------------------|
| `ORDER_COMPLETED`                       | `successful`     |
| `statuscode = "200"` (any status field) | `successful`     |
| `ORDER_RECEIVED`                        | `pending`        |
| `ORDER_ONHOLD`                          | `pending`        |
| `ORDER_PROCESSING`                      | `pending`        |
| Anything else                           | `failed`         |

---

## Idempotency

Clubkonnect uses `RequestID` to prevent duplicate orders. Our internal transaction `reference` is passed as `RequestID` on every purchase call. This means re-queuing the same transaction (BullMQ retry) will not double-charge.

---

## Endpoint Mapping

### Airtime

**Endpoint:** `GET /api/topup/`

| Query param     | Source                                              |
|-----------------|-----------------------------------------------------|
| `UserID`        | `username` credential                               |
| `APIKey`        | `api_key` credential                                |
| `MobileNumber`  | `input.phone`                                       |
| `Amount`        | `input.amount` (integer)                            |
| `NetworkID`     | Resolved from `variation_code` prefix (see table)  |
| `RequestID`     | `input.reference`                                   |

**NetworkID mapping:**

| Network  | variation_code prefix | NetworkID |
|----------|-----------------------|-----------|
| MTN      | `mtn`                 | `01`      |
| Glo      | `glo`                 | `02`      |
| Airtel   | `airtel`              | `03`      |
| 9mobile  | `9mobile`             | `04`      |

No `provider_variation_code` is needed for airtime.

---

### Data Bundle

**Endpoint:** `GET /api/databundle/`

| Query param     | Source                                              |
|-----------------|-----------------------------------------------------|
| `UserID`        | `username` credential                               |
| `APIKey`        | `api_key` credential                                |
| `MobileNumber`  | `input.phone`                                       |
| `DataPlan`      | `service_plans.provider_variation_code` (**required**) |
| `NetworkID`     | Resolved from `variation_code` prefix               |
| `RequestID`     | `input.reference`                                   |

**`provider_variation_code` is required for data plans.** Set it in Admin → Service Plans → Edit → "Provider Plan ID / Variation Code" to the Clubkonnect data plan ID for that plan.

---

### Electricity — Meter Verification

**Endpoint:** `GET /api/electricity/verifysmartcard/`

| Query param | Source                                                        |
|-------------|---------------------------------------------------------------|
| `UserID`    | `username` credential                                         |
| `APIKey`    | `api_key` credential                                          |
| `DiscoID`   | `provider_variation_code` uppercased (e.g. `IKEDC`, `EKEDC`) |
| `MeterType` | `plan_category` → `"Prepaid"` or `"Postpaid"`                 |
| `MeterNo`   | Customer-entered meter number                                 |

Returns: `customer_name`, `address`, `meter_number`

---

### Electricity — Purchase

**Endpoint:** `GET /api/electricity/`

| Query param | Source                                                        |
|-------------|---------------------------------------------------------------|
| `UserID`    | `username` credential                                         |
| `APIKey`    | `api_key` credential                                          |
| `DiscoID`   | `provider_variation_code` uppercased (e.g. `IKEDC`, `EKEDC`) |
| `MeterType` | `plan_category` → `"Prepaid"` or `"Postpaid"`                 |
| `MeterNo`   | `input.meter_number`                                          |
| `Amount`    | `input.amount` (integer)                                      |
| `Phone`     | `input.phone`                                                 |
| `RequestID` | `input.reference`                                             |

**`provider_variation_code` is required.** Set it in Admin → Service Plans to the Clubkonnect DISCO ID.

**Clubkonnect DISCO ID reference:**

| DISCO                      | DiscoID   |
|----------------------------|-----------|
| Ikeja Electric (IKEDC)     | `IKEDC`   |
| Eko Electricity (EKEDC)    | `EKEDC`   |
| Abuja Electric (AEDC)      | `AEDC`    |
| Port Harcourt (PHED)       | `PHED`    |
| Kano Electricity (KEDCO)   | `KEDCO`   |
| Kaduna Electric            | `KADUNA`  |
| Yola Electric (YEDC)       | `YOLA`    |
| Ibadan Electric (IBEDC)    | `IBEDC`   |
| Enugu Electric (EEDC)      | `EEDC`    |
| Jos Electric (JED)         | `JED`     |
| Benin Electric (BEDC)      | `BENIN`   |
| ABA Electric               | `ABA`     |

> Verify these IDs against your Clubkonnect account dashboard — they may vary by account tier.

---

### Cable TV — Decoder Verification

**Endpoint:** `GET /api/cabletv/verifysmartcard/`

| Query param   | Source                                              |
|---------------|-----------------------------------------------------|
| `UserID`      | `username` credential                               |
| `APIKey`      | `api_key` credential                                |
| `CableID`     | `biller_code` uppercased (e.g. `DSTV`, `GOTV`)     |
| `SmartCardNo` | Customer-entered smartcard / IUC number             |

Returns: `customer_name`, `current_package`, `due_date`

---

### Cable TV — Purchase

**Endpoint:** `GET /api/cabletv/`

| Query param   | Source                                               |
|---------------|------------------------------------------------------|
| `UserID`      | `username` credential                                |
| `APIKey`      | `api_key` credential                                 |
| `CableID`     | `network_operator` uppercased (e.g. `DSTV`, `GOTV`) |
| `SmartCardNo` | `input.smartcard_number`                             |
| `PlanID`      | `provider_variation_code` (or `variation_code`)      |
| `Phone`       | `input.phone`                                        |
| `RequestID`   | `input.reference`                                    |

**CableID mapping:**

| Biller (network_operator) | CableID     |
|---------------------------|-------------|
| `dstv`                    | `DSTV`      |
| `gotv`                    | `GOTV`      |
| `startimes`               | `STARTIMES` |
| `showmax`                 | `SHOWMAX`   |

---

### Exam Pins — WAEC

**Endpoint:** `GET /api/waec/`

Routing: variation_code must start with `waec-` (e.g. `waec-pin-1`).

| Query param | Source                                                      |
|-------------|-------------------------------------------------------------|
| `UserID`    | `username` credential                                       |
| `APIKey`    | `api_key` credential                                        |
| `Quantity`  | `provider_variation_code` if set (integer); else defaults to `1` |
| `Phone`     | `input.phone`                                               |
| `RequestID` | `input.reference`                                           |

---

### Exam Pins — JAMB

**Endpoint:** `GET /api/jamb/`

Routing: variation_code must start with `jamb-` (e.g. `jamb-profile-charge`).

| Query param | Source                |
|-------------|-----------------------|
| `UserID`    | `username` credential |
| `APIKey`    | `api_key` credential  |
| `Phone`     | `input.phone`         |
| `Amount`    | `input.amount` (integer) |
| `RequestID` | `input.reference`     |

---

### Balance

**Endpoint:** `GET /api/balance/`

Params: `UserID`, `APIKey`

Response shape: `{ "status": "BALANCE", "balance": "5000.00" }`

Used by the admin health check — returns live balance if credentials are valid.

---

### Transaction Query (verifyTransaction)

**Endpoint:** `GET /api/querytransaction/`

Params: `UserID`, `APIKey`, `RequestID` (= our transaction `reference`)

Used to check status of a previously submitted order.

---

## Admin Dashboard Setup

### First-time setup

1. **Run migrations** to seed the `provider_configs` row:
   ```
   npx knex migrate:latest
   ```
   This inserts `provider_code = 'clubkonnect'` with `is_active = false`.

2. **Add credentials** — Admin → API Integrations → find Clubkonnect row → Edit:
   - `username`: your Clubkonnect UserID
   - `api_key`: your Clubkonnect APIKey
   - `base_url`: `https://www.nellobytesystems.com` (or leave blank for default)
   - `auth_type`: `api_key`
   - `is_live`: `true` for production

3. **Enable the provider** — Admin → Provider Management → Clubkonnect → set `is_active = true`.

4. **Set routing rules** — Admin → Provider Routing:
   - Airtime: Primary provider `clubkonnect`
   - Data: Primary provider `clubkonnect`
   - Electricity: Primary provider `clubkonnect`
   - Cable TV: Primary provider `clubkonnect`
   - Exam Pin: Primary provider `clubkonnect`

5. **Health check** — Admin → Provider Health → Clubkonnect.
   Reports live balance if credentials are valid.

---

### Creating service plans for Clubkonnect

**Data plan:**
- Variation Code: e.g. `mtn-sme-1gb-30`
- Network: `mtn`
- Category: `sme`
- **Provider Variation Code**: Clubkonnect data plan ID (**required**)
- Primary Provider: `clubkonnect`

**Electricity plan (variable amount):**
- Variation Code: e.g. `ekedc-prepaid`
- Network: `ekedc`
- Category: `prepaid`
- **Provider Variation Code**: Clubkonnect DISCO ID, e.g. `EKEDC` (**required**)
- Is Variable Amount: enabled
- Primary Provider: `clubkonnect`

**Cable TV plan:**
- Variation Code: e.g. `dstv-compact`
- Network: `dstv`
- Category: `compact`
- **Provider Variation Code**: Clubkonnect plan ID for this bouquet (**required for cable**)
- Primary Provider: `clubkonnect`

**WAEC exam pin:**
- Variation Code: `waec-pin-1` (must start with `waec-`)
- **Provider Variation Code**: `1` (quantity per purchase, defaults to `1` if blank)
- Primary Provider: `clubkonnect`

**JAMB:**
- Variation Code: `jamb-profile-charge` (must start with `jamb-`)
- Amount: JAMB registration fee (e.g. `3500`)
- Primary Provider: `clubkonnect`

---

## Known Limitations

| Limitation | Detail |
|-----------|--------|
| GET-only API | All requests are GET. Request bodies are never used. |
| RequestID idempotency | Clubkonnect rejects duplicate RequestIDs. BullMQ retries re-send the same `reference`, which Clubkonnect treats as the same order — this is correct behavior. |
| WAEC quantity | Quantity defaults to `1`. Set `provider_variation_code` to an integer for bulk purchases. |
| JAMB params | JAMB endpoint params may vary by account tier — verify against Clubkonnect dashboard. |
| Verify endpoint paths | `/api/electricity/verifysmartcard/` and `/api/cabletv/verifysmartcard/` paths are based on documented API. Confirm with Clubkonnect support if verify fails. |
