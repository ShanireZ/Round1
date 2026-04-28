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

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchUserAttemptHistory,
  fetchUserStats,
  type UserAttemptHistoryItem,
  type UserWeakPrimaryKp,
} from "@/lib/exam-runtime";
import { fetchAuthSession } from "@/lib/auth";
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

function LoginRequiredDashboard() {
  return (
    <div className="h-full overflow-y-auto px-6 py-8">
      <div className="mx-auto grid min-h-[60vh] max-w-3xl place-items-center">
        <div className="border-border bg-card w-full rounded-[--radius-lg] border p-8 text-center shadow-sm">
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
      <div className="border-border bg-subtle/10 grid min-h-64 place-items-center rounded-[--radius-lg] border border-dashed p-8 text-center">
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
                  className="bg-primary/85 w-full rounded-t-[--radius-sm] transition-all"
                  style={{ height: `${Math.max(score, 4)}%` }}
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
            className="border-border rounded-[--radius-md] border bg-white/70 p-3"
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

function WeaknessList({ items }: { items: UserWeakPrimaryKp[] }) {
  if (items.length === 0) {
    return (
      <div className="border-border bg-subtle/10 text-muted-foreground rounded-[--radius-lg] border border-dashed p-6 text-sm">
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
              <span className="text-foreground font-medium">KP {item.kpId}</span>
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
      <div className="border-border bg-subtle/10 rounded-[--radius-lg] border border-dashed p-8 text-center">
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
    <div className="divide-border border-border divide-y overflow-hidden rounded-[--radius-lg] border">
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
            <h1 className="text-foreground text-3xl font-semibold tracking-tight">我的训练概览</h1>
            <p className="text-muted-foreground max-w-2xl text-sm leading-6">
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
                <ChartNoAxesColumnIncreasing className="text-primary h-5 w-5" />
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
                  <Target className="text-primary h-5 w-5" />
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
                  <Lightbulb className="text-primary h-5 w-5" />
                  建议
                </CardTitle>
                <CardDescription>当前为规则型静态建议区。</CardDescription>
              </CardHeader>
              <CardContent className="text-muted-foreground space-y-3 text-sm leading-6">
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
              <ListChecks className="text-primary h-5 w-5" />
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
