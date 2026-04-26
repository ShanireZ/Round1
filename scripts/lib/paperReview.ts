import { z } from "zod";
import { isBlank } from "./paperFiles";
import type { PaperQuestion } from "./paperFiles";

const explanationTextSchema = z
  .union([
    z.string(),
    z.object({
      explanation: z.string().optional(),
      text: z.string().optional(),
    }),
  ])
  .transform((value, ctx): string => {
    if (typeof value === "string") {
      return value;
    }

    if (typeof value.explanation === "string") {
      return value.explanation;
    }
    if (typeof value.text === "string") {
      return value.text;
    }

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Explanation object does not contain text",
    });
    return z.NEVER;
  });

const reviewQuestionTypeSchema = z
  .string()
  .transform((value, ctx): "single_choice" | "reading_program" | "completion_program" => {
    const normalized = value.trim().toLowerCase();
    if (
      normalized === "single_choice" ||
      normalized === "single-choice" ||
      normalized === "single choice" ||
      normalized === "choice" ||
      normalized === "single" ||
      normalized === "judgment" ||
      normalized === "judgement" ||
      normalized === "judge" ||
      normalized === "true_false" ||
      normalized === "true-false" ||
      normalized === "true false" ||
      normalized === "true/false" ||
      normalized === "boolean" ||
      normalized === "bool" ||
      normalized === "判断" ||
      normalized === "判断题"
    ) {
      return "single_choice";
    }
    if (
      normalized === "reading_program" ||
      normalized === "reading-program" ||
      normalized === "reading program" ||
      normalized === "reading"
    ) {
      return "reading_program";
    }
    if (
      normalized === "completion_program" ||
      normalized === "completion-program" ||
      normalized === "completion program" ||
      normalized === "completion" ||
      normalized === "blank_filling" ||
      normalized === "blank-filling" ||
      normalized === "blank filling" ||
      normalized === "fill_blank" ||
      normalized === "fill-blank" ||
      normalized === "fill in the blank"
    ) {
      return "completion_program";
    }

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Unsupported questionType value: ${value}`,
    });
    return z.NEVER;
  });

const reviewConfidenceSchema = z
  .union([z.string(), z.number()])
  .transform((value, ctx): "high" | "medium" | "low" => {
    if (typeof value === "number") {
      if (value >= 0.85) {
        return "high";
      }
      if (value >= 0.6) {
        return "medium";
      }
      return "low";
    }

    const normalized = value.trim().toLowerCase();
    if (normalized === "high" || normalized === "medium" || normalized === "low") {
      return normalized;
    }
    if (normalized.includes("high") || normalized.includes("strong")) {
      return "high";
    }
    if (normalized.includes("medium") || normalized.includes("moderate")) {
      return "medium";
    }
    if (normalized.includes("low") || normalized.includes("weak")) {
      return "low";
    }

    const numeric = Number(normalized);
    if (!Number.isNaN(numeric)) {
      if (numeric >= 0.85) {
        return "high";
      }
      if (numeric >= 0.6) {
        return "medium";
      }
      return "low";
    }

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Unsupported confidence value: ${value}`,
    });
    return z.NEVER;
  });

