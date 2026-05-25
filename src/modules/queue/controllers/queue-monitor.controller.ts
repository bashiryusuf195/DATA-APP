import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { logger } from "../../../lib/logger";
import {
  getAllQueueStats,
  getQueueJobs,
  retryQueueJob,
  removeQueueJob,
  clearCompletedJobs,
  type JobState,
} from "../services/queue-monitor.service";

const JobStateSchema = z.enum(["waiting", "active", "completed", "failed", "delayed"]);

const PaginationSchema = z.object({
  page:  z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  state: JobStateSchema.default("failed"),
});

// ── GET /admin/queue-monitor ──────────────────────────────────────────────────

export async function getQueueStatsController(
  req:  Request,
  res:  Response,
  next: NextFunction,
): Promise<void> {
  try {
    const stats = await getAllQueueStats();
    logger.info("queue_monitor_viewed", {
      admin_id:    (req as Request & { user?: { id: string } }).user?.id,
      queue_count: stats.length,
    });
    res.json({ success: true, data: stats });
  } catch (err) {
    next(err);
  }
}

// ── GET /admin/queue-monitor/:queueName/jobs ──────────────────────────────────

export async function getQueueJobsController(
  req:  Request,
  res:  Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { queueName } = req.params as { queueName: string };
    const { page, limit, state } = PaginationSchema.parse(req.query);

    const result = await getQueueJobs(queueName, state as JobState, page, limit);

    res.json({
      success: true,
      data:    result.items,
      meta:    { page, limit, total: result.total },
    });
  } catch (err) {
    next(err);
  }
}

// ── POST /admin/queue-monitor/:queueName/jobs/:jobId/retry ────────────────────

export async function retryQueueJobController(
  req:  Request,
  res:  Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { queueName, jobId } = req.params as { queueName: string; jobId: string };
    await retryQueueJob(queueName, jobId);

    logger.info("queue_job_retried", {
      admin_id:  (req as Request & { user?: { id: string } }).user?.id,
      queue:     queueName,
      job_id:    jobId,
    });

    res.json({ success: true, message: `Job '${jobId}' re-queued in '${queueName}'` });
  } catch (err) {
    next(err);
  }
}

// ── DELETE /admin/queue-monitor/:queueName/jobs/:jobId ────────────────────────

export async function removeQueueJobController(
  req:  Request,
  res:  Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { queueName, jobId } = req.params as { queueName: string; jobId: string };
    await removeQueueJob(queueName, jobId);

    logger.info("queue_job_removed", {
      admin_id:  (req as Request & { user?: { id: string } }).user?.id,
      queue:     queueName,
      job_id:    jobId,
    });

    res.json({ success: true, message: `Job '${jobId}' removed from '${queueName}'` });
  } catch (err) {
    next(err);
  }
}

// ── POST /admin/queue-monitor/:queueName/clear-completed ─────────────────────

export async function clearCompletedController(
  req:  Request,
  res:  Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { queueName } = req.params as { queueName: string };
    const removed = await clearCompletedJobs(queueName);

    logger.info("queue_completed_cleared", {
      admin_id: (req as Request & { user?: { id: string } }).user?.id,
      queue:    queueName,
      removed,
    });

    res.json({ success: true, message: `Cleared ${removed} completed jobs from '${queueName}'`, data: { removed } });
  } catch (err) {
    next(err);
  }
}
