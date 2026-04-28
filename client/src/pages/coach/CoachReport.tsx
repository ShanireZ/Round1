import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
import {
  BarChart3,
  Download,
  FileText,
  Flame,
  LogIn,
  Printer,
  TrendingUp,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  COACH_REPORT_RENDER_LIMITS,
  buildCoachReportCsv,
  clampCoachReportPage,
  fetchCoachClasses,
  fetchCoachClassReport,
  formatCoachPercent,
  getCoachReportPageCount,
  getCoachReportPageItems,
  heatmapBucket,
  scoreOrDash,
  type CoachClassReport,
  type CoachKpReportSummary,
  type CoachQuestionTypeReportSummary,
  type CoachStudentReport,
} from "@/lib/coach";
import { fetchAuthSession } from "@/lib/auth";

const heatmapBucketClasses = [
  "bg-[var(--color-heatmap-0)] text-muted-foreground",
  "bg-[var(--color-heatmap-1)] text-foreground",
  "bg-[var(--color-heatmap-2)] text-foreground",
  "bg-[var(--color-heatmap-3)] text-primary-foreground",
  "bg-[var(--color-heatmap-4)] text-primary-foreground",
] as const;

const questionTypeLabels: Record<string, string> = {
  single_choice: "单选",
  reading_program: "阅读程序",
  completion_program: "完善程序",
};

