import type pg from "pg";

export const name = "005_system_and_logs";

export async function up(pool: pg.Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE admin_audit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      actor_user_id UUID NOT NULL REFERENCES users(id),
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      before_json JSONB,
      after_json JSONB,
      reauth_method TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX admin_audit_logs_actor_created_idx ON admin_audit_logs (actor_user_id, created_at);
    CREATE INDEX admin_audit_logs_action_created_idx ON admin_audit_logs (action, created_at);

    CREATE TABLE manual_generation_jobs (
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

    CREATE TABLE generation_jobs (
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

    CREATE TABLE llm_provider_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      task TEXT NOT NULL,
      tokens_in INTEGER NOT NULL,
      tokens_out INTEGER NOT NULL,
      cost_estimate REAL,
      latency_ms INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX llm_provider_logs_provider_task_idx ON llm_provider_logs (provider, task, created_at);

    CREATE TABLE app_settings (
      key VARCHAR(100) PRIMARY KEY,
      value_json JSONB NOT NULL,
      updated_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

export async function down(pool: pg.Pool): Promise<void> {
  await pool.query(`
    DROP TABLE IF EXISTS app_settings CASCADE;
    DROP TABLE IF EXISTS llm_provider_logs CASCADE;
    DROP TABLE IF EXISTS generation_jobs CASCADE;
    DROP TABLE IF EXISTS manual_generation_jobs CASCADE;
    DROP TABLE IF EXISTS admin_audit_logs CASCADE;
  `);
}
