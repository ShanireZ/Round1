import { pathToFileURL } from "node:url";

import {
  renderStableScriptHelp,
  runStableScriptCommand,
  type StableScriptCommand,
} from "./lib/stableScriptEntry.js";

export const questionBundleCommands: StableScriptCommand[] = [
  {
    name: "generate-llm",
    scriptPath: "generateQuestionBundle.ts",
    summary: "使用 LLM 生成单个 question bundle",
  },
  {
    name: "generate-acceptance",
    scriptPath: "buildAcceptanceQuestionBundle.ts",
    summary: "生成确定性 acceptance question bundle",
  },
  {
    name: "build-manual",
    scriptPath: "buildManualQuestionBundles.ts",
    summary: "把人工草稿构建为正式 question bundle",
  },
  {
    name: "validate",
    scriptPath: "validateQuestionBundle.ts",
    summary: "校验 question bundle 产物",
  },
  {
    name: "import",
    scriptPath: "importQuestionBundle.ts",
    summary: "导入单个 question bundle",
  },
  {
    name: "import-batch",
    scriptPath: "importQuestionBundles2026.ts",
    summary: "按目录或 manifest 批量导入 question bundle",
  },
  {
    name: "batch-generate-local",
    scriptPath: "generateBulkQuestionBundles2026.ts",
    summary: "本地确定性批量生成 question bundle",
  },
  {
    name: "batch-generate-llm",
    scriptPath: "generateLlmQuestionBundles2026.ts",
    summary: "批量生成 LLM question bundle",
  },
  {
    name: "batch-review-llm",
    scriptPath: "llmReviewBulkQuestionBundles2026.ts",
    summary: "批量执行 LLM 复核",
  },
  {
    name: "report-remaining-manifest",
    scriptPath: "buildRemainingQuestionBundleImportManifest2026.ts",
    summary: "生成剩余未导入 bundle 清单",
  },
];

function printHelp() {
  console.log(
    renderStableScriptHelp({
      entryName: "questionBundle.ts",
      summary:
        "Stable entrypoint for question bundle generation, validation, import, and batch workflows.",
      commands: questionBundleCommands,
    }),
  );
}

export async function runQuestionBundleCli(argv: readonly string[]) {
  const [commandName, ...args] = argv;

  if (!commandName || commandName === "--help" || commandName === "-h") {
    printHelp();
    return;
  }

  if (commandName === "help") {
    const targetCommand = args[0];
    if (!targetCommand) {
      printHelp();
      return;
    }

    await runStableScriptCommand({
      commands: questionBundleCommands,
      commandName: targetCommand,
      args: ["--help"],
    });
    return;
  }

  await runStableScriptCommand({
    commands: questionBundleCommands,
    commandName,
    args,
  });
}

const isEntrypoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  runQuestionBundleCli(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
