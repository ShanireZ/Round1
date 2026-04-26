import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const handleDeadLetterMock = vi.fn();
const loggerInfoMock = vi.fn();
const loggerErrorMock = vi.fn();
const workerInstances: MockWorker[] = [];

class MockWorker {
  handlers = new Map<string, (...args: unknown[]) => unknown>();
  close = vi.fn(async () => undefined);

  constructor(public readonly queueName: string) {
    workerInstances.push(this);
  }

  on(event: string, handler: (...args: unknown[]) => unknown) {
    this.handlers.set(event, handler);
    return this;
  }
}

class MockRedis {
  disconnect = vi.fn();
}

vi.mock("bullmq", () => ({
  Queue: class MockQueue {},
  Worker: MockWorker,
}));

vi.mock("ioredis", () => ({
  default: MockRedis,
}));

vi.mock("../../scripts/lib/offlineQueues.js", () => ({
  QUEUE_NAMES: {
    GENERATION: "generation",
    SANDBOX_VERIFY: "sandbox-verify",
  },
}));

vi.mock("../../config/env.js", () => ({
  env: {
    REDIS_URL: "redis://127.0.0.1:6379",
    ROUND1_WORKER_CONCURRENCY: 3,
  },
}));

vi.mock("../../server/logger.js", () => ({
  logger: {
    info: loggerInfoMock,
    error: loggerErrorMock,
  },
}));

vi.mock("../../server/services/runtimeConfigService.js", () => ({
  initializeRuntimeConfigRuntime: vi.fn(async () => undefined),
  stopRuntimeConfigSubscriber: vi.fn(async () => undefined),
}));

vi.mock("../../scripts/lib/offlineGenerationProcessor.js", () => ({
  processGenerationJob: vi.fn(),
}));

vi.mock("../../server/services/examAutoSubmitQueue.js", () => ({
  ATTEMPT_AUTO_SUBMIT_QUEUE_NAME: "attempt-auto-submit",
}));

vi.mock("../../server/services/examRuntimeMaintenance.js", () => ({
  startExamRuntimeMaintenanceLoop: vi.fn(),
  stopExamRuntimeMaintenanceLoop: vi.fn(),
}));

vi.mock("../../server/services/worker/attemptAutoSubmitProcessor.js", () => ({
  processAttemptAutoSubmitJob: vi.fn(),
}));

vi.mock("../../server/services/worker/sandboxVerifyProcessor.js", () => ({
  processSandboxVerifyJob: vi.fn(),
}));

vi.mock("../../scripts/lib/offlineDeadLetter.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../scripts/lib/offlineDeadLetter.js")>();

  return {
    ...actual,
    handleDeadLetter: handleDeadLetterMock,
  };
});

describe("server/services/worker/worker dead-letter integration", () => {
  beforeEach(() => {
    vi.resetModules();
    workerInstances.length = 0;
    handleDeadLetterMock.mockReset();
    loggerInfoMock.mockReset();
    loggerErrorMock.mockReset();
    vi.spyOn(process, "on").mockImplementation((() => process) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("invokes deadLetter only after a terminal generation failure", async () => {
    await import("../../scripts/workers/contentWorker.js");

    const generationWorker = workerInstances.find((worker) => worker.queueName === "generation");
    expect(generationWorker).toBeDefined();

    const failedHandler = generationWorker?.handlers.get("failed");
    expect(failedHandler).toBeDefined();

    await failedHandler?.(
      {
        id: "queue-job-1",
        data: { questionType: "single_choice" },
        attemptsMade: 3,
        opts: { attempts: 3 },
      },
      new Error("terminal failure"),
    );

    expect(handleDeadLetterMock).toHaveBeenCalledWith(
      "queue-job-1",
      { questionType: "single_choice" },
      "terminal failure",
    );
  });

  it("does not invoke deadLetter when the generation job still has retries left", async () => {
    await import("../../scripts/workers/contentWorker.js");

    const generationWorker = workerInstances.find((worker) => worker.queueName === "generation");
    const failedHandler = generationWorker?.handlers.get("failed");

    await failedHandler?.(
      {
        id: "queue-job-2",
        data: { questionType: "single_choice" },
        attemptsMade: 1,
        opts: { attempts: 3 },
      },
      new Error("retryable failure"),
    );

    expect(handleDeadLetterMock).not.toHaveBeenCalled();
  });

  it("runtime worker does not register offline generation or sandbox queues", async () => {
    await import("../../server/services/worker/worker.js");

    const generationWorker = workerInstances.find((worker) => worker.queueName === "generation");
    const sandboxWorker = workerInstances.find((worker) => worker.queueName === "sandbox-verify");
    const autoSubmitWorker = workerInstances.find(
      (worker) => worker.queueName === "attempt-auto-submit",
    );

    expect(generationWorker).toBeUndefined();
    expect(sandboxWorker).toBeUndefined();
    expect(autoSubmitWorker).toBeDefined();
  });
});
