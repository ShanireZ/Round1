export type QuestionType = "single_choice" | "reading_program" | "completion_program";
export type Difficulty = "easy" | "medium" | "hard";
export type QuestionStatus = "draft" | "reviewed" | "published" | "archived";
export type PrebuiltPaperStatus = "draft" | "published" | "archived";
export type QuestionSource = "ai" | "manual" | "real_paper";
export type ReviewStatus = "pending" | "ai_reviewed" | "confirmed" | "rejected";
export type UserRole = "student" | "coach" | "admin";
export type UserStatus = "active" | "locked" | "deleted";

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResult<T> {
  items: T[];
  pagination: Pagination;
}

export interface AdminQuestionListItem {
  id: string;
  type: QuestionType;
  difficulty: Difficulty;
  status: QuestionStatus;
  source: QuestionSource;
  sandboxVerified: boolean;
  createdAt?: string;
}

export interface AdminQuestionDetail extends AdminQuestionListItem {
  primaryKpId: number;
  contentHash: string;
  contentJson: Record<string, unknown>;
  answerJson: Record<string, unknown>;
  explanationJson: Record<string, unknown>;
  examTypes: string[];
  publishedAt?: string | null;
  archivedAt?: string | null;
  updatedAt?: string;
}

export interface AdminQuestionReferences {
  questionId: string;
  prebuiltPaperReferences: number;
  paperInstanceReferences: number;
  assignmentReferences: number;
  totalReferences: number;
  canDelete: boolean;
}

export interface AdminQuestionPayload {
  type?: QuestionType;
  difficulty?: Difficulty;
  primaryKpId?: number;
  auxiliaryKpIds?: number[];
  examTypes?: string[];
  contentHash?: string;
  contentJson?: Record<string, unknown>;
  answerJson?: Record<string, unknown>;
  explanationJson?: Record<string, unknown>;
  source?: QuestionSource;
  sandboxVerified?: boolean;
}

export interface AdminPrebuiltPaperSlot {
  slotNo: number;
  questionId: string;
  questionType: QuestionType;
  primaryKpId: number;
  difficulty: Difficulty;
  points: number;
}

export interface AdminPrebuiltPaperListItem {
  id: string;
  title: string;
  examType: string;
  difficulty: Difficulty;
  blueprintVersion: number;
  rootPaperId?: string | null;
  parentPaperId?: string | null;
  versionNo: number;
  status: PrebuiltPaperStatus;
  sourceBatchId?: string | null;
  metadataJson?: Record<string, unknown>;
  publishedAt?: string | null;
  archivedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface AdminPrebuiltPaperDetail extends AdminPrebuiltPaperListItem {
  slots: AdminPrebuiltPaperSlot[];
}

export interface AdminPrebuiltPaperReferences {
  prebuiltPaperId: string;
  paperInstanceReferences: number;
  assignmentReferences: number;
  totalReferences: number;
  canDelete: boolean;
}

export interface AdminPrebuiltPaperPayload {
  title?: string;
  examType?: string;
  difficulty?: Difficulty;
  blueprintVersion?: number;
  metadataJson?: Record<string, unknown>;
  slots?: AdminPrebuiltPaperSlot[];
}

export interface AdminQuestionReview {
  id: string;
  questionId: string;
  reviewStatus: ReviewStatus;
  aiConfidence?: number | null;
  officialAnswerDiff?: unknown;
  reviewerNotes?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  createdAt?: string;
}

export interface AdminUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  status: UserStatus;
  createdAt?: string;
}

export interface AdminSettingItem {
  key: string;
  category: string;
  label: string;
  description: string;
  defaultValue: unknown;
  valueType: "number" | "boolean" | "string" | "json";
  valueJson: unknown;
  isDefault: boolean;
  updatedBy?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface AdminSettingUpdateResult {
  key: string;
  valueJson: unknown;
  updatedBy?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  runtimeConfig?: {
    revision: number;
    loadedAt: string | null;
  };
  configChange?: {
    channel: string;
    published: boolean;
    subscriberCount: number;
  };
}

interface ApiErrorPayload {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

interface ApiSuccessPayload<T> {
  success: true;
  data: T;
}

type ApiPayload<T> = ApiErrorPayload | ApiSuccessPayload<T>;

export class AdminContentClientError extends Error {
  code: string;
  details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "AdminContentClientError";
    this.code = code;
    this.details = details;
  }
}

async function readApiPayload<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as ApiPayload<T>;

  if (!response.ok || payload.success === false) {
    const error = payload.success === false ? payload.error : undefined;
    throw new AdminContentClientError(
      error?.code ?? "ROUND1_REQUEST_FAILED",
      error?.message ?? `请求失败 (${response.status})`,
      error?.details,
    );
  }

  return payload.data;
}

function appendParams(path: string, params: Record<string, string | number | undefined>) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      searchParams.set(key, String(value));
    }
  }

  const query = searchParams.toString();
  return query ? `${path}?${query}` : path;
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

