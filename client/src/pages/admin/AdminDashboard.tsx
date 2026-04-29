import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, Database, FileJson, ShieldCheck, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { adminNavItems } from "@/lib/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  fetchAdminPrebuiltPapers,
  fetchAdminQuestions,
  fetchAdminUsers,
} from "@/lib/admin-content";
import { fetchImportBatches, type AdminImportBatchStatus } from "@/lib/admin-imports";

type HealthSummary = {
  status: "ok" | "degraded";
  timestamp: string;
  db: string;
  redis: string;
};

const importStatusVariant: Record<
  AdminImportBatchStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  dry_run: "outline",
  processing: "secondary",
  applied: "default",
  partial_failed: "secondary",
  failed: "destructive",
};

const importStatusLabel: Record<AdminImportBatchStatus, string> = {
  dry_run: "预演",
  processing: "处理中",
  applied: "已应用",
  partial_failed: "部分失败",
  failed: "失败",
};

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

function formatHealthLabel(label: string) {
  if (label === "overall") return "应用";
  if (label === "db") return "数据库";
  if (label === "redis") return "Redis";
  return label;
}

function formatHealthValue(value?: string | null) {
  if (!value) return "-";
  if (value === "ok") return "正常";
  if (value === "degraded") return "降级";
  if (value === "error") return "异常";
  return value;
}

async function fetchAdminHealthSummary(): Promise<HealthSummary> {
  const response = await fetch("/api/v1/health", {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
  });
  const payload = (await response.json()) as
    | { success: true; data: HealthSummary }
    | { success: false; error?: { message?: string } };

  if (payload.success !== true) {
    throw new Error(payload.error?.message ?? `健康检查失败 (${response.status})`);
  }

  return payload.data;
}

function KpiCard({
  icon: Icon,
  label,
  value,
  description,
  loading,
}: {
  icon: typeof Activity;
  label: string;
  value: string | number;
  description: string;
  loading?: boolean;
}) {
  return (
    <Card variant="stat" className="border-border bg-card">
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center gap-2">
          <Icon className="text-primary h-4 w-4" />
          <div className="text-muted-foreground text-xs">{label}</div>
        </div>
        <div className="text-foreground text-2xl font-semibold tabular-nums">
          {loading ? "..." : value}
        </div>
        <div className="text-muted-foreground text-xs">{description}</div>
      </CardContent>
    </Card>
  );
}

