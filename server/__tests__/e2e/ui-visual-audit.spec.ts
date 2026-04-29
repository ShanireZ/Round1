import fs from "node:fs";
import path from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

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

type VisualAuditRole = "student" | "coach" | "admin";
type VisualAuditAuth =
  | boolean
  | {
      id?: string;
      username?: string;
      displayName?: string;
      role?: VisualAuditRole;
    };

async function installCommonRoutes(page: Page, auth: VisualAuditAuth = true) {
  const authenticated = auth !== false;
  const userConfig = typeof auth === "object" ? auth : {};
  const role = userConfig.role ?? "student";

  await installFontRoute(page);
  await page.route("**/api/v1/auth/session", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: authenticated
          ? {
              authenticated: true,
              user: {
                id: userConfig.id ?? `${role}-visual`,
                username: userConfig.username ?? `visual-${role}`,
                displayName: userConfig.displayName ?? `视觉验收${role}`,
                role,
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
          enabledAuthProviders: ["password", "passkey", "cpplearn"],
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
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth > 1,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("Execution context was destroyed")) {
        throw error;
      }

      await page.waitForLoadState("domcontentloaded").catch(() => undefined);
    }
  }

  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth > 1,
  );
}

async function expectRouteToFit(page: Page, routePath: string, target: (page: Page) => Locator) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(routePath);
  await expect(target(page)).toBeVisible();
  await waitForFonts(page);
  expect(await hasHorizontalOverflow(page)).toBe(false);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  await expect(target(page)).toBeVisible();
  expect(await hasHorizontalOverflow(page)).toBe(false);
}

async function installClientConfigRoute(page: Page) {
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
          enabledAuthProviders: ["password", "cpplearn"],
          authProviderPlaceholders: [],
        },
      },
    });
  });
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

async function installAccountRoutes(page: Page) {
  await installClientConfigRoute(page);
  await page.route("**/api/v1/classes/mine", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          items: [
            {
              classId: "class-1",
              name: "CSP-J 春季班",
              archivedAt: null,
              joinedVia: "code",
              joinedAt: "2026-04-20T08:00:00.000Z",
              openAssignments: 2,
              completedAssignments: 5,
              missedAssignments: 1,
            },
          ],
        },
      },
    });
  });
  await page.route("**/api/v1/auth/security/summary", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          profile: {
            id: "student-visual",
            username: "visual-student",
            displayName: "视觉验收学生",
            role: "student",
            status: "active",
            passwordChangeRequired: false,
            lastStrongAuthAt: "2026-04-28T08:00:00.000Z",
          },
          email: {
            email: "visual@example.com",
            verifiedAt: "2026-04-20T08:00:00.000Z",
            source: "password",
          },
          passwordEnabled: true,
          totpEnabledAt: "2026-04-21T08:00:00.000Z",
          passkeys: [
            {
              id: "33333333-3333-4333-8333-333333333333",
              credentialIdSuffix: "9f21",
              backupEligible: true,
              backupState: true,
              createdAt: "2026-04-22T08:00:00.000Z",
            },
          ],
          externalIdentities: [
            {
              provider: "cpplearn",
              providerType: "oidc",
              providerEmail: "visual@cpplearn.test",
              createdAt: "2026-04-23T08:00:00.000Z",
            },
          ],
        },
      },
    });
  });
}

const coachClass = {
  id: "class-1",
  name: "CSP-J 春季班",
  joinCode: "AB12CD",
  archivedAt: null,
  createdBy: "coach-visual",
  createdAt: "2026-04-20T08:00:00.000Z",
  updatedAt: "2026-04-28T08:00:00.000Z",
  coachRole: "owner",
  memberCount: 2,
  coachCount: 1,
};

