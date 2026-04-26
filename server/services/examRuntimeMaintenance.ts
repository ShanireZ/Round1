import { and, eq, lt } from "drizzle-orm";

import { env } from "../../config/env.js";
import { db } from "../db.js";
import { assignmentProgress, assignments, attempts, papers } from "../db/schema/index.js";
import { logger } from "../logger.js";
import { finalizeAttempt } from "./attemptFinalizer.js";
import { computeAttemptSubmitAt } from "./examAutoSubmitQueue.js";
import { getRuntimeNumberSetting } from "./runtimeConfigService.js";

const MAINTENANCE_INTERVAL_MS = 5 * 60 * 1000;
const AUTO_SUBMIT_FALLBACK_BATCH_SIZE = 500;

let maintenanceTimer: NodeJS.Timeout | null = null;
let maintenanceRunning = false;

export async function abandonExpiredDraftPapers(now = new Date()) {
  const ttlMinutes = getRuntimeNumberSetting("exam.draftTtlMinutes", env.EXAM_DRAFT_TTL_MINUTES);
  const cutoff = new Date(now.getTime() - ttlMinutes * 60_000);

  const rows = await db
    .update(papers)
    .set({
      status: "abandoned",
      updatedAt: now,
    })
    .where(and(eq(papers.status, "draft"), lt(papers.createdAt, cutoff)))
    .returning({
      id: papers.id,
      userId: papers.userId,
      assignmentId: papers.assignmentId,
    });

  for (const row of rows) {
    if (!row.assignmentId) {
      continue;
    }

    await db
      .update(assignmentProgress)
      .set({
        paperId: row.id,
        status: "missed",
        updatedAt: now,
      })
      .where(
        and(
          eq(assignmentProgress.assignmentId, row.assignmentId),
          eq(assignmentProgress.userId, row.userId),
          eq(assignmentProgress.status, "pending"),
        ),
      );
  }

  if (rows.length > 0) {
    logger.info({ count: rows.length }, "Abandoned expired draft papers");
  }

  return { abandonedDraftPapers: rows.length };
}

export async function runAutoSubmitFallback(now = new Date()) {
  const startedAttempts = await db
    .select({
      attemptId: attempts.id,
      paperId: attempts.paperId,
      startedAt: attempts.startedAt,
      examType: papers.examType,
      assignmentId: papers.assignmentId,
    })
    .from(attempts)
    .innerJoin(papers, eq(attempts.paperId, papers.id))
    .where(eq(attempts.status, "started"))
    .orderBy(attempts.startedAt)
    .limit(AUTO_SUBMIT_FALLBACK_BATCH_SIZE);

  let expired = 0;
  let finalized = 0;
  let failed = 0;

  for (const row of startedAttempts) {
    const [assignment] = row.assignmentId
      ? await db
          .select({
            dueAt: assignments.dueAt,
          })
          .from(assignments)
          .where(eq(assignments.id, row.assignmentId))
          .limit(1)
      : [undefined];

    const submitAt = computeAttemptSubmitAt({
      examType: row.examType,
      startedAt: row.startedAt,
      assignmentDueAt: assignment?.dueAt ?? null,
    });

    if (submitAt.getTime() > now.getTime()) {
      continue;
    }

    expired += 1;

    const result = await finalizeAttempt({
      attemptId: row.attemptId,
      forceStatus: "auto_submitted",
      cancelAutoSubmitJob: false,
    });

    if (result.kind === "success") {
      finalized += 1;
    } else {
      failed += 1;
      logger.warn({ attemptId: row.attemptId, result }, "Auto-submit fallback could not finalize attempt");
    }
  }

  if (expired > 0) {
    logger.info({ expired, finalized, failed }, "Auto-submit fallback scan completed");
  }

  return { scanned: startedAttempts.length, expired, finalized, failed };
}

export async function runExamRuntimeMaintenance(now = new Date()) {
  const [abandoned, autoSubmit] = await Promise.all([
    abandonExpiredDraftPapers(now),
    runAutoSubmitFallback(now),
  ]);

  return {
    ...abandoned,
    autoSubmit,
  };
}

export function startExamRuntimeMaintenanceLoop(processName: string) {
  if (maintenanceTimer) {
    return;
  }

  maintenanceTimer = setInterval(() => {
    if (maintenanceRunning) {
      return;
    }

    maintenanceRunning = true;
    void runExamRuntimeMaintenance()
      .catch((error) => {
        logger.error({ error, processName }, "Exam runtime maintenance tick failed");
      })
      .finally(() => {
        maintenanceRunning = false;
      });
  }, MAINTENANCE_INTERVAL_MS);

  maintenanceTimer.unref?.();
  logger.info({ processName, intervalMs: MAINTENANCE_INTERVAL_MS }, "Exam runtime maintenance loop started");
}

export function stopExamRuntimeMaintenanceLoop() {
  if (!maintenanceTimer) {
    return;
  }

  clearInterval(maintenanceTimer);
  maintenanceTimer = null;
  maintenanceRunning = false;
}
