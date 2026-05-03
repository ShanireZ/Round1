import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import {
  PrebuiltPaperBundleSchema,
  QuestionBundleSchema,
  verifyBundleIntegrity,
} from "../../lib/bundleTypes.js";

const RUN_ID_PATTERN = String.raw`\d{4}-\d{2}-\d{2}-[a-z0-9-]+-[a-z0-9-]+-[a-z0-9-]+-v\d{2}`;
const QUESTION_BUNDLE_PATTERN = new RegExp(
  String.raw`^papers/\d{4}/(${RUN_ID_PATTERN})/question-bundles/\1__question-bundle__([a-z0-9-]+)__([a-z0-9-]+)__n(\d+)__v\d{2}\.json$`,
);
const PREBUILT_BUNDLE_PATTERN = new RegExp(
  String.raw`^artifacts/prebuilt-papers/\d{4}/(${RUN_ID_PATTERN})/\1__prebuilt-paper-bundle__blueprint-v(\d+)__n(\d+)__v\d{2}\.json$`,
);

async function collectFiles(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const files = await Promise.all(
      entries.map(async (entry) => {
        const childPath = path.join(root, entry.name);
        if (entry.isDirectory()) {
          return collectFiles(childPath);
        }

        if (entry.isFile()) {
          return [childPath];
        }

        return [];
      }),
    );

    return files.flat();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

function toRepoPath(filePath: string): string {
  return path.relative(process.cwd(), filePath).split(path.sep).join("/");
}

function isQuestionBundleDirectlyUnderYear(repoPath: string): boolean {
  return /^papers\/\d{4}\/[^/]+\.json$/.test(repoPath);
}

function isPapersInventoryMetadata(repoPath: string): boolean {
  return repoPath.startsWith("papers/_inventory/");
}

function validateRepoPath(repoPath: string): string | null {
  if (isPapersInventoryMetadata(repoPath)) {
    return null;
  }

  if (repoPath === "artifacts/prebuilt-papers/paper-packs.json") {
    return "prebuilt paper bundle uses the deprecated generic paper-packs.json name";
  }

  if (/^artifacts\/llm-step3\/probe.*\.json$/.test(repoPath)) {
    return "LLM probe JSON must live under artifacts/tmp/<year>/<runId>/";
  }

  if (isQuestionBundleDirectlyUnderYear(repoPath)) {
    return "question bundle JSON must live under papers/<year>/<runId>/question-bundles/";
  }

  if (
    repoPath.startsWith("papers/") &&
    repoPath.endsWith(".json") &&
    !repoPath.startsWith("papers/real-papers/") &&
    !QUESTION_BUNDLE_PATTERN.test(repoPath)
  ) {
    return "question bundle filename does not match the runId naming convention";
  }

  if (
    repoPath.startsWith("artifacts/prebuilt-papers/") &&
    repoPath.endsWith(".json") &&
    !PREBUILT_BUNDLE_PATTERN.test(repoPath)
  ) {
    return "prebuilt paper bundle filename does not match the runId naming convention";
  }

  return null;
}

function slugifyMetadataToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function validateQuestionBundleFile(filePath: string, repoPath: string) {
  const match = QUESTION_BUNDLE_PATTERN.exec(repoPath);
  if (!match) {
    return null;
  }

  const [, runId, questionType, kpCode, count] = match;
  const raw = await readFile(filePath, "utf8");
  const parsed = QuestionBundleSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return `question bundle JSON does not match schema at ${issue?.path.join(".") || "<root>"}: ${issue?.message ?? "invalid"}`;
  }

  const bundle = parsed.data;
  if (bundle.meta.runId !== runId) {
    return `question bundle meta.runId ${bundle.meta.runId} does not match path runId ${runId}`;
  }

  if (slugifyMetadataToken(bundle.meta.questionType) !== questionType) {
    return `question bundle meta.questionType ${bundle.meta.questionType} does not match filename ${questionType}`;
  }

  if (slugifyMetadataToken(bundle.meta.primaryKpCode) !== kpCode) {
    return `question bundle meta.primaryKpCode ${bundle.meta.primaryKpCode} does not match filename ${kpCode}`;
  }

  if (bundle.meta.requestedCount !== Number(count)) {
    return `question bundle meta.requestedCount ${bundle.meta.requestedCount} does not match filename n${count}`;
  }

  const integrityErrors = verifyBundleIntegrity(bundle.items, bundle.meta.integrity);
  if (integrityErrors.length > 0) {
    return `question bundle integrity check failed: ${integrityErrors[0]!.code}`;
  }

  return null;
}

async function validatePrebuiltPaperBundleFile(filePath: string, repoPath: string) {
  const match = PREBUILT_BUNDLE_PATTERN.exec(repoPath);
  if (!match) {
    return null;
  }

  const [, runId, blueprintVersion, count] = match;
  const raw = await readFile(filePath, "utf8");
  const parsed = PrebuiltPaperBundleSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return `prebuilt paper bundle JSON does not match schema at ${issue?.path.join(".") || "<root>"}: ${issue?.message ?? "invalid"}`;
  }

  const bundle = parsed.data;
  if (bundle.meta.runId !== runId) {
    return `prebuilt paper bundle meta.runId ${bundle.meta.runId} does not match path runId ${runId}`;
  }

  if (bundle.meta.blueprintVersion !== Number(blueprintVersion)) {
    return `prebuilt paper bundle meta.blueprintVersion ${bundle.meta.blueprintVersion} does not match filename blueprint-v${blueprintVersion}`;
  }

  if (bundle.meta.requestedCount !== Number(count)) {
    return `prebuilt paper bundle meta.requestedCount ${bundle.meta.requestedCount} does not match filename n${count}`;
  }

  const integrityErrors = verifyBundleIntegrity(bundle.items, bundle.meta.integrity);
  if (integrityErrors.length > 0) {
    return `prebuilt paper bundle integrity check failed: ${integrityErrors[0]!.code}`;
  }

  return null;
}

async function validateRepoFile(filePath: string) {
  const repoPath = toRepoPath(filePath);
  const pathMessage = validateRepoPath(repoPath);
  if (pathMessage) {
    return { repoPath, message: pathMessage };
  }

  const bundleMessage =
    (await validateQuestionBundleFile(filePath, repoPath)) ??
    (await validatePrebuiltPaperBundleFile(filePath, repoPath));
  if (bundleMessage) {
    return { repoPath, message: bundleMessage };
  }

  return null;
}

async function main() {
  const files = [
    ...(await collectFiles(path.join(process.cwd(), "papers"))),
    ...(await collectFiles(path.join(process.cwd(), "artifacts"))),
  ];
  const failures = (await Promise.all(files.map(validateRepoFile))).filter(
    (failure): failure is { repoPath: string; message: string } => Boolean(failure),
  );

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`${failure.repoPath}: ${failure.message}`);
    }
    throw new Error(`Offline artifact naming check failed with ${failures.length} issue(s)`);
  }

  console.log(`verifyOfflineArtifactNames: ok (${files.length} files checked)`);
}

await main();
