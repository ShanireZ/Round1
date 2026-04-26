/**
 * 离线内容 Worker 启动器 — 仅在内容生产环境运行
 *
 * 负责 generation / sandbox verify 两类离线内容流水线，不部署到生产运行时。
 * 用法：ROUND1_PROCESS_TYPE=content-worker node --import tsx/esm scripts/workers/contentWorker.ts
 */
import { Worker, type Job } from "bullmq";
import IORedis from "ioredis";

import { env } from "../../config/env.js";
import { ensureRound1ProcessType, ROUND1_PROCESS_TYPES } from "../../config/processTypes.js";
import { logger } from "../../server/logger.js";
import {
  initializeRuntimeConfigRuntime,
  stopRuntimeConfigSubscriber,
} from "../../server/services/runtimeConfigService.js";
import type { SandboxVerifyJobData } from "../../server/services/worker/sandboxVerifyProcessor.js";
import { QUEUE_NAMES } from "../lib/offlineQueues.js";
import type { GenerationJobData } from "../lib/offlineGenerationProcessor.js";

ensureRound1ProcessType(ROUND1_PROCESS_TYPES.CONTENT_WORKER);

await initializeRuntimeConfigRuntime("content-worker");

const [{ processGenerationJob }, { processSandboxVerifyJob }, { registerGenerationWorkerEvents }] =
  await Promise.all([
    import("../lib/offlineGenerationProcessor.js"),
    import("../../server/services/worker/sandboxVerifyProcessor.js"),
    import("../lib/offlineGenerationWorkerEvents.js"),
  ]);

const connection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

const concurrency = env.ROUND1_WORKER_CONCURRENCY;

const generationWorker = new Worker<GenerationJobData>(
  QUEUE_NAMES.GENERATION,
  async (job: Job<GenerationJobData>) => {
    logger.info({ jobId: job.id, data: job.data }, "Processing generation job");
    return processGenerationJob(job);
  },
  { connection, concurrency },
);

registerGenerationWorkerEvents(generationWorker);

const sandboxWorker = new Worker<SandboxVerifyJobData>(
  QUEUE_NAMES.SANDBOX_VERIFY,
  async (job: Job<SandboxVerifyJobData>) => {
    logger.info({ jobId: job.id, data: job.data }, "Processing sandbox verify job");
    return processSandboxVerifyJob(job);
  },
  { connection, concurrency: 2 },
);

sandboxWorker.on("completed", (job) => {
  logger.info({ jobId: job.id }, "Sandbox verify job completed");
});

sandboxWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err }, "Sandbox verify job failed");
});

async function shutdown() {
  logger.info("Content worker shutting down...");
  await Promise.all([generationWorker.close(), sandboxWorker.close()]);
  await stopRuntimeConfigSubscriber();
  connection.disconnect();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

logger.info(
  { concurrency, queues: [QUEUE_NAMES.GENERATION, QUEUE_NAMES.SANDBOX_VERIFY] },
  "Content worker started — consuming offline generation queues",
);
