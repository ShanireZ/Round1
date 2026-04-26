import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("scripts/ingestRealPapers CLI", () => {
  it("prints usage when --dir is missing", () => {
    const repoRoot = path.resolve(import.meta.dirname, "..", "..");
    const result = spawnSync("npx tsx scripts/ingestRealPapers.ts", {
      cwd: repoRoot,
      encoding: "utf-8",
      shell: true,
      timeout: 30_000,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "Usage: npx tsx scripts/ingestRealPapers.ts --dir <path> [--confirm]",
    );
  });
});
