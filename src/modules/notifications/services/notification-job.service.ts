import { randomUUID } from "crypto";
import { getDbInstance } from "../../../db/knex";
import { AppError } from "../../../shared/errors/AppError";
import { notificationQueue, enqueue, defaultJobOptions } from "../../../config/queues";

const db = getDbInstance();

export interface NotificationJob {
  id: string;
  type: string;
  notification_type: string;
  recipient_type: string;
  recipient_id: string | null;
  recipient_email: string | null;
  recipient_phone: string | null;
  recipient_user_email: string | null;
  recipient_name: string | null;
  subject: string | null;
  body: string;
  status: string;
  retry_count: number;
  max_retries: number;
  scheduled_at: Date | null;
  processed_at: Date | null;
  failed_at: Date | null;
  failure_reason: string | null;
  template_id: string | null;
  metadata: Record<string, unknown>;
  idempotency_key: string | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface JobStats {
  pending:    number;
  processing: number;
  sent:       number;
  failed:     number;
  cancelled:  number;
}

export async function listNotificationJobs(filters: {
  status?:            string;
  type?:              string;
  notification_type?: string;
  recipient_type?:    string;
  search?:            string;
  from?:              string;
  to?:                string;
  page?:              number;
  limit?:             number;
}) {
  const page   = Math.max(1, filters.page  ?? 1);
  const limit  = Math.min(100, Math.max(1, filters.limit ?? 25));
  const offset = (page - 1) * limit;

  const base = db("notification_jobs as j")
    .leftJoin("users as u", "u.id", "j.recipient_id")
    .modify((q) => {
      if (filters.status)            q.where("j.status", filters.status);
      if (filters.type)              q.where("j.type", filters.type);
      if (filters.notification_type) q.where("j.notification_type", filters.notification_type);
      if (filters.recipient_type)    q.where("j.recipient_type", filters.recipient_type);
      if (filters.from)              q.where("j.created_at", ">=", new Date(filters.from));
      if (filters.to)                q.where("j.created_at", "<=", new Date(filters.to));
      if (filters.search) {
        const term = `%${filters.search}%`;
        q.where(function () {
          this.whereRaw("j.recipient_email ILIKE ?", [term])
            .orWhereRaw("u.email ILIKE ?",           [term])
            .orWhereRaw("j.subject ILIKE ?",          [term])
            .orWhereRaw("j.notification_type ILIKE ?", [term]);
        });
      }
    });

  const [{ count }] = await base.clone().count<{ count: string }[]>("j.id as count");

  const statsRow = await db("notification_jobs")
    .select(
      db.raw("COUNT(*) FILTER (WHERE status = 'pending')::int    AS pending"),
      db.raw("COUNT(*) FILTER (WHERE status = 'processing')::int AS processing"),
      db.raw("COUNT(*) FILTER (WHERE status = 'sent')::int       AS sent"),
      db.raw("COUNT(*) FILTER (WHERE status = 'failed')::int     AS failed"),
      db.raw("COUNT(*) FILTER (WHERE status = 'cancelled')::int  AS cancelled"),
    )
    .first();

  const rows = await base
    .clone()
    .leftJoin("user_profiles as p", "p.user_id", "j.recipient_id")
    .orderBy("j.created_at", "desc")
    .limit(limit)
    .offset(offset)
    .select(
      "j.*",
      db.raw("u.email AS recipient_user_email"),
      db.raw(
        "COALESCE(NULLIF(TRIM(COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,'')), ''), u.email) AS recipient_name",
      ),
    );

  const stats: JobStats = {
    pending:    Number((statsRow as Record<string, unknown>)?.pending    ?? 0),
    processing: Number((statsRow as Record<string, unknown>)?.processing ?? 0),
    sent:       Number((statsRow as Record<string, unknown>)?.sent       ?? 0),
    failed:     Number((statsRow as Record<string, unknown>)?.failed     ?? 0),
    cancelled:  Number((statsRow as Record<string, unknown>)?.cancelled  ?? 0),
  };

  return { data: rows as NotificationJob[], total: parseInt(count, 10), page, limit, stats };
}

export async function createNotificationJob(input: {
  type:               string;
  notification_type:  string;
  recipient_type:     string;
  recipient_id?:      string;
  recipient_email?:   string;
  recipient_phone?:   string;
  subject?:           string;
  body:               string;
  template_id?:       string;
  scheduled_at?:      string;
  metadata?:          Record<string, unknown>;
  idempotency_key?:   string;
  created_by?:        string;
}): Promise<NotificationJob> {
  // Idempotency guard
  if (input.idempotency_key) {
    const existing = await db("notification_jobs")
      .where("idempotency_key", input.idempotency_key)
      .first();
    if (existing) return existing as NotificationJob;
  }

  const id    = randomUUID();
  const delay = input.scheduled_at
    ? Math.max(0, new Date(input.scheduled_at).getTime() - Date.now())
    : 0;

  const [job] = await db("notification_jobs")
    .insert({
      id,
      type:               input.type,
      notification_type:  input.notification_type,
      recipient_type:     input.recipient_type,
      recipient_id:       input.recipient_id   ?? null,
      recipient_email:    input.recipient_email ?? null,
      recipient_phone:    input.recipient_phone ?? null,
      subject:            input.subject         ?? null,
      body:               input.body,
      status:             "pending",
      template_id:        input.template_id     ?? null,
      scheduled_at:       input.scheduled_at ? new Date(input.scheduled_at) : null,
      metadata:           JSON.stringify(input.metadata ?? {}),
      idempotency_key:    input.idempotency_key ?? null,
      created_by:         input.created_by      ?? null,
    })
    .returning("*");

  try {
    if (delay > 0) {
      await notificationQueue.add(
        "send-notification",
        { jobId: id, type: input.type, notification_type: input.notification_type },
        { ...defaultJobOptions, delay },
      );
    } else {
      await enqueue(notificationQueue, "send-notification", {
        jobId: id, type: input.type, notification_type: input.notification_type,
      });
    }
  } catch {
    // Redis unavailable — job remains in DB with status=pending for later retry
  }

  return job as NotificationJob;
}

export async function deleteNotificationJob(jobId: string): Promise<void> {
  const job = await db("notification_jobs").where({ id: jobId }).first();
  if (!job) throw new AppError(404, "NOT_FOUND", "Notification job not found");
  await db("notification_jobs").where({ id: jobId }).delete();
}

export async function retryNotificationJob(jobId: string): Promise<NotificationJob> {
  const job = await db("notification_jobs").where({ id: jobId }).first();
  if (!job) throw new AppError(404, "NOT_FOUND", "Notification job not found");

  const status      = job.status as string;
  const retryCount  = job.retry_count as number;
  const maxRetries  = job.max_retries as number;

  if (status === "sent")       throw new AppError(409, "ALREADY_SENT",  "Job was already delivered successfully");
  if (status === "processing") throw new AppError(409, "IN_PROGRESS",   "Job is currently processing");
  if (retryCount >= maxRetries)
    throw new AppError(422, "MAX_RETRIES", `Job has exhausted all ${maxRetries} retry attempts`);

  const [updated] = await db("notification_jobs")
    .where({ id: jobId })
    .update({ status: "pending", failure_reason: null, failed_at: null, updated_at: new Date() })
    .returning("*");

  try {
    await enqueue(notificationQueue, "send-notification", {
      jobId,
      type:              job.type              as string,
      notification_type: job.notification_type as string,
    });
  } catch {
    // Redis unavailable — job remains pending in DB, worker will pick it up when Redis recovers
  }

  return updated as NotificationJob;
}

export async function getAdminNotificationLog(filters: {
  channel?: string;
  type?:    string;
  status?:  string;
  user_id?: string;
  from?:    string;
  to?:      string;
  page?:    number;
  limit?:   number;
}) {
  const page   = Math.max(1, filters.page  ?? 1);
  const limit  = Math.min(100, Math.max(1, filters.limit ?? 25));
  const offset = (page - 1) * limit;

  const base = db("notifications as n")
    .leftJoin("users as u", "u.id", "n.user_id")
    .modify((q) => {
      if (filters.channel) q.where("n.channel", filters.channel);
      if (filters.type)    q.where("n.type",    filters.type);
      if (filters.status)  q.where("n.status",  filters.status);
      if (filters.user_id) q.where("n.user_id", filters.user_id);
      if (filters.from)    q.where("n.created_at", ">=", new Date(filters.from));
      if (filters.to)      q.where("n.created_at", "<=", new Date(filters.to));
    });

  const [{ count }] = await base.clone().count<{ count: string }[]>("n.id as count");

  const statsRow = await db("notifications")
    .select(
      db.raw("COUNT(*) FILTER (WHERE status = 'sent')::int    AS sent"),
      db.raw("COUNT(*) FILTER (WHERE status = 'failed')::int  AS failed"),
      db.raw("COUNT(*) FILTER (WHERE status = 'pending')::int AS pending"),
      db.raw("COUNT(*) FILTER (WHERE status = 'read')::int    AS read"),
    )
    .first();

  const rows = await base
    .clone()
    .leftJoin("user_profiles as p", "p.user_id", "n.user_id")
    .orderBy("n.created_at", "desc")
    .limit(limit)
    .offset(offset)
    .select(
      "n.*",
      db.raw("u.email AS user_email"),
      db.raw(
        "COALESCE(NULLIF(TRIM(COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,'')), ''), u.email) AS user_name",
      ),
    );

  return { data: rows, total: parseInt(count, 10), page, limit, stats: statsRow };
}
