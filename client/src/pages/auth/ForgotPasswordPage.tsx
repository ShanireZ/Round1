import { type FormEvent, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ArrowRight, CircleAlert, Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthClientError, requestPasswordResetChallenge, resetPassword } from "@/lib/auth";

function authErrorMessage(error: unknown, fallback: string): string {
  return error instanceof AuthClientError ? error.message : fallback;
}

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialTicket = searchParams.get("ticket") ?? "";
  const [email, setEmail] = useState("");
  const [ticket] = useState(initialTicket);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [requestSent, setRequestSent] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const requestMutation = useMutation({
    mutationFn: () => requestPasswordResetChallenge(email.trim()),
    onSuccess: (result) => {
      setRequestSent(true);
      setFormError(null);
      toast.success(result.message);
    },
    onError: (error) => {
      const message = authErrorMessage(error, "发送重置邮件失败，请稍后重试。");
      setFormError(message);
      toast.error(message);
    },
  });

  const resetMutation = useMutation({
    mutationFn: () => resetPassword(ticket, newPassword),
    onSuccess: () => {
      setResetDone(true);
      setFormError(null);
      toast.success("密码已重置");
      navigate("/login", { replace: true });
    },
    onError: (error) => {
      const message = authErrorMessage(error, "重置密码失败，请确认链接仍然有效。");
      setFormError(message);
      toast.error(message);
    },
  });

  function handleRequestSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    requestMutation.mutate();
  }

  function handleResetSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (!ticket) {
      setFormError("重置链接缺少票据，请重新发送邮件。");
      return;
    }

    if (newPassword !== confirmPassword) {
      setFormError("两次输入的密码不一致。");
      return;
    }

    resetMutation.mutate();
  }

  return (
    <div className="space-y-6" data-testid="forgot-password-page">
      <div className="space-y-3">
        <Badge variant="outline">Round1 Account</Badge>
        <div className="space-y-2">
          <h1 className="text-foreground text-2xl font-semibold tracking-tight">
            {ticket ? "设置新密码" : "找回密码"}
          </h1>
          <p className="text-muted-foreground text-sm leading-6">
            {ticket
              ? "为你的账号设置一个新密码。服务端会继续执行统一强度策略。"
              : "提交后不会暴露邮箱是否存在；如果邮箱已注册，你会收到重置链接。"}
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

      {!ticket ? (
        <form className="space-y-4" onSubmit={handleRequestSubmit}>
          <div className="space-y-2">
            <Label htmlFor="reset-email">邮箱</Label>
            <div className="relative">
              <Mail className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <Input
                id="reset-email"
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
            disabled={email.trim().length === 0 || requestSent}
          >
            {requestSent ? "邮件已发送" : "发送重置邮件"}
            <ArrowRight />
          </Button>

          {requestSent ? (
            <div className="border-border bg-subtle/40 rounded-[var(--radius-md)] border p-3 text-sm leading-6">
              请检查邮箱中的 Round1 重置链接。链接过期后可以回到这里重新发送。
            </div>
          ) : null}
        </form>
      ) : (
        <form className="space-y-4" onSubmit={handleResetSubmit}>
          <div className="space-y-2">
            <Label htmlFor="new-password">新密码</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password-confirm">确认新密码</Label>
            <Input
              id="new-password-confirm"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              required
            />
          </div>

          <Button
            type="submit"
            className="w-full"
            loading={resetMutation.isPending}
            disabled={newPassword.length < 8 || confirmPassword.length < 8 || resetDone}
          >
            重置密码
            <ShieldCheck />
          </Button>
        </form>
      )}

      <div className="text-muted-foreground border-border flex flex-wrap items-center justify-between gap-3 border-t pt-5 text-sm">
        <span>想起密码了？</span>
        <Button asChild variant="link" className="px-0">
          <Link to="/login">返回登录</Link>
        </Button>
      </div>
    </div>
  );
}
