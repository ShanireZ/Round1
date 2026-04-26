import type { Request, Response, NextFunction } from "express";
import { db } from "../db.js";
import { adminAuditLogs } from "../db/schema/adminAuditLogs.js";

/**
 * Admin audit middleware — logs admin mutations with before/after snapshots.
 * Attach `res.locals.auditBefore` before the route handler to capture the "before" state.
 * Call `res.locals.auditAfter` with the "after" state in the handler.
 *
 * Usage in route:
 *   router.patch("/admin/...", requireAuth, requireRole("admin"), requireRecentAuth, adminAudit("update_role", "user"), handler)
 */
export function adminAudit(action: string, targetType: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Store audit context for the handler to use
    res.locals.adminAudit = {
      action,
      targetType,
      actorUserId: req.session.userId,
      reauthMethod: req.session.lastStrongAuthAt ? "session" : undefined,
    };

    // After response, write the audit log
    const originalJson = res.json.bind(res);
    res.json = function (body: unknown) {
      // Only log on success responses
      const b = body as { success?: boolean };
      if (b?.success) {
        const { before, after, targetId } = res.locals.adminAudit;
        db.insert(adminAuditLogs)
          .values({
            actorUserId: req.session.userId!,
            action,
            targetType,
            targetId: targetId ?? req.params.uid ?? "unknown",
            beforeJson: before ?? null,
            afterJson: after ?? null,
            reauthMethod: res.locals.adminAudit.reauthMethod ?? null,
          })
          .catch(() => {}); // fire-and-forget
      }
      return originalJson(body);
    };

    next();
  };
}
