import type { StartAuthenticationOpts } from "@simplewebauthn/browser";

export type AuthSessionUser = {
  id: string;
  username: string;
  displayName: string;
  role: "student" | "coach" | "admin";
  status: string;
};

export type AuthSession =
  | {
      authenticated: false;
      user?: undefined;
    }
  | {
      authenticated: true;
      user: AuthSessionUser;
    };

export type PasswordLoginPayload = {
  identifier: string;
  password: string;
  deviceIdHash?: string;
};

export type PasswordLoginResult = AuthSessionUser & {
  passwordChangeRequired: boolean;
};

export type AuthChallenge = {
  challengeId: string;
  expiresAt: string;
};

export type AuthTicket = {
  ticket: string;
  flow?: "register" | "reset_password" | "change_email";
};

export type CompleteRegistrationPayload = {
  ticket: string;
  username: string;
  password: string;
  displayName?: string;
  deviceIdHash?: string;
};

export type CompleteExternalProfilePayload = CompleteRegistrationPayload;

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

let csrfTokenPromise: Promise<string> | null = null;

export class AuthClientError extends Error {
  code: string;
  details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "AuthClientError";
    this.code = code;
    this.details = details;
  }
}

async function readApiPayload<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as ApiPayload<T>;

  if (!response.ok || payload.success === false) {
    const error = payload.success === false ? payload.error : undefined;
    throw new AuthClientError(
      error?.code ?? "ROUND1_REQUEST_FAILED",
      error?.message ?? `请求失败 (${response.status})`,
      error?.details,
    );
  }

  return payload.data;
}

async function requestAuthJson<T>(path: string, init?: RequestInit): Promise<T> {
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

export async function fetchAuthCsrfToken(): Promise<string> {
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

export function getCachedAuthCsrfToken(): Promise<string> {
  csrfTokenPromise ??= fetchAuthCsrfToken().catch((error) => {
    csrfTokenPromise = null;
    throw error;
  });
  return csrfTokenPromise;
}

export async function fetchAuthSession(): Promise<AuthSession> {
  const response = await fetch("/api/v1/auth/session", {
    method: "GET",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
  });

  return readApiPayload<AuthSession>(response);
}

export async function passwordLogin(payload: PasswordLoginPayload): Promise<PasswordLoginResult> {
  return requestAuthJson<PasswordLoginResult>("/api/v1/auth/login/password", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function normalizeAuthCode(value: string): string {
  return value.replace(/\s+/g, "");
}

export function isValidAuthUsername(value: string): boolean {
  return /^[A-Za-z0-9]{4,20}$/.test(value);
}

export function resolveAuthReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }

  if (
    value.startsWith("/login") ||
    value.startsWith("/register") ||
    value.startsWith("/forgot-password") ||
    value.startsWith("/auth/")
  ) {
    return "/dashboard";
  }

  return value;
}

export function requestRegisterEmailChallenge(email: string): Promise<AuthChallenge> {
  return requestAuthJson<AuthChallenge>("/api/v1/auth/register/email/request-challenge", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function verifyRegisterEmailCode(challengeId: string, code: string): Promise<AuthTicket> {
  return requestAuthJson<AuthTicket>("/api/v1/auth/register/email/verify-code", {
    method: "POST",
    body: JSON.stringify({ challengeId, code: normalizeAuthCode(code) }),
  });
}

export function redeemRegisterEmailLink(challengeId: string, token: string): Promise<AuthTicket> {
  return requestAuthJson<AuthTicket>("/api/v1/auth/register/email/redeem-link", {
    method: "POST",
    body: JSON.stringify({ challengeId, token }),
  });
}

export function completeEmailRegistration(
  payload: CompleteRegistrationPayload,
): Promise<AuthSessionUser> {
  return requestAuthJson<AuthSessionUser>("/api/v1/auth/register/email/complete", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function requestPasswordResetChallenge(email: string): Promise<{ message: string }> {
  return requestAuthJson<{ message: string }>("/api/v1/auth/password/request-challenge", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function verifyPasswordResetCode(challengeId: string, code: string): Promise<AuthTicket> {
  return requestAuthJson<AuthTicket>("/api/v1/auth/password/verify-code", {
    method: "POST",
    body: JSON.stringify({ challengeId, code: normalizeAuthCode(code) }),
  });
}

export function redeemPasswordResetLink(challengeId: string, token: string): Promise<AuthTicket> {
  return requestAuthJson<AuthTicket>("/api/v1/auth/password/redeem-link", {
    method: "POST",
    body: JSON.stringify({ challengeId, token }),
  });
}

export function resetPassword(ticket: string, newPassword: string): Promise<{ message: string }> {
  return requestAuthJson<{ message: string }>("/api/v1/auth/password/reset", {
    method: "POST",
    body: JSON.stringify({ ticket, newPassword }),
  });
}

export function redeemEmailChangeLink(challengeId: string, token: string): Promise<AuthTicket> {
  return requestAuthJson<AuthTicket>("/api/v1/auth/email/change/redeem-link", {
    method: "POST",
    body: JSON.stringify({ challengeId, token }),
  });
}

export function confirmEmailChange(ticket: string): Promise<{ message: string }> {
  return requestAuthJson<{ message: string }>("/api/v1/auth/email/change/confirm", {
    method: "POST",
    body: JSON.stringify({ ticket }),
  });
}

export function completeExternalProfile(
  payload: CompleteExternalProfilePayload,
): Promise<{ userId: string; username: string }> {
  return requestAuthJson<{ userId: string; username: string }>("/api/v1/auth/complete-profile", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchPasskeyLoginOptions(): Promise<StartAuthenticationOpts["optionsJSON"]> {
  return requestAuthJson<StartAuthenticationOpts["optionsJSON"]>(
    "/api/v1/auth/login/passkey/options",
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
}

export function verifyPasskeyLogin(credential: unknown): Promise<{ verified: boolean }> {
  return requestAuthJson<{ verified: boolean }>("/api/v1/auth/login/passkey/verify", {
    method: "POST",
    body: JSON.stringify(credential),
  });
}

export function logout(): Promise<{ message: string }> {
  return requestAuthJson<{ message: string }>("/api/v1/auth/logout", {
    method: "POST",
    body: JSON.stringify({}),
  });
}
