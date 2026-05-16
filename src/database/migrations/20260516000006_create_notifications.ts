import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const tableExists = await knex.schema.hasTable("notifications");

  if (!tableExists) {
    // Happy path — table absent, create in one shot.
    await knex.schema.createTable("notifications", (table) => {
      table.uuid("id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
      table
        .uuid("user_id")
        .nullable()
        .references("id")
        .inTable("users")
        .onDelete("CASCADE");
      table.string("channel", 20).notNullable();   // email | sms | in_app | admin
      table.string("type", 100).notNullable();
      table.text("title").notNullable();
      table.text("message").notNullable();
      table.string("status", 20).notNullable().defaultTo("pending"); // pending | sent | failed | read
      table.jsonb("metadata").notNullable().defaultTo("{}");
      table.timestamp("sent_at").nullable();
      table.timestamp("read_at").nullable();
      table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
      table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());
    });
  } else {
    // Table already exists from a partial run. Add every missing column
    // atomically. ADD COLUMN IF NOT EXISTS is a no-op for existing columns,
    // so this is safe to run repeatedly without losing data.
    // NOT NULL columns carry a DEFAULT so existing rows remain valid.
    await knex.raw(`
      ALTER TABLE notifications
        ADD COLUMN IF NOT EXISTS user_id     uuid,
        ADD COLUMN IF NOT EXISTS channel     varchar(20)  NOT NULL DEFAULT 'in_app',
        ADD COLUMN IF NOT EXISTS type        varchar(100) NOT NULL DEFAULT 'generic',
        ADD COLUMN IF NOT EXISTS title       text         NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS message     text         NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS status      varchar(20)  NOT NULL DEFAULT 'pending',
        ADD COLUMN IF NOT EXISTS metadata    jsonb        NOT NULL DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS sent_at     timestamp,
        ADD COLUMN IF NOT EXISTS read_at     timestamp,
        ADD COLUMN IF NOT EXISTS created_at  timestamp    NOT NULL DEFAULT now(),
        ADD COLUMN IF NOT EXISTS updated_at  timestamp    NOT NULL DEFAULT now()
    `);

    // Add FK on user_id only if the constraint is not already present.
    // Knex names FK constraints as <table>_<column>_foreign.
    await knex.raw(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1
            FROM information_schema.table_constraints
           WHERE constraint_name = 'notifications_user_id_foreign'
             AND table_name      = 'notifications'
        ) THEN
          ALTER TABLE notifications
            ADD CONSTRAINT notifications_user_id_foreign
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
        END IF;
      END $$
    `);
  }

  // Indexes — IF NOT EXISTS makes every statement a safe no-op when the
  // index already exists, regardless of which branch above was taken.
  await knex.raw(
    "CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications (user_id) WHERE user_id IS NOT NULL"
  );
  await knex.raw(
    "CREATE INDEX IF NOT EXISTS idx_notifications_channel ON notifications (channel)"
  );
  await knex.raw(
    "CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications (status)"
  );
  await knex.raw(
    "CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications (type)"
  );
  await knex.raw(
    "CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications (created_at DESC)"
  );
  await knex.raw(
    "CREATE INDEX IF NOT EXISTS idx_notifications_user_status ON notifications (user_id, status, created_at DESC) WHERE user_id IS NOT NULL"
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("notifications");
}
