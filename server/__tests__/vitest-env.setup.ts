/**
 * Vitest setup file. It runs before test modules load.
 *
 * Keep this file synchronous. Some focused tests mock routes and database
 * modules, so global Redis/database bootstrap would make those tests depend on
 * services they do not exercise.
 */
import fs from "node:fs";
import path from "node:path";

import dotenv from "dotenv";

function findEnvFile(startDir: string): string | undefined {
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

  return undefined;
}

const envFile = findEnvFile(process.cwd());
if (envFile) {
  dotenv.config({ path: envFile });
}

process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgres://round1:round1@127.0.0.1:5432/round1_test";
process.env.SESSION_SECRET ??= "test-session-secret-at-least-16";
process.env.TOTP_ENCRYPTION_KEK ??= "test-totp-kek-at-least-16";

// z.coerce.boolean() treats any non-empty string as true.
process.env.SESSION_COOKIE_SECURE = "";
process.env.AUTH_POW_ENABLED = "false";
