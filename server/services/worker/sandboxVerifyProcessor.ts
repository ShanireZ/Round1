/**
 * 沙箱验证处理器 — 阅读程序 / 完善程序 的 C++ 编译运行校验
 *
 * 验证通过 → questions.sandbox_verified = true, status = 'reviewed'
 * 验证失败 → questions.status 保持 'draft', sandbox_verified = false
 */
import type { Job } from "bullmq";
import { db } from "../../db.js";
import { questions } from "../../db/schema/questions.js";
import { verifyCpp } from "../sandbox/cppRunner.js";
import { eq } from "drizzle-orm";
import { logger } from "../../logger.js";

export interface SandboxVerifyJobData {
  questionId: string;
  questionType: "reading_program" | "completion_program";
  examType: string;
  primaryKpId: number;
  difficulty: string;
}

export async function processSandboxVerifyJob(job: Job<SandboxVerifyJobData>) {
  const { questionId, questionType } = job.data;

  // 获取题目内容
  const rows = await db
    .select({ contentJson: questions.contentJson })
    .from(questions)
    .where(eq(questions.id, questionId))
    .limit(1);

  if (rows.length === 0) {
    logger.warn({ questionId }, "Question not found for sandbox verify");
    return { status: "not_found" };
  }

  const content = rows[0]!.contentJson as Record<string, unknown>;

  // 获取要验证的代码
  let source: string;
  if (questionType === "reading_program") {
    source = content.cppCode as string;
  } else {
    // completion_program — 使用填入正确答案的完整代码
    source = content.fullCode as string;
  }

  if (!source) {
    logger.warn({ questionId, questionType }, "No source code found");
    return { status: "no_source" };
  }

  const sampleInputs = (content.sampleInputs as string[]) ?? [];
  const expectedOutputs = (content.expectedOutputs as string[]) ?? [];

  // 执行沙箱验证
  const { verified, results } = await verifyCpp({
    source,
    sampleInputs,
    expectedOutputs,
  });

  if (verified) {
    // 更新状态为已验证
    await db
      .update(questions)
      .set({
        sandboxVerified: true,
        status: "reviewed",
        updatedAt: new Date(),
      })
      .where(eq(questions.id, questionId));

    logger.info({ questionId }, "Sandbox verification passed — question reviewed");
    return { status: "verified" };
  } else {
    logger.warn(
      {
        questionId,
        results: results.map((r) => ({ compileOk: r.compileOk, runOk: r.runOk, stderr: r.stderr })),
      },
      "Sandbox verification failed",
    );
    return { status: "failed" };
  }
}
