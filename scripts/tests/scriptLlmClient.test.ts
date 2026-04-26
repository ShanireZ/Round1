import assert from "node:assert/strict";
import type { ModelMessage } from "ai";

import { callScriptLlmScene, resolveScriptProviderChain } from "../lib/scriptLlmClient.js";

const runtimeEnv = {
  LLM_PROVIDER_DEFAULT: "alibaba",
  LLM_PROVIDER_BACKUP: "deepseek",
  LLM_REASONING_DEFAULT: "xhigh>high>default",
  LLM_REASONING_SUMMARY_DEFAULT: "auto",
  LLM_THINKING_TYPE_DEFAULT: "default",
  LLM_THINKING_BUDGET_DEFAULT: "default",
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
  MINIMAX_BASE_URL: "https://api.minimaxi.com/v1",
  MINIMAX_MODEL: "MiniMax-M2.7",
  VOLCENGINE_API_KEY: "volcengine-key",
  VOLCENGINE_BASE_URL: "https://ark.cn-beijing.volces.com/api/v3",
  VOLCENGINE_MODEL: "doubao-seed-2-0-lite-260215",
  XAI_API_KEY: "xai-key",
  XAI_BASE_URL: "https://api.x.ai/v1",
  XAI_MODEL: "grok-3-beta",
  ZAI_API_KEY: "zai-key",
  ZAI_BASE_URL: "https://open.bigmodel.cn/api/paas/v4",
  ZAI_MODEL: "glm-5.1",
} as const;

