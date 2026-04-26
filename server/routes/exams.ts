import { randomUUID } from "node:crypto";
import { Router, type Request, type Response, type NextFunction } from "express";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "../db.js";
import {
  assignmentProgress,
  attempts,
  papers,
  paperQuestionSlots,
  prebuiltPapers,
  prebuiltPaperSlots,
  assignments,
  questions,
} from "../db/schema/index.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  computeAttemptSubmitAt,
  scheduleAttemptAutoSubmit,
} from "../services/examAutoSubmitQueue.js";
import { finalizeAttempt } from "../services/attemptFinalizer.js";
import { buildAttemptResultItems } from "../services/grader.js";
import { consumeAutosaveRateLimit } from "../services/autosaveRateLimit.js";
import { getRuntimeNumberSetting } from "../services/runtimeConfigService.js";
import {
  AutosaveAttemptBodySchema,
  CreateExamDraftBodySchema,
  StartAttemptBodySchema,
  SubmitAttemptBodySchema,
} from "./schemas/exams.schema.js";

export const examsRouter = Router();

class StartAttemptConflictError extends Error {
  constructor() {
    super("Start attempt CAS transition failed");
    this.name = "StartAttemptConflictError";
  }
}

type CreateExamDraftBody = {
  examType: string;
  difficulty: "easy" | "medium" | "hard";
  assignmentId?: string;
};

type AutosaveAttemptBody = {
  patches: AutosaveAnswerPatch[];
};

type SubmitAttemptBody = {
  patches?: AutosaveAnswerPatch[];
};

type AutosaveAnswerPatch = {
  slotNo: number;
  subKey: string;
  value: string;
  updatedAt?: string;
};

type DraftPaperSummary = {
  id: string;
  prebuiltPaperId: string | null;
  examType: string;
  difficulty: string | null;
  status: string;
};

function parsePositiveInt(value: unknown, defaultValue: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return defaultValue;
  }

  return Math.trunc(parsed);
}

function normalizeNullableRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  return normalizeNullableRecord(value) ?? {};
}

function buildAnswersJsonPatchExpression(patches: AutosaveAnswerPatch[]) {
  let expression = sql`coalesce(${attempts.answersJson}, '{}'::jsonb)`;

  for (const patch of patches) {
    const slotKey = String(patch.slotNo);
    const updatedAt = patch.updatedAt ?? new Date().toISOString();

    expression = sql`jsonb_set(${expression}, array[${slotKey}]::text[], coalesce(${expression}->${slotKey}, '{}'::jsonb), true)`;
    expression = sql`jsonb_set(${expression}, array[${slotKey}, 'subAnswers']::text[], coalesce(${expression}->${slotKey}->'subAnswers', '{}'::jsonb), true)`;
    expression = sql`jsonb_set(${expression}, array[${slotKey}, 'subAnswers', ${patch.subKey}]::text[], to_jsonb(${patch.value}::text), true)`;
    expression = sql`jsonb_set(${expression}, array[${slotKey}, 'updatedAt']::text[], to_jsonb(${updatedAt}::text), true)`;
  }

  return expression;
}

function normalizeStatsRecord(
  value: unknown,
): Record<string, { total: number; correct: number; accuracy: number }> {
  return normalizeRecord(value) as Record<
    string,
    { total: number; correct: number; accuracy: number }
  >;
}

async function findExistingDraft(
  userId: string,
  body: CreateExamDraftBody,
): Promise<DraftPaperSummary | undefined> {
  const assignmentCondition = body.assignmentId
    ? eq(papers.assignmentId, body.assignmentId)
    : isNull(papers.assignmentId);

  const [draft] = await db
    .select({
      id: papers.id,
      prebuiltPaperId: papers.prebuiltPaperId,
      examType: papers.examType,
      difficulty: papers.difficulty,
      status: papers.status,
    })
    .from(papers)
    .where(
      and(
        eq(papers.userId, userId),
        eq(papers.status, "draft"),
        eq(papers.examType, body.examType),
        eq(papers.difficulty, body.difficulty),
        assignmentCondition,
      ),
    )
    .orderBy(desc(papers.createdAt))
    .limit(1);

  return draft;
}

