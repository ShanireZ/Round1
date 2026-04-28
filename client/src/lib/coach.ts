export type CoachClassSummary = {
  id: string;
  name: string;
  joinCode: string;
  archivedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  coachRole?: "owner" | "collaborator";
  memberCount?: number;
  coachCount?: number;
};

export type CoachAssignmentSummary = {
  assignmentId: string;
  title: string;
  status: string;
  dueAt: string | null;
  completed: number;
  missed: number;
  averageScore: number;
};

export type CoachKpReportSummary = {
  kpId: string;
  total: number;
  correct: number;
  accuracy: number;
};

export type CoachQuestionTypeReportSummary = {
  questionType: string;
  total: number;
  correct: number;
  score: number;
  maxScore: number;
  accuracy: number;
};

export type CoachStudentTrendItem = {
  assignmentId: string;
  title: string;
  status: string;
  dueAt: string | null;
  progressStatus: string;
  score: number | null;
  submittedAt: string | null;
};

export type CoachStudentReport = {
  userId: string;
  username: string;
  displayName: string;
  pending: number;
  inProgress: number;
  completed: number;
  missed: number;
  averageScore: number;
  latestSubmittedAt: string | null;
  kpStats: CoachKpReportSummary[];
  questionTypeStats: CoachQuestionTypeReportSummary[];
  trend: CoachStudentTrendItem[];
};

export type CoachClassReport = {
  classId: string;
  totals: {
    students: number;
    pending: number;
    inProgress: number;
    completed: number;
    missed: number;
    averageScore: number;
  };
  assignments: CoachAssignmentSummary[];
  heatmap: {
    knowledgePointIds: string[];
    students: Array<{
      userId: string;
      displayName: string;
      values: CoachKpReportSummary[];
    }>;
  };
  questionTypeStats: CoachQuestionTypeReportSummary[];
  students: CoachStudentReport[];
};

type ApiPayload<T> =
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      error: {
        code: string;
        message: string;
        details?: unknown;
      };
    };

export class CoachClientError extends Error {
  code: string;
  details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "CoachClientError";
    this.code = code;
    this.details = details;
  }
}

async function readApiPayload<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as ApiPayload<T>;

  if (!response.ok || payload.success === false) {
    const error = payload.success === false ? payload.error : undefined;
    throw new CoachClientError(
      error?.code ?? "ROUND1_REQUEST_FAILED",
      error?.message ?? `请求失败 (${response.status})`,
      error?.details,
    );
  }

  return payload.data;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  return readApiPayload<T>(response);
}

export function fetchCoachClasses() {
  return requestJson<{ items: CoachClassSummary[] }>("/api/v1/coach/classes");
}

export function fetchCoachClassReport(classId: string) {
  return requestJson<CoachClassReport>(`/api/v1/coach/report/${classId}`);
}

export function formatCoachPercent(value: number): string {
  if (!Number.isFinite(value)) {
    return "0%";
  }

  return `${Math.round(value * 100)}%`;
}

export function scoreOrDash(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "--";
  }

  return String(Math.round(value));
}

export function heatmapBucket(value: CoachKpReportSummary): 0 | 1 | 2 | 3 | 4 {
  if (value.total === 0) {
    return 0;
  }

  if (value.accuracy >= 0.85) {
    return 4;
  }
  if (value.accuracy >= 0.65) {
    return 3;
  }
  if (value.accuracy >= 0.4) {
    return 2;
  }
  return 1;
}

export function buildCoachReportCsv(report: CoachClassReport): string {
  const rows = [
    ["student", "completed", "missed", "averageScore", "latestSubmittedAt"],
    ...report.students.map((student) => [
      student.displayName,
      String(student.completed),
      String(student.missed),
      scoreOrDash(student.averageScore),
      student.latestSubmittedAt ?? "",
    ]),
  ];

  const escaped = rows.map((row) =>
    row
      .map((cell) => {
        const normalized = cell.replace(/"/g, '""');
        return /[",\n]/.test(normalized) ? `"${normalized}"` : normalized;
      })
      .join(","),
  );

  return `\uFEFF${escaped.join("\n")}`;
}
