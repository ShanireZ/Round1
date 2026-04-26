import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BookOpenText,
  ChartNoAxesColumnIncreasing,
  Clock3,
  Lightbulb,
  ListChecks,
  Target,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchUserAttemptHistory,
  fetchUserStats,
  type UserAttemptHistoryItem,
  type UserWeakPrimaryKp,
} from "@/lib/exam-runtime";
import { formatDifficultyLabel } from "@/lib/exam-results";

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

function statusLabel(status: string) {
  if (status === "auto_submitted") {
    return "自动交卷";
  }

  if (status === "submitted") {
    return "已交卷";
  }

  return status;
}

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

function ScoreTrend({ attempts }: { attempts: UserAttemptHistoryItem[] }) {
  const points = attempts
    .filter((attempt) => typeof attempt.score === "number")
    .slice(0, 8)
    .reverse();

  if (points.length === 0) {
    return (
      <div className="grid min-h-64 place-items-center rounded-[--radius-lg] border border-dashed border-border bg-subtle/10 p-8 text-center">
        <div className="space-y-3">
          <ChartNoAxesColumnIncreasing className="mx-auto h-8 w-8 text-muted-foreground" />
          <div className="text-sm text-muted-foreground">完成一次模拟后会显示成绩曲线。</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid h-64 grid-cols-[auto_1fr] gap-4">
        <div className="flex flex-col justify-between py-2 text-xs text-muted-foreground">
          <span>100</span>
          <span>75</span>
          <span>50</span>
          <span>25</span>
          <span>0</span>
        </div>
        <div className="grid grid-cols-8 items-end gap-3 border-l border-b border-border/80 px-4 py-2">
          {points.map((attempt, index) => {
            const score = Math.max(0, Math.min(100, attempt.score ?? 0));
            return (
              <div key={attempt.id} className="flex min-w-0 flex-col items-center gap-2">
                <div
                  className="w-full rounded-t-[--radius-sm] bg-primary/85 transition-all"
                  style={{ height: `${Math.max(score, 4)}%` }}
                  title={`${attempt.examType} ${formatScore(attempt.score)} 分`}
                />
                <span className="w-full truncate text-center text-xs text-muted-foreground">#{index + 1}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {points.slice(-4).map((attempt) => (
          <div key={attempt.id} className="rounded-[--radius-md] border border-border bg-white/70 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-xs text-muted-foreground">{attempt.examType}</span>
              <Badge variant="outline">{formatScore(attempt.score)}</Badge>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">{formatDate(attempt.submittedAt)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function WeaknessList({ items }: { items: UserWeakPrimaryKp[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-[--radius-lg] border border-dashed border-border bg-subtle/10 p-6 text-sm text-muted-foreground">
        暂无弱项统计。
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {items.slice(0, 5).map((item) => {
        const accuracy = Math.round(item.accuracy * 100);
        return (
          <div key={item.kpId} className="space-y-2">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-foreground">KP {item.kpId}</span>
              <span className="text-muted-foreground">
                {item.correct}/{item.total} · {accuracy}%
              </span>
            </div>
            <Progress value={accuracy} variant="exam" />
          </div>
        );
      })}
    </div>
  );
}

function AttemptHistory({ attempts }: { attempts: UserAttemptHistoryItem[] }) {
  if (attempts.length === 0) {
    return (
      <div className="rounded-[--radius-lg] border border-dashed border-border bg-subtle/10 p-8 text-center">
        <BookOpenText className="mx-auto h-8 w-8 text-muted-foreground" />
        <div className="mt-3 text-sm text-muted-foreground">还没有答题历史。</div>
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
    <div className="divide-y divide-border overflow-hidden rounded-[--radius-lg] border border-border">
      {attempts.slice(0, 8).map((attempt) => (
        <Link
          key={attempt.id}
          to={`/exams/${attempt.paperId}/result`}
          className="grid gap-3 bg-card p-4 transition-colors hover:bg-subtle/20 sm:grid-cols-[1fr_auto]"
        >
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{attempt.examType}</Badge>
              <Badge variant="outline">{formatDifficultyLabel(attempt.difficulty)}</Badge>
              <Badge variant={attempt.status === "auto_submitted" ? "tle" : "saved"}>
                {statusLabel(attempt.status)}
              </Badge>
            </div>
            <div className="text-sm text-muted-foreground">{formatDate(attempt.submittedAt)}</div>
          </div>
          <div className="flex items-center justify-between gap-4 sm:justify-end">
            <div className="text-2xl font-semibold text-foreground">{formatScore(attempt.score)}</div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </Link>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const historyQuery = useQuery({
    queryKey: ["user-attempt-history", 1, 20],
    queryFn: () => fetchUserAttemptHistory({ page: 1, pageSize: 20 }),
  });
  const statsQuery = useQuery({
    queryKey: ["user-stats"],
    queryFn: fetchUserStats,
  });

  if (historyQuery.isPending || statsQuery.isPending) {
    return <LoadingDashboard />;
  }

  const attempts = historyQuery.data?.items ?? [];
  const stats = statsQuery.data ?? {
    totalAttempts: 0,
    averageScore: 0,
    bestScore: 0,
    latestSubmittedAt: null,
    weakPrimaryKps: [],
  };

  return (
    <div className="h-full overflow-y-auto px-6 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="grid gap-6 lg:grid-cols-[1fr_auto]">
          <div className="space-y-3">
            <Badge variant="outline">Dashboard</Badge>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">我的训练概览</h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              成绩趋势、答题历史、弱项统计和下一步建议会跟随运行时结果同步更新。
            </p>
          </div>
          <div className="grid min-w-72 grid-cols-3 gap-3">
            <Card variant="stat" className="border-border bg-card">
              <CardDescription>次数</CardDescription>
              <CardTitle className="mt-2 text-xl">{stats.totalAttempts}</CardTitle>
            </Card>
            <Card variant="stat" className="border-border bg-card">
              <CardDescription>均分</CardDescription>
              <CardTitle className="mt-2 text-xl">{Math.round(stats.averageScore)}</CardTitle>
            </Card>
            <Card variant="stat" className="border-border bg-card">
              <CardDescription>最佳</CardDescription>
              <CardTitle className="mt-2 text-xl">{stats.bestScore}</CardTitle>
            </Card>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
          <Card variant="flat" className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <ChartNoAxesColumnIncreasing className="h-5 w-5 text-primary" />
                成绩曲线
              </CardTitle>
              <CardDescription>最近 8 次已完成模拟的分数变化。</CardDescription>
            </CardHeader>
            <CardContent>
              <ScoreTrend attempts={attempts} />
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card variant="flat" className="border-border bg-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Target className="h-5 w-5 text-primary" />
                  弱项统计
                </CardTitle>
                <CardDescription>按 primary KP 聚合的低准确率区间。</CardDescription>
              </CardHeader>
              <CardContent>
                <WeaknessList items={stats.weakPrimaryKps} />
              </CardContent>
            </Card>

            <Card variant="flat" className="border-border bg-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Lightbulb className="h-5 w-5 text-primary" />
                  建议
                </CardTitle>
                <CardDescription>当前为规则型静态建议区。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
                <div>先复盘最近一次低分题，再做同一 exam type 的中等难度卷。</div>
                <div>弱项 KP 正确率低于 50% 时，优先回看错题解析和对应知识点笔记。</div>
                <div>连续两次超过 85 分后，再切到更高难度或限时训练。</div>
              </CardContent>
            </Card>
          </div>
        </div>

        <Card variant="flat" className="border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <ListChecks className="h-5 w-5 text-primary" />
              答题历史
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
      </div>
    </div>
  );
}
