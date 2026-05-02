import { randomInt } from "node:crypto";
import { and, asc, desc, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { env } from "../../config/env.js";
import { db } from "../db.js";
import { simulatedPrebuiltPaperPredicate } from "../db/prebuiltPaperPredicates.js";
import {
  assignmentProgress,
  assignments,
  attempts,
  classCoaches,
  classInvites,
  classMembers,
  classes,
  papers,
  prebuiltPapers,
  users,
} from "../db/schema/index.js";
import { createClassInviteToken, hashClassInviteToken } from "./classInviteService.js";

const CLASS_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CLASS_CODE_LENGTH = 6;
const JOIN_URL_PATH = "/join";

export type ActorRole = "student" | "coach" | "admin";

export type ActorContext = {
  userId: string;
  role: ActorRole;
};

export class ClassServiceError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ClassServiceError";
  }
}

type ClassAccess = {
  id: string;
  archivedAt: Date | null;
  coachRole: "owner" | "collaborator";
};

type ClassRecord = {
  id: string;
  name: string;
  joinCode: string;
  archivedAt: Date | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

type AssignmentCreateBody = {
  classId: string;
  title: string;
  prebuiltPaperId: string;
  dueAt: string;
};

type AssignmentUpdateBody = {
  title?: string;
  dueAt?: string;
};

type NumericSummary = {
  total: number;
  correct: number;
};

type QuestionTypeSummary = NumericSummary & {
  score: number;
  maxScore: number;
};

type StudentReportSummary = {
  userId: string;
  username: string;
  displayName: string;
  pending: number;
  inProgress: number;
  completed: number;
  missed: number;
  scoreSum: number;
  scored: number;
  latestSubmittedAt: Date | null;
  kpStats: Map<string, NumericSummary>;
  questionTypeStats: Map<string, QuestionTypeSummary>;
  trend: Array<{
    assignmentId: string;
    title: string;
    status: string;
    dueAt: Date | null;
    progressStatus: string;
    score: number | null;
    submittedAt: Date | null;
  }>;
};

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "23505"
  );
}

function generateJoinCodeCandidate(): string {
  let code = "";
  for (let index = 0; index < CLASS_CODE_LENGTH; index += 1) {
    code += CLASS_CODE_ALPHABET[randomInt(CLASS_CODE_ALPHABET.length)];
  }
  return code;
}

function normalizeJoinCode(code: string): string {
  return code.replace(/\s+/g, "").toUpperCase();
}

function parseFutureDate(value: string, fieldName: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ClassServiceError("ROUND1_VALIDATION_ERROR", `${fieldName} 时间格式无效`, 400);
  }
  return parsed;
}

function assertFutureDueAt(dueAt: Date): void {
  const minDueAt = Date.now() + env.MIN_ASSIGNMENT_START_MINUTES * 60 * 1000;
  if (dueAt.getTime() < minDueAt) {
    throw new ClassServiceError("ROUND1_ASSIGNMENT_DUE_TOO_SOON", "任务截止时间过近", 422, {
      minStartMinutes: env.MIN_ASSIGNMENT_START_MINUTES,
    });
  }
}

function assertOwner(access: ClassAccess): void {
  if (access.coachRole !== "owner") {
    throw new ClassServiceError("ROUND1_CLASS_OWNER_REQUIRED", "仅班级 owner 可执行该操作", 403);
  }
}

function toClassSummary(
  row: ClassRecord & {
    coachRole?: string | null;
    memberCount?: number | string | bigint | null;
    coachCount?: number | string | bigint | null;
  },
) {
  return {
    id: row.id,
    name: row.name,
    joinCode: row.joinCode,
    archivedAt: row.archivedAt,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(row.coachRole ? { coachRole: row.coachRole } : {}),
    ...(row.memberCount !== undefined ? { memberCount: Number(row.memberCount) } : {}),
    ...(row.coachCount !== undefined ? { coachCount: Number(row.coachCount) } : {}),
  };
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function readNumberField(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function mergeKpStats(target: Map<string, NumericSummary>, value: unknown): void {
  for (const [kpId, rawSummary] of Object.entries(normalizeRecord(value))) {
    const summary = normalizeRecord(rawSummary);
    const current = target.get(kpId) ?? { total: 0, correct: 0 };
    current.total += readNumberField(summary, "total");
    current.correct += readNumberField(summary, "correct");
    target.set(kpId, current);
  }
}

function mergeQuestionTypeStats(target: Map<string, QuestionTypeSummary>, value: unknown): void {
  for (const [questionType, rawSummary] of Object.entries(normalizeRecord(value))) {
    const summary = normalizeRecord(rawSummary);
    const current = target.get(questionType) ?? {
      total: 0,
      correct: 0,
      score: 0,
      maxScore: 0,
    };
    current.total += readNumberField(summary, "total");
    current.correct += readNumberField(summary, "correct");
    current.score += readNumberField(summary, "score");
    current.maxScore += readNumberField(summary, "maxScore");
    target.set(questionType, current);
  }
}

function toAccuracy(summary: NumericSummary): number {
  return summary.total === 0 ? 0 : summary.correct / summary.total;
}

function toQuestionTypeAccuracy(summary: QuestionTypeSummary): number {
  return summary.maxScore === 0 ? toAccuracy(summary) : summary.score / summary.maxScore;
}

function sortKpIds(left: string, right: string): number {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }

  return left.localeCompare(right);
}

function sortNullableDates(left: Date | null, right: Date | null): number {
  return (left?.getTime() ?? 0) - (right?.getTime() ?? 0);
}

async function generateUniqueJoinCode(): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const joinCode = generateJoinCodeCandidate();
    const [existing] = await db
      .select({ id: classes.id })
      .from(classes)
      .where(eq(classes.joinCode, joinCode))
      .limit(1);

    if (!existing) {
      return joinCode;
    }
  }

  throw new ClassServiceError("ROUND1_CLASS_CODE_GENERATION_FAILED", "班级码生成失败", 503);
}

