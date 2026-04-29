import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BookOpenText,
  ChartNoAxesColumnIncreasing,
  Clock3,
  Lightbulb,
  LogIn,
  ListChecks,
  Target,
} from "lucide-react";

import { HeroBackdrop } from "@/components/brand/HeroBackdrop";
import { MeshGradient } from "@/components/brand/MeshGradient";
import { NoiseTexture } from "@/components/brand/NoiseTexture";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchUserAttemptHistory,
  fetchUserStats,
  type UserAttemptHistoryItem,
  type UserStatsPayload,
  type UserWeakPrimaryKp,
} from "@/lib/exam-runtime";
import { fetchAuthSession } from "@/lib/auth";
import { formatDifficultyLabel } from "@/lib/exam-results";
import {
  buildDashboardHeatmapRows,
  buildDashboardRadarAxes,
  buildRadarPolygonPoints,
  type DashboardRadarAxis,
} from "@/lib/dashboard";

function formatDate(value: string | null) {
  if (!value) {
    return "暂无";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatScore(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return "--";
  }

  return String(Math.round(value));
}

const scoreTrendBarHeightClasses = [
  "h-[4%]",
  "h-[5%]",
  "h-[10%]",
  "h-[15%]",
  "h-[20%]",
  "h-[25%]",
  "h-[30%]",
  "h-[35%]",
  "h-[40%]",
  "h-[45%]",
  "h-[50%]",
  "h-[55%]",
  "h-[60%]",
  "h-[65%]",
  "h-[70%]",
  "h-[75%]",
  "h-[80%]",
  "h-[85%]",
  "h-[90%]",
  "h-[95%]",
  "h-full",
] as const;

function scoreTrendBarHeightClass(score: number) {
  if (score <= 0) {
    return scoreTrendBarHeightClasses[0];
  }

  const bucket = Math.min(20, Math.max(1, Math.ceil(score / 5)));
  return scoreTrendBarHeightClasses[bucket];
}

function statusLabel(status: string) {
  if (status === "auto_submitted") {
    return "自动交卷";
  }

  if (status === "submitted") {
    return "已交卷";
  }

  return status;
}

const heatmapBucketClasses = [
  "bg-[var(--color-heatmap-0)] text-muted-foreground",
  "bg-[var(--color-heatmap-1)] text-foreground",
  "bg-[var(--color-heatmap-2)] text-foreground",
  "bg-[var(--color-heatmap-3)] text-primary-foreground",
  "bg-[var(--color-heatmap-4)] text-primary-foreground",
] as const;

function LoadingDashboard() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-6 py-8">
      <Skeleton className="h-44 w-full" />
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Skeleton className="h-96 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    </div>
  );
}

