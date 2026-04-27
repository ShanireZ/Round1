import { readdir } from "node:fs/promises";
import path from "node:path";

const LEGACY_QUESTION_BUNDLE_ALLOWLIST = new Set([
  "papers/2026/2026-04-26-reading_program-30.json",
  "papers/2026/2026-04-26-completion_program-20.json",
]);

const RUN_ID_PATTERN = String.raw`\d{4}-\d{2}-\d{2}-[a-z0-9-]+-[a-z0-9-]+-[a-z0-9-]+-v\d{2}`;
const QUESTION_BUNDLE_PATTERN = new RegExp(
  String.raw`^papers/\d{4}/(${RUN_ID_PATTERN})/question-bundles/\1__question-bundle__[a-z0-9-]+__[a-z0-9-]+__n\d+__v\d{2}\.json$`,
);
const PREBUILT_BUNDLE_PATTERN = new RegExp(
  String.raw`^artifacts/prebuilt-papers/\d{4}/(${RUN_ID_PATTERN})/\1__prebuilt-paper-bundle__blueprint-v\d+__n\d+__v\d{2}\.json$`,
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

function validateRepoPath(repoPath: string): string | null {
  if (repoPath === "artifacts/prebuilt-papers/paper-packs.json") {
    return "prebuilt paper bundle uses the deprecated generic paper-packs.json name";
  }

  if (/^artifacts\/llm-step3\/probe.*\.json$/.test(repoPath)) {
    return "LLM probe JSON must live under artifacts/tmp/<year>/<runId>/";
  }

  if (isQuestionBundleDirectlyUnderYear(repoPath)) {
    if (LEGACY_QUESTION_BUNDLE_ALLOWLIST.has(repoPath)) {
      return null;
    }

    return "question bundle JSON must live under papers/<year>/<runId>/question-bundles/";
  }

  if (
    repoPath.startsWith("papers/") &&
    repoPath.endsWith(".json") &&
    !repoPath.startsWith("papers/real-papers/") &&
    !QUESTION_BUNDLE_PATTERN.test(repoPath) &&
    !LEGACY_QUESTION_BUNDLE_ALLOWLIST.has(repoPath)
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

async function main() {
  const files = [
    ...(await collectFiles(path.join(process.cwd(), "papers"))),
    ...(await collectFiles(path.join(process.cwd(), "artifacts"))),
  ];
  const failures = files
    .map(toRepoPath)
    .map((repoPath) => ({ repoPath, message: validateRepoPath(repoPath) }))
    .filter((failure): failure is { repoPath: string; message: string } =>
      Boolean(failure.message),
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
