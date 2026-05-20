import { Router } from "express";
import { authenticate } from "../../../middleware/auth";
import { requireRole } from "../../auth/middleware/authorize";
import { adminRateLimiter } from "../../../middleware/rateLimiter.redis";
import {
  listPaymentGatewaysController,
  getPaymentGatewayController,
  createPaymentGatewayController,
  updatePaymentGatewayController,
  setDefaultGatewayController,
  enableGatewayController,
  disableGatewayController,
} from "../controllers/admin-payment-gateways.controller";

const router = Router();
const guard = [authenticate, requireRole("admin", "super_admin"), adminRateLimiter];

router.get   ("/payment-gateways",                  ...guard, listPaymentGatewaysController);
router.post  ("/payment-gateways",                  ...guard, createPaymentGatewayController);
router.get   ("/payment-gateways/:id",              ...guard, getPaymentGatewayController);
router.patch ("/payment-gateways/:id",              ...guard, updatePaymentGatewayController);
router.post  ("/payment-gateways/:id/set-default",  ...guard, setDefaultGatewayController);
router.post  ("/payment-gateways/:id/enable",       ...guard, enableGatewayController);
router.post  ("/payment-gateways/:id/disable",      ...guard, disableGatewayController);

export { router as adminPaymentGatewaysRouter };
