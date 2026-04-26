import { Queue } from "bullmq";

import { blueprintSpecs } from "../../config/blueprint.js";
import { logger } from "../logger.js";
import { ioRedisClient } from "../redis.js";

export const ATTEMPT_AUTO_SUBMIT_QUEUE_NAME = "attempt-auto-submit";

export type AttemptAutoSubmitJobData = {
  attemptId: string;
};

type ScheduleAttemptAutoSubmitParams = {
  attemptId: string;
  paperId: string;
  userId: string;
  examType: string;
  startedAt: Date | string;
  assignmentDueAt?: Date | string | null;
};

const attemptAutoSubmitQueue = new Queue<AttemptAutoSubmitJobData>(ATTEMPT_AUTO_SUBMIT_QUEUE_NAME, {
  connection: ioRedisClient,
  defaultJobOptions: {
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 1000 },
  },
});

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const dateValue = value instanceof Date ? value : new Date(value);
  return Number.isNaN(dateValue.getTime()) ? null : dateValue;
}

export function computeAttemptSubmitAt(
  params: Omit<ScheduleAttemptAutoSubmitParams, "attemptId" | "paperId" | "userId">,
): Date {
  const spec = blueprintSpecs[params.examType as keyof typeof blueprintSpecs];
  const startedAt = toDate(params.startedAt);
  if (!spec || !startedAt) {
    return new Date();
  }

  const startedDeadline = new Date(startedAt.getTime() + spec.durationMinutes * 60_000);
  const assignmentDueAt = toDate(params.assignmentDueAt);

  if (!assignmentDueAt) {
    return startedDeadline;
  }

  return assignmentDueAt.getTime() < startedDeadline.getTime() ? assignmentDueAt : startedDeadline;
}

export async function scheduleAttemptAutoSubmit(params: ScheduleAttemptAutoSubmitParams): Promise<{
  jobId: string;
  submitAt: Date;
}> {
  const submitAt = computeAttemptSubmitAt(params);
  const jobId = `attempt:${params.attemptId}`;
  const delay = Math.max(submitAt.getTime() - Date.now(), 0);

  await attemptAutoSubmitQueue.add(
    "attempt-auto-submit",
    { attemptId: params.attemptId },
    {
      jobId,
      delay,
    },
  );

  logger.info(
    {
      attemptId: params.attemptId,
      paperId: params.paperId,
      userId: params.userId,
      submitAt: submitAt.toISOString(),
      jobId,
    },
    "Scheduled attempt auto-submit job",
  );

  return { jobId, submitAt };
}

export async function cancelAttemptAutoSubmit(jobId: string | null | undefined): Promise<void> {
  if (!jobId) {
    return;
  }

  try {
    await attemptAutoSubmitQueue.remove(jobId);
  } catch (error) {
    logger.warn({ jobId, error }, "Failed to remove attempt auto-submit job");
  }
}
