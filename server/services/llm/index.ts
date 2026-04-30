/**
 * LLM 服务层 — 统一 AI 出题 / 判官调用接口
 *
 * 基于 Vercel AI SDK (ai@^6.0) 构建，支持多供应商路由。
 * 每次调用自动记录 llm_provider_logs（成功/失败/tokens/cost/latency/观测字段）。
 */
import { generateObject, generateText, type ModelMessage } from "ai";
import type { ZodSchema } from "zod";
import {
  createProviderLanguageModel,
  getProviderReasoningHistoryOptions,
  getProviderReasoningAttempts,
  getProviderReasoningSummaryOptions,
  getTaskExecutionChain,
  getTaskReasoningPolicy,
  getTaskReasoningSummary,
  isReasoningRetryableError,
  mergeProviderOptions,
  type LLMLane,
  type LLMReasoningAttempt,
  type LLMTask,
  type ProviderReasoningOptions,
  type TaskConfig,
} from "../../../config/llm.js";
import { estimateLlmCost, logLlmProviderCall } from "./providerLog.js";
import { logger } from "../../logger.js";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | undefined {
  return typeof value === "object" && value !== null ? (value as JsonRecord) : undefined;
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function getNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function extractBalancedJsonObject(text: string): string | undefined {
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaping) {
        escaping = false;
        continue;
      }

      if (char === "\\") {
        escaping = true;
        continue;
      }

      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      if (depth === 0) {
        start = index;
      }
      depth += 1;
      continue;
    }

    if (char !== "}" || depth === 0) {
      continue;
    }

    depth -= 1;
    if (depth === 0 && start >= 0) {
      return text.slice(start, index + 1);
    }
  }

  return undefined;
}

function extractJsonObjectText(rawText: string): string | undefined {
  const trimmed = rawText.trim();
  const extracted = extractBalancedJsonObject(trimmed);
  if (extracted) {
    return extracted;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);

  if (fenced?.[1]) {
    return extractBalancedJsonObject(fenced[1].trim()) ?? fenced[1].trim();
  }

  return undefined;
}

function parseObjectFromProviderErrorText<T>(error: unknown, schema: ZodSchema<T>): T | undefined {
  const text = getString(asRecord(error)?.text);
  if (!text) {
    return undefined;
  }

  const jsonText = extractJsonObjectText(text);
  if (!jsonText) {
    return undefined;
  }

  try {
    return schema.parse(JSON.parse(jsonText));
  } catch {
    return undefined;
  }
}

function resolveUsage(result: { usage?: unknown }): { inputTokens: number; outputTokens: number } {
  const usage = asRecord(result.usage);

  return {
    inputTokens: getNumber(usage?.inputTokens) ?? 0,
    outputTokens: getNumber(usage?.outputTokens) ?? 0,
  };
}

function resolveResponseEnvelope(result: { response?: unknown }): JsonRecord | undefined {
  const responseRecord = asRecord(result.response);
  const bodyRecord = asRecord(responseRecord?.body);
  const nestedResponse = asRecord(bodyRecord?.response);
  return nestedResponse ?? bodyRecord ?? responseRecord;
}

function resolveFinishReason(result: {
  finishReason?: unknown;
  response?: unknown;
}): string | undefined {
  return (
    getString(asRecord(asRecord(result.response)?.body)?.finishReason) ??
    getString(result.finishReason)
  );
}

function resolveResponseId(result: { response?: unknown }): string | undefined {
  return getString(resolveResponseEnvelope(result)?.id);
}

function resolveResponseModel(result: { response?: unknown }, fallbackModel: string): string {
  const envelope = resolveResponseEnvelope(result);
  return getString(envelope?.modelId) ?? getString(envelope?.model) ?? fallbackModel;
}

function resolveReasoningText(result: {
  reasoning?: unknown;
  reasoningText?: unknown;
}): string | undefined {
  return getString(result.reasoningText) ?? getString(result.reasoning);
}

