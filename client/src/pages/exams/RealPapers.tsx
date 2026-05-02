import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { ArrowRight, CalendarDays, FileText, History, LibraryBig, RotateCcw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatExamTypeLabel } from "@/lib/exam-new";
import { formatDifficultyLabel, formatExamTypeBadgeVariant } from "@/lib/exam-results";
import {
  createRealPaperDraft,
  fetchRealPaperCatalog,
  type RealPaperCatalogItem,
} from "@/lib/exam-runtime";
import { cn } from "@/lib/utils";

const allExamTypesLabel = "全部";
const allYearsLabel = "全部年份";

function sortExamTypes(values: string[]): string[] {
  const order = [
    "CSP-J",
    "CSP-S",
    "GESP-1",
    "GESP-2",
    "GESP-3",
    "GESP-4",
    "GESP-5",
    "GESP-6",
    "GESP-7",
    "GESP-8",
  ];
  return [...values].sort((left, right) => {
    const leftIndex = order.indexOf(left);
    const rightIndex = order.indexOf(right);
    if (leftIndex >= 0 || rightIndex >= 0) {
      return (
        (leftIndex >= 0 ? leftIndex : Number.MAX_SAFE_INTEGER) -
        (rightIndex >= 0 ? rightIndex : Number.MAX_SAFE_INTEGER)
      );
    }

    return left.localeCompare(right);
  });
}

function LoadingRealPapers() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-6 py-8">
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-16 w-full" />
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-56 w-full" />
        ))}
      </div>
    </div>
  );
}

function EmptyRealPapers() {
  return (
    <Card variant="flat" className="grid min-h-72 place-items-center">
      <div className="max-w-md text-center">
        <LibraryBig className="text-muted-foreground mx-auto h-10 w-10" />
        <h2 className="text-foreground mt-4 text-lg font-semibold">暂无已发布真题卷</h2>
        <p className="text-muted-foreground mt-2 text-sm leading-6">
          管理端发布标记为真题的预制卷后，这里会按考试类型和年份展示。
        </p>
      </div>
    </Card>
  );
}

