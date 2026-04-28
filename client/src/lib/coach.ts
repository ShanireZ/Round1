import { getCachedAuthCsrfToken } from "./auth";

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

export type CoachClassMember = {
  classId: string;
  userId: string;
  username: string;
  displayName: string;
  role: string;
  joinedVia: string;
  joinedAt: string;
};

export type CoachClassInvite = {
  id: string;
  classId: string;
  token?: string;
  joinUrl?: string;
  expiresAt: string;
  maxUses: number;
  useCount: number;
  revokedAt: string | null;
  createdAt: string;
};

export type CoachClassCoach = {
  classId: string;
  userId: string;
  username: string;
  displayName: string;
  userRole: string;
  coachRole: "owner" | "collaborator";
  addedAt: string;
};

export type CoachClassAssignment = {
  id: string;
  classId: string;
  createdBy: string;
  title: string;
  mode: string;
  prebuiltPaperId: string | null;
  examType: string;
  difficulty?: "easy" | "medium" | "hard";
  blueprintVersion: number;
  dueAt: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  assignedStudents?: number;
};

export type CoachPrebuiltPaperSummary = {
  id: string;
  title: string;
  examType: string;
  difficulty: "easy" | "medium" | "hard";
  blueprintVersion: number;
  publishedAt: string | null;
};

export type CoachAssignmentCreatePayload = {
  classId: string;
  title: string;
  prebuiltPaperId: string;
  dueAt: string;
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

export const COACH_REPORT_RENDER_LIMITS = {
  heatmapStudentPageSize: 24,
  studentTablePageSize: 25,
  studentDetailTrendLimit: 12,
  studentDetailKpLimit: 8,
  studentDetailQuestionTypeLimit: 8,
} as const;

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
  const method = init?.method?.toUpperCase() ?? "GET";
  const headers = new Headers(init?.headers);

  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (!["GET", "HEAD", "OPTIONS"].includes(method) && !headers.has("X-CSRF-Token")) {
    headers.set("X-CSRF-Token", await getCachedAuthCsrfToken());
  }

  const response = await fetch(path, {
    credentials: "include",
    ...init,
    method,
    headers,
  });

  return readApiPayload<T>(response);
}

export function fetchCoachClasses() {
  return requestJson<{ items: CoachClassSummary[] }>("/api/v1/coach/classes");
}

export function fetchCoachClass(classId: string) {
  return requestJson<CoachClassSummary>(`/api/v1/coach/classes/${classId}`);
}

export function fetchCoachPrebuiltPapers() {
  return requestJson<{ items: CoachPrebuiltPaperSummary[] }>("/api/v1/coach/prebuilt-papers");
}

