import { pathToFileURL } from "node:url";

import {
  renderStableScriptHelp,
  resolveCommand,
  runStableScriptCommand,
  type StableScriptCommand,
} from "./lib/stableScriptEntry.js";

export const auditCommands: StableScriptCommand[] = [
  {
    name: "apply-similarity-review-deletions",
    scriptPath: "commands/audit/applySimilarityReviewDeletions2026.ts",
    summary: "应用相似题人工复核后的删除计划",
  },
  {
    name: "audit-question-bundle-similarity",
    scriptPath: "commands/audit/auditQuestionBundleSimilarity2026.ts",
    summary: "审计 question bundle 相似度",
  },
  {
    name: "audit-real-papers",
    scriptPath: "commands/audit/auditRealPapers.ts",
    summary: "执行真题确定性审计",
  },
  {
    name: "build-similarity-review-shards",
    scriptPath: "commands/audit/buildSimilarityReviewShards2026.ts",
    summary: "构建相似题人工复核分片",
  },
  {
    name: "report-docs-inventory",
    scriptPath: "commands/audit/reportDocsInventory.ts",
    summary: "生成 docs 盘点报告",
  },
  {
    name: "report-papers-inventory",
    scriptPath: "commands/audit/reportPapersInventory.ts",
    summary: "生成 papers 盘点报告",
  },
  {
    name: "report-question-inventory",
    scriptPath: "commands/audit/reportQuestionInventory.ts",
    summary: "生成 question inventory 报告",
  },
  {
    name: "verify-llm-tasks",
    scriptPath: "commands/audit/verifyLlmTasks.ts",
    summary: "验证脚本侧 LLM generate/judge 任务",
  },
  {
    name: "verify-offline-artifacts",
    scriptPath: "commands/audit/verifyOfflineArtifactNames.ts",
    summary: "验证离线产物命名与元数据",
  },
  {
    name: "verify-question-bundle-guards",
    scriptPath: "commands/audit/verifyQuestionBundleGuards.ts",
    summary: "验证 question bundle 守卫",
  },
  {
    name: "verify-ui-tokens",
    scriptPath: "commands/audit/verifyUiTokenUsage.ts",
    summary: "验证 UI token 使用",
  },
];

function printHelp() {
  console.log(
    renderStableScriptHelp({
      entryName: "audit.ts",
      summary: "Stable entrypoint for audit, verification, and inventory reporting workflows.",
      commands: auditCommands,
    }),
  );
}

export async function runAuditCli(argv: readonly string[]) {
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

    const command = resolveCommand(auditCommands, targetCommand);
    console.log(
      renderStableScriptHelp({
        entryName: "audit.ts",
        summary: `Stable help for ${command.name}. Implementation: scripts/${command.scriptPath}`,
        commands: [command],
      }),
    );
    return;
  }

  await runStableScriptCommand({ commands: auditCommands, commandName, args });
}

const isEntrypoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  runAuditCli(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
