import { spawn } from "node:child_process";
import path from "node:path";

export interface StableScriptCommand {
  name: string;
  scriptPath: string;
  summary: string;
}

function listCommandNames(commands: readonly StableScriptCommand[]) {
  return commands.map((command) => command.name).sort((left, right) => left.localeCompare(right));
}

export function resolveCommand(commands: readonly StableScriptCommand[], commandName: string) {
  const command = commands.find((candidate) => candidate.name === commandName);
  if (!command) {
    const legalCommands = listCommandNames(commands).join(", ");
    throw new Error(`Unknown command: ${commandName}. Available commands: ${legalCommands}`);
  }

  return command;
}

export function renderStableScriptHelp(params: {
  entryName: string;
  summary: string;
  commands: readonly StableScriptCommand[];
}) {
  const commandLines = [...params.commands]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((command) => `  ${command.name.padEnd(24)} ${command.summary}`)
    .join("\n");

  return `Usage: tsx scripts/${params.entryName} <command> [...args]\n\n${params.summary}\n\nCommands:\n${commandLines}\n`;
}

export function renderStableCommandHelp(params: {
  entryName: string;
  command: StableScriptCommand;
}) {
  return renderStableScriptHelp({
    entryName: params.entryName,
    summary: `Stable help for ${params.command.name}. Implementation: scripts/${params.command.scriptPath}`,
    commands: [params.command],
  });
}

export async function runStableScriptCommand(params: {
  commands: readonly StableScriptCommand[];
  commandName: string;
  args: readonly string[];
}) {
  const command = resolveCommand(params.commands, params.commandName);
  const scriptPath = path.resolve(import.meta.dirname, "..", command.scriptPath);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", scriptPath, ...params.args], {
      cwd: process.cwd(),
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`Command ${params.commandName} terminated by signal ${signal}`));
        return;
      }

      if ((code ?? 1) !== 0) {
        reject(new Error(`Command ${params.commandName} failed with exit code ${String(code)}`));
        return;
      }

      resolve();
    });
  });
}
