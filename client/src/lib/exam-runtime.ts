export type RuntimeAttempt = {
  id: string;
  paperId: string;
  status: string;
  tabNonce: string;
};

export type RuntimeAttemptAnswers = Record<string, unknown>;

export type AutosaveAnswerPatch = {
  slotNo: number;
  subKey: string;
  value: string;
  updatedAt?: string;
};

export type AutosavedAttempt = RuntimeAttempt & {
  startedAt: string | null;
  answersJson: RuntimeAttemptAnswers;
};

export type ActiveRuntimeAttempt = RuntimeAttempt & {
  startedAt: string | null;
  submitAt: string;
  remainingMs: number;
  examType: string;
  difficulty: string | null;
  assignmentId: string | null;
  resumePath: string;
};

export type ExamCatalogItem = {
  examType: string;
  difficulty: string;
  count: number;
};

export type DraftExamPaper = {
  id: string;
  prebuiltPaperId: string | null;
  examType: string;
  difficulty: string | null;
  status: string;
};

export type CreateExamDraftPayload = {
  examType: string;
  difficulty: "easy" | "medium" | "hard";
  assignmentId?: string;
};

export type ExamSessionPaper = {
  id: string;
  examType: string;
  difficulty: string | null;
  status: string;
  assignmentId: string | null;
};

export type ExamSessionAttempt = RuntimeAttempt & {
  startedAt: string | null;
  submitAt: string;
  remainingMs: number;
  answersJson: RuntimeAttemptAnswers;
};

export type ExamSessionItem = {
  slotNo: number;
  questionType: string;
  primaryKpId: number;
  points: number;
  contentJson: unknown;
};

export type ExamSessionPayload = {
  paper: ExamSessionPaper;
  attempt: ExamSessionAttempt;
  items: ExamSessionItem[];
};

export type SubmittedAttemptResult = {
  id: string;
  paperId: string;
  status: string;
  submittedAt: string | null;
  score: number | null;
  perSectionJson: Record<string, unknown> | null;
  perPrimaryKpJson: Record<string, unknown> | null;
  reportStatus?: string;
  report?: Record<string, unknown>;
};

export type UserAttemptHistoryItem = {
  id: string;
  paperId: string;
  examType: string;
  difficulty: string | null;
  status: string;
  score: number | null;
  submittedAt: string | null;
};

export type UserAttemptHistoryPayload = {
  items: UserAttemptHistoryItem[];
  page: number;
  pageSize: number;
  total: number;
};

export type UserWeakPrimaryKp = {
  kpId: string;
  total: number;
  correct: number;
  accuracy: number;
};

export type UserStatsPayload = {
  totalAttempts: number;
  averageScore: number;
  bestScore: number;
  latestSubmittedAt: string | null;
  weakPrimaryKps: UserWeakPrimaryKp[];
};

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

let csrfTokenPromise: Promise<string> | null = null;

export class ExamRuntimeClientError extends Error {
  code: string;
  details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ExamRuntimeClientError";
    this.code = code;
    this.details = details;
  }
}

async function readApiPayload<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as ApiPayload<T>;

  if (!response.ok || payload.success === false) {
    const error = payload.success === false ? payload.error : undefined;
    throw new ExamRuntimeClientError(
      error?.code ?? "ROUND1_REQUEST_FAILED",
      error?.message ?? `请求失败 (${response.status})`,
      error?.details,
    );
  }

  return payload.data;
}

export async function fetchCsrfToken(): Promise<string> {
  const response = await fetch("/api/v1/auth/csrf-token", {
    method: "GET",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
  });
  const data = await readApiPayload<{ csrfToken: string }>(response);
  return data.csrfToken;
}

export function getCachedCsrfToken(): Promise<string> {
  csrfTokenPromise ??= fetchCsrfToken().catch((error) => {
    csrfTokenPromise = null;
    throw error;
  });
  return csrfTokenPromise;
}

export function clearCachedCsrfTokenForTests() {
  csrfTokenPromise = null;
}

async function buildMutationHeaders(extraHeaders?: Record<string, string>) {
  const csrfToken = await getCachedCsrfToken();
  return {
    "Content-Type": "application/json",
    "X-CSRF-Token": csrfToken,
    ...extraHeaders,
  };
}

export async function fetchExamSession(paperId: string): Promise<ExamSessionPayload> {
  const response = await fetch(`/api/v1/exams/${paperId}/session`, {
    method: "GET",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
  });

  return readApiPayload<ExamSessionPayload>(response);
}

