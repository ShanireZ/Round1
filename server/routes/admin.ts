import { randomUUID } from "node:crypto";
import { Router, type Request, type Response, type NextFunction } from "express";
import { eq, sql, and, desc } from "drizzle-orm";
import { db } from "../db.js";
import { users } from "../db/schema/users.js";
import { questions } from "../db/schema/questions.js";
import { questionExamTypes } from "../db/schema/questionExamTypes.js";
import { questionKpTags } from "../db/schema/questionKpTags.js";
import { questionReviews } from "../db/schema/questionReviews.js";
import { prebuiltPapers } from "../db/schema/prebuiltPapers.js";
import { prebuiltPaperSlots } from "../db/schema/prebuiltPaperSlots.js";
import { importBatches } from "../db/schema/importBatches.js";
import { paperQuestionSlots } from "../db/schema/paperQuestionSlots.js";
import { papers } from "../db/schema/papers.js";
import { assignments } from "../db/schema/assignments.js";
import { appSettings } from "../db/schema/appSettings.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/auth.js";
import { requireRecentAuth } from "../middleware/requireRecentAuth.js";
import { adminAudit } from "../middleware/adminAudit.js";
import { validate } from "../middleware/validate.js";
import {
  addClassCoach,
  ClassServiceError,
  listClassCoaches,
  removeClassCoach,
  transferClassOwner,
  type ActorContext,
  type ActorRole,
} from "../services/classService.js";
import { AdminUpdateUserBody } from "./schemas/auth.schema.js";
import { AddClassCoachBodySchema } from "./schemas/coach.schema.js";
import { PaginationQuerySchema } from "./schemas/common.schema.js";
import {
  BlocklistAddBody,
  BlocklistRenameBody,
  BlocklistQuerySchema,
} from "./schemas/blocklist.schema.js";
import {
  getStats as getBlocklistStats,
  listDomains,
  addDomain,
  removeDomain,
  renameDomain,
  syncFromGitHub,
} from "../services/auth/blocklistService.js";
import { QuestionQuerySchema } from "./schemas/questionBank.schema.js";
import {
  AdminQuestionCreateBody,
  AdminQuestionUpdateBody,
  ImportBatchQuerySchema,
  PrebuiltPaperBundleImportBody,
  PrebuiltPaperCreateBody,
  PrebuiltPaperQuerySchema,
  PrebuiltPaperUpdateBody,
  QuestionReviewQuerySchema,
  QuestionBundleImportBody,
  AdminQuestionRejectBody,
  AdminSettingUpdateBody,
} from "./schemas/adminContent.schema.js";
import {
  computeChecksum,
  type PrebuiltPaperBundle,
  type QuestionBundle,
} from "../../scripts/lib/bundleTypes.js";
import { importQuestionBundle } from "../../scripts/lib/questionBundleWorkflow.js";
import { importPrebuiltPaperBundle } from "../../scripts/lib/prebuiltPaperBundleWorkflow.js";
import {
  listRuntimeSettingsForAdmin,
  publishRuntimeConfigChange,
  reloadRuntimeConfig,
} from "../services/runtimeConfigService.js";
import { validateRuntimeSettingValue } from "../services/runtimeSettingDefinitions.js";

export const adminRouter = Router();

const ADMIN_QUESTION_BUNDLE_FILENAME = "admin-question-bundle.json";
const ADMIN_PREBUILT_PAPER_BUNDLE_FILENAME = "admin-prebuilt-paper-bundle.json";
type QuestionReviewStore = Pick<typeof db, "select" | "insert" | "update">;

function getActorUserId(req: Request) {
  return req.session?.userId ?? null;
}

function actorFromRequest(req: Request): ActorContext {
  return {
    userId: req.session.userId!,
    role: req.session.role as ActorRole,
  };
}

function sendClassServiceError(err: unknown, res: Response, next: NextFunction): void {
  if (err instanceof ClassServiceError) {
    res.fail(err.code, err.message, err.status, err.details);
    return;
  }

  next(err);
}

function isCodeQuestionType(type: string) {
  return type === "reading_program" || type === "completion_program";
}

function hasSandboxVerifiedCodeQuestionIssue(question: { type: string; sandboxVerified: boolean }) {
  return isCodeQuestionType(question.type) && question.sandboxVerified !== true;
}

function buildLoadedQuestionBundle(bundle: QuestionBundle) {
  const raw = JSON.stringify(bundle);

  return {
    bundle,
    raw,
    checksum: computeChecksum(raw),
    sourceFilename: ADMIN_QUESTION_BUNDLE_FILENAME,
    sourcePath: "admin://question-bundle",
  };
}

function buildLoadedPrebuiltPaperBundle(bundle: PrebuiltPaperBundle) {
  const raw = JSON.stringify(bundle);

  return {
    bundle,
    raw,
    checksum: computeChecksum(raw),
    sourceFilename: ADMIN_PREBUILT_PAPER_BUNDLE_FILENAME,
    sourcePath: "admin://prebuilt-paper-bundle",
  };
}

function getCountValue(row: { count?: number | string | bigint | null } | undefined) {
  const raw = row?.count ?? 0;
  return Number(raw);
}

async function setLatestQuestionReviewStatus(
  tx: QuestionReviewStore,
  params: {
    questionId: string;
    reviewStatus: "confirmed" | "rejected";
    reviewedBy: string | null;
    reviewerNotes?: string | null;
  },
) {
  const [latestReview] = await tx
    .select({ id: questionReviews.id })
    .from(questionReviews)
    .where(eq(questionReviews.questionId, params.questionId))
    .orderBy(desc(questionReviews.createdAt))
    .limit(1);

  const values = {
    reviewStatus: params.reviewStatus,
    reviewedBy: params.reviewedBy,
    reviewerNotes: params.reviewerNotes ?? null,
    reviewedAt: new Date(),
  };

  if (!latestReview) {
    const [created] = await tx
      .insert(questionReviews)
      .values({
        questionId: params.questionId,
        ...values,
      })
      .returning({
        id: questionReviews.id,
        reviewStatus: questionReviews.reviewStatus,
      });

    return created;
  }

  const [updated] = await tx
    .update(questionReviews)
    .set(values)
    .where(eq(questionReviews.id, latestReview.id))
    .returning({
      id: questionReviews.id,
      reviewStatus: questionReviews.reviewStatus,
    });

  return updated;
}

