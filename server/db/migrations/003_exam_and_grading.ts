import type pg from "pg";

export const name = "003_exam_and_grading";

export async function up(pool: pg.Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE blueprints (
      exam_type TEXT NOT NULL,
      version INTEGER NOT NULL,
      spec_json JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (exam_type, version)
    );

    CREATE TABLE papers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id),
      assignment_id UUID,
      exam_type TEXT NOT NULL,
      blueprint_version INTEGER NOT NULL,
      seed TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      replacement_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT papers_exam_type_check CHECK (exam_type IN ('CSP-J','CSP-S','GESP-1','GESP-2','GESP-3','GESP-4','GESP-5','GESP-6','GESP-7','GESP-8')),
      CONSTRAINT papers_status_check CHECK (status IN ('draft', 'active', 'completed', 'abandoned')),
      CONSTRAINT papers_replacement_count_check CHECK (replacement_count <= 9)
    );
    CREATE INDEX papers_assignment_id_idx ON papers (assignment_id);

    CREATE TABLE paper_question_slots (
      paper_id UUID NOT NULL REFERENCES papers(id),
      slot_no INTEGER NOT NULL,
      question_type TEXT NOT NULL,
      primary_kp_id INTEGER NOT NULL,
      difficulty TEXT NOT NULL,
      current_question_id UUID NOT NULL REFERENCES questions(id),
      PRIMARY KEY (paper_id, slot_no)
    );

    CREATE TABLE paper_question_replacements (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      paper_id UUID NOT NULL REFERENCES papers(id),
      slot_no INTEGER NOT NULL,
      from_question_id UUID NOT NULL REFERENCES questions(id),
      to_question_id UUID NOT NULL REFERENCES questions(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE attempts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      paper_id UUID NOT NULL REFERENCES papers(id),
      user_id UUID NOT NULL REFERENCES users(id),
      started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      submitted_at TIMESTAMPTZ,
      answers_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      score INTEGER,
      per_section_json JSONB,
      per_primary_kp_json JSONB,
      tab_nonce UUID NOT NULL,
      status TEXT NOT NULL DEFAULT 'started',
      auto_submit_job_id TEXT,
      ai_report_json JSONB,
      report_status TEXT,
      report_error TEXT,
      report_job_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT attempts_status_check CHECK (status IN ('started', 'submitted', 'auto_submitted', 'abandoned')),
      CONSTRAINT attempts_report_status_check CHECK (report_status IS NULL OR report_status IN ('pending', 'processing', 'completed', 'failed'))
    );

    CREATE TABLE exam_cooldowns (
      user_id UUID PRIMARY KEY REFERENCES users(id),
      last_exam_at TIMESTAMPTZ NOT NULL
    );
  `);
}

export async function down(pool: pg.Pool): Promise<void> {
  await pool.query(`
    DROP TABLE IF EXISTS exam_cooldowns CASCADE;
    DROP TABLE IF EXISTS attempts CASCADE;
    DROP TABLE IF EXISTS paper_question_replacements CASCADE;
    DROP TABLE IF EXISTS paper_question_slots CASCADE;
    DROP TABLE IF EXISTS papers CASCADE;
    DROP TABLE IF EXISTS blueprints CASCADE;
  `);
}
