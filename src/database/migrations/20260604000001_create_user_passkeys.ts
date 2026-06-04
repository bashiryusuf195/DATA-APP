import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("user_passkeys", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("user_id").notNullable()
      .references("id").inTable("users").onDelete("CASCADE");

    // The opaque credential identifier assigned by the authenticator (base64url).
    // Used as the lookup key during authentication.
    t.text("credential_id").notNullable().unique();

    // COSE-encoded public key (base64url). Needed to verify assertion signatures.
    t.text("credential_public_key").notNullable();

    // Monotonically increasing counter set by the authenticator on every use.
    // A counter that doesn't increase signals a cloned authenticator.
    t.bigInteger("counter").notNullable().defaultTo(0);

    // "singleDevice" (not backed up) or "multiDevice" (synced, e.g. iCloud/Google).
    t.text("device_type");

    // Whether the credential has been backed up to a cloud keychain.
    t.boolean("backed_up").notNullable().defaultTo(false);

    // Transport hints: ["internal", "usb", "nfc", "ble", "hybrid"]
    t.specificType("transports", "text[]");

    // User-facing label shown in Settings (e.g. "iPhone 14 · Face ID").
    t.text("friendly_name");

    t.timestamp("last_used_at", { useTz: true });
    t.timestamp("created_at",   { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at",   { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE TRIGGER set_user_passkeys_updated_at
    BEFORE UPDATE ON user_passkeys
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);

  await knex.schema.table("user_passkeys", (t) => {
    t.index("user_id",       "idx_passkeys_user_id");
    t.index("credential_id", "idx_passkeys_credential_id");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TRIGGER IF EXISTS set_user_passkeys_updated_at ON user_passkeys`);
  await knex.schema.dropTableIfExists("user_passkeys");
}
