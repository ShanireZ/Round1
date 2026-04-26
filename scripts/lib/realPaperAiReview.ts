import type { LLMLane } from "../../config/llm.js";
import { extractJsonObject } from "./modelJson.js";
import { callScriptLlmScene } from "./scriptLlmClient.js";
import { z } from "zod";

const judgeResponseSchema = z.object({
  confidence: z.number().min(0).max(1).optional().default(0.5),
  answers: z.array(z.string()).min(1),
  notes: z.string().optional().default(""),
});

const JUDGE_SYSTEM_PROMPT = [
  "你是信息学竞赛真题审核员。",
  "你必须独立解题，不得猜测官方答案。",
  "你只能输出 JSON，不要输出 Markdown。",
  "answers 必须按题目小问顺序填写。",
  "single_choice 返回选项字母。",
  "reading_program 返回每个小问的最终答案。",
  "completion_program 返回每个空的最终填空答案。",
  "confidence 使用 0 到 1 之间的小数。",
].join("\n");

type RealPaperQuestion = {
  questionType: "single_choice" | "reading_program" | "completion_program";
  stem: string;
  options?: string[];
  answer?: string;
  cppCode?: string;
  subQuestions?: Array<{
    stem: string;
    options: string[];
    answer: string;
    explanation: string;
  }>;
  blanks?: Array<{
    id: string;
    options: string[];
    answer: string;
    explanation: string;
  }>;
  fullCode?: string;
  difficulty: "easy" | "medium" | "hard";
  primaryKpCode: string;
  auxiliaryKpCodes: string[];
  explanation?: string;
};

export interface RealPaperAiReviewOutcome {
  reviewStatus: "ai_reviewed";
  aiConfidence: number;
  questionStatus: "draft" | "reviewed";
  answersMatch: boolean;
  officialAnswerDiff: {
    officialAnswers: string[];
    aiAnswers: string[];
    mismatches: Array<{
      index: number;
      official: string | null;
      ai: string | null;
    }>;
  } | null;
  reviewerNotes: string | null;
}

function normalizeAnswer(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return "";
  }

  const choiceMatch = trimmed.match(/^([A-Z])(?:[.、):\-\s]|$)/i);
  if (choiceMatch?.[1]) {
    return choiceMatch[1].toUpperCase();
  }

  return trimmed.replace(/\s+/g, " ");
}

function collectOfficialAnswers(question: RealPaperQuestion): string[] {
  switch (question.questionType) {
    case "single_choice":
      return [normalizeAnswer(question.answer ?? "")];
    case "reading_program":
      return (question.subQuestions ?? []).map((entry) => normalizeAnswer(entry.answer));
    case "completion_program":
      return (question.blanks ?? []).map((entry) => normalizeAnswer(entry.answer));
  }
}

function buildAnswerDiff(officialAnswers: string[], aiAnswers: string[]) {
  const total = Math.max(officialAnswers.length, aiAnswers.length);
  const mismatches: Array<{
    index: number;
    official: string | null;
    ai: string | null;
  }> = [];

  for (let index = 0; index < total; index++) {
    const official = officialAnswers[index] ?? null;
    const ai = aiAnswers[index] ?? null;
    if (official !== ai) {
      mismatches.push({
        index: index + 1,
        official,
        ai,
      });
    }
  }

  if (mismatches.length === 0) {
    return null;
  }

  return {
    officialAnswers,
    aiAnswers,
    mismatches,
  };
}

function buildJudgePrompt(question: RealPaperQuestion): string {
  const payload =
    question.questionType === "single_choice"
      ? {
          questionType: question.questionType,
          stem: question.stem,
          options: question.options ?? [],
        }
      : question.questionType === "reading_program"
        ? {
            questionType: question.questionType,
            stem: question.stem,
            cppCode: question.cppCode ?? "",
            subQuestions: (question.subQuestions ?? []).map((entry, index) => ({
              index: index + 1,
              stem: entry.stem,
              options: entry.options,
            })),
          }
        : {
            questionType: question.questionType,
            stem: question.stem,
            fullCode: question.fullCode ?? "",
            blanks: (question.blanks ?? []).map((entry, index) => ({
              index: index + 1,
              id: entry.id,
              options: entry.options,
            })),
          };

  return [
    '输出格式：{"confidence":0.0,"answers":["..."],"notes":"..."}',
    "不要解释，不要输出多余字段。",
    "题目如下：",
    JSON.stringify(payload, null, 2),
  ].join("\n");
}

function canPromoteToReviewed(question: RealPaperQuestion, answersMatch: boolean): boolean {
  return answersMatch && question.questionType === "single_choice";
}

export async function judgeRealPaperQuestion(params: {
  question: RealPaperQuestion;
  timeoutMs: number;
  modelOverride?: string;
  lane?: LLMLane;
  allowBackupFallback?: boolean;
}): Promise<RealPaperAiReviewOutcome> {
  const response = await callScriptLlmScene({
    scene: "judge",
    system: JUDGE_SYSTEM_PROMPT,
    prompt: buildJudgePrompt(params.question),
    maxTokens: 800,
    timeoutMs: params.timeoutMs,
    modelOverride: params.modelOverride,
    lane: params.lane,
    allowBackupFallback: params.allowBackupFallback,
  });

  const parsed = judgeResponseSchema.parse(JSON.parse(extractJsonObject(response.text)));
  const officialAnswers = collectOfficialAnswers(params.question);
  const aiAnswers = parsed.answers.map((entry) => normalizeAnswer(entry));
  const officialAnswerDiff = buildAnswerDiff(officialAnswers, aiAnswers);
  const answersMatch = officialAnswerDiff === null;
  const reviewerNotes = parsed.notes.trim();

  return {
    reviewStatus: "ai_reviewed",
    aiConfidence: parsed.confidence,
    questionStatus: canPromoteToReviewed(params.question, answersMatch) ? "reviewed" : "draft",
    answersMatch,
    officialAnswerDiff,
    reviewerNotes: reviewerNotes.length > 0 ? reviewerNotes : null,
  };
}
