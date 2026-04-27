import { Fragment, startTransition, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Copy, FileJson, RefreshCcw, Upload } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  question_bundle: "Question Bundle",
  prebuilt_paper_bundle: "Prebuilt Paper Bundle",
};

const batchTypeLabels: Record<AdminImportBatchType, string> = {
  question_bundle: "Question Bundle",
  prebuilt_paper_bundle: "Prebuilt Paper Bundle",
  manual_question_import: "Manual Question Import",
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
  dry_run: "Dry Run",
  processing: "Processing",
  applied: "Applied",
  partial_failed: "Partial Failed",
  failed: "Failed",
};

const statusVariants: Record<AdminImportBatchStatus, "secondary" | "outline" | "destructive" | "default"> = {
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

function renderSummary(summary?: AdminImportBatch["summaryJson"] | AdminImportSubmissionResult["summary"]) {
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
          <FileJson className="h-4 w-4 text-primary" />
          {bundleLabels[bundleType]} 回显
        </CardTitle>
        <CardDescription>展示最近一次 dry-run / apply 的返回摘要，优先暴露契约级错误。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {parseError ? (
          <div className="rounded-[--radius-md] border border-destructive/40 bg-destructive/5 p-3 text-destructive">
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
              <div className="rounded-[--radius-md] border border-border bg-subtle/40 p-3">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">已接受</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">{result.summary.importedCount}</div>
              </div>
              <div className="rounded-[--radius-md] border border-border bg-subtle/40 p-3">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">拒绝数</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">{result.summary.rejectedCount}</div>
              </div>
              <div className="rounded-[--radius-md] border border-border bg-subtle/40 p-3">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">总条数</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">{result.summary.totalCount}</div>
              </div>
            </div>

            <div className="rounded-[--radius-md] border border-border bg-subtle/20 p-3 font-mono text-xs text-muted-foreground">
              checksum: {result.checksum}
            </div>

            {result.summary.errors.length > 0 ? (
              <ScrollArea className="h-40 rounded-[--radius-md] border border-border bg-subtle/10 p-3">
                <div className="space-y-2 font-mono text-xs">
                  {result.summary.errors.map((error, index) => (
                    <div key={`${error.code}-${index}`} className="rounded-[--radius-sm] border border-border/70 p-2">
                      <div className="font-semibold text-foreground">{error.code}</div>
                      <div className="mt-1 text-muted-foreground">{error.message}</div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="rounded-[--radius-md] border border-border bg-subtle/20 p-3 text-muted-foreground">
                当前返回没有 error items。
              </div>
            )}
          </>
        ) : (
          <div className="rounded-[--radius-md] border border-dashed border-border p-4 text-muted-foreground">
            粘贴一份 raw bundle JSON 后执行 dry-run 或 apply，这里会显示最新结果。
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
  const [parseErrors, setParseErrors] = useState<Partial<Record<AdminImportBundleType, string>>>({});
  const [results, setResults] = useState<Partial<Record<AdminImportBundleType, AdminImportSubmissionResult>>>({});

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
          ? `${bundleLabels[bundleType]} dry-run 已完成`
          : `${bundleLabels[bundleType]} apply 已完成`,
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
      const message = error instanceof Error ? error.message : "bundle 解析失败";
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
      toast.error("manual_question_import 不支持在 raw bundle 面板中重新导入");
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
    toast.success("已切换到对应 bundle 面板，修复 JSON 后先 dry-run 再 apply");
  }

  const activeResult = results[activeTab];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">导入中心</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            这里直接对接 raw bundle 契约。运营侧粘贴离线生成的完整 JSON，服务端会计算 checksum、写入 import_batches，并复用离线 workflow 的 dry-run / apply 语义。
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
              <div className="text-sm font-semibold text-foreground">{bundleLabels[activeTab]}</div>
              <div className="mt-1 text-xs text-muted-foreground">raw bundle in, shared workflow out</div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.85fr)]">
        <Card className="min-w-0" variant="flat">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Upload className="h-4 w-4 text-primary" />
              Raw Bundle 提交
            </CardTitle>
            <CardDescription>
              直接粘贴 raw question bundle / prebuilt paper bundle JSON。客户端只做基础解析，真正的结构校验和业务规则仍由服务端 workflow 执行。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as AdminImportBundleType)}>
              <TabsList>
                <TabsTrigger value="question_bundle">Question Bundle</TabsTrigger>
                <TabsTrigger value="prebuilt_paper_bundle">Prebuilt Paper Bundle</TabsTrigger>
              </TabsList>

              <TabsContent value="question_bundle" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="question-bundle-json">question bundle JSON</Label>
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
                    Dry Run
                  </Button>
                  <Button
                    loading={isSubmitting("question_bundle", "apply")}
                    onClick={() => handleSubmit("question_bundle", "apply")}
                  >
                    Apply
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="prebuilt_paper_bundle" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="prebuilt-paper-bundle-json">prebuilt paper bundle JSON</Label>
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
                    Dry Run
                  </Button>
                  <Button
                    loading={isSubmitting("prebuilt_paper_bundle", "apply")}
                    onClick={() => handleSubmit("prebuilt_paper_bundle", "apply")}
                  >
                    Apply
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
              <RefreshCcw className="h-4 w-4 text-primary" />
              最近导入批次
            </CardTitle>
            <CardDescription>按 import_batches 读取最近 10 条记录，用于核对 dry-run / apply 的落库结果。</CardDescription>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select value={bundleTypeFilter} onValueChange={(value) => setBundleTypeFilter(value as BatchTypeFilter)}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="筛选 bundle type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部 bundle 类型</SelectItem>
                <SelectItem value="question_bundle">Question Bundle</SelectItem>
                <SelectItem value="prebuilt_paper_bundle">Prebuilt Paper Bundle</SelectItem>
                <SelectItem value="manual_question_import">Manual Question Import</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as BatchStatusFilter)}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="筛选状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="dry_run">Dry Run</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="applied">Applied</SelectItem>
                <SelectItem value="partial_failed">Partial Failed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="ghost" size="sm" onClick={() => void batchesQuery.refetch()}>
              刷新
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">question_bundle</Badge>
            <Badge variant="outline">prebuilt_paper_bundle</Badge>
            <Separator orientation="vertical" className="h-4" />
            <span>统一读取 raw bundle 流程的批次摘要，支持按类型/状态过滤，并默认展开最近失败批次。</span>
          </div>

          {batchesQuery.isLoading ? (
            <div className="rounded-[--radius-md] border border-border p-4 text-sm text-muted-foreground">
              正在加载 import batch 列表…
            </div>
          ) : batchesQuery.isError ? (
            <div className="rounded-[--radius-md] border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
              {batchesQuery.error instanceof Error ? batchesQuery.error.message : "批次列表加载失败"}
            </div>
          ) : batchesQuery.data && batchesQuery.data.items.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bundle</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Source</TableHead>
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
                          <div className="font-medium text-foreground">{batchTypeLabels[batch.bundleType]}</div>
                          <div className="mt-1 font-mono text-xs text-muted-foreground">{batch.checksum.slice(0, 12)}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusVariants[batch.status]}>{statusLabels[batch.status]}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{batch.sourceFilename}</TableCell>
                        <TableCell className="tabular-nums text-muted-foreground">
                          {renderSummary(batch.summaryJson)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{formatTimestamp(batch.createdAt)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setExpandedBatchId((current) => (current === batch.id ? null : batch.id))}
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
                                  <div className="text-sm font-semibold text-foreground">批次详情</div>
                                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                    {detailRows.map((detail) => (
                                      <div
                                        key={detail.label}
                                        className="rounded-[--radius-md] border border-border bg-background/70 p-3"
                                      >
                                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                          {detail.label}
                                        </div>
                                        <div className="mt-1 break-all font-mono text-xs text-foreground">
                                          {detail.value}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                <div className="grid gap-3 md:grid-cols-3">
                                  <div className="rounded-[--radius-md] border border-border bg-background/70 p-3">
                                    <div className="text-xs uppercase tracking-wide text-muted-foreground">总条数</div>
                                    <div className="mt-1 text-2xl font-semibold tabular-nums">
                                      {batch.summaryJson?.totalCount ?? 0}
                                    </div>
                                  </div>
                                  <div className="rounded-[--radius-md] border border-border bg-background/70 p-3">
                                    <div className="text-xs uppercase tracking-wide text-muted-foreground">已导入</div>
                                    <div className="mt-1 text-2xl font-semibold tabular-nums">
                                      {batch.summaryJson?.importedCount ?? 0}
                                    </div>
                                  </div>
                                  <div className="rounded-[--radius-md] border border-border bg-background/70 p-3">
                                    <div className="text-xs uppercase tracking-wide text-muted-foreground">已拒绝</div>
                                    <div className="mt-1 text-2xl font-semibold tabular-nums">
                                      {batch.summaryJson?.rejectedCount ?? 0}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div className="space-y-3">
                                <div className="flex items-center justify-between gap-2">
                                  <div>
                                    <div className="text-sm font-semibold text-foreground">错误明细</div>
                                    <div className="text-xs text-muted-foreground">
                                      展示 summary_json.errors 的原始错误项，便于定位 bundle 中的坏数据。
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
                                        <Button variant="secondary" size="sm" onClick={() => void handleCopyBatchErrors(batch)}>
                                          <Copy className="h-4 w-4" />
                                          复制
                                        </Button>
                                      </>
                                    ) : null}
                                    <Badge variant={errorDetails.length > 0 ? "secondary" : "outline"}>
                                      {errorDetails.length} 条
                                    </Badge>
                                  </div>
                                </div>

                                {errorDetails.length > 0 ? (
                                  <ScrollArea className="h-64 rounded-[--radius-md] border border-border bg-background/70 p-3">
                                    <div className="space-y-3">
                                      {errorDetails.map((error) => (
                                        <div key={error.key} className="rounded-[--radius-md] border border-border/80 p-3">
                                          <div className="flex flex-wrap items-center gap-2">
                                            <Badge variant="outline">{error.code}</Badge>
                                            {typeof error.itemIndex === "number" ? (
                                              <span className="font-mono text-xs text-muted-foreground">
                                                item #{error.itemIndex}
                                              </span>
                                            ) : null}
                                          </div>
                                          <div className="mt-2 text-sm text-foreground">{error.message}</div>
                                        </div>
                                      ))}
                                    </div>
                                  </ScrollArea>
                                ) : (
                                  <div className="rounded-[--radius-md] border border-dashed border-border p-4 text-sm text-muted-foreground">
                                    这一批次没有 error items，可直接依据摘要判断 dry-run / apply 结果。
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
            <div className="rounded-[--radius-md] border border-dashed border-border p-4 text-sm text-muted-foreground">
              暂无 import batch 记录。
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