async function installCoachRoutes(page: Page) {
  await page.route("**/api/v1/coach/classes**", async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;

    if (pathname === "/api/v1/coach/classes") {
      await route.fulfill({ json: { success: true, data: { items: [coachClass] } } });
      return;
    }

    if (pathname === "/api/v1/coach/classes/class-1") {
      await route.fulfill({ json: { success: true, data: coachClass } });
      return;
    }

    if (pathname === "/api/v1/coach/classes/class-1/members") {
      await route.fulfill({
        json: {
          success: true,
          data: {
            items: [
              {
                classId: "class-1",
                userId: "student-1",
                username: "student1",
                displayName: "学生一",
                role: "student",
                joinedVia: "code",
                joinedAt: "2026-04-21T08:00:00.000Z",
              },
            ],
          },
        },
      });
      return;
    }

    if (pathname === "/api/v1/coach/classes/class-1/invites") {
      await route.fulfill({
        json: {
          success: true,
          data: {
            items: [
              {
                id: "invite-1",
                classId: "class-1",
                expiresAt: "2026-05-06T08:00:00.000Z",
                maxUses: 50,
                useCount: 3,
                revokedAt: null,
                createdAt: "2026-04-24T08:00:00.000Z",
              },
            ],
          },
        },
      });
      return;
    }

    if (pathname === "/api/v1/coach/classes/class-1/coaches") {
      await route.fulfill({
        json: {
          success: true,
          data: {
            items: [
              {
                classId: "class-1",
                userId: "coach-visual",
                username: "visual-coach",
                displayName: "视觉验收教练",
                userRole: "coach",
                coachRole: "owner",
                addedAt: "2026-04-20T08:00:00.000Z",
              },
            ],
          },
        },
      });
      return;
    }

    if (pathname === "/api/v1/coach/classes/class-1/assignments") {
      await route.fulfill({
        json: {
          success: true,
          data: {
            items: [
              {
                id: "assignment-1",
                classId: "class-1",
                createdBy: "coach-visual",
                title: "第 1 周模拟",
                mode: "fixed_prebuilt_paper",
                prebuiltPaperId: "paper-1",
                examType: "CSP-J",
                difficulty: "medium",
                blueprintVersion: 1,
                dueAt: "2026-05-06T10:00:00.000Z",
                status: "assigned",
                createdAt: "2026-04-28T08:00:00.000Z",
                updatedAt: "2026-04-28T08:00:00.000Z",
                assignedStudents: 2,
              },
            ],
          },
        },
      });
      return;
    }

    await route.fulfill({ status: 404, json: { success: false } });
  });

  await page.route("**/api/v1/coach/prebuilt-papers", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          items: [
            {
              id: "paper-1",
              title: "CSP-J 模拟卷 A",
              examType: "CSP-J",
              difficulty: "medium",
              blueprintVersion: 1,
              publishedAt: "2026-04-27T08:00:00.000Z",
            },
          ],
        },
      },
    });
  });

  await page.route("**/api/v1/coach/report/class-1", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          classId: "class-1",
          totals: {
            students: 2,
            pending: 1,
            inProgress: 0,
            completed: 3,
            missed: 1,
            averageScore: 84,
          },
          assignments: [
            {
              assignmentId: "assignment-1",
              title: "第 1 周模拟",
              status: "assigned",
              dueAt: "2026-05-06T10:00:00.000Z",
              completed: 1,
              missed: 0,
              averageScore: 88,
            },
          ],
          heatmap: {
            knowledgePointIds: ["101", "203"],
            students: [
              {
                userId: "student-1",
                displayName: "学生一",
                values: [
                  { kpId: "101", total: 4, correct: 3, accuracy: 0.75 },
                  { kpId: "203", total: 3, correct: 2, accuracy: 0.67 },
                ],
              },
              {
                userId: "student-2",
                displayName: "学生二",
                values: [
                  { kpId: "101", total: 4, correct: 2, accuracy: 0.5 },
                  { kpId: "203", total: 3, correct: 3, accuracy: 1 },
                ],
              },
            ],
          },
          questionTypeStats: [
            {
              questionType: "single_choice",
              total: 8,
              correct: 6,
              score: 60,
              maxScore: 80,
              accuracy: 0.75,
            },
          ],
          students: [
            {
              userId: "student-1",
              username: "student1",
              displayName: "学生一",
              pending: 0,
              inProgress: 0,
              completed: 2,
              missed: 0,
              averageScore: 88,
              latestSubmittedAt: "2026-04-28T10:00:00.000Z",
              kpStats: [
                { kpId: "101", total: 4, correct: 3, accuracy: 0.75 },
                { kpId: "203", total: 3, correct: 2, accuracy: 0.67 },
              ],
              questionTypeStats: [
                {
                  questionType: "single_choice",
                  total: 4,
                  correct: 3,
                  score: 30,
                  maxScore: 40,
                  accuracy: 0.75,
                },
              ],
              trend: [
                {
                  assignmentId: "assignment-1",
                  title: "第 1 周模拟",
                  status: "assigned",
                  dueAt: "2026-05-06T10:00:00.000Z",
                  progressStatus: "completed",
                  score: 88,
                  submittedAt: "2026-04-28T10:00:00.000Z",
                },
              ],
            },
          ],
        },
      },
    });
  });
}

