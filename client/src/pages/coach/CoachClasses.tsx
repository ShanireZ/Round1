import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { toast } from "sonner";
import {
  Archive,
  ArrowRight,
  Clipboard,
  Copy,
  LogIn,
  Plus,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchAuthSession } from "@/lib/auth";
import {
  archiveCoachClass,
  countActiveCoachClasses,
  createCoachClass,
  fetchCoachClasses,
  formatCoachClassRoleLabel,
  rotateCoachClassJoinCode,
  type CoachClassSummary,
} from "@/lib/coach";

function formatDate(value: string | null) {
  if (!value) {
    return "暂无";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function LoadingCoachClasses() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-40 w-full" />
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-44 w-full" />
      </div>
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
      <div className="border-border bg-card max-w-xl rounded-[var(--radius-lg)] border p-8 text-center">
        <Users className="text-muted-foreground mx-auto h-9 w-9" />
        <h1 className="text-foreground mt-4 text-2xl font-semibold">{title}</h1>
        <p className="text-muted-foreground mt-3 text-sm leading-6">{description}</p>
        {action === "login" ? (
          <Button asChild className="mt-5">
            <Link to={`/login?returnTo=${encodeURIComponent("/coach/classes")}`}>
              <LogIn />
              登录
            </Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function getClassTone(klass: CoachClassSummary) {
  if (klass.archivedAt) {
    return { label: "archived", variant: "outline" as const };
  }
  if (klass.coachRole === "owner") {
    return { label: "owner", variant: "saved" as const };
  }
  return { label: "collaborator", variant: "secondary" as const };
}

function ClassCard({
  klass,
  onRotate,
  onArchive,
  pending,
}: {
  klass: CoachClassSummary;
  onRotate: (klass: CoachClassSummary) => void;
  onArchive: (klass: CoachClassSummary) => void;
  pending: boolean;
}) {
  const tone = getClassTone(klass);
  const canManage = klass.coachRole === "owner" && !klass.archivedAt;

  async function copyJoinCode() {
    try {
      await navigator.clipboard.writeText(klass.joinCode);
      toast.success("班级码已复制");
    } catch {
      toast.error("复制失败，请手动选择班级码");
    }
  }

  return (
    <Card variant="flat" className="border-border bg-card">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="truncate text-xl">{klass.name}</CardTitle>
            <CardDescription className="mt-1">创建于 {formatDate(klass.createdAt)}</CardDescription>
          </div>
          <Badge variant={tone.variant}>{tone.label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <div className="text-muted-foreground text-xs">学生</div>
            <div className="text-foreground mt-1 text-xl font-semibold tabular-nums">
              {klass.memberCount ?? 0}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">教练</div>
            <div className="text-foreground mt-1 text-xl font-semibold tabular-nums">
              {klass.coachCount ?? 0}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">角色</div>
            <div className="text-foreground mt-1 text-sm font-medium">
              {formatCoachClassRoleLabel(klass.coachRole)}
            </div>
          </div>
        </div>

        <div className="border-border bg-subtle/15 rounded-[var(--radius-md)] border p-3">
          <div className="text-muted-foreground text-xs">班级码</div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <code className="text-foreground font-mono text-lg tracking-[0.18em]">
              {klass.joinCode}
            </code>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="复制班级码"
              onClick={copyJoinCode}
            >
              <Copy />
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="primary" size="sm">
            <Link to={`/coach/classes/${encodeURIComponent(klass.id)}`}>
              <Settings2 />
              管理
            </Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link to={`/coach/report?classId=${encodeURIComponent(klass.id)}`}>
              报告
              <ArrowRight />
            </Link>
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!canManage || pending}
            onClick={() => onRotate(klass)}
          >
            <RotateCcw />
            轮换班级码
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!canManage || pending}
            onClick={() => onArchive(klass)}
          >
            <Archive />
            归档
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function CoachClasses() {
  const queryClient = useQueryClient();
  const [className, setClassName] = useState("");

  const sessionQuery = useQuery({
    queryKey: ["auth-session"],
    queryFn: fetchAuthSession,
    retry: false,
    staleTime: 60_000,
  });
  const session = sessionQuery.data;
  const canManageClasses =
    session?.authenticated === true &&
    (session.user.role === "coach" || session.user.role === "admin");

  const classesQuery = useQuery({
    queryKey: ["coach-classes"],
    queryFn: fetchCoachClasses,
    enabled: canManageClasses,
  });
  const classes = useMemo(() => classesQuery.data?.items ?? [], [classesQuery.data]);
  const activeCount = countActiveCoachClasses(classes);
  const totalStudents = classes.reduce((sum, klass) => sum + (klass.memberCount ?? 0), 0);

  const createMutation = useMutation({
    mutationFn: () => createCoachClass({ name: className.trim() }),
    onSuccess: async () => {
      setClassName("");
      toast.success("班级已创建");
      await queryClient.invalidateQueries({ queryKey: ["coach-classes"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "创建班级失败");
    },
  });

  const rotateMutation = useMutation({
    mutationFn: rotateCoachClassJoinCode,
    onSuccess: async () => {
      toast.success("班级码已轮换");
      await queryClient.invalidateQueries({ queryKey: ["coach-classes"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "轮换班级码失败");
    },
  });

  const archiveMutation = useMutation({
    mutationFn: archiveCoachClass,
    onSuccess: async () => {
      toast.success("班级已归档");
      await queryClient.invalidateQueries({ queryKey: ["coach-classes"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "归档班级失败");
    },
  });

  if (sessionQuery.isPending || (canManageClasses && classesQuery.isPending)) {
    return <LoadingCoachClasses />;
  }

  if (session?.authenticated === false) {
    return (
      <CoachAccessPrompt
        title="登录后管理班级"
        description="班级、邀请码和 assignment 入口都绑定到受保护的 coach 会话。"
        action="login"
      />
    );
  }

  if (session?.authenticated === true && !canManageClasses) {
    return (
      <CoachAccessPrompt
        title="当前账号没有教练权限"
        description="只有 coach 或 admin 可以创建班级、轮换班级码和查看班级报告。"
      />
    );
  }

  return (
    <div className="space-y-6" data-testid="coach-classes-page">
      <Card variant="hero" className="overflow-hidden">
        <CardHeader className="gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <Badge variant="outline">Coach Classes</Badge>
            <CardTitle className="mt-3 text-2xl">班级</CardTitle>
            <CardDescription className="mt-2 max-w-2xl">
              创建班级、分发班级码，并从同一入口进入 assignment-only 报告。
            </CardDescription>
          </div>
          <div className="grid min-w-64 grid-cols-3 gap-3">
            <div className="border-border bg-card/80 rounded-[var(--radius-md)] border p-3">
              <div className="text-muted-foreground text-xs">全部</div>
              <div className="text-foreground mt-1 text-xl font-semibold tabular-nums">
                {classes.length}
              </div>
            </div>
            <div className="border-border bg-card/80 rounded-[var(--radius-md)] border p-3">
              <div className="text-muted-foreground text-xs">活跃</div>
              <div className="text-foreground mt-1 text-xl font-semibold tabular-nums">
                {activeCount}
              </div>
            </div>
            <div className="border-border bg-card/80 rounded-[var(--radius-md)] border p-3">
              <div className="text-muted-foreground text-xs">学生</div>
              <div className="text-foreground mt-1 text-xl font-semibold tabular-nums">
                {totalStudents}
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      <Card variant="flat" className="border-border bg-card">
        <CardContent className="p-5">
          <form
            className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              if (!className.trim()) {
                toast.error("请输入班级名称");
                return;
              }
              createMutation.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="coach-class-name">新班级</Label>
              <Input
                id="coach-class-name"
                value={className}
                onChange={(event) => setClassName(event.target.value)}
                placeholder="CSP-J 春季班"
                maxLength={100}
              />
            </div>
            <Button type="submit" loading={createMutation.isPending}>
              <Plus />
              创建班级
            </Button>
          </form>
        </CardContent>
      </Card>

      {classesQuery.isError ? (
        <Card variant="flat" className="border-destructive/50 bg-card">
          <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-destructive font-medium">班级列表读取失败</div>
              <div className="text-muted-foreground mt-1 text-sm">请重试当前 coach class API。</div>
            </div>
            <Button type="button" variant="secondary" onClick={() => void classesQuery.refetch()}>
              <RotateCcw />
              重试
            </Button>
          </CardContent>
        </Card>
      ) : classes.length === 0 ? (
        <div className="border-border bg-subtle/10 grid min-h-64 place-items-center rounded-[var(--radius-lg)] border border-dashed p-8 text-center">
          <div className="space-y-3">
            <Clipboard className="text-muted-foreground mx-auto h-8 w-8" />
            <div className="text-foreground font-medium">还没有班级</div>
            <div className="text-muted-foreground text-sm">
              创建第一个班级后，可以分发班级码并布置固定预制卷任务。
            </div>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {classes.map((klass) => (
            <ClassCard
              key={klass.id}
              klass={klass}
              pending={
                rotateMutation.isPending || archiveMutation.isPending || createMutation.isPending
              }
              onRotate={(target) => rotateMutation.mutate(target.id)}
              onArchive={(target) => {
                if (window.confirm(`确认归档「${target.name}」？归档后不能再加入新学生。`)) {
                  archiveMutation.mutate(target.id);
                }
              }}
            />
          ))}
        </div>
      )}

      <Card variant="flat" className="border-border bg-card">
        <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <ShieldCheck className="text-primary mt-0.5 h-5 w-5" />
            <div>
              <div className="text-foreground font-medium">班级任务与报告共用同一权限边界</div>
              <div className="text-muted-foreground mt-1 text-sm">
                只有参与该班级的 coach/admin 能读取成员、assignment 和报告聚合。
              </div>
            </div>
          </div>
          <Button asChild variant="secondary">
            <Link to="/coach/assignments">
              任务管理
              <ArrowRight />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
