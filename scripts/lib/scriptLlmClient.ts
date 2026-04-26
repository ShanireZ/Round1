import { generateText, type ModelMessage } from "ai";

import { env } from "../../config/env.js";
import {
  createProviderLanguageModel,
  getProviderReasoningHistoryOptions,
  getProviderReasoningAttempts,
  getProviderReasoningSummaryOptions,
  getSceneExecutionChain,
  getSceneReasoningPolicy,
  getSceneReasoningSummary,
  isReasoningRetryableError,
  mergeProviderOptions,
  parseReasoningPolicy,
  type LLMDirectRuntimeEnv,
  type LLMReasoningPolicy,
  type LLMLane,
  type LLMScene,
  type ProviderReasoningOptions,
  type TaskConfig,
} from "../../config/llm.js";
import { estimateLlmCost, logLlmProviderCall } from "../../server/services/llm/providerLog.js";

type ScriptRuntimeEnv = LLMDirectRuntimeEnv;

export interface ScriptProviderConfig extends TaskConfig {
  reasoningPolicy: LLMReasoningPolicy;
}

export interface CallScriptLlmSceneParams {
  scene: LLMScene;
  system: string;
  prompt: string;
  messages?: ModelMessage[];
  maxTokens: number;
  timeoutMs: number;
  routeOverride?: string;
  modelOverride?: string;
  reasoningPolicyOverride?: string | readonly string[];
  lane?: LLMLane;
  allowBackupFallback?: boolean;
  runtimeEnv?: ScriptRuntimeEnv;
  fetchImpl?: typeof fetch;
}

export interface CallScriptLlmSceneResult {
  providerName: ScriptProviderConfig["providerName"];
  model: string;
  text: string;
  inputTokens: number;
  outputTokens: number;
  finishReason?: string;
  responseId?: string;
  reasoningText?: string;
  providerMetadata?: unknown;
  responseMessages?: ModelMessage[];
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | undefined {
  return typeof value === "object" && value !== null ? (value as JsonRecord) : undefined;
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
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

function buildSceneProviderOptions(
  scene: LLMScene,
  provider: ScriptProviderConfig,
  runtimeEnv: ScriptRuntimeEnv,
  hasConversationReasoningHistory: boolean,
  attemptProviderOptions?: ProviderReasoningOptions,
): ProviderReasoningOptions | undefined {
  return mergeProviderOptions(
    getProviderReasoningSummaryOptions(
      provider.providerName,
      getSceneReasoningSummary(scene, runtimeEnv),
      provider.model,
    ),
    attemptProviderOptions,
    getProviderReasoningHistoryOptions(
      provider.providerName,
      hasConversationReasoningHistory,
      provider.model,
      runtimeEnv,
    ),
  );
}

export function resolveScriptProviderChain(
  scene: LLMScene,
  options: {
    routeOverride?: string;
    modelOverride?: string;
    reasoningPolicyOverride?: string | readonly string[];
    lane?: LLMLane;
    allowBackupFallback?: boolean;
    runtimeEnv?: ScriptRuntimeEnv;
  } = {},
): ScriptProviderConfig[] {
  const runtimeEnv = options.runtimeEnv ?? env;
  const reasoningPolicy = options.reasoningPolicyOverride
    ? typeof options.reasoningPolicyOverride === "string"
      ? parseReasoningPolicy(options.reasoningPolicyOverride)
      : parseReasoningPolicy(options.reasoningPolicyOverride.join(">"))
    : getSceneReasoningPolicy(scene, runtimeEnv);
  const providerOrder = getSceneExecutionChain(
    scene,
    {
      lane: options.lane,
      routePreferenceOverride: options.routeOverride,
      modelOverride: options.modelOverride,
      includeBackupFallback: options.allowBackupFallback ?? true,
    },
    runtimeEnv,
  );

  return providerOrder.map((entry) => ({
    ...entry,
    reasoningPolicy,
  }));
}

export async function callScriptLlmScene(
  params: CallScriptLlmSceneParams,
): Promise<CallScriptLlmSceneResult> {
  const runtimeEnv = params.runtimeEnv ?? env;
  const conversationMessages = buildConversationMessages(params.prompt, params.messages);
  const conversationHasReasoningHistory = hasReasoningHistory(params.messages);
  const chain = resolveScriptProviderChain(params.scene, {
    routeOverride: params.routeOverride,
    modelOverride: params.modelOverride,
    reasoningPolicyOverride: params.reasoningPolicyOverride,
    lane: params.lane,
    allowBackupFallback: params.allowBackupFallback,
    runtimeEnv,
  });
  const errors: string[] = [];

  for (const provider of chain) {
    const reasoningAttempts = getProviderReasoningAttempts(
      provider.providerName,
      provider.reasoningPolicy,
      provider.model,
      runtimeEnv,
    );

    for (const [attemptIndex, attempt] of reasoningAttempts.entries()) {
      const start = performance.now();

      try {
        const providerOptions = buildSceneProviderOptions(
          params.scene,
          provider,
          runtimeEnv,
          conversationHasReasoningHistory,
          attempt.providerOptions,
        );
        const response = await generateText({
          model: createProviderLanguageModel(provider, {
            runtimeEnv,
            fetch: params.fetchImpl,
          }),
          system: params.system,
          ...(conversationMessages
            ? { messages: conversationMessages }
            : { prompt: params.prompt }),
          maxOutputTokens: params.maxTokens,
          timeout: params.timeoutMs,
          ...(providerOptions ? { providerOptions } : {}),
        });

        const inputTokens = response.usage?.inputTokens ?? 0;
        const outputTokens = response.usage?.outputTokens ?? 0;
        const responseModel = resolveResponseModel(response, provider.model);

        await logLlmProviderCall({
          provider: provider.providerName,
          model: provider.model,
          responseModel,
          lane: provider.lane,
          task: params.scene,
          tokensIn: inputTokens,
          tokensOut: outputTokens,
          latencyMs: Math.round(performance.now() - start),
          costEstimate: estimateLlmCost(responseModel, inputTokens, outputTokens),
          finishReason: resolveFinishReason(response),
          responseId: resolveResponseId(response),
          reasoningText: response.reasoningText,
          warningsJson: response.warnings,
          providerMetadataJson: response.providerMetadata,
        });

        return {
          providerName: provider.providerName,
          model: responseModel,
          text: response.text,
          inputTokens,
          outputTokens,
          finishReason: resolveFinishReason(response),
          responseId: resolveResponseId(response),
          reasoningText: response.reasoningText,
          providerMetadata: response.providerMetadata,
          responseMessages: resolveResponseMessages(response),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const shouldRetry =
          isReasoningRetryableError(error) && attemptIndex < reasoningAttempts.length - 1;

        await logLlmProviderCall({
          provider: provider.providerName,
          model: provider.model,
          responseModel: provider.model,
          lane: provider.lane,
          task: params.scene,
          tokensIn: 0,
          tokensOut: 0,
          latencyMs: Math.round(performance.now() - start),
          costEstimate: 0,
          errorMessage: message,
        });

        if (shouldRetry) {
          errors.push(
            `${provider.providerName}:${provider.model}:${attempt.resolvedValue ?? "default"}: ${message}`,
          );
          continue;
        }

        errors.push(`${provider.providerName}:${provider.model}: ${message}`);
        break;
      }
    }
  }

  throw new Error(`All providers failed for ${params.scene}: ${errors.join(" | ")}`);
}
