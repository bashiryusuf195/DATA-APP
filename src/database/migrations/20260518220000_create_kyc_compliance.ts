import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // ── kyc_verifications ──────────────────────────────────────────────────────
  if (!(await knex.schema.hasTable("kyc_verifications"))) {
    await knex.schema.createTable("kyc_verifications", (t) => {
      t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      t.uuid("user_id")
        .nullable()
        .references("id")
        .inTable("users")
        .onDelete("SET NULL");
      // bvn | nin | address | selfie | liveness
      t.string("verification_type", 30).notNullable();
      // pending | in_progress | verified | failed | expired | manual_review
      t.string("status", 20).notNullable().defaultTo("pending");
      t.string("provider", 100).nullable();
      t.string("provider_ref", 255).nullable();
      t.timestamp("verified_at", { useTz: true }).nullable();
      t.text("failure_reason").nullable();
      t.jsonb("verification_data").notNullable().defaultTo("{}");
      t.uuid("initiated_by")
        .nullable()
        .references("id")
        .inTable("users")
        .onDelete("SET NULL");
      t.uuid("reviewed_by")
        .nullable()
        .references("id")
        .inTable("users")
        .onDelete("SET NULL");
      t.timestamp("reviewed_at", { useTz: true }).nullable();
      t.text("notes").nullable();
      t.timestamps(true, true);
    });
    await knex.raw(
      "CREATE INDEX IF NOT EXISTS idx_kyc_verif_user_id ON kyc_verifications(user_id)",
    );
    await knex.raw(
      "CREATE INDEX IF NOT EXISTS idx_kyc_verif_status ON kyc_verifications(status)",
    );
    await knex.raw(
      "CREATE INDEX IF NOT EXISTS idx_kyc_verif_type ON kyc_verifications(verification_type)",
    );
    await knex.raw(
      "CREATE INDEX IF NOT EXISTS idx_kyc_verif_created ON kyc_verifications(created_at DESC)",
    );
  }

  // ── risk_flags ─────────────────────────────────────────────────────────────
  if (!(await knex.schema.hasTable("risk_flags"))) {
    await knex.schema.createTable("risk_flags", (t) => {
      t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      t.uuid("user_id")
        .nullable()
        .references("id")
        .inTable("users")
        .onDelete("SET NULL");
      // suspicious_volume | duplicate_funding | fraud_suspected | chargeback_risk | account_takeover | manual_review
      t.string("flag_type", 50).notNullable();
      // low | medium | high | critical
      t.string("severity", 20).notNullable().defaultTo("medium");
      // open | investigating | resolved | dismissed
      t.string("status", 20).notNullable().defaultTo("open");
      t.string("title", 255).notNullable();
      t.text("description").nullable();
      t.jsonb("evidence").notNullable().defaultTo("{}");
      t.string("transaction_ref", 255).nullable();
      t.uuid("flagged_by")
        .nullable()
        .references("id")
        .inTable("users")
        .onDelete("SET NULL");
      t.uuid("assigned_to")
        .nullable()
        .references("id")
        .inTable("users")
        .onDelete("SET NULL");
      t.uuid("resolved_by")
        .nullable()
        .references("id")
        .inTable("users")
        .onDelete("SET NULL");
      t.timestamp("resolved_at", { useTz: true }).nullable();
      t.text("resolution_notes").nullable();
      t.timestamps(true, true);
    });
    await knex.raw(
      "CREATE INDEX IF NOT EXISTS idx_risk_flags_user_id ON risk_flags(user_id)",
    );
    await knex.raw(
      "CREATE INDEX IF NOT EXISTS idx_risk_flags_flag_type ON risk_flags(flag_type)",
    );
    await knex.raw(
      "CREATE INDEX IF NOT EXISTS idx_risk_flags_severity ON risk_flags(severity)",
    );
    await knex.raw(
      "CREATE INDEX IF NOT EXISTS idx_risk_flags_status ON risk_flags(status)",
    );
    await knex.raw(
      "CREATE INDEX IF NOT EXISTS idx_risk_flags_created ON risk_flags(created_at DESC)",
    );
  }

  // ── compliance_audit_log ───────────────────────────────────────────────────
  if (!(await knex.schema.hasTable("compliance_audit_log"))) {
    await knex.schema.createTable("compliance_audit_log", (t) => {
      t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      t.string("entity_type", 50).notNullable();
      t.string("entity_id", 255).notNullable();
      t.string("action", 100).notNullable();
      t.uuid("actor_id")
        .nullable()
        .references("id")
        .inTable("users")
        .onDelete("SET NULL");
      t.text("actor_email").nullable();
      t.jsonb("before_state").nullable();
      t.jsonb("after_state").nullable();
      t.text("notes").nullable();
      t.specificType("ip_address", "inet").nullable();
      // Immutable — no updated_at
      t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.raw("NOW()"));
    });
    await knex.raw(
      "CREATE INDEX IF NOT EXISTS idx_comp_audit_entity ON compliance_audit_log(entity_type, entity_id)",
    );
    await knex.raw(
      "CREATE INDEX IF NOT EXISTS idx_comp_audit_actor ON compliance_audit_log(actor_id)",
    );
    await knex.raw(
      "CREATE INDEX IF NOT EXISTS idx_comp_audit_action ON compliance_audit_log(action)",
    );
    await knex.raw(
      "CREATE INDEX IF NOT EXISTS idx_comp_audit_created ON compliance_audit_log(created_at DESC)",
    );
  }

  // ── blacklist ──────────────────────────────────────────────────────────────
  if (!(await knex.schema.hasTable("blacklist"))) {
    await knex.schema.createTable("blacklist", (t) => {
      t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      // user | email | phone | bvn | nin | ip | card
      t.string("entity_type", 20).notNullable();
      t.text("entity_value").notNullable();
      t.text("reason").notNullable();
      t.text("notes").nullable();
      t.uuid("added_by")
        .nullable()
        .references("id")
        .inTable("users")
        .onDelete("SET NULL");
      t.uuid("removed_by")
        .nullable()
        .references("id")
        .inTable("users")
        .onDelete("SET NULL");
      t.timestamp("removed_at", { useTz: true }).nullable();
      t.boolean("is_active").notNullable().defaultTo(true);
      t.jsonb("metadata").notNullable().defaultTo("{}");
      t.timestamps(true, true);
    });
    // Partial unique index: only one active entry per (entity_type, entity_value)
    await knex.raw(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_blacklist_active_entity ON blacklist(entity_type, entity_value) WHERE is_active = true",
    );
    await knex.raw(
      "CREATE INDEX IF NOT EXISTS idx_blacklist_entity ON blacklist(entity_type, entity_value)",
    );
    await knex.raw(
      "CREATE INDEX IF NOT EXISTS idx_blacklist_is_active ON blacklist(is_active)",
    );
    await knex.raw(
      "CREATE INDEX IF NOT EXISTS idx_blacklist_created ON blacklist(created_at DESC)",
    );
  }

  // ── compliance_reports ────────────────────────────────────────────────────
  if (!(await knex.schema.hasTable("compliance_reports"))) {
    await knex.schema.createTable("compliance_reports", (t) => {
      t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      // aml | cft | sar | velocity | kyc_summary | blacklist_summary
      t.string("report_type", 50).notNullable();
      t.string("title", 255).notNullable();
      t.date("period_start").nullable();
      t.date("period_end").nullable();
      t.text("summary").nullable();
      t.jsonb("data").notNullable().defaultTo("{}");
      // draft | final
      t.string("status", 20).notNullable().defaultTo("draft");
      t.uuid("generated_by")
        .nullable()
        .references("id")
        .inTable("users")
        .onDelete("SET NULL");
      t.timestamps(true, true);
    });
    await knex.raw(
      "CREATE INDEX IF NOT EXISTS idx_comp_reports_type ON compliance_reports(report_type)",
    );
    await knex.raw(
      "CREATE INDEX IF NOT EXISTS idx_comp_reports_status ON compliance_reports(status)",
    );
    await knex.raw(
      "CREATE INDEX IF NOT EXISTS idx_comp_reports_created ON compliance_reports(created_at DESC)",
    );
  }

  // ── Freeze columns on users ────────────────────────────────────────────────
  const hasFrozen = await knex.schema.hasColumn("users", "frozen_at");
  if (!hasFrozen) {
    await knex.raw(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS frozen_at     TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS frozen_by     UUID REFERENCES users(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS frozen_reason TEXT
    `);
  }
}

export async function down(knex: Knex): Promise<void> {
  // Remove freeze columns from users
  await knex.raw(`
    ALTER TABLE users
      DROP COLUMN IF EXISTS frozen_at,
      DROP COLUMN IF EXISTS frozen_by,
      DROP COLUMN IF EXISTS frozen_reason
  `);

  await knex.schema.dropTableIfExists("compliance_reports");
  await knex.schema.dropTableIfExists("blacklist");
  await knex.schema.dropTableIfExists("compliance_audit_log");
  await knex.schema.dropTableIfExists("risk_flags");
  await knex.schema.dropTableIfExists("kyc_verifications");
}
