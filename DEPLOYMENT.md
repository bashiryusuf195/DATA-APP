# VTU Platform — Deployment Guide

## Table of Contents
- [Prerequisites](#prerequisites)
- [Environment Variables](#environment-variables)
- [Local Development](#local-development)
- [Docker Deployment](#docker-deployment)
- [Database Migrations](#database-migrations)
- [Production Checklist](#production-checklist)
- [Architecture](#architecture)

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 20.x LTS |
| Docker & Docker Compose | 24+ |
| PostgreSQL | 15+ (or Supabase) |
| Redis | 7+ |

---

## Environment Variables

### Backend

Copy and fill in:

```bash
cp .env.example .env
```

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | yes | `production` in production |
| `PORT` | no | HTTP port (default: `3000`) |
| `DATABASE_URL` | yes | Primary PostgreSQL connection string |
| `DATABASE_READ_URL` | no | Read replica (falls back to `DATABASE_URL`) |
| `SUPABASE_URL` | yes | Supabase project URL |
| `SUPABASE_ANON_KEY` | yes | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Supabase service-role key |
| `REDIS_URL` | yes | Redis connection string (e.g. `redis://localhost:6379`) |
| `JWT_SECRET` | yes | JWT signing secret (use Supabase project JWT secret) |
| `ENCRYPTION_KEY` | yes | 64-hex-char AES-256 key for PII (BVN/NIN) |
| `CORS_ORIGINS` | yes | Comma-separated allowed origins |
| `PAYSTACK_SECRET_KEY` | yes | Paystack secret key |
| `PAYSTACK_PUBLIC_KEY` | yes | Paystack public key |
| `PAYSTACK_WEBHOOK_SECRET` | yes | Paystack webhook signing secret |
| `VTPASS_BASE_URL` | yes | VTPass API URL |
| `VTPASS_API_KEY` | yes | VTPass API key |
| `VTPASS_SECRET_KEY` | yes | VTPass secret key |
| `LOG_LEVEL` | no | `error`/`warn`/`info`/`debug` (default: `info`) |

Generate secrets:

```bash
# JWT_SECRET / long random string
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# ENCRYPTION_KEY — must be exactly 64 hex chars
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Frontend (admin-dashboard)

```bash
cp admin-dashboard/.env.example admin-dashboard/.env
```

| Variable | Description |
|----------|-------------|
| `VITE_API_BASE_URL` | Backend base URL. Leave empty in dev (Vite proxy handles routing). Set to `https://api.yourdomain.com` in production. |

---

## Local Development

### Without Docker

```bash
# 1. Start Redis (required for BullMQ queues)
docker run -d -p 6379:6379 redis:7-alpine

# 2. Configure environment
cp .env.example .env
# Edit .env — set DATABASE_URL, SUPABASE_*, JWT_SECRET, ENCRYPTION_KEY

# 3. Install dependencies
npm install
cd admin-dashboard && npm install && cd ..

# 4. Run database migrations
npm run migrate:prod

# 5. Start backend API server (port 3000)
npm run dev

# 6. In another terminal — start background workers
npm run worker

# 7. In another terminal — start admin dashboard (port 5173)
cd admin-dashboard && npm run dev
```

The Vite dev proxy routes `/admin`, `/auth`, `/wallet`, `/transactions`, `/notifications` to `http://localhost:3000` — no CORS configuration needed.

---

## Docker Deployment

### Quick start (with external database)

```bash
# 1. Configure environment
cp .env.example .env
# Edit .env — DATABASE_URL must point to external Postgres/Supabase
# Leave REDIS_URL as-is — docker-compose sets it to the internal redis service

# 2. Build and start
docker compose up -d

# 3. Run database migrations (one-off)
docker compose run --rm api npm run migrate:prod

# 4. Check health
curl http://localhost:3000/api/v1/health/ready
```

### With local PostgreSQL

```bash
docker compose --profile local-db up -d

# Wait for postgres to be healthy, then migrate
docker compose run --rm api npm run migrate:prod
```

### Frontend container

```bash
cd admin-dashboard

# Build with production API URL
docker build \
  --build-arg VITE_API_BASE_URL=https://api.yourdomain.com \
  -t vtu-admin:latest .

# Run on port 8080
docker run -d -p 8080:80 vtu-admin:latest
```

---

## Database Migrations

Migrations use Knex and live in `src/database/migrations/`.

```bash
# Run all pending migrations
npm run migrate:prod

# Or directly with knex
npx knex --knexfile knexfile.ts migrate:latest

# Check migration status
npx knex --knexfile knexfile.ts migrate:status

# Roll back last batch (dev only)
npx knex --knexfile knexfile.ts migrate:rollback
```

> **Important:** Always run migrations before deploying new application code. The migration command requires `DATABASE_URL` to be set.

---

## Production Checklist

### Before first deploy

- [ ] Generate strong `JWT_SECRET` (≥64 random chars)
- [ ] Generate `ENCRYPTION_KEY` (exactly 64 hex chars / 32 bytes)
- [ ] Set `NODE_ENV=production`
- [ ] Set `CORS_ORIGINS` to your frontend domain(s) only
- [ ] Configure Paystack webhook URL: `https://api.yourdomain.com/wallet/webhook/paystack`
- [ ] Set `VTPASS_SANDBOX=false` for live transactions
- [ ] Run `npm run migrate:prod` against production database
- [ ] Confirm `GET /api/v1/health/ready` returns `200`

### Ongoing

- [ ] Keep `REDIS_URL` pointing at a persistent Redis instance (data survives restarts)
- [ ] Monitor `/api/v1/health/ready` — it checks both DB and Redis connectivity
- [ ] Tail worker logs for BullMQ job failures

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Client (browser)                                            │
│  admin-dashboard — React + Vite (Nginx in production)        │
└────────────────────────────┬────────────────────────────────┘
                             │ HTTPS
┌────────────────────────────▼────────────────────────────────┐
│  API Server — Express (src/server.ts)                        │
│  Port 3000                                                   │
│  • REST endpoints: /admin, /auth, /wallet, /transactions…    │
│  • Health: GET /api/v1/health  (liveness)                    │
│            GET /api/v1/health/ready  (readiness)             │
└──────────────┬─────────────────────────┬────────────────────┘
               │                         │
┌──────────────▼──────┐   ┌──────────────▼──────────────────┐
│  PostgreSQL          │   │  Redis (BullMQ)                  │
│  (Supabase or        │   │  • Job queues:                   │
│   self-hosted)       │   │    airtime-purchases             │
│                      │   │    vtu-purchases                 │
│  Tables:             │   │    paystack-webhooks             │
│  • users             │   │    vtu-reconciliation            │
│  • transactions      │   │    vtu-notifications             │
│  • wallets           │   └──────────────┬───────────────────┘
│  • …                 │                  │
└──────────────────────┘   ┌──────────────▼──────────────────┐
                           │  Worker Process (src/workers/)   │
                           │  Processes all 5 queues          │
                           │  Graceful shutdown on SIGTERM    │
                           └─────────────────────────────────┘
```

### Process model

| Process | Entry point | Purpose |
|---------|------------|---------|
| API server | `dist/server.js` | Handles HTTP requests |
| Worker | `dist/workers/index.js` | Processes BullMQ background jobs |

Both processes read from the same `.env`. In docker-compose they are separate containers (`api` and `worker`). Both connect to the same Redis instance.
