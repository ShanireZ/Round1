import { pathToFileURL } from "node:url";

import {
  renderStableScriptHelp,
  resolveCommand,
  runStableScriptCommand,
  type StableScriptCommand,
} from "./lib/stableScriptEntry.js";

export const reviewCommands: StableScriptCommand[] = [
  {
    name: "review-real-papers",
    scriptPath: "commands/review/reviewRealPapers.ts",
    summary: "逐题复核真题 metadata 与 explanation",
  },
  {
    name: "rewrite-paper-explanations",
    scriptPath: "commands/review/rewritePaperExplanations.ts",
    summary: "按范围重写 explanation",
  },
  {
    name: "backfill-explanations",
    scriptPath: "commands/review/backfillExplanations.ts",
    summary: "为缺失 explanation 的题目补基础解析",
  },
];

function printHelp() {
  console.log(
    renderStableScriptHelp({
      entryName: "review.ts",
      summary: "Stable entrypoint for paper review and explanation rewrite workflows.",
      commands: reviewCommands,
    }),
  );
}

export async function runReviewCli(argv: readonly string[]) {
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

    const command = resolveCommand(reviewCommands, targetCommand);
    console.log(
      renderStableScriptHelp({
        entryName: "review.ts",
        summary: `Stable help for ${command.name}. Implementation: scripts/${command.scriptPath}`,
        commands: [command],
      }),
    );
    return;
  }

  await runStableScriptCommand({ commands: reviewCommands, commandName, args });
}

const isEntrypoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  runReviewCli(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
