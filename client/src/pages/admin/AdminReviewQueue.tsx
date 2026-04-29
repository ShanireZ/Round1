import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, RefreshCcw, XCircle } from "lucide-react";
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
  type ReviewStatus,
  confirmQuestionReview,
  fetchAdminQuestion,
  fetchQuestionReviews,
  rejectQuestionReview,
  stringifyJson,
} from "@/lib/admin-content";

type ReviewStatusFilter = ReviewStatus | "all";

const reviewLabels: Record<ReviewStatus, string> = {
  pending: "Pending",
  ai_reviewed: "AI Reviewed",
  confirmed: "Confirmed",
  rejected: "Rejected",
};

const reviewVariants: Record<ReviewStatus, "secondary" | "outline" | "destructive" | "default"> = {
  pending: "outline",
  ai_reviewed: "secondary",
  confirmed: "default",
  rejected: "destructive",
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

export default function AdminReviewQueue() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<ReviewStatusFilter>("all");
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const [reviewerNotes, setReviewerNotes] = useState("");

  const reviewsQuery = useQuery({
    queryKey: ["admin-question-reviews", statusFilter] as const,
    queryFn: () =>
      fetchQuestionReviews({
        page: 1,
        pageSize: 20,
        status: statusFilter,
      }),
  });

  const selectedReview = useMemo(
    () => reviewsQuery.data?.items.find((review) => review.id === selectedReviewId) ?? null,
    [reviewsQuery.data?.items, selectedReviewId],
  );

  const questionQuery = useQuery({
    queryKey: ["admin-review-question", selectedReview?.questionId] as const,
    queryFn: () => fetchAdminQuestion(selectedReview?.questionId ?? ""),
    enabled: Boolean(selectedReview?.questionId),
  });

  useEffect(() => {
    const firstId = reviewsQuery.data?.items[0]?.id;
    if (!selectedReviewId && firstId) {
      setSelectedReviewId(firstId);
    }
  }, [reviewsQuery.data?.items, selectedReviewId]);

  useEffect(() => {
    setReviewerNotes(selectedReview?.reviewerNotes ?? "");
  }, [selectedReview?.id, selectedReview?.reviewerNotes]);

  const actionMutation = useMutation({
    mutationFn: async (action: "confirm" | "reject") => {
      if (!selectedReview) {
        throw new Error("请先选择审核项");
      }

      if (action === "confirm") {
        return confirmQuestionReview(selectedReview.questionId);
      }

      return rejectQuestionReview(selectedReview.questionId, reviewerNotes);
    },
    onSuccess: (_result, action) => {
      void queryClient.invalidateQueries({ queryKey: ["admin-question-reviews"] });
      void queryClient.invalidateQueries({
        queryKey: ["admin-review-question", selectedReview?.questionId],
      });
      toast.success(action === "confirm" ? "审核已确认" : "审核已拒绝");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "审核操作失败");
    },
  });

  const totalLabel = `${reviewsQuery.data?.items.length ?? 0}/${reviewsQuery.data?.pagination.total ?? 0}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">审核队列</h1>
          <p className="text-muted-foreground mt-2 max-w-3xl text-sm">
            集中处理真题导入后的 AI review 差异，保留人工确认、拒绝备注与审核时间线。
          </p>
        </div>
        <Card variant="stat" className="min-w-36">
          <CardHeader className="pb-2">
            <CardDescription>当前队列</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tabular-nums">{totalLabel}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(380px,1.05fr)]">
        <Card variant="flat" className="min-w-0">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <RefreshCcw className="text-primary h-4 w-4" />
                Review Items
              </CardTitle>
              <CardDescription>按状态筛选，默认查看最新 AI review 记录。</CardDescription>
            </div>
            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as ReviewStatusFilter)}
            >
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="ai_reviewed">AI Reviewed</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            {reviewsQuery.isLoading ? (
              <div className="border-border text-muted-foreground rounded-[var(--radius-md)] border p-4 text-sm">
                正在加载审核队列...
              </div>
            ) : reviewsQuery.isError ? (
              <div className="border-destructive/40 bg-destructive/5 text-destructive rounded-[var(--radius-md)] border p-4 text-sm">
                {reviewsQuery.error instanceof Error
                  ? reviewsQuery.error.message
                  : "审核队列加载失败"}
              </div>
            ) : reviewsQuery.data && reviewsQuery.data.items.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Question</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Reviewed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reviewsQuery.data.items.map((review) => (
                    <TableRow
                      key={review.id}
                      className={selectedReviewId === review.id ? "bg-subtle/30" : "cursor-pointer"}
                      onClick={() => setSelectedReviewId(review.id)}
                    >
                      <TableCell>
                        <div className="font-mono text-sm">{review.questionId.slice(0, 8)}</div>
                        <div className="text-muted-foreground mt-1 text-xs">
                          {formatTimestamp(review.createdAt)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={reviewVariants[review.reviewStatus]}>
                          {reviewLabels[review.reviewStatus]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">
                        {typeof review.aiConfidence === "number"
                          ? review.aiConfidence.toFixed(2)
                          : "-"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatTimestamp(review.reviewedAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="border-border text-muted-foreground rounded-[var(--radius-md)] border border-dashed p-4 text-sm">
                当前筛选下暂无审核项。
              </div>
            )}
          </CardContent>
        </Card>

        <Card variant="flat" className="min-w-0">
          <CardHeader>
            <CardTitle className="text-lg">差异与人工结论</CardTitle>
            <CardDescription>AI 差异、题面答案和备注会一起形成审核历史。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selectedReview ? (
              <div className="border-border text-muted-foreground rounded-[var(--radius-md)] border border-dashed p-4 text-sm">
                从左侧选择审核项。
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={reviewVariants[selectedReview.reviewStatus]}>
                    {reviewLabels[selectedReview.reviewStatus]}
                  </Badge>
                  <Badge variant="outline">review {selectedReview.id.slice(0, 8)}</Badge>
                  <Badge variant="outline">question {selectedReview.questionId.slice(0, 8)}</Badge>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="border-border bg-subtle/20 rounded-[var(--radius-md)] border p-3">
                    <div className="text-muted-foreground text-xs">AI Confidence</div>
                    <div className="mt-1 text-2xl font-semibold tabular-nums">
                      {typeof selectedReview.aiConfidence === "number"
                        ? selectedReview.aiConfidence.toFixed(2)
                        : "-"}
                    </div>
                  </div>
                  <div className="border-border bg-subtle/20 rounded-[var(--radius-md)] border p-3">
                    <div className="text-muted-foreground text-xs">Reviewed By</div>
                    <div className="mt-1 text-sm font-semibold break-all">
                      {selectedReview.reviewedBy ?? "-"}
                    </div>
                  </div>
                  <div className="border-border bg-subtle/20 rounded-[var(--radius-md)] border p-3">
                    <div className="text-muted-foreground text-xs">Reviewed At</div>
                    <div className="mt-1 text-sm font-semibold">
                      {formatTimestamp(selectedReview.reviewedAt)}
                    </div>
                  </div>
                </div>

                <ScrollArea className="h-[560px] pr-3">
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label>officialAnswerDiff</Label>
                      <pre className="border-border bg-subtle/20 overflow-auto rounded-[var(--radius-md)] border p-3 text-xs">
                        {stringifyJson(selectedReview.officialAnswerDiff ?? {})}
                      </pre>
                    </div>

                    {questionQuery.isLoading ? (
                      <div className="border-border text-muted-foreground rounded-[var(--radius-md)] border p-4 text-sm">
                        正在加载题目快照...
                      </div>
                    ) : questionQuery.isError ? (
                      <div className="border-destructive/40 bg-destructive/5 text-destructive rounded-[var(--radius-md)] border p-4 text-sm">
                        {questionQuery.error instanceof Error
                          ? questionQuery.error.message
                          : "题目快照加载失败"}
                      </div>
                    ) : questionQuery.data ? (
                      <>
                        <div className="space-y-2">
                          <Label>contentJson</Label>
                          <pre className="border-border bg-subtle/20 overflow-auto rounded-[var(--radius-md)] border p-3 text-xs">
                            {stringifyJson(questionQuery.data.contentJson)}
                          </pre>
                        </div>
                        <div className="space-y-2">
                          <Label>answerJson</Label>
                          <pre className="border-border bg-subtle/20 overflow-auto rounded-[var(--radius-md)] border p-3 text-xs">
                            {stringifyJson(questionQuery.data.answerJson)}
                          </pre>
                        </div>
                        <div className="space-y-2">
                          <Label>explanationJson</Label>
                          <pre className="border-border bg-subtle/20 overflow-auto rounded-[var(--radius-md)] border p-3 text-xs">
                            {stringifyJson(questionQuery.data.explanationJson)}
                          </pre>
                        </div>
                      </>
                    ) : null}
                  </div>
                </ScrollArea>

                <div className="space-y-2">
                  <Label htmlFor="reviewer-notes">审核备注</Label>
                  <Textarea
                    id="reviewer-notes"
                    value={reviewerNotes}
                    onChange={(event) => setReviewerNotes(event.target.value)}
                    placeholder="记录人工判断依据"
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    loading={actionMutation.isPending && actionMutation.variables === "confirm"}
                    onClick={() => actionMutation.mutate("confirm")}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    确认
                  </Button>
                  <Button
                    variant="destructive"
                    loading={actionMutation.isPending && actionMutation.variables === "reject"}
                    onClick={() => actionMutation.mutate("reject")}
                  >
                    <XCircle className="h-4 w-4" />
                    拒绝
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
