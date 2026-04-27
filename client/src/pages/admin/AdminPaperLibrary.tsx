import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, CopyPlus, RefreshCcw, Save, Trash2, UploadCloud } from "lucide-react";
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
import { Input } from "@/components/ui/input";
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
import { Textarea } from "@/components/ui/textarea";
import {
  type AdminPrebuiltPaperPayload,
  type AdminPrebuiltPaperSlot,
  type Difficulty,
  type PrebuiltPaperStatus,
  archiveAdminPrebuiltPaper,
  copyAdminPrebuiltPaperVersion,
  createAdminPrebuiltPaper,
  deleteAdminPrebuiltPaper,
  fetchAdminPrebuiltPaper,
  fetchAdminPrebuiltPaperReferences,
  fetchAdminPrebuiltPapers,
  parseJsonObject,
  publishAdminPrebuiltPaper,
  stringifyJson,
  updateAdminPrebuiltPaper,
} from "@/lib/admin-content";

type PaperFilterStatus = PrebuiltPaperStatus | "all";
type PaperFilterDifficulty = Difficulty | "all";

const difficultyLabels: Record<Difficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

const statusLabels: Record<PrebuiltPaperStatus, string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};

const statusVariants: Record<PrebuiltPaperStatus, "secondary" | "outline" | "destructive" | "default"> = {
  draft: "outline",
  published: "default",
  archived: "secondary",
};

const paperCreatePlaceholder = `{
  "title": "CSP-J Easy Pack v1",
  "examType": "CSP-J",
  "difficulty": "easy",
  "blueprintVersion": 1,
  "metadataJson": { "source": "manual" },
  "slots": [
    {
      "slotNo": 1,
      "questionId": "11111111-1111-4111-8111-111111111111",
      "questionType": "single_choice",
      "primaryKpId": 101,
      "difficulty": "easy",
      "points": 5
    }
  ]
}`;

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

function parseSlots(raw: string) {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("slots 必须是 JSON array");
  }

  return parsed as AdminPrebuiltPaperSlot[];
}

