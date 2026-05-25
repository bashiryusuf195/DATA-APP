# Railway Production Deployment Guide

## Overview

The HiveData VTU platform deploys as **five Railway services** backed by **Supabase** (external PostgreSQL) and a **Redis** addon.

```
Railway Project
├── api          — Backend API   (Node.js)          → api.hivedata.com.ng
├── worker       — Background workers (Node.js)      → (no public domain)
├── Redis        — Railway Redis addon               → (internal URL)
├── admin        — Admin dashboard (static SPA)      → admin.hivedata.com.ng
└── customer     — Customer app   (static SPA)       → hivedata.com.ng
                                                        www.hivedata.com.ng

External
└── Supabase     — PostgreSQL database + auth        → (Supabase project URL)
```

---

## Prerequisites

- Railway account with a project created
- Supabase project (Pro tier recommended for PITR backups)
- Paystack live account with DVA enabled
- Domain `hivedata.com.ng` with DNS access

---

## Step 1 — Add Redis Addon

In your Railway project:

1. **New Service → Database → Redis**
2. Railway injects `REDIS_URL` automatically into services that reference the addon.
3. Copy the private `REDIS_URL` — you will set it on both the **api** and **worker** services.

---

## Step 2 — Deploy the Backend API

### Source
Connect the root of the repository (`vtu-backend-fixed/`).

### Build command
```
npm ci && npm run build
```

### Start command
```
npm run start
```

### Health check
```
/api/v1/health
```

### Environment variables

| Variable | Required | Notes |
|----------|----------|-------|
| `NODE_ENV` | ✅ | `production` |
| `PORT` | auto | Railway injects this |
| `DATABASE_URL` | ✅ | Supabase → Settings → Database → URI (Transaction mode, port 6543) |
| `DATABASE_READ_URL` | optional | Same as `DATABASE_URL` unless you have a read replica |
| `SUPABASE_URL` | ✅ | `https://<project-id>.supabase.co` |
| `SUPABASE_ANON_KEY` | ✅ | Dashboard → Settings → API → anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Dashboard → Settings → API → service_role secret key |
| `REDIS_URL` | ✅ | From Railway Redis addon (use private URL) |
| `JWT_SECRET` | ✅ | Supabase → Settings → API → JWT Secret |
| `ENCRYPTION_KEY` | ✅ | 64 hex chars — generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `CORS_ORIGINS` | ✅ | `https://hivedata.com.ng,https://www.hivedata.com.ng,https://admin.hivedata.com.ng` |
| `PAYSTACK_SECRET_KEY` | ✅ | Live key: `sk_live_…` |
| `PAYSTACK_PUBLIC_KEY` | ✅ | Live key: `pk_live_…` |
| `PAYSTACK_WEBHOOK_SECRET` | ✅ | Paystack dashboard → Settings → Webhooks |
| `PAYSTACK_CALLBACK_URL` | ✅ | `https://hivedata.com.ng/wallet/fund/callback` |
| `LOG_LEVEL` | optional | `info` (production) |
| `APP_VERSION` | optional | e.g. `1.0.0` |
| `DISABLE_WORKERS` | ✅ | `true` on the API service — workers run separately |
| `RATE_LIMIT_WINDOW_MS` | optional | Default `60000` |
| `RATE_LIMIT_MAX` | optional | Default `60` |

> **Provider credentials** (VTPass, Clubkonnect, SMShika, LegitDataWay) are stored encrypted in the database via the Admin → API Integrations page. They do NOT go in environment variables.

---

## Step 3 — Deploy the Worker Service

The worker service runs the same compiled code as the API but executes **background jobs only** — no HTTP server.

### Source
Same repository root as the API service. In Railway, duplicate the API service and change only the **start command**.

### Build command
```
npm ci && npm run build
```

### Start command
```
npm run worker:prod
```
This runs **all** workers (airtime, VTU purchases, Paystack webhooks, reconciliation, notifications, integrity checks).

To run specific workers as separate Railway services:
```
npm run worker:reconciliation   # reconciliation worker only
npm run worker:integrity        # daily integrity checker only
```

### Environment variables
All the same as the API service **except**:

| Variable | Value |
|----------|-------|
| `DISABLE_WORKERS` | `false` |
| `NODE_ENV` | `production` |

> The worker service does **not** need `CORS_ORIGINS` or `PORT`.

---

## Step 4 — Deploy the Admin Dashboard

### Source
Connect the `admin-dashboard/` subdirectory of the repository.

### Build command
```
npm ci && npm run build
```

### Start command
```
npx serve dist -s -l $PORT
```
`-s` enables single-page app mode (serves `index.html` for unmatched routes).

### Environment variables

| Variable | Value |
|----------|-------|
| `VITE_API_BASE_URL` | `https://api.hivedata.com.ng` |

> `VITE_API_BASE_URL` must be set **at build time** — Vite bakes it into the bundle. If you change it, trigger a redeploy.

### Domain
Set custom domain: `admin.hivedata.com.ng`

---

## Step 5 — Deploy the Customer App

### Source
Connect the `customer-app/` subdirectory of the repository.

### Build command
```
npm ci && npm run build
```

### Start command
```
npx serve dist -s -l $PORT
```

### Environment variables

| Variable | Value |
|----------|-------|
| `VITE_API_BASE_URL` | `https://api.hivedata.com.ng` |

### Domains
Set custom domains:
- `hivedata.com.ng`
- `www.hivedata.com.ng`

---

