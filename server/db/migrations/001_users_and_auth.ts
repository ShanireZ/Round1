import type pg from "pg";

export const name = "001_users_and_auth";

export async function up(pool: pg.Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      username VARCHAR(50) NOT NULL UNIQUE,
      display_name VARCHAR(100) NOT NULL,
      password_hash TEXT,
      role TEXT NOT NULL DEFAULT 'student',
      session_version INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'active',
      deleted_at TIMESTAMPTZ,
      last_strong_auth_at TIMESTAMPTZ,
      totp_secret_enc TEXT,
      totp_enabled_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT users_role_check CHECK (role IN ('student', 'coach', 'admin')),
      CONSTRAINT users_status_check CHECK (status IN ('active', 'locked', 'deleted'))
    );
    CREATE INDEX users_username_idx ON users (username);

    CREATE TABLE user_emails (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id),
      email VARCHAR(255) NOT NULL UNIQUE,
      verified_at TIMESTAMPTZ,
      source TEXT NOT NULL DEFAULT 'registration',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX user_emails_email_idx ON user_emails (email);
    CREATE UNIQUE INDEX user_emails_user_id_idx ON user_emails (user_id);

    CREATE TABLE external_identities (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id),
      provider TEXT NOT NULL,
      provider_type TEXT NOT NULL,
      provider_user_id TEXT NOT NULL,
      provider_email TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX external_identities_provider_user_idx ON external_identities (provider, provider_user_id);

    CREATE TABLE passkey_credentials (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id),
      credential_id TEXT NOT NULL UNIQUE,
      public_key TEXT NOT NULL,
      counter INTEGER NOT NULL DEFAULT 0,
      transports_json JSONB,
      backup_eligible BOOLEAN NOT NULL DEFAULT false,
      backup_state BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX passkey_credentials_credential_id_idx ON passkey_credentials (credential_id);

    CREATE TABLE auth_challenges (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      flow TEXT NOT NULL,
      email VARCHAR(255) NOT NULL,
      code_hash TEXT NOT NULL,
      link_token_hash TEXT,
      expires_at TIMESTAMPTZ NOT NULL,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX auth_challenges_email_flow_idx ON auth_challenges (email, flow, created_at);
    CREATE INDEX auth_challenges_link_token_hash_idx ON auth_challenges (link_token_hash);

    CREATE TABLE auth_tickets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      challenge_id UUID NOT NULL REFERENCES auth_challenges(id),
      flow TEXT NOT NULL,
      ticket_hash TEXT NOT NULL UNIQUE,
      payload_json JSONB,
      expires_at TIMESTAMPTZ NOT NULL,
      consumed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX auth_tickets_ticket_hash_idx ON auth_tickets (ticket_hash);

    CREATE TABLE auth_audit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id),
      action TEXT NOT NULL,
      identifier_hash TEXT,
      provider TEXT,
      ip TEXT NOT NULL,
      device_id_hash TEXT,
      risk_score INTEGER,
      result TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX auth_audit_logs_user_created_idx ON auth_audit_logs (user_id, created_at);
  `);
}

export async function down(pool: pg.Pool): Promise<void> {
  await pool.query(`
    DROP TABLE IF EXISTS auth_audit_logs CASCADE;
    DROP TABLE IF EXISTS auth_tickets CASCADE;
    DROP TABLE IF EXISTS auth_challenges CASCADE;
    DROP TABLE IF EXISTS passkey_credentials CASCADE;
    DROP TABLE IF EXISTS external_identities CASCADE;
    DROP TABLE IF EXISTS user_emails CASCADE;
    DROP TABLE IF EXISTS users CASCADE;
  `);
}
