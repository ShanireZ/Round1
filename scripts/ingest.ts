import { pathToFileURL } from "node:url";

import {
  renderStableScriptHelp,
  resolveCommand,
  runStableScriptCommand,
  type StableScriptCommand,
} from "./lib/stableScriptEntry.js";

export const ingestCommands: StableScriptCommand[] = [
  {
    name: "ingest-real-papers",
    scriptPath: "commands/ingest/ingestRealPapers.ts",
    summary: "导入历年真题并创建评审记录",
  },
  {
    name: "import-manual-questions",
    scriptPath: "commands/ingest/importManualQuestions.ts",
    summary: "导入手工题目 JSON",
  },
  {
    name: "update-answers-db",
    scriptPath: "commands/ingest/updateAnswersInDB.ts",
    summary: "用真题资产回写数据库答案",
  },
];

function printHelp() {
  console.log(
    renderStableScriptHelp({
      entryName: "ingest.ts",
      summary:
        "Stable entrypoint for ingesting collected or manual content into Round1 data stores.",
      commands: ingestCommands,
    }),
  );
}

export async function runIngestCli(argv: readonly string[]) {
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

    const command = resolveCommand(ingestCommands, targetCommand);
    console.log(
      renderStableScriptHelp({
        entryName: "ingest.ts",
        summary: `Stable help for ${command.name}. Implementation: scripts/${command.scriptPath}`,
        commands: [command],
      }),
    );
    return;
  }

  await runStableScriptCommand({ commands: ingestCommands, commandName, args });
}

const isEntrypoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  runIngestCli(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
