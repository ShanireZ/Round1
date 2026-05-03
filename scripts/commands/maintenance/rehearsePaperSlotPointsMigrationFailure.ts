import { fileURLToPath } from "node:url";

import type { PoolClient } from "pg";

import { pool } from "../../../server/db.js";
import { up as migrate013Up } from "../../../server/db/migrations/013_add_paper_question_slot_points.js";

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

export async function rehearsePaperSlotPointsMigrationFailure(): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await createTempFixture(client);

    try {
      await migrate013Up(client as never);
      throw new Error("Paper slot points migration unexpectedly succeeded on incomplete history");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes(EXPECTED_ERROR)) {
        throw error;
      }

      console.log(`Observed expected paper slot points migration failure: ${message}`);
    }
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
    await pool.end();
  }
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);

if (isDirectRun) {
  rehearsePaperSlotPointsMigrationFailure().catch((error) => {
    console.error(
      error instanceof Error
        ? error.message
        : "Paper slot points migration failure rehearsal crashed",
    );
    process.exitCode = 1;
  });
}