function LoginRequiredDashboard() {
  return (
    <div className="h-full overflow-y-auto px-6 py-8">
      <div className="mx-auto grid min-h-[60vh] max-w-3xl place-items-center">
        <div className="border-border bg-card w-full rounded-[var(--radius-lg)] border p-8 text-center shadow-sm">
          <LogIn className="text-primary mx-auto h-9 w-9" />
          <h1 className="text-foreground mt-5 text-2xl font-semibold tracking-tight">
            登录后查看训练概览
          </h1>
          <p className="text-muted-foreground mx-auto mt-3 max-w-lg text-sm leading-6">
            成绩趋势、答题历史和弱项统计会绑定到你的账号。当前浏览器没有有效登录会话。
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button asChild variant="primary">
              <Link to="/login">
                登录
                <ArrowRight />
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to="/register">注册</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScoreTrend({ attempts }: { attempts: UserAttemptHistoryItem[] }) {
  const points = attempts
    .filter((attempt) => typeof attempt.score === "number")
    .slice(0, 8)
    .reverse();

  if (points.length === 0) {
    return (
      <div className="border-border bg-subtle/10 grid min-h-64 place-items-center rounded-[var(--radius-lg)] border border-dashed p-8 text-center">
        <div className="space-y-3">
          <ChartNoAxesColumnIncreasing className="text-muted-foreground mx-auto h-8 w-8" />
          <div className="text-muted-foreground text-sm">完成一次模拟后会显示成绩曲线。</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid h-64 grid-cols-[auto_1fr] gap-4">
        <div className="text-muted-foreground flex flex-col justify-between py-2 text-xs">
          <span>100</span>
          <span>75</span>
          <span>50</span>
          <span>25</span>
          <span>0</span>
        </div>
        <div className="border-border/80 grid grid-cols-8 items-end gap-3 border-b border-l px-4 py-2">
          {points.map((attempt, index) => {
            const score = Math.max(0, Math.min(100, attempt.score ?? 0));
            return (
              <div key={attempt.id} className="flex min-w-0 flex-col items-center gap-2">
                <div
                  className={`bg-primary/85 w-full rounded-t-[var(--radius-sm)] transition-all ${scoreTrendBarHeightClass(score)}`}
                  title={`${attempt.examType} ${formatScore(attempt.score)} 分`}
                />
                <span className="text-muted-foreground w-full truncate text-center text-xs">
                  #{index + 1}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {points.slice(-4).map((attempt) => (
          <div
            key={attempt.id}
            className="border-border rounded-[var(--radius-md)] border bg-white/70 p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground truncate text-xs">{attempt.examType}</span>
              <Badge variant="outline">{formatScore(attempt.score)}</Badge>
            </div>
            <div className="text-muted-foreground mt-2 text-xs">
              {formatDate(attempt.submittedAt)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AttemptHistory({ attempts }: { attempts: UserAttemptHistoryItem[] }) {
  if (attempts.length === 0) {
    return (
      <div className="border-border bg-subtle/10 rounded-[var(--radius-lg)] border border-dashed p-8 text-center">
        <BookOpenText className="text-muted-foreground mx-auto h-8 w-8" />
        <div className="text-muted-foreground mt-3 text-sm">还没有答题历史。</div>
        <Button asChild variant="primary" className="mt-5">
          <Link to="/exams/new">
            开始模拟
            <ArrowRight />
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="divide-border border-border divide-y overflow-hidden rounded-[var(--radius-lg)] border">
      {attempts.slice(0, 8).map((attempt) => (
        <Link
          key={attempt.id}
          to={`/exams/${attempt.paperId}/result`}
          className="bg-card hover:bg-subtle/20 grid gap-3 p-4 transition-colors sm:grid-cols-[1fr_auto]"
        >
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{attempt.examType}</Badge>
              <Badge variant="outline">{formatDifficultyLabel(attempt.difficulty)}</Badge>
              <Badge variant={attempt.status === "auto_submitted" ? "tle" : "saved"}>
                {statusLabel(attempt.status)}
              </Badge>
            </div>
            <div className="text-muted-foreground text-sm">{formatDate(attempt.submittedAt)}</div>
          </div>
          <div className="flex items-center justify-between gap-4 sm:justify-end">
            <div className="text-foreground text-2xl font-semibold">
              {formatScore(attempt.score)}
            </div>
            <ArrowRight className="text-muted-foreground h-4 w-4" />
          </div>
        </Link>
      ))}
    </div>
  );
}

function DashboardHero({ stats }: { stats: NonNullable<ReturnType<typeof normalizeStats>> }) {
  return (
    <section
      className="border-border bg-card relative overflow-hidden rounded-[var(--radius-xl)] border p-6 md:p-8"
      data-testid="dashboard-hero"
    >
      <MeshGradient variant="hero" className="opacity-80" />
      <HeroBackdrop text="Round1" className="text-primary" />
      <NoiseTexture />

      <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="space-y-4">
          <Badge variant="outline">Dashboard</Badge>
          <div className="space-y-3">
            <h1 className="text-foreground text-3xl font-semibold md:text-5xl">我的训练概览</h1>
            <p className="text-muted-foreground max-w-2xl text-sm leading-6">
              最近考试、能力雷达、弱项热力图与规则建议会跟随运行时结果同步更新。
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="primary">
              <Link to="/exams/new">
                开始模拟
                <ArrowRight />
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to="/account/class">查看班级</Link>
            </Button>
          </div>
        </div>

        <div className="grid min-w-0 grid-cols-3 gap-3 sm:min-w-80">
          <div className="border-border bg-card/80 rounded-[var(--radius-lg)] border p-4 backdrop-blur-sm">
            <div className="text-muted-foreground text-xs">次数</div>
            <div className="text-foreground mt-2 text-2xl font-semibold tabular-nums">
              {stats.totalAttempts}
            </div>
          </div>
          <div className="border-border bg-card/80 rounded-[var(--radius-lg)] border p-4 backdrop-blur-sm">
            <div className="text-muted-foreground text-xs">均分</div>
            <div className="text-foreground mt-2 text-2xl font-semibold tabular-nums">
              {Math.round(stats.averageScore)}
            </div>
          </div>
          <div className="border-border bg-card/80 rounded-[var(--radius-lg)] border p-4 backdrop-blur-sm">
            <div className="text-muted-foreground text-xs">最佳</div>
            <div className="text-foreground mt-2 text-2xl font-semibold tabular-nums">
              {stats.bestScore}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function AbilityRadar({ axes }: { axes: DashboardRadarAxis[] }) {
  if (axes.length < 3) {
    return (
      <div
        className="border-border bg-subtle/10 grid min-h-80 place-items-center rounded-[var(--radius-lg)] border border-dashed p-8 text-center"
        data-testid="dashboard-ability-radar"
      >
        <div className="space-y-3">
          <Target className="text-muted-foreground mx-auto h-8 w-8" />
          <div className="text-muted-foreground text-sm">完成更多模拟后会生成能力雷达。</div>
        </div>
      </div>
    );
  }

  const polygon = buildRadarPolygonPoints(axes.map((axis) => axis.value));

  return (
    <div className="space-y-5" data-testid="dashboard-ability-radar">
      <div className="mx-auto aspect-square w-full max-w-sm">
        <svg
          viewBox="0 0 100 100"
          role="img"
          aria-label="能力雷达图"
          className="text-muted-foreground h-full w-full overflow-visible"
        >
          {[14, 28, 42].map((radius) => (
            <circle
              key={radius}
              cx="50"
              cy="50"
              r={radius}
              className="stroke-border fill-none"
              strokeWidth="0.5"
            />
          ))}
          {axes.map((axis, index) => {
            const angle = -Math.PI / 2 + (Math.PI * 2 * index) / axes.length;
            const x = 50 + Math.cos(angle) * 42;
            const y = 50 + Math.sin(angle) * 42;
            const labelX = 50 + Math.cos(angle) * 48;
            const labelY = 50 + Math.sin(angle) * 48;
            const textAnchor = labelX < 44 ? "end" : labelX > 56 ? "start" : "middle";

            return (
              <g key={axis.key}>
                <line x1="50" y1="50" x2={x} y2={y} className="stroke-border" strokeWidth="0.5" />
                <text
                  x={labelX}
                  y={labelY}
                  textAnchor={textAnchor}
                  dominantBaseline="middle"
                  className="fill-current text-[6px]"
                >
                  {axis.label}
                </text>
              </g>
            );
          })}
          <polygon
            points={polygon}
            fill="var(--color-primary)"
            fillOpacity="0.14"
            stroke="var(--color-primary)"
            strokeWidth="1.5"
          />
        </svg>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {axes.map((axis) => (
          <div
            key={axis.key}
            className="border-border bg-subtle/15 rounded-[var(--radius-md)] border p-3"
          >
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-foreground font-medium">{axis.label}</span>
              <span className="text-muted-foreground tabular-nums">{axis.value}%</span>
            </div>
            <div className="text-muted-foreground mt-1 text-xs">{axis.description}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function WeaknessHeatmap({ items }: { items: UserWeakPrimaryKp[] }) {
  const rows = buildDashboardHeatmapRows(items);

  if (rows.length === 0) {
    return (
      <div
        className="border-border bg-subtle/10 grid min-h-44 place-items-center rounded-[var(--radius-lg)] border border-dashed p-8 text-center"
        data-testid="dashboard-weakness-heatmap"
      >
        <div className="space-y-3">
          <Target className="text-muted-foreground mx-auto h-8 w-8" />
          <div className="text-muted-foreground text-sm">暂无弱项热力数据。</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="dashboard-weakness-heatmap">
      <div className="grid gap-3">
        {rows.map((row) => (
          <div key={row.kpId} className="grid gap-3 sm:grid-cols-[96px_1fr] sm:items-center">
            <div className="text-foreground font-mono text-sm font-medium">KP {row.kpId}</div>
            <div className="grid grid-cols-3 gap-2">
              {row.cells.map((cell) => (
                <div
                  key={cell.key}
                  className={`border-border/70 min-h-16 rounded-[var(--radius-md)] border p-3 ${heatmapBucketClasses[cell.bucket]}`}
                  aria-label={`KP ${row.kpId} ${cell.label} ${cell.value}`}
                >
                  <div className="text-xs opacity-80">{cell.label}</div>
                  <div className="mt-2 text-lg font-semibold tabular-nums">{cell.value}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="text-muted-foreground flex flex-wrap gap-2 text-xs" aria-hidden="true">
        {heatmapBucketClasses.map((className, index) => (
          <span
            key={className}
            className={`border-border/70 inline-flex h-5 w-10 items-center justify-center rounded-[var(--radius-sm)] border ${className}`}
          >
            {index}
          </span>
        ))}
      </div>
    </div>
  );
}

function normalizeStats(stats: UserStatsPayload | undefined): UserStatsPayload {
  return (
    stats ?? {
      totalAttempts: 0,
      averageScore: 0,
      bestScore: 0,
      latestSubmittedAt: null,
      weakPrimaryKps: [],
    }
  );
}

export default function Dashboard() {
  const sessionQuery = useQuery({
    queryKey: ["auth-session"],
    queryFn: fetchAuthSession,
    retry: false,
    staleTime: 30_000,
  });
  const isAuthenticated = sessionQuery.data?.authenticated === true;
  const historyQuery = useQuery({
    queryKey: ["user-attempt-history", 1, 20],
    queryFn: () => fetchUserAttemptHistory({ page: 1, pageSize: 20 }),
    enabled: isAuthenticated,
  });
  const statsQuery = useQuery({
    queryKey: ["user-stats"],
    queryFn: fetchUserStats,
    enabled: isAuthenticated,
  });

  if (sessionQuery.isPending) {
    return <LoadingDashboard />;
  }

  if (!isAuthenticated) {
    return <LoginRequiredDashboard />;
  }

  if (historyQuery.isPending || statsQuery.isPending) {
    return <LoadingDashboard />;
  }

  const attempts = historyQuery.data?.items ?? [];
  const stats = normalizeStats(statsQuery.data);
  const radarAxes = buildDashboardRadarAxes(stats);

  return (
    <div className="h-full overflow-y-auto px-6 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <DashboardHero stats={stats} />

        <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
          <Card variant="flat" className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <ListChecks className="text-primary h-5 w-5" />
                最近考试
              </CardTitle>
              <CardDescription className="flex items-center gap-2">
                <Clock3 className="h-4 w-4" />
                最近提交时间：{formatDate(stats.latestSubmittedAt)}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AttemptHistory attempts={attempts} />
            </CardContent>
          </Card>

          <Card variant="flat" className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Target className="text-primary h-5 w-5" />
                能力雷达
              </CardTitle>
              <CardDescription>根据最近作答中的知识点准确率生成。</CardDescription>
            </CardHeader>
            <CardContent>
              <AbilityRadar axes={radarAxes} />
            </CardContent>
          </Card>
        </div>

        <Card variant="flat" className="border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Target className="text-primary h-5 w-5" />
              弱项热力图
            </CardTitle>
            <CardDescription>以错题率、错题量和样本量展示当前最需要复盘的 KP。</CardDescription>
          </CardHeader>
          <CardContent>
            <WeaknessHeatmap items={stats.weakPrimaryKps} />
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
          <Card variant="flat" className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <ChartNoAxesColumnIncreasing className="text-primary h-5 w-5" />
                成绩曲线
              </CardTitle>
              <CardDescription>最近 8 次已完成模拟的分数变化。</CardDescription>
            </CardHeader>
            <CardContent>
              <ScoreTrend attempts={attempts} />
            </CardContent>
          </Card>

          <Card variant="flat" className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Lightbulb className="text-primary h-5 w-5" />
                智能建议
              </CardTitle>
              <CardDescription>当前为规则型静态建议区，AI 文案模板保留为 v2。</CardDescription>
            </CardHeader>
            <CardContent className="text-muted-foreground space-y-3 text-sm leading-6">
              <div>先复盘最近一次低分题，再做同一 exam type 的中等难度卷。</div>
              <div>弱项 KP 正确率低于 50% 时，优先回看错题解析和对应知识点笔记。</div>
              <div>连续两次超过 85 分后，再切到更高难度或限时训练。</div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
