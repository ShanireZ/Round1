import express from "express";
import type { SessionData } from "express-session";
import supertest from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { queuedResults, mockDb, scheduleAttemptAutoSubmitMock, cancelAttemptAutoSubmitMock } =
  vi.hoisted(() => {
    const queuedResults: unknown[] = [];
    const scheduleAttemptAutoSubmitMock = vi.fn();
    const cancelAttemptAutoSubmitMock = vi.fn();

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
        groupBy() {
          return query;
        },
        set: vi.fn(() => {
          return query;
        }),
        values: vi.fn(() => {
          return query;
        }),
        returning() {
          return query;
        },
        then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
          return Promise.resolve(result).then(onFulfilled, onRejected);
        },
      };

      return query;
    }

    const mockDb = {
      select: vi.fn((_selection?: unknown) => makeQuery(queuedResults.shift() ?? [])),
      insert: vi.fn((_table?: unknown) => makeQuery(queuedResults.shift() ?? [])),
      update: vi.fn((_table?: unknown) => makeQuery(queuedResults.shift() ?? [])),
      delete: vi.fn((_table?: unknown) => makeQuery(queuedResults.shift() ?? [])),
      transaction: vi.fn(async (callback: (tx: typeof mockDb) => unknown) => callback(mockDb)),
    };

    return { queuedResults, mockDb, scheduleAttemptAutoSubmitMock, cancelAttemptAutoSubmitMock };
  });

vi.mock("../db.js", () => ({
  db: mockDb,
}));

vi.mock("../services/examAutoSubmitQueue.js", async () => {
  const actual = await vi.importActual<typeof import("../services/examAutoSubmitQueue.js")>(
    "../services/examAutoSubmitQueue.js",
  );

  return {
    ...actual,
    scheduleAttemptAutoSubmit: scheduleAttemptAutoSubmitMock,
    cancelAttemptAutoSubmit: cancelAttemptAutoSubmitMock,
  };
});

vi.mock("../middleware/auth.js", () => ({
  requireAuth: (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
    next(),
  requireRole: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
    next(),
}));

import { responseWrapper } from "../middleware/responseWrapper.js";
import { examsRouter } from "../routes/exams.js";

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const session = {
      userId: "user-1",
      role: "student",
      sessionVersion: 1,
      createdAt: Date.now(),
    } satisfies Partial<SessionData>;

    (req as express.Request & { session: express.Request["session"] }).session =
      session as express.Request["session"];
    next();
  });
  app.use(responseWrapper);
  app.use("/api/v1", examsRouter);
  app.use(
    (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(500).json({ success: false, error: { code: "TEST_ERROR", message: err.message } });
    },
  );
  return app;
}

