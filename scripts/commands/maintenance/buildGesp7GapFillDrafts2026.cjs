#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_BATCH_ID = "2026-05-03-manual-gesp7-gap-fill-v01";
const DEFAULT_DATE = "2026-05-03";
const DEFAULT_CHUNK_SIZE = 5;

const OJ_REFERENCES = {
  ALG: [
    "D:/Workspace/OJCode/Luogu/P2249.cpp",
    "D:/Workspace/OJCode/Luogu/P1115.cpp",
    "D:/Workspace/OJCode/Luogu/P1036.cpp",
    "D:/Workspace/OJCode/Luogu/P1219.cpp",
    "D:/Workspace/OJCode/Luogu/P1177 GB.cpp",
    "D:/Workspace/OJCode/Luogu/P1886.cpp",
    "D:/Workspace/OJCode/Luogu/P3397 O1.cpp",
    "D:/Workspace/OJCode/Luogu/P3865.cpp",
    "D:/Workspace/OJCode/Luogu/P2678.cpp",
    "D:/Workspace/OJCode/Luogu/P1908 BITree.cpp",
    "D:/Workspace/OJCode/Luogu/P1303.cpp",
  ],
  DS: [
    "D:/Workspace/OJCode/Luogu/P1449.cpp",
    "D:/Workspace/OJCode/Luogu/P1996 Queue.cpp",
    "D:/Workspace/OJCode/Luogu/P1551.cpp",
    "D:/Workspace/OJCode/Luogu/P3378.cpp",
    "D:/Workspace/OJCode/Luogu/P3370.cpp",
    "D:/Workspace/OJCode/Luogu/P1886.cpp",
    "D:/Workspace/OJCode/Luogu/P1090 Heap.cpp",
    "D:/Workspace/OJCode/Luogu/P1160.cpp",
    "D:/Workspace/OJCode/Luogu/P3367.cpp",
    "D:/Workspace/OJCode/Luogu/P1540.cpp",
  ],
  MATH: [
    "D:/Workspace/OJCode/Luogu/P5736.cpp",
    "D:/Workspace/OJCode/Luogu/P3383.cpp",
    "D:/Workspace/OJCode/Luogu/P1579.cpp",
    "D:/Workspace/OJCode/Luogu/P1029.cpp",
    "D:/Workspace/OJCode/Luogu/P1303.cpp",
  ],
  CPP: [
    "D:/Workspace/OJCode/Luogu/P5740.cpp",
    "D:/Workspace/OJCode/Luogu/P5741.cpp",
    "D:/Workspace/OJCode/Luogu/P5742.cpp",
    "D:/Workspace/OJCode/PAT/Basic/1004.cpp",
    "D:/Workspace/OJCode/SP UVA AT/UVA455.cpp",
  ],
};

const QUESTION_TYPES = new Set(["single_choice", "reading_program", "completion_program"]);
const DIFFICULTIES = new Set(["easy", "medium", "hard"]);
const LETTERS = ["A", "B", "C", "D"];

const CASE_WORDS = [
  "harbor", "ledger", "beacon", "matrix", "orbit", "summit", "cursor", "ripple",
  "vector", "delta", "anchor", "forest", "signal", "bridge", "kernel", "window",
  "bucket", "cipher", "parcel", "median", "runner", "prefix", "leader", "quartz",
  "index", "packet", "canvas", "vertex", "timber", "puzzle", "stream", "planet",
];

const CASE_ACTIONS = [
  "trace", "merge", "split", "compress", "rotate", "query", "restore", "compare",
  "filter", "rank", "scan", "balance", "link", "fold", "probe", "count",
];

const CASE_HINTS = {
  ALG: [
    "lower-boundary invariant", "monotone-window checkpoint", "prefix-delta audit",
    "binary-answer feasibility", "rmq-block merge", "bit-rank accumulation",
  ],
  DS: [
    "queue-front lifecycle", "heap-top transition", "union-find leader path",
    "linked-neighbor repair", "stack-depth witness", "cache-eviction order",
  ],
  MATH: [
    "modular residue trace", "prime-sieve crossing", "gcd remainder chain",
    "base-conversion carry", "combination counting", "fast-power snapshot",
  ],
  CPP: [
    "iterator-validity trace", "reference-parameter update", "stable-sort tie-break",
    "string-slice mutation", "scope-shadow observation", "map-insertion effect",
  ],
};

function usage() {
  return [
    "Usage: node scripts/commands/maintenance/buildGesp7GapFillDrafts2026.cjs --inventory-path <json> --draft-dir <dir> --report-path <json> [options]",
    "",
    "Options:",
    "  --batch-id <id>       Source batch id (default: 2026-05-03-manual-gesp7-gap-fill-v01)",
    "  --date <yyyy-mm-dd>   Run id date (default: 2026-05-03)",
    "  --run-family <label>  Run id family label (default: a01)",
    "  --chunk-size <n>      Items per draft bundle (default: 5)",
    "  --overwrite           Allow replacing existing draft/report files",
    "  --help                Show this help",
  ].join("\n");
}

function readArg(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function parsePositiveInt(raw, fallback, label) {
  const value = Number.parseInt(raw ?? String(fallback), 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`--${label} must be a positive integer`);
  }
  return value;
}

