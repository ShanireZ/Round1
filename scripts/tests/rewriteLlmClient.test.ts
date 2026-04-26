import assert from "node:assert/strict";

import {
  buildRewriteProviderRequest,
  parseRewriteProviderResponse,
} from "../lib/rewriteLlmClient.js";

{
  const request = buildRewriteProviderRequest({
    providerName: "openai",
    apiKey: "openai-key",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-5.4",
    system: "system prompt",
    prompt: "user prompt",
    maxTokens: 900,
  });

  assert.equal(request.url, "https://api.openai.com/v1/responses");
  assert.equal(request.init.method, "POST");
  assert.equal((request.init.headers as Record<string, string>).Authorization, "Bearer openai-key");

  const body = JSON.parse(String(request.init.body));
  assert.equal(body.model, "gpt-5.4");
  assert.equal(body.max_output_tokens, 900);
  assert.equal(typeof body.input, "string");
  assert.match(body.input, /system prompt/);
  assert.match(body.input, /user prompt/);
}

{
  const request = buildRewriteProviderRequest({
    providerName: "alibaba",
    apiKey: "alibaba-key",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen3.6-plus",
    system: "system prompt",
    prompt: "user prompt",
    maxTokens: 600,
  });

  assert.equal(request.url, "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions");
  const body = JSON.parse(String(request.init.body));
  assert.equal(body.model, "qwen3.6-plus");
  assert.equal(body.max_tokens, 600);
  assert.deepEqual(body.response_format, { type: "json_object" });
  assert.deepEqual(body.messages, [
    { role: "system", content: "system prompt" },
    { role: "user", content: "user prompt" },
  ]);
}

{
  const request = buildRewriteProviderRequest({
    providerName: "moonshotai",
    apiKey: "moonshot-key",
    baseUrl: "https://api.moonshot.ai/v1",
    model: "kimi-k2.5",
    system: "system prompt",
    prompt: "user prompt",
    maxTokens: 700,
  });

  assert.equal(request.url, "https://api.moonshot.ai/v1/chat/completions");
  const body = JSON.parse(String(request.init.body));
  assert.equal(body.model, "kimi-k2.5");
  assert.equal(body.max_tokens, 700);
  assert.deepEqual(body.messages, [
    { role: "system", content: "system prompt" },
    { role: "user", content: "user prompt" },
  ]);
}

{
  const request = buildRewriteProviderRequest({
    providerName: "openrouter",
    apiKey: "openrouter-key",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "openai/gpt-5.2",
    system: "system prompt",
    prompt: "user prompt",
    maxTokens: 700,
  });

  assert.equal(request.url, "https://openrouter.ai/api/v1/chat/completions");
  const body = JSON.parse(String(request.init.body));
  assert.equal(body.model, "openai/gpt-5.2");
  assert.equal(body.max_tokens, 700);
  assert.deepEqual(body.messages, [
    { role: "system", content: "system prompt" },
    { role: "user", content: "user prompt" },
  ]);
}

{
  const request = buildRewriteProviderRequest({
    providerName: "deepseek",
    apiKey: "deepseek-key",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-chat",
    system: "system prompt",
    prompt: "user prompt",
    maxTokens: 700,
  });

  assert.equal(request.url, "https://api.deepseek.com/chat/completions");
  const body = JSON.parse(String(request.init.body));
  assert.equal(body.model, "deepseek-chat");
  assert.equal(body.max_tokens, 700);
  assert.deepEqual(body.messages, [
    { role: "system", content: "system prompt" },
    { role: "user", content: "user prompt" },
  ]);
}

{
  const request = buildRewriteProviderRequest({
    providerName: "minimax",
    apiKey: "minimax-key",
    baseUrl: "https://api.minimax.io/v1",
    model: "MiniMax-M2.7",
    system: "system prompt",
    prompt: "user prompt",
    maxTokens: 700,
  });

  assert.equal(request.url, "https://api.minimax.io/v1/chat/completions");
  const body = JSON.parse(String(request.init.body));
  assert.equal(body.model, "MiniMax-M2.7");
  assert.equal(body.max_tokens, 700);
  assert.deepEqual(body.messages, [
    { role: "system", content: "system prompt" },
    { role: "user", content: "user prompt" },
  ]);
}

{
  const request = buildRewriteProviderRequest({
    providerName: "volcengine",
    apiKey: "volcengine-key",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    model: "doubao-seed-2-0-lite-260215",
    system: "system prompt",
    prompt: "user prompt",
    maxTokens: 700,
  });

  assert.equal(request.url, "https://ark.cn-beijing.volces.com/api/v3/chat/completions");
  const body = JSON.parse(String(request.init.body));
  assert.equal(body.model, "doubao-seed-2-0-lite-260215");
  assert.equal(body.max_tokens, 700);
  assert.deepEqual(body.messages, [
    { role: "system", content: "system prompt" },
    { role: "user", content: "user prompt" },
  ]);
}

