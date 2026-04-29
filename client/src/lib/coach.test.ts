import { describe, expect, it } from "vitest";

import {
  buildCoachReportCsv,
  clampCoachReportPage,
  countActiveCoachClasses,
  countActiveCoachClassInvites,
  countOpenCoachAssignments,
  formatCoachAssignmentStatusLabel,
  formatCoachClassRoleLabel,
  formatCoachClassInviteStatusLabel,
  formatCoachPercent,
  getCoachClassInviteStatus,
  getCoachReportPageCount,
  getCoachReportPageItems,
  heatmapBucket,
  scoreOrDash,
} from "./coach";

describe("coach report helpers", () => {
  it("maps heatmap accuracy into stable token buckets", () => {
    expect(heatmapBucket({ kpId: "1", total: 0, correct: 0, accuracy: 0 })).toBe(0);
    expect(heatmapBucket({ kpId: "1", total: 5, correct: 1, accuracy: 0.2 })).toBe(1);
    expect(heatmapBucket({ kpId: "1", total: 5, correct: 2, accuracy: 0.4 })).toBe(2);
    expect(heatmapBucket({ kpId: "1", total: 5, correct: 4, accuracy: 0.8 })).toBe(3);
    expect(heatmapBucket({ kpId: "1", total: 5, correct: 5, accuracy: 1 })).toBe(4);
  });

  it("formats report numbers without leaking NaN into the UI", () => {
    expect(formatCoachPercent(0.756)).toBe("76%");
    expect(formatCoachPercent(Number.NaN)).toBe("0%");
    expect(scoreOrDash(89.4)).toBe("89");
    expect(scoreOrDash(null)).toBe("--");
  });

  it("summarizes coach class and assignment UI states", () => {
    expect(formatCoachClassRoleLabel("owner")).toBe("负责人");
    expect(formatCoachClassRoleLabel("collaborator")).toBe("协作教练");
    expect(formatCoachClassRoleLabel(undefined)).toBe("教练");
    expect(formatCoachAssignmentStatusLabel("assigned")).toBe("进行中");
    expect(formatCoachAssignmentStatusLabel("closed")).toBe("已关闭");
    expect(formatCoachAssignmentStatusLabel("paused")).toBe("paused");

    expect(
      countActiveCoachClasses([
        {
          id: "11111111-1111-4111-8111-111111111111",
          name: "A",
          joinCode: "ABC123",
          archivedAt: null,
          createdBy: "00000000-0000-4000-8000-000000000001",
          createdAt: "2026-04-28T00:00:00.000Z",
          updatedAt: "2026-04-28T00:00:00.000Z",
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          name: "B",
          joinCode: "DEF456",
          archivedAt: "2026-04-28T00:00:00.000Z",
          createdBy: "00000000-0000-4000-8000-000000000001",
          createdAt: "2026-04-28T00:00:00.000Z",
          updatedAt: "2026-04-28T00:00:00.000Z",
        },
      ]),
    ).toBe(1);

    expect(
      countOpenCoachAssignments([
        {
          id: "33333333-3333-4333-8333-333333333333",
          classId: "11111111-1111-4111-8111-111111111111",
          createdBy: "00000000-0000-4000-8000-000000000001",
          title: "Week 1",
          mode: "timed",
          prebuiltPaperId: "44444444-4444-4444-8444-444444444444",
          examType: "CSP-J",
          difficulty: "medium",
          blueprintVersion: 1,
          dueAt: "2026-04-30T00:00:00.000Z",
          status: "assigned",
          createdAt: "2026-04-28T00:00:00.000Z",
          updatedAt: "2026-04-28T00:00:00.000Z",
        },
        {
          id: "55555555-5555-4555-8555-555555555555",
          classId: "11111111-1111-4111-8111-111111111111",
          createdBy: "00000000-0000-4000-8000-000000000001",
          title: "Week 2",
          mode: "timed",
          prebuiltPaperId: "66666666-6666-4666-8666-666666666666",
          examType: "CSP-J",
          difficulty: "medium",
          blueprintVersion: 1,
          dueAt: "2026-05-07T00:00:00.000Z",
          status: "closed",
          createdAt: "2026-04-28T00:00:00.000Z",
          updatedAt: "2026-04-28T00:00:00.000Z",
        },
      ]),
    ).toBe(1);
  });

  it("classifies invite link lifecycle states for detail management", () => {
    const now = new Date("2026-04-28T00:00:00.000Z");
    const active = {
      expiresAt: "2026-04-29T00:00:00.000Z",
      maxUses: 3,
      useCount: 1,
      revokedAt: null,
    };

    expect(getCoachClassInviteStatus(active, now)).toBe("active");
    expect(formatCoachClassInviteStatusLabel("active")).toBe("可使用");
    expect(formatCoachClassInviteStatusLabel("revoked")).toBe("已撤销");
    expect(formatCoachClassInviteStatusLabel("expired")).toBe("已过期");
    expect(formatCoachClassInviteStatusLabel("full")).toBe("已用完");
    expect(
      getCoachClassInviteStatus({ ...active, revokedAt: "2026-04-27T00:00:00.000Z" }, now),
    ).toBe("revoked");
    expect(getCoachClassInviteStatus({ ...active, expiresAt: now.toISOString() }, now)).toBe(
      "expired",
    );
    expect(getCoachClassInviteStatus({ ...active, useCount: 3 }, now)).toBe("full");
    expect(
      countActiveCoachClassInvites(
        [active, { ...active, revokedAt: "2026-04-27T00:00:00.000Z" }, { ...active, useCount: 3 }],
        now,
      ),
    ).toBe(1);
  });

  it("windows report rows with stable clamped pagination", () => {
    const items = Array.from({ length: 53 }, (_, index) => index + 1);

    expect(getCoachReportPageCount(items.length, 25)).toBe(3);
    expect(clampCoachReportPage(99, items.length, 25)).toBe(3);
    expect(clampCoachReportPage(Number.NaN, items.length, 25)).toBe(1);
    expect(getCoachReportPageItems(items, 3, 25)).toEqual([51, 52, 53]);
  });

  it("exports a BOM-prefixed CSV with escaped student names", () => {
    const csv = buildCoachReportCsv({
      classId: "11111111-1111-4111-8111-111111111111",
      totals: {
        students: 1,
        pending: 0,
        inProgress: 0,
        completed: 1,
        missed: 0,
        averageScore: 91,
      },
      assignments: [],
      heatmap: { knowledgePointIds: [], students: [] },
      questionTypeStats: [],
      students: [
        {
          userId: "55555555-5555-4555-8555-555555555555",
          username: "student",
          displayName: '张三, "Beta"',
          pending: 0,
          inProgress: 0,
          completed: 1,
          missed: 0,
          averageScore: 91,
          latestSubmittedAt: "2026-04-28T00:00:00.000Z",
          kpStats: [],
          questionTypeStats: [],
          trend: [],
        },
      ],
    });

    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"张三, ""Beta"""');
  });

  it("guards exported CSV cells against spreadsheet formulas", () => {
    const csv = buildCoachReportCsv({
      classId: "11111111-1111-4111-8111-111111111111",
      totals: {
        students: 3,
        pending: 0,
        inProgress: 0,
        completed: 3,
        missed: 0,
        averageScore: 91,
      },
      assignments: [],
      heatmap: { knowledgePointIds: [], students: [] },
      questionTypeStats: [],
      students: [
        {
          userId: "55555555-5555-4555-8555-555555555555",
          username: "student",
          displayName: '=HYPERLINK("https://example.invalid")',
          pending: 0,
          inProgress: 0,
          completed: 1,
          missed: 0,
          averageScore: 91,
          latestSubmittedAt: "2026-04-28T00:00:00.000Z",
          kpStats: [],
          questionTypeStats: [],
          trend: [],
        },
        {
          userId: "66666666-6666-4666-8666-666666666666",
          username: "student-tab",
          displayName: "\tTabbed",
          pending: 0,
          inProgress: 0,
          completed: 1,
          missed: 0,
          averageScore: 88,
          latestSubmittedAt: "2026-04-28T00:00:00.000Z",
          kpStats: [],
          questionTypeStats: [],
          trend: [],
        },
        {
          userId: "77777777-7777-4777-8777-777777777777",
          username: "student-spaced",
          displayName: "  +SUM(A1:A2)",
          pending: 0,
          inProgress: 0,
          completed: 1,
          missed: 0,
          averageScore: 85,
          latestSubmittedAt: "2026-04-28T00:00:00.000Z",
          kpStats: [],
          questionTypeStats: [],
          trend: [],
        },
      ],
    });

    expect(csv).toContain('"\'=HYPERLINK(""https://example.invalid"")"');
    expect(csv).toContain("'\tTabbed");
    expect(csv).toContain("'  +SUM(A1:A2)");
  });
});