async function getClassById(classId: string): Promise<ClassRecord> {
  const [row] = await db
    .select({
      id: classes.id,
      name: classes.name,
      joinCode: classes.joinCode,
      archivedAt: classes.archivedAt,
      createdBy: classes.createdBy,
      createdAt: classes.createdAt,
      updatedAt: classes.updatedAt,
    })
    .from(classes)
    .where(eq(classes.id, classId))
    .limit(1);

  if (!row) {
    throw new ClassServiceError("ROUND1_CLASS_NOT_FOUND", "班级不存在", 404);
  }

  return row;
}

async function getCoachAccess(actor: ActorContext, classId: string): Promise<ClassAccess> {
  const [row] = await db
    .select({
      id: classes.id,
      archivedAt: classes.archivedAt,
      coachRole: classCoaches.role,
    })
    .from(classes)
    .innerJoin(
      classCoaches,
      and(eq(classCoaches.classId, classes.id), eq(classCoaches.userId, actor.userId)),
    )
    .where(eq(classes.id, classId))
    .limit(1);

  if (!row) {
    throw new ClassServiceError("ROUND1_CLASS_NOT_FOUND", "班级不存在或无权访问", 404);
  }

  return row as ClassAccess;
}

async function assertAdminClassExists(classId: string): Promise<void> {
  await getClassById(classId);
}

async function ensureCanManageClass(actor: ActorContext, classId: string, adminOverride = false) {
  if (adminOverride && actor.role === "admin") {
    await assertAdminClassExists(classId);
    return;
  }

  const access = await getCoachAccess(actor, classId);
  assertOwner(access);
}

async function assertCoachableUser(userId: string) {
  const [targetUser] = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      role: users.role,
      status: users.status,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!targetUser || targetUser.status !== "active") {
    throw new ClassServiceError("ROUND1_USER_NOT_FOUND", "用户不存在或不可用", 404);
  }

  if (targetUser.role !== "coach" && targetUser.role !== "admin") {
    throw new ClassServiceError(
      "ROUND1_CLASS_COACH_ROLE_REQUIRED",
      "只能添加 coach/admin 用户为班级教练",
      422,
    );
  }

  return targetUser;
}

export async function listCoachClasses(actor: ActorContext) {
  const rows = await db
    .select({
      id: classes.id,
      name: classes.name,
      joinCode: classes.joinCode,
      archivedAt: classes.archivedAt,
      createdBy: classes.createdBy,
      createdAt: classes.createdAt,
      updatedAt: classes.updatedAt,
      coachRole: classCoaches.role,
      memberCount: sql<number>`(
        select count(*)::int from class_members cm where cm.class_id = ${classes.id}
      )`,
      coachCount: sql<number>`(
        select count(*)::int from class_coaches cc where cc.class_id = ${classes.id}
      )`,
    })
    .from(classes)
    .innerJoin(
      classCoaches,
      and(eq(classCoaches.classId, classes.id), eq(classCoaches.userId, actor.userId)),
    )
    .orderBy(desc(classes.createdAt));

  return rows.map(toClassSummary);
}

export async function listCoachPrebuiltPapers() {
  return db
    .select({
      id: prebuiltPapers.id,
      title: prebuiltPapers.title,
      examType: prebuiltPapers.examType,
      difficulty: prebuiltPapers.difficulty,
      blueprintVersion: prebuiltPapers.blueprintVersion,
      publishedAt: prebuiltPapers.publishedAt,
    })
    .from(prebuiltPapers)
    .where(and(eq(prebuiltPapers.status, "published"), simulatedPrebuiltPaperPredicate()))
    .orderBy(desc(prebuiltPapers.publishedAt), desc(prebuiltPapers.createdAt));
}

export async function listStudentClasses(actor: ActorContext) {
  const rows = await db
    .select({
      classId: classes.id,
      name: classes.name,
      archivedAt: classes.archivedAt,
      joinedVia: classMembers.joinedVia,
      joinedAt: classMembers.joinedAt,
      openAssignments: sql<number>`(
        select count(*)::int
        from ${assignments} a
        left join ${assignmentProgress} ap
          on ap.assignment_id = a.id
          and ap.user_id = ${actor.userId}
        where a.class_id = ${classes.id}
          and a.status = 'assigned'
          and coalesce(ap.status, 'pending') in ('pending', 'in_progress')
      )`,
      completedAssignments: sql<number>`(
        select count(*)::int
        from ${assignments} a
        inner join ${assignmentProgress} ap
          on ap.assignment_id = a.id
          and ap.user_id = ${actor.userId}
        where a.class_id = ${classes.id}
          and ap.status = 'completed'
      )`,
      missedAssignments: sql<number>`(
        select count(*)::int
        from ${assignments} a
        inner join ${assignmentProgress} ap
          on ap.assignment_id = a.id
          and ap.user_id = ${actor.userId}
        where a.class_id = ${classes.id}
          and ap.status = 'missed'
      )`,
    })
    .from(classMembers)
    .innerJoin(classes, eq(classes.id, classMembers.classId))
    .where(eq(classMembers.userId, actor.userId))
    .orderBy(desc(classMembers.joinedAt));

  return rows.map((row) => ({
    ...row,
    openAssignments: Number(row.openAssignments),
    completedAssignments: Number(row.completedAssignments),
    missedAssignments: Number(row.missedAssignments),
  }));
}

export async function getCoachClass(actor: ActorContext, classId: string) {
  await getCoachAccess(actor, classId);
  const row = await getClassById(classId);
  return toClassSummary(row);
}

export async function createClass(actor: ActorContext, params: { name: string }) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const joinCode = await generateUniqueJoinCode();

    try {
      const created = await db.transaction(async (tx) => {
        const [createdClass] = await tx
          .insert(classes)
          .values({
            name: params.name,
            joinCode,
            createdBy: actor.userId,
          })
          .returning({
            id: classes.id,
            name: classes.name,
            joinCode: classes.joinCode,
            archivedAt: classes.archivedAt,
            createdBy: classes.createdBy,
            createdAt: classes.createdAt,
            updatedAt: classes.updatedAt,
          });

        if (!createdClass) {
          throw new Error("Class insert returned no row");
        }

        await tx.insert(classCoaches).values({
          classId: createdClass.id,
          userId: actor.userId,
          role: "owner",
        });

        return createdClass;
      });

      return toClassSummary({
        ...created,
        coachRole: "owner",
        memberCount: 0,
        coachCount: 1,
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        continue;
      }
      throw err;
    }
  }

  throw new ClassServiceError("ROUND1_CLASS_CODE_GENERATION_FAILED", "班级码生成失败", 503);
}

