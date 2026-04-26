/**
 * updateAnswersInDB.ts
 * 
 * Updates answerJson for existing DB records using content hash matching.
 * Reads JSON files from papers/real-papers/ and updates corresponding DB records.
 * 
 * Usage: npx tsx scripts/updateAnswersInDB.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { db, pool } from '../server/db.js';
import { questions } from '../server/db/schema/questions.js';
import { computeContentHash } from '../server/services/deduplicationService.js';
import { eq } from 'drizzle-orm';
import { REAL_PAPERS_ROOT } from './lib/paperPaths.js';

const REAL_PAPERS = REAL_PAPERS_ROOT;

interface Question {
  questionType: string;
  stem: string;
  options?: string[];
  cppCode?: string;
  answer?: string;
  subQuestions?: { answer?: string }[];
  blanks?: { id?: string; answer?: string }[];
}

async function main() {
  let updated = 0;
  let notFound = 0;
  let noAnswer = 0;

  for (const dir of ['csp-j', 'csp-s', 'gesp']) {
    const base = path.join(REAL_PAPERS, dir);
    if (!fs.existsSync(base)) continue;

    const files = fs.readdirSync(base).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const filePath = path.join(base, file);
      const exam = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      console.log(`📄 ${dir}/${file} (${exam.questions.length} questions)`);

      for (let i = 0; i < exam.questions.length; i++) {
        const q: Question = exam.questions[i];
        const optionsStr = q.options?.join('') ?? q.cppCode ?? '';
        const contentHash = computeContentHash(q.stem, optionsStr);

        // Build answerJson
        let answerJson: unknown;
        if (q.questionType === 'single_choice') {
          if (!q.answer) { noAnswer++; continue; }
          answerJson = { answer: q.answer };
        } else if (q.questionType === 'reading_program') {
          const subAnswers = q.subQuestions?.map(sq => sq.answer) ?? [];
          if (subAnswers.every(a => !a)) { noAnswer++; continue; }
          answerJson = { subAnswers };
        } else if (q.questionType === 'completion_program') {
          const blanks = q.blanks?.map(b => ({ id: b.id, answer: b.answer })) ?? [];
          if (blanks.every(b => !b.answer)) { noAnswer++; continue; }
          answerJson = { blanks };
        } else {
          continue;
        }

        // Find and update by content hash
        const result = await db
          .update(questions)
          .set({ answerJson })
          .where(eq(questions.contentHash, contentHash))
          .returning({ id: questions.id });

        if (result.length > 0) {
          updated++;
        } else {
          notFound++;
          console.log(`  ⚠ Q${i}: not found in DB (hash: ${contentHash.slice(0, 8)}…)`);
        }
      }
    }
  }

  console.log(`\n===== Done =====`);
  console.log(`Updated: ${updated}, Not found: ${notFound}, No answer: ${noAnswer}`);
  await pool.end();
}

main().catch(console.error);
