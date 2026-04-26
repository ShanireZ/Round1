import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import { z } from "zod";
import { generateOpenAPIDocument } from "../openapi/generator.js";
import { registry } from "../openapi/registry.js";
import { env } from "../../config/env.js";
import { checkDbConnection } from "../db.js";
import { redisClient } from "../redis.js";

// Register health endpoint in OpenAPI
registry.registerPath({
  method: "get",
  path: "/api/v1/health",
  summary: "Health check",
  responses: {
    200: {
      description: "Service is healthy",
      content: {
        "application/json": {
          schema: z.object({
            success: z.literal(true),
            data: z.object({
              status: z.enum(["ok", "degraded"]),
              timestamp: z.string(),
              db: z.string(),
              redis: z.string(),
            }),
          }),
        },
      },
    },
  },
});

export const healthRouter = Router();

// GET /api/v1/health
healthRouter.get("/health", async (_req, res) => {
  let dbStatus = "ok";
  let redisStatus = "ok";

  try {
    await checkDbConnection();
  } catch {
    dbStatus = "error";
  }

  try {
    await redisClient.ping();
  } catch {
    redisStatus = "error";
  }

  const overall = dbStatus === "ok" && redisStatus === "ok" ? "ok" : "degraded";
  const statusCode = overall === "ok" ? 200 : 503;

  res.status(statusCode).json({
    success: true,
    data: {
      status: overall,
      timestamp: new Date().toISOString(),
      db: dbStatus,
      redis: redisStatus,
    },
  });
});

// GET /api/v1/openapi.json
healthRouter.get("/openapi.json", (_req, res) => {
  // Dev mode: unrestricted; Production: admin only (will be enforced after auth module)
  if (env.NODE_ENV !== "development") {
    // Auth not yet implemented — return 403 in production for now
    res.status(403).json({
      success: false,
      error: { code: "ROUND1_FORBIDDEN", message: "Forbidden" },
    });
    return;
  }
  res.json(generateOpenAPIDocument());
});

// GET /api/v1/docs — Swagger UI (dev only)
if (env.NODE_ENV === "development") {
  healthRouter.use(
    "/docs",
    swaggerUi.serve,
    swaggerUi.setup(undefined, {
      swaggerOptions: { url: "/api/v1/openapi.json" },
    }),
  );
}
