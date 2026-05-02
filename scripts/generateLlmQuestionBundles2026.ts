import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { generateObject, generateText } from "ai";
import { z } from "zod";

import { blueprintSpecs } from "../config/blueprint.js";
import { env } from "../config/env.js";
import { EXAM_TYPES, type ExamType } from "../config/examTypes.js";
import {
  createProviderLanguageModel,
  getSceneExecutionChain,
  type LLMLane,
  type LLMProviderName,
  type LLMScene,
  type ProviderReasoningOptions,
} from "../config/llm.js";
import { computeContentHash } from "../server/services/deduplicationService.js";
import { runCpp } from "../server/services/sandbox/cppRunner.js";
import {
  BUNDLE_SCHEMA_VERSION,
  QuestionBundleItemSchema,
  QuestionBundleSchema,
  QuestionTypeSchema,
  buildBundleIntegrity,
  buildValidationMetadata,
  computeChecksum,
  type Difficulty,
  type ImportError,
  type QuestionBundle,
  type QuestionBundleItem,
  type QuestionType,
} from "./lib/bundleTypes.js";
import { defaultOfflineReportPath, defaultQuestionBundleOutputPath } from "./lib/paperPaths.js";
import { extractJsonObject } from "./lib/modelJson.js";
import { validateQuestionBundle } from "./lib/questionBundleWorkflow.js";

(globalThis as typeof globalThis & { AI_SDK_LOG_WARNINGS?: boolean }).AI_SDK_LOG_WARNINGS = false;

type ArgValue = boolean | string;

interface Combo {
  bundleNo: number;
  examType: ExamType;
  questionType: QuestionType;
  primaryKpCode: string;
  difficulty: Difficulty;
}

interface GeneratedBundle {
  bundle: QuestionBundle;
  combo: Combo;
  outputPath: string;
  repoPath: string;
  generation: {
    lane: LLMLane;
    providerName: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
  };
}

interface AuditIssue {
  code: string;
  severity: "minor" | "major" | "blocker";
  message: string;
}

interface ReviewAttemptReport {
  round: "review-pass-1" | "review-pass-2";
  repairCycle: number;
  lane: LLMLane;
  providerName?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  verdict: "pass" | "fail" | "error";
  issueCount: number;
  issues: Array<AuditIssue & { itemIndex: number }>;
  notes?: string;
  error?: string;
}

interface RepairAttemptReport {
  repairCycle: number;
  lane: LLMLane;
  providerName?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  repairedItems: number[];
  error?: string;
}

interface DirectLlmResult {
  providerName: LLMProviderName;
  model: string;
  inputTokens: number;
  outputTokens: number;
  responseId?: string;
}

interface BundleReport {
  path: string;
  runId: string;
  examType: ExamType;
  questionType: QuestionType;
  primaryKpCode: string;
  difficulty: Difficulty;
  generationLane: LLMLane;
  generationProvider: string;
  generationModel: string;
  finalVerdict: "pass" | "fail";
  formalBundleStatus: "llm_chain_passed" | "llm_chain_failed";
  questionStatusIfImported: "draft";
  questionLifecycleStatusAfterReview: "draft" | "reviewed";
  currentQuestionBundleImportDefaultStatus: "draft";
  reviewStatusEvidence: "two_round_llm_reviewed" | "llm_chain_failed";
  importedToDatabase: false;
  prebuiltPapersBuilt: false;
  published: false;
  rewritesApplied: number;
  validationErrors: ImportError[];
  reviewAttempts: ReviewAttemptReport[];
  repairAttempts: RepairAttemptReport[];
  checksum: string;
}

interface ProcessResult {
  bundle?: QuestionBundle;
  report: BundleReport;
}

interface TaxonomyNode {
  code: string;
  name: string;
  children?: TaxonomyNode[];
}

const DEFAULT_TOTAL_QUESTIONS = 4000;
const DEFAULT_QUESTIONS_PER_BUNDLE = 5;
const DEFAULT_DATE = "2026-05-01";
const DEFAULT_BATCH_RUN_ID = `${DEFAULT_DATE}-bulk4000-mixed-all-v01`;
const DEFAULT_SEED = "round1-2026-llm-4000-v1";
const DEFAULT_MAX_CONCURRENCY = 2;
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_GENERATION_ATTEMPTS = 3;
const DEFAULT_MAX_REPAIR_CYCLES = 2;
const DEFAULT_LLM_JSON_ATTEMPTS = 2;
const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

const generatedSingleChoiceSchema = z.object({
  stem: z.string().min(10),
  options: z.array(z.string().min(1)).min(4),
  answer: z.string().min(1),
  explanation: z.string().min(10),
  primaryKpCode: z.string().min(1),
  auxiliaryKpCodes: z.array(z.string().min(1)).max(3).default([]),
});

const generatedReadingProgramSchema = z.object({
  stem: z.string().min(10),
  cppCode: z.string().min(30),
  subQuestions: z
    .array(
      z.object({
        stem: z.string().min(1),
        options: z.array(z.string().min(1)).min(4),
        answer: z.string().min(1),
        explanation: z.string().min(10),
      }),
    )
    .min(1)
    .max(5),
  sampleInputs: z.array(z.string()).min(1),
  expectedOutputs: z.array(z.string()).min(1),
  primaryKpCode: z.string().min(1),
  auxiliaryKpCodes: z.array(z.string().min(1)).max(3).default([]),
});

const generatedCompletionProgramSchema = z.object({
  stem: z.string().min(10),
  cppCode: z.string().min(30),
  blanks: z
    .array(
      z.object({
        id: z.string().min(1),
        options: z.array(z.string().min(1)).min(4),
        answer: z.string().min(1),
        explanation: z.string().min(10),
      }),
    )
    .min(1)
    .max(5),
  fullCode: z.string().min(30),
  sampleInputs: z.array(z.string()).min(1),
  expectedOutputs: z.array(z.string()).min(1),
  primaryKpCode: z.string().min(1),
  auxiliaryKpCodes: z.array(z.string().min(1)).max(3).default([]),
});

const issueSchema = z.object({
  code: z.string().min(1),
  severity: z.enum(["minor", "major", "blocker"]),
  message: z.string().min(1),
});

const auditItemSchema = z.object({
  itemIndex: z.number().int().min(0),
  verdict: z.enum(["pass", "fail"]),
  confidence: z.number().min(0).max(1),
  issues: z.array(issueSchema).default([]),
});

const auditResponseSchema = z.object({
  bundleVerdict: z.enum(["pass", "fail"]),
  items: z.array(auditItemSchema).min(1),
  notes: z.string().optional().default(""),
});

const repairItemSchema = z.object({
  itemIndex: z.number().int().min(0),
  contentJson: z.unknown(),
  answerJson: z.unknown(),
  explanationJson: z.unknown(),
  repairNotes: z.string().optional().default(""),
});

const repairResponseSchema = z.object({
  items: z.array(repairItemSchema).min(1),
});

type AuditResponse = z.infer<typeof auditResponseSchema>;
type RepairResponse = z.infer<typeof repairResponseSchema>;

function printHelp() {
  console.log(`Usage: tsx scripts/generateLlmQuestionBundles2026.ts [options]

Generate LLM-reviewed 2026 question bundles, five questions per JSON.

Options:
  --total <number>                 Total questions to generate (default: 4000)
  --per-bundle <number>            Questions per bundle JSON (default: 5)
  --batch-run-id <id>              Batch report run id (default: ${DEFAULT_BATCH_RUN_ID})
  --seed <text>                    Deterministic distribution seed (default: ${DEFAULT_SEED})
  --max-concurrency <number>       Parallel bundle workers (default: 2)
  --timeout-ms <number>            Timeout for each LLM call (default: 120000)
  --max-generation-attempts <n>    Regenerate a failed bundle up to n times (default: 3)
  --max-repair-cycles <n>          Repair failed review cycles per bundle (default: 2)
  --llm-json-attempts <n>          JSON parse retries per LLM call (default: 2)
  --shard-index <number>           Zero-based shard index (default: 0)
  --shard-count <number>           Total shard count (default: 1)
  --only-bundles <list>            Comma/range bundle numbers to process, e.g. 7,19-23
  --overwrite                      Replace existing bundle/report files
  --dry-run                        Exercise the LLM chain without writing files
  --help                           Show this help message
`);
}

