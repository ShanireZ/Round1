/**
 * 洛谷有题 真题爬取脚本
 *
 * 用法：
 *   npx tsx scripts/scrapeLuogu.ts                    # 爬取所有 CSP + GESP
 *   npx tsx scripts/scrapeLuogu.ts --ids 1043,1044    # 爬取指定 ID
 *   npx tsx scripts/scrapeLuogu.ts --type csp-j       # 仅 CSP-J
 *   npx tsx scripts/scrapeLuogu.ts --type gesp        # 仅 GESP
 *   npx tsx scripts/scrapeLuogu.ts --dry              # 仅解析不写文件
 *
 * 输出目录：papers/real-papers/{csp-j,csp-s,gesp}/
 * 输出格式：与 ingestRealPapers.ts 兼容的 JSON
 */
import fs from "node:fs";
import path from "node:path";
import { EXAM_MAP } from "./lib/examMappings.js";
import { REAL_PAPERS_ROOT } from "./lib/paperPaths.js";

/* ------------------------------------------------------------------ */
/*  Exam ID Mapping (from plan/reference-exam-knowledge.md)           */
/* ------------------------------------------------------------------ */

// NOIP 2007-2018 已排除 — 仅保留 CSP 2019+ 和 GESP

/* ------------------------------------------------------------------ */
/*  Raw types from 洛谷有题 embedded JSON                              */
/* ------------------------------------------------------------------ */

interface LuoguQuestion {
  choices: string[];
  allowMultiChoices: boolean;
  score: number;
}

interface LuoguProblem {
  id: number;
  type: string;
  description: string;
  score: number;
  page: number;
  questions: LuoguQuestion[];
  createTime: number;
}

/* ------------------------------------------------------------------ */
/*  Fetch & Parse                                                      */
/* ------------------------------------------------------------------ */

async function fetchExamData(luoguId: string): Promise<{
  name: string;
  problems: LuoguProblem[];
} | null> {
  const url = `https://ti.luogu.com.cn/problemset/${luoguId}/training`;

  const resp = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!resp.ok) {
    console.error(`  ❌ HTTP ${resp.status} for ${url}`);
    return null;
  }

  const html = await resp.text();

  // Extract window._feInjection
  const match = html.match(
    /window\._feInjection\s*=\s*JSON\.parse\(decodeURIComponent\("([^"]+)"\)\)/,
  );
  if (!match) {
    console.error(`  ❌ No _feInjection in HTML for ${luoguId}`);
    return null;
  }

  const jsonStr = decodeURIComponent(match[1]!);
  const data = JSON.parse(jsonStr);

  if (data.code !== 200) {
    console.error(`  ❌ API code ${data.code} for ${luoguId}`);
    return null;
  }

  return data.currentData.problemset;
}

/* ------------------------------------------------------------------ */
/*  Markdown helpers                                                   */
/* ------------------------------------------------------------------ */

/** Extract image URLs from Markdown */
function extractImages(md: string): string[] {
  return [...md.matchAll(/!\[.*?\]\((.*?)\)/g)]
    .map((m) => m[1])
    .filter((value): value is string => typeof value === "string");
}

/** Extract first code block (```cpp or plain ```) */
function extractCode(md: string): string {
  // Match fenced code blocks; some Luogu descriptions end without a closing fence.
  const m = md.match(/```(?:cpp|c\+\+)?\s*\n([\s\S]*?)(?:\n```|$)/);
  return m ? m[1]!.trim() : "";
}

function stripProblemHeaders(md: string): string {
  return md
    .replace(/^###\s+第\s*\d+\s*题.*$/gm, "")
    .replace(/^###\s+(?:判断题|单选题|阅读程序|完善程序).*$/gm, "")
    .replace(/^\*\*[（(].+?[)）]\*\*\s*$/gm, "")
    .trim();
}

function extractTextBeforeFirstOption(md: string): string {
  const lines = stripProblemHeaders(md).split("\n");
  const kept: string[] = [];
  let inFence = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!inFence && /^[A-D]\.\s*(?:$|[^a-zA-Z0-9_])/.test(trimmed)) {
      break;
    }

    kept.push(line);

    if (trimmed.startsWith("```")) {
      inFence = !inFence;
    }
  }

  return kept.join("\n").trim();
}

