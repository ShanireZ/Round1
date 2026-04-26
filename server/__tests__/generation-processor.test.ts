import { beforeEach, describe, expect, it, vi } from "vitest";

const llmGenerateObjectMock = vi.fn();
const computeContentHashMock = vi.fn(() => "content-hash-1");
const isDuplicateByHashMock = vi.fn(async () => false);
const findJaccardDuplicateMock = vi.fn(async () => null);
const sandboxVerifyQueueAddMock = vi.fn();
const readFileSyncMock = vi.fn(
  () =>
    "template {{questionType}} {{examType}} {{kpName}} {{kpCode}} {{difficulty}} {{fewShotExamples}} {{questionJson}}",
);

const updateSetCalls: Array<Record<string, unknown>> = [];
const insertValuesCalls: unknown[] = [];

const updateWhereMock = vi.fn(async () => undefined);
const updateSetMock = vi.fn((values: Record<string, unknown>) => {
  updateSetCalls.push(values);
  return { where: updateWhereMock };
});
const updateMock = vi.fn(() => ({ set: updateSetMock }));

const insertReturningMock = vi.fn(async () => [{ id: "question-1" }]);
const insertOnConflictDoUpdateMock = vi.fn(async () => undefined);
const insertValuesMock = vi.fn((values: unknown) => {
  insertValuesCalls.push(values);
  return {
    returning: insertReturningMock,
    onConflictDoUpdate: insertOnConflictDoUpdateMock,
  };
});
const insertMock = vi.fn(() => ({ values: insertValuesMock }));

const selectLimitMock = vi.fn(async () => [{ name: "数组" }]);
const selectWhereMock = vi.fn(() => ({ limit: selectLimitMock }));
const selectFromMock = vi.fn(() => ({ where: selectWhereMock }));
const selectMock = vi.fn(() => ({ from: selectFromMock }));

vi.mock("node:fs", () => ({
  default: {
    readFileSync: readFileSyncMock,
  },
  readFileSync: readFileSyncMock,
}));

vi.mock("../../server/db.js", () => ({
  db: {
    update: updateMock,
    select: selectMock,
    insert: insertMock,
  },
}));

vi.mock("../../server/services/llm/index.js", () => ({
  llmGenerateObject: llmGenerateObjectMock,
}));

vi.mock("../../server/services/deduplicationService.js", () => ({
  computeContentHash: computeContentHashMock,
  isDuplicateByHash: isDuplicateByHashMock,
  findJaccardDuplicate: findJaccardDuplicateMock,
}));

vi.mock("../../scripts/lib/offlineQueues.js", () => ({
  sandboxVerifyQueue: {
    add: sandboxVerifyQueueAddMock,
  },
}));

