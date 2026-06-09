import { Router } from "express";
import { authenticate } from "../../auth/middleware/authenticate";
import { getServiceStatusController } from "../controllers/service-status.controller";

const router = Router();

router.get("/", authenticate, getServiceStatusController);

export { router as serviceStatusRouter };