function resolveResponseMessages(result: { response?: unknown }): ModelMessage[] | undefined {
  const responseRecord = asRecord(result.response);
  return Array.isArray(responseRecord?.messages)
    ? (responseRecord.messages as ModelMessage[])
    : undefined;
}

function buildConversationMessages(
  prompt: string,
  messages?: ModelMessage[],
): ModelMessage[] | undefined {
  if (!messages || messages.length === 0) {
    return undefined;
  }

  return [
    ...messages,
    {
      role: "user",
      content: prompt,
    },
  ];
}

function hasReasoningHistory(messages?: ModelMessage[]): boolean {
  if (!messages || messages.length === 0) {
    return false;
  }

  return messages.some((message) => {
    if (message.role !== "assistant" || typeof message.content === "string") {
      return false;
    }

    return message.content.some((part) => part.type === "reasoning");
  });
}

interface LLMExecutionResult<TResult> {
  payload: TResult;
  provider: string;
  model: string;
  lane: LLMLane;
  tokensIn: number;
  tokensOut: number;
  finishReason?: string;
  responseId?: string;
  responseModel?: string;
  reasoningText?: string;
  responseMessages?: ModelMessage[];
  warningsJson?: unknown;
  providerMetadataJson?: unknown;
}

interface LLMExecutionOutcome<TResult> extends LLMExecutionResult<TResult> {
  latencyMs: number;
}

interface GenerateObjectResponse<T> {
  object: T;
  usage?: unknown;
  finishReason?: unknown;
  response?: unknown;
  reasoning?: unknown;
  reasoningText?: unknown;
  warnings?: unknown;
  providerMetadata?: unknown;
}

function describeReasoningAttempt(attempt: LLMReasoningAttempt): string {
  return attempt.resolvedValue ?? "default";
}

function describeEntry(entry: TaskConfig): string {
  return `${entry.providerName}:${entry.model}`;
}

function buildProviderOptions(
  task: LLMTask,
  entry: TaskConfig,
  attempt: LLMReasoningAttempt,
  hasConversationReasoningHistory = false,
): ProviderReasoningOptions | undefined {
  return mergeProviderOptions(
    getProviderReasoningSummaryOptions(
      entry.providerName,
      getTaskReasoningSummary(task),
      entry.model,
    ),
    attempt.providerOptions,
    getProviderReasoningHistoryOptions(
      entry.providerName,
      hasConversationReasoningHistory,
      entry.model,
    ),
  );
}

