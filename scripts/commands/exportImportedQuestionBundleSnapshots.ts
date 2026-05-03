import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { pool } from "../../server/db.js";
import {
  BUNDLE_SCHEMA_VERSION,
  QuestionBundleItemSchema,
  QuestionBundleSchema,
  buildBundleIntegrity,
  buildValidationMetadata,
  computeChecksum,
  type Difficulty,
  type ExamType,
  type QuestionBundle,
  type QuestionBundleItem,
  type QuestionType,
} from "../lib/bundleTypes.js";
import { writeBatchJsonReport } from "../lib/batchWorkflow.js";
import { toDisplayRepoPath } from "../lib/scriptCli.js";

type ArgValue = boolean | string;

const usage = `Usage: tsx scripts/commands/exportImportedQuestionBundleSnapshots.ts --batch-window-start <iso> --batch-window-end <iso> --out <export.json> [options]

Export DB-imported question_bundle rows back into reviewable question bundle snapshots.

Options:
  --batch-window-start <iso>       Inclusive import_batches.created_at lower bound
  --batch-window-end <iso>         Exclusive import_batches.created_at upper bound
  --expected-items <number>        Fail unless the mapped question count matches
  --expected-batches <number>      Fail unless the selected batch count matches
  --out <path>                     Export report path
  --bundle-out-dir <dir>           Snapshot bundle directory (default: <out>__bundles)
  --manifest-out <path>            Manifest path (default: <out>__manifest.json)
  --overwrite                      Replace existing export/manifest/snapshot files
  --help                           Show this help message
`;

interface BatchRow {
  import_batch_id: string;
  source_filename: string;
  import_checksum: string;
  summary_json: unknown;
  total_count: number;
  import_created_at: Date;
}

interface QuestionRow extends BatchRow {
  question_id: string;
  type: QuestionType;
  difficulty: Difficulty;
  primary_kp_id: number;
  primary_kp_code: string;
  content_json: unknown;
  answer_json: unknown;
  explanation_json: unknown;
  content_hash: string;
  status: string;
  sandbox_verified: boolean;
  source: "ai" | "manual" | "real_paper";
  question_created_at: Date;
  exam_types: ExamType[];
  auxiliary_kp_codes: string[];
}

function parseArgs(argv: readonly string[]) {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(usage);
    process.exit(0);
  }

  const args: Record<string, ArgValue> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    const eqIndex = token.indexOf("=");
    if (eqIndex >= 0) {
      args[token.slice(2, eqIndex)] = token.slice(eqIndex + 1);
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }

  const start = readString(args, "batch-window-start");
  const end = readString(args, "batch-window-end");
  const out = readString(args, "out");
  const bundleOutDir =
    typeof args["bundle-out-dir"] === "string"
      ? args["bundle-out-dir"]
      : `${out.replace(/\.json$/i, "")}__bundles`;
  const manifestOut =
    typeof args["manifest-out"] === "string"
      ? args["manifest-out"]
      : `${out.replace(/\.json$/i, "")}__manifest.json`;

  return {
    start,
    end,
    out,
    bundleOutDir,
    manifestOut,
    expectedItems:
      typeof args["expected-items"] === "string"
        ? readPositiveInt(args, "expected-items")
        : undefined,
    expectedBatches:
      typeof args["expected-batches"] === "string"
        ? readPositiveInt(args, "expected-batches")
        : undefined,
    overwrite: args.overwrite === true,
  };
}

function readString(args: Record<string, ArgValue>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`--${key} is required`);
  }
  return value;
}

function readPositiveInt(args: Record<string, ArgValue>, key: string): number {
  const raw = args[key];
  const value = typeof raw === "string" ? Number.parseInt(raw, 10) : Number.NaN;
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`--${key} must be a positive integer`);
  }
  return value;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function sourceRunId(sourceFilename: string, importBatchId: string): string {
  const basename = path.basename(sourceFilename.replace(/\\/g, "/"));
  const runId = basename.split("__question-bundle__")[0] ?? "";
  if (/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+-[a-z0-9-]+-[a-z0-9-]+-v\d{2}$/.test(runId)) {
    return runId;
  }
  return `2026-05-03-db-import-${importBatchId.slice(0, 8)}-gesp-7-medium-v01`;
}

