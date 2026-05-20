# SMShika Provider

Provider code: `smshika`
Supported services: **Airtime**, **Data**

---

## Required Credentials

| Field      | Where set               | Notes                                           |
|------------|-------------------------|-------------------------------------------------|
| `base_url` | API Integrations → SMShika | Production URL from SMShika dashboard. Do NOT use localhost. |
| `api_key`  | API Integrations → SMShika | Token from SMShika account settings.           |
| `auth_type`| API Integrations → SMShika | Set to `api_key`.                              |

No `secret_key`, `username`, or `password` are required.

---

## Airtime Endpoint Mapping

**Endpoint:** `POST {BASE_URL}/api/topup`

| Internal field             | SMShika field    | Example              |
|----------------------------|------------------|----------------------|
| `input.amount`             | `amount`         | `"1000"` (string)    |
| network (from variation_code prefix) | `network` | `"MTN"`, `"Airtel"`, `"Glo"`, `"9mobile"` |
| `input.phone`              | `mobile_number`  | `"08012345678"`      |
| (hardcoded)                | `Ported_number`  | `false`              |
| (hardcoded)                | `airtime_type`   | `"VTU"`              |

**Internal → SMShika network name mapping (airtime):**

| Customer selects | variation_code prefix | SMShika `network` |
|------------------|-----------------------|-------------------|
| MTN              | `mtn`                 | `MTN`             |
| Airtel           | `airtel`              | `Airtel`          |
| Glo              | `glo`                 | `Glo`             |
| 9mobile          | `9mobile`             | `9mobile`         |

No `provider_variation_code` is needed for airtime. The variation_code prefix resolves the network name directly.

---

## Data Endpoint Mapping

**Endpoint:** `POST {BASE_URL}/api/data/`

| Internal field                        | SMShika field    | Example         |
|---------------------------------------|------------------|-----------------|
| network ID (from variation_code prefix) | `network`      | `1` (integer)   |
| `input.phone`                         | `mobile_number`  | `"08012345678"` |
| `service_plans.provider_variation_code` | `plan`         | `7` (integer)   |
| (hardcoded)                           | `Ported_number`  | `false`         |

**Internal → SMShika network ID mapping (data):**

| Customer selects | variation_code prefix | SMShika `network` ID |
|------------------|-----------------------|----------------------|
| MTN              | `mtn`                 | `1`                  |
| Glo              | `glo`                 | `2`                  |
| 9mobile          | `9mobile`             | `3`                  |
| Airtel           | `airtel`              | `4`                  |

**Plan ID mapping:**

The SMShika `plan` integer comes from `service_plans.provider_variation_code`. This field is set per-plan in Admin → Service Plans → Edit → "Provider Plan ID / Variation Code". Get the correct integer from your SMShika account's data plan list.

**If the `provider_variation_code` field is blank**, the purchase will fail with a clear error before reaching SMShika:
> "SMShika data: Provider plan ID is missing for this plan."

**Auth header:**
```
Authorization: Token {api_key}
Content-Type: application/json
```

**Success condition:** `status` or `Status` field in the response body equals `"success"`, `"successful"`, or `"delivered"` (case-insensitive).

---

## Admin Dashboard Setup Steps

### First-time setup

1. **Register provider config** (dev: run seed `04_smshika_provider_config.ts` then migration `20260522000002`; production: use Admin SQL):
   ```sql
   INSERT INTO provider_configs (id, provider_code, name, is_active, priority, supported_services, health_status)
   VALUES (gen_random_uuid(), 'smshika', 'SMShika', false, 3, '["airtime","data"]', 'unknown')
   ON CONFLICT (provider_code) DO NOTHING;
   ```
   Then run the migration to update `supported_services` if the row already exists:
   ```
   npx knex migrate:latest
   ```

2. **Add credentials** — Admin → API Integrations → find SMShika row → Edit:
   - `base_url`: your production SMShika base URL (e.g. `https://smshika.com`)
   - `api_key`: your SMShika API token
   - `auth_type`: `api_key`
   - `is_live`: `true` for production, `false` for sandbox

3. **Enable the provider** — Admin → Provider Management → SMShika → set `is_active = true`.

4. **Set routing rules** — Admin → Provider Routing:
   - **Airtime**: Service type `airtime`, Primary provider `smshika`
   - **Data**: Service type `data`, Primary provider `smshika`
   - Set each rule to active