async function executeWithReasoningFallback<TResult>(params: {
  chain: TaskConfig[];
  task: LLMTask;
  hasReasoningHistory?: boolean;
  execute: (
    entry: TaskConfig,
    providerOptions?: ProviderReasoningOptions,
  ) => Promise<LLMExecutionResult<TResult>>;
}): Promise<LLMExecutionOutcome<TResult>> {
  let lastError: unknown;
  const reasoningPolicy = getTaskReasoningPolicy(params.task);

  for (const [entryIndex, entry] of params.chain.entries()) {
    const attempts = getProviderReasoningAttempts(entry.providerName, reasoningPolicy, entry.model);

    for (const [attemptIndex, attempt] of attempts.entries()) {
      const start = performance.now();

      try {
        const result = await params.execute(
          entry,
          buildProviderOptions(params.task, entry, attempt, params.hasReasoningHistory ?? false),
        );
        const latencyMs = Math.round(performance.now() - start);

        await logLlmProviderCall({
          provider: result.provider,
          model: result.model,
          responseModel: result.responseModel,
          lane: result.lane,
          task: params.task,
          tokensIn: result.tokensIn,
          tokensOut: result.tokensOut,
          latencyMs,
          costEstimate: estimateLlmCost(
            result.responseModel ?? result.model,
            result.tokensIn,
            result.tokensOut,
          ),
          finishReason: result.finishReason,
          responseId: result.responseId,
          reasoningText: result.reasoningText,
          warningsJson: result.warningsJson,
          providerMetadataJson: result.providerMetadataJson,
        });

        return {
          ...result,
          latencyMs,
        };
      } catch (err) {
        const latencyMs = Math.round(performance.now() - start);
        const errorMessage = err instanceof Error ? err.message : String(err);
        lastError = err;

        await logLlmProviderCall({
          provider: entry.providerName,
          model: entry.model,
          responseModel: entry.model,
          lane: entry.lane,
          task: params.task,
          tokensIn: 0,
          tokensOut: 0,
          latencyMs,
          costEstimate: 0,
          errorMessage,
        });

        const shouldRetryReasoning =
          isReasoningRetryableError(err) && attemptIndex < attempts.length - 1;
        if (shouldRetryReasoning) {
          logger.warn(
            {
              err,
              provider: entry.providerName,
              model: entry.model,
              lane: entry.lane,
              task: params.task,
              reasoningAttempt: describeReasoningAttempt(attempt),
              nextReasoningAttempt: describeReasoningAttempt(attempts[attemptIndex + 1]!),
            },
            "LLM reasoning attempt rejected, retrying with fallback",
          );
          continue;
        }

        if (entryIndex < params.chain.length - 1) {
          logger.warn(
            {
              err,
              failedModel: describeEntry(entry),
              failedLane: entry.lane,
              nextModel: describeEntry(params.chain[entryIndex + 1]!),
              task: params.task,
            },
            "LLM model attempt failed, retrying with backup lane",
          );
          break;
        }

        throw err;
      }
    }
  }

  throw lastError ?? new Error(`All reasoning attempts failed for ${params.task}`);
}

// ── 公开接口 ─────────────────────────────────────────────────

/**
 * 生成结构化 JSON 输出（使用 Zod schema）
 */
export async function llmGenerateObject<T>(params: {
  task: LLMTask;
  schema: ZodSchema<T>;
  schemaName: string;
  prompt: string;
  messages?: ModelMessage[];
  system?: string;
  modelOverride?: string;
  routeOverride?: string;
  lane?: LLMLane;
  allowBackupFallback?: boolean;
  temperature?: number;
  maxTokens?: number;
}): Promise<{
  data: T;
  provider: string;
  model: string;
  lane: LLMLane;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  finishReason?: string;
  responseId?: string;
  reasoningText?: string;
  providerMetadata?: unknown;
}> {
  const chain = getTaskExecutionChain(params.task, {
    lane: params.lane,
    modelOverride: params.modelOverride,
    routePreferenceOverride: params.routeOverride,
    includeBackupFallback: params.allowBackupFallback ?? true,
  });
  const conversationMessages = buildConversationMessages(params.prompt, params.messages);

  const result = await executeWithReasoningFallback({
    task: params.task,
    chain,
    hasReasoningHistory: hasReasoningHistory(params.messages),
    execute: async (entry, providerOptions) => {
      let response: GenerateObjectResponse<T>;

      try {
        response = (await generateObject({
          model: createProviderLanguageModel(entry),
          schema: params.schema,
          schemaName: params.schemaName,
          system: params.system,
          temperature: params.temperature ?? 0.7,
          ...(conversationMessages
            ? { messages: conversationMessages }
            : { prompt: params.prompt }),
          ...(params.maxTokens ? { maxOutputTokens: params.maxTokens } : {}),
          ...(providerOptions ? { providerOptions } : {}),
        })) as GenerateObjectResponse<T>;
      } catch (error) {
        const repairedObject = parseObjectFromProviderErrorText(error, params.schema);
        if (!repairedObject) {
          throw error;
        }

        const usage = resolveUsage(error as { usage?: unknown });

        return {
          payload: repairedObject,
          provider: entry.providerName,
          model: entry.model,
          lane: entry.lane,
          tokensIn: usage.inputTokens,
          tokensOut: usage.outputTokens,
          finishReason: resolveFinishReason(
            error as { finishReason?: unknown; response?: unknown },
          ),
          responseId: resolveResponseId(error as { response?: unknown }),
          responseModel: resolveResponseModel(error as { response?: unknown }, entry.model),
          reasoningText: resolveReasoningText(
            error as { reasoning?: unknown; reasoningText?: unknown },
          ),
          warningsJson: [
            {
              type: "object_text_json_repair",
              sourceError: getString(asRecord(error)?.name) ?? "Error",
            },
          ],
          providerMetadataJson: asRecord(error)?.providerMetadata,
        };
      }

      return {
        payload: response.object,
        provider: entry.providerName,
        model: entry.model,
        lane: entry.lane,
        tokensIn: resolveUsage(response).inputTokens,
        tokensOut: resolveUsage(response).outputTokens,
        finishReason: resolveFinishReason(response),
        responseId: resolveResponseId(response),
        responseModel: resolveResponseModel(response, entry.model),
        reasoningText: resolveReasoningText(response),
        warningsJson: response.warnings,
        providerMetadataJson: response.providerMetadata as JsonRecord | undefined,
      };
    },
  });

  return {
    data: result.payload,
    provider: result.provider,
    model: result.responseModel ?? result.model,
    lane: result.lane,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    latencyMs: result.latencyMs,
    finishReason: result.finishReason,
    responseId: result.responseId,
    reasoningText: result.reasoningText,
    providerMetadata: result.providerMetadataJson,
  };
}

