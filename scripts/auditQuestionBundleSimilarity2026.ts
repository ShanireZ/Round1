import fs from "node:fs";
import path from "node:path";

import {
  QuestionBundleSchema,
  type QuestionBundleItem,
  type QuestionType,
} from "./lib/bundleTypes.js";
import {
  buildQuestionSalientText,
  buildQuestionSimilarityText,
  isLikelyParameterizedTemplateSimilarity,
} from "../server/services/deduplicationService.js";

const DEFAULT_THRESHOLD = 0.85;
const NGRAM_SIZE = 3;

const usage = `Usage: npx tsx scripts/auditQuestionBundleSimilarity2026.ts (--manifest <manifest.json> | --dir papers/2026) [--threshold 0.85] [--out-dir <dir>] [--cross-kp] [--max-pairs <count>] [--preview-chars 120]`;

interface AuditArgs {
  manifestPath?: string;
  sourceDir?: string;
  threshold: number;
  outDir?: string;
  sameKpOnly: boolean;
  maxPairs?: number;
  previewChars: number;
}

interface AuditRecord {
  id: string;
  sourcePath: string;
  itemIndex: number;
  bundleRunId: string;
  questionType: QuestionType;
  difficulty: string;
  primaryKpCode: string;
  examTypes: string[];
  contentHash: string;
  stem: string;
  similarityText: string;
  salientText: string;
  normalizedSimilarityText: string;
  grams: Set<string>;
  salientGrams: Set<string>;
}

interface AuditPair {
  similarity: number;
  salientSimilarity: number;
  recommendation: PairRecommendation;
  questionType: QuestionType;
  samePrimaryKp: boolean;
  sameDifficulty: boolean;
  sharedExamTypes: string[];
  left: AuditPairSide;
  right: AuditPairSide;
}

interface AuditPairSide {
  id: string;
  sourcePath: string;
  itemIndex: number;
  bundleRunId: string;
  difficulty: string;
  primaryKpCode: string;
  examTypes: string[];
  contentHash: string;
  stemPreview: string;
  similarityTextPreview: string;
  salientTextPreview: string;
}

interface ExactDuplicateGroup {
  contentHash: string;
  occurrences: AuditPairSide[];
}

type PairRecommendation =
  | "auto_delete_candidate"
  | "manual_review_candidate"
  | "ignore_likely_false_positive";

function readArg(args: string[], name: string) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function parseArgs(argv: string[]): AuditArgs {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(usage);
    process.exit(0);
  }

  const manifestPath = readArg(argv, "--manifest");
  const sourceDir = readArg(argv, "--dir");
  if (!manifestPath && !sourceDir) {
    throw new Error("--manifest or --dir is required");
  }
  if (manifestPath && sourceDir) {
    throw new Error("--manifest and --dir are mutually exclusive");
  }
  if (argv.includes("--same-kp-only") && argv.includes("--cross-kp")) {
    throw new Error("--same-kp-only and --cross-kp are mutually exclusive");
  }

  const thresholdRaw = readArg(argv, "--threshold");
  const threshold = thresholdRaw ? Number.parseFloat(thresholdRaw) : DEFAULT_THRESHOLD;
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 1) {
    throw new Error("--threshold must be a number in (0, 1]");
  }

  const maxPairsRaw = readArg(argv, "--max-pairs");
  const maxPairs = maxPairsRaw ? Number.parseInt(maxPairsRaw, 10) : undefined;
  if (maxPairs !== undefined && (!Number.isInteger(maxPairs) || maxPairs <= 0)) {
    throw new Error("--max-pairs must be a positive integer");
  }

  const previewCharsRaw = readArg(argv, "--preview-chars");
  const previewChars = previewCharsRaw ? Number.parseInt(previewCharsRaw, 10) : 120;
  if (!Number.isInteger(previewChars) || previewChars <= 0) {
    throw new Error("--preview-chars must be a positive integer");
  }

  return {
    manifestPath,
    sourceDir,
    threshold,
    outDir: readArg(argv, "--out-dir"),
    sameKpOnly: !argv.includes("--cross-kp"),
    maxPairs,
    previewChars,
  };
}