const adminQuestionId = "11111111-1111-4111-8111-111111111111";
const adminPaperId = "22222222-2222-4222-8222-222222222222";

function paginated<T>(items: T[], pageSize = 20) {
  return {
    items,
    pagination: {
      page: 1,
      pageSize,
      total: items.length,
      totalPages: 1,
    },
  };
}

async function installAdminRoutes(page: Page) {
  await page.route("**/api/v1/health", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          status: "ok",
          timestamp: "2026-04-29T08:00:00.000Z",
          db: "ok",
          redis: "ok",
        },
      },
    });
  });

  await page.route("**/api/v1/admin/questions**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const listItem = {
      id: adminQuestionId,
      type: "single_choice",
      difficulty: "easy",
      status: "draft",
      source: "manual",
      sandboxVerified: true,
      createdAt: "2026-04-28T08:00:00.000Z",
    };

    if (pathname === "/api/v1/admin/questions") {
      await route.fulfill({ json: { success: true, data: paginated([listItem]) } });
      return;
    }

    if (pathname === `/api/v1/admin/questions/${adminQuestionId}/references`) {
      await route.fulfill({
        json: {
          success: true,
          data: {
            questionId: adminQuestionId,
            prebuiltPaperReferences: 0,
            paperInstanceReferences: 0,
            assignmentReferences: 0,
            totalReferences: 0,
            canDelete: true,
          },
        },
      });
      return;
    }

    await route.fulfill({
      json: {
        success: true,
        data: {
          ...listItem,
          primaryKpId: 101,
          contentHash: "visual-question-hash",
          contentJson: { stem: "中国的国家顶级域名是（）", options: ["A", "B", "C", "D"] },
          answerJson: { answer: "A" },
          explanationJson: { explanation: ".cn" },
          examTypes: ["CSP-J"],
          publishedAt: null,
          archivedAt: null,
          updatedAt: "2026-04-28T08:00:00.000Z",
        },
      },
    });
  });

  await page.route("**/api/v1/admin/prebuilt-papers**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const listItem = {
      id: adminPaperId,
      title: "CSP-J 模拟卷 A",
      examType: "CSP-J",
      difficulty: "medium",
      blueprintVersion: 1,
      rootPaperId: null,
      parentPaperId: null,
      versionNo: 1,
      status: "published",
      sourceBatchId: null,
      metadataJson: { source: "visual" },
      publishedAt: "2026-04-28T08:00:00.000Z",
      archivedAt: null,
      createdAt: "2026-04-28T08:00:00.000Z",
      updatedAt: "2026-04-28T08:00:00.000Z",
    };

    if (pathname === "/api/v1/admin/prebuilt-papers") {
      await route.fulfill({ json: { success: true, data: paginated([listItem]) } });
      return;
    }

    if (pathname === `/api/v1/admin/prebuilt-papers/${adminPaperId}/references`) {
      await route.fulfill({
        json: {
          success: true,
          data: {
            prebuiltPaperId: adminPaperId,
            paperInstanceReferences: 0,
            assignmentReferences: 0,
            totalReferences: 0,
            canDelete: false,
          },
        },
      });
      return;
    }

    await route.fulfill({
      json: {
        success: true,
        data: {
          ...listItem,
          slots: [
            {
              slotNo: 1,
              questionId: adminQuestionId,
              questionType: "single_choice",
              primaryKpId: 101,
              difficulty: "easy",
              points: 5,
            },
          ],
        },
      },
    });
  });

  await page.route("**/api/v1/admin/import-batches**", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          items: [
            {
              id: "batch-1",
              bundleType: "question_bundle",
              status: "applied",
              sourceFilename: "visual-question-bundle.json",
              checksum: "abcdef1234567890",
              importedBy: "admin-visual",
              summaryJson: {
                totalCount: 10,
                importedCount: 10,
                rejectedCount: 0,
                errors: [],
              },
              createdAt: "2026-04-28T08:00:00.000Z",
              updatedAt: "2026-04-28T08:00:00.000Z",
            },
          ],
          pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
        },
      },
    });
  });

  await page.route("**/api/v1/admin/question-reviews**", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: paginated([
          {
            id: "review-1",
            questionId: adminQuestionId,
            reviewStatus: "ai_reviewed",
            aiConfidence: 0.92,
            officialAnswerDiff: { answer: "match" },
            reviewerNotes: "",
            reviewedBy: null,
            reviewedAt: null,
            createdAt: "2026-04-28T08:00:00.000Z",
          },
        ]),
      },
    });
  });

  await page.route("**/api/v1/admin/users**", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: paginated(
          [
            {
              id: "admin-visual",
              username: "visual-admin",
              displayName: "视觉验收管理员",
              role: "admin",
              status: "active",
              createdAt: "2026-04-20T08:00:00.000Z",
            },
          ],
          30,
        ),
      },
    });
  });

  await page.route("**/api/v1/admin/settings", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          items: [
            {
              key: "exam.autosaveIntervalSeconds",
              category: "exam",
              label: "Autosave Interval",
              description: "考试自动保存间隔。",
              defaultValue: 180,
              valueJson: 180,
              isDefault: false,
              updatedBy: "admin-visual",
              createdAt: "2026-04-20T08:00:00.000Z",
              updatedAt: "2026-04-28T08:00:00.000Z",
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

test("Command bar opens role-aware navigation and reaches Admin dashboard", async ({ page }) => {
  const problems = collectBrowserProblems(page);
  await installCommonRoutes(page, {
    role: "admin",
    username: "visual-admin",
    displayName: "视觉验收管理员",
  });
  await installDashboardRoutes(page);
  await installAdminRoutes(page);

  await page.goto("/dashboard");
  await expect(page.getByTestId("dashboard-hero")).toBeVisible();
  await page.keyboard.press("Control+K");

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByPlaceholder("搜索页面、操作或主题")).toBeVisible();
  await expect(dialog.getByText("管理看板")).toBeVisible();
  await dialog.getByText("管理看板").click();
  await expect(page.getByTestId("admin-dashboard-page")).toBeVisible();
  expect(problems).toEqual([]);
});

test("AppShell navigation hides higher-privilege sections and opens mobile Sheet", async ({
  page,
}) => {
  const problems = collectBrowserProblems(page);
  await installCommonRoutes(page);
  await installDashboardRoutes(page);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/dashboard");
  await expect(page.getByTestId("dashboard-hero")).toBeVisible();
  await expect(page.getByRole("link", { name: /管理看板/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^报告$/ })).toHaveCount(0);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  await expect(page.getByTestId("mobile-navigation-trigger")).toBeVisible();
  await page.getByTestId("mobile-navigation-trigger").click();
  await expect(page.getByRole("dialog").getByText("主导航")).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("link", { name: /出卷考试/ })).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("link", { name: /管理看板/ })).toHaveCount(0);
  await expect(page.getByRole("dialog").getByRole("link", { name: /^报告$/ })).toHaveCount(0);
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
  await expect(page.getByRole("radio", { name: /CSP-J/ })).toBeChecked();
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
    { path: "/login", testId: "login-page" },
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
    if (route.testId === "login-page") {
      await expect(page.getByRole("button", { name: "使用 Passkey 登录" })).toBeVisible();
    }
    await waitForFonts(page);
    expect(await hasHorizontalOverflow(page)).toBe(false);

    await page.setViewportSize({ width: 375, height: 812 });
    await page.reload();
    await expect(page.getByTestId(route.testId)).toBeVisible();
    expect(await hasHorizontalOverflow(page)).toBe(false);
  }

  expect(problems).toEqual([]);
});

