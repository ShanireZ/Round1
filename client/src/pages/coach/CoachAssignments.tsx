import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { toast } from "sonner";
import {
  ArrowRight,
  ClipboardList,
  Clock3,
  LogIn,
  Plus,
  RotateCcw,
  Users,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchAuthSession } from "@/lib/auth";
import {
  closeCoachAssignment,
  countOpenCoachAssignments,
  createCoachAssignment,
  fetchCoachClassAssignments,
  fetchCoachClasses,
  fetchCoachPrebuiltPapers,
  formatCoachAssignmentStatusLabel,
  type CoachClassAssignment,
  type CoachPrebuiltPaperSummary,
} from "@/lib/coach";
import { formatDifficultyLabel, formatExamTypeBadgeVariant } from "@/lib/exam-results";

function formatDate(value: string | null) {
  if (!value) {
    return "暂无";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatDateTimeLocalInput(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function getDefaultDueAtInput(): string {
  const dueAt = new Date();
  dueAt.setDate(dueAt.getDate() + 7);
  dueAt.setHours(18, 0, 0, 0);
  return formatDateTimeLocalInput(dueAt);
}

function statusBadgeVariant(status: string) {
  if (status === "assigned") {
    return "saved" as const;
  }
  if (status === "closed") {
    return "outline" as const;
  }
  return "secondary" as const;
}

function LoadingCoachAssignments() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-72 w-full" />
    </div>
  );
}

function CoachAccessPrompt({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: "login";
}) {
  return (
    <div className="grid min-h-[55vh] place-items-center">
      <div className="border-border bg-card max-w-xl rounded-[--radius-lg] border p-8 text-center">
        <ClipboardList className="text-muted-foreground mx-auto h-9 w-9" />
        <h1 className="text-foreground mt-4 text-2xl font-semibold">{title}</h1>
        <p className="text-muted-foreground mt-3 text-sm leading-6">{description}</p>
        {action === "login" ? (
          <Button asChild className="mt-5">
            <Link to={`/login?returnTo=${encodeURIComponent("/coach/assignments")}`}>
              <LogIn />
              登录
            </Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function formatPaperOption(paper: CoachPrebuiltPaperSummary): string {
  return `${paper.title} · ${paper.examType} · ${formatDifficultyLabel(paper.difficulty)}`;
}

function AssignmentCard({
  assignment,
  onClose,
  pending,
}: {
  assignment: CoachClassAssignment;
  onClose: (assignment: CoachClassAssignment) => void;
  pending: boolean;
}) {
  const canClose = assignment.status === "assigned";

  return (
    <Card variant="flat" className="border-border bg-card">
      <CardContent className="grid gap-4 p-5 lg:grid-cols-[1fr_auto_auto] lg:items-center">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={formatExamTypeBadgeVariant(assignment.examType)}>
              {assignment.examType}
            </Badge>
            <Badge variant="outline">{formatDifficultyLabel(assignment.difficulty ?? null)}</Badge>
            <Badge variant={statusBadgeVariant(assignment.status)}>
              {formatCoachAssignmentStatusLabel(assignment.status)}
            </Badge>
          </div>
          <div>
            <div className="text-foreground truncate text-lg font-semibold">{assignment.title}</div>
            <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-3 text-xs">
              <span className="flex items-center gap-1">
                <Clock3 className="h-3.5 w-3.5" />
                {formatDate(assignment.dueAt)}
              </span>
              <span className="tabular-nums">blueprint v{assignment.blueprintVersion}</span>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 md:min-w-52">
          <div className="border-border rounded-[--radius-md] border p-3">
            <div className="text-muted-foreground text-xs">学生</div>
            <div className="text-foreground mt-1 text-xl font-semibold tabular-nums">
              {assignment.assignedStudents ?? 0}
            </div>
          </div>
          <div className="border-border rounded-[--radius-md] border p-3">
            <div className="text-muted-foreground text-xs">模式</div>
            <div className="text-foreground mt-1 text-sm font-medium">{assignment.mode}</div>
          </div>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={!canClose || pending}
          onClick={() => onClose(assignment)}
        >
          <XCircle />
          关闭
        </Button>
      </CardContent>
    </Card>
  );
}

export default function CoachAssignments() {
  const queryClient = useQueryClient();
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [assignmentTitle, setAssignmentTitle] = useState("");
  const [prebuiltPaperId, setPrebuiltPaperId] = useState("");
  const [dueAtInput, setDueAtInput] = useState(() => getDefaultDueAtInput());

  const sessionQuery = useQuery({
    queryKey: ["auth-session"],
    queryFn: fetchAuthSession,
    retry: false,
    staleTime: 60_000,
  });
  const session = sessionQuery.data;
  const canReadAssignments =
    session?.authenticated === true &&
    (session.user.role === "coach" || session.user.role === "admin");

  const classesQuery = useQuery({
    queryKey: ["coach-classes"],
    queryFn: fetchCoachClasses,
    enabled: canReadAssignments,
  });
  const prebuiltPapersQuery = useQuery({
    queryKey: ["coach-prebuilt-papers"],
    queryFn: fetchCoachPrebuiltPapers,
    enabled: canReadAssignments,
  });
  const classes = useMemo(() => classesQuery.data?.items ?? [], [classesQuery.data]);
  const prebuiltPapers = useMemo(
    () => prebuiltPapersQuery.data?.items ?? [],
    [prebuiltPapersQuery.data],
  );
  const activeClassId = selectedClassId ?? classes[0]?.id ?? null;
  const activeClass = useMemo(
    () => classes.find((klass) => klass.id === activeClassId) ?? null,
    [activeClassId, classes],
  );
  const activePrebuiltPaperId = prebuiltPaperId || prebuiltPapers[0]?.id || "";
  const canCreateAssignment =
    Boolean(activeClassId) && Boolean(activePrebuiltPaperId) && !activeClass?.archivedAt;

  const assignmentsQuery = useQuery({
    queryKey: ["coach-assignments", activeClassId],
    queryFn: () => fetchCoachClassAssignments(activeClassId!),
    enabled: canReadAssignments && Boolean(activeClassId),
  });
  const assignments = assignmentsQuery.data?.items ?? [];
  const openCount = countOpenCoachAssignments(assignments);
  const assignedStudents = assignments.reduce(
    (sum, assignment) => sum + (assignment.assignedStudents ?? 0),
    0,
  );

  const createMutation = useMutation({
    mutationFn: createCoachAssignment,
    onSuccess: async (assignment) => {
      setAssignmentTitle("");
      toast.success("任务已创建");
      await queryClient.invalidateQueries({ queryKey: ["coach-assignments", assignment.classId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "创建任务失败");
    },
  });

  const closeMutation = useMutation({
    mutationFn: closeCoachAssignment,
    onSuccess: async (assignment) => {
      toast.success("任务已关闭");
      await queryClient.invalidateQueries({ queryKey: ["coach-assignments", assignment.classId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "关闭任务失败");
    },
  });

  if (
    sessionQuery.isPending ||
    (canReadAssignments && (classesQuery.isPending || prebuiltPapersQuery.isPending))
  ) {
    return <LoadingCoachAssignments />;
  }

  if (session?.authenticated === false) {
    return (
      <CoachAccessPrompt
        title="登录后查看任务"
        description="任务管理会读取受保护的班级和 assignment progress。"
        action="login"
      />
    );
  }

  if (session?.authenticated === true && !canReadAssignments) {
    return (
      <CoachAccessPrompt
        title="当前账号没有教练权限"
        description="只有 coach 或 admin 可以查看班级任务。"
      />
    );
  }

  if (classes.length === 0) {
    return (
      <CoachAccessPrompt
        title="还没有班级"
        description="创建班级后，这里会按班级展示固定预制卷任务。"
      />
    );
  }

  return (
    <div className="space-y-6" data-testid="coach-assignments-page">
      <Card variant="hero" className="overflow-hidden">
        <CardHeader className="gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <Badge variant="outline">Coach Assignments</Badge>
            <CardTitle className="mt-3 text-2xl">任务</CardTitle>
            <CardDescription className="mt-2 max-w-2xl">
              按班级创建和查看固定预制卷任务，不混入学生自练数据。
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={activeClassId ?? undefined}
              onValueChange={(value) => setSelectedClassId(value)}
            >
              <SelectTrigger className="min-w-56">
                <SelectValue placeholder="选择班级" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((klass) => (
                  <SelectItem key={klass.id} value={klass.id}>
                    {klass.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button asChild variant="secondary">
              <Link to="/coach/classes">
                <Users />
                班级
              </Link>
            </Button>
          </div>
        </CardHeader>
      </Card>

      <Card variant="flat" className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-lg">创建任务</CardTitle>
          <CardDescription>
            任务会绑定一张已发布预制卷，并为当前班级学生生成 pending progress。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 xl:grid-cols-[1.2fr_1.3fr_1fr_auto] xl:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              if (!activeClassId || !activePrebuiltPaperId) {
                toast.error("请选择班级和预制卷");
                return;
              }
              if (!assignmentTitle.trim()) {
                toast.error("请输入任务标题");
                return;
              }

              const dueAt = new Date(dueAtInput);
              if (Number.isNaN(dueAt.getTime())) {
                toast.error("请选择有效截止时间");
                return;
              }

              createMutation.mutate({
                classId: activeClassId,
                title: assignmentTitle.trim(),
                prebuiltPaperId: activePrebuiltPaperId,
                dueAt: dueAt.toISOString(),
              });
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="coach-assignment-title">任务标题</Label>
              <Input
                id="coach-assignment-title"
                value={assignmentTitle}
                onChange={(event) => setAssignmentTitle(event.target.value)}
                placeholder="第 1 周模拟"
                maxLength={200}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="coach-assignment-paper">预制卷</Label>
              <Select
                value={activePrebuiltPaperId || undefined}
                onValueChange={setPrebuiltPaperId}
                disabled={prebuiltPapers.length === 0}
              >
                <SelectTrigger id="coach-assignment-paper">
                  <SelectValue placeholder="选择已发布预制卷" />
                </SelectTrigger>
                <SelectContent>
                  {prebuiltPapers.map((paper) => (
                    <SelectItem key={paper.id} value={paper.id}>
                      {formatPaperOption(paper)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="coach-assignment-due-at">截止时间</Label>
              <Input
                id="coach-assignment-due-at"
                type="datetime-local"
                value={dueAtInput}
                onChange={(event) => setDueAtInput(event.target.value)}
              />
            </div>
            <Button
              type="submit"
              loading={createMutation.isPending}
              disabled={!canCreateAssignment || createMutation.isPending}
            >
              <Plus />
              创建任务
            </Button>
          </form>
          {prebuiltPapersQuery.isError ? (
            <div className="text-destructive mt-3 text-sm">预制卷列表读取失败，请稍后重试。</div>
          ) : prebuiltPapers.length === 0 ? (
            <div className="text-muted-foreground mt-3 text-sm">
              当前没有已发布预制卷，需先由管理员在预制卷库发布。
            </div>
          ) : activeClass?.archivedAt ? (
            <div className="text-muted-foreground mt-3 text-sm">已归档班级不能创建新任务。</div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card variant="stat" className="border-border bg-card">
          <CardContent className="p-5">
            <div className="text-muted-foreground text-xs">任务数</div>
            <div className="text-foreground mt-2 text-2xl font-semibold tabular-nums">
              {assignments.length}
            </div>
            <div className="text-muted-foreground mt-1 text-xs">
              {activeClass?.name ?? "当前班级"}
            </div>
          </CardContent>
        </Card>
        <Card variant="stat" className="border-border bg-card">
          <CardContent className="p-5">
            <div className="text-muted-foreground text-xs">进行中</div>
            <div className="text-foreground mt-2 text-2xl font-semibold tabular-nums">
              {openCount}
            </div>
            <div className="text-muted-foreground mt-1 text-xs">assigned</div>
          </CardContent>
        </Card>
        <Card variant="stat" className="border-border bg-card">
          <CardContent className="p-5">
            <div className="text-muted-foreground text-xs">进度行</div>
            <div className="text-foreground mt-2 text-2xl font-semibold tabular-nums">
              {assignedStudents}
            </div>
            <div className="text-muted-foreground mt-1 text-xs">assignment progress</div>
          </CardContent>
        </Card>
      </div>

      {assignmentsQuery.isPending ? (
        <Skeleton className="h-72 w-full" />
      ) : assignmentsQuery.isError ? (
        <Card variant="flat" className="border-destructive/50 bg-card">
          <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-destructive font-medium">任务列表读取失败</div>
              <div className="text-muted-foreground mt-1 text-sm">
                请重试当前班级 assignment API。
              </div>
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void assignmentsQuery.refetch()}
            >
              <RotateCcw />
              重试
            </Button>
          </CardContent>
        </Card>
      ) : assignments.length === 0 ? (
        <div className="border-border bg-subtle/10 grid min-h-64 place-items-center rounded-[--radius-lg] border border-dashed p-8 text-center">
          <div className="space-y-3">
            <ClipboardList className="text-muted-foreground mx-auto h-8 w-8" />
            <div className="text-foreground font-medium">当前班级还没有任务</div>
            <div className="text-muted-foreground text-sm">
              创建任务后，系统会绑定已发布预制卷并为当前学生成员写入 progress。
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {assignments.map((assignment) => (
            <AssignmentCard
              key={assignment.id}
              assignment={assignment}
              pending={closeMutation.isPending}
              onClose={(target) => closeMutation.mutate(target.id)}
            />
          ))}
        </div>
      )}

      <Card variant="flat" className="border-border bg-card">
        <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-foreground font-medium">查看 assignment-only 聚合报告</div>
            <div className="text-muted-foreground mt-1 text-sm">
              报告页会按当前班级聚合热力图、题型统计和学生下钻。
            </div>
          </div>
          <Button asChild variant="primary">
            <Link to={`/coach/report?classId=${encodeURIComponent(activeClassId ?? "")}`}>
              报告
              <ArrowRight />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
