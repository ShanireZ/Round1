import type pg from "pg";

export const name = "010_drop_bucket_stats_tables";

export async function up(pool: pg.Pool): Promise<void> {
  await pool.query(`
    DROP TABLE IF EXISTS bucket_slot_counters CASCADE;
    DROP TABLE IF EXISTS question_bucket_stats CASCADE;
  `);
}

export async function down(pool: pg.Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE question_bucket_stats (
      question_id UUID NOT NULL REFERENCES questions(id),
      exam_type TEXT NOT NULL,
      final_seen_count INTEGER NOT NULL DEFAULT 0,
      participation_rate_snapshot REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (question_id, exam_type),
      CONSTRAINT question_bucket_stats_exam_type_check CHECK (exam_type IN ('CSP-J','CSP-S','GESP-1','GESP-2','GESP-3','GESP-4','GESP-5','GESP-6','GESP-7','GESP-8')),
      CONSTRAINT question_bucket_stats_status_check CHECK (status IN ('active', 'retired'))
    );

    CREATE TABLE bucket_slot_counters (
      exam_type TEXT NOT NULL,
      question_type TEXT NOT NULL,
      primary_kp_id INTEGER NOT NULL REFERENCES knowledge_points(id),
      difficulty TEXT NOT NULL,
      total_slot_count INTEGER NOT NULL DEFAULT 0,
      active_question_count INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (exam_type, question_type, primary_kp_id, difficulty)
    );
  `);
}