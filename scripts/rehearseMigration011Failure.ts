import { fileURLToPath } from "node:url";

import type { PoolClient } from "pg";

import { pool } from "../server/db.js";
import { up as migrate011Up } from "../server/db/migrations/011_add_paper_question_slot_points.js";

const EXPECTED_ERROR = "paper_question_slots.points backfill incomplete";

async function createTempFixture(client: PoolClient) {
  await client.query(`
    CREATE TEMP TABLE papers (
      id UUID PRIMARY KEY,
      prebuilt_paper_id UUID
    ) ON COMMIT DROP;

    CREATE TEMP TABLE prebuilt_paper_slots (
      prebuilt_paper_id UUID NOT NULL,
      slot_no INTEGER NOT NULL,
      points INTEGER NOT NULL
    ) ON COMMIT DROP;

    CREATE TEMP TABLE paper_question_slots (
      paper_id UUID NOT NULL,
      slot_no INTEGER NOT NULL
    ) ON COMMIT DROP;
  `);

  await client.query(`
    INSERT INTO papers (id, prebuilt_paper_id)
    VALUES ('00000000-0000-0000-0000-000000000011', NULL);

    INSERT INTO paper_question_slots (paper_id, slot_no)
    VALUES ('00000000-0000-0000-0000-000000000011', 1);
  `);
}

export async function rehearseMigration011Failure(): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await createTempFixture(client);

    try {
      await migrate011Up(client as never);
      throw new Error("Migration 011 unexpectedly succeeded on incomplete historical slot points");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes(EXPECTED_ERROR)) {
        throw error;
      }

      console.log(`Observed expected migration 011 failure: ${message}`);
    }
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
    await pool.end();
  }
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);

if (isDirectRun) {
  rehearseMigration011Failure().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Migration 011 failure rehearsal crashed",
    );
    process.exitCode = 1;
  });
}
