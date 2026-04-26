import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  DifficultySchema,
  ExamTypeSchema,
  QuestionBundleSchema,
  QuestionTypeSchema,
  computeChecksum,
  type Difficulty,
  type ExamType,
  type QuestionBundleItem,
  type QuestionType,
} from "./lib/bundleTypes.js";
import { defaultQuestionBundleOutputPath } from "./lib/paperPaths.js";
import { computeContentHash } from "../server/services/deduplicationService.js";

interface Args {
  examType: ExamType;
  questionType: QuestionType;
  primaryKpCode: string;
  difficulty: Difficulty;
  count: number;
  output: string;
  batchId: string;
}

function printHelp() {
  console.log(`Usage: tsx scripts/buildAcceptanceQuestionBundle.ts --exam-type <type> --question-type <type> --primary-kp-code <code> --difficulty <level> [options]

Build a deterministic offline acceptance question bundle for scaled sandbox/import checks.

Options:
  --exam-type <type>         Exam type, e.g. GESP-1
  --question-type <type>     reading_program | completion_program | single_choice
  --primary-kp-code <code>   Knowledge point code
  --difficulty <level>       easy | medium | hard
  --count <number>           Number of questions to generate (default: 1)
  --output <path>            Output path (default: papers/<year>/YYYY-MM-DD-<questionType>-<count>.json)
  --batch-id <id>            Stable batch id (default: timestamp)
  --help                     Show this help message
`);
}

function parseArgs(argv: string[]): Args {
  const values = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }

    values.set(key, value);
    index += 1;
  }

  const questionType = QuestionTypeSchema.parse(values.get("question-type"));
  const count = Number.parseInt(values.get("count") ?? "1", 10);

  return {
    examType: ExamTypeSchema.parse(values.get("exam-type")),
    questionType,
    primaryKpCode: values.get("primary-kp-code")?.trim() ?? "",
    difficulty: DifficultySchema.parse(values.get("difficulty")),
    count,
    output: values.get("output") ?? defaultQuestionBundleOutputPath(questionType, count),
    batchId: values.get("batch-id") ?? new Date().toISOString().replace(/[:.]/g, "-"),
  };
}

function buildOptionSet(answer: number): string[] {
  const values = [answer - 1, answer, answer + 1, answer + 2];
  return [`A. ${values[0]}`, `B. ${values[1]}`, `C. ${values[2]}`, `D. ${values[3]}`];
}

function buildReadingProgramItem(args: Args, index: number): QuestionBundleItem {
  const serial = index + 1;
  const input = serial + 6;
  const multiplier = (serial % 5) + 2;
  const offset = serial * 3 + 1;
  const answer = (input * multiplier + offset) % 97;
  const cppCode = `#include <bits/stdc++.h>
using namespace std;

int main() {
    int n = 0;
    if (!(cin >> n)) return 0;
    int multiplier = ${multiplier};
    int offset = ${offset};
    int answer = (n * multiplier + offset) % 97;
    cout << answer << '\\n';
    return 0;
}
`;
  const stem = `阅读程序题 ${serial}：给定输入 n，程序会计算线性表达式并取模。`;
  const contentJson = {
    stem,
    cppCode,
    subQuestions: [
      {
        stem: `当输入为 ${input} 时，程序输出是多少？`,
        options: buildOptionSet(answer),
      },
      {
        stem: "程序中 multiplier 变量的作用是什么？",
        options: ["A. 保存输入值", "B. 控制线性系数", "C. 保存取模结果", "D. 结束循环"],
      },
      {
        stem: "程序最终使用哪个运算保证结果落在 0 到 96 之间？",
        options: ["A. 加法", "B. 乘法", "C. 取模", "D. 位运算"],
      },
      {
        stem: "若输入失败，程序的行为是什么？",
        options: ["A. 输出 -1", "B. 立即返回", "C. 无限循环", "D. 抛出异常"],
      },
      {
        stem: "该程序的时间复杂度是多少？",
        options: ["A. O(1)", "B. O(log n)", "C. O(n)", "D. O(n^2)"],
      },
    ],
    sampleInputs: [`${input}\n`],
    expectedOutputs: [`${answer}\n`],
  };

  return {
    type: "reading_program",
    difficulty: args.difficulty,
    primaryKpCode: args.primaryKpCode,
    auxiliaryKpCodes: [],
    examTypes: [args.examType],
    contentHash: computeContentHash(stem, cppCode),
    sandboxVerified: false,
    source: "manual",
    contentJson,
    answerJson: {
      subQuestions: [
        { answer: "B" },
        { answer: "B" },
        { answer: "C" },
        { answer: "B" },
        { answer: "A" },
      ],
    },
    explanationJson: {
      explanation: `样例输出由 (${input} * ${multiplier} + ${offset}) % 97 = ${answer} 得到。`,
    },
  };
}

