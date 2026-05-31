import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import {
  getAdminNotificationLog,
  createNotificationJob,
  listNotificationJobs,
  retryNotificationJob,
  deleteNotificationJob,
} from "../services/notification-job.service";
import {
  listTemplates,
  createTemplate,
  updateTemplate,
  getTemplate,
  renderTemplate,
} from "../services/template.service";
import { AppError } from "../../../shared/errors/AppError";

// ── Schemas ──────────────────────────────────────────────────────────────────

const NotifLogQuerySchema = z.object({
  channel: z.enum(["email", "sms", "in_app", "push", "webhook"]).optional(),
  type:    z.string().optional(),
  status:  z.enum(["pending", "sent", "failed", "read"]).optional(),
  user_id: z.string().uuid().optional(),
  from:    z.string().optional(),
  to:      z.string().optional(),
  page:    z.coerce.number().int().min(1).default(1),
  limit:   z.coerce.number().int().min(1).max(100).default(25),
});

const JobQuerySchema = z.object({
  status:            z.string().optional(),
  type:              z.string().optional(),
  notification_type: z.string().optional(),
  recipient_type:    z.string().optional(),
  search:            z.string().optional(),
  from:              z.string().optional(),
  to:                z.string().optional(),
  page:              z.coerce.number().int().min(1).default(1),
  limit:             z.coerce.number().int().min(1).max(100).default(25),
});

const SendSchema = z.object({
  type:              z.enum(["email", "sms", "push", "in_app", "broadcast"]),
  notification_type: z.string().min(1),
  recipient_type:    z.enum(["user", "all", "segment"]).default("user"),
  recipient_id:      z.string().uuid().optional(),
  recipient_email:   z.string().email().optional(),
  recipient_phone:   z.string().optional(),
  subject:           z.string().optional(),
  body:              z.string().min(1),
  template_id:       z.string().uuid().optional(),
  variables:         z.record(z.string()).optional(),
  scheduled_at:      z.string().datetime().optional(),
  metadata:          z.record(z.unknown()).optional(),
  idempotency_key:   z.string().optional(),
});

const TemplateQuerySchema = z.object({
  type:              z.string().optional(),
  notification_type: z.string().optional(),
  is_active:         z.enum(["true", "false"]).transform((v) => v === "true").optional(),
  search:            z.string().optional(),
  page:              z.coerce.number().int().min(1).default(1),
  limit:             z.coerce.number().int().min(1).max(100).default(25),
});

const CreateTemplateSchema = z.object({
  name:              z.string().min(1).max(100),
  type:              z.enum(["email", "sms", "push", "in_app"]),
  notification_type: z.string().min(1),
  subject:           z.string().max(255).optional().nullable(),
  body:              z.string().min(1),
  variables:         z.array(z.string()).optional(),
  is_active:         z.boolean().optional(),
});

const UpdateTemplateSchema = CreateTemplateSchema.partial();

// ── Controllers ──────────────────────────────────────────────────────────────

export async function listAdminNotificationsController(
  req: Request, res: Response, next: NextFunction
): Promise<void> {
  try {
    const q      = NotifLogQuerySchema.parse(req.query);
    const result = await getAdminNotificationLog(q);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
}

export async function sendNotificationController(
  req: Request, res: Response, next: NextFunction
): Promise<void> {
  try {
    const body   = SendSchema.parse(req.body);
    const userId = (req as Request & { user?: { id: string } }).user?.id;

    // Validate: targeted notifications need a recipient
    if (body.recipient_type === "user" && !body.recipient_id && !body.recipient_email) {
      throw new AppError(400, "MISSING_RECIPIENT", "Targeted notifications require recipient_id or recipient_email");
    }

    // Resolve body from template if template_id provided
    let finalBody    = body.body;
    let finalSubject = body.subject;
    if (body.template_id) {
      const tmpl = await getTemplate(body.template_id);
      finalBody    = renderTemplate(tmpl.body, body.variables ?? {});
      finalSubject = finalSubject ?? (tmpl.subject ? renderTemplate(tmpl.subject, body.variables ?? {}) : undefined);
    }

    const job = await createNotificationJob({
      type:              body.type,
      notification_type: body.notification_type,
      recipient_type:    body.recipient_type,
      recipient_id:      body.recipient_id,
      recipient_email:   body.recipient_email,
      recipient_phone:   body.recipient_phone,
      subject:           finalSubject,
      body:              finalBody,
      template_id:       body.template_id,
      scheduled_at:      body.scheduled_at,
      metadata:          body.metadata,
      idempotency_key:   body.idempotency_key,
      created_by:        userId,
    });

    res.status(201).json({ success: true, data: job });
  } catch (err) { next(err); }
}

export async function listNotificationJobsController(
  req: Request, res: Response, next: NextFunction
): Promise<void> {
  try {
    const q      = JobQuerySchema.parse(req.query);
    const result = await listNotificationJobs(q);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
}

export async function retryNotificationJobController(
  req: Request, res: Response, next: NextFunction
): Promise<void> {
  try {
    const { jobId } = req.params;
    if (!jobId) throw new AppError(400, "MISSING_PARAM", "jobId is required");
    const job = await retryNotificationJob(jobId);
    res.json({ success: true, data: job });
  } catch (err) { next(err); }
}

export async function deleteNotificationJobController(
  req: Request, res: Response, next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) throw new AppError(400, "MISSING_PARAM", "id is required");
    await deleteNotificationJob(id);
    res.status(204).end();
  } catch (err) { next(err); }
}

export async function listTemplatesController(
  req: Request, res: Response, next: NextFunction
): Promise<void> {
  try {
    const q      = TemplateQuerySchema.parse(req.query);
    const result = await listTemplates(q);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
}

export async function createTemplateController(
  req: Request, res: Response, next: NextFunction
): Promise<void> {
  try {
    const body   = CreateTemplateSchema.parse(req.body);
    const userId = (req as Request & { user?: { id: string } }).user?.id;
    const tmpl   = await createTemplate({ ...body, created_by: userId });
    res.status(201).json({ success: true, data: tmpl });
  } catch (err) { next(err); }
}

export async function updateTemplateController(
  req: Request, res: Response, next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) throw new AppError(400, "MISSING_PARAM", "id is required");
    const body = UpdateTemplateSchema.parse(req.body);
    const tmpl = await updateTemplate(id, body);
    res.json({ success: true, data: tmpl });
  } catch (err) { next(err); }
}
