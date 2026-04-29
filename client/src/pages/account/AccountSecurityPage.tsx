import { type FormEvent, useMemo, useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router";
import {
  ArrowRight,
  CheckCircle2,
  Fingerprint,
  KeyRound,
  Link2,
  LockKeyhole,
  LogIn,
  LogOut,
  Mail,
  RotateCcw,
  ShieldCheck,
  ShieldQuestion,
  Smartphone,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  changePassword,
  confirmEmailChange,
  deleteTotpEnrollment,
  deletePasskeyCredential,
  fetchAccountSecuritySummary,
  fetchPasskeyRegistrationOptions,
  formatAccountDate,
  requestEmailChange,
  startTotpEnrollment,
  verifyPasskeyRegistration,
  verifyEmailChangeCode,
  verifyTotpEnrollment,
} from "@/lib/account";
import { fetchAuthSession, logout } from "@/lib/auth";
import { fetchClientRuntimeConfig } from "@/lib/client-config";

function LoadingAccountSecurity() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-44 w-full" />
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-36 w-full" />
      </div>
      <Skeleton className="h-96 w-full" />
    </div>
  );
}

function startCppLearnBind() {
  window.location.assign("/api/v1/auth/oidc/cpplearn/start?intent=bind");
}

function securitySignals(summary: Awaited<ReturnType<typeof fetchAccountSecuritySummary>>) {
  return [
    summary.passwordEnabled,
    Boolean(summary.email?.verifiedAt),
    Boolean(summary.totpEnabledAt),
    summary.passkeys.length > 0,
    summary.externalIdentities.length > 0,
  ];
}

function formatAccountRoleLabel(role: string) {
  if (role === "student") return "学生";
  if (role === "coach") return "教练";
  if (role === "admin") return "管理员";
  return role;
}

function formatExternalProviderLabel(provider: string) {
  if (provider === "cpplearn") return "CppLearn";
  if (provider === "qq") return "QQ 互联";
  return provider;
}

function formatPasskeyError(error: unknown, fallback: string) {
  if (error instanceof Error) {
    if (error.name === "NotAllowedError") {
      return "Passkey 操作已取消或超时。";
    }

    if (error.name === "InvalidStateError") {
      return "这个设备上可能已经绑定过同一个 Passkey。";
    }

    return error.message;
  }

  return fallback;
}

