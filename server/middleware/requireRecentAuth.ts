import type { Request, Response, NextFunction } from "express";
import { env } from "../../config/env.js";

/**
 * Require recent strong authentication for sensitive operations.
 * If `lastStrongAuthAt` is older than AUTH_STEP_UP_WINDOW_MINUTES, return 401 REAUTH_REQUIRED.
 */
export function requireRecentAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const lastAuth = req.session.lastStrongAuthAt;
  const windowMs = env.AUTH_STEP_UP_WINDOW_MINUTES * 60 * 1000;

  if (!lastAuth || Date.now() - lastAuth > windowMs) {
    res.fail("ROUND1_REAUTH_REQUIRED", "需要重新验证身份", 401);
    return;
  }

  next();
}
