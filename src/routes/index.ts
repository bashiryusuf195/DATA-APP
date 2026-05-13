// src/routes/index.ts
//
// Master router — mounts every sub-router under /api/v1.
// app.ts imports and uses this single file.
//
// Current routes (skeleton — business logic added in later phases):
//   /api/v1/health          health + readiness checks (public)
//
// Planned routes (uncomment as each module is implemented):
//   /api/v1/auth            registration, PIN, profile
//   /api/v1/services        service catalog (public)
//   /api/v1/wallet          balance, ledger
//   /api/v1/transactions    create + view transactions
//   /api/v1/payment         fund wallet
//   /api/v1/webhooks        payment gateway callbacks
//   /api/v1/admin           admin operations

import { Router }       from 'express';
import { healthRouter } from './health.routes';

export const rootRouter = Router();

// ── Mounted routes ────────────────────────────────────────────────────────────
rootRouter.use('/health', healthRouter);

// Future modules are registered here as they are built:
// rootRouter.use('/auth',         authRouter);
// rootRouter.use('/services',     servicesRouter);
// rootRouter.use('/wallet',       walletRouter);
// rootRouter.use('/transactions', transactionsRouter);
// rootRouter.use('/payment',      paymentRouter);
// rootRouter.use('/webhooks',     webhooksRouter);
// rootRouter.use('/admin',        adminRouter);