async function selectPublishedPrebuiltPaper(userId: string, examType: string, difficulty: string) {
  const recentExcludeAttempts = getRuntimeNumberSetting(
    "paper.selection.recentExcludeAttempts",
    3,
  );
  const recentRows =
    recentExcludeAttempts > 0
      ? await db
          .select({
            prebuiltPaperId: papers.prebuiltPaperId,
          })
          .from(attempts)
          .innerJoin(papers, eq(attempts.paperId, papers.id))
          .where(
            and(
              eq(attempts.userId, userId),
              eq(papers.examType, examType),
              eq(papers.difficulty, difficulty),
              or(eq(attempts.status, "submitted"), eq(attempts.status, "auto_submitted")),
            ),
          )
          .orderBy(desc(attempts.submittedAt))
          .limit(recentExcludeAttempts)
      : [];
  const recentPrebuiltPaperIds = new Set(
    recentRows
      .map((row) => row.prebuiltPaperId)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  );

  const candidates = await db
    .select({
      id: prebuiltPapers.id,
      examType: prebuiltPapers.examType,
      difficulty: prebuiltPapers.difficulty,
      blueprintVersion: prebuiltPapers.blueprintVersion,
    })
    .from(prebuiltPapers)
    .where(
      and(
        eq(prebuiltPapers.status, "published"),
        eq(prebuiltPapers.examType, examType),
        eq(prebuiltPapers.difficulty, difficulty),
      ),
    )
    .orderBy(desc(prebuiltPapers.publishedAt), desc(prebuiltPapers.createdAt));

  return candidates.find((candidate) => !recentPrebuiltPaperIds.has(candidate.id)) ?? candidates[0];
}

examsRouter.get(
  "/exams/catalog",
  requireAuth,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const rows = await db
        .select({
          examType: prebuiltPapers.examType,
          difficulty: prebuiltPapers.difficulty,
        })
        .from(prebuiltPapers)
        .where(eq(prebuiltPapers.status, "published"))
        .orderBy(prebuiltPapers.examType, prebuiltPapers.difficulty);

      const counter = new Map<string, { examType: string; difficulty: string; count: number }>();
      for (const row of rows) {
        const key = `${row.examType}:${row.difficulty}`;
        const current = counter.get(key);
        if (current) {
          current.count += 1;
          continue;
        }
        counter.set(key, {
          examType: row.examType,
          difficulty: row.difficulty,
          count: 1,
        });
      }

      res.ok({ items: Array.from(counter.values()) });
    } catch (err) {
      next(err);
    }
  },
);

examsRouter.get(
  "/exams/active-draft",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const [draft] = await db
        .select({
          id: papers.id,
          prebuiltPaperId: papers.prebuiltPaperId,
          examType: papers.examType,
          difficulty: papers.difficulty,
          status: papers.status,
        })
        .from(papers)
        .where(and(eq(papers.userId, req.session.userId!), eq(papers.status, "draft")))
        .orderBy(desc(papers.createdAt))
        .limit(1);

      res.ok(draft ?? null);
    } catch (err) {
      next(err);
    }
  },
);

examsRouter.post(
  "/exams",
  requireAuth,
  validate(CreateExamDraftBodySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.session.userId!;
      const body = req.body as CreateExamDraftBody;
      const existingDraft = await findExistingDraft(userId, body);

      if (existingDraft) {
        res.ok(existingDraft);
        return;
      }

      const selected = await selectPublishedPrebuiltPaper(userId, body.examType, body.difficulty);
      if (!selected) {
        res.fail("ROUND1_PREBUILT_PAPER_UNAVAILABLE", "当前难度无可用预制卷", 503);
        return;
      }

      const createdDraft = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(papers)
          .values({
            userId,
            assignmentId: body.assignmentId,
            prebuiltPaperId: selected.id,
            examType: selected.examType,
            blueprintVersion: selected.blueprintVersion,
            seed: randomUUID(),
            difficulty: selected.difficulty,
            createdFrom: body.assignmentId ? "assignment" : "self_practice",
            status: "draft",
          })
          .returning({
            id: papers.id,
            prebuiltPaperId: papers.prebuiltPaperId,
            examType: papers.examType,
            difficulty: papers.difficulty,
            status: papers.status,
            blueprintVersion: papers.blueprintVersion,
          });

        if (!created) {
          throw new Error("Failed to create draft paper");
        }

        const slots = await tx
          .select({
            slotNo: prebuiltPaperSlots.slotNo,
            questionId: prebuiltPaperSlots.questionId,
            questionType: prebuiltPaperSlots.questionType,
            primaryKpId: prebuiltPaperSlots.primaryKpId,
            difficulty: prebuiltPaperSlots.difficulty,
            points: prebuiltPaperSlots.points,
          })
          .from(prebuiltPaperSlots)
          .where(eq(prebuiltPaperSlots.prebuiltPaperId, selected.id))
          .orderBy(prebuiltPaperSlots.slotNo);

        if (slots.length > 0) {
          await tx.insert(paperQuestionSlots).values(
            slots.map((slot) => ({
              paperId: created.id,
              slotNo: slot.slotNo,
              questionType: slot.questionType,
              primaryKpId: slot.primaryKpId,
              difficulty: slot.difficulty,
              points: slot.points,
              currentQuestionId: slot.questionId,
            })),
          );
        }

        return created;
      });

      res.ok(createdDraft, 201);
    } catch (err) {
      next(err);
    }
  },
);

