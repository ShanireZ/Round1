import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, CheckCircle2, RefreshCcw, Save, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { Textarea } from "@/components/ui/textarea";
import {
  type AdminQuestionPayload,
  type Difficulty,
  type QuestionSource,
  type QuestionStatus,
  type QuestionType,
  archiveAdminQuestion,
  createAdminQuestion,
  deleteAdminQuestion,
  fetchAdminQuestion,
  fetchAdminQuestionReferences,
  fetchAdminQuestions,
  parseJsonObject,
  publishAdminQuestion,
  stringifyJson,
  updateAdminQuestion,
} from "@/lib/admin-content";

type QuestionFilterStatus = QuestionStatus | "all";
type QuestionFilterType = QuestionType | "all";
type QuestionFilterDifficulty = Difficulty | "all";
type QuestionFilterSource = QuestionSource | "all";

const questionTypeLabels: Record<QuestionType, string> = {
  single_choice: "单选",
  reading_program: "阅读程序",
  completion_program: "完善程序",
};

const difficultyLabels: Record<Difficulty, string> = {
  easy: "简单",
  medium: "中等",
  hard: "困难",
};

const sourceLabels: Record<QuestionSource, string> = {
  ai: "AI",
  manual: "手工",
  real_paper: "真题",
};

const statusLabels: Record<QuestionStatus, string> = {
  draft: "草稿",
  reviewed: "已审核",
  published: "已发布",
  archived: "已归档",
};

const statusVariants: Record<QuestionStatus, "secondary" | "outline" | "destructive" | "default"> =
  {
    draft: "outline",
    reviewed: "secondary",
    published: "default",
    archived: "secondary",
  };

