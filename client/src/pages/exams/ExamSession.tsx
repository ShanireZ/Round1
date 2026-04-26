import { startTransition, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowRight,
  BookOpenText,
  Clock3,
  LoaderCircle,
  Printer,
  Save,
  SendHorizontal,
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ExamRuntimeClientError,
  autosaveExamAttempt,
  fetchExamSession,
  getCachedCsrfToken,
  sendKeepaliveAutosave,
  startExamAttempt,
  submitExamAttempt,
  type ExamSessionPayload,
  type RuntimeAttempt,
  type AutosaveAnswerPatch,
} from "@/lib/exam-runtime";
import {
  buildRenderableQuestion,
  formatQuestionTypeLabel,
  getSessionCountdownState,
  getDraftAnswerValue,
  normalizeDraftAnswers,
  shouldBlockBeforeUnload,
  upsertDraftAnswer,
  type AutosavePhase,
  type DraftAnswers,
} from "@/lib/exam-session";
import { formatDifficultyLabel } from "@/lib/exam-results";
import type { ExamResultNavigationState } from "@/lib/exam-results";

const AUTOSAVE_DEBOUNCE_MS = 30_000;

function LoadingState() {
  return (
    <div className="grid h-full place-items-center px-6 py-10">
      <div className="w-full max-w-5xl space-y-6">
        <Skeleton className="h-48 w-full rounded-[--radius-xl]" />
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Skeleton className="h-[680px] w-full" />
          <Skeleton className="h-[460px] w-full" />
        </div>
      </div>
    </div>
  );
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "尚未保存";
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
    second: "2-digit",
  });
}

function getAutosaveBadge(phase: "idle" | "dirty" | "saving" | "saved" | "error") {
  if (phase === "saved") {
    return { variant: "saved" as const, label: "已保存" };
  }

  if (phase === "saving") {
    return { variant: "outline" as const, label: "保存中" };
  }

  if (phase === "dirty") {
    return { variant: "outline" as const, label: "待保存" };
  }

  if (phase === "error") {
    return { variant: "destructive" as const, label: "保存失败" };
  }

  return { variant: "outline" as const, label: "答题中" };
}

function getCountdownBadgeVariant(warningLevel: "normal" | "warning" | "critical" | "expired") {
  if (warningLevel === "warning") {
    return "tle" as const;
  }

  if (warningLevel === "critical" || warningLevel === "expired") {
    return "destructive" as const;
  }

  return "outline" as const;
}

function getLatestSavedAtFromAnswers(answers: DraftAnswers): string | null {
  return Object.values(answers).reduce<string | null>((latest, entry) => {
    if (!entry.updatedAt) {
      return latest;
    }

    if (!latest) {
      return entry.updatedAt;
    }

    return entry.updatedAt > latest ? entry.updatedAt : latest;
  }, null);
}

