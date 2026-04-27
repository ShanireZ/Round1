import express from "express";
import supertest from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, insertReturningMock, insertValuesMock, updateSetMock, updateWhereMock } =
  vi.hoisted(() => {
    const insertReturningMock = vi.fn();
    const insertValuesMock = vi.fn(() => ({ returning: insertReturningMock }));
    const updateWhereMock = vi.fn();
    const updateSetMock = vi.fn(() => ({ where: updateWhereMock }));

    const mockDb = {
      insert: vi.fn(() => ({ values: insertValuesMock })),
      update: vi.fn(() => ({ set: updateSetMock })),
    };

    return {
      mockDb,
      insertReturningMock,
      insertValuesMock,
      updateSetMock,
      updateWhereMock,
    };
  });

vi.mock("../db.js", () => ({
  db: mockDb,
}));

import { responseWrapper } from "../middleware/responseWrapper.js";
import { adminAudit } from "../middleware/adminAudit.js";

function createTestApp(handler: express.RequestHandler) {
  const app = express();
  app.use(express.json());
  app.use(responseWrapper);
  app.use((req, _res, next) => {
    req.session = {
      userId: "00000000-0000-0000-0000-000000000001",
      role: "admin",
      sessionVersion: 1,
      createdAt: Date.now(),
      lastStrongAuthAt: Date.now(),
      totpPendingSecret: "",
    };
    next();
  });
  app.post("/admin/questions/:id/publish", adminAudit("publish_question", "question"), handler);
  return app;
}

describe("adminAudit middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertReturningMock.mockResolvedValue([{ id: "audit-1" }]);
    updateWhereMock.mockResolvedValue(undefined);
  });

  it("fails closed before the handler when the audit row cannot be created", async () => {
    insertReturningMock.mockRejectedValueOnce(new Error("audit database unavailable"));
    const handler = vi.fn((_req: express.Request, res: express.Response) => {
      res.ok({ id: "q1" });
    });

    const response = await supertest(createTestApp(handler)).post("/admin/questions/q1/publish");

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      success: false,
      error: {
        code: "ROUND1_ADMIN_AUDIT_FAILED",
        message: "Admin audit log write failed; please retry.",
      },
    });
    expect(handler).not.toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("updates the pre-created audit row before sending a success response", async () => {
    const handler = vi.fn((_req: express.Request, res: express.Response) => {
      res.locals.adminAudit.before = { id: "q1", status: "reviewed" };
      res.locals.adminAudit.after = { id: "q1", status: "published" };
      res.locals.adminAudit.targetId = "q1";
      res.ok({ id: "q1", status: "published" });
    });

    const response = await supertest(createTestApp(handler)).post("/admin/questions/q1/publish");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: { id: "q1", status: "published" },
    });
    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "publish_question",
        targetType: "question",
        targetId: "q1",
      }),
    );
    expect(updateSetMock).toHaveBeenCalledWith({
      targetId: "q1",
      beforeJson: { id: "q1", status: "reviewed" },
      afterJson: { id: "q1", status: "published" },
      reauthMethod: "session",
    });
    expect(updateWhereMock).toHaveBeenCalledTimes(1);
  });
});
