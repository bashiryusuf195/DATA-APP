import { Router } from "express";

import { authenticate } from "../../auth/middleware/authenticate";
import { purchaseAirtimeController } from "../controllers/purchase.controller";

const router = Router();

router.post(
  "/airtime",
  authenticate,
  purchaseAirtimeController
);

export { router as transactionRouter };