examsRouter.post(
  "/exams/:id/attempts",
  requireAuth,
  validate(StartAttemptBodySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.session.userId!;
      if (typeof req.params.id !== "string" || req.params.id.length === 0) {
        res.fail("ROUND1_VALIDATION_ERROR", "缺少试卷 ID", 400);
        return;
      }

      const paperId = req.params.id;

      const [paper] = await db
        .select({
          id: papers.id,
          userId: papers.userId,
          status: papers.status,
          examType: papers.examType,
          assignmentId: papers.assignmentId,
        })
        .from(papers)
        .where(and(eq(papers.id, paperId), eq(papers.userId, userId)))
        .limit(1);

      if (!paper) {
        res.fail("ROUND1_NOT_FOUND", "试卷不存在", 404);
        return;
      }

      const [existingAttempt] = await db
        .select({
          id: attempts.id,
          paperId: attempts.paperId,
          status: attempts.status,
          tabNonce: attempts.tabNonce,
        })
        .from(attempts)
        .where(
          and(
            eq(attempts.paperId, paperId),
            eq(attempts.userId, userId),
            eq(attempts.status, "started"),
          ),
        )
        .orderBy(desc(attempts.startedAt))
        .limit(1);

      if (existingAttempt) {
        res.ok(existingAttempt);
        return;
      }

      if (paper.status !== "draft") {
        res.fail("ROUND1_CONFLICT", "仅允许从 draft 试卷开始答题", 409);
        return;
      }

      const createdAttempt = await db.transaction(async (tx) => {
        const transitionAt = new Date();
        const [assignment] = paper.assignmentId
          ? await tx
              .select({
                dueAt: assignments.dueAt,
              })
              .from(assignments)
              .where(eq(assignments.id, paper.assignmentId))
              .limit(1)
          : [undefined];

        const [activatedPaper] = await tx
          .update(papers)
          .set({
            status: "active",
            updatedAt: transitionAt,
          })
          .where(and(eq(papers.id, paperId), eq(papers.userId, userId), eq(papers.status, "draft")))
          .returning({
            id: papers.id,
          });

        if (!activatedPaper) {
          const [concurrentAttempt] = await tx
            .select({
              id: attempts.id,
              paperId: attempts.paperId,
              status: attempts.status,
              tabNonce: attempts.tabNonce,
              startedAt: attempts.startedAt,
            })
            .from(attempts)
            .where(
              and(
                eq(attempts.paperId, paperId),
                eq(attempts.userId, userId),
                eq(attempts.status, "started"),
              ),
            )
            .orderBy(desc(attempts.startedAt))
            .limit(1);

          if (concurrentAttempt) {
            return {
              attempt: concurrentAttempt,
              assignmentDueAt: assignment?.dueAt ?? null,
              created: false,
            };
          }

          throw new StartAttemptConflictError();
        }

        const [created] = await tx
          .insert(attempts)
          .values({
            paperId,
            userId,
            tabNonce: randomUUID(),
            status: "started",
          })
          .returning({
            id: attempts.id,
            paperId: attempts.paperId,
            status: attempts.status,
            tabNonce: attempts.tabNonce,
            startedAt: attempts.startedAt,
          });

        if (!created) {
          throw new Error("Failed to create attempt");
        }

        if (paper.assignmentId) {
          await tx
            .update(assignmentProgress)
            .set({
              paperId,
              attemptId: created.id,
              status: "in_progress",
              updatedAt: transitionAt,
            })
            .where(
              and(
                eq(assignmentProgress.assignmentId, paper.assignmentId),
                eq(assignmentProgress.userId, userId),
                eq(assignmentProgress.status, "pending"),
              ),
            );
        }

        return {
          attempt: created,
          assignmentDueAt: assignment?.dueAt ?? null,
          created: true,
        };
      });

      if (!createdAttempt.created) {
        res.ok(createdAttempt.attempt);
        return;
      }

      const scheduled = await scheduleAttemptAutoSubmit({
        attemptId: createdAttempt.attempt.id,
        paperId: createdAttempt.attempt.paperId,
        userId,
        examType: paper.examType,
        startedAt: createdAttempt.attempt.startedAt,
        assignmentDueAt: createdAttempt.assignmentDueAt,
      });

      await db
        .update(attempts)
        .set({
          autoSubmitJobId: scheduled.jobId,
          updatedAt: new Date(),
        })
        .where(eq(attempts.id, createdAttempt.attempt.id));

      res.ok(
        {
          id: createdAttempt.attempt.id,
          paperId: createdAttempt.attempt.paperId,
          status: createdAttempt.attempt.status,
          tabNonce: createdAttempt.attempt.tabNonce,
        },
        201,
      );
    } catch (err) {
      if (err instanceof StartAttemptConflictError) {
        res.fail("ROUND1_CONFLICT", "试卷状态已变化，请刷新后重试", 409);
        return;
      }

      next(err);
    }
  },
);

