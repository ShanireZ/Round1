import type pg from "pg";

export const name = "004_classes_and_assignments";

export async function up(pool: pg.Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE classes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(100) NOT NULL,
      join_code VARCHAR(20) NOT NULL UNIQUE,
      archived_at TIMESTAMPTZ,
      created_by UUID NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX classes_join_code_idx ON classes (join_code);

    CREATE TABLE class_coaches (
      class_id UUID NOT NULL REFERENCES classes(id),
      user_id UUID NOT NULL REFERENCES users(id),
      role TEXT NOT NULL DEFAULT 'collaborator',
      added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (class_id, user_id),
      CONSTRAINT class_coaches_role_check CHECK (role IN ('owner', 'collaborator'))
    );
    CREATE INDEX class_coaches_class_id_idx ON class_coaches (class_id);
    CREATE INDEX class_coaches_user_id_idx ON class_coaches (user_id);

    CREATE TABLE class_invites (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      class_id UUID NOT NULL REFERENCES classes(id),
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      max_uses INTEGER NOT NULL DEFAULT 50,
      use_count INTEGER NOT NULL DEFAULT 0,
      revoked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX class_invites_token_hash_idx ON class_invites (token_hash);

    CREATE TABLE class_members (
      class_id UUID NOT NULL REFERENCES classes(id),
      user_id UUID NOT NULL REFERENCES users(id),
      joined_via TEXT NOT NULL DEFAULT 'code',
      joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (class_id, user_id),
      CONSTRAINT class_members_joined_via_check CHECK (joined_via IN ('code', 'invite_link'))
    );

    CREATE TABLE assignments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      class_id UUID NOT NULL REFERENCES classes(id),
      created_by UUID NOT NULL REFERENCES users(id),
      title VARCHAR(200) NOT NULL,
      mode TEXT NOT NULL DEFAULT 'free',
      exam_type TEXT NOT NULL,
      blueprint_version INTEGER NOT NULL,
      due_at TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'assigned',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT assignments_mode_check CHECK (mode IN ('free', 'timed')),
      CONSTRAINT assignments_exam_type_check CHECK (exam_type IN ('CSP-J','CSP-S','GESP-1','GESP-2','GESP-3','GESP-4','GESP-5','GESP-6','GESP-7','GESP-8')),
      CONSTRAINT assignments_status_check CHECK (status IN ('assigned', 'closed'))
    );

    CREATE TABLE assignment_progress (
      assignment_id UUID NOT NULL REFERENCES assignments(id),
      user_id UUID NOT NULL REFERENCES users(id),
      paper_id UUID REFERENCES papers(id),
      attempt_id UUID REFERENCES attempts(id),
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (assignment_id, user_id),
      CONSTRAINT assignment_progress_status_check CHECK (status IN ('pending', 'in_progress', 'completed', 'missed'))
    );

    -- Add FK for papers.assignment_id now that assignments table exists
    ALTER TABLE papers ADD CONSTRAINT papers_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES assignments(id);
  `);
}

export async function down(pool: pg.Pool): Promise<void> {
  await pool.query(`
    ALTER TABLE papers DROP CONSTRAINT IF EXISTS papers_assignment_id_fkey;
    DROP TABLE IF EXISTS assignment_progress CASCADE;
    DROP TABLE IF EXISTS assignments CASCADE;
    DROP TABLE IF EXISTS class_members CASCADE;
    DROP TABLE IF EXISTS class_invites CASCADE;
    DROP TABLE IF EXISTS class_coaches CASCADE;
    DROP TABLE IF EXISTS classes CASCADE;
  `);
}
