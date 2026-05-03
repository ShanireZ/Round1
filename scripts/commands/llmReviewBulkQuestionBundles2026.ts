  console.log(`Usage: tsx scripts/commands/llmReviewBulkQuestionBundles2026.ts [options]
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { generateText } from "ai";
import { z } from "zod";

import {
  createProviderLanguageModel,
  getSceneExecutionChain,
  type LLMLane,
  type LLMProviderName,
  type LLMScene,
  type ProviderReasoningOptions,
} from "../../config/llm.js";
import { env } from "../../config/env.js";
import { computeContentHash } from "../../server/services/deduplicationService.js";
import {
  type QuestionBundle,
  type QuestionBundleItem,
  QuestionBundleItemSchema,
  QuestionBundleSchema,
  buildBundleIntegrity,
  buildValidationMetadata,
} from "../lib/bundleTypes.js";
import { extractJsonObject } from "../lib/modelJson.js";
import { loadQuestionBundle, validateQuestionBundle } from "../lib/questionBundleWorkflow.js";

type ArgValue = boolean | string;

const DEFAULT_BULK_PREFIX = "2026-05-01-bulk1000-b";
const DEFAULT_REPORT_RUN_ID = "2026-05-01-bulk1000-llm-chain-review-v01";
const DEFAULT_TIMEOUT_MS = 90_000;
const DEFAULT_MAX_REPAIR_ATTEMPTS = 3;
const DEFAULT_MAX_CONCURRENCY = 2;

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
  correctedContentJson: z.unknown().optional(),
  correctedAnswerJson: z.unknown().optional(),
  correctedExplanationJson: z.unknown().optional(),
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

type AuditIssue = z.infer<typeof issueSchema>;
type AuditResponse = z.infer<typeof auditResponseSchema>;
type RepairResponse = z.infer<typeof repairResponseSchema>;

interface ReviewAttemptReport {
  attempt: number;
  phase: "audit" | "verification";
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
  attempt: number;
  lane: LLMLane;
  providerName?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  repairedItems: number[];
  error?: string;
}

interface BundleReport {
  path: string;
  runId: string;
  examType: string;
  questionType: string;
  primaryKpCode: string;
  difficulty: string;
  finalVerdict: "pass" | "fail";
  rewritesApplied: number;
  reviewAttempts: ReviewAttemptReport[];
  repairAttempts: RepairAttemptReport[];
  formalBundleStatus: "llm_chain_passed" | "llm_chain_failed";
  questionStatusIfImported: "draft";
  reviewStatusEvidence: "llm_chain_ai_reviewed" | "llm_chain_failed";
}

interface FileEntry {
  absolutePath: string;
  repoPath: string;
  ordinal: number;
}

interface DirectLlmResult {
  providerName: LLMProviderName;
  model: string;
  text: string;
  inputTokens: number;
  outputTokens: number;
  responseId?: string;
}

function parseArgs(argv: string[]) {
  const args: Record<string, ArgValue> = {};

  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (!token?.startsWith("--")) {
      continue;
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
    index++;
  }

  return args;
}

function readIntArg(
  args: Record<string, ArgValue>,
  key: string,
  defaultValue: number,
  validate: (value: number) => boolean,
) {
  const raw = args[key];
  const value = typeof raw === "string" ? Number.parseInt(raw, 10) : defaultValue;
  if (!Number.isInteger(value) || !validate(value)) {
    throw new Error(`Invalid --${key}: ${String(raw)}`);
  }
  return value;
}

async function collectFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const child = path.join(root, entry.name);
      if (entry.isDirectory()) {
        return collectFiles(child);
      }
      if (entry.isFile()) {
        return [child];
      }
      return [];
    }),
  );

  return nested.flat();
}

function toRepoPath(filePath: string) {
  return path.relative(process.cwd(), filePath).split(path.sep).join("/");
}

async function listGeneratedBundleFiles(params: {
  year: string;
  prefix: string;
  shardIndex: number;
  shardCount: number;
  limit: number | undefined;
  runIds: Set<string> | undefined;
}): Promise<FileEntry[]> {
  const root = path.join(process.cwd(), "papers", params.year);
  const files = (await collectFiles(root))
    .filter((file) => file.endsWith(".json"))
    .filter((file) => path.basename(path.dirname(path.dirname(file))).startsWith(params.prefix))
    .sort((a, b) => a.localeCompare(b));

  const selected = files
    .map((absolutePath, ordinal) => ({
      absolutePath,
      repoPath: toRepoPath(absolutePath),
      ordinal,
    }))
    .filter((entry) => {
      if (!params.runIds) {
        return true;
      }

      const runId = path.basename(path.dirname(path.dirname(entry.absolutePath)));
      return params.runIds.has(runId);
    })
    .filter((entry) => entry.ordinal % params.shardCount === params.shardIndex);

  return typeof params.limit === "number" ? selected.slice(0, params.limit) : selected;
}

function laneFor(ordinal: number, attempt: number): LLMLane {
  return (ordinal + attempt) % 2 === 0 ? "default" : "backup";
}

function oppositeLane(lane: LLMLane): LLMLane {
  return lane === "default" ? "backup" : "default";
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringFrom(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function resolveResponseId(response: unknown): string | undefined {
  const responseRecord = asRecord(response);
  const bodyRecord = asRecord(responseRecord?.body);
  const nestedResponse = asRecord(bodyRecord?.response);
  return (
    stringFrom(nestedResponse?.id) ?? stringFrom(bodyRecord?.id) ?? stringFrom(responseRecord?.id)
  );
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

async function callDirectLlmScene(params: {
  scene: LLMScene;
  lane: LLMLane;
  system: string;
  prompt: string;
  maxTokens: number;
  timeoutMs: number;
}): Promise<DirectLlmResult> {
  const entry = getSceneExecutionChain(
    params.scene,
    {
      lane: params.lane,
      includeBackupFallback: false,
    },
    env,
  )[0]!;
  const providerOptions = buildNoThinkingProviderOptions(entry.providerName);
  const optionAttempts = providerOptions ? [providerOptions, undefined] : [undefined];
  let lastError: unknown;

  for (const options of optionAttempts) {
    try {
      const response = await generateText({
        model: createProviderLanguageModel(entry),
        system: params.system,
        prompt: params.prompt,
        maxOutputTokens: params.maxTokens,
        timeout: params.timeoutMs,
        ...(options ? { providerOptions: options } : {}),
      });

      return {
        providerName: entry.providerName,
        model: entry.model,
        text: response.text,
        inputTokens: response.usage?.inputTokens ?? 0,
        outputTokens: response.usage?.outputTokens ?? 0,
        responseId: resolveResponseId(response.response),
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

function summarizeQuestionForHash(item: QuestionBundleItem): string {
  if (item.type === "single_choice") {
    return item.contentJson.options.join("\n");
  }

  if (item.type === "reading_program") {
    return item.contentJson.cppCode;
  }

  return item.contentJson.fullCode;
}

function recomputeContentHash<T extends QuestionBundleItem>(item: T): T {
  return {
    ...item,
    contentHash: computeContentHash(item.contentJson.stem, summarizeQuestionForHash(item)),
  };
}

function normalizeBundleAfterRepairs(bundle: QuestionBundle): QuestionBundle {
  const items = bundle.items.map((item) => recomputeContentHash(item));
  return {
    ...bundle,
    meta: {
      ...bundle.meta,
      validation: buildValidationMetadata({
        dbChecksSkipped: true,
        duplicateChecksSkipped: true,
        judgeChecksSkipped: false,
        sandboxVerifiedItemIndexes: items
          .map((item, index) => (item.sandboxVerified ? index : null))
          .filter((index): index is number => index !== null),
      }),
      integrity: buildBundleIntegrity(items),
    },
    items,
  };
}

function validateCorrectedItem(
  original: QuestionBundleItem,
  patch: {
    contentJson: unknown;
    answerJson: unknown;
    explanationJson: unknown;
  },
): QuestionBundleItem {
  const candidate = recomputeContentHash({
    ...original,
    contentJson: patch.contentJson,
    answerJson: patch.answerJson,
    explanationJson: patch.explanationJson,
  } as QuestionBundleItem);

  return QuestionBundleItemSchema.parse(candidate);
}

function safeJson(value: unknown) {
  return JSON.stringify(value, null, 2);
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

function buildAuditPrompt(
  bundle: QuestionBundle,
  previousIssues: Array<AuditIssue & { itemIndex: number }>,
) {
  const instructions = [
    "Audit this information-olympiad question bundle.",
    "Solve every item independently. Do not assume the supplied answer is correct.",
    "Return JSON only. No markdown.",
    "Pass criteria:",
    "- the supplied answer is correct and uniquely determined;",
    "- the explanation is consistent with the answer;",
    "- the type, exam type, difficulty and primary knowledge point are plausible;",
    "- single_choice has exactly four options and exactly one correct answer;",
    "- reading_program/completion_program code is deterministic, self-contained C++ without undefined behavior;",
    "- completion answers match the blank ids and produce the shown expected behavior.",
    "If an item fails, include correctedContentJson, correctedAnswerJson, and correctedExplanationJson when a safe correction is possible.",
    "Do not include positive observations as issues. issues must contain only defects.",
    "Do not use severity major or blocker for an item whose supplied answer is correct and whose only concern is minor metadata calibration.",
    'Output schema: {"bundleVerdict":"pass|fail","items":[{"itemIndex":0,"verdict":"pass|fail","confidence":0.0,"issues":[{"code":"...","severity":"minor|major|blocker","message":"..."}],"correctedContentJson":{},"correctedAnswerJson":{},"correctedExplanationJson":{}}],"notes":"..."}',
    "Use major or blocker severity for answer errors, ambiguous stems, invalid code, impossible completion blanks, or mismatched metadata.",
  ];

  if (previousIssues.length > 0) {
    instructions.push("Previous unresolved issues:");
    instructions.push(safeJson(previousIssues));
  }

  instructions.push("Input bundle:");
  instructions.push(safeJson(buildAuditPayload(bundle)));

  return instructions.join("\n");
}

function buildRepairPrompt(bundle: QuestionBundle, failedItems: AuditItemWithIndex[]) {
  const failedItemIndexes = failedItems.map((entry) => entry.itemIndex);
  return [
    "Repair only the failed items in this question bundle.",
    "Return JSON only. No markdown.",
    "Do not change itemIndex, question type, exam type, difficulty, primary knowledge point, or source.",
    "If the failure is that the item is too easy for its difficulty, rewrite the question so the content truly matches the existing difficulty instead of changing metadata.",
    "For hard items, require at least two reasoning steps or a nontrivial state trace; avoid one-step arithmetic.",
    "For medium items, require clear reasoning but avoid excessive complexity.",
    "For easy items, keep the item direct and unambiguous.",
    "For single_choice, solve the rewritten question first, then create exactly four options with exactly one correct option.",
    "For reading_program, ensure the C++ code is deterministic, self-contained, and the answer follows from tracing the actual code.",
    "For completion_program, ensure the fullCode compiles conceptually, each blank id has one answer, and the answer makes the program match the stated behavior.",
    "For each failed item, return a complete replacement contentJson, answerJson, and explanationJson matching that item's current type schema.",
    `You must return exactly these item indexes in items: ${failedItemIndexes.join(", ")}.`,
    "If you believe no repair is needed, still return a conservative rewrite for every listed itemIndex.",
    "Keep all text appropriate for Chinese information-olympiad learners.",
    'Output schema: {"items":[{"itemIndex":0,"contentJson":{},"answerJson":{},"explanationJson":{},"repairNotes":"..."}]}',
    "Failed items and issues:",
    safeJson(
      failedItems.map((entry) => ({
        itemIndex: entry.itemIndex,
        issues: entry.issues,
        item: bundle.items[entry.itemIndex],
      })),
    ),
  ].join("\n");
}

type AuditItemWithIndex = z.infer<typeof auditItemSchema> & { itemIndex: number };

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
        message: "LLM marked the item as fail but did not provide an issue.",
      });
    } else if (item.verdict === "fail" && !hasBlockingIssue) {
      issues.push({
        itemIndex: item.itemIndex,
        code: "LLM_ITEM_FAILED_WITH_NON_BLOCKING_ISSUES",
        severity: "minor",
        message:
          "LLM marked the item as fail, but only non-blocking calibration issues were reported.",
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

  for (let itemIndex = 0; itemIndex < itemCount; itemIndex++) {
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

function normalizeAuditIssue(
  issue: AuditIssue,
  itemIndex: number,
): (AuditIssue & { itemIndex: number }) | null {
  const combined = `${issue.code} ${issue.message}`.toLowerCase();
  if (/answer[_ -]?correct|correct answer|supplied answer is correct/.test(combined)) {
    return null;
  }

  if (
    /(actually|appears|seems|is|was|are) correct|no (actual |real )?(defect|issue|problem)|no correction needed|no need to change|false positive|misread|misflagged|erroneously|should be pass|答案(是|为|均)?正确|原答案正确|无误|无问题|无实际错误|无需(更改|修改|调整)|不影响答案|应为pass|应判为pass/.test(
      combined,
    )
  ) {
    return null;
  }

  if (
    /(difficulty|too easy|too simple|too simplistic|trivial|beginner|metadata|repetitive|similar)/.test(
      combined,
    ) &&
    !/(wrong answer|answer error|ambiguous|invalid|impossible|not uniquely|duplicate option|malformed)/.test(
      combined,
    )
  ) {
    return {
      ...issue,
      itemIndex,
      severity: "minor",
    };
  }

  return {
    ...issue,
    itemIndex,
  };
}

async function callAudit(
  bundle: QuestionBundle,
  lane: LLMLane,
  previousIssues: Array<AuditIssue & { itemIndex: number }>,
  timeoutMs: number,
) {
  const result = await callDirectLlmScene({
    scene: "judge",
    system: [
      "You are a strict programming contest question auditor.",
      "You must solve and validate each item independently.",
      "You must return valid JSON only.",
    ].join("\n"),
    prompt: buildAuditPrompt(bundle, previousIssues),
    lane,
    maxTokens: 2500,
    timeoutMs,
  });

  return {
    result,
    parsed: auditResponseSchema.parse(JSON.parse(extractJsonObject(result.text))),
  };
}

async function callRepair(
  bundle: QuestionBundle,
  lane: LLMLane,
  failedItems: AuditItemWithIndex[],
  timeoutMs: number,
) {
  const result = await callDirectLlmScene({
    scene: "generate",
    system: [
      "You are a careful Chinese information-olympiad question editor.",
      "You repair invalid generated question items while preserving the bundle schema.",
      "You must return valid JSON only.",
    ].join("\n"),
    prompt: buildRepairPrompt(bundle, failedItems),
    lane,
    maxTokens: 3500,
    timeoutMs,
  });

  return {
    result,
    parsed: repairResponseSchema.parse(JSON.parse(extractJsonObject(result.text))),
  };
}

async function tryRepair(
  bundle: QuestionBundle,
  preferredLane: LLMLane,
  failedItems: AuditItemWithIndex[],
  timeoutMs: number,
) {
  const lanes: LLMLane[] = [preferredLane, oppositeLane(preferredLane)];
  const errors: string[] = [];

  for (const lane of lanes) {
    try {
      const repair = await callRepair(bundle, lane, failedItems, timeoutMs);
      const returnedIndexes = new Set(repair.parsed.items.map((item) => item.itemIndex));
      const missingIndexes = failedItems
        .map((item) => item.itemIndex)
        .filter((itemIndex) => !returnedIndexes.has(itemIndex));
      if (missingIndexes.length > 0) {
        throw new Error(`repair response missing itemIndex(es): ${missingIndexes.join(", ")}`);
      }

      return { ...repair, lane };
    } catch (error) {
      errors.push(`${lane}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`All repair lanes failed: ${errors.join(" | ")}`);
}

