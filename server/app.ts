import express, { type Express } from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import session from "express-session";
import { RedisStore } from "connect-redis";
import { csrfSync } from "csrf-sync";
import { rateLimit } from "express-rate-limit";
import { RedisStore as RateLimitRedisStore } from "rate-limit-redis";
import { env } from "../config/env.js";
import { redisClient } from "./redis.js";
import { responseWrapper } from "./middleware/responseWrapper.js";
import { logger } from "./logger.js";
import { healthRouter } from "./routes/health.js";
import { authRouter } from "./routes/auth.js";
import { configRouter } from "./routes/config.js";
import { adminRouter } from "./routes/admin.js";
import { examsRouter } from "./routes/exams.js";
import { coachRouter } from "./routes/coach.js";
// Ensure common schemas are registered
import "./routes/schemas/common.schema.js";
import "./routes/schemas/auth.schema.js";

// CSRF token generator — exported for route handlers
const { csrfSynchronisedProtection, generateToken } = csrfSync({
  getTokenFromRequest: (req) => req.headers["x-csrf-token"] as string,
});
export { generateToken as csrfGenerateToken };

/**
 * Create and configure the Express application.
 * Must be called AFTER Redis is connected (RateLimitRedisStore needs an open client).
 */
export function createApp(): Express {
  const app = express();

  // Trust exactly 1 proxy hop (Cloudflare → Caddy → Express). Never `true`.
  app.set("trust proxy", 1);

  // ── 1. Security headers ──────────────────────────────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "https://challenges.cloudflare.com"],
          frameSrc: ["'self'", "https://challenges.cloudflare.com"],
          connectSrc: ["'self'"],
          imgSrc: ["'self'", "data:", ...(env.R2_PUBLIC_BASE_URL ? [env.R2_PUBLIC_BASE_URL] : [])],
          fontSrc: [
            "'self'",
            "data:",
            ...(env.R2_PUBLIC_BASE_URL ? [env.R2_PUBLIC_BASE_URL] : []),
            ...(env.CPPLEARN_FONT_PUBLIC_BASE_URL ? [env.CPPLEARN_FONT_PUBLIC_BASE_URL] : []),
          ],
          styleSrc: ["'self'", "'unsafe-inline'"],
        },
      },
    }),
  );

  // ── 2. HTTP request logging ──────────────────────────────────────────
  app.use(pinoHttp({ logger }));

  // ── 3. Body parsing ─────────────────────────────────────────────────
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false }));

  // ── 4. Session (Redis-backed) ───────────────────────────────────────
  const sessionStore = new RedisStore({ client: redisClient });

  app.use(
    session({
      store: sessionStore,
      name: "__Host-Round1.sid",
      secret: env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: env.SESSION_COOKIE_SECURE,
        httpOnly: true,
        sameSite: env.SESSION_COOKIE_SAMESITE,
        path: "/",
        maxAge: env.SESSION_IDLE_MINUTES * 60 * 1000,
        // __Host- prefix requires: secure=true, path="/", no domain
      },
    }),
  );

  // ── 5. CSRF protection (synchronizer token) ─────────────────────────
  app.use((req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      next();
      return;
    }
    csrfSynchronisedProtection(req, res, next);
  });

  // ── 6. Rate limiting (Redis + in-process Map fallback) ──────────────
  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      max: 100,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      store: new RateLimitRedisStore({
        sendCommand: (...args: string[]) => redisClient.sendCommand(args),
      }),
      message: {
        success: false,
        error: {
          code: "ROUND1_RATE_LIMITED",
          message: "Too many requests, please try again later.",
        },
      },
    }),
  );

  // ── 7. Response wrapper (unified JSON envelope) ─────────────────────
  app.use(responseWrapper);

  // ── 8. Routes ───────────────────────────────────────────────────────
  app.use("/api/v1", healthRouter);
  app.use("/api/v1", configRouter);
  app.use("/api/v1", authRouter);
  app.use("/api/v1", adminRouter);
  app.use("/api/v1", coachRouter);
  app.use("/api/v1", examsRouter);

  // ── 9. Global error handler (JSON) ────────────────────────────────
  app.use(
    (
      err: Error & { status?: number; statusCode?: number },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const status = err.status ?? err.statusCode ?? 500;
      const code =
        status === 403
          ? "ROUND1_FORBIDDEN"
          : status === 429
            ? "ROUND1_RATE_LIMITED"
            : "ROUND1_INTERNAL_ERROR";

      if (status >= 500) {
        logger.error(err, "Unhandled error");
      }

      res.status(status).json({
        success: false,
        error: {
          code,
          message: env.NODE_ENV === "development" ? err.message : "Internal error",
        },
      });
    },
  );

  return app;
}
