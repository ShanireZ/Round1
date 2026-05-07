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
    outDir: readArg(argv, "--out-dir") ?? "artifacts/reports/2026/audits/diversity",
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
  fs.writeFileSync(
    jsonPath,
    `${JSON.stringify({ ...audit, validation }, null, 2)}\n`,
    "utf8",
  );
  fs.writeFileSync(mdPath, renderMarkdown({ sourceLabel, audit, validation }), "utf8");
  console.log(
    JSON.stringify(
      {
        jsonPath: toDisplayRepoPath(jsonPath),
        markdownPath: toDisplayRepoPath(mdPath),
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
