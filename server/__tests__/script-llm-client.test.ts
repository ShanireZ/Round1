import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generateTextMock = vi.fn();
const insertValuesMock = vi.fn();
const createProviderLanguageModelMock = vi.fn((entry) => ({
  providerName: entry.providerName,
  modelId: entry.model,
}));
const getSceneExecutionChainMock = vi.fn();
const getSceneReasoningPolicyMock = vi.fn(() => ["xhigh", "default"]);
const getSceneReasoningSummaryMock = vi.fn(() => "auto");
const getProviderReasoningSummaryOptionsMock = vi.fn((providerName: string, summary: string) => {
  if (providerName !== "openai") {
    return undefined;
  }

  return {
    openai: {
      reasoningSummary: summary,
    },
  };
});
const getProviderReasoningHistoryOptionsMock = vi.fn(() => undefined);
const mergeProviderOptionsMock = vi.fn(
  (...parts: Array<Record<string, Record<string, unknown>> | undefined>) => {
    const merged: Record<string, Record<string, unknown>> = {};

    for (const part of parts) {
      if (!part) {
        continue;
      }

      for (const [providerName, providerOptions] of Object.entries(part)) {
        merged[providerName] = {
          ...(merged[providerName] ?? {}),
          ...providerOptions,
        };
      }
    }

    return Object.keys(merged).length > 0 ? merged : undefined;
  },
);
const getProviderReasoningAttemptsMock = vi.fn((providerName: string) => {
  if (providerName !== "openai") {
    return [
      {
        policyToken: "default",
        resolvedValue: undefined,
        providerOptions: undefined,
      },
    ];
  }

  return [
    {
      policyToken: "xhigh",
      resolvedValue: "xhigh",
      providerOptions: {
        openai: {
          reasoningEffort: "xhigh",
        },
      },
    },
  ];
});
const isReasoningRetryableErrorMock = vi.fn(() => false);
const parseReasoningPolicyMock = vi.fn(() => ["xhigh", "default"]);

vi.mock("ai", () => ({
  generateText: generateTextMock,
}));

vi.mock("../../config/env.js", () => ({
  env: {
    LLM_PROVIDER_DEFAULT: "openai",
    LLM_PROVIDER_BACKUP: "",
    LLM_REASONING_DEFAULT: "xhigh>default",
    LLM_REASONING_SUMMARY_DEFAULT: "auto",
    LLM_THINKING_TYPE_DEFAULT: "default",
    LLM_THINKING_BUDGET_DEFAULT: "default",
  },
}));

vi.mock("../../config/llm.js", () => ({
  createProviderLanguageModel: createProviderLanguageModelMock,
  getSceneExecutionChain: getSceneExecutionChainMock,
  getSceneReasoningPolicy: getSceneReasoningPolicyMock,
  getSceneReasoningSummary: getSceneReasoningSummaryMock,
  getProviderReasoningSummaryOptions: getProviderReasoningSummaryOptionsMock,
  getProviderReasoningHistoryOptions: getProviderReasoningHistoryOptionsMock,
  mergeProviderOptions: mergeProviderOptionsMock,
  getProviderReasoningAttempts: getProviderReasoningAttemptsMock,
  isReasoningRetryableError: isReasoningRetryableErrorMock,
  parseReasoningPolicy: parseReasoningPolicyMock,
}));

vi.mock("../../server/db.js", () => ({
  db: {
    insert: vi.fn(() => ({
      values: insertValuesMock,
    })),
  },
}));

vi.mock("../../server/db/schema/llmProviderLogs.js", () => ({
  llmProviderLogs: Symbol("llmProviderLogs"),
}));

describe("scripts/lib/scriptLlmClient", () => {
  beforeEach(() => {
    vi.resetModules();
    generateTextMock.mockReset();
    insertValuesMock.mockReset();
    createProviderLanguageModelMock.mockClear();
    getSceneExecutionChainMock.mockReset();
    getSceneReasoningPolicyMock.mockClear();
    getSceneReasoningSummaryMock.mockClear();
    getProviderReasoningSummaryOptionsMock.mockClear();
    getProviderReasoningHistoryOptionsMock.mockClear();
    mergeProviderOptionsMock.mockClear();
    getProviderReasoningAttemptsMock.mockClear();
    isReasoningRetryableErrorMock.mockClear();
    parseReasoningPolicyMock.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs successful generate scene calls to llm_provider_logs", async () => {
    getSceneExecutionChainMock.mockReturnValue([
      {
        providerName: "openai",
        model: "gpt-5.4-mini",
        baseURL: "https://api.openai.com/v1",
        lane: "default",
        pinnedProvider: false,
      },
    ]);

    generateTextMock.mockResolvedValue({
      text: '{"ok":true}',
      finishReason: "stop",
      response: {
        id: "resp-generate-1",
        modelId: "gpt-5.4-mini",
      },
      usage: {
        inputTokens: 32,
        outputTokens: 18,
      },
      reasoningText: "reasoning trace",
      providerMetadata: {
        openai: {
          requestId: "req-generate-1",
        },
      },
    });

    const { callScriptLlmScene } = await import("../../scripts/lib/scriptLlmClient.js");

    const result = await callScriptLlmScene({
      scene: "generate",
      system: "system prompt",
      prompt: "user prompt",
      maxTokens: 512,
      timeoutMs: 5_000,
    });

    expect(result).toEqual({
      providerName: "openai",
      model: "gpt-5.4-mini",
      text: '{"ok":true}',
      inputTokens: 32,
      outputTokens: 18,
      finishReason: "stop",
      responseId: "resp-generate-1",
      reasoningText: "reasoning trace",
      providerMetadata: {
        openai: {
          requestId: "req-generate-1",
        },
      },
      responseMessages: undefined,
    });

    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        task: "generate",
        provider: "openai",
        model: "gpt-5.4-mini",
        responseModel: "gpt-5.4-mini",
        lane: "default",
        tokensIn: 32,
        tokensOut: 18,
        finishReason: "stop",
        responseId: "resp-generate-1",
        reasoningText: "reasoning trace",
        providerMetadataJson: {
          openai: {
            requestId: "req-generate-1",
          },
        },
      }),
    );
  });

  it("logs failed judge scene calls before surfacing the error", async () => {
    getSceneExecutionChainMock.mockReturnValue([
      {
        providerName: "openai",
        model: "gpt-5.4-mini",
        baseURL: "https://api.openai.com/v1",
        lane: "default",
        pinnedProvider: false,
      },
    ]);

    generateTextMock.mockRejectedValue(new Error("judge provider unavailable"));

    const { callScriptLlmScene } = await import("../../scripts/lib/scriptLlmClient.js");

    await expect(
      callScriptLlmScene({
        scene: "judge",
        system: "judge system",
        prompt: "judge prompt",
        maxTokens: 512,
        timeoutMs: 5_000,
      }),
    ).rejects.toThrow(
      "All providers failed for judge: openai:gpt-5.4-mini: judge provider unavailable",
    );

    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        task: "judge",
        provider: "openai",
        model: "gpt-5.4-mini",
        responseModel: "gpt-5.4-mini",
        lane: "default",
        tokensIn: 0,
        tokensOut: 0,
        errorMessage: "judge provider unavailable",
      }),
    );
  });
});
