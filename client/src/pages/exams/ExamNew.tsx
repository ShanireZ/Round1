import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileText,
  LogIn,
  RotateCcw,
  ShieldCheck,
  TimerReset,
} from "lucide-react";

import { MeshGradient } from "@/components/brand/MeshGradient";
import { NoiseTexture } from "@/components/brand/NoiseTexture";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchAuthSession } from "@/lib/auth";
import { fetchClientRuntimeConfig } from "@/lib/client-config";
import {
  buildExamNewOptions,
  formatDraftTtlLabel,
  formatExamTypeDescription,
  formatExamTypeLabel,
  getAvailableExamCount,
  getCreateExamErrorMessage,
  resolveDefaultExamSelection,
  resolveDifficultyForExamType,
  type ExamDifficulty,
} from "@/lib/exam-new";
import {
  createExamDraft,
  fetchActiveDraftExam,
  fetchExamCatalog,
  type DraftExamPaper,
} from "@/lib/exam-runtime";
import { formatDifficultyLabel, formatExamTypeBadgeVariant } from "@/lib/exam-results";

const difficultyDescriptions: Record<ExamDifficulty, string> = {
  easy: "基础题面与低压限时，适合热身。",
  medium: "标准模拟强度，适合日常训练。",
  hard: "更高区分度，适合赛前冲刺。",
};

function LoadingExamNew() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-6 py-8">
      <Skeleton className="h-48 w-full" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 10 }, (_, index) => (
          <Skeleton key={index} className="h-40 w-full" />
        ))}
      </div>
      <Skeleton className="h-56 w-full" />
    </div>
  );
}