export async function updateClass(actor: ActorContext, classId: string, params: { name: string }) {
  const access = await getCoachAccess(actor, classId);
  assertOwner(access);

  const [updated] = await db
    .update(classes)
    .set({
      name: params.name,
      updatedAt: new Date(),
    })
    .where(eq(classes.id, classId))
    .returning({
      id: classes.id,
      name: classes.name,
      joinCode: classes.joinCode,
      archivedAt: classes.archivedAt,
      createdBy: classes.createdBy,
      createdAt: classes.createdAt,
      updatedAt: classes.updatedAt,
    });

  if (!updated) {
    throw new ClassServiceError("ROUND1_CLASS_NOT_FOUND", "班级不存在", 404);
  }

  return toClassSummary({ ...updated, coachRole: access.coachRole });
}

export async function archiveClass(actor: ActorContext, classId: string) {
  const access = await getCoachAccess(actor, classId);
  assertOwner(access);

  if (access.archivedAt) {
    const current = await getClassById(classId);
    return toClassSummary({ ...current, coachRole: access.coachRole });
  }

  const [updated] = await db
    .update(classes)
    .set({
      archivedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(classes.id, classId), isNull(classes.archivedAt)))
    .returning({
      id: classes.id,
      name: classes.name,
      joinCode: classes.joinCode,
      archivedAt: classes.archivedAt,
      createdBy: classes.createdBy,
      createdAt: classes.createdAt,
      updatedAt: classes.updatedAt,
    });

  if (!updated) {
    const current = await getClassById(classId);
    return toClassSummary({ ...current, coachRole: access.coachRole });
  }

  return toClassSummary({ ...updated, coachRole: access.coachRole });
}

export async function rotateClassJoinCode(actor: ActorContext, classId: string) {
  const access = await getCoachAccess(actor, classId);
  assertOwner(access);

  if (access.archivedAt) {
    throw new ClassServiceError("ROUND1_CLASS_ARCHIVED", "归档班级不能轮换班级码", 409);
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const joinCode = await generateUniqueJoinCode();
    try {
      const [updated] = await db
        .update(classes)
        .set({
          joinCode,
          updatedAt: new Date(),
        })
        .where(eq(classes.id, classId))
        .returning({
          id: classes.id,
          name: classes.name,
          joinCode: classes.joinCode,
          archivedAt: classes.archivedAt,
          createdBy: classes.createdBy,
          createdAt: classes.createdAt,
          updatedAt: classes.updatedAt,
        });

      if (!updated) {
        throw new ClassServiceError("ROUND1_CLASS_NOT_FOUND", "班级不存在", 404);
      }

      return toClassSummary({ ...updated, coachRole: access.coachRole });
    } catch (err) {
      if (isUniqueViolation(err)) {
        continue;
      }
      throw err;
    }
  }

  throw new ClassServiceError("ROUND1_CLASS_CODE_GENERATION_FAILED", "班级码生成失败", 503);
}

export async function listClassMembers(actor: ActorContext, classId: string) {
  await getCoachAccess(actor, classId);

  return db
    .select({
      classId: classMembers.classId,
      userId: classMembers.userId,
      username: users.username,
      displayName: users.displayName,
      role: users.role,
      joinedVia: classMembers.joinedVia,
      joinedAt: classMembers.joinedAt,
    })
    .from(classMembers)
    .innerJoin(users, eq(users.id, classMembers.userId))
    .where(eq(classMembers.classId, classId))
    .orderBy(asc(classMembers.joinedAt));
}

export async function removeClassMember(actor: ActorContext, classId: string, userId: string) {
  await ensureCanManageClass(actor, classId);

  const [removed] = await db
    .delete(classMembers)
    .where(and(eq(classMembers.classId, classId), eq(classMembers.userId, userId)))
    .returning({
      classId: classMembers.classId,
      userId: classMembers.userId,
      joinedVia: classMembers.joinedVia,
      joinedAt: classMembers.joinedAt,
    });

  if (!removed) {
    throw new ClassServiceError("ROUND1_CLASS_MEMBER_NOT_FOUND", "班级成员不存在", 404);
  }

  return removed;
}

export async function listClassInvites(actor: ActorContext, classId: string) {
  const access = await getCoachAccess(actor, classId);
  assertOwner(access);

  const rows = await db
    .select({
      id: classInvites.id,
      classId: classInvites.classId,
      expiresAt: classInvites.expiresAt,
      maxUses: classInvites.maxUses,
      useCount: classInvites.useCount,
      revokedAt: classInvites.revokedAt,
      createdAt: classInvites.createdAt,
    })
    .from(classInvites)
    .where(eq(classInvites.classId, classId))
    .orderBy(desc(classInvites.createdAt));

  return rows;
}

export async function createClassInvite(
  actor: ActorContext,
  classId: string,
  params: { expiresAt: string; maxUses: number },
) {
  const access = await getCoachAccess(actor, classId);
  assertOwner(access);

  if (access.archivedAt) {
    throw new ClassServiceError("ROUND1_CLASS_ARCHIVED", "归档班级不能创建邀请链接", 409);
  }

  const expiresAt = parseFutureDate(params.expiresAt, "expiresAt");
  if (expiresAt.getTime() <= Date.now()) {
    throw new ClassServiceError("ROUND1_CLASS_INVITE_EXPIRED", "邀请过期时间必须晚于当前时间", 422);
  }

  const token = createClassInviteToken();
  const [invite] = await db
    .insert(classInvites)
    .values({
      classId,
      tokenHash: hashClassInviteToken(token),
      expiresAt,
      maxUses: params.maxUses,
    })
    .returning({
      id: classInvites.id,
      classId: classInvites.classId,
      expiresAt: classInvites.expiresAt,
      maxUses: classInvites.maxUses,
      useCount: classInvites.useCount,
      revokedAt: classInvites.revokedAt,
      createdAt: classInvites.createdAt,
    });

  if (!invite) {
    throw new Error("Class invite insert returned no row");
  }

  return {
    ...invite,
    token,
    joinUrl: `${JOIN_URL_PATH}?invite=${token}`,
  };
}