export async function startExamAttempt(paperId: string): Promise<RuntimeAttempt> {
  const response = await fetch(`/api/v1/exams/${paperId}/attempts`, {
    method: "POST",
    credentials: "include",
    headers: await buildMutationHeaders(),
    body: JSON.stringify({}),
  });

  return readApiPayload<RuntimeAttempt>(response);
}

export async function fetchExamCatalog(): Promise<{ items: ExamCatalogItem[] }> {
  const response = await fetch("/api/v1/exams/catalog", {
    method: "GET",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
  });

  return readApiPayload<{ items: ExamCatalogItem[] }>(response);
}

export async function fetchActiveDraftExam(): Promise<DraftExamPaper | null> {
  const response = await fetch("/api/v1/exams/active-draft", {
    method: "GET",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
  });

  return readApiPayload<DraftExamPaper | null>(response);
}

export async function createExamDraft(payload: CreateExamDraftPayload): Promise<DraftExamPaper> {
  const response = await fetch("/api/v1/exams", {
    method: "POST",
    credentials: "include",
    headers: await buildMutationHeaders(),
    body: JSON.stringify(payload),
  });

  return readApiPayload<DraftExamPaper>(response);
}

export async function autosaveExamAttempt({
  attemptId,
  tabNonce,
  patches,
  csrfToken,
  keepalive = false,
}: {
  attemptId: string;
  tabNonce: string;
  patches: AutosaveAnswerPatch[];
  csrfToken?: string;
  keepalive?: boolean;
}): Promise<AutosavedAttempt> {
  const response = await fetch(`/api/v1/attempts/${attemptId}`, {
    method: "PATCH",
    credentials: "include",
    keepalive,
    headers: {
      "Content-Type": "application/json",
      "X-Tab-Nonce": tabNonce,
      "X-CSRF-Token": csrfToken ?? (await getCachedCsrfToken()),
    },
    body: JSON.stringify({ patches }),
  });

  return readApiPayload<AutosavedAttempt>(response);
}

export function sendKeepaliveAutosave({
  attemptId,
  tabNonce,
  patches,
  csrfToken,
}: {
  attemptId: string;
  tabNonce: string;
  patches: AutosaveAnswerPatch[];
  csrfToken: string | null;
}): boolean {
  if (!csrfToken || patches.length === 0) {
    return false;
  }

  void fetch(`/api/v1/attempts/${attemptId}`, {
    method: "PATCH",
    credentials: "include",
    keepalive: true,
    headers: {
      "Content-Type": "application/json",
      "X-Tab-Nonce": tabNonce,
      "X-CSRF-Token": csrfToken,
    },
    body: JSON.stringify({ patches }),
  });

  return true;
}

export async function submitExamAttempt(
  attemptId: string,
  options: { tabNonce?: string; patches?: AutosaveAnswerPatch[] } = {},
): Promise<SubmittedAttemptResult> {
  const hasPatches = Boolean(options.patches?.length);
  const response = await fetch(`/api/v1/attempts/${attemptId}/submit`, {
    method: "POST",
    credentials: "include",
    headers: await buildMutationHeaders(
      hasPatches && options.tabNonce ? { "X-Tab-Nonce": options.tabNonce } : undefined,
    ),
    body: JSON.stringify(hasPatches ? { patches: options.patches } : {}),
  });

  return readApiPayload<SubmittedAttemptResult>(response);
}

export async function fetchActiveAttempt(): Promise<ActiveRuntimeAttempt | null> {
  const response = await fetch("/api/v1/attempts/active", {
    method: "GET",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
  });

  return readApiPayload<ActiveRuntimeAttempt | null>(response);
}

export async function fetchUserAttemptHistory(
  params: {
    page?: number;
    pageSize?: number;
  } = {},
): Promise<UserAttemptHistoryPayload> {
  const searchParams = new URLSearchParams({
    page: String(params.page ?? 1),
    pageSize: String(params.pageSize ?? 20),
  });
  const response = await fetch(`/api/v1/users/me/attempts?${searchParams.toString()}`, {
    method: "GET",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
  });

  return readApiPayload<UserAttemptHistoryPayload>(response);
}

export async function fetchUserStats(): Promise<UserStatsPayload> {
  const response = await fetch("/api/v1/users/me/stats", {
    method: "GET",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
  });

  return readApiPayload<UserStatsPayload>(response);
}