function parseArgs(argv: string[]) {
  if (argv.includes("--help") || argv.includes("-h")) {
    printHelp();
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
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      args[key] = true;
      continue;
    }

    args[key] = value;
    index += 1;
  }

  const totalQuestions = readPositiveInt(args, "total", DEFAULT_TOTAL_QUESTIONS);
  const questionsPerBundle = readPositiveInt(args, "per-bundle", DEFAULT_QUESTIONS_PER_BUNDLE);
  if (totalQuestions % questionsPerBundle !== 0) {
    throw new Error("--total must be divisible by --per-bundle");
  }

  const shardIndex = readNonNegativeInt(args, "shard-index", 0);
  const shardCount = readPositiveInt(args, "shard-count", 1);
  if (shardIndex >= shardCount) {
    throw new Error("--shard-index must be lower than --shard-count");
  }

  return {
    totalQuestions,
    questionsPerBundle,
    totalBundles: totalQuestions / questionsPerBundle,
    batchRunId:
      typeof args["batch-run-id"] === "string" ? args["batch-run-id"] : DEFAULT_BATCH_RUN_ID,
    seed: typeof args.seed === "string" ? args.seed : DEFAULT_SEED,
    maxConcurrency: readPositiveInt(args, "max-concurrency", DEFAULT_MAX_CONCURRENCY),
    timeoutMs: readPositiveInt(args, "timeout-ms", DEFAULT_TIMEOUT_MS),
    maxGenerationAttempts: readPositiveInt(
      args,
      "max-generation-attempts",
      DEFAULT_MAX_GENERATION_ATTEMPTS,
    ),
    maxRepairCycles: readNonNegativeInt(args, "max-repair-cycles", DEFAULT_MAX_REPAIR_CYCLES),
    llmJsonAttempts: readPositiveInt(args, "llm-json-attempts", DEFAULT_LLM_JSON_ATTEMPTS),
    onlyBundleNos:
      typeof args["only-bundles"] === "string"
        ? parseBundleNoList(args["only-bundles"])
        : undefined,
    shardIndex,
    shardCount,
    overwrite: args.overwrite === true,
    dryRun: args["dry-run"] === true,
  };
}

function readPositiveInt(args: Record<string, ArgValue>, key: string, fallback: number): number {
  const raw = args[key];
  const value = typeof raw === "string" ? Number.parseInt(raw, 10) : fallback;
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`--${key} must be a positive integer`);
  }
  return value;
}

function readNonNegativeInt(args: Record<string, ArgValue>, key: string, fallback: number): number {
  const raw = args[key];
  const value = typeof raw === "string" ? Number.parseInt(raw, 10) : fallback;
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`--${key} must be a non-negative integer`);
  }
  return value;
}

function parseBundleNoList(value: string): Set<number> {
  const bundleNos = new Set<number>();
  for (const part of value.split(",")) {
    const token = part.trim();
    if (!token) {
      continue;
    }
    const range = /^(\d+)-(\d+)$/.exec(token);
    if (range) {
      const start = Number.parseInt(range[1]!, 10);
      const end = Number.parseInt(range[2]!, 10);
      if (start <= 0 || end < start) {
        throw new Error(`Invalid --only-bundles range: ${token}`);
      }
      for (let bundleNo = start; bundleNo <= end; bundleNo += 1) {
        bundleNos.add(bundleNo);
      }
      continue;
    }
    const bundleNo = Number.parseInt(token, 10);
    if (!Number.isInteger(bundleNo) || bundleNo <= 0 || String(bundleNo) !== token) {
      throw new Error(`Invalid --only-bundles value: ${token}`);
    }
    bundleNos.add(bundleNo);
  }
  if (bundleNos.size === 0) {
    throw new Error("--only-bundles must include at least one bundle number");
  }
  return bundleNos;
}

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    h ^= seed.charCodeAt(index);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeRng(seed: string) {
  let state = hashSeed(seed);
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(values: readonly T[], rng: () => number): T[] {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(rng() * (index + 1));
    [copy[index], copy[target]] = [copy[target]!, copy[index]!];
  }
  return copy;
}

function pad4(value: number): string {
  return String(value).padStart(4, "0");
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function makeRunId(combo: Combo, agentLabel: string, pipelineLabel: string): string {
  return [
    DEFAULT_DATE,
    `${pipelineLabel}-${agentLabel}-b${pad4(combo.bundleNo)}`,
    slugify(combo.examType),
    combo.difficulty,
    "v01",
  ].join("-");
}

function deriveBundlePipelineLabel(batchRunId: string, totalQuestions: number): string {
  const runTokens = batchRunId
    .replace(/^\d{4}-\d{2}-\d{2}-/, "")
    .replace(/-v\d{2}$/, "")
    .split("-")
    .filter(Boolean);
  return runTokens.find((token) => /^bulk\d+$/i.test(token)) ?? `bulk${totalQuestions}`;
}

function deriveShardReportRunId(batchRunId: string, shardIndex: number, shardCount: number): string {
  if (shardCount === 1) {
    return batchRunId;
  }
  const suffix = `s${shardIndex + 1}-of-${shardCount}`;
  const versionMatch = batchRunId.match(/-v\d{2}$/);
  if (!versionMatch) {
    return `${batchRunId}-${suffix}`;
  }
  return `${batchRunId.slice(0, versionMatch.index)}-${suffix}${versionMatch[0]}`;
}

function generationLaneFor(bundleNo: number): LLMLane {
  return bundleNo % 2 === 1 ? "default" : "backup";
}

function weightedDifficulty(
  distribution: Record<string, number>,
  rng: () => number,
): Difficulty {
  const weights = DIFFICULTIES.map((difficulty) => ({
    difficulty,
    weight: Math.max(distribution[difficulty] ?? 0, 0),
  }));
  const total = weights.reduce((sum, entry) => sum + entry.weight, 0);
  if (total <= 0) {
    return DIFFICULTIES[Math.floor(rng() * DIFFICULTIES.length)]!;
  }

  let target = rng() * total;
  for (const entry of weights) {
    target -= entry.weight;
    if (target <= 0) {
      return entry.difficulty;
    }
  }
  return weights.at(-1)!.difficulty;
}

function chooseCombos(totalBundles: number, seed: string): Combo[] {
  const rng = makeRng(`${seed}:combos`);
  const selected: Array<Omit<Combo, "bundleNo">> = [];
  const bundlesPerExam = Math.floor(totalBundles / EXAM_TYPES.length);
  const remainder = totalBundles % EXAM_TYPES.length;

  for (const [examIndex, examType] of EXAM_TYPES.entries()) {
    const targetForExam = bundlesPerExam + (examIndex < remainder ? 1 : 0);
    const spec = blueprintSpecs[examType];
    const expanded: Array<Omit<Combo, "bundleNo">> = [];

    for (const section of spec.sections) {
      for (const quota of section.primaryKpQuota) {
        for (let count = 0; count < quota.count; count += 1) {
          expanded.push({
            examType,
            questionType: QuestionTypeSchema.parse(section.questionType),
            primaryKpCode: quota.kpCode,
            difficulty: weightedDifficulty(section.difficultyDistribution, rng),
          });
        }
      }
    }

    const shuffled = shuffle(expanded, rng);
    for (let index = 0; index < targetForExam; index += 1) {
      selected.push(shuffled[index % shuffled.length]!);
    }
  }

  if (selected.length !== totalBundles) {
    throw new Error(`Expected ${totalBundles} combos, got ${selected.length}`);
  }

  return shuffle(selected, rng).map((combo, index) => ({ ...combo, bundleNo: index + 1 }));
}

async function loadTaxonomyNames(): Promise<Map<string, string>> {
  const raw = await readFile(path.join(process.cwd(), "prompts", "taxonomy.json"), "utf8");
  const roots = z.array(z.custom<TaxonomyNode>()).parse(JSON.parse(raw));
  const names = new Map<string, string>();

  function visit(node: TaxonomyNode) {
    names.set(node.code, node.name);
    for (const child of node.children ?? []) {
      visit(child);
    }
  }

  for (const root of roots) {
    visit(root);
  }
  return names;
}

async function collectExistingHashes(root: string): Promise<Set<string>> {
  const hashes = new Set<string>();

  async function visit(dir: string): Promise<void> {
    let entries;
    try {
      entries = await import("node:fs/promises").then((fs) =>
        fs.readdir(dir, { withFileTypes: true }),
      );
    } catch {
      return;
    }

    await Promise.all(
      entries.map(async (entry) => {
        const child = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await visit(child);
          return;
        }
        if (!entry.isFile() || !entry.name.endsWith(".json")) {
          return;
        }

        try {
          const parsed = JSON.parse(await readFile(child, "utf8")) as { items?: unknown };
          if (!Array.isArray(parsed.items)) {
            return;
          }
          for (const item of parsed.items) {
            if (
              typeof item === "object" &&
              item !== null &&
              typeof (item as { contentHash?: unknown }).contentHash === "string"
            ) {
              hashes.add((item as { contentHash: string }).contentHash);
            }
          }
        } catch {
          // Ignore non-question JSON artifacts while collecting duplicate hints.
        }
      }),
    );
  }

  await visit(root);
  return hashes;
}

