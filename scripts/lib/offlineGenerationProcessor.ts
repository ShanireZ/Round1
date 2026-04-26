/**
 * 离线题目生成处理器
 *
 * 仅供 content worker / 离线内容环境使用，不属于 server 运行时语义。
 */
import fs from "node:fs";
import path from "node:path";

import type { ModelMessage } from "ai";
import type { Job } from "bullmq";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "../../server/db.js";
import { knowledgePoints } from "../../server/db/schema/knowledgePoints.js";
import { questionExamTypes } from "../../server/db/schema/questionExamTypes.js";
import { questionKpTags } from "../../server/db/schema/questionKpTags.js";
import { questions } from "../../server/db/schema/questions.js";
import { logger } from "../../server/logger.js";
import { sandboxVerifyQueue } from "./offlineQueues.js";
import {
  computeContentHash,
  findJaccardDuplicate,
  isDuplicateByHash,
} from "../../server/services/deduplicationService.js";
import { llmGenerateObject } from "../../server/services/llm/index.js";

export interface GenerationJobData {
  questionType: "single_choice" | "reading_program" | "completion_program";
  examType: string;
  primaryKpId: number;
  kpCode: string;
  difficulty: "easy" | "medium" | "hard";
}

const singleChoiceSchema = z.object({
  stem: z.string().min(10),
  options: z.array(z.string()).length(4),
  answer: z.enum(["A", "B", "C", "D"]),
  explanation: z.string().min(10),
  primaryKpCode: z.string(),
  auxiliaryKpCodes: z.array(z.string()).default([]),
});

const readingProgramSchema = z.object({
  stem: z.string().min(10),
  cppCode: z.string().min(30),
  subQuestions: z
    .array(
      z.object({
        stem: z.string(),
        options: z.array(z.string()).length(4),
        answer: z.enum(["A", "B", "C", "D"]),
        explanation: z.string(),
      }),
    )
    .min(3)
    .max(6),
  sampleInputs: z.array(z.string()).default([]),
  expectedOutputs: z.array(z.string()).default([]),
  primaryKpCode: z.string(),
  auxiliaryKpCodes: z.array(z.string()).default([]),
});

const completionProgramSchema = z.object({
  stem: z.string().min(10),
  cppCode: z.string().min(30),
  blanks: z
    .array(
      z.object({
        id: z.string(),
        options: z.array(z.string()).length(4),
        answer: z.enum(["A", "B", "C", "D"]),
        explanation: z.string(),
      }),
    )
    .min(2)
    .max(6),
  fullCode: z.string().min(30),
  sampleInputs: z.array(z.string()).default([]),
  expectedOutputs: z.array(z.string()).default([]),
  primaryKpCode: z.string(),
  auxiliaryKpCodes: z.array(z.string()).default([]),
});

const judgeReviewSchema = z.object({
  approved: z.boolean(),
  issues: z.array(z.string()).default([]),
  correctedAnswer: z.string().nullable().default(null),
  suggestion: z.string().nullable().default(null),
});

function loadPromptTemplate(): string {
  const templatePath = path.resolve(
    import.meta.dirname,
    "..",
    "..",
    "prompts",
    "generate-initial.md",
  );
  return fs.readFileSync(templatePath, "utf-8");
}

function loadJudgeTemplate(): string {
  const templatePath = path.resolve(import.meta.dirname, "..", "..", "prompts", "judge-review.md");
  return fs.readFileSync(templatePath, "utf-8");
}

function buildPrompt(data: GenerationJobData, kpName: string): string {
  let template = loadPromptTemplate();
  template = template.replace(/\{\{questionType\}\}/g, data.questionType);
  template = template.replace(/\{\{examType\}\}/g, data.examType);
  template = template.replace(/\{\{kpName\}\}/g, kpName);
  template = template.replace(/\{\{kpCode\}\}/g, data.kpCode);
  template = template.replace(/\{\{difficulty\}\}/g, data.difficulty);
  template = template.replace(/\{\{fewShotExamples\}\}/g, "（暂无真题示例）");
  return template;
}

function buildJudgePrompt(questionJson: string, kpCode: string, difficulty: string): string {
  let template = loadJudgeTemplate();
  template = template.replace(/\{\{questionJson\}\}/g, questionJson);
  template = template.replace(/\{\{kpCode\}\}/g, kpCode);
  template = template.replace(/\{\{difficulty\}\}/g, difficulty);
  return template;
}

function getSchemaForType(questionType: string) {
  switch (questionType) {
    case "single_choice":
      return { schema: singleChoiceSchema, name: "SingleChoiceQuestion" };
    case "reading_program":
      return { schema: readingProgramSchema, name: "ReadingProgramQuestion" };
    case "completion_program":
      return { schema: completionProgramSchema, name: "CompletionProgramQuestion" };
    default:
      throw new Error(`Unknown question type: ${questionType}`);
  }
}

function buildGeneratedQuestionHistory(
  prompt: string,
  generated: unknown,
  reasoningText?: string,
): ModelMessage[] {
  const assistantText = JSON.stringify(generated);

  return [
    {
      role: "user",
      content: prompt,
    },
    {
      role: "assistant",
      content: reasoningText
        ? [
            {
              type: "text",
              text: assistantText,
            },
            {
              type: "reasoning",
              text: reasoningText,
            },
          ]
        : assistantText,
    },
  ];
}