test("Account surfaces render without desktop or mobile overflow", async ({ page }) => {
  const problems = collectBrowserProblems(page);
  await installCommonRoutes(page);
  await installAccountRoutes(page);

  await expectRouteToFit(page, "/account/class", (targetPage) =>
    targetPage.getByTestId("account-class-page"),
  );
  await expectRouteToFit(page, "/join?code=AB12CD", (targetPage) =>
    targetPage.getByTestId("account-class-page"),
  );
  await expectRouteToFit(page, "/account/security", (targetPage) =>
    targetPage.getByTestId("account-security-page"),
  );

  expect(problems).toEqual([]);
});

test("Coach surfaces render without desktop or mobile overflow", async ({ page }) => {
  const problems = collectBrowserProblems(page);
  await installCommonRoutes(page, {
    role: "coach",
    username: "visual-coach",
    displayName: "视觉验收教练",
  });
  await installCoachRoutes(page);

  await expectRouteToFit(page, "/coach/classes", (targetPage) =>
    targetPage.getByTestId("coach-classes-page"),
  );
  await expectRouteToFit(page, "/coach/classes/class-1", (targetPage) =>
    targetPage.getByTestId("coach-class-detail-page"),
  );
  await expectRouteToFit(page, "/coach/assignments", (targetPage) =>
    targetPage.getByTestId("coach-assignments-page"),
  );
  await expectRouteToFit(page, "/coach/report?classId=class-1", (targetPage) =>
    targetPage.getByTestId("coach-report-page"),
  );

  expect(problems).toEqual([]);
});

