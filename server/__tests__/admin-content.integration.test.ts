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

const { importQuestionBundleMock, importPrebuiltPaperBundleMock } = vi.hoisted(() => ({
  importQuestionBundleMock: vi.fn(),
  importPrebuiltPaperBundleMock: vi.fn(),
}));

const { redisPublishMock } = vi.hoisted(() => ({
  redisPublishMock: vi.fn(),
}));

vi.mock("../db.js", () => ({
  db: mockDb,
  checkDbConnection: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../redis.js", () => ({
  redisClient: {
    isOpen: true,
    publish: redisPublishMock,
    duplicate: vi.fn(),
  },
  ioRedisClient: {},
}));

vi.mock("../middleware/auth.js", () => ({
  requireAuth: (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
    next(),
  requireRole: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
    next(),
}));

vi.mock("../middleware/requireRecentAuth.js", () => ({
  requireRecentAuth: (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
    next(),
}));

vi.mock("../middleware/adminAudit.js", () => ({
  adminAudit: () => (_req: express.Request, res: express.Response, next: express.NextFunction) => {
    res.locals.adminAudit = {};
    next();
  },
}));

vi.mock("../services/auth/blocklistService.js", () => ({
  getStats: vi.fn(),
  listDomains: vi.fn(),
  addDomain: vi.fn(),
  removeDomain: vi.fn(),
  renameDomain: vi.fn(),
  syncFromGitHub: vi.fn(),
}));

vi.mock("../../scripts/lib/questionBundleWorkflow.js", () => ({
  importQuestionBundle: importQuestionBundleMock,
}));

vi.mock("../../scripts/lib/prebuiltPaperBundleWorkflow.js", () => ({
  importPrebuiltPaperBundle: importPrebuiltPaperBundleMock,
}));

import { responseWrapper } from "../middleware/responseWrapper.js";
import { adminRouter } from "../routes/admin.js";
import { QuestionQuerySchema } from "../routes/schemas/questionBank.schema.js";
import * as schema from "../db/schema/index.js";
import { importBatches, papers, prebuiltPaperSlots, prebuiltPapers } from "../db/schema/index.js";
import { env } from "../../config/env.js";

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use(responseWrapper);
  app.use("/api/v1", adminRouter);
  app.use(
    (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(500).json({ success: false, error: { code: "TEST_ERROR", message: err.message } });
    },
  );
  return app;
}

describe("admin content api", () => {
  beforeEach(() => {
    queuedResults.length = 0;
    vi.clearAllMocks();
    importQuestionBundleMock.mockReset();
    importPrebuiltPaperBundleMock.mockReset();
    redisPublishMock.mockReset();
    redisPublishMock.mockResolvedValue(2);
  });

  it("exports the new offline content schema tables", () => {
    expect(prebuiltPapers).toBeDefined();
    expect(prebuiltPaperSlots).toBeDefined();
    expect(importBatches).toBeDefined();
  });

  it("removes legacy replacement and cooldown schema surfaces", () => {
    expect("paperQuestionReplacements" in schema).toBe(false);
    expect("examCooldowns" in schema).toBe(false);
    expect("replacementCount" in papers).toBe(false);
    expect("ROUND1_EXAM_COOLDOWN_SECONDS" in env).toBe(false);
  });

  it("accepts reviewed lifecycle statuses and rejects legacy question statuses in admin query schema", () => {
    const reviewed = QuestionQuerySchema.parse({ status: "reviewed" });
    const published = QuestionQuerySchema.parse({ status: "published" });
    const archived = QuestionQuerySchema.parse({ status: "archived" });

    expect(reviewed.status).toBe("reviewed");
    expect(published.status).toBe("published");
    expect(archived.status).toBe("archived");
    expect(() => QuestionQuerySchema.parse({ status: "active" })).toThrow();
    expect(() => QuestionQuerySchema.parse({ status: "rejected" })).toThrow();
  });

  it("removes legacy admin inventory and manual generation endpoints", async () => {
    const app = createTestApp();

    const bucketCountersRes = await supertest(app).get("/api/v1/admin/bucket-counters");
    const manualJobsRes = await supertest(app).get("/api/v1/admin/manual-jobs");
    const triggerInventoryRes = await supertest(app)
      .post("/api/v1/admin/trigger-inventory")
      .send({ examType: "CSP-J" });
    const generationJobsRes = await supertest(app).get("/api/v1/admin/generation-jobs");

    expect(bucketCountersRes.status).toBe(404);
    expect(manualJobsRes.status).toBe(404);
    expect(triggerInventoryRes.status).toBe(404);
    expect(generationJobsRes.status).toBe(404);
  });

  it("lists prebuilt papers from the new admin endpoint", async () => {
    queuedResults.push([{ count: 0 }], []);
    const app = createTestApp();

    const res = await supertest(app).get("/api/v1/admin/prebuilt-papers");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.items).toEqual([]);
  });

  it("lists import batches from the new admin endpoint", async () => {
    queuedResults.push([{ count: 0 }], []);
    const app = createTestApp();

    const res = await supertest(app).get("/api/v1/admin/import-batches");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.items).toEqual([]);
  });

  it("returns question reference summaries for admin delete/archive decisions", async () => {
    queuedResults.push([{ count: 2 }], [{ count: 1 }]);
    const app = createTestApp();

    const res = await supertest(app).get("/api/v1/admin/questions/question-1/references");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.prebuiltPaperReferences).toBe(2);
    expect(res.body.data.paperInstanceReferences).toBe(1);
    expect(res.body.data.totalReferences).toBe(3);
    expect(res.body.data.canDelete).toBe(false);
  });

  it("returns prebuilt paper reference summaries for admin delete/archive decisions", async () => {
    queuedResults.push([{ count: 1 }], [{ count: 2 }]);
    const app = createTestApp();

    const res = await supertest(app).get("/api/v1/admin/prebuilt-papers/paper-1/references");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.paperInstanceReferences).toBe(1);
    expect(res.body.data.assignmentReferences).toBe(2);
    expect(res.body.data.totalReferences).toBe(3);
    expect(res.body.data.canDelete).toBe(false);
  });

  it("lists the real-paper review queue", async () => {
    queuedResults.push(
      [{ count: 1 }],
      [
        {
          id: "review-1",
          questionId: "question-1",
          reviewStatus: "ai_reviewed",
          aiConfidence: 0.92,
        },
      ],
    );
    const app = createTestApp();

    const res = await supertest(app).get("/api/v1/admin/question-reviews?status=ai_reviewed");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].reviewStatus).toBe("ai_reviewed");
    expect(res.body.data.pagination.total).toBe(1);
  });

  it("lists default runtime settings and allows audited setting updates", async () => {
    queuedResults.push([]);
    queuedResults.push(
      [],
      [{ key: "exam.autosaveIntervalSeconds", valueJson: 20 }],
      [{ key: "exam.autosaveIntervalSeconds", valueJson: 20 }],
    );
    const app = createTestApp();

    const listRes = await supertest(app).get("/api/v1/admin/settings");
    const patchRes = await supertest(app)
      .patch("/api/v1/admin/settings/exam.autosaveIntervalSeconds")
      .send({ valueJson: 20 });

    expect(listRes.status).toBe(200);
    expect(listRes.body.success).toBe(true);
    expect(listRes.body.data.items.some((item: { key: string }) => item.key === "exam.autosaveIntervalSeconds")).toBe(
      true,
    );

    expect(patchRes.status).toBe(201);
    expect(patchRes.body.success).toBe(true);
    expect(patchRes.body.data.key).toBe("exam.autosaveIntervalSeconds");
    expect(patchRes.body.data.valueJson).toBe(20);
    expect(patchRes.body.data.configChange.channel).toBe("config:change");
    expect(patchRes.body.data.configChange.published).toBe(true);
    expect(patchRes.body.data.configChange.subscriberCount).toBe(2);
    expect(redisPublishMock).toHaveBeenCalledTimes(1);
    expect(redisPublishMock.mock.calls[0]?.[0]).toBe("config:change");
    expect(JSON.parse(redisPublishMock.mock.calls[0]?.[1] as string)).toMatchObject({
      key: "exam.autosaveIntervalSeconds",
      source: "admin-settings",
    });
  });

  it("publishes and archives questions through lifecycle endpoints", async () => {
    queuedResults.push([{ id: "question-1", status: "reviewed", type: "single_choice", sandboxVerified: false }]);
    queuedResults.push([{ id: "question-1", status: "published" }]);
    queuedResults.push([{ id: "question-1", status: "published" }]);
    queuedResults.push([{ id: "question-1", status: "archived" }]);
    const app = createTestApp();

    const publishRes = await supertest(app).post("/api/v1/admin/questions/question-1/publish");
    const archiveRes = await supertest(app).post("/api/v1/admin/questions/question-1/archive");

    expect(publishRes.status).toBe(200);
    expect(publishRes.body.success).toBe(true);
    expect(publishRes.body.data.status).toBe("published");

    expect(archiveRes.status).toBe(200);
    expect(archiveRes.body.success).toBe(true);
    expect(archiveRes.body.data.status).toBe("archived");
  });

  it("prevents publishing questions before review", async () => {
    queuedResults.push([{ id: "question-1", status: "draft", type: "single_choice", sandboxVerified: false }]);
    const app = createTestApp();

    const publishRes = await supertest(app).post("/api/v1/admin/questions/question-1/publish");

    expect(publishRes.status).toBe(409);
    expect(publishRes.body.success).toBe(false);
    expect(publishRes.body.error.message).toContain("reviewed");
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("rejects publishing unverified code questions", async () => {
    queuedResults.push([{ id: "question-1", status: "reviewed", type: "reading_program", sandboxVerified: false }]);
    const app = createTestApp();

    const publishRes = await supertest(app).post("/api/v1/admin/questions/question-1/publish");

    expect(publishRes.status).toBe(409);
    expect(publishRes.body.success).toBe(false);
    expect(publishRes.body.error.code).toBe("ROUND1_CONFLICT");
    expect(publishRes.body.error.message).toContain("sandboxVerified");
  });

  it("confirms questions into the reviewed lifecycle state", async () => {
    queuedResults.push(
      [{ id: "question-1", status: "draft" }],
      [{ id: "review-1" }],
      [{ id: "review-1", reviewStatus: "confirmed" }],
      [{ id: "question-1", status: "reviewed" }],
    );
    const app = createTestApp();

    const confirmRes = await supertest(app).post("/api/v1/admin/questions/question-1/confirm");

    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.success).toBe(true);
    expect(confirmRes.body.data.status).toBe("reviewed");
    expect(confirmRes.body.data.reviewStatus).toBe("confirmed");
    expect(mockDb.update).toHaveBeenCalledWith(schema.questionReviews);
  });

  it("rejects question reviews and keeps the question in draft", async () => {
    queuedResults.push(
      [{ id: "question-1", status: "draft" }],
      [{ id: "review-1" }],
      [{ id: "review-1", reviewStatus: "rejected" }],
      [{ id: "question-1", status: "draft" }],
    );
    const app = createTestApp();

    const rejectRes = await supertest(app)
      .post("/api/v1/admin/questions/question-1/reject")
      .send({ reviewerNotes: "official key is not trustworthy" });

    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.success).toBe(true);
    expect(rejectRes.body.data.status).toBe("draft");
    expect(rejectRes.body.data.reviewStatus).toBe("rejected");
    expect(mockDb.update).toHaveBeenCalledWith(schema.questionReviews);
  });

  it("returns prebuilt paper detail and supports publish/archive lifecycle", async () => {
    queuedResults.push([{ id: "paper-1", title: "Paper A", status: "draft" }]);
    queuedResults.push([{ slotNo: 1, questionId: "question-1" }]);
    queuedResults.push([{ id: "paper-1", status: "draft" }]);
    queuedResults.push([{ id: "paper-1", status: "published" }]);
    queuedResults.push([{ id: "paper-1", status: "published" }]);
    queuedResults.push([{ id: "paper-1", status: "archived" }]);
    const app = createTestApp();

    const detailRes = await supertest(app).get("/api/v1/admin/prebuilt-papers/paper-1");
    const publishRes = await supertest(app).post("/api/v1/admin/prebuilt-papers/paper-1/publish");
    const archiveRes = await supertest(app).post("/api/v1/admin/prebuilt-papers/paper-1/archive");

    expect(detailRes.status).toBe(200);
    expect(detailRes.body.success).toBe(true);
    expect(detailRes.body.data.id).toBe("paper-1");
    expect(detailRes.body.data.slots).toHaveLength(1);

    expect(publishRes.status).toBe(200);
    expect(publishRes.body.success).toBe(true);
    expect(publishRes.body.data.status).toBe("published");

    expect(archiveRes.status).toBe(200);
    expect(archiveRes.body.success).toBe(true);
    expect(archiveRes.body.data.status).toBe("archived");
  });

  it("prevents publishing an already published prebuilt paper in place", async () => {
    queuedResults.push([{ id: "paper-1", status: "published" }]);
    const app = createTestApp();

    const publishRes = await supertest(app).post("/api/v1/admin/prebuilt-papers/paper-1/publish");

    expect(publishRes.status).toBe(409);
    expect(publishRes.body.success).toBe(false);
    expect(publishRes.body.error.message).toContain("复制为新的 draft");
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("creates, edits, and deletes draft questions", async () => {
    queuedResults.push(
      [{ id: "question-1", status: "draft", difficulty: "easy" }],
      [],
      [],
      [{ id: "question-1", status: "draft" }],
      [{ id: "question-1", status: "draft", difficulty: "medium" }],
      [],
      [],
      [{ id: "question-1", status: "draft" }],
      [],
      [],
      [],
      [],
      [],
    );
    const app = createTestApp();

    const createRes = await supertest(app)
      .post("/api/v1/admin/questions")
      .send({
        type: "single_choice",
        difficulty: "easy",
        primaryKpId: 101,
        examTypes: ["CSP-J"],
        contentHash: "hash-question-1",
        contentJson: { stem: "Q1" },
        answerJson: { answer: "A" },
        explanationJson: { explanation: "Because" },
        source: "manual",
        sandboxVerified: false,
      });

    const patchRes = await supertest(app)
      .patch("/api/v1/admin/questions/question-1")
      .send({
        difficulty: "medium",
        examTypes: ["CSP-S"],
      });

    const deleteRes = await supertest(app).delete("/api/v1/admin/questions/question-1");

    expect(createRes.status).toBe(201);
    expect(createRes.body.success).toBe(true);
    expect(createRes.body.data.id).toBe("question-1");

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.success).toBe(true);
    expect(patchRes.body.data.difficulty).toBe("medium");

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.success).toBe(true);
  });

  it("creates, edits, and deletes draft prebuilt papers", async () => {
    queuedResults.push(
      [{ id: "paper-1", status: "draft", title: "Paper A" }],
      [],
      [{ id: "paper-1", status: "draft" }],
      [{ id: "paper-1", status: "draft", title: "Paper B" }],
      [],
      [],
      [{ id: "paper-1", status: "draft" }],
      [],
      [],
      [],
      [],
    );
    const app = createTestApp();

    const createRes = await supertest(app)
      .post("/api/v1/admin/prebuilt-papers")
      .send({
        title: "Paper A",
        examType: "CSP-J",
        difficulty: "easy",
        blueprintVersion: 1,
        metadataJson: { source: "manual" },
        slots: [
          {
            slotNo: 1,
            questionId: "question-1",
            questionType: "single_choice",
            primaryKpId: 101,
            difficulty: "easy",
            points: 10,
          },
        ],
      });

    const patchRes = await supertest(app)
      .patch("/api/v1/admin/prebuilt-papers/paper-1")
      .send({
        title: "Paper B",
        slots: [
          {
            slotNo: 1,
            questionId: "question-2",
            questionType: "single_choice",
            primaryKpId: 102,
            difficulty: "medium",
            points: 15,
          },
        ],
      });

    const deleteRes = await supertest(app).delete("/api/v1/admin/prebuilt-papers/paper-1");

    expect(createRes.status).toBe(201);
    expect(createRes.body.success).toBe(true);
    expect(createRes.body.data.id).toBe("paper-1");

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.success).toBe(true);
    expect(patchRes.body.data.title).toBe("Paper B");

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.success).toBe(true);
  });

  it("copies a prebuilt paper into a new draft lineage version", async () => {
    queuedResults.push([{ id: "paper-1", status: "published", rootPaperId: "paper-root", versionNo: 3 }], []);
    queuedResults.push([{ slotNo: 1, questionId: "question-1" }]);
    queuedResults.push([
      {
        id: "paper-2",
        status: "draft",
        rootPaperId: "paper-root",
        parentPaperId: "paper-1",
        versionNo: 4,
      },
    ]);
    const app = createTestApp();

    const res = await supertest(app).post("/api/v1/admin/prebuilt-papers/paper-1/copy-version");

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe("paper-2");
    expect(res.body.data.status).toBe("draft");
    expect(res.body.data.rootPaperId).toBe("paper-root");
    expect(res.body.data.parentPaperId).toBe("paper-1");
    expect(res.body.data.versionNo).toBe(4);
  });

  it("records question bundle dry-run and apply imports", async () => {
    importQuestionBundleMock
      .mockResolvedValueOnce({
        id: "batch-q-dry",
        status: "dry_run",
        summary: {
          totalCount: 1,
          importedCount: 1,
          rejectedCount: 0,
          errors: [],
        },
        persisted: true,
        duplicateChecksSkipped: false,
      })
      .mockResolvedValueOnce({
        id: "batch-q-apply",
        status: "applied",
        summary: {
          totalCount: 1,
          importedCount: 1,
          rejectedCount: 0,
          errors: [],
        },
        persisted: true,
        duplicateChecksSkipped: false,
      });
    const app = createTestApp();
    const body = {
      meta: {
        bundleType: "question_bundle",
        schemaVersion: "2026-04-26.1",
        runId: "2026-04-25-admin-import-csp-j-easy-v01",
        createdAt: "2026-04-25T00:00:00.000Z",
        generatedAt: "2026-04-25T00:00:00.000Z",
        provider: "fixture",
        model: "fixture-model",
        promptHash: "1111111111111111111111111111111111111111111111111111111111111111",
        sourceBatchId: "fixture-question-bundle:CSP-J:single_choice:BAS:easy:2026-04-25T00:00:00.000Z",
        sourceBatchIds: [
          "fixture-question-bundle:CSP-J:single_choice:BAS:easy:2026-04-25T00:00:00.000Z",
        ],
        sourceTimestamp: "2026-04-25T00:00:00.000Z",
        examType: "CSP-J",
        questionType: "single_choice",
        primaryKpCode: "BAS",
        difficulty: "easy",
        requestedCount: 1,
      },
      items: [
        {
          type: "single_choice",
          difficulty: "easy",
          primaryKpCode: "BAS",
          auxiliaryKpCodes: [],
          examTypes: ["CSP-J"],
          contentHash: "07cbb12a289e1968caeea8f881551d0aaa67784e9a0c3010a43cb79d2ccb71f4",
          contentJson: {
            stem: "2+2 等于多少？",
            options: ["A. 1", "B. 2", "C. 4", "D. 8"],
          },
          answerJson: { answer: "A" },
          explanationJson: { explanation: "Because" },
          source: "manual",
          sandboxVerified: false,
        },
      ],
    };

    const dryRunRes = await supertest(app)
      .post("/api/v1/admin/import-batches/questions/dry-run")
      .send(body);
    const applyRes = await supertest(app)
      .post("/api/v1/admin/import-batches/questions/apply")
      .send(body);

    expect(dryRunRes.status).toBe(200);
    expect(dryRunRes.body.success).toBe(true);
    expect(dryRunRes.body.data.status).toBe("dry_run");
    expect(dryRunRes.body.data.summary.importedCount).toBe(1);
    expect(dryRunRes.body.data.summary.rejectedCount).toBe(0);
    expect(dryRunRes.body.data.summary.errors).toEqual([]);

    expect(applyRes.status).toBe(201);
    expect(applyRes.body.success).toBe(true);
    expect(applyRes.body.data.status).toBe("applied");
    expect(applyRes.body.data.summary.importedCount).toBe(1);
    expect(applyRes.body.data.summary.rejectedCount).toBe(0);
    expect(applyRes.body.data.summary.errors).toEqual([]);
    expect(importQuestionBundleMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        bundle: expect.objectContaining({
          meta: expect.objectContaining({ bundleType: "question_bundle" }),
        }),
        sourceFilename: "admin-question-bundle.json",
      }),
      { apply: false, importedBy: null },
    );
    expect(importQuestionBundleMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        bundle: expect.objectContaining({
          meta: expect.objectContaining({ bundleType: "question_bundle" }),
        }),
        sourceFilename: "admin-question-bundle.json",
      }),
      { apply: true, importedBy: null },
    );
  });

  it("rejects applying unverified code questions from bundle import", async () => {
    const app = createTestApp();
    const body = {
      meta: {
        bundleType: "question_bundle",
        schemaVersion: "2026-04-26.1",
        runId: "2026-04-25-admin-code-csp-j-easy-v01",
        createdAt: "2026-04-25T00:00:00.000Z",
        generatedAt: "2026-04-25T00:00:00.000Z",
        provider: "fixture",
        model: "fixture-model",
        promptHash: "2222222222222222222222222222222222222222222222222222222222222222",
        sourceBatchId: "fixture-question-bundle:CSP-J:reading_program:BAS:easy:2026-04-25T00:00:00.000Z",
        sourceBatchIds: [
          "fixture-question-bundle:CSP-J:reading_program:BAS:easy:2026-04-25T00:00:00.000Z",
        ],
        sourceTimestamp: "2026-04-25T00:00:00.000Z",
        examType: "CSP-J",
        questionType: "reading_program",
        primaryKpCode: "BAS",
        difficulty: "easy",
        requestedCount: 1,
      },
      items: [
        {
          type: "reading_program",
          difficulty: "easy",
          primaryKpCode: "BAS",
          auxiliaryKpCodes: [],
          examTypes: ["CSP-J"],
          contentHash: "hash-import-question-code-1",
          contentJson: {
            stem: "程序输出什么？",
            cppCode: "#include <iostream>\nint main(){std::cout<<1;}",
            subQuestions: [{ stem: "输出？", options: ["A", "B", "C", "D"] }],
            sampleInputs: [""],
            expectedOutputs: ["1"],
          },
          answerJson: { subQuestions: [{ answer: "A" }] },
          explanationJson: { explanation: "Because" },
          source: "manual",
          sandboxVerified: false,
        },
      ],
    };

    const applyRes = await supertest(app)
      .post("/api/v1/admin/import-batches/questions/apply")
      .send(body);

    expect(applyRes.status).toBe(409);
    expect(applyRes.body.success).toBe(false);
    expect(applyRes.body.error.code).toBe("ROUND1_CONFLICT");
    expect(applyRes.body.error.message).toContain("sandboxVerified");
    expect(mockDb.transaction).not.toHaveBeenCalled();
    expect(importQuestionBundleMock).not.toHaveBeenCalled();
  });

  it("records prebuilt paper bundle dry-run and apply imports", async () => {
    importPrebuiltPaperBundleMock
      .mockResolvedValueOnce({
        id: "batch-p-dry",
        status: "dry_run",
        summary: {
          totalCount: 1,
          importedCount: 1,
          rejectedCount: 0,
          errors: [],
        },
        persisted: true,
        dbChecksSkipped: false,
      })
      .mockResolvedValueOnce({
        id: "batch-p-apply",
        status: "applied",
        summary: {
          totalCount: 1,
          importedCount: 1,
          rejectedCount: 0,
          errors: [],
        },
        persisted: true,
        dbChecksSkipped: false,
      });
    const app = createTestApp();
    const body = {
      meta: {
        bundleType: "prebuilt_paper_bundle",
        schemaVersion: "2026-04-26.1",
        runId: "2026-04-25-admin-prebuilt-csp-j-easy-v01",
        createdAt: "2026-04-25T00:00:00.000Z",
        builtAt: "2026-04-25T00:00:00.000Z",
        sourceBatchId: "fixture-prebuilt-paper-bundle:CSP-J:easy:2026-04-25T00:00:00.000Z",
        sourceBatchIds: [
          "fixture-prebuilt-paper-bundle:CSP-J:easy:2026-04-25T00:00:00.000Z",
        ],
        sourceTimestamp: "2026-04-25T00:00:00.000Z",
        examType: "CSP-J",
        difficulty: "easy",
        requestedCount: 1,
        blueprintVersion: 1,
      },
      items: [
        {
          title: "Imported Paper 1",
          examType: "CSP-J",
          difficulty: "easy",
          blueprintVersion: 1,
          metadataJson: { overlapScore: 0.1 },
          slots: [
            {
              slotNo: 1,
              questionId: "11111111-1111-4111-8111-111111111111",
              questionType: "single_choice",
              primaryKpId: 101,
              difficulty: "easy",
              points: 10,
            },
          ],
        },
      ],
    };

    const dryRunRes = await supertest(app)
      .post("/api/v1/admin/import-batches/prebuilt-papers/dry-run")
      .send(body);
    const applyRes = await supertest(app)
      .post("/api/v1/admin/import-batches/prebuilt-papers/apply")
      .send(body);

    expect(dryRunRes.status).toBe(200);
    expect(dryRunRes.body.success).toBe(true);
    expect(dryRunRes.body.data.status).toBe("dry_run");
    expect(dryRunRes.body.data.summary.importedCount).toBe(1);
    expect(dryRunRes.body.data.summary.rejectedCount).toBe(0);
    expect(dryRunRes.body.data.summary.errors).toEqual([]);

    expect(applyRes.status).toBe(201);
    expect(applyRes.body.success).toBe(true);
    expect(applyRes.body.data.status).toBe("applied");
    expect(applyRes.body.data.summary.importedCount).toBe(1);
    expect(applyRes.body.data.summary.rejectedCount).toBe(0);
    expect(applyRes.body.data.summary.errors).toEqual([]);
    expect(importPrebuiltPaperBundleMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        bundle: expect.objectContaining({
          meta: expect.objectContaining({ bundleType: "prebuilt_paper_bundle" }),
        }),
        sourceFilename: "admin-prebuilt-paper-bundle.json",
      }),
      { apply: false, importedBy: null },
    );
    expect(importPrebuiltPaperBundleMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        bundle: expect.objectContaining({
          meta: expect.objectContaining({ bundleType: "prebuilt_paper_bundle" }),
        }),
        sourceFilename: "admin-prebuilt-paper-bundle.json",
      }),
      { apply: true, importedBy: null },
    );
  });
});
