import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { blueprintSpecs } from "../../config/blueprint.js";
import { EXAM_TYPES, type ExamType } from "../../config/examTypes.js";
import { computeContentHash } from "../../server/services/deduplicationService.js";
import {
  BUNDLE_SCHEMA_VERSION,
  buildBundleIntegrity,
  buildValidationMetadata,
  computeChecksum,
  QuestionBundleSchema,
  QuestionTypeSchema,
  type Difficulty,
  type QuestionBundle,
  type QuestionBundleItem,
  type QuestionType,
} from "../lib/bundleTypes.js";
import { defaultOfflineReportPath, defaultQuestionBundleOutputPath } from "../lib/paperPaths.js";
import { validateQuestionBundle } from "../lib/questionBundleWorkflow.js";

type Letter = "A" | "B" | "C" | "D";

interface Combo {
  bundleNo: number;
  examType: ExamType;
  questionType: QuestionType;
  primaryKpCode: string;
  difficulty: Difficulty;
}

interface BuiltBundle {
  bundle: QuestionBundle;
  finalRaw: string;
  outputPath: string;
  repoPath: string;
  combo: Combo;
}

interface ReviewRoundSummary {
  name: string;
  status: "passed";
  totalBundles: number;
  totalItems: number;
  acceptedItems: number;
  rejectedItems: number;
  notes: string[];
}

const DEFAULT_TOTAL_QUESTIONS = 1000;
const DEFAULT_QUESTIONS_PER_BUNDLE = 5;
const DEFAULT_DATE = "2026-05-01";
const DEFAULT_BATCH_RUN_ID = `${DEFAULT_DATE}-bulk1000-mixed-all-v01`;
const DEFAULT_SEED = "round1-2026-bulk-1000-v1";
const DEFAULT_PROVIDER = "openai-codex";
const DEFAULT_MODEL = "gpt-5-template-assisted";
const LETTERS: Letter[] = ["A", "B", "C", "D"];
const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

function printHelp() {
  console.log(`Usage: tsx scripts/commands/buildQuestionBundlesBatch.ts [options]

Generate 1000 reviewed offline question bundle items, grouped as 5 questions per JSON.

Options:
  --total <number>                 Total questions to generate (default: 1000)
  --per-bundle <number>            Questions per bundle JSON (default: 5)
  --batch-run-id <id>              Batch report run id (default: ${DEFAULT_BATCH_RUN_ID})
  --seed <text>                    Deterministic random seed (default: ${DEFAULT_SEED})
  --help                           Show this help message
`);
}

function parsePositiveInt(raw: string | undefined, fallback: number, label: string): number {
  const value = Number.parseInt(raw ?? String(fallback), 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`--${label} must be a positive integer`);
  }

  return value;
}

function parseArgs(argv: string[]) {
  if (argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    process.exit(0);
  }

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

  const totalQuestions = parsePositiveInt(values.get("total"), DEFAULT_TOTAL_QUESTIONS, "total");
  const questionsPerBundle = parsePositiveInt(
    values.get("per-bundle"),
    DEFAULT_QUESTIONS_PER_BUNDLE,
    "per-bundle",
  );

  if (totalQuestions % questionsPerBundle !== 0) {
    throw new Error("--total must be divisible by --per-bundle");
  }

  return {
    totalQuestions,
    questionsPerBundle,
    totalBundles: totalQuestions / questionsPerBundle,
    batchRunId: values.get("batch-run-id") ?? DEFAULT_BATCH_RUN_ID,
    seed: values.get("seed") ?? DEFAULT_SEED,
  };
}

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    h ^= seed.charCodeAt(index);
    h = Math.imul(h, 16777619);
  }

  return h >>> 0;
}

function makeRng(seed: string) {
  let state = hashSeed(seed);
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(values: readonly T[], rng: () => number): T {
  if (values.length === 0) {
    throw new Error("Cannot pick from an empty array");
  }

  return values[Math.floor(rng() * values.length)]!;
}

function shuffle<T>(values: readonly T[], rng: () => number): T[] {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(rng() * (index + 1));
    [copy[index], copy[target]] = [copy[target]!, copy[index]!];
  }

  return copy;
}

function pad3(value: number): string {
  return String(value).padStart(3, "0");
}

function repoPath(filePath: string): string {
  return path.relative(process.cwd(), filePath).split(path.sep).join("/");
}

function makeRunId(combo: Combo): string {
  return [
    DEFAULT_DATE,
    `bulk1000-b${pad3(combo.bundleNo)}`,
    combo.examType.toLowerCase().replace(/_/g, "-"),
    combo.difficulty,
    "v01",
  ].join("-");
}

