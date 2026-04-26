import type { Job } from "bullmq";

import { logger } from "../../logger.js";
import { finalizeAttempt } from "../attemptFinalizer.js";
import type { AttemptAutoSubmitJobData } from "../examAutoSubmitQueue.js";

export async function processAttemptAutoSubmitJob(job: Job<AttemptAutoSubmitJobData>) {
  const result = await finalizeAttempt({
    attemptId: job.data.attemptId,
    forceStatus: "auto_submitted",
    cancelAutoSubmitJob: false,
  });

  if (result.kind === "not_found_attempt") {
    logger.warn({ attemptId: job.data.attemptId }, "Attempt not found for auto-submit job");
    return { status: "not_found" };
  }

  if (result.kind === "not_found_paper") {
    logger.warn({ attemptId: job.data.attemptId }, "Paper not found for auto-submit job");
    return { status: "paper_not_found" };
  }

  if (result.kind === "conflict") {
    logger.info(
      { attemptId: job.data.attemptId },
      "Attempt already left started state before auto-submit",
    );
    return { status: "already_finalized" };
  }

  logger.info(
    {
      attemptId: result.attempt.id,
      paperId: result.attempt.paperId,
      status: result.attempt.status,
    },
    "Auto-submit job finalized attempt",
  );

  return { status: result.attempt.status };
}
