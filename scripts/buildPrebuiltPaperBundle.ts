import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { DifficultySchema, ExamTypeSchema } from "./lib/bundleTypes.js";

function printHelp() {
  console.log(`Usage: tsx scripts/buildPrebuiltPaperBundle.ts --exam-type <type> --difficulty <level> [options]

Options:
  --exam-type <type>    Exam type, e.g. CSP-J
  --difficulty <level>  easy | medium | hard
  --count <number>      Number of prebuilt papers to build (default: 1)
  --output <path>       Output path (default: artifacts/prebuilt-papers/paper-packs.json)
  --help                Show this help message
`);
}

function parseArgs(argv: string[]) {
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

  return {
    examType: ExamTypeSchema.parse(values.get("exam-type")),
    difficulty: DifficultySchema.parse(values.get("difficulty")),
    count: Number.parseInt(values.get("count") ?? "1", 10),
    output: values.get("output") ?? path.join("artifacts", "prebuilt-papers", "paper-packs.json"),
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
  await writeFile(outputPath, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
  console.log(`Built ${bundle.items.length} prebuilt papers -> ${outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
