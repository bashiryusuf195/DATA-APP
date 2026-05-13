# VTU Platform — Backend

Node.js / Express / Supabase / BullMQ backend skeleton.

## Prerequisites

| Tool | Version |
|---|---|
| Node.js | 18 or 20 (LTS) |
| npm | 9+ (comes with Node) |
| Redis | 7+ (local or Upstash) |
| Supabase project | Free tier is fine for development |

---

## 1 · Install dependencies

```bash
cd backend
npm install
```

---

## 2 · Set up environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in every value. The server **will crash** on startup if any required variable is empty — this is intentional so you catch missing config early.

| Variable | Where to find it |
|---|---|
| `SUPABASE_URL` | Supabase dashboard → Settings → API |
| `SUPABASE_ANON_KEY` | Same page |
| `SUPABASE_SERVICE_ROLE_KEY` | Same page (keep this secret) |
| `DATABASE_URL` | Settings → Database → Connection string → URI |
| `JWT_SECRET` | Settings → API → JWT Settings → JWT Secret |
| `REDIS_URL` | `redis://localhost:6379` for local Redis |
| `ENCRYPTION_KEY` | Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

---

## 3 · Start Redis locally (if needed)

```bash
# Option A — Docker (easiest)
docker run -d -p 6379:6379 --name vtu-redis redis:7-alpine

# Option B — Homebrew (macOS)
brew install redis && brew services start redis

# Option C — Use Upstash (cloud Redis, free tier)
# Set REDIS_URL=rediss://default:TOKEN@host.upstash.io:6380
```

---

## 4 · Run the API server

```bash
npm run dev
```

You should see:

```
HH:mm:ss [info] Starting VTU API server…
HH:mm:ss [info] Database connected ✓
HH:mm:ss [info] Redis connected ✓
HH:mm:ss [info] Server listening on port 3000 ✓
```

Test it:

```bash
curl http://localhost:3000/api/v1/health
```

Expected response:

```json
{
  "status": "ok",
  "service": "vtu-api",
  "version": "1.0.0",
  "env": "development",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

Full readiness check (also tests DB + Redis):

```bash
curl http://localhost:3000/api/v1/health/ready
```

---

## 5 · Run the worker process (separate terminal)

```bash
npm run worker
```

This starts the background job processor. In development you run both the API server and the worker at the same time in two terminals.

---

## 6 · TypeScript type-check (no compile needed for dev)

```bash
npm run type-check
```

---

## Project structure

```
backend/
├── .env.example          ← copy to .env and fill in values
├── package.json
├── tsconfig.json
└── src/
    ├── server.ts         ← entry point: starts HTTP server
    ├── app.ts            ← Express app: wires all middleware + routes
    │
    ├── config/
    │   ├── index.ts      ← reads all env vars (crashes if required ones missing)
    │   ├── database.ts   ← Supabase client + Knex (db, dbRead)
    │   ├── redis.ts      ← ioredis connection + cache helpers
    │   └── queues.ts     ← BullMQ queue definitions
    │
    ├── lib/
    │   ├── logger.ts     ← Winston structured logger
    │   ├── errors.ts     ← Custom error classes (AppError and subtypes)
    │   └── crypto.ts     ← AES-256 encryption + bcrypt PIN hashing
    │
    ├── middleware/
    │   ├── auth.ts           ← JWT verification → req.user
    │   ├── rbac.ts           ← requirePermission(), requireAdmin()
    │   ├── errorHandler.ts   ← global error handler + 404 handler
    │   ├── idempotency.ts    ← Idempotency-Key header enforcement
    │   ├── rateLimiter.ts    ← 3 tiers: standard, strict, transaction
    │   ├── requestLogger.ts  ← logs every request with traceId
    │   └── validate.ts       ← Zod schema → Express middleware factory
    │
    ├── routes/
    │   ├── index.ts          ← master router (mounts all sub-routers)
    │   └── health.routes.ts  ← GET /health, GET /health/ready
    │
    ├── types/
    │   └── express.d.ts      ← adds req.user and req.traceId to Express types
    │
    └── workers/
        └── index.ts          ← worker process entry point
```

---

## Available endpoints (skeleton)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/health` | None | Liveness check |
| GET | `/api/v1/health/ready` | None | Readiness check (DB + Redis) |

More endpoints are added in later implementation phases.

---

## Adding a new module (example: Wallet)

1. Create `src/routes/wallet.routes.ts` with your route definitions
2. Create `src/modules/wallet/wallet.service.ts` with business logic
3. Create `src/modules/wallet/wallet.controller.ts` calling the service
4. Register in `src/routes/index.ts`:
   ```ts
   import { walletRouter } from './wallet.routes';
   rootRouter.use('/wallet', walletRouter);
   ```

---

## Common errors

**"Missing required environment variable: X"**
→ Open `.env` and fill in the missing value.

**"connect ECONNREFUSED 127.0.0.1:6379"**
→ Redis is not running. Start it with `docker run -d -p 6379:6379 redis:7-alpine`.

**"getaddrinfo ENOTFOUND db.xxx.supabase.co"**
→ Wrong `DATABASE_URL`. Copy it from Supabase → Settings → Database.
