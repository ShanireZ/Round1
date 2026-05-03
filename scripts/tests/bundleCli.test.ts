import assert from "node:assert/strict";

import { parseApplyMode } from "../lib/scriptCli.js";
import { resolveCommand } from "../lib/stableScriptEntry.js";
import { prebuiltPaperBundleCommands } from "../prebuiltPaperBundle.js";
import { questionBundleCommands } from "../questionBundle.js";

assert.deepEqual(parseApplyMode(new Set(["--dry-run"])), { apply: false });
assert.deepEqual(parseApplyMode(new Set(["--apply"])), { apply: true });

assert.throws(() => parseApplyMode(new Set()), /Exactly one of --dry-run or --apply is required/);
assert.throws(
  () => parseApplyMode(new Set(["--dry-run", "--apply"])),
  /Exactly one of --dry-run or --apply is required/,
);

assert.equal(
  resolveCommand(questionBundleCommands, "generate-llm").scriptPath,
  "generateQuestionBundle.ts",
);
assert.equal(
  resolveCommand(questionBundleCommands, "import-batch").scriptPath,
  "importQuestionBundles2026.ts",
);
assert.equal(
  resolveCommand(prebuiltPaperBundleCommands, "build").scriptPath,
  "buildPrebuiltPaperBundle.ts",
);

assert.throws(
  () => resolveCommand(questionBundleCommands, "unknown-command"),
  /Unknown command: unknown-command[\s\S]*generate-llm[\s\S]*import-batch/,
);

console.log("bundleCli: ok");
