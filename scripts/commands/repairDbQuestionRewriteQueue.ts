import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { and, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";

import { EXAM_TYPES, type ExamType } from "../../config/examTypes.js";
import { db, pool } from "../../server/db.js";
import { knowledgePoints } from "../../server/db/schema/knowledgePoints.js";
import { questions } from "../../server/db/schema/questions.js";
import {
  buildQuestionSimilarityText,
  computeContentHash,
  jaccardSimilarity,
} from "../../server/services/deduplicationService.js";
import {
  BUNDLE_SCHEMA_VERSION,
  buildBundleIntegrity,
  buildValidationMetadata,
  computeChecksum,
  QuestionBundleItemSchema,
  QuestionTypeSchema,
  type Difficulty,
  type QuestionBundle,
  type QuestionBundleItem,
  type QuestionType,
} from "../lib/bundleTypes.js";
import { assertExternalLlmAllowed } from "../lib/externalLlmDisclosure.js";
import { extractJsonObject } from "../lib/modelJson.js";
import { classifyQuestionDiversity } from "../lib/questionDiversity.js";
import {
  ScriptSceneContinuationError,
  callScriptSceneWithContinuation,
} from "../lib/scriptConversation.js";
import {
  callScriptLlmScene,
  resolveScriptProviderChain,
  type CallScriptLlmSceneResult,
} from "../lib/scriptLlmClient.js";
import { formatJsonOutput, toDisplayRepoPath } from "../lib/scriptCli.js";

type ArgValue = boolean | string;

interface Args {
  queuePath: string;
  examType: ExamType;
  offset: number;
  limit: number;
  batchId: string;
  reportDir: string;
  maxConcurrency: number;
  timeoutMs: number;
  maxRepairAttempts: number;
  write: boolean;
  skipJaccard: boolean;
  allowExternalLlm: boolean;
  externalLlmConsent?: string;
  externalLlmPurpose?: string;
}

interface QueueEntry {
  ordinal: number;
  id: string;
  sourcePath: string;
  examTypes: ExamType[];
  questionType: QuestionType;
  difficulty: Difficulty;
  kpGroup: string;
  archetypeId: string;
  taskFlavor: string;
  qualityScore: number;
  reasons: string[];
  recommendedAction: string;
}

interface DbQuestionRow {
  id: string;
  type: string;
  difficulty: string;
  primaryKpCode: string;
  contentJson: unknown;
  answerJson: unknown;
  explanationJson: unknown;
  contentHash: string;
  status: string;
  sandboxVerified: boolean;
  source: string;
}

interface CandidateValidation {
  item: QuestionBundleItem;
  contentHash: string;
  qualityScore: number;
  difficultyFit: string;
  taskFlavor: string;
  normalizedTemplateKey: string;
}

const DEFAULT_QUEUE_PATH =
  "count/audits/diversity-csp-js-2026-05-07/db-questions__rewrite-queue.csv";
const DEFAULT_BATCH_ID = "2026-05-07-csp-j-rescue-batch001";
const JACCARD_THRESHOLD = 0.85;

const difficultySchema = z.enum(["easy", "medium", "hard"]);
const sourceSchema = z.enum(["ai", "manual", "real_paper"]);

const repairResponseSchema = z.object({
  contentJson: z.unknown(),
  answerJson: z.unknown(),
  explanationJson: z.unknown(),
  repairNotes: z.string().optional().default(""),
});

const judgeResponseSchema = z.object({
  approved: z.boolean(),
  confidence: z.number().min(0).max(1).default(0),
  issues: z.array(z.string()).default([]),
  qualityScore: z.number().min(0).max(1).optional(),
  difficultyFit: z.enum(["pass", "warning", "fail"]).optional(),
});

function printHelp() {
  console.log(`Usage: tsx scripts/questionBundle.ts repair-db-rewrite-queue [options]

Generate repaired replacement question bundles for DB questions listed in a diversity rewrite queue CSV.

Options:
  --queue <path>                   Rewrite queue CSV (default: ${DEFAULT_QUEUE_PATH})
  --exam-type <exam>               Exam type to select from CSV examTypes (default: CSP-J)
  --offset <number>                Selected queue offset (default: 0)
  --limit <number>                 Selected queue batch size (default: 100)
  --batch-id <id>                  Report batch id (default: ${DEFAULT_BATCH_ID})
  --report-dir <dir>               Report directory (default: artifacts/reports/2026/runs/<batch-id>)
  --max-concurrency <number>       Parallel LLM workers (default: 2)
  --timeout-ms <number>            Timeout per LLM call (default: 120000)
  --max-repair-attempts <number>   Repair attempts per question (default: 2)
  --skip-jaccard                   Skip near-duplicate DB check
  --write                          Persist repaired replacement bundles under papers/2026
  --allow-external-llm             Required acknowledgement before provider calls
  --external-llm-consent <path>    Consent JSON allowlisting provider/data transfer
  --external-llm-purpose <text>    Purpose recorded in the report
  --help                           Show this help message
`);
}

function parseArgs(argv: string[]): Args {
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

  const batchId = typeof args["batch-id"] === "string" ? args["batch-id"] : DEFAULT_BATCH_ID;
  return {
    queuePath: typeof args.queue === "string" ? args.queue : DEFAULT_QUEUE_PATH,
    examType: parseExamType(typeof args["exam-type"] === "string" ? args["exam-type"] : "CSP-J"),
    offset: readNonNegativeInt(args, "offset", 0),
    limit: readPositiveInt(args, "limit", 100),
    batchId,
    reportDir:
      typeof args["report-dir"] === "string"
        ? args["report-dir"]
        : path.join("artifacts", "reports", "2026", "runs", batchId),
    maxConcurrency: readPositiveInt(args, "max-concurrency", 2),
    timeoutMs: readPositiveInt(args, "timeout-ms", 120_000),
    maxRepairAttempts: readPositiveInt(args, "max-repair-attempts", 2),
    write: args.write === true,
    skipJaccard: args["skip-jaccard"] === true,
    allowExternalLlm: args["allow-external-llm"] === true,
    externalLlmConsent:
      typeof args["external-llm-consent"] === "string"
        ? args["external-llm-consent"]
        : undefined,
    externalLlmPurpose:
      typeof args["external-llm-purpose"] === "string"
        ? args["external-llm-purpose"]
        : undefined,
  };
}

function readPositiveInt(args: Record<string, ArgValue>, key: string, fallback: number) {
  const raw = args[key];
  const value = typeof raw === "string" ? Number.parseInt(raw, 10) : fallback;
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`--${key} must be a positive integer`);
  }
  return value;
}

