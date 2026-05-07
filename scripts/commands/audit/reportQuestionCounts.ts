import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { EXAM_TYPES, type ExamType } from "../../../config/examTypes.js";
import type { Difficulty, QuestionType } from "../../lib/bundleTypes.js";
import { toDisplayRepoPath } from "../../lib/scriptCli.js";

type CountKey = `${ExamType}|${QuestionType}|${Difficulty}|${string}`;

interface Args {
  inventoryPath: string;
  diversityAuditPath: string;
  rewriteQueuePath: string;
  archiveSuggestionsPath: string;
  outDir: string;
  snapshotId: string;
  write: boolean;
}

interface InventoryRow {
  key: CountKey;
  count: number;
}

interface DeficitRow {
  examType: ExamType;
  questionType: QuestionType;
  difficulty: Difficulty;
  kpGroup: string;
  required: number;
  available: number;
  deficit: number;
}

interface InventoryReport {
  generatedAt: string;
  sourceDir: string;
  targetPapersPerExamType: number;
  filesFound: number;
  countedQuestionRows: number;
  counts: {
    nonRealPaperByExamTypeQuestionTypeDifficultyKpGroup: InventoryRow[];
  };
  deficits: DeficitRow[];
  summary: {
    totalDeficit: number;
  };
}

interface DiversityAuditReport {
  generatedAt: string;
  policyVersion: string;
  totals: {
    items: number;
    policyTaggedItems: number;
    lowQualityCandidates: number;
    rewriteCandidates: number;
    templateClusters: number;
  };
  validation?: {
    errors?: unknown[];
  };
}

interface QueueRow {
  id: string;
  sourcePath: string;
  examTypes: string;
  questionType: QuestionType;
  difficulty: Difficulty;
  kpGroup: string;
  archetypeId: string;
  taskFlavor: string;
  qualityScore: string;
  reasons: string;
  recommendedAction: string;
}

interface BucketDetail {
  examType: ExamType;
  questionType: QuestionType;
  difficulty: Difficulty;
  kpGroup: string;
  required: number;
  available: number;
  rawDeficit: number;
  rewrite: number;
  abandon: number;
  salvage: number;
  lowQuality: number;
  compliant: number;
  qualityAdjustedDeficit: number;
  situation: string;
}

const usage = `Usage: npx tsx scripts/audit.ts report-question-counts --write [--inventory count/state/question-inventory.json] [--diversity-audit count/audits/diversity/papers-2026__diversity-audit.json] [--rewrite-queue count/audits/diversity/papers-2026__rewrite-queue.csv] [--archive-suggestions count/audits/diversity/papers-2026__archive-suggestions.csv] [--out-dir count] [--snapshot-id YYYY-MM-DD-non-real-question-audit]`;

function readArg(args: string[], name: string) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function parseArgs(argv: string[]): Args {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(usage);
    process.exit(0);
  }

  return {
    inventoryPath: readArg(argv, "--inventory") ?? "count/state/question-inventory.json",
    diversityAuditPath:
      readArg(argv, "--diversity-audit") ??
      "count/audits/diversity/papers-2026__diversity-audit.json",
    rewriteQueuePath:
      readArg(argv, "--rewrite-queue") ?? "count/audits/diversity/papers-2026__rewrite-queue.csv",
    archiveSuggestionsPath:
      readArg(argv, "--archive-suggestions") ??
      "count/audits/diversity/papers-2026__archive-suggestions.csv",
    outDir: readArg(argv, "--out-dir") ?? "count",
    snapshotId:
      readArg(argv, "--snapshot-id") ??
      `${new Date().toISOString().slice(0, 10)}-non-real-question-audit`,
    write: argv.includes("--write"),
  };
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8")) as T;
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === ",") {
      cells.push(cell);
      cell = "";
    } else if (char === '"') {
      quoted = true;
    } else {
      cell += char;
    }
  }

  cells.push(cell);
  return cells;
}

function readCsv(filePath: string): QueueRow[] {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    return [];
  }

  const text = fs.readFileSync(resolved, "utf8").trim();
  if (!text) {
    return [];
  }

  const [headerLine, ...lines] = text.split(/\r?\n/);
  const headers = parseCsvLine(headerLine!);
  return lines
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const values = parseCsvLine(line);
      return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
    }) as unknown as QueueRow[];
}