export async function revokeClassInvite(actor: ActorContext, classId: string, inviteId: string) {
  const access = await getCoachAccess(actor, classId);
  assertOwner(access);

  const [revoked] = await db
    .update(classInvites)
    .set({ revokedAt: new Date() })
    .where(and(eq(classInvites.id, inviteId), eq(classInvites.classId, classId)))
    .returning({
      id: classInvites.id,
      classId: classInvites.classId,
      expiresAt: classInvites.expiresAt,
      maxUses: classInvites.maxUses,
      useCount: classInvites.useCount,
      revokedAt: classInvites.revokedAt,
      createdAt: classInvites.createdAt,
    });

  if (!revoked) {
    throw new ClassServiceError("ROUND1_CLASS_INVITE_NOT_FOUND", "邀请链接不存在", 404);
  }

  return revoked;
}

async function currentMembership(classId: string, userId: string) {
  const [membership] = await db
    .select({
      classId: classMembers.classId,
      userId: classMembers.userId,
      joinedVia: classMembers.joinedVia,
      joinedAt: classMembers.joinedAt,
      username: users.username,
      displayName: users.displayName,
      role: users.role,
    })
    .from(classMembers)
    .innerJoin(users, eq(users.id, classMembers.userId))
    .where(and(eq(classMembers.classId, classId), eq(classMembers.userId, userId)))
    .limit(1);

  return membership;
}

export async function joinClass(
  actor: ActorContext,
  params: { code?: string; inviteToken?: string },
) {
  if (params.code) {
    return joinClassByCode(actor.userId, params.code);
  }

  if (params.inviteToken) {
    return joinClassByInvite(actor.userId, params.inviteToken);
  }

  throw new ClassServiceError("ROUND1_VALIDATION_ERROR", "必须提供班级码或邀请 token", 400);
}

async function joinClassByCode(userId: string, rawCode: string) {
  const joinCode = normalizeJoinCode(rawCode);
  const [classRow] = await db
    .select({
      id: classes.id,
      archivedAt: classes.archivedAt,
    })
    .from(classes)
    .where(eq(classes.joinCode, joinCode))
    .limit(1);

  if (!classRow) {
    throw new ClassServiceError("ROUND1_CLASS_JOIN_NOT_FOUND", "班级码无效", 404);
  }

  const existing = await currentMembership(classRow.id, userId);
  if (existing) {
    return existing;
  }

  if (classRow.archivedAt) {
    throw new ClassServiceError("ROUND1_CLASS_ARCHIVED", "归档班级不能加入", 409);
  }

  const [inserted] = await db
    .insert(classMembers)
    .values({
      classId: classRow.id,
      userId,
      joinedVia: "code",
    })
    .onConflictDoNothing()
    .returning({
      classId: classMembers.classId,
      userId: classMembers.userId,
      joinedVia: classMembers.joinedVia,
      joinedAt: classMembers.joinedAt,
    });

  const membership = inserted
    ? await currentMembership(inserted.classId, inserted.userId)
    : await currentMembership(classRow.id, userId);

  if (!membership) {
    throw new Error("Class membership insert returned no row");
  }

  return membership;
}

async function joinClassByInvite(userId: string, token: string) {
  const tokenHash = hashClassInviteToken(token);
  const [invite] = await db
    .select({
      id: classInvites.id,
      classId: classInvites.classId,
      expiresAt: classInvites.expiresAt,
      maxUses: classInvites.maxUses,
      useCount: classInvites.useCount,
      revokedAt: classInvites.revokedAt,
      classArchivedAt: classes.archivedAt,
    })
    .from(classInvites)
    .innerJoin(classes, eq(classes.id, classInvites.classId))
    .where(eq(classInvites.tokenHash, tokenHash))
    .limit(1);

  if (!invite) {
    throw new ClassServiceError("ROUND1_CLASS_INVITE_NOT_FOUND", "邀请链接无效", 404);
  }

  const existing = await currentMembership(invite.classId, userId);
  if (existing) {
    return existing;
  }

  if (invite.classArchivedAt) {
    throw new ClassServiceError("ROUND1_CLASS_ARCHIVED", "归档班级不能加入", 409);
  }

  if (invite.revokedAt) {
    throw new ClassServiceError("ROUND1_CLASS_INVITE_REVOKED", "邀请链接已撤销", 410);
  }

  if (invite.expiresAt.getTime() <= Date.now()) {
    throw new ClassServiceError("ROUND1_CLASS_INVITE_EXPIRED", "邀请链接已过期", 410);
  }

  if (invite.useCount >= invite.maxUses) {
    throw new ClassServiceError("ROUND1_CLASS_INVITE_EXHAUSTED", "邀请链接使用次数已达上限", 410);
  }

  await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(classMembers)
      .values({
        classId: invite.classId,
        userId,
        joinedVia: "invite_link",
      })
      .onConflictDoNothing()
      .returning({
        classId: classMembers.classId,
        userId: classMembers.userId,
      });

    if (!inserted) {
      return;
    }

    const [consumed] = await tx
      .update(classInvites)
      .set({
        useCount: sql`${classInvites.useCount} + 1`,
      })
      .where(
        and(
          eq(classInvites.id, invite.id),
          isNull(classInvites.revokedAt),
          gt(classInvites.expiresAt, new Date()),
          sql`${classInvites.useCount} < ${classInvites.maxUses}`,
          sql`exists (
            select 1 from ${classes}
            where ${classes.id} = ${classInvites.classId}
            and ${classes.archivedAt} is null
          )`,
        ),
      )
      .returning({
        classId: classInvites.classId,
      });

    if (!consumed) {
      throw new ClassServiceError("ROUND1_CLASS_INVITE_UNAVAILABLE", "邀请链接当前不可用", 409);
    }
  });

  const membership = await currentMembership(invite.classId, userId);

  if (!membership) {
    throw new Error("Class membership insert returned no row");
  }

  return membership;
}

