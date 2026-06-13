import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('admin_alerts', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('type', 100).notNullable();
    t.string('severity', 20).notNullable().defaultTo('warning'); // info | warning | critical
    t.string('category', 50).notNullable();                       // provider | payment | transaction
    t.string('title', 255).notNullable();
    t.text('message').notNullable();
    t.jsonb('metadata').notNullable().defaultTo('{}');
    t.boolean('is_read').notNullable().defaultTo(false);
    t.boolean('is_resolved').notNullable().defaultTo(false);
    t.timestamp('resolved_at', { useTz: true }).nullable();
    t.string('resolved_by', 255).nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE INDEX admin_alerts_unread_idx  ON admin_alerts (is_read, created_at DESC)
    WHERE is_read = false
  `);
  await knex.raw(`
    CREATE INDEX admin_alerts_category_idx ON admin_alerts (category, created_at DESC)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('admin_alerts');
}
