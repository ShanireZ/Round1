/**
 * LLM provider-direct routing configuration.
 *
 * - `LLM_PROVIDER_DEFAULT` selects the primary provider lane.
 * - `LLM_PROVIDER_BACKUP` selects the optional fallback provider lane.
 * - Each provider has its own `API_KEY`, `BASE_URL`, and `MODEL` env vars.
 * - Explicit route overrides are diagnostic-only and limited to the approved
 *   provider set below. Normal execution should prefer `LLM_PROVIDER_DEFAULT`
 *   and `LLM_PROVIDER_BACKUP`.
 * - Reasoning policy is unified under `LLM_REASONING_DEFAULT` and mapped to
 *   model-aware provider options supported by the installed SDK packages.
 * - Non-effort reasoning controls use `LLM_THINKING_TYPE_DEFAULT` and
 *   `LLM_THINKING_BUDGET_DEFAULT` when the current model family expects them.
 * - Reasoning summary is unified under `LLM_REASONING_SUMMARY_DEFAULT`.
 */
import type { LanguageModel } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createXai } from "@ai-sdk/xai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { env, type Env } from "./env.js";

// -- Provider / lane metadata ------------------------------------------------

export const providerApiKeyEnvVars = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_API_KEY",
  xiaomi: "XIAOMI_API_KEY",
  alibaba: "ALIBABA_API_KEY",
  moonshotai: "MOONSHOTAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  minimax: "MINIMAX_API_KEY",
  volcengine: "VOLCENGINE_API_KEY",
  xai: "XAI_API_KEY",
  zai: "ZAI_API_KEY",
} as const;

export const providerBaseUrlEnvVars = {
  openai: "OPENAI_BASE_URL",
  anthropic: "ANTHROPIC_BASE_URL",
  google: "GOOGLE_BASE_URL",
  xiaomi: "XIAOMI_BASE_URL",
  alibaba: "ALIBABA_BASE_URL",
  moonshotai: "MOONSHOTAI_BASE_URL",
  openrouter: "OPENROUTER_BASE_URL",
  deepseek: "DEEPSEEK_BASE_URL",
  minimax: "MINIMAX_BASE_URL",
  volcengine: "VOLCENGINE_BASE_URL",
  xai: "XAI_BASE_URL",
  zai: "ZAI_BASE_URL",
} as const;

export const providerModelEnvVars = {
  openai: "OPENAI_MODEL",
  anthropic: "ANTHROPIC_MODEL",
  google: "GOOGLE_MODEL",
  xiaomi: "XIAOMI_MODEL",
  alibaba: "ALIBABA_MODEL",
  moonshotai: "MOONSHOTAI_MODEL",
  openrouter: "OPENROUTER_MODEL",
  deepseek: "DEEPSEEK_MODEL",
  minimax: "MINIMAX_MODEL",
  volcengine: "VOLCENGINE_MODEL",
  xai: "XAI_MODEL",
  zai: "ZAI_MODEL",
} as const;

const defaultProviderBaseUrls: Record<LLMProviderName, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  google: "https://generativelanguage.googleapis.com/v1beta",
  xiaomi: "https://api.xiaomimimo.com/v1",
  alibaba: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  moonshotai: "https://api.moonshot.ai/v1",
  openrouter: "https://openrouter.ai/api/v1",
  deepseek: "https://api.deepseek.com",
  minimax: "https://api.minimax.io/v1",
  volcengine: "https://ark.cn-beijing.volces.com/api/v3",
  xai: "https://api.x.ai/v1",
  zai: "https://open.bigmodel.cn/api/paas/v4",
};

export type LLMProviderName = keyof typeof providerApiKeyEnvVars;
export type LLMLane = "default" | "backup";
export type LLMTask = "generate" | "judge";
export type LLMScene = LLMTask | "rewrite" | "paper_audit" | "answer_fill" | (string & {});

export const laneProviders: Record<LLMLane, string> = {
  default: env.LLM_PROVIDER_DEFAULT,
  backup: env.LLM_PROVIDER_BACKUP,
};

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type ProviderReasoningOptions = Record<string, Record<string, JsonValue>>;

export interface TaskConfig {
  providerName: LLMProviderName;
  model: string;
  baseURL: string;
  lane: LLMLane;
  pinnedProvider: boolean;
}

export interface TaskMeta {
  provider: LLMProviderName;
  model: string;
  baseURL: string;
  lane: LLMLane;
  pinnedProvider: boolean;
}

export interface ResolveSceneOptions {
  lane?: LLMLane;
  routePreferenceOverride?: string;
  modelOverride?: string;
  includeBackupFallback?: boolean;
}

type LLMReasoningEnv = Pick<
  Env,
  | "LLM_REASONING_DEFAULT"
  | "LLM_REASONING_SUMMARY_DEFAULT"
  | "LLM_THINKING_TYPE_DEFAULT"
  | "LLM_THINKING_BUDGET_DEFAULT"
>;

type LLMReasoningAttemptEnv = LLMReasoningEnv & Partial<LLMDirectRuntimeEnv>;

