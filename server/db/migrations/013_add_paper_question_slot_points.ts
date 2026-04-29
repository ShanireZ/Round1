import type pg from "pg";

export const name = "013_add_paper_question_slot_points";
export const aliases = ["011_add_paper_question_slot_points"];

export async function up(pool: pg.Pool): Promise<void> {
  await pool.query(`
    ALTER TABLE paper_question_slots
      ADD COLUMN IF NOT EXISTS points INTEGER;

    UPDATE paper_question_slots pqs
    SET points = (
      SELECT pps.points
      FROM papers p
      JOIN prebuilt_paper_slots pps
        ON p.prebuilt_paper_id = pps.prebuilt_paper_id
      WHERE p.id = pqs.paper_id
        AND pps.slot_no = pqs.slot_no
      LIMIT 1
    )
    WHERE pqs.points IS NULL;

    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM paper_question_slots
        WHERE points IS NULL
      ) THEN
        RAISE EXCEPTION 'paper_question_slots.points backfill incomplete';
      END IF;
    END $$;

    ALTER TABLE paper_question_slots
      ALTER COLUMN points DROP DEFAULT,
      ALTER COLUMN points SET NOT NULL;

    ALTER TABLE paper_question_slots
      DROP CONSTRAINT IF EXISTS paper_question_slots_points_check;

    ALTER TABLE paper_question_slots
      ADD CONSTRAINT paper_question_slots_points_check CHECK (points > 0);
  `);
}

export async function down(pool: pg.Pool): Promise<void> {
  await pool.query(`
    ALTER TABLE paper_question_slots
      DROP CONSTRAINT IF EXISTS paper_question_slots_points_check;

    ALTER TABLE paper_question_slots
      DROP COLUMN IF EXISTS points;
  `);
}
