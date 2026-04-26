import type pg from "pg";

export const name = "006_llm_provider_log_observability";

export async function up(pool: pg.Pool): Promise<void> {
  await pool.query(`
    ALTER TABLE llm_provider_logs
      ADD COLUMN response_model TEXT,
      ADD COLUMN lane TEXT NOT NULL DEFAULT 'default',
      ADD COLUMN finish_reason TEXT,
      ADD COLUMN response_id TEXT,
      ADD COLUMN reasoning_text TEXT,
      ADD COLUMN warnings_json JSONB,
      ADD COLUMN provider_metadata_json JSONB,
      ADD COLUMN error_message TEXT;
  `);
}

export async function down(pool: pg.Pool): Promise<void> {
  await pool.query(`
    ALTER TABLE llm_provider_logs
      DROP COLUMN IF EXISTS error_message,
      DROP COLUMN IF EXISTS provider_metadata_json,
      DROP COLUMN IF EXISTS warnings_json,
      DROP COLUMN IF EXISTS reasoning_text,
      DROP COLUMN IF EXISTS response_id,
      DROP COLUMN IF EXISTS finish_reason,
      DROP COLUMN IF EXISTS lane,
      DROP COLUMN IF EXISTS response_model;
  `);
}
