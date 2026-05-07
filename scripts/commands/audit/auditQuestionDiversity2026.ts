import fs from "node:fs";
import path from "node:path";

import { and, eq, ne } from "drizzle-orm";

import { blueprintSpecs } from "../../../config/blueprint.js";
import { EXAM_TYPES, type ExamType } from "../../../config/examTypes.js";
import { db, pool } from "../../../server/db.js";
import { knowledgePoints } from "../../../server/db/schema/knowledgePoints.js";
import { questions } from "../../../server/db/schema/questions.js";
import { listJsonFilesRecursively, listManifestBundleFiles } from "../../lib/batchWorkflow.js";
import {
  buildDiversityAudit,
  classifyQuestionDiversity,
  formatDiversityIssue,
  recordsFromBundleFiles,
  validateDiversityRecords,
  type DiversityRecord,
} from "../../lib/questionDiversity.js";
import {
  QuestionBundleSchema,
  QuestionBundleItemSchema,
  type Difficulty,
  type QuestionType,
} from "../../lib/bundleTypes.js";
import { toDisplayRepoPath } from "../../lib/scriptCli.js";

const usage = `Usage: npx tsx scripts/audit.ts audit-question-diversity-2026 (--manifest <manifest.json> | --dir papers/2026 | --db) [--exam-type CSP-J,CSP-S] [--out-dir <dir>] [--enforce]`;

interface Args {
  manifest?: string;
  dir?: string;
  db: boolean;
  examTypes?: ExamType[];
  outDir: string;
  enforce: boolean;
}

function readArg(args: string[], name: string) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function parseExamTypes(raw: string | undefined): ExamType[] | undefined {
  if (!raw) return undefined;
  return raw.split(",").map((token) => {
    const value = token.trim() as ExamType;
    if (!EXAM_TYPES.includes(value)) {
      throw new Error(`Unsupported --exam-type value: ${token}`);
    }
    return value;
  });
}

function parseArgs(argv: string[]): Args {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(usage);
    process.exit(0);
  }
  const manifest = readArg(argv, "--manifest");
  const dir = readArg(argv, "--dir");
  const useDb = argv.includes("--db");
  const sourceCount = [manifest, dir, useDb ? "db" : undefined].filter(Boolean).length;
  if (sourceCount !== 1) {
    throw new Error("Exactly one of --manifest, --dir, or --db is required");
  }
  return {
    manifest,
    dir,
    db: useDb,
    examTypes: parseExamTypes(readArg(argv, "--exam-type")),
    outDir: readArg(argv, "--out-dir") ?? "count/audits/diversity",
    enforce: argv.includes("--enforce"),
  };
}

function kpGroupOf(kpCode: string) {
  return kpCode.split("-")[0]?.toUpperCase() ?? kpCode;
}

function compatibleExamTypes(params: {
  examTypes?: ExamType[];
  questionType: QuestionType;
  difficulty: Difficulty;
  kpGroup: string;
}) {
  const candidates = params.examTypes ?? EXAM_TYPES;
  return candidates.filter((examType) =>
    blueprintSpecs[examType].sections.some(
      (section) =>
        section.questionType === params.questionType &&
        section.primaryKpQuota.some((quota) => quota.kpCode === params.kpGroup) &&
        Object.hasOwn(section.difficultyDistribution, params.difficulty),
    ),
  );
}

function filterRecordsByExamTypes(records: DiversityRecord[], examTypes?: ExamType[]) {
  if (!examTypes || examTypes.length === 0) {
    return records;
  }
  const wanted = new Set(examTypes);
  return records
    .map((record) => ({
      ...record,
      examTypes: record.examTypes.filter((examType) => wanted.has(examType)),
    }))
    .filter((record) => record.examTypes.length > 0);
}

function questionBundleFilesFromDir(dir: string) {
  return listJsonFilesRecursively(path.resolve(process.cwd(), dir)).filter((file) => {
    const name = path.basename(file);
    return name.includes("__question-bundle__") && name.endsWith(".json");
  });
}

function recordsFromDirOrManifest(args: Args): DiversityRecord[] {
  const files = args.manifest
    ? listManifestBundleFiles(args.manifest)
    : questionBundleFilesFromDir(args.dir!);
  const validFiles = files.filter((file) => {
    try {
      QuestionBundleSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")));
      return true;
    } catch {
      return false;
    }
  });
  return filterRecordsByExamTypes(recordsFromBundleFiles(validFiles), args.examTypes);
}

