import express from "express";
import supertest from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { queuedResults, mockDb } = vi.hoisted(() => {
  const queuedResults: unknown[] = [];

  function makeQuery(result: unknown) {
    const query = {
      from() {
        return query;
      },
      innerJoin() {
        return query;
      },
      leftJoin() {
        return query;
      },
      where() {
        return query;
      },
      orderBy() {
        return query;
      },
      limit() {
        return query;
      },
      offset() {
        return query;
      },
      set() {
        return query;
      },
      values() {
        return query;
      },
      returning() {
        return query;
      },
      onConflictDoNothing() {
        return query;
      },
      then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
        return Promise.resolve(result).then(onFulfilled, onRejected);
      },
    };

    return query;
  }

  const mockDb = {
    select: vi.fn(() => makeQuery(queuedResults.shift() ?? [])),
    insert: vi.fn(() => makeQuery(queuedResults.shift() ?? [])),
    update: vi.fn(() => makeQuery(queuedResults.shift() ?? [])),
    delete: vi.fn(() => makeQuery(queuedResults.shift() ?? [])),
    transaction: vi.fn(async (callback: (tx: typeof mockDb) => unknown) => callback(mockDb)),
  };

  return { queuedResults, mockDb };
});

vi.mock("../db.js", () => ({
  db: mockDb,
}));

vi.mock("../middleware/auth.js", () => ({
  requireAuth: (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
    next(),
  requireRole: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
    next(),
}));

import { responseWrapper } from "../middleware/responseWrapper.js";
import { coachRouter } from "../routes/coach.js";

const userId = "00000000-0000-4000-8000-000000000001";
const coachId = "00000000-0000-4000-8000-000000000002";
const classId = "11111111-1111-4111-8111-111111111111";
const paperId = "22222222-2222-4222-8222-222222222222";
const assignmentId = "33333333-3333-4333-8333-333333333333";

function createTestApp(role: "student" | "coach" | "admin" = "coach") {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as express.Request & { session: express.Request["session"] }).session = {
      userId,
      role,
      sessionVersion: 1,
      createdAt: Date.now(),
    } as express.Request["session"];
    next();
  });
  app.use(responseWrapper);
  app.use("/api/v1", coachRouter);
  app.use(
    (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(500).json({ success: false, error: { code: "TEST_ERROR", message: err.message } });
    },
  );
  return app;
}

describe("coach class api", () => {
  beforeEach(() => {
    queuedResults.length = 0;
    vi.clearAllMocks();
  });

  it("rejects ambiguous class join payloads before touching the database", async () => {
    const app = createTestApp("student");
    const res = await supertest(app)
      .post("/api/v1/classes/join")
      .send({ code: "ABC123", inviteToken: "invite-token-value-that-is-long-enough" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("ROUND1_VALIDATION_ERROR");
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("creates a class and assigns the creator as owner", async () => {
    const now = new Date("2026-04-28T00:00:00.000Z");
    queuedResults.push(
      [],
      [
        {
          id: classId,
          name: "CSP-J 春季班",
          joinCode: "AB12CD",
          archivedAt: null,
          createdBy: userId,
          createdAt: now,
          updatedAt: now,
        },
      ],
      [],
    );

    const app = createTestApp("coach");
    const res = await supertest(app).post("/api/v1/coach/classes").send({ name: "CSP-J 春季班" });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      id: classId,
      joinCode: "AB12CD",
      coachRole: "owner",
      memberCount: 0,
      coachCount: 1,
    });
    expect(mockDb.transaction).toHaveBeenCalledOnce();
  });

  it("returns an existing membership when joining the same class again by code", async () => {
    queuedResults.push(
      [{ id: classId, archivedAt: new Date("2026-04-01T00:00:00.000Z") }],
      [
        {
          classId,
          userId,
          joinedVia: "code",
          joinedAt: new Date("2026-04-27T00:00:00.000Z"),
          username: "student",
          displayName: "Student",
          role: "student",
        },
      ],
    );

    const app = createTestApp("student");
    const res = await supertest(app).post("/api/v1/classes/join").send({ code: " ab12cd " });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      classId,
      userId,
      joinedVia: "code",
    });
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("atomically consumes a valid invite only when creating a new membership", async () => {
    queuedResults.push(
      [
        {
          id: "44444444-4444-4444-8444-444444444444",
          classId,
          expiresAt: new Date("2026-04-29T00:00:00.000Z"),
          maxUses: 3,
          useCount: 0,
          revokedAt: null,
          classArchivedAt: null,
        },
      ],
      [],
      [{ classId, userId }],
      [{ classId }],
      [
        {
          classId,
          userId,
          joinedVia: "invite_link",
          joinedAt: new Date("2026-04-28T00:00:00.000Z"),
          username: "student",
          displayName: "Student",
          role: "student",
        },
      ],
    );

    const app = createTestApp("student");
    const res = await supertest(app)
      .post("/api/v1/classes/join")
      .send({ inviteToken: "invite-token-value-that-is-long-enough" });

    expect(res.status).toBe(200);
    expect(res.body.data.joinedVia).toBe("invite_link");
    expect(mockDb.update).toHaveBeenCalledOnce();
    expect(mockDb.insert).toHaveBeenCalledOnce();
  });

  it("requires owner role to add collaborator coaches from coach routes", async () => {
    queuedResults.push([{ id: classId, archivedAt: null, coachRole: "collaborator" }]);

    const app = createTestApp("coach");
    const res = await supertest(app)
      .post(`/api/v1/coach/classes/${classId}/coaches`)
      .send({ userId: coachId });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ROUND1_CLASS_OWNER_REQUIRED");
  });

  it("creates assignments against a published prebuilt paper and seeds student progress", async () => {
    const now = new Date("2026-04-28T00:00:00.000Z");
    queuedResults.push(
      [{ id: classId, archivedAt: null, coachRole: "collaborator" }],
      [
        {
          id: paperId,
          examType: "CSP-J",
          difficulty: "medium",
          blueprintVersion: 1,
          status: "published",
        },
      ],
      [
        {
          id: assignmentId,
          classId,
          createdBy: userId,
          title: "第 1 周模拟",
          mode: "timed",
          prebuiltPaperId: paperId,
          examType: "CSP-J",
          blueprintVersion: 1,
          dueAt: new Date("2099-04-29T00:00:00.000Z"),
          status: "assigned",
          createdAt: now,
          updatedAt: now,
        },
      ],
      [{ userId: "55555555-5555-4555-8555-555555555555" }],
      [],
    );

    const app = createTestApp("coach");
    const res = await supertest(app).post("/api/v1/coach/assignments").send({
      classId,
      title: "第 1 周模拟",
      prebuiltPaperId: paperId,
      dueAt: "2099-04-29T00:00:00.000Z",
    });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      id: assignmentId,
      prebuiltPaperId: paperId,
      examType: "CSP-J",
      difficulty: "medium",
      assignedStudents: 1,
    });
  });
});