## Step 6 — Run Database Migrations

After the API service is deployed but before you send any traffic, run migrations. In Railway, use a **one-off command** on the API service:

```bash
npm run migrate:prod
```

Or from your local machine with production `DATABASE_URL`:
```bash
DATABASE_URL=postgresql://... npm run migrate:prod
```

---

## Step 7 — Seed Providers and Plans

After migrations, set up providers via the admin dashboard:

1. Log in to `admin.hivedata.com.ng`
2. Go to **API Integrations** — add credentials for Clubkonnect, VTPass, SMShika, LegitDataWay
3. Go to **Service & Plans** — confirm plans are loaded or import from CSV

---

## Domain Mapping

| Service | Custom domain | Railway setting |
|---------|--------------|-----------------|
| Backend API | `api.hivedata.com.ng` | API service → Settings → Domains |
| Admin Dashboard | `admin.hivedata.com.ng` | Admin service → Settings → Domains |
| Customer App | `hivedata.com.ng` | Customer service → Settings → Domains |
| Customer App (www) | `www.hivedata.com.ng` | Customer service → Settings → Domains |

### DNS records (add to your domain registrar)

```
Type   Name     Value
CNAME  api      <railway-api-service>.railway.app
CNAME  admin    <railway-admin-service>.railway.app
CNAME  www      <railway-customer-service>.railway.app
A      @        <railway-customer-service IP>  (or CNAME if registrar supports root CNAME)
```

---

## Health Check Endpoints

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /api/v1/health` | None | Liveness — process alive, uptime |
| `GET /api/v1/health/ready` | None | Readiness — DB + Redis reachable |
| `GET /api/v1/health/database` | None | DB latency measurement |
| `GET /api/v1/health/queues` | Admin JWT | Queue backlog + failures |
| `GET /api/v1/health/providers` | Admin JWT | Provider circuit-breaker state |

Railway uses `GET /api/v1/health` for the health check (configured in `railway.json`).

---

## Paystack Webhook Setup

After deploying:

1. Go to Paystack Dashboard → Settings → Webhooks
2. Set webhook URL to: `https://api.hivedata.com.ng/webhooks/paystack`
3. Copy the webhook secret into `PAYSTACK_WEBHOOK_SECRET` in Railway API env vars
4. Redeploy the API service

---

## Production Deployment Checklist

### Before going live

- [ ] **Rotate all credentials** — any keys previously in source control or exposed in testing must be regenerated:
  - [ ] Supabase `service_role` key
  - [ ] Supabase JWT secret
  - [ ] PostgreSQL password
  - [ ] Redis password (Upstash token)
  - [ ] Paystack secret key (use live, not test)
  - [ ] ENCRYPTION_KEY (generate a fresh 64-hex key for production)

- [ ] `NODE_ENV=production` on API and worker services
- [ ] `DISABLE_WORKERS=true` on API service only
- [ ] `DISABLE_WORKERS=false` on worker service
- [ ] `CORS_ORIGINS` set to production domains only (no localhost)
- [ ] `PAYSTACK_SECRET_KEY` is a live key (`sk_live_…`), not test
- [ ] `PAYSTACK_WEBHOOK_SECRET` is set and matches Paystack dashboard
- [ ] `PAYSTACK_CALLBACK_URL` points to production customer app
- [ ] `VITE_API_BASE_URL` set on both frontend services before building
- [ ] Database migrations run successfully
- [ ] No `.env` file committed to git

### Functional smoke tests (run after deployment)

- [ ] `GET https://api.hivedata.com.ng/api/v1/health` → `{"status":"ok"}`
- [ ] `GET https://api.hivedata.com.ng/api/v1/health/ready` → `{"status":"ok"}`
- [ ] Admin login at `https://admin.hivedata.com.ng`
- [ ] Admin → System Health → all green
- [ ] Admin → API Integrations → provider credentials saved
- [ ] Customer login at `https://hivedata.com.ng`
- [ ] Customer → Wallet → Fund with Paystack (test ₦100)
- [ ] Paystack webhook received → wallet credited
- [ ] Customer → Airtime purchase (test ₦50)
- [ ] Purchase successful → wallet debited
- [ ] Admin → Transactions → purchase appears
- [ ] Admin → Integrity → Run Check → no critical issues
- [ ] Trigger reconciliation: Admin → Reconciliation
- [ ] Verify failover: disable primary provider → purchase routes to fallback

---

## Troubleshooting

### `Error: Missing required environment variable: "DATABASE_URL"`
The API service is missing env vars. Check Railway service → Variables tab.

### `Redis ping failed`
`REDIS_URL` is wrong or the Redis addon isn't linked to this service. Go to Railway → Redis service → Connect → copy the private URL.

### Paystack webhook `invalid_signature`
`PAYSTACK_WEBHOOK_SECRET` doesn't match the secret in Paystack dashboard. Update the env var and redeploy.

### CORS errors in browser
`CORS_ORIGINS` on the API service doesn't include the frontend origin. Add the domain and redeploy (no rebuild needed — env var change only).

### SPA routing 404s (admin/customer app)
The `-s` flag on `npx serve` enables SPA mode. If you changed the start command, ensure `-s` is still present.

### `ENCRYPTION_KEY must be exactly 64 hex characters`
Generate a new key: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and set it in Railway vars.

### Worker jobs not processing
1. Check `DISABLE_WORKERS=false` on the worker service
2. Check both API and worker share the same `REDIS_URL`
3. Check Admin → Queue Monitor for error details