function createChatCompletionSuccessResponse(
  modelId: string,
  text: string,
  inputTokens = 9,
  outputTokens = 17,
) {
  return new Response(
    JSON.stringify({
      id: `chatcmpl-${modelId}`,
      object: "chat.completion",
      created: 1_776_000_000,
      model: modelId,
      choices: [
        {
          index: 0,
          finish_reason: "stop",
          message: {
            role: "assistant",
            content: text,
          },
        },
      ],
      usage: {
        prompt_tokens: inputTokens,
        completion_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens,
      },
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
}

function createOpenAiResponsesSuccessResponse(
  modelId: string,
  text: string,
  inputTokens = 9,
  outputTokens = 17,
) {
  return new Response(
    JSON.stringify({
      id: `resp-${modelId}`,
      object: "response",
      created_at: 1_776_000_000,
      status: "completed",
      model: modelId,
      output: [
        {
          type: "message",
          id: `msg-${modelId}`,
          role: "assistant",
          content: [{ type: "output_text", text, annotations: [] }],
        },
      ],
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens,
      },
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
}

{
  const chain = resolveScriptProviderChain("rewrite", {
    runtimeEnv,
  });

  assert.deepEqual(chain, [
    {
      providerName: "alibaba",
      model: "qwen3.6-plus",
      baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      lane: "default",
      pinnedProvider: false,
      reasoningPolicy: ["xhigh", "high", "default"],
    },
    {
      providerName: "deepseek",
      model: "deepseek-v4-pro",
      baseURL: "https://api.deepseek.com",
      lane: "backup",
      pinnedProvider: false,
      reasoningPolicy: ["xhigh", "high", "default"],
    },
  ]);
}

{
  const chain = resolveScriptProviderChain("paper_audit", {
    routeOverride: "xiaomi:mimo-v2.5-pro,minimax:MiniMax-M2.7",
    runtimeEnv,
  });

  assert.deepEqual(chain, [
    {
      providerName: "xiaomi",
      model: "mimo-v2.5-pro",
      baseURL: "https://api.xiaomimimo.com/v1",
      lane: "default",
      pinnedProvider: true,
      reasoningPolicy: ["xhigh", "high", "default"],
    },
    {
      providerName: "minimax",
      model: "MiniMax-M2.7",
      baseURL: "https://api.minimaxi.com/v1",
      lane: "backup",
      pinnedProvider: true,
      reasoningPolicy: ["xhigh", "high", "default"],
    },
  ]);
}

{
  const chain = resolveScriptProviderChain("rewrite", {
    routeOverride: "minimax:MiniMax-M2.7",
    runtimeEnv,
  });

  assert.deepEqual(chain, [
    {
      providerName: "minimax",
      model: "MiniMax-M2.7",
      baseURL: "https://api.minimaxi.com/v1",
      lane: "default",
      pinnedProvider: true,
      reasoningPolicy: ["xhigh", "high", "default"],
    },
  ]);
}

{
  const chain = resolveScriptProviderChain("rewrite", {
    routeOverride: "deepseek:deepseek-chat,alibaba:qwen3.6-plus",
    runtimeEnv,
  });

  assert.deepEqual(chain, [
    {
      providerName: "deepseek",
      model: "deepseek-chat",
      baseURL: "https://api.deepseek.com",
      lane: "default",
      pinnedProvider: true,
      reasoningPolicy: ["xhigh", "high", "default"],
    },
    {
      providerName: "alibaba",
      model: "qwen3.6-plus",
      baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      lane: "backup",
      pinnedProvider: true,
      reasoningPolicy: ["xhigh", "high", "default"],
    },
  ]);
}

{
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    calls.push({ url, body });

    return createChatCompletionSuccessResponse("qwen3.6-plus", "OK", 10, 14);
  };

  const result = await callScriptLlmScene({
    scene: "rewrite",
    routeOverride: "alibaba:qwen3.6-plus",
    runtimeEnv: {
      ...runtimeEnv,
      LLM_THINKING_TYPE_DEFAULT: "enabled",
      LLM_THINKING_BUDGET_DEFAULT: "2048",
    },
    fetchImpl,
    system: "system prompt",
    prompt: "user prompt",
    maxTokens: 128,
    timeoutMs: 5_000,
  });

  assert.equal(result.providerName, "alibaba");
  assert.equal(result.model, "qwen3.6-plus");
  assert.equal(calls.length, 1);
  assert.match(calls[0]!.url, /^https:\/\/dashscope\.aliyuncs\.com\/compatible-mode\/v1\//);
  assert.equal(calls[0]!.body.enable_thinking, true);
  assert.equal(calls[0]!.body.thinking_budget, 2048);
}

{
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    calls.push({ url, body });

    return createChatCompletionSuccessResponse("qwen3.6-plus", "OK", 10, 14);
  };
  const messages: ModelMessage[] = [
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

  const result = await callScriptLlmScene({
    scene: "rewrite",
    routeOverride: "alibaba:qwen3.6-plus",
    runtimeEnv: {
      ...runtimeEnv,
      LLM_THINKING_TYPE_DEFAULT: "enabled",
      LLM_THINKING_BUDGET_DEFAULT: "2048",
    },
    fetchImpl,
    system: "system prompt",
    prompt: "follow-up question",
    messages,
    maxTokens: 128,
    timeoutMs: 5_000,
  });

  assert.equal(result.providerName, "alibaba");
  assert.equal(result.model, "qwen3.6-plus");
  assert.equal(calls.length, 1);
  assert.match(calls[0]!.url, /^https:\/\/dashscope\.aliyuncs\.com\/compatible-mode\/v1\//);
  assert.equal(calls[0]!.body.enable_thinking, true);
  assert.equal(calls[0]!.body.thinking_budget, 2048);
  assert.equal(calls[0]!.body.preserve_thinking, true);
  assert.deepEqual(calls[0]!.body.messages, [
    { role: "system", content: "system prompt" },
    { role: "user", content: "first question" },
    {
      role: "assistant",
      content: "first answer",
      reasoning_content: "first scratchpad",
    },
    { role: "user", content: "follow-up question" },
  ]);
}

{
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    calls.push({ url, body });

    return createChatCompletionSuccessResponse("mimo-v2.5-pro", "OK", 10, 14);
  };

  const result = await callScriptLlmScene({
    scene: "rewrite",
    routeOverride: "xiaomi:mimo-v2.5-pro",
    runtimeEnv: {
      ...runtimeEnv,
      LLM_THINKING_TYPE_DEFAULT: "enabled",
    },
    fetchImpl,
    system: "system prompt",
    prompt: "user prompt",
    maxTokens: 128,
    timeoutMs: 5_000,
  });

  assert.equal(result.providerName, "xiaomi");
  assert.equal(result.model, "mimo-v2.5-pro");
  assert.equal(calls.length, 1);
  assert.match(calls[0]!.url, /^https:\/\/api\.xiaomimimo\.com\/v1\//);
  assert.deepEqual(calls[0]!.body.thinking, { type: "enabled" });
}

{
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    calls.push({ url, body });

    return createChatCompletionSuccessResponse("qwen3.6-plus", '{"questions":[]}');
  };

  const result = await callScriptLlmScene({
    scene: "rewrite",
    runtimeEnv,
    fetchImpl,
    system: "system prompt",
    prompt: "user prompt",
    maxTokens: 900,
    timeoutMs: 5_000,
  });

  assert.equal(result.providerName, "alibaba");
  assert.equal(result.model, "qwen3.6-plus");
  assert.equal(result.inputTokens, 9);
  assert.equal(result.outputTokens, 17);
  assert.equal(result.finishReason, "stop");
  assert.equal(result.responseId, "chatcmpl-qwen3.6-plus");
  assert.equal(calls.length, 1);

  const firstCall = calls[0];
  assert.ok(firstCall);
  assert.match(firstCall.url, /^https:\/\/dashscope\.aliyuncs\.com\/compatible-mode\/v1\//);
  assert.equal(firstCall.body.model, "qwen3.6-plus");
  assert.equal(firstCall.body.max_tokens, 900);
  assert.deepEqual(firstCall.body.messages, [
    { role: "system", content: "system prompt" },
    { role: "user", content: "user prompt" },
  ]);
}

{
  {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      calls.push({ url, body });

      return createChatCompletionSuccessResponse("deepseek-v4-pro", "OK", 8, 12);
    };

    const result = await callScriptLlmScene({
      scene: "rewrite",
      routeOverride: "deepseek:deepseek-v4-pro",
      runtimeEnv: {
        ...runtimeEnv,
        DEEPSEEK_MODEL: "deepseek-v4-pro",
        LLM_THINKING_TYPE_DEFAULT: "enabled",
      },
      fetchImpl,
      system: "system prompt",
      prompt: "user prompt",
      maxTokens: 128,
      timeoutMs: 5_000,
    });

    assert.equal(result.providerName, "deepseek");
    assert.equal(result.model, "deepseek-v4-pro");
    assert.equal(calls.length, 1);
    assert.match(calls[0]!.url, /^https:\/\/api\.deepseek\.com\//);
    assert.deepEqual(calls[0]!.body.thinking, { type: "enabled" });
  }
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    calls.push({ url, body });

    if (calls.length === 1) {
      throw new Error("invalid reasoning_effort");
    }

    return createOpenAiResponsesSuccessResponse(
      "gpt-5.4-mini",
      '{"questions":[{"ok":true}]}',
      11,
      22,
    );
  };

  const result = await callScriptLlmScene({
    scene: "rewrite",
    reasoningPolicyOverride: "xhigh>high>default",
    runtimeEnv: {
      ...runtimeEnv,
      LLM_PROVIDER_DEFAULT: "openai",
      LLM_PROVIDER_BACKUP: "",
      OPENAI_MODEL: "gpt-5.4-mini",
    },
    fetchImpl,
    system: "system prompt",
    prompt: "user prompt",
    maxTokens: 900,
    timeoutMs: 5_000,
  });

  assert.equal(result.providerName, "openai");
  assert.equal(result.model, "gpt-5.4-mini");
  assert.equal(result.inputTokens, 11);
  assert.equal(result.outputTokens, 22);
  assert.equal(calls.length, 2);
  assert.match(calls[0]!.url, /^https:\/\/api\.openai\.com\/v1\//);
  assert.match(calls[1]!.url, /^https:\/\/api\.openai\.com\/v1\//);
}

{
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    calls.push({ url, body });

    if (calls.length === 1) {
      throw new Error("provider failed");
    }

    return createChatCompletionSuccessResponse(
      "deepseek-v4-pro",
      '{"questions":[{"explanation":"ok"}]}',
      12,
      34,
    );
  };

  const result = await callScriptLlmScene({
    scene: "rewrite",
    runtimeEnv,
    fetchImpl,
    system: "system prompt",
    prompt: "user prompt",
    maxTokens: 900,
    timeoutMs: 5_000,
  });

  assert.equal(calls.length, 2);
  assert.equal(result.providerName, "deepseek");
  assert.equal(result.model, "deepseek-v4-pro");
  assert.equal(result.inputTokens, 12);
  assert.equal(result.outputTokens, 34);
  assert.match(result.text, /"explanation":"ok"/);
  assert.match(calls[0]!.url, /^https:\/\/dashscope\.aliyuncs\.com\/compatible-mode\/v1\//);
  assert.match(calls[1]!.url, /^https:\/\/api\.deepseek\.com\//);
  assert.equal(calls[1]!.body.model, "deepseek-v4-pro");
}

{
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    calls.push({ url, body });

    return createChatCompletionSuccessResponse(
      "doubao-seed-2-0-lite-260215",
      '{"questions":[{"ok":true}]}',
      13,
      26,
    );
  };

  const result = await callScriptLlmScene({
    scene: "rewrite",
    runtimeEnv: {
      ...runtimeEnv,
      LLM_PROVIDER_DEFAULT: "volcengine",
      LLM_PROVIDER_BACKUP: "",
      LLM_THINKING_TYPE_DEFAULT: "enabled",
    },
    fetchImpl,
    system: "system prompt",
    prompt: "user prompt",
    maxTokens: 900,
    timeoutMs: 5_000,
  });

  assert.equal(result.providerName, "volcengine");
  assert.equal(result.model, "doubao-seed-2-0-lite-260215");
  assert.equal(result.inputTokens, 13);
  assert.equal(result.outputTokens, 26);
  assert.equal(calls.length, 1);
  assert.match(calls[0]!.url, /^https:\/\/ark\.cn-beijing\.volces\.com\/api\/v3\//);
  assert.equal(calls[0]!.body.model, "doubao-seed-2-0-lite-260215");
  assert.deepEqual(calls[0]!.body.thinking, { type: "enabled" });
  assert.equal(calls[0]!.body.reasoning_effort, "high");
}

{
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    calls.push({ url, body });

    return createChatCompletionSuccessResponse("MiniMax-M2.7", "OK", 10, 14);
  };

  const result = await callScriptLlmScene({
    scene: "rewrite",
    routeOverride: "minimax:MiniMax-M2.7",
    runtimeEnv,
    fetchImpl,
    system: "system prompt",
    prompt: "user prompt",
    maxTokens: 128,
    timeoutMs: 5_000,
  });

  assert.equal(result.providerName, "minimax");
  assert.equal(result.model, "MiniMax-M2.7");
  assert.equal(calls.length, 1);
  assert.match(calls[0]!.url, /^https:\/\/api\.minimaxi\.com\/v1\//);
  assert.equal(calls[0]!.body.reasoning_split, true);
}

{
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    calls.push({ url, body });

    if (calls.length === 1) {
      throw new Error("provider failed");
    }

    return createChatCompletionSuccessResponse(
      "MiniMax-M2.7",
      '{"questions":[{"ok":true}]}',
      15,
      28,
    );
  };

  const result = await callScriptLlmScene({
    scene: "rewrite",
    routeOverride: "deepseek:deepseek-chat,minimax:MiniMax-M2.7",
    runtimeEnv,
    fetchImpl,
    system: "system prompt",
    prompt: "user prompt",
    maxTokens: 900,
    timeoutMs: 5_000,
  });

  assert.equal(calls.length, 2);
  assert.equal(result.providerName, "minimax");
  assert.equal(result.model, "MiniMax-M2.7");
  assert.equal(result.inputTokens, 15);
  assert.equal(result.outputTokens, 28);
  assert.match(calls[0]!.url, /^https:\/\/api\.deepseek\.com\//);
  assert.equal(calls[0]!.body.model, "deepseek-chat");
  assert.match(calls[1]!.url, /^https:\/\/api\.minimaxi\.com\/v1\//);
  assert.equal(calls[1]!.body.model, "MiniMax-M2.7");
}

console.log("scriptLlmClient: ok");
