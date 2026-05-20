# SMShika Provider

Provider code: `smshika`
Supported services: **Airtime only**

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

| Internal field     | SMShika field    | Example             |
|--------------------|------------------|---------------------|
| `input.amount`     | `amount`         | `"1000"` (string)   |
| network (from variation_code) | `network` | `"MTN"`, `"Airtel"`, `"Glo"`, `"9mobile"` |
| `input.phone`      | `mobile_number`  | `"08012345678"`     |
| (hardcoded)        | `Ported_number`  | `false`             |
| (hardcoded)        | `airtime_type`   | `"VTU"`             |

**Internal → SMShika network mapping:**

| Customer selects | variation_code sent | SMShika `network` |
|-----------------|---------------------|-------------------|
| MTN             | `mtn-airtime`       | `MTN`             |
| Airtel          | `airtel-airtime`    | `Airtel`          |
| Glo             | `glo-airtime`       | `Glo`             |
| 9mobile         | `9mobile-airtime`   | `9mobile`         |

**Auth header:**
```
Authorization: Token {api_key}
Content-Type: application/json
```

**Success condition:** `status === "success"` OR `Status === "successful"` in response body.

---

## Admin Dashboard Setup Steps

1. **Register provider config** (dev: run seed `04_smshika_provider_config.ts`; production: use Admin SQL or run seed on staging):
   ```sql
   INSERT INTO provider_configs (id, provider_code, name, is_active, priority, supported_services, health_status)
   VALUES (gen_random_uuid(), 'smshika', 'SMShika', false, 3, '["airtime"]', 'unknown')
   ON CONFLICT (provider_code) DO NOTHING;
   ```

2. **Add credentials** — Admin → API Integrations → find SMShika row → Edit:
   - `base_url`: your production SMShika base URL (e.g. `https://smshika.com`)
   - `api_key`: your SMShika API token
   - `auth_type`: `api_key`
   - `is_live`: `true` for production, `false` for sandbox

3. **Enable the provider** — Admin → Provider Management → SMShika → set `is_active = true`.

4. **Set airtime routing** — Admin → Provider Routing:
   - Service type: `airtime`
   - Primary provider: `smshika`
   - Fallback provider: `mock_vtu_provider` (or leave blank in production)
   - Set to active

5. **Health check** — Admin → Provider Health → SMShika.
   - Will report `healthy: true` if credentials are present (no live ping — see Known Limitations).

---

## Test Steps

### Verify provider is registered
Check server startup logs:
```
[PROVIDER REGISTRY] SMShika registered (credentials loaded from DB at call time)
```

### Test airtime purchase (customer app)
1. Log in as a customer with wallet balance > 0.
2. Navigate to Services → Buy Airtime.
3. Select any network (MTN, Airtel, Glo, 9mobile).
4. Enter a valid 11-digit phone number and an amount (e.g. ₦100).
5. Confirm the purchase.
6. **Expected (success):** transaction shows `successful`; wallet is debited.
7. **Expected (failure from provider):** transaction shows `failed`; wallet is refunded (net balance unchanged).

### Force a failed provider response (mock phone)
Send phone `08000000000` if using the mock provider as fallback.
For SMShika itself, use a phone number that SMShika rejects in sandbox mode.

### Verify wallet debit/refund behavior
1. Note wallet balance before purchase.
2. Submit a purchase.
3. If provider returns failure:
   - Check `provider_attempts` table: `success = false`, `response_payload` has `status: "fail"`.
   - Check `transactions` table: `status = 'failed'`, `failed_at` is set.
   - Check wallet balance: should equal pre-purchase balance (refund applied).
4. If provider returns success:
   - Check `provider_attempts` table: `success = true`.
   - Check `transactions` table: `status = 'successful'`, `processed_at` is set.
   - Check wallet balance: should equal pre-purchase balance minus purchase amount.

### Confirm raw response is stored
```sql
SELECT response_payload FROM provider_attempts
WHERE provider_code = 'smshika'
ORDER BY created_at DESC LIMIT 1;
```

---

## Known Limitations

| Limitation | Detail |
|-----------|--------|
| No balance endpoint | `getBalance()` throws. Admin health check reports credentials present but cannot do a live ping. |
| No verify/requery endpoint | `verifyTransaction()` returns `pending` with a warning. Use SMShika dashboard to look up transactions. |
| No webhook support | Transaction status is set synchronously from the topup response. No async webhook processing. |
| Base URL not confirmed | The SMShika documentation shows `http://localhost` as example. Confirm production base URL with SMShika before go-live. |
| No sandbox environment documented | Cannot confirm test mode is available without contacting SMShika support. |
| Data, Cable, Electricity | Not implemented. `purchase()` throws for any service_type other than `airtime`. |
