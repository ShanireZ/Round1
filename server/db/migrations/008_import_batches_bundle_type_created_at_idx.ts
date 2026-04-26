import type pg from "pg";

export const name = "008_import_batches_bundle_type_created_at_idx";

export async function up(pool: pg.Pool): Promise<void> {
  await pool.query(`
    CREATE INDEX IF NOT EXISTS import_batches_bundle_type_created_at_idx
      ON import_batches (bundle_type, created_at);
  `);
}

export async function down(pool: pg.Pool): Promise<void> {
  await pool.query(`
    DROP INDEX IF EXISTS import_batches_bundle_type_created_at_idx;
  `);
}
