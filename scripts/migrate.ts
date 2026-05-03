import dotenv from "dotenv";
import pg from "pg";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import fs from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

dotenv.config({ path: findNearestEnvFile(path.resolve(__dirname, "..")) });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  max: 2,
  application_name: "round1-migrate",
});

interface Migration {
  name: string;
  aliases: string[];
  up: (pool: pg.Pool) => Promise<void>;
  down: (pool: pg.Pool) => Promise<void>;
}

const MIGRATIONS_DIR = path.resolve(__dirname, "../server/db/migrations");

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function getAppliedMigrations(): Promise<Set<string>> {
  const result = await pool.query<{ name: string }>(
    "SELECT name FROM schema_migrations ORDER BY id",
  );
  return new Set(result.rows.map((r) => r.name));
}

async function loadMigrations(): Promise<Migration[]> {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".ts") || f.endsWith(".js"))
    .sort();

  const migrations: Migration[] = [];
  for (const file of files) {
    const filePath = path.join(MIGRATIONS_DIR, file);
    const fileUrl = pathToFileURL(filePath).href;
    const mod = await import(fileUrl);
    migrations.push({
      name: mod.name || file.replace(/\.[tj]s$/, ""),
      aliases: Array.isArray(mod.aliases)
        ? mod.aliases.filter((alias: unknown): alias is string => typeof alias === "string")
        : [],
      up: mod.up,
      down: mod.down,
    });
  }
  return migrations;
}

function isMigrationApplied(migration: Migration, applied: Set<string>): boolean {
  return applied.has(migration.name) || migration.aliases.some((alias) => applied.has(alias));
}

function findMigrationByRecordedName(
  migrations: Migration[],
  recordedName: string,
): Migration | undefined {
  return migrations.find(
    (migration) => migration.name === recordedName || migration.aliases.includes(recordedName),
  );
}

async function up(): Promise<void> {
  await ensureMigrationsTable();
  const applied = await getAppliedMigrations();
  const migrations = await loadMigrations();

  let count = 0;
  for (const migration of migrations) {
    if (isMigrationApplied(migration, applied)) continue;

    console.log(`Applying migration: ${migration.name}`);
    const start = performance.now();
    await migration.up(pool);
    await pool.query("INSERT INTO schema_migrations (name) VALUES ($1)", [migration.name]);
    const elapsed = (performance.now() - start).toFixed(1);
    console.log(`  ✓ ${migration.name} (${elapsed}ms)`);
    count++;
  }

  if (count === 0) {
    console.log("All migrations are up to date.");
  } else {
    console.log(`Applied ${count} migration(s).`);
  }
}

async function down(): Promise<void> {
  await ensureMigrationsTable();
  const applied = await getAppliedMigrations();
  const migrations = await loadMigrations();

  // Find the last applied migration to roll back
  const appliedList = [...applied];
  const lastApplied = appliedList[appliedList.length - 1];
  if (!lastApplied) {
    console.log("No migrations to roll back.");
    return;
  }

  const migration = findMigrationByRecordedName(migrations, lastApplied);
  if (!migration) {
    console.error(`Migration file not found for: ${lastApplied}`);
    process.exit(1);
  }

  console.log(`Rolling back migration: ${migration.name}`);
  const start = performance.now();
  await migration.down(pool);
  await pool.query("DELETE FROM schema_migrations WHERE name = $1", [lastApplied]);
  const elapsed = (performance.now() - start).toFixed(1);
  console.log(`  ✓ Rolled back ${migration.name} (${elapsed}ms)`);
}

async function status(): Promise<void> {
  await ensureMigrationsTable();
  const applied = await getAppliedMigrations();
  const migrations = await loadMigrations();

  console.log("\nMigration Status:");
  console.log("─".repeat(60));
  for (const migration of migrations) {
    const mark = isMigrationApplied(migration, applied) ? "✓" : "✗";
    console.log(`  ${mark} ${migration.name}`);
  }
  console.log("─".repeat(60));
  const appliedCount = migrations.filter((migration) =>
    isMigrationApplied(migration, applied),
  ).length;
  console.log(`  ${appliedCount}/${migrations.length} applied\n`);
}

async function main(): Promise<void> {
  const command = process.argv[2] || "up";

  try {
    switch (command) {
      case "up":
        await up();
        break;
      case "down":
        await down();
        break;
      case "status":
        await status();
        break;
      default:
        console.error(`Unknown command: ${command}`);
        console.error("Usage: migrate.ts [up|down|status]");
        process.exit(1);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
