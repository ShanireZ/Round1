import { getCachedAuthCsrfToken } from "./auth";

export type StudentClassSummary = {
  classId: string;
  name: string;
  archivedAt: string | null;
  joinedVia: string;
  joinedAt: string;
  openAssignments: number;
  completedAssignments: number;
  missedAssignments: number;
};

export type ClassMembership = {
  classId: string;
  userId: string;
  username: string;
  displayName: string;
  role: string;
  joinedVia: string;
  joinedAt: string;
};

export type AccountSecuritySummary = {
  profile: {
    id: string;
    username: string;
    displayName: string;
    role: "student" | "coach" | "admin";
    status: string;
    passwordChangeRequired: boolean;
    lastStrongAuthAt: string | null;
  };
  email: {
    email: string;
    verifiedAt: string | null;
    source: string;
  } | null;
  passwordEnabled: boolean;
  totpEnabledAt: string | null;
  passkeys: Array<{
    credentialIdSuffix: string;
    backupEligible: boolean;
    backupState: boolean;
    createdAt: string;
  }>;
  externalIdentities: Array<{
    provider: string;
    providerType: string;
    providerEmail: string | null;
    createdAt: string;
  }>;
};

export type EmailChallenge = {
  challengeId: string;
  expiresAt: string;
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

export class AccountClientError extends Error {
  code: string;
  details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "AccountClientError";
    this.code = code;
    this.details = details;
  }
}

async function readApiPayload<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as ApiPayload<T>;

  if (!response.ok || payload.success === false) {
    const error = payload.success === false ? payload.error : undefined;
    throw new AccountClientError(
      error?.code ?? "ROUND1_ACCOUNT_REQUEST_FAILED",
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

export function normalizeClassJoinCode(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

export function summarizeStudentClasses(classes: readonly StudentClassSummary[]) {
  return classes.reduce(
    (summary, klass) => ({
      activeClasses: summary.activeClasses + (klass.archivedAt ? 0 : 1),
      openAssignments: summary.openAssignments + klass.openAssignments,
      completedAssignments: summary.completedAssignments + klass.completedAssignments,
      missedAssignments: summary.missedAssignments + klass.missedAssignments,
    }),
    {
      activeClasses: 0,
      openAssignments: 0,
      completedAssignments: 0,
      missedAssignments: 0,
    },
  );
}

export function formatAccountDate(value: string | null | undefined): string {
  if (!value) {
    return "暂无";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function fetchMyClasses() {
  return requestJson<{ items: StudentClassSummary[] }>("/api/v1/classes/mine");
}

export function joinClass(payload: { code?: string; inviteToken?: string }) {
  return requestJson<ClassMembership>("/api/v1/classes/join", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchAccountSecuritySummary() {
  return requestJson<AccountSecuritySummary>("/api/v1/auth/security/summary");
}

export function changePassword(payload: { currentPassword: string; newPassword: string }) {
  return requestJson<{ message: string; passwordChangeRequired: boolean }>(
    "/api/v1/auth/password/change",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export function requestEmailChange(newEmail: string) {
  return requestJson<EmailChallenge>("/api/v1/auth/email/change/request-challenge", {
    method: "POST",
    body: JSON.stringify({ newEmail }),
  });
}

export function verifyEmailChangeCode(challengeId: string, code: string) {
  return requestJson<{ ticket: string }>("/api/v1/auth/email/change/verify-code", {
    method: "POST",
    body: JSON.stringify({ challengeId, code }),
  });
}

export function confirmEmailChange(ticket: string) {
  return requestJson<{ message: string }>("/api/v1/auth/email/change/confirm", {
    method: "POST",
    body: JSON.stringify({ ticket }),
  });
}

export function startTotpEnrollment() {
  return requestJson<{ otpauthUrl: string }>("/api/v1/auth/totp/enroll/start", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function verifyTotpEnrollment(code: string) {
  return requestJson<{ success: boolean }>("/api/v1/auth/totp/enroll/verify", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export function deleteTotpEnrollment() {
  return requestJson<{ success: boolean }>("/api/v1/auth/totp", {
    method: "DELETE",
  });
}
