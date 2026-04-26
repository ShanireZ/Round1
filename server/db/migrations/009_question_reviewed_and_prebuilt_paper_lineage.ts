import type pg from "pg";

export const name = "009_question_reviewed_and_prebuilt_paper_lineage";

export async function up(pool: pg.Pool): Promise<void> {
  await pool.query(`
    UPDATE questions
      SET status = 'reviewed'
      WHERE status = 'active';

    UPDATE questions
      SET status = 'archived',
          archived_at = COALESCE(archived_at, now())
      WHERE status IN ('retired', 'rejected');

    ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_status_check;
    ALTER TABLE questions
      ADD CONSTRAINT questions_status_check
      CHECK (status IN ('draft', 'reviewed', 'published', 'archived'));

    ALTER TABLE prebuilt_papers
      ADD COLUMN IF NOT EXISTS root_paper_id UUID,
      ADD COLUMN IF NOT EXISTS parent_paper_id UUID,
      ADD COLUMN IF NOT EXISTS version_no INTEGER NOT NULL DEFAULT 1;

    UPDATE prebuilt_papers
      SET root_paper_id = id
      WHERE root_paper_id IS NULL;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'prebuilt_papers_root_paper_id_fkey'
      ) THEN
        ALTER TABLE prebuilt_papers
          ADD CONSTRAINT prebuilt_papers_root_paper_id_fkey
          FOREIGN KEY (root_paper_id) REFERENCES prebuilt_papers(id);
      END IF;
    END $$;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'prebuilt_papers_parent_paper_id_fkey'
      ) THEN
        ALTER TABLE prebuilt_papers
          ADD CONSTRAINT prebuilt_papers_parent_paper_id_fkey
          FOREIGN KEY (parent_paper_id) REFERENCES prebuilt_papers(id);
      END IF;
    END $$;

    ALTER TABLE prebuilt_papers
      ALTER COLUMN root_paper_id SET NOT NULL;

    ALTER TABLE prebuilt_papers DROP CONSTRAINT IF EXISTS prebuilt_papers_version_no_check;
    ALTER TABLE prebuilt_papers
      ADD CONSTRAINT prebuilt_papers_version_no_check CHECK (version_no > 0);

    CREATE UNIQUE INDEX IF NOT EXISTS prebuilt_papers_root_paper_version_no_idx
      ON prebuilt_papers (root_paper_id, version_no);
  `);
}

export async function down(pool: pg.Pool): Promise<void> {
  await pool.query(`
    DROP INDEX IF EXISTS prebuilt_papers_root_paper_version_no_idx;

    ALTER TABLE prebuilt_papers DROP CONSTRAINT IF EXISTS prebuilt_papers_version_no_check;
    ALTER TABLE prebuilt_papers DROP CONSTRAINT IF EXISTS prebuilt_papers_parent_paper_id_fkey;
    ALTER TABLE prebuilt_papers DROP CONSTRAINT IF EXISTS prebuilt_papers_root_paper_id_fkey;
    ALTER TABLE prebuilt_papers ALTER COLUMN root_paper_id DROP NOT NULL;
    ALTER TABLE prebuilt_papers
      DROP COLUMN IF EXISTS version_no,
      DROP COLUMN IF EXISTS parent_paper_id,
      DROP COLUMN IF EXISTS root_paper_id;

    UPDATE questions
      SET status = 'active'
      WHERE status = 'reviewed';

    ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_status_check;
    ALTER TABLE questions
      ADD CONSTRAINT questions_status_check
      CHECK (status IN ('draft', 'active', 'published', 'archived', 'retired', 'rejected'));
  `);
}
