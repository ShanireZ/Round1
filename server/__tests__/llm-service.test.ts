import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { ModelMessage } from "ai";

const generateTextMock = vi.fn();
const generateObjectMock = vi.fn();
const insertValuesMock = vi.fn();
const createProviderLanguageModelMock = vi.fn((entry) => ({
  providerName: entry.providerName,
  modelId: entry.model,
}));
const getTaskExecutionChainMock = vi.fn();
const getTaskReasoningPolicyMock = vi.fn(() => ["xhigh", "high", "default"]);
const getTaskReasoningSummaryMock = vi.fn(() => "detailed");
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
const getProviderReasoningHistoryOptionsMock = vi.fn(
  (providerName: string, hasReasoningHistory: boolean) => {
    if (providerName !== "alibaba" || !hasReasoningHistory) {
      return undefined;
    }

    return {
      alibaba: {
        preserve_thinking: true,
      },
    };
  },
);
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
        openAiReasoningEffort: undefined,
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
      openAiReasoningEffort: "xhigh",
    },
    {
      policyToken: "default",
      resolvedValue: undefined,
      providerOptions: undefined,
      openAiReasoningEffort: undefined,
    },
  ];
});
const isReasoningRetryableErrorMock = vi.fn((error: unknown) =>
  error instanceof Error ? error.message.includes("reasoning_effort") : false,
);

vi.mock("ai", () => ({
  generateText: generateTextMock,
  generateObject: generateObjectMock,
}));

vi.mock("../../config/llm.js", () => ({
  createProviderLanguageModel: createProviderLanguageModelMock,
  getTaskExecutionChain: getTaskExecutionChainMock,
  getTaskReasoningPolicy: getTaskReasoningPolicyMock,
  getTaskReasoningSummary: getTaskReasoningSummaryMock,
  getProviderReasoningSummaryOptions: getProviderReasoningSummaryOptionsMock,
  getProviderReasoningHistoryOptions: getProviderReasoningHistoryOptionsMock,
  mergeProviderOptions: mergeProviderOptionsMock,
  getProviderReasoningAttempts: getProviderReasoningAttemptsMock,
  isReasoningRetryableError: isReasoningRetryableErrorMock,
}));

vi.mock("../db.js", () => ({
  db: {
    insert: vi.fn(() => ({
      values: insertValuesMock,
    })),
  },
}));

vi.mock("../db/schema/llmProviderLogs.js", () => ({
  llmProviderLogs: Symbol("llmProviderLogs"),
}));

