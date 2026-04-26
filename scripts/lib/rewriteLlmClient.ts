import type { OpenAiReasoningEffort } from "../../config/llm.js";

export type RewriteProviderName =
  | "openai"
  | "alibaba"
  | "moonshotai"
  | "openrouter"
  | "deepseek"
  | "minimax"
  | "volcengine"
  | "xai"
  | "zai";

export interface RewriteProviderRequestParams {
  providerName: RewriteProviderName;
  apiKey: string;
  baseUrl: string;
  model: string;
  system: string;
  prompt: string;
  maxTokens: number;
  reasoningEffort?: OpenAiReasoningEffort;
}

export interface RewriteProviderResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | undefined {
  return typeof value === "object" && value !== null ? (value as JsonRecord) : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function joinBaseUrl(baseUrl: string, path: string): string {
  return new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
}

export function buildRewriteProviderRequest(params: RewriteProviderRequestParams): {
  url: string;
  init: RequestInit;
} {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${params.apiKey}`,
  };
  const reasoningEffort = params.reasoningEffort;

  if (params.providerName === "openai") {
    const body = {
      model: params.model,
      input: `${params.system}\n\n${params.prompt}`,
      max_output_tokens: params.maxTokens,
      ...(reasoningEffort
        ? {
            reasoning: {
              effort: reasoningEffort,
            },
          }
        : {}),
    };

    return {
      url: joinBaseUrl(params.baseUrl, "responses"),
      init: {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      },
    };
  }

  const body = {
    model: params.model,
    messages: [
      { role: "system", content: params.system },
      { role: "user", content: params.prompt },
    ],
    stream: false,
    max_tokens: params.maxTokens,
    response_format: { type: "json_object" },
    ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
  };

  return {
    url: joinBaseUrl(params.baseUrl, "chat/completions"),
    init: {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    },
  };
}

function extractOpenAiCompatText(payload: unknown): string {
  const output = asArray(asRecord(payload)?.output);
  for (const item of output) {
    const itemRecord = asRecord(item);
    if (itemRecord?.type !== "message") {
      continue;
    }

    const chunks = asArray(itemRecord.content)
      .map((content) => getString(asRecord(content)?.text))
      .filter((content): content is string => typeof content === "string");
    if (chunks.length > 0) {
      return chunks.join("");
    }
  }

  throw new Error("openai response does not contain output text");
}

function extractChatCompletionText(payload: unknown): string {
  const choice = asRecord(asArray(asRecord(payload)?.choices)[0]);
  const content = asRecord(choice?.message)?.content;

  if (typeof content === "string" && content.trim().length > 0) {
    return content;
  }

  if (Array.isArray(content)) {
    const chunks = content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }

        const text = getString(asRecord(item)?.text);
        if (text) {
          return text;
        }

        return "";
      })
      .filter((item) => item.length > 0);

    if (chunks.length > 0) {
      return chunks.join("");
    }
  }

  throw new Error("chat completion response does not contain assistant content");
}

export function parseRewriteProviderResponse(
  providerName: RewriteProviderName,
  payload: unknown,
): RewriteProviderResponse {
  const usage = asRecord(asRecord(payload)?.usage);

  if (providerName === "openai") {
    return {
      text: extractOpenAiCompatText(payload),
      inputTokens: Number(usage?.input_tokens ?? 0),
      outputTokens: Number(usage?.output_tokens ?? 0),
    };
  }

  return {
    text: extractChatCompletionText(payload),
    inputTokens: Number(usage?.prompt_tokens ?? 0),
    outputTokens: Number(usage?.completion_tokens ?? 0),
  };
}
