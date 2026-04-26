import { describe, expect, it, vi } from "vitest";

const finalizeAttemptMock = vi.fn();
const loggerInfoMock = vi.fn();
const loggerWarnMock = vi.fn();

vi.mock("../services/attemptFinalizer.js", () => ({
  finalizeAttempt: finalizeAttemptMock,
}));

vi.mock("../logger.js", () => ({
  logger: {
    info: loggerInfoMock,
    warn: loggerWarnMock,
  },
}));

describe("attempt auto-submit processor", () => {
  it("forces auto_submitted finalization for delayed jobs", async () => {
    finalizeAttemptMock.mockResolvedValue({
      kind: "success",
      attempt: {
        id: "attempt-1",
        paperId: "paper-1",
        status: "auto_submitted",
      },
    });

    const { processAttemptAutoSubmitJob } =
      await import("../services/worker/attemptAutoSubmitProcessor.js");

    const result = await processAttemptAutoSubmitJob({
      data: { attemptId: "attempt-1" },
    } as never);

    expect(finalizeAttemptMock).toHaveBeenCalledWith({
      attemptId: "attempt-1",
      forceStatus: "auto_submitted",
      cancelAutoSubmitJob: false,
    });
    expect(result).toEqual({ status: "auto_submitted" });
  });
});
