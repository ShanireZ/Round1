import assert from "node:assert/strict";

import {
  applyChunkRewrite,
  validateChunkRewrite,
  type RewriteChunkContent,
} from "../lib/paperRewrite.js";
import type { PaperData } from "../lib/paperFiles.js";

{
  const paper: PaperData = {
    year: 2025,
    examType: "csp-j",
    source: "unit-test",
    questions: [
      {
        questionType: "single_choice",
        stem: "示例单选",
        difficulty: "easy",
        primaryKpCode: "BAS-14",
        auxiliaryKpCodes: [],
        options: ["A", "B", "C", "D"],
        answer: "A",
        explanation: "旧解析",
      },
    ],
  };
  const original = structuredClone(paper);
  const rewritten: RewriteChunkContent = {
    questions: [
      {
        explanation: "",
      },
    ],
  };

  assert.throws(
    () =>
      validateChunkRewrite({
        paper,
        startIndex: 0,
        chunk: paper.questions,
        rewritten,
      }),
    /Missing explanation for Q1/,
  );
  assert.deepEqual(paper, original);
}

{
  const paper: PaperData = {
    year: 2025,
    examType: "csp-j",
    source: "unit-test",
    questions: [
      {
        questionType: "completion_program",
        stem: "示例完善程序",
        difficulty: "medium",
        primaryKpCode: "CPP-04",
        auxiliaryKpCodes: [],
        fullCode: "int main() { return 0; }",
        blanks: [
          {
            id: "b1",
            options: ["A", "B", "C", "D"],
            answer: "A",
            explanation: "旧空解析",
          },
        ],
      },
    ],
  };
  const rewritten: RewriteChunkContent = {
    questions: [
      {
        blankExplanations: ["新空解析，说明该空在整体算法中的作用。"],
      },
    ],
  };

  validateChunkRewrite({
    paper,
    startIndex: 0,
    chunk: paper.questions,
    rewritten,
  });
  assert.equal(paper.questions[0]?.blanks?.[0]?.explanation, "旧空解析");

  applyChunkRewrite(paper, 0, paper.questions, rewritten);
  assert.equal(
    paper.questions[0]?.blanks?.[0]?.explanation,
    "新空解析，说明该空在整体算法中的作用。",
  );
}

console.log("paperRewriteApply: ok");
