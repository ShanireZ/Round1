import type pg from "pg";

export const name = "014_users_password_change_required";
export const aliases = ["012_users_password_change_required"];

export async function up(pool: pg.Pool): Promise<void> {
  await pool.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS password_change_required BOOLEAN NOT NULL DEFAULT false;
  `);
}

export async function down(pool: pg.Pool): Promise<void> {
  await pool.query(`
    ALTER TABLE users
      DROP COLUMN IF EXISTS password_change_required;
  `);
}
