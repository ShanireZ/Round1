import assert from "node:assert/strict";

import {
  collectQuestionQualityIssues,
  isWeakExplanationText,
  type PaperQualityIssueType,
} from "../commands/audit/auditRealPapers.js";
import type { PaperQuestion } from "../lib/paperFiles.js";

function issueTypes(question: PaperQuestion): PaperQualityIssueType[] {
  return collectQuestionQualityIssues(question)
    .map((entry) => entry.type)
    .sort();
}

assert.equal(isWeakExplanationText("因此选 A。"), true);
assert.equal(
  isWeakExplanationText("把表达式逐步展开后可知只有第三项满足条件，所以答案成立。"),
  false,
);
assert.equal(
  isWeakExplanationText(
    "用 Dijkstra 或逐层松弛求最短路。根据图中标注的边权，从 A 到 J 的最短路径长度为 19。",
    {
      minimumLength: 52,
    },
  ),
  true,
);

assert.deepEqual(
  issueTypes({
    questionType: "reading_program",
    stem: "阅读程序",
    cppCode: "for （int i = 0; i < n; ++i） ans += i;",
    subQuestions: [
      {
        stem: "第1小题",
        answer: "A",
        explanation: "因此选 A。",
      },
    ],
  }),
  ["invalid_code_punctuation", "placeholder_sub_stem", "weak_explanation"],
);

assert.deepEqual(
  issueTypes({
    questionType: "single_choice",
    stem: "下面的流程图是用来求 1+2+3+…+10 的和。（流程图为图片，无法显示）",
    options: ["A. 正确", "B. 错误"],
    answer: "A",
    explanation:
      "流程图先把 sum 初始化为 0，再在 i 不超过 10 时不断累加并递增 i，最终输出 55，因此逻辑正确。",
  }),
  ["placeholder_top_stem"],
);

assert.deepEqual(
  issueTypes({
    questionType: "completion_program",
    stem: "",
    fullCode: "",
    blanks: [
      {
        id: "1",
        answer: "B",
        explanation: "第1空选 B",
      },
    ],
  }),
  ["missing_code", "missing_top_stem", "weak_explanation"],
);

console.log("auditRealPapersQuality: ok");