function selectFailedItems(audit: AuditResponse): AuditItemWithIndex[] {
  return audit.items.filter(
    (item): item is AuditItemWithIndex =>
      item.verdict === "fail" ||
      item.confidence < 0.6 ||
      item.issues.some((issue) => issue.severity !== "minor"),
  );
}

function applyRepairResponse(bundle: QuestionBundle, repair: RepairResponse) {
  const repairedIndexes: number[] = [];
  const items = [...bundle.items];

  for (const patch of repair.items) {
    const original = items[patch.itemIndex];
    if (!original) {
      throw new Error(`Repair response referenced missing itemIndex ${patch.itemIndex}.`);
    }

    items[patch.itemIndex] = validateCorrectedItem(original, patch);
    repairedIndexes.push(patch.itemIndex);
  }

  return {
    bundle: normalizeBundleAfterRepairs({
      ...bundle,
      items,
    }),
    repairedIndexes,
  };
}

async function validateBundleFile(filePath: string) {
  const loaded = await loadQuestionBundle(filePath);
  const validation = await validateQuestionBundle(loaded, { skipDuplicateChecks: true });
  if (validation.summary.rejectedCount > 0 || validation.errors.length > 0) {
    throw new Error(
      `Bundle validation failed: ${validation.errors.map((error) => error.code).join(", ")}`,
    );
  }
}

