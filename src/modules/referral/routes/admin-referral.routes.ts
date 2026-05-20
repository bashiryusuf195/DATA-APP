import { Router } from "express";
import { authenticate }  from "../../auth/middleware/authenticate";
import { requireRole }   from "../../auth/middleware/authorize";
import {
  getSettingsController,
  updateSettingsController,
  getSummaryController,
  listRewardsController,
} from "../controllers/admin-referral.controller";

export const adminReferralRouter = Router();

adminReferralRouter.use(authenticate, requireRole("admin", "super_admin"));

adminReferralRouter.get( "/referrals/settings", getSettingsController);
adminReferralRouter.patch("/referrals/settings", updateSettingsController);
adminReferralRouter.get( "/referrals/summary",  getSummaryController);
adminReferralRouter.get( "/referrals/rewards",  listRewardsController);
