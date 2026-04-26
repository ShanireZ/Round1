import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ExamResultClientError,
  fetchExamResult,
  formatExamTypeBadgeVariant,
  formatDifficultyLabel,
  getCeremonyStorageKey,
  shouldShowCeremonyOnEntry,
} from "./exam-results";

const fetchMock = vi.fn();

vi.stubGlobal("fetch", fetchMock);

afterEach(() => {
  fetchMock.mockReset();
});

describe("exam results client", () => {
  it("reads normalized exam result payloads from the runtime endpoint", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          paper: {
            id: "paper-2",
            examType: "CSP-J",
            difficulty: "easy",
            status: "completed",
            assignmentId: null,
          },
          attempt: {
            id: "attempt-2",
            status: "submitted",
            submittedAt: "2026-04-26T00:30:00.000Z",
            score: 6,
            perSectionJson: {
              reading_program: { total: 3, correct: 2, score: 4, maxScore: 6 },
            },
            perPrimaryKpJson: {
              "201": { total: 3, correct: 2, accuracy: 2 / 3 },
            },
            reportStatus: "completed",
            report: {
              wrongs: [
                {
                  slotNo: 16,
                  questionType: "reading_program",
                  subQuestionKey: "2",
                  submittedAnswer: "D",
                  correctAnswer: "B",
                  points: 2,
                  explanation: "阅读解析2",
                },
              ],
            },
          },
          items: [
            {
              slotNo: 16,
              questionType: "reading_program",
              primaryKpId: 201,
              points: 6,
              contentJson: { stem: "阅读程序题" },
              submittedAnswers: { "1": "A", "2": "D", "3": "C" },
              result: {
                earnedScore: 4,
                maxScore: 6,
                correctCount: 2,
                totalCount: 3,
                subQuestions: [
                  {
                    key: "1",
                    submittedAnswer: "A",
                    correctAnswer: "A",
                    isCorrect: true,
                    points: 2,
                    explanation: "阅读解析1",
                  },
                ],
              },
            },
          ],
        },
      }),
    });

    const result = await fetchExamResult("paper-2");

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/exams/paper-2/result", {
      credentials: "include",
    });
    expect(result.paper.examType).toBe("CSP-J");
    expect(result.attempt.report?.wrongs).toHaveLength(1);
    expect(result.items[0]?.result.earnedScore).toBe(4);
  });

  it("surfaces runtime api errors when reading exam results fails", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({
        success: false,
        error: {
          code: "ROUND1_NOT_FOUND",
          message: "答题结果不存在",
        },
      }),
    });

    await expect(fetchExamResult("missing-paper")).rejects.toBeInstanceOf(ExamResultClientError);
  });

  it("maps exam types and difficulty labels for the result header", () => {
    expect(formatExamTypeBadgeVariant("CSP-J")).toBe("csp-j");
    expect(formatExamTypeBadgeVariant("CSP-S")).toBe("csp-s");
    expect(formatExamTypeBadgeVariant("GESP-4")).toBe("gesp-high");
    expect(formatDifficultyLabel("easy")).toBe("基础");
    expect(formatDifficultyLabel(null)).toBe("未分级");
  });

  it("only shows ceremony on the first result entry after submit navigation", () => {
    expect(getCeremonyStorageKey("paper-2")).toBe("round1:exam-result-ceremony:paper-2");
    expect(
      shouldShowCeremonyOnEntry({
        navigationState: { fromSubmit: true },
        hasSeenCeremony: false,
      }),
    ).toBe(true);
    expect(
      shouldShowCeremonyOnEntry({
        navigationState: { fromSubmit: true },
        hasSeenCeremony: true,
      }),
    ).toBe(false);
    expect(
      shouldShowCeremonyOnEntry({
        navigationState: null,
        hasSeenCeremony: false,
      }),
    ).toBe(false);
  });
});
