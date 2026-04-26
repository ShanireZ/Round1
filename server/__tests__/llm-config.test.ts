import { describe, expect, it, vi } from "vitest";

const mockEnv = {
  LLM_PROVIDER_DEFAULT: "alibaba",
  LLM_PROVIDER_BACKUP: "deepseek",
  LLM_REASONING_DEFAULT: "xhigh>high>default",
  LLM_REASONING_SUMMARY_DEFAULT: "auto",
  LLM_THINKING_TYPE_DEFAULT: "enabled",
  LLM_THINKING_BUDGET_DEFAULT: "2048",
  OPENAI_API_KEY: "openai-key",
  OPENAI_BASE_URL: "https://api.openai.com/v1",
  OPENAI_MODEL: "gpt-5.4-mini",
  ANTHROPIC_API_KEY: "anthropic-key",
  ANTHROPIC_BASE_URL: "https://api.anthropic.com/v1",
  ANTHROPIC_MODEL: "claude-sonnet-4-20250514",
  GOOGLE_API_KEY: "google-key",
  GOOGLE_BASE_URL: "https://generativelanguage.googleapis.com/v1beta",
  GOOGLE_MODEL: "gemini-2.5-flash",
  XIAOMI_API_KEY: "xiaomi-key",
  XIAOMI_BASE_URL: "https://api.xiaomimimo.com/v1",
  XIAOMI_MODEL: "mimo-v2.5-pro",
  ALIBABA_API_KEY: "alibaba-key",
  ALIBABA_BASE_URL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  ALIBABA_MODEL: "qwen3.6-plus",
  MOONSHOTAI_API_KEY: "moonshot-key",
  MOONSHOTAI_BASE_URL: "https://api.moonshot.ai/v1",
  MOONSHOTAI_MODEL: "kimi-k2.5",
  OPENROUTER_API_KEY: "openrouter-key",
  OPENROUTER_BASE_URL: "https://openrouter.ai/api/v1",
  OPENROUTER_MODEL: "openai/gpt-5.2",
  DEEPSEEK_API_KEY: "deepseek-key",
  DEEPSEEK_BASE_URL: "https://api.deepseek.com",
  DEEPSEEK_MODEL: "deepseek-v4-pro",
  MINIMAX_API_KEY: "minimax-key",
  MINIMAX_BASE_URL: "https://api.minimax.io/v1",
  MINIMAX_MODEL: "MiniMax-M2.7",
  VOLCENGINE_API_KEY: "volcengine-key",
  VOLCENGINE_BASE_URL: "https://ark.cn-beijing.volces.com/api/v3",
  VOLCENGINE_MODEL: "doubao-seed-2-0-lite-260215",
  XAI_API_KEY: "xai-key",
  XAI_BASE_URL: "https://api.x.ai/v1",
  XAI_MODEL: "grok-4-fast-reasoning",
  ZAI_API_KEY: "zai-key",
  ZAI_BASE_URL: "https://open.bigmodel.cn/api/paas/v4",
  ZAI_MODEL: "glm-5.1",
};

vi.mock("../../config/env.js", () => ({
  env: mockEnv,
}));