function increment(map: Map<string, number>, key: string, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function bucketKey(params: {
  examType: ExamType;
  questionType: QuestionType;
  difficulty: Difficulty;
  kpGroup: string;
}): CountKey {
  return `${params.examType}|${params.questionType}|${params.difficulty}|${params.kpGroup}`;
}

function queueCounts(rows: QueueRow[], predicate: (row: QueueRow) => boolean = () => true) {
  const counts = new Map<CountKey, number>();
  for (const row of rows) {
    if (!predicate(row)) {
      continue;
    }
    for (const examType of row.examTypes.split("|").filter(Boolean) as ExamType[]) {
      increment(
        counts,
        bucketKey({
          examType,
          questionType: row.questionType,
          difficulty: row.difficulty,
          kpGroup: row.kpGroup,
        }),
      );
    }
  }
  return counts;
}

function sumBy<T>(items: T[], keyOf: (item: T) => string, valueOf: (item: T) => number) {
  const map = new Map<string, number>();
  for (const item of items) {
    increment(map, keyOf(item), valueOf(item));
  }
  return map;
}

function situationFor(row: BucketDetail) {
  if (row.qualityAdjustedDeficit > 0 && row.rawDeficit > 0) {
    return "quantity_and_quality_deficit";
  }
  if (row.qualityAdjustedDeficit > 0) {
    return "quality_deficit";
  }
  if (row.abandon > 0) {
    return "replace_after_archive_review";
  }
  if (row.salvage > 0) {
    return "rewrite_needed";
  }
  return "meets_current_count_gate";
}

function buildDetails(params: {
  inventory: InventoryReport;
  rewriteRows: QueueRow[];
  archiveRows: QueueRow[];
}) {
  const rewrite = queueCounts(params.rewriteRows);
  const lowQuality = queueCounts(params.rewriteRows, (row) =>
    row.reasons.split("|").includes("qualityScore_below_0.65"),
  );
  const abandon = queueCounts(params.archiveRows);
  const details: BucketDetail[] = params.inventory.deficits.map((row) => {
    const key = bucketKey(row);
    const rewriteCount = rewrite.get(key) ?? 0;
    const abandonCount = abandon.get(key) ?? 0;
    const compliant = Math.max(0, row.available - rewriteCount);
    const detail = {
      examType: row.examType,
      questionType: row.questionType,
      difficulty: row.difficulty,
      kpGroup: row.kpGroup,
      required: row.required,
      available: row.available,
      rawDeficit: row.deficit,
      rewrite: rewriteCount,
      abandon: abandonCount,
      salvage: Math.max(0, rewriteCount - abandonCount),
      lowQuality: lowQuality.get(key) ?? 0,
      compliant,
      qualityAdjustedDeficit: Math.max(0, row.required - compliant),
      situation: "",
    };
    return { ...detail, situation: situationFor(detail) };
  });

  details.sort(
    (left, right) =>
      right.qualityAdjustedDeficit - left.qualityAdjustedDeficit ||
      right.rawDeficit - left.rawDeficit ||
      left.examType.localeCompare(right.examType) ||
      left.questionType.localeCompare(right.questionType) ||
      left.kpGroup.localeCompare(right.kpGroup) ||
      left.difficulty.localeCompare(right.difficulty),
  );
  return details;
}

function aggregateByExam(inventory: InventoryReport, details: BucketDetail[]) {
  const totalByExam = new Map<string, number>();
  for (const row of inventory.counts.nonRealPaperByExamTypeQuestionTypeDifficultyKpGroup) {
    const [examType] = row.key.split("|");
    if (!examType) {
      continue;
    }
    increment(totalByExam, examType, row.count);
  }

  const required = sumBy(details, (row) => row.examType, (row) => row.required);
  const rawDeficit = sumBy(details, (row) => row.examType, (row) => row.rawDeficit);
  const rewrite = sumBy(details, (row) => row.examType, (row) => row.rewrite);
  const abandon = sumBy(details, (row) => row.examType, (row) => row.abandon);
  const salvage = sumBy(details, (row) => row.examType, (row) => row.salvage);
  const lowQuality = sumBy(details, (row) => row.examType, (row) => row.lowQuality);
  const qualityAdjustedDeficit = sumBy(
    details,
    (row) => row.examType,
    (row) => row.qualityAdjustedDeficit,
  );

  return EXAM_TYPES.map((examType) => {
    const total = totalByExam.get(examType) ?? 0;
    const rewriteCount = rewrite.get(examType) ?? 0;
    return {
      examType,
      total,
      required: required.get(examType) ?? 0,
      rawDeficit: rawDeficit.get(examType) ?? 0,
      compliant: Math.max(0, total - rewriteCount),
      rewrite: rewriteCount,
      abandon: abandon.get(examType) ?? 0,
      salvage: salvage.get(examType) ?? 0,
      lowQuality: lowQuality.get(examType) ?? 0,
      qualityAdjustedDeficit: qualityAdjustedDeficit.get(examType) ?? 0,
    };
  });
}

function aggregateByExamQuestionType(details: BucketDetail[]) {
  const keys = [...new Set(details.map((row) => `${row.examType}|${row.questionType}`))].sort();
  return keys.map((key) => {
    const rows = details.filter((row) => `${row.examType}|${row.questionType}` === key);
    const [examType, questionType] = key.split("|");
    return {
      examType: examType ?? "",
      questionType: questionType ?? "",
      required: rows.reduce((sum, row) => sum + row.required, 0),
      available: rows.reduce((sum, row) => sum + row.available, 0),
      rawDeficit: rows.reduce((sum, row) => sum + row.rawDeficit, 0),
      compliant: rows.reduce((sum, row) => sum + row.compliant, 0),
      rewrite: rows.reduce((sum, row) => sum + row.rewrite, 0),
      abandon: rows.reduce((sum, row) => sum + row.abandon, 0),
      salvage: rows.reduce((sum, row) => sum + row.salvage, 0),
      lowQuality: rows.reduce((sum, row) => sum + row.lowQuality, 0),
      qualityAdjustedDeficit: rows.reduce((sum, row) => sum + row.qualityAdjustedDeficit, 0),
    };
  });
}

function csvEscape(value: string | number) {
  const raw = String(value);
  return /[",\r\n]/.test(raw) ? `"${raw.replaceAll('"', '""')}"` : raw;
}

function toCsv(rows: Array<Record<string, string | number>>) {
  if (rows.length === 0) {
    return "";
  }
  const headers = Object.keys(rows[0]!);
  return `${[
    headers.map(csvEscape).join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header] ?? "")).join(",")),
  ].join("\n")}\n`;
}

function markdownTable(rows: Array<Record<string, string | number>>, headers: string[]) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${headers.map((header) => row[header] ?? "").join(" | ")} |`),
  ].join("\n");
}

function buildMarkdown(params: {
  generatedAt: string;
  snapshotId: string;
  inventory: InventoryReport;
  diversity: DiversityAuditReport;
  byExam: Array<Record<string, string | number>>;
  byExamQuestionType: Array<Record<string, string | number>>;
  details: BucketDetail[];
  args: Args;
}) {
  const totalRequired = params.byExam.reduce((sum, row) => sum + Number(row.required), 0);
  const qualityAdjustedDeficit = params.byExam.reduce(
    (sum, row) => sum + Number(row.qualityAdjustedDeficit),
    0,
  );
  const validationErrors = params.diversity.validation?.errors?.length ?? 0;
  const lines = [
    `# ${params.snapshotId}`,
    "",
    "## Scope",
    "",
    "- Scope: non-real-paper question bundles under `papers/2026`.",
    "- Unit: exam-tagged rows. One question tagged for multiple exam types is counted once per exam type.",
    "- Canonical folder: `count/`.",
    "- Evidence reports are source inputs, not the canonical counting surface.",
    "",
    "## Sources",
    "",
    `- Inventory: \`${toDisplayRepoPath(params.args.inventoryPath)}\``,
    `- Diversity audit: \`${toDisplayRepoPath(params.args.diversityAuditPath)}\``,
    `- Rewrite queue: \`${toDisplayRepoPath(params.args.rewriteQueuePath)}\``,
    `- Archive suggestions: \`${toDisplayRepoPath(params.args.archiveSuggestionsPath)}\``,
    "",
    "## Overview",
    "",
    `- Generated at: ${params.generatedAt}`,
    `- Inventory generated at: ${params.inventory.generatedAt}`,
    `- Diversity audit generated at: ${params.diversity.generatedAt}`,
    `- Bundle files found: ${params.inventory.filesFound}`,
    `- Counted inventory rows: ${params.inventory.countedQuestionRows}`,
    `- Diversity items: ${params.diversity.totals.items}`,
    `- Policy-tagged items: ${params.diversity.totals.policyTaggedItems}`,
    `- Total required rows: ${totalRequired}`,
    `- Raw inventory deficit: ${params.inventory.summary.totalDeficit}`,
    `- Quality-adjusted deficit: ${qualityAdjustedDeficit}`,
    `- Low-quality candidates: ${params.diversity.totals.lowQualityCandidates}`,
    `- Rewrite candidates: ${params.diversity.totals.rewriteCandidates}`,
    `- Template clusters: ${params.diversity.totals.templateClusters}`,
    `- Validation errors: ${validationErrors}`,
    "",
    "## Situation Definitions",
    "",
    "- `compliant`: current total minus rewrite queue. This is an audit estimate, not a publish guarantee.",
    "- `abandon`: archive suggestion; these should be replaced or manually reviewed before any reuse.",
    "- `salvage`: rewrite queue minus archive suggestion; these can be repaired/regenerated.",
    "- `lowQuality`: `qualityScore_below_0.65`; this overlaps with rewrite/archive and must not be summed as another category.",
    "- `qualityAdjustedDeficit`: required minus compliant, capped at zero per bucket.",
    "",
    "## By Exam Type",
    "",
    markdownTable(params.byExam, [
      "examType",
      "total",
      "required",
      "rawDeficit",
      "compliant",
      "abandon",
      "salvage",
      "lowQuality",
      "qualityAdjustedDeficit",
    ]),
    "",
    "## By Exam Type And Question Type",
    "",
    markdownTable(params.byExamQuestionType, [
      "examType",
      "questionType",
      "required",
      "available",
      "rawDeficit",
      "compliant",
      "abandon",
      "salvage",
      "lowQuality",
      "qualityAdjustedDeficit",
    ]),
    "",
    "## Top Bucket Details",
    "",
    markdownTable(
      params.details.slice(0, 80).map((row) => ({ ...row })),
      [
        "examType",
        "questionType",
        "difficulty",
        "kpGroup",
        "required",
        "available",
        "rawDeficit",
        "compliant",
        "rewrite",
        "abandon",
        "salvage",
        "lowQuality",
        "qualityAdjustedDeficit",
        "situation",
      ],
    ),
    "",
    "Full bucket details live in the sibling CSV and JSON files.",
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function writeReport(args: Args, payload: unknown, markdown: string, details: BucketDetail[]) {
  const outDir = path.resolve(args.outDir);
  const snapshotDir = path.join(outDir, "snapshots");
  fs.mkdirSync(snapshotDir, { recursive: true });

  const currentJson = path.join(outDir, "question-counts-current.json");
  const currentMd = path.join(outDir, "question-counts-current.md");
  const snapshotJson = path.join(snapshotDir, `${args.snapshotId}.json`);
  const snapshotMd = path.join(snapshotDir, `${args.snapshotId}.md`);
  const snapshotCsv = path.join(snapshotDir, `${args.snapshotId}__bucket-details.csv`);

  const jsonText = `${JSON.stringify(payload, null, 2)}\n`;
  fs.writeFileSync(currentJson, jsonText, "utf8");
  fs.writeFileSync(currentMd, markdown, "utf8");
  fs.writeFileSync(snapshotJson, jsonText, "utf8");
  fs.writeFileSync(snapshotMd, markdown, "utf8");
  fs.writeFileSync(snapshotCsv, toCsv(details.map((row) => ({ ...row }))), "utf8");

  return { currentJson, currentMd, snapshotJson, snapshotMd, snapshotCsv };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inventory = readJson<InventoryReport>(args.inventoryPath);
  const diversity = readJson<DiversityAuditReport>(args.diversityAuditPath);
  const rewriteRows = readCsv(args.rewriteQueuePath);
  const archiveRows = readCsv(args.archiveSuggestionsPath);
  const generatedAt = new Date().toISOString();
  const details = buildDetails({ inventory, rewriteRows, archiveRows });
  const byExam = aggregateByExam(inventory, details);
  const byExamQuestionType = aggregateByExamQuestionType(details);
  const payload = {
    generatedAt,
    reportType: "round1_question_counts",
    snapshotId: args.snapshotId,
    sources: {
      inventoryPath: toDisplayRepoPath(args.inventoryPath),
      diversityAuditPath: toDisplayRepoPath(args.diversityAuditPath),
      rewriteQueuePath: toDisplayRepoPath(args.rewriteQueuePath),
      archiveSuggestionsPath: toDisplayRepoPath(args.archiveSuggestionsPath),
    },
    countingPolicy: {
      scope: "non-real-paper question bundles",
      unit: "exam-tagged rows",
      compliant: "total - rewrite",
      abandon: "archive suggestions",
      salvage: "rewrite - abandon",
      qualityAdjustedDeficit: "required - compliant, capped at zero per bucket",
    },
    inventory: {
      generatedAt: inventory.generatedAt,
      sourceDir: inventory.sourceDir,
      targetPapersPerExamType: inventory.targetPapersPerExamType,
      filesFound: inventory.filesFound,
      countedQuestionRows: inventory.countedQuestionRows,
      rawDeficit: inventory.summary.totalDeficit,
    },
    diversity: {
      generatedAt: diversity.generatedAt,
      policyVersion: diversity.policyVersion,
      ...diversity.totals,
      validationErrors: diversity.validation?.errors?.length ?? 0,
    },
    byExam,
    byExamQuestionType,
    bucketDetails: details,
  };
  const markdown = buildMarkdown({
    generatedAt,
    snapshotId: args.snapshotId,
    inventory,
    diversity,
    byExam,
    byExamQuestionType,
    details,
    args,
  });

  console.log(markdown);

  if (args.write) {
    const written = writeReport(args, payload, markdown, details);
    console.log(
      JSON.stringify(
        Object.fromEntries(
          Object.entries(written).map(([key, value]) => [key, toDisplayRepoPath(value)]),
        ),
        null,
        2,
      ),
    );
  }
}

const isEntrypoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  main().catch((error) => {
    console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    process.exitCode = 1;
  });
}
