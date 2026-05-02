import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { computeContentHash } from "../server/services/deduplicationService.js";
import {
  BUNDLE_SCHEMA_VERSION,
  QuestionBundleItemSchema,
  QuestionBundleSchema,
  type Difficulty,
  type ExamType,
  type QuestionBundleItem,
  type QuestionType,
  computeChecksum,
} from "./lib/bundleTypes.js";
import { defaultQuestionBundleOutputPath } from "./lib/paperPaths.js";

interface DraftMeta {
  runId: string;
  examType: ExamType;
  questionType: QuestionType;
  primaryKpCode: string;
  difficulty: Difficulty;
  requestedCount: number;
  provider?: string;
  model?: string;
  sourceBatchId?: string;
  sourceBatchIds?: string[];
  sourceTimestamp?: string;
  promptText?: string;
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

type DraftItem = DistributiveOmit<QuestionBundleItem, "contentHash" | "sandboxVerified"> & {
  contentHash?: string;
  sandboxVerified?: boolean;
};

interface DraftBundle {
  meta: DraftMeta;
  items: DraftItem[];
}

function printHelp() {
  console.log(`Usage: tsx scripts/buildManualQuestionBundles.ts --draft-dir <dir>

Build final question bundle JSON files from manual draft bundles.

Options:
  --draft-dir <dir>   Directory containing draft JSON files
  --help              Show this help message
`);
}

function readArg(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function parseArgs(argv: string[]) {
  if (argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  const draftDir = readArg(argv, "--draft-dir");
  if (!draftDir) {
    throw new Error("Missing required --draft-dir");
  }

  return {
    draftDir: path.resolve(process.cwd(), draftDir),
  };
}

function summarizeQuestionForHash(item: DraftItem): string {
  if (item.type === "single_choice") {
    return item.contentJson.options.join("\n");
  }

  if (item.type === "reading_program") {
    return item.contentJson.cppCode;
  }

  return item.contentJson.fullCode;
}

function buildSourceBatchIds(meta: DraftMeta): string[] {
  if (Array.isArray(meta.sourceBatchIds) && meta.sourceBatchIds.length > 0) {
    return meta.sourceBatchIds;
  }
  if (meta.sourceBatchId) {
    return [meta.sourceBatchId];
  }

  return [
    [
      "manual-question-bundle-v1",
      meta.runId,
      meta.examType,
      meta.questionType,
      meta.primaryKpCode,
      meta.difficulty,
    ].join(":"),
  ];
}

function finalizeItem(meta: DraftMeta, item: DraftItem): QuestionBundleItem {
  const candidate: DraftItem = {
    ...item,
    difficulty: item.difficulty ?? meta.difficulty,
    primaryKpCode: item.primaryKpCode ?? meta.primaryKpCode,
    auxiliaryKpCodes: item.auxiliaryKpCodes ?? [],
    examTypes: item.examTypes ?? [meta.examType],
    source: item.source ?? "manual",
  };

  return QuestionBundleItemSchema.parse({
    ...candidate,
    sandboxVerified: item.type === "single_choice" ? false : false,
    contentHash: computeContentHash(
      candidate.contentJson.stem,
      summarizeQuestionForHash(candidate),
    ),
  });
}

async function buildDraftBundle(filePath: string): Promise<string> {
  const raw = await readFile(filePath, "utf8");
  const draft = JSON.parse(raw) as DraftBundle;
  if (!draft.meta || !Array.isArray(draft.items)) {
    throw new Error(`Invalid draft shape: ${filePath}`);
  }
  if (draft.items.length !== draft.meta.requestedCount) {
    throw new Error(
      `requestedCount mismatch for ${filePath}: expected ${draft.meta.requestedCount}, got ${draft.items.length}`,
    );
  }

  const timestamp = new Date().toISOString();
  const sourceBatchIds = buildSourceBatchIds(draft.meta);
  const promptSeed = draft.meta.promptText ?? JSON.stringify(draft.meta);
  const finalizedItems = draft.items.map((item) => finalizeItem(draft.meta, item));

  const bundle = QuestionBundleSchema.parse({
    meta: {
      bundleType: "question_bundle",
      schemaVersion: BUNDLE_SCHEMA_VERSION,
      runId: draft.meta.runId,
      createdAt: timestamp,
      generatedAt: timestamp,
      provider: draft.meta.provider ?? "copilot",
      model: draft.meta.model ?? "gpt-5.4",
      promptHash: computeChecksum(promptSeed),
      sourceBatchId: sourceBatchIds[0],
      sourceBatchIds,
      sourceTimestamp: draft.meta.sourceTimestamp ?? timestamp,
      examType: draft.meta.examType,
      questionType: draft.meta.questionType,
      primaryKpCode: draft.meta.primaryKpCode,
      difficulty: draft.meta.difficulty,
      requestedCount: draft.meta.requestedCount,
    },
    items: finalizedItems,
  });

  const outputPath = path.resolve(
    process.cwd(),
    defaultQuestionBundleOutputPath({
      runId: bundle.meta.runId,
      questionType: bundle.meta.questionType,
      kpCode: bundle.meta.primaryKpCode,
      count: bundle.items.length,
      versionNo: 1,
    }),
  );

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
  return path.relative(process.cwd(), outputPath).replaceAll(path.sep, "/");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const entries = await readdir(args.draftDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(args.draftDir, entry.name))
    .sort((left, right) => left.localeCompare(right));

  if (files.length === 0) {
    throw new Error(`No draft JSON files found in ${args.draftDir}`);
  }

  const outputs: string[] = [];
  for (const file of files) {
    outputs.push(await buildDraftBundle(file));
  }

  console.log(JSON.stringify({ built: outputs }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
