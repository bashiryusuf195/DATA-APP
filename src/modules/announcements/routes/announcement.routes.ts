import { Router } from "express";
import { authenticate } from "../../auth/middleware/authenticate";
import { getActiveAnnouncementsController } from "../controllers/announcement.controller";

const router = Router();

router.get("/active", authenticate, getActiveAnnouncementsController);

export { router as announcementRouter };
