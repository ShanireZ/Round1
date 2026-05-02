import { z } from "zod";
import { eq } from "drizzle-orm";

import { db } from "../../server/db.js";
import { importBatches } from "../../server/db/schema/importBatches.js";
import { questionExamTypes } from "../../server/db/schema/questionExamTypes.js";
import { questionKpTags } from "../../server/db/schema/questionKpTags.js";
import { questions } from "../../server/db/schema/questions.js";
import {
  computeContentHash,
  findJaccardDuplicate,
  isDuplicateByHash,
} from "../../server/services/deduplicationService.js";

const manualQuestionSchema = z.object({
  stem: z.string().min(5),
  options: z.array(z.string()).optional(),
  answer: z.string().optional(),
  cppCode: z.string().optional(),
  subQuestions: z
    .array(
      z.object({
        stem: z.string(),
        options: z.array(z.string()),
        answer: z.string(),
        explanation: z.string(),
      }),
    )
    .optional(),
  blanks: z
    .array(
      z.object({
        id: z.string(),
        options: z.array(z.string()),
        answer: z.string(),
        explanation: z.string(),
      }),
    )
    .optional(),
  fullCode: z.string().optional(),
  sampleInputs: z.array(z.string()).optional(),
  expectedOutputs: z.array(z.string()).optional(),
  explanation: z.string().optional(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  primaryKpCode: z.string(),
  auxiliaryKpCodes: z.array(z.string()).default([]),
});

export type ManualQuestion = z.infer<typeof manualQuestionSchema>;

export interface ImportResult {
  batchId: string;
  batchStatus: "applied" | "partial_failed" | "failed";
  total: number;
  imported: number;
  rejected: { index: number; reason: string }[];
}

export async function importManualQuestions(params: {
  sourceFilename: string;
  checksum: string;
  importedBy?: string;
  questionType: string;
  examType: string;
  primaryKpId: number;
  questionsData: unknown[];
}): Promise<ImportResult> {
  const initialSummary = buildManualImportSummary(params, {
    total: params.questionsData.length,
    imported: 0,
    rejected: [],
  });

  const [createdBatch] = await db
    .insert(importBatches)
    .values({
      bundleType: "manual_question_import",
      sourceFilename: params.sourceFilename,
      checksum: params.checksum,
      status: "processing",
      summaryJson: initialSummary,
      importedBy: params.importedBy,
    })
    .returning({
      id: importBatches.id,
      status: importBatches.status,
    });

  if (!createdBatch) {
    throw new Error("manual import batch insert failed");
  }

  const result: ImportResult = {
    batchId: createdBatch.id,
    batchStatus: "failed",
    total: params.questionsData.length,
    imported: 0,
    rejected: [],
  };

  try {
    for (let i = 0; i < params.questionsData.length; i++) {
      try {
        const parsed = manualQuestionSchema.parse(params.questionsData[i]);

        const optionsStr = parsed.options?.join("") ?? parsed.cppCode ?? "";
        const contentHash = computeContentHash(parsed.stem, optionsStr);
        const contentJson = parsed;

        if (await isDuplicateByHash(contentHash)) {
          result.rejected.push({ index: i, reason: "duplicate_hash" });
          continue;
        }

        const jaccardDup = await findJaccardDuplicate({
          contentJson,
          questionType: params.questionType,
          primaryKpId: params.primaryKpId,
        });

        if (jaccardDup) {
          result.rejected.push({ index: i, reason: `jaccard_duplicate_of:${jaccardDup}` });
          continue;
        }

        const answerJson = buildAnswerJson(params.questionType, parsed);
        const explanationJson = buildExplanationJson(params.questionType, parsed);
        const needsSandbox = params.questionType !== "single_choice";

        const [inserted] = await db
          .insert(questions)
          .values({
            type: params.questionType,
            difficulty: parsed.difficulty,
            primaryKpId: params.primaryKpId,
            contentJson,
            answerJson,
            explanationJson,
            contentHash,
            status: needsSandbox ? "draft" : "reviewed",
            sandboxVerified: false,
            source: "manual",
          })
          .returning({ id: questions.id });

        if (!inserted) {
          result.rejected.push({ index: i, reason: "insert_failed" });
          continue;
        }

        await db.insert(questionExamTypes).values({
          questionId: inserted.id,
          examType: params.examType,
        });

        await db.insert(questionKpTags).values({
          questionId: inserted.id,
          kpId: params.primaryKpId,
          tagRole: "primary",
        });

        result.imported++;
      } catch (err) {
        result.rejected.push({
          index: i,
          reason: err instanceof Error ? err.message : "unknown_error",
        });
      }
    }

    const finalStatus =
      result.rejected.length === 0 ? "applied" : result.imported > 0 ? "partial_failed" : "failed";

    result.batchStatus = finalStatus;

    await db
      .update(importBatches)
      .set({
        status: finalStatus,
        summaryJson: buildManualImportSummary(params, result),
        updatedAt: new Date(),
      })
      .where(eq(importBatches.id, result.batchId));

    return result;
  } catch (error) {
    await db
      .update(importBatches)
      .set({
        status: "failed",
        summaryJson: buildManualImportSummary(params, result),
        updatedAt: new Date(),
      })
      .where(eq(importBatches.id, result.batchId));

    throw error;
  }
}

function buildManualImportSummary(
  params: Pick<
    Parameters<typeof importManualQuestions>[0],
    "questionType" | "examType" | "primaryKpId" | "sourceFilename"
  >,
  result: Pick<ImportResult, "total" | "imported" | "rejected">,
) {
  return {
    sourceFilename: params.sourceFilename,
    questionType: params.questionType,
    examType: params.examType,
    primaryKpId: params.primaryKpId,
    total: result.total,
    imported: result.imported,
    rejectedCount: result.rejected.length,
    rejected: result.rejected,
  };
}

function buildAnswerJson(questionType: string, parsed: ManualQuestion) {
  if (questionType === "single_choice") {
    return { answer: parsed.answer };
  }

  if (questionType === "reading_program") {
    return { subAnswers: parsed.subQuestions?.map((question) => question.answer) ?? [] };
  }

  return { blanks: parsed.blanks?.map((blank) => ({ id: blank.id, answer: blank.answer })) ?? [] };
}

function buildExplanationJson(questionType: string, parsed: ManualQuestion) {
  if (questionType === "single_choice") {
    return { explanation: parsed.explanation ?? "" };
  }

  if (questionType === "reading_program") {
    return {
      subExplanations: parsed.subQuestions?.map((question) => question.explanation) ?? [],
    };
  }

  return {
    blankExplanations:
      parsed.blanks?.map((blank) => ({ id: blank.id, explanation: blank.explanation })) ?? [],
  };
}
