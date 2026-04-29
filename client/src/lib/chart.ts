export const ROUND1_CHART_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "var(--color-chart-6)",
] as const;

export type Round1ChartColor = (typeof ROUND1_CHART_COLORS)[number];

export type Round1ChartSeries = {
  key: string;
  label: string;
  color?: Round1ChartColor;
};

export function getRound1ChartColor(index: number): Round1ChartColor {
  const normalizedIndex = Math.abs(Math.trunc(index)) % ROUND1_CHART_COLORS.length;
  return ROUND1_CHART_COLORS[normalizedIndex] ?? ROUND1_CHART_COLORS[0];
}

export function createRound1ChartSeries(
  series: readonly Omit<Round1ChartSeries, "color">[],
): Round1ChartSeries[] {
  return series.map((item, index) => ({
    ...item,
    color: getRound1ChartColor(index),
  }));
}

export function summarizeRound1ChartData({
  title,
  points,
  series,
}: {
  title: string;
  points: number;
  series: readonly Round1ChartSeries[];
}): string {
  const seriesLabels = series.map((item) => item.label).join("、");
  return `${title}，包含 ${points} 个数据点，序列：${seriesLabels || "无"}`;
}
