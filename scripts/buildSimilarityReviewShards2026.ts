import fs from "node:fs";
import path from "node:path";

import { QuestionBundleSchema, type QuestionBundleItem } from "./lib/bundleTypes.js";

const usage = `Usage: npx tsx scripts/buildSimilarityReviewShards2026.ts --audit <similarity-audit.json> --out-dir <dir> [--shards 8]`;

interface AuditSide {
  id: string;
  sourcePath: string;
  itemIndex: number;
  bundleRunId: string;
  difficulty: string;
  primaryKpCode: string;
  examTypes: string[];
  contentHash: string;
}

interface AuditPair {
  similarity: number;
  salientSimilarity: number;
  recommendation: string;
  questionType: string;
  samePrimaryKp: boolean;
  sameDifficulty: boolean;
  sharedExamTypes: string[];
  left: AuditSide;
  right: AuditSide;
}

interface ReviewItem {
  id: string;
  sourcePath: string;
  itemIndex: number;
  bundleRunId: string;
  contentHash: string;
  type: QuestionBundleItem["type"];
  difficulty: string;
  primaryKpCode: string;
  examTypes: string[];
  contentJson: QuestionBundleItem["contentJson"];
  answerJson: QuestionBundleItem["answerJson"];
  explanationJson: QuestionBundleItem["explanationJson"];
}

interface Component {
  componentId: string;
  itemCount: number;
  edgeCount: number;
  maxSimilarity: number;
  maxSalientSimilarity: number;
  recommendations: Record<string, number>;
  items: ReviewItem[];
  pairs: AuditPair[];
}

function readArg(args: string[], name: string) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function toRepoPath(filePath: string) {
  return path.relative(process.cwd(), filePath).replaceAll(path.sep, "/");
}

function loadBundleItem(sourcePath: string, itemIndex: number): ReviewItem {
  const absolutePath = path.resolve(process.cwd(), sourcePath);
  const bundle = QuestionBundleSchema.parse(JSON.parse(fs.readFileSync(absolutePath, "utf8")));
  const item = bundle.items[itemIndex];
  if (!item) {
    throw new Error(`Missing item ${sourcePath}#${itemIndex}`);
  }

  return {
    id: `${toRepoPath(absolutePath)}#${itemIndex}`,
    sourcePath: toRepoPath(absolutePath),
    itemIndex,
    bundleRunId: bundle.meta.runId,
    contentHash: item.contentHash,
    type: item.type,
    difficulty: item.difficulty,
    primaryKpCode: item.primaryKpCode,
    examTypes: item.examTypes,
    contentJson: item.contentJson,
    answerJson: item.answerJson,
    explanationJson: item.explanationJson,
  };
}

class UnionFind {
  private readonly parent = new Map<string, string>();

  find(value: string): string {
    const parent = this.parent.get(value);
    if (!parent) {
      this.parent.set(value, value);
      return value;
    }
    if (parent === value) {
      return value;
    }
    const root = this.find(parent);
    this.parent.set(value, root);
    return root;
  }

  union(left: string, right: string) {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot !== rightRoot) {
      this.parent.set(rightRoot, leftRoot);
    }
  }
}

