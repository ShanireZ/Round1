import { describe, expect, it } from "vitest";

import {
  buildCoachReportCsv,
  clampCoachReportPage,
  formatCoachPercent,
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
