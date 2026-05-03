import fs from "node:fs";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { pool } from "../server/db.js";
import {
  buildBundleIntegrity,
  QuestionBundleSchema,
  type QuestionBundle,
  type QuestionBundleItem,
} from "./lib/bundleTypes.js";

const usage = `Usage: npx tsx scripts/applySimilarityReviewDeletions2026.ts --verdict-dir <dir> [--source-dir papers/2026] [--report-dir <dir>] [--apply] [--skip-db] [--delete-paper-slots]`;

interface Args {
  verdictDir: string;
  sourceDir: string;
  reportDir: string;
  apply: boolean;
  skipDb: boolean;
  deletePaperSlots: boolean;
}

interface ShardComponentItem {
  id: string;
  sourcePath: string;
  itemIndex: number;
  contentHash: string;
}

interface ShardComponent {
  componentId: string;
  items: ShardComponentItem[];
}

interface ShardFile {
  shardNo: number;
  components: ShardComponent[];
}

interface VerdictDecision {
  componentId: string;
  verdict: "all_keep" | "delete_some";
  keepItemIds: string[];
  deleteItemIds: string[];
  confidence?: number;
  rationale?: string;
}

interface VerdictFile {
  shardNo: number;
  decisions: VerdictDecision[];
  summary?: {
    components?: number;
    deleteItems?: number;
    keepAllComponents?: number;
  };
}

interface IndexedItem {
  id: string;
  sourcePath: string;
  itemIndex: number;
  contentHash: string;
  item: QuestionBundleItem;
}

interface BundleRewrite {
  sourcePath: string;
  targetPath: string | null;
  oldCount: number;
  newCount: number;
  deleteIndexes: number[];
  deleteItemIds: string[];
}

function readArg(args: string[], name: string) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function parseArgs(argv: string[]): Args {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(usage);
    process.exit(0);
  }

  const verdictDir = readArg(argv, "--verdict-dir");
  if (!verdictDir) {
    throw new Error("--verdict-dir is required");
  }

  const sourceDir = readArg(argv, "--source-dir") ?? "papers/2026";
  const reportDir =
    readArg(argv, "--report-dir") ??
    path.resolve(process.cwd(), "artifacts/reports/2026/cleanups/similarity");

  return {
    verdictDir,
    sourceDir,
    reportDir,
    apply: argv.includes("--apply"),
    skipDb: argv.includes("--skip-db"),
    deletePaperSlots: argv.includes("--delete-paper-slots"),
  };
}

function repoPath(filePath: string) {
  return path.relative(process.cwd(), path.resolve(process.cwd(), filePath)).replaceAll(path.sep, "/");
}

function normalizeRepoPath(filePath: string) {
  return repoPath(filePath);
}

function listJsonFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listJsonFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(path.resolve(entryPath));
    }
  }
  return files.sort((left, right) => left.localeCompare(right));
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

function normalizeStringArray(value: unknown, label: string): string[] {
  if (value === null || value === undefined) {
    return [];
  }
  if (typeof value === "string") {
    return [value];
  }
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    throw new Error(`${label} must be a string array`);
  }
  return value;
}