function buildComponents(pairs: AuditPair[]): Component[] {
  const unionFind = new UnionFind();
  const items = new Map<string, ReviewItem>();

  for (const pair of pairs) {
    unionFind.union(pair.left.id, pair.right.id);
    if (!items.has(pair.left.id)) {
      items.set(pair.left.id, loadBundleItem(pair.left.sourcePath, pair.left.itemIndex));
    }
    if (!items.has(pair.right.id)) {
      items.set(pair.right.id, loadBundleItem(pair.right.sourcePath, pair.right.itemIndex));
    }
  }

  const componentItems = new Map<string, ReviewItem[]>();
  const componentPairs = new Map<string, AuditPair[]>();
  for (const item of items.values()) {
    const root = unionFind.find(item.id);
    const bucket = componentItems.get(root) ?? [];
    bucket.push(item);
    componentItems.set(root, bucket);
  }
  for (const pair of pairs) {
    const root = unionFind.find(pair.left.id);
    const bucket = componentPairs.get(root) ?? [];
    bucket.push(pair);
    componentPairs.set(root, bucket);
  }

  return [...componentItems.entries()]
    .map(([root, bucket], index) => {
      const pairsInComponent = componentPairs.get(root) ?? [];
      const recommendations: Record<string, number> = {};
      for (const pair of pairsInComponent) {
        recommendations[pair.recommendation] = (recommendations[pair.recommendation] ?? 0) + 1;
      }
      return {
        componentId: `component-${String(index + 1).padStart(4, "0")}`,
        itemCount: bucket.length,
        edgeCount: pairsInComponent.length,
        maxSimilarity: Math.max(...pairsInComponent.map((pair) => pair.similarity)),
        maxSalientSimilarity: Math.max(...pairsInComponent.map((pair) => pair.salientSimilarity)),
        recommendations,
        items: bucket.sort((left, right) => left.id.localeCompare(right.id)),
        pairs: pairsInComponent.sort(
          (left, right) =>
            right.similarity - left.similarity ||
            right.salientSimilarity - left.salientSimilarity ||
            left.left.id.localeCompare(right.left.id),
        ),
      };
    })
    .sort(
      (left, right) =>
        right.maxSimilarity - left.maxSimilarity ||
        right.edgeCount - left.edgeCount ||
        left.componentId.localeCompare(right.componentId),
    );
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log(usage);
    return;
  }

  const auditPath = readArg(args, "--audit");
  const outDir = readArg(args, "--out-dir");
  const shardCountRaw = readArg(args, "--shards") ?? "8";
  const shardCount = Number.parseInt(shardCountRaw, 10);
  if (!auditPath || !outDir || !Number.isInteger(shardCount) || shardCount <= 0) {
    throw new Error(usage);
  }

  const audit = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), auditPath), "utf8")) as {
    pairs: AuditPair[];
  };
  const components = buildComponents(audit.pairs);
  const shards: Component[][] = Array.from({ length: shardCount }, () => []);
  const shardWeights = Array.from({ length: shardCount }, () => 0);

  for (const component of components) {
    let target = 0;
    for (let index = 1; index < shardWeights.length; index += 1) {
      if (shardWeights[index]! < shardWeights[target]!) {
        target = index;
      }
    }
    shards[target]!.push(component);
    shardWeights[target]! += component.edgeCount;
  }

  const absoluteOutDir = path.resolve(process.cwd(), outDir);
  fs.mkdirSync(absoluteOutDir, { recursive: true });
  const shardFiles = shards.map((componentsInShard, index) => {
    const shardPath = path.join(
      absoluteOutDir,
      `similarity-review-shard-${String(index + 1).padStart(2, "0")}.json`,
    );
    fs.writeFileSync(
      shardPath,
      `${JSON.stringify(
        {
          shardNo: index + 1,
          shardCount,
          componentCount: componentsInShard.length,
          edgeCount: componentsInShard.reduce((sum, component) => sum + component.edgeCount, 0),
          components: componentsInShard,
        },
        null,
        2,
      )}\n`,
    );
    return toRepoPath(shardPath);
  });

  const manifestPath = path.join(absoluteOutDir, "similarity-review-shards-manifest.json");
  fs.writeFileSync(
    manifestPath,
    `${JSON.stringify(
      {
        auditPath: toRepoPath(path.resolve(process.cwd(), auditPath)),
        componentCount: components.length,
        pairCount: audit.pairs.length,
        uniqueItemCount: new Set(
          audit.pairs.flatMap((pair) => [pair.left.id, pair.right.id]),
        ).size,
        shardFiles,
      },
      null,
      2,
    )}\n`,
  );

  console.log(
    JSON.stringify(
      {
        manifestPath: toRepoPath(manifestPath),
        componentCount: components.length,
        pairCount: audit.pairs.length,
        uniqueItemCount: new Set(
          audit.pairs.flatMap((pair) => [pair.left.id, pair.right.id]),
        ).size,
        shardFiles,
      },
      null,
      2,
    ),
  );
}

main();
