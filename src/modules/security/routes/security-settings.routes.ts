import { Router } from "express";
import { authenticate } from "../../auth/middleware/authenticate";
import {
  getSecuritySettingsController,
  updateSecuritySettingsController,
} from "../controllers/security-settings.controller";

const router = Router();

router.use(authenticate);
router.get("/",  getSecuritySettingsController);
router.put("/",  updateSecuritySettingsController);

export { router as securitySettingsRouter };
