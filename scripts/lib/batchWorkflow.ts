import fs from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { formatJsonOutput, toDisplayRepoPath } from "./scriptCli.js";

export interface BatchFileEntry {
  absolutePath: string;
  repoPath: string;
  ordinal: number;
  runId: string;
}

export function listJsonFilesRecursively(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listJsonFilesRecursively(entryPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(entryPath);
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

export function readManifestBundlePaths(manifestPath: string): string[] {
  const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
    bundlePaths?: unknown;
    bundles?: unknown;
  };

  if (Array.isArray(parsed.bundlePaths)) {
    return parsed.bundlePaths.filter((entry): entry is string => typeof entry === "string");
  }

  if (Array.isArray(parsed.bundles)) {
    return parsed.bundles
      .filter((entry): entry is { path: string; finalVerdict?: string } => {
        if (typeof entry !== "object" || entry === null) {
          return false;
        }

        const maybeEntry = entry as { path?: unknown; finalVerdict?: unknown };
        return (
          typeof maybeEntry.path === "string" &&
          (maybeEntry.finalVerdict === undefined || maybeEntry.finalVerdict === "pass")
        );
      })
      .map((entry) => entry.path);
  }

  throw new Error(`Unsupported manifest shape: ${manifestPath}`);
}

export function listManifestBundleFiles(manifestArg: string): string[] {
  const files = manifestArg
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .flatMap((manifestPath) => readManifestBundlePaths(manifestPath))
    .map((entry) => path.resolve(entry));

  return [...new Set(files)].sort((left, right) => left.localeCompare(right));
}

export function describeUnknownError(value: unknown): string {
  if (value instanceof Error) {
    const maybeCause = (value as Error & { cause?: unknown }).cause;
    return maybeCause === undefined
      ? value.message
      : `${value.message}; cause: ${describeUnknownError(maybeCause)}`;
  }

  if (typeof value === "object" && value !== null) {
    const details = value as Record<string, unknown>;
    const fields = ["message", "code", "detail", "hint", "constraint", "table", "column"]
      .map((key) => {
        const field = details[key];
        return field === undefined ? undefined : `${key}=${String(field)}`;
      })
      .filter((field): field is string => field !== undefined);

    if (fields.length > 0) {
      return fields.join(", ");
    }
  }

  return String(value);
}

export async function collectFilesRecursively(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const child = path.join(root, entry.name);
      if (entry.isDirectory()) {
        return collectFilesRecursively(child);
      }
      if (entry.isFile()) {
        return [child];
      }
      return [];
    }),
  );

  return nested.flat();
}

export async function listGeneratedBundleFiles(params: {
  rootDir: string;
  prefix: string;
  shardIndex: number;
  shardCount: number;
  limit: number | undefined;
  runIds: Set<string> | undefined;
}): Promise<BatchFileEntry[]> {
  const files = (await collectFilesRecursively(params.rootDir))
    .filter((file) => file.endsWith(".json"))
    .map((absolutePath) => ({
      absolutePath,
      runId: path.basename(path.dirname(path.dirname(absolutePath))),
    }))
    .filter((entry) => entry.runId.startsWith(params.prefix))
    .sort((left, right) => left.absolutePath.localeCompare(right.absolutePath));

  const selected = files
    .map((entry, ordinal) => ({
      absolutePath: entry.absolutePath,
      repoPath: toDisplayRepoPath(entry.absolutePath),
      ordinal,
      runId: entry.runId,
    }))
    .filter((entry) => {
      if (!params.runIds) {
        return true;
      }

      return params.runIds.has(entry.runId);
    })
    .filter((entry) => entry.ordinal % params.shardCount === params.shardIndex);

  return typeof params.limit === "number" ? selected.slice(0, params.limit) : selected;
}

export async function writeBatchJsonReport(params: {
  reportPath: string;
  payload: unknown;
  overwrite: boolean;
}) {
  await mkdir(path.dirname(params.reportPath), { recursive: true });
  await writeFile(params.reportPath, formatJsonOutput(params.payload), {
    encoding: "utf8",
    flag: params.overwrite ? "w" : "wx",
  });
  return toDisplayRepoPath(params.reportPath);
}