function bundleFileName(runId: string, first: QuestionRow): string {
  return [
    runId,
    "__question-bundle__",
    first.type,
    "__",
    first.primary_kp_code.toLowerCase(),
    "__n",
    String(first.total_count),
    "__v01.json",
  ].join("");
}

function toQuestionItem(row: QuestionRow): QuestionBundleItem {
  return QuestionBundleItemSchema.parse({
    type: row.type,
    difficulty: row.difficulty,
    primaryKpCode: row.primary_kp_code,
    auxiliaryKpCodes: row.auxiliary_kp_codes ?? [],
    examTypes: row.exam_types.length > 0 ? row.exam_types : ["GESP-7"],
    contentHash: row.content_hash,
    sandboxVerified: row.sandbox_verified,
    source: row.source,
    contentJson: row.content_json,
    answerJson: row.answer_json,
    explanationJson: row.explanation_json,
  });
}

function buildBundle(batch: BatchRow, rows: QuestionRow[]): QuestionBundle {
  const first = rows[0];
  if (!first) {
    throw new Error(`Import batch ${batch.import_batch_id} did not map to any questions.`);
  }

  const items = rows.map(toQuestionItem);
  const timestamp = new Date().toISOString();
  const runId = sourceRunId(batch.source_filename, batch.import_batch_id);
  return QuestionBundleSchema.parse({
    meta: {
      bundleType: "question_bundle",
      schemaVersion: BUNDLE_SCHEMA_VERSION,
      runId,
      createdAt: timestamp,
      generatedAt: timestamp,
      provider: "db-import-export",
      model: "database-snapshot",
      promptHash: computeChecksum(`${batch.import_batch_id}:${batch.import_checksum}`),
      sourceBatchId: `db-import-batch:${batch.import_batch_id}`,
      sourceBatchIds: [`db-import-batch:${batch.import_batch_id}`],
      sourceTimestamp: toIso(batch.import_created_at),
      examType: first.exam_types[0] ?? "GESP-7",
      questionType: first.type,
      primaryKpCode: first.primary_kp_code,
      difficulty: first.difficulty,
      requestedCount: items.length,
      validation: buildValidationMetadata({
        dbChecksSkipped: false,
        duplicateChecksSkipped: false,
        judgeChecksSkipped: true,
        sandboxVerifiedItemIndexes: items
          .map((item, itemIndex) => (item.sandboxVerified ? itemIndex : null))
          .filter((itemIndex): itemIndex is number => itemIndex !== null),
      }),
      integrity: buildBundleIntegrity(items),
    },
    items,
  });
}

async function loadImportedRows(start: string, end: string) {
  const result = await pool.query<QuestionRow>(
    `
with selected_batches as (
  select
    id,
    source_filename,
    checksum,
    summary_json,
    (summary_json->>'totalCount')::int as total_count,
    created_at,
    lead(created_at) over (order by created_at, id) as next_created_at
  from import_batches
  where bundle_type = 'question_bundle'
    and status = 'applied'
    and created_at >= $1::timestamptz
    and created_at < $2::timestamptz
)
select
  b.id::text as import_batch_id,
  b.source_filename,
  b.checksum as import_checksum,
  b.summary_json,
  b.total_count,
  b.created_at as import_created_at,
  q.id::text as question_id,
  q.type,
  q.difficulty,
  q.primary_kp_id,
  kp.code as primary_kp_code,
  q.content_json,
  q.answer_json,
  q.explanation_json,
  q.content_hash,
  q.status,
  q.sandbox_verified,
  q.source,
  q.created_at as question_created_at,
  coalesce(
    (
      select array_agg(qet.exam_type order by qet.exam_type)
      from question_exam_types qet
      where qet.question_id = q.id
    ),
    array[]::text[]
  ) as exam_types,
  coalesce(
    (
      select array_agg(kp2.code order by kp2.code)
      from question_kp_tags qkt
      join knowledge_points kp2 on kp2.id = qkt.kp_id
      where qkt.question_id = q.id
        and qkt.tag_role = 'secondary'
    ),
    array[]::text[]
  ) as auxiliary_kp_codes
from selected_batches b
join questions q
  on q.created_at >= b.created_at
 and (b.next_created_at is null or q.created_at < b.next_created_at)
join knowledge_points kp on kp.id = q.primary_kp_id
order by b.created_at, b.id, q.created_at, q.id
`,
    [start, end],
  );
  return result.rows;
}

