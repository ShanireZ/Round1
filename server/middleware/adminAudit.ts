import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db.js";
import { adminAuditLogs } from "../db/schema/adminAuditLogs.js";

const ADMIN_AUDIT_FAILED_RESPONSE = {
  success: false,
  error: {
    code: "ROUND1_ADMIN_AUDIT_FAILED",
    message: "Admin audit log write failed; please retry.",
  },
} as const;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Admin audit middleware. It creates an audit row before the route handler runs
 * so sensitive admin operations fail closed when the audit chain is unavailable.
 * Route handlers can set `res.locals.adminAudit.before`, `after`, and `targetId`.
 */
export function adminAudit(action: string, targetType: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    res.locals.adminAudit = {
      action,
      targetType,
      actorUserId: req.session.userId,
      reauthMethod: req.session.lastStrongAuthAt ? "session" : undefined,
    };

    try {
      const [auditLog] = await db
        .insert(adminAuditLogs)
        .values({
          actorUserId: req.session.userId!,
          action,
          targetType,
          targetId: firstParam(req.params.uid) ?? firstParam(req.params.id) ?? "pending",
          beforeJson: null,
          afterJson: null,
          reauthMethod: res.locals.adminAudit.reauthMethod ?? null,
        })
        .returning({ id: adminAuditLogs.id });

      if (!auditLog) {
        throw new Error("Admin audit insert returned no id");
      }

      res.locals.adminAudit.logId = auditLog.id;
    } catch {
      res.status(500).json(ADMIN_AUDIT_FAILED_RESPONSE);
      return;
    }

    const originalJson = res.json.bind(res);
    res.json = function (body: unknown) {
      const b = body as { success?: boolean };
      if (b?.success) {
        const { before, after, logId, targetId } = res.locals.adminAudit;
        void db
          .update(adminAuditLogs)
          .set({
            targetId:
              targetId ?? firstParam(req.params.uid) ?? firstParam(req.params.id) ?? "unknown",
            beforeJson: before ?? null,
            afterJson: after ?? null,
            reauthMethod: res.locals.adminAudit.reauthMethod ?? null,
          })
          .where(eq(adminAuditLogs.id, logId))
          .then(() => {
            originalJson(body);
          })
          .catch(() => {
            if (res.headersSent) {
              return;
            }

            res.status(500);
            originalJson(ADMIN_AUDIT_FAILED_RESPONSE);
          });
        return res;
      }

      return originalJson(body);
    };

    next();
  };
}