async function recordsFromDb(args: Args): Promise<DiversityRecord[]> {
  const rows = await db
    .select({
      id: questions.id,
      type: questions.type,
      difficulty: questions.difficulty,
      contentJson: questions.contentJson,
      answerJson: questions.answerJson,
      explanationJson: questions.explanationJson,
      contentHash: questions.contentHash,
      sandboxVerified: questions.sandboxVerified,
      source: questions.source,
      primaryKpCode: knowledgePoints.code,
    })
    .from(questions)
    .innerJoin(knowledgePoints, eq(questions.primaryKpId, knowledgePoints.id))
    .where(and(ne(questions.status, "archived"), ne(questions.source, "real_paper")));

  return rows.flatMap((row): DiversityRecord[] => {
    const questionType = row.type as QuestionType;
    const difficulty = row.difficulty as Difficulty;
    const kpGroup = kpGroupOf(row.primaryKpCode);
    const examTypes = compatibleExamTypes({
      examTypes: args.examTypes,
      questionType,
      difficulty,
      kpGroup,
    });
    if (examTypes.length === 0) {
      return [];
    }
    const item = QuestionBundleItemSchema.parse({
      type: questionType,
      difficulty,
      primaryKpCode: row.primaryKpCode,
      auxiliaryKpCodes: [],
      examTypes,
      contentHash: row.contentHash,
      sandboxVerified: row.sandboxVerified,
      source: row.source,
      contentJson: row.contentJson,
      answerJson: row.answerJson,
      explanationJson: row.explanationJson,
    });
    const metrics = classifyQuestionDiversity(item);
    return [
      {
        id: `db:${row.id}`,
        sourcePath: "db:questions",
        itemIndex: 0,
        bundleRunId: `db:${row.id}`,
        examTypes,
        questionType,
        difficulty,
        primaryKpCode: row.primaryKpCode,
        kpGroup,
        item,
        metrics,
      },
    ];
  });
}

function renderMarkdown(params: {
  sourceLabel: string;
  audit: ReturnType<typeof buildDiversityAudit>;
  validation: ReturnType<typeof validateDiversityRecords>;
}) {
  const lines = [
    "# Question Diversity Audit 2026",
    "",
    `- Source: ${params.sourceLabel}`,
    `- Generated at: ${params.audit.generatedAt}`,
    `- Policy version: ${params.audit.policyVersion}`,
    `- Items: ${params.audit.totals.items}`,
    `- Policy-tagged items: ${params.audit.totals.policyTaggedItems}`,
    `- Low-quality candidates: ${params.audit.totals.lowQualityCandidates}`,
    `- Rewrite candidates: ${params.audit.totals.rewriteCandidates}`,
    `- Template clusters: ${params.audit.totals.templateClusters}`,
    `- Validation enforced: ${params.validation.enforced}`,
    `- Validation errors: ${params.validation.errors.length}`,
    "",
    "## Largest Grid Buckets",
    "",
    "| grid | count | top task flavors | top archetypes |",
    "| --- | ---: | --- | --- |",
  ];

  for (const grid of params.audit.distributions.byGrid.slice(0, 30)) {
    const topFlavors = Object.entries(grid.taskFlavors)
      .sort((left, right) => right[1] - left[1])
      .slice(0, 5)
      .map(([key, count]) => `${key}:${count}`)
      .join(", ");
    const topArchetypes = Object.entries(grid.archetypes)
      .sort((left, right) => right[1] - left[1])
      .slice(0, 5)
      .map(([key, count]) => `${key}:${count}`)
      .join(", ");
    lines.push(`| ${grid.key} | ${grid.count} | ${topFlavors} | ${topArchetypes} |`);
  }

  lines.push("", "## Knowledge Point Template Distribution", "");
  lines.push("| knowledge point / type / difficulty | count | top task flavors | top stem patterns |");
  lines.push("| --- | ---: | --- | --- |");
  for (const bucket of params.audit.distributions.byKnowledgePoint.slice(0, 80)) {
    lines.push(
      `| ${bucket.key} | ${bucket.count} | ${topCounts(bucket.taskFlavors, 6)} | ${topCounts(
        bucket.stemPatternFamilies,
        6,
      )} |`,
    );
  }

  lines.push("", "## Rewrite Queue Preview", "");
  if (params.audit.rewriteQueue.length === 0) {
    lines.push("No rewrite candidates.", "");
  } else {
    lines.push("| id | score | reasons |", "| --- | ---: | --- |");
    for (const item of params.audit.rewriteQueue.slice(0, 50)) {
      lines.push(`| ${item.id} | ${item.qualityScore.toFixed(2)} | ${item.reasons.join(", ")} |`);
    }
    lines.push("");
  }

  if (params.validation.errors.length > 0) {
    lines.push("## Validation Errors", "");
    for (const issue of params.validation.errors.slice(0, 100)) {
      lines.push(`- ${formatDiversityIssue(issue)}`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function topCounts(counts: Record<string, number>, limit: number) {
  return Object.entries(counts)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([key, count]) => `${key}:${count}`)
    .join(", ");
}

function csvEscape(value: string | number) {
  const raw = String(value);
  return /[",\r\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function writeCsv(pathname: string, rows: Array<Record<string, string | number>>) {
  if (rows.length === 0) {
    fs.writeFileSync(pathname, "", "utf8");
    return;
  }
  const headers = Object.keys(rows[0]!);
  const lines = [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header] ?? "")).join(",")),
  ];
  fs.writeFileSync(pathname, `${lines.join("\n")}\n`, "utf8");
}

