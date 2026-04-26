import { logger } from "../logger.js";
import { redisClient } from "../redis.js";
import { getRuntimeNumberSetting } from "./runtimeConfigService.js";

export type AutosaveRateLimitResult =
  | { allowed: true; retryAfterSeconds: 0 }
  | { allowed: false; retryAfterSeconds: number };

type MemoryEntry = {
  expiresAt: number;
};

const memoryLimits = new Map<string, MemoryEntry>();

function cleanupMemoryLimits(nowMs: number) {
  for (const [key, entry] of memoryLimits.entries()) {
    if (entry.expiresAt <= nowMs) {
      memoryLimits.delete(key);
    }
  }
}

export async function consumeAutosaveRateLimit(userId: string): Promise<AutosaveRateLimitResult> {
  const windowSeconds = getRuntimeNumberSetting("exam.autosaveRateLimitSeconds", 30);
  const key = `rl:autosave:user:${userId}`;

  if (redisClient.isOpen) {
    try {
      const result = await redisClient.set(key, "1", {
        NX: true,
        EX: windowSeconds,
      });

      if (result === "OK") {
        return { allowed: true, retryAfterSeconds: 0 };
      }

      const ttl = await redisClient.ttl(key);
      return { allowed: false, retryAfterSeconds: ttl > 0 ? ttl : windowSeconds };
    } catch (error) {
      logger.warn({ error, key }, "Autosave Redis rate limit failed; using in-memory fallback");
    }
  }

  const nowMs = Date.now();
  cleanupMemoryLimits(nowMs);
  const current = memoryLimits.get(key);
  if (current && current.expiresAt > nowMs) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.expiresAt - nowMs) / 1000)),
    };
  }

  memoryLimits.set(key, { expiresAt: nowMs + windowSeconds * 1000 });
  return { allowed: true, retryAfterSeconds: 0 };
}

export function clearAutosaveRateLimitForTests() {
  memoryLimits.clear();
}
