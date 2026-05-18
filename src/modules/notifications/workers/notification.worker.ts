import { createWorker } from "../../queue/config/queue.config";
import { getDbInstance } from "../../../db/knex";

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
        // Plug in FCM / APNs here
        console.log(`[NOTIFICATION WORKER] PUSH → user ${String(notifJob.recipient_id ?? "all")}`);
      }

      if (channel === "in_app" || recipientType === "all") {
        // Fan out in-app notifications to all users if broadcast
        console.log(`[NOTIFICATION WORKER] IN_APP broadcast: ${String(notifJob.body).slice(0, 80)}`);
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