function LoginRequiredExamNew() {
  return (
    <div className="h-full overflow-y-auto px-6 py-8">
      <div className="mx-auto grid min-h-[60vh] max-w-3xl place-items-center">
        <div className="border-border bg-card w-full rounded-[var(--radius-lg)] border p-8 text-center shadow-sm">
          <LogIn className="text-primary mx-auto h-9 w-9" />
          <h1 className="text-foreground mt-5 text-2xl font-semibold tracking-tight">
            登录后开始模拟
          </h1>
          <p className="text-muted-foreground mx-auto mt-3 max-w-lg text-sm leading-6">
            出卷入口会读取你的预制卷目录、草稿和进行中考试状态。
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button asChild variant="primary">
              <Link to={`/login?returnTo=${encodeURIComponent("/exams/new")}`}>
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

function ActiveDraftBanner({ draft }: { draft: DraftExamPaper }) {
  return (
    <Card variant="flat" className="border-primary/40 bg-accent-wash/40">
      <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={formatExamTypeBadgeVariant(draft.examType)}>{draft.examType}</Badge>
            <Badge variant="outline">{formatDifficultyLabel(draft.difficulty)}</Badge>
            <Badge variant="saved">草稿</Badge>
          </div>
          <div className="text-foreground text-sm font-medium">你有一份未开始的模拟卷。</div>
          <div className="text-muted-foreground text-xs">
            继续进入会按服务端草稿状态开考，不重新抽取预制卷。
          </div>
        </div>
        <Button asChild variant="primary">
          <Link to={`/exams/${draft.id}`}>
            继续草稿
            <ArrowRight />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export default function ExamNew() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedExamType, setSelectedExamType] = useState<string | null>(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState<ExamDifficulty | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const sessionQuery = useQuery({
    queryKey: ["auth-session"],
    queryFn: fetchAuthSession,
    retry: false,
    staleTime: 30_000,
  });
  const isAuthenticated = sessionQuery.data?.authenticated === true;
  const configQuery = useQuery({
    queryKey: ["client-config"],
    queryFn: fetchClientRuntimeConfig,
    enabled: isAuthenticated,
    staleTime: 60_000,
  });
  const catalogQuery = useQuery({
    queryKey: ["exam-catalog"],
    queryFn: fetchExamCatalog,
    enabled: isAuthenticated,
  });
  const activeDraftQuery = useQuery({
    queryKey: ["exam-active-draft"],
    queryFn: fetchActiveDraftExam,
    enabled: isAuthenticated,
  });

  const options = useMemo(
    () =>
      buildExamNewOptions({
        examTypes: configQuery.data?.availableExamTypes ?? [],
        difficulties: configQuery.data?.availableDifficulties ?? [],
        catalogItems: catalogQuery.data?.items ?? [],
      }),
    [catalogQuery.data, configQuery.data],
  );
  const defaultSelection = useMemo(() => resolveDefaultExamSelection(options), [options]);
  const currentExamType = selectedExamType ?? defaultSelection?.examType ?? null;
  const currentDifficulty = currentExamType
    ? resolveDifficultyForExamType(options, currentExamType, selectedDifficulty)
    : null;
  const selectedCount =
    currentExamType && currentDifficulty
      ? getAvailableExamCount(options, {
          examType: currentExamType,
          difficulty: currentDifficulty,
        })
      : 0;
  const activeDraft = activeDraftQuery.data;
  const visibleExamTypes = configQuery.data?.availableExamTypes ?? [];
  const difficultyValues = configQuery.data?.availableDifficulties.filter(
    (difficulty): difficulty is ExamDifficulty =>
      difficulty === "easy" || difficulty === "medium" || difficulty === "hard",
  );

  const createMutation = useMutation({
    mutationFn: () => {
      if (!currentExamType || !currentDifficulty) {
        throw new Error("请选择考试类型和难度。");
      }

      return createExamDraft({
        examType: currentExamType,
        difficulty: currentDifficulty,
      });
    },
    onSuccess: async (draft) => {
      setConfirmOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["exam-active-draft"] });
      navigate(`/exams/${draft.id}`);
    },
    onError: (error) => {
      toast.error(getCreateExamErrorMessage(error));
    },
  });

  if (
    sessionQuery.isPending ||
    (isAuthenticated && (configQuery.isPending || catalogQuery.isPending))
  ) {
    return <LoadingExamNew />;
  }

  if (!isAuthenticated) {
    return <LoginRequiredExamNew />;
  }

  return (
    <div className="h-full overflow-y-auto px-6 py-8">
      <div className="mx-auto max-w-7xl space-y-6" data-testid="exam-new-page">
        <section className="border-border bg-card relative overflow-hidden rounded-[var(--radius-xl)] border p-6 md:p-8">
          <MeshGradient variant="hero" className="opacity-70" />
          <NoiseTexture />
          <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="space-y-4">
              <Badge variant="outline">Exam Setup</Badge>
              <div className="space-y-3">
                <h1 className="text-foreground text-3xl font-semibold md:text-5xl">出卷考试</h1>
                <p className="text-muted-foreground max-w-2xl text-sm leading-6">
                  从已发布预制卷创建草稿，进入答题页后立即开始服务端计时。
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="border-border bg-card/80 rounded-[var(--radius-lg)] border p-4 backdrop-blur-sm">
                  <div className="text-muted-foreground text-xs">分制</div>
                  <div className="text-foreground mt-2 text-xl font-semibold tabular-nums">
                    100 分
                  </div>
                </div>
                <div className="border-border bg-card/80 rounded-[var(--radius-lg)] border p-4 backdrop-blur-sm">
                  <div className="text-muted-foreground text-xs">时长</div>
                  <div className="text-foreground mt-2 text-xl font-semibold">蓝图时长</div>
                </div>
                <div className="border-border bg-card/80 rounded-[var(--radius-lg)] border p-4 backdrop-blur-sm">
                  <div className="text-muted-foreground text-xs">草稿回收</div>
                  <div className="text-foreground mt-2 text-xl font-semibold">
                    {formatDraftTtlLabel(configQuery.data?.examDraftTtlMinutes ?? 0)}
                  </div>
                </div>
              </div>
            </div>

            <div className="border-border bg-card/85 min-w-72 rounded-[var(--radius-lg)] border p-5 backdrop-blur-sm">
              <div className="text-muted-foreground text-xs">当前选择</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {currentExamType ? (
                  <Badge variant={formatExamTypeBadgeVariant(currentExamType)}>
                    {currentExamType}
                  </Badge>
                ) : null}
                {currentDifficulty ? (
                  <Badge variant="outline">{formatDifficultyLabel(currentDifficulty)}</Badge>
                ) : null}
              </div>
              <div className="text-muted-foreground mt-3 text-xs">
                可用预制卷：<span className="tabular-nums">{selectedCount}</span>
              </div>
              <Button
                type="button"
                className="mt-4 w-full"
                disabled={!currentExamType || !currentDifficulty || selectedCount <= 0}
                onClick={() => setConfirmOpen(true)}
              >
                创建并进入
                <ArrowRight />
              </Button>
            </div>
          </div>
        </section>

        {activeDraft ? <ActiveDraftBanner draft={activeDraft} /> : null}

        {configQuery.isError || catalogQuery.isError ? (
          <Card variant="flat" className="border-destructive/50 bg-card">
            <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-destructive font-medium">出卷目录读取失败</div>
                <div className="text-muted-foreground mt-1 text-sm">
                  请重试读取运行时配置和预制卷目录。
                </div>
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  void configQuery.refetch();
                  void catalogQuery.refetch();
                }}
              >
                <RotateCcw />
                重试
              </Button>
            </CardContent>
          </Card>
        ) : null}

        <fieldset className="m-0 grid min-w-0 gap-4 border-0 p-0 sm:grid-cols-2 xl:grid-cols-5">
          <legend className="sr-only">考试类型</legend>
          {visibleExamTypes.map((examType) => {
            const typeOptions = options.filter((option) => option.examType === examType);
            const totalCount = typeOptions.reduce((sum, option) => sum + option.availableCount, 0);
            const isSelected = currentExamType === examType;
            return (
              <label
                key={examType}
                className={`group border-border bg-card rounded-[var(--radius-lg)] border p-5 text-left transition-all focus-within:shadow-[var(--shadow-glow)] ${
                  totalCount === 0
                    ? "cursor-not-allowed opacity-55"
                    : "hover:border-primary/60 hover:bg-accent-wash/40 cursor-pointer"
                } ${isSelected ? "border-primary bg-accent-wash/50" : ""}`}
              >
                <input
                  type="radio"
                  name="exam-type"
                  value={examType}
                  checked={isSelected}
                  disabled={totalCount === 0}
                  onChange={() => {
                    const nextDifficulty = resolveDifficultyForExamType(
                      options,
                      examType,
                      currentDifficulty,
                    );
                    setSelectedExamType(examType);
                    setSelectedDifficulty(nextDifficulty);
                  }}
                  className="sr-only"
                />
                <div className="flex items-start justify-between gap-3">
                  <Badge variant={formatExamTypeBadgeVariant(examType)}>{examType}</Badge>
                  {isSelected ? <CheckCircle2 className="text-primary h-4 w-4" /> : null}
                </div>
                <div className="text-foreground mt-4 text-xl font-semibold">
                  {formatExamTypeLabel(examType)}
                </div>
                <div className="text-muted-foreground mt-2 min-h-12 text-xs leading-5">
                  {formatExamTypeDescription(examType)}
                </div>
                <div className="text-muted-foreground mt-4 flex items-center gap-2 text-xs">
                  <FileText className="h-3.5 w-3.5" />
                  <span className="tabular-nums">{totalCount} 套可用</span>
                </div>
              </label>
            );
          })}
        </fieldset>

        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <Card variant="flat" className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <TimerReset className="text-primary h-5 w-5" />
                难度
              </CardTitle>
              <CardDescription>同一考试类型下按已发布预制卷目录启用。</CardDescription>
            </CardHeader>
            <CardContent>
              <fieldset className="m-0 grid min-w-0 gap-3 border-0 p-0">
                <legend className="sr-only">难度</legend>
                {(difficultyValues ?? []).map((difficulty) => {
                  const count =
                    currentExamType === null
                      ? 0
                      : getAvailableExamCount(options, {
                          examType: currentExamType,
                          difficulty,
                        });
                  const isSelected = currentDifficulty === difficulty;
                  return (
                    <label
                      key={difficulty}
                      className={`border-border bg-card rounded-[var(--radius-md)] border p-4 text-left transition-colors focus-within:shadow-[var(--shadow-glow)] ${
                        count === 0
                          ? "cursor-not-allowed opacity-55"
                          : "hover:border-primary/60 cursor-pointer"
                      } ${isSelected ? "border-primary bg-accent-wash/50" : ""}`}
                    >
                      <input
                        type="radio"
                        name="exam-difficulty"
                        value={difficulty}
                        checked={isSelected}
                        disabled={count === 0}
                        onChange={() => setSelectedDifficulty(difficulty)}
                        className="sr-only"
                      />
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium">{formatDifficultyLabel(difficulty)}</div>
                        <Badge variant="outline">
                          <span className="tabular-nums">{count}</span> 套
                        </Badge>
                      </div>
                      <div className="text-muted-foreground mt-2 text-sm">
                        {difficultyDescriptions[difficulty]}
                      </div>
                    </label>
                  );
                })}
              </fieldset>
            </CardContent>
          </Card>

          <Card variant="flat" className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <ShieldCheck className="text-primary h-5 w-5" />
                开考确认
              </CardTitle>
              <CardDescription>开始后由服务端 attempt、倒计时和自动保存兜底。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="border-border rounded-[var(--radius-md)] border p-4">
                  <div className="text-muted-foreground text-xs">试卷</div>
                  <div className="text-foreground mt-2 font-medium">
                    {currentExamType ?? "未选择"}
                  </div>
                </div>
                <div className="border-border rounded-[var(--radius-md)] border p-4">
                  <div className="text-muted-foreground text-xs">难度</div>
                  <div className="text-foreground mt-2 font-medium">
                    {formatDifficultyLabel(currentDifficulty)}
                  </div>
                </div>
                <div className="border-border rounded-[var(--radius-md)] border p-4">
                  <div className="text-muted-foreground text-xs">计时</div>
                  <div className="text-foreground mt-2 flex items-center gap-2 font-medium">
                    <Clock3 className="h-4 w-4" />
                    进入即开始
                  </div>
                </div>
              </div>
              <div className="text-muted-foreground border-border bg-subtle/20 rounded-[var(--radius-md)] border p-4 text-sm leading-6">
                提交前请确认网络可用。进入答题页后会创建或复用服务端 attempt，并按
                运行时自动保存间隔周期保存待提交答案。
              </div>
              <Button
                type="button"
                variant="primary"
                disabled={!currentExamType || !currentDifficulty || selectedCount <= 0}
                onClick={() => setConfirmOpen(true)}
              >
                创建并进入
                <ArrowRight />
              </Button>
            </CardContent>
          </Card>
        </div>

        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>确认开始这场模拟？</DialogTitle>
              <DialogDescription>
                {currentExamType} · {formatDifficultyLabel(currentDifficulty)}
                。进入答题页后会立即开始计时。
              </DialogDescription>
            </DialogHeader>
            <div className="border-border bg-subtle/20 rounded-[var(--radius-md)] border p-4 text-sm">
              当前可用预制卷：
              <span className="font-mono tabular-nums">{selectedCount}</span> 套。若已有匹配草稿，
              系统会复用草稿而不是重新抽取。
            </div>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setConfirmOpen(false)}>
                取消
              </Button>
              <Button
                type="button"
                variant="primary"
                loading={createMutation.isPending}
                onClick={() => createMutation.mutate()}
              >
                确认进入
                <ArrowRight />
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
