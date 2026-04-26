/**
 * 离线内容队列定义
 *
 * 仅供离线 generation / sandbox verify 流水线使用，不属于 server worker 语义。
 */
import { Queue, QueueEvents } from "bullmq";
import IORedis from "ioredis";

import { env } from "../../config/env.js";

const connection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

export const QUEUE_NAMES = {
  GENERATION: "generation",
  SANDBOX_VERIFY: "sandbox-verify",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const sandboxVerifyQueue = new Queue(QUEUE_NAMES.SANDBOX_VERIFY, {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "fixed", delay: 5_000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 1000 },
  },
});

export function createQueueEvents(name: QueueName): QueueEvents {
  return new QueueEvents(name, { connection });
}