function readNonNegativeInt(args: Record<string, ArgValue>, key: string, fallback: number) {
  const raw = args[key];
  const value = typeof raw === "string" ? Number.parseInt(raw, 10) : fallback;
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`--${key} must be a non-negative integer`);
  }
  return value;
}

function parseExamType(raw: string): ExamType {
  const value = raw.trim() as ExamType;
  if (!EXAM_TYPES.includes(value)) {
    throw new Error(`Unsupported --exam-type value: ${raw}`);
  }
  return value;
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (quoted) {
      if (char === '"' && line[index + 1] === '"') {
        current += '"';
        index += 1;
        continue;
      }

      if (char === '"') {
        quoted = false;
        continue;
      }

      current += char;
      continue;
    }

    if (char === '"') {
      quoted = true;
      continue;
    }

    if (char === ",") {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

async function readQueueEntries(args: Args): Promise<QueueEntry[]> {
  const raw = await readFile(args.queuePath, "utf8");
  const lines = raw.trim().split(/\r?\n/);
  const headers = parseCsvLine(lines.shift() ?? "");
  const rows = lines.map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });

  return rows
    .map((row, index) => {
      const id = row.id?.startsWith("db:") ? row.id.slice(3) : "";
      const examTypes = (row.examTypes ?? "")
        .split("|")
        .filter((value): value is ExamType => EXAM_TYPES.includes(value as ExamType));

      if (!id) {
        throw new Error(`Invalid queue id at row ${index + 2}: ${row.id}`);
      }

      return {
        ordinal: index,
        id,
        sourcePath: row.sourcePath ?? "",
        examTypes,
        questionType: QuestionTypeSchema.parse(row.questionType),
        difficulty: difficultySchema.parse(row.difficulty),
        kpGroup: row.kpGroup ?? "",
        archetypeId: row.archetypeId ?? "",
        taskFlavor: row.taskFlavor ?? "",
        qualityScore: Number(row.qualityScore ?? 0),
        reasons: (row.reasons ?? "").split("|").filter(Boolean),
        recommendedAction: row.recommendedAction ?? "",
      };
    })
    .filter((entry) => entry.examTypes.includes(args.examType))
    .slice(args.offset, args.offset + args.limit);
}

