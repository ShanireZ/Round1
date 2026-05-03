/**
 * fillAnswersFromLuogu.ts
 *
 * Fetches correct answers from Luogu's problemset pages (ti.luogu.com.cn/problemset/{id})
 * and fills them into existing JSON files under papers/real-papers/.
 *
 * Usage:
 *   npx tsx scripts/fillAnswersFromLuogu.ts          # all exams
 *   npx tsx scripts/fillAnswersFromLuogu.ts 1043      # single exam by Luogu ID
 */

import fs from "node:fs";
import path from "node:path";
import { EXAM_MAP } from "../../lib/examMappings";
import { alignOfficialProblems } from "../../lib/luoguAnswerAlignment";
import { REAL_PAPERS_ROOT } from "../../lib/paperPaths";

/* ---------- EXAM_MAP (same as scrapeLuogu.ts) ---------- */

/* ---------- fetch + parse ---------- */

const BASE = "https://ti.luogu.com.cn/problemset";
const REAL_PAPERS = REAL_PAPERS_ROOT;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface LuoguQuestion {
  correctAnswers: string[];
}
interface LuoguProblem {
  type: string;
  description: string;
  questions: LuoguQuestion[];
}

async function fetchAnswers(examId: string): Promise<LuoguProblem[] | null> {
  const url = `${BASE}/${examId}`;
  const resp = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!resp.ok) {
    console.error(`  ❌ HTTP ${resp.status} for ${url}`);
    return null;
  }
  const html = await resp.text();

  // Extract _feInjection from decodeURIComponent("...")
  const m = html.match(/decodeURIComponent\("([^"]+)"\)/);
  if (!m) {
    console.error(`  ❌ No _feInjection found for ${examId}`);
    return null;
  }
  const encoded = m[1];
  if (!encoded) {
    console.error(`  ❌ Empty _feInjection payload for ${examId}`);
    return null;
  }
  const json = decodeURIComponent(encoded);
  const data = JSON.parse(json);
  const problems: LuoguProblem[] = data.currentData?.problemset?.problems;
  if (!problems?.length) {
    console.error(`  ❌ No problems found for ${examId}`);
    return null;
  }
  return problems;
}

/* ---------- apply answers to JSON ---------- */

interface JsonQuestion {
  questionType: string;
  answer?: string;
  subQuestions?: { answer?: string }[];
  blanks?: { answer?: string }[];
}
interface JsonExam {
  questions: JsonQuestion[];
  [k: string]: unknown;
}

function applyAnswers(
  jsonPath: string,
  problems: LuoguProblem[],
): { updated: number; skipped: number; alignmentMode: "direct" | "filtered" | "mismatch" } {
  const raw = fs.readFileSync(jsonPath, "utf-8");
  const exam: JsonExam = JSON.parse(raw);
  let updated = 0;
  let skipped = 0;
  const aligned = alignOfficialProblems(exam.questions.length, problems);

  if (aligned.mode === "mismatch") {
    console.warn(
      `  ⚠️  Question count mismatch: JSON=${exam.questions.length} Luogu=${aligned.rawCount} usable=${aligned.filteredCount}`,
    );
    return { updated: 0, skipped: exam.questions.length, alignmentMode: aligned.mode };
  }

  if (aligned.mode === "filtered") {
    console.warn(
      `  ⚠️  Using filtered Luogu problems: JSON=${exam.questions.length} Luogu=${aligned.rawCount} usable=${aligned.filteredCount}`,
    );
  }

  const count = Math.min(exam.questions.length, aligned.problems.length);
  for (let i = 0; i < count; i++) {
    const q = exam.questions[i];
    const p = aligned.problems[i];
    if (!q || !p) {
      skipped++;
      continue;
    }

    if (q.questionType === "single_choice") {
      // Single correct answer
      const ans = p.questions[0]?.correctAnswers?.[0];
      if (ans) {
        q.answer = ans;
        updated++;
      } else {
        skipped++;
      }
    } else if (q.questionType === "reading_program" && q.subQuestions) {
      // Each Luogu question maps to a sub-question
      for (let j = 0; j < q.subQuestions.length && j < p.questions.length; j++) {
        const ca = p.questions[j]?.correctAnswers;
        const subQuestion = q.subQuestions[j];
        if (!subQuestion) {
          skipped++;
          continue;
        }
        if (ca?.length) {
          subQuestion.answer = ca.join("");
          updated++;
        } else {
          skipped++;
        }
      }
      skipped += Math.max(q.subQuestions.length - p.questions.length, 0);
    } else if (q.questionType === "completion_program" && q.blanks) {
      // Each Luogu question maps to a blank
      for (let j = 0; j < q.blanks.length && j < p.questions.length; j++) {
        const ca = p.questions[j]?.correctAnswers;
        const blank = q.blanks[j];
        if (!blank) {
          skipped++;
          continue;
        }
        if (ca?.length) {
          blank.answer = ca.join("");
          updated++;
        } else {
          skipped++;
        }
      }
      skipped += Math.max(q.blanks.length - p.questions.length, 0);
    } else if (q.questionType === "reading_program" && !q.subQuestions) {
      // GESP-style reading_program with single sub-question stored differently
      const ans = p.questions[0]?.correctAnswers?.[0];
      if (ans) {
        q.answer = ans;
        updated++;
      } else {
        skipped++;
      }
    } else if (q.questionType === "completion_program" && !q.blanks) {
      const ans = p.questions[0]?.correctAnswers?.[0];
      if (ans) {
        q.answer = ans;
        updated++;
      } else {
        skipped++;
      }
    } else {
      skipped++;
    }
  }

  fs.writeFileSync(jsonPath, JSON.stringify(exam, null, 2) + "\n", "utf-8");
  return { updated, skipped, alignmentMode: aligned.mode };
}

/* ---------- main ---------- */

async function main() {
  const args = process.argv.slice(2);
  const ids = args.length ? args : Object.keys(EXAM_MAP);

  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalExams = 0;
  let failed = 0;

  for (const id of ids) {
    const meta = EXAM_MAP[id];
    if (!meta) {
      console.warn(`⚠️  Unknown exam ID: ${id}`);
      continue;
    }

    const jsonPath = path.join(REAL_PAPERS, meta.outDir, meta.outFile);
    if (!fs.existsSync(jsonPath)) {
      console.warn(`⚠️  JSON not found: ${jsonPath}`);
      continue;
    }

    console.log(`📋 ${meta.label} (${id}) → ${meta.outDir}/${meta.outFile}`);
    const problems = await fetchAnswers(id);
    if (!problems) {
      failed++;
      await sleep(1000);
      continue;
    }

    const { updated, skipped, alignmentMode } = applyAnswers(jsonPath, problems);
    if (alignmentMode === "mismatch") {
      failed++;
      await sleep(1000);
      continue;
    }

    console.log(`  ✅ ${updated} answers filled, ${skipped} skipped (${alignmentMode})`);
    totalUpdated += updated;
    totalSkipped += skipped;
    totalExams++;

    // Rate limit: 500ms between requests
    await sleep(500);
  }

  console.log(`\n===== Done =====`);
  console.log(`Exams processed: ${totalExams}, failed: ${failed}`);
  console.log(`Total answers filled: ${totalUpdated}, skipped: ${totalSkipped}`);
}

main().catch(console.error);
