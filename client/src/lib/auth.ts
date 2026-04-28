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
  const csrfToken = await getCachedAuthCsrfToken();
  const response = await fetch("/api/v1/auth/login/password", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken,
    },
    body: JSON.stringify(payload),
  });

  return readApiPayload<PasswordLoginResult>(response);
}