export default function AdminPaperLibrary() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [examTypeFilter, setExamTypeFilter] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState<PaperFilterDifficulty>("all");
  const [statusFilter, setStatusFilter] = useState<PaperFilterStatus>("all");
  const [createDraft, setCreateDraft] = useState("");
  const [editState, setEditState] = useState({
    title: "",
    examType: "CSP-J",
    difficulty: "easy" as Difficulty,
    blueprintVersion: "1",
    metadataJson: "{}",
    slotsJson: "[]",
  });

  const papersQuery = useQuery({
    queryKey: ["admin-prebuilt-papers", examTypeFilter, difficultyFilter, statusFilter] as const,
    queryFn: () =>
      fetchAdminPrebuiltPapers({
        page: 1,
        pageSize: 20,
        examType: examTypeFilter.trim() || undefined,
        difficulty: difficultyFilter,
        status: statusFilter,
      }),
  });

  const detailQuery = useQuery({
    queryKey: ["admin-prebuilt-paper-detail", selectedId] as const,
    queryFn: () => fetchAdminPrebuiltPaper(selectedId ?? ""),
    enabled: Boolean(selectedId),
  });

  const referencesQuery = useQuery({
    queryKey: ["admin-prebuilt-paper-references", selectedId] as const,
    queryFn: () => fetchAdminPrebuiltPaperReferences(selectedId ?? ""),
    enabled: Boolean(selectedId),
  });

  useEffect(() => {
    const firstId = papersQuery.data?.items[0]?.id;
    if (!selectedId && firstId) {
      setSelectedId(firstId);
    }
  }, [papersQuery.data?.items, selectedId]);

  useEffect(() => {
    const detail = detailQuery.data;
    if (!detail) {
      return;
    }

    setEditState({
      title: detail.title,
      examType: detail.examType,
      difficulty: detail.difficulty,
      blueprintVersion: String(detail.blueprintVersion),
      metadataJson: stringifyJson(detail.metadataJson ?? {}),
      slotsJson: stringifyJson(detail.slots ?? []),
    });
  }, [detailQuery.data]);

  const selectedPaper = detailQuery.data;
  const references = referencesQuery.data;
  const selectedCanEdit = selectedPaper?.status === "draft";
  const selectedCanPublish = selectedPaper?.status === "draft";
  const selectedCanArchive = selectedPaper?.status === "published";
  const selectedCanCopy = selectedPaper?.status === "published" || selectedPaper?.status === "archived";
  const selectedCanDelete = selectedPaper?.status === "draft" && references?.canDelete === true;
  const paperDeleteHint =
    selectedPaper?.status === "draft"
      ? referencesQuery.isLoading
        ? "正在检查引用。"
        : references?.canDelete === true
          ? "未被引用的 draft 预制卷可硬删除。"
          : references
            ? "已有引用的 draft 预制卷不能硬删除。"
            : "引用信息未加载，暂不能硬删除。"
      : "仅未被引用的 draft 预制卷可硬删除。";
  const paperLifecycleHint =
    selectedPaper?.status === "draft"
      ? "Draft 预制卷可原地编辑和发布，不需要复制版本。"
      : selectedPaper?.status === "published"
        ? "Published 预制卷不能原地覆盖；修改请先复制新 draft，或归档旧版本。"
        : selectedPaper?.status === "archived"
          ? "Archived 预制卷已退出投放；可复制为新 draft。"
          : "";

  const listSummary = useMemo(() => {
    const total = papersQuery.data?.pagination.total ?? 0;
    const pageCount = papersQuery.data?.items.length ?? 0;
    return `${pageCount}/${total}`;
  }, [papersQuery.data]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const parsed = parseJsonObject(createDraft, "新建预制卷");
      return createAdminPrebuiltPaper(parsed as Required<AdminPrebuiltPaperPayload>);
    },
    onSuccess: (created) => {
      setCreateDraft("");
      setSelectedId(created.id);
      void queryClient.invalidateQueries({ queryKey: ["admin-prebuilt-papers"] });
      toast.success("draft 预制卷已创建");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "预制卷创建失败");
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPaper) {
        throw new Error("请先选择预制卷");
      }

      const payload: AdminPrebuiltPaperPayload = {
        title: editState.title,
        examType: editState.examType,
        difficulty: editState.difficulty,
        blueprintVersion: Number(editState.blueprintVersion),
        metadataJson: parseJsonObject(editState.metadataJson, "metadataJson"),
        slots: parseSlots(editState.slotsJson),
      };

      return updateAdminPrebuiltPaper(selectedPaper.id, payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-prebuilt-papers"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-prebuilt-paper-detail", selectedId] });
      toast.success("预制卷 draft 已保存");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "预制卷保存失败");
    },
  });

  const lifecycleMutation = useMutation({
    mutationFn: async (action: "publish" | "archive" | "delete" | "copy") => {
      if (!selectedPaper) {
        throw new Error("请先选择预制卷");
      }

      if (action === "publish") {
        return publishAdminPrebuiltPaper(selectedPaper.id);
      }

      if (action === "archive") {
        return archiveAdminPrebuiltPaper(selectedPaper.id);
      }

      if (action === "copy") {
        return copyAdminPrebuiltPaperVersion(selectedPaper.id);
      }

      return deleteAdminPrebuiltPaper(selectedPaper.id);
    },
    onSuccess: (result, action) => {
      void queryClient.invalidateQueries({ queryKey: ["admin-prebuilt-papers"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-prebuilt-paper-detail", selectedId] });
      void queryClient.invalidateQueries({ queryKey: ["admin-prebuilt-paper-references", selectedId] });
      toast.success(action === "copy" ? "已复制为新的 draft 版本" : "预制卷操作已完成");

      if (action === "delete") {
        setSelectedId(null);
        return;
      }

      if ("id" in result && action === "copy") {
        setSelectedId(result.id);
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "预制卷操作失败");
    },
  });

  const runLifecycleAction = (action: "publish" | "archive" | "delete" | "copy") => {
    if (!selectedPaper) {
      return;
    }

    const confirmMessages = {
      publish: `确认发布预制卷 ${selectedPaper.id.slice(0, 8)}？发布后不能原地编辑。`,
      archive: `确认归档预制卷 ${selectedPaper.id.slice(0, 8)}？归档后不会进入新试卷选择。`,
      delete: `确认硬删除 draft 预制卷 ${selectedPaper.id.slice(0, 8)}？此操作不可撤销。`,
      copy: `确认复制预制卷 ${selectedPaper.id.slice(0, 8)} 为新 draft 版本？`,
    };

    if (window.confirm(confirmMessages[action])) {
      lifecycleMutation.mutate(action);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">预制卷库</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            管理可发布的固定试卷版本。已发布内容不可原地覆盖，修改时复制为新 draft 后再发布。
          </p>
        </div>
        <Card variant="stat" className="min-w-36">
          <CardHeader className="pb-2">
            <CardDescription>当前列表</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tabular-nums">{listSummary}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <Card variant="flat" className="min-w-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <RefreshCcw className="h-4 w-4 text-primary" />
              预制卷列表
            </CardTitle>
            <CardDescription>筛选并进入详情，核对 lineage、slots 和运行时引用。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_180px]">
              <Input
                placeholder="Exam Type"
                value={examTypeFilter}
                onChange={(event) => setExamTypeFilter(event.target.value)}
              />

              <Select
                value={difficultyFilter}
                onValueChange={(value) => setDifficultyFilter(value as PaperFilterDifficulty)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="难度" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部难度</SelectItem>
                  <SelectItem value="easy">Easy</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="hard">Hard</SelectItem>
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as PaperFilterStatus)}>
                <SelectTrigger>
                  <SelectValue placeholder="状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {papersQuery.isLoading ? (
              <div className="rounded-[--radius-md] border border-border p-4 text-sm text-muted-foreground">
                正在加载预制卷列表...
              </div>
            ) : papersQuery.isError ? (
              <div className="rounded-[--radius-md] border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
                {papersQuery.error instanceof Error ? papersQuery.error.message : "预制卷列表加载失败"}
              </div>
            ) : papersQuery.data && papersQuery.data.items.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>预制卷</TableHead>
                    <TableHead>版本</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>发布</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {papersQuery.data.items.map((paper) => (
                    <TableRow
                      key={paper.id}
                      className={selectedId === paper.id ? "bg-subtle/30" : "cursor-pointer"}
                      onClick={() => setSelectedId(paper.id)}
                    >
                      <TableCell>
                        <div className="font-medium text-foreground">{paper.title}</div>
                        <div className="mt-1 flex flex-wrap gap-2">
                          <Badge variant="outline">{paper.examType}</Badge>
                          <Badge variant="outline">{difficultyLabels[paper.difficulty]}</Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-mono text-sm">v{paper.versionNo}</div>
                        <div className="mt-1 font-mono text-xs text-muted-foreground">
                          root {(paper.rootPaperId ?? paper.id).slice(0, 8)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariants[paper.status]}>{statusLabels[paper.status]}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatTimestamp(paper.publishedAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="rounded-[--radius-md] border border-dashed border-border p-4 text-sm text-muted-foreground">
                当前筛选下暂无预制卷。
              </div>
            )}

            <Separator />

            <div className="space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">新建 Draft</h2>
                <p className="mt-1 text-xs text-muted-foreground">提交与 Admin prebuilt paper create body 一致的 JSON。</p>
              </div>
              <Textarea
                className="min-h-56 font-mono text-xs"
                placeholder={paperCreatePlaceholder}
                value={createDraft}
                onChange={(event) => setCreateDraft(event.target.value)}
              />
              <Button loading={createMutation.isPending} onClick={() => createMutation.mutate()}>
                <UploadCloud className="h-4 w-4" />
                创建
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card variant="flat" className="min-w-0">
          <CardHeader>
            <CardTitle className="text-lg">详情与版本</CardTitle>
            <CardDescription>draft 可编辑；published 版本只能复制为新 draft。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selectedId ? (
              <div className="rounded-[--radius-md] border border-dashed border-border p-4 text-sm text-muted-foreground">
                从左侧选择预制卷。
              </div>
            ) : detailQuery.isLoading ? (
              <div className="rounded-[--radius-md] border border-border p-4 text-sm text-muted-foreground">
                正在加载预制卷详情...
              </div>
            ) : detailQuery.isError || !selectedPaper ? (
              <div className="rounded-[--radius-md] border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
                {detailQuery.error instanceof Error ? detailQuery.error.message : "预制卷详情加载失败"}
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={statusVariants[selectedPaper.status]}>{statusLabels[selectedPaper.status]}</Badge>
                  <Badge variant="outline">v{selectedPaper.versionNo}</Badge>
                  <Badge variant="outline">root {(selectedPaper.rootPaperId ?? selectedPaper.id).slice(0, 8)}</Badge>
                  {selectedPaper.parentPaperId ? (
                    <Badge variant="outline">parent {selectedPaper.parentPaperId.slice(0, 8)}</Badge>
                  ) : null}
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-[--radius-md] border border-border bg-subtle/20 p-3">
                    <div className="text-xs text-muted-foreground">试卷实例</div>
                    <div className="mt-1 text-2xl font-semibold tabular-nums">
                      {references?.paperInstanceReferences ?? "-"}
                    </div>
                  </div>
                  <div className="rounded-[--radius-md] border border-border bg-subtle/20 p-3">
                    <div className="text-xs text-muted-foreground">任务引用</div>
                    <div className="mt-1 text-2xl font-semibold tabular-nums">
                      {references?.assignmentReferences ?? "-"}
                    </div>
                  </div>
                  <div className="rounded-[--radius-md] border border-border bg-subtle/20 p-3">
                    <div className="text-xs text-muted-foreground">Slots</div>
                    <div className="mt-1 text-2xl font-semibold tabular-nums">{selectedPaper.slots.length}</div>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_140px]">
                  <div className="space-y-2">
                    <Label htmlFor="paper-title">标题</Label>
                    <Input
                      id="paper-title"
                      disabled={!selectedCanEdit}
                      value={editState.title}
                      onChange={(event) =>
                        setEditState((current) => ({ ...current, title: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="paper-blueprint">Blueprint</Label>
                    <Input
                      id="paper-blueprint"
                      disabled={!selectedCanEdit}
                      value={editState.blueprintVersion}
                      onChange={(event) =>
                        setEditState((current) => ({ ...current, blueprintVersion: event.target.value }))
                      }
                    />
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="paper-exam-type">Exam Type</Label>
                    <Input
                      id="paper-exam-type"
                      disabled={!selectedCanEdit}
                      value={editState.examType}
                      onChange={(event) =>
                        setEditState((current) => ({ ...current, examType: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="paper-difficulty">难度</Label>
                    <Select
                      value={editState.difficulty}
                      disabled={!selectedCanEdit}
                      onValueChange={(value) =>
                        setEditState((current) => ({ ...current, difficulty: value as Difficulty }))
                      }
                    >
                      <SelectTrigger id="paper-difficulty">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="easy">Easy</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="hard">Hard</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <ScrollArea className="h-[540px] pr-3">
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor="paper-metadata-json">metadataJson</Label>
                      <Textarea
                        id="paper-metadata-json"
                        className="min-h-32 font-mono text-xs"
                        disabled={!selectedCanEdit}
                        value={editState.metadataJson}
                        onChange={(event) =>
                          setEditState((current) => ({ ...current, metadataJson: event.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="paper-slots-json">slots</Label>
                      <Textarea
                        id="paper-slots-json"
                        className="min-h-72 font-mono text-xs"
                        disabled={!selectedCanEdit}
                        value={editState.slotsJson}
                        onChange={(event) =>
                          setEditState((current) => ({ ...current, slotsJson: event.target.value }))
                        }
                      />
                    </div>
                  </div>
                </ScrollArea>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    disabled={!selectedCanEdit}
                    title={selectedCanEdit ? "保存 draft 预制卷" : "仅 draft 预制卷可编辑"}
                    loading={saveMutation.isPending}
                    onClick={() => saveMutation.mutate()}
                  >
                    <Save className="h-4 w-4" />
                    保存
                  </Button>
                  <Button
                    disabled={!selectedCanPublish}
                    title={selectedCanPublish ? "发布 draft 预制卷" : "仅 draft 预制卷可发布"}
                    loading={lifecycleMutation.isPending && lifecycleMutation.variables === "publish"}
                    onClick={() => runLifecycleAction("publish")}
                  >
                    发布
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={!selectedCanCopy}
                    title={selectedCanCopy ? "复制为新 draft 版本" : "Draft 预制卷可直接编辑"}
                    loading={lifecycleMutation.isPending && lifecycleMutation.variables === "copy"}
                    onClick={() => runLifecycleAction("copy")}
                  >
                    <CopyPlus className="h-4 w-4" />
                    复制新版本
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={!selectedCanArchive}
                    title={selectedCanArchive ? "归档 published 预制卷" : "仅 published 预制卷可归档"}
                    loading={lifecycleMutation.isPending && lifecycleMutation.variables === "archive"}
                    onClick={() => runLifecycleAction("archive")}
                  >
                    <Archive className="h-4 w-4" />
                    归档
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={!selectedCanDelete}
                    title={selectedCanDelete ? "删除未引用 draft 预制卷" : paperDeleteHint}
                    loading={lifecycleMutation.isPending && lifecycleMutation.variables === "delete"}
                    onClick={() => runLifecycleAction("delete")}
                  >
                    <Trash2 className="h-4 w-4" />
                    删除
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {paperLifecycleHint} {paperDeleteHint}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