examsRouter.get(
  "/exams/:id/session",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.session.userId!;
      const paperId = req.params.id;

      if (typeof paperId !== "string" || paperId.length === 0) {
        res.fail("ROUND1_VALIDATION_ERROR", "缺少试卷 ID", 400);
        return;
      }

      const [paper] = await db
        .select({
          id: papers.id,
          examType: papers.examType,
          difficulty: papers.difficulty,
          status: papers.status,
          assignmentId: papers.assignmentId,
        })
        .from(papers)
        .where(and(eq(papers.id, paperId), eq(papers.userId, userId)))
        .limit(1);

      if (!paper) {
        res.fail("ROUND1_NOT_FOUND", "试卷不存在", 404);
        return;
      }

      const [attempt] = await db
        .select({
          id: attempts.id,
          paperId: attempts.paperId,
          status: attempts.status,
          tabNonce: attempts.tabNonce,
          startedAt: attempts.startedAt,
          answersJson: attempts.answersJson,
        })
        .from(attempts)
        .where(
          and(
            eq(attempts.paperId, paperId),
            eq(attempts.userId, userId),
            eq(attempts.status, "started"),
          ),
        )
        .orderBy(desc(attempts.startedAt))
        .limit(1);

      if (!attempt) {
        res.fail("ROUND1_NOT_FOUND", "答题会话不存在", 404);
        return;
      }

      const [assignment] = paper.assignmentId
        ? await db
            .select({
              dueAt: assignments.dueAt,
            })
            .from(assignments)
            .where(eq(assignments.id, paper.assignmentId))
            .limit(1)
        : [undefined];

      const submitAt = computeAttemptSubmitAt({
        examType: paper.examType,
        startedAt: attempt.startedAt,
        assignmentDueAt: assignment?.dueAt ?? null,
      });

      const items = await db
        .select({
          slotNo: paperQuestionSlots.slotNo,
          questionType: paperQuestionSlots.questionType,
          primaryKpId: paperQuestionSlots.primaryKpId,
          points: paperQuestionSlots.points,
          contentJson: questions.contentJson,
        })
        .from(paperQuestionSlots)
        .innerJoin(questions, eq(paperQuestionSlots.currentQuestionId, questions.id))
        .where(eq(paperQuestionSlots.paperId, paperId))
        .orderBy(paperQuestionSlots.slotNo);

      res.ok({
        paper,
        attempt: {
          id: attempt.id,
          paperId: attempt.paperId,
          status: attempt.status,
          tabNonce: attempt.tabNonce,
          startedAt: attempt.startedAt?.toISOString() ?? null,
          submitAt: submitAt.toISOString(),
          remainingMs: Math.max(submitAt.getTime() - Date.now(), 0),
          answersJson: normalizeRecord(attempt.answersJson),
        },
        items,
      });
    } catch (err) {
      next(err);
    }
  },
);

