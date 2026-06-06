import { Router } from "express";
import { getPublishedPageController } from "../controllers/cms.controller";

const router = Router();

router.get("/:slug", getPublishedPageController);

export { router as cmsRouter };
