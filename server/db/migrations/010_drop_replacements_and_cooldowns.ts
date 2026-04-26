import type pg from "pg";

export const name = "010_drop_replacements_and_cooldowns";

export async function up(pool: pg.Pool): Promise<void> {
  await pool.query(`
    DROP TABLE IF EXISTS exam_cooldowns CASCADE;
    DROP TABLE IF EXISTS paper_question_replacements CASCADE;

    ALTER TABLE papers DROP CONSTRAINT IF EXISTS papers_replacement_count_check;
    ALTER TABLE papers DROP COLUMN IF EXISTS replacement_count;
  `);
}

export async function down(pool: pg.Pool): Promise<void> {
  await pool.query(`
    ALTER TABLE papers
      ADD COLUMN IF NOT EXISTS replacement_count INTEGER NOT NULL DEFAULT 0;

    ALTER TABLE papers DROP CONSTRAINT IF EXISTS papers_replacement_count_check;
    ALTER TABLE papers
      ADD CONSTRAINT papers_replacement_count_check CHECK (replacement_count <= 9);

    CREATE TABLE IF NOT EXISTS paper_question_replacements (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      paper_id UUID NOT NULL REFERENCES papers(id),
      slot_no INTEGER NOT NULL,
      from_question_id UUID NOT NULL REFERENCES questions(id),
      to_question_id UUID NOT NULL REFERENCES questions(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS exam_cooldowns (
      user_id UUID PRIMARY KEY REFERENCES users(id),
      last_exam_at TIMESTAMPTZ NOT NULL
    );
  `);
}