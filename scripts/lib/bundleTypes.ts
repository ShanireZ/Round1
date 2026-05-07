import { createHash } from "node:crypto";
import { z } from "zod";

import { EXAM_TYPES } from "../../config/examTypes.js";

export const BUNDLE_VALIDATOR_VERSION = "round1-bundle-validator/2026-04-26.1";
export const BUNDLE_SCHEMA_VERSION = "2026-04-26.1";
export const CHECKSUM_ALGORITHM = "sha256";
export const OfflineRunIdSchema = z.string().regex(
  /^\d{4}-\d{2}-\d{2}-[a-z0-9-]+-[a-z0-9-]+-[a-z0-9-]+-v\d{2}$/,
  "runId must match YYYY-MM-DD-<pipeline>-<exam-type-slug>-<difficulty>-vNN",
);

export const QuestionTypeSchema = z.enum([
  "single_choice",
  "reading_program",
  "completion_program",
]);

export const DifficultySchema = z.enum(["easy", "medium", "hard"]);

export const QuestionSourceSchema = z.enum(["ai", "manual", "real_paper"]);

export const ExamTypeSchema = z.enum(EXAM_TYPES);

const SingleChoiceContentSchema = z.object({
  stem: z.string().min(1),
  options: z.array(z.string().min(1)).length(4),
});

const ReadingProgramContentSchema = z.object({
  stem: z.string().min(1),
  cppCode: z.string().min(1),
  subQuestions: z
    .array(
      z.object({
        stem: z.string().min(1),
        options: z.array(z.string().min(1)).length(4),
      }),
    )
    .min(1),
  sampleInputs: z.array(z.string()).default([]),
  expectedOutputs: z.array(z.string()).default([]),
});

const CompletionProgramContentSchema = z.object({
  stem: z.string().min(1),
  cppCode: z.string().min(1),
  blanks: z
    .array(
      z.object({
        id: z.string().min(1),
        options: z.array(z.string().min(1)).length(4),
      }),
    )
    .min(1),
  fullCode: z.string().min(1),
  sampleInputs: z.array(z.string()).default([]),
  expectedOutputs: z.array(z.string()).default([]),
});

const SingleChoiceAnswerSchema = z.object({
  answer: z.string().min(1),
});

const ReadingProgramAnswerSchema = z.object({
  subQuestions: z.array(
    z.object({
      answer: z.string().min(1),
    }),
  ),
});

const CompletionProgramAnswerSchema = z.object({
  blanks: z.array(
    z.object({
      id: z.string().min(1),
      answer: z.string().min(1),
    }),
  ),
});

const ExplanationSchema = z.object({
  explanation: z.string().min(1),
});

export const QuestionQualityRubricSchema = z.object({
  reasoningSteps: z.number().int().min(0),
  stateVariables: z.number().int().min(0),
  conceptCount: z.number().int().min(0),
  traceSteps: z.number().int().min(0),
  trapType: z.string().min(1).nullable().default(null),
  difficultyFit: z.enum(["pass", "warning", "fail"]),
  qualityScore: z.number().min(0).max(1),
});

export const QuestionDiversityMetaSchema = z.object({
  policyVersion: z.string().min(1),
  archetypeId: z.string().min(1),
  taskFlavor: z.string().min(1),
  stemPatternFamily: z.string().min(1).optional(),
  codeStructureTags: z.array(z.string().min(1)).default([]),
  containerTags: z.array(z.string().min(1)).default([]),
  normalizedTemplateKey: z.string().min(1).optional(),
  quality: QuestionQualityRubricSchema.optional(),
});

export const BundleIntegritySchema = z.object({
  algorithm: z.literal(CHECKSUM_ALGORITHM),
  generatedAt: z.iso.datetime(),
  itemChecksums: z.array(
    z.object({
      itemIndex: z.number().int().min(0),
      checksum: z.string().length(64),
    }),
  ),
});

export const BundleValidationMetaSchema = z.object({
  validatedAt: z.iso.datetime(),
  validatorVersion: z.string().min(1),
  checksumAlgorithm: z.literal(CHECKSUM_ALGORITHM),
  dbChecksSkipped: z.boolean().optional(),
  duplicateChecksSkipped: z.boolean().optional(),
  judgeChecksSkipped: z.boolean().optional(),
  sandboxVerifiedItemIndexes: z.array(z.number().int().min(0)).optional(),
});