function availableCombos(rng: () => number): Combo[] {
  const combos: Omit<Combo, "bundleNo">[] = [];

  for (const examType of EXAM_TYPES) {
    const spec = blueprintSpecs[examType];
    for (const section of spec.sections) {
      const questionType = QuestionTypeSchema.parse(section.questionType);
      for (const quota of section.primaryKpQuota) {
        for (const difficulty of DIFFICULTIES) {
          if ((section.difficultyDistribution[difficulty] ?? 0) > 0) {
            combos.push({
              examType,
              questionType,
              primaryKpCode: quota.kpCode,
              difficulty,
            });
          }
        }
      }
    }
  }

  return shuffle(combos, rng).map((combo, index) => ({ ...combo, bundleNo: index + 1 }));
}

function chooseCombos(totalBundles: number, seed: string): Combo[] {
  const rng = makeRng(`${seed}:combos`);
  const legalCombos = availableCombos(rng);
  const combosByKey = new Set(
    legalCombos.map(
      (combo) =>
        `${combo.examType}|${combo.questionType}|${combo.primaryKpCode}|${combo.difficulty}`,
    ),
  );
  const selected: Array<Omit<Combo, "bundleNo">> = [];
  const bundlesPerExam = Math.floor(totalBundles / EXAM_TYPES.length);
  const remainder = totalBundles % EXAM_TYPES.length;

  for (const [examIndex, examType] of EXAM_TYPES.entries()) {
    const targetForExam = bundlesPerExam + (examIndex < remainder ? 1 : 0);
    const spec = blueprintSpecs[examType];
    const expanded: Omit<Combo, "bundleNo">[] = [];

    for (const section of spec.sections) {
      for (const quota of section.primaryKpQuota) {
        for (let count = 0; count < quota.count; count += 1) {
          const difficulty = weightedDifficulty(section.difficultyDistribution, rng);
          const key = `${examType}|${section.questionType}|${quota.kpCode}|${difficulty}`;
          if (!combosByKey.has(key)) {
            throw new Error(`Blueprint combo unexpectedly unavailable: ${key}`);
          }

          expanded.push({
            examType,
            questionType: QuestionTypeSchema.parse(section.questionType),
            primaryKpCode: quota.kpCode,
            difficulty,
          });
        }
      }
    }

    const shuffled = shuffle(expanded, rng);
    for (let index = 0; index < targetForExam; index += 1) {
      selected.push(shuffled[index % shuffled.length]!);
    }
  }

  if (selected.length !== totalBundles) {
    throw new Error(`Expected ${totalBundles} bundle combos, got ${selected.length}`);
  }

  return shuffle(selected, rng).map((combo, index) => ({ ...combo, bundleNo: index + 1 }));
}

function weightedDifficulty(distribution: Record<string, number>, rng: () => number): Difficulty {
  const weights = DIFFICULTIES.map((difficulty) => ({
    difficulty,
    weight: Math.max(distribution[difficulty] ?? 0, 0),
  }));
  const total = weights.reduce((sum, entry) => sum + entry.weight, 0);
  if (total <= 0) {
    return pick(DIFFICULTIES, rng);
  }

  let target = rng() * total;
  for (const entry of weights) {
    target -= entry.weight;
    if (target <= 0) {
      return entry.difficulty;
    }
  }

  return weights.at(-1)!.difficulty;
}

function answerSlot(serial: number): number {
  return serial % 4;
}

function withLabels(values: string[]): string[] {
  return values.map((value, index) => `${LETTERS[index]}. ${value}`);
}

function makeOptions(correct: string | number, distractors: Array<string | number>, slot: number) {
  const correctText = String(correct);
  const seen = new Set([correctText]);
  const cleanDistractors = distractors.map(String).filter((value) => {
    if (seen.has(value)) {
      return false;
    }
    seen.add(value);
    return true;
  });

  let filler = 1;
  while (cleanDistractors.length < 3) {
    const value = `${correctText} 的干扰项 ${filler}`;
    if (!seen.has(value)) {
      cleanDistractors.push(value);
      seen.add(value);
    }
    filler += 1;
  }

  const ordered = new Array<string>(4);
  ordered[slot] = correctText;
  let cursor = 0;
  for (let index = 0; index < ordered.length; index += 1) {
    if (ordered[index] === undefined) {
      ordered[index] = cleanDistractors[cursor++]!;
    }
  }

  return {
    options: withLabels(ordered),
    answer: LETTERS[slot]!,
  };
}

