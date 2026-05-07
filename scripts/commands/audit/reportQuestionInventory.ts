import fs from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { blueprintSpecs } from "../../../config/blueprint.js";
import { EXAM_TYPES, type ExamType } from "../../../config/examTypes.js";
import {
  QuestionBundleSchema,
  type Difficulty,
  type QuestionBundleItem,
  type QuestionType,
} from "../../lib/bundleTypes.js";

type CountKey = `${ExamType}|${QuestionType}|${Difficulty}|${string}`;

interface InventoryArgs {
  sourceDir: string;
  manifestPath?: string;
  excludeManifestPath?: string;
  targetPapers: number;
  write: boolean;
  outDir: string;
  outRunDir?: string;
}

interface InventoryQuestion {
  examType: ExamType;
  questionType: QuestionType;
  difficulty: Difficulty;
  primaryKpCode: string;
  kpGroup: string;
  source: string;
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

const usage = `Usage: npx tsx scripts/commands/audit/reportQuestionInventory.ts [--source-dir papers/2026] [--manifest bundle-manifest.json] [--exclude-manifest excluded-bundles.json] [--target-papers 100] [--write] [--out-dir count/state] [--out-run-dir count/runs/<run>]`;

function readArg(args: string[], name: string) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function parseArgs(argv: string[]): InventoryArgs {
  if (argv.includes("--help")) {
    console.log(usage);
    process.exit(0);
  }

  const targetPapersRaw = readArg(argv, "--target-papers");
  const targetPapers = targetPapersRaw ? Number.parseInt(targetPapersRaw, 10) : 100;
  if (!Number.isFinite(targetPapers) || targetPapers <= 0) {
    throw new Error("--target-papers must be a positive integer");
  }

  return {
    sourceDir: readArg(argv, "--source-dir") ?? "papers/2026",
    manifestPath: readArg(argv, "--manifest"),
    excludeManifestPath: readArg(argv, "--exclude-manifest"),
    targetPapers,
    write: argv.includes("--write"),
    outDir: readArg(argv, "--out-dir") ?? "count/state",
    outRunDir: readArg(argv, "--out-run-dir"),
  };
}

function readManifestJsonFiles(manifestPath: string): string[] {
  const resolved = path.resolve(manifestPath);
  const parsed = JSON.parse(fs.readFileSync(resolved, "utf8")) as { bundlePaths?: unknown };
  if (!Array.isArray(parsed.bundlePaths)) {
    throw new Error(`Unsupported inventory manifest shape: ${manifestPath}`);
  }

  return parsed.bundlePaths
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => path.resolve(entry))
    .sort((left, right) => left.localeCompare(right));
}

function listJsonFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listJsonFiles(entryPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(entryPath);
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

function kpGroupOf(kpCode: string): string {
  return kpCode.split("-")[0] ?? kpCode;
}

function countKey(params: {
  examType: ExamType;
  questionType: QuestionType;
  difficulty: Difficulty;
  kpGroup: string;
}): CountKey {
  return `${params.examType}|${params.questionType}|${params.difficulty}|${params.kpGroup}`;
}

function normalizeDistribution(distribution: Record<string, number>): Record<Difficulty, number> {
  const values: Record<Difficulty, number> = {
    easy: distribution.easy ?? 0,
    medium: distribution.medium ?? 0,
    hard: distribution.hard ?? 0,
  };
  const total = values.easy + values.medium + values.hard;

  if (total <= 0) {
    return { easy: 0, medium: 0, hard: 0 };
  }

  return {
    easy: values.easy / total,
    medium: values.medium / total,
    hard: values.hard / total,
  };
}

function allocateByDifficulty(total: number, distribution: Record<string, number>) {
  const normalized = normalizeDistribution(distribution);
  const base = (Object.entries(normalized) as Array<[Difficulty, number]>).map(
    ([difficulty, ratio]) => {
      const exact = total * ratio;
      return {
        difficulty,
        count: Math.floor(exact),
        remainder: exact - Math.floor(exact),
      };
    },
  );
  let remaining = total - base.reduce((sum, item) => sum + item.count, 0);

  for (const item of [...base].sort((left, right) => right.remainder - left.remainder)) {
    if (remaining <= 0) {
      break;
    }
    item.count += 1;
    remaining -= 1;
  }

  return base.map(({ difficulty, count }) => ({ difficulty, count }));
}

async function readInventoryQuestions(
  args: Pick<InventoryArgs, "sourceDir" | "manifestPath" | "excludeManifestPath">,
) {
  const sourceFiles = args.manifestPath
    ? readManifestJsonFiles(args.manifestPath)
    : listJsonFiles(path.resolve(args.sourceDir));
  const excludedFiles = new Set(
    args.excludeManifestPath
      ? readManifestJsonFiles(args.excludeManifestPath).map((file) => path.normalize(file))
      : [],
  );
  const files = sourceFiles.filter((file) => !excludedFiles.has(path.normalize(file)));
  const questions: InventoryQuestion[] = [];
  const invalidFiles: Array<{ path: string; message: string }> = [];

  for (const file of files) {
    try {
      const parsedJson = JSON.parse(await readFile(file, "utf8")) as unknown;
      const parsed = QuestionBundleSchema.safeParse(parsedJson);
      if (!parsed.success) {
        invalidFiles.push({
          path: path.relative(process.cwd(), file).replaceAll(path.sep, "/"),
          message: parsed.error.issues[0]?.message ?? "invalid question bundle",
        });
        continue;
      }

      for (const item of parsed.data.items) {
        questions.push(...inventoryRowsForItem(item));
      }
    } catch (error) {
      invalidFiles.push({
        path: path.relative(process.cwd(), file).replaceAll(path.sep, "/"),
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    filesFound: files.length,
    questions,
    invalidFiles,
  };
}

function inventoryRowsForItem(item: QuestionBundleItem): InventoryQuestion[] {
  return item.examTypes.map((examType) => ({
    examType,
    questionType: item.type,
    difficulty: item.difficulty,
    primaryKpCode: item.primaryKpCode,
    kpGroup: kpGroupOf(item.primaryKpCode),
    source: item.source,
  }));
}

function buildAvailableCounts(questions: InventoryQuestion[]) {
  const available = new Map<CountKey, number>();
  const realPaper = new Map<CountKey, number>();
  const exactKpCounts = new Map<string, number>();

  for (const question of questions) {
    const key = countKey(question);
    const target = question.source === "real_paper" ? realPaper : available;
    target.set(key, (target.get(key) ?? 0) + 1);

    const exactKey = [
      question.examType,
      question.questionType,
      question.difficulty,
      question.primaryKpCode,
      question.source,
    ].join("|");
    exactKpCounts.set(exactKey, (exactKpCounts.get(exactKey) ?? 0) + 1);
  }

  return { available, realPaper, exactKpCounts };
}

function buildDeficits(params: {
  available: Map<CountKey, number>;
  targetPapers: number;
}): DeficitRow[] {
  const deficits: DeficitRow[] = [];

  for (const examType of EXAM_TYPES) {
    const spec = blueprintSpecs[examType];
    for (const section of spec.sections) {
      for (const quota of section.primaryKpQuota) {
        const requiredForKp = quota.count * params.targetPapers;
        for (const allocation of allocateByDifficulty(
          requiredForKp,
          section.difficultyDistribution,
        )) {
          const key = countKey({
            examType,
            questionType: section.questionType,
            difficulty: allocation.difficulty,
            kpGroup: quota.kpCode,
          });
          const available = params.available.get(key) ?? 0;
          const deficit = Math.max(0, allocation.count - available);

          deficits.push({
            examType,
            questionType: section.questionType,
            difficulty: allocation.difficulty,
            kpGroup: quota.kpCode,
            required: allocation.count,
            available,
            deficit,
          });
        }
      }
    }
  }

  return deficits.sort(
    (left, right) =>
      right.deficit - left.deficit ||
      left.examType.localeCompare(right.examType) ||
      left.questionType.localeCompare(right.questionType) ||
      left.kpGroup.localeCompare(right.kpGroup) ||
      left.difficulty.localeCompare(right.difficulty),
  );
}

function mapToRows(map: Map<string, number>) {
  return [...map.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, count]) => ({ key, count }));
}

function buildMarkdownReport(params: {
  generatedAt: string;
  sourceDir: string;
  targetPapers: number;
  filesFound: number;
  questionRows: number;
  invalidFiles: Array<{ path: string; message: string }>;
  deficits: DeficitRow[];
}) {
  const totalDeficit = params.deficits.reduce((sum, row) => sum + row.deficit, 0);
  const topDeficits = params.deficits.filter((row) => row.deficit > 0).slice(0, 40);
  const lines = [
    "# 2026 Question Inventory Report",
    "",
    `- Generated at: ${params.generatedAt}`,
    `- Source dir: ${params.sourceDir}`,
    `- Target prebuilt papers per exam type: ${params.targetPapers}`,
    `- Bundle files found: ${params.filesFound}`,
    `- Counted exam-tagged question rows: ${params.questionRows}`,
    `- Total non-real-paper deficit: ${totalDeficit}`,
    "",
    "## Top Deficits",
    "",
    "| examType | questionType | difficulty | kpGroup | required | available | deficit |",
    "| --- | --- | --- | --- | ---: | ---: | ---: |",
    ...topDeficits.map(
      (row) =>
        `| ${row.examType} | ${row.questionType} | ${row.difficulty} | ${row.kpGroup} | ${row.required} | ${row.available} | ${row.deficit} |`,
    ),
    "",
  ];

  if (params.invalidFiles.length > 0) {
    lines.push("## Invalid Files", "");
    for (const file of params.invalidFiles.slice(0, 80)) {
      lines.push(`- ${file.path}: ${file.message}`);
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inventory = await readInventoryQuestions(args);
  const counts = buildAvailableCounts(inventory.questions);
  const deficits = buildDeficits({
    available: counts.available,
    targetPapers: args.targetPapers,
  });
  const generatedAt = new Date().toISOString();
  const payload = {
    generatedAt,
    sourceDir: args.sourceDir,
    sourceManifest: args.manifestPath,
    excludedManifest: args.excludeManifestPath,
    targetPapersPerExamType: args.targetPapers,
    filesFound: inventory.filesFound,
    invalidFiles: inventory.invalidFiles,
    countedQuestionRows: inventory.questions.length,
    counts: {
      nonRealPaperByExamTypeQuestionTypeDifficultyKpGroup: mapToRows(counts.available),
      realPaperByExamTypeQuestionTypeDifficultyKpGroup: mapToRows(counts.realPaper),
      exactPrimaryKpByExamTypeQuestionTypeDifficultySource: mapToRows(counts.exactKpCounts),
    },
    deficits,
    summary: {
      totalDeficit: deficits.reduce((sum, row) => sum + row.deficit, 0),
      deficitRows: deficits.filter((row) => row.deficit > 0).length,
      satisfiedRows: deficits.filter((row) => row.deficit === 0).length,
    },
  };

  const markdown = buildMarkdownReport({
    generatedAt,
    sourceDir: args.sourceDir,
    targetPapers: args.targetPapers,
    filesFound: inventory.filesFound,
    questionRows: inventory.questions.length,
    invalidFiles: inventory.invalidFiles,
    deficits,
  });

  console.log(markdown);

  if (args.write) {
    await mkdir(args.outDir, { recursive: true });
    await writeFile(
      path.join(args.outDir, "question-inventory.json"),
      `${JSON.stringify(payload, null, 2)}\n`,
    );
    await writeFile(path.join(args.outDir, "question-inventory.md"), markdown);

    const writtenDirs = [args.outDir];
    if (args.outRunDir) {
      await mkdir(args.outRunDir, { recursive: true });
      await writeFile(
        path.join(args.outRunDir, "question-inventory.json"),
        `${JSON.stringify(payload, null, 2)}\n`,
      );
      await writeFile(path.join(args.outRunDir, "question-inventory.md"), markdown);
      writtenDirs.push(args.outRunDir);
    }

    console.log(
      `Report written to ${writtenDirs
        .map((dir) => path.relative(process.cwd(), dir).replaceAll(path.sep, "/"))
        .join(", ")}`,
    );
  }
}

const isEntrypoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
