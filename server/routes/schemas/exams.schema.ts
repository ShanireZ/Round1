import { z } from "zod";

export const DifficultySchema = z.enum(["easy", "medium", "hard"]);

export const CreateExamDraftBodySchema = z
  .object({
    examType: z.string().trim().min(1),
    difficulty: DifficultySchema,
    assignmentId: z.string().uuid().optional(),
  })
  .strict();

export const StartAttemptBodySchema = z.object({}).strict();

export const AutosaveAnswerPatchSchema = z
  .object({
    slotNo: z.coerce.number().int().min(1).max(500),
    subKey: z.string().trim().min(1).max(64),
    value: z.string().max(20_000),
    updatedAt: z.string().datetime().optional(),
  })
  .strict();

export const AutosaveAttemptBodySchema = z
  .object({
    patches: z.array(AutosaveAnswerPatchSchema).min(1).max(50),
  })
  .strict();

export const SubmitAttemptBodySchema = z
  .object({
    patches: z.array(AutosaveAnswerPatchSchema).min(1).max(50).optional(),
  })
  .strict();