export type LLMDirectRuntimeEnv = Pick<
  Env,
  | "LLM_PROVIDER_DEFAULT"
  | "LLM_PROVIDER_BACKUP"
  | "LLM_REASONING_DEFAULT"
  | "LLM_REASONING_SUMMARY_DEFAULT"
  | "LLM_THINKING_TYPE_DEFAULT"
  | "LLM_THINKING_BUDGET_DEFAULT"
  | "OPENAI_API_KEY"
  | "OPENAI_BASE_URL"
  | "OPENAI_MODEL"
  | "ANTHROPIC_API_KEY"
  | "ANTHROPIC_BASE_URL"
  | "ANTHROPIC_MODEL"
  | "GOOGLE_API_KEY"
  | "GOOGLE_BASE_URL"
  | "GOOGLE_MODEL"
  | "XIAOMI_API_KEY"
  | "XIAOMI_BASE_URL"
  | "XIAOMI_MODEL"
  | "ALIBABA_API_KEY"
  | "ALIBABA_BASE_URL"
  | "ALIBABA_MODEL"
  | "MOONSHOTAI_API_KEY"
  | "MOONSHOTAI_BASE_URL"
  | "MOONSHOTAI_MODEL"
  | "OPENROUTER_API_KEY"
  | "OPENROUTER_BASE_URL"
  | "OPENROUTER_MODEL"
  | "DEEPSEEK_API_KEY"
  | "DEEPSEEK_BASE_URL"
  | "DEEPSEEK_MODEL"
  | "MINIMAX_API_KEY"
  | "MINIMAX_BASE_URL"
  | "MINIMAX_MODEL"
  | "VOLCENGINE_API_KEY"
  | "VOLCENGINE_BASE_URL"
  | "VOLCENGINE_MODEL"
  | "XAI_API_KEY"
  | "XAI_BASE_URL"
  | "XAI_MODEL"
  | "ZAI_API_KEY"
  | "ZAI_BASE_URL"
  | "ZAI_MODEL"
>;

// -- Reasoning policy --------------------------------------------------------

export type LLMReasoningPolicyToken =
  | "default"
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

export type LLMReasoningPolicy = readonly LLMReasoningPolicyToken[];
export type LLMReasoningSummaryMode = "off" | "auto" | "detailed";
export type OpenAiReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
export type AnthropicReasoningEffort = "low" | "medium" | "high" | "xhigh" | "max";
export type GoogleThinkingLevel = "minimal" | "low" | "medium" | "high";
export type LLMThinkingTypeMode = "default" | "enabled" | "disabled";
export type XaiReasoningEffort = "low" | "high";
export type OpenRouterReasoningEffort = OpenAiReasoningEffort;

export type LLMThinkingBudgetSetting =
  | { mode: "default" }
  | { mode: "dynamic" }
  | { mode: "off" }
  | { mode: "fixed"; value: number };

export interface LLMReasoningAttempt {
  policyToken: LLMReasoningPolicyToken;
  resolvedValue: string | undefined;
  providerOptions: ProviderReasoningOptions | undefined;
  openAiReasoningEffort: OpenAiReasoningEffort | undefined;
}

const llmReasoningPolicyTokens = [
  "default",
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

const llmReasoningPolicyTokenSet = new Set<string>(llmReasoningPolicyTokens);
const supportedProviders = new Set<LLMProviderName>(
  Object.keys(providerApiKeyEnvVars) as LLMProviderName[],
);
export const routeOverrideProviderNames = [
  "deepseek",
  "xiaomi",
  "alibaba",
  "minimax",
] as const satisfies readonly LLMProviderName[];
const routeOverrideProviders = new Set<string>(routeOverrideProviderNames);

function dedupeReasoningPolicy(tokens: readonly LLMReasoningPolicyToken[]): LLMReasoningPolicy {
  const deduped: LLMReasoningPolicyToken[] = [];
  const seen = new Set<LLMReasoningPolicyToken>();

  for (const token of tokens) {
    if (!seen.has(token)) {
      seen.add(token);
      deduped.push(token);
    }
  }

  return deduped.length > 0 ? deduped : ["default"];
}

export function parseReasoningPolicy(value: string): LLMReasoningPolicy {
  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0) {
    return ["default"];
  }

  const tokens = normalized
    .split(/[>,]/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

  const invalid = tokens.filter((token) => !llmReasoningPolicyTokenSet.has(token));
  if (invalid.length > 0) {
    throw new Error(
      `Unsupported LLM reasoning token(s): ${invalid.join(", ")}. Supported tokens: ${llmReasoningPolicyTokens.join(", ")}`,
    );
  }

  return dedupeReasoningPolicy(tokens as LLMReasoningPolicyToken[]);
}

function parseReasoningPolicyOverride(value: string | readonly string[]): LLMReasoningPolicy {
  if (typeof value === "string") {
    return parseReasoningPolicy(value);
  }

  return parseReasoningPolicy(value.join(">"));
}

function getDefaultReasoningPolicyValue(envSource: LLMReasoningEnv): string {
  return envSource.LLM_REASONING_DEFAULT;
}

function normalizeThinkingTypeMode(value: string): LLMThinkingTypeMode {
  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0) {
    return "default";
  }

  switch (normalized) {
    case "default":
    case "enabled":
    case "disabled":
      return normalized;
    default:
      throw new Error(
        `Unsupported LLM thinking type mode: ${value}. Supported modes: default, enabled, disabled`,
      );
  }
}

