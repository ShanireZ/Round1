import argon2 from "argon2";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

import { validatePasswordStrength } from "../server/services/auth/passwordPolicy.js";

const ADMIN_USERNAME = "elder";
const ADMIN_DISPLAY_NAME = "elder";
const PASSWORD_ENV = "ROUND1_INITIAL_ADMIN_PASSWORD";

function findNearestEnvFile(startDir: string): string {
  let current = startDir;

  for (let depth = 0; depth < 4; depth += 1) {
    const candidate = path.join(current, ".env");
    if (fs.existsSync(candidate)) {
      return candidate;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return path.join(startDir, ".env");
}

function printUsage(): void {
  console.log(`Usage: ROUND1_INITIAL_ADMIN_PASSWORD=<temporary-password> npx tsx scripts/initAdmin.ts [--dry-run] [--rotate]

Bootstraps the first Round1 admin account:
  username: ${ADMIN_USERNAME}
  role: admin
  passwordChangeRequired: true

Options:
  --dry-run   Validate inputs and report the planned action without writing.
  --rotate    Rotate the bootstrap password for an existing elder admin.
  --help      Show this help.

The password is never printed. Remove ${PASSWORD_ENV} from the environment after the first login password change.`);
}

const args = new Set(process.argv.slice(2));
if (args.has("--help") || args.has("-h")) {
  printUsage();
  process.exit(0);
}

const dryRun = args.has("--dry-run");
const rotate = args.has("--rotate");

dotenv.config({ path: findNearestEnvFile(path.resolve(import.meta.dirname, "..")) });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const initialPassword = process.env[PASSWORD_ENV];
if (!initialPassword) {
  console.error(`${PASSWORD_ENV} is required and must not be committed to the repository.`);
  process.exit(1);
}

const passwordStrength = validatePasswordStrength({
  password: initialPassword,
  role: "admin",
  username: ADMIN_USERNAME,
  displayName: ADMIN_DISPLAY_NAME,
});

if (!passwordStrength.ok) {
  console.error(
    `Initial admin password is too weak. Required: length >= ${passwordStrength.minLength}, zxcvbn score >= ${passwordStrength.minScore}.`,
  );
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: databaseUrl,
  max: 1,
  application_name: "round1-init-admin",
});

type UserRow = {
  id: string;
  username: string;
  role: string;
  status: string;
  password_change_required: boolean;
};

async function main(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const admins = await client.query<UserRow>(
      `
        SELECT id, username, role, status, password_change_required
        FROM users
        WHERE role = 'admin' AND status <> 'deleted'
        ORDER BY created_at ASC
      `,
    );

    const elder = await client.query<UserRow>(
      `
        SELECT id, username, role, status, password_change_required
        FROM users
        WHERE username = $1
        LIMIT 1
      `,
      [ADMIN_USERNAME],
    );

    const elderRow = elder.rows[0];
    const elderIsActiveAdmin = elderRow?.role === "admin" && elderRow.status !== "deleted";
    const activeAdminUsernames = admins.rows.map((row) => row.username);

    if (admins.rows.length > 0 && !elderIsActiveAdmin) {
      throw new Error(
        `Active admin already exists (${activeAdminUsernames.join(", ")}). This script only bootstraps the first admin.`,
      );
    }

    if (elderIsActiveAdmin && !rotate) {
      console.log(
        `No changes needed: ${ADMIN_USERNAME} is already an active admin. Use --rotate to set a new temporary password.`,
      );
      await client.query("ROLLBACK");
      return;
    }

    const passwordHash = await argon2.hash(initialPassword, { type: argon2.argon2id });

    if (dryRun) {
      const action = elderRow ? "promote/update existing elder" : "create elder";
      console.log(
        `DRY RUN: would ${action} with role=admin and passwordChangeRequired=true.`,
      );
      await client.query("ROLLBACK");
      return;
    }

    if (elderRow) {
      await client.query(
        `
          UPDATE users
          SET
            role = 'admin',
            status = 'active',
            deleted_at = NULL,
            password_hash = $2,
            password_change_required = true,
            session_version = session_version + 1,
            updated_at = now()
          WHERE id = $1
        `,
        [elderRow.id, passwordHash],
      );
    } else {
      await client.query(
        `
          INSERT INTO users (
            username,
            display_name,
            password_hash,
            password_change_required,
            role,
            status
          )
          VALUES ($1, $2, $3, true, 'admin', 'active')
        `,
        [ADMIN_USERNAME, ADMIN_DISPLAY_NAME, passwordHash],
      );
    }

    await client.query("COMMIT");
    console.log(
      `Admin bootstrap complete: username=${ADMIN_USERNAME}, role=admin, passwordChangeRequired=true.`,
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