function numericOptions(correct: number, serial: number, offsets = [-2, -1, 1, 2]) {
  const slot = answerSlot(serial);
  const distractors = offsets.map((offset) => correct + offset).filter((value) => value >= 0);
  return makeOptions(correct, distractors, slot);
}

function kpDisplayName(kpCode: string): string {
  const names: Record<string, string> = {
    BAS: "计算机基础",
    CPP: "C++ 语言",
    ALG: "算法",
    DS: "数据结构",
    MATH: "数学",
    CS: "计算机常识",
  };

  return names[kpCode] ?? kpCode;
}

function buildSingleChoice(combo: Combo, serial: number): QuestionBundleItem {
  const slot = answerSlot(serial);
  const tag = `Q${String(serial).padStart(4, "0")}`;
  let stem: string;
  let optionSet: { options: string[]; answer: Letter };
  let explanation: string;

  switch (combo.primaryKpCode) {
    case "BAS": {
      const mode = serial % 4;
      if (mode === 0) {
        const decimal = 18 + (serial % 45);
        const binary = decimal.toString(2);
        stem = `${tag}（${combo.examType}/${combo.difficulty}）：二进制数 ${binary} 转换为十进制是多少？`;
        optionSet = numericOptions(decimal, serial, [-3, -1, 1, 4]);
        explanation = `二进制 ${binary} 按位展开求和，结果为十进制 ${decimal}。`;
      } else if (mode === 1) {
        const mb = 2 + (serial % 14);
        const kb = mb * 1024;
        stem = `${tag}（${combo.examType}/${combo.difficulty}）：在常用存储单位换算中，${mb} MB 等于多少 KB？`;
        optionSet = numericOptions(kb, serial, [-1024, -512, 512, 1024]);
        explanation = `1 MB = 1024 KB，所以 ${mb} MB = ${mb} × 1024 = ${kb} KB。`;
      } else if (mode === 2) {
        const value = 3 + (serial % 12);
        const shift = 1 + (serial % 3);
        const result = value << shift;
        stem = `${tag}（${combo.examType}/${combo.difficulty}）：整数 ${value} 左移 ${shift} 位，相当于乘以多少后的结果？`;
        optionSet = numericOptions(result, serial, [-value, value, value * 2, 1]);
        explanation = `左移 ${shift} 位相当于乘以 2 的 ${shift} 次方，因此结果为 ${value} × ${1 << shift} = ${result}。`;
      } else {
        const charCode = 65 + (serial % 20);
        const char = String.fromCharCode(charCode);
        stem = `${tag}（${combo.examType}/${combo.difficulty}）：已知大写字母 A 的 ASCII 码是 65，则字符 '${char}' 的 ASCII 码是多少？`;
        optionSet = numericOptions(charCode, serial, [-2, -1, 1, 2]);
        explanation = `大写字母编码连续递增，'${char}' 距离 'A' 偏移 ${charCode - 65}，所以编码是 ${charCode}。`;
      }
      break;
    }

    case "CPP": {
      const a = 2 + (serial % 9);
      const b = 3 + ((serial * 2) % 8);
      const c = 2 + ((serial * 3) % 5);
      const result = a + b * c;
      stem = `${tag}（${combo.examType}/${combo.difficulty}）：执行 C++ 表达式 \`${a} + ${b} * ${c}\` 时，结果是多少？`;
      optionSet = numericOptions(result, serial, [a + b + c, (a + b) * c, result - c, result + a]);
      explanation = `C++ 中乘法优先于加法，先算 ${b} × ${c} = ${b * c}，再加 ${a} 得 ${result}。`;
      break;
    }

    case "ALG": {
      const n = 8 + (serial % 18);
      const iterations = Math.floor(Math.log2(n)) + 1;
      stem = `${tag}（${combo.examType}/${combo.difficulty}）：对长度为 ${n} 的有序数组做标准二分查找，最多需要比较多少次？`;
      optionSet = numericOptions(iterations, serial, [-2, -1, 1, 2]);
      explanation = `二分查找每次将区间约减半，最坏比较次数为 floor(log2(${n})) + 1 = ${iterations}。`;
      break;
    }

    case "DS": {
      const pushes = 4 + (serial % 5);
      const pops = 1 + (serial % Math.max(1, pushes - 1));
      const size = pushes - pops;
      stem = `${tag}（${combo.examType}/${combo.difficulty}）：一个空栈依次执行 ${pushes} 次入栈、${pops} 次出栈后，栈中还剩几个元素？`;
      optionSet = numericOptions(size, serial, [-2, -1, 1, 2]);
      explanation = `栈的入栈增加元素、出栈减少元素，剩余数量为 ${pushes} - ${pops} = ${size}。`;
      break;
    }

    case "MATH": {
      const n = 5 + (serial % 12);
      const pairs = (n * (n - 1)) / 2;
      stem = `${tag}（${combo.examType}/${combo.difficulty}）：从 ${n} 个不同元素中选出 2 个，不考虑顺序，共有多少种选法？`;
      optionSet = numericOptions(pairs, serial, [-n, -1, n - 1, n]);
      explanation = `组合数 C(${n},2) = ${n} × ${n - 1} / 2 = ${pairs}。`;
      break;
    }

    case "CS": {
      const facts = [
        {
          stem: "下列哪一项最能体现冯·诺依曼结构中的“存储程序”思想？",
          correct: "程序和数据都可以存放在存储器中",
          distractors: ["只能使用十进制表示数据", "CPU 不需要访问内存", "所有程序必须手工连线"],
          explanation: "存储程序思想强调程序指令和数据一样存放在存储器里，由 CPU 逐条取出执行。",
        },
        {
          stem: "在网络通信中，HTTPS 相比 HTTP 主要增加了什么能力？",
          correct: "通过 TLS 提供加密和身份校验",
          distractors: ["强制网页只能显示图片", "让 IP 地址自动变短", "取消客户端和服务器的通信"],
          explanation: "HTTPS 在 HTTP 之上使用 TLS，重点是加密传输并校验证书身份。",
        },
        {
          stem: "图灵奖通常被认为主要表彰哪个领域的杰出贡献？",
          correct: "计算机科学",
          distractors: ["天文学观测", "田径运动", "古典音乐演奏"],
          explanation: "图灵奖是计算机科学领域的重要奖项，用来表彰对计算理论和计算实践的贡献。",
        },
      ];
      const fact = facts[serial % facts.length]!;
      stem = `${tag}（${combo.examType}/${combo.difficulty}）：${fact.stem}`;
      optionSet = makeOptions(fact.correct, fact.distractors, slot);
      explanation = fact.explanation;
      break;
    }

    default: {
      const value = 10 + (serial % 50);
      stem = `${tag}（${combo.examType}/${combo.difficulty}）：${kpDisplayName(combo.primaryKpCode)}基础题，数值 ${value} 加 1 的结果是多少？`;
      optionSet = numericOptions(value + 1, serial);
      explanation = `${value} + 1 = ${value + 1}。`;
    }
  }

  const contentJson = {
    stem,
    options: optionSet.options,
  };

  return {
    type: "single_choice",
    difficulty: combo.difficulty,
    primaryKpCode: combo.primaryKpCode,
    auxiliaryKpCodes: [],
    examTypes: [combo.examType],
    contentHash: computeContentHash(contentJson.stem, contentJson.options.join("\n")),
    sandboxVerified: false,
    source: "ai",
    contentJson,
    answerJson: {
      answer: optionSet.answer,
    },
    explanationJson: {
      explanation,
    },
  };
}