function parseThinkingBudget(value: string): LLMThinkingBudgetSetting {
  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0 || normalized === "default") {
    return { mode: "default" };
  }

  if (normalized === "dynamic" || normalized === "-1") {
    return { mode: "dynamic" };
  }

  if (normalized === "off") {
    return { mode: "off" };
  }

  if (/^\d+$/.test(normalized)) {
    return {
      mode: "fixed",
      value: Number.parseInt(normalized, 10),
    };
  }

  throw new Error(
    "Unsupported LLM thinking budget value. Use default, dynamic, off, -1, or a non-negative integer.",
  );
}

function getDefaultThinkingTypeMode(envSource: LLMReasoningEnv): LLMThinkingTypeMode {
  return normalizeThinkingTypeMode(envSource.LLM_THINKING_TYPE_DEFAULT);
}

function getDefaultThinkingBudgetSetting(envSource: LLMReasoningEnv): LLMThinkingBudgetSetting {
  return parseThinkingBudget(envSource.LLM_THINKING_BUDGET_DEFAULT);
}

function normalizeReasoningSummaryMode(value: string): LLMReasoningSummaryMode {
  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0) {
    return "off";
  }

  switch (normalized) {
    case "off":
    case "auto":
    case "detailed":
      return normalized;
    default:
      throw new Error(
        `Unsupported LLM reasoning summary mode: ${value}. Supported modes: off, auto, detailed`,
      );
  }
}

export function getSceneReasoningPolicy(
  _scene: LLMScene,
  envSource: LLMReasoningEnv = env,
): LLMReasoningPolicy {
  return parseReasoningPolicy(getDefaultReasoningPolicyValue(envSource));
}

export function getTaskReasoningPolicy(
  task: LLMTask,
  envSource: LLMReasoningEnv = env,
): LLMReasoningPolicy {
  return getSceneReasoningPolicy(task, envSource);
}

export function getSceneReasoningSummary(
  _scene: LLMScene,
  envSource: LLMReasoningEnv = env,
): LLMReasoningSummaryMode {
  return normalizeReasoningSummaryMode(envSource.LLM_REASONING_SUMMARY_DEFAULT);
}

export function getTaskReasoningSummary(
  task: LLMTask,
  envSource: LLMReasoningEnv = env,
): LLMReasoningSummaryMode {
  return getSceneReasoningSummary(task, envSource);
}

function mapOpenAiReasoningEffort(
  policyToken: LLMReasoningPolicyToken,
): OpenAiReasoningEffort | undefined {
  switch (policyToken) {
    case "default":
      return undefined;
    case "max":
      return "xhigh";
    default:
      return policyToken;
  }
}

function mapAnthropicReasoningEffort(
  policyToken: LLMReasoningPolicyToken,
): AnthropicReasoningEffort | undefined {
  switch (policyToken) {
    case "default":
    case "none":
      return undefined;
    case "minimal":
      return "low";
    default:
      return policyToken;
  }
}

function mapGoogleThinkingLevel(
  policyToken: LLMReasoningPolicyToken,
): GoogleThinkingLevel | undefined {
  switch (policyToken) {
    case "default":
    case "none":
      return undefined;
    case "xhigh":
    case "max":
      return "high";
    default:
      return policyToken;
  }
}

function mapXaiReasoningEffort(
  policyToken: LLMReasoningPolicyToken,
): XaiReasoningEffort | undefined {
  switch (policyToken) {
    case "default":
    case "none":
      return undefined;
    case "minimal":
    case "low":
      return "low";
    default:
      return "high";
  }
}

function mapOpenRouterReasoningEffort(
  policyToken: LLMReasoningPolicyToken,
): OpenRouterReasoningEffort | undefined {
  switch (policyToken) {
    case "default":
      return undefined;
    case "max":
      return "xhigh";
    default:
      return policyToken;
  }
}

function resolveReasoningModel(
  providerName: string,
  modelOverride: string | undefined,
  envSource: LLMReasoningAttemptEnv,
): string {
  if (typeof modelOverride === "string") {
    return modelOverride.trim();
  }

  if (!supportedProviders.has(providerName as LLMProviderName)) {
    return "";
  }

  const modelEnvVar = providerModelEnvVars[providerName as LLMProviderName];
  const value = envSource[modelEnvVar];
  return typeof value === "string" ? value.trim() : "";
}

function isOpenAiReasoningModel(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  return (
    normalized.startsWith("o1") ||
    normalized.startsWith("o3") ||
    normalized.startsWith("o4-mini") ||
    (normalized.startsWith("gpt-5") && !normalized.startsWith("gpt-5-chat"))
  );
}

function supportsAnthropicReasoningEffort(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  return (
    normalized.startsWith("claude-3.7") ||
    normalized.startsWith("claude-3-7") ||
    normalized.startsWith("claude-sonnet-4") ||
    normalized.startsWith("claude-opus-4")
  );
}

function supportsGoogleThinkingLevel(model: string): boolean {
  return model.trim().toLowerCase().startsWith("gemini-3");
}

function supportsGoogleThinkingBudget(model: string): boolean {
  return model.trim().toLowerCase().startsWith("gemini-2.5");
}

function supportsDeepSeekThinkingType(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  return normalized.startsWith("deepseek-") || normalized.includes("thinking");
}

function supportsAlibabaThinkingControls(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  return normalized.startsWith("qwen3");
}

