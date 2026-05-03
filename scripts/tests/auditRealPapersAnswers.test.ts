import assert from "node:assert/strict";

import {
  getAnswerSlots,
  normalizeAnswerSlotForComparison,
} from "../commands/audit/auditRealPapers.js";
import type { PaperQuestion } from "../lib/paperFiles.js";

function answers(question: PaperQuestion): string[] {
  return getAnswerSlots(question);
}

assert.deepEqual(
  answers({
    questionType: "single_choice",
    stem: "判断题",
    options: ["A. 正确", "B. 错误"],
    answer: "A",
    explanation: "这是足够长的解释，用于确保这里只测答案槽统计。",
    difficulty: "easy",
    primaryKpCode: "ALG-01",
    auxiliaryKpCodes: [],
  }),
  ["A"],
);

assert.deepEqual(
  answers({
    questionType: "reading_program",
    stem: "阅读程序",
    cppCode: "#include <iostream>\nint main() { return 0; }",
    subQuestions: [
      {
        stem: "第 1 小题",
        options: ["A. 1", "B. 2"],
        answer: "B",
        explanation: "这是足够长的解释，用于确保这里只测答案槽统计。",
      },
    ],
    difficulty: "medium",
    primaryKpCode: "CPP-07",
    auxiliaryKpCodes: [],
  }),
  ["B"],
);

assert.deepEqual(
  answers({
    questionType: "reading_program",
    stem: "整题编程题",
    cppCode: "#include <iostream>\nint main() { return 0; }",
    subQuestions: [],
    explanation: "这是整题编程题的说明，没有客观题答案槽。",
    difficulty: "hard",
    primaryKpCode: "ALG-01",
    auxiliaryKpCodes: [],
  }),
  [],
);

assert.deepEqual(
  answers({
    questionType: "completion_program",
    stem: "完善程序",
    fullCode: "int main() { return 0; }",
    blanks: [
      {
        id: "1",
        options: ["A. a", "B. b", "C. c", "D. d"],
        answer: "C",
        explanation: "这是足够长的解释，用于确保这里只测答案槽统计。",
      },
    ],
    difficulty: "medium",
    primaryKpCode: "CPP-07",
    auxiliaryKpCodes: [],
  }),
  ["C"],
);

assert.deepEqual(
  answers({
    questionType: "completion_program",
    stem: "整题编程题",
    fullCode: "int main() { return 0; }",
    blanks: [],
    explanation: "这是整题编程题的说明，没有客观题答案槽。",
    difficulty: "hard",
    primaryKpCode: "ALG-01",
    auxiliaryKpCodes: [],
  }),
  [],
);

assert.equal(normalizeAnswerSlotForComparison(" c "), "C");
assert.equal(normalizeAnswerSlotForComparison("a c"), "AC");
assert.equal(normalizeAnswerSlotForComparison("cout << x"), "cout << x");

console.log("auditRealPapersAnswers: ok");