describe("Phase 11 exams/attempts runtime routes", () => {
  beforeEach(() => {
    queuedResults.length = 0;
    vi.clearAllMocks();
    scheduleAttemptAutoSubmitMock.mockResolvedValue({
      jobId: "attempt:auto-submit-default",
      submitAt: new Date("2026-04-26T00:00:00.000Z"),
    });
  });

  it("lists exam catalog from published prebuilt papers only", async () => {
    queuedResults.push([
      { examType: "CSP-J", difficulty: "easy" },
      { examType: "CSP-J", difficulty: "easy" },
      { examType: "CSP-S", difficulty: "hard" },
    ]);

    const app = createTestApp();
    const res = await supertest(app).get("/api/v1/exams/catalog");

    expect(res.status).toBe(200);
    expect(res.body.data.items).toEqual([
      { examType: "CSP-J", difficulty: "easy", count: 2 },
      { examType: "CSP-S", difficulty: "hard", count: 1 },
    ]);
  });

  it("lists published real papers separately from simulated prebuilt papers", async () => {
    queuedResults.push([
      {
        id: "real-pp-1",
        title: "CSP-J 2026 真题",
        examType: "CSP-J",
        difficulty: "medium",
        metadataJson: {
          paperKind: "real_paper",
          year: 2026,
          sourceLabel: "official-sample",
          tags: ["真题", "2026", "CSP-J"],
        },
        publishedAt: new Date("2026-05-02T00:00:00.000Z"),
        createdAt: new Date("2026-05-01T00:00:00.000Z"),
        questionCount: 32,
      },
    ]);

    const app = createTestApp();
    const res = await supertest(app).get("/api/v1/exams/real-papers/catalog");

    expect(res.status).toBe(200);
    expect(res.body.data.items).toEqual([
      {
        id: "real-pp-1",
        title: "CSP-J 2026 真题",
        examType: "CSP-J",
        difficulty: "medium",
        year: "2026",
        sourceLabel: "official-sample",
        sourceUrl: null,
        tags: ["真题", "2026", "CSP-J"],
        questionCount: 32,
        publishedAt: "2026-05-02T00:00:00.000Z",
      },
    ]);
  });

  it("returns the user's active draft paper without exposing online replacement semantics", async () => {
    queuedResults.push([
      {
        id: "paper-1",
        prebuiltPaperId: "pp-1",
        examType: "CSP-J",
        difficulty: "easy",
        status: "draft",
      },
    ]);

    const app = createTestApp();
    const res = await supertest(app).get("/api/v1/exams/active-draft");

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      id: "paper-1",
      prebuiltPaperId: "pp-1",
      examType: "CSP-J",
      difficulty: "easy",
      status: "draft",
    });
  });

  it("rejects online assembly and replacement payloads when creating draft exams", async () => {
    const app = createTestApp();
    const res = await supertest(app)
      .post("/api/v1/exams")
      .send({
        examType: "CSP-J",
        difficulty: "easy",
        questionIds: ["q-1", "q-2"],
        replacementQuestionId: "q-9",
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("ROUND1_VALIDATION_ERROR");
  });

  it("creates draft exams only by cloning a published prebuilt paper", async () => {
    queuedResults.push([]);
    queuedResults.push([]);
    queuedResults.push([
      {
        id: "pp-1",
        examType: "CSP-J",
        difficulty: "easy",
        blueprintVersion: 3,
      },
    ]);
    queuedResults.push([
      {
        id: "paper-1",
        prebuiltPaperId: "pp-1",
        examType: "CSP-J",
        difficulty: "easy",
        status: "draft",
        blueprintVersion: 3,
      },
    ]);
    queuedResults.push([
      {
        slotNo: 1,
        questionId: "q-1",
        questionType: "single_choice",
        primaryKpId: 101,
        difficulty: "easy",
        points: 2,
      },
    ]);
    queuedResults.push([]);

    const app = createTestApp();
    const res = await supertest(app).post("/api/v1/exams").send({
      examType: "CSP-J",
      difficulty: "easy",
    });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      id: "paper-1",
      prebuiltPaperId: "pp-1",
      examType: "CSP-J",
      difficulty: "easy",
      status: "draft",
    });

    const paperSlotInsert = mockDb.insert.mock.calls[1]?.[0];
    expect(paperSlotInsert).toBeDefined();
    const prebuiltSlotSelect = mockDb.select.mock.calls[3]?.[0] as
      | Record<string, unknown>
      | undefined;
    expect(prebuiltSlotSelect?.points).toBeDefined();
    const paperSlotInsertQuery = mockDb.insert.mock.results[1]?.value;
    expect(paperSlotInsertQuery.values).toHaveBeenCalledWith([
      {
        paperId: "paper-1",
        slotNo: 1,
        questionType: "single_choice",
        primaryKpId: 101,
        difficulty: "easy",
        points: 2,
        currentQuestionId: "q-1",
      },
    ]);
  });

  it("creates reusable real paper drafts by cloning a published real paper", async () => {
    queuedResults.push([]);
    queuedResults.push([
      {
        id: "real-pp-1",
        examType: "CSP-J",
        difficulty: "medium",
        blueprintVersion: 1,
      },
    ]);
    queuedResults.push([
      {
        id: "paper-real-1",
        prebuiltPaperId: "real-pp-1",
        examType: "CSP-J",
        difficulty: "medium",
        status: "draft",
        blueprintVersion: 1,
      },
    ]);
    queuedResults.push([
      {
        slotNo: 1,
        questionId: "q-real-1",
        questionType: "single_choice",
        primaryKpId: 101,
        difficulty: "medium",
        points: 2,
      },
    ]);
    queuedResults.push([]);

    const app = createTestApp();
    const res = await supertest(app).post("/api/v1/exams/real-papers/real-pp-1/drafts").send({});

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      id: "paper-real-1",
      prebuiltPaperId: "real-pp-1",
      examType: "CSP-J",
      difficulty: "medium",
      status: "draft",
    });
  });

  it("returns an existing matching draft instead of cloning a new one", async () => {
    queuedResults.push([
      {
        id: "paper-existing",
        prebuiltPaperId: "pp-1",
        examType: "CSP-J",
        difficulty: "easy",
        status: "draft",
      },
    ]);

    const app = createTestApp();
    const res = await supertest(app).post("/api/v1/exams").send({
      examType: "CSP-J",
      difficulty: "easy",
    });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      id: "paper-existing",
      prebuiltPaperId: "pp-1",
      examType: "CSP-J",
      difficulty: "easy",
      status: "draft",
    });
    expect(mockDb.transaction).not.toHaveBeenCalled();
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("returns prebuilt unavailable when no published template matches the requested exam", async () => {
    queuedResults.push([]);
    queuedResults.push([]);
    queuedResults.push([]);

    const app = createTestApp();
    const res = await supertest(app).post("/api/v1/exams").send({
      examType: "CSP-J",
      difficulty: "hard",
    });

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("ROUND1_PREBUILT_PAPER_UNAVAILABLE");
  });

  it("soft-excludes recently used prebuilt papers at template level only", async () => {
    queuedResults.push([]);
    queuedResults.push([{ prebuiltPaperId: "pp-recent" }]);
    queuedResults.push([
      {
        id: "pp-recent",
        examType: "CSP-J",
        difficulty: "easy",
        blueprintVersion: 3,
      },
      {
        id: "pp-next",
        examType: "CSP-J",
        difficulty: "easy",
        blueprintVersion: 3,
      },
    ]);
    queuedResults.push([
      {
        id: "paper-soft-exclude",
        prebuiltPaperId: "pp-next",
        examType: "CSP-J",
        difficulty: "easy",
        status: "draft",
        blueprintVersion: 3,
      },
    ]);
    queuedResults.push([]);

    const app = createTestApp();
    const res = await supertest(app).post("/api/v1/exams").send({
      examType: "CSP-J",
      difficulty: "easy",
    });

    expect(res.status).toBe(201);
    expect(res.body.data.prebuiltPaperId).toBe("pp-next");

    const paperInsertQuery = mockDb.insert.mock.results[0]?.value;
    expect(paperInsertQuery.values).toHaveBeenCalledWith(
      expect.objectContaining({
        prebuiltPaperId: "pp-next",
      }),
    );
  });

  it("starts an attempt from an existing draft paper and returns a tab nonce", async () => {
    queuedResults.push([
      {
        id: "paper-1",
        userId: "user-1",
        status: "draft",
        examType: "GESP-1",
        assignmentId: null,
      },
    ]);
    queuedResults.push([]);
    queuedResults.push([
      {
        id: "paper-1",
        status: "active",
      },
    ]);
    queuedResults.push([
      {
        id: "attempt-1",
        paperId: "paper-1",
        status: "started",
        tabNonce: "nonce-1",
      },
    ]);

    const app = createTestApp();
    const res = await supertest(app).post("/api/v1/exams/paper-1/attempts").send({});

    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({
      id: "attempt-1",
      paperId: "paper-1",
      status: "started",
      tabNonce: "nonce-1",
    });
    expect(scheduleAttemptAutoSubmitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptId: "attempt-1",
        paperId: "paper-1",
        userId: "user-1",
        examType: "GESP-1",
      }),
    );
  });

  it("marks assignment progress in_progress when starting an assignment attempt", async () => {
    queuedResults.push([
      {
        id: "paper-assignment",
        userId: "user-1",
        status: "draft",
        examType: "CSP-J",
        assignmentId: "assignment-1",
      },
    ]);
    queuedResults.push([]);
    queuedResults.push([
      {
        dueAt: new Date("2026-04-26T10:00:00.000Z"),
      },
    ]);
    queuedResults.push([
      {
        id: "paper-assignment",
        status: "active",
      },
    ]);
    queuedResults.push([
      {
        id: "attempt-assignment",
        paperId: "paper-assignment",
        status: "started",
        tabNonce: "nonce-assignment",
        startedAt: new Date("2026-04-26T09:00:00.000Z"),
      },
    ]);

    const app = createTestApp();
    const res = await supertest(app).post("/api/v1/exams/paper-assignment/attempts").send({});

    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({
      id: "attempt-assignment",
      paperId: "paper-assignment",
      status: "started",
      tabNonce: "nonce-assignment",
    });
    expect(scheduleAttemptAutoSubmitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptId: "attempt-assignment",
        paperId: "paper-assignment",
        assignmentDueAt: new Date("2026-04-26T10:00:00.000Z"),
      }),
    );

    const assignmentProgressUpdateQuery = mockDb.update.mock.results[1]?.value;
    expect(assignmentProgressUpdateQuery?.set).toHaveBeenCalledWith(
      expect.objectContaining({
        paperId: "paper-assignment",
        attemptId: "attempt-assignment",
        status: "in_progress",
      }),
    );
  });

  it("autosaves answers for a started attempt when tab nonce matches", async () => {
    queuedResults.push([
      {
        id: "attempt-1",
        paperId: "paper-1",
        status: "started",
        tabNonce: "nonce-1",
        answersJson: { q1: "A" },
      },
    ]);
    queuedResults.push([
      {
        id: "attempt-1",
        paperId: "paper-1",
        status: "started",
        tabNonce: "nonce-1",
        answersJson: { q1: "B", q2: "C" },
      },
    ]);

    const app = createTestApp();
    const res = await supertest(app)
      .patch("/api/v1/attempts/attempt-1")
      .set("X-Tab-Nonce", "nonce-1")
      .send({
        patches: [
          {
            slotNo: 1,
            subKey: "0",
            value: "B",
            updatedAt: "2026-04-26T00:30:00.000Z",
          },
          {
            slotNo: 2,
            subKey: "0",
            value: "C",
            updatedAt: "2026-04-26T00:30:01.000Z",
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      id: "attempt-1",
      paperId: "paper-1",
      status: "started",
      tabNonce: "nonce-1",
      answersJson: { q1: "B", q2: "C" },
    });

    const updateQuery = mockDb.update.mock.results[0]?.value;
    expect(updateQuery?.set).toHaveBeenCalledWith(
      expect.objectContaining({
        answersJson: expect.anything(),
      }),
    );
  });

  it("rejects autosave when tab nonce does not match", async () => {
    queuedResults.push([
      {
        id: "attempt-1",
        paperId: "paper-1",
        status: "started",
        tabNonce: "nonce-1",
        answersJson: {},
      },
    ]);

    const app = createTestApp();
    const res = await supertest(app)
      .patch("/api/v1/attempts/attempt-1")
      .set("X-Tab-Nonce", "nonce-other")
      .send({
        patches: [{ slotNo: 1, subKey: "0", value: "B" }],
      });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ROUND1_CONFLICT");
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("returns an existing finalized auto-submitted attempt for repeated submit requests", async () => {
    queuedResults.push([
      {
        id: "attempt-1",
        paperId: "paper-1",
        status: "auto_submitted",
        answersJson: {
          "1": {
            subAnswers: { "0": "A" },
            updatedAt: "2026-04-26T00:00:00.000Z",
          },
        },
        submittedAt: "2026-04-26T01:00:00.000Z",
        score: 2,
        perSectionJson: {
          single_choice: { total: 1, correct: 1, score: 2, maxScore: 2 },
        },
        perPrimaryKpJson: {
          "101": { total: 1, correct: 1, accuracy: 1 },
        },
      },
    ]);

    const app = createTestApp();
    const res = await supertest(app).post("/api/v1/attempts/attempt-1/submit").send({});

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      id: "attempt-1",
      paperId: "paper-1",
      status: "auto_submitted",
      answersJson: {
        "1": {
          subAnswers: { "0": "A" },
          updatedAt: "2026-04-26T00:00:00.000Z",
        },
      },
      submittedAt: "2026-04-26T01:00:00.000Z",
      score: 2,
      perSectionJson: {
        single_choice: { total: 1, correct: 1, score: 2, maxScore: 2 },
      },
      perPrimaryKpJson: {
        "101": { total: 1, correct: 1, accuracy: 1 },
      },
    });
    expect(mockDb.transaction).not.toHaveBeenCalled();
  });

  it("submits a started attempt, grades objective answers, and marks its paper completed", async () => {
    queuedResults.push([
      {
        id: "attempt-1",
        paperId: "paper-1",
        status: "started",
        startedAt: new Date(Date.now() - 5 * 60 * 1000),
        answersJson: {
          "1": {
            subAnswers: { "0": "B" },
            updatedAt: "2026-04-26T00:10:00.000Z",
          },
          "2": {
            subAnswers: { "0": "A" },
            updatedAt: "2026-04-26T00:11:00.000Z",
          },
        },
        submittedAt: null,
        autoSubmitJobId: "auto-submit-1",
      },
    ]);
    queuedResults.push([
      {
        id: "paper-1",
        examType: "GESP-1",
      },
    ]);
    queuedResults.push([
      {
        slotNo: 1,
        questionType: "single_choice",
        primaryKpId: 101,
        points: 2,
        answerJson: { answer: "B" },
      },
      {
        slotNo: 2,
        questionType: "single_choice",
        primaryKpId: 102,
        points: 2,
        answerJson: { answer: "C" },
      },
    ]);
    queuedResults.push([
      {
        id: "attempt-1",
        paperId: "paper-1",
        status: "submitted",
        answersJson: {
          "1": {
            subAnswers: { "0": "B" },
            updatedAt: "2026-04-26T00:10:00.000Z",
          },
          "2": {
            subAnswers: { "0": "A" },
            updatedAt: "2026-04-26T00:11:00.000Z",
          },
        },
        submittedAt: "2026-04-26T00:00:00.000Z",
        score: 2,
        perSectionJson: {
          single_choice: { total: 2, correct: 1, score: 2, maxScore: 4 },
        },
        perPrimaryKpJson: {
          "101": { total: 1, correct: 1, accuracy: 1 },
          "102": { total: 1, correct: 0, accuracy: 0 },
        },
      },
    ]);
    queuedResults.push([{ id: "paper-1", status: "completed" }]);

    const app = createTestApp();
    const res = await supertest(app).post("/api/v1/attempts/attempt-1/submit").send({});

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      id: "attempt-1",
      paperId: "paper-1",
      status: "submitted",
      answersJson: {
        "1": {
          subAnswers: { "0": "B" },
          updatedAt: "2026-04-26T00:10:00.000Z",
        },
        "2": {
          subAnswers: { "0": "A" },
          updatedAt: "2026-04-26T00:11:00.000Z",
        },
      },
      submittedAt: "2026-04-26T00:00:00.000Z",
      score: 2,
      perSectionJson: {
        single_choice: { total: 2, correct: 1, score: 2, maxScore: 4 },
      },
      perPrimaryKpJson: {
        "101": { total: 1, correct: 1, accuracy: 1 },
        "102": { total: 1, correct: 0, accuracy: 0 },
      },
    });

    const attemptUpdateQuery = mockDb.update.mock.results[0]?.value;
    expect(attemptUpdateQuery?.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "submitted",
        score: 2,
        perSectionJson: {
          single_choice: { total: 2, correct: 1, score: 2, maxScore: 4 },
        },
        perPrimaryKpJson: {
          "101": { total: 1, correct: 1, accuracy: 1 },
          "102": { total: 1, correct: 0, accuracy: 0 },
        },
      }),
    );

    const paperUpdateQuery = mockDb.update.mock.results[1]?.value;
    expect(paperUpdateQuery?.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "completed",
      }),
    );
    expect(cancelAttemptAutoSubmitMock).toHaveBeenCalledWith("auto-submit-1");
  });

  it("grades grouped reading/completion questions per sub-question and returns wrong explanations", async () => {
    queuedResults.push([
      {
        id: "attempt-2",
        paperId: "paper-2",
        status: "started",
        startedAt: new Date(Date.now() - 5 * 60 * 1000),
        answersJson: {
          "16": {
            subAnswers: { "1": "A", "2": "D", "3": "C" },
            updatedAt: "2026-04-26T00:20:00.000Z",
          },
          "19": {
            subAnswers: { "1": "A", "2": "C" },
            updatedAt: "2026-04-26T00:21:00.000Z",
          },
        },
        submittedAt: null,
        autoSubmitJobId: "auto-submit-2",
      },
    ]);
    queuedResults.push([
      {
        id: "paper-2",
        examType: "CSP-J",
      },
    ]);
    queuedResults.push([
      {
        slotNo: 16,
        questionType: "reading_program",
        primaryKpId: 201,
        points: 6,
        answerJson: { subAnswers: ["A", "B", "C"] },
        explanationJson: { subExplanations: ["阅读解析1", "阅读解析2", "阅读解析3"] },
      },
      {
        slotNo: 19,
        questionType: "completion_program",
        primaryKpId: 301,
        points: 4,
        answerJson: {
          blanks: [
            { id: "blank-1", answer: "A" },
            { id: "blank-2", answer: "D" },
          ],
        },
        explanationJson: {
          blankExplanations: [
            { id: "blank-1", explanation: "填空解析1" },
            { id: "blank-2", explanation: "填空解析2" },
          ],
        },
      },
    ]);
    queuedResults.push([
      {
        id: "attempt-2",
        paperId: "paper-2",
        status: "submitted",
        answersJson: {
          "16": {
            subAnswers: { "1": "A", "2": "D", "3": "C" },
            updatedAt: "2026-04-26T00:20:00.000Z",
          },
          "19": {
            subAnswers: { "1": "A", "2": "C" },
            updatedAt: "2026-04-26T00:21:00.000Z",
          },
        },
        submittedAt: "2026-04-26T00:30:00.000Z",
        score: 6,
        perSectionJson: {
          reading_program: { total: 3, correct: 2, score: 4, maxScore: 6 },
          completion_program: { total: 2, correct: 1, score: 2, maxScore: 4 },
        },
        perPrimaryKpJson: {
          "201": { total: 3, correct: 2, accuracy: 2 / 3 },
          "301": { total: 2, correct: 1, accuracy: 0.5 },
        },
        aiReportJson: {
          wrongs: [
            {
              slotNo: 16,
              questionType: "reading_program",
              subQuestionKey: "2",
              submittedAnswer: "D",
              correctAnswer: "B",
              points: 2,
              explanation: "阅读解析2",
            },
            {
              slotNo: 19,
              questionType: "completion_program",
              subQuestionKey: "2",
              submittedAnswer: "C",
              correctAnswer: "D",
              points: 2,
              explanation: "填空解析2",
            },
          ],
        },
        reportStatus: "completed",
      },
    ]);
    queuedResults.push([{ id: "paper-2", status: "completed" }]);

    const app = createTestApp();
    const res = await supertest(app).post("/api/v1/attempts/attempt-2/submit").send({});

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      id: "attempt-2",
      paperId: "paper-2",
      status: "submitted",
      answersJson: {
        "16": {
          subAnswers: { "1": "A", "2": "D", "3": "C" },
          updatedAt: "2026-04-26T00:20:00.000Z",
        },
        "19": {
          subAnswers: { "1": "A", "2": "C" },
          updatedAt: "2026-04-26T00:21:00.000Z",
        },
      },
      submittedAt: "2026-04-26T00:30:00.000Z",
      score: 6,
      perSectionJson: {
        reading_program: { total: 3, correct: 2, score: 4, maxScore: 6 },
        completion_program: { total: 2, correct: 1, score: 2, maxScore: 4 },
      },
      perPrimaryKpJson: {
        "201": { total: 3, correct: 2, accuracy: 2 / 3 },
        "301": { total: 2, correct: 1, accuracy: 0.5 },
      },
      reportStatus: "completed",
      report: {
        wrongs: [
          {
            slotNo: 16,
            questionType: "reading_program",
            subQuestionKey: "2",
            submittedAnswer: "D",
            correctAnswer: "B",
            points: 2,
            explanation: "阅读解析2",
          },
          {
            slotNo: 19,
            questionType: "completion_program",
            subQuestionKey: "2",
            submittedAnswer: "C",
            correctAnswer: "D",
            points: 2,
            explanation: "填空解析2",
          },
        ],
      },
    });

    const attemptUpdateQuery = mockDb.update.mock.results[0]?.value;
    expect(attemptUpdateQuery?.set).toHaveBeenCalledWith(
      expect.objectContaining({
        score: 6,
        perSectionJson: {
          reading_program: { total: 3, correct: 2, score: 4, maxScore: 6 },
          completion_program: { total: 2, correct: 1, score: 2, maxScore: 4 },
        },
        aiReportJson: {
          wrongs: [
            expect.objectContaining({ slotNo: 16, subQuestionKey: "2", explanation: "阅读解析2" }),
            expect.objectContaining({ slotNo: 19, subQuestionKey: "2", explanation: "填空解析2" }),
          ],
        },
        reportStatus: "completed",
      }),
    );
    expect(cancelAttemptAutoSubmitMock).toHaveBeenCalledWith("auto-submit-2");
  });

  it("auto-submits an expired attempt and persists basic grading aggregates", async () => {
    queuedResults.push([
      {
        id: "attempt-1",
        paperId: "paper-1",
        status: "started",
        startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        answersJson: {
          "1": {
            subAnswers: { "0": "A" },
            updatedAt: "2026-04-26T00:05:00.000Z",
          },
        },
        submittedAt: null,
      },
    ]);
    queuedResults.push([
      {
        id: "paper-1",
        examType: "GESP-1",
      },
    ]);
    queuedResults.push([
      {
        slotNo: 1,
        questionType: "single_choice",
        primaryKpId: 101,
        points: 2,
        answerJson: { answer: "A" },
      },
    ]);
    queuedResults.push([
      {
        id: "attempt-1",
        paperId: "paper-1",
        status: "auto_submitted",
        answersJson: {
          "1": {
            subAnswers: { "0": "A" },
            updatedAt: "2026-04-26T00:05:00.000Z",
          },
        },
        submittedAt: "2026-04-26T01:30:00.000Z",
        score: 2,
        perSectionJson: {
          single_choice: { total: 1, correct: 1, score: 2, maxScore: 2 },
        },
        perPrimaryKpJson: {
          "101": { total: 1, correct: 1, accuracy: 1 },
        },
      },
    ]);
    queuedResults.push([{ id: "paper-1", status: "completed" }]);

    const app = createTestApp();
    const res = await supertest(app).post("/api/v1/attempts/attempt-1/submit").send({});

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      id: "attempt-1",
      paperId: "paper-1",
      status: "auto_submitted",
      answersJson: {
        "1": {
          subAnswers: { "0": "A" },
          updatedAt: "2026-04-26T00:05:00.000Z",
        },
      },
      submittedAt: "2026-04-26T01:30:00.000Z",
      score: 2,
      perSectionJson: {
        single_choice: { total: 1, correct: 1, score: 2, maxScore: 2 },
      },
      perPrimaryKpJson: {
        "101": { total: 1, correct: 1, accuracy: 1 },
      },
    });

    const attemptUpdateQuery = mockDb.update.mock.results[0]?.value;
    expect(attemptUpdateQuery?.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "auto_submitted",
        score: 2,
      }),
    );
  });

  it("returns the user's current started attempt", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-26T00:30:00.000Z"));

    queuedResults.push([
      {
        id: "attempt-1",
        paperId: "paper-1",
        status: "started",
        tabNonce: "nonce-1",
        startedAt: new Date("2026-04-26T00:00:00.000Z"),
      },
    ]);
    queuedResults.push([
      {
        id: "paper-1",
        examType: "CSP-J",
        difficulty: "easy",
        assignmentId: null,
      },
    ]);

    const app = createTestApp();
    const res = await supertest(app).get("/api/v1/attempts/active");

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      id: "attempt-1",
      paperId: "paper-1",
      status: "started",
      tabNonce: "nonce-1",
      startedAt: "2026-04-26T00:00:00.000Z",
      submitAt: "2026-04-26T02:00:00.000Z",
      remainingMs: 90 * 60 * 1000,
      examType: "CSP-J",
      difficulty: "easy",
      assignmentId: null,
      resumePath: "/exams/paper-1",
    });

    vi.useRealTimers();
  });

  it("returns an active exam session payload with paper content and current answers", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-26T00:30:00.000Z"));

    queuedResults.push([
      {
        id: "paper-1",
        examType: "CSP-J",
        difficulty: "easy",
        status: "active",
        assignmentId: null,
      },
    ]);
    queuedResults.push([
      {
        id: "attempt-1",
        paperId: "paper-1",
        status: "started",
        tabNonce: "nonce-1",
        startedAt: new Date("2026-04-26T00:00:00.000Z"),
        answersJson: {
          "1": {
            subAnswers: { "0": "B" },
            updatedAt: "2026-04-26T00:10:00.000Z",
          },
          "16": {
            subAnswers: { "1": "A", "2": "C" },
            updatedAt: "2026-04-26T00:11:00.000Z",
          },
        },
      },
    ]);
    queuedResults.push([
      {
        slotNo: 1,
        questionType: "single_choice",
        primaryKpId: 101,
        points: 2,
        contentJson: {
          stem: "中国的国家顶级域名是（）",
          options: ["A. .cn", "B. .ch", "C. .chn", "D. .china"],
        },
      },
      {
        slotNo: 16,
        questionType: "reading_program",
        primaryKpId: 201,
        points: 4,
        contentJson: {
          stem: "阅读程序",
          cppCode: "int x = 1;",
          subQuestions: [
            {
              stem: "第一空答案是？",
              options: ["A. 1", "B. 2", "C. 3", "D. 4"],
            },
            {
              stem: "第二空答案是？",
              options: ["A. A", "B. B", "C. C", "D. D"],
            },
          ],
        },
      },
    ]);

    const app = createTestApp();
    const res = await supertest(app).get("/api/v1/exams/paper-1/session");

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      paper: {
        id: "paper-1",
        examType: "CSP-J",
        difficulty: "easy",
        status: "active",
        assignmentId: null,
      },
      attempt: {
        id: "attempt-1",
        paperId: "paper-1",
        status: "started",
        tabNonce: "nonce-1",
        startedAt: "2026-04-26T00:00:00.000Z",
        submitAt: "2026-04-26T02:00:00.000Z",
        remainingMs: 90 * 60 * 1000,
        answersJson: {
          "1": {
            subAnswers: { "0": "B" },
            updatedAt: "2026-04-26T00:10:00.000Z",
          },
          "16": {
            subAnswers: { "1": "A", "2": "C" },
            updatedAt: "2026-04-26T00:11:00.000Z",
          },
        },
      },
      items: [
        {
          slotNo: 1,
          questionType: "single_choice",
          primaryKpId: 101,
          points: 2,
          contentJson: {
            stem: "中国的国家顶级域名是（）",
            options: ["A. .cn", "B. .ch", "C. .chn", "D. .china"],
          },
        },
        {
          slotNo: 16,
          questionType: "reading_program",
          primaryKpId: 201,
          points: 4,
          contentJson: {
            stem: "阅读程序",
            cppCode: "int x = 1;",
            subQuestions: [
              {
                stem: "第一空答案是？",
                options: ["A. 1", "B. 2", "C. 3", "D. 4"],
              },
              {
                stem: "第二空答案是？",
                options: ["A. A", "B. B", "C. C", "D. D"],
              },
            ],
          },
        },
      ],
    });

    vi.useRealTimers();
  });

  it("returns a finalized exam result payload with aggregates, report, and slot details", async () => {
    queuedResults.push([
      {
        id: "paper-2",
        examType: "CSP-J",
        difficulty: "easy",
        status: "completed",
        assignmentId: null,
      },
    ]);
    queuedResults.push([
      {
        id: "attempt-2",
        paperId: "paper-2",
        status: "submitted",
        answersJson: {
          "16": {
            subAnswers: { "1": "A", "2": "D", "3": "C" },
            updatedAt: "2026-04-26T00:20:00.000Z",
          },
          "19": {
            subAnswers: { "1": "A", "2": "C" },
            updatedAt: "2026-04-26T00:21:00.000Z",
          },
        },
        submittedAt: "2026-04-26T00:30:00.000Z",
        score: 6,
        perSectionJson: {
          reading_program: { total: 3, correct: 2, score: 4, maxScore: 6 },
          completion_program: { total: 2, correct: 1, score: 2, maxScore: 4 },
        },
        perPrimaryKpJson: {
          "201": { total: 3, correct: 2, accuracy: 2 / 3 },
          "301": { total: 2, correct: 1, accuracy: 0.5 },
        },
        aiReportJson: {
          wrongs: [
            {
              slotNo: 16,
              questionType: "reading_program",
              subQuestionKey: "2",
              submittedAnswer: "D",
              correctAnswer: "B",
              points: 2,
              explanation: "阅读解析2",
            },
            {
              slotNo: 19,
              questionType: "completion_program",
              subQuestionKey: "2",
              submittedAnswer: "C",
              correctAnswer: "D",
              points: 2,
              explanation: "填空解析2",
            },
          ],
        },
        reportStatus: "completed",
      },
    ]);
    queuedResults.push([
      {
        slotNo: 16,
        questionType: "reading_program",
        primaryKpId: 201,
        points: 6,
        contentJson: { stem: "阅读程序题" },
        answerJson: { subAnswers: ["A", "B", "C"] },
        explanationJson: { subExplanations: ["阅读解析1", "阅读解析2", "阅读解析3"] },
      },
      {
        slotNo: 19,
        questionType: "completion_program",
        primaryKpId: 301,
        points: 4,
        contentJson: { stem: "完善程序题" },
        answerJson: {
          blanks: [
            { id: "blank-1", answer: "A" },
            { id: "blank-2", answer: "D" },
          ],
        },
        explanationJson: {
          blankExplanations: [
            { id: "blank-1", explanation: "填空解析1" },
            { id: "blank-2", explanation: "填空解析2" },
          ],
        },
      },
    ]);

    const app = createTestApp();
    const res = await supertest(app).get("/api/v1/exams/paper-2/result");

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      paper: {
        id: "paper-2",
        examType: "CSP-J",
        difficulty: "easy",
        status: "completed",
        assignmentId: null,
      },
      attempt: {
        id: "attempt-2",
        status: "submitted",
        submittedAt: "2026-04-26T00:30:00.000Z",
        score: 6,
        perSectionJson: {
          reading_program: { total: 3, correct: 2, score: 4, maxScore: 6 },
          completion_program: { total: 2, correct: 1, score: 2, maxScore: 4 },
        },
        perPrimaryKpJson: {
          "201": { total: 3, correct: 2, accuracy: 2 / 3 },
          "301": { total: 2, correct: 1, accuracy: 0.5 },
        },
        reportStatus: "completed",
        report: {
          wrongs: [
            {
              slotNo: 16,
              questionType: "reading_program",
              subQuestionKey: "2",
              submittedAnswer: "D",
              correctAnswer: "B",
              points: 2,
              explanation: "阅读解析2",
            },
            {
              slotNo: 19,
              questionType: "completion_program",
              subQuestionKey: "2",
              submittedAnswer: "C",
              correctAnswer: "D",
              points: 2,
              explanation: "填空解析2",
            },
          ],
        },
      },
      items: [
        {
          slotNo: 16,
          questionType: "reading_program",
          primaryKpId: 201,
          points: 6,
          contentJson: { stem: "阅读程序题" },
          submittedAnswers: { "1": "A", "2": "D", "3": "C" },
          result: {
            earnedScore: 4,
            maxScore: 6,
            correctCount: 2,
            totalCount: 3,
            subQuestions: [
              {
                key: "1",
                submittedAnswer: "A",
                correctAnswer: "A",
                isCorrect: true,
                points: 2,
                explanation: "阅读解析1",
              },
              {
                key: "2",
                submittedAnswer: "D",
                correctAnswer: "B",
                isCorrect: false,
                points: 2,
                explanation: "阅读解析2",
              },
              {
                key: "3",
                submittedAnswer: "C",
                correctAnswer: "C",
                isCorrect: true,
                points: 2,
                explanation: "阅读解析3",
              },
            ],
          },
        },
        {
          slotNo: 19,
          questionType: "completion_program",
          primaryKpId: 301,
          points: 4,
          contentJson: { stem: "完善程序题" },
          submittedAnswers: { "1": "A", "2": "C" },
          result: {
            earnedScore: 2,
            maxScore: 4,
            correctCount: 1,
            totalCount: 2,
            subQuestions: [
              {
                key: "1",
                submittedAnswer: "A",
                correctAnswer: "A",
                isCorrect: true,
                points: 2,
                explanation: "填空解析1",
              },
              {
                key: "2",
                submittedAnswer: "C",
                correctAnswer: "D",
                isCorrect: false,
                points: 2,
                explanation: "填空解析2",
              },
            ],
          },
        },
      ],
    });
  });

  it("returns paginated finalized attempts for the current user", async () => {
    queuedResults.push([
      {
        id: "attempt-3",
        paperId: "paper-3",
        examType: "CSP-J",
        difficulty: "easy",
        status: "auto_submitted",
        score: 84,
        submittedAt: "2026-04-26T10:00:00.000Z",
      },
      {
        id: "attempt-2",
        paperId: "paper-2",
        examType: "GESP-1",
        difficulty: "medium",
        status: "submitted",
        score: 91,
        submittedAt: "2026-04-25T10:00:00.000Z",
      },
    ]);

    const app = createTestApp();
    const res = await supertest(app).get("/api/v1/users/me/attempts?page=2&pageSize=1");

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      items: [
        {
          id: "attempt-2",
          paperId: "paper-2",
          examType: "GESP-1",
          difficulty: "medium",
          status: "submitted",
          score: 91,
          submittedAt: "2026-04-25T10:00:00.000Z",
        },
      ],
      page: 2,
      pageSize: 1,
      total: 2,
    });
  });

  it("returns stats aggregated from finalized attempts", async () => {
    queuedResults.push([
      {
        id: "attempt-3",
        score: 84,
        status: "auto_submitted",
        submittedAt: "2026-04-26T10:00:00.000Z",
        perPrimaryKpJson: {
          "201": { total: 3, correct: 1, accuracy: 1 / 3 },
          "301": { total: 2, correct: 2, accuracy: 1 },
        },
      },
      {
        id: "attempt-2",
        score: 91,
        status: "submitted",
        submittedAt: "2026-04-25T10:00:00.000Z",
        perPrimaryKpJson: {
          "201": { total: 2, correct: 2, accuracy: 1 },
          "401": { total: 4, correct: 1, accuracy: 0.25 },
        },
      },
    ]);

    const app = createTestApp();
    const res = await supertest(app).get("/api/v1/users/me/stats");

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      totalAttempts: 2,
      averageScore: 87.5,
      bestScore: 91,
      latestSubmittedAt: "2026-04-26T10:00:00.000Z",
      weakPrimaryKps: [
        { kpId: "401", total: 4, correct: 1, accuracy: 0.25 },
        { kpId: "201", total: 5, correct: 3, accuracy: 0.6 },
        { kpId: "301", total: 2, correct: 2, accuracy: 1 },
      ],
    });
  });
});
