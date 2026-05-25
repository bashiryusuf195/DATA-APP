# Backup & Disaster Recovery

## 1. Supabase automated backups

Supabase handles PostgreSQL backups automatically on paid plans:

| Plan | Backup type | Retention | PITR granularity |
|------|-------------|-----------|-----------------|
| Free | Daily logical backup | 7 days | Not available |
| Pro  | Daily + Point-In-Time Recovery (PITR) | 30 days | 1 second |
| Team/Enterprise | PITR | 90 days | 1 second |

**Recommended: Pro tier or higher** so PITR is available. This allows restoring to any second within the retention window — critical for recovering from accidental data corruption without replaying a full 24-hour gap.

### Enabling PITR on Supabase Pro

1. Dashboard → Project Settings → Backups
2. Enable "Point In Time Recovery"
3. Verify the backup region matches your app deployment region to minimise restore latency

### Triggering a manual restore

```
Supabase Dashboard → Settings → Backups → Restore to point in time
```

Or via Supabase CLI:
```bash
supabase db restore --project-ref <ref> --timestamp "2026-05-25T14:30:00Z"
```

---

## 2. Manual pg_dump procedure

Run a full logical backup before any large migration or schema change:

```bash
# Dump to a compressed file (run from a machine with psql access)
PGPASSWORD="$DB_PASSWORD" pg_dump \
  --host "$DB_HOST" \
  --port 5432 \
  --username "$DB_USER" \
  --dbname "$DB_NAME" \
  --format custom \
  --compress 9 \
  --no-owner \
  --no-acl \
  --file "vtu_backup_$(date +%Y%m%dT%H%M%S).dump"
```

Restore:
```bash
PGPASSWORD="$DB_PASSWORD" pg_restore \
  --host "$DB_HOST" \
  --port 5432 \
  --username "$DB_USER" \
  --dbname "$DB_NAME" \
  --no-owner \
  --no-acl \
  "vtu_backup_<timestamp>.dump"
```

Store dumps in an encrypted S3 bucket or equivalent object storage. Rotate after 90 days.

---

## 3. Export tools (admin API)

Admin endpoints for on-demand CSV exports. All exports are logged to `admin_activity_logs`.

| Endpoint | Role | Description |
|----------|------|-------------|
| `GET /admin/export/transactions` | admin | Transactions with filters: from, to, status, type |
| `GET /admin/export/wallet-ledger` | super_admin | Immutable ledger entries |
| `GET /admin/export/users` | super_admin | User records (phone masked, no password_hash) |
| `GET /admin/export/provider-attempts` | admin | Provider call logs (no API keys in payload) |
| `GET /admin/export/reconciliation-reports` | admin | Reconciliation run summaries |

All exports:
- Stream rows in batches of 2 000 (max 500 000 rows per request)
- Default window: last 90 days; maximum: 365 days
- UTF-8 BOM for Excel compatibility
- Content-Disposition: attachment; filename="<export>_<date>.csv"

Example (with curl):
```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  "https://api.example.com/admin/export/transactions?from=2026-01-01&to=2026-05-25&status=completed" \
  --output transactions_export.csv
```

---

## 4. Integrity checks

The daily integrity worker (`integrity-checks` queue) runs at **02:00 AM** and performs five checks:

| Check | What it detects | Severity |
|-------|----------------|----------|
| Orphan transactions | Completed purchase with no posted wallet journal batch | Critical |
| Negative balances | Active wallet with negative computed balance | Critical |
| Duplicate provider refs | Multiple successful txns sharing the same `provider_reference` | Critical |
| Duplicate purchases | Same user + type + amount within a 60-second window | Warning |
| Ghost journal batches | Posted batch with zero ledger entries | Warning |

Critical issues trigger an alert via `errorReporter.captureMessage()` (Sentry/BetterStack).

### Running a manual check (admin API)

