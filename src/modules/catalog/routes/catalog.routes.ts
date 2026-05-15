import { Router } from "express";
import {
  listServicesController,
  listServicePlansController,
} from "../controllers/catalog.controller";

const router = Router();

router.get("/", listServicesController);
router.get("/:serviceType/plans", listServicePlansController);

export { router as catalogRouter };