function groupRows(rows: QuestionRow[]) {
  const batches = new Map<string, { batch: BatchRow; rows: QuestionRow[] }>();
  for (const row of rows) {
    const current =
      batches.get(row.import_batch_id) ??
      ({
        batch: {
          import_batch_id: row.import_batch_id,
          source_filename: row.source_filename,
          import_checksum: row.import_checksum,
          summary_json: row.summary_json,
          total_count: row.total_count,
          import_created_at: row.import_created_at,
        },
        rows: [],
      } satisfies { batch: BatchRow; rows: QuestionRow[] });
    current.rows.push(row);
    batches.set(row.import_batch_id, current);
  }
  return [...batches.values()];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  try {
    const rows = await loadImportedRows(args.start, args.end);
    const grouped = groupRows(rows);
    const totalItems = rows.length;

    if (args.expectedBatches !== undefined && grouped.length !== args.expectedBatches) {
      throw new Error(`Expected ${args.expectedBatches} batches, mapped ${grouped.length}.`);
    }
    if (args.expectedItems !== undefined && totalItems !== args.expectedItems) {
      throw new Error(`Expected ${args.expectedItems} items, mapped ${totalItems}.`);
    }

    await mkdir(path.resolve(process.cwd(), args.bundleOutDir), { recursive: true });
    const bundlePaths: string[] = [];
    const batches = [];

    for (const group of grouped) {
      const bundle = buildBundle(group.batch, group.rows);
      const bundlePath = path.resolve(
        process.cwd(),
        args.bundleOutDir,
        bundleFileName(bundle.meta.runId, group.rows[0]!),
      );
      await writeFile(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`, {
        encoding: "utf8",
        flag: args.overwrite ? "w" : "wx",
      });
      bundlePaths.push(toDisplayRepoPath(bundlePath));
      batches.push({
        importBatchId: group.batch.import_batch_id,
        sourceFilename: group.batch.source_filename,
        importChecksum: group.batch.import_checksum,
        createdAt: toIso(group.batch.import_created_at),
        summary: group.batch.summary_json,
        snapshotBundlePath: toDisplayRepoPath(bundlePath),
        items: group.rows.map((row) => ({
          questionId: row.question_id,
          contentHash: row.content_hash,
          type: row.type,
          difficulty: row.difficulty,
          primaryKpId: row.primary_kp_id,
          primaryKpCode: row.primary_kp_code,
          status: row.status,
          sandboxVerified: row.sandbox_verified,
          source: row.source,
          createdAt: toIso(row.question_created_at),
          contentJson: row.content_json,
          answerJson: row.answer_json,
          explanationJson: row.explanation_json,
        })),
      });
    }

    const manifest = {
      meta: {
        reportType: "imported_question_bundle_snapshot_manifest",
        exportedAt: new Date().toISOString(),
        batchWindowStart: args.start,
        batchWindowEnd: args.end,
      },
      bundlePaths,
    };
    await writeBatchJsonReport({
      reportPath: path.resolve(process.cwd(), args.manifestOut),
      payload: manifest,
      overwrite: args.overwrite,
    });

    const exportPayload = {
      meta: {
        reportType: "imported_question_bundle_snapshot_export",
        exportedAt: new Date().toISOString(),
        batchWindowStart: args.start,
        batchWindowEnd: args.end,
        manifestPath: toDisplayRepoPath(path.resolve(process.cwd(), args.manifestOut)),
        bundleOutDir: toDisplayRepoPath(path.resolve(process.cwd(), args.bundleOutDir)),
      },
      summary: {
        batchCount: grouped.length,
        itemCount: totalItems,
        expectedBatches: args.expectedBatches ?? null,
        expectedItems: args.expectedItems ?? null,
      },
      batches,
    };

    const exportPath = await writeBatchJsonReport({
      reportPath: path.resolve(process.cwd(), args.out),
      payload: exportPayload,
      overwrite: args.overwrite,
    });
    console.log(
      `EXPORT-IMPORTED-QUESTION-BUNDLES ${JSON.stringify({
        batches: grouped.length,
        items: totalItems,
        exportPath,
        manifestPath: toDisplayRepoPath(path.resolve(process.cwd(), args.manifestOut)),
      })}`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