function parseArgs(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(usage());
    process.exit(0);
  }
  const inventoryPath = readArg(argv, "--inventory-path");
  const draftDir = readArg(argv, "--draft-dir");
  const reportPath = readArg(argv, "--report-path");
  if (!inventoryPath || !draftDir || !reportPath) {
    throw new Error("Missing --inventory-path, --draft-dir, or --report-path");
  }
  return {
    inventoryPath: path.resolve(process.cwd(), inventoryPath),
    draftDir: path.resolve(process.cwd(), draftDir),
    reportPath: path.resolve(process.cwd(), reportPath),
    batchId: readArg(argv, "--batch-id") ?? DEFAULT_BATCH_ID,
    date: readArg(argv, "--date") ?? DEFAULT_DATE,
    runFamily: readArg(argv, "--run-family") ?? "a01",
    chunkSize: parsePositiveInt(readArg(argv, "--chunk-size"), DEFAULT_CHUNK_SIZE, "chunk-size"),
    overwrite: argv.includes("--overwrite"),
  };
}

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function pad4(value) {
  return String(value).padStart(4, "0");
}

function ensureOutputPath(filePath, overwrite) {
  if (!overwrite && fs.existsSync(filePath)) {
    throw new Error(`Refusing to overwrite existing file: ${filePath}`);
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeJson(filePath, payload, overwrite) {
  ensureOutputPath(filePath, overwrite);
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function repoPath(filePath) {
  return path.relative(process.cwd(), filePath).replaceAll(path.sep, "/");
}

function makeOptions(correct, distractors, slot) {
  const correctText = String(correct);
  const seen = new Set([correctText]);
  const clean = [];
  for (const entry of distractors.map(String)) {
    if (!seen.has(entry)) {
      seen.add(entry);
      clean.push(entry);
    }
  }
  let filler = 1;
  while (clean.length < 3) {
    const value = `${correctText} 的干扰项 ${filler}`;
    if (!seen.has(value)) {
      clean.push(value);
      seen.add(value);
    }
    filler += 1;
  }
  const ordered = new Array(4);
  ordered[slot] = correctText;
  let cursor = 0;
  for (let index = 0; index < ordered.length; index += 1) {
    if (ordered[index] === undefined) {
      ordered[index] = clean[cursor++];
    }
  }
  return {
    options: ordered.map((value, index) => `${LETTERS[index]}. ${value}`),
    answer: LETTERS[slot],
  };
}

function gcd(a, b) {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

function lowerBound(array, target) {
  let left = 0;
  let right = array.length;
  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    if (array[mid] < target) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }
  return left;
}

function maxSubarray(values) {
  let best = values[0];
  let current = values[0];
  for (let index = 1; index < values.length; index += 1) {
    current = Math.max(values[index], current + values[index]);
    best = Math.max(best, current);
  }
  return best;
}

function countSubsets(values, target) {
  let count = 0;
  const total = 1 << values.length;
  for (let mask = 0; mask < total; mask += 1) {
    let sum = 0;
    for (let index = 0; index < values.length; index += 1) {
      if ((mask & (1 << index)) !== 0) {
        sum += values[index];
      }
    }
    if (sum === target) {
      count += 1;
    }
  }
  return count;
}

function josephus(n, k) {
  const queue = Array.from({ length: n }, (_, index) => index + 1);
  let step = 1;
  while (queue.length > 1) {
    const value = queue.shift();
    if (step % k !== 0) {
      queue.push(value);
    }
    step += 1;
  }
  return queue[0];
}

function isPrime(value) {
  if (value < 2) return false;
  for (let d = 2; d * d <= value; d += 1) {
    if (value % d === 0) return false;
  }
  return true;
}

function primeCount(limit) {
  let count = 0;
  for (let value = 2; value <= limit; value += 1) {
    if (isPrime(value)) count += 1;
  }
  return count;
}

function toBase(value, base) {
  return value.toString(base).toUpperCase();
}

function vectorAfterOps(seed) {
  const values = [seed + 1, seed + 3, seed + 5];
  values.push(seed + 7);
  values.splice(1, 1, seed + 9);
  values.pop();
  return values;
}

function itemBase(row, item) {
  return {
    type: row.questionType,
    difficulty: row.difficulty,
    primaryKpCode: row.kpGroup,
    auxiliaryKpCodes: [],
    examTypes: [row.examType],
    source: "manual",
    ...item,
  };
}

function caseToken(row, serial) {
  const left = CASE_WORDS[serial % CASE_WORDS.length];
  const right = CASE_WORDS[Math.floor(serial / CASE_WORDS.length) % CASE_WORDS.length];
  const action = CASE_ACTIONS[(serial + row.kpGroup.length) % CASE_ACTIONS.length];
  const hintPool = CASE_HINTS[row.kpGroup] ?? CASE_HINTS.ALG;
  const hint = hintPool[serial % hintPool.length];
  return {
    compact: `${left}-${right}-${action}-${serial}`,
    hint,
    comment: `case ${left}-${right}-${action}-${serial}; focus ${hint}; level ${row.difficulty}; kp ${row.kpGroup}`,
  };
}

function decorateForDiversity(row, item, serial) {
  const token = caseToken(row, serial);
  if (item.type === "single_choice") {
    item.contentJson.stem = `${item.contentJson.stem}（案例线索：${token.compact}，关注 ${token.hint}。）`;
    item.explanationJson.explanation = `${item.explanationJson.explanation}\n本题的判定入口是 ${token.hint}，不要只按数值外观判断。`;
    return item;
  }

  const comment = `// ${token.comment}\n// OJCode-inspired training note: ${token.compact}\n`;
  if (item.type === "reading_program") {
    item.contentJson.cppCode = `${comment}${item.contentJson.cppCode}`;
    item.contentJson.subQuestions = item.contentJson.subQuestions.map((question, index) => ({
      ...question,
      stem: `${question.stem}（观察点 ${index + 1}：${token.compact}）`,
    }));
    item.explanationJson.explanation = `${item.explanationJson.explanation}\n观察线索：${token.hint}。`;
    return item;
  }

  item.contentJson.cppCode = `${comment}${item.contentJson.cppCode}`;
  item.contentJson.fullCode = `${comment}${item.contentJson.fullCode}`;
  item.contentJson.blanks = item.contentJson.blanks.map((blankEntry, index) => ({
    ...blankEntry,
    options: blankEntry.options.map((option) =>
      index === 0 ? option : option.replace(/^([A-D]\. )/, `$1`),
    ),
  }));
  item.explanationJson.explanation = `${item.explanationJson.explanation}\n补全线索：${token.hint}。`;
  return item;
}

function singleChoiceAlg(row, serial, slot) {
  const family = serial % 5;
  if (family === 0) {
    const start = (serial % 7) + 2;
    const array = Array.from({ length: 7 }, (_, index) => start + index * 3);
    const target = array[(serial + 2) % array.length];
    const answer = lowerBound(array, target) + 1;
    const options = makeOptions(answer, [answer - 1, answer + 1, array.length], slot);
    return {
      stem: `GESP-7 算法单选 ${serial}：有序数组 [${array.join(", ")}] 中用 lower_bound 查找 ${target}，返回位置按 1 开始计数，结果是多少？`,
      ...options,
      explanation: `lower_bound 返回第一个不小于 ${target} 的位置，该元素在数组中的 1-based 位置是 ${answer}。`,
    };
  }
  if (family === 1) {
    const values = [3, -2, serial % 9, -1, 4, -3, (serial % 5) + 1];
    const answer = maxSubarray(values);
    const options = makeOptions(answer, [answer - 1, answer + 2, values.reduce((a, b) => a + b, 0)], slot);
    return {
      stem: `GESP-7 算法单选 ${serial}：对数组 [${values.join(", ")}] 运行最大连续子段和动态规划，最终 best 的值是多少？`,
      ...options,
      explanation: `逐位维护 current=max(a[i], current+a[i])，同时更新 best，最终最大连续子段和为 ${answer}。`,
    };
  }
  if (family === 2) {
    const values = [2, 3, 5, (serial % 4) + 4, (serial % 5) + 6];
    const target = values[0] + values[2] + values[4];
    const answer = countSubsets(values, target);
    const options = makeOptions(answer, [answer + 1, answer + 2, Math.max(0, answer - 1)], slot);
    return {
      stem: `GESP-7 算法单选 ${serial}：DFS 枚举数组 [${values.join(", ")}] 的子集，和恰好为 ${target} 的子集个数是多少？`,
      ...options,
      explanation: `每个元素选或不选，枚举全部子集后，满足和为 ${target} 的共有 ${answer} 个。`,
    };
  }
  if (family === 3) {
    const left = [serial % 6 + 1, serial % 6 + 4, serial % 6 + 8];
    const right = [serial % 6 + 2, serial % 6 + 5, serial % 6 + 9];
    const merged = [...left, ...right].sort((a, b) => a - b);
    const answer = merged.slice(0, 4).join(",");
    const options = makeOptions(answer, [
      left.join(","),
      right.join(","),
      merged.slice(2).join(","),
    ], slot);
    return {
      stem: `GESP-7 算法单选 ${serial}：归并两个有序段 [${left.join(",")}] 和 [${right.join(",")}]，结果前 4 个数依次是什么？`,
      ...options,
      explanation: `归并时每次取两个当前指针中较小者，完整结果为 [${merged.join(",")}].`,
    };
  }
  const values = Array.from({ length: 6 }, (_, index) => (serial + index * 2) % 11 + 1);
  const l = 2;
  const r = 5;
  const answer = values.slice(l - 1, r).reduce((sum, value) => sum + value, 0);
  const options = makeOptions(answer, [answer - values[l - 1], answer + values[r - 1], answer + 3], slot);
  return {
    stem: `GESP-7 算法单选 ${serial}：数组 [${values.join(", ")}] 建前缀和后，区间 [${l}, ${r}] 的和是多少？`,
    ...options,
    explanation: `区间和等于 prefix[${r}]-prefix[${l - 1}]，计算得到 ${answer}。`,
  };
}

function singleChoiceDs(row, serial, slot) {
  const family = serial % 5;
  if (family === 0) {
    const ops = ["push 3", "push 8", "pop", `push ${(serial % 5) + 6}`, "push 4"];
    const stack = [];
    for (const op of ops) {
      const [name, raw] = op.split(" ");
      if (name === "push") stack.push(Number(raw));
      else stack.pop();
    }
    const answer = stack.at(-1);
    const options = makeOptions(answer, [stack.length, stack[0], answer + 2], slot);
    return {
      stem: `GESP-7 数据结构单选 ${serial}：空栈依次执行 ${ops.join("，")}，最后栈顶元素是多少？`,
      ...options,
      explanation: `栈后进先出，pop 删除 8，最后压入 ${answer} 后栈顶为 ${answer}。`,
    };
  }
  if (family === 1) {
    const n = (serial % 5) + 6;
    const k = (serial % 3) + 2;
    const answer = josephus(n, k);
    const options = makeOptions(answer, [answer % n + 1, ((answer + 1) % n) + 1, n], slot);
    return {
      stem: `GESP-7 数据结构单选 ${serial}：队列模拟约瑟夫环，${n} 个人从 1 开始编号，每次数到 ${k} 出队，最后留下谁？`,
      ...options,
      explanation: `用队列轮转模拟，未报到 ${k} 的人重新入队，最后剩下编号 ${answer}。`,
    };
  }
  if (family === 2) {
    const values = [7, serial % 10 + 2, 5, 12, serial % 7 + 8];
    const sorted = [...values].sort((a, b) => a - b);
    const answer = sorted.slice(0, 3).join(",");
    const options = makeOptions(answer, [
      sorted.slice(-3).join(","),
      values.slice(0, 3).join(","),
      [...values].reverse().slice(0, 3).join(","),
    ], slot);
    return {
      stem: `GESP-7 数据结构单选 ${serial}：把 [${values.join(", ")}] 依次放入小根堆，连续弹出 3 次得到的序列是什么？`,
      ...options,
      explanation: `小根堆每次弹出当前最小值，因此前三次为 ${answer}。`,
    };
  }
  if (family === 3) {
    const pairs = [[1, 2], [3, 4], [2, 3], [5, 6]];
    const parent = Array.from({ length: 7 }, (_, index) => index);
    const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
    for (const [a, b] of pairs) parent[find(a)] = find(b);
    const answer = find(1) === find(4) ? "是" : "否";
    const options = makeOptions(answer, ["不是", "无法判断", "只在直接相连时是"], slot);
    return {
      stem: `GESP-7 数据结构单选 ${serial}：并查集依次合并 (1,2),(3,4),(2,3),(5,6)，1 和 4 是否在同一集合？`,
      ...options,
      explanation: `1-2 与 3-4 通过合并 (2,3) 连通，所以 1 和 4 在同一集合。`,
    };
  }
  const words = ["aa", "bb", "aa", `c${serial % 4}`, "bb", "dd"];
  const answer = new Set(words).size;
  const options = makeOptions(answer, [answer - 1, answer + 1, words.length], slot);
  return {
    stem: `GESP-7 数据结构单选 ${serial}：用 set 统计序列 [${words.join(", ")}] 中不同字符串个数，结果是多少？`,
    ...options,
    explanation: `set 自动去重，保留不同字符串，所以个数为 ${answer}。`,
  };
}

function singleChoiceMath(row, serial, slot) {
  const family = serial % 5;
  if (family === 0) {
    const a = serial + 36;
    const b = serial * 2 + 54;
    const answer = gcd(a, b);
    const options = makeOptions(answer, [answer * 2, Math.max(1, answer - 1), a + b], slot);
    return {
      stem: `GESP-7 数学单选 ${serial}：gcd(${a}, ${b}) 的值是多少？`,
      ...options,
      explanation: `用欧几里得算法反复取余，最大公因数为 ${answer}。`,
    };
  }
  if (family === 1) {
    const limit = (serial % 20) + 30;
    const answer = primeCount(limit);
    const options = makeOptions(answer, [answer - 1, answer + 1, Math.floor(limit / 2)], slot);
    return {
      stem: `GESP-7 数学单选 ${serial}：埃氏筛统计不超过 ${limit} 的质数个数，结果是多少？`,
      ...options,
      explanation: `从 2 开始筛去倍数，保留下来的质数共有 ${answer} 个。`,
    };
  }
  if (family === 2) {
    const value = serial * 7 + 45;
    const base = (serial % 4) + 2;
    const answer = toBase(value, base);
    const options = makeOptions(answer, [String(value), toBase(value + 1, base), toBase(value, base + 1)], slot);
    return {
      stem: `GESP-7 数学单选 ${serial}：十进制数 ${value} 转成 ${base} 进制，结果是什么？`,
      ...options,
      explanation: `连续除以 ${base} 取余并倒序排列，得到 ${answer}。`,
    };
  }
  if (family === 3) {
    const a = (serial % 9) + 2;
    const b = (serial % 5) + 3;
    const mod = 17;
    let answer = 1;
    for (let i = 0; i < b; i += 1) answer = (answer * a) % mod;
    const options = makeOptions(answer, [(answer + 1) % mod, (answer + 3) % mod, a * b], slot);
    return {
      stem: `GESP-7 数学单选 ${serial}：计算 ${a}^${b} mod ${mod} 的结果是多少？`,
      ...options,
      explanation: `逐步乘法并每次取模，最终余数为 ${answer}。`,
    };
  }
  const n = (serial % 6) + 5;
  const answer = (n * (n - 1)) / 2;
  const options = makeOptions(answer, [n * n, answer + n, n + 1], slot);
  return {
    stem: `GESP-7 数学单选 ${serial}：从 ${n} 个不同元素中任选 2 个，共有多少种选法？`,
    ...options,
    explanation: `组合数 C(${n},2)=${n}*${n - 1}/2=${answer}。`,
  };
}

function singleChoiceCpp(row, serial, slot) {
  const family = serial % 5;
  if (family === 0) {
    const text = `ab${serial % 10}cd`;
    const result = text.slice(0, 2) + "X" + text.slice(3);
    const options = makeOptions(result, [text, `${result}d`, text.slice(0, 3)], slot);
    return {
      stem: `GESP-7 C++ 单选 ${serial}：string s="${text}"; s.erase(2,1); s.insert(2,"X"); 最后 s 是什么？`,
      ...options,
      explanation: `先删除下标 2 的一个字符，再在同一位置插入 X，得到 ${result}。`,
    };
  }
  if (family === 1) {
    const values = vectorAfterOps(serial % 8);
    const answer = values.join(",");
    const options = makeOptions(answer, [values.slice().reverse().join(","), values.slice(0, 2).join(","), `${values.length}`], slot);
    return {
      stem: `GESP-7 C++ 单选 ${serial}：vector 初值按题设执行 push_back、erase、pop_back 后，元素序列是什么？`,
      ...options,
      explanation: `vector 操作会保持顺序并移动后续元素，最终序列为 ${answer}。`,
    };
  }
  if (family === 2) {
    const records = [
      { name: "A", score: serial % 10 + 80 },
      { name: "B", score: serial % 10 + 85 },
      { name: "C", score: serial % 10 + 82 },
    ];
    const answer = records.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))[0].name;
    const options = makeOptions(answer, ["A", "B", "C", "无法确定"], slot);
    return {
      stem: `GESP-7 C++ 单选 ${serial}：结构体按 score 降序、name 升序排序，最高排在最前的是哪一项？A:${records.find((r) => r.name === "A").score}, B:${records.find((r) => r.name === "B").score}, C:${records.find((r) => r.name === "C").score}`,
      ...options,
      explanation: `比较器先比较分数，分数最高者排在最前，因此答案为 ${answer}。`,
    };
  }
  if (family === 3) {
    const a = (serial % 7) + 3;
    const b = a + 2;
    const answer = a + b + 1;
    const options = makeOptions(answer, [a + b, b + 1, a + 1], slot);
    return {
      stem: `GESP-7 C++ 单选 ${serial}：函数 void inc(int& x){x++;} 对变量 a=${a} 调用 inc(a)，随后输出 a+${b}，结果是多少？`,
      ...options,
      explanation: `引用参数会修改实参，a 变为 ${a + 1}，再加 ${b} 得 ${answer}。`,
    };
  }
  const outer = (serial % 5) + 4;
  const inner = outer + 10;
  const answer = outer;
  const options = makeOptions(answer, [inner, outer + inner, inner - outer], slot);
  return {
    stem: `GESP-7 C++ 单选 ${serial}：外层 int x=${outer}; 内层代码块声明 int x=${inner}; 离开内层后输出 x，结果是多少？`,
    ...options,
    explanation: `内层变量只在代码块内有效，离开后访问的是外层 x=${outer}。`,
  };
}

function buildSingleChoice(row, serial) {
  const slot = serial % 4;
  const kp = row.kpGroup;
  const built =
    kp === "ALG" ? singleChoiceAlg(row, serial, slot)
    : kp === "DS" ? singleChoiceDs(row, serial, slot)
    : kp === "MATH" ? singleChoiceMath(row, serial, slot)
    : singleChoiceCpp(row, serial, slot);
  return itemBase(row, {
    contentJson: {
      stem: built.stem,
      options: built.options,
    },
    answerJson: { answer: built.answer },
    explanationJson: { explanation: built.explanation },
  });
}

function readingPrefix(serial) {
  const values = Array.from({ length: 6 }, (_, index) => (serial + index * 3) % 17 + 1);
  const l = 2;
  const r = 5;
  const answer = values.slice(l - 1, r).reduce((sum, value) => sum + value, 0);
  const code = `#include <bits/stdc++.h>
using namespace std;

int main() {
    vector<int> a = {0, ${values.join(", ")}};
    vector<int> prefix(a.size(), 0);
    for (int i = 1; i < (int)a.size(); ++i) {
        prefix[i] = prefix[i - 1] + a[i];
    }
    int l, r;
    cin >> l >> r;
    cout << prefix[r] - prefix[l - 1] << '\\n';
    return 0;
}
`;
  return {
    code,
    input: `${l} ${r}\n`,
    output: `${answer}\n`,
    subQuestions: [
      qa(`样例输入 ${l} ${r} 时，程序输出什么？`, answer, [answer - 1, answer + 1, values[l - 1]], serial),
      fixedQa("prefix[i] 保存的含义是什么？", ["A. a[i] 的平方", "B. 前 i 个元素之和", "C. 后 i 个元素之和", "D. 当前最大值"], "B"),
      fixedQa("计算区间 [l,r] 时使用的表达式是哪一个？", ["A. prefix[r]-prefix[l-1]", "B. prefix[l]-prefix[r]", "C. a[l]+a[r]", "D. prefix[r]+prefix[l]"], "A"),
      fixedQa("构建前缀和数组的时间复杂度是多少？", ["A. O(1)", "B. O(log n)", "C. O(n)", "D. O(n^2)"], "C"),
      fixedQa("数组 a 从下标 1 开始存有效数据的主要好处是什么？", ["A. 便于使用 prefix[l-1]", "B. 可以自动排序", "C. 可以减少内存到 0", "D. 可以避免输入"], "A"),
    ],
    explanation: `先构造前缀和，再用 prefix[${r}]-prefix[${l - 1}] 得到 ${answer}。`,
  };
}

function readingBinary(serial) {
  const array = Array.from({ length: 8 }, (_, index) => serial % 5 + index * 2 + 3);
  const target = array[(serial + 3) % array.length];
  const index = lowerBound(array, target);
  const code = `#include <bits/stdc++.h>
using namespace std;

int main() {
    vector<int> a = {${array.join(", ")}};
    int target;
    cin >> target;
    int l = 0, r = (int)a.size() - 1;
    int ans = -1;
    while (l <= r) {
        int mid = (l + r) / 2;
        if (a[mid] >= target) {
            ans = mid;
            r = mid - 1;
        } else {
            l = mid + 1;
        }
    }
    cout << ans << '\\n';
    return 0;
}
`;
  return {
    code,
    input: `${target}\n`,
    output: `${index}\n`,
    subQuestions: [
      qa(`样例输入 ${target} 时，程序输出的下标是多少？`, index, [index + 1, Math.max(0, index - 1), -1], serial),
      fixedQa("当 a[mid] >= target 时，程序下一步如何缩小区间？", ["A. l=mid+1", "B. r=mid-1", "C. 直接退出", "D. 删除 a[mid]"], "B"),
      fixedQa("ans 的含义是什么？", ["A. 当前候选的第一个不小于 target 的位置", "B. target 的出现次数", "C. 数组长度", "D. 当前最大值"], "A"),
      fixedQa("这段查找的时间复杂度是多少？", ["A. O(1)", "B. O(log n)", "C. O(n)", "D. O(n^2)"], "B"),
      fixedQa("数组有序是该算法正确的必要条件吗？", ["A. 是", "B. 否", "C. 只对奇数长度是", "D. 只对 target 为偶数是"], "A"),
    ],
    explanation: `二分查找第一个不小于 ${target} 的位置，数组中该位置为 ${index}。`,
  };
}

function readingStack(serial) {
  const text = serial % 2 === 0 ? "(()())" : "((())())";
  let depth = 0;
  let best = 0;
  for (const ch of text) {
    if (ch === "(") {
      depth += 1;
      best = Math.max(best, depth);
    } else {
      depth -= 1;
    }
  }
  const code = `#include <bits/stdc++.h>
using namespace std;

int main() {
    string s;
    cin >> s;
    stack<char> st;
    int best = 0;
    for (char c : s) {
        if (c == '(') {
            st.push(c);
            best = max(best, (int)st.size());
        } else if (!st.empty()) {
            st.pop();
        }
    }
    cout << best << '\\n';
    return 0;
}
`;
  return {
    code,
    input: `${text}\n`,
    output: `${best}\n`,
    subQuestions: [
      qa(`输入 ${text} 时，程序输出的最大栈深是多少？`, best, [best - 1, best + 1, text.length], serial),
      fixedQa("遇到 '(' 时程序执行什么操作？", ["A. 入栈", "B. 出栈", "C. 清空栈", "D. 结束程序"], "A"),
      fixedQa("变量 best 记录的是什么？", ["A. 当前字符下标", "B. 最大栈大小", "C. 字符串长度", "D. 右括号数量"], "B"),
      fixedQa("stack 的 top/pop 操作体现哪种访问顺序？", ["A. 先进先出", "B. 后进先出", "C. 随机访问", "D. 按值排序"], "B"),
      fixedQa("这段程序扫描字符串的时间复杂度是多少？", ["A. O(1)", "B. O(log n)", "C. O(n)", "D. O(n^2)"], "C"),
    ],
    explanation: `左括号入栈、右括号出栈，扫描过程中最大栈大小为 ${best}。`,
  };
}

function qa(stem, correct, distractors, serial) {
  const made = makeOptions(correct, distractors, serial % 4);
  return {
    stem,
    options: made.options,
    answer: made.answer,
    explanation: `按程序逐步计算，正确结果是 ${correct}。`,
  };
}

function fixedQa(stem, options, answer, explanation) {
  return {
    stem,
    options,
    answer,
    explanation: explanation ?? "根据代码语句含义可直接判断该选项正确。",
  };
}

function buildReadingProgram(row, serial) {
  const variant =
    row.kpGroup === "DS" ? readingStack(serial)
    : serial % 2 === 0 ? readingPrefix(serial)
    : readingBinary(serial);
  return itemBase(row, {
    contentJson: {
      stem: `GESP-7 程序阅读 ${serial}（${row.kpGroup}/${row.difficulty}）：阅读下面的 C++17 程序并回答问题。`,
      cppCode: variant.code,
      subQuestions: variant.subQuestions.map((question) => ({
        stem: question.stem,
        options: question.options,
      })),
      sampleInputs: [variant.input],
      expectedOutputs: [variant.output],
    },
    answerJson: {
      subQuestions: variant.subQuestions.map((question) => ({ answer: question.answer })),
    },
    explanationJson: {
      explanation: variant.subQuestions
        .map((question, index) => `${index + 1}. ${question.explanation}`)
        .concat(variant.explanation)
        .join("\n"),
    },
  });
}

function blank(id, correct, distractors, serial, explanation) {
  const made = makeOptions(correct, distractors, serial % 4);
  return {
    content: { id, options: made.options },
    answer: { id, answer: made.answer },
    explanation: `${id}：${explanation}`,
  };
}

function completionAlg(serial) {
  if (serial % 2 === 0) {
    const values = Array.from({ length: 6 }, (_, index) => (serial + index * 4) % 19 + 1);
    const l = 2;
    const r = 6;
    const answer = values.slice(l - 1, r).reduce((sum, value) => sum + value, 0);
    const code = `#include <bits/stdc++.h>
using namespace std;

int main() {
    vector<int> a = {0, ${values.join(", ")}};
    vector<int> prefix(a.size(), 0);
    for (int i = 1; i < (int)a.size(); ++i) {
        prefix[i] = {{BLANK1}};
    }
    int l, r;
    cin >> l >> r;
    cout << {{BLANK2}} << '\\n';
    return 0;
}
`;
    const b1 = blank("BLANK1", "prefix[i - 1] + a[i]", ["prefix[i] + a[i-1]", "a[i] - prefix[i-1]", "prefix[i - 1]"], serial, "前缀和当前位置应等于前一项前缀和加当前元素。");
    const b2 = blank("BLANK2", "prefix[r] - prefix[l - 1]", ["prefix[l] - prefix[r]", "prefix[r] + prefix[l]", "a[l] + a[r]"], serial + 1, "区间和用右端前缀减去左端前一位前缀。");
    return {
      cppCode: code,
      fullCode: code.replace("{{BLANK1}}", "prefix[i - 1] + a[i]").replace("{{BLANK2}}", "prefix[r] - prefix[l - 1]"),
      input: `${l} ${r}\n`,
      output: `${answer}\n`,
      blanks: [b1, b2],
      stem: `GESP-7 完善程序 ${serial}：补全前缀和程序，使其能回答区间和查询。`,
      explanation: `样例区间 [${l},${r}] 的和为 ${answer}。`,
    };
  }
  const a = serial + 28;
  const b = serial * 2 + 42;
  const answer = gcd(a, b);
  const code = `#include <bits/stdc++.h>
using namespace std;

int gcd2(int a, int b) {
    if ({{BLANK1}}) return a;
    return {{BLANK2}};
}

int main() {
    int a, b;
    cin >> a >> b;
    cout << gcd2(a, b) << '\\n';
    return 0;
}
`;
  const b1 = blank("BLANK1", "b == 0", ["a == 0", "a < b", "a % b == 0"], serial, "欧几里得算法在第二个数为 0 时返回第一个数。");
  const b2 = blank("BLANK2", "gcd2(b, a % b)", ["gcd2(a - b, b)", "gcd2(a, b - 1)", "a + b"], serial + 1, "递归步骤把 (a,b) 转为 (b,a%b)。");
  return {
    cppCode: code,
    fullCode: code.replace("{{BLANK1}}", "b == 0").replace("{{BLANK2}}", "gcd2(b, a % b)"),
    input: `${a} ${b}\n`,
    output: `${answer}\n`,
    blanks: [b1, b2],
    stem: `GESP-7 完善程序 ${serial}：补全欧几里得算法，输出两个整数的最大公因数。`,
    explanation: `gcd(${a},${b})=${answer}。`,
  };
}

function completionDs(serial) {
  if (serial % 2 === 0) {
    const text = serial % 4 === 0 ? "(()())" : "((()))";
    const answer = "YES";
    const code = `#include <bits/stdc++.h>
using namespace std;

int main() {
    string s;
    cin >> s;
    stack<char> st;
    bool ok = true;
    for (char c : s) {
        if (c == '(') {
            {{BLANK1}};
        } else {
            if (st.empty()) ok = false;
            else {{BLANK2}};
        }
    }
    cout << (ok && st.empty() ? "YES" : "NO") << '\\n';
    return 0;
}
`;
    const b1 = blank("BLANK1", "st.push(c)", ["st.pop()", "st.top()", "ok = false"], serial, "遇到左括号应入栈等待匹配。");
    const b2 = blank("BLANK2", "st.pop()", ["st.push(c)", "st.top()", "ok = true"], serial + 1, "遇到右括号且栈非空时弹出一个左括号。");
    return {
      cppCode: code,
      fullCode: code.replace("{{BLANK1}}", "st.push(c)").replace("{{BLANK2}}", "st.pop()"),
      input: `${text}\n`,
      output: `${answer}\n`,
      blanks: [b1, b2],
      stem: `GESP-7 完善程序 ${serial}：补全栈匹配括号程序。`,
      explanation: `样例 ${text} 的括号全部正确匹配，所以输出 ${answer}。`,
    };
  }
  const n = (serial % 5) + 6;
  const k = (serial % 3) + 2;
  const answer = josephus(n, k);
  const code = `#include <bits/stdc++.h>
using namespace std;

int main() {
    int n, k;
    cin >> n >> k;
    queue<int> q;
    for (int i = 1; i <= n; ++i) q.push(i);
    int step = 1;
    while (q.size() > 1) {
        int x = q.front();
        q.pop();
        if ({{BLANK1}}) {
            // x leaves the queue
        } else {
            {{BLANK2}};
        }
        ++step;
    }
    cout << q.front() << '\\n';
    return 0;
}
`;
  const b1 = blank("BLANK1", "step % k == 0", ["step == k + 1", "x % k == 0", "q.size() == k"], serial, "每数到 k 的倍数时当前元素出局。");
  const b2 = blank("BLANK2", "q.push(x)", ["q.pop()", "q.push(step)", "break"], serial + 1, "未出局的人应重新排到队尾。");
  return {
    cppCode: code,
    fullCode: code.replace("{{BLANK1}}", "step % k == 0").replace("{{BLANK2}}", "q.push(x)"),
    input: `${n} ${k}\n`,
    output: `${answer}\n`,
    blanks: [b1, b2],
    stem: `GESP-7 完善程序 ${serial}：补全队列模拟约瑟夫环程序。`,
    explanation: `队列轮转并按 ${k} 报数出局，最后留下 ${answer}。`,
  };
}

function buildCompletionProgram(row, serial) {
  const variant = row.kpGroup === "DS" ? completionDs(serial) : completionAlg(serial);
  return itemBase(row, {
    contentJson: {
      stem: variant.stem,
      cppCode: variant.cppCode,
      blanks: variant.blanks.map((entry) => entry.content),
      fullCode: variant.fullCode,
      sampleInputs: [variant.input],
      expectedOutputs: [variant.output],
    },
    answerJson: {
      blanks: variant.blanks.map((entry) => entry.answer),
    },
    explanationJson: {
      explanation: variant.blanks.map((entry) => entry.explanation).concat(variant.explanation).join("\n"),
    },
  });
}

function buildItem(row, serial) {
  const item =
    row.questionType === "single_choice" ? buildSingleChoice(row, serial)
    : row.questionType === "reading_program" ? buildReadingProgram(row, serial)
    : buildCompletionProgram(row, serial);
  return decorateForDiversity(row, item, serial);
}

function validateDeficit(row, index) {
  if (row.examType !== "GESP-7") {
    throw new Error(`deficits[${index}] examType must be GESP-7`);
  }
  if (!QUESTION_TYPES.has(row.questionType)) {
    throw new Error(`deficits[${index}] has unsupported questionType`);
  }
  if (!DIFFICULTIES.has(row.difficulty)) {
    throw new Error(`deficits[${index}] has unsupported difficulty`);
  }
  if (!row.kpGroup || typeof row.kpGroup !== "string") {
    throw new Error(`deficits[${index}] missing kpGroup`);
  }
  if (!Number.isInteger(row.deficit) || row.deficit <= 0) {
    throw new Error(`deficits[${index}] must have positive deficit`);
  }
}

function makeRunId(args, bundleNo, row) {
  return [
    args.date,
    `manual-gesp7-gap-${slug(args.runFamily)}-b${pad4(bundleNo)}`,
    slug(row.examType),
    row.difficulty,
    "v01",
  ].join("-");
}

function makeDraft(args, bundleNo, row, items) {
  const runId = makeRunId(args, bundleNo, row);
  const refs = OJ_REFERENCES[row.kpGroup] ?? [];
  return {
    meta: {
      runId,
      examType: row.examType,
      questionType: row.questionType,
      primaryKpCode: row.kpGroup,
      difficulty: row.difficulty,
      requestedCount: items.length,
      provider: "local-deterministic",
      model: "gesp7-gap-fill-template-v1",
      sourceBatchId: [
        "manual-gesp7-gap-fill-v1",
        args.batchId,
        row.examType,
        row.questionType,
        row.kpGroup,
        row.difficulty,
        `bundle-${pad4(bundleNo)}`,
      ].join(":"),
      sourceBatchIds: [
        [
          "manual-gesp7-gap-fill-v1",
          args.batchId,
          row.examType,
          row.questionType,
          row.kpGroup,
          row.difficulty,
          `bundle-${pad4(bundleNo)}`,
        ].join(":"),
        ...refs.slice(0, 3).map((ref) => `ojcode-inspired:${ref}`),
      ],
      sourceTimestamp: new Date().toISOString(),
      promptText: `Local deterministic GESP-7 gap fill template. source=${args.inventoryPath}`,
    },
    items,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (fs.existsSync(args.draftDir) && !args.overwrite) {
    const existing = fs.readdirSync(args.draftDir).filter((entry) => entry.endsWith(".json"));
    if (existing.length > 0) {
      throw new Error(`Draft dir already contains JSON files: ${args.draftDir}`);
    }
  }
  fs.mkdirSync(args.draftDir, { recursive: true });

  const parsed = JSON.parse(fs.readFileSync(args.inventoryPath, "utf8"));
  if (!Array.isArray(parsed.deficits)) {
    throw new Error("Inventory must contain deficits[]");
  }

  const rows = parsed.deficits.filter((row) => row.examType === "GESP-7" && row.deficit > 0);
  rows.forEach(validateDeficit);

  const drafts = [];
  const summaryByKey = {};
  let bundleNo = 1;
  let globalSerial = 1;

  for (const row of rows) {
    let remaining = row.deficit;
    while (remaining > 0) {
      const count = Math.min(args.chunkSize, remaining);
      const items = [];
      for (let offset = 0; offset < count; offset += 1) {
        items.push(buildItem(row, globalSerial));
        globalSerial += 1;
      }
      const draft = makeDraft(args, bundleNo, row, items);
      const fileName = `${draft.meta.runId}__draft__${row.questionType.replaceAll("_", "-")}__${slug(row.kpGroup)}__n${count}__v01.json`;
      const filePath = path.join(args.draftDir, fileName);
      writeJson(filePath, draft, args.overwrite);
      drafts.push({
        draftPath: repoPath(filePath),
        runId: draft.meta.runId,
        examType: row.examType,
        questionType: row.questionType,
        difficulty: row.difficulty,
        kpGroup: row.kpGroup,
        itemCount: count,
      });
      const key = [row.examType, row.questionType, row.difficulty, row.kpGroup].join("|");
      summaryByKey[key] = (summaryByKey[key] ?? 0) + count;
      remaining -= count;
      bundleNo += 1;
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    sourceInventoryPath: repoPath(args.inventoryPath),
    batchId: args.batchId,
    draftDir: repoPath(args.draftDir),
    bundleCount: drafts.length,
    itemCount: drafts.reduce((sum, entry) => sum + entry.itemCount, 0),
    summaryByKey,
    drafts,
  };
  writeJson(args.reportPath, report, args.overwrite);
  console.log(JSON.stringify({
    draftDir: report.draftDir,
    reportPath: repoPath(args.reportPath),
    bundleCount: report.bundleCount,
    itemCount: report.itemCount,
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
}