function supportsXiaomiThinkingType(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  return (
    (normalized.startsWith("mimo-v2.5") ||
      normalized.startsWith("mimo-v2-pro") ||
      normalized.startsWith("mimo-v2-omni") ||
      normalized.startsWith("mimo-v2-flash")) &&
    !normalized.includes("tts")
  );
}

function supportsVolcengineThinkingType(model: string): boolean {
  return model.trim().toLowerCase().startsWith("doubao-");
}

function supportsZaiThinkingType(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  return (
    normalized.startsWith("glm-4") ||
    normalized.startsWith("glm-5") ||
    normalized.includes("thinking")
  );
}

function supportsXaiReasoningEffort(model: string): boolean {
  return model.trim().toLowerCase().startsWith("grok-");
}

function buildThinkingTypeProviderOptions(
  providerName: Extract<LLMProviderName, "deepseek" | "xiaomi" | "volcengine" | "zai">,
  mode: Exclude<LLMThinkingTypeMode, "default">,
): ProviderReasoningOptions {
  return {
    [providerName]: {
      thinking: {
        type: mode,
      },
    },
  };
}

function supportsOpenRouterReasoningEffort(model: string): boolean {
  const normalized = model.trim().toLowerCase();

  if (normalized.startsWith("openai/")) {
    return isOpenAiReasoningModel(normalized.slice("openai/".length));
  }

  if (normalized.startsWith("anthropic/")) {
    return supportsAnthropicReasoningEffort(normalized.slice("anthropic/".length));
  }

  if (normalized.startsWith("google/")) {
    return supportsGoogleThinkingLevel(normalized.slice("google/".length));
  }

  if (normalized.startsWith("deepseek/")) {
    return supportsDeepSeekThinkingType(normalized.slice("deepseek/".length));
  }

  if (normalized.startsWith("xiaomi/")) {
    return normalized.slice("xiaomi/".length).includes("mimo");
  }

  if (normalized.startsWith("x-ai/")) {
    return supportsXaiReasoningEffort(normalized.slice("x-ai/".length));
  }

  if (normalized.startsWith("xai/")) {
    return supportsXaiReasoningEffort(normalized.slice("xai/".length));
  }

  return false;
}

function getDefaultReasoningAttempt(policyToken: LLMReasoningPolicyToken): LLMReasoningAttempt {
  return {
    policyToken,
    resolvedValue: undefined,
    providerOptions: undefined,
    openAiReasoningEffort: undefined,
  };
}

function getThinkingTypeAttempts(
  providerName: Extract<LLMProviderName, "deepseek" | "xiaomi" | "volcengine" | "zai">,
  envSource: LLMReasoningEnv,
): LLMReasoningAttempt[] {
  const mode = getDefaultThinkingTypeMode(envSource);
  if (mode === "default") {
    return [getDefaultReasoningAttempt("default")];
  }

  return [
    {
      policyToken: "default",
      resolvedValue: mode,
      providerOptions: buildThinkingTypeProviderOptions(providerName, mode),
      openAiReasoningEffort: undefined,
    },
  ];
}

function getAlibabaThinkingAttempts(envSource: LLMReasoningEnv): LLMReasoningAttempt[] {
  const mode = getDefaultThinkingTypeMode(envSource);
  const budget = getDefaultThinkingBudgetSetting(envSource);
  const options: Record<string, JsonValue> = {};
  const resolved: string[] = [];

  if (mode !== "default") {
    options.enable_thinking = mode === "enabled";
    resolved.push(`thinking:${mode}`);
  } else if (budget.mode === "off") {
    options.enable_thinking = false;
    resolved.push("thinking:disabled");
  }

  if (budget.mode === "fixed") {
    options.thinking_budget = budget.value;
    resolved.push(`budget:${budget.value}`);
  }

  if (Object.keys(options).length === 0) {
    return [getDefaultReasoningAttempt("default")];
  }

  return [
    {
      policyToken: "default",
      resolvedValue: resolved.join(","),
      providerOptions: {
        alibaba: options,
      },
      openAiReasoningEffort: undefined,
    },
  ];
}

type VolcengineReasoningEffort = "minimal" | "low" | "medium" | "high";

function mapVolcengineReasoningEffort(
  policyToken: LLMReasoningPolicyToken,
): VolcengineReasoningEffort | undefined {
  switch (policyToken) {
    case "default":
      return undefined;
    case "none":
    case "minimal":
      return "minimal";
    case "low":
      return "low";
    case "medium":
      return "medium";
    case "high":
    case "xhigh":
    case "max":
      return "high";
  }
}

function getVolcengineReasoningAttempts(
  policy: LLMReasoningPolicy,
  envSource: LLMReasoningEnv,
): LLMReasoningAttempt[] {
  const mode = getDefaultThinkingTypeMode(envSource);

  if (mode === "disabled") {
    return [
      {
        policyToken: "default",
        resolvedValue: "disabled",
        providerOptions: buildThinkingTypeProviderOptions("volcengine", "disabled"),
        openAiReasoningEffort: undefined,
      },
    ];
  }

  const thinkingOptions =
    mode === "enabled" ? buildThinkingTypeProviderOptions("volcengine", "enabled") : undefined;
  const resolved: LLMReasoningAttempt[] = [];

  for (const policyToken of policy) {
    const reasoningEffort = mapVolcengineReasoningEffort(policyToken);
    const includeThinking = thinkingOptions && reasoningEffort !== "minimal";
    const providerOptions =
      reasoningEffort || includeThinking
        ? {
            volcengine: {
              ...(includeThinking ? thinkingOptions!.volcengine : {}),
              ...(reasoningEffort ? { reasoningEffort } : {}),
            },
          }
        : undefined;
    const candidate = providerOptions
      ? {
          policyToken,
          resolvedValue: reasoningEffort ?? (mode === "enabled" ? "enabled" : undefined),
          providerOptions,
          openAiReasoningEffort: undefined,
        }
      : getDefaultReasoningAttempt("default");

    if (
      !resolved.some(
        (item) =>
          item.resolvedValue === candidate.resolvedValue &&
          JSON.stringify(item.providerOptions) === JSON.stringify(candidate.providerOptions),
      )
    ) {
      resolved.push(candidate);
    }
  }

  return resolved.length > 0 ? resolved : [getDefaultReasoningAttempt("default")];
}

