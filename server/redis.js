import { createClient } from "redis";
import IORedis from "ioredis";
import { env } from "../config/env.js";
const isTestEnv = env.NODE_ENV === "test";
// node-redis client, used by connect-redis and rate-limit-redis.
export const redisClient = createClient({
    url: env.REDIS_URL,
    socket: isTestEnv
        ? {
            connectTimeout: 1_000,
            reconnectStrategy: false,
        }
        : undefined,
});
redisClient.on("error", (err) => {
    console.error("Redis (node-redis) error:", err);
});
// ioredis client, used by BullMQ.
export const ioRedisClient = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: isTestEnv,
    retryStrategy: isTestEnv ? () => null : undefined,
});
export async function connectRedis() {
    if (!redisClient.isOpen) {
        await redisClient.connect();
    }
}
export async function disconnectRedis() {
    if (redisClient.isOpen) {
        await redisClient.quit();
    }
    ioRedisClient.disconnect();
}
