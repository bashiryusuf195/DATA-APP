import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("reconciliation_issues", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    table
      .uuid("report_id")
      .notNullable()
      .references("id")
      .inTable("reconciliation_reports")
      .onDelete("CASCADE");
    table.string("transaction_reference", 128).nullable();
    table.string("issue_type", 100).notNullable();
    table.string("severity", 20).notNullable(); // low | medium | high | critical
    table.text("description").notNullable();
    table.jsonb("metadata").notNullable().defaultTo("{}");
    table.boolean("resolved").notNullable().defaultTo(false);
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(
    "CREATE INDEX IF NOT EXISTS idx_recon_issues_report_id ON reconciliation_issues (report_id)"
  );
  await knex.raw(
    "CREATE INDEX IF NOT EXISTS idx_recon_issues_issue_type ON reconciliation_issues (issue_type)"
  );
  await knex.raw(
    "CREATE INDEX IF NOT EXISTS idx_recon_issues_severity ON reconciliation_issues (severity)"
  );
  await knex.raw(
    "CREATE INDEX IF NOT EXISTS idx_recon_issues_resolved ON reconciliation_issues (resolved)"
  );
  await knex.raw(
    "CREATE INDEX IF NOT EXISTS idx_recon_issues_transaction_ref ON reconciliation_issues (transaction_reference)"
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("reconciliation_issues");
}
