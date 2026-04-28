import { startTransition, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  ChevronDown,
  CircleCheckBig,
  Printer,
  Radar,
  RefreshCcw,
  Target,
  Trophy,
} from "lucide-react";
import { Link, useLocation, useNavigate, useParams } from "react-router";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchExamResult,
  formatDifficultyLabel,
  formatExamTypeBadgeVariant,
  getCeremonyStorageKey,
  shouldShowCeremonyOnEntry,
  type ExamResultNavigationState,
  type ExamResultItem,
  type ExamResultPayload,
  type ExamResultSectionSummary,
} from "@/lib/exam-results";

const QUERY_KEY = ["exam-result"] as const;

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "未提交";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("zh-CN", {
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatQuestionTypeLabel(questionType: string): string {
  if (questionType === "single_choice") {
    return "单选题";
  }

  if (questionType === "reading_program") {
    return "阅读程序";
  }

  if (questionType === "completion_program") {
    return "完善程序";
  }

  return questionType;
}

function extractPrompt(contentJson: unknown): string {
  if (!contentJson || typeof contentJson !== "object" || Array.isArray(contentJson)) {
    return "题面待补充";
  }

  const record = contentJson as Record<string, unknown>;
  const preferredKeys = ["title", "stem", "prompt", "description", "question", "text"];
  for (const key of preferredKeys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  if (Array.isArray(record.passages)) {
    const firstString = record.passages.find((value) => typeof value === "string");
    if (typeof firstString === "string" && firstString.trim().length > 0) {
      return firstString.trim();
    }
  }

  return JSON.stringify(contentJson).slice(0, 160);
}

function summarizeSections(
  sections: Record<string, ExamResultSectionSummary> | null,
): Array<{ key: string; label: string; summary: ExamResultSectionSummary }> {
  if (!sections) {
    return [];
  }

  return Object.entries(sections).map(([key, summary]) => ({
    key,
    label: formatQuestionTypeLabel(key),
    summary,
  }));
}

function ResultHero({ data }: { data: ExamResultPayload }) {
  const sectionEntries = summarizeSections(data.attempt.perSectionJson);
  const totalQuestions = data.items.reduce((sum, item) => sum + item.result.totalCount, 0);
  const correctAnswers = data.items.reduce((sum, item) => sum + item.result.correctCount, 0);
  const wrongCount = data.attempt.report?.wrongs.length ?? Math.max(totalQuestions - correctAnswers, 0);
  const accuracy = totalQuestions === 0 ? 0 : Math.round((correctAnswers / totalQuestions) * 100);

  return (
    <Card
      variant="hero"
      className="exam-result-hero-surface relative overflow-hidden border border-border"
    >
      <div className="exam-result-hero-sheen pointer-events-none absolute inset-0" />
      <CardContent className="relative grid gap-8 lg:grid-cols-[1.4fr_0.9fr]">
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant={formatExamTypeBadgeVariant(data.paper.examType)}>{data.paper.examType}</Badge>
            <Badge variant="outline">{formatDifficultyLabel(data.paper.difficulty)}</Badge>
            <Badge variant={wrongCount === 0 ? "ac" : "wa"}>
              {wrongCount === 0 ? "全对完成" : `${wrongCount} 处待回看`}
            </Badge>
          </div>

          <div className="space-y-3">
            <p className="font-mono text-xs uppercase tracking-[0.28em] text-primary/70">Round1 Result Protocol</p>
            <div className="flex flex-wrap items-end gap-4">
              <div className="text-6xl font-semibold tracking-tight text-foreground sm:text-7xl">
                {data.attempt.score ?? 0}
              </div>
              <div className="pb-2 text-lg text-muted-foreground">/ 100</div>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              已提交于 {formatTimestamp(data.attempt.submittedAt)}。当前结果页直接消费 runtime 的
              grouped grader 聚合、wrongs 报告和题面解析契约，不再依赖 submit 响应临时态。
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="primary" onClick={() => window.print()}>
              <Printer />
              打印结果
            </Button>
            <Button asChild variant="secondary">
              <Link to="/exams/new">
                <RefreshCcw />
                再来一次
              </Link>
            </Button>
            <Button asChild variant="ghost">
              <Link to="/dashboard">
                <ArrowLeft />
                返回首页
              </Link>
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Card variant="stat" className="border-primary/15 bg-card/75">
              <CardDescription>正确率</CardDescription>
              <CardTitle className="mt-2 text-3xl">{accuracy}%</CardTitle>
              <p className="mt-2 text-xs text-muted-foreground">
                {correctAnswers} / {totalQuestions} 小题命中
              </p>
            </Card>
            <Card variant="stat" className="border-border bg-card/75">
              <CardDescription>错题数</CardDescription>
              <CardTitle className="mt-2 text-3xl">{wrongCount}</CardTitle>
              <p className="mt-2 text-xs text-muted-foreground">可直接跳到下方题卡展开复盘</p>
            </Card>
            <Card variant="stat" className="border-border bg-card/75">
              <CardDescription>Section 数</CardDescription>
              <CardTitle className="mt-2 text-3xl">{sectionEntries.length}</CardTitle>
              <p className="mt-2 text-xs text-muted-foreground">题型聚合已和 runtime grader 对齐</p>
            </Card>
          </div>
        </div>

        <div className="grid gap-3 self-start">
          {sectionEntries.map(({ key, label, summary }) => {
            const value = summary.maxScore === 0 ? 0 : (summary.score / summary.maxScore) * 100;
            return (
              <Card key={key} variant="flat" className="border-border/80 bg-card/80 backdrop-blur-sm">
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-medium text-foreground">{label}</div>
                      <div className="text-xs text-muted-foreground">
                        {summary.correct} / {summary.total} 小题正确
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-semibold text-foreground">{summary.score}</div>
                      <div className="text-xs text-muted-foreground">/ {summary.maxScore}</div>
                    </div>
                  </div>
                  <Progress value={value} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function ResultOverview({ data }: { data: ExamResultPayload }) {
  const weakKps = Object.entries(data.attempt.perPrimaryKpJson ?? {})
    .map(([kpId, summary]) => ({ kpId, ...summary }))
    .sort((left, right) => left.accuracy - right.accuracy || right.total - left.total)
    .slice(0, 4);

  const wrongs = data.attempt.report?.wrongs ?? [];

  return (
    <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      <Card variant="flat" className="border-border bg-card" data-print-surface>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Radar className="h-5 w-5 text-primary" />
            错题分布与知识点信号
          </CardTitle>
          <CardDescription>先看运行时已经算好的 wrongs 与 primary KP 聚合，再决定哪里需要重练。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {wrongs.length === 0 ? (
            <div className="rounded-[--radius-lg] border border-success/30 bg-success/5 p-4 text-sm text-success">
              本次没有 wrongs 记录，当前规则型 grader 判定全部命中。
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {wrongs.map((wrong) => (
                <div
                  key={`${wrong.slotNo}-${wrong.subQuestionKey}`}
                  className="rounded-[--radius-lg] border border-destructive/15 bg-destructive/[0.03] p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-foreground">
                      第 {wrong.slotNo} 题 · 子题 {wrong.subQuestionKey}
                    </div>
                    <Badge variant="wa">-{wrong.points}</Badge>
                  </div>
                  <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                    <p>你的答案：{wrong.submittedAnswer ?? "未作答"}</p>
                    <p>正确答案：{wrong.correctAnswer}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <Separator />

          <div className="space-y-3">
            <div className="text-sm font-medium text-foreground">薄弱 primary KP</div>
            {weakKps.length === 0 ? (
              <p className="text-sm text-muted-foreground">当前 attempt 没有 primary KP 聚合可展示。</p>
            ) : (
              <div className="space-y-3">
                {weakKps.map((kp) => (
                  <div key={kp.kpId} className="space-y-2">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium text-foreground">KP {kp.kpId}</span>
                      <span className="text-muted-foreground">
                        {kp.correct} / {kp.total} · {Math.round(kp.accuracy * 100)}%
                      </span>
                    </div>
                    <Progress value={kp.accuracy * 100} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card variant="flat" className="border-border bg-card" data-print-surface>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Target className="h-5 w-5 text-primary" />
            本次构成
          </CardTitle>
          <CardDescription>按 runtime result payload 直接展示当前这份卷子的结构和状态。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="flex items-center justify-between gap-4 rounded-[--radius-lg] border border-border bg-subtle/20 p-4">
            <span className="text-muted-foreground">试卷状态</span>
            <Badge variant="outline">{data.paper.status}</Badge>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-[--radius-lg] border border-border bg-subtle/20 p-4">
            <span className="text-muted-foreground">提交状态</span>
            <Badge variant={data.attempt.status === "submitted" ? "ac" : "secondary"}>
              {data.attempt.status}
            </Badge>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-[--radius-lg] border border-border bg-subtle/20 p-4">
            <span className="text-muted-foreground">Report 状态</span>
            <Badge variant={data.attempt.reportStatus === "completed" ? "ac" : "outline"}>
              {data.attempt.reportStatus ?? "pending"}
            </Badge>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-[--radius-lg] border border-border bg-subtle/20 p-4">
            <span className="text-muted-foreground">来源</span>
            <span className="font-medium text-foreground">
              {data.paper.assignmentId ? "班级任务" : "自练卷"}
            </span>
          </div>
          <div className="rounded-[--radius-lg] border border-border bg-subtle/15 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Trophy className="h-4 w-4 text-primary" />
              结果页接口说明
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              当前页面消费的是 GET /api/v1/exams/:id/result。它已经把 attempts 聚合、ai_report_json
              和题面解析统一成稳定读模型，后续结果页扩展只需要在这个契约上增量前进。
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ResultItemCard({ item, defaultOpen = false }: { item: ExamResultItem; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const accuracy = item.result.totalCount === 0 ? 0 : (item.result.correctCount / item.result.totalCount) * 100;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card variant="flat" className="question-card border-border bg-card" data-print-surface>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">第 {item.slotNo} 题</Badge>
                <Badge variant="secondary">{formatQuestionTypeLabel(item.questionType)}</Badge>
                <Badge variant={item.result.earnedScore === item.result.maxScore ? "ac" : "wa"}>
                  {item.result.earnedScore} / {item.result.maxScore}
                </Badge>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">{extractPrompt(item.contentJson)}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  已命中 {item.result.correctCount} / {item.result.totalCount} 小题，知识点 KP {item.primaryKpId}。
                </p>
              </div>
            </div>

            <div className="flex w-full flex-col gap-3 lg:max-w-xs">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">本题准确率</span>
                <span className="font-medium text-foreground">{Math.round(accuracy)}%</span>
              </div>
              <Progress value={accuracy} />
              <CollapsibleTrigger asChild>
                <Button type="button" variant="secondary" className="justify-between">
                  {open ? "收起解析" : "展开解析"}
                  <ChevronDown className={`transition-transform ${open ? "rotate-180" : ""}`} />
                </Button>
              </CollapsibleTrigger>
            </div>
          </div>

          <CollapsibleContent className="space-y-4">
            <Separator />
            <div className="grid gap-3">
              {item.result.subQuestions.map((subQuestion) => (
                <div
                  key={subQuestion.key}
                  className={`rounded-[--radius-lg] border p-4 ${
                    subQuestion.isCorrect
                      ? "border-success/25 bg-success/5"
                      : "border-destructive/15 bg-destructive/[0.03]"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-medium text-foreground">子题 {subQuestion.key}</div>
                    <Badge variant={subQuestion.isCorrect ? "ac" : "wa"}>
                      {subQuestion.isCorrect ? "命中" : "待修正"}
                    </Badge>
                    <Badge variant="outline">{subQuestion.points} 分</Badge>
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div className="rounded-[--radius-md] border border-border/70 bg-card/70 p-3">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">你的答案</div>
                      <div className="mt-2 font-mono text-sm text-foreground">
                        {subQuestion.submittedAnswer ?? "未作答"}
                      </div>
                    </div>
                    <div className="rounded-[--radius-md] border border-border/70 bg-card/70 p-3">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">正确答案</div>
                      <div className="mt-2 font-mono text-sm text-foreground">{subQuestion.correctAnswer}</div>
                    </div>
                  </div>

                  <div className="mt-3 rounded-[--radius-md] border border-border/70 bg-card/70 p-3 text-sm leading-6 text-muted-foreground">
                    {subQuestion.explanation ?? "当前没有解释文本。"}
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </CardContent>
      </Card>
    </Collapsible>
  );
}

function LoadingState() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-72 w-full rounded-[--radius-xl]" />
      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Skeleton className="h-80 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
      <Skeleton className="h-44 w-full" />
      <Skeleton className="h-44 w-full" />
    </div>
  );
}

function CeremonyReveal({
  data,
  scoreVisible,
  ctaVisible,
  onClose,
}: {
  data: ExamResultPayload;
  scoreVisible: boolean;
  ctaVisible: boolean;
  onClose: () => void;
}) {
  const totalQuestions = data.items.reduce((sum, item) => sum + item.result.totalCount, 0);
  const correctAnswers = data.items.reduce((sum, item) => sum + item.result.correctCount, 0);
  const wrongCount = data.attempt.report?.wrongs.length ?? Math.max(totalQuestions - correctAnswers, 0);

  return (
    <div className="exam-result-ceremony-surface fixed inset-0 z-[--z-ceremony] px-6 py-8 text-white" data-testid="exam-result-ceremony">
      <div className="exam-result-ceremony-aura absolute inset-0" />
      <div className="relative flex h-full items-center justify-center">
        <div className="w-full max-w-4xl text-center">
          <div className="mx-auto inline-flex items-center gap-3 rounded-full border border-white/15 bg-white/5 px-5 py-2 text-xs uppercase tracking-[0.32em] text-white/70">
            <span className="font-semibold">R1</span>
            <span>Result Reveal</span>
          </div>

          <div
            className={`mt-8 transition-all duration-700 ${
              scoreVisible ? "translate-y-0 scale-100 opacity-100" : "translate-y-6 scale-95 opacity-0"
            }`}
          >
            <div className="text-sm uppercase tracking-[0.4em] text-white/50">Final Score</div>
            <div className="mt-4 text-7xl font-semibold tracking-tight sm:text-8xl">
              {data.attempt.score ?? 0}
            </div>
            <div className="mt-3 text-lg text-white/60">/ 100</div>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Badge variant={wrongCount === 0 ? "ac" : "wa"}>
                {wrongCount === 0 ? "AC · 全对完成" : `WA · ${wrongCount} 处待回看`}
              </Badge>
              <Badge variant="outline" className="border-white/20 text-white/80">
                命中 {correctAnswers} / {totalQuestions} 小题
              </Badge>
              <Badge variant="outline" className="border-white/20 text-white/80">
                {formatDifficultyLabel(data.paper.difficulty)}
              </Badge>
            </div>

            <p className="mx-auto mt-6 max-w-2xl text-sm leading-7 text-white/65">
              这一步只在 submit 成功后的首次进入触发。ESC 可跳过，或点击下方按钮直接进入完整结果页详情。
            </p>
          </div>

          <div
            className={`mt-12 transition-all duration-700 ${
              ctaVisible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
            }`}
          >
            <Button
              type="button"
              variant="primary"
              size="lg"
              data-testid="exam-result-ceremony-cta"
              onClick={onClose}
            >
              查看详情
            </Button>
            <div className="mt-4 text-xs uppercase tracking-[0.24em] text-white/40">Press ESC To Skip</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ExamResultPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams();
  const paperId = params.id ?? "";
  const [showCeremony, setShowCeremony] = useState(false);
  const [scoreVisible, setScoreVisible] = useState(false);
  const [ctaVisible, setCtaVisible] = useState(false);

  const resultQuery = useQuery({
    queryKey: [...QUERY_KEY, paperId] as const,
    queryFn: () => fetchExamResult(paperId),
    enabled: paperId.length > 0,
  });

  const resultData = resultQuery.data ?? null;

  useEffect(() => {
    if (!paperId || !resultData) {
      return;
    }

    const storageKey = getCeremonyStorageKey(paperId);
    const hasSeenCeremony = window.sessionStorage.getItem(storageKey) === "1";
    const shouldShow = shouldShowCeremonyOnEntry({
      navigationState: location.state as ExamResultNavigationState | null,
      hasSeenCeremony,
    });

    if (!shouldShow) {
      return;
    }

    setShowCeremony(true);
    setScoreVisible(false);
    setCtaVisible(false);

    const closeCeremony = () => {
      window.sessionStorage.setItem(storageKey, "1");
      setShowCeremony(false);
      setScoreVisible(false);
      setCtaVisible(false);
    };

    const scoreTimer = window.setTimeout(() => {
      setScoreVisible(true);
    }, 120);
    const ctaTimer = window.setTimeout(() => {
      setCtaVisible(true);
    }, 1200);
    const autoCloseTimer = window.setTimeout(() => {
      closeCeremony();
    }, 2800);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeCeremony();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.clearTimeout(scoreTimer);
      window.clearTimeout(ctaTimer);
      window.clearTimeout(autoCloseTimer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [resultData, location.state, paperId]);

  if (!paperId) {
    return (
      <Card variant="flat" className="border-destructive/30 bg-destructive/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            缺少结果页 ID
          </CardTitle>
          <CardDescription>当前路由没有提供 paper id，无法读取考试结果。</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (resultQuery.isLoading) {
    return <LoadingState />;
  }

  if (resultQuery.isError || !resultData) {
    return (
      <Card variant="hero" className="exam-session-error-surface border-destructive/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            结果页加载失败
          </CardTitle>
          <CardDescription>
            {resultQuery.error instanceof Error ? resultQuery.error.message : "读取考试结果时发生未知错误。"}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button type="button" variant="primary" onClick={() => void resultQuery.refetch()}>
            <RefreshCcw />
            重新读取
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              startTransition(() => navigate("/dashboard"));
            }}
          >
            <ArrowLeft />
            返回首页
          </Button>
        </CardContent>
      </Card>
    );
  }

  const data = resultData;
  const wrongKeys = new Set((data.attempt.report?.wrongs ?? []).map((wrong) => wrong.slotNo));

  return (
    <div className="space-y-6 pb-12" data-testid="exam-result-page">
      {showCeremony ? (
        <CeremonyReveal
          data={data}
          scoreVisible={scoreVisible}
          ctaVisible={ctaVisible}
          onClose={() => {
            window.sessionStorage.setItem(getCeremonyStorageKey(paperId), "1");
            setShowCeremony(false);
            setScoreVisible(false);
            setCtaVisible(false);
          }}
        />
      ) : null}

      <div className="rounded-full border border-border/80 bg-card/80 px-4 py-2 text-xs tracking-[0.24em] text-muted-foreground uppercase">
        Exam Result
      </div>

      <ResultHero data={data} />
      <ResultOverview data={data} />

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
              <CircleCheckBig className="h-6 w-6 text-primary" />
              逐题讲解
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">卡片内嵌展开，不跳页、不抽屉，直接复盘每个子题的命中情况。</p>
          </div>
          <Badge variant="outline">{data.items.length} 题</Badge>
        </div>

        <div className="space-y-4">
          {data.items.map((item) => (
            <ResultItemCard key={item.slotNo} item={item} defaultOpen={wrongKeys.has(item.slotNo)} />
          ))}
        </div>
      </section>
    </div>
  );
}