async function loadQuestionRows(entries: QueueEntry[]) {
  if (entries.length === 0) {
    return new Map<string, DbQuestionRow>();
  }

  const rows = await db
    .select({
      id: questions.id,
      type: questions.type,
      difficulty: questions.difficulty,
      primaryKpCode: knowledgePoints.code,
      contentJson: questions.contentJson,
      answerJson: questions.answerJson,
      explanationJson: questions.explanationJson,
      contentHash: questions.contentHash,
      status: questions.status,
      sandboxVerified: questions.sandboxVerified,
      source: questions.source,
    })
    .from(questions)
    .innerJoin(knowledgePoints, eq(questions.primaryKpId, knowledgePoints.id))
    .where(inArray(questions.id, entries.map((entry) => entry.id)));

  return new Map(rows.map((row) => [row.id, row]));
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

function buildOriginalItem(entry: QueueEntry, row: DbQuestionRow): QuestionBundleItem {
  return QuestionBundleItemSchema.parse({
    type: row.type,
    difficulty: row.difficulty,
    primaryKpCode: row.primaryKpCode,
    auxiliaryKpCodes: [],
    examTypes: entry.examTypes,
    contentHash: row.contentHash,
    sandboxVerified: row.sandboxVerified,
    source: sourceSchema.catch("ai").parse(row.source),
    contentJson: row.contentJson,
    answerJson: row.answerJson,
    explanationJson: row.explanationJson,
  });
}

function buildRepairPrompt(params: {
  entry: QueueEntry;
  item: QuestionBundleItem;
  previousError?: string;
}) {
  const { entry, item } = params;
  const rules = [
    "修复目标：把这道题从 rewrite queue 中抢救出来，返回一个完整替换版本。",
    "保持不变：questionType、difficulty、primaryKpCode、examTypes、source。",
    "必须修复：低质量、hard 难度不达标、参数化模板、DS stack/queue 过载等队列原因。",
    "CSP-J hard 题必须有至少两步推理或非平凡状态跟踪，不得是一眼可得的定义题或单步计算。",
    "hard 单选题也必须包含可追踪的 C++ 代码片段、状态表或操作序列；不能只问概念定义、容器性质或最终一步计算。",
    "如果是 DS 且原因包含 stack/queue 过载，必须改写为 priority_queue、deque/单调队列、set/map、图遍历、并查集、复合状态模拟或二分边界维护之一；不要继续产出普通栈/普通队列模板题。",
    "DS hard 题题干中应出现至少两个状态量或结构标签，例如堆顶与占用集合、deque 前后端与窗口左界、set 迭代器与删除位置、BFS 层数与访问标记。",
    "优先参考这类素材思想：单调队列滑窗、双堆调度、set 前驱后继、分层 BFS、二分答案边界；不要照抄外部题面或代码。",
    "单选题必须恰好四个选项且唯一正确，answer 使用 A/B/C/D。",
    "阅读程序题必须是确定性、自包含 C++，不依赖 stdin，不出现样例输入/样例输出表述，answerJson.subQuestions 与 contentJson.subQuestions 一一对应。",
    "完善程序题必须给出可理解的 cppCode、fullCode、blanks；answerJson.blanks 与 blank id 一一对应。",
    "解析必须用中文说明关键推导、状态变化、边界或空位作用，不能只写“因此选 A”。",
    "不要声称来自官方真题或官方解析。",
    '只输出 JSON：{"contentJson":{},"answerJson":{},"explanationJson":{"explanation":"..."},"repairNotes":"..."}',
  ];

  if (params.previousError) {
    rules.push(`上一次候选被拒绝，原因：${params.previousError}`);
  }

  return [
    rules.join("\n"),
    "队列元数据：",
    JSON.stringify(
      {
        id: `db:${entry.id}`,
        examTypes: entry.examTypes,
        questionType: entry.questionType,
        difficulty: entry.difficulty,
        primaryKpCode: item.primaryKpCode,
        kpGroup: entry.kpGroup,
        reasons: entry.reasons,
        queueTaskFlavor: entry.taskFlavor,
        queueQualityScore: entry.qualityScore,
      },
      null,
      2,
    ),
    "原题：",
    JSON.stringify(
      {
        type: item.type,
        difficulty: item.difficulty,
        primaryKpCode: item.primaryKpCode,
        examTypes: item.examTypes,
        contentJson: item.contentJson,
        answerJson: item.answerJson,
        explanationJson: item.explanationJson,
      },
      null,
      2,
    ),
  ].join("\n\n");
}

function buildJudgePrompt(item: QuestionBundleItem) {
  return [
    "请严格审核下面的 CSP-J 题库修复候选。",
    "你必须独立解题，不要默认候选答案正确。",
    "通过条件：答案唯一且正确；解释与答案一致；难度、知识点和题型合理；代码确定且无未定义行为；hard 题不是伪难题；DS 题不过度套普通栈/队列模板。",
    '只输出 JSON：{"approved":boolean,"confidence":0.0,"issues":["..."],"qualityScore":0.0,"difficultyFit":"pass|warning|fail"}',
    JSON.stringify(
      {
        type: item.type,
        difficulty: item.difficulty,
        primaryKpCode: item.primaryKpCode,
        examTypes: item.examTypes,
        contentJson: item.contentJson,
        answerJson: item.answerJson,
        explanationJson: item.explanationJson,
      },
      null,
      2,
    ),
  ].join("\n\n");
}

function parseRepairResponse(text: string) {
  return repairResponseSchema.parse(JSON.parse(extractJsonObject(text)));
}

function parseJudgeResponse(text: string) {
  return judgeResponseSchema.parse(JSON.parse(extractJsonObject(text)));
}

function isAnswerChoice(value: string) {
  return /^[A-D]$/.test(value.trim().toUpperCase());
}

function assertAnswerShape(item: QuestionBundleItem) {
  if (item.type === "single_choice") {
    if (!isAnswerChoice(item.answerJson.answer)) {
      throw new Error("single_choice answer must be A-D");
    }
    return;
  }

  if (item.type === "reading_program") {
    if (item.answerJson.subQuestions.length !== item.contentJson.subQuestions.length) {
      throw new Error("reading_program answer count must match subQuestions");
    }
    if (item.answerJson.subQuestions.some((answer) => !isAnswerChoice(answer.answer))) {
      throw new Error("reading_program answers must be A-D");
    }
    return;
  }

  const blankIds = new Set(item.contentJson.blanks.map((blank) => blank.id));
  const answerIds = new Set(item.answerJson.blanks.map((blank) => blank.id));
  if (blankIds.size !== answerIds.size || [...blankIds].some((id) => !answerIds.has(id))) {
    throw new Error("completion_program answer blank ids must match content blanks");
  }
  if (item.answerJson.blanks.some((answer) => !isAnswerChoice(answer.answer))) {
    throw new Error("completion_program blank answers must be A-D");
  }
}

function assertNoReadingSampleIo(item: QuestionBundleItem) {
  if (item.type !== "reading_program") {
    return;
  }

  const texts = [
    item.contentJson.stem,
    ...item.contentJson.sampleInputs,
    ...item.contentJson.expectedOutputs,
    ...item.contentJson.subQuestions.flatMap((question) => [question.stem, ...question.options]),
    item.explanationJson.explanation,
  ];
  if (item.contentJson.sampleInputs.length > 0 || item.contentJson.expectedOutputs.length > 0) {
    throw new Error("reading_program sampleInputs/expectedOutputs must be empty");
  }
  if (texts.some((text) => /样例\s*(?:输入|输出)|(?:输入|输出)\s*样例|sample\s*(?:input|output)/iu.test(text))) {
    throw new Error("reading_program must not mention sample input/output");
  }
}

function buildCandidateItem(params: {
  entry: QueueEntry;
  original: QuestionBundleItem;
  patch: z.infer<typeof repairResponseSchema>;
}): CandidateValidation {
  const partial = {
    ...params.original,
    contentJson: params.patch.contentJson,
    answerJson: params.patch.answerJson,
    explanationJson: params.patch.explanationJson,
    sandboxVerified: false,
    source: "ai",
  } as QuestionBundleItem;
  const contentHash = computeContentHash(
    partial.contentJson.stem,
    summarizeQuestionForHash(partial),
  );
  const item = QuestionBundleItemSchema.parse({ ...partial, contentHash });
  assertAnswerShape(item);
  assertNoReadingSampleIo(item);

  const metrics = classifyQuestionDiversity(item);
  if (item.difficulty === "hard" && metrics.quality.qualityScore < 0.65) {
    throw new Error(
      `hard candidate qualityScore ${metrics.quality.qualityScore} below 0.65 after repair`,
    );
  }
  if (item.difficulty === "hard" && metrics.quality.difficultyFit === "fail") {
    throw new Error("hard candidate still fails deterministic difficulty rubric");
  }
  if (
    params.entry.reasons.includes("ds_stack_queue_overused_candidate") &&
    (metrics.taskFlavor === "stack_state_trace" || metrics.taskFlavor === "queue_state_trace")
  ) {
    throw new Error(`DS candidate still uses overrepresented taskFlavor ${metrics.taskFlavor}`);
  }

  return {
    item,
    contentHash,
    qualityScore: metrics.quality.qualityScore,
    difficultyFit: metrics.quality.difficultyFit,
    taskFlavor: metrics.taskFlavor,
    normalizedTemplateKey: metrics.normalizedTemplateKey,
  };
}

async function assertNoDbDuplicates(params: {
  id: string;
  item: QuestionBundleItem;
  contentHash: string;
  skipJaccard: boolean;
}) {
  const exactMatches = await db
    .select({ id: questions.id })
    .from(questions)
    .where(eq(questions.contentHash, params.contentHash))
    .limit(2);
  const exactOther = exactMatches.find((match) => match.id !== params.id);
  if (exactOther) {
    throw new Error(`candidate contentHash duplicates existing question ${exactOther.id}`);
  }

  if (params.skipJaccard) {
    return;
  }

  const similarityText = buildQuestionSimilarityText(params.item.type, params.item.contentJson);
  const candidates = await db
    .select({
      id: questions.id,
      contentJson: questions.contentJson,
    })
    .from(questions)
    .innerJoin(knowledgePoints, eq(questions.primaryKpId, knowledgePoints.id))
    .where(
      and(
        eq(questions.type, params.item.type),
        eq(knowledgePoints.code, params.item.primaryKpCode),
        ne(questions.status, "archived"),
      ),
    );

  for (const candidate of candidates) {
    if (candidate.id === params.id) {
      continue;
    }

    const candidateText = buildQuestionSimilarityText(params.item.type, candidate.contentJson);
    const similarity = jaccardSimilarity(similarityText, candidateText);
    if (similarity >= JACCARD_THRESHOLD) {
      throw new Error(
        `candidate Jaccard similarity ${similarity.toFixed(3)} duplicates question ${candidate.id}`,
      );
    }
  }
}

async function callRepair(params: {
  entry: QueueEntry;
  item: QuestionBundleItem;
  timeoutMs: number;
  previousError?: string;
}) {
  const system = [
    "你是谨慎的信息学竞赛题库修复员。",
    "你必须输出合法 JSON，不能输出 Markdown。",
    "你会保留题型、难度、主知识点和考试类型，只修复题目内容、答案与解析。",
  ].join("\n");
  const prompt = buildRepairPrompt(params);
  return callScriptSceneWithContinuation({
    initialPrompt: prompt,
    maxContinuationTurns: 1,
    call: ({ prompt: currentPrompt, messages }) =>
      callScriptLlmScene({
        scene: "generate",
        system,
        prompt: currentPrompt,
        messages,
        maxTokens: 3600,
        timeoutMs: params.timeoutMs,
        allowBackupFallback: true,
      }),
    parse: (text) => parseRepairResponse(text),
    buildContinuationPrompt: ({ error }) => {
      const message = error instanceof Error ? error.message : String(error);
      return [
        `上一轮输出无法解析为目标 JSON：${message}`,
        "请只返回一个 JSON object，不要解释，不要 Markdown，不要代码块。",
        '目标格式：{"contentJson":{},"answerJson":{},"explanationJson":{"explanation":"..."},"repairNotes":"..."}',
      ].join("\n");
    },
  });
}

async function callJudge(item: QuestionBundleItem, timeoutMs: number) {
  const system = [
    "你是严格的信息学竞赛题目审核员。",
    "你必须独立验算答案，且只输出合法 JSON。",
  ].join("\n");
  const prompt = buildJudgePrompt(item);
  return callScriptSceneWithContinuation({
    initialPrompt: prompt,
    maxContinuationTurns: 1,
    call: ({ prompt: currentPrompt, messages }) =>
      callScriptLlmScene({
        scene: "judge",
        system,
        prompt: currentPrompt,
        messages,
        maxTokens: 1600,
        timeoutMs,
        allowBackupFallback: true,
      }),
    parse: (text) => parseJudgeResponse(text),
    buildContinuationPrompt: ({ error }) => {
      const message = error instanceof Error ? error.message : String(error);
      return [
        `上一轮审核输出无法解析为目标 JSON：${message}`,
        "请只返回一个 JSON object，不要解释，不要 Markdown，不要代码块。",
        '目标格式：{"approved":true,"confidence":0.0,"issues":[],"qualityScore":0.0,"difficultyFit":"pass"}',
      ].join("\n");
    },
  });
}

function slugifySegment(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function replacementRunId(args: Args, entry: QueueEntry, item: QuestionBundleItem) {
  const date = args.batchId.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? "2026-05-07";
  const bundleNo = String(entry.ordinal + 1).padStart(4, "0");
  return `${date}-csp-j-rescue-b${bundleNo}-${item.difficulty}-v01`;
}

async function writeReplacementBundle(params: {
  args: Args;
  entry: QueueEntry;
  validation: CandidateValidation;
  repairResult: CallScriptLlmSceneResult;
  startedAt: string;
}) {
  const runId = replacementRunId(params.args, params.entry, params.validation.item);
  const kpSlug = slugifySegment(params.validation.item.primaryKpCode);
  const bundle: QuestionBundle = {
    meta: {
      bundleType: "question_bundle",
      schemaVersion: BUNDLE_SCHEMA_VERSION,
      runId,
      createdAt: new Date().toISOString(),
      generatedAt: new Date().toISOString(),
      provider: params.repairResult.providerName,
      model: params.repairResult.model,
      promptHash: computeChecksum(
        JSON.stringify({
          batchId: params.args.batchId,
          sourceId: `db:${params.entry.id}`,
          reasons: params.entry.reasons,
          contentHash: params.validation.contentHash,
        }),
      ),
      sourceBatchId: params.args.batchId,
      sourceBatchIds: [params.args.batchId, `db:${params.entry.id}`],
      sourceTimestamp: params.startedAt,
      examType: params.args.examType,
      questionType: params.validation.item.type,
      primaryKpCode: params.validation.item.primaryKpCode,
      difficulty: params.validation.item.difficulty,
      requestedCount: 1,
      validation: buildValidationMetadata({
        dbChecksSkipped: false,
        duplicateChecksSkipped: false,
        judgeChecksSkipped: false,
        sandboxVerifiedItemIndexes: [],
      }),
      integrity: buildBundleIntegrity([params.validation.item]),
    },
    items: [params.validation.item],
  };
  const bundlePath = path.join(
    "papers",
    "2026",
    runId,
    "question-bundles",
    `${runId}__question-bundle__${params.validation.item.type}__${kpSlug}__n1__v01.json`,
  );
  await mkdir(path.dirname(bundlePath), { recursive: true });
  await writeFile(bundlePath, formatJsonOutput(bundle), "utf8");
  return {
    runId,
    bundlePath: toDisplayRepoPath(bundlePath),
  };
}

function summarizeProvider(result: CallScriptLlmSceneResult | undefined) {
  return result
    ? {
        providerName: result.providerName,
        model: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      }
    : undefined;
}

async function repairOne(params: {
  args: Args;
  entry: QueueEntry;
  row: DbQuestionRow;
  seenTemplateKeys: Set<string>;
}) {
  const original = buildOriginalItem(params.entry, params.row);
  const attempts: unknown[] = [];
  let previousError: string | undefined;
  const startedAt = new Date().toISOString();

  for (let attempt = 1; attempt <= params.args.maxRepairAttempts; attempt += 1) {
    let repairResult: CallScriptLlmSceneResult | undefined;
    let judgeResult: CallScriptLlmSceneResult | undefined;

    try {
      const repair = await callRepair({
        entry: params.entry,
        item: original,
        timeoutMs: params.args.timeoutMs,
        previousError,
      });
      repairResult = repair.result;
      const validation = buildCandidateItem({
        entry: params.entry,
        original,
        patch: repair.parsed,
      });

      if (params.seenTemplateKeys.has(validation.normalizedTemplateKey)) {
        throw new Error("candidate repeats a template key already produced in this batch");
      }

      await assertNoDbDuplicates({
        id: params.row.id,
        item: validation.item,
        contentHash: validation.contentHash,
        skipJaccard: params.args.skipJaccard,
      });

      const judge = await callJudge(validation.item, params.args.timeoutMs);
      judgeResult = judge.result;
      if (!judge.parsed.approved || judge.parsed.confidence < 0.6) {
        throw new Error(
          `judge rejected candidate confidence=${judge.parsed.confidence}: ${judge.parsed.issues.join("; ")}`,
        );
      }
      if (judge.parsed.qualityScore !== undefined && judge.parsed.qualityScore < 0.65) {
        throw new Error(`judge qualityScore ${judge.parsed.qualityScore} below 0.65`);
      }
      if (judge.parsed.difficultyFit === "fail") {
        throw new Error("judge says difficultyFit=fail");
      }

      const bundleOutput = params.args.write
        ? await writeReplacementBundle({
            args: params.args,
            entry: params.entry,
            validation,
            repairResult: repair.result,
            startedAt,
          })
        : undefined;
      params.seenTemplateKeys.add(validation.normalizedTemplateKey);

      return {
        id: `db:${params.row.id}`,
        status: "repaired",
        wrote: params.args.write,
        bundleOutput,
        queue: params.entry,
        before: {
          contentHash: params.row.contentHash,
          status: params.row.status,
          sandboxVerified: params.row.sandboxVerified,
          type: params.row.type,
          difficulty: params.row.difficulty,
          primaryKpCode: params.row.primaryKpCode,
        },
        after: {
          contentHash: validation.contentHash,
          qualityScore: validation.qualityScore,
          difficultyFit: validation.difficultyFit,
          taskFlavor: validation.taskFlavor,
          sandboxVerified: false,
          source: "ai",
        },
        repairProvider: summarizeProvider(repairResult),
        judgeProvider: summarizeProvider(judgeResult),
        attempts: [
          ...attempts,
          {
            attempt,
            status: "accepted",
            repairProvider: summarizeProvider(repairResult),
            judgeProvider: summarizeProvider(judgeResult),
            judge: judge.parsed,
          },
        ],
      };
    } catch (error) {
      if (error instanceof ScriptSceneContinuationError) {
        if (repairResult) {
          judgeResult ??= error.result;
        } else {
          repairResult = error.result;
        }
      }
      previousError = error instanceof Error ? error.message : String(error);
      attempts.push({
        attempt,
        status: "failed",
        error: previousError,
        rawSnippet:
          error instanceof ScriptSceneContinuationError
            ? error.result.text.slice(0, 600)
            : undefined,
        repairProvider: summarizeProvider(repairResult),
        judgeProvider: summarizeProvider(judgeResult),
      });
    }
  }

  return {
    id: `db:${params.row.id}`,
    status: "failed",
    wrote: false,
    queue: params.entry,
    attempts,
    error: previousError ?? "unknown repair failure",
  };
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

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runWorker));
  return results;
}

