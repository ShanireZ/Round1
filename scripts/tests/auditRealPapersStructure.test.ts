import assert from "node:assert/strict";

import {
  collectQuestionStructureIssues,
  type PaperStructureIssueType,
} from "../commands/audit/auditRealPapers.js";
import type { PaperQuestion } from "../lib/paperFiles.js";

function structureIssueTypes(question: PaperQuestion): PaperStructureIssueType[] {
  return collectQuestionStructureIssues(question)
    .map((entry) => entry.type)
    .sort();
}

assert.deepEqual(
  structureIssueTypes({
    questionType: "single_choice",
    stem: "判断题",
    options: ["A. 正确", "B. 错误"],
    answer: "A",
    explanation: "这是足够长的解释，用于确保这里只测结构规则。",
    difficulty: "easy",
    primaryKpCode: "ALG-01",
    auxiliaryKpCodes: [],
  }),
  [],
);

assert.deepEqual(
  structureIssueTypes({
    questionType: "single_choice",
    stem: "异常单选",
    options: ["A. 一", "B. 二", "C. 三"],
    answer: "c",
    explanation: "这是足够长的解释，用于确保这里只测结构规则。",
    difficulty: "easy",
    primaryKpCode: "ALG-01",
    auxiliaryKpCodes: [],
  }),
  ["invalid_answer_format", "invalid_option_count"],
);

assert.deepEqual(
  structureIssueTypes({
    questionType: "reading_program",
    stem: "编程题：山谷计数",
    cppCode: "#include <iostream>\nint main() { return 0; }",
    subQuestions: [],
    explanation: "这是整题编程题的总体解析，没有子题也属于合法结构。",
    difficulty: "hard",
    primaryKpCode: "ALG-01",
    auxiliaryKpCodes: [],
  }),
  [],
);

assert.deepEqual(
  structureIssueTypes({
    questionType: "reading_program",
    stem: "阅读程序",
    cppCode: "01 #include <iostream>\n02 int main() {\n03   return 0;\n04 }",
    subQuestions: [
      {
        stem: "判断题",
        options: ["A. 正确", "B. 错误"],
        answer: "AB",
        explanation: "错题双选是合法历史特例。",
      },
      {
        stem: "选择题",
        options: ["A. 1", "B. 2"],
        answer: "c",
        explanation: "这里故意保留小写答案作为异常样本。",
      },
    ],
    difficulty: "medium",
    primaryKpCode: "CPP-07",
    auxiliaryKpCodes: [],
  }),
  ["invalid_answer_format", "invalid_code_line_numbers"],
);

assert.deepEqual(
  structureIssueTypes({
    questionType: "completion_program",
    stem: "完善程序",
    fullCode: "0 0 \n0 1",
    blanks: [
      {
        id: "1",
        options: ["A. x", "B. y", "C. z", "D. w"],
        answer: "AC",
        explanation: "多选历史特例在填空里同样合法。",
      },
    ],
    difficulty: "medium",
    primaryKpCode: "CPP-07",
    auxiliaryKpCodes: [],
  }),
  ["suspicious_code_content"],
);

assert.deepEqual(
  structureIssueTypes({
    questionType: "completion_program",
    stem: "完善程序",
    fullCode: "#include <iostream>\nint main() { return 0; }",
    blanks: [
      {
        id: "1",
        options: ["A. a", "B. b", "C. c"],
        answer: "A",
        explanation: "这里只是为了触发空数不足。",
      },
    ],
    difficulty: "medium",
    primaryKpCode: "CPP-07",
    auxiliaryKpCodes: [],
  }),
  ["invalid_option_count"],
);

console.log("auditRealPapersStructure: ok");