export async function processGenerationJob(job: Job<GenerationJobData>) {
  const { questionType, examType, primaryKpId, kpCode, difficulty } = job.data;

  const kpRows = await db
    .select({ name: knowledgePoints.name })
    .from(knowledgePoints)
    .where(eq(knowledgePoints.id, primaryKpId))
    .limit(1);

  const kpName = kpRows[0]?.name ?? kpCode;
  const prompt = buildPrompt(job.data, kpName);
  const { schema, name: schemaName } = getSchemaForType(questionType);

  const generationResult = await llmGenerateObject({
    task: "generate",
    schema: schema as z.ZodType<unknown>,
    schemaName,
    prompt,
    temperature: 0.8,
  });
  const { data: generated } = generationResult;

  const contentJson = generated;
  const stem = (contentJson as Record<string, unknown>).stem as string;
  const optionsStr =
    questionType === "single_choice"
      ? ((contentJson as Record<string, unknown>).options as string[]).join("")
      : (((contentJson as Record<string, unknown>).cppCode as string) ?? "");
  const contentHash = computeContentHash(stem, optionsStr);

  if (await isDuplicateByHash(contentHash)) {
    logger.warn({ jobId: job.id, contentHash }, "Duplicate by content hash — rejecting");
    return { status: "duplicate_hash" };
  }

  const jaccardDup = await findJaccardDuplicate({
    stem,
    questionType,
    primaryKpId,
  });

  if (jaccardDup) {
    logger.warn({ jobId: job.id, duplicateOf: jaccardDup }, "Jaccard duplicate — rejecting");
    return { status: "duplicate_jaccard", duplicateOf: jaccardDup };
  }

  const judgePrompt = buildJudgePrompt(JSON.stringify(contentJson), kpCode, difficulty);
  const { data: judgeResult } = await llmGenerateObject({
    task: "judge",
    lane: "backup",
    schema: judgeReviewSchema,
    schemaName: "JudgeReview",
    prompt: judgePrompt,
    messages: buildGeneratedQuestionHistory(prompt, contentJson, generationResult.reasoningText),
    temperature: 0.2,
  });

  if (!judgeResult.approved) {
    logger.warn({ jobId: job.id, issues: judgeResult.issues }, "Judge rejected question");
    return { status: "judge_rejected", issues: judgeResult.issues };
  }

  const answerJson =
    questionType === "single_choice"
      ? { answer: (contentJson as Record<string, unknown>).answer }
      : questionType === "reading_program"
        ? {
            subAnswers: (
              (contentJson as Record<string, unknown>).subQuestions as { answer: string }[]
            ).map((question) => question.answer),
          }
        : {
            blanks: (
              (contentJson as Record<string, unknown>).blanks as { id: string; answer: string }[]
            ).map((blank) => ({ id: blank.id, answer: blank.answer })),
          };

  const explanationJson =
    questionType === "single_choice"
      ? { explanation: (contentJson as Record<string, unknown>).explanation }
      : questionType === "reading_program"
        ? {
            subExplanations: (
              (contentJson as Record<string, unknown>).subQuestions as { explanation: string }[]
            ).map((question) => question.explanation),
          }
        : {
            blankExplanations: (
              (contentJson as Record<string, unknown>).blanks as {
                id: string;
                explanation: string;
              }[]
            ).map((blank) => ({ id: blank.id, explanation: blank.explanation })),
          };

  const needsSandbox = questionType !== "single_choice";

  const [inserted] = await db
    .insert(questions)
    .values({
      type: questionType,
      difficulty,
      primaryKpId,
      contentJson,
      answerJson,
      explanationJson,
      contentHash,
      status: needsSandbox ? "draft" : "reviewed",
      sandboxVerified: false,
      source: "ai",
    })
    .returning({ id: questions.id });

  if (!inserted) {
    throw new Error("Failed to insert question");
  }

  await db.insert(questionExamTypes).values({
    questionId: inserted.id,
    examType,
  });

  await db.insert(questionKpTags).values({
    questionId: inserted.id,
    kpId: primaryKpId,
    tagRole: "primary",
  });

  const auxCodes = (contentJson as Record<string, unknown>).auxiliaryKpCodes as
    | string[]
    | undefined;
  if (auxCodes && auxCodes.length > 0) {
    for (const auxCode of auxCodes) {
      const auxKp = await db
        .select({ id: knowledgePoints.id })
        .from(knowledgePoints)
        .where(eq(knowledgePoints.code, auxCode))
        .limit(1);

      if (auxKp.length > 0 && auxKp[0]) {
        await db.insert(questionKpTags).values({
          questionId: inserted.id,
          kpId: auxKp[0].id,
          tagRole: "secondary",
        });
      }
    }
  }

  if (needsSandbox) {
    await sandboxVerifyQueue.add(`verify-${inserted.id}`, {
      questionId: inserted.id,
      questionType,
      examType,
      primaryKpId,
      difficulty,
    });
  }

  logger.info(
    { jobId: job.id, questionId: inserted.id, questionType, examType, kpCode, difficulty },
    "Question generated and stored",
  );

  return { status: "success", questionId: inserted.id };
}
