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
import { adminAvailabilityRouter } from "./modules/catalog/routes/admin-availability.routes";
import { adminQueueRouter } from "./modules/queue/routes/admin-queue.routes";
import { webhookRouter } from "./modules/webhooks/routes/webhook.routes";
import { adminWebhookRouter } from "./modules/webhooks/routes/admin-webhook.routes";
import { adminReconciliationRouter } from "./modules/reconciliation/routes/admin-reconciliation.routes";
import { notificationsRouter }       from "./modules/notifications/routes/notifications.routes";
import { adminNotificationsRouter }  from "./modules/notifications/routes/admin-notifications.routes";
import { adminProvidersRouter }        from "./modules/providers/routes/admin-providers.routes";
import { adminProviderWalletsRouter }  from "./modules/providers/routes/admin-provider-wallets.routes";
import { adminRoutingRulesRouter }     from "./modules/providers/routes/admin-routing-rules.routes";
import { adminProviderAttemptsRouter } from "./modules/providers/routes/admin-provider-attempts.routes";
import { adminHealthMetricsRouter }    from "./modules/providers/routes/admin-health-metrics.routes";
import { adminWalletRouter }           from "./modules/wallet/routes/admin-wallet.routes";
import { adminWalletOpsRouter }        from "./modules/wallet/routes/admin-wallet-ops.routes";
import { adminUsersRouter }            from "./modules/auth/routes/admin-users.routes";
import { adminAuditRouter }            from "./modules/audit/routes/admin-audit.routes";
import { adminRolesRouter }            from "./modules/auth/routes/admin-roles.routes";
import { adminSettingsRouter }         from "./modules/settings/routes/admin-settings.routes";
import { adminDashboardRouter }        from "./modules/dashboard/routes/admin-dashboard.routes";
import { adminSupportRouter }          from "./modules/support/routes/admin-support.routes";
import { adminFinanceRouter }          from "./modules/finance/routes/admin-finance.routes";
import { adminComplianceRouter }       from "./modules/compliance/routes/admin-compliance.routes";
import { adminPaymentGatewaysRouter }  from "./modules/payment-gateways/routes/admin-payment-gateways.routes";
import { adminSystemHealthRouter }     from "./modules/system/routes/admin-system-health.routes";
import { adminBackupRouter }           from "./modules/backup/routes/admin-backup.routes";
import { adminIntegrityRouter }        from "./modules/backup/routes/admin-integrity.routes";
import { adminReferralRouter }         from "./modules/referral/routes/admin-referral.routes";
import { adminTransactionsRouter }     from "./modules/transactions/routes/admin-transactions.routes";
import { adminAuditMiddleware }        from "./middleware/adminAudit";
import { publicAuditMiddleware }       from "./middleware/publicAudit";
import { publicRouter }               from "./modules/public/routes/public.routes";
import "./modules/queue";
export const app = express();

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
// Audit middlewares fire on res.on("finish") — register before routes so every
// request passes through before dispatch.
app.use(publicAuditMiddleware);
app.use('/admin', adminAuditMiddleware);

app.use('/api/v1', rootRouter);
app.use("/auth", authRouter);
app.use("/wallet", walletRouter);
app.use("/transactions", transactionRouter);
app.use("/services", catalogRouter);
app.use("/admin", adminDashboardRouter);
app.use("/admin", adminCatalogRouter);
app.use("/admin", adminAvailabilityRouter);
app.use("/admin", adminQueueRouter);
app.use("/admin", adminWebhookRouter);
app.use("/admin", adminReconciliationRouter);
app.use("/admin", adminNotificationsRouter);
app.use("/admin", adminProvidersRouter);
app.use("/admin", adminProviderWalletsRouter);
app.use("/admin", adminRoutingRulesRouter);
app.use("/admin", adminProviderAttemptsRouter);
app.use("/admin", adminHealthMetricsRouter);
app.use("/admin", adminWalletRouter);
app.use("/admin", adminWalletOpsRouter);
app.use("/admin", adminUsersRouter);
app.use("/admin", adminRolesRouter);
app.use("/admin", adminSettingsRouter);
app.use("/admin", adminSupportRouter);
app.use("/admin", adminFinanceRouter);
app.use("/admin", adminComplianceRouter);
app.use("/admin", adminPaymentGatewaysRouter);
app.use("/admin", adminAuditRouter);
app.use("/admin", adminReferralRouter);
app.use("/admin", adminTransactionsRouter);
app.use("/admin", adminSystemHealthRouter);
app.use("/admin", adminBackupRouter);
app.use("/admin", adminIntegrityRouter);
app.use("/notifications", notificationsRouter);
app.use("/webhooks", webhookRouter);
app.use("/public", publicRouter);

// ── 7. 404 handler ───────────────────────────────────────────────────────────
// Must come AFTER all routes so it only fires if nothing else matched.
app.use(notFoundHandler);

// ── 8. Error handler ──────────────────────────────────────────────────────────
// Must be the LAST middleware registered.
// Express identifies error handlers by their 4-parameter signature.
app.use(errorHandler);

