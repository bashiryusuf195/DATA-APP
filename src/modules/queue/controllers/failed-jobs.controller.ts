import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { getFailedJobs, retryFailedJob } from "../services/failed-job.service";

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  queue_name: z.string().min(1).optional(),
});

export async function retryFailedJobController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params as { id: string };
    const result = await retryFailedJob(id);
    res.status(200).json({
      success: true,
      data:    { queued_job_id: result.job_id },
      message: "Job re-queued successfully.",
    });
  } catch (err) {
    next(err);
  }
}

export async function listFailedJobsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const query = QuerySchema.parse(req.query);
    const jobs = await getFailedJobs(query);
    res.status(200).json({
      success: true,
      data: jobs,
      meta: { limit: query.limit, offset: query.offset },
    });
  } catch (err) {
    next(err);
  }
}
