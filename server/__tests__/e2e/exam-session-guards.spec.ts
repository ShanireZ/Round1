import { expect, test, type BrowserContext, type Page } from "@playwright/test";

type PersistedAnswers = Record<
  string,
  {
    subAnswers: Record<string, string>;
    updatedAt?: string;
  }
>;

async function installExamRuntimeMocks(
  context: BrowserContext,
  {
    submitAt = new Date(Date.now() + 90 * 60 * 1000).toISOString(),
  }: {
    submitAt?: string;
  } = {},
) {
  let persistedAnswers: PersistedAnswers = {};
  let delayAutosaveResponse = false;
  const delayedAutosaveResolvers: Array<() => void> = [];
  const startedAt = new Date(Date.now() - 30 * 60 * 1000).toISOString();

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
      remainingMs: Math.max(new Date(submitAt).getTime() - Date.now(), 0),
      answersJson: persistedAnswers,
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
      },
    ],
  });

  await context.route("**/api/v1/exams/paper-1/attempts", async (route) => {
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

  await context.route("**/api/v1/exams/paper-1/session", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: buildSessionPayload(),
      },
    });
  });

  await context.route("**/api/v1/attempts/attempt-1", async (route) => {
    const body = route.request().postDataJSON() as {
      answersJson?: PersistedAnswers;
    };
    persistedAnswers = body.answersJson ?? {};

    if (delayAutosaveResponse) {
      await new Promise<void>((resolve) => {
        delayedAutosaveResolvers.push(resolve);
      });
    }

    await route.fulfill({
      json: {
        success: true,
        data: buildSessionPayload().attempt,
      },
    });
  });

  await context.route("**/api/v1/attempts/attempt-1/submit", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          id: "attempt-1",
          paperId: "paper-1",
          status: "submitted",
          submittedAt: new Date().toISOString(),
          score: 100,
          perSectionJson: null,
          perPrimaryKpJson: null,
          reportStatus: "completed",
          report: { wrongs: [] },
        },
      },
    });
  });

  await context.route("**/api/v1/exams/paper-1/result", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
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
            submittedAt: new Date().toISOString(),
            score: 100,
            perSectionJson: null,
            perPrimaryKpJson: null,
            reportStatus: "completed",
            report: { wrongs: [] },
          },
          items: [],
        },
      },
    });
  });

  return {
    setDelayAutosaveResponse(value: boolean) {
      delayAutosaveResponse = value;
      if (!value) {
        delayedAutosaveResolvers.splice(0).forEach((resolve) => resolve());
      }
    },
  };
}

async function openExamSession(page: Page) {
  await page.goto("/exams/paper-1");
  await expect(page.getByTestId("exam-session-page")).toBeVisible();
}

test("beforeunload 只在未持久化或 autosave 中触发", async ({ context, page }) => {
  test.slow();
  const runtime = await installExamRuntimeMocks(context);

  let cleanDialogType: string | null = null;
  page.on("dialog", async (dialog) => {
    cleanDialogType = dialog.type();
    await dialog.dismiss();
  });

  await openExamSession(page);
  await page.close({ runBeforeUnload: true });
  expect(cleanDialogType).toBeNull();

  const dirtyPage = await context.newPage();
  let dirtyDialogType: string | null = null;

  await openExamSession(dirtyPage);
  await dirtyPage.getByTestId("answer-option-1-0-A").click();
  const dirtyDialogPromise = dirtyPage.waitForEvent("dialog");
  await dirtyPage.close({ runBeforeUnload: true });
  const dirtyDialog = await dirtyDialogPromise;
  dirtyDialogType = dirtyDialog.type();
  await dirtyDialog.accept();
  await expect.poll(() => dirtyPage.isClosed()).toBe(true);
  expect(dirtyDialogType).toBe("beforeunload");

  runtime.setDelayAutosaveResponse(true);
  const savingPage = await context.newPage();
  let savingDialogType: string | null = null;

  await openExamSession(savingPage);
  await savingPage.getByTestId("answer-option-1-0-A").click();
  await expect(savingPage.getByTestId("autosave-status")).toContainText("保存中");

  const savingDialogPromise = savingPage.waitForEvent("dialog");
  await savingPage.close({ runBeforeUnload: true });
  const savingDialog = await savingDialogPromise;
  savingDialogType = savingDialog.type();
  await savingDialog.accept();
  runtime.setDelayAutosaveResponse(false);
  await expect.poll(() => savingPage.isClosed()).toBe(true);
  expect(savingDialogType).toBe("beforeunload");
});

test("在剩余时间低于 10 分钟时显示页面级预警", async ({ context, page }) => {
  await installExamRuntimeMocks(context, {
    submitAt: new Date(Date.now() + 9 * 60 * 1000 + 30 * 1000).toISOString(),
  });

  await openExamSession(page);

  await expect(page.getByTestId("exam-timer-warning")).toContainText("剩余时间不足 10 分钟");
  await expect(page.getByTestId("exam-timer-warning")).not.toContainText("剩余时间不足 1 分钟");
  await expect(page.getByTestId("exam-countdown-badge")).toContainText(/00:09:/);
});

test("在剩余时间低于 1 分钟时显示页面级强预警", async ({ context, page }) => {
  await installExamRuntimeMocks(context, {
    submitAt: new Date(Date.now() + 45 * 1000).toISOString(),
  });

  await openExamSession(page);

  await expect(page.getByTestId("exam-timer-warning")).toContainText("剩余时间不足 1 分钟");
  await expect(page.getByTestId("exam-countdown-badge")).toContainText(/00:00:/);
});
