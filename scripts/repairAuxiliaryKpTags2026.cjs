#!/usr/bin/env node
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");

const REPORT_DIR = path.join(
  "artifacts",
  "reports",
  "2026",
  "2026-05-02T02-05-46-784Z",
);

const REPAIRS = [
  {
    file: path.join(
      "papers",
      "2026",
      "2026-05-01-bulk4000-a01-b0261-gesp-7-hard-v01",
      "question-bundles",
      "2026-05-01-bulk4000-a01-b0261-gesp-7-hard-v01__question-bundle__single-choice__cpp__n5__v01.json",
    ),
    updates: [
      { itemIndex: 0, auxiliaryKpCodes: ["CPP-13"] },
      { itemIndex: 1, auxiliaryKpCodes: ["CPP-13"] },
      { itemIndex: 3, auxiliaryKpCodes: ["CPP-07"] },
      { itemIndex: 4, auxiliaryKpCodes: ["CPP-08"] },
    ],
  },
  {
    file: path.join(
      "papers",
      "2026",
      "2026-05-01-bulk4000-a03-b0363-csp-s-hard-v01",
      "question-bundles",
      "2026-05-01-bulk4000-a03-b0363-csp-s-hard-v01__question-bundle__single-choice__ds__n5__v01.json",
    ),
    updates: [
      { itemIndex: 0, auxiliaryKpCodes: ["ALG-16"] },
      { itemIndex: 1, auxiliaryKpCodes: ["DS-09"] },
      { itemIndex: 2, auxiliaryKpCodes: ["DS-17", "CPP-05"] },
      { itemIndex: 3, auxiliaryKpCodes: ["DS-13", "DS-04"] },
      { itemIndex: 4, auxiliaryKpCodes: ["DS-04"] },
    ],
  },
];

