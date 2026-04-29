import { describe, expect, it } from "vitest";

import { createRound1ChartSeries, getRound1ChartColor, summarizeRound1ChartData } from "./chart";

describe("Round1 chart helpers", () => {
  it("maps chart colors to token variables without raw colors", () => {
    expect(getRound1ChartColor(0)).toBe("var(--color-chart-1)");
    expect(getRound1ChartColor(5)).toBe("var(--color-chart-6)");
    expect(getRound1ChartColor(6)).toBe("var(--color-chart-1)");
  });

  it("creates token-bound series metadata", () => {
    expect(
      createRound1ChartSeries([
        { key: "score", label: "分数" },
        { key: "rank", label: "排名" },
      ]),
    ).toEqual([
      { key: "score", label: "分数", color: "var(--color-chart-1)" },
      { key: "rank", label: "排名", color: "var(--color-chart-2)" },
    ]);
  });

  it("creates accessible chart summaries", () => {
    expect(
      summarizeRound1ChartData({
        title: "最近模拟趋势",
        points: 6,
        series: createRound1ChartSeries([{ key: "score", label: "分数" }]),
      }),
    ).toBe("最近模拟趋势，包含 6 个数据点，序列：分数");
  });
});
