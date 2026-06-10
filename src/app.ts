// src/app.ts
//
// Configures and exports the Express application.
// Kept separate from server.ts so tests can import the app
// without binding to a port.
//
// Middleware order matters — each layer runs in the order it is registered:
//   1. Security headers  (helmet)
//   2. CORS
//   3. Body parsing
//   4. Request logger    (assigns traceId)
//   5. Rate limiter
//   6. Routes
//   7. 404 handler       (after all routes)
//   8. Error handler     (must be very last)

import express                             from 'express';
import helmet                              from 'helmet';
import cors                                from 'cors';
import { config }                          from './config';
import { rootRouter }                      from './routes';
import { requestLogger }                   from './middleware/requestLogger';
import { standardLimiter }                 from './middleware/rateLimiter';
import { errorHandler, notFoundHandler }   from './middleware/errorHandler';
import { authRouter }                      from "./modules/auth/routes/auth.routes";
import { walletRouter } from "./modules/wallet/routes/wallet.routes";
import { transactionRouter } from "./modules/transactions/routes/transaction.routes";
import { catalogRouter } from "./modules/catalog/routes/catalog.routes";
import { webhookRouter } from "./modules/webhooks/routes/webhook.routes";
import { notificationsRouter }       from "./modules/notifications/routes/notifications.routes";
import { adminRouter }               from "./routes/admin.routes";
import { publicAuditMiddleware }       from "./middleware/publicAudit";
import { publicRouter }               from "./modules/public/routes/public.routes";
import { transactionPinRouter }       from "./modules/security/routes/transaction-pin.routes";
import "./modules/queue";
export const app = express();

// Trust the first proxy hop (Railway / Nginx / etc.) so that
// req.ip and rate-limiter key-generators see the real client IP
// from X-Forwarded-For rather than the load-balancer address.
app.set("trust proxy", 1);

// ── 1. Security headers ───────────────────────────────────────────────────────
// Helmet applies a suite of well-known HTTP security headers.
// CSP is tightened for an API: no scripts/styles/frames from external origins.
// HSTS is only sent in production — avoids locking localhost into HTTPS during dev.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:     ["'self'"],
      scriptSrc:      ["'none'"],
      styleSrc:       ["'none'"],
      imgSrc:         ["'self'"],
      connectSrc:     ["'self'"],
      fontSrc:        ["'none'"],
      objectSrc:      ["'none'"],
      mediaSrc:       ["'none'"],
      frameSrc:       ["'none'"],
      frameAncestors: ["'none'"],
      baseUri:        ["'self'"],
      formAction:     ["'self'"],
    },
  },
  // Disable COEP — not needed for a pure REST API and can break legitimate CDN assets.
  crossOriginEmbedderPolicy: false,
  // HSTS: 1-year max-age + includeSubDomains. Only set in production so that local
  // development is never forced onto HTTPS (which has no valid cert on localhost).
  hsts: config.isProd
    ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
    : false,
  // Prevent MIME-type sniffing.
  noSniff: true,
  // Deny framing everywhere.
  xFrameOptions: { action: 'deny' },
  // Hide the X-Powered-By: Express header.
  hidePoweredBy: true,
  // Referrer: only send origin, no path (avoids leaking query params to third parties).
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

// ── 2. CORS ───────────────────────────────────────────────────────────────────
// Only allows requests from the origins listed in CORS_ORIGINS.
app.use(cors({
  origin:         config.corsOrigins,
  credentials:    true,
  methods:        ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
}));

// ── 3. Body parsing ───────────────────────────────────────────────────────────
// Parse JSON request bodies. The verify callback saves the raw Buffer so
// webhook controllers can validate HMAC signatures (e.g. Paystack x-paystack-signature).
app.use(express.json({
  limit: '1mb',
  verify: (req: express.Request, _res: express.Response, buf: Buffer) => {
    req.rawBody = buf;
  },
}));

// ── 4. Request logger ─────────────────────────────────────────────────────────
app.use(requestLogger);

// ── 5. Rate limiter ───────────────────────────────────────────────────────────
app.use(standardLimiter);

// ── 6. Routes ─────────────────────────────────────────────────────────────────
// publicAuditMiddleware fires on res.on("finish") for every request.
// adminAuditMiddleware is embedded inside adminRouter so it covers both
// /admin/* and the /api/v1/admin/* alias registered in rootRouter.
app.use(publicAuditMiddleware);

app.use('/api/v1', rootRouter);       // versioned API — includes /api/v1/admin/*
app.use("/admin",  adminRouter);      // unversioned alias — dev proxy + direct access
app.use("/auth",                      authRouter);
app.use("/wallet",                    walletRouter);
app.use("/transactions",              transactionRouter);
app.use("/services",                  catalogRouter);
app.use("/notifications",             notificationsRouter);
app.use("/webhooks",                  webhookRouter);
app.use("/public",                    publicRouter);
app.use("/security/transaction-pin",  transactionPinRouter);

// ── 7. 404 handler ───────────────────────────────────────────────────────────
// Must come AFTER all routes so it only fires if nothing else matched.
app.use(notFoundHandler);

// ── 8. Error handler ──────────────────────────────────────────────────────────
// Must be the LAST middleware registered.
// Express identifies error handlers by their 4-parameter signature.
app.use(errorHandler);

