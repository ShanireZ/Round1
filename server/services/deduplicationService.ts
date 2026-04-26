/**
 * 去重服务 — content_hash 精确去重 + Jaccard 近似去重
 */
import crypto from "node:crypto";
import { db } from "../db.js";
import { questions } from "../db/schema/questions.js";
import { eq, and } from "drizzle-orm";
import { logger } from "../logger.js";

/** Jaccard 相似度阈值 — ≥0.85 视为重复 */
const JACCARD_THRESHOLD = 0.85;

/**
 * content_hash 规范化规则：
 * 1. 去除所有空白字符
 * 2. 全部转小写
 * 3. 去除标点符号
 * 4. sha256 哈希
 */
export function computeContentHash(stem: string, codeOrOptions: string): string {
  const raw = `${stem}${codeOrOptions}`;
  const normalized = raw
    .replace(/\s+/g, "")
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff]/g, "");
  return crypto.createHash("sha256").update(normalized, "utf-8").digest("hex");
}

/**
 * 检查 content_hash 精确重复
 */
export async function isDuplicateByHash(contentHash: string): Promise<boolean> {
  const existing = await db
    .select({ id: questions.id })
    .from(questions)
    .where(eq(questions.contentHash, contentHash))
    .limit(1);
  return existing.length > 0;
}

/**
 * Jaccard 相似度 — 基于 n-gram (n=3) 集合交并比
 */
function jaccardSimilarity(a: string, b: string): number {
  const ngramsA = toNGrams(a, 3);
  const ngramsB = toNGrams(b, 3);

  if (ngramsA.size === 0 && ngramsB.size === 0) return 1;
  if (ngramsA.size === 0 || ngramsB.size === 0) return 0;

  let intersection = 0;
  for (const gram of ngramsA) {
    if (ngramsB.has(gram)) intersection++;
  }

  const union = ngramsA.size + ngramsB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function toNGrams(text: string, n: number): Set<string> {
  const cleaned = text.replace(/\s+/g, "").toLowerCase();
  const grams = new Set<string>();
  for (let i = 0; i <= cleaned.length - n; i++) {
    grams.add(cleaned.slice(i, i + n));
  }
  return grams;
}

/**
 * Jaccard 近似去重 — 与同类型同知识点的已有题目比较
 *
 * @returns 如果发现近似重复，返回重复题目的 ID；否则返回 null
 */
export async function findJaccardDuplicate(params: {
  stem: string;
  questionType: string;
  primaryKpId: number;
}): Promise<string | null> {
  // 获取同类型同知识点的已有题目
  const candidates = await db
    .select({
      id: questions.id,
      contentJson: questions.contentJson,
    })
    .from(questions)
    .where(
      and(eq(questions.type, params.questionType), eq(questions.primaryKpId, params.primaryKpId)),
    );

  for (const candidate of candidates) {
    const existingStem = ((candidate.contentJson as Record<string, unknown>)?.stem as string) ?? "";
    const similarity = jaccardSimilarity(params.stem, existingStem);

    if (similarity >= JACCARD_THRESHOLD) {
      logger.info(
        { newStem: params.stem.slice(0, 50), existingId: candidate.id, similarity },
        "Jaccard duplicate detected",
      );
      return candidate.id;
    }
  }

  return null;
}