describe("server/services/llm", () => {
  beforeEach(() => {
    vi.resetModules();
    generateTextMock.mockReset();
    generateObjectMock.mockReset();
    insertValuesMock.mockReset();
    createProviderLanguageModelMock.mockClear();
    getTaskExecutionChainMock.mockReset();
    getTaskReasoningPolicyMock.mockClear();
    getTaskReasoningSummaryMock.mockClear();
    getProviderReasoningSummaryOptionsMock.mockClear();
    getProviderReasoningHistoryOptionsMock.mockClear();
    mergeProviderOptionsMock.mockClear();
    getProviderReasoningAttemptsMock.mockClear();
    isReasoningRetryableErrorMock.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses direct provider models and logs the selected provider", async () => {
    getTaskExecutionChainMock.mockReturnValue([
      {
        providerName: "openai",
        model: "gpt-5.4-mini",
        baseURL: "https://api.openai.com/v1",
        lane: "default",
        pinnedProvider: false,
      },
      {
        providerName: "xai",
        model: "grok-3-beta",
        baseURL: "https://api.x.ai/v1",
        lane: "backup",
        pinnedProvider: false,
      },
    ]);

    generateTextMock.mockResolvedValue({
      text: "hello world",
      finishReason: "stop",
      warnings: [{ type: "unsupported-setting", setting: "temperature" }],
      providerMetadata: {
        openai: {
          requestId: "req-openai-1",
        },
      },
      response: {
        id: "resp-openai-1",
        modelId: "gpt-5.4-mini",
        timestamp: new Date("2026-04-21T10:00:00.000Z"),
        headers: {
          get: () => null,
        },
      },
      usage: {
        inputTokens: 12,
        outputTokens: 8,
        totalTokens: 20,
      },
      reasoningText: "reasoning text",
    });

    const { llmGenerateText } = await import("../../server/services/llm/index.js");

    const result = await llmGenerateText({
      task: "generate",
      prompt: "say hello",
    });

    expect(createProviderLanguageModelMock).toHaveBeenCalledWith(
      expect.objectContaining({
        providerName: "openai",
        model: "gpt-5.4-mini",
      }),
    );

    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: {
          providerName: "openai",
          modelId: "gpt-5.4-mini",
        },
        providerOptions: {
          openai: {
            reasoningEffort: "xhigh",
            reasoningSummary: "detailed",
          },
        },
      }),
    );

    expect(result).toEqual({
      text: "hello world",
      provider: "openai",
      model: "gpt-5.4-mini",
      lane: "default",
      tokensIn: 12,
      tokensOut: 8,
      latencyMs: expect.any(Number),
      finishReason: "stop",
      responseId: "resp-openai-1",
      reasoningText: "reasoning text",
      providerMetadata: {
        openai: {
          requestId: "req-openai-1",
        },
      },
    });

    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        task: "generate",
        provider: "openai",
        model: "gpt-5.4-mini",
        responseModel: "gpt-5.4-mini",
        lane: "default",
        tokensIn: 12,
        tokensOut: 8,
        finishReason: "stop",
        responseId: "resp-openai-1",
        reasoningText: "reasoning text",
        warningsJson: [{ type: "unsupported-setting", setting: "temperature" }],
        providerMetadataJson: {
          openai: {
            requestId: "req-openai-1",
          },
        },
      }),
    );
  });

  it("appends reasoning history to text requests and enables Alibaba preserve_thinking", async () => {
    getTaskExecutionChainMock.mockReturnValue([
      {
        providerName: "alibaba",
        model: "qwen3.6-plus",
        baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        lane: "default",
        pinnedProvider: false,
      },
    ]);

    const history: ModelMessage[] = [
      {
        role: "user",
        content: "first question",
      },
      {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "first answer",
          },
          {
            type: "reasoning",
            text: "first scratchpad",
          },
        ],
      },
    ];

    generateTextMock.mockResolvedValue({
      text: "second answer",
      finishReason: "stop",
      providerMetadata: {
        alibaba: {
          requestId: "req-alibaba-1",
        },
      },
      response: {
        id: "resp-alibaba-1",
        modelId: "qwen3.6-plus",
        timestamp: new Date("2026-04-24T09:00:00.000Z"),
        headers: {
          get: () => null,
        },
        messages: [
          {
            role: "assistant",
            content: [
              {
                type: "text",
                text: "second answer",
              },
              {
                type: "reasoning",
                text: "second scratchpad",
              },
            ],
          },
        ],
      },
      usage: {
        inputTokens: 20,
        outputTokens: 10,
        totalTokens: 30,
      },
      reasoningText: "second scratchpad",
    });

    const { llmGenerateText } = await import("../../server/services/llm/index.js");

    const result = await llmGenerateText({
      task: "generate",
      system: "system prompt",
      prompt: "second question",
      messages: history,
    });

    const request = generateTextMock.mock.calls[0]?.[0];
    expect(request).toEqual(
      expect.objectContaining({
        system: "system prompt",
        messages: [
          ...history,
          {
            role: "user",
            content: "second question",
          },
        ],
        providerOptions: {
          alibaba: {
            preserve_thinking: true,
          },
        },
      }),
    );
    expect(request).not.toHaveProperty("prompt");

    expect(result.responseMessages).toEqual([
      {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "second answer",
          },
          {
            type: "reasoning",
            text: "second scratchpad",
          },
        ],
      },
    ]);
  });

  it("falls back to the backup provider after a non-retryable default lane failure", async () => {
    getTaskExecutionChainMock.mockReturnValue([
      {
        providerName: "openai",
        model: "gpt-5.4-mini",
        baseURL: "https://api.openai.com/v1",
        lane: "default",
        pinnedProvider: false,
      },
      {
        providerName: "xai",
        model: "grok-3-beta",
        baseURL: "https://api.x.ai/v1",
        lane: "backup",
        pinnedProvider: false,
      },
    ]);

    generateTextMock
      .mockRejectedValueOnce(new Error("primary provider unavailable"))
      .mockResolvedValueOnce({
        text: "backup answer",
        finishReason: "stop",
        providerMetadata: {
          xai: {
            requestId: "req-xai-1",
          },
        },
        response: {
          id: "resp-xai-1",
          modelId: "grok-3-beta",
          timestamp: new Date("2026-04-21T10:01:00.000Z"),
          headers: {
            get: () => null,
          },
        },
        usage: {
          inputTokens: 10,
          outputTokens: 6,
          totalTokens: 16,
        },
      });

    const { llmGenerateText } = await import("../../server/services/llm/index.js");

    const result = await llmGenerateText({
      task: "generate",
      prompt: "fallback please",
    });

    expect(createProviderLanguageModelMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        providerName: "openai",
        model: "gpt-5.4-mini",
      }),
    );
    expect(createProviderLanguageModelMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        providerName: "xai",
        model: "grok-3-beta",
      }),
    );

    expect(generateTextMock.mock.calls[1]![0]).not.toHaveProperty("providerOptions");

    expect(result).toEqual({
      text: "backup answer",
      provider: "xai",
      model: "grok-3-beta",
      lane: "backup",
      tokensIn: 10,
      tokensOut: 6,
      latencyMs: expect.any(Number),
      finishReason: "stop",
      responseId: "resp-xai-1",
      reasoningText: undefined,
      providerMetadata: {
        xai: {
          requestId: "req-xai-1",
        },
      },
    });

    expect(insertValuesMock).toHaveBeenCalledTimes(2);
    expect(insertValuesMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        provider: "openai",
        lane: "default",
        errorMessage: "primary provider unavailable",
      }),
    );
    expect(insertValuesMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        provider: "xai",
        lane: "backup",
        errorMessage: undefined,
      }),
    );
  });

  it("maps generateObject reasoning into reasoningText for results and logs", async () => {
    getTaskExecutionChainMock.mockReturnValue([
      {
        providerName: "openai",
        model: "gpt-5.4-mini",
        baseURL: "https://api.openai.com/v1",
        lane: "default",
        pinnedProvider: false,
      },
    ]);

    generateObjectMock.mockResolvedValue({
      object: {
        ok: true,
      },
      finishReason: "stop",
      warnings: [{ type: "unsupported-setting", setting: "temperature" }],
      providerMetadata: {
        openai: {
          requestId: "req-openai-object-1",
        },
      },
      response: {
        id: "resp-openai-object-1",
        modelId: "gpt-5.4-mini",
        timestamp: new Date("2026-04-23T09:00:00.000Z"),
        headers: {
          get: () => null,
        },
      },
      usage: {
        inputTokens: 14,
        outputTokens: 9,
        totalTokens: 23,
      },
      reasoning: "object reasoning",
    });

    const { llmGenerateObject } = await import("../../server/services/llm/index.js");

    const result = await llmGenerateObject({
      task: "generate",
      schema: z.object({
        ok: z.boolean(),
      }),
      schemaName: "object-schema",
      prompt: "return ok",
    });

    expect(result).toEqual({
      data: {
        ok: true,
      },
      provider: "openai",
      model: "gpt-5.4-mini",
      lane: "default",
      tokensIn: 14,
      tokensOut: 9,
      latencyMs: expect.any(Number),
      finishReason: "stop",
      responseId: "resp-openai-object-1",
      reasoningText: "object reasoning",
      providerMetadata: {
        openai: {
          requestId: "req-openai-object-1",
        },
      },
    });

    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "openai",
        model: "gpt-5.4-mini",
        responseModel: "gpt-5.4-mini",
        lane: "default",
        tokensIn: 14,
        tokensOut: 9,
        finishReason: "stop",
        responseId: "resp-openai-object-1",
        reasoningText: "object reasoning",
        warningsJson: [{ type: "unsupported-setting", setting: "temperature" }],
        providerMetadataJson: {
          openai: {
            requestId: "req-openai-object-1",
          },
        },
      }),
    );
  });

  it("repairs fenced JSON object text from provider parse failures", async () => {
    getTaskExecutionChainMock.mockReturnValue([
      {
        providerName: "xiaomi",
        model: "mimo-v2.5-pro",
        baseURL: "https://api.xiaomimimo.com/v1",
        lane: "default",
        pinnedProvider: false,
      },
    ]);

    generateObjectMock.mockRejectedValue(
      Object.assign(new Error("No object generated: could not parse the response"), {
        name: "AI_NoObjectGeneratedError",
        text: '```json\n{"ok":true,"stem":"code fence inside string ```cpp\\nint main(){}\\n```"}\n```',
        finishReason: "stop",
        response: {
          id: "resp-xiaomi-object-1",
          modelId: "mimo-v2.5-pro",
        },
        usage: {
          inputTokens: 11,
          outputTokens: 7,
        },
        reasoningText: "provider reasoning",
      }),
    );

    const { llmGenerateObject } = await import("../../server/services/llm/index.js");

    const result = await llmGenerateObject({
      task: "generate",
      schema: z.object({
        ok: z.boolean(),
        stem: z.string(),
      }),
      schemaName: "object-schema",
      prompt: "return fenced json",
    });

    expect(result).toEqual({
      data: {
        ok: true,
        stem: "code fence inside string ```cpp\nint main(){}\n```",
      },
      provider: "xiaomi",
      model: "mimo-v2.5-pro",
      lane: "default",
      tokensIn: 11,
      tokensOut: 7,
      latencyMs: expect.any(Number),
      finishReason: "stop",
      responseId: "resp-xiaomi-object-1",
      reasoningText: "provider reasoning",
      providerMetadata: undefined,
    });

    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "xiaomi",
        model: "mimo-v2.5-pro",
        responseModel: "mimo-v2.5-pro",
        lane: "default",
        tokensIn: 11,
        tokensOut: 7,
        warningsJson: [
          {
            type: "object_text_json_repair",
            sourceError: "AI_NoObjectGeneratedError",
          },
        ],
        errorMessage: undefined,
      }),
    );
  });

  it("appends reasoning history to object requests", async () => {
    getTaskExecutionChainMock.mockReturnValue([
      {
        providerName: "alibaba",
        model: "qwen3.6-plus",
        baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        lane: "default",
        pinnedProvider: false,
      },
    ]);

    const history: ModelMessage[] = [
      {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "prior answer",
          },
          {
            type: "reasoning",
            text: "prior scratchpad",
          },
        ],
      },
    ];

    generateObjectMock.mockResolvedValue({
      object: {
        ok: true,
      },
      finishReason: "stop",
      response: {
        id: "resp-alibaba-object-1",
        modelId: "qwen3.6-plus",
        timestamp: new Date("2026-04-24T09:10:00.000Z"),
        headers: {
          get: () => null,
        },
      },
      usage: {
        inputTokens: 15,
        outputTokens: 9,
        totalTokens: 24,
      },
      providerMetadata: {
        alibaba: {
          requestId: "req-alibaba-object-1",
        },
      },
      reasoning: "object scratchpad",
    });

    const { llmGenerateObject } = await import("../../server/services/llm/index.js");

    await llmGenerateObject({
      task: "generate",
      schema: z.object({
        ok: z.boolean(),
      }),
      schemaName: "object-schema",
      system: "system prompt",
      prompt: "follow-up question",
      messages: history,
    });

    const request = generateObjectMock.mock.calls[0]?.[0];
    expect(request).toEqual(
      expect.objectContaining({
        system: "system prompt",
        messages: [
          ...history,
          {
            role: "user",
            content: "follow-up question",
          },
        ],
        providerOptions: {
          alibaba: {
            preserve_thinking: true,
          },
        },
      }),
    );
    expect(request).not.toHaveProperty("prompt");
  });
});
