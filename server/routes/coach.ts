import { Router, type NextFunction, type Request, type Response } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  addClassCoach,
  archiveClass,
  ClassServiceError,
  closeAssignment,
  createAssignment,
  createClass,
  createClassInvite,
  getAssignmentDetail,
  getClassReport,
  getCoachClass,
  joinClass,
  listClassAssignments,
  listClassCoaches,
  listClassInvites,
  listClassMembers,
  listCoachClasses,
  removeClassCoach,
  removeClassMember,
  revokeClassInvite,
  rotateClassJoinCode,
  transferClassOwner,
  updateAssignment,
  updateClass,
  type ActorContext,
  type ActorRole,
} from "../services/classService.js";
import {
  AddClassCoachBodySchema,
  CreateAssignmentBodySchema,
  CreateClassBodySchema,
  CreateClassInviteBodySchema,
  JoinClassBodySchema,
  UpdateAssignmentBodySchema,
  UpdateClassBodySchema,
} from "./schemas/coach.schema.js";

export const coachRouter = Router();

function actorFromRequest(req: Request): ActorContext {
  return {
    userId: req.session.userId!,
    role: req.session.role as ActorRole,
  };
}

function sendServiceError(err: unknown, res: Response, next: NextFunction): void {
  if (err instanceof ClassServiceError) {
    res.fail(err.code, err.message, err.status, err.details);
    return;
  }

  next(err);
}

function requiredParam(req: Request, name: string): string {
  const value = req.params[name];
  if (!value || Array.isArray(value)) {
    throw new ClassServiceError("ROUND1_VALIDATION_ERROR", `缺少 ${name}`, 400);
  }
  return value;
}

coachRouter.post(
  "/classes/join",
  requireAuth,
  validate(JoinClassBodySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.ok(await joinClass(actorFromRequest(req), req.body));
    } catch (err) {
      sendServiceError(err, res, next);
    }
  },
);

coachRouter.get(
  "/coach/classes",
  requireAuth,
  requireRole("coach", "admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.ok({ items: await listCoachClasses(actorFromRequest(req)) });
    } catch (err) {
      sendServiceError(err, res, next);
    }
  },
);

coachRouter.post(
  "/coach/classes",
  requireAuth,
  requireRole("coach", "admin"),
  validate(CreateClassBodySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.ok(await createClass(actorFromRequest(req), req.body), 201);
    } catch (err) {
      sendServiceError(err, res, next);
    }
  },
);

coachRouter.get(
  "/coach/classes/:id",
  requireAuth,
  requireRole("coach", "admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.ok(await getCoachClass(actorFromRequest(req), requiredParam(req, "id")));
    } catch (err) {
      sendServiceError(err, res, next);
    }
  },
);

coachRouter.patch(
  "/coach/classes/:id",
  requireAuth,
  requireRole("coach", "admin"),
  validate(UpdateClassBodySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.ok(await updateClass(actorFromRequest(req), requiredParam(req, "id"), req.body));
    } catch (err) {
      sendServiceError(err, res, next);
    }
  },
);

coachRouter.post(
  "/coach/classes/:id/archive",
  requireAuth,
  requireRole("coach", "admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.ok(await archiveClass(actorFromRequest(req), requiredParam(req, "id")));
    } catch (err) {
      sendServiceError(err, res, next);
    }
  },
);

coachRouter.post(
  "/coach/classes/:id/rotate-code",
  requireAuth,
  requireRole("coach", "admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.ok(await rotateClassJoinCode(actorFromRequest(req), requiredParam(req, "id")));
    } catch (err) {
      sendServiceError(err, res, next);
    }
  },
);

coachRouter.get(
  "/coach/classes/:id/members",
  requireAuth,
  requireRole("coach", "admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.ok({ items: await listClassMembers(actorFromRequest(req), requiredParam(req, "id")) });
    } catch (err) {
      sendServiceError(err, res, next);
    }
  },
);

coachRouter.delete(
  "/coach/classes/:id/members/:userId",
  requireAuth,
  requireRole("coach", "admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.ok(
        await removeClassMember(
          actorFromRequest(req),
          requiredParam(req, "id"),
          requiredParam(req, "userId"),
        ),
      );
    } catch (err) {
      sendServiceError(err, res, next);
    }
  },
);

