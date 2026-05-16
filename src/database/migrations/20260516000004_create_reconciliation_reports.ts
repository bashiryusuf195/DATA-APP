import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("reconciliation_reports", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    table.string("report_type", 100).notNullable();
    table.timestamp("started_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("completed_at").nullable();
    table.string("status", 50).notNullable().defaultTo("pending"); // pending | running | completed | failed
    table.integer("total_checked").notNullable().defaultTo(0);
    table.integer("total_issues").notNullable().defaultTo(0);
    table.jsonb("metadata").notNullable().defaultTo("{}");
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(
    "CREATE INDEX IF NOT EXISTS idx_recon_reports_status ON reconciliation_reports (status)"
  );
  await knex.raw(
    "CREATE INDEX IF NOT EXISTS idx_recon_reports_created_at ON reconciliation_reports (created_at DESC)"
  );
  await knex.raw(
    "CREATE INDEX IF NOT EXISTS idx_recon_reports_report_type ON reconciliation_reports (report_type)"
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("reconciliation_reports");
}