```bash
# Trigger a check immediately
POST /admin/integrity/run

# List past reports (last 30)
GET /admin/integrity/reports

# Fetch a specific report
GET /admin/integrity/reports/:id
```

---

## 5. Repair tools

All repair operations are audited to `admin_activity_logs` **before** execution. No operation directly modifies `wallet_ledger` or `wallet_journal_batches` rows — balance changes flow through WalletService PL/pgSQL functions only.

| Endpoint | Role | Action |
|----------|------|--------|
| `POST /admin/repair/transactions/:ref/mark-failed` | admin | Mark a stuck processing/pending txn as failed |
| `POST /admin/repair/transactions/:ref/reconcile` | admin | Enqueue a manual reconciliation job |
| `POST /admin/repair/transactions/:ref/flag-orphan` | admin | Tag a txn as an orphan in metadata |
| `POST /admin/repair/manual-refund` | super_admin | Credit a wallet via WalletService (idempotent) |
| `GET /admin/repair/wallets/:walletId/verify` | admin | Read-only balance verification |

### Manual refund payload

```json
{
  "user_id": "<uuid>",
  "amount": 1000,
  "reason": "Provider charged but service not delivered — ref ABC123",
  "original_reference": "TXN-ABC123",
  "settlement_wallet_id": "<settlement-wallet-uuid>"
}
```

---

## 6. RTO / RPO targets

| Scenario | Target RPO | Target RTO |
|----------|-----------|-----------|
| Accidental row deletion (PITR) | < 1 second | < 30 minutes |
| Full database corruption | < 24 hours (last daily dump) | < 2 hours |
| Single corrupted transaction | 0 (audit trail intact) | < 15 minutes (repair tools) |
| Service unavailability | N/A | < 5 minutes (restart) |

---

## 7. Disaster recovery runbook

### Scenario A — single transaction stuck in processing

1. Check the transaction reference in the admin dashboard or via `/admin/integrity/run`.
2. If the provider confirms the transaction was not processed: `POST /admin/repair/transactions/:ref/mark-failed` with a reason.
3. If the provider confirms delivery but the wallet was not credited: `POST /admin/repair/transactions/:ref/reconcile`.
4. Verify wallet balance: `GET /admin/repair/wallets/:walletId/verify`.

### Scenario B — reconciliation backlog

1. Monitor queue depth via `GET /admin/health/queues`.
2. If `vtu-reconciliation` backlog > 100: check worker logs for repeated errors.
3. If the worker is healthy but a provider is down: pause reconciliation for that provider via routing rules and re-enable when the provider recovers.
4. Drain manually: trigger reconciliation jobs for specific references via the repair endpoint.

### Scenario C — negative wallet balance detected

1. Integrity report will flag the wallet(s).
2. Run `GET /admin/repair/wallets/:walletId/verify` to see computed vs snapshot divergence.
3. Pull the wallet ledger export for that wallet and audit the entries manually.
4. If a duplicate credit is found: do NOT reverse it via the ledger — raise a super_admin support ticket for a controlled debit.
5. If a missing debit is found: `POST /admin/repair/manual-refund` is NOT the right tool (it only credits). Escalate to engineering for a controlled ledger correction via a PL/pgSQL migration.

### Scenario D — full database restore required

1. Stop all API server and worker instances.
2. Trigger Supabase PITR restore to the last known-good timestamp.
3. Verify row counts for `transactions`, `wallet_ledger`, `wallets`.
4. Run `POST /admin/integrity/run` to confirm no orphan transactions.
5. Restart workers, then API servers.
6. Monitor `/admin/system-health` for 30 minutes.

---

## 8. Security notes

- Export endpoints are rate-limited (`adminSensitiveLimiter`). Bulk data exports require `super_admin` for wallet ledger and user records.
- All exports exclude: `password_hash`, `totp_secret`, `*_encrypted` columns, provider API keys from request/response payloads.
- Phone numbers in user exports are masked to the last 4 digits.
- pg_dump credentials must be stored in a secrets manager (not in `.env` committed to git).
