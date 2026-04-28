import type { UserStatsPayload, UserWeakPrimaryKp } from "./exam-runtime";

export type DashboardRadarAxis = {
  key: string;
  label: string;
  value: number;
  description: string;
};

export type DashboardHeatmapCell = {
  key: "missRate" | "missCount" | "sample";
  label: string;
  value: number;
  bucket: 0 | 1 | 2 | 3 | 4;
};

export type DashboardHeatmapRow = {
  kpId: string;
  cells: DashboardHeatmapCell[];
};

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(Math.round(value), 100));
}

export function riskBucketFromPercent(value: number): 0 | 1 | 2 | 3 | 4 {
  const percent = clampPercent(value);
  if (percent <= 0) {
    return 0;
  }
  if (percent < 20) {
    return 1;
  }
  if (percent < 40) {
    return 2;
  }
  if (percent < 65) {
    return 3;
  }
  return 4;
}

export function buildDashboardRadarAxes(stats: UserStatsPayload): DashboardRadarAxis[] {
  const kpAxes = stats.weakPrimaryKps.slice(0, 6).map((item) => ({
    key: `kp-${item.kpId}`,
    label: `KP ${item.kpId}`,
    value: clampPercent(item.accuracy * 100),
    description: `${item.correct}/${item.total}`,
  }));

  if (kpAxes.length >= 3) {
    return kpAxes;
  }

  return [
    {
      key: "average",
      label: "均分",
      value: clampPercent(stats.averageScore),
      description: "平均分",
    },
    {
      key: "best",
      label: "峰值",
      value: clampPercent(stats.bestScore),
      description: "最佳分",
    },
    {
      key: "volume",
      label: "练习",
      value: clampPercent((stats.totalAttempts / 8) * 100),
      description: `${stats.totalAttempts} 次`,
    },
    {
      key: "recent",
      label: "近期",
      value: stats.latestSubmittedAt ? 100 : 0,
      description: stats.latestSubmittedAt ? "已有提交" : "暂无提交",
    },
  ];
}

export function dashboardWeaknessHeatmapBucket(item: UserWeakPrimaryKp): 0 | 1 | 2 | 3 | 4 {
  if (item.total <= 0) {
    return 0;
  }

  return riskBucketFromPercent((1 - item.accuracy) * 100);
}

export function buildDashboardHeatmapRows(items: UserWeakPrimaryKp[]): DashboardHeatmapRow[] {
  return items.slice(0, 6).map((item) => {
    const missCount = Math.max(item.total - item.correct, 0);
    const missRate = item.total <= 0 ? 0 : (missCount / item.total) * 100;

    return {
      kpId: item.kpId,
      cells: [
        {
          key: "missRate",
          label: "错题率",
          value: clampPercent(missRate),
          bucket: dashboardWeaknessHeatmapBucket(item),
        },
        {
          key: "missCount",
          label: "错题量",
          value: missCount,
          bucket: riskBucketFromPercent((missCount / 12) * 100),
        },
        {
          key: "sample",
          label: "样本量",
          value: item.total,
          bucket: riskBucketFromPercent((item.total / 24) * 100),
        },
      ],
    };
  });
}

export function buildRadarPolygonPoints(values: readonly number[], radius = 42, center = 50): string {
  if (values.length < 3) {
    return "";
  }

  return values
    .map((value, index) => {
      const angle = -Math.PI / 2 + (Math.PI * 2 * index) / values.length;
      const distance = (clampPercent(value) / 100) * radius;
      const x = center + Math.cos(angle) * distance;
      const y = center + Math.sin(angle) * distance;

      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}
