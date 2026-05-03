/**
 * 历年真题导入入口
 *
 * 用法：
 *   npx tsx scripts/ingest.ts ingest-real-papers --dir papers/real-papers [--review-rounds 2] [--limit 10]
 *
 * 导入流程：
 * 1. 解析 JSON → Zod 校验
 * 2. 入库 questions (source='real_paper', status='draft')
 * 3. 创建 question_reviews (review_status='pending')
 * 4. LLM 两轮独立解题验证 → 与官方答案比对
 * 5. 匹配的单选题自动推进为 reviewed，其余保持 draft
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { pool } from "../../../server/db.js";
import { ingestRealPapers } from "../../lib/realPaperIngest.js";

const USAGE =
  "Usage: npx tsx scripts/commands/ingest/ingestRealPapers.ts --dir <path> [--confirm] [--skip-ai-review] [--review-rounds count] [--limit count] [--timeout ms]";

function readArg(args: string[], name: string) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const dir = readArg(args, "--dir");
  const timeoutRaw = readArg(args, "--timeout");
  const limitRaw = readArg(args, "--limit");
  const reviewRoundsRaw = readArg(args, "--review-rounds");
  const confirmMode = args.includes("--confirm");
  const skipAiReview = args.includes("--skip-ai-review");

  if (args.includes("--help")) {
    console.error(USAGE);
    process.exit(0);
  }

  if (!dir) {
    console.error(USAGE);
    process.exit(1);
  }

  const timeoutMs = timeoutRaw ? Number.parseInt(timeoutRaw, 10) : 60_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("--timeout must be a positive integer");
  }

  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
  if (limit !== undefined && (!Number.isFinite(limit) || limit <= 0)) {
    throw new Error("--limit must be a positive integer");
  }

  const reviewRounds = reviewRoundsRaw ? Number.parseInt(reviewRoundsRaw, 10) : 2;
  if (!Number.isFinite(reviewRounds) || reviewRounds <= 0) {
    throw new Error("--review-rounds must be a positive integer");
  }

  const resolvedDir =
    dir === "real-paper" && !fs.existsSync(path.resolve(dir)) ? "papers/real-papers" : dir;

  const summary = await ingestRealPapers({
    dir: resolvedDir,
    skipAiReview,
    reviewRounds,
    timeoutMs,
    limit,
  });

  console.log(`\n📊 Import Summary:`);
  console.log(`   Imported: ${summary.imported}`);
  console.log(`   Skipped (duplicate): ${summary.skipped}`);
  console.log(`   Pending reviews created: ${summary.pendingCreated}`);
  console.log(`   AI reviewed: ${summary.aiReviewed}`);
  console.log(`   Review rounds completed: ${summary.reviewRoundsCompleted}`);
  console.log(`   Promoted to reviewed: ${summary.promotedToReviewed}`);
  console.log(`   Errors: ${summary.errors}`);

  if (!confirmMode) {
    console.log(
      `\n⚠ Imported questions default to draft unless AI review promotes them to reviewed.`,
    );
    console.log(
      `  Use Admin confirm/reject endpoints for manual question_reviews confirmation flows.`,
    );
  }

  await pool.end();
}

const isEntrypoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  main().catch(async (err) => {
    console.error("❌ Ingest failed:", err);
    await pool.end();
    process.exit(1);
  });
}
