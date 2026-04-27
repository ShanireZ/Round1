import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import { z } from "zod";
import { generateOpenAPIDocument } from "../openapi/generator.js";
import { registry } from "../openapi/registry.js";
import { env } from "../../config/env.js";
import { checkDbConnection } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
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
healthRouter.get(
  "/openapi.json",
  (_req, res, next) => {
    if (env.NODE_ENV === "development") {
      res.json(generateOpenAPIDocument());
      return;
    }

    next();
  },
  requireAuth,
  requireRole("admin"),
  (_req, res) => {
    res.json(generateOpenAPIDocument());
  },
);

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