function generatedItemSchema(questionType: QuestionType) {
  if (questionType === "single_choice") {
    return generatedSingleChoiceSchema;
  }
  if (questionType === "reading_program") {
    return generatedReadingProgramSchema;
  }
  return generatedCompletionProgramSchema;
}

function firstFourOptions(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).slice(0, 4) : [];
}

function normalizeAnswerChoice(value: unknown): string {
  const raw = String(value ?? "").trim().toUpperCase();
  const exact = raw.match(/^[A-D]$/);
  if (exact) {
    return exact[0];
  }
  const prefixed = raw.match(/(?:^|[^A-Z])([A-D])(?:[.、):：]|$)/);
  return prefixed?.[1] ?? raw.slice(0, 1);
}

function maxGenerationTokens(questionType: QuestionType, count: number): number {
  if (questionType === "single_choice") {
    return Math.max(4000, count * 1400);
  }
  return Math.max(9000, count * 3000);
}

function buildQuestionTypeInstruction(questionType: QuestionType): string {
  if (questionType === "single_choice") {
    return [
      "Each item shape:",
      '{"stem":"...","options":["A. ...","B. ...","C. ...","D. ..."],"answer":"A|B|C|D","explanation":"...","primaryKpCode":"...","auxiliaryKpCodes":[]}',
      "Make exactly four options and exactly one correct answer.",
      "Prefer questions with a mechanically checkable unique answer: short C++ expression output, data-structure operation result, complexity under fully specified constraints, or exact algorithm trace.",
      "Use concrete numbers and short traces; avoid purely conceptual wording when a small deterministic calculation can test the same knowledge point.",
      "Avoid broad wording such as best, usually, stable, efficient, suitable, or which algorithm has O(n log n) unless the constraints make exactly one option true.",
      "Avoid option sets where two common algorithms, two equivalent formulas, or two equivalent boolean renderings can both be considered correct.",
    ].join("\n");
  }

  if (questionType === "reading_program") {
    return [
      "Each item shape:",
      '{"stem":"...","cppCode":"complete C++17 program","subQuestions":[{"stem":"...","options":["A. ...","B. ...","C. ...","D. ..."],"answer":"A|B|C|D","explanation":"..."}],"sampleInputs":["..."],"expectedOutputs":["..."],"primaryKpCode":"...","auxiliaryKpCodes":[]}',
      "Each reading_program item must contain exactly five subQuestions.",
      "The C++ code must be deterministic, self-contained, and avoid undefined behavior.",
      "The C++ code must be complete compilable code. Never leave placeholders, ellipses, TODO comments, marker comments in place of statements, or expressions such as /* compute */.",
      "Prefer short programs with at most 35 nonblank lines, one input integer or a tiny fixed array, and values small enough to solve by hand.",
      "Every subQuestion should ask for exact output, final variable value, container size/front/top, or loop count under the given sample input.",
      "The sampleInputs and expectedOutputs must be obtained from the same complete cppCode.",
      "For each subQuestion explanation, show the key trace steps and the exact reason the chosen option is unique; do not use generic phrases such as according to the template or by formula.",
      "Do not rely on locale, file IO, randomness, wall clock time, recursion depth beyond small examples, implementation-defined signed overflow, or unspecified evaluation order.",
    ].join("\n");
  }

  return [
    "Each item shape:",
    '{"stem":"...","cppCode":"C++17 with BLANK1 markers","blanks":[{"id":"BLANK1","options":["A. ...","B. ...","C. ...","D. ..."],"answer":"A|B|C|D","explanation":"..."}],"fullCode":"complete code after filling answers","sampleInputs":["..."],"expectedOutputs":["..."],"primaryKpCode":"...","auxiliaryKpCodes":[]}',
    "Use 2 to 5 blanks. Blank ids in answerJson will be derived from this response.",
    "The fullCode must match the chosen blank answers and sample outputs.",
    "Every blank must have exactly one option that compiles and preserves the expected behavior in fullCode.",
    "Keep fullCode short and fully compilable. Never use placeholders, ellipses, TODO comments, marker comments in place of statements, or expressions such as /* compute */.",
    "Use tiny inputs and deterministic traces; every explanation must state why the other blank options fail or change the output.",
    "Do not use blanks whose alternatives are stylistic equivalents or multiple syntactically valid answers with the same effect.",
  ].join("\n");
}

function buildComboSpecificInstruction(combo: Combo): string {
  if (combo.questionType === "reading_program" && combo.primaryKpCode === "DS") {
    return [
      "For this DS reading_program bundle, prefer one small simulation theme per item: stack, queue, deque, priority_queue, set/map, or adjacency list traversal.",
      "Keep each program traceable with 5 to 10 operations and small integer values; avoid custom templates, graph algorithms with many branches, and hidden invariants.",
      "Make the five subQuestions ask directly about exact printed output, final container size, front/top/min/max value, or number of executed operations.",
      "In every explanation, list the concrete container state transitions needed to prove the answer.",
    ].join("\n");
  }
  if (combo.questionType === "completion_program" && combo.primaryKpCode === "DS") {
    return [
      "For this DS completion_program bundle, use small container simulations with obvious invariants.",
      "Each blank should choose one operation or condition; avoid multiple blanks that can compensate for each other.",
    ].join("\n");
  }
  return "";
}

function buildGenerationPrompt(params: {
  combo: Combo;
  count: number;
  kpName: string;
  batchRunId: string;
  attempt: number;
}) {
  return [
    "Generate original Chinese information-olympiad practice questions.",
    "Return JSON only. No markdown and no code fences.",
    `Return exactly this top-level shape: {"items":[...${params.count} items...]}.`,
    `Batch run id: ${params.batchRunId}`,
    `Bundle serial: ${params.combo.bundleNo}`,
    `Generation attempt: ${params.attempt}`,
    `Exam type: ${params.combo.examType}`,
    `Question type: ${params.combo.questionType}`,
    `Primary knowledge point: ${params.kpName} (${params.combo.primaryKpCode})`,
    `Difficulty: ${params.combo.difficulty}`,
    "All stems, options, explanations, and code comments should be in Chinese.",
    "Do not copy official contest problems or large external text. Make the items original.",
    "Do not use external images, files, links, network access, system(), exec(), random_device, time-dependent behavior, undefined behavior, signed overflow, or uninitialized values.",
    "The answer and explanation must agree exactly.",
    "Before returning, privately solve every item from scratch and replace any item where more than one option could be defended or the supplied answer is not proven by the explanation.",
    "For any C++ trace question, use only sequencing that is unambiguous in C++17, and state the printed output or final variable values exactly.",
    "Do not place semantically equivalent choices in the same option set. In particular, avoid mixing true/false with 1/0 for boolean-expression questions unless the stem explicitly asks for printed output.",
    "If a question depends on C++ boolean-to-integer conversion, make the context explicit, such as asking for the output of cout << (...).",
    "For medium difficulty, require 1-2 reasoning steps. For hard difficulty, require a nontrivial trace or combined concept.",
    "Keep primaryKpCode exactly equal to the requested code. auxiliaryKpCodes may be empty.",
    buildComboSpecificInstruction(params.combo),
    buildQuestionTypeInstruction(params.combo.questionType),
  ].join("\n");
}

