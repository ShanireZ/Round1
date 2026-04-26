import { beforeEach, describe, expect, it, vi } from "vitest";

const callScriptLlmSceneMock = vi.fn();

vi.mock("../../scripts/lib/scriptLlmClient.js", () => ({
  callScriptLlmScene: callScriptLlmSceneMock,
}));

describe("scripts/lib/realPaperAiReview", () => {
  beforeEach(() => {
    vi.resetModules();
    callScriptLlmSceneMock.mockReset();
  });

  it("marks matching single_choice questions as ai_reviewed and reviewed", async () => {
    callScriptLlmSceneMock.mockResolvedValue({
      providerName: "openai",
      model: "gpt-5.4-mini",
      text: JSON.stringify({
        confidence: 0.92,
        answers: ["B"],
        notes: "official answer confirmed",
      }),
      inputTokens: 12,
      outputTokens: 9,
    });

    const { judgeRealPaperQuestion } = await import("../../scripts/lib/realPaperAiReview.js");

    const result = await judgeRealPaperQuestion({
      question: {
        questionType: "single_choice",
        stem: "1+1=?",
        options: ["A. 1", "B. 2", "C. 3", "D. 4"],
        answer: "B",
        difficulty: "easy",
        primaryKpCode: "BAS-01",
        auxiliaryKpCodes: [],
        explanation: "2",
      },
      timeoutMs: 5_000,
    });

    expect(callScriptLlmSceneMock).toHaveBeenCalledWith(
      expect.objectContaining({
        scene: "judge",
        maxTokens: 800,
      }),
    );
    expect(result).toEqual({
      reviewStatus: "ai_reviewed",
      aiConfidence: 0.92,
      questionStatus: "reviewed",
      answersMatch: true,
      officialAnswerDiff: null,
      reviewerNotes: "official answer confirmed",
    });
  });

  it("keeps code questions in draft and records mismatched answers", async () => {
    callScriptLlmSceneMock.mockResolvedValue({
      providerName: "openai",
      model: "gpt-5.4-mini",
      text: JSON.stringify({
        confidence: 0.61,
        answers: ["8", "11"],
        notes: "second answer differs from official key",
      }),
      inputTokens: 30,
      outputTokens: 14,
    });

    const { judgeRealPaperQuestion } = await import("../../scripts/lib/realPaperAiReview.js");

    const result = await judgeRealPaperQuestion({
      question: {
        questionType: "reading_program",
        stem: "阅读程序并回答问题。",
        cppCode: "#include <iostream>\nint main() { return 0; }",
        subQuestions: [
          {
            stem: "输出第一行是什么？",
            options: ["A. 8", "B. 9"],
            answer: "8",
            explanation: "...",
          },
          {
            stem: "输出第二行是什么？",
            options: ["A. 10", "B. 11"],
            answer: "10",
            explanation: "...",
          },
        ],
        difficulty: "medium",
        primaryKpCode: "CPP-01",
        auxiliaryKpCodes: [],
      },
      timeoutMs: 5_000,
    });

    expect(result).toEqual({
      reviewStatus: "ai_reviewed",
      aiConfidence: 0.61,
      questionStatus: "draft",
      answersMatch: false,
      officialAnswerDiff: {
        officialAnswers: ["8", "10"],
        aiAnswers: ["8", "11"],
        mismatches: [
          {
            index: 2,
            official: "10",
            ai: "11",
          },
        ],
      },
      reviewerNotes: "second answer differs from official key",
    });
  });
});
