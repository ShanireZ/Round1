import { describe, expect, it, beforeEach, vi } from "vitest";

const { dbState, queuedResults, mockDb, checkDbConnectionMock } = vi.hoisted(() => {
  const queuedResults: unknown[] = [];
  const dbState = { available: false };

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