const questionCreatePlaceholder = `{
  "type": "single_choice",
  "difficulty": "easy",
  "primaryKpId": 101,
  "auxiliaryKpIds": [],
  "examTypes": ["CSP-J"],
  "contentHash": "manual-question-hash",
  "contentJson": { "stem": "题干", "options": ["A", "B", "C", "D"] },
  "answerJson": { "answer": "A" },
  "explanationJson": { "explanation": "解析" },
  "source": "manual",
  "sandboxVerified": false
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

function parseExamTypes(raw: string) {
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function AdminQuestionLibrary() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<QuestionFilterType>("all");
  const [difficultyFilter, setDifficultyFilter] = useState<QuestionFilterDifficulty>("all");
  const [statusFilter, setStatusFilter] = useState<QuestionFilterStatus>("all");
  const [sourceFilter, setSourceFilter] = useState<QuestionFilterSource>("all");
  const [createDraft, setCreateDraft] = useState("");

  const [editState, setEditState] = useState({
    difficulty: "easy" as Difficulty,
    source: "manual" as QuestionSource,
    primaryKpId: "101",
    examTypes: "CSP-J",
    contentHash: "",
    sandboxVerified: "false",
    contentJson: "{}",
    answerJson: "{}",
    explanationJson: "{}",
  });

  const questionsQuery = useQuery({
    queryKey: [
      "admin-questions",
      typeFilter,
      difficultyFilter,
      statusFilter,
      sourceFilter,
    ] as const,
    queryFn: () =>
      fetchAdminQuestions({
        page: 1,
        pageSize: 20,
        questionType: typeFilter,
        difficulty: difficultyFilter,
        status: statusFilter,
        source: sourceFilter,
      }),
  });

  const detailQuery = useQuery({
    queryKey: ["admin-question-detail", selectedId] as const,
    queryFn: () => fetchAdminQuestion(selectedId ?? ""),
    enabled: Boolean(selectedId),
  });

  const referencesQuery = useQuery({
    queryKey: ["admin-question-references", selectedId] as const,
    queryFn: () => fetchAdminQuestionReferences(selectedId ?? ""),
    enabled: Boolean(selectedId),
  });

  useEffect(() => {
    const firstId = questionsQuery.data?.items[0]?.id;
    if (!selectedId && firstId) {
      setSelectedId(firstId);
    }
  }, [questionsQuery.data?.items, selectedId]);

  useEffect(() => {
    const detail = detailQuery.data;
    if (!detail) {
      return;
    }

    setEditState({
      difficulty: detail.difficulty,
      source: detail.source,
      primaryKpId: String(detail.primaryKpId),
      examTypes: detail.examTypes.join(", "),
      contentHash: detail.contentHash,
      sandboxVerified: String(detail.sandboxVerified),
      contentJson: stringifyJson(detail.contentJson),
      answerJson: stringifyJson(detail.answerJson),
      explanationJson: stringifyJson(detail.explanationJson),
    });
  }, [detailQuery.data]);

  const selectedQuestion = detailQuery.data;
  const references = referencesQuery.data;
  const selectedCanEdit = selectedQuestion?.status === "draft";
  const selectedCanPublish = selectedQuestion?.status === "reviewed";
  const selectedCanArchive = selectedQuestion?.status === "published";
  const selectedCanDelete = selectedQuestion?.status === "draft" && references?.canDelete === true;
  const questionDeleteHint =
    selectedQuestion?.status === "draft"
      ? referencesQuery.isLoading
        ? "正在检查引用。"
        : references?.canDelete === true
          ? "未被引用的草稿题目可硬删除。"
          : references
            ? "已有引用的草稿题目不能硬删除。"
            : "引用信息未加载，暂不能硬删除。"
      : "仅未被引用的草稿题目可硬删除。";
  const questionLifecycleHint =
    selectedQuestion?.status === "draft"
      ? "草稿题目需先确认到已审核状态才能发布。"
      : selectedQuestion?.status === "reviewed"
        ? "已审核题目可发布，发布后只允许归档。"
        : selectedQuestion?.status === "published"
          ? "已发布题目不能原地编辑，只允许归档。"
          : selectedQuestion?.status === "archived"
            ? "已归档题目已退出投放，不能再次发布。"
            : "";

  const listSummary = useMemo(() => {
    const total = questionsQuery.data?.pagination.total ?? 0;
    const pageCount = questionsQuery.data?.items.length ?? 0;
    return `${pageCount}/${total}`;
  }, [questionsQuery.data]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const parsed = parseJsonObject(createDraft, "新建题目");
      return createAdminQuestion(parsed as Required<AdminQuestionPayload>);
    },
    onSuccess: (created) => {
      setCreateDraft("");
      setSelectedId(created.id);
      void queryClient.invalidateQueries({ queryKey: ["admin-questions"] });
      toast.success("题目草稿已创建");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "题目创建失败");
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedQuestion) {
        throw new Error("请先选择题目");
      }

      const payload: AdminQuestionPayload = {
        difficulty: editState.difficulty,
        primaryKpId: Number(editState.primaryKpId),
        examTypes: parseExamTypes(editState.examTypes),
        contentHash: editState.contentHash,
        contentJson: parseJsonObject(editState.contentJson, "题面 JSON"),
        answerJson: parseJsonObject(editState.answerJson, "答案 JSON"),
        explanationJson: parseJsonObject(editState.explanationJson, "解析 JSON"),
        source: editState.source,
        sandboxVerified: editState.sandboxVerified === "true",
      };

      return updateAdminQuestion(selectedQuestion.id, payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-questions"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-question-detail", selectedId] });
      toast.success("题目草稿已保存");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "题目保存失败");
    },
  });

  const lifecycleMutation = useMutation({
    mutationFn: async (action: "publish" | "archive" | "delete") => {
      if (!selectedQuestion) {
        throw new Error("请先选择题目");
      }

      if (action === "publish") {
        return publishAdminQuestion(selectedQuestion.id);
      }

      if (action === "archive") {
        return archiveAdminQuestion(selectedQuestion.id);
      }

      return deleteAdminQuestion(selectedQuestion.id);
    },
    onSuccess: (_result, action) => {
      void queryClient.invalidateQueries({ queryKey: ["admin-questions"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-question-detail", selectedId] });
      void queryClient.invalidateQueries({ queryKey: ["admin-question-references", selectedId] });
      toast.success(action === "delete" ? "题目已删除" : "题目状态已更新");
      if (action === "delete") {
        setSelectedId(null);
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "题目操作失败");
    },
  });

  const runLifecycleAction = (action: "publish" | "archive" | "delete") => {
    if (!selectedQuestion) {
      return;
    }

    const confirmMessages = {
      publish: `确认发布题目 ${selectedQuestion.id.slice(0, 8)}？发布后不能原地编辑。`,
      archive: `确认归档题目 ${selectedQuestion.id.slice(0, 8)}？归档后不会进入新试卷选择。`,
      delete: `确认硬删除草稿题目 ${selectedQuestion.id.slice(0, 8)}？此操作不可撤销。`,
    };

    if (window.confirm(confirmMessages[action])) {
      lifecycleMutation.mutate(action);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">题库管理</h1>
          <p className="text-muted-foreground mt-2 max-w-3xl text-sm">
            按题型、难度、状态和来源筛选题库资产，处理草稿编辑、发布、归档与引用核查。
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
              <RefreshCcw className="text-primary h-4 w-4" />
              题目列表
            </CardTitle>
            <CardDescription>选择一行后在右侧查看详情、引用摘要与生命周期操作。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <Select
                value={typeFilter}
                onValueChange={(value) => setTypeFilter(value as QuestionFilterType)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="题型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部题型</SelectItem>
                  <SelectItem value="single_choice">单选</SelectItem>
                  <SelectItem value="reading_program">阅读程序</SelectItem>
                  <SelectItem value="completion_program">完善程序</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={difficultyFilter}
                onValueChange={(value) => setDifficultyFilter(value as QuestionFilterDifficulty)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="难度" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部难度</SelectItem>
                  <SelectItem value="easy">简单</SelectItem>
                  <SelectItem value="medium">中等</SelectItem>
                  <SelectItem value="hard">困难</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={statusFilter}
                onValueChange={(value) => setStatusFilter(value as QuestionFilterStatus)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value="draft">草稿</SelectItem>
                  <SelectItem value="reviewed">已审核</SelectItem>
                  <SelectItem value="published">已发布</SelectItem>
                  <SelectItem value="archived">已归档</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={sourceFilter}
                onValueChange={(value) => setSourceFilter(value as QuestionFilterSource)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="来源" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部来源</SelectItem>
                  <SelectItem value="real_paper">真题</SelectItem>
                  <SelectItem value="manual">手工</SelectItem>
                  <SelectItem value="ai">AI</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {questionsQuery.isLoading ? (
              <div className="border-border text-muted-foreground rounded-[var(--radius-md)] border p-4 text-sm">
                正在加载题目列表...
              </div>
            ) : questionsQuery.isError ? (
              <div className="border-destructive/40 bg-destructive/5 text-destructive rounded-[var(--radius-md)] border p-4 text-sm">
                {questionsQuery.error instanceof Error
                  ? questionsQuery.error.message
                  : "题目列表加载失败"}
              </div>
            ) : questionsQuery.data && questionsQuery.data.items.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>题目</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>来源</TableHead>
                    <TableHead>沙箱校验</TableHead>
                    <TableHead>创建时间</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {questionsQuery.data.items.map((question) => (
                    <TableRow
                      key={question.id}
                      className={selectedId === question.id ? "bg-subtle/30" : "cursor-pointer"}
                      onClick={() => setSelectedId(question.id)}
                    >
                      <TableCell>
                        <div className="text-foreground font-medium">
                          {questionTypeLabels[question.type]}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-2">
                          <Badge variant="outline">{difficultyLabels[question.difficulty]}</Badge>
                          <span className="text-muted-foreground font-mono text-xs">
                            {question.id.slice(0, 8)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariants[question.status]}>
                          {statusLabels[question.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {sourceLabels[question.source]}
                      </TableCell>
                      <TableCell>
                        <Badge variant={question.sandboxVerified ? "default" : "outline"}>
                          {question.sandboxVerified ? "已校验" : "未校验"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatTimestamp(question.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="border-border text-muted-foreground rounded-[var(--radius-md)] border border-dashed p-4 text-sm">
                当前筛选下暂无题目。
              </div>
            )}

            <Separator />

            <div className="space-y-3">
              <div>
                <h2 className="text-foreground text-sm font-semibold">新建草稿</h2>
                <p className="text-muted-foreground mt-1 text-xs">
                  提交与题目创建结构一致的 JSON。
                </p>
              </div>
              <Textarea
                className="min-h-48 font-mono text-xs"
                placeholder={questionCreatePlaceholder}
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
            <CardTitle className="text-lg">详情与操作</CardTitle>
            <CardDescription>草稿支持原地编辑；已发布或归档题目只走生命周期操作。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selectedId ? (
              <div className="border-border text-muted-foreground rounded-[var(--radius-md)] border border-dashed p-4 text-sm">
                从左侧选择题目。
              </div>
            ) : detailQuery.isLoading ? (
              <div className="border-border text-muted-foreground rounded-[var(--radius-md)] border p-4 text-sm">
                正在加载题目详情...
              </div>
            ) : detailQuery.isError || !selectedQuestion ? (
              <div className="border-destructive/40 bg-destructive/5 text-destructive rounded-[var(--radius-md)] border p-4 text-sm">
                {detailQuery.error instanceof Error
                  ? detailQuery.error.message
                  : "题目详情加载失败"}
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={statusVariants[selectedQuestion.status]}>
                    {statusLabels[selectedQuestion.status]}
                  </Badge>
                  <Badge variant="outline">{questionTypeLabels[selectedQuestion.type]}</Badge>
                  <Badge variant="outline">{selectedQuestion.examTypes.join(", ")}</Badge>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="border-border bg-subtle/20 rounded-[var(--radius-md)] border p-3">
                    <div className="text-muted-foreground text-xs">预制卷引用</div>
                    <div className="mt-1 text-2xl font-semibold tabular-nums">
                      {references?.prebuiltPaperReferences ?? "-"}
                    </div>
                  </div>
                  <div className="border-border bg-subtle/20 rounded-[var(--radius-md)] border p-3">
                    <div className="text-muted-foreground text-xs">试卷实例</div>
                    <div className="mt-1 text-2xl font-semibold tabular-nums">
                      {references?.paperInstanceReferences ?? "-"}
                    </div>
                  </div>
                  <div className="border-border bg-subtle/20 rounded-[var(--radius-md)] border p-3">
                    <div className="text-muted-foreground text-xs">可硬删</div>
                    <div className="mt-1 text-sm font-semibold">
                      {references?.canDelete ? "是" : "否"}
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="question-difficulty">难度</Label>
                    <Select
                      value={editState.difficulty}
                      disabled={!selectedCanEdit}
                      onValueChange={(value) =>
                        setEditState((current) => ({ ...current, difficulty: value as Difficulty }))
                      }
                    >
                      <SelectTrigger id="question-difficulty">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="easy">简单</SelectItem>
                        <SelectItem value="medium">中等</SelectItem>
                        <SelectItem value="hard">困难</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="question-source">来源</Label>
                    <Select
                      value={editState.source}
                      disabled={!selectedCanEdit}
                      onValueChange={(value) =>
                        setEditState((current) => ({ ...current, source: value as QuestionSource }))
                      }
                    >
                      <SelectTrigger id="question-source">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="real_paper">真题</SelectItem>
                        <SelectItem value="manual">手工</SelectItem>
                        <SelectItem value="ai">AI</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="question-primary-kp">主知识点</Label>
                    <Input
                      id="question-primary-kp"
                      disabled={!selectedCanEdit}
                      value={editState.primaryKpId}
                      onChange={(event) =>
                        setEditState((current) => ({ ...current, primaryKpId: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="question-exam-types">适用考试</Label>
                    <Input
                      id="question-exam-types"
                      disabled={!selectedCanEdit}
                      value={editState.examTypes}
                      onChange={(event) =>
                        setEditState((current) => ({ ...current, examTypes: event.target.value }))
                      }
                    />
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px]">
                  <div className="space-y-2">
                    <Label htmlFor="question-content-hash">内容指纹</Label>
                    <Input
                      id="question-content-hash"
                      disabled={!selectedCanEdit}
                      value={editState.contentHash}
                      onChange={(event) =>
                        setEditState((current) => ({ ...current, contentHash: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="question-sandbox">沙箱校验</Label>
                    <Select
                      value={editState.sandboxVerified}
                      disabled={!selectedCanEdit}
                      onValueChange={(value) =>
                        setEditState((current) => ({ ...current, sandboxVerified: value }))
                      }
                    >
                      <SelectTrigger id="question-sandbox">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">已校验</SelectItem>
                        <SelectItem value="false">未校验</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <ScrollArea className="h-[540px] pr-3">
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor="question-content-json">题面 JSON</Label>
                      <Textarea
                        id="question-content-json"
                        className="min-h-40 font-mono text-xs"
                        disabled={!selectedCanEdit}
                        value={editState.contentJson}
                        onChange={(event) =>
                          setEditState((current) => ({
                            ...current,
                            contentJson: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="question-answer-json">答案 JSON</Label>
                      <Textarea
                        id="question-answer-json"
                        className="min-h-32 font-mono text-xs"
                        disabled={!selectedCanEdit}
                        value={editState.answerJson}
                        onChange={(event) =>
                          setEditState((current) => ({
                            ...current,
                            answerJson: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="question-explanation-json">解析 JSON</Label>
                      <Textarea
                        id="question-explanation-json"
                        className="min-h-32 font-mono text-xs"
                        disabled={!selectedCanEdit}
                        value={editState.explanationJson}
                        onChange={(event) =>
                          setEditState((current) => ({
                            ...current,
                            explanationJson: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                </ScrollArea>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    disabled={!selectedCanEdit}
                    title={selectedCanEdit ? "保存草稿题目" : "仅草稿题目可编辑"}
                    loading={saveMutation.isPending}
                    onClick={() => saveMutation.mutate()}
                  >
                    <Save className="h-4 w-4" />
                    保存
                  </Button>
                  <Button
                    disabled={!selectedCanPublish}
                    title={selectedCanPublish ? "发布已审核题目" : "仅已审核题目可发布"}
                    loading={
                      lifecycleMutation.isPending && lifecycleMutation.variables === "publish"
                    }
                    onClick={() => runLifecycleAction("publish")}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    发布
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={!selectedCanArchive}
                    title={selectedCanArchive ? "归档已发布题目" : "仅已发布题目可归档"}
                    loading={
                      lifecycleMutation.isPending && lifecycleMutation.variables === "archive"
                    }
                    onClick={() => runLifecycleAction("archive")}
                  >
                    <Archive className="h-4 w-4" />
                    归档
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={!selectedCanDelete}
                    title={selectedCanDelete ? "删除未引用草稿题目" : questionDeleteHint}
                    loading={
                      lifecycleMutation.isPending && lifecycleMutation.variables === "delete"
                    }
                    onClick={() => runLifecycleAction("delete")}
                  >
                    <Trash2 className="h-4 w-4" />
                    删除
                  </Button>
                </div>
                <p className="text-muted-foreground text-xs">
                  {questionLifecycleHint} {questionDeleteHint}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