function AttemptSummary({
  session,
  answeredParts,
  totalParts,
  autosavePhase,
  lastSavedAt,
  countdownLabel,
  countdownWarningLevel,
}: {
  session: ExamSessionPayload;
  answeredParts: number;
  totalParts: number;
  autosavePhase: AutosavePhase;
  lastSavedAt: string | null;
  countdownLabel: string;
  countdownWarningLevel: "normal" | "warning" | "critical" | "expired";
}) {
  const autosaveBadge = getAutosaveBadge(autosavePhase);
  const progressValue = totalParts === 0 ? 0 : Math.round((answeredParts / totalParts) * 100);

  return (
    <Card variant="hero" className="relative overflow-hidden border border-border bg-[radial-gradient(circle_at_top_left,rgba(230,57,70,0.13),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,244,240,0.98))]">
      <CardContent className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="outline">Active Exam Session</Badge>
            <Badge variant={autosaveBadge.variant}>{autosaveBadge.label}</Badge>
            <Badge variant="secondary">{session.paper.examType}</Badge>
            <Badge variant="outline">{formatDifficultyLabel(session.paper.difficulty)}</Badge>
            <Badge variant={getCountdownBadgeVariant(countdownWarningLevel)} data-testid="exam-countdown-badge">
              {countdownLabel}
            </Badge>
          </div>

          <div className="space-y-3">
            <p className="font-mono text-xs uppercase tracking-[0.28em] text-primary/70">Focus Session</p>
            <div className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">题面与答题状态已接通</div>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              当前页直接消费 runtime session 接口，展示题面、读取既有 answersJson，并通过 autosave 接口持续回写答题状态。交卷成功后仍会自动跳转到结果页。
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Card variant="stat" className="border-border bg-white/80">
              <CardDescription>答题进度</CardDescription>
              <CardTitle className="mt-2 text-lg">
                {answeredParts} / {totalParts}
              </CardTitle>
            </Card>
            <Card variant="stat" className="border-border bg-white/80">
              <CardDescription>Attempt ID</CardDescription>
              <CardTitle className="mt-2 text-lg">{session.attempt.id}</CardTitle>
            </Card>
            <Card variant="stat" className="border-border bg-white/80">
              <CardDescription>试卷状态</CardDescription>
              <CardTitle className="mt-2 text-lg">{session.paper.status}</CardTitle>
            </Card>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>已作答题目覆盖率</span>
              <span>{progressValue}%</span>
            </div>
            <Progress value={progressValue} variant="exam" />
          </div>
        </div>

        <div className="space-y-4 rounded-[--radius-xl] border border-border/80 bg-white/75 p-5 backdrop-blur-sm">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Clock3 className="h-4 w-4 text-primary" />
            当前考试会话
          </div>
          <div className="space-y-3 text-sm text-muted-foreground">
            <div className="flex items-center justify-between gap-3">
              <span>GET /exams/:id/session</span>
              <Badge variant="saved">已接通</Badge>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>PATCH /attempts/:id</span>
              <Badge variant="saved">autosave</Badge>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>最后保存时间</span>
              <span>{formatTimestamp(lastSavedAt)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>剩余时间</span>
              <span data-testid="exam-countdown">{countdownLabel}</span>
            </div>
          </div>

          <Separator />

          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Tab Nonce</div>
            <div className="mt-2 rounded-[--radius-md] border border-border bg-subtle/20 px-3 py-2 font-mono text-sm text-foreground">
              {session.attempt.tabNonce}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ConflictState({ paperId }: { paperId: string }) {
  return (
    <Card variant="hero" className="border-warning/30 bg-[linear-gradient(180deg,rgba(245,158,11,0.08),rgba(255,255,255,0.98))]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <Clock3 className="h-5 w-5 text-warning" />
          当前试卷已不在可开始状态
        </CardTitle>
        <CardDescription>
          后端返回冲突，通常意味着这张卷子已经开始或已经提交。直接查看结果页会更合理。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        <Button asChild variant="primary">
          <Link to={`/exams/${paperId}/result`}>
            <ArrowRight />
            查看结果
          </Link>
        </Button>
        <Button asChild variant="secondary">
          <Link to="/exams/new">
            <BookOpenText />
            重新选卷
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function SessionQuestionCard({
  item,
  answers,
  onAnswerChange,
}: {
  item: ExamSessionPayload["items"][number];
  answers: DraftAnswers;
  onAnswerChange: (slotNo: number, subKey: string, value: string) => void;
}) {
  const renderable = buildRenderableQuestion(item.questionType, item.contentJson);
  const answeredParts = renderable.parts.filter(
    (part) => getDraftAnswerValue(answers, item.slotNo, part.key).trim().length > 0,
  ).length;

  return (
    <Card id={`slot-${item.slotNo}`} variant="flat" className="question-card scroll-mt-24 border-border bg-card">
      <CardHeader className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="outline">Q{item.slotNo}</Badge>
          <Badge variant="secondary">{formatQuestionTypeLabel(item.questionType)}</Badge>
          <Badge variant="outline">{item.points} 分</Badge>
          <Badge variant={answeredParts === renderable.parts.length ? "ac" : answeredParts > 0 ? "saved" : "unanswered"}>
            {answeredParts === renderable.parts.length
              ? "已完成"
              : answeredParts > 0
                ? `${answeredParts}/${renderable.parts.length} 已答`
                : "未作答"}
          </Badge>
        </div>

        <div className="space-y-2">
          <CardTitle className="text-xl leading-8">{renderable.prompt}</CardTitle>
          <CardDescription>
            当前题型会按 runtime grader 的 slot/subQuestion key 结构写回 answersJson，不再依赖本地临时 submit payload。
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {renderable.code ? (
          <pre className="overflow-x-auto rounded-[--radius-lg] border border-border/70 bg-[#0b1120] p-4 text-sm leading-6 text-slate-100">
            <code>{renderable.code}</code>
          </pre>
        ) : null}

        {renderable.parts.map((part, index) => {
          const currentValue = getDraftAnswerValue(answers, item.slotNo, part.key);
          return (
            <div key={`${item.slotNo}-${part.key}`} className="space-y-3 rounded-[--radius-lg] border border-border/70 bg-subtle/10 p-4">
              <div className="text-sm font-medium text-foreground">
                {renderable.parts.length > 1 ? `第 ${index + 1} 小题` : "作答区域"}
              </div>
              <div className="text-sm leading-6 text-muted-foreground">{part.prompt}</div>

              {part.inputMode === "choice" ? (
                <RadioGroup
                  value={currentValue}
                  onValueChange={(value) => onAnswerChange(item.slotNo, part.key, value)}
                  className="gap-3"
                >
                  {part.options.map((option) => {
                    const optionId = `slot-${item.slotNo}-${part.key}-${option.value}`;
                    return (
                      <label
                        key={option.value}
                        htmlFor={optionId}
                        data-testid={`answer-option-${item.slotNo}-${part.key}-${option.value}`}
                        data-selected={currentValue === option.value ? "true" : "false"}
                        className="flex cursor-pointer items-start gap-3 rounded-[--radius-md] border border-border/70 bg-white px-4 py-3 text-sm transition-colors hover:border-primary/50"
                      >
                        <RadioGroupItem id={optionId} value={option.value} />
                        <div className="space-y-1">
                          <div className="font-medium text-foreground">{option.value}</div>
                          <div className="leading-6 text-muted-foreground">{option.label}</div>
                        </div>
                      </label>
                    );
                  })}
                </RadioGroup>
              ) : (
                <Input
                  data-testid={`answer-input-${item.slotNo}-${part.key}`}
                  value={currentValue}
                  placeholder="输入你的答案"
                  onChange={(event) => onAnswerChange(item.slotNo, part.key, event.target.value)}
                />
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export default function ExamSessionPage() {
  const navigate = useNavigate();
  const params = useParams();
  const paperId = params.id ?? "";
  const [attempt, setAttempt] = useState<RuntimeAttempt | null>(null);
  const [answers, setAnswers] = useState<DraftAnswers>({});
  const [autosavePhase, setAutosavePhase] = useState<AutosavePhase>("idle");
  const [autosaveError, setAutosaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const hydratedAttemptIdRef = useRef<string | null>(null);
  const lastSavedSnapshotRef = useRef<string>("{}");
  const autoSubmitTriggeredRef = useRef<string | null>(null);
  const pendingPatchesRef = useRef<AutosaveAnswerPatch[]>([]);
  const csrfTokenRef = useRef<string | null>(null);

  function queueAutosavePatch(patch: AutosaveAnswerPatch) {
    pendingPatchesRef.current = [
      ...pendingPatchesRef.current.filter(
        (current) => current.slotNo !== patch.slotNo || current.subKey !== patch.subKey,
      ),
      patch,
    ];
  }

  function takePendingPatches() {
    const patches = pendingPatchesRef.current;
    pendingPatchesRef.current = [];
    return patches;
  }

  function restorePendingPatches(patches: AutosaveAnswerPatch[]) {
    pendingPatchesRef.current = [...patches, ...pendingPatchesRef.current];
  }

  const startAttemptMutation = useMutation({
    mutationFn: () => startExamAttempt(paperId),
    onSuccess: (result) => {
      setAttempt(result);
    },
  });

  const submitAttemptMutation = useMutation({
    mutationFn: async ({
      attemptId,
      tabNonce,
      draftAnswers,
      lastSavedSnapshot,
      currentAutosavePhase,
    }: {
      attemptId: string;
      tabNonce: string;
      draftAnswers: DraftAnswers;
      lastSavedSnapshot: string;
      currentAutosavePhase: AutosavePhase;
    }) => {
      const hasPendingDraft = shouldBlockBeforeUnload({
        autosavePhase: currentAutosavePhase,
        answers: draftAnswers,
        lastSavedSnapshot,
      });

      if (hasPendingDraft) {
        const patches = takePendingPatches();
        if (patches.length > 0) {
          try {
            return await submitExamAttempt(attemptId, { tabNonce, patches });
          } catch (error) {
            restorePendingPatches(patches);
            throw error;
          }
        }
      }

      return submitExamAttempt(attemptId);
    },
    onSuccess: (result) => {
      const navigationState: ExamResultNavigationState = {
        fromSubmit: true,
        attemptId: result.id,
      };

      startTransition(() => {
        navigate(`/exams/${result.paperId}/result`, {
          state: navigationState,
        });
      });
    },
  });

  const sessionQuery = useQuery({
    queryKey: ["exam-session", paperId, attempt?.id],
    queryFn: () => fetchExamSession(paperId),
    enabled: Boolean(paperId && attempt?.id),
    retry: false,
  });

  useEffect(() => {
    let isMounted = true;

    void getCachedCsrfToken()
      .then((token) => {
        if (isMounted) {
          csrfTokenRef.current = token;
        }
      })
      .catch(() => {
        if (isMounted) {
          csrfTokenRef.current = null;
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const autosaveMutation = useMutation({
    mutationFn: autosaveExamAttempt,
    onSuccess: (result) => {
      const normalized = normalizeDraftAnswers(result.answersJson);
      lastSavedSnapshotRef.current = JSON.stringify(normalized);
      setAnswers(normalized);
      setAutosavePhase("saved");
      setAutosaveError(null);
      setLastSavedAt(new Date().toISOString());
    },
    onError: (error, variables) => {
      restorePendingPatches(variables.patches);
      setAutosavePhase("error");
      setAutosaveError(error instanceof Error ? error.message : "自动保存失败，请稍后重试。");
    },
  });

  useEffect(() => {
    if (!paperId || startAttemptMutation.status !== "idle") {
      return;
    }

    startAttemptMutation.mutate();
  }, [paperId, startAttemptMutation]);

  useEffect(() => {
    const sessionAttempt = sessionQuery.data?.attempt;
    if (!sessionAttempt || hydratedAttemptIdRef.current === sessionAttempt.id) {
      return;
    }

    const normalized = normalizeDraftAnswers(sessionAttempt.answersJson);
    hydratedAttemptIdRef.current = sessionAttempt.id;
    lastSavedSnapshotRef.current = JSON.stringify(normalized);
    pendingPatchesRef.current = [];
    setAttempt(sessionAttempt);
    setAnswers(normalized);
    setAutosavePhase("idle");
    setAutosaveError(null);
    setLastSavedAt(getLatestSavedAtFromAnswers(normalized));
  }, [sessionQuery.data?.attempt]);

  useEffect(() => {
    const submitAt = sessionQuery.data?.attempt.submitAt;
    if (!submitAt) {
      return;
    }

    setNowMs(Date.now());
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [sessionQuery.data?.attempt.submitAt]);

  useEffect(() => {
    const sessionAttempt = sessionQuery.data?.attempt;
    if (!sessionAttempt || autosaveMutation.isPending || submitAttemptMutation.isPending) {
      return;
    }

    const snapshot = JSON.stringify(answers);
    if (snapshot === lastSavedSnapshotRef.current && pendingPatchesRef.current.length === 0) {
      return;
    }

    setAutosavePhase("dirty");
    const timer = window.setTimeout(() => {
      const patches = takePendingPatches();
      if (patches.length === 0) {
        return;
      }

      setAutosavePhase("saving");
      autosaveMutation.mutate({
        attemptId: sessionAttempt.id,
        tabNonce: sessionAttempt.tabNonce,
        patches,
      });
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [answers, autosaveMutation, sessionQuery.data?.attempt, submitAttemptMutation.isPending]);

  const hasPendingBeforeUnloadGuard = shouldBlockBeforeUnload({
    autosavePhase,
    answers,
    lastSavedSnapshot: lastSavedSnapshotRef.current,
  });

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasPendingBeforeUnloadGuard) {
        return;
      }

      const sessionAttempt = sessionQuery.data?.attempt;
      if (sessionAttempt && pendingPatchesRef.current.length > 0) {
        sendKeepaliveAutosave({
          attemptId: sessionAttempt.id,
          tabNonce: sessionAttempt.tabNonce,
          patches: pendingPatchesRef.current,
          csrfToken: csrfTokenRef.current,
        });
      }

      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [hasPendingBeforeUnloadGuard, sessionQuery.data?.attempt]);

  const session = sessionQuery.data ?? null;
  const countdownState = getSessionCountdownState({
    submitAt: session?.attempt.submitAt ?? null,
    now: nowMs,
  });

  useEffect(() => {
    if (!session?.attempt || !countdownState.isExpired || submitAttemptMutation.isPending) {
      return;
    }

    if (autoSubmitTriggeredRef.current === session.attempt.id) {
      return;
    }

    autoSubmitTriggeredRef.current = session.attempt.id;
    submitAttemptMutation.mutate({
      attemptId: session.attempt.id,
      tabNonce: session.attempt.tabNonce,
      draftAnswers: answers,
      lastSavedSnapshot: lastSavedSnapshotRef.current,
      currentAutosavePhase: autosavePhase,
    });
  }, [answers, autosavePhase, countdownState.isExpired, session, submitAttemptMutation]);

  function handleAnswerChange(slotNo: number, subKey: string, value: string) {
    const updatedAt = new Date().toISOString();
    queueAutosavePatch({
      slotNo,
      subKey,
      value,
      updatedAt,
    });
    setAutosaveError(null);
    setAutosavePhase("dirty");
    setAnswers((current) =>
      upsertDraftAnswer(current, {
        slotNo,
        subKey,
        value,
        updatedAt,
      }),
    );
  }

  if (!paperId) {
    return (
      <div className="grid h-full place-items-center px-6 py-10">
        <Card variant="flat" className="w-full max-w-2xl border-destructive/30 bg-destructive/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              缺少试卷 ID
            </CardTitle>
            <CardDescription>当前路由没有提供 paper id，无法启动答题流程。</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (startAttemptMutation.isPending || (attempt && sessionQuery.isPending && !sessionQuery.data)) {
    return <LoadingState />;
  }

  const startError = startAttemptMutation.error;
  if (startError instanceof ExamRuntimeClientError && startError.code === "ROUND1_CONFLICT") {
    return (
      <div className="grid h-full place-items-center px-6 py-10">
        <div className="w-full max-w-4xl">
          <ConflictState paperId={paperId} />
        </div>
      </div>
    );
  }

  if (startAttemptMutation.isError || !attempt) {
    return (
      <div className="grid h-full place-items-center px-6 py-10">
        <Card variant="hero" className="w-full max-w-3xl border-destructive/20 bg-[linear-gradient(180deg,rgba(200,16,46,0.08),rgba(255,255,255,0.98))]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              无法启动答题流程
            </CardTitle>
            <CardDescription>
              {startError instanceof Error ? startError.message : "启动 attempt 时发生未知错误。"}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button type="button" variant="primary" onClick={() => startAttemptMutation.reset()}>
              <LoaderCircle className="h-4 w-4" />
              重置状态
            </Button>
            <Button type="button" variant="secondary" onClick={() => startAttemptMutation.mutate()}>
              <ArrowRight />
              重试启动
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (sessionQuery.isError) {
    return (
      <div className="grid h-full place-items-center px-6 py-10">
        <Card variant="hero" className="w-full max-w-3xl border-destructive/20 bg-[linear-gradient(180deg,rgba(200,16,46,0.08),rgba(255,255,255,0.98))]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              无法读取考试题面
            </CardTitle>
            <CardDescription>
              {sessionQuery.error instanceof Error ? sessionQuery.error.message : "读取 exam session 时发生未知错误。"}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button type="button" variant="secondary" onClick={() => sessionQuery.refetch()}>
              <ArrowRight />
              重试读取题面
            </Button>
            <Button asChild variant="secondary">
              <Link to="/exams/new">
                <BookOpenText />
                返回选卷
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!session) {
    return <LoadingState />;
  }

  const questionViews = session.items.map((item) => ({
    item,
    renderable: buildRenderableQuestion(item.questionType, item.contentJson),
  }));
  const totalParts = questionViews.reduce((sum, entry) => sum + entry.renderable.parts.length, 0);
  const answeredParts = questionViews.reduce(
    (sum, entry) =>
      sum +
      entry.renderable.parts.filter(
        (part) => getDraftAnswerValue(answers, entry.item.slotNo, part.key).trim().length > 0,
      ).length,
    0,
  );

  return (
    <div className="h-full overflow-y-auto px-6 py-8" data-testid="exam-session-page">
      <div className="mx-auto max-w-6xl space-y-6">
        {countdownState.warningLevel !== "normal" ? (
          <div
            data-testid="exam-timer-warning"
            className={`rounded-[--radius-xl] border px-5 py-4 text-sm ${
              countdownState.warningLevel === "warning"
                ? "border-warning/40 bg-warning/10 text-warning"
                : "border-destructive/40 bg-destructive/10 text-destructive"
            }`}
          >
            {countdownState.warningLevel === "warning"
              ? `剩余时间不足 10 分钟，当前倒计时 ${countdownState.label}。请优先完成未答题目。`
              : countdownState.warningLevel === "critical"
                ? `剩余时间不足 1 分钟，当前倒计时 ${countdownState.label}。系统即将自动交卷。`
                : "考试时间已到，正在自动交卷并跳转结果页。"}
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-4">
          <div className="rounded-full border border-border/80 bg-card/80 px-4 py-2 text-xs tracking-[0.24em] text-muted-foreground uppercase">
            Exam Runtime
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-3">
              <Save className="h-4 w-4" />
              当前页已切到真实题面读取与 autosave 提交流
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={() => window.print()}>
              <Printer />
              打印试卷
            </Button>
          </div>
        </div>

        <AttemptSummary
          session={session}
          answeredParts={answeredParts}
          totalParts={totalParts}
          autosavePhase={autosavePhase}
          lastSavedAt={lastSavedAt}
          countdownLabel={countdownState.label}
          countdownWarningLevel={countdownState.warningLevel}
        />

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            {autosaveError ? (
              <div className="rounded-[--radius-lg] border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                {autosaveError}
              </div>
            ) : null}

            {questionViews.map((entry) => (
              <SessionQuestionCard
                key={entry.item.slotNo}
                item={entry.item}
                answers={answers}
                onAnswerChange={handleAnswerChange}
              />
            ))}
          </div>

          <div className="space-y-6">
            <Card variant="flat" className="border-border bg-card lg:sticky lg:top-8">
              <CardHeader>
                <CardTitle className="text-xl">答题卡</CardTitle>
                <CardDescription>
                  当前按 grader 的 slotNo / subQuestion key 统计。点击题号可快速滚动到对应题面。
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-4 gap-3 sm:grid-cols-5">
                  {questionViews.map((entry) => {
                    const answeredCount = entry.renderable.parts.filter(
                      (part) => getDraftAnswerValue(answers, entry.item.slotNo, part.key).trim().length > 0,
                    ).length;
                    const isCompleted = answeredCount === entry.renderable.parts.length;
                    return (
                      <Button
                        key={entry.item.slotNo}
                        type="button"
                        variant={isCompleted ? "primary" : answeredCount > 0 ? "secondary" : "ghost"}
                        className="h-11"
                        onClick={() => {
                          document.getElementById(`slot-${entry.item.slotNo}`)?.scrollIntoView({
                            behavior: "smooth",
                            block: "start",
                          });
                        }}
                      >
                        {entry.item.slotNo}
                      </Button>
                    );
                  })}
                </div>

                <Separator />

                <div className="space-y-3 text-sm text-muted-foreground">
                  <div className="flex items-center justify-between gap-3">
                    <span>题目数</span>
                    <span>{session.items.length}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>已答小题</span>
                    <span>
                      {answeredParts} / {totalParts}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>自动保存状态</span>
                    <Badge variant={getAutosaveBadge(autosavePhase).variant} data-testid="autosave-status">
                      {getAutosaveBadge(autosavePhase).label}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>考试倒计时</span>
                    <Badge variant={getCountdownBadgeVariant(countdownState.warningLevel)}>
                      {countdownState.label}
                    </Badge>
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <Button
                    type="button"
                    variant="primary"
                    size="lg"
                    data-testid="exam-submit-button"
                    className="w-full"
                    loading={submitAttemptMutation.isPending}
                    onClick={() =>
                      submitAttemptMutation.mutate({
                        attemptId: session.attempt.id,
                        tabNonce: session.attempt.tabNonce,
                        draftAnswers: answers,
                        lastSavedSnapshot: lastSavedSnapshotRef.current,
                        currentAutosavePhase: autosavePhase,
                      })
                    }
                  >
                    <SendHorizontal />
                    交卷并查看结果
                  </Button>

                  {submitAttemptMutation.isError ? (
                    <div className="rounded-[--radius-lg] border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                      {submitAttemptMutation.error instanceof Error
                        ? submitAttemptMutation.error.message
                        : "交卷失败，请稍后重试。"}
                    </div>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