function extractPromptBeforeFirstCode(md: string): string {
  const stripped = stripProblemHeaders(md);
  const match = stripped.match(/^([\s\S]*?)```(?:cpp|c\+\+)?\s*\n/);
  const prompt = match?.[1] ?? stripped;
  return extractTextBeforeFirstOption(prompt)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractPromptAfterFirstCode(md: string): string {
  const stripped = stripProblemHeaders(md);
  const match = stripped.match(/```(?:cpp|c\+\+)?\s*\n[\s\S]*?(?:\n```|$)([\s\S]*)$/);
  const prompt = match?.[1] ?? "";
  return extractTextBeforeFirstOption(prompt)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function looksLikeQuestionList(value: string): boolean {
  const text = value.trim();
  return /^(?:[-*]\s*(?:判断题|选择题)|\d+[.)]\s*)/.test(text);
}

function extractProgramPrompt(md: string): string {
  const beforeCode = extractPromptBeforeFirstCode(md);
  if (beforeCode) {
    return beforeCode;
  }

  const afterCode = extractPromptAfterFirstCode(md);
  return looksLikeQuestionList(afterCode) ? "" : afterCode;
}

function isPlaceholderChoices(choices: string[]): boolean {
  if (choices.length === 0) {
    return false;
  }

  return choices.every((choice, index) => {
    const normalized = choice.trim().replace(/[.。．、]/g, "");
    return normalized === String.fromCharCode(65 + index);
  });
}

function extractChoiceBlocks(md: string): string[] {
  const lines = stripProblemHeaders(md).split("\n");
  const results: string[] = [];
  let currentIndex = -1;
  let currentLines: string[] = [];
  let inFence = false;

  const flush = () => {
    if (currentIndex < 0) {
      return;
    }

    results[currentIndex] = currentLines.join("\n").trim();
    currentLines = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!inFence) {
      const optionMatch = trimmed.match(/^([A-D])\.\s*(.*)$/);
      if (optionMatch) {
        flush();
        currentIndex = optionMatch[1]!.charCodeAt(0) - 65;
        currentLines = optionMatch[2] ? [optionMatch[2]] : [];
        continue;
      }
    }

    if (currentIndex >= 0) {
      currentLines.push(line);
    }

    if (trimmed.startsWith("```")) {
      inFence = !inFence;
    }
  }

  flush();
  return results.filter((entry): entry is string => Boolean(entry?.trim()));
}

function resolveChoices(description: string, choices: string[]): string[] {
  const normalizedChoices = choices.map((choice) => choice.trim());
  if (!isPlaceholderChoices(normalizedChoices)) {
    return normalizedChoices;
  }

  const extractedChoices = extractChoiceBlocks(description);
  return extractedChoices.length === normalizedChoices.length
    ? extractedChoices
    : normalizedChoices;
}

/** Extract sub-question stems from Markdown numbered lists (after code block).
 *  Returns stems in order matching the questions array. */
function extractSubStems(md: string): string[] {
  // Remove everything before the first numbered list section
  // (remove section header and code block)
  const afterCode = md.replace(/```(?:cpp|c\+\+)?\s*[\s\S]*?```/, "<<CODE>>");
  const lines = afterCode.split("\n");
  const stems: string[] = [];

  let collecting = false;
  let current = "";

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip section headers but use them to know we're in question area
    if (trimmed.startsWith("### 判断题") || trimmed.startsWith("### 单选题")) {
      collecting = true;
      if (current) {
        stems.push(current.trim());
        current = "";
      }
      continue;
    }

    // Skip other headers
    if (trimmed.startsWith("### ") || trimmed.startsWith("<<CODE>>")) {
      collecting = true;
      if (current) {
        stems.push(current.trim());
        current = "";
      }
      continue;
    }

    // Numbered item start
    const numMatch = trimmed.match(/^\d+[.)]\s*(.+)/);
    if (numMatch) {
      if (current) stems.push(current.trim());
      current = numMatch[1]!;
      collecting = true;
      continue;
    }

    // Continuation line (for multi-line sub-question stems)
    if (
      collecting &&
      trimmed &&
      !trimmed.startsWith("A.") &&
      !trimmed.startsWith("B.") &&
      !trimmed.startsWith("C.") &&
      !trimmed.startsWith("D.")
    ) {
      if (current) current += " " + trimmed;
    }

    // Empty line resets
    if (!trimmed && current) {
      // Don't push yet - the next line might be continuation
    }
  }
  if (current) stems.push(current.trim());

  return stems;
}

