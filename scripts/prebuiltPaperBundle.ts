import { pathToFileURL } from "node:url";

import {
  renderStableCommandHelp,
  renderStableScriptHelp,
  resolveCommand,
  runStableScriptCommand,
  type StableScriptCommand,
} from "./lib/stableScriptEntry.js";

export const prebuiltPaperBundleCommands: StableScriptCommand[] = [
  {
    name: "build",
    scriptPath: "commands/buildPrebuiltPaperBundle.ts",
    summary: "构建 prebuilt paper bundle",
  },
  {
    name: "validate",
    scriptPath: "commands/validateBundle.ts",
    summary: "校验 prebuilt paper bundle",
  },
  {
    name: "import",
    scriptPath: "commands/importBundle.ts",
    summary: "导入 prebuilt paper bundle",
  },
];

function printHelp() {
  console.log(
    renderStableScriptHelp({
      entryName: "prebuiltPaperBundle.ts",
      summary: "Stable entrypoint for prebuilt paper bundle build, validation, and import.",
      commands: prebuiltPaperBundleCommands,
    }),
  );
}

export async function runPrebuiltPaperBundleCli(argv: readonly string[]) {
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

    console.log(
      renderStableCommandHelp({
        entryName: "prebuiltPaperBundle.ts",
        command: resolveCommand(prebuiltPaperBundleCommands, targetCommand),
      }),
    );
    return;
  }

  await runStableScriptCommand({
    commands: prebuiltPaperBundleCommands,
    commandName,
    args,
  });
}

const isEntrypoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  runPrebuiltPaperBundleCli(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
