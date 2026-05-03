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
