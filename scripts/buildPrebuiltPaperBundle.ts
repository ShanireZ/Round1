import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  DifficultySchema,
  ExamTypeSchema,
  type Difficulty,
  type ExamType,
} from "./lib/bundleTypes.js";
import { defaultPrebuiltPaperBundleOutputPath, formatOfflineRunId } from "./lib/paperPaths.js";

interface BuildPrebuiltPaperBundleCliArgs {
  examType: ExamType;
  difficulty: Difficulty;
  count: number;
  output: string;
  outputExplicit: boolean;
  runId: string;
  artifactVersion: number;
  blueprintVersion: number;
}

function printHelp() {
  console.log(`Usage: tsx scripts/buildPrebuiltPaperBundle.ts --exam-type <type> --difficulty <level> [options]

Options:
  --exam-type <type>         Exam type, e.g. CSP-J
  --difficulty <level>       easy | medium | hard
  --count <number>           Number of prebuilt papers to build (default: 1)
  --run-id <id>              Offline run id (default: YYYY-MM-DD-prebuilt-<exam-type>-<difficulty>-vNN)
  --artifact-version <n>     Artifact version used in run id and file name (default: 1)
  --blueprint-version <n>    Blueprint version for bundle metadata and filename (default: 1)
  --output <path>            Explicit output override. Defaults to the persistent runId prebuilt-paper-bundle path.
  --help                     Show this help message
`);
}

function parsePositiveInteger(value: string | undefined, fallback: number, label: string): number {
  const parsed = Number.parseInt(value ?? String(fallback), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`--${label} must be a positive integer`);
  }

  return parsed;
}

function parseArgs(argv: string[]): BuildPrebuiltPaperBundleCliArgs {
  const values = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }

    values.set(key, value);
    index += 1;
  }

  const examType = ExamTypeSchema.parse(values.get("exam-type"));
  const difficulty = DifficultySchema.parse(values.get("difficulty"));
  const count = parsePositiveInteger(values.get("count"), 1, "count");
  const artifactVersion = parsePositiveInteger(
    values.get("artifact-version"),
    1,
    "artifact-version",
  );
  const blueprintVersion = parsePositiveInteger(
    values.get("blueprint-version"),
    1,
    "blueprint-version",
  );
  const runId =
    values.get("run-id") ??
    formatOfflineRunId({
      date: new Date(),
      pipeline: "prebuilt",
      examType,
      difficulty,
      versionNo: artifactVersion,
    });
  const outputExplicit = values.has("output");

  return {
    examType,
    difficulty,
    count,
    output:
      values.get("output") ??
      defaultPrebuiltPaperBundleOutputPath({
        runId,
        blueprintVersion,
        count,
        versionNo: artifactVersion,
      }),
    outputExplicit,
    runId,
    artifactVersion,
    blueprintVersion,
  };
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    return;
  }

  const args = parseArgs(argv);
  if (!Number.isInteger(args.count) || args.count <= 0) {
    throw new Error("--count must be a positive integer");
  }

  const { buildPrebuiltPaperBundle } = await import("./lib/prebuiltPaperBundleWorkflow.js");
  const bundle = await buildPrebuiltPaperBundle(args);
  const outputPath = path.resolve(process.cwd(), args.output);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    `${JSON.stringify(bundle, null, 2)}\n`,
    args.outputExplicit ? "utf8" : { encoding: "utf8", flag: "wx" },
  );
  console.log(`Built ${bundle.items.length} prebuilt papers -> ${outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