function parseVerdict(value: unknown, filePath: string): VerdictFile {
  if (typeof value !== "object" || value === null) {
    throw new Error(`Invalid verdict file: ${filePath}`);
  }
  const record = value as Record<string, unknown>;
  if (!Number.isInteger(record.shardNo)) {
    throw new Error(`Verdict shardNo missing: ${filePath}`);
  }
  if (!Array.isArray(record.decisions)) {
    throw new Error(`Verdict decisions missing: ${filePath}`);
  }

  return {
    shardNo: record.shardNo as number,
    decisions: record.decisions.map((entry, index) => {
      if (typeof entry !== "object" || entry === null) {
        throw new Error(`Invalid verdict decision ${index}: ${filePath}`);
      }
      const decision = entry as Record<string, unknown>;
      if (decision.verdict !== "all_keep" && decision.verdict !== "delete_some") {
        throw new Error(`Invalid verdict value in decision ${index}: ${filePath}`);
      }
      if (typeof decision.componentId !== "string") {
        throw new Error(`Invalid componentId in decision ${index}: ${filePath}`);
      }
      return {
        componentId: decision.componentId,
        verdict: decision.verdict,
        keepItemIds: normalizeStringArray(decision.keepItemIds, `decision ${index}.keepItemIds`),
        deleteItemIds: normalizeStringArray(decision.deleteItemIds, `decision ${index}.deleteItemIds`),
        confidence:
          typeof decision.confidence === "number" && Number.isFinite(decision.confidence)
            ? decision.confidence
            : undefined,
        rationale: typeof decision.rationale === "string" ? decision.rationale : undefined,
      };
    }),
    summary:
      typeof record.summary === "object" && record.summary !== null
        ? (record.summary as VerdictFile["summary"])
        : undefined,
  };
}

