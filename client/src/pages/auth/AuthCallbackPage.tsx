import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ArrowRight, CircleAlert, LoaderCircle, MailCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AuthClientError,
  confirmEmailChange,
  redeemEmailChangeLink,
  redeemPasswordResetLink,
  redeemRegisterEmailLink,
} from "@/lib/auth";

type CallbackStatus = "processing" | "success" | "error";

function authErrorMessage(error: unknown): string {
  return error instanceof AuthClientError ? error.message : "认证链接处理失败，请重新发起流程。";
}

function callbackTargetForFlow(flow: string, ticket: string): string {
  if (flow === "register") {
    return `/register?ticket=${encodeURIComponent(ticket)}`;
  }

  if (flow === "reset_password") {
    return `/forgot-password?ticket=${encodeURIComponent(ticket)}`;
  }

  return "/account/security?email=changed";
}

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const processedKeyRef = useRef<string | null>(null);
  const [status, setStatus] = useState<CallbackStatus>("processing");
  const [message, setMessage] = useState("正在处理认证链接。");

  const callbackInput = useMemo(
    () => ({
      flow: searchParams.get("flow") ?? "",
      token: searchParams.get("token") ?? "",
      challengeId: searchParams.get("challenge") ?? searchParams.get("challengeId") ?? "",
      error: searchParams.get("error") ?? "",
      errorDescription: searchParams.get("error_description") ?? "",
    }),
    [searchParams],
  );

  useEffect(() => {
    const key = JSON.stringify(callbackInput);
    if (processedKeyRef.current === key) {
      return;
    }
    processedKeyRef.current = key;

    if (callbackInput.error) {
      setStatus("error");
      setMessage(callbackInput.errorDescription || callbackInput.error);
      return;
    }

    if (!callbackInput.flow || !callbackInput.challengeId || !callbackInput.token) {
      setStatus("error");
      setMessage("认证链接缺少必要参数，请重新从邮件或身份入口打开。");
      return;
    }

    let cancelled = false;

    async function redeemCallbackLink() {
      try {
        setStatus("processing");
        setMessage("正在验证链接并准备下一步。");

        if (callbackInput.flow === "register") {
          const result = await redeemRegisterEmailLink(
            callbackInput.challengeId,
            callbackInput.token,
          );
          if (!cancelled) {
            setStatus("success");
            setMessage("邮箱已验证，正在进入注册资料页。");
            navigate(callbackTargetForFlow(callbackInput.flow, result.ticket), { replace: true });
          }
          return;
        }

        if (callbackInput.flow === "reset_password") {
          const result = await redeemPasswordResetLink(
            callbackInput.challengeId,
            callbackInput.token,
          );
          if (!cancelled) {
            setStatus("success");
            setMessage("链接已验证，正在进入密码重置页。");
            navigate(callbackTargetForFlow(callbackInput.flow, result.ticket), { replace: true });
          }
          return;
        }

        if (callbackInput.flow === "change_email") {
          const result = await redeemEmailChangeLink(
            callbackInput.challengeId,
            callbackInput.token,
          );
          await confirmEmailChange(result.ticket);
          if (!cancelled) {
            setStatus("success");
            setMessage("邮箱已更换，正在返回账号安全页。");
            navigate(callbackTargetForFlow(callbackInput.flow, result.ticket), { replace: true });
          }
          return;
        }

        throw new AuthClientError(
          "ROUND1_AUTH_CALLBACK_FLOW_UNSUPPORTED",
          "暂不支持这个认证链接类型。",
        );
      } catch (error) {
        if (!cancelled) {
          setStatus("error");
          setMessage(authErrorMessage(error));
        }
      }
    }

    void redeemCallbackLink();

    return () => {
      cancelled = true;
    };
  }, [callbackInput, navigate]);

  return (
    <div className="space-y-6" data-testid="auth-callback-page">
      <div className="space-y-3">
        <Badge variant={status === "error" ? "tle" : "outline"}>登录回调</Badge>
        <div className="space-y-2">
          <h1 className="text-foreground text-2xl font-semibold tracking-tight">
            {status === "error" ? "认证未完成" : "正在确认身份"}
          </h1>
          <p className="text-muted-foreground text-sm leading-6">{message}</p>
        </div>
      </div>

      {status === "error" ? (
        <div
          role="alert"
          className="border-destructive bg-subtle text-destructive flex items-start gap-3 rounded-[var(--radius-lg)] border p-4 text-sm"
        >
          <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <span>{message}</span>
        </div>
      ) : (
        <div
          role="status"
          className="border-border bg-subtle/40 text-foreground flex items-start gap-3 rounded-[var(--radius-lg)] border p-4 text-sm"
        >
          {status === "processing" ? (
            <LoaderCircle className="mt-0.5 h-5 w-5 shrink-0 animate-spin" />
          ) : (
            <MailCheck className="text-success mt-0.5 h-5 w-5 shrink-0" />
          )}
          <span>{message}</span>
        </div>
      )}

      {status === "error" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Button asChild variant="secondary">
            <Link to="/login">返回登录</Link>
          </Button>
          <Button asChild>
            <Link to="/forgot-password">
              重新找回密码
              <ArrowRight />
            </Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
