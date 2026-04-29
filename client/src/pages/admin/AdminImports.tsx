import { Fragment, startTransition, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Copy, FileJson, RefreshCcw, Upload } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  type AdminImportBatch,
  type AdminImportBatchStatus,
  type AdminImportBatchType,
  type AdminImportBundleType,
  type AdminImportSubmissionResult,
  fetchImportBatches,
  formatBatchErrorsForClipboard,
  getBatchDetailRows,
  getDefaultExpandedBatchId,
  getBatchErrorDetails,
  parseBundleInput,
  submitImportBundle,
} from "@/lib/admin-imports";

const QUERY_KEY = ["admin-import-batches"] as const;

const bundleLabels: Record<AdminImportBundleType, string> = {
  question_bundle: "题目内容包",
  prebuilt_paper_bundle: "预制卷内容包",
};

const batchTypeLabels: Record<AdminImportBatchType, string> = {
  question_bundle: "题目内容包",
  prebuilt_paper_bundle: "预制卷内容包",
  manual_question_import: "手工题目导入",
};

type BatchTypeFilter = AdminImportBatchType | "all";
type BatchStatusFilter = AdminImportBatchStatus | "all";

const bundlePlaceholders: Record<AdminImportBundleType, string> = {
  question_bundle: `{
  "meta": {
    "bundleType": "question_bundle",
    "schemaVersion": "2026-04-26.1",
    "runId": "2026-04-25-step3-llm-csp-j-easy-v01",
    "createdAt": "2026-04-25T00:00:00.000Z",
    "generatedAt": "2026-04-25T00:00:00.000Z",
    "provider": "openai_compatible",
    "model": "model-name",
    "promptHash": "<64-char sha256>",
    "sourceBatchId": "generate-question-bundle-v1:CSP-J:single_choice:BAS:easy:2026-04-25T00:00:00.000Z",
    "sourceBatchIds": [
      "generate-question-bundle-v1:CSP-J:single_choice:BAS:easy:2026-04-25T00:00:00.000Z"
    ],
    "sourceTimestamp": "2026-04-25T00:00:00.000Z",
    "examType": "CSP-J",
    "questionType": "single_choice",
    "primaryKpCode": "BAS",
    "difficulty": "easy",
    "requestedCount": 10
  },
  "items": []
}`,
  prebuilt_paper_bundle: `{
  "meta": {
    "bundleType": "prebuilt_paper_bundle",
    "schemaVersion": "2026-04-26.1",
    "runId": "2026-04-25-prebuilt-csp-j-easy-v01",
    "createdAt": "2026-04-25T00:00:00.000Z",
    "builtAt": "2026-04-25T00:00:00.000Z",
    "sourceBatchId": "prebuilt-paper-builder-v1:CSP-J:easy:2026-04-25T00:00:00.000Z",
    "sourceBatchIds": [
      "prebuilt-paper-builder-v1:CSP-J:easy:2026-04-25T00:00:00.000Z"
    ],
    "sourceTimestamp": "2026-04-25T00:00:00.000Z",
    "examType": "CSP-J",
    "difficulty": "easy",
    "requestedCount": 5,
    "blueprintVersion": 1
  },
  "items": []
}`,
};

const statusLabels: Record<AdminImportBatchStatus, string> = {
  dry_run: "预演",
  processing: "处理中",
  applied: "已应用",
  partial_failed: "部分失败",
  failed: "失败",
};

const statusVariants: Record<
  AdminImportBatchStatus,
  "secondary" | "outline" | "destructive" | "default"
> = {
  dry_run: "outline",
  processing: "secondary",
  applied: "default",
  partial_failed: "secondary",
  failed: "destructive",
};

