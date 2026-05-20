import { Router } from "express";
import { authenticate } from "../../auth/middleware/authenticate";
import {
  getKycStatusController,
  submitNinController,
  submitBvnController,
} from "../controllers/customer-kyc.controller";

const router = Router();

router.get(  "/status",     authenticate, getKycStatusController);
router.post( "/submit-nin", authenticate, submitNinController);
router.post( "/submit-bvn", authenticate, submitBvnController);

export { router as customerKycRouter };