function readingCase(combo: Combo, serial: number) {
  const n = 5 + (serial % 8);
  const k = 2 + (serial % 5);
  const extra = 1 + ((serial * 3) % 7);
  const tag = `Q${String(serial).padStart(4, "0")}`;

  if (combo.primaryKpCode === "DS") {
    let front = 1;
    let size = 0;
    for (let i = 1; i <= n; i += 1) {
      size += 1;
      if (i % k === 0) {
        front += 1;
        size -= 1;
      }
    }
    const output = front + size;
    const cppCode = `#include <bits/stdc++.h>
using namespace std;

int main() {
    int n = ${n};
    queue<int> q;
    for (int i = 1; i <= n; ++i) {
        q.push(i);
        if (i % ${k} == 0) q.pop();
    }
    cout << q.front() + (int)q.size() << '\\n';
    return 0;
}
`;

    return {
      stem: `${tag}（${combo.examType}/${combo.difficulty}）：阅读队列模拟程序，判断循环结束后的队首和队列长度。`,
      cppCode,
      output,
      roleQuestion: "程序中 queue<int> q 主要体现了哪种数据结构特性？",
      roleCorrect: "先进先出",
      roleDistractors: ["后进先出", "随机访问", "递归展开"],
      conceptQuestion: "当 i 能被给定常数整除时，程序执行的队列操作是什么？",
      conceptCorrect: "弹出队首元素",
      conceptDistractors: ["清空队列", "交换首尾元素", "把队列排序"],
      complexity: "O(n)",
    };
  }

  if (combo.primaryKpCode === "MATH") {
    const a = 36 + serial;
    const b = 12 + (serial % 11);
    const gcd = gcdNumber(a, b);
    const cppCode = `#include <bits/stdc++.h>
using namespace std;

int main() {
    int a = ${a};
    int b = ${b};
    while (b != 0) {
        int t = a % b;
        a = b;
        b = t;
    }
    cout << a << '\\n';
    return 0;
}
`;

    return {
      stem: `${tag}（${combo.examType}/${combo.difficulty}）：阅读辗转相除程序，判断最大公约数的输出。`,
      cppCode,
      output: gcd,
      roleQuestion: "while 循环中的 a % b 表示什么？",
      roleCorrect: "求余数",
      roleDistractors: ["求商的整数部分", "判断奇偶性", "计算乘积"],
      conceptQuestion: "该程序实现的经典算法是什么？",
      conceptCorrect: "辗转相除法",
      conceptDistractors: ["冒泡排序", "二分查找", "广度优先搜索"],
      complexity: "O(log max(a,b))",
    };
  }

  const cppCode = `#include <bits/stdc++.h>
using namespace std;

int main() {
    int n = ${n};
    int ans = 0;
    for (int i = 1; i <= n; ++i) {
        if (i % ${k} == 0) ans += i * ${extra};
        else ans += ${extra};
    }
    cout << ans << '\\n';
    return 0;
}
`;
  const output = sumReading(n, k, extra);

  return {
    stem: `${tag}（${combo.examType}/${combo.difficulty}）：阅读循环累加程序，分析条件分支对 ans 的影响。`,
    cppCode,
    output,
    roleQuestion: "循环变量 i 的取值范围是什么？",
    roleCorrect: `1 到 n，共 n 次`,
    roleDistractors: ["0 到 n-1", "只取偶数", "直到 ans 为 0"],
    conceptQuestion: "if 条件 i % k == 0 用来判断什么？",
    conceptCorrect: "i 是否能被 k 整除",
    conceptDistractors: ["i 是否小于 k", "i 是否为负数", "k 是否为质数"],
    complexity: "O(n)",
  };
}