async function reviewBundleFile(
  entry: FileEntry,
  params: { maxRepairAttempts: number; timeoutMs: number; write: boolean },
) {
  const raw = await readFile(entry.absolutePath, "utf8");
  let bundle = QuestionBundleSchema.parse(JSON.parse(raw));
  const reviewAttempts: ReviewAttemptReport[] = [];
  const repairAttempts: RepairAttemptReport[] = [];
  let rewritesApplied = 0;

  for (let attempt = 0; attempt <= params.maxRepairAttempts; attempt++) {
    const firstLane = laneFor(entry.ordinal, attempt);
    const laneChain: Array<{ lane: LLMLane; phase: "audit" | "verification" }> = [
      { lane: firstLane, phase: "audit" },
      { lane: oppositeLane(firstLane), phase: "verification" },
    ];
    let failedAudit: AuditResponse | undefined;
    let chainPassed = true;

    for (const step of laneChain) {
      try {
        const { result, parsed } = await callAudit(bundle, step.lane, [], params.timeoutMs);
        const issues = extractReviewIssues(parsed, bundle.items.length);
        const verdict = issues.length === 0 ? "pass" : "fail";
        reviewAttempts.push({
          attempt,
          phase: step.phase,
          lane: step.lane,
          providerName: result.providerName,
          model: result.model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          verdict,
          issueCount: issues.length,
          issues,
          notes: parsed.notes,
        });

        if (verdict === "fail") {
          failedAudit = parsed;
          chainPassed = false;
          break;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const issue = {
          itemIndex: 0,
          code: "LLM_CHAIN_ERROR",
          severity: "blocker" as const,
          message,
        };
        reviewAttempts.push({
          attempt,
          phase: step.phase,
          lane: step.lane,
          verdict: "error",
          issueCount: 1,
          issues: [issue],
          error: message,
        });
        chainPassed = false;
        break;
      }
    }

    if (chainPassed) {
      return {
        bundle,
        report: buildBundleReport(
          entry,
          bundle,
          "pass",
          rewritesApplied,
          reviewAttempts,
          repairAttempts,
        ),
      };
    }

    if (attempt >= params.maxRepairAttempts) {
      break;
    }

    const failedItems = failedAudit ? selectFailedItems(failedAudit) : [];
    if (failedItems.length === 0) {
      continue;
    }

    const preferredRepairLane = oppositeLane(laneFor(entry.ordinal, attempt));
    try {
      const repair = await tryRepair(bundle, preferredRepairLane, failedItems, params.timeoutMs);
      const applied = applyRepairResponse(bundle, repair.parsed);
      bundle = applied.bundle;
      rewritesApplied += applied.repairedIndexes.length;
      repairAttempts.push({
        attempt,
        lane: repair.lane,
        providerName: repair.result.providerName,
        model: repair.result.model,
        inputTokens: repair.result.inputTokens,
        outputTokens: repair.result.outputTokens,
        repairedItems: applied.repairedIndexes,
      });

      if (params.write) {
        await writeFile(entry.absolutePath, JSON.stringify(bundle, null, 2) + "\n", "utf8");
        await validateBundleFile(entry.absolutePath);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      repairAttempts.push({
        attempt,
        lane: preferredRepairLane,
        repairedItems: [],
        error: message,
      });
    }
  }

  return {
    bundle,
    report: buildBundleReport(
      entry,
      bundle,
      "fail",
      rewritesApplied,
      reviewAttempts,
      repairAttempts,
    ),
  };
}

function buildBundleReport(
  entry: FileEntry,
  bundle: QuestionBundle,
  finalVerdict: "pass" | "fail",
  rewritesApplied: number,
  reviewAttempts: ReviewAttemptReport[],
  repairAttempts: RepairAttemptReport[],
): BundleReport {
  return {
    path: entry.repoPath,
    runId: bundle.meta.runId,
    examType: bundle.meta.examType,
    questionType: bundle.meta.questionType,
    primaryKpCode: bundle.meta.primaryKpCode,
    difficulty: bundle.meta.difficulty,
    finalVerdict,
    rewritesApplied,
    reviewAttempts,
    repairAttempts,
    formalBundleStatus: finalVerdict === "pass" ? "llm_chain_passed" : "llm_chain_failed",
    questionStatusIfImported: "draft",
    reviewStatusEvidence: finalVerdict === "pass" ? "llm_chain_ai_reviewed" : "llm_chain_failed",
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
      nextIndex++;
      results[index] = await worker(items[index]!);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker()));
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const year = typeof args.year === "string" ? args.year : "2026";
  const prefix = typeof args.prefix === "string" ? args.prefix : DEFAULT_BULK_PREFIX;
  const reportRunId =
    typeof args["report-run-id"] === "string" ? args["report-run-id"] : DEFAULT_REPORT_RUN_ID;
  const shardIndex = readIntArg(args, "shard-index", 0, (value) => value >= 0);
  const shardCount = readIntArg(args, "shard-count", 1, (value) => value >= 1);
  if (shardIndex >= shardCount) {
    throw new Error(`--shard-index must be lower than --shard-count.`);
  }

  const limit =
    typeof args.limit === "string" ? readIntArg(args, "limit", 0, (value) => value > 0) : undefined;
  const runIds =
    typeof args["run-ids"] === "string"
      ? new Set(
          args["run-ids"]
            .split(",")
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0),
        )
      : undefined;
  const maxRepairAttempts = readIntArg(
    args,
    "max-repair-attempts",
    DEFAULT_MAX_REPAIR_ATTEMPTS,
    (value) => value >= 0,
  );
  const maxConcurrency = readIntArg(
    args,
    "max-concurrency",
    DEFAULT_MAX_CONCURRENCY,
    (value) => value > 0,
  );
  const timeoutMs = readIntArg(args, "timeout-ms", DEFAULT_TIMEOUT_MS, (value) => value > 0);
  const write = args.write === true;
  const files = await listGeneratedBundleFiles({
    year,
    prefix,
    shardIndex,
    shardCount,
    limit,
    runIds,
  });
  const startedAt = new Date().toISOString();

  console.log(
    `LLM-CHAIN-START shard=${shardIndex}/${shardCount} files=${files.length} default=${env.LLM_PROVIDER_DEFAULT} backup=${env.LLM_PROVIDER_BACKUP} write=${write}`,
  );

  const bundleReports = await runPool(files, maxConcurrency, async (entry) => {
    try {
      const result = await reviewBundleFile(entry, { maxRepairAttempts, timeoutMs, write });
      console.log(
        `LLM-CHAIN-BUNDLE ${entry.repoPath} verdict=${result.report.finalVerdict} rewrites=${result.report.rewritesApplied} attempts=${result.report.reviewAttempts.length}`,
      );
      return result.report;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const loaded = await loadQuestionBundle(entry.absolutePath);
      const report = buildBundleReport(
        entry,
        loaded.bundle,
        "fail",
        0,
        [
          {
            attempt: 0,
            phase: "audit",
            lane: laneFor(entry.ordinal, 0),
            verdict: "error",
            issueCount: 1,
            issues: [
              {
                itemIndex: 0,
                code: "LLM_CHAIN_UNHANDLED_ERROR",
                severity: "blocker",
                message,
              },
            ],
            error: message,
          },
        ],
        [],
      );
      console.log(`LLM-CHAIN-BUNDLE ${entry.repoPath} verdict=fail error=${message}`);
      return report;
    }
  });

  const summary = {
    totalBundles: bundleReports.length,
    passedBundles: bundleReports.filter((entry) => entry.finalVerdict === "pass").length,
    failedBundles: bundleReports.filter((entry) => entry.finalVerdict === "fail").length,
    totalReviewAttempts: bundleReports.reduce((sum, entry) => sum + entry.reviewAttempts.length, 0),
    totalRepairAttempts: bundleReports.reduce((sum, entry) => sum + entry.repairAttempts.length, 0),
    totalRewritesApplied: bundleReports.reduce((sum, entry) => sum + entry.rewritesApplied, 0),
  };

  const report = {
    meta: {
      runId: reportRunId,
      reportType: "bulk_question_llm_chain_review",
      startedAt,
      finishedAt: new Date().toISOString(),
      generatedLocally: true,
      outputRoot: `papers/${year}`,
      importedToDatabase: false,
      prebuiltPapersBuilt: false,
      published: false,
      defaultProvider: env.LLM_PROVIDER_DEFAULT,
      backupProvider: env.LLM_PROVIDER_BACKUP,
      shardIndex,
      shardCount,
      runIds: runIds ? [...runIds] : undefined,
      write,
      timeoutMs,
    },
    status: {
      formalBundleStatus: summary.failedBundles === 0 ? "llm_chain_passed" : "llm_chain_failed",
      questionStatusIfImported: "draft",
      reviewStatusEvidence:
        summary.failedBundles === 0 ? "llm_chain_ai_reviewed" : "llm_chain_failed",
      reviewStatusNotClaimed: "confirmed",
    },
    summary,
    bundles: bundleReports,
  };

  const reportDir = path.join(process.cwd(), "artifacts", "reports", year, reportRunId);
  const reportPath = path.join(
    reportDir,
    `${reportRunId}__report__llm-chain-review__shard-${shardIndex + 1}-of-${shardCount}.json`,
  );
  await mkdir(reportDir, { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(`LLM-CHAIN-DONE ${safeJson({ ...summary, reportPath: toRepoPath(reportPath) })}`);

  if (summary.failedBundles > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