describe("config/llm", () => {
  it("exposes env mappings for the supported direct providers", async () => {
    const { providerApiKeyEnvVars, providerBaseUrlEnvVars, providerModelEnvVars } =
      await import("../../config/llm.js");

    expect(providerApiKeyEnvVars).toEqual({
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
    });

    expect(providerBaseUrlEnvVars).toEqual({
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
    });

    expect(providerModelEnvVars).toEqual({
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
    });
  });

  it("reads default and backup lane providers from env", async () => {
    const { laneProviders, getTaskMeta } = await import("../../config/llm.js");

    expect(laneProviders).toEqual({
      default: "alibaba",
      backup: "deepseek",
    });

    expect(getTaskMeta("generate")).toEqual({
      provider: "alibaba",
      model: "qwen3.6-plus",
      baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      lane: "default",
      pinnedProvider: false,
    });

    expect(getTaskMeta("judge", { lane: "backup" })).toEqual({
      provider: "deepseek",
      model: "deepseek-v4-pro",
      baseURL: "https://api.deepseek.com",
      lane: "backup",
      pinnedProvider: false,
    });
  });

  it("resolves xiaomi via the openai-compatible provider path", async () => {
    const { getTaskMeta } = await import("../../config/llm.js");

    const originalDefaultProvider = mockEnv.LLM_PROVIDER_DEFAULT;

    mockEnv.LLM_PROVIDER_DEFAULT = "xiaomi";

    try {
      expect(getTaskMeta("generate")).toEqual({
        provider: "xiaomi",
        model: "mimo-v2.5-pro",
        baseURL: "https://api.xiaomimimo.com/v1",
        lane: "default",
        pinnedProvider: false,
      });
    } finally {
      mockEnv.LLM_PROVIDER_DEFAULT = originalDefaultProvider;
    }
  });

  it("parses reasoning policy and summary defaults for every scene", async () => {
    const { parseReasoningPolicy, getSceneReasoningPolicy, getTaskReasoningSummary } =
      await import("../../config/llm.js");

    expect(parseReasoningPolicy(" xhigh > high > default ")).toEqual(["xhigh", "high", "default"]);
    expect(getSceneReasoningPolicy("generate")).toEqual(["xhigh", "high", "default"]);
    expect(getSceneReasoningPolicy("judge")).toEqual(["xhigh", "high", "default"]);
    expect(getSceneReasoningPolicy("rewrite")).toEqual(["xhigh", "high", "default"]);
    expect(getTaskReasoningSummary("generate")).toBe("auto");
  });

  it("maps reasoning policy tokens and summary modes only when the current provider and model support them", async () => {
    const { getProviderReasoningAttempts, getProviderReasoningSummaryOptions } =
      await import("../../config/llm.js");

    expect(getProviderReasoningAttempts("openai", ["max", "high", "default"])).toEqual([
      {
        policyToken: "max",
        resolvedValue: "xhigh",
        providerOptions: {
          openai: { reasoningEffort: "xhigh" },
        },
        openAiReasoningEffort: "xhigh",
      },
      {
        policyToken: "high",
        resolvedValue: "high",
        providerOptions: {
          openai: { reasoningEffort: "high" },
        },
        openAiReasoningEffort: "high",
      },
      {
        policyToken: "default",
        resolvedValue: undefined,
        providerOptions: undefined,
        openAiReasoningEffort: undefined,
      },
    ]);

    expect(
      getProviderReasoningAttempts("anthropic", ["minimal", "xhigh", "none", "default"]),
    ).toEqual([
      {
        policyToken: "minimal",
        resolvedValue: "low",
        providerOptions: {
          anthropic: { effort: "low" },
        },
        openAiReasoningEffort: undefined,
      },
      {
        policyToken: "xhigh",
        resolvedValue: "xhigh",
        providerOptions: {
          anthropic: { effort: "xhigh" },
        },
        openAiReasoningEffort: undefined,
      },
      {
        policyToken: "default",
        resolvedValue: undefined,
        providerOptions: undefined,
        openAiReasoningEffort: undefined,
      },
    ]);

    expect(getProviderReasoningAttempts("google", ["xhigh", "high", "max", "default"])).toEqual([
      {
        policyToken: "default",
        resolvedValue: "2048",
        providerOptions: {
          google: { thinkingConfig: { thinkingBudget: 2048 } },
        },
        openAiReasoningEffort: undefined,
      },
    ]);

    const originalGoogleModel = mockEnv.GOOGLE_MODEL;
    mockEnv.GOOGLE_MODEL = "gemini-3-flash-preview";

    try {
      expect(getProviderReasoningAttempts("google", ["xhigh", "high", "max", "default"])).toEqual([
        {
          policyToken: "xhigh",
          resolvedValue: "high",
          providerOptions: {
            google: { thinkingConfig: { thinkingLevel: "high" } },
          },
          openAiReasoningEffort: undefined,
        },
        {
          policyToken: "default",
          resolvedValue: undefined,
          providerOptions: undefined,
          openAiReasoningEffort: undefined,
        },
      ]);
    } finally {
      mockEnv.GOOGLE_MODEL = originalGoogleModel;
    }

    expect(getProviderReasoningAttempts("xai", ["xhigh", "medium", "low", "default"])).toEqual([
      {
        policyToken: "xhigh",
        resolvedValue: "high",
        providerOptions: {
          xai: { reasoningEffort: "high" },
        },
        openAiReasoningEffort: undefined,
      },
      {
        policyToken: "low",
        resolvedValue: "low",
        providerOptions: {
          xai: { reasoningEffort: "low" },
        },
        openAiReasoningEffort: undefined,
      },
      {
        policyToken: "default",
        resolvedValue: undefined,
        providerOptions: undefined,
        openAiReasoningEffort: undefined,
      },
    ]);

    expect(getProviderReasoningAttempts("openrouter", ["xhigh", "high", "default"])).toEqual([
      {
        policyToken: "xhigh",
        resolvedValue: "xhigh",
        providerOptions: {
          openrouter: { reasoning: { effort: "xhigh" } },
        },
        openAiReasoningEffort: undefined,
      },
      {
        policyToken: "high",
        resolvedValue: "high",
        providerOptions: {
          openrouter: { reasoning: { effort: "high" } },
        },
        openAiReasoningEffort: undefined,
      },
      {
        policyToken: "default",
        resolvedValue: undefined,
        providerOptions: undefined,
        openAiReasoningEffort: undefined,
      },
    ]);

    expect(getProviderReasoningAttempts("deepseek", ["xhigh", "high", "default"])).toEqual([
      {
        policyToken: "default",
        resolvedValue: "enabled",
        providerOptions: {
          deepseek: { thinking: { type: "enabled" } },
        },
        openAiReasoningEffort: undefined,
      },
    ]);

    expect(getProviderReasoningAttempts("zai", ["xhigh", "high", "default"])).toEqual([
      {
        policyToken: "default",
        resolvedValue: "enabled",
        providerOptions: {
          zai: { thinking: { type: "enabled" } },
        },
        openAiReasoningEffort: undefined,
      },
    ]);

    const originalOpenAiModel = mockEnv.OPENAI_MODEL;
    mockEnv.OPENAI_MODEL = "gpt-4o";

    try {
      expect(getProviderReasoningAttempts("openai", ["max", "high", "default"])).toEqual([
        {
          policyToken: "default",
          resolvedValue: undefined,
          providerOptions: undefined,
          openAiReasoningEffort: undefined,
        },
      ]);
    } finally {
      mockEnv.OPENAI_MODEL = originalOpenAiModel;
    }

    expect(getProviderReasoningAttempts("alibaba", ["xhigh", "high", "default"])).toEqual([
      {
        policyToken: "default",
        resolvedValue: "thinking:enabled,budget:2048",
        providerOptions: {
          alibaba: {
            enable_thinking: true,
            thinking_budget: 2048,
          },
        },
        openAiReasoningEffort: undefined,
      },
    ]);

    expect(getProviderReasoningAttempts("volcengine", ["xhigh", "high", "default"])).toEqual([
      {
        policyToken: "xhigh",
        resolvedValue: "high",
        providerOptions: {
          volcengine: {
            thinking: {
              type: "enabled",
            },
            reasoningEffort: "high",
          },
        },
        openAiReasoningEffort: undefined,
      },
      {
        policyToken: "default",
        resolvedValue: "enabled",
        providerOptions: {
          volcengine: {
            thinking: {
              type: "enabled",
            },
          },
        },
        openAiReasoningEffort: undefined,
      },
    ]);

    expect(getProviderReasoningSummaryOptions("openai", "auto")).toEqual({
      openai: { reasoningSummary: "auto" },
    });
    expect(getProviderReasoningSummaryOptions("alibaba", "auto")).toBeUndefined();
    expect(getProviderReasoningSummaryOptions("volcengine", "auto")).toBeUndefined();
  });

  it("returns default and backup lanes in order when no override is provided", async () => {
    const { getSceneProviderOrder, getSceneExecutionChain } = await import("../../config/llm.js");

    expect(getSceneProviderOrder("rewrite")).toEqual([
      {
        providerName: "alibaba",
        model: "qwen3.6-plus",
        baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        lane: "default",
        pinnedProvider: false,
      },
      {
        providerName: "deepseek",
        model: "deepseek-v4-pro",
        baseURL: "https://api.deepseek.com",
        lane: "backup",
        pinnedProvider: false,
      },
    ]);

    expect(getSceneExecutionChain("rewrite", { includeBackupFallback: false })).toEqual([
      {
        providerName: "alibaba",
        model: "qwen3.6-plus",
        baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        lane: "default",
        pinnedProvider: false,
      },
    ]);
  });

  it("supports provider overrides and ad-hoc model chains", async () => {
    const { getSceneProviderOrder, getTaskMeta } = await import("../../config/llm.js");

    expect(
      getSceneProviderOrder("paper_audit", "xiaomi:mimo-v2.5-pro,minimax:MiniMax-M2.7"),
    ).toEqual([
      {
        providerName: "xiaomi",
        model: "mimo-v2.5-pro",
        baseURL: "https://api.xiaomimimo.com/v1",
        lane: "default",
        pinnedProvider: true,
      },
      {
        providerName: "minimax",
        model: "MiniMax-M2.7",
        baseURL: "https://api.minimax.io/v1",
        lane: "backup",
        pinnedProvider: true,
      },
    ]);

    expect(
      getTaskMeta("generate", {
        routePreferenceOverride: "deepseek:deepseek-v4-pro,alibaba:qwen3.6-plus",
      }),
    ).toEqual({
      provider: "deepseek",
      model: "deepseek-v4-pro",
      baseURL: "https://api.deepseek.com",
      lane: "default",
      pinnedProvider: true,
    });

    expect(getSceneProviderOrder("rewrite", "minimax:MiniMax-M2.7")).toEqual([
      {
        providerName: "minimax",
        model: "MiniMax-M2.7",
        baseURL: "https://api.minimax.io/v1",
        lane: "default",
        pinnedProvider: true,
      },
    ]);

    expect(getSceneProviderOrder("rewrite", "deepseek:deepseek-chat,alibaba:qwen3.6-plus")).toEqual(
      [
        {
          providerName: "deepseek",
          model: "deepseek-chat",
          baseURL: "https://api.deepseek.com",
          lane: "default",
          pinnedProvider: true,
        },
        {
          providerName: "alibaba",
          model: "qwen3.6-plus",
          baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
          lane: "backup",
          pinnedProvider: true,
        },
      ],
    );

    expect(() => getSceneProviderOrder("rewrite", "openrouter:openai/gpt-5.2")).toThrow(
      "LLM route override provider openrouter is not approved",
    );
  });

  it("throws when no default provider is configured", async () => {
    const { getSceneProviderOrder } = await import("../../config/llm.js");
    const original = mockEnv.LLM_PROVIDER_DEFAULT;

    mockEnv.LLM_PROVIDER_DEFAULT = "";

    try {
      expect(() => getSceneProviderOrder("custom_scene")).toThrow(
        "No LLM provider configured for custom_scene",
      );
    } finally {
      mockEnv.LLM_PROVIDER_DEFAULT = original;
    }
  });
});