/**
 * 生成自由文本（非结构化）
 */
export async function llmGenerateText(params: {
  task: LLMTask;
  prompt: string;
  messages?: ModelMessage[];
  system?: string;
  modelOverride?: string;
  routeOverride?: string;
  lane?: LLMLane;
  allowBackupFallback?: boolean;
  temperature?: number;
  maxTokens?: number;
}): Promise<{
  text: string;
  provider: string;
  model: string;
  lane: LLMLane;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  finishReason?: string;
  responseId?: string;
  reasoningText?: string;
  providerMetadata?: unknown;
  responseMessages?: ModelMessage[];
}> {
  const chain = getTaskExecutionChain(params.task, {
    lane: params.lane,
    modelOverride: params.modelOverride,
    routePreferenceOverride: params.routeOverride,
    includeBackupFallback: params.allowBackupFallback ?? true,
  });
  const conversationMessages = buildConversationMessages(params.prompt, params.messages);

  const result = await executeWithReasoningFallback({
    task: params.task,
    chain,
    hasReasoningHistory: hasReasoningHistory(params.messages),
    execute: async (entry, providerOptions) => {
      const response = await generateText({
        model: createProviderLanguageModel(entry),
        system: params.system,
        temperature: params.temperature ?? 0.7,
        ...(conversationMessages ? { messages: conversationMessages } : { prompt: params.prompt }),
        ...(params.maxTokens ? { maxOutputTokens: params.maxTokens } : {}),
        ...(providerOptions ? { providerOptions } : {}),
      });

      return {
        payload: response.text,
        provider: entry.providerName,
        model: entry.model,
        lane: entry.lane,
        tokensIn: response.usage?.inputTokens ?? 0,
        tokensOut: response.usage?.outputTokens ?? 0,
        finishReason: resolveFinishReason(response),
        responseId: resolveResponseId(response),
        responseModel: resolveResponseModel(response, entry.model),
        reasoningText: resolveReasoningText(response),
        responseMessages: resolveResponseMessages(response),
        warningsJson: response.warnings,
        providerMetadataJson: response.providerMetadata as JsonRecord | undefined,
      };
    },
  });

  return {
    text: result.payload,
    provider: result.provider,
    model: result.responseModel ?? result.model,
    lane: result.lane,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    latencyMs: result.latencyMs,
    finishReason: result.finishReason,
    responseId: result.responseId,
    reasoningText: result.reasoningText,
    providerMetadata: result.providerMetadataJson,
    ...(result.responseMessages ? { responseMessages: result.responseMessages } : {}),
  };
}
