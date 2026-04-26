import * as fs from "node:fs";
import * as path from "node:path";
import * as https from "node:https";
import * as http from "node:http";
import { env } from "../config/env.js";
import { logger } from "./logger.js";
import { createApp } from "./app.js";
import { connectRedis, disconnectRedis } from "./redis.js";
import { pool } from "./db.js";
import { seedFromFile as seedBlocklist } from "./services/auth/blocklistService.js";
import {
  initializeRuntimeConfigRuntime,
  stopRuntimeConfigSubscriber,
} from "./services/runtimeConfigService.js";
import {
  startExamRuntimeMaintenanceLoop,
  stopExamRuntimeMaintenanceLoop,
} from "./services/examRuntimeMaintenance.js";

/** Resolve a path that may be relative — always relative to project root, not CWD. */
const projectRoot = path.resolve(import.meta.dirname, "..");
const resolve = (p: string) => (path.isAbsolute(p) ? p : path.resolve(projectRoot, p));

async function main(): Promise<void> {
  // Connect Redis (must happen before createApp — RateLimitRedisStore needs open client)
  await connectRedis();
  logger.info("Redis connected");

  // Seed email blocklist from file to Redis (one-time on first boot)
  await seedBlocklist();

  // Load app_settings and listen for cross-process runtime config changes.
  await initializeRuntimeConfigRuntime("api");
  startExamRuntimeMaintenanceLoop("api");

  // Create Express app (after Redis is ready)
  const app = createApp();

  // Create HTTP/HTTPS server
  let server: http.Server | https.Server;

  if (env.NODE_ENV === "development") {
    const cert = fs.readFileSync(resolve(env.DEV_HTTPS_CERT));
    const key = fs.readFileSync(resolve(env.DEV_HTTPS_KEY));
    server = https.createServer({ cert, key }, app);
    logger.info("HTTPS server created (development mode)");
  } else {
    server = http.createServer(app);
    logger.info("HTTP server created (production — TLS terminates at Caddy)");
  }

  server.listen(env.PORT, () => {
    const protocol = env.NODE_ENV === "development" ? "https" : "http";
    logger.info(`Server listening on ${protocol}://localhost:${env.PORT}`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}, shutting down gracefully…`);
    server.close();
    stopExamRuntimeMaintenanceLoop();
    await stopRuntimeConfigSubscriber();
    await disconnectRedis();
    await pool.end();
    logger.info("Shutdown complete");
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.fatal(err, "Failed to start server");
  process.exit(1);
});