examsRouter.get(
  "/exams/:id/result",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.session.userId!;
      const paperId = req.params.id;

      if (typeof paperId !== "string" || paperId.length === 0) {
        res.fail("ROUND1_VALIDATION_ERROR", "缺少试卷 ID", 400);
        return;
      }

      const [paper] = await db
        .select({
          id: papers.id,
          examType: papers.examType,
          difficulty: papers.difficulty,
          status: papers.status,
          assignmentId: papers.assignmentId,
        })
        .from(papers)
        .where(and(eq(papers.id, paperId), eq(papers.userId, userId)))
        .limit(1);

      if (!paper) {
        res.fail("ROUND1_NOT_FOUND", "试卷不存在", 404);
        return;
      }

      const [attempt] = await db
        .select({
          id: attempts.id,
          paperId: attempts.paperId,
          status: attempts.status,
          answersJson: attempts.answersJson,
          submittedAt: attempts.submittedAt,
          score: attempts.score,
          perSectionJson: attempts.perSectionJson,
          perPrimaryKpJson: attempts.perPrimaryKpJson,
          aiReportJson: attempts.aiReportJson,
          reportStatus: attempts.reportStatus,
        })
        .from(attempts)
        .where(
          and(
            eq(attempts.paperId, paperId),
            eq(attempts.userId, userId),
            or(eq(attempts.status, "submitted"), eq(attempts.status, "auto_submitted")),
          ),
        )
        .orderBy(desc(attempts.submittedAt))
        .limit(1);

      if (!attempt) {
        res.fail("ROUND1_NOT_FOUND", "答题结果不存在", 404);
        return;
      }

      const slots = await db
        .select({
          slotNo: paperQuestionSlots.slotNo,
          questionType: paperQuestionSlots.questionType,
          primaryKpId: paperQuestionSlots.primaryKpId,
          points: paperQuestionSlots.points,
          contentJson: questions.contentJson,
          answerJson: questions.answerJson,
          explanationJson: questions.explanationJson,
        })
        .from(paperQuestionSlots)
        .innerJoin(questions, eq(paperQuestionSlots.currentQuestionId, questions.id))
        .where(eq(paperQuestionSlots.paperId, paperId))
        .orderBy(paperQuestionSlots.slotNo);

      res.ok({
        paper,
        attempt: {
          id: attempt.id,
          status: attempt.status,
          submittedAt: attempt.submittedAt,
          score: attempt.score ?? null,
          perSectionJson: normalizeNullableRecord(attempt.perSectionJson),
          perPrimaryKpJson: normalizeNullableRecord(attempt.perPrimaryKpJson),
          reportStatus: attempt.reportStatus ?? null,
          report: normalizeNullableRecord(attempt.aiReportJson),
        },
        items: buildAttemptResultItems(normalizeRecord(attempt.answersJson), slots),
      });
    } catch (err) {
      next(err);
    }
  },
);

examsRouter.get(
  "/attempts/active",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const [activeAttempt] = await db
        .select({
          id: attempts.id,
          paperId: attempts.paperId,
          status: attempts.status,
          tabNonce: attempts.tabNonce,
          startedAt: attempts.startedAt,
        })
        .from(attempts)
        .where(and(eq(attempts.userId, req.session.userId!), eq(attempts.status, "started")))
        .orderBy(desc(attempts.startedAt))
        .limit(1);

      if (!activeAttempt) {
        res.ok(null);
        return;
      }

      const [paper] = await db
        .select({
          id: papers.id,
          examType: papers.examType,
          difficulty: papers.difficulty,
          assignmentId: papers.assignmentId,
        })
        .from(papers)
        .where(and(eq(papers.id, activeAttempt.paperId), eq(papers.userId, req.session.userId!)))
        .limit(1);

      if (!paper) {
        res.ok(null);
        return;
      }

      const [assignment] = paper.assignmentId
        ? await db
            .select({
              dueAt: assignments.dueAt,
            })
            .from(assignments)
            .where(eq(assignments.id, paper.assignmentId))
            .limit(1)
        : [undefined];

      const submitAt = computeAttemptSubmitAt({
        examType: paper.examType,
        startedAt: activeAttempt.startedAt,
        assignmentDueAt: assignment?.dueAt ?? null,
      });

      res.ok({
        id: activeAttempt.id,
        paperId: activeAttempt.paperId,
        status: activeAttempt.status,
        tabNonce: activeAttempt.tabNonce,
        startedAt: activeAttempt.startedAt?.toISOString() ?? null,
        submitAt: submitAt.toISOString(),
        remainingMs: Math.max(submitAt.getTime() - Date.now(), 0),
        examType: paper.examType,
        difficulty: paper.difficulty,
        assignmentId: paper.assignmentId,
        resumePath: `/exams/${activeAttempt.paperId}`,
      });
    } catch (err) {
      next(err);
    }
  },
);