export async function listClassCoaches(
  actor: ActorContext,
  classId: string,
  adminOverride = false,
) {
  if (adminOverride && actor.role === "admin") {
    await assertAdminClassExists(classId);
  } else {
    await getCoachAccess(actor, classId);
  }

  return db
    .select({
      classId: classCoaches.classId,
      userId: classCoaches.userId,
      username: users.username,
      displayName: users.displayName,
      userRole: users.role,
      coachRole: classCoaches.role,
      addedAt: classCoaches.addedAt,
    })
    .from(classCoaches)
    .innerJoin(users, eq(users.id, classCoaches.userId))
    .where(eq(classCoaches.classId, classId))
    .orderBy(desc(classCoaches.role), asc(classCoaches.addedAt));
}

export async function addClassCoach(
  actor: ActorContext,
  classId: string,
  targetUserId: string,
  adminOverride = false,
) {
  await ensureCanManageClass(actor, classId, adminOverride);
  await assertCoachableUser(targetUserId);

  const [inserted] = await db
    .insert(classCoaches)
    .values({
      classId,
      userId: targetUserId,
      role: "collaborator",
    })
    .onConflictDoNothing()
    .returning({
      classId: classCoaches.classId,
      userId: classCoaches.userId,
      coachRole: classCoaches.role,
      addedAt: classCoaches.addedAt,
    });

  const coaches = await listClassCoaches(actor, classId, adminOverride);
  const coach = coaches.find((item) => item.userId === (inserted?.userId ?? targetUserId));
  if (!coach) {
    throw new Error("Class coach insert returned no row");
  }
  return coach;
}

export async function removeClassCoach(
  actor: ActorContext,
  classId: string,
  targetUserId: string,
  adminOverride = false,
) {
  await ensureCanManageClass(actor, classId, adminOverride);

  const coaches = await listClassCoaches(actor, classId, adminOverride);
  const target = coaches.find((coach) => coach.userId === targetUserId);
  if (!target) {
    throw new ClassServiceError("ROUND1_CLASS_COACH_NOT_FOUND", "班级教练不存在", 404);
  }

  if (target.coachRole === "owner") {
    const ownerCount = coaches.filter((coach) => coach.coachRole === "owner").length;
    if (ownerCount <= 1) {
      throw new ClassServiceError("ROUND1_CLASS_OWNER_REQUIRED", "班级至少需要一位 owner", 409);
    }
  }

  await db
    .delete(classCoaches)
    .where(and(eq(classCoaches.classId, classId), eq(classCoaches.userId, targetUserId)));

  return target;
}

export async function transferClassOwner(
  actor: ActorContext,
  classId: string,
  targetUserId: string,
  adminOverride = false,
) {
  await ensureCanManageClass(actor, classId, adminOverride);
  await assertCoachableUser(targetUserId);

  return db.transaction(async (tx) => {
    const [target] = await tx
      .select({
        classId: classCoaches.classId,
        userId: classCoaches.userId,
        role: classCoaches.role,
      })
      .from(classCoaches)
      .where(and(eq(classCoaches.classId, classId), eq(classCoaches.userId, targetUserId)))
      .limit(1);

    if (!target) {
      throw new ClassServiceError("ROUND1_CLASS_COACH_NOT_FOUND", "目标用户不是该班级教练", 404);
    }

    await tx
      .update(classCoaches)
      .set({ role: "collaborator" })
      .where(and(eq(classCoaches.classId, classId), eq(classCoaches.role, "owner")));

    await tx
      .update(classCoaches)
      .set({ role: "owner" })
      .where(and(eq(classCoaches.classId, classId), eq(classCoaches.userId, targetUserId)));

    const [owner] = await tx
      .select({
        classId: classCoaches.classId,
        userId: classCoaches.userId,
        username: users.username,
        displayName: users.displayName,
        userRole: users.role,
        coachRole: classCoaches.role,
        addedAt: classCoaches.addedAt,
      })
      .from(classCoaches)
      .innerJoin(users, eq(users.id, classCoaches.userId))
      .where(and(eq(classCoaches.classId, classId), eq(classCoaches.userId, targetUserId)))
      .limit(1);

    if (!owner) {
      throw new Error("Owner transfer returned no row");
    }

    return owner;
  });
}

export async function createAssignment(actor: ActorContext, params: AssignmentCreateBody) {
  const access = await getCoachAccess(actor, params.classId);
  if (access.archivedAt) {
    throw new ClassServiceError("ROUND1_CLASS_ARCHIVED", "归档班级不能布置任务", 409);
  }

  const dueAt = parseFutureDate(params.dueAt, "dueAt");
  assertFutureDueAt(dueAt);

  const [paper] = await db
    .select({
      id: prebuiltPapers.id,
      examType: prebuiltPapers.examType,
      difficulty: prebuiltPapers.difficulty,
      blueprintVersion: prebuiltPapers.blueprintVersion,
      status: prebuiltPapers.status,
    })
    .from(prebuiltPapers)
    .where(and(eq(prebuiltPapers.id, params.prebuiltPaperId), simulatedPrebuiltPaperPredicate()))
    .limit(1);

  if (!paper || paper.status !== "published") {
    throw new ClassServiceError(
      "ROUND1_PREBUILT_PAPER_UNAVAILABLE",
      "任务只能绑定已发布预制卷",
      422,
    );
  }

  return db.transaction(async (tx) => {
    const [assignment] = await tx
      .insert(assignments)
      .values({
        classId: params.classId,
        createdBy: actor.userId,
        title: params.title,
        mode: "timed",
        prebuiltPaperId: paper.id,
        examType: paper.examType,
        blueprintVersion: paper.blueprintVersion,
        dueAt,
        status: "assigned",
      })
      .returning({
        id: assignments.id,
        classId: assignments.classId,
        createdBy: assignments.createdBy,
        title: assignments.title,
        mode: assignments.mode,
        prebuiltPaperId: assignments.prebuiltPaperId,
        examType: assignments.examType,
        blueprintVersion: assignments.blueprintVersion,
        dueAt: assignments.dueAt,
        status: assignments.status,
        createdAt: assignments.createdAt,
        updatedAt: assignments.updatedAt,
      });

    if (!assignment) {
      throw new Error("Assignment insert returned no row");
    }

    const students = await tx
      .select({
        userId: classMembers.userId,
      })
      .from(classMembers)
      .innerJoin(users, eq(users.id, classMembers.userId))
      .where(
        and(
          eq(classMembers.classId, params.classId),
          eq(users.role, "student"),
          eq(users.status, "active"),
        ),
      );

    if (students.length > 0) {
      await tx
        .insert(assignmentProgress)
        .values(
          students.map((student) => ({
            assignmentId: assignment.id,
            userId: student.userId,
            status: "pending",
          })),
        )
        .onConflictDoNothing();
    }

    return {
      ...assignment,
      difficulty: paper.difficulty as "easy" | "medium" | "hard",
      assignedStudents: students.length,
    };
  });
}