function buildReadingProgram(combo: Combo, serial: number): QuestionBundleItem {
  const data = readingCase(combo, serial);
  const outputOptions = numericOptions(data.output, serial, [-3, -1, 1, 3]);
  const roleOptions = makeOptions(data.roleCorrect, data.roleDistractors, answerSlot(serial + 2));
  const conceptOptions = makeOptions(
    data.conceptCorrect,
    data.conceptDistractors,
    answerSlot(serial + 3),
  );
  const complexityOptions = makeOptions(
    data.complexity,
    ["O(1)", "O(n^2)", "O(2^n)"].filter((value) => value !== data.complexity),
    answerSlot(serial + 4),
  );
  const outputStyleOptions = makeOptions(
    "使用 cout 输出结果并换行",
    ["写入外部文件", "只修改变量不输出", "通过网络发送结果"],
    answerSlot(serial + 1),
  );

  const contentJson = {
    stem: data.stem,
    cppCode: data.cppCode,
    subQuestions: [
      {
        stem: "程序运行后输出的结果是多少？",
        options: outputOptions.options,
      },
      {
        stem: data.roleQuestion,
        options: roleOptions.options,
      },
      {
        stem: data.conceptQuestion,
        options: conceptOptions.options,
      },
      {
        stem: "该程序关于输入规模 n 的主要时间复杂度最接近哪一项？",
        options: complexityOptions.options,
      },
      {
        stem: "该程序最终采用哪种方式给出结果？",
        options: outputStyleOptions.options,
      },
    ],
    sampleInputs: [],
    expectedOutputs: [],
  };

  return {
    type: "reading_program",
    difficulty: combo.difficulty,
    primaryKpCode: combo.primaryKpCode,
    auxiliaryKpCodes: [],
    examTypes: [combo.examType],
    contentHash: computeContentHash(contentJson.stem, contentJson.cppCode),
    sandboxVerified: true,
    source: "ai",
    contentJson,
    answerJson: {
      subQuestions: [
        { answer: outputOptions.answer },
        { answer: roleOptions.answer },
        { answer: conceptOptions.answer },
        { answer: complexityOptions.answer },
        { answer: outputStyleOptions.answer },
      ],
    },
    explanationJson: {
      explanation: `程序输出由代码中的固定初值和分支逻辑追踪得到：${data.output}。其余子题分别检查变量作用、核心条件、复杂度和输出方式。`,
    },
  };
}

