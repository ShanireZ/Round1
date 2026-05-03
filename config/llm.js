import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createXai } from "@ai-sdk/xai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { env } from "./env.js";
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
};
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
};
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
};
const defaultProviderBaseUrls = {
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
export const laneProviders = {
    default: env.LLM_PROVIDER_DEFAULT,
    backup: env.LLM_PROVIDER_BACKUP,
};
const llmReasoningPolicyTokens = [
    "default",
    "none",
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
];
const llmReasoningPolicyTokenSet = new Set(llmReasoningPolicyTokens);
const supportedProviders = new Set(Object.keys(providerApiKeyEnvVars));
export const routeOverrideProviderNames = [
    "deepseek",
    "xiaomi",
    "alibaba",
    "minimax",
];
const routeOverrideProviders = new Set(routeOverrideProviderNames);
function dedupeReasoningPolicy(tokens) {
    const deduped = [];
    const seen = new Set();
    for (const token of tokens) {
        if (!seen.has(token)) {
            seen.add(token);
            deduped.push(token);
        }
    }
    return deduped.length > 0 ? deduped : ["default"];
}
export function parseReasoningPolicy(value) {
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
        throw new Error(`Unsupported LLM reasoning token(s): ${invalid.join(", ")}. Supported tokens: ${llmReasoningPolicyTokens.join(", ")}`);
    }
    return dedupeReasoningPolicy(tokens);
}
function parseReasoningPolicyOverride(value) {
    if (typeof value === "string") {
        return parseReasoningPolicy(value);
    }
    return parseReasoningPolicy(value.join(">"));
}
function getDefaultReasoningPolicyValue(envSource) {
    return envSource.LLM_REASONING_DEFAULT;
}
function normalizeThinkingTypeMode(value) {
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
            throw new Error(`Unsupported LLM thinking type mode: ${value}. Supported modes: default, enabled, disabled`);
    }
}
function parseThinkingBudget(value) {
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
    throw new Error("Unsupported LLM thinking budget value. Use default, dynamic, off, -1, or a non-negative integer.");
}
function getDefaultThinkingTypeMode(envSource) {
    return normalizeThinkingTypeMode(envSource.LLM_THINKING_TYPE_DEFAULT);
}
function getDefaultThinkingBudgetSetting(envSource) {
    return parseThinkingBudget(envSource.LLM_THINKING_BUDGET_DEFAULT);
}
function normalizeReasoningSummaryMode(value) {
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
            throw new Error(`Unsupported LLM reasoning summary mode: ${value}. Supported modes: off, auto, detailed`);
    }
}
export function getSceneReasoningPolicy(_scene, envSource = env) {
    return parseReasoningPolicy(getDefaultReasoningPolicyValue(envSource));
}
export function getTaskReasoningPolicy(task, envSource = env) {
    return getSceneReasoningPolicy(task, envSource);
}
export function getSceneReasoningSummary(_scene, envSource = env) {
    return normalizeReasoningSummaryMode(envSource.LLM_REASONING_SUMMARY_DEFAULT);
}
export function getTaskReasoningSummary(task, envSource = env) {
    return getSceneReasoningSummary(task, envSource);
}
function mapOpenAiReasoningEffort(policyToken) {
    switch (policyToken) {
        case "default":
            return undefined;
        case "max":
            return "xhigh";
        default:
            return policyToken;
    }
}
function mapAnthropicReasoningEffort(policyToken) {
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
function mapGoogleThinkingLevel(policyToken) {
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
function mapXaiReasoningEffort(policyToken) {
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
function mapOpenRouterReasoningEffort(policyToken) {
    switch (policyToken) {
        case "default":
            return undefined;
        case "max":
            return "xhigh";
        default:
            return policyToken;
    }
}
function resolveReasoningModel(providerName, modelOverride, envSource) {
    if (typeof modelOverride === "string") {
        return modelOverride.trim();
    }
    if (!supportedProviders.has(providerName)) {
        return "";
    }
    const modelEnvVar = providerModelEnvVars[providerName];
    const value = envSource[modelEnvVar];
    return typeof value === "string" ? value.trim() : "";
}
function isOpenAiReasoningModel(model) {
    const normalized = model.trim().toLowerCase();
    return (normalized.startsWith("o1") ||
        normalized.startsWith("o3") ||
        normalized.startsWith("o4-mini") ||
        (normalized.startsWith("gpt-5") && !normalized.startsWith("gpt-5-chat")));
}
function supportsAnthropicReasoningEffort(model) {
    const normalized = model.trim().toLowerCase();
    return (normalized.startsWith("claude-3.7") ||
        normalized.startsWith("claude-3-7") ||
        normalized.startsWith("claude-sonnet-4") ||
        normalized.startsWith("claude-opus-4"));
}
function supportsGoogleThinkingLevel(model) {
    return model.trim().toLowerCase().startsWith("gemini-3");
}
function supportsGoogleThinkingBudget(model) {
    return model.trim().toLowerCase().startsWith("gemini-2.5");
}
function supportsDeepSeekThinkingType(model) {
    const normalized = model.trim().toLowerCase();
    return normalized.startsWith("deepseek-") || normalized.includes("thinking");
}
function supportsAlibabaThinkingControls(model) {
    const normalized = model.trim().toLowerCase();
    return normalized.startsWith("qwen3");
}
function supportsXiaomiThinkingType(model) {
    const normalized = model.trim().toLowerCase();
    return ((normalized.startsWith("mimo-v2.5") ||
        normalized.startsWith("mimo-v2-pro") ||
        normalized.startsWith("mimo-v2-omni") ||
        normalized.startsWith("mimo-v2-flash")) &&
        !normalized.includes("tts"));
}
function supportsVolcengineThinkingType(model) {
    return model.trim().toLowerCase().startsWith("doubao-");
}
function supportsZaiThinkingType(model) {
    const normalized = model.trim().toLowerCase();
    return (normalized.startsWith("glm-4") ||
        normalized.startsWith("glm-5") ||
        normalized.includes("thinking"));
}
function supportsXaiReasoningEffort(model) {
    return model.trim().toLowerCase().startsWith("grok-");
}
function buildThinkingTypeProviderOptions(providerName, mode) {
    return {
        [providerName]: {
            thinking: {
                type: mode,
            },
        },
    };
}
function supportsOpenRouterReasoningEffort(model) {
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
function getDefaultReasoningAttempt(policyToken) {
    return {
        policyToken,
        resolvedValue: undefined,
        providerOptions: undefined,
        openAiReasoningEffort: undefined,
    };
}
function getThinkingTypeAttempts(providerName, envSource) {
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
function getAlibabaThinkingAttempts(envSource) {
    const mode = getDefaultThinkingTypeMode(envSource);
    const budget = getDefaultThinkingBudgetSetting(envSource);
    const options = {};
    const resolved = [];
    if (mode !== "default") {
        options.enable_thinking = mode === "enabled";
        resolved.push(`thinking:${mode}`);
    }
    else if (budget.mode === "off") {
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
function mapVolcengineReasoningEffort(policyToken) {
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
function getVolcengineReasoningAttempts(policy, envSource) {
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
    const thinkingOptions = mode === "enabled" ? buildThinkingTypeProviderOptions("volcengine", "enabled") : undefined;
    const resolved = [];
    for (const policyToken of policy) {
        const reasoningEffort = mapVolcengineReasoningEffort(policyToken);
        const includeThinking = thinkingOptions && reasoningEffort !== "minimal";
        const providerOptions = reasoningEffort || includeThinking
            ? {
                volcengine: {
                    ...(includeThinking ? thinkingOptions.volcengine : {}),
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
        if (!resolved.some((item) => item.resolvedValue === candidate.resolvedValue &&
            JSON.stringify(item.providerOptions) === JSON.stringify(candidate.providerOptions))) {
            resolved.push(candidate);
        }
    }
    return resolved.length > 0 ? resolved : [getDefaultReasoningAttempt("default")];
}
function getThinkingBudgetAttempts(envSource) {
    const setting = getDefaultThinkingBudgetSetting(envSource);
    if (setting.mode === "default") {
        return [getDefaultReasoningAttempt("default")];
    }
    const thinkingBudget = setting.mode === "dynamic" ? -1 : setting.mode === "off" ? 0 : setting.value;
    const resolvedValue = setting.mode === "fixed" ? String(setting.value) : setting.mode === "off" ? "off" : "dynamic";
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
export function getProviderReasoningAttempts(providerName, policy, modelOverride, envSource = env) {
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
    const resolved = [];
    for (const policyToken of policy) {
        let candidate;
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
        if (candidate &&
            !resolved.some((item) => item.resolvedValue === candidate?.resolvedValue &&
                JSON.stringify(item.providerOptions) === JSON.stringify(candidate?.providerOptions))) {
            resolved.push(candidate);
        }
    }
    if (resolved.length === 0) {
        return [getDefaultReasoningAttempt("default")];
    }
    return resolved;
}
export function getProviderReasoningSummaryOptions(providerName, mode, modelOverride, envSource = env) {
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
export function getProviderReasoningHistoryOptions(providerName, hasReasoningHistory, modelOverride, envSource = env) {
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
export function isReasoningRetryableError(error) {
    const message = error instanceof Error ? error.message : String(error);
    return /(reasoning(?:[_\s.-]?effort)?|reasoning(?:[_\s.-]?summary)?|thinking(?:[_\s.-]?(?:level|config|budget|display|type))?|unsupported reasoning|invalid reasoning|effort is not supported|provideroptions.*reasoning)/i.test(message);
}
// -- Route / provider parsing ------------------------------------------------
function assertSupportedProvider(providerName) {
    if (!supportedProviders.has(providerName)) {
        throw new Error(`Unknown LLM provider: ${providerName}. Supported providers: ${Object.keys(providerApiKeyEnvVars).join(", ")}`);
    }
}
function getConfiguredProvider(lane, envSource = env) {
    return (lane === "default" ? envSource.LLM_PROVIDER_DEFAULT : envSource.LLM_PROVIDER_BACKUP).trim();
}
function resolveProviderModel(providerName, envSource, modelOverride) {
    const model = (modelOverride ?? envSource[providerModelEnvVars[providerName]]).trim();
    if (model.length === 0) {
        throw new Error(`No LLM model configured for provider ${providerName}. Set ${providerModelEnvVars[providerName]}.`);
    }
    if (providerName === "openrouter") {
        const separatorIndex = model.indexOf("/");
        if (separatorIndex <= 0 || separatorIndex === model.length - 1) {
            throw new Error("OpenRouter models must use vendor/model format.");
        }
    }
    return model;
}
function resolveProviderBaseURL(providerName, envSource) {
    return (envSource[providerBaseUrlEnvVars[providerName]].trim() || defaultProviderBaseUrls[providerName]);
}
function resolveProviderEntry(providerName, lane, envSource = env, modelOverride, pinnedProvider = false) {
    return {
        providerName,
        model: resolveProviderModel(providerName, envSource, modelOverride),
        baseURL: resolveProviderBaseURL(providerName, envSource),
        lane,
        pinnedProvider,
    };
}
function parseRoutePreference(value, envSource = env) {
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
        const lane = index === 0 ? "default" : "backup";
        const separatorIndex = item.indexOf(":");
        const rawProvider = (separatorIndex >= 0 ? item.slice(0, separatorIndex) : item).trim();
        const modelOverride = separatorIndex >= 0 ? item.slice(separatorIndex + 1).trim() : undefined;
        assertSupportedProvider(rawProvider);
        if (!routeOverrideProviders.has(rawProvider)) {
            throw new Error(`LLM route override provider ${rawProvider} is not approved. Use one of: ${routeOverrideProviderNames.join(", ")}.`);
        }
        if (separatorIndex >= 0 && !modelOverride) {
            throw new Error(`LLM route override entry "${item}" must provide a model after provider:.`);
        }
        return resolveProviderEntry(rawProvider, lane, envSource, modelOverride, separatorIndex >= 0);
    });
}
function getConfiguredLaneEntry(lane, envSource = env) {
    const providerName = getConfiguredProvider(lane, envSource);
    if (providerName.length === 0) {
        return undefined;
    }
    assertSupportedProvider(providerName);
    return resolveProviderEntry(providerName, lane, envSource);
}
function buildDefaultChain(scene, envSource = env) {
    const primary = getConfiguredLaneEntry("default", envSource);
    if (!primary) {
        throw new Error(`No LLM provider configured for ${scene}. Set LLM_PROVIDER_DEFAULT.`);
    }
    const backup = getConfiguredLaneEntry("backup", envSource);
    return backup ? [primary, backup] : [primary];
}
function applyModelOverride(entry, modelOverride, envSource = env) {
    return {
        ...entry,
        model: resolveProviderModel(entry.providerName, envSource, modelOverride),
    };
}
export function getSceneProviderOrder(scene, routePreferenceOverride, _configuredOverride, envSource = env) {
    return routePreferenceOverride
        ? parseRoutePreference(routePreferenceOverride, envSource)
        : buildDefaultChain(scene, envSource);
}
export function getTaskProviderOrder(task, routePreferenceOverride, configuredOverride, envSource = env) {
    return getSceneProviderOrder(task, routePreferenceOverride, configuredOverride, envSource);
}
export function getSceneExecutionChain(scene, options = {}, envSource = env) {
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
    const primary = base[0];
    const first = options.modelOverride
        ? applyModelOverride(primary, options.modelOverride, envSource)
        : primary;
    if (options.includeBackupFallback === false) {
        return [first];
    }
    return [first, ...base.slice(1)];
}
export function getTaskExecutionChain(task, options = {}, envSource = env) {
    return getSceneExecutionChain(task, options, envSource);
}
function normalizeMetaOptions(routePreferenceOverride) {
    if (typeof routePreferenceOverride === "string") {
        return { routePreferenceOverride };
    }
    return routePreferenceOverride ?? {};
}
// -- Provider models / provider options -------------------------------------
function getProviderApiKey(providerName, runtimeEnv) {
    const apiKey = runtimeEnv[providerApiKeyEnvVars[providerName]].trim();
    if (apiKey.length === 0) {
        throw new Error(`Missing ${providerApiKeyEnvVars[providerName]} for selected LLM provider ${providerName}.`);
    }
    return apiKey;
}
function createCompatibleProvider(providerName, runtimeEnv, fetchImpl) {
    return createOpenAICompatible({
        name: providerName,
        apiKey: getProviderApiKey(providerName, runtimeEnv),
        baseURL: resolveProviderBaseURL(providerName, runtimeEnv),
        includeUsage: true,
        ...(fetchImpl ? { fetch: fetchImpl } : {}),
    });
}
export function mergeProviderOptions(...optionSets) {
    const merged = {};
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
export function createProviderLanguageModel(entry, options = {}) {
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
            return createCompatibleProvider(entry.providerName, runtimeEnv, options.fetch).chatModel(entry.model);
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
export function getProviderModel(providerName, model, options = {}) {
    const runtimeEnv = options.runtimeEnv ?? env;
    return createProviderLanguageModel(resolveProviderEntry(providerName, "default", runtimeEnv, model, true), options);
}
export function getSceneModel(scene, modelOverride, routePreferenceOverride, options = {}) {
    const runtimeEnv = options.runtimeEnv ?? env;
    const entry = getSceneExecutionChain(scene, {
        modelOverride,
        routePreferenceOverride,
        includeBackupFallback: false,
    }, runtimeEnv)[0];
    return createProviderLanguageModel(entry, options);
}
export function getSceneMeta(scene, routePreferenceOverride, envSource = env) {
    const options = normalizeMetaOptions(routePreferenceOverride);
    const entry = getSceneExecutionChain(scene, {
        ...options,
        includeBackupFallback: false,
    }, envSource)[0];
    return {
        provider: entry.providerName,
        model: entry.model,
        baseURL: entry.baseURL,
        lane: entry.lane,
        pinnedProvider: entry.pinnedProvider,
    };
}
export function getModel(task, modelOverride, options) {
    const runtimeEnv = options?.runtimeEnv ?? env;
    const entry = getSceneExecutionChain(task, {
        lane: options?.lane,
        routePreferenceOverride: options?.routePreferenceOverride,
        modelOverride,
        includeBackupFallback: false,
    }, runtimeEnv)[0];
    return createProviderLanguageModel(entry, options);
}
export function getTaskMeta(task, routePreferenceOverride, envSource = env) {
    return getSceneMeta(task, routePreferenceOverride, envSource);
}
export { parseReasoningPolicyOverride };