function LoginRequired() {
  return (
    <div className="grid min-h-[55vh] place-items-center">
      <Card variant="flat" className="max-w-xl text-center">
        <CardContent className="space-y-5 p-3">
          <LogIn className="text-primary mx-auto h-9 w-9" />
          <div>
            <h1 className="text-foreground text-2xl font-semibold">登录后管理账号安全</h1>
            <p className="text-muted-foreground mt-3 text-sm leading-6">
              密码、邮箱、TOTP 和外部身份绑定都需要受保护的 Round1 会话。
            </p>
          </div>
          <Button asChild>
            <Link to={`/login?returnTo=${encodeURIComponent("/account/security")}`}>
              登录
              <ArrowRight />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function PasswordPanel() {
  const queryClient = useQueryClient();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const mutation = useMutation({
    mutationFn: () => changePassword({ currentPassword, newPassword }),
    onSuccess: async () => {
      setCurrentPassword("");
      setNewPassword("");
      toast.success("密码已更新");
      await queryClient.invalidateQueries({ queryKey: ["account-security"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "密码更新失败");
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <Card variant="flat" className="border-border bg-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <LockKeyhole className="text-primary h-5 w-5" />
          密码
        </CardTitle>
        <CardDescription>修改密码后，其他旧会话会在下次校验时失效。</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end"
          onSubmit={handleSubmit}
        >
          <div className="space-y-2">
            <Label htmlFor="current-password">当前密码</Label>
            <Input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">新密码</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
          <Button
            type="submit"
            loading={mutation.isPending}
            disabled={currentPassword.length === 0 || newPassword.length === 0}
          >
            更新密码
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function EmailPanel() {
  const queryClient = useQueryClient();
  const [newEmail, setNewEmail] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [code, setCode] = useState("");

  const requestMutation = useMutation({
    mutationFn: () => requestEmailChange(newEmail.trim()),
    onSuccess: (challenge) => {
      setChallengeId(challenge.challengeId);
      toast.success("验证码已发送");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "验证码发送失败");
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const verified = await verifyEmailChangeCode(challengeId, code.trim());
      return confirmEmailChange(verified.ticket);
    },
    onSuccess: async () => {
      setNewEmail("");
      setChallengeId("");
      setCode("");
      toast.success("邮箱已更新");
      await queryClient.invalidateQueries({ queryKey: ["account-security"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "邮箱更新失败");
    },
  });

  function requestChallenge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    requestMutation.mutate();
  }

  function confirmChallenge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    confirmMutation.mutate();
  }

  return (
    <Card variant="flat" className="border-border bg-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Mail className="text-primary h-5 w-5" />
          邮箱
        </CardTitle>
        <CardDescription>更换邮箱需要先发送验证码，再用验证码确认本次变更。</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-2">
        <form className="space-y-4" onSubmit={requestChallenge}>
          <div className="space-y-2">
            <Label htmlFor="new-email">新邮箱</Label>
            <Input
              id="new-email"
              type="email"
              value={newEmail}
              onChange={(event) => setNewEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </div>
          <Button
            type="submit"
            variant="secondary"
            loading={requestMutation.isPending}
            disabled={newEmail.trim().length === 0}
          >
            发送验证码
          </Button>
        </form>

        <form className="space-y-4" onSubmit={confirmChallenge}>
          <div className="space-y-2">
            <Label htmlFor="email-code">验证码</Label>
            <Input
              id="email-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              inputMode="numeric"
              maxLength={6}
              disabled={!challengeId}
              required
            />
          </div>
          <Button
            type="submit"
            loading={confirmMutation.isPending}
            disabled={!challengeId || code.trim().length !== 6}
          >
            确认更换
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function TotpPanel({ enabled }: { enabled: boolean }) {
  const queryClient = useQueryClient();
  const [otpauthUrl, setOtpauthUrl] = useState("");
  const [code, setCode] = useState("");
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const startMutation = useMutation({
    mutationFn: startTotpEnrollment,
    onSuccess: (result) => {
      setOtpauthUrl(result.otpauthUrl);
      toast.success("TOTP 密钥已生成");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "TOTP 启用失败");
    },
  });

  const verifyMutation = useMutation({
    mutationFn: () => verifyTotpEnrollment(code.trim()),
    onSuccess: async () => {
      setCode("");
      setOtpauthUrl("");
      toast.success("TOTP 已启用");
      await queryClient.invalidateQueries({ queryKey: ["account-security"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "TOTP 验证失败");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTotpEnrollment,
    onSuccess: async () => {
      setConfirmDeleteOpen(false);
      toast.success("TOTP 已关闭");
      await queryClient.invalidateQueries({ queryKey: ["account-security"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "关闭 TOTP 失败");
    },
  });

  return (
    <>
      <Card variant="flat" className="border-border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Smartphone className="text-primary h-5 w-5" />
            TOTP
          </CardTitle>
          <CardDescription>使用一次性验证码作为敏感操作的二次验证方式。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {enabled ? (
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="saved">已启用</Badge>
                <span className="text-muted-foreground text-sm">当前账号已启用 TOTP。</span>
              </div>
              <Button
                type="button"
                variant="secondary"
                loading={deleteMutation.isPending}
                onClick={() => setConfirmDeleteOpen(true)}
              >
                关闭 TOTP
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <Button
                type="button"
                variant="secondary"
                loading={startMutation.isPending}
                onClick={() => startMutation.mutate()}
              >
                生成 TOTP 密钥
              </Button>

              {otpauthUrl ? (
                <div className="border-border bg-subtle/20 rounded-[var(--radius-md)] border p-3">
                  <div className="text-foreground text-sm font-medium">验证器链接</div>
                  <div className="text-muted-foreground mt-2 font-mono text-xs break-all">
                    {otpauthUrl}
                  </div>
                </div>
              ) : null}

              <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                <div className="space-y-2">
                  <Label htmlFor="totp-code">验证码</Label>
                  <Input
                    id="totp-code"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    inputMode="numeric"
                    maxLength={6}
                    disabled={!otpauthUrl}
                  />
                </div>
                <Button
                  type="button"
                  loading={verifyMutation.isPending}
                  disabled={!otpauthUrl || code.trim().length !== 6}
                  onClick={() => verifyMutation.mutate()}
                >
                  启用 TOTP
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>关闭 TOTP？</DialogTitle>
            <DialogDescription>
              关闭后账号将少一个二次验证方式，该操作需要最近一次强认证仍有效。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setConfirmDeleteOpen(false)}>
              取消
            </Button>
            <Button
              type="button"
              loading={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
            >
              确认关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PasskeyPanel({
  passkeys,
}: {
  passkeys: Awaited<ReturnType<typeof fetchAccountSecuritySummary>>["passkeys"];
}) {
  const queryClient = useQueryClient();
  const [pendingDeletePasskey, setPendingDeletePasskey] = useState<(typeof passkeys)[number] | null>(
    null,
  );

  const registerMutation = useMutation({
    mutationFn: async () => {
      const optionsJSON = await fetchPasskeyRegistrationOptions();
      const credential = await startRegistration({ optionsJSON });
      return verifyPasskeyRegistration(credential);
    },
    onSuccess: async () => {
      toast.success("Passkey 已绑定");
      await queryClient.invalidateQueries({ queryKey: ["account-security"] });
    },
    onError: (error) => {
      toast.error(formatPasskeyError(error, "Passkey 绑定失败"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deletePasskeyCredential,
    onSuccess: async () => {
      setPendingDeletePasskey(null);
      toast.success("Passkey 已移除");
      await queryClient.invalidateQueries({ queryKey: ["account-security"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Passkey 移除失败");
    },
  });

  return (
    <>
      <Card variant="flat" className="border-border bg-card">
        <CardHeader className="gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Fingerprint className="text-primary h-5 w-5" />
              Passkey
            </CardTitle>
            <CardDescription>用设备解锁、系统账户或安全密钥作为免密码凭据。</CardDescription>
          </div>
          <Button
            type="button"
            variant="secondary"
            loading={registerMutation.isPending}
            onClick={() => registerMutation.mutate()}
          >
            绑定 Passkey
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {passkeys.length === 0 ? (
            <div className="border-border bg-subtle/10 rounded-[var(--radius-md)] border border-dashed p-4">
              <div className="text-foreground flex items-center gap-2 text-sm font-medium">
                <KeyRound className="text-muted-foreground h-4 w-4" />
                还没有绑定 Passkey
              </div>
              <p className="text-muted-foreground mt-2 text-sm leading-6">
                绑定后可在登录页使用 Passkey 进入 Round1。
              </p>
            </div>
          ) : (
            passkeys.map((passkey) => (
              <div
                key={passkey.id}
                className="border-border bg-subtle/15 flex flex-col gap-3 rounded-[var(--radius-md)] border p-4 md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0">
                  <div className="text-foreground font-medium">
                    Passkey · {passkey.credentialIdSuffix}
                  </div>
                  <div className="text-muted-foreground mt-1 flex flex-wrap gap-2 text-xs">
                    <span>{formatAccountDate(passkey.createdAt)}</span>
                    <span>{passkey.backupEligible ? "可同步" : "单设备"}</span>
                    <span>{passkey.backupState ? "已备份" : "未备份"}</span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  loading={deleteMutation.isPending && deleteMutation.variables === passkey.id}
                  onClick={() => setPendingDeletePasskey(passkey)}
                >
                  <Trash2 />
                  移除
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(pendingDeletePasskey)}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDeletePasskey(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>移除这个 Passkey？</DialogTitle>
            <DialogDescription>
              移除后将无法再用这个凭据登录。你仍可继续使用密码或其他已绑定方式。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setPendingDeletePasskey(null)}>
              取消
            </Button>
            <Button
              type="button"
              loading={deleteMutation.isPending}
              disabled={!pendingDeletePasskey}
              onClick={() => {
                if (pendingDeletePasskey) {
                  deleteMutation.mutate(pendingDeletePasskey.id);
                }
              }}
            >
              确认移除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SessionsPanel({
  summary,
}: {
  summary: Awaited<ReturnType<typeof fetchAccountSecuritySummary>>;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      toast.success("已退出当前会话");
      await queryClient.invalidateQueries({ queryKey: ["auth-session"] });
      navigate("/login", { replace: true });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "退出登录失败");
    },
  });

  return (
    <Card variant="flat" className="border-border bg-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <LogOut className="text-primary h-5 w-5" />
          会话
        </CardTitle>
        <CardDescription>当前浏览器会话与账号强认证状态。</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="border-border bg-subtle/15 rounded-[var(--radius-md)] border p-4">
            <div className="text-muted-foreground text-xs">当前账号</div>
            <div className="text-foreground mt-1 font-semibold">{summary.profile.displayName}</div>
            <div className="text-muted-foreground mt-1 font-mono text-xs">
              @{summary.profile.username}
            </div>
          </div>
          <div className="border-border bg-subtle/15 rounded-[var(--radius-md)] border p-4">
            <div className="text-muted-foreground text-xs">强认证</div>
            <div className="text-foreground mt-1 font-semibold">
              {formatAccountDate(summary.profile.lastStrongAuthAt)}
            </div>
          </div>
          <div className="border-border bg-subtle/15 rounded-[var(--radius-md)] border p-4">
            <div className="text-muted-foreground text-xs">其他设备</div>
            <div className="text-foreground mt-1 text-sm font-semibold">改密后失效</div>
          </div>
        </div>
        <Button
          type="button"
          variant="secondary"
          loading={logoutMutation.isPending}
          onClick={() => logoutMutation.mutate()}
        >
          退出当前会话
        </Button>
      </CardContent>
    </Card>
  );
}

export default function AccountSecurityPage() {
  const [searchParams] = useSearchParams();

  const sessionQuery = useQuery({
    queryKey: ["auth-session"],
    queryFn: fetchAuthSession,
    retry: false,
    staleTime: 60_000,
  });
  const session = sessionQuery.data;

  const securityQuery = useQuery({
    queryKey: ["account-security"],
    queryFn: fetchAccountSecuritySummary,
    enabled: session?.authenticated === true,
  });
  const configQuery = useQuery({
    queryKey: ["client-runtime-config"],
    queryFn: fetchClientRuntimeConfig,
    retry: false,
    staleTime: 60_000,
  });

  const summary = securityQuery.data;
  const enabledProviders = configQuery.data?.enabledAuthProviders ?? [];
  const cppLearnEnabled = enabledProviders.includes("cpplearn");
  const cppLearnBound = summary?.externalIdentities.some((item) => item.provider === "cpplearn");
  const signalCount = useMemo(
    () => (summary ? securitySignals(summary).filter(Boolean).length : 0),
    [summary],
  );
  const securityPercent = Math.round((signalCount / 5) * 100);
  const oidcError = searchParams.get("error");
  const emailChanged = searchParams.get("email") === "changed";

  if (sessionQuery.isPending || (session?.authenticated === true && securityQuery.isPending)) {
    return <LoadingAccountSecurity />;
  }

  if (sessionQuery.isError || session?.authenticated !== true) {
    return <LoginRequired />;
  }

  if (securityQuery.isError || !summary) {
    return (
      <Card variant="flat" className="border-destructive/50 bg-card">
        <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-destructive font-medium">账号安全状态读取失败</div>
            <p className="text-muted-foreground mt-1 text-sm">请重试账号安全摘要。</p>
          </div>
          <Button type="button" variant="secondary" onClick={() => void securityQuery.refetch()}>
            <RotateCcw />
            重试
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6" data-testid="account-security-page">
      <Card variant="hero" className="overflow-hidden">
        <CardHeader className="gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <Badge variant="outline">账号安全</Badge>
            <CardTitle className="mt-3 text-2xl">账号安全</CardTitle>
            <CardDescription className="mt-2 max-w-2xl">
              管理密码、邮箱、TOTP 和外部身份绑定；高风险操作会要求再次验证并留下安全记录。
            </CardDescription>
          </div>
          <div className="grid w-full grid-cols-3 gap-3 md:min-w-72">
            <div className="border-border bg-card/80 rounded-[var(--radius-md)] border p-3">
              <div className="text-muted-foreground text-xs">安全项</div>
              <div className="text-foreground mt-1 text-2xl font-semibold tabular-nums">
                {signalCount}/5
              </div>
            </div>
            <div className="border-border bg-card/80 rounded-[var(--radius-md)] border p-3">
              <div className="text-muted-foreground text-xs">TOTP</div>
              <div className="text-foreground mt-1 text-sm font-semibold">
                {summary.totpEnabledAt ? "已启用" : "未启用"}
              </div>
            </div>
            <div className="border-border bg-card/80 rounded-[var(--radius-md)] border p-3">
              <div className="text-muted-foreground text-xs">强认证</div>
              <div className="text-foreground mt-1 text-sm font-semibold">
                {formatAccountDate(summary.profile.lastStrongAuthAt)}
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      {oidcError ? (
        <div className="border-destructive/50 bg-subtle/20 text-destructive rounded-[var(--radius-md)] border p-3 text-sm">
          外部身份绑定未完成：{oidcError}
        </div>
      ) : null}

      {emailChanged ? (
        <div className="border-success/40 bg-subtle/20 text-success flex items-center gap-2 rounded-[var(--radius-md)] border p-3 text-sm">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          邮箱更换已完成。
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card variant="stat">
          <CardContent className="space-y-2 p-0">
            <div className="flex items-center gap-2">
              <ShieldCheck className="text-primary h-5 w-5" />
              <div className="text-muted-foreground text-xs">安全覆盖</div>
            </div>
            <div className="text-foreground text-3xl font-semibold tabular-nums">
              {securityPercent}%
            </div>
          </CardContent>
        </Card>
        <Card variant="stat">
          <CardContent className="space-y-2 p-0">
            <div className="flex items-center gap-2">
              <Mail className="text-primary h-5 w-5" />
              <div className="text-muted-foreground text-xs">邮箱</div>
            </div>
            <div className="text-foreground truncate text-sm font-semibold">
              {summary.email?.email ?? "未绑定"}
            </div>
          </CardContent>
        </Card>
        <Card variant="stat">
          <CardContent className="space-y-2 p-0">
            <div className="flex items-center gap-2">
              <KeyRound className="text-primary h-5 w-5" />
              <div className="text-muted-foreground text-xs">Passkey</div>
            </div>
            <div className="text-foreground text-3xl font-semibold tabular-nums">
              {summary.passkeys.length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="passkey">
        <TabsList className="w-full overflow-x-auto">
          <TabsTrigger value="passkey">Passkey/OIDC</TabsTrigger>
          <TabsTrigger value="password">密码</TabsTrigger>
          <TabsTrigger value="email">邮箱</TabsTrigger>
          <TabsTrigger value="totp">TOTP</TabsTrigger>
          <TabsTrigger value="sessions">会话</TabsTrigger>
        </TabsList>

        <TabsContent value="passkey" className="space-y-4">
          <Card variant="flat" className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ShieldQuestion className="text-primary h-5 w-5" />
                当前身份
              </CardTitle>
              <CardDescription>用于核对当前登录身份、角色和安全状态。</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-2">
              <div className="border-border bg-subtle/15 rounded-[var(--radius-md)] border p-4">
                <div className="text-muted-foreground text-xs">用户</div>
                <div className="text-foreground mt-1 font-semibold">
                  {summary.profile.displayName}
                </div>
                <div className="text-muted-foreground mt-1 font-mono text-xs">
                  @{summary.profile.username}
                </div>
              </div>
              <div className="border-border bg-subtle/15 rounded-[var(--radius-md)] border p-4">
                <div className="text-muted-foreground text-xs">角色</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant="saved">{formatAccountRoleLabel(summary.profile.role)}</Badge>
                  <Badge variant={summary.profile.passwordChangeRequired ? "tle" : "outline"}>
                    {summary.profile.passwordChangeRequired ? "需改密" : "密码正常"}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card variant="flat" className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Link2 className="text-primary h-5 w-5" />
                外部身份
              </CardTitle>
              <CardDescription>
                CppLearn 仅作为身份入口，不替代 Round1 主账号安全边界。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3">
                {summary.externalIdentities.length === 0 ? (
                  <div className="border-border bg-subtle/10 text-muted-foreground rounded-[var(--radius-md)] border border-dashed p-4 text-sm">
                    尚未绑定外部身份。
                  </div>
                ) : (
                  summary.externalIdentities.map((identity) => (
                    <div
                      key={`${identity.provider}-${identity.createdAt}`}
                      className="border-border bg-subtle/15 flex flex-col gap-3 rounded-[var(--radius-md)] border p-4 md:flex-row md:items-center md:justify-between"
                    >
                      <div>
                        <div className="text-foreground font-medium">
                          {formatExternalProviderLabel(identity.provider)}
                        </div>
                        <div className="text-muted-foreground mt-1 text-sm">
                          {identity.providerEmail ?? "未提供邮箱"} ·{" "}
                          {formatAccountDate(identity.createdAt)}
                        </div>
                      </div>
                      <Badge variant="saved">已绑定</Badge>
                    </div>
                  ))
                )}
              </div>

              {cppLearnEnabled ? (
                <Button
                  type="button"
                  variant={cppLearnBound ? "secondary" : "primary"}
                  disabled={cppLearnBound}
                  onClick={startCppLearnBind}
                >
                  {cppLearnBound ? (
                    <>
                      <CheckCircle2 />
                      CppLearn 已绑定
                    </>
                  ) : (
                    <>
                      绑定 CppLearn
                      <ArrowRight />
                    </>
                  )}
                </Button>
              ) : null}
            </CardContent>
          </Card>

          <PasskeyPanel passkeys={summary.passkeys} />
        </TabsContent>

        <TabsContent value="password">
          <PasswordPanel />
        </TabsContent>

        <TabsContent value="email">
          <EmailPanel />
        </TabsContent>

        <TabsContent value="totp">
          <TotpPanel enabled={Boolean(summary.totpEnabledAt)} />
        </TabsContent>

        <TabsContent value="sessions">
          <SessionsPanel summary={summary} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
