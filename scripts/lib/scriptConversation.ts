import type { ModelMessage } from "ai";

import type { CallScriptLlmSceneResult } from "./scriptLlmClient.js";

export class ScriptSceneContinuationError extends Error {
  readonly result: CallScriptLlmSceneResult;

  constructor(message: string, result: CallScriptLlmSceneResult, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ScriptSceneContinuationError";
    this.result = result;
  }
}
export function appendConversationTurn(
  messages: ModelMessage[] | undefined,
  prompt: string,
  responseMessages?: ModelMessage[],
): ModelMessage[] {
  return [
    ...(messages ?? []),
    {
      role: "user",
      content: prompt,
    },
    ...(responseMessages ?? []),
  ];
}

export async function callScriptSceneWithContinuation<T>(params: {
  initialPrompt: string;
  call: (params: {
    prompt: string;
    messages?: ModelMessage[];
  }) => Promise<CallScriptLlmSceneResult>;
  parse: (text: string, result: CallScriptLlmSceneResult) => T;
  buildContinuationPrompt: (params: {
    error: unknown;
    attempt: number;
    result: CallScriptLlmSceneResult;
  }) => string;
  maxContinuationTurns?: number;
}): Promise<{
  result: CallScriptLlmSceneResult;
  parsed: T;
}> {
  let prompt = params.initialPrompt;
  let messages: ModelMessage[] | undefined;
  const maxContinuationTurns = params.maxContinuationTurns ?? 1;

  for (let attempt = 0; ; attempt += 1) {
    const result = await params.call({ prompt, messages });

    try {
      return {
        result,
        parsed: params.parse(result.text, result),
      };
    } catch (error) {
      if (attempt >= maxContinuationTurns || !result.responseMessages?.length) {
        const message = error instanceof Error ? error.message : String(error);
        throw new ScriptSceneContinuationError(message, result, { cause: error });
      }

      messages = appendConversationTurn(messages, prompt, result.responseMessages);
      prompt = params.buildContinuationPrompt({
        error,
        attempt: attempt + 1,
        result,
      });
    }
  }
}