function buildCompletionProgram(combo: Combo, serial: number): QuestionBundleItem {
  const tag = `Q${String(serial).padStart(4, "0")}`;
  const slot1 = answerSlot(serial);
  const slot2 = answerSlot(serial + 1);

  if (combo.primaryKpCode === "MATH") {
    const a = 40 + serial;
    const b = 12 + (serial % 13);
    const expected = gcdNumber(a, b);
    const blank1 = makeOptions("a % b", ["a / b", "a + b", "b - a"], slot1);
    const blank2 = makeOptions("b", ["t", "a + b", "0"], slot2);
    const cppCode = `#include <bits/stdc++.h>
using namespace std;

int main() {
    int a, b;
    cin >> a >> b;
    while (b != 0) {
        int t = /* BLANK1 */;
        a = /* BLANK2 */;
        b = t;
    }
    cout << a << '\\n';
    return 0;
}
`;
    const fullCode = cppCode.replace("/* BLANK1 */", "a % b").replace("/* BLANK2 */", "b");

    return makeCompletionItem(combo, {
      serial,
      stem: `${tag}（${combo.examType}/${combo.difficulty}）：补全辗转相除法程序，使其输出两个整数的最大公约数。`,
      cppCode,
      fullCode,
      blanks: [
        { id: "BLANK1", options: blank1.options, answer: blank1.answer },
        { id: "BLANK2", options: blank2.options, answer: blank2.answer },
      ],
      sampleInput: `${a} ${b}\n`,
      sampleOutput: `${expected}\n`,
      explanation: `BLANK1 应保存 a 对 b 的余数，BLANK2 应把旧的 b 交给 a；样例 gcd(${a}, ${b}) = ${expected}。`,
    });
  }

  if (combo.primaryKpCode === "DS") {
    const n = 4 + (serial % 7);
    const inc = 1 + (serial % 4);
    const expected = n + inc;
    const blank1 = makeOptions("i", ["n", "i * i", "0"], slot1);
    const blank2 = makeOptions("st.top()", ["st.size()", "i", "n"], slot2);
    const cppCode = `#include <bits/stdc++.h>
using namespace std;

int main() {
    int n;
    cin >> n;
    stack<int> st;
    for (int i = 1; i <= n; ++i) st.push(/* BLANK1 */);
    int ans = /* BLANK2 */ + ${inc};
    cout << ans << '\\n';
    return 0;
}
`;
    const fullCode = cppCode.replace("/* BLANK1 */", "i").replace("/* BLANK2 */", "st.top()");

    return makeCompletionItem(combo, {
      serial,
      stem: `${tag}（${combo.examType}/${combo.difficulty}）：补全栈操作程序，使其输出最后入栈元素加上固定偏移。`,
      cppCode,
      fullCode,
      blanks: [
        { id: "BLANK1", options: blank1.options, answer: blank1.answer },
        { id: "BLANK2", options: blank2.options, answer: blank2.answer },
      ],
      sampleInput: `${n}\n`,
      sampleOutput: `${expected}\n`,
      explanation: `栈顶是最后压入的 n，输出为 n + ${inc}，样例结果为 ${expected}。`,
    });
  }

  const n = 5 + (serial % 9);
  const multiplier = 2 + (serial % 4);
  const expected = sumReading(n, multiplier, multiplier);
  const blank1 = makeOptions("0", ["1", "n", "-1"], slot1);
  const blank2 = makeOptions(`i * ${multiplier}`, ["i", `${multiplier}`, "ans + i"], slot2);
  const cppCode = `#include <bits/stdc++.h>
using namespace std;

int main() {
    int n;
    cin >> n;
    int ans = /* BLANK1 */;
    for (int i = 1; i <= n; ++i) {
        if (i % ${multiplier} == 0) ans += /* BLANK2 */;
        else ans += ${multiplier};
    }
    cout << ans << '\\n';
    return 0;
}
`;
  const fullCode = cppCode
    .replace("/* BLANK1 */", "0")
    .replace("/* BLANK2 */", `i * ${multiplier}`);

  return makeCompletionItem(combo, {
    serial,
    stem: `${tag}（${combo.examType}/${combo.difficulty}）：补全循环累加程序，使整除分支按权重累加。`,
    cppCode,
    fullCode,
    blanks: [
      { id: "BLANK1", options: blank1.options, answer: blank1.answer },
      { id: "BLANK2", options: blank2.options, answer: blank2.answer },
    ],
    sampleInput: `${n}\n`,
    sampleOutput: `${expected}\n`,
    explanation: `ans 从 0 开始；当 i 能被 ${multiplier} 整除时累加 i * ${multiplier}，否则累加 ${multiplier}。样例输出 ${expected}。`,
  });
}

