import { readFile } from "node:fs/promises";
import path from "node:path";

import { and, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";

import { blueprintSpecs } from "../../config/blueprint.js";
import { db, checkDbConnection } from "../../server/db.js";
import { importBatches } from "../../server/db/schema/importBatches.js";
import { knowledgePoints } from "../../server/db/schema/knowledgePoints.js";
import { questionExamTypes } from "../../server/db/schema/questionExamTypes.js";
import { questionKpTags } from "../../server/db/schema/questionKpTags.js";
import { questions } from "../../server/db/schema/questions.js";
import {
  buildQuestionSimilarityText,
  computeContentHash,
  jaccardSimilarity,
} from "../../server/services/deduplicationService.js";
import { verifyCpp } from "../../server/services/sandbox/cppRunner.js";
import {
  type ImportError,
  type ImportSummary,
  type QuestionBundle,
  type QuestionBundleItem,
  QuestionBundleSchema,
  buildImportSummary,
  computeChecksum,
  verifyBundleIntegrity,
} from "./bundleTypes.js";
import { callScriptLlmScene } from "./scriptLlmClient.js";
import { extractJsonObject } from "./modelJson.js";

export interface LoadedQuestionBundle {
  bundle: QuestionBundle;
  raw: string;
  checksum: string;
  sourceFilename: string;
  sourcePath: string;
}

export interface QuestionBundleValidationResult {
  summary: ImportSummary;
  errors: ImportError[];
  duplicateChecksSkipped: boolean;
  sandboxVerifiedItemIndexes: number[];
  judgeChecksSkipped: boolean;
}

export interface ImportQuestionBundleOptions {
  apply: boolean;
  persistDryRun?: boolean;
  importedBy?: string | null;
  skipDuplicateChecks?: boolean;
}

export interface QuestionBundleValidationOptions {
  runSandbox?: boolean;
  runJudge?: boolean;
  judgeTimeoutMs?: number;
  judgeAttempts?: number;
  judgeItemIndexes?: Set<number>;
  skipDuplicateChecks?: boolean;
  requireDuplicateChecks?: boolean;
}

const judgeReviewSchema = z.object({
  approved: z.boolean(),
  issues: z.array(z.string()).default([]),
  correctedAnswer: z.string().nullable().default(null),
  suggestion: z.string().nullable().default(null),
});

function summarizeQuestionForHash(item: QuestionBundleItem): string {
  if (item.type === "single_choice") {
    return item.contentJson.options.join("\n");
  }

  if (item.type === "reading_program") {
    return item.contentJson.cppCode;
  }

  return item.contentJson.fullCode;
}

const DUPLICATE_JACCARD_THRESHOLD = 0.85;

function hasBlueprintCoverage(item: QuestionBundleItem): boolean {
  return item.examTypes.every((examType) => {
    const spec = blueprintSpecs[examType];
    if (!spec) {
      return false;
    }

    return spec.sections.some(
      (section) =>
        section.questionType === item.type &&
        section.primaryKpQuota.some((quota) => quota.kpCode === item.primaryKpCode),
    );
  });
}

function isCodeQuestion(item: QuestionBundleItem): boolean {
  return item.type === "reading_program" || item.type === "completion_program";
}

function isAnswerChoice(value: string): boolean {
  return /^[A-D]$/.test(value.trim().toUpperCase());
}

function validateAnswerShape(item: QuestionBundleItem, index: number): ImportError[] {
  if (item.type === "single_choice") {
    return isAnswerChoice(item.answerJson.answer)
      ? []
      : [
          {
            code: "ANSWER_SHAPE_INVALID",
            message: `item ${index} single_choice answer must be A-D`,
            itemIndex: index,
          },
        ];
  }

  if (item.type === "reading_program") {
    const errors: ImportError[] = [];
    if (item.answerJson.subQuestions.length !== item.contentJson.subQuestions.length) {
      errors.push({
        code: "ANSWER_SHAPE_INVALID",
        message: `item ${index} reading_program answer count does not match subQuestions`,
        itemIndex: index,
      });
    }

    if (item.answerJson.subQuestions.some((answer) => !isAnswerChoice(answer.answer))) {
      errors.push({
        code: "ANSWER_SHAPE_INVALID",
        message: `item ${index} reading_program answers must be A-D`,
        itemIndex: index,
      });
    }

    return errors;
  }

  const blankIds = new Set(item.contentJson.blanks.map((blank) => blank.id));
  const answerIds = new Set(item.answerJson.blanks.map((blank) => blank.id));
  const hasSameIds =
    blankIds.size === answerIds.size && [...blankIds].every((id) => answerIds.has(id));

  if (hasSameIds && item.answerJson.blanks.every((answer) => isAnswerChoice(answer.answer))) {
    return [];
  }

  return [
    {
      code: "ANSWER_SHAPE_INVALID",
      message: `item ${index} completion_program blank answers must match blank ids and use A-D`,
      itemIndex: index,
    },
  ];
}

function getCodeVerificationPayload(item: QuestionBundleItem) {
  if (item.type === "reading_program") {
    return {
      source: item.contentJson.cppCode,
      sampleInputs: item.contentJson.sampleInputs,
      expectedOutputs: item.contentJson.expectedOutputs,
    };
  }

  if (item.type === "completion_program") {
    return {
      source: item.contentJson.fullCode,
      sampleInputs: item.contentJson.sampleInputs,
      expectedOutputs: item.contentJson.expectedOutputs,
    };
  }

  throw new Error(`Unsupported code question type: ${item.type}`);
}

function buildJudgePayload(item: QuestionBundleItem): Record<string, unknown> {
  return {
    type: item.type,
    difficulty: item.difficulty,
    primaryKpCode: item.primaryKpCode,
    auxiliaryKpCodes: item.auxiliaryKpCodes,
    contentJson: item.contentJson,
    answerJson: item.answerJson,
    explanationJson: item.explanationJson,
  };
}

async function callJudgeQuestionBundleItem(
  item: QuestionBundleItem,
  timeoutMs: number,
  options: { lane?: "backup"; allowBackupFallback?: boolean } = {},
) {
  return callScriptLlmScene({
    scene: "judge",
    ...(options.lane ? { lane: options.lane } : {}),
    allowBackupFallback: options.allowBackupFallback ?? false,
    system: "你是严谨的信息学竞赛题目审核员，只输出 JSON。",
    prompt: `请二次校验下面的离线 question bundle 题目，重点检查答案是否自洽且有唯一正确答案。\n\n${JSON.stringify(
      buildJudgePayload(item),
      null,
      2,
    )}\n\n请严格输出 JSON：{"approved":boolean,"issues":string[],"correctedAnswer":string|null,"suggestion":string|null}`,
    maxTokens: 900,
    timeoutMs,
  });
}

function parseJudgeReview(text: string) {
  let jsonText: string;
  try {
    jsonText = extractJsonObject(text);
  } catch (error) {
    throw new Error(
      `Model output does not contain judge JSON: ${text.slice(0, 500)}${
        text.length > 500 ? "..." : ""
      }`,
      { cause: error },
    );
  }

  return judgeReviewSchema.parse(JSON.parse(jsonText));
}

async function judgeQuestionBundleItem(
  item: QuestionBundleItem,
  timeoutMs: number,
  attempts: number,
): Promise<{ approved: boolean; issues: string[]; correctedAnswer?: string | null }> {
  let lastError: unknown;
  const maxAttempts = Math.max(attempts, 1);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await callJudgeQuestionBundleItem(item, timeoutMs);
      const parsed = parseJudgeReview(response.text);
      return {
        approved: parsed.approved,
        issues: parsed.issues,
        correctedAnswer: parsed.correctedAnswer,
      };
    } catch (primaryError) {
      try {
        const fallbackResponse = await callJudgeQuestionBundleItem(item, timeoutMs, {
          lane: "backup",
        });
        const parsed = parseJudgeReview(fallbackResponse.text);
        return {
          approved: parsed.approved,
          issues: parsed.issues,
          correctedAnswer: parsed.correctedAnswer,
        };
      } catch (fallbackError) {
        lastError = new Error(
          `attempt ${attempt}/${maxAttempts}: primary judge output failed and backup judge failed: ${
            primaryError instanceof Error ? primaryError.message : String(primaryError)
          } | ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
          { cause: fallbackError },
        );
      }
    }
  }

  throw lastError ?? new Error("judge check failed");
}

async function checkDuplicateByHash(contentHash: string): Promise<boolean> {
  const existing = await db
    .select({ id: questions.id })
    .from(questions)
    .where(eq(questions.contentHash, contentHash))
    .limit(1);

  return existing.length > 0;
}

async function checkDuplicateByJaccard(item: QuestionBundleItem): Promise<boolean> {
  const similarityText = buildQuestionSimilarityText(item.type, item.contentJson);
  const candidates = await db
    .select({
      id: questions.id,
      contentJson: questions.contentJson,
    })
    .from(questions)
    .innerJoin(knowledgePoints, eq(questions.primaryKpId, knowledgePoints.id))
    .where(
      and(
        eq(questions.type, item.type),
        eq(knowledgePoints.code, item.primaryKpCode),
        ne(questions.status, "archived"),
      ),
    );

  for (const candidate of candidates) {
    const candidateSimilarityText = buildQuestionSimilarityText(item.type, candidate.contentJson);
    if (jaccardSimilarity(similarityText, candidateSimilarityText) >= DUPLICATE_JACCARD_THRESHOLD) {
      return true;
    }
  }

  return false;
}

export async function loadQuestionBundle(bundlePath: string): Promise<LoadedQuestionBundle> {
  const sourcePath = path.resolve(process.cwd(), bundlePath);
  const raw = await readFile(sourcePath, "utf8");
  const parsed = QuestionBundleSchema.parse(JSON.parse(raw));

  return {
    bundle: parsed,
    raw,
    checksum: computeChecksum(raw),
    sourceFilename: path.basename(sourcePath),
    sourcePath,
  };
}

export async function validateQuestionBundle(
  loaded: LoadedQuestionBundle,
  options: QuestionBundleValidationOptions = {},
): Promise<QuestionBundleValidationResult> {
  const errors: ImportError[] = [];
  const rejectedItems = new Set<number>();
  const sandboxVerifiedItemIndexes = new Set<number>();
  let duplicateChecksSkipped = options.skipDuplicateChecks === true;
  let canRunDuplicateChecks = false;
  let judgeChecksSkipped = false;

  if (!options.skipDuplicateChecks) {
    try {
      await checkDbConnection();
      canRunDuplicateChecks = true;
    } catch {
      duplicateChecksSkipped = true;
      if (options.requireDuplicateChecks === true) {
        errors.push({
          code: "DUPLICATE_CHECKS_UNAVAILABLE",
          message: "duplicate checks require a reachable database connection",
        });
        loaded.bundle.items.forEach((_item, index) => rejectedItems.add(index));
      }
    }
  }

  const integrityErrors = verifyBundleIntegrity(loaded.bundle.items, loaded.bundle.meta.integrity);
  for (const error of integrityErrors) {
    errors.push(error);
    if (error.code === "INTEGRITY_MANIFEST_COUNT_MISMATCH") {
      loaded.bundle.items.forEach((_item, index) => rejectedItems.add(index));
    } else if (error.itemIndex !== undefined) {
      rejectedItems.add(error.itemIndex);
    }
  }

  for (const [index, item] of loaded.bundle.items.entries()) {
    if (item.type !== loaded.bundle.meta.questionType) {
      errors.push({
        code: "QUESTION_TYPE_MISMATCH",
        message: `item ${index} question type does not match bundle meta`,
        itemIndex: index,
      });
      rejectedItems.add(index);
    }

    if (!item.examTypes.includes(loaded.bundle.meta.examType)) {
      errors.push({
        code: "EXAM_TYPE_MISMATCH",
        message: `item ${index} is missing bundle exam type ${loaded.bundle.meta.examType}`,
        itemIndex: index,
      });
      rejectedItems.add(index);
    }

    if (item.primaryKpCode !== loaded.bundle.meta.primaryKpCode) {
      errors.push({
        code: "PRIMARY_KP_MISMATCH",
        message: `item ${index} primaryKpCode does not match bundle meta`,
        itemIndex: index,
      });
      rejectedItems.add(index);
    }

    if (item.difficulty !== loaded.bundle.meta.difficulty) {
      errors.push({
        code: "DIFFICULTY_MISMATCH",
        message: `item ${index} difficulty does not match bundle meta`,
        itemIndex: index,
      });
      rejectedItems.add(index);
    }

    const expectedHash = computeContentHash(item.contentJson.stem, summarizeQuestionForHash(item));
    if (expectedHash !== item.contentHash) {
      errors.push({
        code: "CONTENT_HASH_MISMATCH",
        message: `item ${index} contentHash does not match normalized content`,
        itemIndex: index,
      });
      rejectedItems.add(index);
    }

    if (!hasBlueprintCoverage(item)) {
      errors.push({
        code: "BLUEPRINT_MAPPING_MISSING",
        message: `item ${index} is not covered by blueprint quotas for one or more exam types`,
        itemIndex: index,
      });
      rejectedItems.add(index);
    }

    const answerShapeErrors = validateAnswerShape(item, index);
    for (const error of answerShapeErrors) {
      errors.push(error);
      rejectedItems.add(index);
    }

    if (isCodeQuestion(item)) {
      const payload = getCodeVerificationPayload(item);
      if (payload.sampleInputs.length !== payload.expectedOutputs.length) {
        errors.push({
          code: "SAMPLE_OUTPUT_MISMATCH",
          message: `item ${index} sampleInputs and expectedOutputs length mismatch`,
          itemIndex: index,
        });
        rejectedItems.add(index);
      } else if (options.runSandbox === true) {
        const verification = await verifyCpp(payload);
        if (!verification.verified) {
          errors.push({
            code: "SANDBOX_VERIFY_FAILED",
            message: `item ${index} failed sandbox verification`,
            itemIndex: index,
          });
          rejectedItems.add(index);
        } else {
          sandboxVerifiedItemIndexes.add(index);
        }
      } else if (item.sandboxVerified !== true) {
        errors.push({
          code: "SANDBOX_NOT_VERIFIED",
          message: `item ${index} requires sandboxVerified=true before import`,
          itemIndex: index,
        });
        rejectedItems.add(index);
      }
    }

    if (options.runJudge === true && (!options.judgeItemIndexes || options.judgeItemIndexes.has(index))) {
      try {
        const judgeResult = await judgeQuestionBundleItem(
          item,
          options.judgeTimeoutMs ?? 90_000,
          options.judgeAttempts ?? 1,
        );
        if (!judgeResult.approved) {
          errors.push({
            code: "JUDGE_REJECTED",
            message: `item ${index} rejected by judge: ${judgeResult.issues.join("; ")}`,
            itemIndex: index,
          });
          rejectedItems.add(index);
        }
      } catch (error) {
        judgeChecksSkipped = true;
        errors.push({
          code: "JUDGE_CHECK_FAILED",
          message: `item ${index} judge check failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
          itemIndex: index,
        });
        rejectedItems.add(index);
      }
    }

    if (canRunDuplicateChecks) {
      if (await checkDuplicateByHash(item.contentHash)) {
        errors.push({
          code: "DUPLICATE_CONTENT_HASH",
          message: `item ${index} already exists by content hash`,
          itemIndex: index,
        });
        rejectedItems.add(index);
      } else if (await checkDuplicateByJaccard(item)) {
        errors.push({
          code: "DUPLICATE_JACCARD",
          message: `item ${index} is too similar to an existing question`,
          itemIndex: index,
        });
        rejectedItems.add(index);
      }
    }
  }

  const summary = buildImportSummary(
    loaded.bundle.items.length,
    Math.max(loaded.bundle.items.length - rejectedItems.size, 0),
    errors,
  );

  return {
    summary,
    errors,
    duplicateChecksSkipped,
    sandboxVerifiedItemIndexes: [...sandboxVerifiedItemIndexes],
    judgeChecksSkipped,
  };
}