examsRouter.patch(
  "/attempts/:id",
  requireAuth,
  validate(AutosaveAttemptBodySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.session.userId!;
      const attemptId = req.params.id;
      const tabNonce = req.get("X-Tab-Nonce");
      const body = req.body as AutosaveAttemptBody;

      if (typeof attemptId !== "string" || attemptId.length === 0) {
        res.fail("ROUND1_VALIDATION_ERROR", "缺少 attempt ID", 400);
        return;
      }

      const [attempt] = await db
        .select({
          id: attempts.id,
          paperId: attempts.paperId,
          status: attempts.status,
          tabNonce: attempts.tabNonce,
          startedAt: attempts.startedAt,
        })
        .from(attempts)
        .where(and(eq(attempts.id, attemptId), eq(attempts.userId, userId)))
        .limit(1);

      if (!attempt) {
        res.fail("ROUND1_NOT_FOUND", "答题记录不存在", 404);
        return;
      }

      if (attempt.status !== "started") {
        res.fail("ROUND1_CONFLICT", "仅允许 started attempt 自动保存", 409);
        return;
      }

      if (!tabNonce || tabNonce !== attempt.tabNonce) {
        res.fail("ROUND1_CONFLICT", "X-Tab-Nonce 不匹配", 409);
        return;
      }

      const rateLimit = await consumeAutosaveRateLimit(userId);
      if (!rateLimit.allowed) {
        res.fail("ROUND1_RATE_LIMITED", "自动保存过于频繁，请稍后重试", 429, {
          retryAfterSeconds: rateLimit.retryAfterSeconds,
        });
        return;
      }

      const [updatedAttempt] = await db
        .update(attempts)
        .set({
          answersJson: buildAnswersJsonPatchExpression(body.patches),
          updatedAt: new Date(),
        })
        .where(and(eq(attempts.id, attemptId), eq(attempts.userId, userId), eq(attempts.status, "started")))
        .returning({
          id: attempts.id,
          paperId: attempts.paperId,
          status: attempts.status,
          tabNonce: attempts.tabNonce,
          startedAt: attempts.startedAt,
          answersJson: attempts.answersJson,
        });

      if (!updatedAttempt) {
        res.fail("ROUND1_CONFLICT", "仅允许 started attempt 自动保存", 409);
        return;
      }

      res.ok(updatedAttempt);
    } catch (err) {
      next(err);
    }
  },
);

