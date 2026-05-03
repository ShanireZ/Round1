import { pathToFileURL } from "node:url";

import {
  renderStableScriptHelp,
  resolveCommand,
  runStableScriptCommand,
  type StableScriptCommand,
} from "./lib/stableScriptEntry.js";

export const collectCommands: StableScriptCommand[] = [
  {
    name: "scrape-luogu",
    scriptPath: "commands/collect/scrapeLuogu.ts",
    summary: "从洛谷抓取真题资产",
  },
  {
    name: "fill-luogu-answers",
    scriptPath: "commands/collect/fillAnswersFromLuogu.ts",
    summary: "回填洛谷官方答案",
  },
  {
    name: "explore-luogu",
    scriptPath: "commands/collect/exploreLuogu.mjs",
    summary: "浏览或探查洛谷题单元数据",
  },
];

function printHelp() {
  console.log(
    renderStableScriptHelp({
      entryName: "collect.ts",
      summary: "Stable entrypoint for collection and source-ingestion preparation scripts.",
      commands: collectCommands,
    }),
  );
}

export async function runCollectCli(argv: readonly string[]) {
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

    const command = resolveCommand(collectCommands, targetCommand);
    console.log(
      renderStableScriptHelp({
        entryName: "collect.ts",
        summary: `Stable help for ${command.name}. Implementation: scripts/${command.scriptPath}`,
        commands: [command],
      }),
    );
    return;
  }

  await runStableScriptCommand({ commands: collectCommands, commandName, args });
}

const isEntrypoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  runCollectCli(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
