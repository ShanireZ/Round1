import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Link, Navigate, useLocation } from "react-router";
import { LoaderCircle, LogIn, ShieldAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchAuthSession } from "@/lib/auth";
import { canAccessRole, type NavigationRole } from "@/lib/navigation";

type RequiredRole = Exclude<NavigationRole, null>;

function routeReturnTo(pathname: string, search: string) {
  return `${pathname}${search}`;
}

function LoadingGate() {
  return (
    <div className="grid min-h-[50vh] place-items-center px-6 py-10">
      <div className="text-muted-foreground flex items-center gap-3 text-sm">
        <LoaderCircle className="text-primary h-4 w-4 animate-spin" />
        正在确认访问权限
      </div>
    </div>
  );
}

function AccessError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="grid min-h-[50vh] place-items-center px-6 py-10">
      <Card variant="flat" className="border-destructive/20 bg-card w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="text-destructive flex items-center gap-2">
            <ShieldAlert className="h-5 w-5" />
            无法确认登录状态
          </CardTitle>
          <CardDescription>
            当前浏览器没有拿到有效会话结果。可以重试，或回到登录页重新进入。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button type="button" variant="primary" onClick={onRetry}>
            <LoaderCircle />
            重试
          </Button>
          <Button asChild variant="secondary">
            <Link to="/login">
              <LogIn />
              登录页
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function AccessDenied({ minimumRole }: { minimumRole: RequiredRole }) {
  const roleLabel: Record<RequiredRole, string> = {
    student: "登录用户",
    coach: "教练或管理员",
    admin: "管理员",
  };

  return (
    <div className="grid min-h-[50vh] place-items-center px-6 py-10">
      <Card variant="flat" className="border-warning/30 bg-card w-full max-w-2xl">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="tle">403</Badge>
            <Badge variant="outline">需要{roleLabel[minimumRole]}</Badge>
          </div>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="text-warning h-5 w-5" />
            当前账号不能访问这个入口
          </CardTitle>
          <CardDescription>
            页面导航会按角色隐藏不可用入口；如果你是从旧链接进入，请回到首页或切换到有权限的账号。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button asChild variant="primary">
            <Link to="/dashboard">回到首页</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to="/account/security">查看账号安全</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export function RequireRole({
  minimumRole,
  children,
}: {
  minimumRole: RequiredRole;
  children: ReactNode;
}) {
  const location = useLocation();
  const sessionQuery = useQuery({
    queryKey: ["auth-session"],
    queryFn: fetchAuthSession,
    retry: false,
    staleTime: 30_000,
  });

  if (sessionQuery.isPending) {
    return <LoadingGate />;
  }

  if (sessionQuery.isError) {
    return <AccessError onRetry={() => void sessionQuery.refetch()} />;
  }

  if (sessionQuery.data?.authenticated !== true) {
    const returnTo = routeReturnTo(location.pathname, location.search);
    return <Navigate to={`/login?returnTo=${encodeURIComponent(returnTo)}`} replace />;
  }

  if (!canAccessRole(sessionQuery.data.user.role, minimumRole)) {
    return <AccessDenied minimumRole={minimumRole} />;
  }

  return <>{children}</>;
}

export function GuestOnly({ children }: { children: ReactNode }) {
  const sessionQuery = useQuery({
    queryKey: ["auth-session"],
    queryFn: fetchAuthSession,
    retry: false,
    staleTime: 30_000,
  });

  if (sessionQuery.isPending) {
    return <LoadingGate />;
  }

  if (sessionQuery.data?.authenticated === true) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
