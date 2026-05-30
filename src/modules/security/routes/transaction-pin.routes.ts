import { Router } from "express";
import { authenticate }   from "../../auth/middleware/authenticate";
import { pinRateLimiter } from "../../../middleware/rateLimiter.redis";
import {
  pinStatusController,
  setupPinController,
  verifyPinController,
  changePinController,
  resetPinRequestController,
  resetPinConfirmController,
  removePinController,
} from "../controllers/transaction-pin.controller";

const router = Router();

// All PIN endpoints require authentication.
router.use(authenticate);

router.get(    "/",              pinStatusController);
router.post(   "/setup",         pinRateLimiter, setupPinController);
router.post(   "/verify",        pinRateLimiter, verifyPinController);
router.post(   "/change",        pinRateLimiter, changePinController);
router.post(   "/reset/request", pinRateLimiter, resetPinRequestController);
router.post(   "/reset/confirm", pinRateLimiter, resetPinConfirmController);
router.delete( "/",              pinRateLimiter, removePinController);

export { router as transactionPinRouter };