function collectPlannedExternalLlmTargets() {
  const entries = [
    ...resolveScriptProviderChain("generate", { allowBackupFallback: true }),
    ...resolveScriptProviderChain("judge", { allowBackupFallback: true }),
  ];

  return {
    providers: [...new Set(entries.map((entry) => entry.providerName))].sort((left, right) =>
      left.localeCompare(right),
    ),
    baseUrls: [...new Set(entries.map((entry) => entry.baseURL))].sort((left, right) =>
      left.localeCompare(right),
    ),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const plannedTargets = collectPlannedExternalLlmTargets();
  const externalLlmDisclosure = assertExternalLlmAllowed({
    allowExternalLlm: args.allowExternalLlm,
    operation: "DB rewrite queue replacement bundle generation",
    purpose:
      args.externalLlmPurpose ??
      "User-requested CSP-J question-bank rescue for the first rewrite queue batch.",
    consentPath: args.externalLlmConsent,
    plannedProviders: plannedTargets.providers,
    plannedBaseUrls: plannedTargets.baseUrls,
    dataCategories: [
      "question stems",
      "answer options",
      "C++ source code",
      "answers",
      "explanations",
      "question metadata",
    ],
  });
  const entries = await readQueueEntries(args);
  const rowsById = await loadQuestionRows(entries);
  const missing = entries.filter((entry) => !rowsById.has(entry.id)).map((entry) => `db:${entry.id}`);
  const selected = entries.filter((entry) => rowsById.has(entry.id));
  const seenTemplateKeys = new Set<string>();
  const startedAt = new Date().toISOString();
  const reportPath = path.join(
    args.reportDir,
    `${args.batchId}__report__db-rewrite-replacement-bundles.json`,
  );
  const report = {
    meta: {
      batchId: args.batchId,
      reportType: "db_question_rewrite_queue_replacement_bundles",
      startedAt,
      finishedAt: "",
      queuePath: toDisplayRepoPath(args.queuePath),
      examType: args.examType,
      offset: args.offset,
      limit: args.limit,
      write: args.write,
      maxConcurrency: args.maxConcurrency,
      timeoutMs: args.timeoutMs,
      maxRepairAttempts: args.maxRepairAttempts,
      skipJaccard: args.skipJaccard,
      externalLlmDisclosure,
    },
    summary: {
      selected: selected.length,
      missing: missing.length,
      repaired: 0,
      failed: 0,
      wrote: 0,
    },
    missing,
    items: [] as unknown[],
  };
  let writeChain = Promise.resolve();
  const persistReport = async () => {
    writeChain = writeChain.then(async () => {
      await mkdir(path.dirname(reportPath), { recursive: true });
      await writeFile(reportPath, formatJsonOutput(report), "utf8");
    });
    await writeChain;
  };

  console.log(
    `DB-REWRITE-START selected=${selected.length} missing=${missing.length} batch=${args.batchId} write=${args.write} providers=${plannedTargets.providers.join(",")}`,
  );
  await persistReport();

  const results = await runPool(selected, args.maxConcurrency, async (entry) => {
    const row = rowsById.get(entry.id)!;
    const result = await repairOne({ args, entry, row, seenTemplateKeys });
    report.items.push(result);
    report.summary.repaired = report.items.filter(
      (item) => (item as { status?: string }).status === "repaired",
    ).length;
    report.summary.failed = report.items.filter(
      (item) => (item as { status?: string }).status === "failed",
    ).length;
    report.summary.wrote = report.items.filter(
      (item) => (item as { wrote?: boolean }).wrote === true,
    ).length;
    await persistReport();
    console.log(
      `DB-REWRITE-ITEM db:${entry.id} status=${(result as { status: string }).status}`,
    );
    return result;
  });

  report.items = results;
  report.summary.repaired = results.filter(
    (item) => (item as { status?: string }).status === "repaired",
  ).length;
  report.summary.failed = results.filter(
    (item) => (item as { status?: string }).status === "failed",
  ).length;
  report.summary.wrote = results.filter((item) => (item as { wrote?: boolean }).wrote === true)
    .length;
  report.meta.finishedAt = new Date().toISOString();
  await persistReport();

  console.log(
    `DB-REWRITE-DONE ${JSON.stringify({
      ...report.summary,
      reportPath: toDisplayRepoPath(reportPath),
    })}`,
  );

  if (report.summary.failed > 0) {
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
