import { describe, expect, it } from "vitest";

import {
  buildDashboardHeatmapRows,
  buildDashboardRadarAxes,
  buildRadarPolygonPoints,
  dashboardWeaknessHeatmapBucket,
  riskBucketFromPercent,
} from "./dashboard";
import type { UserStatsPayload } from "./exam-runtime";

describe("dashboard visual helpers", () => {
  it("maps weakness risk into stable heatmap token buckets", () => {
    expect(riskBucketFromPercent(0)).toBe(0);
    expect(riskBucketFromPercent(12)).toBe(1);
    expect(riskBucketFromPercent(32)).toBe(2);
    expect(riskBucketFromPercent(52)).toBe(3);
    expect(riskBucketFromPercent(86)).toBe(4);
    expect(dashboardWeaknessHeatmapBucket({ kpId: "101", total: 10, correct: 2, accuracy: 0.2 })).toBe(4);
  });

  it("builds radar axes from KP accuracy before falling back to summary metrics", () => {
    const stats: UserStatsPayload = {
      totalAttempts: 6,
      averageScore: 78,
      bestScore: 92,
      latestSubmittedAt: "2026-04-28T10:00:00.000Z",
      weakPrimaryKps: [
        { kpId: "101", total: 10, correct: 7, accuracy: 0.7 },
        { kpId: "102", total: 8, correct: 4, accuracy: 0.5 },
        { kpId: "103", total: 5, correct: 2, accuracy: 0.4 },
      ],
    };

    expect(buildDashboardRadarAxes(stats).map((axis) => axis.label)).toEqual([
      "KP 101",
      "KP 102",
      "KP 103",
    ]);

    expect(buildDashboardRadarAxes({ ...stats, weakPrimaryKps: [] }).map((axis) => axis.key)).toEqual([
      "average",
      "best",
      "volume",
      "recent",
    ]);
  });

  it("builds compact weakness heatmap rows and radar polygon points", () => {
    const rows = buildDashboardHeatmapRows([
      { kpId: "201", total: 12, correct: 6, accuracy: 0.5 },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.cells.map((cell) => cell.key)).toEqual(["missRate", "missCount", "sample"]);
    expect(buildRadarPolygonPoints([100, 50, 0])).toMatch(/^50\.00,8\.00/);
    expect(buildRadarPolygonPoints([100, 50])).toBe("");
  });
});