function getThinkingBudgetAttempts(envSource: LLMReasoningEnv): LLMReasoningAttempt[] {
  const setting = getDefaultThinkingBudgetSetting(envSource);
  if (setting.mode === "default") {
    return [getDefaultReasoningAttempt("default")];
  }

  const thinkingBudget =
    setting.mode === "dynamic" ? -1 : setting.mode === "off" ? 0 : setting.value;
  const resolvedValue =
    setting.mode === "fixed" ? String(setting.value) : setting.mode === "off" ? "off" : "dynamic";

  return [
    {
      policyToken: "default",
      resolvedValue,
      providerOptions: {
        google: {
          thinkingConfig: {
            thinkingBudget,
          },
        },
      },
      openAiReasoningEffort: undefined,
    },
  ];
}

export function getProviderReasoningAttempts(
  providerName: string,
  policy: LLMReasoningPolicy,
  modelOverride?: string,
  envSource: LLMReasoningAttemptEnv = env,
): LLMReasoningAttempt[] {
  const model = resolveReasoningModel(providerName, modelOverride, envSource);

  if (providerName === "google" && supportsGoogleThinkingBudget(model)) {
    return getThinkingBudgetAttempts(envSource);
  }

  if (providerName === "alibaba" && supportsAlibabaThinkingControls(model)) {
    return getAlibabaThinkingAttempts(envSource);
  }

  if (providerName === "xiaomi" && supportsXiaomiThinkingType(model)) {
    return getThinkingTypeAttempts("xiaomi", envSource);
  }

  if (providerName === "deepseek" && supportsDeepSeekThinkingType(model)) {
    return getThinkingTypeAttempts("deepseek", envSource);
  }

  if (providerName === "volcengine" && supportsVolcengineThinkingType(model)) {
    return getVolcengineReasoningAttempts(policy, envSource);
  }

  if (providerName === "zai" && supportsZaiThinkingType(model)) {
    return getThinkingTypeAttempts("zai", envSource);
  }

  const resolved: LLMReasoningAttempt[] = [];

  for (const policyToken of policy) {
    let candidate: LLMReasoningAttempt | undefined;

    switch (providerName) {
      case "anthropic": {
        if (!supportsAnthropicReasoningEffort(model)) {
          candidate = getDefaultReasoningAttempt("default");
          break;
        }

        const effort = mapAnthropicReasoningEffort(policyToken);
        candidate = effort
          ? {
              policyToken,
              resolvedValue: effort,
              providerOptions: {
                anthropic: {
                  effort,
                },
              },
              openAiReasoningEffort: undefined,
            }
          : getDefaultReasoningAttempt("default");
        break;
      }
      case "google": {
        if (!supportsGoogleThinkingLevel(model)) {
          candidate = getDefaultReasoningAttempt("default");
          break;
        }

        const thinkingLevel = mapGoogleThinkingLevel(policyToken);
        candidate = thinkingLevel
          ? {
              policyToken,
              resolvedValue: thinkingLevel,
              providerOptions: {
                google: {
                  thinkingConfig: {
                    thinkingLevel,
                  },
                },
              },
              openAiReasoningEffort: undefined,
            }
          : getDefaultReasoningAttempt("default");
        break;
      }
      case "openai": {
        if (!isOpenAiReasoningModel(model)) {
          candidate = getDefaultReasoningAttempt("default");
          break;
        }

        const reasoningEffort = mapOpenAiReasoningEffort(policyToken);
        candidate = reasoningEffort
          ? {
              policyToken,
              resolvedValue: reasoningEffort,
              providerOptions: {
                openai: {
                  reasoningEffort,
                },
              },
              openAiReasoningEffort: reasoningEffort,
            }
          : getDefaultReasoningAttempt("default");
        break;
      }
      case "openrouter": {
        if (!supportsOpenRouterReasoningEffort(model)) {
          candidate = getDefaultReasoningAttempt("default");
          break;
        }

        const reasoningEffort = mapOpenRouterReasoningEffort(policyToken);
        candidate = reasoningEffort
          ? {
              policyToken,
              resolvedValue: reasoningEffort,
              providerOptions: {
                openrouter: {
                  reasoning: {
                    effort: reasoningEffort,
                  },
                },
              },
              openAiReasoningEffort: undefined,
            }
          : getDefaultReasoningAttempt("default");
        break;
      }
      case "xai": {
        if (!supportsXaiReasoningEffort(model)) {
          candidate = getDefaultReasoningAttempt("default");
          break;
        }

        const reasoningEffort = mapXaiReasoningEffort(policyToken);
        candidate = reasoningEffort
          ? {
              policyToken,
              resolvedValue: reasoningEffort,
              providerOptions: {
                xai: {
                  reasoningEffort,
                },
              },
              openAiReasoningEffort: undefined,
            }
          : getDefaultReasoningAttempt("default");
        break;
      }
      default: {
        candidate = getDefaultReasoningAttempt("default");
        break;
      }
    }

    if (
      candidate &&
      !resolved.some(
        (item) =>
          item.resolvedValue === candidate?.resolvedValue &&
          JSON.stringify(item.providerOptions) === JSON.stringify(candidate?.providerOptions),
      )
    ) {
      resolved.push(candidate);
    }
  }

  if (resolved.length === 0) {
    return [getDefaultReasoningAttempt("default")];
  }

  return resolved;
}

