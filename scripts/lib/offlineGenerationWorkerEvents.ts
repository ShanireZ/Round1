import type { Job } from "bullmq";

import { logger } from "../../server/logger.js";
import { handleDeadLetter, isTerminalGenerationFailure } from "./offlineDeadLetter.js";
import type { GenerationJobData } from "./offlineGenerationProcessor.js";

export type GenerationDeadLetterHandler = typeof handleDeadLetter;

interface GenerationWorkerLike {
  on(event: "completed", handler: (job: Job<GenerationJobData>) => unknown): unknown;
  on(
    event: "failed",
    handler: (job: Job<GenerationJobData> | undefined, err: Error) => unknown,
  ): unknown;
}

export function registerGenerationWorkerEvents(
  worker: GenerationWorkerLike,
  deadLetterHandler: GenerationDeadLetterHandler = handleDeadLetter,
) {
  worker.on("completed", (job) => {
    logger.info({ jobId: job.id }, "Generation job completed");
  });

  worker.on("failed", async (job, err) => {
    logger.error({ jobId: job?.id, err }, "Generation job failed");

    if (!job || !isTerminalGenerationFailure(job, err)) {
      return;
    }

    await deadLetterHandler(
      String(job.id ?? "unknown"),
      job.data as unknown as Record<string, unknown>,
      err instanceof Error ? err.message : String(err),
    );
  });
}
