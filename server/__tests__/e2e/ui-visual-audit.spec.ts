import fs from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

function collectBrowserProblems(page: Page): string[] {
  const problems: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error") {
      problems.push(`[console:${message.type()}] ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    problems.push(`[pageerror] ${error.message}`);
  });
  page.on("requestfailed", (request) => {
    const errorText = request.failure()?.errorText ?? "";
    if (errorText === "net::ERR_ABORTED") {
      return;
    }

    problems.push(`[requestfailed] ${request.url()} ${errorText}`);
  });

  return problems;
}

async function installFontRoute(page: Page) {
  await page.route("**/font/*.woff2", async (route) => {
    const url = new URL(route.request().url());
    const fileName = decodeURIComponent(url.pathname.split("/").pop() ?? "");
    const fontPath = path.join(process.cwd(), "client", "public", "fonts", fileName);

    if (!fs.existsSync(fontPath)) {
      await route.fulfill({ status: 404, body: "" });
      return;
    }

    await route.fulfill({
      path: fontPath,
      contentType: "font/woff2",
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  });
}

async function installCommonRoutes(page: Page, authenticated = true) {
  await installFontRoute(page);
  await page.route("**/api/v1/auth/session", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: authenticated
          ? {
              authenticated: true,
              user: {
                id: "student-visual",
                username: "visual",
                displayName: "视觉验收学生",
                role: "student",
                status: "active",
              },
            }
          : { authenticated: false },
      },
    });
  });
  await page.route("**/api/v1/attempts/active", async (route) => {
    await route.fulfill({ json: { success: true, data: null } });
  });
}

async function installAuthEntryRoutes(page: Page) {
  await page.route("**/logo/cpplearn.jpg", async (route) => {
    await route.fulfill({
      path: path.join(process.cwd(), "client", "public", "logos", "C1.png"),
      contentType: "image/png",
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  });

  await page.route("**/api/v1/config/client", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          turnstileSiteKey: "",
          powEnabled: false,
          powBaseDifficulty: 0,
          autosaveIntervalSeconds: 180,
          examDraftTtlMinutes: 1440,
          availableExamTypes: ["CSP-J", "CSP-S"],
          availableDifficulties: ["easy", "medium", "hard"],
          enabledAuthProviders: ["password"],
          authProviderPlaceholders: [],
        },
      },
    });
  });
}

async function waitForFonts(page: Page) {
  await page.evaluate(() => document.fonts.ready.then(() => true));
}

async function hasHorizontalOverflow(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth > 1,
  );
}

async function installDashboardRoutes(page: Page) {
  await page.route("**/api/v1/users/me/attempts**", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          page: 1,
          pageSize: 20,
          total: 9,
          items: [
            {
              id: "attempt-9",
              paperId: "paper-9",
              examType: "CSP-J",
              difficulty: "medium",
              status: "submitted",
              score: 92,
              submittedAt: "2026-04-28T08:20:00.000Z",
            },
            {
              id: "attempt-8",
              paperId: "paper-8",
              examType: "CSP-S",
              difficulty: "hard",
              status: "submitted",
              score: 81,
              submittedAt: "2026-04-27T09:10:00.000Z",
            },
            {
              id: "attempt-7",
              paperId: "paper-7",
              examType: "GESP-4",
              difficulty: "medium",
              status: "auto_submitted",
              score: 74,
              submittedAt: "2026-04-26T07:10:00.000Z",
            },
            {
              id: "attempt-6",
              paperId: "paper-6",
              examType: "CSP-J",
              difficulty: "easy",
              status: "submitted",
              score: 88,
              submittedAt: "2026-04-25T07:10:00.000Z",
            },
          ],
        },
      },
    });
  });

  await page.route("**/api/v1/users/me/stats", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          totalAttempts: 9,
          averageScore: 83,
          bestScore: 96,
          latestSubmittedAt: "2026-04-28T08:20:00.000Z",
          weakPrimaryKps: [
            { kpId: "101", total: 18, correct: 8, accuracy: 0.44 },
            { kpId: "203", total: 13, correct: 9, accuracy: 0.69 },
            { kpId: "305", total: 9, correct: 5, accuracy: 0.56 },
            { kpId: "407", total: 7, correct: 6, accuracy: 0.86 },
          ],
        },
      },
    });
  });
}

async function installExamNewRoutes(page: Page) {
  await page.route("**/api/v1/config/client", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          turnstileSiteKey: "",
          powEnabled: false,
          powBaseDifficulty: 0,
          autosaveIntervalSeconds: 180,
          examDraftTtlMinutes: 1440,
          availableExamTypes: [
            "CSP-J",
            "CSP-S",
            "GESP-1",
            "GESP-2",
            "GESP-3",
            "GESP-4",
            "GESP-5",
            "GESP-6",
            "GESP-7",
            "GESP-8",
          ],
          availableDifficulties: ["easy", "medium", "hard"],
          enabledAuthProviders: [],
          authProviderPlaceholders: [],
        },
      },
    });
  });

  await page.route("**/api/v1/exams/catalog", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          items: [
            { examType: "CSP-J", difficulty: "medium", count: 2 },
            { examType: "CSP-S", difficulty: "hard", count: 1 },
            { examType: "GESP-1", difficulty: "easy", count: 1 },
          ],
        },
      },
    });
  });

  await page.route("**/api/v1/exams/active-draft", async (route) => {
    await route.fulfill({ json: { success: true, data: null } });
  });
}

async function installExamResultRoute(page: Page) {
  await page.route("**/api/v1/exams/paper-visual/result", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          paper: {
            id: "paper-visual",
            examType: "CSP-J",
            difficulty: "medium",
            status: "completed",
            assignmentId: null,
          },
          attempt: {
            id: "attempt-visual",
            status: "submitted",
            submittedAt: "2026-04-28T08:20:00.000Z",
            score: 86,
            perSectionJson: {
              single_choice: { total: 2, correct: 1, score: 50, maxScore: 60 },
              reading_program: { total: 1, correct: 1, score: 26, maxScore: 40 },
            },
            perPrimaryKpJson: {
              "101": { total: 2, correct: 1, accuracy: 0.5 },
              "203": { total: 1, correct: 1, accuracy: 1 },
            },
            reportStatus: "completed",
            report: {
              wrongs: [
                {
                  slotNo: 1,
                  questionType: "single_choice",
                  subQuestionKey: "0",
                  submittedAnswer: "B",
                  correctAnswer: "A",
                  points: 10,
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
              points: 60,
              contentJson: { stem: "中国的国家顶级域名是（）" },
              submittedAnswers: { "0": "B" },
              result: {
                earnedScore: 50,
                maxScore: 60,
                correctCount: 1,
                totalCount: 2,
                subQuestions: [
                  {
                    key: "0",
                    submittedAnswer: "B",
                    correctAnswer: "A",
                    isCorrect: false,
                    points: 10,
                    explanation: ".cn 是中国国家顶级域名。",
                  },
                  {
                    key: "1",
                    submittedAnswer: "C",
                    correctAnswer: "C",
                    isCorrect: true,
                    points: 50,
                    explanation: "命中主要考点。",
                  },
                ],
              },
            },
          ],
        },
      },
    });
  });
}

test("Dashboard renders radar and heatmap without desktop or mobile overflow", async ({ page }) => {
  const problems = collectBrowserProblems(page);
  await installCommonRoutes(page);
  await installDashboardRoutes(page);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/dashboard");
  await expect(page.getByTestId("dashboard-hero")).toBeVisible();
  await expect(page.getByTestId("dashboard-ability-radar")).toBeVisible();
  await expect(page.getByTestId("dashboard-weakness-heatmap")).toBeVisible();
  await waitForFonts(page);
  expect(await hasHorizontalOverflow(page)).toBe(false);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  await expect(page.getByTestId("dashboard-hero")).toBeVisible();
  await expect(page.getByTestId("dashboard-ability-radar")).toBeVisible();
  await expect(page.getByTestId("dashboard-weakness-heatmap")).toBeVisible();
  expect(await hasHorizontalOverflow(page)).toBe(false);
  expect(problems).toEqual([]);
});

test("ExamNew renders the config-driven catalog without desktop or mobile overflow", async ({
  page,
}) => {
  const problems = collectBrowserProblems(page);
  await installCommonRoutes(page);
  await installExamNewRoutes(page);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/exams/new");
  await expect(page.getByTestId("exam-new-page")).toBeVisible();
  await expect(page.getByRole("heading", { name: "出卷考试" })).toBeVisible();
  await expect(page.getByRole("button", { name: /CSP-J/ })).toBeVisible();
  await page
    .getByRole("button", { name: /创建并进入/ })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: "确认开始这场模拟？" })).toBeVisible();
  await waitForFonts(page);
  expect(await hasHorizontalOverflow(page)).toBe(false);

  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  await expect(page.getByTestId("exam-new-page")).toBeVisible();
  expect(await hasHorizontalOverflow(page)).toBe(false);
  expect(problems).toEqual([]);
});

test("Auth entry surfaces render without desktop or mobile overflow", async ({ page }) => {
  const problems = collectBrowserProblems(page);
  await installCommonRoutes(page, false);
  await installAuthEntryRoutes(page);

  const routes = [
    { path: "/register", testId: "register-page" },
    { path: "/forgot-password", testId: "forgot-password-page" },
    { path: "/auth/callback?error=access_denied", testId: "auth-callback-page" },
    { path: "/auth/complete-profile", testId: "complete-profile-page" },
    { path: "/visual-audit-missing-route", testId: "not-found-page" },
  ];

  for (const route of routes) {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(route.path);
    await expect(page.getByTestId(route.testId)).toBeVisible();
    await waitForFonts(page);
    expect(await hasHorizontalOverflow(page)).toBe(false);

    await page.setViewportSize({ width: 375, height: 812 });
    await page.reload();
    await expect(page.getByTestId(route.testId)).toBeVisible();
    expect(await hasHorizontalOverflow(page)).toBe(false);
  }

  expect(problems).toEqual([]);
});

test("ExamResult supports reduced-motion reveal and A4 print markers", async ({ page }) => {
  const problems = collectBrowserProblems(page);
  await installCommonRoutes(page);
  await installExamResultRoute(page);
  await page.emulateMedia({ reducedMotion: "reduce" });

  await page.goto("/exams/paper-visual/result");
  await page.evaluate(() => {
    window.sessionStorage.removeItem("round1:exam-result-ceremony:paper-visual");
    window.history.replaceState(
      { ...(window.history.state ?? {}), usr: { fromSubmit: true } },
      "",
      window.location.href,
    );
  });
  await page.reload();

  await expect(page.getByTestId("exam-result-page")).toBeVisible();
  await expect(page.getByTestId("exam-result-ceremony")).toBeVisible();
  await expect(page.getByTestId("exam-result-ceremony-cta")).toBeVisible();
  await expect(page.locator(".exam-result-ceremony-particles")).toHaveCSS("display", "none");
  await page.getByTestId("exam-result-ceremony-cta").click();
  await expect(page.getByTestId("exam-result-ceremony")).toHaveCount(0);

  await page.emulateMedia({ media: "print", reducedMotion: "reduce" });
  const printState = await page.evaluate(() => {
    const header = document.querySelector(".print-header");
    const noPrint = document.querySelector("[data-no-print]");
    const printSurface = document.querySelector("[data-print-surface]");

    return {
      headerDisplay: header ? getComputedStyle(header).display : null,
      noPrintDisplay: noPrint ? getComputedStyle(noPrint).display : null,
      breakInside: printSurface ? getComputedStyle(printSurface).breakInside : null,
    };
  });

  expect(printState.headerDisplay).toBe("block");
  expect(printState.noPrintDisplay).toBe("none");
  expect(printState.breakInside).toBe("avoid");
  expect(problems).toEqual([]);
});

test("A2UI gallery renders Round1 BYOC surface without browser problems", async ({ page }) => {
  const problems = collectBrowserProblems(page);
  await installCommonRoutes(page, false);

  await page.goto("/dev/ui-gallery#plate-11");
  await expect(page.getByTestId("round1-a2ui-surface")).toBeVisible();
  await expect(page.getByText("Round1 BYOC").first()).toBeVisible();
  await expect(page.getByText("AdminQuestionLibrary")).toBeVisible();
  await expect(page.getByText("AdminPaperLibrary")).toBeVisible();
  await expect(page.getByText("AdminImports")).toBeVisible();
  await waitForFonts(page);
  expect(await hasHorizontalOverflow(page)).toBe(false);
  expect(problems).toEqual([]);
});