export function getProviderReasoningSummaryOptions(
  providerName: string,
  mode: LLMReasoningSummaryMode,
  modelOverride?: string,
  envSource: LLMReasoningAttemptEnv = env,
): ProviderReasoningOptions | undefined {
  if (mode === "off") {
    return undefined;
  }

  const model = resolveReasoningModel(providerName, modelOverride, envSource);

  switch (providerName) {
    case "openai":
      return isOpenAiReasoningModel(model)
        ? {
            openai: {
              reasoningSummary: mode,
            },
          }
        : undefined;
    case "minimax":
      return {
        minimax: {
          reasoning_split: true,
        },
      };
    default:
      return undefined;
  }
}

export function getProviderReasoningHistoryOptions(
  providerName: string,
  hasReasoningHistory: boolean,
  modelOverride?: string,
  envSource: LLMReasoningAttemptEnv = env,
): ProviderReasoningOptions | undefined {
  if (!hasReasoningHistory) {
    return undefined;
  }

  const model = resolveReasoningModel(providerName, modelOverride, envSource);

  if (providerName === "alibaba" && supportsAlibabaThinkingControls(model)) {
    return {
      alibaba: {
        preserve_thinking: true,
      },
    };
  }

  return undefined;
}

export function isReasoningRetryableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /(reasoning(?:[_\s.-]?effort)?|reasoning(?:[_\s.-]?summary)?|thinking(?:[_\s.-]?(?:level|config|budget|display|type))?|unsupported reasoning|invalid reasoning|effort is not supported|provideroptions.*reasoning)/i.test(
    message,
  );
}

// -- Route / provider parsing ------------------------------------------------

function assertSupportedProvider(providerName: string): asserts providerName is LLMProviderName {
  if (!supportedProviders.has(providerName as LLMProviderName)) {
    throw new Error(
      `Unknown LLM provider: ${providerName}. Supported providers: ${Object.keys(providerApiKeyEnvVars).join(", ")}`,
    );
  }
}

function getConfiguredProvider(
  lane: LLMLane,
  envSource: Pick<Env, "LLM_PROVIDER_DEFAULT" | "LLM_PROVIDER_BACKUP"> = env,
): string {
  return (
    lane === "default" ? envSource.LLM_PROVIDER_DEFAULT : envSource.LLM_PROVIDER_BACKUP
  ).trim();
}

function resolveProviderModel(
  providerName: LLMProviderName,
  envSource: LLMDirectRuntimeEnv,
  modelOverride?: string,
): string {
  const model = (modelOverride ?? envSource[providerModelEnvVars[providerName]]).trim();

  if (model.length === 0) {
    throw new Error(
      `No LLM model configured for provider ${providerName}. Set ${providerModelEnvVars[providerName]}.`,
    );
  }

  if (providerName === "openrouter") {
    const separatorIndex = model.indexOf("/");
    if (separatorIndex <= 0 || separatorIndex === model.length - 1) {
      throw new Error("OpenRouter models must use vendor/model format.");
    }
  }

  return model;
}

function resolveProviderBaseURL(
  providerName: LLMProviderName,
  envSource: LLMDirectRuntimeEnv,
): string {
  return (
    envSource[providerBaseUrlEnvVars[providerName]].trim() || defaultProviderBaseUrls[providerName]
  );
}

function resolveProviderEntry(
  providerName: LLMProviderName,
  lane: LLMLane,
  envSource: LLMDirectRuntimeEnv = env,
  modelOverride?: string,
  pinnedProvider = false,
): TaskConfig {
  return {
    providerName,
    model: resolveProviderModel(providerName, envSource, modelOverride),
    baseURL: resolveProviderBaseURL(providerName, envSource),
    lane,
    pinnedProvider,
  };
}

function parseRoutePreference(value: string, envSource: LLMDirectRuntimeEnv = env): TaskConfig[] {
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  if (items.length === 0) {
    throw new Error("LLM route preference list cannot be empty");
  }

  if (items.length > 2) {
    throw new Error("LLM route preference can contain at most two providers.");
  }

  return items.map((item, index) => {
    const lane: LLMLane = index === 0 ? "default" : "backup";
    const separatorIndex = item.indexOf(":");
    const rawProvider = (separatorIndex >= 0 ? item.slice(0, separatorIndex) : item).trim();
    const modelOverride = separatorIndex >= 0 ? item.slice(separatorIndex + 1).trim() : undefined;

    assertSupportedProvider(rawProvider);

    if (!routeOverrideProviders.has(rawProvider)) {
      throw new Error(
        `LLM route override provider ${rawProvider} is not approved. Use one of: ${routeOverrideProviderNames.join(", ")}.`,
      );
    }

    if (separatorIndex >= 0 && !modelOverride) {
      throw new Error(`LLM route override entry "${item}" must provide a model after provider:.`);
    }

    return resolveProviderEntry(rawProvider, lane, envSource, modelOverride, separatorIndex >= 0);
  });
}