coachRouter.get(
  "/coach/classes/:id/invites",
  requireAuth,
  requireRole("coach", "admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.ok({ items: await listClassInvites(actorFromRequest(req), requiredParam(req, "id")) });
    } catch (err) {
      sendServiceError(err, res, next);
    }
  },
);

coachRouter.post(
  "/coach/classes/:id/invites",
  requireAuth,
  requireRole("coach", "admin"),
  validate(CreateClassInviteBodySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.ok(
        await createClassInvite(actorFromRequest(req), requiredParam(req, "id"), req.body),
        201,
      );
    } catch (err) {
      sendServiceError(err, res, next);
    }
  },
);

coachRouter.delete(
  "/coach/classes/:id/invites/:inviteId",
  requireAuth,
  requireRole("coach", "admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.ok(
        await revokeClassInvite(
          actorFromRequest(req),
          requiredParam(req, "id"),
          requiredParam(req, "inviteId"),
        ),
      );
    } catch (err) {
      sendServiceError(err, res, next);
    }
  },
);

coachRouter.get(
  "/coach/classes/:id/coaches",
  requireAuth,
  requireRole("coach", "admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.ok({ items: await listClassCoaches(actorFromRequest(req), requiredParam(req, "id")) });
    } catch (err) {
      sendServiceError(err, res, next);
    }
  },
);

coachRouter.post(
  "/coach/classes/:id/coaches",
  requireAuth,
  requireRole("coach", "admin"),
  validate(AddClassCoachBodySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.ok(
        await addClassCoach(
          actorFromRequest(req),
          requiredParam(req, "id"),
          req.body.userId as string,
        ),
        201,
      );
    } catch (err) {
      sendServiceError(err, res, next);
    }
  },
);

coachRouter.delete(
  "/coach/classes/:id/coaches/:userId",
  requireAuth,
  requireRole("coach", "admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.ok(
        await removeClassCoach(
          actorFromRequest(req),
          requiredParam(req, "id"),
          requiredParam(req, "userId"),
        ),
      );
    } catch (err) {
      sendServiceError(err, res, next);
    }
  },
);

coachRouter.post(
  "/coach/classes/:id/coaches/:userId/transfer-owner",
  requireAuth,
  requireRole("coach", "admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.ok(
        await transferClassOwner(
          actorFromRequest(req),
          requiredParam(req, "id"),
          requiredParam(req, "userId"),
        ),
      );
    } catch (err) {
      sendServiceError(err, res, next);
    }
  },
);

coachRouter.post(
  "/coach/assignments",
  requireAuth,
  requireRole("coach", "admin"),
  validate(CreateAssignmentBodySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.ok(await createAssignment(actorFromRequest(req), req.body), 201);
    } catch (err) {
      sendServiceError(err, res, next);
    }
  },
);

coachRouter.get(
  "/coach/classes/:id/assignments",
  requireAuth,
  requireRole("coach", "admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.ok({
        items: await listClassAssignments(actorFromRequest(req), requiredParam(req, "id")),
      });
    } catch (err) {
      sendServiceError(err, res, next);
    }
  },
);

coachRouter.get(
  "/coach/assignments/:id",
  requireAuth,
  requireRole("coach", "admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.ok(await getAssignmentDetail(actorFromRequest(req), requiredParam(req, "id")));
    } catch (err) {
      sendServiceError(err, res, next);
    }
  },
);

coachRouter.patch(
  "/coach/assignments/:id",
  requireAuth,
  requireRole("coach", "admin"),
  validate(UpdateAssignmentBodySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.ok(await updateAssignment(actorFromRequest(req), requiredParam(req, "id"), req.body));
    } catch (err) {
      sendServiceError(err, res, next);
    }
  },
);

coachRouter.post(
  "/coach/assignments/:id/close",
  requireAuth,
  requireRole("coach", "admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.ok(await closeAssignment(actorFromRequest(req), requiredParam(req, "id")));
    } catch (err) {
      sendServiceError(err, res, next);
    }
  },
);

coachRouter.get(
  "/coach/report/:classId",
  requireAuth,
  requireRole("coach", "admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.ok(await getClassReport(actorFromRequest(req), requiredParam(req, "classId")));
    } catch (err) {
      sendServiceError(err, res, next);
    }
  },
);
