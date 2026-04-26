import type pg from "pg";

export const name = "007_offline_content_prebuilt_papers";

export async function up(pool: pg.Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS import_batches (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      bundle_type TEXT NOT NULL,
      source_filename VARCHAR(255) NOT NULL,
      checksum VARCHAR(64) NOT NULL,
      status TEXT NOT NULL DEFAULT 'dry_run',
      summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      imported_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT import_batches_bundle_type_check CHECK (bundle_type IN ('question_bundle', 'prebuilt_paper_bundle')),
      CONSTRAINT import_batches_status_check CHECK (status IN ('dry_run', 'applied', 'failed'))
    );

    CREATE TABLE IF NOT EXISTS prebuilt_papers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title VARCHAR(200) NOT NULL,
      exam_type TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      blueprint_version INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      source_batch_id UUID REFERENCES import_batches(id),
      metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      published_at TIMESTAMPTZ,
      archived_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT prebuilt_papers_exam_type_check CHECK (exam_type IN ('CSP-J','CSP-S','GESP-1','GESP-2','GESP-3','GESP-4','GESP-5','GESP-6','GESP-7','GESP-8')),
      CONSTRAINT prebuilt_papers_difficulty_check CHECK (difficulty IN ('easy', 'medium', 'hard')),
      CONSTRAINT prebuilt_papers_status_check CHECK (status IN ('draft', 'published', 'archived'))
    );
    CREATE INDEX IF NOT EXISTS prebuilt_papers_status_exam_type_difficulty_idx
      ON prebuilt_papers (status, exam_type, difficulty);

    CREATE TABLE IF NOT EXISTS prebuilt_paper_slots (
      prebuilt_paper_id UUID NOT NULL REFERENCES prebuilt_papers(id),
      slot_no INTEGER NOT NULL,
      question_id UUID NOT NULL REFERENCES questions(id),
      question_type TEXT NOT NULL,
      primary_kp_id INTEGER NOT NULL REFERENCES knowledge_points(id),
      difficulty TEXT NOT NULL,
      points INTEGER NOT NULL,
      PRIMARY KEY (prebuilt_paper_id, slot_no),
      CONSTRAINT prebuilt_paper_slots_question_type_check CHECK (question_type IN ('single_choice', 'reading_program', 'completion_program')),
      CONSTRAINT prebuilt_paper_slots_difficulty_check CHECK (difficulty IN ('easy', 'medium', 'hard')),
      CONSTRAINT prebuilt_paper_slots_points_check CHECK (points > 0)
    );

    ALTER TABLE questions
      ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

    ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_status_check;
    ALTER TABLE questions
      ADD CONSTRAINT questions_status_check
      CHECK (status IN ('draft', 'active', 'published', 'archived', 'retired', 'rejected'));

    ALTER TABLE papers
      ADD COLUMN IF NOT EXISTS prebuilt_paper_id UUID REFERENCES prebuilt_papers(id),
      ADD COLUMN IF NOT EXISTS difficulty TEXT,
      ADD COLUMN IF NOT EXISTS created_from TEXT;

    ALTER TABLE papers DROP CONSTRAINT IF EXISTS papers_difficulty_check;
    ALTER TABLE papers DROP CONSTRAINT IF EXISTS papers_created_from_check;
    ALTER TABLE papers
      ADD CONSTRAINT papers_difficulty_check CHECK (difficulty IS NULL OR difficulty IN ('easy', 'medium', 'hard')),
      ADD CONSTRAINT papers_created_from_check CHECK (created_from IS NULL OR created_from IN ('self_practice', 'assignment'));

    ALTER TABLE assignments
      ADD COLUMN IF NOT EXISTS prebuilt_paper_id UUID REFERENCES prebuilt_papers(id);
  `);
}

export async function down(pool: pg.Pool): Promise<void> {
  await pool.query(`
    ALTER TABLE assignments DROP COLUMN IF EXISTS prebuilt_paper_id;

    ALTER TABLE papers DROP CONSTRAINT IF EXISTS papers_created_from_check;
    ALTER TABLE papers DROP CONSTRAINT IF EXISTS papers_difficulty_check;
    ALTER TABLE papers
      DROP COLUMN IF EXISTS created_from,
      DROP COLUMN IF EXISTS difficulty,
      DROP COLUMN IF EXISTS prebuilt_paper_id;

    ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_status_check;
    ALTER TABLE questions
      ADD CONSTRAINT questions_status_check
      CHECK (status IN ('draft', 'active', 'retired', 'rejected'));
    ALTER TABLE questions
      DROP COLUMN IF EXISTS archived_at,
      DROP COLUMN IF EXISTS published_at;

    DROP TABLE IF EXISTS prebuilt_paper_slots CASCADE;
    DROP TABLE IF EXISTS prebuilt_papers CASCADE;
    DROP TABLE IF EXISTS import_batches CASCADE;
  `);
}
