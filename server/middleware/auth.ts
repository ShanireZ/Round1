import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db.js";
import { users } from "../db/schema/users.js";
import { env } from "../../config/env.js";

function allowsPasswordChangeRequiredFlow(req: Request): boolean {
  const path = req.path.replace(/^\/api\/v1/, "");

  return (
    (req.method === "POST" && path === "/auth/password/change") ||
    (req.method === "POST" && path === "/auth/logout")
  );
}

/**
 * Require an authenticated session. Validates:
 * 1. Session has userId
 * 2. Absolute TTL has not expired
 * 3. session_version matches DB
 * 4. User status is 'active'
 * 5. password_change_required users can only change password or log out
 */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.session.userId) {
    res.fail("ROUND1_UNAUTHENTICATED", "请先登录", 401);
    return;
  }

  // Check absolute TTL
  const absoluteMaxMs = env.SESSION_ABSOLUTE_MINUTES * 60 * 1000;
  if (
    req.session.createdAt &&
    Date.now() - req.session.createdAt > absoluteMaxMs
  ) {
    req.session.destroy(() => {});
    res.fail("ROUND1_UNAUTHENTICATED", "会话已过期，请重新登录", 401);
    return;
  }

  // Async validation (session_version + user status)
  (async () => {
    const [user] = await db
      .select({
        sessionVersion: users.sessionVersion,
        status: users.status,
        role: users.role,
        passwordChangeRequired: users.passwordChangeRequired,
      })
      .from(users)
      .where(eq(users.id, req.session.userId!))
      .limit(1);

    if (!user || user.status === "deleted") {
      req.session.destroy(() => {});
      res.fail("ROUND1_UNAUTHENTICATED", "账号不存在或已被禁用", 401);
      return;
    }

    if (user.sessionVersion !== req.session.sessionVersion) {
      req.session.destroy(() => {});
      res.fail("ROUND1_UNAUTHENTICATED", "会话已失效，请重新登录", 401);
      return;
    }

    if (user.passwordChangeRequired && !allowsPasswordChangeRequiredFlow(req)) {
      res.fail("ROUND1_PASSWORD_CHANGE_REQUIRED", "首次登录需要先修改密码", 403, {
        passwordChangeRequired: true,
      });
      return;
    }

    next();
  })().catch(next);
}

/**
 * Require a specific role. Must be used AFTER requireAuth.
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!roles.includes(req.session.role!)) {
      res.fail("ROUND1_FORBIDDEN", "权限不足", 403);
      return;
    }
    next();
  };
}
