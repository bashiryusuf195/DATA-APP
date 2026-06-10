import { Router } from "express";
import { authenticate } from "../../auth/middleware/authenticate";
import {
  getMyReferralsController,
  getPublicReferralSettingsController,
} from "../controllers/user-referral.controller";

export const userReferralRouter = Router();

userReferralRouter.get("/public-settings", getPublicReferralSettingsController);
userReferralRouter.get("/me", authenticate, getMyReferralsController);
