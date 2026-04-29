import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { toast } from "sonner";
import {
  ArrowLeft,
  BarChart3,
  CalendarClock,
  Clipboard,
  Copy,
  Crown,
  Link2,
  LogIn,
  MailPlus,
  Pencil,
  RefreshCcw,
  Save,
  ShieldCheck,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchAuthSession } from "@/lib/auth";
import {
  addCoachClassCoach,
  countActiveCoachClassInvites,
  createCoachClassInvite,
  fetchCoachClass,
  fetchCoachClassCoaches,
  fetchCoachClassInvites,
  fetchCoachClassMembers,
  formatCoachClassInviteStatusLabel,
  formatCoachClassRoleLabel,
  getCoachClassInviteStatus,
  removeCoachClassCoach,
  removeCoachClassMember,
  revokeCoachClassInvite,
  transferCoachClassOwner,
  updateCoachClass,
  type CoachClassCoach,
  type CoachClassInvite,
  type CoachClassMember,
} from "@/lib/coach";

const DEFAULT_INVITE_DAYS = 7;
const DEFAULT_INVITE_MAX_USES = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "暂无";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toDatetimeLocalValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function getDefaultInviteExpiry() {
  return toDatetimeLocalValue(new Date(Date.now() + DEFAULT_INVITE_DAYS * DAY_MS));
}

function toAbsoluteJoinUrl(invite: Pick<CoachClassInvite, "joinUrl">) {
  if (!invite.joinUrl) {
    return null;
  }

  try {
    return new URL(invite.joinUrl, window.location.origin).toString();
  } catch {
    return invite.joinUrl;
  }
}

async function copyText(value: string, successMessage: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(successMessage);
  } catch {
    toast.error("复制失败，请手动选择内容");
  }
}

function DetailMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border-border bg-card/80 rounded-[var(--radius-md)] border p-3">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="text-foreground mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function InlineState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="border-border bg-subtle/10 grid min-h-44 place-items-center rounded-[var(--radius-lg)] border border-dashed p-6 text-center">
      <div className="space-y-3">
        <Icon className="text-muted-foreground mx-auto h-8 w-8" />
        <div className="text-foreground font-medium">{title}</div>
        <div className="text-muted-foreground mx-auto max-w-xl text-sm leading-6">
          {description}
        </div>
        {action}
      </div>
    </div>
  );
}

