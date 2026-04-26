import { describe, expect, it, vi } from "vitest";

vi.mock("bullmq", () => ({
  Queue: class MockQueue {},
  QueueEvents: class MockQueueEvents {},
}));

vi.mock("ioredis", () => ({
  default: class MockRedis {},
}));

vi.mock("../../config/env.js", () => ({
  env: {
    REDIS_URL: "redis://127.0.0.1:6379",
  },
}));

async function expectMissingModule(modulePath: string) {
  await expect(import(modulePath)).rejects.toThrow();
}

describe("offline legacy runtime surfaces", () => {
  it("does not export legacy generation and bucket stats tables from the runtime schema barrel", async () => {
    const schema = await import("../db/schema/index.js");

    expect("generationJobs" in schema).toBe(false);
    expect("manualGenerationJobs" in schema).toBe(false);
    expect("questionBucketStats" in schema).toBe(false);
    expect("bucketSlotCounters" in schema).toBe(false);
    await expectMissingModule("../db/schema/generationJobs.js");
    await expectMissingModule("../db/schema/manualGenerationJobs.js");
    await expectMissingModule("../db/schema/questionBucketStats.js");
    await expectMissingModule("../db/schema/bucketSlotCounters.js");
  });

  it("does not expose legacy manual generation request schemas", async () => {
    const questionBankSchemas = await import("../routes/schemas/questionBank.schema.js");

    expect("CreateManualJobBody" in questionBankSchemas).toBe(false);
    expect("ImportManualQuestionsBody" in questionBankSchemas).toBe(false);
    expect("TriggerInventoryBody" in questionBankSchemas).toBe(false);
  });

  it("moves offline queue primitives out of server worker semantics", async () => {
    await expectMissingModule("../services/worker/queue.js");
  });

  it("removes runtime-side manual generation and inventory planner modules", async () => {
    await expectMissingModule("../services/manualGenerationService.js");
    await expectMissingModule("../services/worker/inventoryPlanner.js");
  });

  it("removes offline-only generation and dead-letter worker modules from server semantics", async () => {
    await expectMissingModule("../services/worker/generationProcessor.js");
    await expectMissingModule("../services/worker/generationWorkerEvents.js");
    await expectMissingModule("../services/worker/deadLetter.js");
  });

  it("moves contentWorker entry out of server semantics", async () => {
    await expectMissingModule("../services/worker/contentWorker.ts");
  });
});
