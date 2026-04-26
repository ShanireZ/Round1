import IORedis from "ioredis";
import { Queue, QueueEvents, Worker } from "bullmq";
import { afterEach, describe, expect, it } from "vitest";
import { env } from "../../config/env.js";
import type { GenerationJobData } from "../../scripts/lib/offlineGenerationProcessor.js";

function createRedisConnection() {
  return new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}

describe("BullMQ generation retries with dead letter", () => {
  const cleanupTasks: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanupTasks.length > 0) {
      const task = cleanupTasks.pop();
      if (task) {
        await task();
      }
    }
  });

  it("retries a generation job with backoff and calls deadLetter after the final BullMQ failure", async () => {
    const { registerGenerationWorkerEvents } =
      await import("../../scripts/lib/offlineGenerationWorkerEvents.js");

    const queueName = `generation-it-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const queueConnection = createRedisConnection();
    const workerConnection = createRedisConnection();
    const eventsConnection = createRedisConnection();

    cleanupTasks.push(async () => {
      await Promise.allSettled([
        queueConnection.quit(),
        workerConnection.quit(),
        eventsConnection.quit(),
      ]);
    });

    const queue = new Queue<GenerationJobData>(queueName, {
      connection: queueConnection,
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: true,
      },
    });
    const queueEvents = new QueueEvents(queueName, {
      connection: eventsConnection,
    });

    cleanupTasks.push(async () => {
      await Promise.allSettled([queue.close(), queueEvents.close()]);
    });

    const attemptTimestamps: number[] = [];
    const deadLetterCalls: Array<[string, Record<string, unknown>, string]> = [];

    const worker = new Worker<GenerationJobData>(
      queueName,
      async () => {
        attemptTimestamps.push(Date.now());
        throw new Error(`planned failure ${attemptTimestamps.length}`);
      },
      {
        connection: workerConnection,
        concurrency: 1,
      },
    );

    cleanupTasks.push(async () => {
      await worker.close();
    });

    registerGenerationWorkerEvents(worker, async (jobId, jobData, error) => {
      deadLetterCalls.push([jobId, jobData, error]);
    });

    const failedEventPromise = new Promise<{ jobId: string; failedReason: string }>((resolve) => {
      queueEvents.once("failed", resolve);
    });

    const jobData: GenerationJobData = {
      questionType: "single_choice",
      examType: "CSP-J",
      primaryKpId: 42,
      kpCode: "BAS",
      difficulty: "easy",
    };

    await queue.add("integration-retry", jobData, {
      jobId: "queue-it-1",
      attempts: 3,
      backoff: {
        type: "fixed",
        delay: 50,
      },
      removeOnFail: false,
    });

    const failedEvent = await failedEventPromise;
    await expect.poll(() => attemptTimestamps.length, { timeout: 5000 }).toBe(3);
    await expect.poll(() => deadLetterCalls.length, { timeout: 5000 }).toBe(1);

    expect(attemptTimestamps[1]! - attemptTimestamps[0]!).toBeGreaterThanOrEqual(30);
    expect(attemptTimestamps[2]! - attemptTimestamps[1]!).toBeGreaterThanOrEqual(30);
    expect(failedEvent).toEqual(
      expect.objectContaining({
        jobId: "queue-it-1",
        failedReason: "planned failure 3",
      }),
    );
    expect(deadLetterCalls[0]).toEqual(["queue-it-1", jobData, "planned failure 3"]);

    const failedJob = await queue.getJob("queue-it-1");
    expect(failedJob?.attemptsMade).toBe(3);
  });
});
