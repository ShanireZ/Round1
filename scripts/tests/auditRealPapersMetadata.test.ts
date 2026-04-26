import assert from "node:assert/strict";

import { collectQuestionMetadataIssues, type PaperMetadataIssueType } from "../auditRealPapers.js";
import type { PaperQuestion } from "../lib/paperFiles.js";

function metadataIssueTypes(question: PaperQuestion): PaperMetadataIssueType[] {
  return collectQuestionMetadataIssues(question)
    .map((entry) => entry.type)
    .sort();
}

assert.deepEqual(
  metadataIssueTypes({
    questionType: "essay",
    stem: "题目",
    difficulty: "nightmare",
    primaryKpCode: "BAD-01",
    auxiliaryKpCodes: ["BAD-01", "BAD-01"],
  } as PaperQuestion),
  [
    "duplicate_auxiliary_kp",
    "invalid_auxiliary_kp",
    "invalid_difficulty",
    "invalid_primary_kp",
    "invalid_question_type",
    "primary_in_auxiliary",
    "question_structure_mismatch",
  ],
);

assert.deepEqual(
  metadataIssueTypes({
    questionType: "single_choice",
    stem: "单选题",
    difficulty: "medium",
    primaryKpCode: "CPP-07",
    auxiliaryKpCodes: ["ALG-01", "CPP-04", "MATH-01", "CS-02"],
    options: ["A. 1", "B. 2"],
    answer: "A",
    explanation: "这是一条足够长的解释文本，用于确保这里只测元数据而不是 explanation 质量。",
  } as PaperQuestion),
  ["too_many_auxiliary_kp"],
);

assert.deepEqual(
  metadataIssueTypes({
    questionType: "reading_program",
    stem: "阅读程序",
    difficulty: "medium",
    primaryKpCode: "CPP-07",
    auxiliaryKpCodes: ["ALG-01", "CPP-07", "BAD-99"],
    cppCode: "",
  } as PaperQuestion),
  ["invalid_auxiliary_kp", "primary_in_auxiliary", "question_structure_mismatch"],
);

assert.deepEqual(
  metadataIssueTypes({
    questionType: "single_choice",
    stem: "单选题",
    difficulty: "easy",
    primaryKpCode: "BAS-14",
    auxiliaryKpCodes: ["CPP-04"],
    options: ["A. 1", "B. 2"],
    answer: "A",
    explanation: "这是一条足够长的解释文本，用于确保这里只测元数据而不是 explanation 质量。",
  } as PaperQuestion),
  [],
);

console.log("auditRealPapersMetadata: ok");
