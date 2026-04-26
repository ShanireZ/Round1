/**
 * 离线内容 worker 死信处理
 */
import { logger } from "../../server/logger.js";

export async function handleDeadLetter(
  jobId: string,
  jobData: Record<string, unknown>,
  error: string,
) {
  logger.error({ jobId, jobData, error }, "Job moved to dead letter");
}

export function isTerminalGenerationFailure(
  job:
    | {
        attemptsMade?: number;
        opts?: { attempts?: number };
      }
    | undefined,
  error: unknown,
): boolean {
  if (error instanceof Error && error.name === "UnrecoverableError") {
    return true;
  }

  if (!job) {
    return false;
  }

  const maxAttempts =
    typeof job.opts?.attempts === "number" &&
    Number.isFinite(job.opts.attempts) &&
    job.opts.attempts > 0
      ? job.opts.attempts
      : 1;

  const attemptsMade = typeof job.attemptsMade === "number" ? job.attemptsMade : 0;
  return attemptsMade >= maxAttempts;
}
