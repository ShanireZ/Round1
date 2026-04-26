export type ExamResultPaper = {
  id: string;
  examType: string;
  difficulty: string | null;
  status: string;
  assignmentId: string | null;
};

export type ExamResultSectionSummary = {
  total: number;
  correct: number;
  score: number;
  maxScore: number;
};

export type ExamResultPrimaryKpSummary = {
  total: number;
  correct: number;
  accuracy: number;
};

export type ExamResultWrongItem = {
  slotNo: number;
  questionType: string;
  subQuestionKey: string;
  submittedAnswer: string | null;
  correctAnswer: string;
  points: number;
  explanation: string | null;
};

export type ExamResultAttempt = {
  id: string;
  status: string;
  submittedAt: string | null;
  score: number | null;
  perSectionJson: Record<string, ExamResultSectionSummary> | null;
  perPrimaryKpJson: Record<string, ExamResultPrimaryKpSummary> | null;
  reportStatus: string | null;
  report: {
    wrongs: ExamResultWrongItem[];
  } | null;
};

export type ExamResultSubQuestion = {
  key: string;
  submittedAnswer: string | null;
  correctAnswer: string;
  isCorrect: boolean;
  points: number;
  explanation: string | null;
};

export type ExamResultItem = {
  slotNo: number;
  questionType: string;
  primaryKpId: number;
  points: number;
  contentJson: unknown;
  submittedAnswers: Record<string, string>;
  result: {
    earnedScore: number;
    maxScore: number;
    correctCount: number;
    totalCount: number;
    subQuestions: ExamResultSubQuestion[];
  };
};

export type ExamResultPayload = {
  paper: ExamResultPaper;
  attempt: ExamResultAttempt;
  items: ExamResultItem[];
};

export type ExamResultNavigationState = {
  fromSubmit?: boolean;
  attemptId?: string | null;
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

export class ExamResultClientError extends Error {
  code: string;
  details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ExamResultClientError";
    this.code = code;
    this.details = details;
  }
}

async function readApiPayload<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as ApiPayload<T>;

  if (!response.ok || payload.success === false) {
    const error = payload.success === false ? payload.error : undefined;
    throw new ExamResultClientError(
      error?.code ?? "ROUND1_REQUEST_FAILED",
      error?.message ?? `请求失败 (${response.status})`,
      error?.details,
    );
  }

  return payload.data;
}

export async function fetchExamResult(paperId: string): Promise<ExamResultPayload> {
  const response = await fetch(`/api/v1/exams/${paperId}/result`, {
    credentials: "include",
  });

  return readApiPayload<ExamResultPayload>(response);
}

export function formatExamTypeBadgeVariant(
  examType: string,
): "csp-j" | "csp-s" | "gesp-low" | "gesp-high" {
  if (examType === "CSP-J") {
    return "csp-j";
  }

  if (examType === "CSP-S") {
    return "csp-s";
  }

  const gespLevel = Number(examType.replace("GESP-", ""));
  if (Number.isFinite(gespLevel) && gespLevel >= 4) {
    return "gesp-high";
  }

  return "gesp-low";
}

export function formatDifficultyLabel(difficulty: string | null): string {
  if (difficulty === "easy") {
    return "基础";
  }

  if (difficulty === "medium") {
    return "进阶";
  }

  if (difficulty === "hard") {
    return "冲刺";
  }

  return "未分级";
}

export function getCeremonyStorageKey(paperId: string): string {
  return `round1:exam-result-ceremony:${paperId}`;
}

export function shouldShowCeremonyOnEntry({
  navigationState,
  hasSeenCeremony,
}: {
  navigationState: unknown;
  hasSeenCeremony: boolean;
}): boolean {
  if (hasSeenCeremony) {
    return false;
  }

  if (!navigationState || typeof navigationState !== "object" || Array.isArray(navigationState)) {
    return false;
  }

  return (navigationState as ExamResultNavigationState).fromSubmit === true;
}