function normalizeGeneratedQuestion(
  payload: Record<string, unknown>,
  combo: Combo,
): QuestionBundleItem {
  const auxiliaryKpCodes = Array.isArray(payload.auxiliaryKpCodes)
    ? payload.auxiliaryKpCodes
        .filter((value): value is string => typeof value === "string")
        .filter((code) => code !== combo.primaryKpCode)
        .slice(0, 3)
    : [];

  if (combo.questionType === "single_choice") {
    const contentJson = {
      stem: String(payload.stem ?? ""),
      options: firstFourOptions(payload.options),
    };
    return QuestionBundleItemSchema.parse({
      type: combo.questionType,
      difficulty: combo.difficulty,
      primaryKpCode: combo.primaryKpCode,
      auxiliaryKpCodes,
      examTypes: [combo.examType],
      contentHash: computeContentHash(contentJson.stem, contentJson.options.join("\n")),
      sandboxVerified: false,
      source: "ai",
      contentJson,
      answerJson: {
        answer: normalizeAnswerChoice(payload.answer),
      },
      explanationJson: {
        explanation: String(payload.explanation ?? ""),
      },
    });
  }

  if (combo.questionType === "reading_program") {
    const subQuestions = Array.isArray(payload.subQuestions)
      ? payload.subQuestions.map((question) => {
          const record = asRecord(question);
          return {
            stem: String(record?.stem ?? ""),
            options: firstFourOptions(record?.options),
          };
        })
      : [];
    const contentJson = {
      stem: String(payload.stem ?? ""),
      cppCode: String(payload.cppCode ?? ""),
      subQuestions,
      sampleInputs: Array.isArray(payload.sampleInputs) ? payload.sampleInputs.map(String) : [],
      expectedOutputs: Array.isArray(payload.expectedOutputs)
        ? payload.expectedOutputs.map(String)
        : [],
    };
    return QuestionBundleItemSchema.parse({
      type: combo.questionType,
      difficulty: combo.difficulty,
      primaryKpCode: combo.primaryKpCode,
      auxiliaryKpCodes,
      examTypes: [combo.examType],
      contentHash: computeContentHash(contentJson.stem, contentJson.cppCode),
      sandboxVerified: false,
      source: "ai",
      contentJson,
      answerJson: {
        subQuestions: Array.isArray(payload.subQuestions)
          ? payload.subQuestions.map((question) => ({
              answer: normalizeAnswerChoice(asRecord(question)?.answer),
            }))
          : [],
      },
      explanationJson: {
        explanation: Array.isArray(payload.subQuestions)
          ? payload.subQuestions
              .map(
                (question, index) =>
                  `${index + 1}. ${String(asRecord(question)?.explanation ?? "")}`,
              )
              .join("\n")
          : String(payload.explanation ?? ""),
      },
    });
  }

  const blanks = Array.isArray(payload.blanks)
    ? payload.blanks.map((blank) => {
        const record = asRecord(blank);
        return {
          id: String(record?.id ?? ""),
          options: firstFourOptions(record?.options),
        };
      })
    : [];
  const contentJson = {
    stem: String(payload.stem ?? ""),
    cppCode: String(payload.cppCode ?? ""),
    blanks,
    fullCode: String(payload.fullCode ?? ""),
    sampleInputs: Array.isArray(payload.sampleInputs) ? payload.sampleInputs.map(String) : [],
    expectedOutputs: Array.isArray(payload.expectedOutputs)
      ? payload.expectedOutputs.map(String)
      : [],
  };
  return QuestionBundleItemSchema.parse({
    type: combo.questionType,
    difficulty: combo.difficulty,
    primaryKpCode: combo.primaryKpCode,
    auxiliaryKpCodes,
    examTypes: [combo.examType],
    contentHash: computeContentHash(contentJson.stem, contentJson.fullCode),
    sandboxVerified: false,
    source: "ai",
    contentJson,
    answerJson: {
      blanks: Array.isArray(payload.blanks)
        ? payload.blanks.map((blank) => ({
            id: String(asRecord(blank)?.id ?? ""),
            answer: normalizeAnswerChoice(asRecord(blank)?.answer),
          }))
        : [],
    },
    explanationJson: {
      explanation: Array.isArray(payload.blanks)
        ? payload.blanks
            .map((blank, index) => `${index + 1}. ${String(asRecord(blank)?.explanation ?? "")}`)
            .join("\n")
        : String(payload.explanation ?? ""),
    },
  });
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
}

function stringFrom(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function resolveResponseId(response: unknown): string | undefined {
  const responseRecord = asRecord(response);
  const bodyRecord = asRecord(responseRecord?.body);
  const nestedResponse = asRecord(bodyRecord?.response);
  return stringFrom(nestedResponse?.id) ?? stringFrom(bodyRecord?.id) ?? stringFrom(responseRecord?.id);
}

function isReasoningOptionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /(thinking|reasoning|provideroptions|unsupported|invalid)/i.test(message);
}

function buildNoThinkingProviderOptions(
  providerName: LLMProviderName,
): ProviderReasoningOptions | undefined {
  if (providerName !== "xiaomi" && providerName !== "deepseek") {
    return undefined;
  }

  return {
    [providerName]: {
      thinking: {
        type: "disabled",
      },
    },
  };
}