export async function listClassAssignments(actor: ActorContext, classId: string) {
  await getCoachAccess(actor, classId);

  return db
    .select({
      id: assignments.id,
      classId: assignments.classId,
      createdBy: assignments.createdBy,
      title: assignments.title,
      mode: assignments.mode,
      prebuiltPaperId: assignments.prebuiltPaperId,
      examType: assignments.examType,
      difficulty: prebuiltPapers.difficulty,
      blueprintVersion: assignments.blueprintVersion,
      dueAt: assignments.dueAt,
      status: assignments.status,
      createdAt: assignments.createdAt,
      updatedAt: assignments.updatedAt,
      assignedStudents: sql<number>`(
        select count(*)::int from assignment_progress ap where ap.assignment_id = ${assignments.id}
      )`,
    })
    .from(assignments)
    .leftJoin(prebuiltPapers, eq(prebuiltPapers.id, assignments.prebuiltPaperId))
    .where(eq(assignments.classId, classId))
    .orderBy(desc(assignments.createdAt));
}

export async function updateAssignment(
  actor: ActorContext,
  assignmentId: string,
  params: AssignmentUpdateBody,
) {
  const [assignment] = await db
    .select({
      id: assignments.id,
      classId: assignments.classId,
      status: assignments.status,
    })
    .from(assignments)
    .where(eq(assignments.id, assignmentId))
    .limit(1);

  if (!assignment) {
    throw new ClassServiceError("ROUND1_ASSIGNMENT_NOT_FOUND", "任务不存在", 404);
  }

  await getCoachAccess(actor, assignment.classId);

  if (assignment.status !== "assigned") {
    throw new ClassServiceError("ROUND1_ASSIGNMENT_CLOSED", "已关闭任务不能编辑", 409);
  }

  const dueAt = params.dueAt ? parseFutureDate(params.dueAt, "dueAt") : undefined;
  if (dueAt) {
    assertFutureDueAt(dueAt);
  }

  const [updated] = await db
    .update(assignments)
    .set({
      ...(params.title ? { title: params.title } : {}),
      ...(dueAt ? { dueAt } : {}),
      updatedAt: new Date(),
    })
    .where(eq(assignments.id, assignmentId))
    .returning({
      id: assignments.id,
      classId: assignments.classId,
      createdBy: assignments.createdBy,
      title: assignments.title,
      mode: assignments.mode,
      prebuiltPaperId: assignments.prebuiltPaperId,
      examType: assignments.examType,
      blueprintVersion: assignments.blueprintVersion,
      dueAt: assignments.dueAt,
      status: assignments.status,
      createdAt: assignments.createdAt,
      updatedAt: assignments.updatedAt,
    });

  if (!updated) {
    throw new ClassServiceError("ROUND1_ASSIGNMENT_NOT_FOUND", "任务不存在", 404);
  }

  return updated;
}

export async function closeAssignment(actor: ActorContext, assignmentId: string) {
  const [assignment] = await db
    .select({
      id: assignments.id,
      classId: assignments.classId,
    })
    .from(assignments)
    .where(eq(assignments.id, assignmentId))
    .limit(1);

  if (!assignment) {
    throw new ClassServiceError("ROUND1_ASSIGNMENT_NOT_FOUND", "任务不存在", 404);
  }

  await getCoachAccess(actor, assignment.classId);

  const [updated] = await db
    .update(assignments)
    .set({
      status: "closed",
      updatedAt: new Date(),
    })
    .where(and(eq(assignments.id, assignmentId), eq(assignments.status, "assigned")))
    .returning({
      id: assignments.id,
      classId: assignments.classId,
      createdBy: assignments.createdBy,
      title: assignments.title,
      mode: assignments.mode,
      prebuiltPaperId: assignments.prebuiltPaperId,
      examType: assignments.examType,
      blueprintVersion: assignments.blueprintVersion,
      dueAt: assignments.dueAt,
      status: assignments.status,
      createdAt: assignments.createdAt,
      updatedAt: assignments.updatedAt,
    });

  if (!updated) {
    const [current] = await db
      .select({
        id: assignments.id,
        classId: assignments.classId,
        createdBy: assignments.createdBy,
        title: assignments.title,
        mode: assignments.mode,
        prebuiltPaperId: assignments.prebuiltPaperId,
        examType: assignments.examType,
        blueprintVersion: assignments.blueprintVersion,
        dueAt: assignments.dueAt,
        status: assignments.status,
        createdAt: assignments.createdAt,
        updatedAt: assignments.updatedAt,
      })
      .from(assignments)
      .where(eq(assignments.id, assignmentId))
      .limit(1);

    if (!current) {
      throw new ClassServiceError("ROUND1_ASSIGNMENT_NOT_FOUND", "任务不存在", 404);
    }

    return current;
  }

  return updated;
}

