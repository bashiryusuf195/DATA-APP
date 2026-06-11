import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("biometric_devices", (t) => {
    t.uuid("id").primary().defaultTo(knex.fn.uuid());
    t.uuid("user_id")
      .notNullable()
      .references("id")
      .inTable("users")
      .onDelete("CASCADE");
    // Client-generated UUID identifying this specific device installation.
    t.text("device_id").notNullable();
    t.text("device_name").notNullable();
    t.text("platform").notNullable();
    // HMAC-SHA256(BIOMETRIC_HMAC_SECRET, device_secret) — raw secret never stored.
    t.text("secret_hash").notNullable();
    t.boolean("is_active").notNullable().defaultTo(true);
    t.timestamp("last_used_at", { useTz: true }).nullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    // One active registration per (user, device). Re-registering the same
    // device_id replaces the old entry (handled at application level via upsert).
    t.unique(["user_id", "device_id"]);
  });

  await knex.schema.raw(`
    CREATE INDEX idx_biometric_devices_user_id
      ON biometric_devices (user_id)
      WHERE is_active = true;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("biometric_devices");
}