function formatDate(value: string | null) {
  if (!value) {
    return "暂无";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function progressStatusLabel(value: string) {
  if (value === "pending") return "待开始";
  if (value === "in_progress") return "进行中";
  if (value === "completed") return "已完成";
  if (value === "missed") return "已错过";
  return value;
}

function KpiCard({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description: string;
}) {
  return (
    <Card variant="stat" className="border-border bg-card">
      <CardContent className="p-5">
        <div className="text-muted-foreground text-xs">{label}</div>
        <div className="text-foreground mt-2 text-2xl font-semibold tabular-nums">{value}</div>
        <div className="text-muted-foreground mt-1 text-xs">{description}</div>
      </CardContent>
    </Card>
  );
}

function EmptyReport() {
  return (
    <div className="border-border bg-subtle/10 grid min-h-64 place-items-center rounded-[--radius-lg] border border-dashed p-8 text-center">
      <div className="space-y-3">
        <FileText className="text-muted-foreground mx-auto h-8 w-8" />
        <div className="text-foreground font-medium">当前班级还没有任务统计</div>
        <div className="text-muted-foreground text-sm">
          布置固定预制卷任务并有学生作答后，会显示热力图和下钻详情。
        </div>
      </div>
    </div>
  );
}

function HeatmapCell({ value }: { value: CoachKpReportSummary }) {
  const bucket = heatmapBucket(value);
  return (
    <div
      className={`border-border/70 grid h-10 min-w-14 place-items-center rounded-[--radius-sm] border text-xs font-medium tabular-nums ${heatmapBucketClasses[bucket]}`}
      title={`${value.correct}/${value.total} · ${formatCoachPercent(value.accuracy)}`}
      aria-label={`知识点 ${value.kpId} 正确率 ${formatCoachPercent(value.accuracy)}`}
    >
      {value.total === 0 ? "--" : formatCoachPercent(value.accuracy)}
    </div>
  );
}

function ClassHeatmap({
  report,
  onSelectStudent,
}: {
  report: CoachClassReport;
  onSelectStudent: (student: CoachStudentReport) => void;
}) {
  const [page, setPage] = useState(1);

  if (report.heatmap.knowledgePointIds.length === 0 || report.heatmap.students.length === 0) {
    return <EmptyReport />;
  }

  const studentMap = new Map(report.students.map((student) => [student.userId, student]));
  const pageSize = COACH_REPORT_RENDER_LIMITS.heatmapStudentPageSize;
  const safePage = clampCoachReportPage(page, report.heatmap.students.length, pageSize);
  const pageCount = getCoachReportPageCount(report.heatmap.students.length, pageSize);
  const visibleStudents = getCoachReportPageItems(report.heatmap.students, safePage, pageSize);
  const rangeStart = (safePage - 1) * pageSize + 1;
  const rangeEnd = rangeStart + visibleStudents.length - 1;

  return (
    <div className="space-y-4" data-print-surface>
      <div className="overflow-x-auto">
        <div className="min-w-[720px]">
          <div className="flex gap-2">
            <div className="text-muted-foreground w-40 shrink-0 px-2 text-xs font-medium">
              学生 / KP
            </div>
            {report.heatmap.knowledgePointIds.map((kpId) => (
              <div
                key={kpId}
                className="text-muted-foreground min-w-14 flex-1 px-1 text-center text-xs tabular-nums"
              >
                KP {kpId}
              </div>
            ))}
          </div>
          <div className="mt-2 space-y-2">
            {visibleStudents.map((student) => {
              const detail = studentMap.get(student.userId);
              return (
                <div key={student.userId} className="flex gap-2">
                  <button
                    type="button"
                    className="border-border bg-card hover:bg-accent-wash text-foreground w-40 shrink-0 rounded-[--radius-md] border px-3 text-left text-sm font-medium transition-colors focus-visible:shadow-[--shadow-glow]"
                    aria-label={`从热力图查看 ${student.displayName} 详情`}
                    onClick={() => detail && onSelectStudent(detail)}
                  >
                    {student.displayName}
                  </button>
                  {student.values.map((value) => (
                    <div key={`${student.userId}-${value.kpId}`} className="min-w-14 flex-1">
                      <HeatmapCell value={value} />
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {pageCount > 1 ? (
        <div
          className="text-muted-foreground flex flex-wrap items-center justify-between gap-3 text-xs"
          data-no-print
        >
          <span className="tabular-nums">
            {rangeStart}-{rangeEnd} / {report.heatmap.students.length}
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setPage(safePage - 1)}
              disabled={safePage <= 1}
            >
              上一页
            </Button>
            <span className="font-mono tabular-nums">
              {safePage}/{pageCount}
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setPage(safePage + 1)}
              disabled={safePage >= pageCount}
            >
              下一页
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function QuestionTypeStats({ stats }: { stats: CoachQuestionTypeReportSummary[] }) {
  if (stats.length === 0) {
    return (
      <div className="border-border bg-subtle/10 text-muted-foreground rounded-[--radius-lg] border border-dashed p-6 text-sm">
        暂无题型统计。
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {stats.map((item) => (
        <div key={item.questionType} className="space-y-2">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-foreground font-medium">
              {questionTypeLabels[item.questionType] ?? item.questionType}
            </span>
            <span className="text-muted-foreground tabular-nums">
              {item.score}/{item.maxScore} · {formatCoachPercent(item.accuracy)}
            </span>
          </div>
          <Progress value={Math.round(item.accuracy * 100)} variant="exam" />
        </div>
      ))}
    </div>
  );
}

function StudentTable({
  report,
  onSelectStudent,
}: {
  report: CoachClassReport;
  onSelectStudent: (student: CoachStudentReport) => void;
}) {
  const [page, setPage] = useState(1);

  if (report.students.length === 0) {
    return <EmptyReport />;
  }

  const pageSize = COACH_REPORT_RENDER_LIMITS.studentTablePageSize;
  const safePage = clampCoachReportPage(page, report.students.length, pageSize);
  const pageCount = getCoachReportPageCount(report.students.length, pageSize);
  const visibleStudents = getCoachReportPageItems(report.students, safePage, pageSize);
  const rangeStart = (safePage - 1) * pageSize + 1;
  const rangeEnd = rangeStart + visibleStudents.length - 1;

  return (
    <div className="space-y-4" data-print-surface>
      <div className="border-border overflow-hidden rounded-[--radius-lg] border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>学生</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">均分</TableHead>
              <TableHead className="text-right">最近提交</TableHead>
              <TableHead className="w-24 text-right" data-no-print>
                详情
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleStudents.map((student) => (
              <TableRow
                key={student.userId}
                className="hover:bg-accent-wash/60 cursor-pointer"
                onClick={() => onSelectStudent(student)}
              >
                <TableCell>
                  <div className="font-medium">{student.displayName}</div>
                  <div className="text-muted-foreground text-xs">{student.username}</div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="saved">完成 {student.completed}</Badge>
                    {student.missed > 0 ? <Badge variant="tle">错过 {student.missed}</Badge> : null}
                    {student.inProgress > 0 ? <Badge variant="outline">进行中</Badge> : null}
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {scoreOrDash(student.averageScore)}
                </TableCell>
                <TableCell className="text-muted-foreground text-right text-xs">
                  {formatDate(student.latestSubmittedAt)}
                </TableCell>
                <TableCell className="text-right" data-no-print>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`查看 ${student.displayName} 趋势详情`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectStudent(student);
                    }}
                  >
                    查看
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {pageCount > 1 ? (
        <div
          className="text-muted-foreground flex flex-wrap items-center justify-between gap-3 text-xs"
          data-no-print
        >
          <span className="tabular-nums">
            {rangeStart}-{rangeEnd} / {report.students.length}
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setPage(safePage - 1)}
              disabled={safePage <= 1}
            >
              上一页
            </Button>
            <span className="font-mono tabular-nums">
              {safePage}/{pageCount}
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setPage(safePage + 1)}
              disabled={safePage >= pageCount}
            >
              下一页
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StudentDetailSheet({
  student,
  open,
  onOpenChange,
}: {
  student: CoachStudentReport | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const visibleTrend =
    student?.trend.slice(0, COACH_REPORT_RENDER_LIMITS.studentDetailTrendLimit) ?? [];
  const visibleKpStats =
    student?.kpStats.slice(0, COACH_REPORT_RENDER_LIMITS.studentDetailKpLimit) ?? [];
  const visibleQuestionTypeStats =
    student?.questionTypeStats.slice(
      0,
      COACH_REPORT_RENDER_LIMITS.studentDetailQuestionTypeLimit,
    ) ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{student?.displayName ?? "学生详情"}</SheetTitle>
          <SheetDescription>
            成绩趋势、弱项知识点和题型表现来自当前班级 assignment attempts。
          </SheetDescription>
        </SheetHeader>

        {student ? (
          <div className="mt-6 space-y-6">
            <div className="grid grid-cols-3 gap-3">
              <KpiCard
                label="均分"
                value={scoreOrDash(student.averageScore)}
                description="已评分任务"
              />
              <KpiCard label="完成" value={String(student.completed)} description="completed" />
              <KpiCard label="错过" value={String(student.missed)} description="missed" />
            </div>

            <Card variant="flat">
              <CardHeader>
                <CardTitle className="text-lg">趋势</CardTitle>
                <CardDescription>按任务截止时间排序。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {visibleTrend.length === 0 ? (
                  <div className="text-muted-foreground text-sm">暂无趋势数据。</div>
                ) : (
                  visibleTrend.map((item) => (
                    <div
                      key={`${student.userId}-${item.assignmentId}`}
                      className="border-border flex items-center justify-between gap-3 rounded-[--radius-md] border p-3"
                    >
                      <div className="min-w-0">
                        <div className="text-foreground truncate text-sm font-medium">
                          {item.title}
                        </div>
                        <div className="text-muted-foreground mt-1 text-xs">
                          {progressStatusLabel(item.progressStatus)} ·{" "}
                          {formatDate(item.submittedAt)}
                        </div>
                      </div>
                      <Badge variant={item.progressStatus === "completed" ? "saved" : "outline"}>
                        {scoreOrDash(item.score)}
                      </Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card variant="flat">
              <CardHeader>
                <CardTitle className="text-lg">知识点</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {visibleKpStats.length === 0 ? (
                  <div className="text-muted-foreground text-sm">暂无知识点统计。</div>
                ) : (
                  visibleKpStats.map((item) => (
                    <div key={item.kpId} className="space-y-2">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-medium">KP {item.kpId}</span>
                        <span className="text-muted-foreground tabular-nums">
                          {item.correct}/{item.total} · {formatCoachPercent(item.accuracy)}
                        </span>
                      </div>
                      <Progress value={Math.round(item.accuracy * 100)} variant="exam" />
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card variant="flat">
              <CardHeader>
                <CardTitle className="text-lg">题型</CardTitle>
              </CardHeader>
              <CardContent>
                <QuestionTypeStats stats={visibleQuestionTypeStats} />
              </CardContent>
            </Card>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function LoadingCoachReport() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-36 w-full" />
      <div className="grid gap-4 md:grid-cols-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
      <Skeleton className="h-96 w-full" />
    </div>
  );
}

function CoachAccessPrompt({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: "login";
}) {
  return (
    <div className="grid min-h-[55vh] place-items-center">
      <div className="border-border bg-card max-w-xl rounded-[--radius-lg] border p-8 text-center">
        <Users className="text-muted-foreground mx-auto h-9 w-9" />
        <h1 className="text-foreground mt-4 text-2xl font-semibold">{title}</h1>
        <p className="text-muted-foreground mt-3 text-sm leading-6">{description}</p>
        {action === "login" ? (
          <Button asChild className="mt-5">
            <Link to={`/login?returnTo=${encodeURIComponent("/coach/report")}`}>
              <LogIn />
              登录
            </Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export default function CoachReport() {
  const [searchParams] = useSearchParams();
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<CoachStudentReport | null>(null);

  const sessionQuery = useQuery({
    queryKey: ["auth-session"],
    queryFn: fetchAuthSession,
    retry: false,
    staleTime: 60_000,
  });
  const session = sessionQuery.data;
  const canReadCoachReport =
    session?.authenticated === true &&
    (session.user.role === "coach" || session.user.role === "admin");

  const classesQuery = useQuery({
    queryKey: ["coach-classes"],
    queryFn: fetchCoachClasses,
    enabled: canReadCoachReport,
  });
  const classes = useMemo(() => classesQuery.data?.items ?? [], [classesQuery.data]);
  const classIdFromUrl = searchParams.get("classId");
  const activeClassId =
    selectedClassId ??
    (classIdFromUrl && classes.some((item) => item.id === classIdFromUrl)
      ? classIdFromUrl
      : null) ??
    classes[0]?.id ??
    null;
  const reportQuery = useQuery({
    queryKey: ["coach-report", activeClassId],
    queryFn: () => fetchCoachClassReport(activeClassId!),
    enabled: canReadCoachReport && Boolean(activeClassId),
  });
  const report = reportQuery.data;
  const activeClass = useMemo(
    () => classes.find((item) => item.id === activeClassId) ?? null,
    [activeClassId, classes],
  );
  const generatedAt = useMemo(
    () =>
      new Date().toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
    [],
  );

  function exportCsv() {
    if (!report) {
      return;
    }
    const blob = new Blob([buildCoachReportCsv(report)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `round1-coach-report-${report.classId}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (sessionQuery.isPending || (canReadCoachReport && classesQuery.isPending)) {
    return <LoadingCoachReport />;
  }

  if (session?.authenticated === false) {
    return (
      <CoachAccessPrompt
        title="登录后查看班级报告"
        description="Coach Report 会读取受保护的班级任务与学生作答统计，登录后再进入报表。"
        action="login"
      />
    );
  }

  if (session?.authenticated === true && !canReadCoachReport) {
    return (
      <CoachAccessPrompt
        title="当前账号没有教练权限"
        description="只有 coach 或 admin 可以查看群体热力图、题型统计和学生下钻。"
      />
    );
  }

  if (classes.length === 0) {
    return (
      <CoachAccessPrompt
        title="还没有可查看的班级"
        description="你成为班级 coach 或 admin 后，这里会显示 assignment-only 报表。"
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="print-header hidden">
        R1 班级报告 · {activeClass?.name ?? "当前班级"} · {generatedAt}
      </div>
      <Card variant="hero" className="overflow-hidden">
        <CardHeader className="gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <Badge variant="outline">Coach Report</Badge>
            <CardTitle className="mt-3 text-2xl">班级报告</CardTitle>
            <CardDescription className="mt-2 max-w-2xl">
              仅统计当前班级固定任务的学生作答，群体热力图用于快速定位共同弱项。
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2" data-no-print>
            <Select
              value={activeClassId ?? undefined}
              onValueChange={(value) => {
                setSelectedClassId(value);
                setSelectedStudent(null);
              }}
            >
              <SelectTrigger className="min-w-56">
                <SelectValue placeholder="选择班级" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((klass) => (
                  <SelectItem key={klass.id} value={klass.id}>
                    {klass.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" variant="secondary" onClick={exportCsv} disabled={!report}>
              <Download />
              CSV
            </Button>
            <Button type="button" variant="secondary" onClick={() => window.print()}>
              <Printer />
              打印
            </Button>
          </div>
        </CardHeader>
      </Card>

      {reportQuery.isPending ? (
        <LoadingCoachReport />
      ) : report ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" data-print-surface>
            <KpiCard
              label="学生数"
              value={String(report.totals.students)}
              description={activeClass?.name ?? "当前班级"}
            />
            <KpiCard
              label="完成"
              value={String(report.totals.completed)}
              description="assignment progress"
            />
            <KpiCard label="错过" value={String(report.totals.missed)} description="需要教练跟进" />
            <KpiCard
              label="均分"
              value={scoreOrDash(report.totals.averageScore)}
              description="已评分 attempts"
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
            <Card variant="flat" className="border-border bg-card" data-print-surface>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Flame className="text-primary h-5 w-5" />
                  群体热力图
                </CardTitle>
                <CardDescription>知识点 × 学生矩阵，用于定位共同弱项与个体差异。</CardDescription>
              </CardHeader>
              <CardContent>
                <ClassHeatmap report={report} onSelectStudent={setSelectedStudent} />
              </CardContent>
            </Card>

            <Card variant="flat" className="border-border bg-card" data-print-surface>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <BarChart3 className="text-primary h-5 w-5" />
                  题型统计
                </CardTitle>
                <CardDescription>按题型聚合的得分率。</CardDescription>
              </CardHeader>
              <CardContent>
                <QuestionTypeStats stats={report.questionTypeStats} />
              </CardContent>
            </Card>
          </div>

          <Card variant="flat" className="border-border bg-card" data-print-surface>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <TrendingUp className="text-primary h-5 w-5" />
                学生趋势与下钻
              </CardTitle>
              <CardDescription>按学生聚合固定任务表现、最近提交和下钻详情。</CardDescription>
            </CardHeader>
            <CardContent>
              <StudentTable report={report} onSelectStudent={setSelectedStudent} />
            </CardContent>
          </Card>
        </>
      ) : (
        <EmptyReport />
      )}

      <StudentDetailSheet
        student={selectedStudent}
        open={Boolean(selectedStudent)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedStudent(null);
          }
        }}
      />
      <div className="print-footer hidden">
        Round1 CoachReport · assignment-only · {generatedAt}
      </div>
    </div>
  );
}