function RealPaperCard({
  item,
  isStarting,
  onStart,
}: {
  item: RealPaperCatalogItem;
  isStarting: boolean;
  onStart: (item: RealPaperCatalogItem) => void;
}) {
  return (
    <Card variant="interactive" className="flex h-full flex-col p-0">
      <CardHeader className="border-border border-b p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={formatExamTypeBadgeVariant(item.examType)}>{item.examType}</Badge>
              <Badge variant="outline">{item.year ?? "年份未标记"}</Badge>
              <Badge variant="secondary">{formatDifficultyLabel(item.difficulty)}</Badge>
            </div>
            <CardTitle className="truncate text-base leading-6">{item.title}</CardTitle>
          </div>
          <FileText className="text-primary mt-1 h-5 w-5 shrink-0" />
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-5 p-5">
        <div className="grid grid-cols-2 gap-3">
          <div className="border-border rounded-[var(--radius-md)] border p-3">
            <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <CalendarDays className="h-3.5 w-3.5" />
              年份
            </div>
            <div className="text-foreground mt-2 text-lg font-semibold tabular-nums">
              {item.year ?? "--"}
            </div>
          </div>
          <div className="border-border rounded-[var(--radius-md)] border p-3">
            <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <History className="h-3.5 w-3.5" />
              题数
            </div>
            <div className="text-foreground mt-2 text-lg font-semibold tabular-nums">
              {item.questionCount}
            </div>
          </div>
        </div>

        <div className="min-h-10">
          <div className="text-muted-foreground text-xs">来源</div>
          <div className="text-foreground mt-1 truncate text-sm">
            {item.sourceUrl ? (
              <a
                className="text-primary underline-offset-4 hover:underline"
                href={item.sourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                {item.sourceLabel ?? item.sourceUrl}
              </a>
            ) : (
              (item.sourceLabel ?? "未标记")
            )}
          </div>
        </div>

        <div className="mt-auto flex items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {item.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
          </div>
          <Button
            type="button"
            variant="primary"
            size="sm"
            loading={isStarting}
            onClick={() => onStart(item)}
          >
            <RotateCcw />
            开始/重做
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function RealPapers() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedExamType, setSelectedExamType] = useState(allExamTypesLabel);
  const [selectedYear, setSelectedYear] = useState(allYearsLabel);
  const [startingId, setStartingId] = useState<string | null>(null);

  const catalogQuery = useQuery({
    queryKey: ["real-paper-catalog"],
    queryFn: fetchRealPaperCatalog,
  });

  const items = catalogQuery.data?.items ?? [];
  const examTypes = useMemo(
    () => sortExamTypes([...new Set(items.map((item) => item.examType))]),
    [items],
  );
  const years = useMemo(
    () =>
      [
        ...new Set(items.map((item) => item.year).filter((year): year is string => Boolean(year))),
      ].sort((left, right) => Number(right) - Number(left)),
    [items],
  );
  const filteredItems = useMemo(
    () =>
      items.filter((item) => {
        const examTypeMatches =
          selectedExamType === allExamTypesLabel || item.examType === selectedExamType;
        const yearMatches = selectedYear === allYearsLabel || item.year === selectedYear;
        return examTypeMatches && yearMatches;
      }),
    [items, selectedExamType, selectedYear],
  );

  const groupedItems = useMemo(() => {
    const groups = new Map<string, RealPaperCatalogItem[]>();
    for (const item of filteredItems) {
      const group = groups.get(item.examType) ?? [];
      group.push(item);
      groups.set(item.examType, group);
    }

    return sortExamTypes([...groups.keys()]).map((examType) => ({
      examType,
      items: groups.get(examType) ?? [],
    }));
  }, [filteredItems]);

  const createMutation = useMutation({
    mutationFn: createRealPaperDraft,
    onMutate: (prebuiltPaperId) => {
      setStartingId(prebuiltPaperId);
    },
    onSuccess: async (draft) => {
      await queryClient.invalidateQueries({ queryKey: ["exam-active-draft"] });
      navigate(`/exams/${draft.id}`);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "真题卷草稿创建失败";
      toast.error(message);
    },
    onSettled: () => {
      setStartingId(null);
    },
  });

  if (catalogQuery.isPending) {
    return <LoadingRealPapers />;
  }

  return (
    <div className="h-full overflow-y-auto px-6 py-8">
      <div className="mx-auto max-w-7xl space-y-6" data-testid="real-papers-page">
        <section className="border-border bg-card rounded-[var(--radius-xl)] border p-6 md:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-4">
              <Badge variant="outline">真题卷库</Badge>
              <div className="space-y-3">
                <h1 className="text-foreground text-3xl font-semibold md:text-5xl">历届真题</h1>
                <p className="text-muted-foreground max-w-2xl text-sm leading-6">
                  按考试类型归档的已发布真题卷，可反复创建新的答题草稿。
                </p>
              </div>
            </div>
            <div className="grid min-w-72 grid-cols-2 gap-3">
              <div className="border-border rounded-[var(--radius-lg)] border p-4">
                <div className="text-muted-foreground text-xs">真题卷</div>
                <div className="text-foreground mt-2 text-2xl font-semibold tabular-nums">
                  {items.length}
                </div>
              </div>
              <div className="border-border rounded-[var(--radius-lg)] border p-4">
                <div className="text-muted-foreground text-xs">考试类型</div>
                <div className="text-foreground mt-2 text-2xl font-semibold tabular-nums">
                  {examTypes.length}
                </div>
              </div>
            </div>
          </div>
        </section>

        {items.length === 0 ? (
          <EmptyRealPapers />
        ) : (
          <>
            <section className="border-border bg-card rounded-[var(--radius-lg)] border p-4">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex flex-wrap gap-2">
                  {[allExamTypesLabel, ...examTypes].map((examType) => {
                    const active = selectedExamType === examType;
                    return (
                      <button
                        key={examType}
                        type="button"
                        className={cn(
                          "border-border rounded-[var(--radius-md)] border px-3 py-2 text-sm font-medium transition-colors",
                          active
                            ? "bg-primary text-primary-foreground border-primary"
                            : "text-foreground hover:bg-accent-wash",
                        )}
                        onClick={() => setSelectedExamType(examType)}
                      >
                        {examType === allExamTypesLabel ? examType : formatExamTypeLabel(examType)}
                      </button>
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-2">
                  {[allYearsLabel, ...years].map((year) => {
                    const active = selectedYear === year;
                    return (
                      <button
                        key={year}
                        type="button"
                        className={cn(
                          "border-border rounded-[var(--radius-md)] border px-3 py-2 text-sm font-medium transition-colors",
                          active
                            ? "bg-foreground text-background border-foreground"
                            : "text-foreground hover:bg-accent-wash",
                        )}
                        onClick={() => setSelectedYear(year)}
                      >
                        {year}
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            <section className="space-y-8">
              {groupedItems.length === 0 ? (
                <Card variant="flat" className="p-8 text-center">
                  <div className="text-muted-foreground text-sm">当前筛选下没有真题卷。</div>
                </Card>
              ) : (
                groupedItems.map((group) => (
                  <div key={group.examType} className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Badge variant={formatExamTypeBadgeVariant(group.examType)}>
                          {group.examType}
                        </Badge>
                        <h2 className="text-foreground text-xl font-semibold">
                          {formatExamTypeLabel(group.examType)}
                        </h2>
                      </div>
                      <div className="text-muted-foreground flex items-center gap-2 text-sm">
                        {group.items.length} 套
                        <ArrowRight className="h-4 w-4" />
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {group.items.map((item) => (
                        <RealPaperCard
                          key={item.id}
                          item={item}
                          isStarting={startingId === item.id && createMutation.isPending}
                          onStart={(target) => createMutation.mutate(target.id)}
                        />
                      ))}
                    </div>
                  </div>
                ))
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