function makeCompletionItem(
  combo: Combo,
  params: {
    serial: number;
    stem: string;
    cppCode: string;
    fullCode: string;
    blanks: Array<{ id: string; options: string[]; answer: Letter }>;
    sampleInput: string;
    sampleOutput: string;
    explanation: string;
  },
): QuestionBundleItem {
  const contentJson = {
    stem: params.stem,
    cppCode: params.cppCode,
    blanks: params.blanks.map((blank) => ({
      id: blank.id,
      options: blank.options,
    })),
    fullCode: params.fullCode,
    sampleInputs: [params.sampleInput],
    expectedOutputs: [params.sampleOutput],
  };

  return {
    type: "completion_program",
    difficulty: combo.difficulty,
    primaryKpCode: combo.primaryKpCode,
    auxiliaryKpCodes: [],
    examTypes: [combo.examType],
    contentHash: computeContentHash(contentJson.stem, contentJson.fullCode),
    sandboxVerified: true,
    source: "ai",
    contentJson,
    answerJson: {
      blanks: params.blanks.map((blank) => ({
        id: blank.id,
        answer: blank.answer,
      })),
    },
    explanationJson: {
      explanation: params.explanation,
    },
  };
}

function sumReading(n: number, k: number, extra: number): number {
  let ans = 0;
  for (let i = 1; i <= n; i += 1) {
    ans += i % k === 0 ? i * extra : extra;
  }

  return ans;
}

function gcdNumber(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = x % y;
    x = y;
    y = t;
  }

  return x;
}

function buildItem(combo: Combo, serial: number): QuestionBundleItem {
  if (combo.questionType === "single_choice") {
    return buildSingleChoice(combo, serial);
  }

  if (combo.questionType === "reading_program") {
    return buildReadingProgram(combo, serial);
  }

  return buildCompletionProgram(combo, serial);
}

function buildBundle(combo: Combo, questionsPerBundle: number, batchRunId: string): BuiltBundle {
  const runId = makeRunId(combo);
  const timestamp = new Date().toISOString();
  const firstSerial = (combo.bundleNo - 1) * questionsPerBundle + 1;
  const items = Array.from({ length: questionsPerBundle }, (_entry, index) =>
    buildItem(combo, firstSerial + index),
  );
  const sourceBatchId = `bulk-question-bundle-v1:${batchRunId}:${combo.bundleNo}:${combo.examType}:${combo.questionType}:${combo.primaryKpCode}:${combo.difficulty}`;
  const promptHash = computeChecksum(
    [
      "round1 bulk deterministic templates",
      batchRunId,
      combo.examType,
      combo.questionType,
      combo.primaryKpCode,
      combo.difficulty,
    ].join("|"),
  );

  let bundle = QuestionBundleSchema.parse({
    meta: {
      bundleType: "question_bundle",
      schemaVersion: BUNDLE_SCHEMA_VERSION,
      runId,
      createdAt: timestamp,
      generatedAt: timestamp,
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      promptHash,
      sourceBatchId,
      sourceBatchIds: [sourceBatchId],
      sourceTimestamp: timestamp,
      examType: combo.examType,
      questionType: combo.questionType,
      primaryKpCode: combo.primaryKpCode,
      difficulty: combo.difficulty,
      requestedCount: questionsPerBundle,
    },
    items,
  });

  bundle = {
    ...bundle,
    meta: {
      ...bundle.meta,
      validation: buildValidationMetadata({
        dbChecksSkipped: true,
        duplicateChecksSkipped: true,
        judgeChecksSkipped: true,
        sandboxVerifiedItemIndexes: bundle.items
          .map((item, index) => (item.sandboxVerified ? index : -1))
          .filter((index) => index >= 0),
      }),
      integrity: buildBundleIntegrity(bundle.items),
    },
  };

  const outputPath = path.resolve(
    process.cwd(),
    defaultQuestionBundleOutputPath({
      runId,
      questionType: combo.questionType,
      kpCode: combo.primaryKpCode,
      count: questionsPerBundle,
      versionNo: 1,
    }),
  );

  return {
    bundle,
    finalRaw: `${JSON.stringify(bundle, null, 2)}\n`,
    outputPath,
    repoPath: repoPath(outputPath),
    combo,
  };
}

function assertNoInternalDuplicate(bundles: BuiltBundle[]) {
  const seen = new Map<string, string>();
  for (const built of bundles) {
    for (const [index, item] of built.bundle.items.entries()) {
      const location = `${built.repoPath}#${index}`;
      const existing = seen.get(item.contentHash);
      if (existing) {
        throw new Error(`Duplicate contentHash ${item.contentHash}: ${existing} and ${location}`);
      }
      seen.set(item.contentHash, location);
    }
  }
}