export function createCoachClass(payload: { name: string }) {
  return requestJson<CoachClassSummary>("/api/v1/coach/classes", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateCoachClass(classId: string, payload: { name: string }) {
  return requestJson<CoachClassSummary>(`/api/v1/coach/classes/${classId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function rotateCoachClassJoinCode(classId: string) {
  return requestJson<CoachClassSummary>(`/api/v1/coach/classes/${classId}/rotate-code`, {
    method: "POST",
  });
}

export function archiveCoachClass(classId: string) {
  return requestJson<CoachClassSummary>(`/api/v1/coach/classes/${classId}/archive`, {
    method: "POST",
  });
}

export function fetchCoachClassMembers(classId: string) {
  return requestJson<{ items: CoachClassMember[] }>(`/api/v1/coach/classes/${classId}/members`);
}

export function removeCoachClassMember(classId: string, userId: string) {
  return requestJson<Pick<CoachClassMember, "classId" | "userId" | "joinedVia" | "joinedAt">>(
    `/api/v1/coach/classes/${classId}/members/${userId}`,
    { method: "DELETE" },
  );
}

export function fetchCoachClassInvites(classId: string) {
  return requestJson<{ items: CoachClassInvite[] }>(`/api/v1/coach/classes/${classId}/invites`);
}

export function createCoachClassInvite(payload: {
  classId: string;
  expiresAt: string;
  maxUses: number;
}) {
  return requestJson<CoachClassInvite>(`/api/v1/coach/classes/${payload.classId}/invites`, {
    method: "POST",
    body: JSON.stringify({ expiresAt: payload.expiresAt, maxUses: payload.maxUses }),
  });
}

export function revokeCoachClassInvite(classId: string, inviteId: string) {
  return requestJson<CoachClassInvite>(`/api/v1/coach/classes/${classId}/invites/${inviteId}`, {
    method: "DELETE",
  });
}

export function fetchCoachClassCoaches(classId: string) {
  return requestJson<{ items: CoachClassCoach[] }>(`/api/v1/coach/classes/${classId}/coaches`);
}

export function addCoachClassCoach(payload: { classId: string; userId: string }) {
  return requestJson<CoachClassCoach>(`/api/v1/coach/classes/${payload.classId}/coaches`, {
    method: "POST",
    body: JSON.stringify({ userId: payload.userId }),
  });
}

export function removeCoachClassCoach(classId: string, userId: string) {
  return requestJson<CoachClassCoach>(`/api/v1/coach/classes/${classId}/coaches/${userId}`, {
    method: "DELETE",
  });
}

export function transferCoachClassOwner(classId: string, userId: string) {
  return requestJson<CoachClassCoach>(
    `/api/v1/coach/classes/${classId}/coaches/${userId}/transfer-owner`,
    { method: "POST" },
  );
}

export function fetchCoachClassAssignments(classId: string) {
  return requestJson<{ items: CoachClassAssignment[] }>(
    `/api/v1/coach/classes/${classId}/assignments`,
  );
}

export function createCoachAssignment(payload: CoachAssignmentCreatePayload) {
  return requestJson<CoachClassAssignment>("/api/v1/coach/assignments", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function closeCoachAssignment(assignmentId: string) {
  return requestJson<CoachClassAssignment>(`/api/v1/coach/assignments/${assignmentId}/close`, {
    method: "POST",
  });
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

export function formatCoachClassRoleLabel(role: CoachClassSummary["coachRole"]): string {
  if (role === "owner") {
    return "owner";
  }
  if (role === "collaborator") {
    return "collaborator";
  }
  return "coach";
}

export function formatCoachAssignmentStatusLabel(status: string): string {
  if (status === "assigned") {
    return "assigned";
  }
  if (status === "closed") {
    return "closed";
  }
  return status;
}

export function countActiveCoachClasses(classes: readonly CoachClassSummary[]): number {
  return classes.filter((klass) => !klass.archivedAt).length;
}

export function countOpenCoachAssignments(assignments: readonly CoachClassAssignment[]): number {
  return assignments.filter((assignment) => assignment.status === "assigned").length;
}

export type CoachClassInviteStatus = "active" | "revoked" | "expired" | "full";

export function getCoachClassInviteStatus(
  invite: Pick<CoachClassInvite, "expiresAt" | "maxUses" | "useCount" | "revokedAt">,
  now = new Date(),
): CoachClassInviteStatus {
  if (invite.revokedAt) {
    return "revoked";
  }

  const expiresAt = new Date(invite.expiresAt);
  if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= now.getTime()) {
    return "expired";
  }

  if (invite.useCount >= invite.maxUses) {
    return "full";
  }

  return "active";
}

export function formatCoachClassInviteStatusLabel(status: CoachClassInviteStatus): string {
  if (status === "active") {
    return "active";
  }
  if (status === "revoked") {
    return "revoked";
  }
  if (status === "expired") {
    return "expired";
  }
  return "full";
}

export function countActiveCoachClassInvites(
  invites: readonly Pick<CoachClassInvite, "expiresAt" | "maxUses" | "useCount" | "revokedAt">[],
  now = new Date(),
): number {
  return invites.filter((invite) => getCoachClassInviteStatus(invite, now) === "active").length;
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

export function getCoachReportPageCount(totalItems: number, pageSize: number): number {
  if (totalItems <= 0 || pageSize <= 0) {
    return 1;
  }

  return Math.ceil(totalItems / pageSize);
}

export function clampCoachReportPage(page: number, totalItems: number, pageSize: number): number {
  const pageCount = getCoachReportPageCount(totalItems, pageSize);
  if (!Number.isFinite(page)) {
    return 1;
  }

  return Math.min(Math.max(Math.trunc(page), 1), pageCount);
}

export function getCoachReportPageItems<T>(
  items: readonly T[],
  page: number,
  pageSize: number,
): T[] {
  const safePage = clampCoachReportPage(page, items.length, pageSize);
  const start = (safePage - 1) * pageSize;

  return items.slice(start, start + pageSize);
}

function escapeCoachReportCsvCell(cell: string): string {
  const startsWithSpreadsheetControl = /^[=+\-@\t\r]/.test(cell);
  const trimsIntoFormula = /^\s*[=+\-@]/.test(cell);
  const safeCell = startsWithSpreadsheetControl || trimsIntoFormula ? `'${cell}` : cell;
  const escaped = safeCell.replace(/"/g, '""');

  return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped;
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

  const escaped = rows.map((row) => row.map((cell) => escapeCoachReportCsvCell(cell)).join(","));

  return `\uFEFF${escaped.join("\n")}`;
}