export async function getAssignmentDetail(actor: ActorContext, assignmentId: string) {
  const [assignment] = await db
    .select({
      id: assignments.id,
      classId: assignments.classId,
      createdBy: assignments.createdBy,
      title: assignments.title,
      mode: assignments.mode,
      prebuiltPaperId: assignments.prebuiltPaperId,
      examType: assignments.examType,
      difficulty: prebuiltPapers.difficulty,
      blueprintVersion: assignments.blueprintVersion,
      dueAt: assignments.dueAt,
      status: assignments.status,
      createdAt: assignments.createdAt,
      updatedAt: assignments.updatedAt,
    })
    .from(assignments)
    .leftJoin(prebuiltPapers, eq(prebuiltPapers.id, assignments.prebuiltPaperId))
    .where(eq(assignments.id, assignmentId))
    .limit(1);

  if (!assignment) {
    throw new ClassServiceError("ROUND1_ASSIGNMENT_NOT_FOUND", "任务不存在", 404);
  }

  await getCoachAccess(actor, assignment.classId);

  const progress = await db
    .select({
      userId: assignmentProgress.userId,
      username: users.username,
      displayName: users.displayName,
      status: assignmentProgress.status,
      paperId: assignmentProgress.paperId,
      attemptId: assignmentProgress.attemptId,
      score: attempts.score,
      submittedAt: attempts.submittedAt,
    })
    .from(assignmentProgress)
    .innerJoin(users, eq(users.id, assignmentProgress.userId))
    .leftJoin(attempts, eq(attempts.id, assignmentProgress.attemptId))
    .where(and(eq(assignmentProgress.assignmentId, assignmentId), eq(users.role, "student")));

  return {
    ...assignment,
    progress,
  };
}

export async function getClassReport(actor: ActorContext, classId: string) {
  await getCoachAccess(actor, classId);

  const rows = await db
    .select({
      assignmentId: assignments.id,
      title: assignments.title,
      assignmentStatus: assignments.status,
      dueAt: assignments.dueAt,
      userId: assignmentProgress.userId,
      username: users.username,
      displayName: users.displayName,
      progressStatus: assignmentProgress.status,
      score: attempts.score,
      submittedAt: attempts.submittedAt,
      perSectionJson: attempts.perSectionJson,
      perPrimaryKpJson: attempts.perPrimaryKpJson,
    })
    .from(assignments)
    .innerJoin(assignmentProgress, eq(assignmentProgress.assignmentId, assignments.id))
    .innerJoin(users, and(eq(users.id, assignmentProgress.userId), eq(users.role, "student")))
    .leftJoin(attempts, eq(attempts.id, assignmentProgress.attemptId))
    .where(eq(assignments.classId, classId));

  const assignmentMap = new Map<
    string,
    {
      assignmentId: string;
      title: string;
      status: string;
      dueAt: Date | null;
      completed: number;
      missed: number;
      scoreSum: number;
      scored: number;
    }
  >();
  const totals = {
    students: new Set<string>(),
    pending: 0,
    inProgress: 0,
    completed: 0,
    missed: 0,
    scoreSum: 0,
    scored: 0,
  };
  const studentMap = new Map<string, StudentReportSummary>();
  const kpStats = new Map<string, NumericSummary>();
  const questionTypeStats = new Map<string, QuestionTypeSummary>();

  for (const row of rows) {
    totals.students.add(row.userId);
    if (row.progressStatus === "pending") totals.pending += 1;
    if (row.progressStatus === "in_progress") totals.inProgress += 1;
    if (row.progressStatus === "completed") totals.completed += 1;
    if (row.progressStatus === "missed") totals.missed += 1;
    if (typeof row.score === "number") {
      totals.scoreSum += row.score;
      totals.scored += 1;
    }

    const summary = assignmentMap.get(row.assignmentId) ?? {
      assignmentId: row.assignmentId,
      title: row.title,
      status: row.assignmentStatus,
      dueAt: row.dueAt,
      completed: 0,
      missed: 0,
      scoreSum: 0,
      scored: 0,
    };

    if (row.progressStatus === "completed") summary.completed += 1;
    if (row.progressStatus === "missed") summary.missed += 1;
    if (typeof row.score === "number") {
      summary.scoreSum += row.score;
      summary.scored += 1;
    }

    assignmentMap.set(row.assignmentId, summary);

    const student = studentMap.get(row.userId) ?? {
      userId: row.userId,
      username: row.username,
      displayName: row.displayName,
      pending: 0,
      inProgress: 0,
      completed: 0,
      missed: 0,
      scoreSum: 0,
      scored: 0,
      latestSubmittedAt: null,
      kpStats: new Map<string, NumericSummary>(),
      questionTypeStats: new Map<string, QuestionTypeSummary>(),
      trend: [],
    };

    if (row.progressStatus === "pending") student.pending += 1;
    if (row.progressStatus === "in_progress") student.inProgress += 1;
    if (row.progressStatus === "completed") student.completed += 1;
    if (row.progressStatus === "missed") student.missed += 1;
    if (typeof row.score === "number") {
      student.scoreSum += row.score;
      student.scored += 1;
    }
    if (
      row.submittedAt &&
      (!student.latestSubmittedAt ||
        row.submittedAt.getTime() > student.latestSubmittedAt.getTime())
    ) {
      student.latestSubmittedAt = row.submittedAt;
    }

    mergeKpStats(student.kpStats, row.perPrimaryKpJson);
    mergeKpStats(kpStats, row.perPrimaryKpJson);
    mergeQuestionTypeStats(student.questionTypeStats, row.perSectionJson);
    mergeQuestionTypeStats(questionTypeStats, row.perSectionJson);
    student.trend.push({
      assignmentId: row.assignmentId,
      title: row.title,
      status: row.assignmentStatus,
      dueAt: row.dueAt,
      progressStatus: row.progressStatus,
      score: typeof row.score === "number" ? row.score : null,
      submittedAt: row.submittedAt ?? null,
    });

    studentMap.set(row.userId, student);
  }

  const sortedKpIds = Array.from(kpStats.keys()).sort(sortKpIds);
  const students = Array.from(studentMap.values())
    .sort((left, right) => left.displayName.localeCompare(right.displayName, "zh-CN"))
    .map((student) => ({
      userId: student.userId,
      username: student.username,
      displayName: student.displayName,
      pending: student.pending,
      inProgress: student.inProgress,
      completed: student.completed,
      missed: student.missed,
      averageScore: student.scored === 0 ? 0 : student.scoreSum / student.scored,
      latestSubmittedAt: student.latestSubmittedAt,
      kpStats: Array.from(student.kpStats.entries())
        .sort(([left], [right]) => sortKpIds(left, right))
        .map(([kpId, summary]) => ({
          kpId,
          total: summary.total,
          correct: summary.correct,
          accuracy: toAccuracy(summary),
        })),
      questionTypeStats: Array.from(student.questionTypeStats.entries()).map(
        ([questionType, summary]) => ({
          questionType,
          total: summary.total,
          correct: summary.correct,
          score: summary.score,
          maxScore: summary.maxScore,
          accuracy: toQuestionTypeAccuracy(summary),
        }),
      ),
      trend: student.trend
        .sort((left, right) => sortNullableDates(left.dueAt, right.dueAt))
        .map((entry) => ({
          assignmentId: entry.assignmentId,
          title: entry.title,
          status: entry.status,
          dueAt: entry.dueAt,
          progressStatus: entry.progressStatus,
          score: entry.score,
          submittedAt: entry.submittedAt,
        })),
    }));

  return {
    classId,
    totals: {
      students: totals.students.size,
      pending: totals.pending,
      inProgress: totals.inProgress,
      completed: totals.completed,
      missed: totals.missed,
      averageScore: totals.scored === 0 ? 0 : totals.scoreSum / totals.scored,
    },
    assignments: Array.from(assignmentMap.values()).map((assignment) => ({
      assignmentId: assignment.assignmentId,
      title: assignment.title,
      status: assignment.status,
      dueAt: assignment.dueAt,
      completed: assignment.completed,
      missed: assignment.missed,
      averageScore: assignment.scored === 0 ? 0 : assignment.scoreSum / assignment.scored,
    })),
    heatmap: {
      knowledgePointIds: sortedKpIds,
      students: students.map((student) => ({
        userId: student.userId,
        displayName: student.displayName,
        values: sortedKpIds.map((kpId) => {
          const summary = student.kpStats.find((item) => item.kpId === kpId) ?? {
            kpId,
            total: 0,
            correct: 0,
            accuracy: 0,
          };
          return summary;
        }),
      })),
    },
    questionTypeStats: Array.from(questionTypeStats.entries()).map(([questionType, summary]) => ({
      questionType,
      total: summary.total,
      correct: summary.correct,
      score: summary.score,
      maxScore: summary.maxScore,
      accuracy: toQuestionTypeAccuracy(summary),
    })),
    students,
  };
}

