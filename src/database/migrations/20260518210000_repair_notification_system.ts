import type { Knex } from "knex";

// Repair migration — safely adds notification_templates and notification_jobs
// if they were not created by 20260518200000_create_notification_system.ts.
// All statements are guarded by hasTable / hasColumn / IF NOT EXISTS so this
// migration is a no-op when the tables already exist.
export async function up(knex: Knex): Promise<void> {
  // ── notification_templates ─────────────────────────────────────────────────
  if (!(await knex.schema.hasTable("notification_templates"))) {
    await knex.schema.createTable("notification_templates", (t) => {
      t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      t.string("name", 100).notNullable().unique();
      t.string("type", 50).notNullable();
      t.string("notification_type", 50).notNullable();
      t.string("subject", 255).nullable();
      t.text("body").notNullable();
      t.jsonb("variables").notNullable().defaultTo("[]");
      t.boolean("is_active").notNullable().defaultTo(true);
      t.uuid("created_by").nullable()
        .references("id").inTable("users").onDelete("SET NULL");
      t.timestamps(true, true);
    });
  }

  await knex.raw("CREATE INDEX IF NOT EXISTS idx_notif_tmpl_type   ON notification_templates(type)");
  await knex.raw("CREATE INDEX IF NOT EXISTS idx_notif_tmpl_ntype  ON notification_templates(notification_type)");
  await knex.raw("CREATE INDEX IF NOT EXISTS idx_notif_tmpl_active ON notification_templates(is_active)");

  // ── notification_jobs ──────────────────────────────────────────────────────
  if (!(await knex.schema.hasTable("notification_jobs"))) {
    await knex.schema.createTable("notification_jobs", (t) => {
      t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      t.string("type", 50).notNullable();
      t.string("notification_type", 50).notNullable();
      t.string("recipient_type", 20).notNullable().defaultTo("user");
      t.uuid("recipient_id").nullable()
        .references("id").inTable("users").onDelete("SET NULL");
      t.string("recipient_email", 255).nullable();
      t.string("recipient_phone", 50).nullable();
      t.string("subject", 255).nullable();
      t.text("body").notNullable();
      t.string("status", 30).notNullable().defaultTo("pending");
      t.integer("retry_count").notNullable().defaultTo(0);
      t.integer("max_retries").notNullable().defaultTo(3);
      t.timestamp("scheduled_at").nullable();
      t.timestamp("processed_at").nullable();
      t.timestamp("failed_at").nullable();
      t.text("failure_reason").nullable();
      t.uuid("template_id").nullable()
        .references("id").inTable("notification_templates").onDelete("SET NULL");
      t.jsonb("metadata").notNullable().defaultTo("{}");
      t.string("idempotency_key", 255).unique().nullable();
      t.uuid("created_by").nullable()
        .references("id").inTable("users").onDelete("SET NULL");
      t.timestamps(true, true);
    });
  }

  await knex.raw("CREATE INDEX IF NOT EXISTS idx_notif_jobs_status    ON notification_jobs(status)");
  await knex.raw("CREATE INDEX IF NOT EXISTS idx_notif_jobs_type      ON notification_jobs(type)");
  await knex.raw("CREATE INDEX IF NOT EXISTS idx_notif_jobs_recipient ON notification_jobs(recipient_id)");
  await knex.raw("CREATE INDEX IF NOT EXISTS idx_notif_jobs_created   ON notification_jobs(created_at DESC)");
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("notification_jobs");
  await knex.schema.dropTableIfExists("notification_templates");
}