examsRouter.post(
  "/attempts/:id/submit",
  requireAuth,
  validate(SubmitAttemptBodySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.session.userId!;
      const attemptId = req.params.id;
      const body = req.body as SubmitAttemptBody;

      if (typeof attemptId !== "string" || attemptId.length === 0) {
        res.fail("ROUND1_VALIDATION_ERROR", "缺少 attempt ID", 400);
        return;
      }

      if (body.patches?.length) {
        const tabNonce = req.get("X-Tab-Nonce");
        const [attempt] = await db
          .select({
            id: attempts.id,
            status: attempts.status,
            tabNonce: attempts.tabNonce,
          })
          .from(attempts)
          .where(and(eq(attempts.id, attemptId), eq(attempts.userId, userId)))
          .limit(1);

        if (!attempt) {
          res.fail("ROUND1_NOT_FOUND", "答题记录不存在", 404);
          return;
        }

        if (attempt.status !== "started") {
          res.fail("ROUND1_CONFLICT", "仅允许 started attempt 提交", 409);
          return;
        }

        if (!tabNonce || tabNonce !== attempt.tabNonce) {
          res.fail("ROUND1_CONFLICT", "X-Tab-Nonce 不匹配", 409);
          return;
        }

        const [updatedAttempt] = await db
          .update(attempts)
          .set({
            answersJson: buildAnswersJsonPatchExpression(body.patches),
            updatedAt: new Date(),
          })
          .where(and(eq(attempts.id, attemptId), eq(attempts.userId, userId), eq(attempts.status, "started")))
          .returning({
            id: attempts.id,
          });

        if (!updatedAttempt) {
          res.fail("ROUND1_CONFLICT", "仅允许 started attempt 提交", 409);
          return;
        }
      }

      const result = await finalizeAttempt({
        attemptId,
        userId,
        cancelAutoSubmitJob: true,
      });

      if (result.kind === "not_found_attempt") {
        res.fail("ROUND1_NOT_FOUND", "答题记录不存在", 404);
        return;
      }

      if (result.kind === "not_found_paper") {
        res.fail("ROUND1_NOT_FOUND", "试卷不存在", 404);
        return;
      }

      if (result.kind === "conflict") {
        res.fail("ROUND1_CONFLICT", "仅允许 started attempt 提交", 409);
        return;
      }

      res.ok(result.attempt);
    } catch (err) {
      next(err);
    }
  },
);

examsRouter.get(
  "/users/me/attempts",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.session.userId!;
      const page = parsePositiveInt(req.query.page, 1);
      const pageSize = Math.min(parsePositiveInt(req.query.pageSize, 20), 100);

      const rows = await db
        .select({
          id: attempts.id,
          paperId: attempts.paperId,
          examType: papers.examType,
          difficulty: papers.difficulty,
          status: attempts.status,
          score: attempts.score,
          submittedAt: attempts.submittedAt,
        })
        .from(attempts)
        .innerJoin(papers, eq(attempts.paperId, papers.id))
        .where(
          and(
            eq(attempts.userId, userId),
            or(eq(attempts.status, "submitted"), eq(attempts.status, "auto_submitted")),
          ),
        )
        .orderBy(desc(attempts.submittedAt));

      const offset = (page - 1) * pageSize;
      res.ok({
        items: rows.slice(offset, offset + pageSize),
        page,
        pageSize,
        total: rows.length,
      });
    } catch (err) {
      next(err);
    }
  },
);

examsRouter.get(
  "/users/me/stats",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rows = await db
        .select({
          id: attempts.id,
          score: attempts.score,
          status: attempts.status,
          submittedAt: attempts.submittedAt,
          perPrimaryKpJson: attempts.perPrimaryKpJson,
        })
        .from(attempts)
        .where(
          and(
            eq(attempts.userId, req.session.userId!),
            or(eq(attempts.status, "submitted"), eq(attempts.status, "auto_submitted")),
          ),
        )
        .orderBy(desc(attempts.submittedAt));

      const totalAttempts = rows.length;
      const averageScore =
        totalAttempts === 0
          ? 0
          : rows.reduce((sum, row) => sum + (row.score ?? 0), 0) / totalAttempts;
      const bestScore = rows.reduce((current, row) => Math.max(current, row.score ?? 0), 0);
      const latestSubmittedAt = rows[0]?.submittedAt ?? null;
      const kpCounters = new Map<string, { total: number; correct: number }>();

      for (const row of rows) {
        const stats = normalizeStatsRecord(row.perPrimaryKpJson);
        for (const [kpId, entry] of Object.entries(stats)) {
          const current = kpCounters.get(kpId) ?? { total: 0, correct: 0 };
          current.total += entry.total;
          current.correct += entry.correct;
          kpCounters.set(kpId, current);
        }
      }

      const weakPrimaryKps = Array.from(kpCounters.entries())
        .map(([kpId, entry]) => ({
          kpId,
          total: entry.total,
          correct: entry.correct,
          accuracy: entry.total === 0 ? 0 : entry.correct / entry.total,
        }))
        .sort((left, right) => left.accuracy - right.accuracy || right.total - left.total);

      res.ok({
        totalAttempts,
        averageScore,
        bestScore,
        latestSubmittedAt,
        weakPrimaryKps,
      });
    } catch (err) {
      next(err);
    }
  },
);