export async function resolveAssignmentPrebuiltPaper(userId: string, assignmentId: string) {
  const [row] = await db
    .select({
      assignmentId: assignments.id,
      classId: assignments.classId,
      assignmentStatus: assignments.status,
      dueAt: assignments.dueAt,
      prebuiltPaperId: assignments.prebuiltPaperId,
      examType: assignments.examType,
      blueprintVersion: assignments.blueprintVersion,
      paperStatus: prebuiltPapers.status,
      paperDifficulty: prebuiltPapers.difficulty,
      progressStatus: assignmentProgress.status,
      progressPaperId: assignmentProgress.paperId,
    })
    .from(assignments)
    .innerJoin(
      classMembers,
      and(eq(classMembers.classId, assignments.classId), eq(classMembers.userId, userId)),
    )
    .leftJoin(
      assignmentProgress,
      and(
        eq(assignmentProgress.assignmentId, assignments.id),
        eq(assignmentProgress.userId, userId),
      ),
    )
    .leftJoin(prebuiltPapers, eq(prebuiltPapers.id, assignments.prebuiltPaperId))
    .where(eq(assignments.id, assignmentId))
    .limit(1);

  if (!row) {
    throw new ClassServiceError("ROUND1_ASSIGNMENT_NOT_FOUND", "任务不存在或无权访问", 404);
  }

  if (row.assignmentStatus !== "assigned") {
    throw new ClassServiceError("ROUND1_ASSIGNMENT_CLOSED", "任务已关闭", 409);
  }

  if (row.dueAt && row.dueAt.getTime() <= Date.now()) {
    throw new ClassServiceError("ROUND1_ASSIGNMENT_CLOSED", "任务已截止", 409);
  }

  if (!row.prebuiltPaperId || row.paperStatus !== "published" || !row.paperDifficulty) {
    throw new ClassServiceError("ROUND1_PREBUILT_PAPER_UNAVAILABLE", "任务绑定的预制卷不可用", 503);
  }

  if (row.progressStatus === "completed" || row.progressStatus === "missed") {
    throw new ClassServiceError("ROUND1_ASSIGNMENT_ATTEMPT_FINALIZED", "该任务已完成或错过", 409);
  }

  if (!row.progressStatus) {
    await db
      .insert(assignmentProgress)
      .values({
        assignmentId,
        userId,
        status: "pending",
      })
      .onConflictDoNothing();
  }

  return {
    assignmentId: row.assignmentId,
    prebuiltPaperId: row.prebuiltPaperId,
    examType: row.examType,
    difficulty: row.paperDifficulty,
    blueprintVersion: row.blueprintVersion,
    existingPaperId: row.progressPaperId,
  };
}

export async function findExistingAssignmentPaper(userId: string, paperId: string) {
  const [paper] = await db
    .select({
      id: papers.id,
      prebuiltPaperId: papers.prebuiltPaperId,
      examType: papers.examType,
      difficulty: papers.difficulty,
      status: papers.status,
    })
    .from(papers)
    .where(and(eq(papers.id, paperId), eq(papers.userId, userId), ne(papers.status, "abandoned")))
    .limit(1);

  return paper;
}
