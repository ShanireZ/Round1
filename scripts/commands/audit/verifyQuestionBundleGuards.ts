import { eq } from "drizzle-orm";

import { db, pool } from "../../../server/db.js";
import { knowledgePoints } from "../../../server/db/schema/knowledgePoints.js";
import { questions } from "../../../server/db/schema/questions.js";
import { computeContentHash } from "../../../server/services/deduplicationService.js";
import {
  BUNDLE_SCHEMA_VERSION,
  QuestionBundleSchema,
  computeChecksum,
  type QuestionBundle,
  type QuestionBundleItem,
} from "../../lib/bundleTypes.js";
import {
  type LoadedQuestionBundle,
  validateQuestionBundle,
} from "../../lib/questionBundleWorkflow.js";

function makeLoaded(bundle: QuestionBundle, sourceFilename: string): LoadedQuestionBundle {
  const raw = `${JSON.stringify(bundle, null, 2)}\n`;
  return {
    bundle,
    raw,
    checksum: computeChecksum(raw),
    sourceFilename,
    sourcePath: sourceFilename,
  };
}

function makeSingleChoiceItem(params: {
  stem: string;
  options: string[];
  answer: string;
  explanation: string;
  primaryKpCode: string;
}): QuestionBundleItem {
  return {
    type: "single_choice",
    difficulty: "easy",
    primaryKpCode: params.primaryKpCode,
    auxiliaryKpCodes: [],
    examTypes: ["GESP-1"],
    contentHash: computeContentHash(params.stem, params.options.join("\n")),
    sandboxVerified: false,
    source: "manual",
    contentJson: {
      stem: params.stem,
      options: params.options,
    },
    answerJson: {
      answer: params.answer,
    },
    explanationJson: {
      explanation: params.explanation,
    },
  };
}

function makeBundle(item: QuestionBundleItem, requestedCount = 1): QuestionBundle {
  const createdAt = new Date().toISOString();
  const sourceBatchId = `question-bundle-guard:${item.primaryKpCode}:${createdAt}`;

  return QuestionBundleSchema.parse({
    meta: {
      bundleType: "question_bundle",
      schemaVersion: BUNDLE_SCHEMA_VERSION,
      runId: "2026-04-27-guard-gesp-1-easy-v01",
      createdAt,
      generatedAt: createdAt,
      provider: "guard",
      model: "guard-fixture",
      promptHash: computeChecksum("question-bundle-guard"),
      sourceBatchId,
      sourceBatchIds: [sourceBatchId],
      sourceTimestamp: createdAt,
      examType: "GESP-1",
      questionType: item.type,
      primaryKpCode: item.primaryKpCode,
      difficulty: item.difficulty,
      requestedCount,
    },
    items: [item],
  });
}

async function verifyJaccardGuard(): Promise<void> {
  const tag = `guard-${Date.now()}`;
  const kpCode = "CPP";
  const [kp] = await db
    .select({ id: knowledgePoints.id })
    .from(knowledgePoints)
    .where(eq(knowledgePoints.code, kpCode))
    .limit(1);

  if (!kp) {
    throw new Error(`Missing knowledge point ${kpCode}`);
  }

  const stem = `规则去重守卫 ${tag}：计算 2 加 3 的结果。`;
  const existingOptions = ["A. 3", "B. 4", "C. 5", "D. 6"];
  const [created] = await db
    .insert(questions)
    .values({
      type: "single_choice",
      difficulty: "easy",
      primaryKpId: kp.id,
      contentJson: {
        stem,
        options: existingOptions,
      },
      answerJson: {
        answer: "C",
      },
      explanationJson: {
        explanation: "2 + 3 = 5。",
      },
      contentHash: computeContentHash(stem, existingOptions.join("\n")),
      status: "draft",
      sandboxVerified: false,
      source: "manual",
    })
    .returning({ id: questions.id });

  if (!created) {
    throw new Error("Failed to create duplicate guard question");
  }

  try {
    const candidate = makeSingleChoiceItem({
      stem,
      options: ["A. 0", "B. 1", "C. 5", "D. 9"],
      answer: "C",
      explanation: "同一题干但不同选项，content_hash 不同，应由 Jaccard 拦截。",
      primaryKpCode: kpCode,
    });
    const result = await validateQuestionBundle(makeLoaded(makeBundle(candidate), "jaccard.json"));
    const hasJaccardError = result.errors.some((error) => error.code === "DUPLICATE_JACCARD");
    if (!hasJaccardError) {
      throw new Error(`Expected DUPLICATE_JACCARD, got ${JSON.stringify(result.errors)}`);
    }
    console.log(`dedup guard ok: ${created.id}`);
  } finally {
    await db.delete(questions).where(eq(questions.id, created.id));
  }
}

async function verifyJudgeGuard(): Promise<void> {
  const item = makeSingleChoiceItem({
    stem: "判官守卫：2 + 2 的值是多少？",
    options: ["A. 1", "B. 2", "C. 4", "D. 8"],
    answer: "A",
    explanation: "这里故意把错误答案 A 标为正确，用于验证判官拒收。",
    primaryKpCode: "CPP",
  });
  const result = await validateQuestionBundle(makeLoaded(makeBundle(item), "judge.json"), {
    runJudge: true,
    judgeTimeoutMs: 120_000,
  });
  const hasJudgeRejection = result.errors.some((error) => error.code === "JUDGE_REJECTED");
  if (!hasJudgeRejection) {
    throw new Error(`Expected JUDGE_REJECTED, got ${JSON.stringify(result.errors)}`);
  }
  console.log(`judge guard ok: ${result.errors.map((error) => error.message).join(" | ")}`);
}

async function main(): Promise<void> {
  await verifyJaccardGuard();
  await verifyJudgeGuard();
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
