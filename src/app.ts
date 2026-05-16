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
import { adminCatalogRouter } from "./modules/catalog/routes/admin-catalog.routes";
import { adminQueueRouter } from "./modules/queue/routes/admin-queue.routes";
import { webhookRouter } from "./modules/webhooks/routes/webhook.routes";
import { adminWebhookRouter } from "./modules/webhooks/routes/admin-webhook.routes";
import { adminReconciliationRouter } from "./modules/reconciliation/routes/admin-reconciliation.routes";
import { notificationsRouter }       from "./modules/notifications/routes/notifications.routes";
import { adminNotificationsRouter }  from "./modules/notifications/routes/admin-notifications.routes";
import { adminProvidersRouter }      from "./modules/providers/routes/admin-providers.routes";
import { adminRoutingRulesRouter }   from "./modules/providers/routes/admin-routing-rules.routes";
import "./modules/queue";
export const app = express();

// ── 1. Security headers ───────────────────────────────────────────────────────
// Sets X-Frame-Options, X-XSS-Protection, Strict-Transport-Security, etc.
app.use(helmet());

// ── 2. CORS ───────────────────────────────────────────────────────────────────
// Only allows requests from the origins listed in CORS_ORIGINS.
app.use(cors({
  origin:         config.corsOrigins,
  credentials:    true,
  methods:        ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
}));

// ── 3. Body parsing ───────────────────────────────────────────────────────────
// Parse JSON request bodies. Limit to 1 MB to block oversized payloads.
app.use(express.json({ limit: '1mb' }));

// ── 4. Request logger ─────────────────────────────────────────────────────────
app.use(requestLogger);

// ── 5. Rate limiter ───────────────────────────────────────────────────────────
app.use(standardLimiter);

// ── 6. Routes ─────────────────────────────────────────────────────────────────
app.use('/api/v1', rootRouter);
app.use("/auth", authRouter);
app.use("/wallet", walletRouter);
app.use("/transactions", transactionRouter);
app.use("/services", catalogRouter);
app.use("/admin", adminCatalogRouter);
app.use("/admin", adminQueueRouter);
app.use("/admin", adminWebhookRouter);
app.use("/admin", adminReconciliationRouter);
app.use("/admin", adminNotificationsRouter);
app.use("/admin", adminProvidersRouter);
app.use("/admin", adminRoutingRulesRouter);
app.use("/notifications", notificationsRouter);
app.use("/webhooks", webhookRouter);

// ── 7. 404 handler ───────────────────────────────────────────────────────────
// Must come AFTER all routes so it only fires if nothing else matched.
app.use(notFoundHandler);

// ── 8. Error handler ──────────────────────────────────────────────────────────
// Must be the LAST middleware registered.
// Express identifies error handlers by their 4-parameter signature.
app.use(errorHandler);
// ── 6. Routes ─────────────────────────────────────────────────────────────────