const reviewDifficultySchema = z
  .union([z.string(), z.number()])
  .transform((value, ctx): "easy" | "medium" | "hard" => {
    if (typeof value === "number") {
      if (value <= 1) {
        return "easy";
      }
      if (value >= 3) {
        return "hard";
      }
      return "medium";
    }

    const normalized = value.trim().toLowerCase();
    if (normalized === "easy" || normalized === "medium" || normalized === "hard") {
      return normalized;
    }
    if (
      normalized.includes("easy") ||
      normalized.includes("simple") ||
      normalized.includes("basic") ||
      normalized.includes("beginner")
    ) {
      return "easy";
    }
    if (
      normalized.includes("medium") ||
      normalized.includes("normal") ||
      normalized.includes("moderate") ||
      normalized.includes("intermediate")
    ) {
      return "medium";
    }
    if (
      normalized.includes("hard") ||
      normalized.includes("difficult") ||
      normalized.includes("challenging") ||
      normalized.includes("advanced")
    ) {
      return "hard";
    }

    const numeric = Number(normalized);
    if (!Number.isNaN(numeric)) {
      if (numeric <= 1) {
        return "easy";
      }
      if (numeric >= 3) {
        return "hard";
      }
      return "medium";
    }

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Unsupported difficulty value: ${value}`,
    });
    return z.NEVER;
  });

const reviewStatusSchema = z
  .union([z.string(), z.null()])
  .transform((value): "ok" | "manual_check" => {
    if (value === null) {
      return "ok";
    }

    const normalized = value.trim().toLowerCase();
    if (
      normalized.includes("manual") ||
      normalized.includes("check") ||
      normalized.includes("review") ||
      normalized.includes("issue") ||
      normalized.includes("problem") ||
      normalized.includes("wrong") ||
      normalized.includes("mismatch") ||
      normalized.includes("missing") ||
      normalized.includes("incomplete") ||
      normalized.includes("truncated")
    ) {
      return "manual_check";
    }

    if (
      normalized === "ok" ||
      normalized === "none" ||
      normalized === "na" ||
      normalized === "n/a" ||
      normalized === "normal" ||
      normalized === "not_applicable" ||
      normalized === "not-applicable" ||
      normalized === "clear" ||
      normalized === ""
    ) {
      return "ok";
    }
    return "ok";
  });

export const reviewedQuestionSchema = z.object({
  questionType: reviewQuestionTypeSchema,
  difficulty: reviewDifficultySchema,
  primaryKpCode: z.string().min(1),
  auxiliaryKpCodes: z.array(z.string().min(1)).default([]),
  explanation: explanationTextSchema.optional(),
  subExplanations: z.array(explanationTextSchema).optional(),
  blankExplanations: z.array(explanationTextSchema).optional(),
  confidence: reviewConfidenceSchema,
  stemStatus: reviewStatusSchema,
  codeStatus: reviewStatusSchema,
  notes: z.array(z.string()).default([]),
});

export const reviewedChunkSchema = z.object({
  questions: z.array(reviewedQuestionSchema),
});

export type ReviewedQuestion = z.infer<typeof reviewedQuestionSchema>;

export interface ReviewedQuestionDecision {
  ok: boolean;
  reason?: string;
  warnings: string[];
}

export interface ReviewedChunkEvaluation {
  applied: Array<{ questionIndex: number; reviewed: ReviewedQuestion }>;
  skipped: Array<{ questionIndex: number; reason: string }>;
  warnings: Array<{ questionIndex: number; reason: string }>;
}

export function validateReviewedQuestion(
  question: PaperQuestion,
  reviewed: ReviewedQuestion,
  validKnowledgePointCodes: Set<string>,
  options: { metadataOnly?: boolean; allowStatusWarningsInMetadata?: boolean } = {},
): ReviewedQuestionDecision {
  const reasons: string[] = [];
  const warnings: string[] = [];

  if (reviewed.questionType !== question.questionType) {
    reasons.push("questionType changed");
  }

  if (reviewed.stemStatus !== "ok") {
    if (options.metadataOnly && options.allowStatusWarningsInMetadata) {
      warnings.push("stem needs manual check");
    } else {
      reasons.push("stem needs manual check");
    }
  }

  if (reviewed.codeStatus !== "ok") {
    if (options.metadataOnly && options.allowStatusWarningsInMetadata) {
      warnings.push("code needs manual check");
    } else {
      reasons.push("code needs manual check");
    }
  }

  if (reviewed.confidence === "low") {
    reasons.push("low confidence");
  }

  if (!validKnowledgePointCodes.has(reviewed.primaryKpCode)) {
    reasons.push("invalid primaryKpCode");
  }

  if (reviewed.auxiliaryKpCodes.some((code) => !validKnowledgePointCodes.has(code))) {
    reasons.push("invalid auxiliaryKpCodes");
  }

  if (reviewed.auxiliaryKpCodes.includes(reviewed.primaryKpCode)) {
    reasons.push("primaryKpCode repeated in auxiliaryKpCodes");
  }

  if (options.metadataOnly) {
    if (reasons.length > 0) {
      return { ok: false, reason: reasons.join("; "), warnings };
    }

    return { ok: true, warnings };
  }

  if (question.questionType === "single_choice") {
    if (isBlank(reviewed.explanation)) {
      reasons.push("missing explanation");
    }
  } else if (question.questionType === "reading_program") {
    if (question.subQuestions?.length) {
      if (
        !reviewed.subExplanations ||
        reviewed.subExplanations.length !== question.subQuestions.length
      ) {
        reasons.push("subExplanations length mismatch");
      } else if (reviewed.subExplanations.some((entry) => isBlank(entry))) {
        reasons.push("subExplanations contains blank item");
      }
    } else if (isBlank(reviewed.explanation)) {
      reasons.push("missing explanation");
    }
  } else if (question.blanks?.length) {
    if (
      !reviewed.blankExplanations ||
      reviewed.blankExplanations.length !== question.blanks.length
    ) {
      reasons.push("blankExplanations length mismatch");
    } else if (reviewed.blankExplanations.some((entry) => isBlank(entry))) {
      reasons.push("blankExplanations contains blank item");
    }
  } else if (isBlank(reviewed.explanation)) {
    reasons.push("missing explanation");
  }

  if (reasons.length > 0) {
    return { ok: false, reason: reasons.join("; "), warnings };
  }

  return { ok: true, warnings };
}

export function evaluateReviewedChunk(params: {
  startIndex: number;
  chunk: PaperQuestion[];
  reviewed: z.infer<typeof reviewedChunkSchema>;
  validKnowledgePointCodes: Set<string>;
  metadataOnly?: boolean;
  allowStatusWarningsInMetadata?: boolean;
}): ReviewedChunkEvaluation {
  if (params.reviewed.questions.length !== params.chunk.length) {
    throw new Error(
      `Chunk response length mismatch: expected ${params.chunk.length}, got ${params.reviewed.questions.length}`,
    );
  }

  const applied: Array<{ questionIndex: number; reviewed: ReviewedQuestion }> = [];
  const skipped: Array<{ questionIndex: number; reason: string }> = [];
  const warnings: Array<{ questionIndex: number; reason: string }> = [];

  params.chunk.forEach((question, offset) => {
    const reviewedQuestion = params.reviewed.questions[offset];
    if (!question || !reviewedQuestion) {
      throw new Error(`Missing question data at offset ${offset}`);
    }

    const decision = validateReviewedQuestion(
      question,
      reviewedQuestion,
      params.validKnowledgePointCodes,
      {
        metadataOnly: params.metadataOnly,
        allowStatusWarningsInMetadata: params.allowStatusWarningsInMetadata,
      },
    );
    if (!decision.ok) {
      skipped.push({
        questionIndex: params.startIndex + offset + 1,
        reason: decision.reason ?? "validation rejected without explicit reason",
      });
      return;
    }

    if (decision.warnings.length > 0) {
      warnings.push({
        questionIndex: params.startIndex + offset + 1,
        reason: decision.warnings.join("; "),
      });
    }

    applied.push({
      questionIndex: params.startIndex + offset + 1,
      reviewed: reviewedQuestion,
    });
  });

  return { applied, skipped, warnings };
}

export function applyReviewedQuestion(
  question: PaperQuestion,
  reviewed: ReviewedQuestion,
  options: { metadataOnly?: boolean } = {},
): void {
  question.difficulty = reviewed.difficulty;
  question.primaryKpCode = reviewed.primaryKpCode;
  question.auxiliaryKpCodes = [...new Set(reviewed.auxiliaryKpCodes)].filter(
    (code) => code !== reviewed.primaryKpCode,
  );

  if (options.metadataOnly) {
    return;
  }

  if (question.questionType === "single_choice") {
    question.explanation = reviewed.explanation?.trim();
    return;
  }

  if (question.questionType === "reading_program") {
    if (question.subQuestions?.length && reviewed.subExplanations) {
      question.subQuestions.forEach((entry, index) => {
        entry.explanation = reviewed.subExplanations?.[index]?.trim();
      });
      return;
    }

    question.explanation = reviewed.explanation?.trim();
    return;
  }

  if (question.blanks?.length && reviewed.blankExplanations) {
    question.blanks.forEach((entry, index) => {
      entry.explanation = reviewed.blankExplanations?.[index]?.trim();
    });
    return;
  }

  question.explanation = reviewed.explanation?.trim();
}