test("Admin surfaces render without desktop or mobile overflow", async ({ page }) => {
  const problems = collectBrowserProblems(page);
  await installCommonRoutes(page, {
    role: "admin",
    username: "visual-admin",
    displayName: "视觉验收管理员",
  });
  await installAdminRoutes(page);

  const routes: Array<{ path: string; target: (page: Page) => Locator }> = [
    { path: "/admin", target: (targetPage) => targetPage.getByTestId("admin-dashboard-page") },
    {
      path: "/admin/questions",
      target: (targetPage) => targetPage.getByRole("heading", { name: "题库管理" }),
    },
    {
      path: "/admin/papers",
      target: (targetPage) => targetPage.getByRole("heading", { name: "预制卷库" }),
    },
    {
      path: "/admin/imports",
      target: (targetPage) => targetPage.getByRole("heading", { name: "导入中心" }),
    },
    {
      path: "/admin/review",
      target: (targetPage) => targetPage.getByRole("heading", { name: "审核队列" }),
    },
    {
      path: "/admin/users",
      target: (targetPage) => targetPage.getByRole("heading", { name: "用户管理" }),
    },
    {
      path: "/admin/settings",
      target: (targetPage) => targetPage.getByRole("heading", { name: "系统设置" }),
    },
  ];

  for (const route of routes) {
    await expectRouteToFit(page, route.path, route.target);
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
  await expect(page.getByText("DashboardInsight")).toBeVisible();
  await expect(page.getByText("AdminOpsInsight")).toBeVisible();
  await expect(page.getByText("ExamResultExplanation")).toBeVisible();
  await expect(page.getByText("A2UIProductionSlots")).toBeVisible();
  await waitForFonts(page);
  expect(await hasHorizontalOverflow(page)).toBe(false);
  expect(problems).toEqual([]);
});

test("UI gallery shows V2 charts and data-background patterns", async ({ page }) => {
  const problems = collectBrowserProblems(page);
  await installCommonRoutes(page, false);

  await page.goto("/dev/ui-gallery#plate-09");
  await expect(page.getByText("Recharts 趋势")).toBeVisible();
  await expect(page.getByText("雷达与排名")).toBeVisible();
  await expect(page.getByText("面积图", { exact: true })).toBeVisible();
  await expect(page.locator(".recharts-wrapper")).toHaveCount(4);

  await page.goto("/dev/ui-gallery#plate-10");
  await expect(page.getByText("V2 动效层级")).toBeVisible();
  const rhythmPlate = page.locator("#plate-10");
  await expect(rhythmPlate.getByText("排名丝带", { exact: true })).toBeVisible();
  await expect(rhythmPlate.getByText("运维信号带", { exact: true })).toBeVisible();
  await expect(rhythmPlate.getByText("导入时间线", { exact: true })).toBeVisible();
  await expect(rhythmPlate.getByText("热力光晕", { exact: true })).toBeVisible();

  const backgroundPatternCount = await page
    .locator(
      ".data-arena-rank-ribbon, .data-arena-heatmap-aura, .data-arena-signal-band, .data-arena-import-timeline, .data-arena-ceremony-burst",
    )
    .count();
  expect(backgroundPatternCount).toBeGreaterThanOrEqual(5);
  await waitForFonts(page);
  expect(await hasHorizontalOverflow(page)).toBe(false);
  expect(problems).toEqual([]);
});
