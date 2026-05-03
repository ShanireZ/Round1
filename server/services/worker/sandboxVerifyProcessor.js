import { db } from "../../db.js";
import { questions } from "../../db/schema/questions.js";
import { verifyCpp } from "../sandbox/cppRunner.js";
import { eq } from "drizzle-orm";
import { logger } from "../../logger.js";
export async function processSandboxVerifyJob(job) {
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
    const content = rows[0].contentJson;
    // 获取要验证的代码
    let source;
    if (questionType === "reading_program") {
        source = content.cppCode;
    }
    else {
        // completion_program — 使用填入正确答案的完整代码
        source = content.fullCode;
    }
    if (!source) {
        logger.warn({ questionId, questionType }, "No source code found");
        return { status: "no_source" };
    }
    const sampleInputs = content.sampleInputs ?? [];
    const expectedOutputs = content.expectedOutputs ?? [];
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
    }
    else {
        logger.warn({
            questionId,
            results: results.map((r) => ({ compileOk: r.compileOk, runOk: r.runOk, stderr: r.stderr })),
        }, "Sandbox verification failed");
        return { status: "failed" };
    }
}
