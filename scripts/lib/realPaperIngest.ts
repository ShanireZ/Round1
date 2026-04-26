import fs from "node:fs";
import path from "node:path";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "../../server/db.js";
import { knowledgePoints } from "../../server/db/schema/knowledgePoints.js";
import { questionExamTypes } from "../../server/db/schema/questionExamTypes.js";
import { questionKpTags } from "../../server/db/schema/questionKpTags.js";
import { questionReviews } from "../../server/db/schema/questionReviews.js";
import { questions } from "../../server/db/schema/questions.js";
import { computeContentHash, isDuplicateByHash } from "../../server/services/deduplicationService.js";
import { judgeRealPaperQuestion } from "./realPaperAiReview.js";

export const realPaperQuestionSchema = z.object({
  questionType: z.enum(["single_choice", "reading_program", "completion_program"]),
  stem: z.string(),
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

export const realPaperSchema = z.object({
  examType: z.string(),
  year: z.number(),
  source: z.string(),
  questions: z.array(realPaperQuestionSchema),
});

export type RealPaperQuestion = z.infer<typeof realPaperQuestionSchema>;

export interface RealPaperIngestOptions {
  dir: string;
  skipAiReview?: boolean;
  timeoutMs?: number;
  limit?: number;
  logger?: Pick<Console, "log" | "error">;
}

export interface RealPaperIngestSummary {
  filesFound: number;
  imported: number;
  skipped: number;
  errors: number;
  pendingCreated: number;
  aiReviewed: number;
  promotedToReviewed: number;
}

function buildAnswerJson(question: RealPaperQuestion) {
  if (question.questionType === "single_choice") {
    return { answer: question.answer };
  }

  if (question.questionType === "reading_program") {
    return { subAnswers: question.subQuestions?.map((entry) => entry.answer) ?? [] };
  }

  return {
    blanks: question.blanks?.map((entry) => ({ id: entry.id, answer: entry.answer })) ?? [],
  };
}

function buildExplanationJson(question: RealPaperQuestion) {
  if (question.questionType === "single_choice") {
    return { explanation: question.explanation ?? "" };
  }

  if (question.questionType === "reading_program") {
    return { subExplanations: question.subQuestions?.map((entry) => entry.explanation) ?? [] };
  }

  return {
    blankExplanations:
      question.blanks?.map((entry) => ({ id: entry.id, explanation: entry.explanation })) ?? [],
  };
}

function buildDedupSource(question: RealPaperQuestion): string {
  if (question.options && question.options.length > 0) {
    return question.options.join("");
  }

  return question.cppCode ?? question.fullCode ?? "";
}

export async function ingestRealPapers(options: RealPaperIngestOptions) {
  const logger = options.logger ?? console;
  const timeoutMs = options.timeoutMs ?? 60_000;
  const resolvedDir = path.resolve(options.dir);

  if (!fs.existsSync(resolvedDir)) {
    throw new Error(`Directory not found: ${resolvedDir}`);
  }

  const files = fs.readdirSync(resolvedDir).filter((file) => file.endsWith(".json"));
  logger.log(`📂 Found ${files.length} paper files in ${resolvedDir}\n`);

  const summary: RealPaperIngestSummary = {
    filesFound: files.length,
    imported: 0,
    skipped: 0,
    errors: 0,
    pendingCreated: 0,
    aiReviewed: 0,
    promotedToReviewed: 0,
  };

  let processedQuestions = 0;

  for (const file of files) {
    if (options.limit !== undefined && processedQuestions >= options.limit) {
      break;
    }

    const filePath = path.join(resolvedDir, file);
    logger.log(`📄 Processing ${file}...`);

    try {
      const rawData = fs.readFileSync(filePath, "utf-8");
      const parsed = realPaperSchema.parse(JSON.parse(rawData));

      for (let index = 0; index < parsed.questions.length; index += 1) {
        if (options.limit !== undefined && processedQuestions >= options.limit) {
          break;
        }

        const question = parsed.questions[index];
        if (!question) {
          continue;
        }

        processedQuestions += 1;

        try {
          const kpRows = await db
            .select({ id: knowledgePoints.id })
            .from(knowledgePoints)
            .where(eq(knowledgePoints.code, question.primaryKpCode))
            .limit(1);

          if (kpRows.length === 0) {
            logger.log(
              `  ⚠ Q${index + 1}: Knowledge point ${question.primaryKpCode} not found, skipping`,
            );
            summary.errors += 1;
            continue;
          }

          const contentHash = computeContentHash(question.stem, buildDedupSource(question));
          if (await isDuplicateByHash(contentHash)) {
            logger.log(`  ⏭ Q${index + 1}: Duplicate (hash), skipping`);
            summary.skipped += 1;
            continue;
          }

          const [inserted] = await db
            .insert(questions)
            .values({
              type: question.questionType,
              difficulty: question.difficulty,
              primaryKpId: kpRows[0]!.id,
              contentJson: question,
              answerJson: buildAnswerJson(question),
              explanationJson: buildExplanationJson(question),
              contentHash,
              status: "draft",
              sandboxVerified: false,
              source: "real_paper",
            })
            .returning({ id: questions.id });

          if (!inserted) {
            throw new Error("question insert failed");
          }

          await db.insert(questionExamTypes).values({
            questionId: inserted.id,
            examType: parsed.examType,
          });

          await db.insert(questionKpTags).values({
            questionId: inserted.id,
            kpId: kpRows[0]!.id,
            tagRole: "primary",
          });

          const [reviewRecord] = await db
            .insert(questionReviews)
            .values({
              questionId: inserted.id,
              reviewStatus: "pending",
            })
            .returning({ id: questionReviews.id });

          if (!reviewRecord) {
            throw new Error("question review insert failed");
          }

          summary.pendingCreated += 1;

          if (!options.skipAiReview) {
            try {
              const aiReview = await judgeRealPaperQuestion({
                question,
                timeoutMs,
              });

              await db.transaction(async (tx) => {
                await tx
                  .update(questionReviews)
                  .set({
                    reviewStatus: aiReview.reviewStatus,
                    aiConfidence: aiReview.aiConfidence,
                    officialAnswerDiff: aiReview.officialAnswerDiff,
                    reviewerNotes: aiReview.reviewerNotes,
                    reviewedAt: new Date(),
                  })
                  .where(eq(questionReviews.id, reviewRecord.id));

                if (aiReview.questionStatus === "reviewed") {
                  await tx
                    .update(questions)
                    .set({
                      status: "reviewed",
                      updatedAt: new Date(),
                    })
                    .where(eq(questions.id, inserted.id));
                }
              });

              summary.aiReviewed += 1;
              if (aiReview.questionStatus === "reviewed") {
                summary.promotedToReviewed += 1;
              }

              logger.log(
                `  🧠 Q${index + 1}: AI reviewed (${aiReview.answersMatch ? "match" : "diff"})`,
              );
            } catch (reviewErr) {
              const message = reviewErr instanceof Error ? reviewErr.message : String(reviewErr);

              await db
                .update(questionReviews)
                .set({
                  reviewerNotes: `AI review failed: ${message}`,
                })
                .where(eq(questionReviews.id, reviewRecord.id));

              logger.log(`  ⚠ Q${index + 1}: AI review failed, kept pending (${message})`);
              summary.errors += 1;
            }
          }

          logger.log(
            `  ✅ Q${index + 1}: ${question.questionType} — ${question.stem.slice(0, 40)}...`,
          );
          summary.imported += 1;
        } catch (err) {
          logger.error(`  ❌ Q${index + 1}: ${err instanceof Error ? err.message : err}`);
          summary.errors += 1;
        }
      }
    } catch (err) {
      logger.error(`  ❌ File error: ${err instanceof Error ? err.message : err}`);
      summary.errors += 1;
    }
  }

  return summary;
}
