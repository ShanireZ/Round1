import { describe, expect, it, beforeEach, vi } from "vitest";

const { dbState, queuedResults, mockDb, checkDbConnectionMock } = vi.hoisted(() => {
  const queuedResults: unknown[] = [];
  const dbState = { available: false };

  function makeQuery(result: unknown) {
    const query = {
      from() {
        return query;
      },
      innerJoin() {
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
      then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
        return Promise.resolve(result).then(onFulfilled, onRejected);
      },
    };

    return query;
  }

  const mockDb = {
    select: vi.fn((_selection?: unknown) => makeQuery(queuedResults.shift() ?? [])),
  };

  const checkDbConnectionMock = vi.fn(async () => {
    if (!dbState.available) {
      throw new Error("DB unavailable");
    }
  });

  return { dbState, queuedResults, mockDb, checkDbConnectionMock };
});

vi.mock("../../server/db.js", () => ({
  db: mockDb,
  checkDbConnection: checkDbConnectionMock,
}));

import {
  importQuestionBundle,
  loadQuestionBundle,
  validateQuestionBundle,
} from "../../scripts/lib/questionBundleWorkflow.js";
import {
  importPrebuiltPaperBundle,
  loadPrebuiltPaperBundle,
  validatePrebuiltPaperBundle,
} from "../../scripts/lib/prebuiltPaperBundleWorkflow.js";
import { buildBundleIntegrity } from "../../scripts/lib/bundleTypes.js";
import { computeContentHash } from "../services/deduplicationService.js";

describe("offline bundle workflow summaries", () => {
  beforeEach(() => {
    dbState.available = false;
    queuedResults.length = 0;
    vi.clearAllMocks();
  });

  it("uses validation summary for question bundle dry-run results", async () => {
    const loaded = await loadQuestionBundle("scripts/tests/fixtures/question-bundle.sample.json");
    const result = await importQuestionBundle(loaded, {
      apply: false,
      persistDryRun: false,
    });

    expect(result.summary).toMatchObject({
      totalCount: 1,
      importedCount: 1,
      rejectedCount: 0,
      errors: [],
    });
  });

  it("rejects question bundles when required duplicate checks cannot reach the database", async () => {
    const loaded = await loadQuestionBundle("scripts/tests/fixtures/question-bundle.sample.json");
    const result = await validateQuestionBundle(loaded, {
      requireDuplicateChecks: true,
    });

    expect(result.duplicateChecksSkipped).toBe(true);
    expect(result.summary).toMatchObject({
      totalCount: 1,
      importedCount: 0,
      rejectedCount: 1,
    });
    expect(result.errors[0]).toMatchObject({
      code: "DUPLICATE_CHECKS_UNAVAILABLE",
    });
  });

  it("requires duplicate checks before applying question bundle imports", async () => {
    const loaded = await loadQuestionBundle("scripts/tests/fixtures/question-bundle.sample.json");

    await expect(importQuestionBundle(loaded, { apply: true })).rejects.toThrow(
      "DUPLICATE_CHECKS_UNAVAILABLE",
    );
  });

  it("uses validation summary for prebuilt paper bundle dry-run results", async () => {
    dbState.available = true;
    const loaded = await loadPrebuiltPaperBundle(
      "scripts/tests/fixtures/prebuilt-paper-bundle.sample.json",
    );
    const slots = loaded.bundle.items[0]?.slots ?? [];

    queuedResults.push(
      slots.map((slot) => ({
        id: slot.questionId,
        type: slot.questionType,
        difficulty: slot.difficulty,
        primaryKpId: slot.primaryKpId,
        status: "published",
      })),
      slots.map((slot) => ({ questionId: slot.questionId })),
    );

    const result = await importPrebuiltPaperBundle(loaded, {
      apply: false,
      persistDryRun: false,
    });

    expect(result.summary).toMatchObject({
      totalCount: 1,
      importedCount: 1,
      rejectedCount: 0,
      errors: [],
    });
  });

  it("rejects question bundles when the item checksum manifest is stale", async () => {
    const loaded = await loadQuestionBundle("scripts/tests/fixtures/question-bundle.sample.json");
    loaded.bundle.meta.integrity = buildBundleIntegrity(loaded.bundle.items);
    loaded.bundle.items[0]!.contentJson.stem = "tampered stem";

    const result = await validateQuestionBundle(loaded, {
      skipDuplicateChecks: true,
    });

    expect(result.summary).toMatchObject({
      totalCount: 1,
      importedCount: 0,
      rejectedCount: 1,
    });
    expect(result.errors[0]).toMatchObject({
      code: "INTEGRITY_ITEM_CHECKSUM_MISMATCH",
      itemIndex: 0,
    });
  });

  it("rejects reading program bundles that expose sample input or output", async () => {
    const loaded = await loadQuestionBundle("scripts/tests/fixtures/question-bundle.sample.json");
    const contentJson = {
      stem: "阅读以下程序并回答问题。",
      cppCode: "#include <iostream>\nint main(){std::cout<<1;return 0;}",
      subQuestions: [
        {
          stem: "当样例输入为空时，程序输出什么？",
          options: ["A. 1", "B. 2", "C. 3", "D. 4"],
        },
      ],
      sampleInputs: [""],
      expectedOutputs: ["1"],
    };
    loaded.bundle.meta.questionType = "reading_program";
    loaded.bundle.items = [
      {
        type: "reading_program",
        difficulty: "easy",
        primaryKpCode: "BAS",
        auxiliaryKpCodes: [],
        examTypes: ["CSP-J"],
        contentHash: computeContentHash(contentJson.stem, contentJson.cppCode),
        sandboxVerified: true,
        source: "manual",
        contentJson,
        answerJson: { subQuestions: [{ answer: "A" }] },
        explanationJson: { explanation: "样例输出是 1。" },
      },
    ];
    loaded.bundle.meta.integrity = buildBundleIntegrity(loaded.bundle.items);

    const result = await validateQuestionBundle(loaded, {
      skipDuplicateChecks: true,
    });

    expect(result.summary).toMatchObject({
      totalCount: 1,
      importedCount: 0,
      rejectedCount: 1,
    });
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: "READING_PROGRAM_SAMPLE_IO_UNSUPPORTED",
        itemIndex: 0,
      }),
    );
  });

  it("rejects prebuilt paper bundles when the item checksum manifest is stale", async () => {
    const loaded = await loadPrebuiltPaperBundle(
      "scripts/tests/fixtures/prebuilt-paper-bundle.sample.json",
    );
    loaded.bundle.meta.integrity = buildBundleIntegrity(loaded.bundle.items);
    loaded.bundle.items[0]!.title = "tampered paper";

    const result = await validatePrebuiltPaperBundle(loaded);

    expect(result.summary).toMatchObject({
      totalCount: 1,
      importedCount: 0,
      rejectedCount: 1,
    });
    expect(result.errors[0]).toMatchObject({
      code: "INTEGRITY_ITEM_CHECKSUM_MISMATCH",
      itemIndex: 0,
    });
  });
});
