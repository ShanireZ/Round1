export type ClientRuntimeConfig = {
  turnstileSiteKey: string;
  powEnabled: boolean;
  powBaseDifficulty: number;
  autosaveIntervalSeconds: number;
  examDraftTtlMinutes: number;
  availableExamTypes: string[];
  availableDifficulties: string[];
  enabledAuthProviders: string[];
  authProviderPlaceholders: string[];
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

const DEFAULT_AUTOSAVE_INTERVAL_SECONDS = 180;

export class ClientConfigError extends Error {
  code: string;
  details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ClientConfigError";
    this.code = code;
    this.details = details;
  }
}

export async function fetchClientRuntimeConfig(): Promise<ClientRuntimeConfig> {
  const response = await fetch("/api/v1/config/client", {
    method: "GET",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
  });
  const payload = (await response.json()) as ApiPayload<ClientRuntimeConfig>;

  if (!response.ok || payload.success === false) {
    const error = payload.success === false ? payload.error : undefined;
    throw new ClientConfigError(
      error?.code ?? "ROUND1_CLIENT_CONFIG_FAILED",
      error?.message ?? `读取前端运行时配置失败 (${response.status})`,
      error?.details,
    );
  }

  return payload.data;
}

export function getAutosaveIntervalMs(
  config?: Pick<ClientRuntimeConfig, "autosaveIntervalSeconds"> | null,
) {
  const seconds = config?.autosaveIntervalSeconds ?? DEFAULT_AUTOSAVE_INTERVAL_SECONDS;
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return DEFAULT_AUTOSAVE_INTERVAL_SECONDS * 1000;
  }

  return seconds * 1000;
}
