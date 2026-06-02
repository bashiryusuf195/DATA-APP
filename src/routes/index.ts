// src/routes/index.ts
//
// Master router — mounts every sub-router under /api/v1.
// All public routes are available at both their direct paths (e.g. /auth/login)
// and their versioned aliases (e.g. /api/v1/auth/login).
// Admin routes live at /api/v1/admin/* via adminRouter (also at /admin/* in app.ts).

import { Router } from 'express';
import { healthRouter }          from './health.routes';
import { authRouter }            from '../modules/auth/routes/auth.routes';
import { walletRouter }          from '../modules/wallet/routes/wallet.routes';
import { transactionRouter }     from '../modules/transactions/routes/transaction.routes';
import { catalogRouter }         from '../modules/catalog/routes/catalog.routes';
import { notificationsRouter }   from '../modules/notifications/routes/notifications.routes';
import { webhookRouter }         from '../modules/webhooks/routes/webhook.routes';
import { userReferralRouter }    from '../modules/referral/routes/user-referral.routes';
import { announcementRouter }    from '../modules/announcements/routes/announcement.routes';
import { customerKycRouter }     from '../modules/compliance/routes/customer-kyc.routes';
import { adminRouter }           from './admin.routes';
import { publicRouter }          from '../modules/public/routes/public.routes';
import { transactionPinRouter }  from '../modules/security/routes/transaction-pin.routes';

export const rootRouter = Router();

rootRouter.use('/health',                    healthRouter);
rootRouter.use('/auth',                      authRouter);
rootRouter.use('/wallet',                    walletRouter);
rootRouter.use('/transactions',              transactionRouter);
rootRouter.use('/services',                  catalogRouter);
rootRouter.use('/notifications',             notificationsRouter);
rootRouter.use('/webhooks',                  webhookRouter);
rootRouter.use('/referrals',                 userReferralRouter);
rootRouter.use('/announcements',             announcementRouter);
rootRouter.use('/kyc',                       customerKycRouter);
rootRouter.use('/admin',                     adminRouter);
rootRouter.use('/public',                    publicRouter);
rootRouter.use('/security/transaction-pin',  transactionPinRouter);
