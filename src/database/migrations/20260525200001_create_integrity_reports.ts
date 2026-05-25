import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('integrity_reports', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.timestamp('run_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    // 'system' for scheduled runs; admin UUID for manually triggered runs
    t.string('run_by', 100).notNullable().defaultTo('system');
    // 'ok' | 'issues_found' | 'error'
    t.string('status', 20).notNullable();
    t.integer('checks_run').notNullable().defaultTo(0);
    t.integer('issues_found').notNullable().defaultTo(0);
    t.integer('critical_issues').notNullable().defaultTo(0);
    // Per-check results keyed by check name
    t.jsonb('results').notNullable().defaultTo('{}');
    t.integer('duration_ms');
    t.jsonb('metadata').defaultTo('{}');
  });

  await knex.raw(
    'CREATE INDEX idx_integrity_reports_run_at ON integrity_reports(run_at DESC)',
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('integrity_reports');
}