export const QuestionBundleItemSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("single_choice"),
    difficulty: DifficultySchema,
    primaryKpCode: z.string().min(1),
    auxiliaryKpCodes: z.array(z.string().min(1)).max(3).default([]),
    examTypes: z.array(ExamTypeSchema).min(1),
    contentHash: z.string().min(1).max(64),
    sandboxVerified: z.boolean().default(false),
    source: QuestionSourceSchema.default("ai"),
    diversityMeta: QuestionDiversityMetaSchema.optional(),
    contentJson: SingleChoiceContentSchema,
    answerJson: SingleChoiceAnswerSchema,
    explanationJson: ExplanationSchema,
  }),
  z.object({
    type: z.literal("reading_program"),
    difficulty: DifficultySchema,
    primaryKpCode: z.string().min(1),
    auxiliaryKpCodes: z.array(z.string().min(1)).max(3).default([]),
    examTypes: z.array(ExamTypeSchema).min(1),
    contentHash: z.string().min(1).max(64),
    sandboxVerified: z.boolean().default(false),
    source: QuestionSourceSchema.default("ai"),
    diversityMeta: QuestionDiversityMetaSchema.optional(),
    contentJson: ReadingProgramContentSchema,
    answerJson: ReadingProgramAnswerSchema,
    explanationJson: ExplanationSchema,
  }),
  z.object({
    type: z.literal("completion_program"),
    difficulty: DifficultySchema,
    primaryKpCode: z.string().min(1),
    auxiliaryKpCodes: z.array(z.string().min(1)).max(3).default([]),
    examTypes: z.array(ExamTypeSchema).min(1),
    contentHash: z.string().min(1).max(64),
    sandboxVerified: z.boolean().default(false),
    source: QuestionSourceSchema.default("ai"),
    diversityMeta: QuestionDiversityMetaSchema.optional(),
    contentJson: CompletionProgramContentSchema,
    answerJson: CompletionProgramAnswerSchema,
    explanationJson: ExplanationSchema,
  }),
]);

export const QuestionBundleMetaSchema = z.object({
  bundleType: z.literal("question_bundle"),
  schemaVersion: z.literal(BUNDLE_SCHEMA_VERSION),
  runId: OfflineRunIdSchema,
  createdAt: z.iso.datetime(),
  generatedAt: z.iso.datetime(),
  provider: z.string().min(1),
  model: z.string().min(1),
  promptHash: z.string().length(64),
  sourceBatchId: z.string().min(1),
  sourceBatchIds: z.array(z.string().min(1)).min(1),
  sourceTimestamp: z.iso.datetime(),
  examType: ExamTypeSchema,
  questionType: QuestionTypeSchema,
  primaryKpCode: z.string().min(1),
  difficulty: DifficultySchema,
  requestedCount: z.number().int().positive(),
  validation: BundleValidationMetaSchema.optional(),
  integrity: BundleIntegritySchema.optional(),
});

export const ImportErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  itemIndex: z.number().int().min(0).optional(),
});

export const ImportSummarySchema = z.object({
  totalCount: z.number().int().min(0),
  importedCount: z.number().int().min(0),
  rejectedCount: z.number().int().min(0),
  errors: z.array(ImportErrorSchema),
});

export const QuestionBundleSchema = z.object({
  meta: QuestionBundleMetaSchema,
  items: z.array(QuestionBundleItemSchema).min(1),
});

export const PrebuiltPaperSlotSchema = z.object({
  slotNo: z.number().int().min(1),
  questionId: z.uuid(),
  questionType: QuestionTypeSchema,
  primaryKpId: z.number().int().positive(),
  difficulty: DifficultySchema,
  points: z.number().int().positive(),
});

export const PrebuiltPaperBundleItemSchema = z.object({
  title: z.string().min(1).max(200),
  examType: ExamTypeSchema,
  difficulty: DifficultySchema,
  blueprintVersion: z.number().int().positive(),
  metadataJson: z.record(z.string(), z.unknown()).default({}),
  slots: z.array(PrebuiltPaperSlotSchema).min(1),
});

export const PrebuiltPaperBundleMetaSchema = z.object({
  bundleType: z.literal("prebuilt_paper_bundle"),
  schemaVersion: z.literal(BUNDLE_SCHEMA_VERSION),
  runId: OfflineRunIdSchema,
  createdAt: z.iso.datetime(),
  builtAt: z.iso.datetime(),
  provider: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  promptHash: z.string().length(64).optional(),
  sourceBatchId: z.string().min(1),
  sourceBatchIds: z.array(z.string().min(1)).min(1),
  sourceTimestamp: z.iso.datetime(),
  examType: ExamTypeSchema,
  difficulty: DifficultySchema,
  requestedCount: z.number().int().positive(),
  blueprintVersion: z.number().int().positive(),
  overlapScore: z.number().min(0).max(1).optional(),
  validation: BundleValidationMetaSchema.optional(),
  integrity: BundleIntegritySchema.optional(),
});