function toRepoPath(filePath: string) {
  return path.relative(process.cwd(), filePath).replaceAll(path.sep, "/");
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeSimilarityText(text: string) {
  return text.replace(/\s+/g, "").toLowerCase();
}

function ngrams(text: string, n: number) {
  const grams = new Set<string>();
  for (let index = 0; index <= text.length - n; index += 1) {
    grams.add(text.slice(index, index + n));
  }
  return grams;
}

function jaccardFromSets(left: Set<string>, right: Set<string>) {
  if (left.size === 0 && right.size === 0) {
    return 1;
  }

  let intersection = 0;
  for (const gram of left) {
    if (right.has(gram)) {
      intersection += 1;
    }
  }

  const union = left.size + right.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function preview(value: string, maxChars: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= maxChars ? normalized : `${normalized.slice(0, maxChars - 3)}...`;
}

function classifyPair(params: {
  questionType: QuestionType;
  similarity: number;
  salientSimilarity: number;
  leftText: string;
  rightText: string;
}): PairRecommendation {
  if (
    isLikelyParameterizedTemplateSimilarity(
      params.questionType,
      params.leftText,
      params.rightText,
    )
  ) {
    return "ignore_likely_false_positive";
  }
  if (params.salientSimilarity < 0.65) {
    return "ignore_likely_false_positive";
  }
  return params.similarity >= 0.9 ? "auto_delete_candidate" : "manual_review_candidate";
}

function readManifestBundlePaths(manifestPath: string): string[] {
  const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
    bundlePaths?: unknown;
    bundles?: unknown;
  };

  if (Array.isArray(parsed.bundlePaths)) {
    return parsed.bundlePaths
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => path.resolve(process.cwd(), entry));
  }

  if (Array.isArray(parsed.bundles)) {
    return parsed.bundles
      .filter((entry): entry is { path: string; finalVerdict?: string } => {
        if (typeof entry !== "object" || entry === null) {
          return false;
        }
        const maybeEntry = entry as { path?: unknown; finalVerdict?: unknown };
        return (
          typeof maybeEntry.path === "string" &&
          (maybeEntry.finalVerdict === undefined || maybeEntry.finalVerdict === "pass")
        );
      })
      .map((entry) => path.resolve(process.cwd(), entry.path));
  }

  throw new Error(`Unsupported manifest shape: ${manifestPath}`);
}

