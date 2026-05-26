// src/routes/admin.routes.ts
//
// Aggregates every admin sub-router into one Router so it can be mounted at
// multiple path prefixes without duplicating individual route files:
//
//   app.use("/admin",        adminRouter)  →  /admin/*            (dev proxy + Railway direct)
//   rootRouter.use("/admin", adminRouter)  →  /api/v1/admin/*     (deployed frontend via VITE_API_BASE_URL)

import { Router }               from "express";
import { adminAuditMiddleware } from "../middleware/adminAudit";

// ── Sub-routers ───────────────────────────────────────────────────────────────
import { adminDashboardRouter }        from "../modules/dashboard/routes/admin-dashboard.routes";
import { adminCatalogRouter }          from "../modules/catalog/routes/admin-catalog.routes";
import { adminAvailabilityRouter }     from "../modules/catalog/routes/admin-availability.routes";
import { adminQueueRouter }            from "../modules/queue/routes/admin-queue.routes";
import { adminWebhookRouter }          from "../modules/webhooks/routes/admin-webhook.routes";
import { adminReconciliationRouter }   from "../modules/reconciliation/routes/admin-reconciliation.routes";
import { adminNotificationsRouter }    from "../modules/notifications/routes/admin-notifications.routes";
import { adminProvidersRouter }        from "../modules/providers/routes/admin-providers.routes";
import { adminProviderWalletsRouter }  from "../modules/providers/routes/admin-provider-wallets.routes";
import { adminRoutingRulesRouter }     from "../modules/providers/routes/admin-routing-rules.routes";
import { adminProviderAttemptsRouter } from "../modules/providers/routes/admin-provider-attempts.routes";
import { adminHealthMetricsRouter }    from "../modules/providers/routes/admin-health-metrics.routes";
import { adminWalletRouter }           from "../modules/wallet/routes/admin-wallet.routes";
import { adminWalletOpsRouter }        from "../modules/wallet/routes/admin-wallet-ops.routes";
import { adminUsersRouter }            from "../modules/auth/routes/admin-users.routes";
import { adminAuditRouter }            from "../modules/audit/routes/admin-audit.routes";
import { adminRolesRouter }            from "../modules/auth/routes/admin-roles.routes";
import { adminSettingsRouter }         from "../modules/settings/routes/admin-settings.routes";
import { adminSupportRouter }          from "../modules/support/routes/admin-support.routes";
import { adminFinanceRouter }          from "../modules/finance/routes/admin-finance.routes";
import { adminComplianceRouter }       from "../modules/compliance/routes/admin-compliance.routes";
import { adminPaymentGatewaysRouter }  from "../modules/payment-gateways/routes/admin-payment-gateways.routes";
import { adminSystemHealthRouter }     from "../modules/system/routes/admin-system-health.routes";
import { adminBackupRouter }           from "../modules/backup/routes/admin-backup.routes";
import { adminIntegrityRouter }        from "../modules/backup/routes/admin-integrity.routes";
import { adminReferralRouter }         from "../modules/referral/routes/admin-referral.routes";
import { adminTransactionsRouter }     from "../modules/transactions/routes/admin-transactions.routes";

const router = Router();

// Audit middleware — listens on res.on("finish") for every mutating admin
// request.  Must be registered before sub-routers so the finish listener is
// set up before any handler sends a response.
router.use(adminAuditMiddleware);

// ── Route groups ──────────────────────────────────────────────────────────────
router.use("/", adminDashboardRouter);
router.use("/", adminCatalogRouter);
router.use("/", adminAvailabilityRouter);
router.use("/", adminQueueRouter);
router.use("/", adminWebhookRouter);
router.use("/", adminReconciliationRouter);
router.use("/", adminNotificationsRouter);
router.use("/", adminProvidersRouter);
router.use("/", adminProviderWalletsRouter);
router.use("/", adminRoutingRulesRouter);
router.use("/", adminProviderAttemptsRouter);
router.use("/", adminHealthMetricsRouter);
router.use("/", adminWalletRouter);
router.use("/", adminWalletOpsRouter);
router.use("/", adminUsersRouter);
router.use("/", adminAuditRouter);
router.use("/", adminRolesRouter);
router.use("/", adminSettingsRouter);
router.use("/", adminSupportRouter);
router.use("/", adminFinanceRouter);
router.use("/", adminComplianceRouter);
router.use("/", adminPaymentGatewaysRouter);
router.use("/", adminSystemHealthRouter);
router.use("/", adminBackupRouter);
router.use("/", adminIntegrityRouter);
router.use("/", adminReferralRouter);
router.use("/", adminTransactionsRouter);

export { router as adminRouter };
