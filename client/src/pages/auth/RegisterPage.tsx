import { type FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ArrowLeft, ArrowRight, CircleAlert, Mail, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AuthClientError,
  completeEmailRegistration,
  isValidAuthUsername,
  normalizeAuthCode,
  requestRegisterEmailChallenge,
  resolveAuthReturnTo,
  verifyRegisterEmailCode,
  type AuthChallenge,
} from "@/lib/auth";
import { CPPLEARN_BANNER_SRC } from "@/lib/brand-assets";
import { fetchClientRuntimeConfig } from "@/lib/client-config";

type RegisterStep = "email" | "code" | "profile";

function formatChallengeExpiry(challenge: AuthChallenge | null): string | null {
  if (!challenge) {
    return null;
  }

  const date = new Date(challenge.expiresAt);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function authErrorMessage(error: unknown, fallback: string): string {
  return error instanceof AuthClientError ? error.message : fallback;
}

function startCppLearnRegister() {
  window.location.assign("/api/v1/auth/oidc/cpplearn/start?intent=register");
}

export default function RegisterPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const initialTicket = searchParams.get("ticket") ?? "";
  const returnTo = resolveAuthReturnTo(searchParams.get("returnTo"));

  const [step, setStep] = useState<RegisterStep>(initialTicket ? "profile" : "email");
  const [email, setEmail] = useState("");
  const [challenge, setChallenge] = useState<AuthChallenge | null>(null);
  const [code, setCode] = useState("");
  const [ticket, setTicket] = useState(initialTicket);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const configQuery = useQuery({
    queryKey: ["client-runtime-config"],
    queryFn: fetchClientRuntimeConfig,
    retry: false,
    staleTime: 60_000,
  });
  const cppLearnEnabled = configQuery.data?.enabledAuthProviders.includes("cpplearn") ?? false;

  const requestMutation = useMutation({
    mutationFn: () => requestRegisterEmailChallenge(email.trim()),
    onSuccess: (result) => {
      setChallenge(result);
      setCode("");
      setStep("code");
      setFormError(null);
      toast.success("验证码已发送");
    },
    onError: (error) => {
      const message = authErrorMessage(error, "发送验证码失败，请稍后重试。");
      setFormError(message);
      toast.error(message);
    },
  });

  const verifyMutation = useMutation({
    mutationFn: () => {
      if (!challenge) {
        throw new AuthClientError("ROUND1_MISSING_CHALLENGE", "请先发送验证码。");
      }
      return verifyRegisterEmailCode(challenge.challengeId, code);
    },
    onSuccess: (result) => {
      setTicket(result.ticket);
      setStep("profile");
      setFormError(null);
      toast.success("邮箱已验证");
    },
    onError: (error) => {
      const message = authErrorMessage(error, "验证码校验失败，请检查后重试。");
      setFormError(message);
      toast.error(message);
    },
  });

  const completeMutation = useMutation({
    mutationFn: () =>
      completeEmailRegistration({
        ticket,
        username: username.trim(),
        displayName: displayName.trim() || undefined,
        password,
      }),
    onSuccess: async () => {
      setFormError(null);
      await queryClient.invalidateQueries({ queryKey: ["auth-session"] });
      navigate(returnTo, { replace: true });
    },
    onError: (error) => {
      const message = authErrorMessage(error, "创建账号失败，请稍后重试。");
      setFormError(message);
      toast.error(message);
    },
  });

  function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    requestMutation.mutate();
  }

  function handleCodeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    verifyMutation.mutate();
  }

  function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (!ticket) {
      setFormError("注册票据已失效，请重新验证邮箱。");
      setStep("email");
      return;
    }

    if (!isValidAuthUsername(username.trim())) {
      setFormError("用户名需要 4-20 位英文字母或数字。");
      return;
    }

    if (password !== confirmPassword) {
      setFormError("两次输入的密码不一致。");
      return;
    }

    completeMutation.mutate();
  }

  const expiry = formatChallengeExpiry(challenge);
  const normalizedCode = normalizeAuthCode(code);

  return (
    <div className="space-y-6" data-testid="register-page">
      <div className="space-y-3">
        <Badge variant="outline">Round1 Account</Badge>
        <div className="space-y-2">
          <h1 className="text-foreground text-2xl font-semibold tracking-tight">创建账号</h1>
          <p className="text-muted-foreground text-sm leading-6">
            先验证邮箱，再设置用户名和密码。密码强度由服务端统一校验。
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        {[
          ["email", "邮箱"],
          ["code", "验证码"],
          ["profile", "资料"],
        ].map(([key, label]) => (
          <div
            key={key}
            className={
              step === key
                ? "border-primary bg-accent-wash text-primary rounded-[var(--radius-md)] border px-3 py-2 text-center font-medium"
                : "border-border bg-subtle/40 text-muted-foreground rounded-[var(--radius-md)] border px-3 py-2 text-center"
            }
          >
            {label}
          </div>
        ))}
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

      {step === "email" ? (
        <form className="space-y-4" onSubmit={handleEmailSubmit}>
          <div className="space-y-2">
            <Label htmlFor="register-email">邮箱</Label>
            <div className="relative">
              <Mail className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <Input
                id="register-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="pl-9"
                autoComplete="email"
                required
              />
            </div>
          </div>

          <Button
            type="submit"
            className="w-full"
            loading={requestMutation.isPending}
            disabled={email.trim().length === 0}
          >
            发送验证码
            <ArrowRight />
          </Button>
        </form>
      ) : null}

      {step === "code" ? (
        <form className="space-y-4" onSubmit={handleCodeSubmit}>
          <div className="space-y-2">
            <Label htmlFor="register-code">邮箱验证码</Label>
            <Input
              id="register-code"
              inputMode="numeric"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              autoComplete="one-time-code"
              maxLength={6}
              required
            />
            {expiry ? (
              <p className="text-muted-foreground text-xs leading-5">
                验证码约在 {expiry} 前有效。
              </p>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
            <Button type="button" variant="secondary" onClick={() => setStep("email")}>
              <ArrowLeft />
              重填邮箱
            </Button>
            <Button
              type="submit"
              className="w-full"
              loading={verifyMutation.isPending}
              disabled={normalizedCode.length !== 6}
            >
              验证邮箱
              <ArrowRight />
            </Button>
          </div>
        </form>
      ) : null}

      {step === "profile" ? (
        <form className="space-y-4" onSubmit={handleProfileSubmit}>
          <div className="space-y-2">
            <Label htmlFor="register-username">用户名</Label>
            <div className="relative">
              <UserRound className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <Input
                id="register-username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="pl-9"
                autoComplete="username"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="register-display-name">显示名称</Label>
            <Input
              id="register-display-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              autoComplete="name"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="register-password">密码</Label>
              <Input
                id="register-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="register-password-confirm">确认密码</Label>
              <Input
                id="register-password-confirm"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
          </div>

          <Button
            type="submit"
            className="w-full"
            loading={completeMutation.isPending}
            disabled={
              username.trim().length === 0 || password.length < 8 || confirmPassword.length < 8
            }
          >
            完成注册
            <ShieldCheck />
          </Button>
        </form>
      ) : null}

      {cppLearnEnabled ? (
        <div className="border-border border-t pt-5">
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
              <div className="min-w-0">
                <div className="text-foreground truncate text-sm font-semibold">CppLearn</div>
                <div className="text-muted-foreground mt-1 text-xs">使用 CppLearn 身份创建账号</div>
              </div>
            </div>
            <Button
              type="button"
              variant="secondary"
              className="mt-4 w-full"
              onClick={startCppLearnRegister}
            >
              CppLearn 注册
            </Button>
          </div>
        </div>
      ) : null}

      <div className="text-muted-foreground border-border flex flex-wrap items-center justify-between gap-3 border-t pt-5 text-sm">
        <span>已经有账号？</span>
        <Button asChild variant="link" className="px-0">
          <Link to="/login">直接登录</Link>
        </Button>
      </div>
    </div>
  );
}
