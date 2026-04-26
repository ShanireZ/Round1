import { beforeEach, describe, expect, it, vi } from "vitest";

const importBatchesTable = {
  id: "importBatches.id",
  status: "importBatches.status",
  bundleType: "importBatches.bundleType",
};

const questionsTable = {
  id: "questions.id",
};

const updateCalls: Array<{ target: unknown; values: Record<string, unknown> }> = [];
const insertCalls: Array<{ target: unknown; values: unknown }> = [];

const updateWhereMock = vi.fn(async () => undefined);
const updateMock = vi.fn((target: unknown) => ({
  set: (values: Record<string, unknown>) => {
    updateCalls.push({ target, values });
    return { where: updateWhereMock };
  },
}));

const insertOnConflictDoUpdateMock = vi.fn(async () => undefined);
const insertMock = vi.fn((target: unknown) => ({
  values: (values: unknown) => {
    insertCalls.push({ target, values });
    return {
      returning: vi.fn(async () => {
        if (target === importBatchesTable) {
          return [{ id: "batch-1", status: "processing", bundleType: "manual_question_import" }];
        }

        if (target === questionsTable) {
          return [{ id: "question-1" }];
        }

        return [{ id: "row-1" }];
      }),
      onConflictDoUpdate: insertOnConflictDoUpdateMock,
    };
  },
}));

const computeContentHashMock = vi.fn(() => "manual-hash-1");
const isDuplicateByHashMock = vi
  .fn<(...args: unknown[]) => Promise<boolean>>()
  .mockResolvedValueOnce(false)
  .mockResolvedValueOnce(true);
const findJaccardDuplicateMock = vi.fn(async () => null);

vi.mock("../../server/db.js", () => ({
  db: {
    update: updateMock,
    insert: insertMock,
  },
}));

vi.mock("../../server/db/schema/importBatches.js", () => ({
  importBatches: importBatchesTable,
}));

vi.mock("../../server/db/schema/questions.js", () => ({
  questions: questionsTable,
}));

vi.mock("../../server/db/schema/questionExamTypes.js", () => ({
  questionExamTypes: { questionId: "questionExamTypes.questionId" },
}));

vi.mock("../../server/db/schema/questionKpTags.js", () => ({
  questionKpTags: { questionId: "questionKpTags.questionId" },
}));

vi.mock("../../server/services/deduplicationService.js", () => ({
  computeContentHash: computeContentHashMock,
  isDuplicateByHash: isDuplicateByHashMock,
  findJaccardDuplicate: findJaccardDuplicateMock,
}));

describe("scripts/lib/manualQuestionImport", () => {
  beforeEach(() => {
    vi.resetModules();
    updateCalls.length = 0;
    insertCalls.length = 0;
    updateWhereMock.mockClear();
    updateMock.mockClear();
    insertMock.mockClear();
    insertOnConflictDoUpdateMock.mockClear();
    computeContentHashMock.mockClear();
    isDuplicateByHashMock.mockReset();
    isDuplicateByHashMock.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    findJaccardDuplicateMock.mockClear();
  });

  it("records manual import batches in import_batches", async () => {
    const { importManualQuestions } = await import("../../scripts/lib/manualQuestionImport.js");

    await importManualQuestions({
      sourceFilename: "manual-questions.json",
      checksum: "checksum-manual-1",
      importedBy: "user-1",
      questionType: "single_choice",
      examType: "CSP-J",
      primaryKpId: 42,
      questionsData: [
        {
          stem: "下面选项中哪个结果是正确的？",
          options: ["1", "2", "3", "4"],
          answer: "B",
          explanation: "程序最终输出 2。",
          difficulty: "easy",
          primaryKpCode: "BAS",
          auxiliaryKpCodes: [],
        },
        {
          stem: "这一题与前一题重复，用于模拟 reject。",
          options: ["A", "B", "C", "D"],
          answer: "A",
          explanation: "重复题。",
          difficulty: "easy",
          primaryKpCode: "BAS",
          auxiliaryKpCodes: [],
        },
      ],
    } as never);

    expect(insertCalls).toContainEqual({
      target: importBatchesTable,
      values: expect.objectContaining({
        bundleType: "manual_question_import",
        sourceFilename: "manual-questions.json",
        checksum: "checksum-manual-1",
        importedBy: "user-1",
        status: "processing",
      }),
    });

    expect(updateCalls).toContainEqual({
      target: importBatchesTable,
      values: expect.objectContaining({
        status: "partial_failed",
        updatedAt: expect.any(Date),
      }),
    });

    expect(insertOnConflictDoUpdateMock).not.toHaveBeenCalled();
  });
});
