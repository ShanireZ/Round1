import type pg from "pg";

export const name = "009_drop_generation_job_tables_and_extend_import_batches";

export async function up(pool: pg.Pool): Promise<void> {
  await pool.query(`
    ALTER TABLE import_batches DROP CONSTRAINT IF EXISTS import_batches_bundle_type_check;
    ALTER TABLE import_batches DROP CONSTRAINT IF EXISTS import_batches_status_check;

    ALTER TABLE import_batches
      ADD CONSTRAINT import_batches_bundle_type_check
      CHECK (bundle_type IN ('question_bundle', 'prebuilt_paper_bundle', 'manual_question_import'));

    ALTER TABLE import_batches
      ADD CONSTRAINT import_batches_status_check
      CHECK (status IN ('dry_run', 'processing', 'applied', 'partial_failed', 'failed'));

    DROP TABLE IF EXISTS generation_jobs CASCADE;
    DROP TABLE IF EXISTS manual_generation_jobs CASCADE;
  `);
}

export async function down(pool: pg.Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS manual_generation_jobs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      created_by UUID NOT NULL REFERENCES users(id),
      exam_type TEXT NOT NULL,
      question_type TEXT NOT NULL,
      primary_kp_id INTEGER NOT NULL REFERENCES knowledge_points(id),
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT manual_generation_jobs_status_check CHECK (status IN ('pending', 'processing', 'completed', 'partial_failed'))
    );

    CREATE TABLE IF NOT EXISTS generation_jobs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      question_type TEXT NOT NULL,
      exam_type TEXT NOT NULL,
      primary_kp_id INTEGER NOT NULL REFERENCES knowledge_points(id),
      difficulty TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT generation_jobs_status_check CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
    );

    ALTER TABLE import_batches DROP CONSTRAINT IF EXISTS import_batches_bundle_type_check;
    ALTER TABLE import_batches DROP CONSTRAINT IF EXISTS import_batches_status_check;

    ALTER TABLE import_batches
      ADD CONSTRAINT import_batches_bundle_type_check
      CHECK (bundle_type IN ('question_bundle', 'prebuilt_paper_bundle'));

    ALTER TABLE import_batches
      ADD CONSTRAINT import_batches_status_check
      CHECK (status IN ('dry_run', 'applied', 'failed'));
  `);
}