export const PrebuiltPaperBundleSchema = z.object({
  meta: PrebuiltPaperBundleMetaSchema,
  items: z.array(PrebuiltPaperBundleItemSchema).min(1),
});

export type QuestionType = z.infer<typeof QuestionTypeSchema>;
export type Difficulty = z.infer<typeof DifficultySchema>;
export type ExamType = z.infer<typeof ExamTypeSchema>;
export type QuestionQualityRubric = z.infer<typeof QuestionQualityRubricSchema>;
export type QuestionDiversityMeta = z.infer<typeof QuestionDiversityMetaSchema>;
export type QuestionBundleItem = z.infer<typeof QuestionBundleItemSchema>;
export type QuestionBundleMeta = z.infer<typeof QuestionBundleMetaSchema>;
export type QuestionBundle = z.infer<typeof QuestionBundleSchema>;
export type BundleIntegrity = z.infer<typeof BundleIntegritySchema>;
export type BundleValidationMeta = z.infer<typeof BundleValidationMetaSchema>;
export type PrebuiltPaperSlot = z.infer<typeof PrebuiltPaperSlotSchema>;
export type PrebuiltPaperBundleItem = z.infer<typeof PrebuiltPaperBundleItemSchema>;
export type PrebuiltPaperBundleMeta = z.infer<typeof PrebuiltPaperBundleMetaSchema>;
export type PrebuiltPaperBundle = z.infer<typeof PrebuiltPaperBundleSchema>;
export type ImportError = z.infer<typeof ImportErrorSchema>;
export type ImportSummary = z.infer<typeof ImportSummarySchema>;

export function computeChecksum(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

export function computeJsonChecksum(value: unknown): string {
  return computeChecksum(stableStringify(value));
}

export function buildBundleIntegrity(items: readonly unknown[]): BundleIntegrity {
  return {
    algorithm: CHECKSUM_ALGORITHM,
    generatedAt: new Date().toISOString(),
    itemChecksums: items.map((item, itemIndex) => ({
      itemIndex,
      checksum: computeJsonChecksum(item),
    })),
  };
}

export function verifyBundleIntegrity(
  items: readonly unknown[],
  integrity: BundleIntegrity | undefined,
): ImportError[] {
  if (!integrity) {
    return [];
  }

  const errors: ImportError[] = [];
  const expectedByIndex = new Map(
    integrity.itemChecksums.map((entry) => [entry.itemIndex, entry.checksum]),
  );

  if (integrity.itemChecksums.length !== items.length) {
    errors.push({
      code: "INTEGRITY_MANIFEST_COUNT_MISMATCH",
      message: `integrity manifest has ${integrity.itemChecksums.length} item checksums, expected ${items.length}`,
    });
  }

  for (const [itemIndex, item] of items.entries()) {
    const expected = expectedByIndex.get(itemIndex);
    if (!expected) {
      errors.push({
        code: "INTEGRITY_ITEM_CHECKSUM_MISSING",
        message: `integrity manifest is missing item ${itemIndex}`,
        itemIndex,
      });
      continue;
    }

    const actual = computeJsonChecksum(item);
    if (actual !== expected) {
      errors.push({
        code: "INTEGRITY_ITEM_CHECKSUM_MISMATCH",
        message: `item ${itemIndex} checksum mismatch`,
        itemIndex,
      });
    }
  }

  return errors;
}

export function buildValidationMetadata(
  details: Omit<
    Partial<BundleValidationMeta>,
    "validatedAt" | "validatorVersion" | "checksumAlgorithm"
  >,
): BundleValidationMeta {
  return {
    validatedAt: new Date().toISOString(),
    validatorVersion: BUNDLE_VALIDATOR_VERSION,
    checksumAlgorithm: CHECKSUM_ALGORITHM,
    ...details,
  };
}

export function buildImportSummary(
  totalCount: number,
  importedCount: number,
  errors: ImportError[] = [],
): ImportSummary {
  return {
    totalCount,
    importedCount,
    rejectedCount: Math.max(totalCount - importedCount, 0),
    errors,
  };
}
