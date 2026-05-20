import { Router } from "express";
import { authenticate } from "../../auth/middleware/authenticate";
import { getMyReferralsController } from "../controllers/user-referral.controller";

export const userReferralRouter = Router();

userReferralRouter.get("/me", authenticate, getMyReferralsController);