function DetailAccessPrompt({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: "login" | "classes";
}) {
  return (
    <div className="grid min-h-[55vh] place-items-center">
      <div className="border-border bg-card max-w-xl rounded-[var(--radius-lg)] border p-8 text-center">
        <ShieldCheck className="text-muted-foreground mx-auto h-9 w-9" />
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
        {action === "classes" ? (
          <Button asChild className="mt-5" variant="secondary">
            <Link to="/coach/classes">
              <ArrowLeft />
              返回班级
            </Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function LoadingClassDetail() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-48 w-full" />
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    </div>
  );
}

function MemberRow({
  member,
  canManage,
  pending,
  onRemove,
}: {
  member: CoachClassMember;
  canManage: boolean;
  pending: boolean;
  onRemove: (member: CoachClassMember) => void;
}) {
  return (
    <div className="border-border grid gap-4 border-b py-4 last:border-b-0 md:grid-cols-[1fr_120px_150px_auto] md:items-center">
      <div className="min-w-0">
        <div className="text-foreground truncate font-medium">{member.displayName}</div>
        <div className="text-muted-foreground mt-1 truncate text-xs">@{member.username}</div>
      </div>
      <Badge variant={member.role === "student" ? "secondary" : "outline"}>{member.role}</Badge>
      <div className="text-muted-foreground text-sm">{formatDateTime(member.joinedAt)}</div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={!canManage || pending}
        onClick={() => onRemove(member)}
      >
        <UserMinus />
        移出
      </Button>
    </div>
  );
}

function InviteRow({
  invite,
  canManage,
  pending,
  onRevoke,
}: {
  invite: CoachClassInvite;
  canManage: boolean;
  pending: boolean;
  onRevoke: (invite: CoachClassInvite) => void;
}) {
  const status = getCoachClassInviteStatus(invite);
  const statusVariant = status === "active" ? "saved" : status === "revoked" ? "outline" : "tle";

  return (
    <div className="border-border grid gap-4 border-b py-4 last:border-b-0 md:grid-cols-[1fr_130px_120px_auto] md:items-center">
      <div className="min-w-0">
        <div className="text-foreground font-medium">邀请链接</div>
        <div className="text-muted-foreground mt-1 text-xs">
          创建于 {formatDateTime(invite.createdAt)}
        </div>
      </div>
      <Badge variant={statusVariant}>{formatCoachClassInviteStatusLabel(status)}</Badge>
      <div className="text-muted-foreground text-sm tabular-nums">
        {invite.useCount}/{invite.maxUses}
      </div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={!canManage || status === "revoked" || pending}
        onClick={() => onRevoke(invite)}
      >
        <Trash2 />
        撤销
      </Button>
      <div className="text-muted-foreground text-sm md:col-span-4">
        过期时间：{formatDateTime(invite.expiresAt)}
      </div>
    </div>
  );
}

function CoachRow({
  coach,
  canManage,
  pending,
  onRemove,
  onTransfer,
}: {
  coach: CoachClassCoach;
  canManage: boolean;
  pending: boolean;
  onRemove: (coach: CoachClassCoach) => void;
  onTransfer: (coach: CoachClassCoach) => void;
}) {
  const isOwner = coach.coachRole === "owner";

  return (
    <div className="border-border grid gap-4 border-b py-4 last:border-b-0 md:grid-cols-[1fr_140px_180px_auto] md:items-center">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          {isOwner ? <Crown className="text-primary h-4 w-4 shrink-0" /> : null}
          <div className="text-foreground truncate font-medium">{coach.displayName}</div>
        </div>
        <div className="text-muted-foreground mt-1 truncate text-xs">@{coach.username}</div>
      </div>
      <Badge variant={isOwner ? "saved" : "secondary"}>{coach.coachRole}</Badge>
      <div className="text-muted-foreground text-sm">{formatDateTime(coach.addedAt)}</div>
      <div className="flex flex-wrap justify-start gap-2 md:justify-end">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={!canManage || isOwner || pending}
          onClick={() => onTransfer(coach)}
        >
          <Crown />
          转为 owner
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={!canManage || isOwner || pending}
          onClick={() => onRemove(coach)}
        >
          <UserMinus />
          移除
        </Button>
      </div>
    </div>
  );
}

export default function CoachClassDetail() {
  const { id: classId } = useParams();
  const queryClient = useQueryClient();
  const [nameDraft, setNameDraft] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [inviteExpiresAt, setInviteExpiresAt] = useState(getDefaultInviteExpiry);
  const [inviteMaxUses, setInviteMaxUses] = useState(String(DEFAULT_INVITE_MAX_USES));
  const [coachUserId, setCoachUserId] = useState("");
  const [lastCreatedInvite, setLastCreatedInvite] = useState<CoachClassInvite | null>(null);

  const sessionQuery = useQuery({
    queryKey: ["auth-session"],
    queryFn: fetchAuthSession,
    retry: false,
    staleTime: 60_000,
  });
  const session = sessionQuery.data;
  const canAccessCoach =
    session?.authenticated === true &&
    (session.user.role === "coach" || session.user.role === "admin");

  const classQuery = useQuery({
    queryKey: ["coach-class", classId],
    queryFn: () => fetchCoachClass(classId!),
    enabled: Boolean(classId) && canAccessCoach,
  });
  const klass = classQuery.data;
  const canViewInvites = klass?.coachRole === "owner";
  const canManage = Boolean(canViewInvites && !klass?.archivedAt);

  const membersQuery = useQuery({
    queryKey: ["coach-class-members", classId],
    queryFn: () => fetchCoachClassMembers(classId!),
    enabled: Boolean(classId) && canAccessCoach,
  });
  const coachesQuery = useQuery({
    queryKey: ["coach-class-coaches", classId],
    queryFn: () => fetchCoachClassCoaches(classId!),
    enabled: Boolean(classId) && canAccessCoach,
  });
  const invitesQuery = useQuery({
    queryKey: ["coach-class-invites", classId],
    queryFn: () => fetchCoachClassInvites(classId!),
    enabled: Boolean(classId) && canViewInvites,
  });

  const members = membersQuery.data?.items ?? [];
  const coaches = coachesQuery.data?.items ?? [];
  const invites = invitesQuery.data?.items ?? [];
  const activeInviteCount = countActiveCoachClassInvites(invites);
  const latestInviteUrl = lastCreatedInvite ? toAbsoluteJoinUrl(lastCreatedInvite) : null;

  useEffect(() => {
    if (klass?.name) {
      setNameDraft(klass.name);
    }
  }, [klass?.name]);

  async function invalidateClassDetail() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["coach-class", classId] }),
      queryClient.invalidateQueries({ queryKey: ["coach-classes"] }),
      queryClient.invalidateQueries({ queryKey: ["coach-class-members", classId] }),
      queryClient.invalidateQueries({ queryKey: ["coach-class-invites", classId] }),
      queryClient.invalidateQueries({ queryKey: ["coach-class-coaches", classId] }),
    ]);
  }

  const updateNameMutation = useMutation({
    mutationFn: () => updateCoachClass(classId!, { name: nameDraft.trim() }),
    onSuccess: async () => {
      setEditingName(false);
      toast.success("班级名称已更新");
      await invalidateClassDetail();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "更新班级名称失败");
    },
  });

  const createInviteMutation = useMutation({
    mutationFn: () => {
      const expiresAt = new Date(inviteExpiresAt);
      const maxUses = Number(inviteMaxUses);
      if (!inviteExpiresAt || Number.isNaN(expiresAt.getTime())) {
        throw new Error("请选择有效的过期时间");
      }
      if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 10_000) {
        throw new Error("最大使用次数需要在 1 到 10000 之间");
      }
      return createCoachClassInvite({
        classId: classId!,
        expiresAt: expiresAt.toISOString(),
        maxUses,
      });
    },
    onSuccess: async (invite) => {
      setLastCreatedInvite(invite);
      setInviteExpiresAt(getDefaultInviteExpiry());
      setInviteMaxUses(String(DEFAULT_INVITE_MAX_USES));
      toast.success("邀请链接已创建");
      await invalidateClassDetail();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "创建邀请链接失败");
    },
  });

  const revokeInviteMutation = useMutation({
    mutationFn: (inviteId: string) => revokeCoachClassInvite(classId!, inviteId),
    onSuccess: async () => {
      toast.success("邀请链接已撤销");
      await invalidateClassDetail();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "撤销邀请链接失败");
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) => removeCoachClassMember(classId!, userId),
    onSuccess: async () => {
      toast.success("成员已移出");
      await invalidateClassDetail();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "移出成员失败");
    },
  });

  const addCoachMutation = useMutation({
    mutationFn: () => addCoachClassCoach({ classId: classId!, userId: coachUserId.trim() }),
    onSuccess: async () => {
      setCoachUserId("");
      toast.success("协作教练已添加");
      await invalidateClassDetail();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "添加协作教练失败");
    },
  });

  const removeCoachMutation = useMutation({
    mutationFn: (userId: string) => removeCoachClassCoach(classId!, userId),
    onSuccess: async () => {
      toast.success("协作教练已移除");
      await invalidateClassDetail();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "移除协作教练失败");
    },
  });

  const transferOwnerMutation = useMutation({
    mutationFn: (userId: string) => transferCoachClassOwner(classId!, userId),
    onSuccess: async () => {
      toast.success("班级 owner 已转移");
      await invalidateClassDetail();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "转移 owner 失败");
    },
  });

  if (!classId) {
    return (
      <DetailAccessPrompt
        title="缺少班级 ID"
        description="当前路径没有可读取的班级参数。"
        action="classes"
      />
    );
  }

  if (sessionQuery.isPending || (canAccessCoach && classQuery.isPending)) {
    return <LoadingClassDetail />;
  }

  if (session?.authenticated === false) {
    return (
      <DetailAccessPrompt
        title="登录后管理班级"
        description="班级成员、邀请链接和教练组管理都需要受保护的 coach 会话。"
        action="login"
      />
    );
  }

  if (session?.authenticated === true && !canAccessCoach) {
    return (
      <DetailAccessPrompt
        title="当前账号没有教练权限"
        description="只有 coach 或 admin 可以进入班级深层管理。"
        action="classes"
      />
    );
  }

  if (classQuery.isError || !klass) {
    return (
      <DetailAccessPrompt
        title="班级不可用"
        description="班级不存在，或当前账号没有访问该班级的权限。"
        action="classes"
      />
    );
  }

  return (
    <div className="space-y-6" data-testid="coach-class-detail-page">
      <Card variant="hero" className="overflow-hidden">
        <CardHeader className="gap-5 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
              <Link to="/coach/classes">
                <ArrowLeft />
                班级列表
              </Link>
            </Button>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={klass.archivedAt ? "outline" : "saved"}>
                {klass.archivedAt ? "archived" : "active"}
              </Badge>
              <Badge variant={klass.coachRole === "owner" ? "saved" : "secondary"}>
                {formatCoachClassRoleLabel(klass.coachRole)}
              </Badge>
            </div>
            <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center">
              {editingName ? (
                <div className="flex w-full max-w-xl flex-col gap-2 sm:flex-row">
                  <Input
                    value={nameDraft}
                    onChange={(event) => setNameDraft(event.target.value)}
                    maxLength={100}
                    aria-label="班级名称"
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      loading={updateNameMutation.isPending}
                      onClick={() => {
                        if (!nameDraft.trim()) {
                          toast.error("请输入班级名称");
                          return;
                        }
                        updateNameMutation.mutate();
                      }}
                    >
                      <Save />
                      保存
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setNameDraft(klass.name);
                        setEditingName(false);
                      }}
                    >
                      <X />
                      取消
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <CardTitle className="text-2xl">{klass.name}</CardTitle>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={!canManage}
                    onClick={() => setEditingName(true)}
                  >
                    <Pencil />
                    编辑
                  </Button>
                </>
              )}
            </div>
            <CardDescription className="mt-2 max-w-2xl">
              成员、邀请链接与教练组在同一权限边界内管理；生产答题数据继续由 assignment-only
              报告读取。
            </CardDescription>
          </div>
          <div className="grid min-w-72 grid-cols-3 gap-3">
            <DetailMetric label="学生" value={members.length} />
            <DetailMetric label="教练" value={coaches.length} />
            <DetailMetric label="邀请" value={activeInviteCount} />
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card variant="flat" className="border-border bg-card">
          <CardContent className="p-5">
            <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <div className="text-muted-foreground text-xs">班级码</div>
                <code className="text-foreground mt-1 block font-mono text-2xl tracking-[0.2em]">
                  {klass.joinCode}
                </code>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => copyText(klass.joinCode, "班级码已复制")}
                >
                  <Copy />
                  复制班级码
                </Button>
                <Button asChild>
                  <Link to={`/coach/report?classId=${encodeURIComponent(klass.id)}`}>
                    <BarChart3 />
                    报告
                  </Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card variant="flat" className="border-border bg-card">
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <CalendarClock className="text-primary mt-0.5 h-5 w-5" />
              <div>
                <div className="text-foreground font-medium">更新记录</div>
                <div className="text-muted-foreground mt-1 text-sm">
                  创建：{formatDateTime(klass.createdAt)}
                </div>
                <div className="text-muted-foreground mt-1 text-sm">
                  更新：{formatDateTime(klass.updatedAt)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="members">
        <TabsList className="flex w-full overflow-x-auto">
          <TabsTrigger value="members">成员</TabsTrigger>
          <TabsTrigger value="invites">邀请</TabsTrigger>
          <TabsTrigger value="coaches">教练组</TabsTrigger>
        </TabsList>

        <TabsContent value="members">
          <Card variant="flat" className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-xl">成员</CardTitle>
              <CardDescription>当前班级学生成员，owner 可以移出错误加入的成员。</CardDescription>
            </CardHeader>
            <CardContent>
              {membersQuery.isPending ? (
                <div className="space-y-3">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : membersQuery.isError ? (
                <InlineState
                  icon={RefreshCcw}
                  title="成员读取失败"
                  description="当前 members API 没有返回可用数据。"
                  action={
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => void membersQuery.refetch()}
                    >
                      <RefreshCcw />
                      重试
                    </Button>
                  }
                />
              ) : members.length === 0 ? (
                <InlineState
                  icon={Users}
                  title="暂无学生成员"
                  description="发放班级码或邀请链接后，学生会出现在这里。"
                />
              ) : (
                <div>
                  {members.map((member) => (
                    <MemberRow
                      key={member.userId}
                      member={member}
                      canManage={Boolean(canManage)}
                      pending={removeMemberMutation.isPending}
                      onRemove={(target) => {
                        if (window.confirm(`确认移出「${target.displayName}」？`)) {
                          removeMemberMutation.mutate(target.userId);
                        }
                      }}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invites">
          <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
            <Card variant="flat" className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-xl">新邀请链接</CardTitle>
                <CardDescription>邀请 token 只在创建后展示一次。</CardDescription>
              </CardHeader>
              <CardContent>
                {canManage ? (
                  <form
                    className="space-y-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      createInviteMutation.mutate();
                    }}
                  >
                    <div className="space-y-2">
                      <Label htmlFor="invite-expires-at">过期时间</Label>
                      <Input
                        id="invite-expires-at"
                        type="datetime-local"
                        value={inviteExpiresAt}
                        onChange={(event) => setInviteExpiresAt(event.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="invite-max-uses">最大使用次数</Label>
                      <Input
                        id="invite-max-uses"
                        type="number"
                        min={1}
                        max={10_000}
                        step={1}
                        value={inviteMaxUses}
                        onChange={(event) => setInviteMaxUses(event.target.value)}
                      />
                    </div>
                    <Button type="submit" loading={createInviteMutation.isPending}>
                      <MailPlus />
                      创建邀请
                    </Button>
                    {latestInviteUrl ? (
                      <div className="border-border bg-subtle/15 rounded-[var(--radius-md)] border p-3">
                        <div className="text-muted-foreground text-xs">最新邀请链接</div>
                        <div className="text-foreground mt-2 font-mono text-sm break-all">
                          {latestInviteUrl}
                        </div>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="mt-3"
                          onClick={() => copyText(latestInviteUrl, "邀请链接已复制")}
                        >
                          <Copy />
                          复制链接
                        </Button>
                      </div>
                    ) : null}
                  </form>
                ) : (
                  <InlineState
                    icon={Link2}
                    title="不能创建邀请"
                    description="只有未归档班级的 owner 可以创建新邀请链接。"
                  />
                )}
              </CardContent>
            </Card>

            <Card variant="flat" className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-xl">邀请历史</CardTitle>
                <CardDescription>
                  列表不回显 token，已创建链接请在创建成功后复制保存。
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!canViewInvites ? (
                  <InlineState
                    icon={ShieldCheck}
                    title="邀请历史受 owner 权限保护"
                    description="当前账号不是班级 owner，invite API 不会被调用。"
                  />
                ) : invitesQuery.isPending ? (
                  <div className="space-y-3">
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-20 w-full" />
                  </div>
                ) : invitesQuery.isError ? (
                  <InlineState
                    icon={RefreshCcw}
                    title="邀请历史读取失败"
                    description="当前 invites API 没有返回可用数据。"
                    action={
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => void invitesQuery.refetch()}
                      >
                        <RefreshCcw />
                        重试
                      </Button>
                    }
                  />
                ) : invites.length === 0 ? (
                  <InlineState
                    icon={Clipboard}
                    title="暂无邀请链接"
                    description="创建邀请后会在这里看到生命周期与使用次数。"
                  />
                ) : (
                  <div>
                    {invites.map((invite) => (
                      <InviteRow
                        key={invite.id}
                        invite={invite}
                        canManage={Boolean(canManage)}
                        pending={revokeInviteMutation.isPending}
                        onRevoke={(target) => {
                          if (window.confirm("确认撤销这条邀请链接？")) {
                            revokeInviteMutation.mutate(target.id);
                          }
                        }}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="coaches">
          <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
            <Card variant="flat" className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-xl">添加协作教练</CardTitle>
                <CardDescription>目标用户必须是 active coach/admin。</CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  className="space-y-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!coachUserId.trim()) {
                      toast.error("请输入用户 ID");
                      return;
                    }
                    addCoachMutation.mutate();
                  }}
                >
                  <div className="space-y-2">
                    <Label htmlFor="coach-user-id">用户 ID</Label>
                    <Input
                      id="coach-user-id"
                      value={coachUserId}
                      onChange={(event) => setCoachUserId(event.target.value)}
                      disabled={!canManage}
                    />
                  </div>
                  <Button type="submit" loading={addCoachMutation.isPending} disabled={!canManage}>
                    <UserPlus />
                    添加教练
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card variant="flat" className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-xl">教练组</CardTitle>
                <CardDescription>班级至少保留一位 owner；owner 可转移给协作教练。</CardDescription>
              </CardHeader>
              <CardContent>
                {coachesQuery.isPending ? (
                  <div className="space-y-3">
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-20 w-full" />
                  </div>
                ) : coachesQuery.isError ? (
                  <InlineState
                    icon={RefreshCcw}
                    title="教练组读取失败"
                    description="当前 coaches API 没有返回可用数据。"
                    action={
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => void coachesQuery.refetch()}
                      >
                        <RefreshCcw />
                        重试
                      </Button>
                    }
                  />
                ) : coaches.length === 0 ? (
                  <InlineState
                    icon={Users}
                    title="暂无教练记录"
                    description="该状态通常意味着后端数据需要修复，因为班级应至少有一位 owner。"
                  />
                ) : (
                  <div>
                    {coaches.map((coach) => (
                      <CoachRow
                        key={coach.userId}
                        coach={coach}
                        canManage={Boolean(canManage)}
                        pending={removeCoachMutation.isPending || transferOwnerMutation.isPending}
                        onRemove={(target) => {
                          if (window.confirm(`确认移除「${target.displayName}」？`)) {
                            removeCoachMutation.mutate(target.userId);
                          }
                        }}
                        onTransfer={(target) => {
                          if (window.confirm(`确认将 owner 转移给「${target.displayName}」？`)) {
                            transferOwnerMutation.mutate(target.userId);
                          }
                        }}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
