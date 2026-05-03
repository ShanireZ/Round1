import assert from "node:assert/strict";

import { parseApplyMode, parseBundleType } from "../lib/scriptCli.js";
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
  "commands/generateQuestionBundle.ts",
);
assert.equal(
  resolveCommand(questionBundleCommands, "import-batch").scriptPath,
  "commands/importQuestionBundlesBatch.ts",
);
assert.equal(
  resolveCommand(questionBundleCommands, "batch-generate-local").scriptPath,
  "commands/buildQuestionBundlesBatch.ts",
);
assert.equal(
  resolveCommand(questionBundleCommands, "batch-generate-llm").scriptPath,
  "commands/generateLlmQuestionBundlesBatch.ts",
);
assert.equal(
  resolveCommand(questionBundleCommands, "batch-review-llm").scriptPath,
  "commands/llmReviewQuestionBundlesBatch.ts",
);
assert.equal(
  resolveCommand(questionBundleCommands, "report-remaining-manifest").scriptPath,
  "commands/buildRemainingQuestionBundleImportManifest.ts",
);
assert.equal(
  resolveCommand(questionBundleCommands, "validate").scriptPath,
  "commands/validateBundle.ts",
);
assert.equal(
  resolveCommand(questionBundleCommands, "import").scriptPath,
  "commands/importBundle.ts",
);
assert.equal(
  resolveCommand(prebuiltPaperBundleCommands, "build").scriptPath,
  "commands/buildPrebuiltPaperBundle.ts",
);
assert.equal(
  resolveCommand(prebuiltPaperBundleCommands, "validate").scriptPath,
  "commands/validateBundle.ts",
);
assert.equal(
  resolveCommand(prebuiltPaperBundleCommands, "import").scriptPath,
  "commands/importBundle.ts",
);

assert.equal(parseBundleType('{"meta":{"bundleType":"question_bundle"}}'), "question_bundle");
assert.equal(
  parseBundleType('{"meta":{"bundleType":"prebuilt_paper_bundle"}}'),
  "prebuilt_paper_bundle",
);
assert.throws(
  () => parseBundleType('{"meta":{"bundleType":"manual_question_import"}}'),
  /unsupported meta\.bundleType/,
);

assert.throws(
  () => resolveCommand(questionBundleCommands, "unknown-command"),
  /Unknown command: unknown-command[\s\S]*generate-llm[\s\S]*import-batch/,
);

console.log("bundleCli: ok");
