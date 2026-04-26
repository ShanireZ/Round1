/**
 * Shared test setup — bootstraps the Express app with real DB + Redis.
 *
 * Requirements:
 *   docker compose -f docker-compose.dev.yml up -d
 *   npm run migrate:up
 */
import { createApp } from "../app.js";
import { db, pool } from "../db.js";
import { redisClient } from "../redis.js";
import { seedFromFile } from "../services/auth/blocklistService.js";
import type { Express } from "express";

let app: Express;

export async function getApp(): Promise<Express> {
  if (!app) {
    // Seed blocklist from file on first boot
    await seedFromFile();
    app = createApp();
  }
  return app;
}

export { db, pool, redisClient };

/**
 * Clean up DB connections and Redis after all tests finish.
 */
export async function teardown(): Promise<void> {
  await pool.end();
  await redisClient.quit();
}
