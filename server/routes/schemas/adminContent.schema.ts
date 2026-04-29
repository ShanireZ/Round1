import { z } from "zod";
import {
  PrebuiltPaperBundleSchema,
  QuestionBundleSchema,
} from "../../../scripts/lib/bundleTypes.js";

const QuestionTypeSchema = z.enum(["single_choice", "reading_program", "completion_program"]);
const DifficultySchema = z.enum(["easy", "medium", "hard"]);
const PrebuiltPaperStatusSchema = z.enum(["draft", "published", "archived"]);
const QuestionReviewStatusSchema = z.enum(["pending", "ai_reviewed", "confirmed", "rejected"]);

const AdminQuestionBodyFields = {
  type: QuestionTypeSchema,
  difficulty: DifficultySchema,
  primaryKpId: z.coerce.number().int().positive(),
  auxiliaryKpIds: z.array(z.coerce.number().int().positive()).max(3),
  examTypes: z.array(z.string().min(1)).min(1),
  contentHash: z.string().min(1).max(64),
  contentJson: z.record(z.string(), z.unknown()),
  answerJson: z.record(z.string(), z.unknown()),
  explanationJson: z.record(z.string(), z.unknown()),
  source: z.enum(["ai", "manual", "real_paper"]),
  sandboxVerified: z.boolean(),
};

export const AdminQuestionUpsertBody = z.object({
  ...AdminQuestionBodyFields,
  auxiliaryKpIds: AdminQuestionBodyFields.auxiliaryKpIds.default([]),
  source: AdminQuestionBodyFields.source.default("manual"),
  sandboxVerified: AdminQuestionBodyFields.sandboxVerified.default(false),
});

export const AdminQuestionCreateBody = AdminQuestionUpsertBody;

export const AdminQuestionUpdateBody = z.object(AdminQuestionBodyFields).partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: "至少提供一个可更新字段" },
);

export const AdminQuestionRejectBody = z.object({
  reviewerNotes: z.string().max(2000).optional(),
});

export const QuestionReviewQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: QuestionReviewStatusSchema.optional(),
});

export const AdminSettingUpdateBody = z.object({
  valueJson: z.unknown().refine((value) => value !== undefined, {
    message: "valueJson is required",
  }),
});

export const PrebuiltPaperSlotInputSchema = z.object({
  slotNo: z.coerce.number().int().min(1),
  questionId: z.uuid().or(z.string().min(1)),
  questionType: QuestionTypeSchema,
  primaryKpId: z.coerce.number().int().positive(),
  difficulty: DifficultySchema,
  points: z.coerce.number().int().positive(),
});

const PrebuiltPaperBodyFields = {
  title: z.string().min(1).max(200),
  examType: z.string().min(1),
  difficulty: DifficultySchema,
  blueprintVersion: z.coerce.number().int().positive(),
  metadataJson: z.record(z.string(), z.unknown()),
  slots: z.array(PrebuiltPaperSlotInputSchema).min(1),
};

export const PrebuiltPaperUpsertBody = z.object({
  ...PrebuiltPaperBodyFields,
  metadataJson: PrebuiltPaperBodyFields.metadataJson.default({}),
});

export const PrebuiltPaperCreateBody = PrebuiltPaperUpsertBody;

export const PrebuiltPaperUpdateBody = z.object(PrebuiltPaperBodyFields).partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: "至少提供一个可更新字段" },
);

export const QuestionBundleImportBody = QuestionBundleSchema;

export const PrebuiltPaperBundleImportBody = PrebuiltPaperBundleSchema;

export const PrebuiltPaperQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  examType: z.string().optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  status: PrebuiltPaperStatusSchema.optional(),
});

export const ImportBatchQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  bundleType: z
    .enum(["question_bundle", "prebuilt_paper_bundle", "manual_question_import"])
    .optional(),
  status: z.enum(["dry_run", "processing", "applied", "partial_failed", "failed"]).optional(),
});