vi.mock("../../server/logger.js", () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock("../../server/db/schema/knowledgePoints.js", () => ({
  knowledgePoints: {
    id: "knowledgePoints.id",
    name: "knowledgePoints.name",
  },
}));

describe("scripts/lib/offlineGenerationProcessor", () => {
  beforeEach(() => {
    vi.resetModules();
    llmGenerateObjectMock.mockReset();
    readFileSyncMock.mockClear();
    updateSetCalls.length = 0;
    insertValuesCalls.length = 0;
    updateMock.mockClear();
    updateSetMock.mockClear();
    updateWhereMock.mockClear();
    insertMock.mockClear();
    insertValuesMock.mockClear();
    insertReturningMock.mockClear();
    insertOnConflictDoUpdateMock.mockClear();
    selectMock.mockClear();
    selectFromMock.mockClear();
    selectWhereMock.mockClear();
    selectLimitMock.mockClear();
    computeContentHashMock.mockClear();
    isDuplicateByHashMock.mockClear();
    findJaccardDuplicateMock.mockClear();
    sandboxVerifyQueueAddMock.mockReset();
  });

  it("stores generated questions after a successful generation flow", async () => {
    llmGenerateObjectMock
      .mockResolvedValueOnce({
        data: {
          stem: "请判断下面程序的输出结果，并选择最符合的一项。",
          options: ["1", "2", "3", "4"],
          answer: "B",
          explanation: "变量在循环结束后会保留最终值，因此答案是 2。",
          primaryKpCode: "BAS",
          auxiliaryKpCodes: [],
        },
      })
      .mockResolvedValueOnce({
        data: {
          approved: true,
          issues: [],
          correctedAnswer: null,
          suggestion: null,
        },
      });

    const { processGenerationJob } =
      await import("../../scripts/lib/offlineGenerationProcessor.js");

    const result = await processGenerationJob({
      data: {
        questionType: "single_choice",
        examType: "CSP-J",
        primaryKpId: 42,
        kpCode: "BAS",
        difficulty: "easy",
      },
      attemptsMade: 0,
      opts: { attempts: 3 },
    } as never);

    expect(result).toEqual({ status: "success", questionId: "question-1" });
    expect(insertValuesCalls[0]).toEqual(
      expect.objectContaining({
        type: "single_choice",
        difficulty: "easy",
        primaryKpId: 42,
        contentHash: "content-hash-1",
        status: "reviewed",
        sandboxVerified: false,
        source: "ai",
      }),
    );
    expect(insertOnConflictDoUpdateMock).not.toHaveBeenCalled();
    expect(updateSetCalls).toEqual([]);
  });

  it("no longer touches legacy generation job state while processing offline generation", async () => {
    llmGenerateObjectMock
      .mockResolvedValueOnce({
        data: {
          stem: "请判断下面程序的输出结果，并选择最符合的一项。",
          options: ["1", "2", "3", "4"],
          answer: "B",
          explanation: "变量在循环结束后会保留最终值，因此答案是 2。",
          primaryKpCode: "BAS",
          auxiliaryKpCodes: [],
        },
      })
      .mockResolvedValueOnce({
        data: {
          approved: true,
          issues: [],
          correctedAnswer: null,
          suggestion: null,
        },
      });

    const { processGenerationJob } =
      await import("../../scripts/lib/offlineGenerationProcessor.js");

    await processGenerationJob({
      data: {
        questionType: "single_choice",
        examType: "CSP-J",
        primaryKpId: 42,
        kpCode: "BAS",
        difficulty: "easy",
      },
      attemptsMade: 0,
      opts: { attempts: 3 },
    } as never);

    expect(updateMock).not.toHaveBeenCalled();
  });

  it("passes generation conversation history into the judge step", async () => {
    const generatedQuestion = {
      stem: "请判断下面程序的输出结果，并选择最符合的一项。",
      options: ["1", "2", "3", "4"],
      answer: "B",
      explanation: "变量在循环结束后会保留最终值，因此答案是 2。",
      primaryKpCode: "BAS",
      auxiliaryKpCodes: [],
    };

    llmGenerateObjectMock
      .mockResolvedValueOnce({
        data: generatedQuestion,
        reasoningText: "generator scratchpad",
      })
      .mockResolvedValueOnce({
        data: {
          approved: true,
          issues: [],
          correctedAnswer: null,
          suggestion: null,
        },
      });

    const { processGenerationJob } =
      await import("../../scripts/lib/offlineGenerationProcessor.js");

    await processGenerationJob({
      data: {
        questionType: "single_choice",
        examType: "CSP-J",
        primaryKpId: 42,
        kpCode: "BAS",
        difficulty: "easy",
      },
      attemptsMade: 0,
      opts: { attempts: 3 },
    } as never);

    const generateCall = llmGenerateObjectMock.mock.calls[0]?.[0];
    const judgeCall = llmGenerateObjectMock.mock.calls[1]?.[0];

    expect(judgeCall).toEqual(
      expect.objectContaining({
        task: "judge",
        messages: [
          {
            role: "user",
            content: generateCall?.prompt,
          },
          {
            role: "assistant",
            content: [
              {
                type: "text",
                text: JSON.stringify(generatedQuestion),
              },
              {
                type: "reasoning",
                text: "generator scratchpad",
              },
            ],
          },
        ],
      }),
    );
  });

  it("rethrows retryable generation failures without touching legacy generation job state", async () => {
    llmGenerateObjectMock.mockRejectedValueOnce(new Error("temporary upstream failure"));

    const { processGenerationJob } =
      await import("../../scripts/lib/offlineGenerationProcessor.js");

    await expect(
      processGenerationJob({
        data: {
          questionType: "single_choice",
          examType: "CSP-J",
          primaryKpId: 42,
          kpCode: "algo.sorting",
          difficulty: "medium",
        },
        attemptsMade: 0,
        opts: { attempts: 3 },
      } as never),
    ).rejects.toThrow("temporary upstream failure");

    expect(updateSetCalls).toEqual([]);
  });

  it("rethrows terminal generation failures without touching legacy generation job state", async () => {
    llmGenerateObjectMock.mockRejectedValueOnce(new Error("permanent upstream failure"));

    const { processGenerationJob } =
      await import("../../scripts/lib/offlineGenerationProcessor.js");

    await expect(
      processGenerationJob({
        data: {
          questionType: "single_choice",
          examType: "CSP-S",
          primaryKpId: 7,
          kpCode: "cpp.syntax",
          difficulty: "hard",
        },
        attemptsMade: 2,
        opts: { attempts: 3 },
      } as never),
    ).rejects.toThrow("permanent upstream failure");

    expect(updateSetCalls).toEqual([]);
  });

  it.each([
    {
      questionType: "reading_program",
      schemaPayload: {
        stem: "阅读下面程序并回答问题。",
        cppCode: "#include <iostream>\nint main(){std::cout<<2;}",
        subQuestions: [
          {
            stem: "输出是什么？",
            options: ["1", "2", "3", "4"],
            answer: "B",
            explanation: "程序直接输出 2。",
          },
          {
            stem: "程序执行几次输出？",
            options: ["1", "2", "3", "4"],
            answer: "A",
            explanation: "只有一次输出。",
          },
          {
            stem: "程序是否会换行？",
            options: ["会", "不会", "不确定", "报错"],
            answer: "B",
            explanation: "代码里没有换行。",
          },
        ],
        sampleInputs: [""],
        expectedOutputs: ["2"],
        primaryKpCode: "CPP",
        auxiliaryKpCodes: [],
      },
    },
    {
      questionType: "completion_program",
      schemaPayload: {
        stem: "补全下面程序。",
        cppCode: "#include <iostream>\nint main(){ /* blank */ }",
        blanks: [
          {
            id: "b1",
            options: ["std::cout<<1;", "std::cout<<2;", "return 0;", "int x=0;"],
            answer: "B",
            explanation: "需要输出 2。",
          },
          {
            id: "b2",
            options: ["return 0;", "return 1;", "break;", "continue;"],
            answer: "A",
            explanation: "main 结束应返回 0。",
          },
        ],
        fullCode: "#include <iostream>\nint main(){ std::cout<<2; return 0; }",
        sampleInputs: [""],
        expectedOutputs: ["2"],
        primaryKpCode: "CPP",
        auxiliaryKpCodes: [],
      },
    },
  ] as const)(
    "enqueues sandbox verification for $questionType questions after successful generation",
    async ({ questionType, schemaPayload }) => {
      llmGenerateObjectMock
        .mockResolvedValueOnce({
          data: schemaPayload,
        })
        .mockResolvedValueOnce({
          data: {
            approved: true,
            issues: [],
            correctedAnswer: null,
            suggestion: null,
          },
        });

      const { processGenerationJob } =
        await import("../../scripts/lib/offlineGenerationProcessor.js");

      const result = await processGenerationJob({
        data: {
          questionType,
          examType: "CSP-J",
          primaryKpId: 42,
          kpCode: "CPP",
          difficulty: "medium",
        },
        attemptsMade: 0,
        opts: { attempts: 3 },
      } as never);

      expect(result).toEqual({ status: "success", questionId: "question-1" });
      expect(insertValuesCalls[0]).toEqual(
        expect.objectContaining({
          type: questionType,
          difficulty: "medium",
          primaryKpId: 42,
          contentHash: "content-hash-1",
          status: "draft",
          sandboxVerified: false,
          source: "ai",
        }),
      );
      expect(insertOnConflictDoUpdateMock).not.toHaveBeenCalled();
      expect(sandboxVerifyQueueAddMock).toHaveBeenCalledWith(`verify-question-1`, {
        questionId: "question-1",
        questionType,
        examType: "CSP-J",
        primaryKpId: 42,
        difficulty: "medium",
      });
      expect(updateSetCalls).toEqual([]);
    },
  );
});
