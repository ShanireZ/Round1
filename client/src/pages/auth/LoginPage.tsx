import { type FormEvent, useState } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ArrowRight, CircleAlert, KeyRound, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchClientRuntimeConfig } from "@/lib/client-config";
import {
  AuthClientError,
  fetchPasskeyLoginOptions,
  passwordLogin,
  resolveAuthReturnTo,
  verifyPasskeyLogin,
} from "@/lib/auth";
import { CPPLEARN_BANNER_SRC } from "@/lib/brand-assets";

function startExternalAuth(provider: "cpplearn" | "qq") {
  const target =
    provider === "cpplearn"
      ? "/api/v1/auth/oidc/cpplearn/start?intent=login"
      : "/api/v1/auth/external/qq/start?intent=login";
  window.location.assign(target);
}

function formatPasskeyLoginError(error: unknown) {
  if (error instanceof AuthClientError) {
    return error.message;
  }

  if (error instanceof Error) {
    if (error.name === "NotAllowedError") {
      return "Passkey 验证已取消或超时。";
    }

    if (error.name === "InvalidStateError") {
      return "这个 Passkey 当前不可用于登录，请换一个凭据或使用密码登录。";
    }
  }

  return "Passkey 登录失败，请稍后重试。";
}

export default function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const returnTo = resolveAuthReturnTo(searchParams.get("returnTo"));

  const configQuery = useQuery({
    queryKey: ["client-runtime-config"],
    queryFn: fetchClientRuntimeConfig,
    retry: false,
    staleTime: 60_000,
  });
  const providers = configQuery.data?.enabledAuthProviders ?? ["password"];
  const providerPlaceholders = configQuery.data?.authProviderPlaceholders ?? [];
  const passkeyEnabled = providers.includes("passkey");
  const cppLearnEnabled = providers.includes("cpplearn");
  const qqPlaceholderEnabled = providerPlaceholders.includes("qq");

  const loginMutation = useMutation({
    mutationFn: () => passwordLogin({ identifier: identifier.trim(), password }),
    onSuccess: async () => {
      setFormError(null);
      await queryClient.invalidateQueries({ queryKey: ["auth-session"] });
      navigate(returnTo, { replace: true });
    },
    onError: (error) => {
      const message = error instanceof AuthClientError ? error.message : "登录失败，请稍后重试。";
      setFormError(message);
      toast.error(message);
    },
  });

  const passkeyLoginMutation = useMutation({
    mutationFn: async () => {
      const optionsJSON = await fetchPasskeyLoginOptions();
      const credential = await startAuthentication({ optionsJSON });
      return verifyPasskeyLogin(credential);
    },
    onSuccess: async () => {
      setFormError(null);
      await queryClient.invalidateQueries({ queryKey: ["auth-session"] });
      navigate(returnTo, { replace: true });
    },
    onError: (error) => {
      const message = formatPasskeyLoginError(error);
      setFormError(message);
      toast.error(message);
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    loginMutation.mutate();
  }

  return (
    <div className="space-y-6" data-testid="login-page">
      <div className="space-y-3">
        <Badge variant="outline">Round1 Account</Badge>
        <div className="space-y-2">
          <h1 className="text-foreground text-2xl font-semibold tracking-tight">登录</h1>
          <p className="text-muted-foreground text-sm leading-6">
            使用账号密码、Passkey 或已开放的外部身份继续训练。
          </p>
        </div>
      </div>

      {formError ? (
        <div
          role="alert"
          className="border-destructive bg-subtle text-destructive flex items-start gap-2 rounded-[var(--radius-md)] border p-3 text-sm"
        >
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{formError}</span>
        </div>
      ) : null}

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <Label htmlFor="identifier">邮箱或用户名</Label>
          <div className="relative">
            <Mail className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <Input
              id="identifier"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              className="pl-9"
              autoComplete="username"
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="password">密码</Label>
            <Link
              to="/forgot-password"
              className="text-primary text-xs font-medium hover:underline"
            >
              找回密码
            </Link>
          </div>
          <div className="relative">
            <LockKeyhole className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="pl-9"
              autoComplete="current-password"
              required
            />
          </div>
        </div>

        <Button
          type="submit"
          className="w-full"
          loading={loginMutation.isPending}
          disabled={identifier.trim().length === 0 || password.length === 0}
        >
          登录
          <ArrowRight />
        </Button>
      </form>

      {passkeyEnabled || cppLearnEnabled || qqPlaceholderEnabled ? (
        <div className="border-border space-y-3 border-t pt-5">
          {passkeyEnabled ? (
            <div className="border-border bg-subtle/40 rounded-[var(--radius-lg)] border p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="border-border bg-surface grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-md)] border">
                    <KeyRound className="text-primary h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-foreground text-sm font-semibold">Passkey</div>
                    <div className="text-muted-foreground mt-1 text-xs">
                      使用设备解锁或安全密钥登录
                    </div>
                  </div>
                </div>
                <Badge variant="saved">免密码</Badge>
              </div>
              <Button
                type="button"
                variant="secondary"
                className="mt-4 w-full"
                loading={passkeyLoginMutation.isPending}
                onClick={() => passkeyLoginMutation.mutate()}
              >
                使用 Passkey 登录
              </Button>
            </div>
          ) : null}

          {cppLearnEnabled ? (
            <div className="border-border bg-subtle/40 rounded-[var(--radius-lg)] border p-4">
              <div className="flex items-center gap-3">
                <div className="border-border bg-surface flex h-11 w-28 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-md)] border p-1">
                  <img
                    src={CPPLEARN_BANNER_SRC}
                    alt="CppLearn"
                    className="max-h-full max-w-full object-contain"
                    decoding="async"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-foreground truncate text-sm font-semibold">CppLearn</div>
                  <div className="text-muted-foreground mt-1 flex items-center gap-1.5 text-xs">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    CppLearn 身份
                  </div>
                </div>
              </div>
              <Button
                type="button"
                variant="secondary"
                className="mt-4 w-full"
                onClick={() => startExternalAuth("cpplearn")}
              >
                使用 CppLearn 登录
              </Button>
            </div>
          ) : null}

          {qqPlaceholderEnabled ? (
            <div className="border-border bg-subtle/40 rounded-[var(--radius-lg)] border p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="border-border bg-surface grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-md)] border">
                    <KeyRound className="text-muted-foreground h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-foreground text-sm font-semibold">QQ 互联登录</div>
                    <div className="text-muted-foreground mt-1 text-xs">登录方式正在联调</div>
                  </div>
                </div>
                <Badge variant="outline">待联调</Badge>
              </div>
              <Button type="button" variant="secondary" className="mt-4 w-full" disabled>
                QQ 互联登录
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="text-muted-foreground border-border flex flex-wrap items-center justify-between gap-3 border-t pt-5 text-sm">
        <span>还没有账号？</span>
        <Button asChild variant="link" className="px-0">
          <Link to="/register">创建账号</Link>
        </Button>
      </div>

      {configQuery.isError ? (
        <p className="text-muted-foreground text-xs leading-5">
          外部登录配置暂不可用，账号密码登录仍可继续。
        </p>
      ) : null}
    </div>
  );
}