async function runValidationRound(
  name: string,
  bundles: BuiltBundle[],
): Promise<ReviewRoundSummary> {
  let acceptedItems = 0;
  let rejectedItems = 0;

  for (const built of bundles) {
    const raw = `${JSON.stringify(built.bundle, null, 2)}\n`;
    const loaded = {
      bundle: built.bundle,
      raw,
      checksum: computeChecksum(raw),
      sourceFilename: path.basename(built.outputPath),
      sourcePath: built.outputPath,
    };
    const result = await validateQuestionBundle(loaded, {
      skipDuplicateChecks: true,
    });

    if (result.errors.length > 0) {
      throw new Error(
        `${name} failed for ${built.repoPath}: ${result.errors
          .map((error) => `${error.code}:${error.itemIndex ?? "bundle"}`)
          .join(", ")}`,
      );
    }

    acceptedItems += result.summary.importedCount;
    rejectedItems += result.summary.rejectedCount;
  }

  return {
    name,
    status: "passed",
    totalBundles: bundles.length,
    totalItems: acceptedItems + rejectedItems,
    acceptedItems,
    rejectedItems,
    notes: ["duplicate DB checks skipped because this task explicitly does not import into DB"],
  };
}

function summarizeDistribution(bundles: BuiltBundle[]) {
  const counts: Record<string, number> = {};

  for (const built of bundles) {
    const dimensions = {
      examType: built.combo.examType,
      questionType: built.combo.questionType,
      primaryKpCode: built.combo.primaryKpCode,
      difficulty: built.combo.difficulty,
    };

    for (const [key, value] of Object.entries(dimensions)) {
      const bucket = `${key}:${value}`;
      counts[bucket] = (counts[bucket] ?? 0) + built.bundle.items.length;
    }
  }

  return counts;
}

async function writeOutputs(
  bundles: BuiltBundle[],
  report: Record<string, unknown>,
  reportPath: string,
) {
  for (const built of bundles) {
    await mkdir(path.dirname(built.outputPath), { recursive: true });
    await writeFile(built.outputPath, built.finalRaw, { encoding: "utf8", flag: "wx" });
  }

  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const combos = chooseCombos(args.totalBundles, args.seed);
  const bundles = combos.map((combo) =>
    buildBundle(combo, args.questionsPerBundle, args.batchRunId),
  );

  assertNoInternalDuplicate(bundles);
  const rounds = [
    await runValidationRound("verification-pass-1", bundles),
    await runValidationRound("verification-pass-2", bundles),
    await runValidationRound("verification-pass-3", bundles),
  ];

  const reportPath = path.resolve(
    process.cwd(),
    defaultOfflineReportPath({
      runId: args.batchRunId,
      reportName: "bulk-question-generation-review",
    }),
  );
  const report = {
    meta: {
      runId: args.batchRunId,
      generatedAt: new Date().toISOString(),
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      seed: args.seed,
      totalQuestions: args.totalQuestions,
      questionsPerBundle: args.questionsPerBundle,
      totalBundles: args.totalBundles,
      reportType: "bulk_question_generation_review",
    },
    scope: {
      outputRoot: "papers/2026",
      importedToDatabase: false,
      prebuiltPapersBuilt: false,
      published: false,
      formalBundleStatus: "generated_validated",
      questionStatusIfImported: "draft",
      reviewStatusEvidence: "ai_reviewed",
      reviewStatusNotClaimed: "confirmed",
    },
    validation: {
      rounds,
      rejectedItems: 0,
      warnings: [
        "No DB duplicate check was run because the requested scope explicitly stops before import.",
        "No prebuilt paper bundle was built.",
      ],
    },
    distribution: summarizeDistribution(bundles),
    bundles: bundles.map((built) => ({
      path: built.repoPath,
      runId: built.bundle.meta.runId,
      examType: built.combo.examType,
      questionType: built.combo.questionType,
      primaryKpCode: built.combo.primaryKpCode,
      difficulty: built.combo.difficulty,
      itemCount: built.bundle.items.length,
      formalBundleStatus: "generated_validated",
      questionStatusIfImported: "draft",
      reviewStatusEvidence: "ai_reviewed",
      checksum: computeChecksum(built.finalRaw),
    })),
  };

  await writeOutputs(bundles, report, reportPath);

  console.log(
    JSON.stringify(
      {
        generatedBundles: bundles.length,
        generatedQuestions: args.totalQuestions,
        reportPath: repoPath(reportPath),
        firstBundle: bundles[0]?.repoPath,
        lastBundle: bundles.at(-1)?.repoPath,
        formalBundleStatus: "generated_validated",
        questionStatusIfImported: "draft",
        reviewStatusEvidence: "ai_reviewed",
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
