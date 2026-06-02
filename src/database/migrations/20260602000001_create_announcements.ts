import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("announcements", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.string("title", 255).notNullable();
    t.text("message").notNullable();
    t.string("display_type", 20).notNullable().defaultTo("popup");
    t.integer("priority").notNullable().defaultTo(0);
    t.string("status", 20).notNullable().defaultTo("active");
    t.timestamp("start_at", { useTz: true }).nullable();
    t.timestamp("end_at",   { useTz: true }).nullable();
    t.uuid("created_by").nullable().references("id").inTable("users").onDelete("SET NULL");
    t.timestamps(true, true);
  });

  await knex.raw(`
    ALTER TABLE announcements
      ADD CONSTRAINT announcements_display_type_check
        CHECK (display_type IN ('popup', 'ticker')),
      ADD CONSTRAINT announcements_status_check
        CHECK (status IN ('active', 'inactive'))
  `);

  await knex.raw(`
    CREATE INDEX announcements_active_idx
      ON announcements (status, display_type, start_at, end_at)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("announcements");
}
