import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export function parseApplyMode(flags: ReadonlySet<string>) {
  const isDryRun = flags.has("--dry-run");
  const isApply = flags.has("--apply");

  if (isDryRun === isApply) {
    throw new Error("Exactly one of --dry-run or --apply is required");
  }

  return {
    apply: isApply,
  };
}

export function readNamedArg(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

export function parsePositiveInteger(raw: string | undefined, fallback: number, label: string) {
  const value = Number.parseInt(raw ?? String(fallback), 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`--${label} must be a positive integer`);
  }

  return value;
}

export function toRepoPath(filePath: string) {
  return filePath.replaceAll("\\", "/");
}

export type SupportedBundleType = "question_bundle" | "prebuilt_paper_bundle";

const SUPPORTED_BUNDLE_TYPES = new Set<SupportedBundleType>([
  "question_bundle",
  "prebuilt_paper_bundle",
]);

export function renderCliHelp(params: {
  usage: string;
  summary?: string;
  options?: ReadonlyArray<{
    flag: string;
    description: string;
  }>;
}) {
  const lines = [`Usage: ${params.usage}`];

  if (params.summary) {
    lines.push("", params.summary);
  }

  if (params.options && params.options.length > 0) {
    lines.push(
      "",
      "Options:",
      ...params.options.map((option) => `  ${option.flag.padEnd(18)} ${option.description}`),
    );
  }

  return `${lines.join("\n")}\n`;
}

export function formatJsonOutput(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function printJsonOutput(value: unknown) {
  console.log(JSON.stringify(value, null, 2));
}

export async function writeJsonOutput(filePath: string, value: unknown) {
  await writeFile(filePath, formatJsonOutput(value), "utf8");
}

export function toDisplayRepoPath(filePath: string) {
  return toRepoPath(path.relative(process.cwd(), path.resolve(filePath)));
}

export function parseBundleType(raw: string, label = "bundle"): SupportedBundleType {
  const parsed = JSON.parse(raw) as {
    meta?: {
      bundleType?: unknown;
    };
  };
  const bundleType = parsed.meta?.bundleType;

  if (!SUPPORTED_BUNDLE_TYPES.has(bundleType as SupportedBundleType)) {
    throw new Error(
      `${label} has unsupported meta.bundleType: ${String(bundleType)}. ` +
        `Expected one of ${[...SUPPORTED_BUNDLE_TYPES].join(", ")}.`,
    );
  }

  return bundleType as SupportedBundleType;
}

export async function readBundleType(bundlePath: string) {
  const raw = await readFile(bundlePath, "utf8");
  return parseBundleType(raw, toDisplayRepoPath(bundlePath));
}

export async function dispatchByBundleType<T>(params: {
  bundlePath: string;
  handlers: Record<SupportedBundleType, () => Promise<T>>;
}) {
  const bundleType = await readBundleType(params.bundlePath);
  return params.handlers[bundleType]();
}
