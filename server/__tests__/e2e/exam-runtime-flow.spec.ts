import { expect, test } from "@playwright/test";

test("autosaves, restores on reload, submits, and only reveals ceremony on first result entry", async ({
  page,
}) => {
  let autosaveCallCount = 0;
  let submitCallCount = 0;
  let persistedAnswers: Record<string, { subAnswers: Record<string, string>; updatedAt?: string }> =
    {};
  const startedAt = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const submitAt = new Date(Date.now() + 90 * 60 * 1000).toISOString();

  const paper = {
    id: "paper-1",
    title: "CSP-J 模拟卷一",
    examType: "CSP-J",
    difficulty: "medium",
    status: "in_progress",
    assignmentId: null,
  };

  const buildSessionPayload = () => ({
    paper,
    attempt: {
      id: "attempt-1",
      paperId: "paper-1",
      status: "started",
      tabNonce: "nonce-1",
      startedAt,
      submitAt,
      remainingMs: 90 * 60 * 1000,
      answersJson: persistedAnswers,
    },
    items: [
      {
        slotNo: 1,
        questionType: "single_choice",
        primaryKpId: 101,
        contentJson: {
          stem: "中国的国家顶级域名是（）",
          options: ["A. .cn", "B. .ch", "C. .chn", "D. .china"],
        },
      },
    ],
  });

  const buildResultPayload = () => {
    const submittedAnswer = persistedAnswers["1"]?.subAnswers["0"] ?? null;
    const isCorrect = submittedAnswer === "A";

    return {
      paper: {
        id: "paper-1",
        examType: "CSP-J",
        difficulty: "medium",
        status: "completed",
        assignmentId: null,
      },
      attempt: {
        id: "attempt-1",
        status: "submitted",
        submittedAt: "2026-04-26T01:05:00.000Z",
        score: isCorrect ? 100 : 0,
        perSectionJson: {
          single_choice: {
            total: 1,
            correct: isCorrect ? 1 : 0,
            score: isCorrect ? 100 : 0,
            maxScore: 100,
          },
        },
        perPrimaryKpJson: {
          "101": {
            total: 1,
            correct: isCorrect ? 1 : 0,
            accuracy: isCorrect ? 1 : 0,
          },
        },
        reportStatus: "completed",
        report: {
          wrongs: isCorrect
            ? []
            : [
                {
                  slotNo: 1,
                  questionType: "single_choice",
                  subQuestionKey: "0",
                  submittedAnswer,
                  correctAnswer: "A",
                  points: 100,
                  explanation: ".cn 是中国国家顶级域名。",
                },
              ],
        },
      },
      items: [
        {
          slotNo: 1,
          questionType: "single_choice",
          primaryKpId: 101,
          points: 100,
          contentJson: {
            stem: "中国的国家顶级域名是（）",
            options: ["A. .cn", "B. .ch", "C. .chn", "D. .china"],
          },
          submittedAnswers: submittedAnswer ? { "0": submittedAnswer } : {},
          result: {
            earnedScore: isCorrect ? 100 : 0,
            maxScore: 100,
            correctCount: isCorrect ? 1 : 0,
            totalCount: 1,
            subQuestions: [
              {
                key: "0",
                submittedAnswer,
                correctAnswer: "A",
                isCorrect,
                points: 100,
                explanation: ".cn 是中国国家顶级域名。",
              },
            ],
          },
        },
      ],
    };
  };

  await page.route("**/api/v1/exams/paper-1/attempts", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          id: "attempt-1",
          paperId: "paper-1",
          status: "started",
          tabNonce: "nonce-1",
        },
      },
    });
  });

  await page.route("**/api/v1/exams/paper-1/session", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: buildSessionPayload(),
      },
    });
  });

  await page.route("**/api/v1/attempts/attempt-1", async (route) => {
    autosaveCallCount += 1;
    const body = route.request().postDataJSON() as {
      answersJson?: Record<string, { subAnswers: Record<string, string>; updatedAt?: string }>;
    };
    persistedAnswers = body.answersJson ?? {};

    await route.fulfill({
      json: {
        success: true,
        data: buildSessionPayload().attempt,
      },
    });
  });

  await page.route("**/api/v1/attempts/attempt-1/submit", async (route) => {
    submitCallCount += 1;
    await route.fulfill({
      json: {
        success: true,
        data: {
          id: "attempt-1",
          paperId: "paper-1",
          status: "submitted",
          tabNonce: "nonce-1",
        },
      },
    });
  });

  await page.route("**/api/v1/exams/paper-1/result", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: buildResultPayload(),
      },
    });
  });

  await page.goto("/exams/paper-1");

  await expect(page.getByTestId("exam-session-page")).toBeVisible();
  await page.getByTestId("answer-option-1-0-A").click();

  await expect.poll(() => autosaveCallCount).toBe(1);
  await expect(page.getByTestId("autosave-status")).toContainText("已保存");

  await page.reload();

  await expect(page.getByTestId("exam-session-page")).toBeVisible();
  await expect(page.getByTestId("answer-option-1-0-A")).toHaveAttribute("data-selected", "true");

  await page.getByTestId("exam-submit-button").click();

  await page.waitForURL("**/exams/paper-1/result");
  await expect.poll(() => submitCallCount).toBe(1);
  await expect(page.getByTestId("exam-result-page")).toBeVisible();
  await expect(page.getByTestId("exam-result-ceremony")).toBeVisible();

  await page.getByTestId("exam-result-ceremony-cta").click();
  await expect(page.getByTestId("exam-result-ceremony")).toHaveCount(0);

  await page.reload();

  await expect(page.getByTestId("exam-result-page")).toBeVisible();
  await expect(page.getByTestId("exam-result-ceremony")).toHaveCount(0);
});