5. **Health check** — Admin → Provider Health → SMShika.
   Reports `healthy: true` if credentials are present (no live ping — see Known Limitations).

---

### Creating a data plan for SMShika

1. Go to **Admin → Service Plans → New Plan**
2. Fill in:
   - **Service**: select the data service (e.g. `MTN Data`)
   - **Legacy Provider Code**: `smshika`
   - **Plan Name**: descriptive (e.g. `MTN 1GB SME 30 Days`)
   - **Variation Code**: internal identifier (e.g. `mtn-sme-1gb-30`)
   - **Network**: `mtn` (or `airtel`, `glo`, `9mobile`)
   - **Category**: `sme` (or `corporate`, `gifting`, `direct`, etc.)
   - **Provider Plan ID / Variation Code**: ⚠️ **REQUIRED** — the numeric plan ID from your SMShika data plan list (e.g. `7`). Without this, all purchases of this plan will fail.
   - **Primary Provider**: `smshika`
   - **Cost Price / Selling Price**: your margin
   - **Active**: enabled

3. The plan will appear in the customer Data page under the correct network and category.

---

## Test Steps (Data)

### Verify provider is registered with data support
```sql
SELECT provider_code, supported_services FROM provider_configs WHERE provider_code = 'smshika';
-- Should show: ["airtime","data"]
```

### End-to-end test (use low-value plan, e.g. 50MB or smallest available)

1. **Create the test plan** via Admin → Service Plans:
   - Variation Code: `mtn-sme-50mb-test` (or any unique slug)
   - Network: `mtn`, Category: `sme`
   - Provider Plan ID: `[SMShika plan ID for MTN 50MB]`
   - Primary Provider: `smshika`, Active: yes

2. **Log in as a customer** with wallet balance ≥ plan selling price.
3. Go to **Services → Buy Data**
4. Select **MTN → SME → [your test plan]**
5. Enter a valid MTN phone number, confirm.
6. **Expected (success):** transaction shows `successful`; wallet debited by selling price.
7. **Expected (failure):** transaction shows `failed`; wallet refunded to pre-purchase balance.

### Verify missing plan ID error
1. Create a plan with **blank** Provider Plan ID.
2. Purchase it.
3. **Expected:** transaction fails immediately with:
   > "SMShika data: Provider plan ID is missing for this plan."
4. Wallet should be refunded; transaction status `failed`.

### Verify wallet debit/refund
1. Note wallet balance before purchase.
2. After a **failed** data purchase:
   - `provider_attempts`: `success = false`
   - `transactions`: `status = 'failed'`, `failed_at` set
   - Wallet balance = pre-purchase balance (full refund)
3. After a **successful** data purchase:
   - `provider_attempts`: `success = true`
   - `transactions`: `status = 'successful'`, `processed_at` set
   - Wallet balance = pre-purchase balance minus selling_price

### Confirm raw response is stored
```sql
SELECT provider_code, success, response_payload->>'Status', response_payload->>'message'
FROM provider_attempts
WHERE provider_code = 'smshika'
ORDER BY created_at DESC
LIMIT 3;
```

---

## Refund Behavior on Failed Data Purchase

The execution engine handles refunds automatically — no provider-specific code is needed:

1. Customer submits purchase → wallet is debited via double-entry journal.
2. If SMShika returns `status: "fail"` → engine calls `handleAllFailed()` → calls `walletService.refundFromDestination()`.
3. Refund is recorded as a journal entry reversing the original debit.
4. Transaction status set to `failed`, `failed_at` timestamp set.
5. Customer receives an in-app notification: "Transaction Failed".
6. No double-debit/refund: `provider_attempts` idempotency check prevents re-execution on BullMQ retry.

---

## Known Limitations

| Limitation | Detail |
|-----------|--------|
| No balance endpoint | `getBalance()` throws. Admin health check reports credentials present but cannot do a live ping. |
| No verify/requery endpoint | `verifyTransaction()` returns `pending`. Use SMShika dashboard to look up transactions. |
| No webhook support | Transaction status is set synchronously from the API response. No async webhook processing. |
| Data plan IDs must be set manually | Admin must look up numeric plan IDs from SMShika's plan list and enter them per-plan. |
| Cable, Electricity | Not yet implemented. `purchase()` throws for service_types other than `airtime`/`data`. |