export default function AdminDashboard() {
  const questionsQuery = useQuery({
    queryKey: ["admin-dashboard", "questions"],
    queryFn: () => fetchAdminQuestions({ page: 1, pageSize: 1 }),
  });
  const papersQuery = useQuery({
    queryKey: ["admin-dashboard", "published-prebuilt-papers"],
    queryFn: () => fetchAdminPrebuiltPapers({ page: 1, pageSize: 1, status: "published" }),
  });
  const batchesQuery = useQuery({
    queryKey: ["admin-dashboard", "import-batches"],
    queryFn: () => fetchImportBatches({ page: 1, pageSize: 5 }),
  });
  const usersQuery = useQuery({
    queryKey: ["admin-dashboard", "users"],
    queryFn: () => fetchAdminUsers({ page: 1, pageSize: 1 }),
  });
  const healthQuery = useQuery({
    queryKey: ["admin-dashboard", "health"],
    queryFn: fetchAdminHealthSummary,
    retry: false,
  });
  const workflowItems = adminNavItems.filter((item) => item.to !== "/admin");
  const health = healthQuery.data;
  const healthRows: Array<[string, string | undefined]> = [
    ["overall", health?.status],
    ["db", health?.db],
    ["redis", health?.redis],
  ];

  return (
    <div className="space-y-6" data-testid="admin-dashboard-page">
      <Card variant="hero" className="admin-dashboard-hero overflow-hidden">
        <CardHeader className="gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Badge variant="outline">管理看板</Badge>
            <CardTitle className="mt-3 text-2xl">内容运营中枢</CardTitle>
            <CardDescription className="mt-2 max-w-2xl">
              汇总题库、预制卷、导入批次和运行时健康状态，作为上线部署测试前的运营检查入口。
            </CardDescription>
          </div>
          <div className="grid w-full gap-3 sm:grid-cols-3 lg:max-w-xl">
            <div className="border-border bg-card/80 rounded-[var(--radius-md)] border p-3">
              <div className="text-muted-foreground text-xs">应用</div>
              <div className="text-foreground mt-1 text-sm font-semibold">
                {healthQuery.isLoading ? "检查中" : formatHealthValue(health?.status)}
              </div>
            </div>
            <div className="border-border bg-card/80 rounded-[var(--radius-md)] border p-3">
              <div className="text-muted-foreground text-xs">数据库</div>
              <div className="text-foreground mt-1 text-sm font-semibold">
                {healthQuery.isLoading ? "检查中" : formatHealthValue(health?.db)}
              </div>
            </div>
            <div className="border-border bg-card/80 rounded-[var(--radius-md)] border p-3">
              <div className="text-muted-foreground text-xs">Redis</div>
              <div className="text-foreground mt-1 text-sm font-semibold">
                {healthQuery.isLoading ? "检查中" : formatHealthValue(health?.redis)}
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={FileJson}
          label="题目资产"
          value={questionsQuery.data?.pagination.total ?? "-"}
          description="题库可运营条目"
          loading={questionsQuery.isLoading}
        />
        <KpiCard
          icon={ShieldCheck}
          label="已发布预制卷"
          value={papersQuery.data?.pagination.total ?? "-"}
          description="可进入考试与任务"
          loading={papersQuery.isLoading}
        />
        <KpiCard
          icon={Activity}
          label="导入批次"
          value={batchesQuery.data?.pagination.total ?? "-"}
          description="最近内容入库记录"
          loading={batchesQuery.isLoading}
        />
        <KpiCard
          icon={Users}
          label="用户"
          value={usersQuery.data?.pagination.total ?? "-"}
          description="当前账号总量"
          loading={usersQuery.isLoading}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card variant="flat" className="border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Activity className="text-primary h-5 w-5" />
              最近导入活动
            </CardTitle>
            <CardDescription>
              优先查看预演、入库和失败批次，确认内容入库链路没有漂移。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {batchesQuery.isLoading ? (
              <div className="border-border text-muted-foreground rounded-[var(--radius-md)] border p-4 text-sm">
                正在读取导入批次...
              </div>
            ) : batchesQuery.isError ? (
              <div className="border-destructive/40 bg-destructive/5 text-destructive rounded-[var(--radius-md)] border p-4 text-sm">
                导入批次不可用。
              </div>
            ) : batchesQuery.data?.items.length ? (
              batchesQuery.data.items.map((batch) => (
                <div
                  key={batch.id}
                  className="border-border grid gap-3 rounded-[var(--radius-md)] border p-4 md:grid-cols-[1fr_auto] md:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={importStatusVariant[batch.status]}>
                        {importStatusLabel[batch.status]}
                      </Badge>
                      <span className="text-foreground truncate text-sm font-medium">
                        {batch.sourceFilename}
                      </span>
                    </div>
                    <div className="text-muted-foreground mt-2 flex flex-wrap gap-3 text-xs">
                      <span>{batch.bundleType}</span>
                      <span className="font-mono">{batch.checksum.slice(0, 12)}</span>
                      <span>{formatTimestamp(batch.createdAt)}</span>
                    </div>
                  </div>
                  <div className="text-muted-foreground text-sm tabular-nums">
                    {batch.summaryJson
                      ? `${batch.summaryJson.importedCount}/${batch.summaryJson.totalCount}`
                      : "-"}
                  </div>
                </div>
              ))
            ) : (
              <div className="border-border bg-subtle/10 text-muted-foreground rounded-[var(--radius-md)] border border-dashed p-4 text-sm">
                暂无导入批次。
              </div>
            )}
          </CardContent>
        </Card>

        <Card variant="flat" className="border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Database className="text-primary h-5 w-5" />
              系统健康
            </CardTitle>
            <CardDescription>来自应用服务、数据库与 Redis 探测。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {healthQuery.isError ? (
              <div className="border-destructive/40 bg-destructive/5 text-destructive flex items-start gap-3 rounded-[var(--radius-md)] border p-4 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                健康检查不可用，请在部署环境执行 healthcheck。
              </div>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  {healthRows.map(([label, value]) => (
                    <div
                      key={label}
                      className="border-border bg-subtle/15 rounded-[var(--radius-md)] border p-3"
                    >
                      <div className="text-muted-foreground text-xs">
                        {formatHealthLabel(label)}
                      </div>
                      <div className="mt-2">
                        <Badge variant={value === "ok" ? "saved" : "outline"}>
                          {healthQuery.isLoading ? "检查中" : formatHealthValue(value)}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="text-muted-foreground text-xs">
                  更新时间：{formatTimestamp(health?.timestamp)}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {workflowItems.map((item) => (
          <Link key={item.to} to={item.to} className="block">
            <Card variant="interactive" className="h-full">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <item.icon className="text-primary h-5 w-5" />
                  <CardTitle className="text-lg">{item.label}</CardTitle>
                </div>
                <CardDescription>{item.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm">
                  打开 {item.label} 页面，继续内容库管理流程。
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
