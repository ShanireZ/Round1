import path from "node:path";

export const PAPERS_ROOT = path.resolve(import.meta.dirname!, "..", "..", "papers");
export const REAL_PAPERS_ROOT = path.join(PAPERS_ROOT, "real-papers");

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatQuestionBundleDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function formatQuestionBundleFileName(
  date: Date,
  questionType: string,
  count: number,
): string {
  return `${formatQuestionBundleDate(date)}-${questionType}-${count}.json`;
}

export function defaultQuestionBundleOutputPath(
  questionType: string,
  count: number,
  date = new Date(),
): string {
  return path.join(
    "papers",
    String(date.getFullYear()),
    formatQuestionBundleFileName(date, questionType, count),
  );
}
