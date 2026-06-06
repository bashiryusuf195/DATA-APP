import { randomUUID } from "crypto";
import { createWorker } from "../../queue/config/queue.config";
import { getDbInstance } from "../../../db/knex";
import { sendPushToUsers, sendPushToAll } from "../services/fcm.service";

const db = getDbInstance();

console.log("[NOTIFICATION WORKER] Module loaded");

export const notificationWorker = createWorker(
  "vtu-notifications",

  async (job) => {
    const { jobId, type, notification_type } = job.data as {
      jobId:             string;
      type:              string;
      notification_type: string;
    };

    const notifJob = await db("notification_jobs").where({ id: jobId }).first();
    if (!notifJob) {
      console.error(`[NOTIFICATION WORKER] Job ${jobId} not found in DB`);
      throw new Error(`Notification job ${jobId} not found`);
    }

    // Skip if already sent (idempotency on retries)
    if ((notifJob.status as string) === "sent") {
      console.log(`[NOTIFICATION WORKER] Job ${jobId} already sent — skipping`);
      return;
    }

    // Mark as processing
    await db("notification_jobs").where({ id: jobId }).update({
      status:      "processing",
      retry_count: db.raw("retry_count + 1"),
      updated_at:  new Date(),
    });

    try {
      const channel          = type;
      const recipientType    = notifJob.recipient_type as string;
      const recipientEmail   = notifJob.recipient_email as string | null;
      const recipientPhone   = notifJob.recipient_phone as string | null;

      console.log(
        `[NOTIFICATION WORKER] Delivering ${channel} | type=${notification_type}` +
        ` | recipient_type=${recipientType} | job=${jobId}`,
      );

      if (channel === "email" || channel === "broadcast") {
        // Plug in Nodemailer / SendGrid / AWS SES here
        console.log(`[NOTIFICATION WORKER] EMAIL → ${recipientEmail ?? "(broadcast)"}: ${String(notifJob.subject ?? "")}`);
      }

      if (channel === "sms") {
        // Plug in Twilio / Africa's Talking here
        console.log(`[NOTIFICATION WORKER] SMS → ${recipientPhone ?? "unknown"}`);
      }

      if (channel === "push") {
        const meta     = (notifJob.metadata ?? {}) as Record<string, unknown>;
        const payload  = {
          title:             String(notifJob.subject ?? "Hive Data"),
          body:              String(notifJob.body    ?? ""),
          notification_type: notification_type,
          deep_link:         typeof meta.deep_link === "string" ? meta.deep_link : "/notifications",
          image:             typeof meta.image_url  === "string" ? meta.image_url : undefined,
          icon:              "/icons/icon-192x192.png",
        };

        let pushResult;
        if (recipientType === "all") {
          pushResult = await sendPushToAll(payload);
          console.log(
            `[NOTIFICATION WORKER] PUSH broadcast — sent=${pushResult.sent} failed=${pushResult.failed}` +
            (pushResult.disabled ? " (FCM not configured)" : "")
          );
        } else if (recipientType === "user" && notifJob.recipient_id) {
          pushResult = await sendPushToUsers([String(notifJob.recipient_id)], payload);
          console.log(
            `[NOTIFICATION WORKER] PUSH → user ${String(notifJob.recipient_id)}` +
            ` sent=${pushResult.sent} failed=${pushResult.failed}`
          );
        } else {
          console.warn(`[NOTIFICATION WORKER] PUSH: unhandled recipient_type=${recipientType}`);
          pushResult = { sent: 0, failed: 0, disabled: false };
        }

        // Store delivery stats in metadata for the admin to see
        await db("notification_jobs").where({ id: jobId }).update({
          metadata: JSON.stringify({
            ...((notifJob.metadata ?? {}) as Record<string, unknown>),
            push_sent:     pushResult.sent,
            push_failed:   pushResult.failed,
            push_disabled: pushResult.disabled,
          }),
        });
      }

      // Fan out: write a notifications row per user so the customer app can display it.
      if (channel === "in_app" || channel === "broadcast") {
        const title   = String(notifJob.subject ?? "Notification");
        const message = String(notifJob.body    ?? "");
        const now     = new Date();

        if (recipientType === "all") {
          const users = await db("users").where("status", "active").select("id");
          console.log(`[NOTIFICATION WORKER] Fanning out in_app to ${users.length} users | job=${jobId}`);

          // Batch inserts to avoid huge single statements on large user bases.
          const BATCH = 500;
          for (let i = 0; i < users.length; i += BATCH) {
            await db("notifications").insert(
              users.slice(i, i + BATCH).map((u: { id: string }) => ({
                id:         randomUUID(),
                user_id:    u.id,
                channel:    "in_app",
                type:       notification_type,
                title,
                message,
                body:       message,
                status:     "sent",
                metadata:   JSON.stringify({ broadcast_job_id: jobId }),
                sent_at:    now,
                read_at:    null,
                created_at: now,
                updated_at: now,
              })),
            );
          }
        } else if (recipientType === "user" && notifJob.recipient_id) {
          await db("notifications").insert({
            id:         randomUUID(),
            user_id:    notifJob.recipient_id,
            channel:    "in_app",
            type:       notification_type,
            title,
            message,
            body:       message,
            status:     "sent",
            metadata:   JSON.stringify({ broadcast_job_id: jobId }),
            sent_at:    now,
            read_at:    null,
            created_at: now,
            updated_at: now,
          });
          console.log(`[NOTIFICATION WORKER] IN_APP → user ${String(notifJob.recipient_id)} | job=${jobId}`);
        }
      }

      await db("notification_jobs").where({ id: jobId }).update({
        status:       "sent",
        processed_at: new Date(),
        failure_reason: null,
        updated_at:   new Date(),
      });

      console.log(`[NOTIFICATION WORKER] Job ${jobId} delivered successfully`);
    } catch (err) {
      const message = (err as Error).message;
      await db("notification_jobs").where({ id: jobId }).update({
        status:         "failed",
        failed_at:      new Date(),
        failure_reason: message,
        updated_at:     new Date(),
      });
      throw err;
    }
  },
);
