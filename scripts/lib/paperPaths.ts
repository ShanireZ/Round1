import path from "node:path";

export const PAPERS_ROOT = path.resolve(import.meta.dirname!, "..", "..", "papers");
export const REAL_PAPERS_ROOT = path.join(PAPERS_ROOT, "real-papers");

export interface OfflineRunIdParts {
  date: Date;
  pipeline: string;
  examType: string;
  difficulty: string;
  versionNo: number;
}

export interface QuestionBundleOutputPathParts {
  runId: string;
  questionType: string;
  kpCode: string;
  count: number;
  versionNo: number;
}

export interface PrebuiltPaperBundleOutputPathParts {
  runId: string;
  blueprintVersion: number;
  count: number;
  versionNo: number;
}

export interface OfflineReportPathParts {
  runId: string;
  reportName: string;
}

export interface OfflineTmpPathParts {
  runId: string;
  artifactName: string;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
}

function formatVersion(value: number): string {
  assertPositiveInteger(value, "versionNo");
  return `v${pad2(value)}`;
}

function slugifyArtifactToken(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (!slug) {
    throw new Error(`Invalid artifact token: ${value}`);
  }

  return slug;
}

function yearFromRunId(runId: string): string {
  const match = /^(\d{4})-\d{2}-\d{2}-/.exec(runId);
  if (!match) {
    throw new Error(`runId must start with YYYY-MM-DD: ${runId}`);
  }

  return match[1]!;
}

export function formatQuestionBundleDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function formatOfflineRunId(parts: OfflineRunIdParts): string {
  return [
    formatQuestionBundleDate(parts.date),
    slugifyArtifactToken(parts.pipeline),
    slugifyArtifactToken(parts.examType),
    slugifyArtifactToken(parts.difficulty),
    formatVersion(parts.versionNo),
  ].join("-");
}

export function defaultQuestionBundleOutputPath(parts: QuestionBundleOutputPathParts): string {
  assertPositiveInteger(parts.count, "count");

  const questionTypeSlug = slugifyArtifactToken(parts.questionType);
  const kpCodeSlug = slugifyArtifactToken(parts.kpCode);
  const fileName = [
    parts.runId,
    "question-bundle",
    questionTypeSlug,
    kpCodeSlug,
    `n${parts.count}`,
    formatVersion(parts.versionNo),
  ].join("__");

  return path.join(
    "papers",
    yearFromRunId(parts.runId),
    parts.runId,
    "question-bundles",
    `${fileName}.json`,
  );
}

export function defaultPrebuiltPaperBundleOutputPath(
  parts: PrebuiltPaperBundleOutputPathParts,
): string {
  assertPositiveInteger(parts.blueprintVersion, "blueprintVersion");
  assertPositiveInteger(parts.count, "count");

  const fileName = [
    parts.runId,
    "prebuilt-paper-bundle",
    `blueprint-v${parts.blueprintVersion}`,
    `n${parts.count}`,
    formatVersion(parts.versionNo),
  ].join("__");

  return path.join(
    "artifacts",
    "prebuilt-papers",
    yearFromRunId(parts.runId),
    parts.runId,
    `${fileName}.json`,
  );
}

export function defaultOfflineReportPath(parts: OfflineReportPathParts): string {
  const reportName = slugifyArtifactToken(parts.reportName);

  return path.join(
    "artifacts",
    "reports",
    yearFromRunId(parts.runId),
    "runs",
    parts.runId,
    `${parts.runId}__report__${reportName}.json`,
  );
}

export function defaultOfflineTmpPath(parts: OfflineTmpPathParts): string {
  const artifactName = slugifyArtifactToken(parts.artifactName);

  return path.join(
    "artifacts",
    "tmp",
    yearFromRunId(parts.runId),
    parts.runId,
    `${parts.runId}__tmp__${artifactName}.json`,
  );
}