function readArg(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function readEnv(startDir) {
  let current = startDir;
  for (let depth = 0; depth < 4; depth += 1) {
    const candidate = path.join(current, ".env");
    if (fs.existsSync(candidate)) {
      const env = {};
      for (const line of fs.readFileSync(candidate, "utf8").split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIndex = trimmed.indexOf("=");
        if (eqIndex < 0) continue;
        const key = trimmed.slice(0, eqIndex).trim();
        let value = trimmed.slice(eqIndex + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        env[key] = value;
      }
      return { ...process.env, ...env };
    }

    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return process.env;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",")}}`;
}

function buildIntegrity(items) {
  return {
    algorithm: "sha256",
    generatedAt: new Date().toISOString(),
    itemChecksums: items.map((item, itemIndex) => ({
      itemIndex,
      checksum: sha256(stableStringify(item)),
    })),
  };
}

async function loadKnowledgePointIds(client, codes) {
  const result = await client.query(
    "select id, code from knowledge_points where code = any($1::text[])",
    [[...codes]],
  );
  const ids = new Map(result.rows.map((row) => [row.code, row.id]));
  const missing = [...codes].filter((code) => !ids.has(code));
  if (missing.length > 0) {
    throw new Error(`Unknown replacement knowledge point codes: ${missing.join(", ")}`);
  }
  return ids;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const cwd = process.cwd();
  const reportPath =
    readArg(process.argv, "--report") ??
    path.join(REPORT_DIR, `auxiliary-kp-repair-2026${apply ? "" : "-dry-run"}.json`);

  const replacementCodes = new Set(
    REPAIRS.flatMap((repair) => repair.updates.flatMap((update) => update.auxiliaryKpCodes)),
  );
  const env = readEnv(cwd);
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is not set");

  const pool = new Pool({ connectionString: env.DATABASE_URL });
  const client = await pool.connect();
  const report = {
    generatedAt: new Date().toISOString(),
    mode: apply ? "apply" : "dry_run",
    updatedFiles: [],
    updatedQuestions: [],
    db: {
      insertedSecondaryTags: 0,
      existingSecondaryTags: 0,
      updatedImportBatches: 0,
      insertedReviewRows: 0,
    },
  };

  try {
    await client.query("begin");
    const kpIds = await loadKnowledgePointIds(client, replacementCodes);

    for (const repair of REPAIRS) {
      const absolutePath = path.resolve(cwd, repair.file);
      const beforeRaw = fs.readFileSync(absolutePath, "utf8");
      const bundle = JSON.parse(beforeRaw);
      const beforeChecksum = sha256(beforeRaw);
      const itemSummaries = [];

      for (const update of repair.updates) {
        const item = bundle.items[update.itemIndex];
        if (!item) {
          throw new Error(`Missing item ${update.itemIndex} in ${repair.file}`);
        }
        const previousAuxiliaryKpCodes = item.auxiliaryKpCodes ?? [];
        item.auxiliaryKpCodes = [...new Set(update.auxiliaryKpCodes)];

        const questionResult = await client.query(
          "select id from questions where content_hash = $1 limit 1",
          [item.contentHash],
        );
        const questionId = questionResult.rows[0]?.id;
        if (!questionId) {
          throw new Error(`No imported question found for ${repair.file}#${update.itemIndex}`);
        }

        for (const kpCode of item.auxiliaryKpCodes) {
          const insertResult = await client.query(
            `insert into question_kp_tags (question_id, kp_id, tag_role)
             values ($1, $2, 'secondary')
             on conflict do nothing`,
            [questionId, kpIds.get(kpCode)],
          );
          if (insertResult.rowCount === 0) {
            report.db.existingSecondaryTags += 1;
          } else {
            report.db.insertedSecondaryTags += 1;
          }
        }

        await client.query("update questions set updated_at = now() where id = $1", [questionId]);
        await client.query(
          `insert into question_reviews
             (question_id, review_status, ai_confidence, reviewer_notes, reviewed_at)
           values ($1, 'confirmed', 1, $2, now())`,
          [
            questionId,
            `2026 auxiliary knowledge point metadata repair: ${previousAuxiliaryKpCodes.join(
              ",",
            )} -> ${item.auxiliaryKpCodes.join(",")}`,
          ],
        );
        report.db.insertedReviewRows += 1;

        const summary = {
          file: repair.file.replaceAll(path.sep, "/"),
          itemIndex: update.itemIndex,
          questionId,
          previousAuxiliaryKpCodes,
          auxiliaryKpCodes: item.auxiliaryKpCodes,
          contentHash: item.contentHash,
        };
        itemSummaries.push(summary);
        report.updatedQuestions.push(summary);
      }

      bundle.meta.integrity = buildIntegrity(bundle.items);
      const afterRaw = `${JSON.stringify(bundle, null, 2)}\n`;
      const afterChecksum = sha256(afterRaw);

      if (apply) {
        fs.writeFileSync(absolutePath, afterRaw, "utf8");
        const batchResult = await client.query(
          `update import_batches
           set checksum = $1,
               summary_json = jsonb_set(
                 summary_json,
                 '{auxiliaryKpRepair}',
                 $2::jsonb,
                 true
               ),
               updated_at = now()
           where bundle_type = 'question_bundle'
             and status = 'applied'
             and source_filename = $3`,
          [
            afterChecksum,
            JSON.stringify({
              repairedAt: new Date().toISOString(),
              beforeChecksum,
              afterChecksum,
              updatedItems: itemSummaries.map((entry) => ({
                itemIndex: entry.itemIndex,
                auxiliaryKpCodes: entry.auxiliaryKpCodes,
              })),
            }),
            path.basename(absolutePath),
          ],
        );
        report.db.updatedImportBatches += batchResult.rowCount;
      }

      report.updatedFiles.push({
        file: repair.file.replaceAll(path.sep, "/"),
        beforeChecksum,
        afterChecksum,
        updatedItems: itemSummaries,
      });
    }

    if (apply) {
      await client.query("commit");
    } else {
      await client.query("rollback");
    }
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }

  fs.mkdirSync(path.dirname(path.resolve(cwd, reportPath)), { recursive: true });
  fs.writeFileSync(path.resolve(cwd, reportPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(
    JSON.stringify({
      reportPath: reportPath.replaceAll(path.sep, "/"),
      mode: report.mode,
      updatedFiles: report.updatedFiles.length,
      updatedQuestions: report.updatedQuestions.length,
      db: report.db,
    }),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