{
  const request = buildRewriteProviderRequest({
    providerName: "xai",
    apiKey: "xai-key",
    baseUrl: "https://api.x.ai/v1",
    model: "grok-3-beta",
    system: "system prompt",
    prompt: "user prompt",
    maxTokens: 700,
  });

  assert.equal(request.url, "https://api.x.ai/v1/chat/completions");
  const body = JSON.parse(String(request.init.body));
  assert.equal(body.model, "grok-3-beta");
  assert.equal(body.max_tokens, 700);
  assert.deepEqual(body.messages, [
    { role: "system", content: "system prompt" },
    { role: "user", content: "user prompt" },
  ]);
}

{
  const request = buildRewriteProviderRequest({
    providerName: "zai",
    apiKey: "zai-key",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    model: "glm-5.1",
    system: "system prompt",
    prompt: "user prompt",
    maxTokens: 700,
  });

  assert.equal(request.url, "https://open.bigmodel.cn/api/paas/v4/chat/completions");
  const body = JSON.parse(String(request.init.body));
  assert.equal(body.model, "glm-5.1");
  assert.equal(body.max_tokens, 700);
  assert.deepEqual(body.messages, [
    { role: "system", content: "system prompt" },
    { role: "user", content: "user prompt" },
  ]);
}

{
  const parsed = parseRewriteProviderResponse("openai", {
    output: [
      {
        type: "message",
        content: [{ type: "output_text", text: '{"questions":[]}' }],
      },
    ],
    usage: {
      input_tokens: 11,
      output_tokens: 22,
    },
  });

  assert.equal(parsed.text, '{"questions":[]}');
  assert.equal(parsed.inputTokens, 11);
  assert.equal(parsed.outputTokens, 22);
}

{
  const parsed = parseRewriteProviderResponse("alibaba", {
    choices: [
      {
        message: {
          reasoning_content: "thinking...",
          content: '{"questions":[{"questionType":"single_choice","explanation":"ok"}]}',
        },
      },
    ],
    usage: {
      prompt_tokens: 9,
      completion_tokens: 17,
    },
  });

  assert.match(parsed.text, /"explanation":"ok"/);
  assert.equal(parsed.inputTokens, 9);
  assert.equal(parsed.outputTokens, 17);
}

{
  const parsed = parseRewriteProviderResponse("moonshotai", {
    choices: [
      {
        message: {
          content: '{"questions":[{"explanation":"ok"}]}',
        },
      },
    ],
    usage: {
      prompt_tokens: 12,
      completion_tokens: 18,
    },
  });

  assert.match(parsed.text, /"explanation":"ok"/);
  assert.equal(parsed.inputTokens, 12);
  assert.equal(parsed.outputTokens, 18);
}

{
  const parsed = parseRewriteProviderResponse("openrouter", {
    choices: [
      {
        message: {
          content: '{"questions":[{"explanation":"ok"}]}',
        },
      },
    ],
    usage: {
      prompt_tokens: 14,
      completion_tokens: 21,
    },
  });

  assert.match(parsed.text, /"explanation":"ok"/);
  assert.equal(parsed.inputTokens, 14);
  assert.equal(parsed.outputTokens, 21);
}

{
  const parsed = parseRewriteProviderResponse("minimax", {
    choices: [
      {
        message: {
          content: '{"questions":[{"explanation":"ok"}]}',
        },
      },
    ],
    usage: {
      prompt_tokens: 16,
      completion_tokens: 24,
    },
  });

  assert.match(parsed.text, /"explanation":"ok"/);
  assert.equal(parsed.inputTokens, 16);
  assert.equal(parsed.outputTokens, 24);
}

{
  const parsed = parseRewriteProviderResponse("volcengine", {
    choices: [
      {
        message: {
          content: '{"questions":[{"explanation":"ok"}]}',
        },
      },
    ],
    usage: {
      prompt_tokens: 8,
      completion_tokens: 15,
    },
  });

  assert.match(parsed.text, /"explanation":"ok"/);
  assert.equal(parsed.inputTokens, 8);
  assert.equal(parsed.outputTokens, 15);
}

{
  const parsed = parseRewriteProviderResponse("xai", {
    choices: [
      {
        message: {
          content: '{"questions":[{"explanation":"ok"}]}',
        },
      },
    ],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 19,
    },
  });

  assert.match(parsed.text, /"explanation":"ok"/);
  assert.equal(parsed.inputTokens, 10);
  assert.equal(parsed.outputTokens, 19);
}

console.log("rewriteLlmClient: ok");
