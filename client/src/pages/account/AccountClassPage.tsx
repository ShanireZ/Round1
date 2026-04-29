import { type FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
import {
  ArrowRight,
  BookOpenCheck,
  ClipboardCheck,
  LogIn,
  Plus,
  RotateCcw,
  ShieldCheck,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatAccountDate,
  fetchMyClasses,
  joinClass,
  normalizeClassJoinCode,
  summarizeStudentClasses,
  type StudentClassSummary,
} from "@/lib/account";
import { fetchAuthSession } from "@/lib/auth";

type AccountClassPageProps = {
  focusJoin?: boolean;
};

function LoadingAccountClasses() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-44 w-full" />
      <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    </div>
  );
}

function LoginRequired({ focusJoin }: { focusJoin: boolean }) {
  const returnTo = focusJoin ? "/join" : "/account/class";

  return (
    <div className="grid min-h-[55vh] place-items-center">
      <Card variant="flat" className="max-w-xl text-center">
        <CardContent className="space-y-5 p-3">
          <LogIn className="text-primary mx-auto h-9 w-9" />
          <div>
            <h1 className="text-foreground text-2xl font-semibold">登录后加入班级</h1>
            <p className="text-muted-foreground mt-3 text-sm leading-6">
              班级码、邀请链接和 assignment 进度都绑定到你的 Round1 账号。
            </p>
          </div>
          <Button asChild>
            <Link to={`/login?returnTo=${encodeURIComponent(returnTo)}`}>
              登录
              <ArrowRight />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function ClassJoinPanel({
  initialJoinCode,
  initialInviteToken,
  focusJoin,
}: {
  initialJoinCode: string;
  initialInviteToken: string;
  focusJoin: boolean;
}) {
  const queryClient = useQueryClient();
  const [joinCode, setJoinCode] = useState(normalizeClassJoinCode(initialJoinCode));
  const [inviteToken, setInviteToken] = useState(initialInviteToken);

  const joinMutation = useMutation({
    mutationFn: () => {
      const normalizedCode = normalizeClassJoinCode(joinCode);
      if (inviteToken.trim()) {
        return joinClass({ inviteToken: inviteToken.trim() });
      }
      return joinClass({ code: normalizedCode });
    },
    onSuccess: async () => {
      setJoinCode("");
      setInviteToken("");
      toast.success("已加入班级");
      await queryClient.invalidateQueries({ queryKey: ["my-classes"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "加入班级失败");
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const hasInvite = inviteToken.trim().length > 0;
    const normalizedCode = normalizeClassJoinCode(joinCode);

    if (!hasInvite && normalizedCode.length === 0) {
      toast.error("请输入班级码或使用邀请链接");
      return;
    }

    joinMutation.mutate();
  }

  return (
    <Card variant={focusJoin ? "hero" : "flat"} className="border-border bg-card">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Badge variant="outline">Join Class</Badge>
            <CardTitle className="mt-3 text-xl">加入班级</CardTitle>
          </div>
          <Users className="text-primary h-5 w-5" />
        </div>
        <CardDescription className="max-w-xl">
          输入教练提供的班级码，或打开邀请链接后直接确认加入。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="class-code">班级码</Label>
            <Input
              id="class-code"
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value)}
              placeholder="AB12CD"
              maxLength={20}
              autoComplete="off"
              className="font-mono"
              disabled={inviteToken.trim().length > 0}
            />
          </div>

          {inviteToken.trim() ? (
            <div className="border-border bg-subtle/20 rounded-[var(--radius-md)] border p-3">
              <div className="text-foreground text-sm font-medium">已检测到邀请链接</div>
              <div className="text-muted-foreground mt-1 font-mono text-xs break-all">
                {inviteToken}
              </div>
              <Button
                type="button"
                variant="link"
                className="mt-2 h-auto px-0"
                onClick={() => setInviteToken("")}
              >
                改用班级码
              </Button>
            </div>
          ) : null}

          <Button
            type="submit"
            className="w-full"
            loading={joinMutation.isPending}
            disabled={joinMutation.isPending}
          >
            <Plus />
            加入班级
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function ClassCard({ klass }: { klass: StudentClassSummary }) {
  const archived = Boolean(klass.archivedAt);

  return (
    <Card variant="flat" className="border-border bg-card">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="truncate text-xl">{klass.name}</CardTitle>
            <CardDescription className="mt-1">
              加入于 {formatAccountDate(klass.joinedAt)}
            </CardDescription>
          </div>
          <Badge variant={archived ? "outline" : "saved"}>
            {archived ? "archived" : klass.joinedVia}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-3 gap-3">
          <div className="border-border bg-subtle/15 rounded-[var(--radius-md)] border p-3">
            <div className="text-muted-foreground text-xs">待完成</div>
            <div className="text-foreground mt-1 text-2xl font-semibold tabular-nums">
              {klass.openAssignments}
            </div>
          </div>
          <div className="border-border bg-subtle/15 rounded-[var(--radius-md)] border p-3">
            <div className="text-muted-foreground text-xs">已完成</div>
            <div className="text-foreground mt-1 text-2xl font-semibold tabular-nums">
              {klass.completedAssignments}
            </div>
          </div>
          <div className="border-border bg-subtle/15 rounded-[var(--radius-md)] border p-3">
            <div className="text-muted-foreground text-xs">错过</div>
            <div className="text-foreground mt-1 text-2xl font-semibold tabular-nums">
              {klass.missedAssignments}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="primary">
            <Link to="/exams/new">
              开始模拟
              <ArrowRight />
            </Link>
          </Button>
          <Button asChild size="sm" variant="secondary">
            <Link to="/dashboard">
              查看训练概览
              <BookOpenCheck />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AccountClassPage({ focusJoin = false }: AccountClassPageProps) {
  const [searchParams] = useSearchParams();
  const initialJoinCode = searchParams.get("code") ?? "";
  const inviteToken = searchParams.get("invite") ?? searchParams.get("inviteToken") ?? "";

  const sessionQuery = useQuery({
    queryKey: ["auth-session"],
    queryFn: fetchAuthSession,
    retry: false,
    staleTime: 60_000,
  });
  const session = sessionQuery.data;

  const classesQuery = useQuery({
    queryKey: ["my-classes"],
    queryFn: fetchMyClasses,
    enabled: session?.authenticated === true,
  });
  const classes = useMemo(() => classesQuery.data?.items ?? [], [classesQuery.data]);
  const summary = summarizeStudentClasses(classes);

  if (sessionQuery.isPending || (session?.authenticated === true && classesQuery.isPending)) {
    return <LoadingAccountClasses />;
  }

  if (sessionQuery.isError || session?.authenticated !== true) {
    return <LoginRequired focusJoin={focusJoin} />;
  }

  return (
    <div className="space-y-6" data-testid="account-class-page">
      <Card variant="hero" className="overflow-hidden">
        <CardHeader className="gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <Badge variant="outline">{focusJoin ? "Class Invite" : "My Classes"}</Badge>
            <CardTitle className="mt-3 text-2xl">我的班级</CardTitle>
            <CardDescription className="mt-2 max-w-2xl">
              班级入口展示你已加入的训练组、待完成任务和加入状态；教练视图继续从 Coach 工作台管理。
            </CardDescription>
          </div>
          <div className="grid w-full grid-cols-3 gap-3 md:min-w-72">
            <div className="border-border bg-card/80 rounded-[var(--radius-md)] border p-3">
              <div className="text-muted-foreground text-xs">班级</div>
              <div className="text-foreground mt-1 text-2xl font-semibold tabular-nums">
                {summary.activeClasses}
              </div>
            </div>
            <div className="border-border bg-card/80 rounded-[var(--radius-md)] border p-3">
              <div className="text-muted-foreground text-xs">待完成</div>
              <div className="text-foreground mt-1 text-2xl font-semibold tabular-nums">
                {summary.openAssignments}
              </div>
            </div>
            <div className="border-border bg-card/80 rounded-[var(--radius-md)] border p-3">
              <div className="text-muted-foreground text-xs">已完成</div>
              <div className="text-foreground mt-1 text-2xl font-semibold tabular-nums">
                {summary.completedAssignments}
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(320px,0.75fr)_minmax(0,1.25fr)]">
        <div className="space-y-4">
          <ClassJoinPanel
            initialJoinCode={initialJoinCode}
            initialInviteToken={inviteToken}
            focusJoin={focusJoin}
          />

          {session?.authenticated === true && session.user.role !== "student" ? (
            <Card variant="flat" className="border-border bg-card">
              <CardContent className="flex items-start gap-3 p-1">
                <ShieldCheck className="text-primary mt-0.5 h-5 w-5" />
                <div className="min-w-0">
                  <div className="text-foreground font-medium">教练入口已分离</div>
                  <p className="text-muted-foreground mt-1 text-sm leading-6">
                    创建班级、轮换班级码和查看班级报告请继续使用 Coach 工作台。
                  </p>
                  <Button asChild variant="link" className="mt-2 h-auto px-0">
                    <Link to="/coach/classes">
                      进入 Coach 班级
                      <ArrowRight />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          {classesQuery.isError ? (
            <Card variant="flat" className="border-destructive/50 bg-card">
              <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-destructive font-medium">班级列表读取失败</div>
                  <p className="text-muted-foreground mt-1 text-sm">
                    当前会话可用时可以重试我的班级 API。
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void classesQuery.refetch()}
                >
                  <RotateCcw />
                  重试
                </Button>
              </CardContent>
            </Card>
          ) : classes.length === 0 ? (
            <div className="border-border bg-subtle/10 grid min-h-72 place-items-center rounded-[var(--radius-lg)] border border-dashed p-8 text-center">
              <div className="space-y-3">
                <ClipboardCheck className="text-muted-foreground mx-auto h-8 w-8" />
                <div className="text-foreground font-medium">还没有加入任何班级</div>
                <p className="text-muted-foreground mx-auto max-w-md text-sm leading-6">
                  加入班级后，这里会展示 assignment 进度和来自教练的固定预制卷任务。
                </p>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {classes.map((klass) => (
                <ClassCard key={klass.classId} klass={klass} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