function formatTimestamp(value?: string) {
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

function renderSummary(
  summary?: AdminImportBatch["summaryJson"] | AdminImportSubmissionResult["summary"],
) {
  if (!summary) {
    return "-";
  }

  return `${summary.importedCount}/${summary.totalCount}，拒绝 ${summary.rejectedCount}`;
}

function BundleResultCard({
  bundleType,
  result,
  parseError,
}: {
  bundleType: AdminImportBundleType;
  result?: AdminImportSubmissionResult;
  parseError?: string;
}) {
  return (
    <Card className="h-full" variant="flat">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <FileJson className="text-primary h-4 w-4" />
          {bundleLabels[bundleType]} 回显
        </CardTitle>
        <CardDescription>展示最近一次预演或入库结果，优先暴露数据结构错误。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {parseError ? (
          <div className="border-destructive/40 bg-destructive/5 text-destructive rounded-[var(--radius-md)] border p-3">
            {parseError}
          </div>
        ) : null}

        {result ? (
          <>
            <div className="flex items-center gap-2">
              <Badge variant={statusVariants[result.status]}>{statusLabels[result.status]}</Badge>
              <span className="text-muted-foreground">{result.sourceFilename}</span>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="border-border bg-subtle/40 rounded-[var(--radius-md)] border p-3">
                <div className="text-muted-foreground text-xs tracking-wide uppercase">已接受</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">
                  {result.summary.importedCount}
                </div>
              </div>
              <div className="border-border bg-subtle/40 rounded-[var(--radius-md)] border p-3">
                <div className="text-muted-foreground text-xs tracking-wide uppercase">拒绝数</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">
                  {result.summary.rejectedCount}
                </div>
              </div>
              <div className="border-border bg-subtle/40 rounded-[var(--radius-md)] border p-3">
                <div className="text-muted-foreground text-xs tracking-wide uppercase">总条数</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">
                  {result.summary.totalCount}
                </div>
              </div>
            </div>

            <div className="border-border bg-subtle/20 text-muted-foreground rounded-[var(--radius-md)] border p-3 font-mono text-xs">
              校验指纹：{result.checksum}
            </div>

            {result.summary.errors.length > 0 ? (
              <ScrollArea className="border-border bg-subtle/10 h-40 rounded-[var(--radius-md)] border p-3">
                <div className="space-y-2 font-mono text-xs">
                  {result.summary.errors.map((error, index) => (
                    <div
                      key={`${error.code}-${index}`}
                      className="border-border/70 rounded-[var(--radius-sm)] border p-2"
                    >
                      <div className="text-foreground font-semibold">{error.code}</div>
                      <div className="text-muted-foreground mt-1">{error.message}</div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="border-border bg-subtle/20 text-muted-foreground rounded-[var(--radius-md)] border p-3">
                当前返回没有错误条目。
              </div>
            )}
          </>
        ) : (
          <div className="border-border text-muted-foreground rounded-[var(--radius-md)] border border-dashed p-4">
            粘贴一份离线内容 JSON 后执行预演或入库，这里会显示最新结果。
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminImports() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<AdminImportBundleType>("question_bundle");
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);
  const [bundleTypeFilter, setBundleTypeFilter] = useState<BatchTypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<BatchStatusFilter>("all");
  const [drafts, setDrafts] = useState<Record<AdminImportBundleType, string>>({
    question_bundle: "",
    prebuilt_paper_bundle: "",
  });
  const [parseErrors, setParseErrors] = useState<Partial<Record<AdminImportBundleType, string>>>(
    {},
  );
  const [results, setResults] = useState<
    Partial<Record<AdminImportBundleType, AdminImportSubmissionResult>>
  >({});

  const batchesQuery = useQuery({
    queryKey: [...QUERY_KEY, bundleTypeFilter, statusFilter] as const,
    queryFn: () =>
      fetchImportBatches({
        page: 1,
        pageSize: 10,
        bundleType: bundleTypeFilter === "all" ? undefined : bundleTypeFilter,
        status: statusFilter === "all" ? undefined : statusFilter,
      }),
  });

  useEffect(() => {
    const items = batchesQuery.data?.items;
    if (!items) {
      return;
    }

    setExpandedBatchId((current) => {
      if (current && items.some((batch) => batch.id === current)) {
        return current;
      }

      return getDefaultExpandedBatchId(items);
    });
  }, [batchesQuery.data]);

  const importMutation = useMutation({
    mutationFn: async ({
      bundleType,
      action,
      bundle,
    }: {
      bundleType: AdminImportBundleType;
      action: "dry-run" | "apply";
      bundle: Record<string, unknown>;
    }) => {
      const response = await submitImportBundle(bundleType, action, bundle);
      return { bundleType, action, response };
    },
    onSuccess: ({ bundleType, action, response }) => {
      startTransition(() => {
        setResults((current) => ({
          ...current,
          [bundleType]: response,
        }));
      });
      setParseErrors((current) => ({
        ...current,
        [bundleType]: undefined,
      }));
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success(
        action === "dry-run"
          ? `${bundleLabels[bundleType]}预演已完成`
          : `${bundleLabels[bundleType]}入库已完成`,
      );
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "导入请求失败");
    },
  });

  async function handleSubmit(bundleType: AdminImportBundleType, action: "dry-run" | "apply") {
    try {
      const bundle = parseBundleInput(drafts[bundleType], bundleType);
      setParseErrors((current) => ({
        ...current,
        [bundleType]: undefined,
      }));
      await importMutation.mutateAsync({ bundleType, action, bundle });
    } catch (error) {
      const message = error instanceof Error ? error.message : "内容包解析失败";
      setParseErrors((current) => ({
        ...current,
        [bundleType]: message,
      }));
      toast.error(message);
    }
  }

  function isSubmitting(bundleType: AdminImportBundleType, action: "dry-run" | "apply") {
    return (
      importMutation.isPending &&
      importMutation.variables?.bundleType === bundleType &&
      importMutation.variables?.action === action
    );
  }

  async function handleCopyBatchErrors(batch: AdminImportBatch) {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      toast.error("当前环境不支持剪贴板写入");
      return;
    }

    try {
      await navigator.clipboard.writeText(formatBatchErrorsForClipboard(batch));
      toast.success("错误明细已复制");
    } catch {
      toast.error("复制错误明细失败");
    }
  }

  function handlePrepareRepair(batch: AdminImportBatch) {
    if (batch.bundleType === "manual_question_import") {
      toast.error("手工题目导入不支持在离线内容面板中重新导入");
      return;
    }

    setActiveTab(batch.bundleType);
    setParseErrors((current) => ({
      ...current,
      [batch.bundleType]: undefined,
    }));
    setResults((current) => ({
      ...current,
      [batch.bundleType]: undefined,
    }));
    toast.success("已切换到对应内容包面板，修复 JSON 后先预演再入库");
  }

  const activeResult = results[activeTab];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">导入中心</h1>
          <p className="text-muted-foreground mt-2 max-w-3xl text-sm">
            运营侧粘贴离线生成的完整
            JSON，服务端会校验完整性、记录导入批次，并按“先预演、再入库”的节奏处理。
          </p>
        </div>

        <div className="flex gap-3">
          <Card variant="stat" className="min-w-36">
            <CardHeader className="pb-2">
              <CardDescription>最近批次</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold tabular-nums">
                {batchesQuery.data?.pagination.total ?? 0}
              </div>
            </CardContent>
          </Card>
          <Card variant="stat" className="min-w-36">
            <CardHeader className="pb-2">
              <CardDescription>当前视图</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-foreground text-sm font-semibold">{bundleLabels[activeTab]}</div>
              <div className="text-muted-foreground mt-1 text-xs">离线内容统一处理</div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.85fr)]">
        <Card className="min-w-0" variant="flat">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Upload className="text-primary h-4 w-4" />
              离线内容提交
            </CardTitle>
            <CardDescription>
              直接粘贴题目或预制卷 JSON。客户端只做基础解析，真正的结构校验和业务规则由服务端执行。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs
              value={activeTab}
              onValueChange={(value) => setActiveTab(value as AdminImportBundleType)}
            >
              <TabsList>
                <TabsTrigger value="question_bundle">题目内容包</TabsTrigger>
                <TabsTrigger value="prebuilt_paper_bundle">预制卷内容包</TabsTrigger>
              </TabsList>

              <TabsContent value="question_bundle" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="question-bundle-json">题目内容包 JSON</Label>
                  <Textarea
                    id="question-bundle-json"
                    className="min-h-[320px] font-mono text-xs"
                    placeholder={bundlePlaceholders.question_bundle}
                    error={Boolean(parseErrors.question_bundle)}
                    value={drafts.question_bundle}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        question_bundle: event.target.value,
                      }))
                    }
                  />
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="secondary"
                    loading={isSubmitting("question_bundle", "dry-run")}
                    onClick={() => handleSubmit("question_bundle", "dry-run")}
                  >
                    预演
                  </Button>
                  <Button
                    loading={isSubmitting("question_bundle", "apply")}
                    onClick={() => handleSubmit("question_bundle", "apply")}
                  >
                    入库
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="prebuilt_paper_bundle" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="prebuilt-paper-bundle-json">预制卷内容包 JSON</Label>
                  <Textarea
                    id="prebuilt-paper-bundle-json"
                    className="min-h-[320px] font-mono text-xs"
                    placeholder={bundlePlaceholders.prebuilt_paper_bundle}
                    error={Boolean(parseErrors.prebuilt_paper_bundle)}
                    value={drafts.prebuilt_paper_bundle}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        prebuilt_paper_bundle: event.target.value,
                      }))
                    }
                  />
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="secondary"
                    loading={isSubmitting("prebuilt_paper_bundle", "dry-run")}
                    onClick={() => handleSubmit("prebuilt_paper_bundle", "dry-run")}
                  >
                    预演
                  </Button>
                  <Button
                    loading={isSubmitting("prebuilt_paper_bundle", "apply")}
                    onClick={() => handleSubmit("prebuilt_paper_bundle", "apply")}
                  >
                    入库
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <BundleResultCard
          bundleType={activeTab}
          result={activeResult}
          parseError={parseErrors[activeTab]}
        />
      </div>

      <Card variant="flat">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <RefreshCcw className="text-primary h-4 w-4" />
              最近导入批次
            </CardTitle>
            <CardDescription>读取最近 10 条导入记录，用于核对预演和入库结果。</CardDescription>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select
              value={bundleTypeFilter}
              onValueChange={(value) => setBundleTypeFilter(value as BatchTypeFilter)}
            >
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="筛选内容类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部内容类型</SelectItem>
                <SelectItem value="question_bundle">题目内容包</SelectItem>
                <SelectItem value="prebuilt_paper_bundle">预制卷内容包</SelectItem>
                <SelectItem value="manual_question_import">手工题目导入</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as BatchStatusFilter)}
            >
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="筛选状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="dry_run">预演</SelectItem>
                <SelectItem value="processing">处理中</SelectItem>
                <SelectItem value="applied">已应用</SelectItem>
                <SelectItem value="partial_failed">部分失败</SelectItem>
                <SelectItem value="failed">失败</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="ghost" size="sm" onClick={() => void batchesQuery.refetch()}>
              刷新
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="outline">题目内容包</Badge>
            <Badge variant="outline">预制卷内容包</Badge>
            <Separator orientation="vertical" className="h-4" />
            <span>
              统一读取离线内容流程的批次摘要，支持按类型/状态过滤，并默认展开最近失败批次。
            </span>
          </div>

          {batchesQuery.isLoading ? (
            <div className="border-border text-muted-foreground rounded-[var(--radius-md)] border p-4 text-sm">
              正在加载导入批次列表…
            </div>
          ) : batchesQuery.isError ? (
            <div className="border-destructive/40 bg-destructive/5 text-destructive rounded-[var(--radius-md)] border p-4 text-sm">
              {batchesQuery.error instanceof Error
                ? batchesQuery.error.message
                : "批次列表加载失败"}
            </div>
          ) : batchesQuery.data && batchesQuery.data.items.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>内容类型</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>来源文件</TableHead>
                  <TableHead>摘要</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead className="w-28 text-right">详情</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batchesQuery.data.items.map((batch) => {
                  const isExpanded = expandedBatchId === batch.id;
                  const detailRows = getBatchDetailRows(batch);
                  const errorDetails = getBatchErrorDetails(batch);

                  return (
                    <Fragment key={batch.id}>
                      <TableRow className={isExpanded ? "bg-subtle/20" : undefined}>
                        <TableCell>
                          <div className="text-foreground font-medium">
                            {batchTypeLabels[batch.bundleType]}
                          </div>
                          <div className="text-muted-foreground mt-1 font-mono text-xs">
                            {batch.checksum.slice(0, 12)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusVariants[batch.status]}>
                            {statusLabels[batch.status]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {batch.sourceFilename}
                        </TableCell>
                        <TableCell className="text-muted-foreground tabular-nums">
                          {renderSummary(batch.summaryJson)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatTimestamp(batch.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setExpandedBatchId((current) =>
                                current === batch.id ? null : batch.id,
                              )
                            }
                          >
                            {isExpanded ? (
                              <>
                                收起
                                <ChevronUp className="h-4 w-4" />
                              </>
                            ) : (
                              <>
                                查看
                                <ChevronDown className="h-4 w-4" />
                              </>
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>

                      {isExpanded ? (
                        <TableRow className="bg-subtle/10">
                          <TableCell colSpan={6} className="p-0">
                            <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                              <div className="space-y-4">
                                <div>
                                  <div className="text-foreground text-sm font-semibold">
                                    批次详情
                                  </div>
                                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                    {detailRows.map((detail) => (
                                      <div
                                        key={detail.label}
                                        className="border-border bg-background/70 rounded-[var(--radius-md)] border p-3"
                                      >
                                        <div className="text-muted-foreground text-[11px] tracking-wide uppercase">
                                          {detail.label}
                                        </div>
                                        <div className="text-foreground mt-1 font-mono text-xs break-all">
                                          {detail.value}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                <div className="grid gap-3 md:grid-cols-3">
                                  <div className="border-border bg-background/70 rounded-[var(--radius-md)] border p-3">
                                    <div className="text-muted-foreground text-xs tracking-wide uppercase">
                                      总条数
                                    </div>
                                    <div className="mt-1 text-2xl font-semibold tabular-nums">
                                      {batch.summaryJson?.totalCount ?? 0}
                                    </div>
                                  </div>
                                  <div className="border-border bg-background/70 rounded-[var(--radius-md)] border p-3">
                                    <div className="text-muted-foreground text-xs tracking-wide uppercase">
                                      已导入
                                    </div>
                                    <div className="mt-1 text-2xl font-semibold tabular-nums">
                                      {batch.summaryJson?.importedCount ?? 0}
                                    </div>
                                  </div>
                                  <div className="border-border bg-background/70 rounded-[var(--radius-md)] border p-3">
                                    <div className="text-muted-foreground text-xs tracking-wide uppercase">
                                      已拒绝
                                    </div>
                                    <div className="mt-1 text-2xl font-semibold tabular-nums">
                                      {batch.summaryJson?.rejectedCount ?? 0}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div className="space-y-3">
                                <div className="flex items-center justify-between gap-2">
                                  <div>
                                    <div className="text-foreground text-sm font-semibold">
                                      错误明细
                                    </div>
                                    <div className="text-muted-foreground text-xs">
                                      展示服务端返回的错误项，便于定位内容包中的坏数据。
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {errorDetails.length > 0 ? (
                                      <>
                                        <Button
                                          variant="secondary"
                                          size="sm"
                                          onClick={() => handlePrepareRepair(batch)}
                                        >
                                          <Upload className="h-4 w-4" />
                                          修复重试
                                        </Button>
                                        <Button
                                          variant="secondary"
                                          size="sm"
                                          onClick={() => void handleCopyBatchErrors(batch)}
                                        >
                                          <Copy className="h-4 w-4" />
                                          复制
                                        </Button>
                                      </>
                                    ) : null}
                                    <Badge
                                      variant={errorDetails.length > 0 ? "secondary" : "outline"}
                                    >
                                      {errorDetails.length} 条
                                    </Badge>
                                  </div>
                                </div>

                                {errorDetails.length > 0 ? (
                                  <ScrollArea className="border-border bg-background/70 h-64 rounded-[var(--radius-md)] border p-3">
                                    <div className="space-y-3">
                                      {errorDetails.map((error) => (
                                        <div
                                          key={error.key}
                                          className="border-border/80 rounded-[var(--radius-md)] border p-3"
                                        >
                                          <div className="flex flex-wrap items-center gap-2">
                                            <Badge variant="outline">{error.code}</Badge>
                                            {typeof error.itemIndex === "number" ? (
                                              <span className="text-muted-foreground font-mono text-xs">
                                                第 {error.itemIndex} 项
                                              </span>
                                            ) : null}
                                          </div>
                                          <div className="text-foreground mt-2 text-sm">
                                            {error.message}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </ScrollArea>
                                ) : (
                                  <div className="border-border text-muted-foreground rounded-[var(--radius-md)] border border-dashed p-4 text-sm">
                                    这一批次没有错误条目，可直接依据摘要判断预演或入库结果。
                                  </div>
                                )}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="border-border text-muted-foreground rounded-[var(--radius-md)] border border-dashed p-4 text-sm">
              暂无导入批次记录。
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