function getConfiguredLaneEntry(
  lane: LLMLane,
  envSource: LLMDirectRuntimeEnv = env,
): TaskConfig | undefined {
  const providerName = getConfiguredProvider(lane, envSource);
  if (providerName.length === 0) {
    return undefined;
  }

  assertSupportedProvider(providerName);
  return resolveProviderEntry(providerName, lane, envSource);
}

function buildDefaultChain(scene: LLMScene, envSource: LLMDirectRuntimeEnv = env): TaskConfig[] {
  const primary = getConfiguredLaneEntry("default", envSource);
  if (!primary) {
    throw new Error(`No LLM provider configured for ${scene}. Set LLM_PROVIDER_DEFAULT.`);
  }

  const backup = getConfiguredLaneEntry("backup", envSource);
  return backup ? [primary, backup] : [primary];
}

function applyModelOverride(
  entry: TaskConfig,
  modelOverride: string,
  envSource: LLMDirectRuntimeEnv = env,
): TaskConfig {
  return {
    ...entry,
    model: resolveProviderModel(entry.providerName, envSource, modelOverride),
  };
}

export function getSceneProviderOrder(
  scene: LLMScene,
  routePreferenceOverride?: string,
  _configuredOverride?: Partial<Record<LLMProviderName, boolean>>,
  envSource: LLMDirectRuntimeEnv = env,
): TaskConfig[] {
  return routePreferenceOverride
    ? parseRoutePreference(routePreferenceOverride, envSource)
    : buildDefaultChain(scene, envSource);
}

export function getTaskProviderOrder(
  task: LLMTask,
  routePreferenceOverride?: string,
  configuredOverride?: Partial<Record<LLMProviderName, boolean>>,
  envSource: LLMDirectRuntimeEnv = env,
): TaskConfig[] {
  return getSceneProviderOrder(task, routePreferenceOverride, configuredOverride, envSource);
}

export function getSceneExecutionChain(
  scene: LLMScene,
  options: ResolveSceneOptions = {},
  envSource: LLMDirectRuntimeEnv = env,
): TaskConfig[] {
  const base = getSceneProviderOrder(scene, options.routePreferenceOverride, undefined, envSource);

  if (options.lane === "backup") {
    const backup = base.find((entry) => entry.lane === "backup") ?? base[1];
    if (!backup) {
      throw new Error(`No backup LLM provider configured for ${scene}. Set LLM_PROVIDER_BACKUP.`);
    }

    return [
      options.modelOverride ? applyModelOverride(backup, options.modelOverride, envSource) : backup,
    ];
  }

  const primary = base[0]!;
  const first = options.modelOverride
    ? applyModelOverride(primary, options.modelOverride, envSource)
    : primary;

  if (options.includeBackupFallback === false) {
    return [first];
  }

  return [first, ...base.slice(1)];
}

export function getTaskExecutionChain(
  task: LLMTask,
  options: ResolveSceneOptions = {},
  envSource: LLMDirectRuntimeEnv = env,
): TaskConfig[] {
  return getSceneExecutionChain(task, options, envSource);
}

function normalizeMetaOptions(
  routePreferenceOverride?:
    | string
    | Pick<ResolveSceneOptions, "lane" | "routePreferenceOverride" | "modelOverride">,
): Pick<ResolveSceneOptions, "lane" | "routePreferenceOverride" | "modelOverride"> {
  if (typeof routePreferenceOverride === "string") {
    return { routePreferenceOverride };
  }

  return routePreferenceOverride ?? {};
}

// -- Provider models / provider options -------------------------------------

function getProviderApiKey(providerName: LLMProviderName, runtimeEnv: LLMDirectRuntimeEnv): string {
  const apiKey = runtimeEnv[providerApiKeyEnvVars[providerName]].trim();
  if (apiKey.length === 0) {
    throw new Error(
      `Missing ${providerApiKeyEnvVars[providerName]} for selected LLM provider ${providerName}.`,
    );
  }

  return apiKey;
}

function createCompatibleProvider(
  providerName: Extract<
    LLMProviderName,
    "xiaomi" | "alibaba" | "moonshotai" | "deepseek" | "minimax" | "volcengine" | "zai"
  >,
  runtimeEnv: LLMDirectRuntimeEnv,
  fetchImpl?: typeof fetch,
) {
  return createOpenAICompatible({
    name: providerName,
    apiKey: getProviderApiKey(providerName, runtimeEnv),
    baseURL: resolveProviderBaseURL(providerName, runtimeEnv),
    includeUsage: true,
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
  });
}

export function mergeProviderOptions(
  ...optionSets: Array<ProviderReasoningOptions | undefined>
): ProviderReasoningOptions | undefined {
  const merged: ProviderReasoningOptions = {};

  for (const optionSet of optionSets) {
    if (!optionSet) {
      continue;
    }

    for (const [providerName, providerOptions] of Object.entries(optionSet)) {
      merged[providerName] = {
        ...(merged[providerName] ?? {}),
        ...providerOptions,
      };
    }
  }

  return Object.keys(merged).length > 0 ? merged : undefined;
}