function distributionRows(
  buckets: ReturnType<typeof buildDiversityAudit>["distributions"]["byGrid"],
) {
  return buckets.map((bucket) => ({
    key: bucket.key,
    count: bucket.count,
    topTaskFlavors: topCounts(bucket.taskFlavors, 10),
    topArchetypes: topCounts(bucket.archetypes, 10),
    topStemPatterns: topCounts(bucket.stemPatternFamilies, 10),
    topContainerTags: topCounts(bucket.containerTags, 10),
  }));
}

function actionForRewriteCandidate(candidate: ReturnType<typeof buildDiversityAudit>["rewriteQueue"][number]) {
  if (
    candidate.reasons.includes("qualityScore_below_0.65") &&
    candidate.reasons.includes("parameterized_template_cluster")
  ) {
    return "rewrite_or_archive_review";
  }
  if (candidate.reasons.includes("hard_difficulty_rubric_failed")) {
    return "rewrite_hard_rubric";
  }
  if (candidate.reasons.includes("ds_stack_queue_overused_candidate")) {
    return "rewrite_for_ds_rebalance";
  }
  return "rewrite_review";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sourceLabel = args.db
    ? "db:questions"
    : args.manifest
      ? toDisplayRepoPath(args.manifest)
      : toDisplayRepoPath(args.dir!);
  const records = args.db ? await recordsFromDb(args) : recordsFromDirOrManifest(args);
  const audit = buildDiversityAudit(records);
  const validation = validateDiversityRecords(records, { enforceWhenPolicyPresent: !args.enforce });
  const outDir = path.resolve(process.cwd(), args.outDir);
  fs.mkdirSync(outDir, { recursive: true });
  const slug = sourceLabel
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  const jsonPath = path.join(outDir, `${slug || "question-diversity"}__diversity-audit.json`);
  const mdPath = path.join(outDir, `${slug || "question-diversity"}__diversity-audit.md`);
  const gridCsvPath = path.join(outDir, `${slug || "question-diversity"}__grid-template-distribution.csv`);
  const kpCsvPath = path.join(
    outDir,
    `${slug || "question-diversity"}__knowledge-point-template-distribution.csv`,
  );
  const rewriteQueuePath = path.join(outDir, `${slug || "question-diversity"}__rewrite-queue.csv`);
  const archiveSuggestionsPath = path.join(
    outDir,
    `${slug || "question-diversity"}__archive-suggestions.csv`,
  );
  fs.writeFileSync(
    jsonPath,
    `${JSON.stringify({ ...audit, validation }, null, 2)}\n`,
    "utf8",
  );
  fs.writeFileSync(mdPath, renderMarkdown({ sourceLabel, audit, validation }), "utf8");
  writeCsv(gridCsvPath, distributionRows(audit.distributions.byGrid));
  writeCsv(kpCsvPath, distributionRows(audit.distributions.byKnowledgePoint));
  writeCsv(
    rewriteQueuePath,
    audit.rewriteQueue.map((candidate) => ({
      id: candidate.id,
      sourcePath: candidate.sourcePath,
      examTypes: candidate.examTypes.join("|"),
      questionType: candidate.questionType,
      difficulty: candidate.difficulty,
      kpGroup: candidate.kpGroup,
      archetypeId: candidate.archetypeId,
      taskFlavor: candidate.taskFlavor,
      qualityScore: candidate.qualityScore,
      reasons: candidate.reasons.join("|"),
      recommendedAction: actionForRewriteCandidate(candidate),
    })),
  );
  writeCsv(
    archiveSuggestionsPath,
    audit.rewriteQueue
      .filter(
        (candidate) =>
          candidate.reasons.includes("qualityScore_below_0.65") &&
          candidate.reasons.includes("parameterized_template_cluster"),
      )
      .map((candidate) => ({
        id: candidate.id,
        sourcePath: candidate.sourcePath,
        examTypes: candidate.examTypes.join("|"),
        questionType: candidate.questionType,
        difficulty: candidate.difficulty,
        kpGroup: candidate.kpGroup,
        taskFlavor: candidate.taskFlavor,
        qualityScore: candidate.qualityScore,
        reasons: candidate.reasons.join("|"),
        recommendedAction: "archive_after_replacement_or_manual_review",
      })),
  );
  console.log(
    JSON.stringify(
      {
        jsonPath: toDisplayRepoPath(jsonPath),
        markdownPath: toDisplayRepoPath(mdPath),
        gridCsvPath: toDisplayRepoPath(gridCsvPath),
        knowledgePointCsvPath: toDisplayRepoPath(kpCsvPath),
        rewriteQueuePath: toDisplayRepoPath(rewriteQueuePath),
        archiveSuggestionsPath: toDisplayRepoPath(archiveSuggestionsPath),
        items: records.length,
        rewriteCandidates: audit.totals.rewriteCandidates,
        templateClusters: audit.totals.templateClusters,
        validationErrors: validation.errors.length,
      },
      null,
      2,
    ),
  );
  if (args.enforce && validation.errors.length > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
