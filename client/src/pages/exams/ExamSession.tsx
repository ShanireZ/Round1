import { startTransition, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  replayPendingAutosavePatches,
  shouldBlockBeforeUnload,
  upsertDraftAnswer,
  type AutosavePhase,
  type DraftAnswers,
} from "@/lib/exam-session";
import { formatDifficultyLabel } from "@/lib/exam-results";
import type { ExamResultNavigationState } from "@/lib/exam-results";
import { fetchClientRuntimeConfig, getAutosaveIntervalMs } from "@/lib/client-config";
import { cn } from "@/lib/utils";

const AUTOSAVE_DEBOUNCE_MS = 30_000;

type QuestionView = {
  item: ExamSessionPayload["items"][number];
  renderable: ReturnType<typeof buildRenderableQuestion>;
};

function LoadingState() {
  return (
    <div className="grid h-full place-items-center px-6 py-10">
      <div className="w-full max-w-5xl space-y-6">
        <Skeleton className="h-48 w-full rounded-[var(--radius-xl)]" />
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

function formatPaperStatusLabel(status: string) {
  if (status === "draft") return "草稿";
  if (status === "started") return "进行中";
  if (status === "completed") return "已完成";
  if (status === "abandoned") return "已放弃";
  return "状态待确认";
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
    <Card
      variant="hero"
      className="exam-session-hero-surface border-border relative overflow-hidden border"
    >
      <CardContent className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="outline">考试进行中</Badge>
            <Badge variant={autosaveBadge.variant}>{autosaveBadge.label}</Badge>
            <Badge variant="secondary">{session.paper.examType}</Badge>
            <Badge variant="outline">{formatDifficultyLabel(session.paper.difficulty)}</Badge>
            <Badge
              variant={getCountdownBadgeVariant(countdownWarningLevel)}
              data-testid="exam-countdown-badge"
            >
              {countdownLabel}
            </Badge>
          </div>

          <div className="space-y-3">
            <p className="text-primary/70 font-mono text-xs tracking-[0.28em] uppercase">
              专注考试
            </p>
            <div className="text-foreground text-4xl font-semibold tracking-tight sm:text-5xl">
              专注作答进行中
            </div>
            <p className="text-muted-foreground max-w-2xl text-sm leading-6">
              系统会定期保存你的作答，提交后进入结果页。若网络短暂波动，请先留意保存状态提示。
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Card variant="stat" className="border-border bg-card/80">
              <CardDescription>答题进度</CardDescription>
              <CardTitle className="mt-2 text-lg">
                {answeredParts} / {totalParts}
              </CardTitle>
            </Card>
            <Card variant="stat" className="border-border bg-card/80">
              <CardDescription>来源</CardDescription>
              <CardTitle className="mt-2 text-lg">
                {session.paper.assignmentId ? "班级任务" : "自练模拟"}
              </CardTitle>
            </Card>
            <Card variant="stat" className="border-border bg-card/80">
              <CardDescription>试卷状态</CardDescription>
              <CardTitle className="mt-2 text-lg">
                {formatPaperStatusLabel(session.paper.status)}
              </CardTitle>
            </Card>
          </div>

          <div className="space-y-2">
            <div className="text-muted-foreground flex items-center justify-between text-sm">
              <span>已作答题目覆盖率</span>
              <span>{progressValue}%</span>
            </div>
            <Progress value={progressValue} variant="exam" />
          </div>
        </div>

        <div className="border-border/80 bg-card/75 space-y-4 rounded-[var(--radius-xl)] border p-5 backdrop-blur-sm">
          <div className="text-foreground flex items-center gap-2 text-sm font-medium">
            <Clock3 className="text-primary h-4 w-4" />
            保存与时间
          </div>
          <div className="text-muted-foreground space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span>自动保存</span>
              <Badge variant={autosaveBadge.variant}>{autosaveBadge.label}</Badge>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>提交保护</span>
              <Badge variant="saved">以最终结果为准</Badge>
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

          <div className="space-y-2">
            <div className="text-foreground text-sm font-medium">多标签保护已启用</div>
            <p className="text-muted-foreground text-sm leading-6">
              如果同一份试卷在其他标签页保存或提交，本标签会停止覆盖并提示冲突。
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FocusHeaderControls({
  answeredParts,
  totalParts,
  autosavePhase,
  countdownLabel,
  countdownWarningLevel,
  onSubmit,
  isSubmitting,
  submitDisabled,
}: {
  answeredParts: number;
  totalParts: number;
  autosavePhase: AutosavePhase;
  countdownLabel: string;
  countdownWarningLevel: "normal" | "warning" | "critical" | "expired";
  onSubmit: () => void;
  isSubmitting: boolean;
  submitDisabled: boolean;
}) {
  const portalTarget =
    typeof document === "undefined" ? null : document.getElementById("focus-header-portal");
  const autosaveBadge = getAutosaveBadge(autosavePhase);

  if (!portalTarget) {
    return null;
  }

  return createPortal(
    <div className="flex min-w-0 items-center justify-end gap-2 text-xs">
      <Badge variant={autosaveBadge.variant} className="hidden sm:inline-flex">
        {autosaveBadge.label}
      </Badge>
      <Badge variant="outline" className="hidden md:inline-flex">
        {answeredParts}/{totalParts}
      </Badge>
      <Badge
        variant={getCountdownBadgeVariant(countdownWarningLevel)}
        className="max-w-28 truncate sm:max-w-none"
      >
        <Clock3 className="h-3.5 w-3.5" />
        {countdownLabel}
      </Badge>
      <Button
        type="button"
        size="sm"
        className="min-w-20"
        loading={isSubmitting}
        disabled={submitDisabled}
        onClick={onSubmit}
      >
        交卷
      </Button>
    </div>,
    portalTarget,
  );
}

function MobileExamWarningDialog({ open, onContinue }: { open: boolean; onContinue: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onContinue()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>建议使用平板或电脑作答</DialogTitle>
          <DialogDescription>
            手机屏幕可以继续作答，但代码题、阅读程序和答题卡在更宽的屏幕上更稳定。
          </DialogDescription>
        </DialogHeader>
        <div className="border-border bg-subtle/20 rounded-[var(--radius-md)] border p-4 text-sm leading-6">
          当前会保留专注顶栏、底部题号导航和自动保存。请避免切换到其他标签页后长时间离开。
        </div>
        <DialogFooter>
          <Button type="button" variant="primary" onClick={onContinue}>
            继续作答
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConflictState({ paperId }: { paperId: string }) {
  return (
    <Card variant="hero" className="exam-session-warning-surface border-warning/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <Clock3 className="text-warning h-5 w-5" />
          当前试卷已不在可开始状态
        </CardTitle>
        <CardDescription>
          这张卷子已经开始或已经提交。可以直接查看结果，或重新选择一张模拟卷。
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
    <Card
      id={`slot-${item.slotNo}`}
      variant="flat"
      className="question-card border-border bg-card scroll-mt-24"
    >
      <CardHeader className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="outline">Q{item.slotNo}</Badge>
          <Badge variant="secondary">{formatQuestionTypeLabel(item.questionType)}</Badge>
          <Badge variant="outline">{item.points} 分</Badge>
          <Badge
            variant={
              answeredParts === renderable.parts.length
                ? "ac"
                : answeredParts > 0
                  ? "saved"
                  : "unanswered"
            }
          >
            {answeredParts === renderable.parts.length
              ? "已完成"
              : answeredParts > 0
                ? `${answeredParts}/${renderable.parts.length} 已答`
                : "未作答"}
          </Badge>
        </div>

        <div className="space-y-2">
          <CardTitle className="text-xl leading-8">{renderable.prompt}</CardTitle>
          <CardDescription>本题支持逐小题保存；已选答案会随保存状态同步。</CardDescription>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {renderable.code ? (
          <pre className="border-border/70 overflow-x-auto rounded-[var(--radius-lg)] border bg-[var(--color-code-background)] p-4 text-sm leading-6 text-[var(--color-code-foreground)]">
            <code>{renderable.code}</code>
          </pre>
        ) : null}

        {renderable.parts.map((part, index) => {
          const currentValue = getDraftAnswerValue(answers, item.slotNo, part.key);
          return (
            <div
              key={`${item.slotNo}-${part.key}`}
              className="border-border/70 bg-subtle/10 space-y-3 rounded-[var(--radius-lg)] border p-4"
            >
              <div className="text-foreground text-sm font-medium">
                {renderable.parts.length > 1 ? `第 ${index + 1} 小题` : "作答区域"}
              </div>
              <div className="text-muted-foreground text-sm leading-6">{part.prompt}</div>

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
                        className="border-border/70 bg-card hover:border-primary/50 flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border px-4 py-3 text-sm transition-colors"
                      >
                        <RadioGroupItem id={optionId} value={option.value} />
                        <div className="space-y-1">
                          <div className="text-foreground font-medium">{option.value}</div>
                          <div className="text-muted-foreground leading-6">{option.label}</div>
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

function FixedQuestionNavigation({
  questionViews,
  answers,
  answeredParts,
  totalParts,
  onJumpToSlot,
}: {
  questionViews: QuestionView[];
  answers: DraftAnswers;
  answeredParts: number;
  totalParts: number;
  onJumpToSlot: (slotNo: number) => void;
}) {
  return (
    <div
      className="border-border bg-surface/95 fixed inset-x-0 bottom-0 z-[var(--z-fixed)] border-t px-4 py-3 shadow-[var(--shadow-lg)] backdrop-blur-[var(--backdrop-blur)]"
      data-no-print
      data-testid="exam-fixed-question-nav"
    >
      <div className="mx-auto flex max-w-6xl items-center gap-4">
        <div className="hidden shrink-0 sm:block">
          <div className="text-foreground text-sm font-medium">答题导航</div>
          <div className="text-muted-foreground text-xs tabular-nums">
            {answeredParts}/{totalParts} 小题
          </div>
        </div>
        <div className="min-w-0 flex-1 overflow-x-auto">
          <div className="flex min-w-max gap-2">
            {questionViews.map((entry) => {
              const answeredCount = entry.renderable.parts.filter(
                (part) =>
                  getDraftAnswerValue(answers, entry.item.slotNo, part.key).trim().length > 0,
              ).length;
              const isCompleted = answeredCount === entry.renderable.parts.length;
              const isPartial = answeredCount > 0 && !isCompleted;
              const stateLabel = isCompleted
                ? "已完成"
                : isPartial
                  ? `${answeredCount}/${entry.renderable.parts.length} 已答`
                  : "未作答";

              return (
                <button
                  key={entry.item.slotNo}
                  type="button"
                  aria-label={`跳到第 ${entry.item.slotNo} 题，${stateLabel}`}
                  className={cn(
                    "border-border flex h-10 min-w-10 items-center justify-center rounded-[var(--radius-md)] border px-3 text-sm font-medium tabular-nums transition-colors focus-visible:shadow-[var(--shadow-glow)] focus-visible:outline-none",
                    isCompleted
                      ? "bg-primary text-primary-foreground border-primary"
                      : isPartial
                        ? "bg-accent-wash text-primary border-primary/40"
                        : "bg-card text-muted-foreground hover:bg-subtle hover:text-foreground",
                  )}
                  onClick={() => onJumpToSlot(entry.item.slotNo)}
                >
                  {entry.item.slotNo}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
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
  const [mobileWarningOpen, setMobileWarningOpen] = useState(false);
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

  const clientConfigQuery = useQuery({
    queryKey: ["client-runtime-config"],
    queryFn: fetchClientRuntimeConfig,
    retry: false,
    staleTime: 5 * 60_000,
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
        pendingPatchCount: pendingPatchesRef.current.length,
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

  useEffect(() => {
    if (!paperId || typeof window === "undefined") {
      return;
    }

    const isMobileViewport = window.matchMedia("(max-width: 767px)").matches;
    if (!isMobileViewport) {
      return;
    }

    const storageKey = `round1:exam-mobile-warning:${paperId}`;
    if (window.sessionStorage.getItem(storageKey) === "1") {
      return;
    }

    setMobileWarningOpen(true);
  }, [paperId]);

  const autosaveMutation = useMutation({
    mutationFn: autosaveExamAttempt,
    onSuccess: (result) => {
      const savedAnswers = normalizeDraftAnswers(result.answersJson);
      const pendingPatches = pendingPatchesRef.current;
      lastSavedSnapshotRef.current = JSON.stringify(savedAnswers);
      setAnswers(replayPendingAutosavePatches(savedAnswers, pendingPatches));
      setAutosavePhase(pendingPatches.length > 0 ? "dirty" : "saved");
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

  useEffect(() => {
    const sessionAttempt = sessionQuery.data?.attempt;
    if (!sessionAttempt || autosaveMutation.isPending || submitAttemptMutation.isPending) {
      return;
    }

    const timer = window.setInterval(() => {
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
    }, getAutosaveIntervalMs(clientConfigQuery.data));

    return () => {
      window.clearInterval(timer);
    };
  }, [
    autosaveMutation,
    clientConfigQuery.data,
    sessionQuery.data?.attempt,
    submitAttemptMutation.isPending,
  ]);

  const hasPendingBeforeUnloadGuard = shouldBlockBeforeUnload({
    autosavePhase,
    answers,
    lastSavedSnapshot: lastSavedSnapshotRef.current,
    pendingPatchCount: pendingPatchesRef.current.length,
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
    if (
      !session?.attempt ||
      !countdownState.isExpired ||
      autosaveMutation.isPending ||
      submitAttemptMutation.isPending
    ) {
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
  }, [
    answers,
    autosaveMutation.isPending,
    autosavePhase,
    countdownState.isExpired,
    session,
    submitAttemptMutation,
  ]);

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

  function handleSubmitCurrentAttempt() {
    if (!session?.attempt) {
      return;
    }

    submitAttemptMutation.mutate({
      attemptId: session.attempt.id,
      tabNonce: session.attempt.tabNonce,
      draftAnswers: answers,
      lastSavedSnapshot: lastSavedSnapshotRef.current,
      currentAutosavePhase: autosavePhase,
    });
  }

  function handleJumpToSlot(slotNo: number) {
    const target = document.getElementById(`slot-${slotNo}`);
    if (!target) {
      return;
    }

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "start",
    });
  }

  function handleContinueMobileWarning() {
    if (paperId && typeof window !== "undefined") {
      window.sessionStorage.setItem(`round1:exam-mobile-warning:${paperId}`, "1");
    }

    setMobileWarningOpen(false);
  }

  if (!paperId) {
    return (
      <div className="grid h-full place-items-center px-6 py-10">
        <Card variant="flat" className="border-destructive/30 bg-destructive/5 w-full max-w-2xl">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              缺少试卷编号
            </CardTitle>
            <CardDescription>当前链接缺少试卷编号，无法启动答题流程。</CardDescription>
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
        <Card
          variant="hero"
          className="exam-session-error-surface border-destructive/20 w-full max-w-3xl"
        >
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              无法启动答题流程
            </CardTitle>
            <CardDescription>
              {startError instanceof Error ? startError.message : "启动考试时发生未知错误。"}
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
        <Card
          variant="hero"
          className="exam-session-error-surface border-destructive/20 w-full max-w-3xl"
        >
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              无法读取考试题面
            </CardTitle>
            <CardDescription>
              {sessionQuery.error instanceof Error
                ? sessionQuery.error.message
                : "读取题面时发生未知错误。"}
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
    <div className="h-full overflow-y-auto px-6 pt-8 pb-32" data-testid="exam-session-page">
      <FocusHeaderControls
        answeredParts={answeredParts}
        totalParts={totalParts}
        autosavePhase={autosavePhase}
        countdownLabel={countdownState.label}
        countdownWarningLevel={countdownState.warningLevel}
        onSubmit={handleSubmitCurrentAttempt}
        isSubmitting={submitAttemptMutation.isPending}
        submitDisabled={autosaveMutation.isPending}
      />
      <MobileExamWarningDialog open={mobileWarningOpen} onContinue={handleContinueMobileWarning} />
      <div className="mx-auto max-w-6xl space-y-6">
        {countdownState.warningLevel !== "normal" ? (
          <div
            data-testid="exam-timer-warning"
            className={`rounded-[var(--radius-xl)] border px-5 py-4 text-sm ${
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
          <div className="border-border/80 bg-card/80 text-muted-foreground rounded-full border px-4 py-2 text-xs tracking-[0.24em] uppercase">
            专注作答
          </div>
          <div className="text-muted-foreground flex flex-wrap items-center justify-end gap-3 text-xs">
            <div className="flex items-center gap-3">
              <Save className="h-4 w-4" />
              作答会自动保存，提交前请确认保存状态
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
              <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-[var(--radius-lg)] border p-4 text-sm">
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
                  当前按题目和小题统计作答进度。点击题号可快速滚动到对应题面。
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-4 gap-3 sm:grid-cols-5">
                  {questionViews.map((entry) => {
                    const answeredCount = entry.renderable.parts.filter(
                      (part) =>
                        getDraftAnswerValue(answers, entry.item.slotNo, part.key).trim().length > 0,
                    ).length;
                    const isCompleted = answeredCount === entry.renderable.parts.length;
                    return (
                      <Button
                        key={entry.item.slotNo}
                        type="button"
                        aria-label={`跳到第 ${entry.item.slotNo} 题`}
                        variant={
                          isCompleted ? "primary" : answeredCount > 0 ? "secondary" : "ghost"
                        }
                        className="h-11"
                        onClick={() => handleJumpToSlot(entry.item.slotNo)}
                      >
                        {entry.item.slotNo}
                      </Button>
                    );
                  })}
                </div>

                <Separator />

                <div className="text-muted-foreground space-y-3 text-sm">
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
                    <Badge
                      variant={getAutosaveBadge(autosavePhase).variant}
                      data-testid="autosave-status"
                    >
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
                    disabled={autosaveMutation.isPending}
                    loading={submitAttemptMutation.isPending}
                    onClick={handleSubmitCurrentAttempt}
                  >
                    <SendHorizontal />
                    交卷并查看结果
                  </Button>

                  {submitAttemptMutation.isError ? (
                    <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-[var(--radius-lg)] border p-4 text-sm">
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
      <FixedQuestionNavigation
        questionViews={questionViews}
        answers={answers}
        answeredParts={answeredParts}
        totalParts={totalParts}
        onJumpToSlot={handleJumpToSlot}
      />
    </div>
  );
}