/** Extract the title/topic from a reading_program or completion_program description */
function extractTitle(md: string): string {
  // Try **（...）** or **(...)** — e.g. **（判断平方数）**
  const boldMatch = md.match(/\*\*[（(](.+?)[)）]\*\*/);
  if (boldMatch) return boldMatch[1]!;

  return "";
}

/** Clean options: add "A." prefix if missing */
function formatChoices(choices: string[]): string[] {
  return choices.map((c, i) => {
    const letter = String.fromCharCode(65 + i);
    const trimmed = c.trim();
    // If already has letter prefix, keep it
    if (/^[A-Z]\.\s/.test(trimmed) || /^[A-Z]\.\n/.test(trimmed)) return trimmed;
    if (trimmed.includes("\n")) return `${letter}.\n${trimmed}`;
    return `${letter}. ${trimmed}`;
  });
}

/* ------------------------------------------------------------------ */
/*  Problem classification                                             */
/* ------------------------------------------------------------------ */

type QuestionType = "single_choice" | "reading_program" | "completion_program";

function classifyProblem(
  problem: LuoguProblem,
  _problemIndex: number,
  _totalProblems: number,
): QuestionType {
  const desc = problem.description;
  const firstChoices = problem.questions[0]?.choices ?? [];
  const hasPlaceholderChoiceOptions = isPlaceholderChoices(
    firstChoices.map((choice) => choice.trim()),
  );
  const extractedChoiceBlocks = extractChoiceBlocks(desc);
  const hasChoiceBlocks = extractedChoiceBlocks.length >= Math.min(2, firstChoices.length || 2);
  const hasCodeBlock = /```(?:cpp|c\+\+)?\s*\n/.test(desc);
  const completionHint =
    /(完善程序|补全|填空|填入代码|在此处填入代码|处应填|应填写|应填入|横向上应填|横向上应填写)/;
  const readingHint =
    /(阅读程序|运行下列代码|给定如下代码|对于下面.*代码|关于下面.*代码|关于以下.*代码|程序输出|以下程序|下列代码|上题的树中搜索)/;

  if (hasPlaceholderChoiceOptions && hasChoiceBlocks) {
    return "single_choice";
  }

  // Explicit section markers
  if (desc.includes("阅读程序") || desc.includes("判断题")) return "reading_program";
  if (desc.includes("完善程序") || desc.includes("___①___") || desc.includes("___（1）___"))
    return "completion_program";
  if (completionHint.test(desc)) return "completion_program";

  // Code block with blanks → completion
  if ((desc.includes("```cpp") || desc.includes("```\n#include")) && desc.includes("___"))
    return "completion_program";

  // Code block with multiple sub-questions → reading (check questions count)
  if (hasCodeBlock) {
    // Could be reading or completion depending on context
    if (desc.includes("试补全") || desc.includes("处应填") || completionHint.test(desc)) {
      return "completion_program";
    }
    if (readingHint.test(desc)) {
      return "reading_program";
    }
    return "reading_program";
  }

  return "single_choice";
}

/* ------------------------------------------------------------------ */
/*  Transform to ingestRealPapers format                              */
/* ------------------------------------------------------------------ */

interface OutputQuestion {
  questionType: QuestionType;
  stem: string;
  options?: string[];
  answer?: string;
  cppCode?: string;
  codeImages?: string[];
  subQuestions?: Array<{
    stem: string;
    options: string[];
    answer: string;
    explanation: string;
  }>;
  fullCode?: string;
  blanks?: Array<{
    id: string;
    options: string[];
    answer: string;
    explanation: string;
  }>;
  explanation?: string;
  difficulty: "easy" | "medium" | "hard";
  primaryKpCode: string;
  auxiliaryKpCodes: string[];
}

function transformProblem(
  problem: LuoguProblem,
  idx: number,
  total: number,
): OutputQuestion | null {
  const desc = problem.description;

  // Skip problems with no questions data
  if (!problem.questions || problem.questions.length === 0) {
    return null;
  }

  // Skip "Blank" type problems (fill-in-the-blank without choices, common in NOIP era)
  if (problem.type === "Blank") {
    return null;
  }

  // Skip if first question has no choices (e.g. NOIP fill-in-blank)
  if (!problem.questions[0]?.choices || problem.questions[0].choices.length === 0) {
    return null;
  }

  const qType = classifyProblem(problem, idx, total);
  const promptStem = extractProgramPrompt(desc);

  switch (qType) {
    case "single_choice": {
      const choices = resolveChoices(desc, problem.questions[0]?.choices ?? []);
      if (choices.length === 0) return null;
      return {
        questionType: "single_choice",
        stem: extractTextBeforeFirstOption(desc) || desc,
        options: formatChoices(choices),
        answer: "",
        explanation: "",
        difficulty: "easy",
        primaryKpCode: "BAS-01",
        auxiliaryKpCodes: [],
      };
    }

    case "reading_program": {
      const code = extractCode(desc);
      const images = code ? undefined : extractImages(desc);
      const subStems = extractSubStems(desc);
      const title = extractTitle(desc);

      // Build a clean stem
      const numMatch = desc.match(/###\s+第\s*(\d+)\s*题/);
      const num = numMatch ? numMatch[1] : "";
      let stem = "阅读程序";
      if (problem.questions.length > 1 && promptStem) {
        stem = promptStem;
      } else if (num && title) {
        stem = `阅读程序 第${num}题 — ${title}`;
      } else if (num) {
        stem = `阅读程序 第${num}题`;
      } else if (title) {
        stem = `阅读程序 — ${title}`;
      }

      const result: OutputQuestion = {
        questionType: "reading_program",
        stem,
        cppCode: code,
        subQuestions: problem.questions.map((q, qi) => ({
          stem:
            subStems[qi] ??
            (problem.questions.length === 1 && promptStem ? promptStem : `第${qi + 1}小题`),
          options: formatChoices(resolveChoices(desc, q.choices)),
          answer: "",
          explanation: "",
        })),
        difficulty: "medium",
        primaryKpCode: "CPP-07",
        auxiliaryKpCodes: [],
      };
      if (images?.length) result.codeImages = images;
      return result;
    }

    case "completion_program": {
      const code = extractCode(desc);
      const images = code ? undefined : extractImages(desc);
      const title = extractTitle(desc);

      const numMatch = desc.match(/###\s+第\s*(\d+)\s*题/);
      const num = numMatch ? numMatch[1] : "";
      let stem = promptStem || "完善程序";
      if (!promptStem) {
        if (num && title) {
          stem = `完善程序 第${num}题 — ${title}`;
        } else if (num) {
          stem = `完善程序 第${num}题`;
        } else if (title) {
          stem = `完善程序 — ${title}`;
        }
      }

      const cpResult: OutputQuestion = {
        questionType: "completion_program",
        stem,
        fullCode: code,
        blanks: problem.questions.map((q, qi) => ({
          id: `${qi + 1}`,
          options: formatChoices(resolveChoices(desc, q.choices)),
          answer: "",
          explanation: "",
        })),
        difficulty: "medium",
        primaryKpCode: "ALG-01",
        auxiliaryKpCodes: [],
      };
      if (images?.length) cpResult.codeImages = images;
      return cpResult;
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry");

  // Parse --ids
  const idsIdx = args.indexOf("--ids");
  let targetIds: string[] | null = null;
  if (idsIdx >= 0 && args[idsIdx + 1]) {
    targetIds = args[idsIdx + 1]!.split(",").map((s) => s.trim());
  }

  // Parse --type
  const typeIdx = args.indexOf("--type");
  let filterType: string | null = null;
  if (typeIdx >= 0 && args[typeIdx + 1]) {
    filterType = args[typeIdx + 1]!.toLowerCase();
  }

  // Determine which IDs to scrape
  let ids: string[];
  if (targetIds) {
    ids = targetIds;
  } else {
    ids = Object.keys(EXAM_MAP);
    if (filterType) {
      ids = ids.filter((id) => {
        const meta = EXAM_MAP[id];
        if (!meta) return false;
        if (filterType === "csp-j") return meta.outDir === "csp-j";
        if (filterType === "csp-s") return meta.outDir === "csp-s";
        if (filterType === "csp") return meta.outDir === "csp-j" || meta.outDir === "csp-s";
        if (filterType === "gesp") return meta.outDir === "gesp";
        return meta.examType.toLowerCase().includes(filterType!);
      });
    }
  }

  console.log(`🎯 Scraping ${ids.length} exam(s)...\n`);

  const baseDir = REAL_PAPERS_ROOT;

  let successCount = 0;
  let failCount = 0;
  let skipCount = 0;

  for (const id of ids) {
    const meta = EXAM_MAP[id];
    if (!meta) {
      console.log(`⚠ Unknown exam ID: ${id}, skipping`);
      skipCount++;
      continue;
    }

    const outDir = path.join(baseDir, meta.outDir);
    const outFile = path.join(outDir, meta.outFile);

    // Skip if file already exists
    if (fs.existsSync(outFile) && !args.includes("--force")) {
      console.log(`⏭ ${meta.label} (${id}) → already exists: ${meta.outFile}`);
      skipCount++;
      continue;
    }

    console.log(`📥 ${meta.label} (${id})...`);

    try {
      const data = await fetchExamData(id);
      if (!data) {
        failCount++;
        continue;
      }

      const problems = data.problems;
      console.log(`  Found ${problems.length} problems`);

      // Transform
      const questions: OutputQuestion[] = problems
        .map((p, i) => transformProblem(p, i, problems.length))
        .filter((q): q is OutputQuestion => q !== null);

      const output = {
        examType: meta.examType,
        year: meta.year,
        source: `https://ti.luogu.com.cn/problemset/${id}/training`,
        questions,
      };

      if (dryRun) {
        const sc = questions.filter((q) => q.questionType === "single_choice").length;
        const rp = questions.filter((q) => q.questionType === "reading_program").length;
        const cp = questions.filter((q) => q.questionType === "completion_program").length;
        console.log(`  [dry] ${sc} single_choice, ${rp} reading_program, ${cp} completion_program`);
      } else {
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(outFile, JSON.stringify(output, null, 2), "utf-8");
        console.log(`  ✅ → ${path.relative(baseDir, outFile)}`);
      }

      successCount++;

      // Rate limit: 500ms between requests
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      console.error(`  ❌ Error: ${err instanceof Error ? err.message : err}`);
      failCount++;
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Success: ${successCount}`);
  console.log(`   Skipped: ${skipCount}`);
  console.log(`   Failed:  ${failCount}`);

  if (!dryRun && successCount > 0) {
    console.log(`\n📂 Output: ${baseDir}/`);
    console.log(`\n💡 Next: review JSONs then run:`);
    console.log(`   npx tsx scripts/ingestRealPapers.ts --dir papers/real-papers/csp-j`);
    console.log(`   npx tsx scripts/ingestRealPapers.ts --dir papers/real-papers/csp-s`);
    console.log(`   npx tsx scripts/ingestRealPapers.ts --dir papers/real-papers/gesp`);
  }
}

main().catch((err) => {
  console.error("❌ Fatal:", err);
  process.exit(1);
});