// GET /admin/users — list users (paginated + optional role filter)
adminRouter.get(
  "/admin/users",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, pageSize } = PaginationQuerySchema.parse(req.query);
      const roleFilter = req.query.role as string | undefined;

      const conditions = [];
      if (roleFilter) {
        conditions.push(eq(users.role, roleFilter));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [countResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(users)
        .where(whereClause);

      const total = countResult?.count ?? 0;
      const offset = (page - 1) * pageSize;

      const rows = await db
        .select({
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          role: users.role,
          status: users.status,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(whereClause)
        .orderBy(users.createdAt)
        .limit(pageSize)
        .offset(offset);

      res.ok({
        items: rows,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /admin/users/:uid — update role
adminRouter.patch(
  "/admin/users/:uid",
  requireAuth,
  requireRole("admin"),
  requireRecentAuth,
  adminAudit("update_role", "user"),
  validate(AdminUpdateUserBody),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const uid = req.params.uid as string;
      const { role } = req.body;

      // Get before state
      const [before] = await db
        .select({ id: users.id, role: users.role, status: users.status })
        .from(users)
        .where(eq(users.id, uid))
        .limit(1);

      if (!before) {
        res.fail("ROUND1_NOT_FOUND", "用户不存在", 404);
        return;
      }

      res.locals.adminAudit.before = before;
      res.locals.adminAudit.targetId = uid;

      const updates: Record<string, unknown> = {};
      if (role) updates.role = role;

      const [updated] = await db
        .update(users)
        .set(updates)
        .where(eq(users.id, uid))
        .returning({ id: users.id, role: users.role });

      res.locals.adminAudit.after = updated;
      res.ok(updated);
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /admin/users/:uid — soft delete
adminRouter.delete(
  "/admin/users/:uid",
  requireAuth,
  requireRole("admin"),
  requireRecentAuth,
  adminAudit("soft_delete_user", "user"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const uid = req.params.uid as string;

      const [before] = await db
        .select({ id: users.id, status: users.status })
        .from(users)
        .where(eq(users.id, uid))
        .limit(1);

      if (!before) {
        res.fail("ROUND1_NOT_FOUND", "用户不存在", 404);
        return;
      }

      res.locals.adminAudit.before = before;
      res.locals.adminAudit.targetId = uid;

      await db
        .update(users)
        .set({
          status: "deleted",
          deletedAt: new Date(),
          sessionVersion: sql`${users.sessionVersion} + 1`,
        })
        .where(eq(users.id, uid));

      res.locals.adminAudit.after = { id: uid, status: "deleted" };
      res.ok({ message: "用户已禁用" });
    } catch (err) {
      next(err);
    }
  },
);

// POST /admin/users/:uid/restore — restore soft-deleted user
adminRouter.post(
  "/admin/users/:uid/restore",
  requireAuth,
  requireRole("admin"),
  requireRecentAuth,
  adminAudit("restore_user", "user"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const uid = req.params.uid as string;

      const [before] = await db
        .select({ id: users.id, status: users.status })
        .from(users)
        .where(eq(users.id, uid))
        .limit(1);

      if (!before) {
        res.fail("ROUND1_NOT_FOUND", "用户不存在", 404);
        return;
      }

      res.locals.adminAudit.before = before;
      res.locals.adminAudit.targetId = uid;

      await db.update(users).set({ status: "active", deletedAt: null }).where(eq(users.id, uid));

      res.locals.adminAudit.after = { id: uid, status: "active" };
      res.ok({ message: "用户已恢复" });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Admin Class Coach Management ─────────────────────────────────────

adminRouter.get(
  "/admin/classes/:id/coaches",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.ok({
        items: await listClassCoaches(actorFromRequest(req), req.params.id as string, true),
      });
    } catch (err) {
      sendClassServiceError(err, res, next);
    }
  },
);

adminRouter.post(
  "/admin/classes/:id/coaches",
  requireAuth,
  requireRole("admin"),
  requireRecentAuth,
  adminAudit("add_class_coach", "class"),
  validate(AddClassCoachBodySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const classId = req.params.id as string;
      const coach = await addClassCoach(
        actorFromRequest(req),
        classId,
        req.body.userId as string,
        true,
      );
      res.locals.adminAudit.targetId = classId;
      res.locals.adminAudit.after = coach;
      res.ok(coach, 201);
    } catch (err) {
      sendClassServiceError(err, res, next);
    }
  },
);

adminRouter.delete(
  "/admin/classes/:id/coaches/:userId",
  requireAuth,
  requireRole("admin"),
  requireRecentAuth,
  adminAudit("remove_class_coach", "class"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const classId = req.params.id as string;
      const removed = await removeClassCoach(
        actorFromRequest(req),
        classId,
        req.params.userId as string,
        true,
      );
      res.locals.adminAudit.targetId = classId;
      res.locals.adminAudit.before = removed;
      res.ok(removed);
    } catch (err) {
      sendClassServiceError(err, res, next);
    }
  },
);

adminRouter.post(
  "/admin/classes/:id/coaches/:userId/transfer-owner",
  requireAuth,
  requireRole("admin"),
  requireRecentAuth,
  adminAudit("transfer_class_owner", "class"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const classId = req.params.id as string;
      const owner = await transferClassOwner(
        actorFromRequest(req),
        classId,
        req.params.userId as string,
        true,
      );
      res.locals.adminAudit.targetId = classId;
      res.locals.adminAudit.after = owner;
      res.ok(owner);
    } catch (err) {
      sendClassServiceError(err, res, next);
    }
  },
);

// ─── Blocklist Management ────────────────────────────────────────────

// GET /admin/blocklist/stats — summary counts
adminRouter.get(
  "/admin/blocklist/stats",
  requireAuth,
  requireRole("admin"),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const stats = await getBlocklistStats();
      res.ok(stats);
    } catch (err) {
      next(err);
    }
  },
);

// GET /admin/blocklist — paginated list + search + source filter
adminRouter.get(
  "/admin/blocklist",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = BlocklistQuerySchema.parse(req.query);
      const { items, total } = await listDomains(query);
      res.ok({
        items,
        pagination: {
          page: query.page,
          pageSize: query.pageSize,
          total,
          totalPages: Math.ceil(total / query.pageSize),
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// POST /admin/blocklist — add domain
adminRouter.post(
  "/admin/blocklist",
  requireAuth,
  requireRole("admin"),
  adminAudit("blocklist_add", "blocklist"),
  validate(BlocklistAddBody),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { domain } = req.body;
      res.locals.adminAudit.targetId = domain;

      const added = await addDomain(domain);
      if (!added) {
        res.fail("ROUND1_DUPLICATE", "该域名已在黑名单中", 409);
        return;
      }
      res.locals.adminAudit.after = { domain, source: "manual" };
      res.ok({ domain, source: "manual" }, 201);
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /admin/blocklist/:domain — rename domain
adminRouter.patch(
  "/admin/blocklist/:domain",
  requireAuth,
  requireRole("admin"),
  adminAudit("blocklist_rename", "blocklist"),
  validate(BlocklistRenameBody),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const oldDomain = decodeURIComponent(req.params.domain as string);
      const { newDomain } = req.body;

      res.locals.adminAudit.targetId = oldDomain;
      res.locals.adminAudit.before = { domain: oldDomain };

      const renamed = await renameDomain(oldDomain, newDomain);
      if (!renamed) {
        res.fail("ROUND1_NOT_FOUND", "原域名不在黑名单中", 404);
        return;
      }
      res.locals.adminAudit.after = { domain: newDomain };
      res.ok({ domain: newDomain, source: "manual" });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /admin/blocklist/:domain — remove domain
adminRouter.delete(
  "/admin/blocklist/:domain",
  requireAuth,
  requireRole("admin"),
  adminAudit("blocklist_remove", "blocklist"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const domain = decodeURIComponent(req.params.domain as string);
      res.locals.adminAudit.targetId = domain;
      res.locals.adminAudit.before = { domain };

      const removed = await removeDomain(domain);
      if (!removed) {
        res.fail("ROUND1_NOT_FOUND", "该域名不在黑名单中", 404);
        return;
      }
      res.ok({ message: "已移除" });
    } catch (err) {
      next(err);
    }
  },
);

// POST /admin/blocklist/sync — sync from GitHub
adminRouter.post(
  "/admin/blocklist/sync",
  requireAuth,
  requireRole("admin"),
  adminAudit("blocklist_sync", "blocklist"),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await syncFromGitHub();
      res.locals.adminAudit.after = result;
      res.locals.adminAudit.targetId = "github";
      res.ok(result);
    } catch (err) {
      next(err);
    }
  },
);

// ─── Runtime Settings ────────────────────────────────────────────────

// GET /admin/settings — list runtime settings with defaults
adminRouter.get(
  "/admin/settings",
  requireAuth,
  requireRole("admin"),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const items = await listRuntimeSettingsForAdmin();
      res.ok({ items });
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /admin/settings/:key — update or create a runtime setting
adminRouter.patch(
  "/admin/settings/:key",
  requireAuth,
  requireRole("admin"),
  requireRecentAuth,
  adminAudit("update_setting", "app_setting"),
  validate(AdminSettingUpdateBody),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const key = req.params.key as string;
      if (!key || key.length > 100) {
        res.fail("ROUND1_INVALID_PARAM", "无效的设置 key", 400);
        return;
      }

      const validationError = validateRuntimeSettingValue(key, req.body.valueJson);
      if (validationError) {
        res.fail("ROUND1_INVALID_PARAM", validationError, 400);
        return;
      }

      const [current] = await db
        .select({
          key: appSettings.key,
          valueJson: appSettings.valueJson,
        })
        .from(appSettings)
        .where(eq(appSettings.key, key))
        .limit(1);

      res.locals.adminAudit.targetId = key;
      res.locals.adminAudit.before = current ?? null;

      const values = {
        valueJson: req.body.valueJson,
        updatedBy: getActorUserId(req),
        updatedAt: new Date(),
      };

      const [updated] = current
        ? await db.update(appSettings).set(values).where(eq(appSettings.key, key)).returning({
            key: appSettings.key,
            valueJson: appSettings.valueJson,
            updatedBy: appSettings.updatedBy,
            createdAt: appSettings.createdAt,
            updatedAt: appSettings.updatedAt,
          })
        : await db
            .insert(appSettings)
            .values({
              key,
              ...values,
            })
            .returning({
              key: appSettings.key,
              valueJson: appSettings.valueJson,
              updatedBy: appSettings.updatedBy,
              createdAt: appSettings.createdAt,
              updatedAt: appSettings.updatedAt,
            });

      const runtimeConfig = await reloadRuntimeConfig({
        reason: "admin-setting-updated",
        key,
      });
      const configChange = await publishRuntimeConfigChange({
        key,
        updatedBy: getActorUserId(req),
      });

      const responseBody = {
        ...updated,
        runtimeConfig: {
          revision: runtimeConfig.revision,
          loadedAt: runtimeConfig.loadedAt,
        },
        configChange,
      };

      res.locals.adminAudit.after = responseBody;
      res.ok(responseBody, current ? 200 : 201);
    } catch (err) {
      next(err);
    }
  },
);

// ─── Question Bank Management ────────────────────────────────────────

// POST /admin/questions — create draft question
adminRouter.post(
  "/admin/questions",
  requireAuth,
  requireRole("admin"),
  adminAudit("create_question", "question_bank"),
  validate(AdminQuestionCreateBody),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body;
      const [created] = await db
        .insert(questions)
        .values({
          type: body.type,
          difficulty: body.difficulty,
          primaryKpId: body.primaryKpId,
          contentJson: body.contentJson,
          answerJson: body.answerJson,
          explanationJson: body.explanationJson,
          contentHash: body.contentHash,
          status: "draft",
          sandboxVerified: body.sandboxVerified,
          source: body.source,
        })
        .returning({
          id: questions.id,
          status: questions.status,
          difficulty: questions.difficulty,
          type: questions.type,
        });

      if (!created) {
        res.fail("ROUND1_CREATE_FAILED", "题目创建失败", 500);
        return;
      }

      await db
        .insert(questionExamTypes)
        .values(body.examTypes.map((examType: string) => ({ questionId: created.id, examType })));

      await db
        .insert(questionKpTags)
        .values([
          { questionId: created.id, kpId: body.primaryKpId, tagRole: "primary" },
          ...body.auxiliaryKpIds
            .filter((kpId: number) => kpId !== body.primaryKpId)
            .map((kpId: number) => ({ questionId: created.id, kpId, tagRole: "secondary" })),
        ]);

      res.locals.adminAudit.targetId = created.id;
      res.locals.adminAudit.after = created;
      res.ok(created, 201);
    } catch (err) {
      next(err);
    }
  },
);

// GET /admin/questions — paginated question list
adminRouter.get(
  "/admin/questions",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = QuestionQuerySchema.parse(req.query);
      const conditions = [];

      if (query.questionType) conditions.push(eq(questions.type, query.questionType));
      if (query.difficulty) conditions.push(eq(questions.difficulty, query.difficulty));
      if (query.status) conditions.push(eq(questions.status, query.status));
      if (query.source) conditions.push(eq(questions.source, query.source));

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [countResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(questions)
        .where(whereClause);

      const total = countResult?.count ?? 0;
      const offset = (query.page - 1) * query.pageSize;

      const rows = await db
        .select({
          id: questions.id,
          type: questions.type,
          difficulty: questions.difficulty,
          status: questions.status,
          source: questions.source,
          sandboxVerified: questions.sandboxVerified,
          createdAt: questions.createdAt,
        })
        .from(questions)
        .where(whereClause)
        .orderBy(questions.createdAt)
        .limit(query.pageSize)
        .offset(offset);

      res.ok({
        items: rows,
        pagination: {
          page: query.page,
          pageSize: query.pageSize,
          total,
          totalPages: Math.ceil(total / query.pageSize),
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// GET /admin/question-reviews — paginated real-paper AI review queue
adminRouter.get(
  "/admin/question-reviews",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = QuestionReviewQuerySchema.parse(req.query);
      const whereClause = query.status ? eq(questionReviews.reviewStatus, query.status) : undefined;

      const [countResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(questionReviews)
        .where(whereClause);

      const total = getCountValue(countResult);
      const offset = (query.page - 1) * query.pageSize;

      const rows = await db
        .select({
          id: questionReviews.id,
          questionId: questionReviews.questionId,
          reviewStatus: questionReviews.reviewStatus,
          aiConfidence: questionReviews.aiConfidence,
          officialAnswerDiff: questionReviews.officialAnswerDiff,
          reviewerNotes: questionReviews.reviewerNotes,
          reviewedBy: questionReviews.reviewedBy,
          reviewedAt: questionReviews.reviewedAt,
          createdAt: questionReviews.createdAt,
        })
        .from(questionReviews)
        .where(whereClause)
        .orderBy(desc(questionReviews.createdAt))
        .limit(query.pageSize)
        .offset(offset);

      res.ok({
        items: rows,
        pagination: {
          page: query.page,
          pageSize: query.pageSize,
          total,
          totalPages: Math.ceil(total / query.pageSize),
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// GET /admin/questions/:id/references — question reference summary
adminRouter.get(
  "/admin/questions/:id/references",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string;
      const [prebuiltCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(prebuiltPaperSlots)
        .where(eq(prebuiltPaperSlots.questionId, id));

      const [paperCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(paperQuestionSlots)
        .where(eq(paperQuestionSlots.currentQuestionId, id));

      const prebuiltPaperReferences = getCountValue(prebuiltCount);
      const paperInstanceReferences = getCountValue(paperCount);

      res.ok({
        questionId: id,
        prebuiltPaperReferences,
        paperInstanceReferences,
        assignmentReferences: 0,
        totalReferences: prebuiltPaperReferences + paperInstanceReferences,
        canDelete: prebuiltPaperReferences === 0 && paperInstanceReferences === 0,
      });
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /admin/questions/:id — edit draft question
adminRouter.patch(
  "/admin/questions/:id",
  requireAuth,
  requireRole("admin"),
  adminAudit("update_question", "question_bank"),
  validate(AdminQuestionUpdateBody),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string;
      const body = req.body;

      const [current] = await db
        .select({
          id: questions.id,
          status: questions.status,
          primaryKpId: questions.primaryKpId,
        })
        .from(questions)
        .where(eq(questions.id, id))
        .limit(1);

      if (!current) {
        res.fail("ROUND1_NOT_FOUND", "题目不存在", 404);
        return;
      }

      if (current.status !== "draft") {
        res.fail("ROUND1_CONFLICT", "仅允许编辑 draft 题目", 409);
        return;
      }

      res.locals.adminAudit.targetId = id;
      res.locals.adminAudit.before = current;

      const updated = await db.transaction(async (tx) => {
        const updates: Record<string, unknown> = {
          updatedAt: new Date(),
        };

        if (body.type) updates.type = body.type;
        if (body.difficulty) updates.difficulty = body.difficulty;
        if (body.primaryKpId !== undefined) updates.primaryKpId = body.primaryKpId;
        if (body.contentJson) updates.contentJson = body.contentJson;
        if (body.answerJson) updates.answerJson = body.answerJson;
        if (body.explanationJson) updates.explanationJson = body.explanationJson;
        if (body.contentHash) updates.contentHash = body.contentHash;
        if (body.source) updates.source = body.source;
        if (body.sandboxVerified !== undefined) updates.sandboxVerified = body.sandboxVerified;

        const [nextQuestion] = await tx
          .update(questions)
          .set(updates)
          .where(eq(questions.id, id))
          .returning({
            id: questions.id,
            status: questions.status,
            difficulty: questions.difficulty,
            type: questions.type,
          });

        if (body.examTypes) {
          await tx.delete(questionExamTypes).where(eq(questionExamTypes.questionId, id));
          await tx
            .insert(questionExamTypes)
            .values(body.examTypes.map((examType: string) => ({ questionId: id, examType })));
        }

        if (body.primaryKpId !== undefined || body.auxiliaryKpIds !== undefined) {
          const primaryKpId = body.primaryKpId ?? current.primaryKpId;
          const auxiliaryKpIds = body.auxiliaryKpIds ?? [];

          await tx.delete(questionKpTags).where(eq(questionKpTags.questionId, id));
          await tx
            .insert(questionKpTags)
            .values([
              { questionId: id, kpId: primaryKpId, tagRole: "primary" },
              ...auxiliaryKpIds
                .filter((kpId: number) => kpId !== primaryKpId)
                .map((kpId: number) => ({ questionId: id, kpId, tagRole: "secondary" })),
            ]);
        }

        return nextQuestion;
      });

      res.locals.adminAudit.after = updated;
      res.ok(updated);
    } catch (err) {
      next(err);
    }
  },
);

// GET /admin/questions/:id — single question detail
adminRouter.get(
  "/admin/questions/:id",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string;
      if (!id) {
        res.fail("ROUND1_INVALID_PARAM", "无效的题目 ID", 400);
        return;
      }

      const [question] = await db.select().from(questions).where(eq(questions.id, id)).limit(1);

      if (!question) {
        res.fail("ROUND1_NOT_FOUND", "题目不存在", 404);
        return;
      }

      const examTypes = await db
        .select({ examType: questionExamTypes.examType })
        .from(questionExamTypes)
        .where(eq(questionExamTypes.questionId, id));

      res.ok({ ...question, examTypes: examTypes.map((e) => e.examType) });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /admin/questions/:id — delete unreferenced draft question
adminRouter.delete(
  "/admin/questions/:id",
  requireAuth,
  requireRole("admin"),
  requireRecentAuth,
  adminAudit("delete_question", "question_bank"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string;
      const [current] = await db
        .select({ id: questions.id, status: questions.status })
        .from(questions)
        .where(eq(questions.id, id))
        .limit(1);

      if (!current) {
        res.fail("ROUND1_NOT_FOUND", "题目不存在", 404);
        return;
      }

      if (current.status !== "draft") {
        res.fail("ROUND1_CONFLICT", "仅允许删除未引用的 draft 题目", 409);
        return;
      }

      const [prebuiltReference] = await db
        .select({ prebuiltPaperId: prebuiltPaperSlots.prebuiltPaperId })
        .from(prebuiltPaperSlots)
        .where(eq(prebuiltPaperSlots.questionId, id))
        .limit(1);

      if (prebuiltReference) {
        res.fail("ROUND1_CONFLICT", "题目已被预制卷引用，不能删除", 409);
        return;
      }

      const [paperReference] = await db
        .select({ paperId: paperQuestionSlots.paperId })
        .from(paperQuestionSlots)
        .where(eq(paperQuestionSlots.currentQuestionId, id))
        .limit(1);

      if (paperReference) {
        res.fail("ROUND1_CONFLICT", "题目已被试卷实例引用，不能删除", 409);
        return;
      }

      res.locals.adminAudit.targetId = id;
      res.locals.adminAudit.before = current;

      await db.transaction(async (tx) => {
        await tx.delete(questionExamTypes).where(eq(questionExamTypes.questionId, id));
        await tx.delete(questionKpTags).where(eq(questionKpTags.questionId, id));
        await tx.delete(questionReviews).where(eq(questionReviews.questionId, id));
        await tx.delete(questions).where(eq(questions.id, id));
      });

      res.locals.adminAudit.after = { id, status: "deleted" };
      res.ok({ id, message: "题目已删除" });
    } catch (err) {
      next(err);
    }
  },
);

// POST /admin/questions/:id/publish — publish question
adminRouter.post(
  "/admin/questions/:id/publish",
  requireAuth,
  requireRole("admin"),
  requireRecentAuth,
  adminAudit("publish_question", "question_bank"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string;
      const [current] = await db
        .select({
          id: questions.id,
          status: questions.status,
          type: questions.type,
          sandboxVerified: questions.sandboxVerified,
        })
        .from(questions)
        .where(eq(questions.id, id))
        .limit(1);

      if (!current) {
        res.fail("ROUND1_NOT_FOUND", "题目不存在", 404);
        return;
      }

      if (current.status !== "reviewed") {
        res.fail("ROUND1_CONFLICT", "Only reviewed questions can be published", 409);
        return;
      }

      if (hasSandboxVerifiedCodeQuestionIssue(current)) {
        res.fail(
          "ROUND1_CONFLICT",
          "代码题未通过离线 sandbox 校验，sandboxVerified=true 后才能 published",
          409,
        );
        return;
      }

      const [updated] = await db
        .update(questions)
        .set({
          status: "published",
          publishedAt: new Date(),
          archivedAt: null,
          updatedAt: new Date(),
        })
        .where(and(eq(questions.id, id), eq(questions.status, "reviewed")))
        .returning({
          id: questions.id,
          status: questions.status,
          publishedAt: questions.publishedAt,
          archivedAt: questions.archivedAt,
        });

      if (!updated) {
        res.fail("ROUND1_CONFLICT", "Question status changed, refresh and retry", 409);
        return;
      }

      res.locals.adminAudit.targetId = id;
      res.locals.adminAudit.before = current;
      res.locals.adminAudit.after = updated;
      res.ok(updated);
    } catch (err) {
      next(err);
    }
  },
);

// POST /admin/questions/:id/archive — archive question
adminRouter.post(
  "/admin/questions/:id/archive",
  requireAuth,
  requireRole("admin"),
  requireRecentAuth,
  adminAudit("archive_question", "question_bank"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string;
      const [current] = await db
        .select({
          id: questions.id,
          status: questions.status,
        })
        .from(questions)
        .where(eq(questions.id, id))
        .limit(1);

      if (!current) {
        res.fail("ROUND1_NOT_FOUND", "题目不存在", 404);
        return;
      }

      if (current.status !== "published") {
        res.fail("ROUND1_CONFLICT", "Only published questions can be archived", 409);
        return;
      }

      const [updated] = await db
        .update(questions)
        .set({
          status: "archived",
          archivedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(questions.id, id), eq(questions.status, "published")))
        .returning({
          id: questions.id,
          status: questions.status,
          publishedAt: questions.publishedAt,
          archivedAt: questions.archivedAt,
        });

      if (!updated) {
        res.fail("ROUND1_CONFLICT", "Question status changed, refresh and retry", 409);
        return;
      }

      res.locals.adminAudit.targetId = id;
      res.locals.adminAudit.before = current;
      res.locals.adminAudit.after = updated;
      res.ok(updated);
    } catch (err) {
      next(err);
    }
  },
);

// POST /admin/questions/:id/confirm — confirm question review
adminRouter.post(
  "/admin/questions/:id/confirm",
  requireAuth,
  requireRole("admin"),
  requireRecentAuth,
  adminAudit("confirm_question", "question_bank"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string;

      const [current] = await db
        .select({ id: questions.id, status: questions.status })
        .from(questions)
        .where(eq(questions.id, id))
        .limit(1);

      if (!current) {
        res.fail("ROUND1_NOT_FOUND", "题目不存在", 404);
        return;
      }

      if (current.status !== "draft") {
        res.fail("ROUND1_CONFLICT", "Only draft questions can be confirmed", 409);
        return;
      }

      const result = await db.transaction(async (tx) => {
        const review = await setLatestQuestionReviewStatus(tx, {
          questionId: id,
          reviewStatus: "confirmed",
          reviewedBy: getActorUserId(req),
          reviewerNotes: "Confirmed by admin",
        });

        const [updated] = await tx
          .update(questions)
          .set({
            status: "reviewed",
            archivedAt: null,
            updatedAt: new Date(),
          })
          .where(and(eq(questions.id, id), eq(questions.status, "draft")))
          .returning({
            id: questions.id,
            status: questions.status,
          });

        return {
          ...updated,
          reviewStatus: review?.reviewStatus ?? "confirmed",
        };
      });

      res.locals.adminAudit.targetId = id;
      res.locals.adminAudit.before = current;
      res.locals.adminAudit.after = result;
      res.ok(result);
    } catch (err) {
      next(err);
    }
  },
);

// POST /admin/questions/:id/reject — reject question review
adminRouter.post(
  "/admin/questions/:id/reject",
  requireAuth,
  requireRole("admin"),
  requireRecentAuth,
  adminAudit("reject_question", "question_bank"),
  validate(AdminQuestionRejectBody),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string;
      const [current] = await db
        .select({ id: questions.id, status: questions.status })
        .from(questions)
        .where(eq(questions.id, id))
        .limit(1);

      if (!current) {
        res.fail("ROUND1_NOT_FOUND", "题目不存在", 404);
        return;
      }

      if (current.status !== "draft") {
        res.fail("ROUND1_CONFLICT", "Only draft questions can be rejected", 409);
        return;
      }

      const result = await db.transaction(async (tx) => {
        const review = await setLatestQuestionReviewStatus(tx, {
          questionId: id,
          reviewStatus: "rejected",
          reviewedBy: getActorUserId(req),
          reviewerNotes: req.body.reviewerNotes ?? null,
        });

        const [updated] = await tx
          .update(questions)
          .set({
            status: "draft",
            publishedAt: null,
            archivedAt: null,
            updatedAt: new Date(),
          })
          .where(and(eq(questions.id, id), eq(questions.status, "draft")))
          .returning({
            id: questions.id,
            status: questions.status,
          });

        return {
          ...updated,
          reviewStatus: review?.reviewStatus ?? "rejected",
        };
      });

      res.locals.adminAudit.targetId = id;
      res.locals.adminAudit.before = current;
      res.locals.adminAudit.after = result;
      res.ok(result);
    } catch (err) {
      next(err);
    }
  },
);

// GET /admin/prebuilt-papers — paginated prebuilt paper list
adminRouter.get(
  "/admin/prebuilt-papers",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = PrebuiltPaperQuerySchema.parse(req.query);
      const conditions = [];

      if (query.examType) conditions.push(eq(prebuiltPapers.examType, query.examType));
      if (query.difficulty) conditions.push(eq(prebuiltPapers.difficulty, query.difficulty));
      if (query.status) conditions.push(eq(prebuiltPapers.status, query.status));

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [countResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(prebuiltPapers)
        .where(whereClause);

      const total = countResult?.count ?? 0;
      const offset = (query.page - 1) * query.pageSize;

      const rows = await db
        .select()
        .from(prebuiltPapers)
        .where(whereClause)
        .orderBy(prebuiltPapers.createdAt)
        .limit(query.pageSize)
        .offset(offset);

      res.ok({
        items: rows,
        pagination: {
          page: query.page,
          pageSize: query.pageSize,
          total,
          totalPages: Math.ceil(total / query.pageSize),
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// POST /admin/prebuilt-papers — create draft prebuilt paper
adminRouter.post(
  "/admin/prebuilt-papers",
  requireAuth,
  requireRole("admin"),
  adminAudit("create_prebuilt_paper", "prebuilt_paper"),
  validate(PrebuiltPaperCreateBody),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body;
      const paperId = randomUUID();
      const [created] = await db
        .insert(prebuiltPapers)
        .values({
          id: paperId,
          title: body.title,
          examType: body.examType,
          difficulty: body.difficulty,
          blueprintVersion: body.blueprintVersion,
          rootPaperId: paperId,
          parentPaperId: null,
          versionNo: 1,
          status: "draft",
          metadataJson: body.metadataJson,
        })
        .returning({
          id: prebuiltPapers.id,
          status: prebuiltPapers.status,
          title: prebuiltPapers.title,
        });

      if (!created) {
        res.fail("ROUND1_CREATE_FAILED", "预制卷创建失败", 500);
        return;
      }

      await db.insert(prebuiltPaperSlots).values(
        body.slots.map((slot: Record<string, unknown>) => ({
          prebuiltPaperId: created.id,
          slotNo: slot.slotNo as number,
          questionId: slot.questionId as string,
          questionType: slot.questionType as string,
          primaryKpId: slot.primaryKpId as number,
          difficulty: slot.difficulty as string,
          points: slot.points as number,
        })),
      );

      res.locals.adminAudit.targetId = created.id;
      res.locals.adminAudit.after = created;
      res.ok(created, 201);
    } catch (err) {
      next(err);
    }
  },
);

// GET /admin/prebuilt-papers/:id/references — prebuilt paper reference summary
adminRouter.get(
  "/admin/prebuilt-papers/:id/references",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string;
      const [paperCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(papers)
        .where(eq(papers.prebuiltPaperId, id));

      const [assignmentCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(assignments)
        .where(eq(assignments.prebuiltPaperId, id));

      const paperInstanceReferences = getCountValue(paperCount);
      const assignmentReferences = getCountValue(assignmentCount);

      res.ok({
        prebuiltPaperId: id,
        paperInstanceReferences,
        assignmentReferences,
        totalReferences: paperInstanceReferences + assignmentReferences,
        canDelete: paperInstanceReferences === 0 && assignmentReferences === 0,
      });
    } catch (err) {
      next(err);
    }
  },
);

// GET /admin/prebuilt-papers/:id — prebuilt paper detail
adminRouter.get(
  "/admin/prebuilt-papers/:id",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string;
      const [paper] = await db
        .select()
        .from(prebuiltPapers)
        .where(eq(prebuiltPapers.id, id))
        .limit(1);

      if (!paper) {
        res.fail("ROUND1_NOT_FOUND", "预制卷不存在", 404);
        return;
      }

      const slots = await db
        .select({
          slotNo: prebuiltPaperSlots.slotNo,
          questionId: prebuiltPaperSlots.questionId,
          questionType: prebuiltPaperSlots.questionType,
          primaryKpId: prebuiltPaperSlots.primaryKpId,
          difficulty: prebuiltPaperSlots.difficulty,
          points: prebuiltPaperSlots.points,
        })
        .from(prebuiltPaperSlots)
        .where(eq(prebuiltPaperSlots.prebuiltPaperId, id))
        .orderBy(prebuiltPaperSlots.slotNo);

      res.ok({ ...paper, slots });
    } catch (err) {
      next(err);
    }
  },
);

// POST /admin/prebuilt-papers/:id/copy-version — clone as new draft version
adminRouter.post(
  "/admin/prebuilt-papers/:id/copy-version",
  requireAuth,
  requireRole("admin"),
  requireRecentAuth,
  adminAudit("copy_prebuilt_paper_version", "prebuilt_paper"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string;
      const [current] = await db
        .select({
          id: prebuiltPapers.id,
          title: prebuiltPapers.title,
          examType: prebuiltPapers.examType,
          difficulty: prebuiltPapers.difficulty,
          blueprintVersion: prebuiltPapers.blueprintVersion,
          status: prebuiltPapers.status,
          rootPaperId: prebuiltPapers.rootPaperId,
          versionNo: prebuiltPapers.versionNo,
          sourceBatchId: prebuiltPapers.sourceBatchId,
          metadataJson: prebuiltPapers.metadataJson,
        })
        .from(prebuiltPapers)
        .where(eq(prebuiltPapers.id, id))
        .limit(1);

      if (!current) {
        res.fail("ROUND1_NOT_FOUND", "预制卷不存在", 404);
        return;
      }

      if (current.status === "draft") {
        res.fail("ROUND1_CONFLICT", "Draft prebuilt papers can be edited in place", 409);
        return;
      }

      const rootPaperId = current.rootPaperId ?? current.id;
      const [latestVersion] = await db
        .select({ versionNo: sql<number>`coalesce(max(${prebuiltPapers.versionNo}), 0)::int` })
        .from(prebuiltPapers)
        .where(eq(prebuiltPapers.rootPaperId, rootPaperId));

      const slots = await db
        .select({
          slotNo: prebuiltPaperSlots.slotNo,
          questionId: prebuiltPaperSlots.questionId,
          questionType: prebuiltPaperSlots.questionType,
          primaryKpId: prebuiltPaperSlots.primaryKpId,
          difficulty: prebuiltPaperSlots.difficulty,
          points: prebuiltPaperSlots.points,
        })
        .from(prebuiltPaperSlots)
        .where(eq(prebuiltPaperSlots.prebuiltPaperId, id))
        .orderBy(prebuiltPaperSlots.slotNo);

      const copied = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(prebuiltPapers)
          .values({
            title: current.title,
            examType: current.examType,
            difficulty: current.difficulty,
            blueprintVersion: current.blueprintVersion,
            rootPaperId,
            parentPaperId: current.id,
            versionNo: (latestVersion?.versionNo ?? current.versionNo ?? 0) + 1,
            status: "draft",
            sourceBatchId: current.sourceBatchId,
            metadataJson: current.metadataJson,
            publishedAt: null,
            archivedAt: null,
          })
          .returning({
            id: prebuiltPapers.id,
            status: prebuiltPapers.status,
            rootPaperId: prebuiltPapers.rootPaperId,
            parentPaperId: prebuiltPapers.parentPaperId,
            versionNo: prebuiltPapers.versionNo,
          });

        if (!created) {
          throw new Error("prebuilt paper copy-version insert failed");
        }

        if (slots.length > 0) {
          await tx.insert(prebuiltPaperSlots).values(
            slots.map((slot) => ({
              prebuiltPaperId: created.id,
              slotNo: slot.slotNo,
              questionId: slot.questionId,
              questionType: slot.questionType,
              primaryKpId: slot.primaryKpId,
              difficulty: slot.difficulty,
              points: slot.points,
            })),
          );
        }

        return created;
      });

      res.locals.adminAudit.targetId = copied.id;
      res.locals.adminAudit.before = current;
      res.locals.adminAudit.after = copied;
      res.ok(copied, 201);
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /admin/prebuilt-papers/:id — edit draft prebuilt paper
adminRouter.patch(
  "/admin/prebuilt-papers/:id",
  requireAuth,
  requireRole("admin"),
  adminAudit("update_prebuilt_paper", "prebuilt_paper"),
  validate(PrebuiltPaperUpdateBody),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string;
      const body = req.body;
      const [current] = await db
        .select({
          id: prebuiltPapers.id,
          status: prebuiltPapers.status,
          title: prebuiltPapers.title,
        })
        .from(prebuiltPapers)
        .where(eq(prebuiltPapers.id, id))
        .limit(1);

      if (!current) {
        res.fail("ROUND1_NOT_FOUND", "预制卷不存在", 404);
        return;
      }

      if (current.status !== "draft") {
        res.fail("ROUND1_CONFLICT", "仅允许编辑 draft 预制卷", 409);
        return;
      }

      res.locals.adminAudit.targetId = id;
      res.locals.adminAudit.before = current;

      const updated = await db.transaction(async (tx) => {
        const updates: Record<string, unknown> = {
          updatedAt: new Date(),
        };

        if (body.title) updates.title = body.title;
        if (body.examType) updates.examType = body.examType;
        if (body.difficulty) updates.difficulty = body.difficulty;
        if (body.blueprintVersion !== undefined) updates.blueprintVersion = body.blueprintVersion;
        if (body.metadataJson) updates.metadataJson = body.metadataJson;

        const [nextPaper] = await tx
          .update(prebuiltPapers)
          .set(updates)
          .where(eq(prebuiltPapers.id, id))
          .returning({
            id: prebuiltPapers.id,
            status: prebuiltPapers.status,
            title: prebuiltPapers.title,
          });

        if (body.slots) {
          await tx.delete(prebuiltPaperSlots).where(eq(prebuiltPaperSlots.prebuiltPaperId, id));
          await tx.insert(prebuiltPaperSlots).values(
            body.slots.map((slot: Record<string, unknown>) => ({
              prebuiltPaperId: id,
              slotNo: slot.slotNo as number,
              questionId: slot.questionId as string,
              questionType: slot.questionType as string,
              primaryKpId: slot.primaryKpId as number,
              difficulty: slot.difficulty as string,
              points: slot.points as number,
            })),
          );
        }

        return nextPaper;
      });

      res.locals.adminAudit.after = updated;
      res.ok(updated);
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /admin/prebuilt-papers/:id — delete unreferenced draft prebuilt paper
adminRouter.delete(
  "/admin/prebuilt-papers/:id",
  requireAuth,
  requireRole("admin"),
  requireRecentAuth,
  adminAudit("delete_prebuilt_paper", "prebuilt_paper"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string;
      const [current] = await db
        .select({ id: prebuiltPapers.id, status: prebuiltPapers.status })
        .from(prebuiltPapers)
        .where(eq(prebuiltPapers.id, id))
        .limit(1);

      if (!current) {
        res.fail("ROUND1_NOT_FOUND", "预制卷不存在", 404);
        return;
      }

      if (current.status !== "draft") {
        res.fail("ROUND1_CONFLICT", "仅允许删除未引用的 draft 预制卷", 409);
        return;
      }

      const [paperReference] = await db
        .select({ id: papers.id })
        .from(papers)
        .where(eq(papers.prebuiltPaperId, id))
        .limit(1);

      if (paperReference) {
        res.fail("ROUND1_CONFLICT", "预制卷已被试卷实例引用，不能删除", 409);
        return;
      }

      const [assignmentReference] = await db
        .select({ id: assignments.id })
        .from(assignments)
        .where(eq(assignments.prebuiltPaperId, id))
        .limit(1);

      if (assignmentReference) {
        res.fail("ROUND1_CONFLICT", "预制卷已被任务引用，不能删除", 409);
        return;
      }

      res.locals.adminAudit.targetId = id;
      res.locals.adminAudit.before = current;

      await db.transaction(async (tx) => {
        await tx.delete(prebuiltPaperSlots).where(eq(prebuiltPaperSlots.prebuiltPaperId, id));
        await tx.delete(prebuiltPapers).where(eq(prebuiltPapers.id, id));
      });

      res.locals.adminAudit.after = { id, status: "deleted" };
      res.ok({ id, message: "预制卷已删除" });
    } catch (err) {
      next(err);
    }
  },
);

// POST /admin/prebuilt-papers/:id/publish — publish prebuilt paper
adminRouter.post(
  "/admin/prebuilt-papers/:id/publish",
  requireAuth,
  requireRole("admin"),
  requireRecentAuth,
  adminAudit("publish_prebuilt_paper", "prebuilt_paper"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string;
      const [current] = await db
        .select({ id: prebuiltPapers.id, status: prebuiltPapers.status })
        .from(prebuiltPapers)
        .where(eq(prebuiltPapers.id, id))
        .limit(1);

      if (!current) {
        res.fail("ROUND1_NOT_FOUND", "预制卷不存在", 404);
        return;
      }

      if (current.status !== "draft") {
        res.fail("ROUND1_CONFLICT", "预制卷发布版本不可原地覆盖，请先复制为新的 draft 版本", 409);
        return;
      }

      const [updated] = await db
        .update(prebuiltPapers)
        .set({
          status: "published",
          publishedAt: new Date(),
          archivedAt: null,
          updatedAt: new Date(),
        })
        .where(and(eq(prebuiltPapers.id, id), eq(prebuiltPapers.status, "draft")))
        .returning({
          id: prebuiltPapers.id,
          status: prebuiltPapers.status,
          publishedAt: prebuiltPapers.publishedAt,
          archivedAt: prebuiltPapers.archivedAt,
        });

      if (!updated) {
        res.fail("ROUND1_CONFLICT", "Prebuilt paper status changed, refresh and retry", 409);
        return;
      }

      res.locals.adminAudit.targetId = id;
      res.locals.adminAudit.before = current;
      res.locals.adminAudit.after = updated;
      res.ok(updated);
    } catch (err) {
      next(err);
    }
  },
);

// POST /admin/prebuilt-papers/:id/archive — archive prebuilt paper
adminRouter.post(
  "/admin/prebuilt-papers/:id/archive",
  requireAuth,
  requireRole("admin"),
  requireRecentAuth,
  adminAudit("archive_prebuilt_paper", "prebuilt_paper"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string;
      const [current] = await db
        .select({
          id: prebuiltPapers.id,
          status: prebuiltPapers.status,
        })
        .from(prebuiltPapers)
        .where(eq(prebuiltPapers.id, id))
        .limit(1);

      if (!current) {
        res.fail("ROUND1_NOT_FOUND", "预制卷不存在", 404);
        return;
      }

      if (current.status !== "published") {
        res.fail("ROUND1_CONFLICT", "Only published prebuilt papers can be archived", 409);
        return;
      }

      const [updated] = await db
        .update(prebuiltPapers)
        .set({
          status: "archived",
          archivedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(prebuiltPapers.id, id), eq(prebuiltPapers.status, "published")))
        .returning({
          id: prebuiltPapers.id,
          status: prebuiltPapers.status,
          publishedAt: prebuiltPapers.publishedAt,
          archivedAt: prebuiltPapers.archivedAt,
        });

      if (!updated) {
        res.fail("ROUND1_CONFLICT", "Prebuilt paper status changed, refresh and retry", 409);
        return;
      }

      res.locals.adminAudit.targetId = id;
      res.locals.adminAudit.before = current;
      res.locals.adminAudit.after = updated;
      res.ok(updated);
    } catch (err) {
      next(err);
    }
  },
);

// GET /admin/import-batches — paginated import batch list
adminRouter.get(
  "/admin/import-batches",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = ImportBatchQuerySchema.parse(req.query);
      const conditions = [];

      if (query.bundleType) conditions.push(eq(importBatches.bundleType, query.bundleType));
      if (query.status) conditions.push(eq(importBatches.status, query.status));

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [countResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(importBatches)
        .where(whereClause);

      const total = countResult?.count ?? 0;
      const offset = (query.page - 1) * query.pageSize;

      const rows = await db
        .select()
        .from(importBatches)
        .where(whereClause)
        .orderBy(importBatches.createdAt)
        .limit(query.pageSize)
        .offset(offset);

      res.ok({
        items: rows,
        pagination: {
          page: query.page,
          pageSize: query.pageSize,
          total,
          totalPages: Math.ceil(total / query.pageSize),
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// POST /admin/import-batches/questions/dry-run — validate question bundle and record summary
adminRouter.post(
  "/admin/import-batches/questions/dry-run",
  requireAuth,
  requireRole("admin"),
  adminAudit("dry_run_question_bundle", "import_batch"),
  validate(QuestionBundleImportBody),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const loaded = buildLoadedQuestionBundle(req.body as QuestionBundle);
      const result = await importQuestionBundle(loaded, {
        apply: false,
        importedBy: getActorUserId(req),
      });

      res.locals.adminAudit.targetId = result.id ?? loaded.checksum;
      res.locals.adminAudit.after = result;
      res.ok({
        sourceFilename: loaded.sourceFilename,
        checksum: loaded.checksum,
        ...result,
      });
    } catch (err) {
      next(err);
    }
  },
);

// POST /admin/import-batches/questions/apply — persist question bundle import
adminRouter.post(
  "/admin/import-batches/questions/apply",
  requireAuth,
  requireRole("admin"),
  adminAudit("apply_question_bundle", "import_batch"),
  validate(QuestionBundleImportBody),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as QuestionBundle;

      const invalidCodeQuestion = body.items.find(
        (item: { type: string; sandboxVerified: boolean }) =>
          hasSandboxVerifiedCodeQuestionIssue(item),
      );

      if (invalidCodeQuestion) {
        res.fail(
          "ROUND1_CONFLICT",
          "question bundle 中的代码题必须携带离线校验结果，sandboxVerified=true 后才能导入生产",
          409,
        );
        return;
      }

      const loaded = buildLoadedQuestionBundle(body);
      const result = await importQuestionBundle(loaded, {
        apply: true,
        importedBy: getActorUserId(req),
      });

      if (result.status === "failed") {
        res.fail("ROUND1_IMPORT_FAILED", "题目 bundle 导入失败", 503, result.summary);
        return;
      }

      res.locals.adminAudit.targetId = result.id ?? loaded.checksum;
      res.locals.adminAudit.after = result;
      res.ok(
        {
          sourceFilename: loaded.sourceFilename,
          checksum: loaded.checksum,
          ...result,
        },
        201,
      );
    } catch (err) {
      next(err);
    }
  },
);

// POST /admin/import-batches/prebuilt-papers/dry-run — validate prebuilt paper bundle and record summary
adminRouter.post(
  "/admin/import-batches/prebuilt-papers/dry-run",
  requireAuth,
  requireRole("admin"),
  adminAudit("dry_run_prebuilt_paper_bundle", "import_batch"),
  validate(PrebuiltPaperBundleImportBody),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const loaded = buildLoadedPrebuiltPaperBundle(req.body as PrebuiltPaperBundle);
      const result = await importPrebuiltPaperBundle(loaded, {
        apply: false,
        importedBy: getActorUserId(req),
      });

      res.locals.adminAudit.targetId = result.id ?? loaded.checksum;
      res.locals.adminAudit.after = result;
      res.ok({
        sourceFilename: loaded.sourceFilename,
        checksum: loaded.checksum,
        ...result,
      });
    } catch (err) {
      next(err);
    }
  },
);

// POST /admin/import-batches/prebuilt-papers/apply — persist prebuilt paper bundle import
adminRouter.post(
  "/admin/import-batches/prebuilt-papers/apply",
  requireAuth,
  requireRole("admin"),
  adminAudit("apply_prebuilt_paper_bundle", "import_batch"),
  validate(PrebuiltPaperBundleImportBody),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const loaded = buildLoadedPrebuiltPaperBundle(req.body as PrebuiltPaperBundle);
      const result = await importPrebuiltPaperBundle(loaded, {
        apply: true,
        importedBy: getActorUserId(req),
      });

      if (result.status === "failed") {
        res.fail("ROUND1_IMPORT_FAILED", "预制卷 bundle 导入失败", 503, result.summary);
        return;
      }

      res.locals.adminAudit.targetId = result.id ?? loaded.checksum;
      res.locals.adminAudit.after = result;
      res.ok(
        {
          sourceFilename: loaded.sourceFilename,
          checksum: loaded.checksum,
          ...result,
        },
        201,
      );
    } catch (err) {
      next(err);
    }
  },
);
