/**
 * 运行时 Worker 启动器 — 生产环境独立进程入口
 *
 * 只保留考试运行时延迟任务；不再消费 generation / sandbox 队列。
 *
 * 用法：ROUND1_PROCESS_TYPE=runtime-worker node --import tsx/esm server/services/worker/worker.ts
 */
import { Worker } from "bullmq";
import IORedis from "ioredis";
import { env } from "../../../config/env.js";
import { ensureRound1ProcessType, ROUND1_PROCESS_TYPES } from "../../../config/processTypes.js";
import { logger } from "../../logger.js";
import { ATTEMPT_AUTO_SUBMIT_QUEUE_NAME } from "../examAutoSubmitQueue.js";
import {
  startExamRuntimeMaintenanceLoop,
  stopExamRuntimeMaintenanceLoop,
} from "../examRuntimeMaintenance.js";
import {
  initializeRuntimeConfigRuntime,
  stopRuntimeConfigSubscriber,
} from "../runtimeConfigService.js";
import { processAttemptAutoSubmitJob } from "./attemptAutoSubmitProcessor.js";

ensureRound1ProcessType(ROUND1_PROCESS_TYPES.RUNTIME_WORKER);

await initializeRuntimeConfigRuntime("runtime-worker");
startExamRuntimeMaintenanceLoop("runtime-worker");

const connection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

const autoSubmitWorker = new Worker(ATTEMPT_AUTO_SUBMIT_QUEUE_NAME, processAttemptAutoSubmitJob, {
  connection,
  concurrency: env.ROUND1_WORKER_CONCURRENCY,
});

// ── Graceful shutdown ─────────────────────────────────────────

async function shutdown() {
  logger.info("Runtime worker shutting down...");
  stopExamRuntimeMaintenanceLoop();
  await autoSubmitWorker.close();
  await stopRuntimeConfigSubscriber();
  connection.disconnect();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

logger.info(
  { queues: [ATTEMPT_AUTO_SUBMIT_QUEUE_NAME] },
  "Runtime worker started — offline generation and sandbox queues are disabled in production",
);
