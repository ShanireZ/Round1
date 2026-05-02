import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { insertCalls, updateCalls, mockDb, judgeRealPaperQuestionMock } = vi.hoisted(() => {
  const insertCalls: Array<{ target: unknown; values: unknown }> = [];
  const updateCalls: Array<{ target: unknown; values: Record<string, unknown> }> = [];

  function makeThenable<T>(result: T) {
    return {
      then(onFulfilled: (value: T) => unknown, onRejected?: (reason: unknown) => unknown) {
        return Promise.resolve(result).then(onFulfilled, onRejected);
      },
    };
  }

  function makeQuery<T>(result: T) {
    const query = {
      from() {
        return query;
      },
      where() {
        return query;
      },
      limit() {
        return query;
      },
      returning() {
        return makeThenable(result);
      },
      ...makeThenable(result),
    };

    return query;
  }

  const mockDb = {
    select: vi.fn(() => makeQuery([{ id: 7 }])),
    insert: vi.fn((target: unknown) => ({
      values(values: unknown) {
        insertCalls.push({ target, values });
        const valueRecord = values as Record<string, unknown>;
        if (valueRecord.reviewStatus) {
          return makeQuery([{ id: "review-1" }]);
        }

        if (valueRecord.contentHash) {
          return makeQuery([{ id: "question-1" }]);
        }

        return makeQuery([]);
      },
    })),
    update: vi.fn((target: unknown) => ({
      set(values: Record<string, unknown>) {
        updateCalls.push({ target, values });
        return {
          where: vi.fn(async () => []),
        };
      },
    })),
    transaction: vi.fn(async (callback: (tx: typeof mockDb) => unknown) => callback(mockDb)),
  };

  return {
    insertCalls,
    updateCalls,
    mockDb,
    judgeRealPaperQuestionMock: vi.fn(),
  };
});

vi.mock("../../server/db.js", () => ({
  db: mockDb,
}));

vi.mock("../../server/services/deduplicationService.js", () => ({
  computeContentHash: vi.fn(() => "real-paper-hash-1"),
  isDuplicateByHash: vi.fn(async () => false),
}));

vi.mock("../../scripts/lib/realPaperAiReview.js", () => ({
  judgeRealPaperQuestion: judgeRealPaperQuestionMock,
}));

let tempDir: string | undefined;

async function writePaperFile() {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "round1-real-paper-"));
  await writeFile(
    path.join(tempDir, "sample.json"),
    JSON.stringify({
      examType: "CSP-J",
      year: 2026,
      source: "official-sample",
      questions: [
        {
          questionType: "single_choice",
          stem: "1 + 1 = ?",
          options: ["A. 1", "B. 2", "C. 3", "D. 4"],
          answer: "B",
          explanation: "2",
          difficulty: "easy",
          primaryKpCode: "BAS-01",
          auxiliaryKpCodes: [],
        },
      ],
    }),
    "utf8",
  );

  return tempDir;
}

describe("scripts/lib/realPaperIngest", () => {
  beforeEach(() => {
    vi.resetModules();
    insertCalls.length = 0;
    updateCalls.length = 0;
    mockDb.select.mockClear();
    mockDb.insert.mockClear();
    mockDb.update.mockClear();
    mockDb.transaction.mockClear();
    judgeRealPaperQuestionMock.mockReset();
  });

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it("creates pending question_reviews while importing real papers without AI review", async () => {
    const { ingestRealPapers } = await import("../../scripts/lib/realPaperIngest.js");
    const dir = await writePaperFile();

    const summary = await ingestRealPapers({
      dir,
      skipAiReview: true,
      logger: { log: vi.fn(), error: vi.fn() },
    });

    expect(summary).toMatchObject({
      imported: 1,
      pendingCreated: 1,
      aiReviewed: 0,
      promotedToReviewed: 0,
      reviewRoundsCompleted: 0,
      errors: 0,
    });
    expect(insertCalls.map((call) => call.values)).toContainEqual({
      questionId: "question-1",
      reviewStatus: "pending",
    });
    expect(insertCalls.map((call) => call.values)).toContainEqual(
      expect.objectContaining({
        contentJson: expect.objectContaining({
          sourceType: "real_paper",
          sourceExamType: "CSP-J",
          sourceYear: 2026,
          sourceFile: "sample.json",
          tags: ["真题", "2026", "CSP-J"],
        }),
        source: "real_paper",
      }),
    );
    expect(judgeRealPaperQuestionMock).not.toHaveBeenCalled();
  });

  it("updates pending reviews to ai_reviewed and promotes matching single-choice questions", async () => {
    judgeRealPaperQuestionMock.mockResolvedValue({
      reviewStatus: "ai_reviewed",
      aiConfidence: 0.95,
      questionStatus: "reviewed",
      answersMatch: true,
      officialAnswerDiff: null,
      reviewerNotes: "confirmed by judge",
    });

    const { ingestRealPapers } = await import("../../scripts/lib/realPaperIngest.js");
    const dir = await writePaperFile();

    const summary = await ingestRealPapers({
      dir,
      logger: { log: vi.fn(), error: vi.fn() },
    });

    expect(summary).toMatchObject({
      imported: 1,
      pendingCreated: 1,
      aiReviewed: 1,
      promotedToReviewed: 1,
      reviewRoundsCompleted: 2,
      errors: 0,
    });
    expect(judgeRealPaperQuestionMock).toHaveBeenCalledTimes(2);
    expect(updateCalls.map((call) => call.values)).toContainEqual(
      expect.objectContaining({
        reviewStatus: "ai_reviewed",
        aiConfidence: 0.95,
        reviewerNotes: "round 1: confirmed by judge\nround 2: confirmed by judge",
        reviewedAt: expect.any(Date),
      }),
    );
    expect(updateCalls.map((call) => call.values)).toContainEqual(
      expect.objectContaining({
        status: "reviewed",
        updatedAt: expect.any(Date),
      }),
    );
  });
});