function listQuestionBundleFiles(sourceDir: string): string[] {
  if (!fs.existsSync(sourceDir)) {
    return [];
  }

  const files: string[] = [];
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const entryPath = path.join(sourceDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listQuestionBundleFiles(entryPath));
      continue;
    }

    if (
      entry.isFile() &&
      entry.name.includes("__question-bundle__") &&
      entry.name.endsWith(".json")
    ) {
      files.push(entryPath);
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

function resolveBundleFiles(args: AuditArgs) {
  if (args.manifestPath) {
    return readManifestBundlePaths(path.resolve(process.cwd(), args.manifestPath)).sort((left, right) =>
      left.localeCompare(right),
    );
  }

  return listQuestionBundleFiles(path.resolve(process.cwd(), args.sourceDir!));
}

function pairSide(record: AuditRecord, previewChars: number): AuditPairSide {
  return {
    id: record.id,
    sourcePath: record.sourcePath,
    itemIndex: record.itemIndex,
    bundleRunId: record.bundleRunId,
    difficulty: record.difficulty,
    primaryKpCode: record.primaryKpCode,
    examTypes: record.examTypes,
    contentHash: record.contentHash,
    stemPreview: preview(record.stem, previewChars),
    similarityTextPreview: preview(record.similarityText, previewChars),
    salientTextPreview: preview(record.salientText, previewChars),
  };
}

function loadAuditRecords(bundleFiles: string[]): AuditRecord[] {
  const records: AuditRecord[] = [];

  for (const bundleFile of bundleFiles) {
    const repoPath = toRepoPath(bundleFile);
    const bundle = QuestionBundleSchema.parse(JSON.parse(fs.readFileSync(bundleFile, "utf8")));
    bundle.items.forEach((item: QuestionBundleItem, itemIndex: number) => {
      const similarityText = buildQuestionSimilarityText(item.type, item.contentJson);
      const salientText = buildQuestionSalientText(similarityText);
      const normalizedSimilarityText = normalizeSimilarityText(similarityText);
      records.push({
        id: `${repoPath}#${itemIndex}`,
        sourcePath: repoPath,
        itemIndex,
        bundleRunId: bundle.meta.runId,
        questionType: item.type,
        difficulty: item.difficulty,
        primaryKpCode: item.primaryKpCode,
        examTypes: [...item.examTypes].sort(),
        contentHash: item.contentHash,
        stem: item.contentJson.stem,
        similarityText,
        salientText,
        normalizedSimilarityText,
        grams: ngrams(normalizedSimilarityText, NGRAM_SIZE),
        salientGrams: ngrams(normalizeSimilarityText(salientText), NGRAM_SIZE),
      });
    });
  }

  return records.sort((left, right) => left.id.localeCompare(right.id));
}

function sharedExamTypes(left: AuditRecord, right: AuditRecord) {
  const rightExamTypes = new Set(right.examTypes);
  return left.examTypes.filter((examType) => rightExamTypes.has(examType));
}

function shouldCompare(left: AuditRecord, right: AuditRecord, args: AuditArgs) {
  return (
    left.questionType === right.questionType &&
    (!args.sameKpOnly || left.primaryKpCode === right.primaryKpCode)
  );
}

function auditGroup(records: AuditRecord[], args: AuditArgs) {
  const pairs: AuditPair[] = [];
  const inverted = new Map<string, number[]>();
  const emptyGramRecordIndexes: number[] = [];
  let candidatePairsScored = 0;

  for (const [currentIndex, current] of records.entries()) {
    const overlapCounts = new Map<number, number>();

    for (const gram of current.grams) {
      const previousIndexes = inverted.get(gram) ?? [];
      for (const previousIndex of previousIndexes) {
        overlapCounts.set(previousIndex, (overlapCounts.get(previousIndex) ?? 0) + 1);
      }
    }

    if (current.grams.size === 0) {
      for (const previousIndex of emptyGramRecordIndexes) {
        overlapCounts.set(previousIndex, 0);
      }
    }

    for (const [previousIndex, intersection] of overlapCounts) {
      const previous = records[previousIndex]!;
      if (!shouldCompare(previous, current, args)) {
        continue;
      }

      candidatePairsScored += 1;
      const union = previous.grams.size + current.grams.size - intersection;
      const similarity =
        previous.grams.size === 0 && current.grams.size === 0 ? 1 : union === 0 ? 0 : intersection / union;

      if (similarity >= args.threshold) {
        const salientSimilarity = jaccardFromSets(previous.salientGrams, current.salientGrams);
        pairs.push({
          similarity,
          salientSimilarity,
          recommendation: classifyPair({
            questionType: current.questionType,
            similarity,
            salientSimilarity,
            leftText: previous.similarityText,
            rightText: current.similarityText,
          }),
          questionType: current.questionType,
          samePrimaryKp: previous.primaryKpCode === current.primaryKpCode,
          sameDifficulty: previous.difficulty === current.difficulty,
          sharedExamTypes: sharedExamTypes(previous, current),
          left: pairSide(previous, args.previewChars),
          right: pairSide(current, args.previewChars),
        });
      }
    }

    if (current.grams.size === 0) {
      emptyGramRecordIndexes.push(currentIndex);
    }
    for (const gram of current.grams) {
      const previousIndexes = inverted.get(gram);
      if (previousIndexes) {
        previousIndexes.push(currentIndex);
      } else {
        inverted.set(gram, [currentIndex]);
      }
    }
  }

  return { pairs, candidatePairsScored };
}

function findExactDuplicates(records: AuditRecord[], previewChars: number): ExactDuplicateGroup[] {
  const byHash = new Map<string, AuditRecord[]>();
  for (const record of records) {
    const bucket = byHash.get(record.contentHash);
    if (bucket) {
      bucket.push(record);
    } else {
      byHash.set(record.contentHash, [record]);
    }
  }

  return [...byHash.entries()]
    .filter(([_contentHash, bucket]) => bucket.length > 1)
    .map(([contentHash, bucket]) => ({
      contentHash,
      occurrences: bucket.map((record) => pairSide(record, previewChars)),
    }))
    .sort((left, right) => right.occurrences.length - left.occurrences.length);
}

function summarizePairs(pairs: AuditPair[]) {
  const byQuestionType: Record<string, number> = {};
  const bySamePrimaryKp: Record<string, number> = {};
  const bySimilarityBand: Record<string, number> = {};
  const byRecommendation: Record<string, number> = {};

  for (const pair of pairs) {
    byQuestionType[pair.questionType] = (byQuestionType[pair.questionType] ?? 0) + 1;
    const kpBucket = pair.samePrimaryKp ? "same_primary_kp" : "different_primary_kp";
    bySamePrimaryKp[kpBucket] = (bySamePrimaryKp[kpBucket] ?? 0) + 1;
    const band =
      pair.similarity >= 0.98
        ? "0.98-1.00"
        : pair.similarity >= 0.95
          ? "0.95-0.98"
          : pair.similarity >= 0.9
            ? "0.90-0.95"
            : "threshold-0.90";
    bySimilarityBand[band] = (bySimilarityBand[band] ?? 0) + 1;
    byRecommendation[pair.recommendation] = (byRecommendation[pair.recommendation] ?? 0) + 1;
  }

  return { byQuestionType, bySamePrimaryKp, bySimilarityBand, byRecommendation };
}

function comparePairs(left: AuditPair, right: AuditPair) {
  return (
    right.similarity - left.similarity ||
    right.salientSimilarity - left.salientSimilarity ||
    left.questionType.localeCompare(right.questionType) ||
    left.left.id.localeCompare(right.left.id) ||
    left.right.id.localeCompare(right.right.id)
  );
}

function markdownEscape(value: string) {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function tsvEscape(value: string | number | boolean | string[]) {
  return String(Array.isArray(value) ? value.join(",") : value)
    .replace(/\t/g, " ")
    .replace(/\r?\n/g, " ")
    .trim();
}

function renderHighSimilarityPairsTsv(pairs: AuditPair[]) {
  const headers = [
    "similarity",
    "salientSimilarity",
    "recommendation",
    "questionType",
    "samePrimaryKp",
    "sameDifficulty",
    "sharedExamTypes",
    "leftId",
    "leftSourcePath",
    "leftItemIndex",
    "leftBundleRunId",
    "leftDifficulty",
    "leftPrimaryKpCode",
    "leftExamTypes",
    "leftContentHash",
    "leftStemPreview",
    "rightId",
    "rightSourcePath",
    "rightItemIndex",
    "rightBundleRunId",
    "rightDifficulty",
    "rightPrimaryKpCode",
    "rightExamTypes",
    "rightContentHash",
    "rightStemPreview",
    "leftSimilarityTextPreview",
    "rightSimilarityTextPreview",
    "leftSalientTextPreview",
    "rightSalientTextPreview",
  ];

  const lines = [headers.join("\t")];
  for (const pair of pairs) {
    lines.push(
      [
        pair.similarity.toFixed(6),
        pair.salientSimilarity.toFixed(6),
        pair.recommendation,
        pair.questionType,
        pair.samePrimaryKp,
        pair.sameDifficulty,
        pair.sharedExamTypes,
        pair.left.id,
        pair.left.sourcePath,
        pair.left.itemIndex,
        pair.left.bundleRunId,
        pair.left.difficulty,
        pair.left.primaryKpCode,
        pair.left.examTypes,
        pair.left.contentHash,
        pair.left.stemPreview,
        pair.right.id,
        pair.right.sourcePath,
        pair.right.itemIndex,
        pair.right.bundleRunId,
        pair.right.difficulty,
        pair.right.primaryKpCode,
        pair.right.examTypes,
        pair.right.contentHash,
        pair.right.stemPreview,
        pair.left.similarityTextPreview,
        pair.right.similarityTextPreview,
        pair.left.salientTextPreview,
        pair.right.salientTextPreview,
      ]
        .map(tsvEscape)
        .join("\t"),
    );
  }

  return `${lines.join("\n")}\n`;
}

function renderMarkdown(params: {
  generatedAt: string;
  sourceLabel: string;
  threshold: number;
  totalFiles: number;
  totalItems: number;
  candidatePairsScored: number;
  highSimilarityPairs: number;
  exactDuplicateGroups: number;
  pairs: AuditPair[];
  maxRows: number;
}) {
  const lines = [
    "# Question Similarity Audit 2026",
    "",
    `- Generated at: ${params.generatedAt}`,
    `- Source: ${params.sourceLabel}`,
    `- Threshold: ${params.threshold}`,
    `- Similarity basis: single_choice uses stem+options; code questions use code/subquestions/blanks/sample IO, not boilerplate stem`,
    `- Bundle files: ${params.totalFiles}`,
    `- Items: ${params.totalItems}`,
    `- Candidate pairs scored: ${params.candidatePairsScored}`,
    `- High-similarity pairs: ${params.highSimilarityPairs}`,
    `- Exact contentHash duplicate groups: ${params.exactDuplicateGroups}`,
    "",
    "## High-Similarity Pairs",
    "",
  ];

  if (params.pairs.length === 0) {
    lines.push("No pairs met the configured threshold.", "");
    return `${lines.join("\n")}\n`;
  }

  lines.push(
    "| similarity | salient similarity | recommendation | type | same KP | left | right | left effective text | right effective text |",
    "| ---: | ---: | --- | --- | --- | --- | --- | --- | --- |",
  );

  for (const pair of params.pairs.slice(0, params.maxRows)) {
    lines.push(
      [
        pair.similarity.toFixed(4),
        pair.salientSimilarity.toFixed(4),
        pair.recommendation,
        pair.questionType,
        pair.samePrimaryKp ? "yes" : "no",
        `${pair.left.sourcePath}#${pair.left.itemIndex}`,
        `${pair.right.sourcePath}#${pair.right.itemIndex}`,
        markdownEscape(pair.left.similarityTextPreview),
        markdownEscape(pair.right.similarityTextPreview),
      ].join(" | ").replace(/^/, "| ").replace(/$/, " |"),
    );
  }

  if (params.pairs.length > params.maxRows) {
    lines.push("", `Markdown table truncated to ${params.maxRows} rows. See JSON for full details.`);
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
}

function defaultOutDir(args: AuditArgs) {
  if (args.outDir) {
    return path.resolve(process.cwd(), args.outDir);
  }
  if (args.manifestPath) {
    return path.dirname(path.resolve(process.cwd(), args.manifestPath));
  }
  return path.resolve(process.cwd(), "artifacts/reports/2026");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const bundleFiles = resolveBundleFiles(args);
  const records = loadAuditRecords(bundleFiles);
  const recordsByType = new Map<QuestionType, AuditRecord[]>();
  let candidatePairsScored = 0;
  let pairs: AuditPair[] = [];

  for (const record of records) {
    const bucket = recordsByType.get(record.questionType);
    if (bucket) {
      bucket.push(record);
    } else {
      recordsByType.set(record.questionType, [record]);
    }
  }

  for (const bucket of recordsByType.values()) {
    const result = auditGroup(bucket, args);
    candidatePairsScored += result.candidatePairsScored;
    pairs = pairs.concat(result.pairs);
  }

  pairs.sort(comparePairs);
  const truncatedPairs =
    args.maxPairs !== undefined && pairs.length > args.maxPairs ? pairs.slice(0, args.maxPairs) : pairs;
  const generatedAt = new Date().toISOString();
  const outDir = defaultOutDir(args);
  fs.mkdirSync(outDir, { recursive: true });

  const sourceLabel = args.manifestPath
    ? toRepoPath(path.resolve(process.cwd(), args.manifestPath))
    : toRepoPath(path.resolve(process.cwd(), args.sourceDir!));
  const baseName = `${slugify(path.basename(sourceLabel, ".json")) || "question-bundles"}__similarity-audit`;
  const jsonPath = path.join(outDir, `${baseName}.json`);
  const markdownPath = path.join(outDir, `${baseName}.md`);
  const highSimilarityPairsPath = path.join(outDir, `${baseName}__high-similarity-pairs.tsv`);
  const autoDeleteCandidatesPath = path.join(outDir, `${baseName}__auto-delete-candidates.tsv`);
  const manualReviewCandidatesPath = path.join(outDir, `${baseName}__manual-review-candidates.tsv`);
  const ignoredFalsePositivesPath = path.join(outDir, `${baseName}__ignored-likely-false-positive.tsv`);
  const exactDuplicateGroups = findExactDuplicates(records, args.previewChars);
  const autoDeleteCandidates = truncatedPairs.filter(
    (pair) => pair.recommendation === "auto_delete_candidate",
  );
  const manualReviewCandidates = truncatedPairs.filter(
    (pair) => pair.recommendation === "manual_review_candidate",
  );
  const ignoredFalsePositives = truncatedPairs.filter(
    (pair) => pair.recommendation === "ignore_likely_false_positive",
  );
  const summary = {
    generatedAt,
    reportType: "question_similarity_audit_2026",
    source: {
      label: sourceLabel,
      manifestPath: args.manifestPath ? toRepoPath(path.resolve(process.cwd(), args.manifestPath)) : null,
      sourceDir: args.sourceDir ? toRepoPath(path.resolve(process.cwd(), args.sourceDir)) : null,
      bundleFiles: bundleFiles.length,
      items: records.length,
    },
    audit: {
      threshold: args.threshold,
      ngramSize: NGRAM_SIZE,
      comparisonScope: args.sameKpOnly ? "same question type and primary KP" : "same question type",
      crossKpFuzzyAudit: !args.sameKpOnly,
      similarityBasis:
        "single_choice: stem+options; reading_program: cppCode+subQuestions+sample IO; completion_program: cppCode+fullCode+blanks+sample IO",
      candidatePairsScored,
      highSimilarityPairs: pairs.length,
      pairsTruncated: truncatedPairs.length < pairs.length,
      emittedPairs: truncatedPairs.length,
      exactDuplicateGroups: exactDuplicateGroups.length,
      autoDeleteCandidates: autoDeleteCandidates.length,
      manualReviewCandidates: manualReviewCandidates.length,
      ignoredLikelyFalsePositives: ignoredFalsePositives.length,
      ...summarizePairs(pairs),
    },
    exactDuplicateGroups,
    pairs: truncatedPairs,
  };

  fs.writeFileSync(jsonPath, `${JSON.stringify(summary, null, 2)}\n`);
  fs.writeFileSync(highSimilarityPairsPath, renderHighSimilarityPairsTsv(truncatedPairs));
  fs.writeFileSync(autoDeleteCandidatesPath, renderHighSimilarityPairsTsv(autoDeleteCandidates));
  fs.writeFileSync(manualReviewCandidatesPath, renderHighSimilarityPairsTsv(manualReviewCandidates));
  fs.writeFileSync(ignoredFalsePositivesPath, renderHighSimilarityPairsTsv(ignoredFalsePositives));
  fs.writeFileSync(
    markdownPath,
    renderMarkdown({
      generatedAt,
      sourceLabel,
      threshold: args.threshold,
      totalFiles: bundleFiles.length,
      totalItems: records.length,
      candidatePairsScored,
      highSimilarityPairs: pairs.length,
      exactDuplicateGroups: exactDuplicateGroups.length,
      pairs: truncatedPairs,
      maxRows: 200,
    }),
  );

  console.log(
    JSON.stringify(
      {
        jsonPath: toRepoPath(jsonPath),
        markdownPath: toRepoPath(markdownPath),
        highSimilarityPairsPath: toRepoPath(highSimilarityPairsPath),
        autoDeleteCandidatesPath: toRepoPath(autoDeleteCandidatesPath),
        manualReviewCandidatesPath: toRepoPath(manualReviewCandidatesPath),
        ignoredFalsePositivesPath: toRepoPath(ignoredFalsePositivesPath),
        bundleFiles: bundleFiles.length,
        items: records.length,
        candidatePairsScored,
        highSimilarityPairs: pairs.length,
        emittedPairs: truncatedPairs.length,
        exactDuplicateGroups: exactDuplicateGroups.length,
        autoDeleteCandidates: autoDeleteCandidates.length,
        manualReviewCandidates: manualReviewCandidates.length,
        ignoredLikelyFalsePositives: ignoredFalsePositives.length,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
