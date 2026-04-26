import { describe, expect, it } from "vitest";

import {
  getProviderReasoningHistoryOptions,
  getProviderReasoningAttempts,
  getProviderReasoningSummaryOptions,
  parseReasoningPolicy,
} from "../../config/llm.js";

const runtimeEnv = {
  LLM_PROVIDER_DEFAULT: "openrouter",
  LLM_PROVIDER_BACKUP: "deepseek",
  LLM_REASONING_DEFAULT: "max>xhigh>high>medium>default",
  LLM_REASONING_SUMMARY_DEFAULT: "auto",
  LLM_THINKING_TYPE_DEFAULT: "enabled",
  LLM_THINKING_BUDGET_DEFAULT: "default",
  OPENAI_API_KEY: "",
  OPENAI_BASE_URL: "https://api.openai.com/v1",
  OPENAI_MODEL: "gpt-5.4",
  ANTHROPIC_API_KEY: "",
  ANTHROPIC_BASE_URL: "https://api.anthropic.com/v1",
  ANTHROPIC_MODEL: "claude-opus-4.7",
  GOOGLE_API_KEY: "",
  GOOGLE_BASE_URL: "https://generativelanguage.googleapis.com/v1beta",
  GOOGLE_MODEL: "gemini-3.1-pro-preview",
  XIAOMI_API_KEY: "test-key",
  XIAOMI_BASE_URL: "https://api.xiaomimimo.com/v1",
  XIAOMI_MODEL: "mimo-v2.5-pro",
  ALIBABA_API_KEY: "test-key",
  ALIBABA_BASE_URL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  ALIBABA_MODEL: "qwen3.6-plus",
  MOONSHOTAI_API_KEY: "",
  MOONSHOTAI_BASE_URL: "https://api.moonshot.ai/v1",
  MOONSHOTAI_MODEL: "kimi-k2.6",
  OPENROUTER_API_KEY: "test-key",
  OPENROUTER_BASE_URL: "https://openrouter.ai/api/v1",
  OPENROUTER_MODEL: "xiaomi/mimo-v2.5-pro",
  DEEPSEEK_API_KEY: "test-key",
  DEEPSEEK_BASE_URL: "https://api.deepseek.com",
  DEEPSEEK_MODEL: "deepseek-v4-pro",
  MINIMAX_API_KEY: "test-key",
  MINIMAX_BASE_URL: "https://api.minimaxi.com/v1",
  MINIMAX_MODEL: "MiniMax-M2.7",
  VOLCENGINE_API_KEY: "test-key",
  VOLCENGINE_BASE_URL: "https://ark.cn-beijing.volces.com/api/v3",
  VOLCENGINE_MODEL: "doubao-seed-2-0-pro-260215",
  XAI_API_KEY: "",
  XAI_BASE_URL: "https://api.x.ai/v1",
  XAI_MODEL: "grok-4.2",
  ZAI_API_KEY: "test-key",
  ZAI_BASE_URL: "https://open.bigmodel.cn/api/paas/v4",
  ZAI_MODEL: "glm-5.1",
} as const;

describe("llm provider capability routing", () => {
  it("enables thinking for deepseek-v4-pro via the thinking.type option", () => {
    const attempts = getProviderReasoningAttempts(
      "deepseek",
      parseReasoningPolicy("max>xhigh>high>medium>default"),
      undefined,
      runtimeEnv,
    );

    expect(attempts).toEqual([
      {
        policyToken: "default",
        resolvedValue: "enabled",
        providerOptions: {
          deepseek: {
            thinking: {
              type: "enabled",
            },
          },
        },
        openAiReasoningEffort: undefined,
      },
    ]);
  });

  it("enables reasoning effort chains for openrouter xiaomi mimo models", () => {
    const attempts = getProviderReasoningAttempts(
      "openrouter",
      parseReasoningPolicy("max>xhigh>high>medium>default"),
      undefined,
      runtimeEnv,
    );

    expect(attempts).toEqual([
      {
        policyToken: "max",
        resolvedValue: "xhigh",
        providerOptions: {
          openrouter: {
            reasoning: {
              effort: "xhigh",
            },
          },
        },
        openAiReasoningEffort: undefined,
      },
      {
        policyToken: "high",
        resolvedValue: "high",
        providerOptions: {
          openrouter: {
            reasoning: {
              effort: "high",
            },
          },
        },
        openAiReasoningEffort: undefined,
      },
      {
        policyToken: "medium",
        resolvedValue: "medium",
        providerOptions: {
          openrouter: {
            reasoning: {
              effort: "medium",
            },
          },
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
  });

  it("maps official alibaba qwen thinking controls", () => {
    const attempts = getProviderReasoningAttempts(
      "alibaba",
      parseReasoningPolicy("max>xhigh>high>medium>default"),
      undefined,
      {
        ...runtimeEnv,
        LLM_THINKING_BUDGET_DEFAULT: "2048",
      },
    );

    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      providerOptions: {
        alibaba: {
          enable_thinking: true,
          thinking_budget: 2048,
        },
      },
    });
  });

  it("enables alibaba preserve_thinking only when reasoning history exists", () => {
    expect(getProviderReasoningHistoryOptions("alibaba", true, undefined, runtimeEnv)).toEqual({
      alibaba: {
        preserve_thinking: true,
      },
    });

    expect(
      getProviderReasoningHistoryOptions("alibaba", false, undefined, runtimeEnv),
    ).toBeUndefined();
    expect(
      getProviderReasoningHistoryOptions("deepseek", true, undefined, runtimeEnv),
    ).toBeUndefined();
  });

  it("maps official xiaomi mimo thinking controls", () => {
    const attempts = getProviderReasoningAttempts(
      "xiaomi",
      parseReasoningPolicy("max>xhigh>high>medium>default"),
      undefined,
      runtimeEnv,
    );

    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      providerOptions: {
        xiaomi: {
          thinking: {
            type: "enabled",
          },
        },
      },
    });
  });

  it("maps official volcengine thinking and reasoning effort controls", () => {
    const attempts = getProviderReasoningAttempts(
      "volcengine",
      parseReasoningPolicy("max>xhigh>high>medium>default"),
      undefined,
      runtimeEnv,
    );

    expect(attempts.map((attempt) => attempt.providerOptions)).toEqual([
      {
        volcengine: {
          thinking: {
            type: "enabled",
          },
          reasoningEffort: "high",
        },
      },
      {
        volcengine: {
          thinking: {
            type: "enabled",
          },
          reasoningEffort: "medium",
        },
      },
      {
        volcengine: {
          thinking: {
            type: "enabled",
          },
        },
      },
    ]);
  });

  it("does not advertise summary options for non-openai providers", () => {
    expect(
      getProviderReasoningSummaryOptions("deepseek", "auto", undefined, runtimeEnv),
    ).toBeUndefined();
    expect(
      getProviderReasoningSummaryOptions("openrouter", "auto", undefined, runtimeEnv),
    ).toBeUndefined();
    expect(
      getProviderReasoningSummaryOptions("zai", "auto", undefined, runtimeEnv),
    ).toBeUndefined();
  });

  it("maps minimax reasoning_split as the only official reasoning output control", () => {
    expect(getProviderReasoningSummaryOptions("minimax", "auto", undefined, runtimeEnv)).toEqual({
      minimax: {
        reasoning_split: true,
      },
    });
  });
});
