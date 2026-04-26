import { db } from "../../db.js";
import { llmProviderLogs } from "../../db/schema/llmProviderLogs.js";
import { logger } from "../../logger.js";

const COST_PER_MILLION: Record<string, { input: number; output: number }> = {
  "deepseek-chat": { input: 0.14, output: 0.28 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "claude-sonnet-4-20250514": { input: 3, output: 15 },
  "claude-3-5-haiku-20241022": { input: 0.8, output: 4 },
  "gemini-2.5-flash-preview-05-20": { input: 0.15, output: 0.6 },
  "qwen-plus": { input: 0.8, output: 2 },
  "glm-4-flash": { input: 0.1, output: 0.1 },
};

export function estimateLlmCost(model: string, tokensIn: number, tokensOut: number): number {
  const rate = COST_PER_MILLION[model];
  if (!rate) {
    return 0;
  }

  return (tokensIn * rate.input + tokensOut * rate.output) / 1_000_000;
}

export async function logLlmProviderCall(params: {
  provider: string;
  model: string;
  responseModel?: string;
  lane: string;
  task: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  costEstimate: number;
  finishReason?: string;
  responseId?: string;
  reasoningText?: string;
  warningsJson?: unknown;
  providerMetadataJson?: unknown;
  errorMessage?: string;
}) {
  try {
    await db.insert(llmProviderLogs).values({
      provider: params.provider,
      model: params.model,
      responseModel: params.responseModel,
      lane: params.lane,
      task: params.task,
      tokensIn: params.tokensIn,
      tokensOut: params.tokensOut,
      costEstimate: params.costEstimate,
      latencyMs: params.latencyMs,
      finishReason: params.finishReason,
      responseId: params.responseId,
      reasoningText: params.reasoningText,
      warningsJson: params.warningsJson,
      providerMetadataJson: params.providerMetadataJson,
      errorMessage: params.errorMessage,
    });
  } catch (err) {
    logger.error({ err }, "Failed to log LLM call");
  }
}