async function callDirectLlmScene<T>(params: {
  scene: LLMScene;
  lane: LLMLane;
  system: string;
  prompt: string;
  maxTokens: number;
  timeoutMs: number;
  schema: z.ZodType<T>;
}): Promise<{ result: DirectLlmResult; parsed: T }> {
  const entry = getSceneExecutionChain(
    params.scene,
    {
      lane: params.lane,
      includeBackupFallback: false,
    },
    env,
  )[0];
  if (!entry) {
    throw new Error(`No provider configured for ${params.scene} lane ${params.lane}`);
  }

  const providerOptions = buildNoThinkingProviderOptions(entry.providerName);
  const optionAttempts = providerOptions ? [providerOptions, undefined] : [undefined];
  let lastError: unknown;

  for (const options of optionAttempts) {
    try {
      const response = await generateObject({
        model: createProviderLanguageModel(entry),
        schema: params.schema,
        schemaName: `Round1${params.scene}Response`,
        system: params.system,
        prompt: params.prompt,
        maxOutputTokens: params.maxTokens,
        timeout: params.timeoutMs,
        ...(options ? { providerOptions: options } : {}),
      });

      return {
        result: {
          providerName: entry.providerName,
          model: entry.model,
          inputTokens: response.usage?.inputTokens ?? 0,
          outputTokens: response.usage?.outputTokens ?? 0,
          responseId: resolveResponseId(response.response),
        },
        parsed: response.object as T,
      };
    } catch (error) {
      lastError = error;
      if (!options || !isReasoningOptionError(error)) {
        break;
      }
    }
  }

  for (const options of optionAttempts) {
    try {
      const response = await generateText({
        model: createProviderLanguageModel(entry),
        system: params.system,
        prompt: `${params.prompt}\n\nReturn a single valid JSON object that matches the requested schema. Do not include markdown.`,
        maxOutputTokens: params.maxTokens,
        timeout: params.timeoutMs,
        ...(options ? { providerOptions: options } : {}),
      });
      const rawJson = extractJsonObject(response.text);
      const parsed = params.schema.parse(JSON.parse(rawJson));
      return {
        result: {
          providerName: entry.providerName,
          model: entry.model,
          inputTokens: response.usage?.inputTokens ?? 0,
          outputTokens: response.usage?.outputTokens ?? 0,
          responseId: resolveResponseId(response.response),
        },
        parsed,
      };
    } catch (error) {
      lastError = error;
      if (!options || !isReasoningOptionError(error)) {
        break;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function callJsonScene<T>(params: {
  scene: LLMScene;
  lane: LLMLane;
  system: string;
  prompt: string;
  maxTokens: number;
  timeoutMs: number;
  schema: z.ZodType<T>;
  attempts: number;
}): Promise<{ result: DirectLlmResult; parsed: T }> {
  const errors: string[] = [];

  for (let attempt = 1; attempt <= params.attempts; attempt += 1) {
    try {
      const result = await callDirectLlmScene({
        scene: params.scene,
        lane: params.lane,
        system: params.system,
        prompt: params.prompt,
        maxTokens: params.maxTokens,
        timeoutMs: params.timeoutMs,
        schema: params.schema,
      });
      return result;
    } catch (error) {
      errors.push(`attempt ${attempt}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(errors.join(" | "));
}

async function generateBundle(params: {
  combo: Combo;
  questionsPerBundle: number;
  kpName: string;
  batchRunId: string;
  agentLabel: string;
  pipelineLabel: string;
  timeoutMs: number;
  llmJsonAttempts: number;
  generationAttempt: number;
}): Promise<GeneratedBundle> {
  const lane = generationLaneFor(params.combo.bundleNo);
  const itemSchema = generatedItemSchema(params.combo.questionType);
  const prompts: string[] = [];
  const items: QuestionBundleItem[] = [];
  let generationProviderName: LLMProviderName | undefined;
  let generationModel: string | undefined;
  let inputTokens = 0;
  let outputTokens = 0;

  async function generateItems(count: number, attempt: number) {
    const responseSchema = z.object({
      items: z.array(itemSchema).length(count),
    });
    const prompt = buildGenerationPrompt({
      combo: params.combo,
      count,
      kpName: params.kpName,
      batchRunId: params.batchRunId,
      attempt,
    });
    prompts.push(prompt);
    const { result, parsed } = await callJsonScene({
      scene: "generate",
      lane,
      system: [
        "You are a careful Chinese information-olympiad question writer.",
        "You must return valid JSON only.",
      ].join("\n"),
      prompt,
      maxTokens: maxGenerationTokens(params.combo.questionType, count),
      timeoutMs: params.timeoutMs,
      schema: responseSchema,
      attempts: params.llmJsonAttempts,
    });
    generationProviderName ??= result.providerName;
    generationModel ??= result.model;
    inputTokens += result.inputTokens;
    outputTokens += result.outputTokens;
    return parsed.items.map((item) =>
      normalizeGeneratedQuestion(item as Record<string, unknown>, params.combo),
    );
  }

  if (params.combo.questionType === "single_choice") {
    items.push(...(await generateItems(params.questionsPerBundle, params.generationAttempt)));
  } else {
    for (let itemIndex = 0; itemIndex < params.questionsPerBundle; itemIndex += 1) {
      items.push(
        ...(await generateItems(1, params.generationAttempt * 100 + itemIndex + 1)),
      );
    }
  }

  const runId = makeRunId(params.combo, params.agentLabel, params.pipelineLabel);
  const timestamp = new Date().toISOString();
  const sourceBatchId = [
    "llm-question-bundle-v1",
    params.batchRunId,
    params.agentLabel,
    `b${pad4(params.combo.bundleNo)}`,
    lane,
    params.combo.examType,
    params.combo.questionType,
    params.combo.primaryKpCode,
    params.combo.difficulty,
  ].join(":");
  const promptHash = computeChecksum(prompts.join("\n---\n"));

  const bundle = QuestionBundleSchema.parse({
    meta: {
      bundleType: "question_bundle",
      schemaVersion: BUNDLE_SCHEMA_VERSION,
      runId,
      createdAt: timestamp,
      generatedAt: timestamp,
      provider: generationProviderName ?? "unavailable",
      model: generationModel ?? "unavailable",
      promptHash,
      sourceBatchId,
      sourceBatchIds: [sourceBatchId],
      sourceTimestamp: timestamp,
      examType: params.combo.examType,
      questionType: params.combo.questionType,
      primaryKpCode: params.combo.primaryKpCode,
      difficulty: params.combo.difficulty,
      requestedCount: params.questionsPerBundle,
    },
    items,
  });
  const outputPath = path.resolve(
    process.cwd(),
    defaultQuestionBundleOutputPath({
      runId,
      questionType: params.combo.questionType,
      kpCode: params.combo.primaryKpCode,
      count: params.questionsPerBundle,
      versionNo: 1,
    }),
  );

  return {
    bundle,
    combo: params.combo,
    outputPath,
    repoPath: toRepoPath(outputPath),
    generation: {
      lane,
      providerName: generationProviderName ?? "unavailable",
      model: generationModel ?? "unavailable",
      inputTokens,
      outputTokens,
    },
  };
}

async function validateAndFinalizeBundle(bundle: QuestionBundle, sourcePath: string) {
  const raw = `${JSON.stringify(bundle, null, 2)}\n`;
  const loaded = {
    bundle,
    raw,
    checksum: computeChecksum(raw),
    sourceFilename: path.basename(sourcePath),
    sourcePath,
  };
  const validation = await validateQuestionBundle(loaded, {
    runSandbox: true,
    skipDuplicateChecks: true,
  });
  if (validation.errors.length > 0) {
    return { bundle, validationErrors: validation.errors };
  }

  const finalizedItems = bundle.items.map((item, index) =>
    validation.sandboxVerifiedItemIndexes.includes(index)
      ? ({ ...item, sandboxVerified: true } as QuestionBundleItem)
      : item,
  );
  const finalized = QuestionBundleSchema.parse({
    ...bundle,
    items: finalizedItems,
    meta: {
      ...bundle.meta,
      validation: buildValidationMetadata({
        dbChecksSkipped: true,
        duplicateChecksSkipped: true,
        judgeChecksSkipped: true,
        sandboxVerifiedItemIndexes: validation.sandboxVerifiedItemIndexes,
      }),
      integrity: buildBundleIntegrity(finalizedItems),
    },
  });

  return { bundle: finalized, validationErrors: [] };
}

function reviewMetadataBundle(bundle: QuestionBundle): QuestionBundle {
  const sandboxVerifiedItemIndexes = bundle.items
    .map((item, index) => (item.sandboxVerified ? index : null))
    .filter((index): index is number => index !== null);

  return QuestionBundleSchema.parse({
    ...bundle,
    meta: {
      ...bundle.meta,
      validation: buildValidationMetadata({
        dbChecksSkipped: true,
        duplicateChecksSkipped: true,
        judgeChecksSkipped: false,
        sandboxVerifiedItemIndexes,
      }),
      integrity: buildBundleIntegrity(bundle.items),
    },
  });
}

function summarizeQuestionForHash(item: QuestionBundleItem): string {
  if (item.type === "single_choice") {
    return item.contentJson.options.join("\n");
  }
  if (item.type === "reading_program") {
    return item.contentJson.cppCode;
  }
  return item.contentJson.fullCode;
}

function recomputeItemHash(item: QuestionBundleItem): QuestionBundleItem {
  return QuestionBundleItemSchema.parse({
    ...item,
    contentHash: computeContentHash(item.contentJson.stem, summarizeQuestionForHash(item)),
    sandboxVerified: false,
  });
}

function buildAuditPayload(bundle: QuestionBundle) {
  return {
    bundleMeta: {
      runId: bundle.meta.runId,
      examType: bundle.meta.examType,
      questionType: bundle.meta.questionType,
      primaryKpCode: bundle.meta.primaryKpCode,
      difficulty: bundle.meta.difficulty,
      requestedCount: bundle.meta.requestedCount,
    },
    items: bundle.items.map((item, itemIndex) => ({
      itemIndex,
      type: item.type,
      difficulty: item.difficulty,
      primaryKpCode: item.primaryKpCode,
      auxiliaryKpCodes: item.auxiliaryKpCodes,
      examTypes: item.examTypes,
      contentJson: item.contentJson,
      answerJson: item.answerJson,
      explanationJson: item.explanationJson,
    })),
  };
}

function buildAuditPrompt(bundle: QuestionBundle, round: "review-pass-1" | "review-pass-2") {
  return [
    "Audit this Chinese information-olympiad question bundle.",
    `Review round: ${round}.`,
    "Solve every item independently. Do not trust the supplied answer.",
    "Return JSON only. No markdown.",
    "Pass criteria:",
    "- the answer is correct and uniquely determined;",
    "- the explanation is consistent with the answer;",
    "- the type, exam type, difficulty, and primary knowledge point are plausible;",
    "- single_choice has exactly four options and exactly one correct answer;",
    "- reading_program/completion_program code is deterministic, self-contained C++17 without undefined behavior;",
    "- completion answers match blank ids and fullCode behavior;",
    "- no external image, file, URL, or copyright-sensitive copied problem text is required.",
    "Report only defects. Do not include positive observations as issues.",
    "If any item verdict is fail, include at least one concrete issue for that item. Do not put defects only in notes.",
    "If bundleVerdict is fail, at least one item must contain a major or blocker issue.",
    "Use severity major or blocker for answer errors, ambiguous stems, invalid code, impossible blanks, malformed options, or metadata that changes the target bucket.",
    'Output schema: {"bundleVerdict":"pass|fail","items":[{"itemIndex":0,"verdict":"pass|fail","confidence":0.0,"issues":[{"code":"...","severity":"minor|major|blocker","message":"..."}]}],"notes":"..."}',
    "Input bundle:",
    JSON.stringify(buildAuditPayload(bundle), null, 2),
  ].join("\n");
}

async function callAudit(params: {
  bundle: QuestionBundle;
  lane: LLMLane;
  round: "review-pass-1" | "review-pass-2";
  timeoutMs: number;
  llmJsonAttempts: number;
}) {
  return callJsonScene({
    scene: "judge",
    lane: params.lane,
    system: [
      "You are a strict programming contest question auditor.",
      "You must return valid JSON only.",
    ].join("\n"),
    prompt: buildAuditPrompt(params.bundle, params.round),
    maxTokens: params.bundle.meta.questionType === "single_choice" ? 4500 : 7000,
    timeoutMs: params.timeoutMs,
    schema: auditResponseSchema,
    attempts: params.llmJsonAttempts,
  });
}

function normalizeAuditIssue(
  issue: AuditIssue,
  itemIndex: number,
): (AuditIssue & { itemIndex: number }) | null {
  const combined = `${issue.code} ${issue.message}`.toLowerCase();
  if (/answer[_ -]?correct|correct answer|supplied answer is correct/.test(combined)) {
    return null;
  }
  if (
    /(actually|appears|seems|is|was|are) correct|no (actual |real )?(defect|issue|problem)|no correction needed|false positive|should be pass|答案(是|为|均)?正确|原答案正确|无误|无问题|无需(更改|修改|调整)|不影响答案|应为pass/.test(
      combined,
    )
  ) {
    return null;
  }
  if (
    /(difficulty|too easy|too simple|metadata|repetitive|similar)/.test(combined) &&
    !/(wrong answer|answer error|ambiguous|invalid|impossible|not uniquely|duplicate option|malformed)/.test(
      combined,
    )
  ) {
    return { ...issue, itemIndex, severity: "minor" };
  }
  return { ...issue, itemIndex };
}

function extractReviewIssues(
  audit: AuditResponse,
  itemCount: number,
): Array<AuditIssue & { itemIndex: number }> {
  const issues: Array<AuditIssue & { itemIndex: number }> = [];
  const seenIndexes = new Set<number>();

  for (const item of audit.items) {
    seenIndexes.add(item.itemIndex);
    const itemIssues = item.issues
      .map((issue) => normalizeAuditIssue(issue, item.itemIndex))
      .filter((issue): issue is AuditIssue & { itemIndex: number } => Boolean(issue));
    const hasBlockingIssue = itemIssues.some((issue) => issue.severity !== "minor");
    if (item.verdict === "fail" && itemIssues.length === 0) {
      issues.push({
        itemIndex: item.itemIndex,
        code: "LLM_ITEM_FAILED_WITHOUT_ISSUE",
        severity: "minor",
        message: "LLM marked the item as fail but did not provide a defect.",
      });
    } else if (item.verdict === "fail" && !hasBlockingIssue) {
      issues.push({
        itemIndex: item.itemIndex,
        code: "LLM_ITEM_FAILED_WITH_NON_BLOCKING_ISSUES",
        severity: "minor",
        message: "LLM marked the item as fail with only non-blocking calibration issues.",
      });
    }
    issues.push(...itemIssues);
    if (item.confidence < 0.6) {
      issues.push({
        itemIndex: item.itemIndex,
        code: "LOW_LLM_CONFIDENCE",
        severity: "major",
        message: `LLM confidence ${item.confidence} is below the pass threshold.`,
      });
    }
  }

  for (let itemIndex = 0; itemIndex < itemCount; itemIndex += 1) {
    if (!seenIndexes.has(itemIndex)) {
      issues.push({
        itemIndex,
        code: "MISSING_LLM_REVIEW_ITEM",
        severity: "blocker",
        message: "LLM response did not include this item index.",
      });
    }
  }

  const hasBlockingIssue = issues.some((issue) => issue.severity !== "minor");
  if (audit.bundleVerdict !== "pass" && hasBlockingIssue) {
    issues.push({
      itemIndex: 0,
      code: "LLM_BUNDLE_VERDICT_FAILED",
      severity: "major",
      message: "LLM marked the bundle verdict as fail.",
    });
  } else if (audit.bundleVerdict !== "pass") {
    issues.push({
      itemIndex: 0,
      code: "LLM_BUNDLE_VERDICT_FAILED_WITH_NON_BLOCKING_ISSUES",
      severity: "minor",
      message: "LLM marked the bundle verdict as fail, but no blocking item defect was reported.",
    });
  }

  return issues.filter((issue) => issue.severity !== "minor");
}

function buildRepairPrompt(bundle: QuestionBundle, issues: Array<AuditIssue & { itemIndex: number }>) {
  const indexes = [...new Set(issues.map((issue) => issue.itemIndex))].sort((a, b) => a - b);
  return [
    "Repair only the failed items in this question bundle.",
    "Return JSON only. No markdown.",
    "Do not change itemIndex, question type, exam type, difficulty, or primary knowledge point.",
    "For each listed itemIndex, return complete replacement contentJson, answerJson, and explanationJson matching the original item type schema.",
    "If repairing code, keep deterministic C++17 and make sampleInputs/expectedOutputs consistent.",
    `You must return exactly these item indexes: ${indexes.join(", ")}.`,
    'Output schema: {"items":[{"itemIndex":0,"contentJson":{},"answerJson":{},"explanationJson":{},"repairNotes":"..."}]}',
    "Issues:",
    JSON.stringify(issues, null, 2),
    "Original failed items:",
    JSON.stringify(
      indexes.map((itemIndex) => ({
        itemIndex,
        item: bundle.items[itemIndex],
      })),
      null,
      2,
    ),
  ].join("\n");
}

async function callRepair(params: {
  bundle: QuestionBundle;
  lane: LLMLane;
  issues: Array<AuditIssue & { itemIndex: number }>;
  timeoutMs: number;
  llmJsonAttempts: number;
}) {
  return callJsonScene({
    scene: "generate",
    lane: params.lane,
    system: [
      "You are a careful Chinese information-olympiad question editor.",
      "You repair invalid generated question items while preserving schema.",
      "You must return valid JSON only.",
    ].join("\n"),
    prompt: buildRepairPrompt(params.bundle, params.issues),
    maxTokens: 9000,
    timeoutMs: params.timeoutMs,
    schema: repairResponseSchema,
    attempts: params.llmJsonAttempts,
  });
}

function applyRepairResponse(bundle: QuestionBundle, repair: RepairResponse): QuestionBundle {
  const items = [...bundle.items];
  for (const patch of repair.items) {
    const original = items[patch.itemIndex];
    if (!original) {
      throw new Error(`Repair response referenced missing itemIndex ${patch.itemIndex}`);
    }
    items[patch.itemIndex] = recomputeItemHash(
      QuestionBundleItemSchema.parse({
        ...original,
        contentJson: patch.contentJson,
        answerJson: patch.answerJson,
        explanationJson: patch.explanationJson,
      }),
    );
  }
  return QuestionBundleSchema.parse({
    ...bundle,
    items,
    meta: {
      ...bundle.meta,
      integrity: undefined,
      validation: undefined,
    },
  });
}

function restrictRepairResponse(
  repair: RepairResponse,
  allowedItemIndexes: Set<number>,
): RepairResponse {
  const items = repair.items.filter((item) => allowedItemIndexes.has(item.itemIndex));
  if (items.length === 0) {
    throw new Error(
      `repair response did not include any requested item indexes: ${[
        ...allowedItemIndexes,
      ].join(",")}`,
    );
  }
  return repairResponseSchema.parse({ ...repair, items });
}

function codeSourceForItem(item: QuestionBundleItem): string | null {
  if (item.type === "reading_program") {
    return item.contentJson.cppCode;
  }
  if (item.type === "completion_program") {
    return item.contentJson.fullCode;
  }
  return null;
}

async function normalizeCodeSampleOutputs(bundle: QuestionBundle): Promise<QuestionBundle> {
  const items: QuestionBundleItem[] = [];
  let changed = false;

  for (const item of bundle.items) {
    if (item.type === "single_choice") {
      items.push(item);
      continue;
    }

    const source = codeSourceForItem(item);
    if (!source) {
      items.push(item);
      continue;
    }

    const sampleInputs =
      item.contentJson.sampleInputs.length > 0 ? item.contentJson.sampleInputs : [""];
    const expectedOutputs: string[] = [];
    let canNormalize = true;

    for (const sampleInput of sampleInputs) {
      const result = await runCpp({ source, stdin: sampleInput });
      if (!result.compileOk || !result.runOk) {
        canNormalize = false;
        break;
      }
      expectedOutputs.push(result.stdout ?? "");
    }

    if (!canNormalize) {
      items.push(item);
      continue;
    }

    const currentOutputs = item.contentJson.expectedOutputs;
    const outputsDiffer =
      currentOutputs.length !== expectedOutputs.length ||
      currentOutputs.some((output: string, index: number) => output !== expectedOutputs[index]);

    if (!outputsDiffer) {
      items.push(item);
      continue;
    }

    changed = true;
    items.push(
      recomputeItemHash(
        QuestionBundleItemSchema.parse({
          ...item,
          contentJson: {
            ...item.contentJson,
            expectedOutputs,
          },
        }),
      ),
    );
  }

  if (!changed) {
    return bundle;
  }

  return QuestionBundleSchema.parse({
    ...bundle,
    items,
    meta: {
      ...bundle.meta,
      integrity: undefined,
      validation: undefined,
    },
  });
}

async function reviewBundle(params: {
  generated: GeneratedBundle;
  maxRepairCycles: number;
  timeoutMs: number;
  llmJsonAttempts: number;
}): Promise<{
  bundle: QuestionBundle;
  finalVerdict: "pass" | "fail";
  reviewAttempts: ReviewAttemptReport[];
  repairAttempts: RepairAttemptReport[];
  validationErrors: ImportError[];
  rewritesApplied: number;
}> {
  let bundle = params.generated.bundle;
  let validationErrors: ImportError[] = [];
  const reviewAttempts: ReviewAttemptReport[] = [];
  const repairAttempts: RepairAttemptReport[] = [];
  let rewritesApplied = 0;

  for (let repairCycle = 0; repairCycle <= params.maxRepairCycles; repairCycle += 1) {
    bundle = await normalizeCodeSampleOutputs(bundle);
    const validation = await validateAndFinalizeBundle(bundle, params.generated.outputPath);
    bundle = validation.bundle;
    validationErrors = validation.validationErrors;
    if (validationErrors.length > 0) {
      if (repairCycle >= params.maxRepairCycles) {
        break;
      }
      const syntheticIssues = validationErrors.map((error) => ({
        itemIndex: error.itemIndex ?? 0,
        code: error.code,
        severity: "major" as const,
        message: error.message,
      }));
      try {
        const repair = await callRepair({
          bundle,
          lane: "backup",
          issues: syntheticIssues,
          timeoutMs: params.timeoutMs,
          llmJsonAttempts: params.llmJsonAttempts,
        });
        const restrictedRepair = restrictRepairResponse(
          repair.parsed,
          new Set(syntheticIssues.map((issue) => issue.itemIndex)),
        );
        bundle = applyRepairResponse(bundle, restrictedRepair);
        rewritesApplied += restrictedRepair.items.length;
        repairAttempts.push({
          repairCycle,
          lane: "backup",
          providerName: repair.result.providerName,
          model: repair.result.model,
          inputTokens: repair.result.inputTokens,
          outputTokens: repair.result.outputTokens,
          repairedItems: restrictedRepair.items.map((item) => item.itemIndex),
        });
        continue;
      } catch (error) {
        repairAttempts.push({
          repairCycle,
          lane: "backup",
          repairedItems: [],
          error: error instanceof Error ? error.message : String(error),
        });
        break;
      }
    }

    const roundPlan: Array<{ round: "review-pass-1" | "review-pass-2"; lane: LLMLane }> = [
      { round: "review-pass-1", lane: "backup" },
      { round: "review-pass-2", lane: "default" },
    ];
    let failedIssues: Array<AuditIssue & { itemIndex: number }> = [];

    for (const step of roundPlan) {
      try {
        const audit = await callAudit({
          bundle,
          lane: step.lane,
          round: step.round,
          timeoutMs: params.timeoutMs,
          llmJsonAttempts: params.llmJsonAttempts,
        });
        const issues = extractReviewIssues(audit.parsed, bundle.items.length);
        const verdict = issues.length === 0 ? "pass" : "fail";
        reviewAttempts.push({
          round: step.round,
          repairCycle,
          lane: step.lane,
          providerName: audit.result.providerName,
          model: audit.result.model,
          inputTokens: audit.result.inputTokens,
          outputTokens: audit.result.outputTokens,
          verdict,
          issueCount: issues.length,
          issues,
          notes: audit.parsed.notes,
        });
        if (issues.length > 0) {
          failedIssues = issues;
          break;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failedIssues = [
          {
            itemIndex: 0,
            code: "LLM_REVIEW_CALL_FAILED",
            severity: "blocker",
            message,
          },
        ];
        reviewAttempts.push({
          round: step.round,
          repairCycle,
          lane: step.lane,
          verdict: "error",
          issueCount: 1,
          issues: failedIssues,
          error: message,
        });
        break;
      }
    }

    if (failedIssues.length === 0) {
      bundle = reviewMetadataBundle(bundle);
      return {
        bundle,
        finalVerdict: "pass",
        reviewAttempts,
        repairAttempts,
        validationErrors: [],
        rewritesApplied,
      };
    }

    if (repairCycle >= params.maxRepairCycles) {
      return {
        bundle,
        finalVerdict: "fail",
        reviewAttempts,
        repairAttempts,
        validationErrors,
        rewritesApplied,
      };
    }

    const repairLane = reviewAttempts.at(-1)?.lane ?? "backup";
    try {
      const repair = await callRepair({
        bundle,
        lane: repairLane,
        issues: failedIssues,
        timeoutMs: params.timeoutMs,
        llmJsonAttempts: params.llmJsonAttempts,
      });
      const restrictedRepair = restrictRepairResponse(
        repair.parsed,
        new Set(failedIssues.map((issue) => issue.itemIndex)),
      );
      bundle = applyRepairResponse(bundle, restrictedRepair);
      rewritesApplied += restrictedRepair.items.length;
      repairAttempts.push({
        repairCycle,
        lane: repairLane,
        providerName: repair.result.providerName,
        model: repair.result.model,
        inputTokens: repair.result.inputTokens,
        outputTokens: repair.result.outputTokens,
        repairedItems: restrictedRepair.items.map((item) => item.itemIndex),
      });
    } catch (error) {
      repairAttempts.push({
        repairCycle,
        lane: repairLane,
        repairedItems: [],
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        bundle,
        finalVerdict: "fail",
        reviewAttempts,
        repairAttempts,
        validationErrors,
        rewritesApplied,
      };
    }
  }

  return {
    bundle,
    finalVerdict: "fail",
    reviewAttempts,
    repairAttempts,
    validationErrors,
    rewritesApplied,
  };
}

function toRepoPath(filePath: string) {
  return path.relative(process.cwd(), filePath).split(path.sep).join("/");
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function reserveHashes(bundle: QuestionBundle, seenHashes: Set<string>, repoPath: string) {
  const duplicates = bundle.items
    .map((item, index) => ({ hash: item.contentHash, index }))
    .filter((entry) => seenHashes.has(entry.hash));
  if (duplicates.length > 0) {
    throw new Error(
      `duplicate contentHash in ${repoPath}: ${duplicates
        .map((entry) => `${entry.index}:${entry.hash}`)
        .join(", ")}`,
    );
  }
  for (const item of bundle.items) {
    seenHashes.add(item.contentHash);
  }
}

function buildBundleReport(params: {
  generated: GeneratedBundle;
  bundle: QuestionBundle;
  finalVerdict: "pass" | "fail";
  validationErrors: ImportError[];
  reviewAttempts: ReviewAttemptReport[];
  repairAttempts: RepairAttemptReport[];
  rewritesApplied: number;
}): BundleReport {
  const raw = `${JSON.stringify(params.bundle, null, 2)}\n`;
  return {
    path: params.generated.repoPath,
    runId: params.bundle.meta.runId,
    examType: params.generated.combo.examType,
    questionType: params.generated.combo.questionType,
    primaryKpCode: params.generated.combo.primaryKpCode,
    difficulty: params.generated.combo.difficulty,
    generationLane: params.generated.generation.lane,
    generationProvider: params.generated.generation.providerName,
    generationModel: params.generated.generation.model,
    finalVerdict: params.finalVerdict,
    formalBundleStatus:
      params.finalVerdict === "pass" ? "llm_chain_passed" : "llm_chain_failed",
    questionStatusIfImported: "draft",
    questionLifecycleStatusAfterReview: params.finalVerdict === "pass" ? "reviewed" : "draft",
    currentQuestionBundleImportDefaultStatus: "draft",
    reviewStatusEvidence:
      params.finalVerdict === "pass" ? "two_round_llm_reviewed" : "llm_chain_failed",
    importedToDatabase: false,
    prebuiltPapersBuilt: false,
    published: false,
    rewritesApplied: params.rewritesApplied,
    validationErrors: params.validationErrors,
    reviewAttempts: params.reviewAttempts,
    repairAttempts: params.repairAttempts,
    checksum: computeChecksum(raw),
  };
}

function buildFailedBundleReport(params: {
  combo: Combo;
  agentLabel: string;
  pipelineLabel: string;
  error: unknown;
}): BundleReport {
  const runId = makeRunId(params.combo, params.agentLabel, params.pipelineLabel);
  const outputPath = path.resolve(
    process.cwd(),
    defaultQuestionBundleOutputPath({
      runId,
      questionType: params.combo.questionType,
      kpCode: params.combo.primaryKpCode,
      count: DEFAULT_QUESTIONS_PER_BUNDLE,
      versionNo: 1,
    }),
  );
  return {
    path: toRepoPath(outputPath),
    runId,
    examType: params.combo.examType,
    questionType: params.combo.questionType,
    primaryKpCode: params.combo.primaryKpCode,
    difficulty: params.combo.difficulty,
    generationLane: generationLaneFor(params.combo.bundleNo),
    generationProvider: "unavailable",
    generationModel: "unavailable",
    finalVerdict: "fail",
    formalBundleStatus: "llm_chain_failed",
    questionStatusIfImported: "draft",
    questionLifecycleStatusAfterReview: "draft",
    currentQuestionBundleImportDefaultStatus: "draft",
    reviewStatusEvidence: "llm_chain_failed",
    importedToDatabase: false,
    prebuiltPapersBuilt: false,
    published: false,
    rewritesApplied: 0,
    validationErrors: [
      {
        code: "GENERATION_FAILED",
        message: params.error instanceof Error ? params.error.message : String(params.error),
      },
    ],
    reviewAttempts: [],
    repairAttempts: [],
    checksum: "",
  };
}

async function writeBundleOutput(generated: GeneratedBundle, bundle: QuestionBundle, overwrite: boolean) {
  await mkdir(path.dirname(generated.outputPath), { recursive: true });
  await writeFile(generated.outputPath, `${JSON.stringify(bundle, null, 2)}\n`, {
    encoding: "utf8",
    flag: overwrite ? "w" : "wx",
  });
}

async function processCombo(params: {
  combo: Combo;
  questionsPerBundle: number;
  kpNames: Map<string, string>;
  batchRunId: string;
  agentLabel: string;
  pipelineLabel: string;
  timeoutMs: number;
  llmJsonAttempts: number;
  maxGenerationAttempts: number;
  maxRepairCycles: number;
  overwrite: boolean;
  dryRun: boolean;
  seenHashes: Set<string>;
}): Promise<ProcessResult> {
  let lastError: unknown;

  for (let generationAttempt = 1; generationAttempt <= params.maxGenerationAttempts; generationAttempt += 1) {
    try {
      const generated = await generateBundle({
        combo: params.combo,
        questionsPerBundle: params.questionsPerBundle,
        kpName: params.kpNames.get(params.combo.primaryKpCode) ?? params.combo.primaryKpCode,
        batchRunId: params.batchRunId,
        agentLabel: params.agentLabel,
        pipelineLabel: params.pipelineLabel,
        timeoutMs: params.timeoutMs,
        llmJsonAttempts: params.llmJsonAttempts,
        generationAttempt,
      });
      if (!params.dryRun && (await fileExists(generated.outputPath)) && !params.overwrite) {
        throw new Error(`output already exists: ${generated.repoPath}`);
      }

      const review = await reviewBundle({
        generated,
        maxRepairCycles: params.maxRepairCycles,
        timeoutMs: params.timeoutMs,
        llmJsonAttempts: params.llmJsonAttempts,
      });
      const report = buildBundleReport({
        generated,
        bundle: review.bundle,
        finalVerdict: review.finalVerdict,
        validationErrors: review.validationErrors,
        reviewAttempts: review.reviewAttempts,
        repairAttempts: review.repairAttempts,
        rewritesApplied: review.rewritesApplied,
      });
      if (review.finalVerdict === "fail" && generationAttempt < params.maxGenerationAttempts) {
        lastError = new Error(`bundle failed review: ${summarizeFailure(report)}`);
        console.log(
          `LLM-BULK-REGENERATE bundle=${params.combo.bundleNo} attempt=${generationAttempt} issues=${summarizeFailure(
            report,
          )}`,
        );
        continue;
      }
      if (review.finalVerdict === "fail") {
        throw new Error(`bundle failed review: ${summarizeFailure(report)}`);
      }
      reserveHashes(review.bundle, params.seenHashes, generated.repoPath);
      if (!params.dryRun) {
        await writeBundleOutput(generated, review.bundle, params.overwrite);
      }
      return { bundle: review.bundle, report };
    } catch (error) {
      lastError = error;
      console.log(
        `LLM-BULK-RETRY bundle=${params.combo.bundleNo} attempt=${generationAttempt} error=${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function runPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index]!);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker()),
  );
  return results;
}

function summarizeDistribution(reports: BundleReport[]) {
  const counts: Record<string, number> = {};
  for (const report of reports) {
    const itemCount = 5;
    for (const [key, value] of Object.entries({
      examType: report.examType,
      questionType: report.questionType,
      primaryKpCode: report.primaryKpCode,
      difficulty: report.difficulty,
      generationLane: report.generationLane,
      finalVerdict: report.finalVerdict,
    })) {
      const bucket = `${key}:${value}`;
      counts[bucket] = (counts[bucket] ?? 0) + itemCount;
    }
  }
  return counts;
}

function summarizeFailure(report: BundleReport): string {
  const validation = report.validationErrors.map((error) => error.code);
  const review = report.reviewAttempts.flatMap((attempt) =>
    attempt.issues.map((issue) => `${attempt.round}:${issue.itemIndex}:${issue.code}`),
  );
  const repairs = report.repairAttempts
    .filter((attempt) => attempt.error)
    .map((attempt) => `repair:${attempt.lane}:${attempt.error}`);
  return [...validation, ...review, ...repairs].slice(0, 8).join(" | ");
}

async function writeReport(params: {
  batchRunId: string;
  reports: BundleReport[];
  totalQuestions: number;
  questionsPerBundle: number;
  shardIndex: number;
  shardCount: number;
  startedAt: string;
  overwrite: boolean;
  dryRun: boolean;
}) {
  const summary = {
    totalBundles: params.reports.length,
    totalQuestions: params.reports.length * params.questionsPerBundle,
    passedBundles: params.reports.filter((report) => report.finalVerdict === "pass").length,
    failedBundles: params.reports.filter((report) => report.finalVerdict === "fail").length,
    rewritesApplied: params.reports.reduce((sum, report) => sum + report.rewritesApplied, 0),
  };
  const report = {
    meta: {
      runId: params.batchRunId,
      reportType: "llm_question_bundle_generation_2026",
      startedAt: params.startedAt,
      finishedAt: new Date().toISOString(),
      outputRoot: "papers/2026",
      requestedQuestions: params.totalQuestions,
      questionsPerBundle: params.questionsPerBundle,
      defaultProvider: env.LLM_PROVIDER_DEFAULT,
      backupProvider: env.LLM_PROVIDER_BACKUP,
      generationLanePolicy: "odd bundleNo uses LLM_PROVIDER_DEFAULT; even bundleNo uses LLM_PROVIDER_BACKUP",
      reviewLanePolicy: "round 1 uses LLM_PROVIDER_BACKUP; round 2 uses LLM_PROVIDER_DEFAULT",
      shardIndex: params.shardIndex,
      shardCount: params.shardCount,
      dryRun: params.dryRun,
    },
    scope: {
      importedToDatabase: false,
      prebuiltPapersBuilt: false,
      published: false,
      questionStatusIfImported: "draft",
      questionLifecycleStatusAfterReview:
        summary.failedBundles === 0 ? "reviewed" : "draft",
      currentQuestionBundleImportDefaultStatus: "draft",
      formalBundleStatus:
        summary.failedBundles === 0 ? "llm_chain_passed" : "llm_chain_failed",
      reviewStatusEvidence:
        summary.failedBundles === 0 ? "two_round_llm_reviewed" : "llm_chain_failed",
    },
    summary,
    distribution: summarizeDistribution(params.reports),
    bundles: params.reports,
  };
  const reportPath = path.resolve(
    process.cwd(),
    defaultOfflineReportPath({
      runId: deriveShardReportRunId(
        params.batchRunId,
        params.shardIndex,
        params.shardCount,
      ),
      reportName: "llm-question-generation-review",
    }),
  );
  if (!params.dryRun) {
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, {
      encoding: "utf8",
      flag: params.overwrite ? "w" : "wx",
    });
  }
  console.log(
    `LLM-BULK-DONE ${JSON.stringify({
      ...summary,
      reportPath: params.dryRun ? null : toRepoPath(reportPath),
      dryRun: params.dryRun,
    })}`,
  );
  if (summary.failedBundles > 0) {
    process.exitCode = 1;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const startedAt = new Date().toISOString();
  const combos = chooseCombos(args.totalBundles, args.seed).filter(
    (combo, index) =>
      index % args.shardCount === args.shardIndex &&
      (!args.onlyBundleNos || args.onlyBundleNos.has(combo.bundleNo)),
  );
  const kpNames = await loadTaxonomyNames();
  const seenHashes = await collectExistingHashes(path.join(process.cwd(), "papers", "2026"));
  const agentLabel = `a${pad2(args.shardIndex + 1)}`;
  const pipelineLabel = deriveBundlePipelineLabel(args.batchRunId, args.totalQuestions);

  console.log(
    `LLM-BULK-START bundles=${combos.length}/${args.totalBundles} questions=${
      combos.length * args.questionsPerBundle
    } default=${env.LLM_PROVIDER_DEFAULT} backup=${env.LLM_PROVIDER_BACKUP} concurrency=${
      args.maxConcurrency
    } shard=${args.shardIndex}/${args.shardCount}`,
  );

  const results = await runPool(combos, args.maxConcurrency, async (combo) => {
    let result: ProcessResult;
    try {
      result = await processCombo({
        combo,
        questionsPerBundle: args.questionsPerBundle,
        kpNames,
        batchRunId: args.batchRunId,
        agentLabel,
        pipelineLabel,
        timeoutMs: args.timeoutMs,
        llmJsonAttempts: args.llmJsonAttempts,
        maxGenerationAttempts: args.maxGenerationAttempts,
        maxRepairCycles: args.maxRepairCycles,
        overwrite: args.overwrite,
        dryRun: args.dryRun,
        seenHashes,
      });
    } catch (error) {
      result = {
        report: buildFailedBundleReport({
          combo,
          agentLabel,
          pipelineLabel,
          error,
        }),
      };
    }
    console.log(
      `LLM-BULK-BUNDLE ${result.report.path} verdict=${result.report.finalVerdict} generationLane=${result.report.generationLane} rewrites=${result.report.rewritesApplied}${
        result.report.finalVerdict === "fail" ? ` issues=${summarizeFailure(result.report)}` : ""
      }`,
    );
    return result;
  });

  await writeReport({
    batchRunId: args.batchRunId,
    reports: results.map((result) => result.report),
    totalQuestions: args.totalQuestions,
    questionsPerBundle: args.questionsPerBundle,
    shardIndex: args.shardIndex,
    shardCount: args.shardCount,
    startedAt,
    overwrite: args.overwrite,
    dryRun: args.dryRun,
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