async function resolveKnowledgePointIds(codes: string[]) {
  const uniqueCodes = Array.from(new Set(codes));
  const rows = await db
    .select({ id: knowledgePoints.id, code: knowledgePoints.code })
    .from(knowledgePoints)
    .where(inArray(knowledgePoints.code, uniqueCodes));

  const mapping = new Map(rows.map((row) => [row.code, row.id]));
  const missing = uniqueCodes.filter((code) => !mapping.has(code));

  if (missing.length > 0) {
    throw new Error(`Unknown knowledge point codes: ${missing.join(", ")}`);
  }

  return mapping;
}

export async function importQuestionBundle(
  loaded: LoadedQuestionBundle,
  options: ImportQuestionBundleOptions,
) {
  const validation = await validateQuestionBundle(loaded, {
    runSandbox: false,
    runJudge: false,
    skipDuplicateChecks: options.skipDuplicateChecks,
    requireDuplicateChecks: options.apply && options.skipDuplicateChecks !== true,
  });

  if (validation.errors.length > 0 && options.apply) {
    throw new Error(
      `Bundle validation failed: ${validation.errors.map((error) => error.code).join(", ")}`,
    );
  }

  const summary = options.apply
    ? buildImportSummary(loaded.bundle.items.length, loaded.bundle.items.length, [])
    : validation.summary;

  if (!options.apply && options.persistDryRun === false) {
    return {
      status: "dry_run" as const,
      summary,
      persisted: false,
      duplicateChecksSkipped: validation.duplicateChecksSkipped,
      judgeChecksSkipped: validation.judgeChecksSkipped,
    };
  }

  let dbAvailable = true;
  try {
    await checkDbConnection();
  } catch {
    dbAvailable = false;
  }

  if (!dbAvailable) {
    return {
      status: options.apply ? ("failed" as const) : ("dry_run" as const),
      summary,
      persisted: false,
      duplicateChecksSkipped: validation.duplicateChecksSkipped,
      judgeChecksSkipped: validation.judgeChecksSkipped,
    };
  }

  if (!options.apply) {
    const [batch] = await db
      .insert(importBatches)
      .values({
        bundleType: "question_bundle",
        sourceFilename: loaded.sourceFilename,
        checksum: loaded.checksum,
        status: "dry_run",
        summaryJson: summary,
        importedBy: options.importedBy,
      })
      .returning({
        id: importBatches.id,
        status: importBatches.status,
      });

    return {
      ...batch,
      summary,
      persisted: true,
      duplicateChecksSkipped: validation.duplicateChecksSkipped,
      judgeChecksSkipped: validation.judgeChecksSkipped,
    };
  }

  const kpIdMapping = await resolveKnowledgePointIds(
    loaded.bundle.items.flatMap((item) => [item.primaryKpCode, ...item.auxiliaryKpCodes]),
  );

  const batch = await db.transaction(async (tx) => {
    const [createdBatch] = await tx
      .insert(importBatches)
      .values({
        bundleType: "question_bundle",
        sourceFilename: loaded.sourceFilename,
        checksum: loaded.checksum,
        status: "applied",
        summaryJson: summary,
        importedBy: options.importedBy,
      })
      .returning({
        id: importBatches.id,
        status: importBatches.status,
      });

    if (!createdBatch) {
      throw new Error("question bundle batch insert failed");
    }

    for (const item of loaded.bundle.items) {
      if (isCodeQuestion(item) && item.sandboxVerified !== true) {
        throw new Error("Code questions require sandboxVerified=true before apply import");
      }

      const [createdQuestion] = await tx
        .insert(questions)
        .values({
          type: item.type,
          difficulty: item.difficulty,
          primaryKpId: kpIdMapping.get(item.primaryKpCode)!,
          contentJson: item.contentJson,
          answerJson: item.answerJson,
          explanationJson: item.explanationJson,
          contentHash: item.contentHash,
          status: "draft",
          sandboxVerified: item.sandboxVerified,
          source: item.source,
        })
        .returning({ id: questions.id });

      if (!createdQuestion) {
        throw new Error("question import insert failed");
      }

      await tx.insert(questionExamTypes).values(
        item.examTypes.map((examType) => ({
          questionId: createdQuestion.id,
          examType,
        })),
      );

      await tx.insert(questionKpTags).values([
        {
          questionId: createdQuestion.id,
          kpId: kpIdMapping.get(item.primaryKpCode)!,
          tagRole: "primary",
        },
        ...item.auxiliaryKpCodes.map((kpCode) => ({
          questionId: createdQuestion.id,
          kpId: kpIdMapping.get(kpCode)!,
          tagRole: "secondary",
        })),
      ]);
    }

    return createdBatch;
  });

  return {
    ...batch,
    summary,
    persisted: true,
    duplicateChecksSkipped: validation.duplicateChecksSkipped,
    judgeChecksSkipped: validation.judgeChecksSkipped,
  };
}
