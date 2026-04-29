import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCcw, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  type UserRole,
  deleteAdminUser,
  fetchAdminUsers,
  restoreAdminUser,
  updateAdminUserRole,
} from "@/lib/admin-content";

type RoleFilter = UserRole | "all";

function formatTimestamp(value?: string | null) {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("zh-CN", {
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminUsers() {
  const queryClient = useQueryClient();
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");

  const usersQuery = useQuery({
    queryKey: ["admin-users", roleFilter] as const,
    queryFn: () =>
      fetchAdminUsers({
        page: 1,
        pageSize: 30,
        role: roleFilter,
      }),
  });

  const totalLabel = useMemo(() => {
    const pageCount = usersQuery.data?.items.length ?? 0;
    const total = usersQuery.data?.pagination.total ?? 0;
    return `${pageCount}/${total}`;
  }, [usersQuery.data]);

  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: UserRole }) =>
      updateAdminUserRole(userId, role),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("用户角色已更新");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "用户角色更新失败");
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ userId, action }: { userId: string; action: "delete" | "restore" }) =>
      action === "delete" ? deleteAdminUser(userId) : restoreAdminUser(userId),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success(variables.action === "delete" ? "用户已禁用" : "用户已恢复");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "用户状态更新失败");
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">用户管理</h1>
          <p className="text-muted-foreground mt-2 max-w-3xl text-sm">
            管理账号角色和禁用状态。角色变更、禁用与恢复都走 Admin step-up 与审计链路。
          </p>
        </div>
        <Card variant="stat" className="min-w-36">
          <CardHeader className="pb-2">
            <CardDescription>当前列表</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tabular-nums">{totalLabel}</div>
          </CardContent>
        </Card>
      </div>

      <Card variant="flat">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <RefreshCcw className="text-primary h-4 w-4" />
              账号列表
            </CardTitle>
            <CardDescription>按角色筛选，直接调整单个用户的角色或状态。</CardDescription>
          </div>
          <Select value={roleFilter} onValueChange={(value) => setRoleFilter(value as RoleFilter)}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部角色</SelectItem>
              <SelectItem value="student">Student</SelectItem>
              <SelectItem value="coach">Coach</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {usersQuery.isLoading ? (
            <div className="border-border text-muted-foreground rounded-[var(--radius-md)] border p-4 text-sm">
              正在加载用户列表...
            </div>
          ) : usersQuery.isError ? (
            <div className="border-destructive/40 bg-destructive/5 text-destructive rounded-[var(--radius-md)] border p-4 text-sm">
              {usersQuery.error instanceof Error ? usersQuery.error.message : "用户列表加载失败"}
            </div>
          ) : usersQuery.data && usersQuery.data.items.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>用户</TableHead>
                  <TableHead>角色</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead className="w-36 text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usersQuery.data.items.map((user) => {
                  const statusAction = user.status === "deleted" ? "restore" : "delete";
                  const isStatusPending =
                    statusMutation.isPending && statusMutation.variables?.userId === user.id;
                  const isRolePending =
                    roleMutation.isPending && roleMutation.variables?.userId === user.id;

                  return (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="text-foreground font-medium">{user.displayName}</div>
                        <div className="text-muted-foreground mt-1 font-mono text-xs">
                          {user.username}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={user.role}
                          disabled={isRolePending}
                          onValueChange={(value) =>
                            roleMutation.mutate({ userId: user.id, role: value as UserRole })
                          }
                        >
                          <SelectTrigger className="w-[140px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="student">Student</SelectItem>
                            <SelectItem value="coach">Coach</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.status === "active" ? "default" : "secondary"}>
                          {user.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatTimestamp(user.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant={statusAction === "delete" ? "destructive" : "secondary"}
                          size="sm"
                          loading={isStatusPending}
                          onClick={() =>
                            statusMutation.mutate({ userId: user.id, action: statusAction })
                          }
                        >
                          {statusAction === "delete" ? (
                            <>
                              <Trash2 className="h-4 w-4" />
                              禁用
                            </>
                          ) : (
                            <>
                              <RotateCcw className="h-4 w-4" />
                              恢复
                            </>
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="border-border text-muted-foreground rounded-[var(--radius-md)] border border-dashed p-4 text-sm">
              当前筛选下暂无用户。
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
