import fs from "node:fs";
import path from "node:path";
import { EXAM_MAP } from "./examMappings.js";
import { REAL_PAPERS_ROOT } from "./paperPaths.js";

export { REAL_PAPERS_ROOT };

export interface PaperQuestion {
  questionType: string;
  stem: string;
  difficulty?: string;
  primaryKpCode?: string;
  auxiliaryKpCodes?: string[];
  options?: string[];
  answer?: string;
  explanation?: string;
  cppCode?: string;
  fullCode?: string;
  subQuestions?: Array<{
    stem: string;
    options?: string[];
    answer?: string;
    explanation?: string;
  }>;
  blanks?: Array<{
    id: string;
    options?: string[];
    answer?: string;
    explanation?: string;
  }>;
}

export interface PaperData {
  examType: string;
  year: number;
  source: string;
  questions: PaperQuestion[];
}

export interface PaperFileInfo {
  outDir: string;
  fileName: string;
  filePath: string;
  examId?: string;
}

const examIdByFile = new Map<string, string>(
  Object.entries(EXAM_MAP).map(([examId, meta]) => [`${meta.outDir}/${meta.outFile}`, examId]),
);

export function listPaperFiles(): PaperFileInfo[] {
  const results: PaperFileInfo[] = [];

  for (const outDir of ["csp-j", "csp-s", "gesp"]) {
    const dirPath = path.join(REAL_PAPERS_ROOT, outDir);
    if (!fs.existsSync(dirPath)) {
      continue;
    }

    for (const fileName of fs
      .readdirSync(dirPath)
      .filter((name) => name.endsWith(".json"))
      .sort()) {
      const key = `${outDir}/${fileName}`;
      results.push({
        outDir,
        fileName,
        filePath: path.join(dirPath, fileName),
        examId: examIdByFile.get(key),
      });
    }
  }

  return results;
}

export function loadPaper(filePath: string): PaperData {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as PaperData;
}

export function savePaper(filePath: string, paper: PaperData): void {
  fs.writeFileSync(filePath, JSON.stringify(paper, null, 2) + "\n", "utf-8");
}

export function answerOptionText(
  options: string[] | undefined,
  answer: string | undefined,
): string | undefined {
  if (!options?.length || !answer) {
    return undefined;
  }

  const index = answer.charCodeAt(0) - 65;
  if (index < 0 || index >= options.length) {
    return undefined;
  }

  return options[index]!.replace(/^[A-Z]\.\s*/, "")
    .replace(/^`|`$/g, "")
    .trim();
}

export function isBlank(value: string | undefined): boolean {
  return !value || value.trim().length === 0;
}