function findShardFiles(verdictDir: string) {
  return fs
    .readdirSync(verdictDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^similarity-review-shard-\d{2}\.json$/.test(entry.name))
    .map((entry) => path.join(verdictDir, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

function verdictPathForShard(shardPath: string) {
  return shardPath.replace(/\.json$/, ".verdict.json");
}

async function loadDeletionDecisions(verdictDir: string) {
  const shardFiles = findShardFiles(verdictDir);
  if (shardFiles.length === 0) {
    throw new Error(`No shard files found in ${verdictDir}`);
  }

  const deleteItemIds = new Set<string>();
  const keepItemIds = new Set<string>();
  const decisions: Array<VerdictDecision & { shardNo: number }> = [];
  const validationErrors: string[] = [];
  let componentCount = 0;

  for (const shardPath of shardFiles) {
    const shard = await readJsonFile<ShardFile>(shardPath);
    const verdictPath = verdictPathForShard(shardPath);
    if (!fs.existsSync(verdictPath)) {
      throw new Error(`Missing verdict file for ${repoPath(shardPath)}: ${repoPath(verdictPath)}`);
    }
    const verdict = parseVerdict(await readJsonFile<unknown>(verdictPath), verdictPath);
    if (verdict.shardNo !== shard.shardNo) {
      throw new Error(`Verdict shardNo mismatch for ${repoPath(verdictPath)}`);
    }

    const componentsById = new Map(shard.components.map((component) => [component.componentId, component]));
    const decisionsByComponent = new Map(verdict.decisions.map((decision) => [decision.componentId, decision]));

    for (const component of shard.components) {
      componentCount += 1;
      const decision = decisionsByComponent.get(component.componentId);
      if (!decision) {
        validationErrors.push(`${repoPath(verdictPath)} missing decision for ${component.componentId}`);
        continue;
      }

      const componentItemIds = new Set(component.items.map((item) => item.id));
      const declaredKeep = new Set(decision.keepItemIds);
      const declaredDelete = new Set(decision.deleteItemIds);
      const overlap = [...declaredKeep].filter((itemId) => declaredDelete.has(itemId));
      const unknown = [...declaredKeep, ...declaredDelete].filter(
        (itemId) => !componentItemIds.has(itemId),
      );
      const missing = [...componentItemIds].filter(
        (itemId) => !declaredKeep.has(itemId) && !declaredDelete.has(itemId),
      );

      if (overlap.length > 0) {
        validationErrors.push(`${component.componentId} has keep/delete overlap: ${overlap.join(", ")}`);
      }
      if (unknown.length > 0) {
        validationErrors.push(`${component.componentId} mentions unknown items: ${unknown.join(", ")}`);
      }
      if (decision.verdict === "all_keep" && decision.deleteItemIds.length > 0) {
        validationErrors.push(`${component.componentId} is all_keep but has deleteItemIds`);
      }
      if (decision.verdict === "delete_some" && decision.deleteItemIds.length === 0) {
        validationErrors.push(`${component.componentId} is delete_some but deleteItemIds is empty`);
      }
      if (missing.length > 0) {
        validationErrors.push(`${component.componentId} does not partition all items: ${missing.join(", ")}`);
      }

      for (const itemId of decision.keepItemIds) {
        keepItemIds.add(itemId);
      }
      for (const itemId of decision.deleteItemIds) {
        deleteItemIds.add(itemId);
      }
      decisions.push({ ...decision, shardNo: shard.shardNo });
    }

    for (const decision of verdict.decisions) {
      if (!componentsById.has(decision.componentId)) {
        validationErrors.push(`${repoPath(verdictPath)} has unknown component ${decision.componentId}`);
      }
    }
  }

  const globalOverlap = [...deleteItemIds].filter((itemId) => keepItemIds.has(itemId));
  if (globalOverlap.length > 0) {
    validationErrors.push(`global keep/delete overlap: ${globalOverlap.join(", ")}`);
  }
  if (validationErrors.length > 0) {
    throw new Error(`Verdict validation failed:\n${validationErrors.join("\n")}`);
  }

  return {
    componentCount,
    shardCount: shardFiles.length,
    deleteItemIds,
    keepItemIds,
    decisions,
  };
}

async function loadBundle(filePath: string): Promise<QuestionBundle> {
  const parsed = QuestionBundleSchema.safeParse(await readJsonFile<unknown>(filePath));
  if (!parsed.success) {
    throw new Error(`${repoPath(filePath)} is not a valid question bundle: ${parsed.error.issues[0]?.message}`);
  }
  return parsed.data;
}

async function indexQuestionBundles(sourceDir: string) {
  const files = listJsonFiles(path.resolve(process.cwd(), sourceDir));
  const bundles = new Map<string, QuestionBundle>();
  const items = new Map<string, IndexedItem>();

  for (const file of files) {
    const bundle = await loadBundle(file);
    const sourcePath = normalizeRepoPath(file);
    bundles.set(sourcePath, bundle);
    for (const [itemIndex, item] of bundle.items.entries()) {
      const id = `${sourcePath}#${itemIndex}`;
      items.set(id, {
        id,
        sourcePath,
        itemIndex,
        contentHash: item.contentHash,
        item,
      });
    }
  }

  return { bundles, files, items };
}

function chooseTargetPath(params: {
  sourcePath: string;
  newCount: number;
  reservedTargets: Set<string>;
  changedSources: Set<string>;
}) {
  const sourceAbs = path.resolve(process.cwd(), params.sourcePath);
  const parsed = path.parse(sourceAbs);
  const replaced = parsed.base.replace(/__n\d+__/, `__n${params.newCount}__`);
  let baseName = replaced === parsed.base ? parsed.base : replaced;

  for (let attempt = 1; attempt <= 99; attempt += 1) {
    if (attempt > 1) {
      baseName = replaced.replace(/__v\d+\.json$/, `__v${String(attempt).padStart(2, "0")}.json`);
      if (baseName === replaced) {
        baseName = `${parsed.name}__cleanup-v${String(attempt).padStart(2, "0")}${parsed.ext}`;
      }
    }
    const targetAbs = path.join(parsed.dir, baseName);
    const targetRepo = normalizeRepoPath(targetAbs);
    const samePath = normalizeRepoPath(sourceAbs) === targetRepo;
    const occupiedByExistingFile = fs.existsSync(targetAbs) && !samePath;
    const occupiedByPlannedTarget = params.reservedTargets.has(targetRepo) && !samePath;
    if (!occupiedByExistingFile && !occupiedByPlannedTarget) {
      params.reservedTargets.add(targetRepo);
      return targetRepo;
    }
  }

  throw new Error(`Unable to choose non-conflicting target path for ${params.sourcePath}`);
}

function remapSandboxIndexes(
  bundle: QuestionBundle,
  deleteIndexes: Set<number>,
): number[] | undefined {
  const existing = bundle.meta.validation?.sandboxVerifiedItemIndexes;
  if (!existing) {
    return undefined;
  }

  const oldToNew = new Map<number, number>();
  let nextIndex = 0;
  for (let index = 0; index < bundle.items.length; index += 1) {
    if (!deleteIndexes.has(index)) {
      oldToNew.set(index, nextIndex);
      nextIndex += 1;
    }
  }

  return existing
    .map((index) => oldToNew.get(index))
    .filter((index): index is number => index !== undefined);
}

function rewriteBundle(bundle: QuestionBundle, deleteIndexes: Set<number>): QuestionBundle | null {
  const items = bundle.items.filter((_item, index) => !deleteIndexes.has(index));
  if (items.length === 0) {
    return null;
  }

  const sandboxVerifiedItemIndexes = remapSandboxIndexes(bundle, deleteIndexes);
  const validation = bundle.meta.validation
    ? {
        ...bundle.meta.validation,
        ...(sandboxVerifiedItemIndexes ? { sandboxVerifiedItemIndexes } : {}),
      }
    : undefined;

  return {
    meta: {
      ...bundle.meta,
      requestedCount: items.length,
      ...(validation ? { validation } : {}),
      integrity: buildBundleIntegrity(items),
    },
    items,
  };
}

function buildDeletionPlan(params: {
  bundles: Map<string, QuestionBundle>;
  items: Map<string, IndexedItem>;
  deleteItemIds: Set<string>;
}) {
  const missingItems = [...params.deleteItemIds].filter((itemId) => !params.items.has(itemId));
  if (missingItems.length > 0) {
    throw new Error(`Delete plan references missing current items:\n${missingItems.join("\n")}`);
  }

  const deleteByFile = new Map<string, number[]>();
  for (const itemId of params.deleteItemIds) {
    const indexed = params.items.get(itemId)!;
    const bucket = deleteByFile.get(indexed.sourcePath) ?? [];
    bucket.push(indexed.itemIndex);
    deleteByFile.set(indexed.sourcePath, bucket);
  }

  const changedSources = new Set(deleteByFile.keys());
  const reservedTargets = new Set<string>();
  const rewrites: BundleRewrite[] = [];

  for (const [sourcePath, deleteIndexesRaw] of [...deleteByFile.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const bundle = params.bundles.get(sourcePath);
    if (!bundle) {
      throw new Error(`Bundle missing from index: ${sourcePath}`);
    }
    const deleteIndexes = [...new Set(deleteIndexesRaw)].sort((left, right) => left - right);
    const newCount = bundle.items.length - deleteIndexes.length;
    const targetPath =
      newCount > 0
        ? chooseTargetPath({ sourcePath, newCount, reservedTargets, changedSources })
        : null;

    rewrites.push({
      sourcePath,
      targetPath,
      oldCount: bundle.items.length,
      newCount,
      deleteIndexes,
      deleteItemIds: deleteIndexes.map((index) => `${sourcePath}#${index}`),
    });
  }

  const deletedItems = [...params.deleteItemIds].map((itemId) => params.items.get(itemId)!);
  const deletedContentHashes = new Set(deletedItems.map((item) => item.contentHash));
  const keptContentHashes = new Set<string>();

  for (const [itemId, item] of params.items.entries()) {
    if (!params.deleteItemIds.has(itemId)) {
      keptContentHashes.add(item.contentHash);
    }
  }

  const dbDeleteContentHashes = [...deletedContentHashes]
    .filter((contentHash) => !keptContentHashes.has(contentHash))
    .sort((left, right) => left.localeCompare(right));

  return {
    rewrites,
    deletedItems,
    deletedContentHashes: [...deletedContentHashes].sort((left, right) => left.localeCompare(right)),
    keptContentHashes: [...keptContentHashes].sort((left, right) => left.localeCompare(right)),
    dbDeleteContentHashes,
  };
}

async function queryDbPlan(contentHashes: string[]) {
  if (contentHashes.length === 0) {
    return {
      questionRows: [],
      dependentRows: {
        questionReviews: 0,
        questionExamTypes: 0,
        questionKpTags: 0,
        prebuiltPaperSlots: 0,
        paperQuestionSlots: 0,
      },
    };
  }

  const questionRowsResult = await pool.query<{
    id: string;
    content_hash: string;
    source: string;
  }>(
    `
      select id, content_hash, source
      from questions
      where content_hash = any($1::varchar[])
        and source <> 'real_paper'
      order by content_hash
    `,
    [contentHashes],
  );
  const ids = questionRowsResult.rows.map((row) => row.id);
  if (ids.length === 0) {
    return {
      questionRows: [],
      dependentRows: {
        questionReviews: 0,
        questionExamTypes: 0,
        questionKpTags: 0,
        prebuiltPaperSlots: 0,
        paperQuestionSlots: 0,
      },
    };
  }

  const countResult = await pool.query<{
    question_reviews: string;
    question_exam_types: string;
    question_kp_tags: string;
    prebuilt_paper_slots: string;
    paper_question_slots: string;
  }>(
    `
      select
        (select count(*) from question_reviews where question_id = any($1::uuid[])) as question_reviews,
        (select count(*) from question_exam_types where question_id = any($1::uuid[])) as question_exam_types,
        (select count(*) from question_kp_tags where question_id = any($1::uuid[])) as question_kp_tags,
        (select count(*) from prebuilt_paper_slots where question_id = any($1::uuid[])) as prebuilt_paper_slots,
        (select count(*) from paper_question_slots where current_question_id = any($1::uuid[])) as paper_question_slots
    `,
    [ids],
  );
  const row = countResult.rows[0]!;

  return {
    questionRows: questionRowsResult.rows,
    dependentRows: {
      questionReviews: Number(row.question_reviews),
      questionExamTypes: Number(row.question_exam_types),
      questionKpTags: Number(row.question_kp_tags),
      prebuiltPaperSlots: Number(row.prebuilt_paper_slots),
      paperQuestionSlots: Number(row.paper_question_slots),
    },
  };
}

async function deleteDbRows(params: { ids: string[]; deletePaperSlots: boolean }) {
  if (params.ids.length === 0) {
    return {
      questionReviews: 0,
      questionExamTypes: 0,
      questionKpTags: 0,
      prebuiltPaperSlots: 0,
      paperQuestionSlots: 0,
      questions: 0,
    };
  }

  const client = await pool.connect();
  try {
    await client.query("begin");
    const counts = {
      questionReviews: Number(
        (await client.query("delete from question_reviews where question_id = any($1::uuid[])", [
          params.ids,
        ])).rowCount ?? 0,
      ),
      questionExamTypes: Number(
        (await client.query("delete from question_exam_types where question_id = any($1::uuid[])", [
          params.ids,
        ])).rowCount ?? 0,
      ),
      questionKpTags: Number(
        (await client.query("delete from question_kp_tags where question_id = any($1::uuid[])", [
          params.ids,
        ])).rowCount ?? 0,
      ),
      prebuiltPaperSlots: Number(
        (await client.query("delete from prebuilt_paper_slots where question_id = any($1::uuid[])", [
          params.ids,
        ])).rowCount ?? 0,
      ),
      paperQuestionSlots: 0,
      questions: 0,
    };

    if (params.deletePaperSlots) {
      counts.paperQuestionSlots = Number(
        (await client.query(
          "delete from paper_question_slots where current_question_id = any($1::uuid[])",
          [params.ids],
        )).rowCount ?? 0,
      );
    }

    counts.questions = Number(
      (await client.query("delete from questions where id = any($1::uuid[])", [params.ids])).rowCount ??
        0,
    );
    await client.query("commit");
    return counts;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function applyJsonRewrites(params: {
  bundles: Map<string, QuestionBundle>;
  rewrites: BundleRewrite[];
  backupDir: string;
}) {
  const changedPathMap = new Map<string, string | null>();

  for (const rewrite of params.rewrites) {
    const sourceAbs = path.resolve(process.cwd(), rewrite.sourcePath);
    const backupAbs = path.join(params.backupDir, rewrite.sourcePath);
    await mkdir(path.dirname(backupAbs), { recursive: true });
    await copyFile(sourceAbs, backupAbs);

    const bundle = params.bundles.get(rewrite.sourcePath);
    if (!bundle) {
      throw new Error(`Bundle missing while applying: ${rewrite.sourcePath}`);
    }
    const nextBundle = rewriteBundle(bundle, new Set(rewrite.deleteIndexes));

    if (nextBundle === null) {
      await rm(sourceAbs);
      changedPathMap.set(rewrite.sourcePath, null);
      continue;
    }

    const targetPath = rewrite.targetPath ?? rewrite.sourcePath;
    const targetAbs = path.resolve(process.cwd(), targetPath);
    await mkdir(path.dirname(targetAbs), { recursive: true });
    await writeFile(targetAbs, `${JSON.stringify(nextBundle, null, 2)}\n`);

    if (normalizeRepoPath(targetAbs) !== normalizeRepoPath(sourceAbs)) {
      await rm(sourceAbs);
    }
    changedPathMap.set(rewrite.sourcePath, targetPath);
  }

  return changedPathMap;
}

async function writePlanReport(params: {
  args: Args;
  mode: "dry-run" | "applied";
  backupDir?: string;
  verdictSummary: {
    shardCount: number;
    componentCount: number;
    deleteItemCount: number;
    decisionCount: number;
  };
  plan: ReturnType<typeof buildDeletionPlan>;
  dbPlan: Awaited<ReturnType<typeof queryDbPlan>>;
  dbDeletedRows?: Awaited<ReturnType<typeof deleteDbRows>>;
}) {
  await mkdir(params.args.reportDir, { recursive: true });
  const generatedAt = new Date().toISOString();
  const report = {
    generatedAt,
    reportType: "similarity_review_deletion_2026",
    mode: params.mode,
    sourceDir: repoPath(params.args.sourceDir),
    verdictDir: repoPath(params.args.verdictDir),
    verdictSummary: params.verdictSummary,
    jsonPlan: {
      affectedBundleFiles: params.plan.rewrites.length,
      deletedBundleFiles: params.plan.rewrites.filter((rewrite) => rewrite.newCount === 0).length,
      rewrittenBundleFiles: params.plan.rewrites.filter((rewrite) => rewrite.newCount > 0).length,
      deletedItems: params.plan.deletedItems.length,
      deletedContentHashes: params.plan.deletedContentHashes.length,
      dbDeleteContentHashes: params.plan.dbDeleteContentHashes.length,
      rewrites: params.plan.rewrites,
    },
    dbPlan: {
      skipped: params.args.skipDb,
      candidateContentHashes: params.plan.dbDeleteContentHashes.length,
      matchingQuestionRows: params.dbPlan.questionRows.length,
      dependentRows: params.dbPlan.dependentRows,
      questionRows: params.dbPlan.questionRows,
      deletedRows: params.dbDeletedRows,
    },
    backupDir: params.backupDir ? repoPath(params.backupDir) : null,
    deletedItems: params.plan.deletedItems.map((item) => ({
      id: item.id,
      sourcePath: item.sourcePath,
      itemIndex: item.itemIndex,
      contentHash: item.contentHash,
      type: item.item.type,
      difficulty: item.item.difficulty,
      primaryKpCode: item.item.primaryKpCode,
      examTypes: item.item.examTypes,
    })),
  };

  const suffix = params.mode === "applied" ? "apply-report" : "dry-run-plan";
  const jsonPath = path.join(params.args.reportDir, `similarity-cleanup-${suffix}.json`);
  const tsvPath = path.join(params.args.reportDir, `similarity-cleanup-${suffix}__deleted-items.tsv`);
  const tsv = [
    [
      "itemId",
      "sourcePath",
      "itemIndex",
      "contentHash",
      "type",
      "difficulty",
      "primaryKpCode",
      "examTypes",
    ].join("\t"),
    ...report.deletedItems.map((item) =>
      [
        item.id,
        item.sourcePath,
        String(item.itemIndex),
        item.contentHash,
        item.type,
        item.difficulty,
        item.primaryKpCode,
        item.examTypes.join(","),
      ].join("\t"),
    ),
  ].join("\n");

  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(tsvPath, `${tsv}\n`);
  return { jsonPath: repoPath(jsonPath), tsvPath: repoPath(tsvPath), report };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const verdicts = await loadDeletionDecisions(path.resolve(process.cwd(), args.verdictDir));
  const indexed = await indexQuestionBundles(args.sourceDir);
  const plan = buildDeletionPlan({
    bundles: indexed.bundles,
    items: indexed.items,
    deleteItemIds: verdicts.deleteItemIds,
  });
  const dbPlan = args.skipDb
    ? {
        questionRows: [],
        dependentRows: {
          questionReviews: 0,
          questionExamTypes: 0,
          questionKpTags: 0,
          prebuiltPaperSlots: 0,
          paperQuestionSlots: 0,
        },
      }
    : await queryDbPlan(plan.dbDeleteContentHashes);

  if (!args.skipDb && dbPlan.dependentRows.paperQuestionSlots > 0 && !args.deletePaperSlots) {
    throw new Error(
      `Refusing to delete ${dbPlan.dependentRows.paperQuestionSlots} paper_question_slots rows. Re-run with --delete-paper-slots if these generated questions are safe to detach from papers.`,
    );
  }

  const verdictSummary = {
    shardCount: verdicts.shardCount,
    componentCount: verdicts.componentCount,
    deleteItemCount: verdicts.deleteItemIds.size,
    decisionCount: verdicts.decisions.length,
  };

  let dbDeletedRows: Awaited<ReturnType<typeof deleteDbRows>> | undefined;
  let backupDir: string | undefined;
  if (args.apply) {
    backupDir = path.join(
      args.reportDir,
      `similarity-cleanup-backup-${new Date().toISOString().replace(/[:.]/g, "-")}`,
    );
    await applyJsonRewrites({ bundles: indexed.bundles, rewrites: plan.rewrites, backupDir });
    if (!args.skipDb) {
      dbDeletedRows = await deleteDbRows({
        ids: dbPlan.questionRows.map((row) => row.id),
        deletePaperSlots: args.deletePaperSlots,
      });
    }
  }

  const reportInfo = await writePlanReport({
    args,
    mode: args.apply ? "applied" : "dry-run",
    backupDir,
    verdictSummary,
    plan,
    dbPlan,
    dbDeletedRows,
  });

  console.log(
    JSON.stringify(
      {
        mode: args.apply ? "applied" : "dry-run",
        reportPath: reportInfo.jsonPath,
        deletedItems: plan.deletedItems.length,
        affectedBundleFiles: plan.rewrites.length,
        deletedBundleFiles: plan.rewrites.filter((rewrite) => rewrite.newCount === 0).length,
        rewrittenBundleFiles: plan.rewrites.filter((rewrite) => rewrite.newCount > 0).length,
        dbCandidateContentHashes: plan.dbDeleteContentHashes.length,
        dbMatchingQuestionRows: dbPlan.questionRows.length,
        dbDeletedRows,
      },
      null,
      2,
    ),
  );
}

const isEntrypoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  main()
    .catch((error) => {
      console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}