export function createProviderLanguageModel(
  entry: Pick<TaskConfig, "providerName" | "model" | "baseURL">,
  options: {
    runtimeEnv?: LLMDirectRuntimeEnv;
    fetch?: typeof fetch;
  } = {},
): LanguageModel {
  const runtimeEnv = options.runtimeEnv ?? env;

  switch (entry.providerName) {
    case "openai": {
      const provider = createOpenAI({
        apiKey: getProviderApiKey("openai", runtimeEnv),
        ...(entry.baseURL ? { baseURL: entry.baseURL } : {}),
        ...(options.fetch ? { fetch: options.fetch } : {}),
      });

      return provider(entry.model);
    }
    case "anthropic": {
      const provider = createAnthropic({
        apiKey: getProviderApiKey("anthropic", runtimeEnv),
        ...(entry.baseURL ? { baseURL: entry.baseURL } : {}),
        ...(options.fetch ? { fetch: options.fetch } : {}),
      });

      return provider(entry.model);
    }
    case "google": {
      const provider = createGoogleGenerativeAI({
        apiKey: getProviderApiKey("google", runtimeEnv),
        ...(entry.baseURL ? { baseURL: entry.baseURL } : {}),
        ...(options.fetch ? { fetch: options.fetch } : {}),
      });

      return provider(entry.model);
    }
    case "xiaomi":
    case "alibaba":
    case "moonshotai":
    case "deepseek":
    case "minimax":
    case "volcengine":
    case "zai": {
      return createCompatibleProvider(entry.providerName, runtimeEnv, options.fetch).chatModel(
        entry.model,
      );
    }
    case "openrouter": {
      const provider = createOpenRouter({
        apiKey: getProviderApiKey("openrouter", runtimeEnv),
        ...(entry.baseURL ? { baseURL: entry.baseURL } : {}),
        ...(options.fetch ? { fetch: options.fetch } : {}),
      });

      return provider(entry.model);
    }
    case "xai": {
      const provider = createXai({
        apiKey: getProviderApiKey("xai", runtimeEnv),
        ...(entry.baseURL ? { baseURL: entry.baseURL } : {}),
        ...(options.fetch ? { fetch: options.fetch } : {}),
      });

      return provider(entry.model);
    }
  }
}

// -- Backward-compatible helpers used by runtime code -----------------------

export function getProviderModel(
  providerName: LLMProviderName,
  model: string,
  options: {
    runtimeEnv?: LLMDirectRuntimeEnv;
    fetch?: typeof fetch;
  } = {},
): LanguageModel {
  const runtimeEnv = options.runtimeEnv ?? env;

  return createProviderLanguageModel(
    resolveProviderEntry(providerName, "default", runtimeEnv, model, true),
    options,
  );
}

export function getSceneModel(
  scene: LLMScene,
  modelOverride?: string,
  routePreferenceOverride?: string,
  options: {
    runtimeEnv?: LLMDirectRuntimeEnv;
    fetch?: typeof fetch;
  } = {},
): LanguageModel {
  const runtimeEnv = options.runtimeEnv ?? env;
  const entry = getSceneExecutionChain(
    scene,
    {
      modelOverride,
      routePreferenceOverride,
      includeBackupFallback: false,
    },
    runtimeEnv,
  )[0]!;

  return createProviderLanguageModel(entry, options);
}

export function getSceneMeta(
  scene: LLMScene,
  routePreferenceOverride?:
    | string
    | Pick<ResolveSceneOptions, "lane" | "routePreferenceOverride" | "modelOverride">,
  envSource: LLMDirectRuntimeEnv = env,
): TaskMeta {
  const options = normalizeMetaOptions(routePreferenceOverride);
  const entry = getSceneExecutionChain(
    scene,
    {
      ...options,
      includeBackupFallback: false,
    },
    envSource,
  )[0]!;

  return {
    provider: entry.providerName,
    model: entry.model,
    baseURL: entry.baseURL,
    lane: entry.lane,
    pinnedProvider: entry.pinnedProvider,
  };
}

export function getModel(
  task: LLMTask,
  modelOverride?: string,
  options?: Pick<ResolveSceneOptions, "lane" | "routePreferenceOverride"> & {
    runtimeEnv?: LLMDirectRuntimeEnv;
    fetch?: typeof fetch;
  },
): LanguageModel {
  const runtimeEnv = options?.runtimeEnv ?? env;
  const entry = getSceneExecutionChain(
    task,
    {
      lane: options?.lane,
      routePreferenceOverride: options?.routePreferenceOverride,
      modelOverride,
      includeBackupFallback: false,
    },
    runtimeEnv,
  )[0]!;

  return createProviderLanguageModel(entry, options);
}

export function getTaskMeta(
  task: LLMTask,
  routePreferenceOverride?:
    | string
    | Pick<ResolveSceneOptions, "lane" | "routePreferenceOverride" | "modelOverride">,
  envSource: LLMDirectRuntimeEnv = env,
): TaskMeta {
  return getSceneMeta(task, routePreferenceOverride, envSource);
}

export { parseReasoningPolicyOverride };
