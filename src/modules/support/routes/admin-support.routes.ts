import { Router } from "express";
import { authenticate }    from "../../auth/middleware/authenticate";
import { requireRole }     from "../../auth/middleware/authorize";
import { adminRateLimiter } from "../../../middleware/rateLimiter.redis";
import {
  listTicketsController,
  getTicketController,
  createTicketController,
  updateTicketController,
  addMessageController,
} from "../controllers/admin-support.controller";
import {
  listDisputesController,
  createDisputeController,
  updateDisputeController,
} from "../controllers/admin-dispute.controller";

const router     = Router();
const adminGuard = [authenticate, requireRole("admin", "super_admin")] as const;

// ── Support Tickets ───────────────────────────────────────────────────────────
router.get(  "/support/tickets",              ...adminGuard, adminRateLimiter, listTicketsController);
router.post( "/support/tickets",              ...adminGuard, adminRateLimiter, createTicketController);
router.get(  "/support/tickets/:id",          ...adminGuard, adminRateLimiter, getTicketController);
router.patch("/support/tickets/:id",          ...adminGuard, adminRateLimiter, updateTicketController);
router.post( "/support/tickets/:id/messages", ...adminGuard, adminRateLimiter, addMessageController);

// ── Disputes ──────────────────────────────────────────────────────────────────
router.get(  "/disputes",     ...adminGuard, adminRateLimiter, listDisputesController);
router.post( "/disputes",     ...adminGuard, adminRateLimiter, createDisputeController);
router.patch("/disputes/:id", ...adminGuard, adminRateLimiter, updateDisputeController);

export { router as adminSupportRouter };
