import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyCppMock = vi.fn();
const loggerInfoMock = vi.fn();
const loggerWarnMock = vi.fn();

const updateSetCalls: Array<Record<string, unknown>> = [];
const insertValuesCalls: unknown[] = [];
const selectResults: unknown[] = [];

const updateWhereMock = vi.fn(async () => undefined);
const updateSetMock = vi.fn((values: Record<string, unknown>) => {
  updateSetCalls.push(values);
  return { where: updateWhereMock };
});
const updateMock = vi.fn(() => ({ set: updateSetMock }));

const insertOnConflictDoUpdateMock = vi.fn(async () => undefined);
const insertValuesMock = vi.fn((values: unknown) => {
  insertValuesCalls.push(values);
  return { onConflictDoUpdate: insertOnConflictDoUpdateMock };
});
const insertMock = vi.fn(() => ({ values: insertValuesMock }));

const selectLimitMock = vi.fn(async () => selectResults.shift() ?? []);
const selectWhereMock = vi.fn(() => ({ limit: selectLimitMock }));
const selectFromMock = vi.fn(() => ({ where: selectWhereMock }));
const selectMock = vi.fn(() => ({ from: selectFromMock }));

vi.mock("../../server/db.js", () => ({
  db: {
    select: selectMock,
    update: updateMock,
    insert: insertMock,
  },
}));

vi.mock("../../server/services/sandbox/cppRunner.js", () => ({
  verifyCpp: verifyCppMock,
}));

vi.mock("../../server/logger.js", () => ({
  logger: {
    info: loggerInfoMock,
    warn: loggerWarnMock,
  },
}));

describe("server/services/worker/sandboxVerifyProcessor", () => {
  beforeEach(() => {
    vi.resetModules();
    verifyCppMock.mockReset();
    loggerInfoMock.mockReset();
    loggerWarnMock.mockReset();
    updateSetCalls.length = 0;
    insertValuesCalls.length = 0;
    selectResults.length = 0;
    updateMock.mockClear();
    updateSetMock.mockClear();
    updateWhereMock.mockClear();
    insertMock.mockClear();
    insertValuesMock.mockClear();
    insertOnConflictDoUpdateMock.mockClear();
    selectMock.mockClear();
    selectFromMock.mockClear();
    selectWhereMock.mockClear();
    selectLimitMock.mockClear();
  });

  it("marks a reading_program question reviewed after sandbox verification succeeds without bucket stats writes", async () => {
    selectResults.push([
      {
        contentJson: {
          cppCode: "#include <iostream>\nint main(){std::cout<<2;}",
        },
      },
    ]);
    verifyCppMock.mockResolvedValueOnce({
      verified: true,
      results: [
        {
          compileOk: true,
          compileStderr: "",
          runOk: true,
          stdout: "2",
          stderr: "",
          exitCode: 0,
          timedOut: false,
          peakMemoryKb: 128,
          wallMs: 10,
        },
      ],
    });

    const { processSandboxVerifyJob } =
      await import("../../server/services/worker/sandboxVerifyProcessor.js");

    const result = await processSandboxVerifyJob({
      data: {
        questionId: "reading-1",
        questionType: "reading_program",
        examType: "CSP-J",
        primaryKpId: 11,
        difficulty: "medium",
      },
    } as never);

    expect(result).toEqual({ status: "verified" });
    expect(verifyCppMock).toHaveBeenCalledWith({
      source: "#include <iostream>\nint main(){std::cout<<2;}",
      sampleInputs: [],
      expectedOutputs: [],
    });
    expect(updateSetCalls[0]).toEqual(
      expect.objectContaining({
        sandboxVerified: true,
        status: "reviewed",
        updatedAt: expect.any(Date),
      }),
    );
    expect(insertValuesCalls).toEqual([]);
  });

  it("marks a completion_program question reviewed after sandbox verification succeeds without bucket stats writes", async () => {
    selectResults.push([
      {
        contentJson: {
          fullCode: "#include <iostream>\nint main(){std::cout<<3;}",
          sampleInputs: [""],
          expectedOutputs: ["3"],
        },
      },
    ]);
    verifyCppMock.mockResolvedValueOnce({
      verified: true,
      results: [
        {
          compileOk: true,
          compileStderr: "",
          runOk: true,
          stdout: "3",
          stderr: "",
          exitCode: 0,
          timedOut: false,
          peakMemoryKb: 128,
          wallMs: 10,
        },
      ],
    });

    const { processSandboxVerifyJob } =
      await import("../../server/services/worker/sandboxVerifyProcessor.js");

    const result = await processSandboxVerifyJob({
      data: {
        questionId: "completion-1",
        questionType: "completion_program",
        examType: "CSP-S",
        primaryKpId: 17,
        difficulty: "hard",
      },
    } as never);

    expect(result).toEqual({ status: "verified" });
    expect(verifyCppMock).toHaveBeenCalledWith({
      source: "#include <iostream>\nint main(){std::cout<<3;}",
      sampleInputs: [""],
      expectedOutputs: ["3"],
    });
    expect(updateSetCalls[0]).toEqual(
      expect.objectContaining({
        sandboxVerified: true,
        status: "reviewed",
        updatedAt: expect.any(Date),
      }),
    );
    expect(insertValuesCalls).toEqual([]);
  });

  it.each([
    {
      questionId: "reading-failed-1",
      questionType: "reading_program",
      examType: "CSP-J",
      primaryKpId: 19,
      difficulty: "medium",
      contentJson: {
        cppCode: "#include <iostream>\nint main(){std::cout<<2;}",
      },
    },
    {
      questionId: "completion-failed-1",
      questionType: "completion_program",
      examType: "CSP-S",
      primaryKpId: 23,
      difficulty: "hard",
      contentJson: {
        fullCode: "#include <iostream>\nint main(){std::cout<<3;}",
        sampleInputs: [""],
        expectedOutputs: ["999"],
      },
    },
  ] as const)(
    "keeps $questionType questions in draft and does not increment inventory when sandbox verification fails",
    async ({ questionId, questionType, examType, primaryKpId, difficulty, contentJson }) => {
      selectResults.push([{ contentJson }]);
      verifyCppMock.mockResolvedValueOnce({
        verified: false,
        results: [
          {
            compileOk: true,
            compileStderr: "",
            runOk: false,
            stdout: "",
            stderr: "wrong answer",
            exitCode: 1,
            timedOut: false,
            peakMemoryKb: 128,
            wallMs: 10,
          },
        ],
      });

      const { processSandboxVerifyJob } =
        await import("../../server/services/worker/sandboxVerifyProcessor.js");

      const result = await processSandboxVerifyJob({
        data: {
          questionId,
          questionType,
          examType,
          primaryKpId,
          difficulty,
        },
      } as never);

      expect(result).toEqual({ status: "failed" });
      expect(updateSetCalls).toEqual([]);
      expect(insertValuesCalls).toEqual([]);
    },
  );
});
