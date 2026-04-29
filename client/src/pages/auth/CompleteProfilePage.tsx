import { type FormEvent, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ArrowRight, CircleAlert, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AuthClientError,
  completeExternalProfile,
  isValidAuthUsername,
  resolveAuthReturnTo,
} from "@/lib/auth";
import { CPPLEARN_BANNER_SRC } from "@/lib/brand-assets";

function authErrorMessage(error: unknown, fallback: string): string {
  return error instanceof AuthClientError ? error.message : fallback;
}

export default function CompleteProfilePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const ticket = searchParams.get("ticket") ?? "";
  const returnTo = resolveAuthReturnTo(searchParams.get("returnTo"));
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(
    ticket ? null : "身份票据缺失，请重新使用 CppLearn 登录。",
  );

  const completeMutation = useMutation({
    mutationFn: () =>
      completeExternalProfile({
        ticket,
        username: username.trim(),
        displayName: displayName.trim() || undefined,
        password,
      }),
    onSuccess: async () => {
      setFormError(null);
      await queryClient.invalidateQueries({ queryKey: ["auth-session"] });
      toast.success("账号资料已补齐");
      navigate(returnTo, { replace: true });
    },
    onError: (error) => {
      const message = authErrorMessage(error, "补齐资料失败，请重新发起外部登录。");
      setFormError(message);
      toast.error(message);
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (!ticket) {
      setFormError("身份票据缺失，请重新使用 CppLearn 登录。");
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

  return (
    <div className="space-y-6" data-testid="complete-profile-page">
      <div className="space-y-3">
        <Badge variant="outline">CppLearn 身份</Badge>
        <div className="space-y-2">
          <h1 className="text-foreground text-2xl font-semibold tracking-tight">补齐账号资料</h1>
          <p className="text-muted-foreground text-sm leading-6">
            外部身份已确认。设置 Round1 用户名和密码后，就可以继续训练。
          </p>
        </div>
      </div>

      <div className="border-border bg-subtle/40 flex items-center gap-3 rounded-[var(--radius-lg)] border p-4">
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
          <div className="text-muted-foreground mt-1 text-xs">已返回 Round1 继续创建资料</div>
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
          <Label htmlFor="profile-username">用户名</Label>
          <div className="relative">
            <UserRound className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <Input
              id="profile-username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="pl-9"
              autoComplete="username"
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="profile-display-name">显示名称</Label>
          <Input
            id="profile-display-name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            autoComplete="name"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="profile-password">密码</Label>
            <Input
              id="profile-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-password-confirm">确认密码</Label>
            <Input
              id="profile-password-confirm"
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
            !ticket ||
            username.trim().length === 0 ||
            password.length < 8 ||
            confirmPassword.length < 8
          }
        >
          完成资料
          <ShieldCheck />
        </Button>
      </form>

      <div className="text-muted-foreground border-border flex flex-wrap items-center justify-between gap-3 border-t pt-5 text-sm">
        <span>不是你的外部身份？</span>
        <Button asChild variant="link" className="px-0">
          <Link to="/login">
            返回登录
            <ArrowRight />
          </Link>
        </Button>
      </div>
    </div>
  );
}
