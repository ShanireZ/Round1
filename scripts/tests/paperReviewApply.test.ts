import assert from "node:assert/strict";

import {
  evaluateReviewedChunk,
  applyReviewedQuestion,
  reviewedChunkSchema,
  validateReviewedQuestion,
  type ReviewedQuestion,
} from "../lib/paperReview.js";
import type { PaperQuestion } from "../lib/paperFiles.js";

const validKnowledgePointCodes = new Set(["BAS-14", "CPP-04", "CPP-07", "ALG-01"]);

{
  const question: PaperQuestion = {
    questionType: "single_choice",
    stem: "示例题",
    difficulty: "easy",
    primaryKpCode: "BAS-14",
    auxiliaryKpCodes: [],
    options: ["A. ls", "B. cd"],
    answer: "A",
    explanation: "旧解析",
  };

  const reviewed: ReviewedQuestion = {
    questionType: "single_choice",
    difficulty: "medium",
    primaryKpCode: "CPP-04",
    auxiliaryKpCodes: ["BAS-14"],
    explanation: "新解析比旧解析更完整，会说明正确项为什么成立以及错误项为何不成立。",
    confidence: "high",
    stemStatus: "ok",
    codeStatus: "ok",
    notes: [],
  };

  const decision = validateReviewedQuestion(question, reviewed, validKnowledgePointCodes);
  assert.equal(decision.ok, true);

  applyReviewedQuestion(question, reviewed);
  assert.equal(question.difficulty, "medium");
  assert.equal(question.primaryKpCode, "CPP-04");
  assert.deepEqual(question.auxiliaryKpCodes, ["BAS-14"]);
  assert.match(question.explanation ?? "", /新解析/);
}

{
  const question: PaperQuestion = {
    questionType: "reading_program",
    stem: "阅读程序",
    difficulty: "medium",
    primaryKpCode: "CPP-07",
    auxiliaryKpCodes: ["ALG-01"],
    cppCode: "int main() { return 0; }",
    subQuestions: [
      {
        stem: "输出是什么",
        answer: "A",
        explanation: "旧解析",
      },
    ],
  };

  const reviewed: ReviewedQuestion = {
    questionType: "completion_program",
    difficulty: "medium",
    primaryKpCode: "CPP-07",
    auxiliaryKpCodes: ["ALG-01"],
    blankExplanations: ["不应被应用"],
    confidence: "medium",
    stemStatus: "manual_check",
    codeStatus: "ok",
    notes: [],
  };

  const decision = validateReviewedQuestion(question, reviewed, validKnowledgePointCodes);
  assert.equal(decision.ok, false);
  assert.match(decision.reason ?? "", /questionType|stem/);
}

{
  const question: PaperQuestion = {
    questionType: "single_choice",
    stem: "元数据题",
    difficulty: "easy",
    primaryKpCode: "BAS-14",
    auxiliaryKpCodes: [],
    options: ["A. ls", "B. cd"],
    answer: "A",
    explanation: "保留原解析",
  };

  const reviewed: ReviewedQuestion = {
    questionType: "single_choice",
    difficulty: "hard",
    primaryKpCode: "CPP-04",
    auxiliaryKpCodes: ["BAS-14"],
    confidence: "high",
    stemStatus: "ok",
    codeStatus: "ok",
    notes: [],
  };

  const decision = validateReviewedQuestion(question, reviewed, validKnowledgePointCodes, {
    metadataOnly: true,
  });
  assert.equal(decision.ok, true);

  applyReviewedQuestion(question, reviewed, { metadataOnly: true });
  assert.equal(question.explanation, "保留原解析");
  assert.equal(question.difficulty, "hard");
}

{
  const question: PaperQuestion = {
    questionType: "single_choice",
    stem: "状态预警题",
    difficulty: "easy",
    primaryKpCode: "BAS-14",
    auxiliaryKpCodes: [],
    options: ["A. ls", "B. cd", "C. pwd", "D. mv"],
    answer: "A",
    explanation: "原解析",
  };

  const reviewed = reviewedChunkSchema.parse({
    questions: [
      {
        questionType: "single_choice",
        difficulty: "easy",
        primaryKpCode: "BAS-14",
        auxiliaryKpCodes: [],
        confidence: "high" as const,
        stemStatus: "manual_check" as const,
        codeStatus: "ok" as const,
        explanation: "保留并提醒人工检查的解析。",
        notes: [],
      },
    ],
  });

  const evaluation = evaluateReviewedChunk({
    startIndex: 0,
    chunk: [question],
    reviewed,
    validKnowledgePointCodes,
    metadataOnly: true,
    allowStatusWarningsInMetadata: true,
  });

  assert.equal(evaluation.applied.length, 1);
  assert.equal(evaluation.skipped.length, 0);
  assert.deepEqual(evaluation.warnings, [
    {
      questionIndex: 1,
      reason: "stem needs manual check",
    },
  ]);
  assert.equal(question.explanation, "原解析");
}

{
  const question: PaperQuestion = {
    questionType: "single_choice",
    stem: "低置信度题",
    difficulty: "easy",
    primaryKpCode: "BAS-14",
    auxiliaryKpCodes: [],
    options: ["A. ls", "B. cd", "C. pwd", "D. mv"],
    answer: "A",
    explanation: "原解析",
  };

  const reviewed = reviewedChunkSchema.parse({
    questions: [
      {
        questionType: "single_choice",
        difficulty: "easy",
        primaryKpCode: "BAS-14",
        auxiliaryKpCodes: [],
        confidence: "low" as const,
        stemStatus: "ok" as const,
        codeStatus: "ok" as const,
        explanation: "这份解析不该被接受。",
        notes: [],
      },
    ],
  });

  const evaluation = evaluateReviewedChunk({
    startIndex: 0,
    chunk: [question],
    reviewed,
    validKnowledgePointCodes,
  });

  assert.equal(evaluation.applied.length, 0);
  assert.deepEqual(evaluation.skipped, [
    {
      questionIndex: 1,
      reason: "low confidence",
    },
  ]);
  assert.equal(evaluation.warnings.length, 0);
  assert.equal(question.explanation, "原解析");
}

console.log("paperReviewApply: ok");