export function parseJsonObject(raw: string, label: string): Record<string, unknown> {
  const parsed = JSON.parse(raw) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${label} 必须是 JSON 对象`);
  }

  return parsed as Record<string, unknown>;
}

export function stringifyJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

export function fetchAdminQuestions(
  params: {
    page?: number;
    pageSize?: number;
    questionType?: QuestionType | "all";
    difficulty?: Difficulty | "all";
    status?: QuestionStatus | "all";
    source?: QuestionSource | "all";
  } = {},
) {
  return requestJson<PaginatedResult<AdminQuestionListItem>>(
    appendParams("/api/v1/admin/questions", {
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 20,
      questionType: params.questionType === "all" ? undefined : params.questionType,
      difficulty: params.difficulty === "all" ? undefined : params.difficulty,
      status: params.status === "all" ? undefined : params.status,
      source: params.source === "all" ? undefined : params.source,
    }),
  );
}

export function fetchAdminQuestion(id: string) {
  return requestJson<AdminQuestionDetail>(`/api/v1/admin/questions/${id}`);
}

export function fetchAdminQuestionReferences(id: string) {
  return requestJson<AdminQuestionReferences>(`/api/v1/admin/questions/${id}/references`);
}

export function createAdminQuestion(payload: Required<AdminQuestionPayload>) {
  return requestJson<AdminQuestionListItem>("/api/v1/admin/questions", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateAdminQuestion(id: string, payload: AdminQuestionPayload) {
  return requestJson<AdminQuestionListItem>(`/api/v1/admin/questions/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function publishAdminQuestion(id: string) {
  return requestJson<AdminQuestionListItem>(`/api/v1/admin/questions/${id}/publish`, {
    method: "POST",
  });
}

export function archiveAdminQuestion(id: string) {
  return requestJson<AdminQuestionListItem>(`/api/v1/admin/questions/${id}/archive`, {
    method: "POST",
  });
}

export function deleteAdminQuestion(id: string) {
  return requestJson<{ id: string; message: string }>(`/api/v1/admin/questions/${id}`, {
    method: "DELETE",
  });
}

export function fetchAdminPrebuiltPapers(
  params: {
    page?: number;
    pageSize?: number;
    examType?: string;
    difficulty?: Difficulty | "all";
    status?: PrebuiltPaperStatus | "all";
  } = {},
) {
  return requestJson<PaginatedResult<AdminPrebuiltPaperListItem>>(
    appendParams("/api/v1/admin/prebuilt-papers", {
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 20,
      examType: params.examType,
      difficulty: params.difficulty === "all" ? undefined : params.difficulty,
      status: params.status === "all" ? undefined : params.status,
    }),
  );
}

export function fetchAdminPrebuiltPaper(id: string) {
  return requestJson<AdminPrebuiltPaperDetail>(`/api/v1/admin/prebuilt-papers/${id}`);
}

export function fetchAdminPrebuiltPaperReferences(id: string) {
  return requestJson<AdminPrebuiltPaperReferences>(
    `/api/v1/admin/prebuilt-papers/${id}/references`,
  );
}

export function createAdminPrebuiltPaper(payload: Required<AdminPrebuiltPaperPayload>) {
  return requestJson<AdminPrebuiltPaperListItem>("/api/v1/admin/prebuilt-papers", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateAdminPrebuiltPaper(id: string, payload: AdminPrebuiltPaperPayload) {
  return requestJson<AdminPrebuiltPaperListItem>(`/api/v1/admin/prebuilt-papers/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function publishAdminPrebuiltPaper(id: string) {
  return requestJson<AdminPrebuiltPaperListItem>(`/api/v1/admin/prebuilt-papers/${id}/publish`, {
    method: "POST",
  });
}

export function archiveAdminPrebuiltPaper(id: string) {
  return requestJson<AdminPrebuiltPaperListItem>(`/api/v1/admin/prebuilt-papers/${id}/archive`, {
    method: "POST",
  });
}

export function copyAdminPrebuiltPaperVersion(id: string) {
  return requestJson<AdminPrebuiltPaperListItem>(
    `/api/v1/admin/prebuilt-papers/${id}/copy-version`,
    { method: "POST" },
  );
}

export function deleteAdminPrebuiltPaper(id: string) {
  return requestJson<{ id: string; message: string }>(`/api/v1/admin/prebuilt-papers/${id}`, {
    method: "DELETE",
  });
}

export function fetchQuestionReviews(
  params: {
    page?: number;
    pageSize?: number;
    status?: ReviewStatus | "all";
  } = {},
) {
  return requestJson<PaginatedResult<AdminQuestionReview>>(
    appendParams("/api/v1/admin/question-reviews", {
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 20,
      status: params.status === "all" ? undefined : params.status,
    }),
  );
}

export function confirmQuestionReview(questionId: string) {
  return requestJson<{ id: string; status: QuestionStatus; reviewStatus: ReviewStatus }>(
    `/api/v1/admin/questions/${questionId}/confirm`,
    { method: "POST" },
  );
}

export function rejectQuestionReview(questionId: string, reviewerNotes: string) {
  return requestJson<{ id: string; status: QuestionStatus; reviewStatus: ReviewStatus }>(
    `/api/v1/admin/questions/${questionId}/reject`,
    {
      method: "POST",
      body: JSON.stringify({ reviewerNotes }),
    },
  );
}

export function fetchAdminUsers(
  params: {
    page?: number;
    pageSize?: number;
    role?: UserRole | "all";
  } = {},
) {
  return requestJson<PaginatedResult<AdminUser>>(
    appendParams("/api/v1/admin/users", {
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 20,
      role: params.role === "all" ? undefined : params.role,
    }),
  );
}

export function updateAdminUserRole(userId: string, role: UserRole) {
  return requestJson<{ id: string; role: UserRole }>(`/api/v1/admin/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
}

export function deleteAdminUser(userId: string) {
  return requestJson<{ message: string }>(`/api/v1/admin/users/${userId}`, {
    method: "DELETE",
  });
}

export function restoreAdminUser(userId: string) {
  return requestJson<{ message: string }>(`/api/v1/admin/users/${userId}/restore`, {
    method: "POST",
  });
}

export function fetchAdminSettings() {
  return requestJson<{ items: AdminSettingItem[] }>("/api/v1/admin/settings");
}

export function updateAdminSetting(key: string, valueJson: unknown) {
  return requestJson<AdminSettingUpdateResult>(
    `/api/v1/admin/settings/${encodeURIComponent(key)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ valueJson }),
    },
  );
}
