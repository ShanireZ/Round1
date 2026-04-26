import type pg from "pg";

export const name = "002_question_bank";

export async function up(pool: pg.Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE knowledge_points (
      id SERIAL PRIMARY KEY,
      code VARCHAR(50) NOT NULL UNIQUE,
      name VARCHAR(200) NOT NULL,
      category TEXT NOT NULL,
      parent_id INTEGER REFERENCES knowledge_points(id),
      blueprint_weight INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE questions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      type TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      primary_kp_id INTEGER NOT NULL REFERENCES knowledge_points(id),
      content_json JSONB NOT NULL,
      answer_json JSONB NOT NULL,
      explanation_json JSONB NOT NULL,
      content_hash VARCHAR(64) NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'draft',
      sandbox_verified BOOLEAN NOT NULL DEFAULT false,
      source TEXT NOT NULL DEFAULT 'ai',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT questions_type_check CHECK (type IN ('single_choice', 'reading_program', 'completion_program')),
      CONSTRAINT questions_difficulty_check CHECK (difficulty IN ('easy', 'medium', 'hard')),
      CONSTRAINT questions_status_check CHECK (status IN ('draft', 'active', 'retired', 'rejected')),
      CONSTRAINT questions_source_check CHECK (source IN ('ai', 'manual', 'real_paper'))
    );
    CREATE INDEX questions_composite_idx ON questions (status, type, primary_kp_id, difficulty);

    CREATE TABLE question_reviews (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      question_id UUID NOT NULL REFERENCES questions(id),
      review_status TEXT NOT NULL DEFAULT 'pending',
      ai_confidence REAL,
      official_answer_diff JSONB,
      reviewer_notes TEXT,
      reviewed_by UUID REFERENCES users(id),
      reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT question_reviews_status_check CHECK (review_status IN ('pending', 'ai_reviewed', 'confirmed', 'rejected'))
    );

    CREATE TABLE question_exam_types (
      question_id UUID NOT NULL REFERENCES questions(id),
      exam_type TEXT NOT NULL,
      PRIMARY KEY (question_id, exam_type),
      CONSTRAINT question_exam_types_exam_type_check CHECK (exam_type IN ('CSP-J','CSP-S','GESP-1','GESP-2','GESP-3','GESP-4','GESP-5','GESP-6','GESP-7','GESP-8'))
    );

    CREATE TABLE question_kp_tags (
      question_id UUID NOT NULL REFERENCES questions(id),
      kp_id INTEGER NOT NULL REFERENCES knowledge_points(id),
      tag_role TEXT NOT NULL DEFAULT 'primary',
      PRIMARY KEY (question_id, kp_id),
      CONSTRAINT question_kp_tags_role_check CHECK (tag_role IN ('primary', 'secondary'))
    );

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

export async function down(pool: pg.Pool): Promise<void> {
  await pool.query(`
    DROP TABLE IF EXISTS bucket_slot_counters CASCADE;
    DROP TABLE IF EXISTS question_bucket_stats CASCADE;
    DROP TABLE IF EXISTS question_kp_tags CASCADE;
    DROP TABLE IF EXISTS question_exam_types CASCADE;
    DROP TABLE IF EXISTS question_reviews CASCADE;
    DROP TABLE IF EXISTS questions CASCADE;
    DROP TABLE IF EXISTS knowledge_points CASCADE;
  `);
}