function buildCompletionProgramItem(args: Args, index: number): QuestionBundleItem {
  const serial = index + 1;
  const input = (serial % 7) + 4;
  const increment = (serial % 4) + 1;
  const answer = (input * (input + 1)) / 2 + increment * input;
  const cppCode = `#include <bits/stdc++.h>
using namespace std;

int main() {
    int n = 0;
    cin >> n;
    int total = {{BLANK1}};
    for (int i = 1; i <= n; ++i) {
        total += {{BLANK2}};
    }
    cout << total << '\\n';
    return 0;
}
`;
  const fullCode = cppCode.replace("{{BLANK1}}", "0").replace("{{BLANK2}}", `i + ${increment}`);
  const stem = `完善程序题 ${serial}：补全循环累加程序，使其输出 1 到 n 的和再加上每轮固定偏移。`;

  return {
    type: "completion_program",
    difficulty: args.difficulty,
    primaryKpCode: args.primaryKpCode,
    auxiliaryKpCodes: [],
    examTypes: [args.examType],
    contentHash: computeContentHash(stem, fullCode),
    sandboxVerified: false,
    source: "manual",
    contentJson: {
      stem,
      cppCode,
      blanks: [
        {
          id: "BLANK1",
          options: ["A. 0", "B. 1", "C. n", "D. -1"],
        },
        {
          id: "BLANK2",
          options: [`A. i + ${increment}`, "B. i * i", "C. n - i", "D. total + i"],
        },
      ],
      fullCode,
      sampleInputs: [`${input}\n`],
      expectedOutputs: [`${answer}\n`],
    },
    answerJson: {
      blanks: [
        { id: "BLANK1", answer: "A" },
        { id: "BLANK2", answer: "A" },
      ],
    },
    explanationJson: {
      explanation: `total 从 0 开始，每轮加入 i + ${increment}；输入 ${input} 时结果为 ${answer}。`,
    },
  };
}

function buildSingleChoiceItem(args: Args, index: number): QuestionBundleItem {
  const serial = index + 1;
  const answer = serial + 3;
  const stem = `单选题 ${serial}（${args.primaryKpCode}）：${serial} + 3 的值是多少？`;

  return {
    type: "single_choice",
    difficulty: args.difficulty,
    primaryKpCode: args.primaryKpCode,
    auxiliaryKpCodes: [],
    examTypes: [args.examType],
    contentHash: computeContentHash(stem, buildOptionSet(answer).join("\n")),
    sandboxVerified: false,
    source: "manual",
    contentJson: {
      stem,
      options: buildOptionSet(answer),
    },
    answerJson: {
      answer: "B",
    },
    explanationJson: {
      explanation: `${serial} + 3 = ${answer}。`,
    },
  };
}

function buildItem(args: Args, index: number): QuestionBundleItem {
  switch (args.questionType) {
    case "reading_program":
      return buildReadingProgramItem(args, index);
    case "completion_program":
      return buildCompletionProgramItem(args, index);
    case "single_choice":
      return buildSingleChoiceItem(args, index);
  }
}

async function main() {
  const argv = process.argv.slice(2);

  if (argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    return;
  }

  const args = parseArgs(argv);
  if (!args.primaryKpCode) {
    throw new Error("--primary-kp-code is required");
  }

  if (!Number.isInteger(args.count) || args.count <= 0) {
    throw new Error("--count must be a positive integer");
  }

  const sourceTimestamp = new Date().toISOString();
  const sourceBatchId = `acceptance-question-bundle-v1:${args.examType}:${args.questionType}:${args.primaryKpCode}:${args.difficulty}:${args.batchId}`;
  const templateId = sourceBatchId;
  const bundle = QuestionBundleSchema.parse({
    meta: {
      bundleType: "question_bundle",
      generatedAt: sourceTimestamp,
      provider: "local-deterministic",
      model: "acceptance-question-template-v1",
      promptHash: computeChecksum(templateId),
      sourceBatchId,
      sourceBatchIds: [sourceBatchId],
      sourceTimestamp,
      examType: args.examType,
      questionType: args.questionType,
      primaryKpCode: args.primaryKpCode,
      difficulty: args.difficulty,
      requestedCount: args.count,
    },
    items: Array.from({ length: args.count }, (_, index) => buildItem(args, index)),
  });

  const outputPath = path.resolve(process.cwd(), args.output);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
  console.log(`Built ${bundle.items.length} acceptance questions -> ${outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
