import assert from "node:assert/strict";
import type { ModelMessage } from "ai";

import { callScriptSceneWithContinuation } from "../lib/scriptConversation.js";

{
  const calls: Array<{ prompt: string; messages?: ModelMessage[] }> = [];

  const result = await callScriptSceneWithContinuation({
    initialPrompt: "initial prompt",
    maxContinuationTurns: 1,
    call: async ({ prompt, messages }) => {
      calls.push({ prompt, messages });

      if (calls.length === 1) {
        return {
          providerName: "alibaba",
          model: "qwen3.6-plus",
          text: '{"questions":[',
          inputTokens: 10,
          outputTokens: 5,
          responseMessages: [
            {
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: '{"questions":[',
                },
                {
                  type: "reasoning",
                  text: "first scratchpad",
                },
              ],
            },
          ],
        };
      }

      return {
        providerName: "alibaba",
        model: "qwen3.6-plus",
        text: '{"questions":[]}',
        inputTokens: 12,
        outputTokens: 8,
      };
    },
    parse: (text) => JSON.parse(text) as { questions: unknown[] },
    buildContinuationPrompt: ({ error }) => `fix json: ${String(error)}`,
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.prompt, "initial prompt");
  assert.deepEqual(calls[0]?.messages, undefined);
  assert.equal(calls[1]?.prompt, "fix json: SyntaxError: Unexpected end of JSON input");
  assert.deepEqual(calls[1]?.messages, [
    {
      role: "user",
      content: "initial prompt",
    },
    {
      role: "assistant",
      content: [
        {
          type: "text",
          text: '{"questions":[',
        },
        {
          type: "reasoning",
          text: "first scratchpad",
        },
      ],
    },
  ]);
  assert.deepEqual(result.parsed, { questions: [] });
}

{
  let attempts = 0;

  await assert.rejects(
    () =>
      callScriptSceneWithContinuation({
        initialPrompt: "initial prompt",
        maxContinuationTurns: 1,
        call: async () => {
          attempts += 1;

          return {
            providerName: "alibaba",
            model: "qwen3.6-plus",
            text: '{"questions":[',
            inputTokens: 10,
            outputTokens: 5,
          };
        },
        parse: (text) => JSON.parse(text) as { questions: unknown[] },
        buildContinuationPrompt: ({ error }) => `fix json: ${String(error)}`,
      }),
    /Unexpected end of JSON input/,
  );

  assert.equal(attempts, 1);
}

{
  const calls: Array<{ prompt: string; messages?: ModelMessage[] }> = [];

  const result = await callScriptSceneWithContinuation({
    initialPrompt: "initial prompt",
    maxContinuationTurns: 1,
    call: async ({ prompt, messages }) => {
      calls.push({ prompt, messages });

      if (calls.length === 1) {
        return {
          providerName: "alibaba",
          model: "qwen3.6-plus",
          text: '{"questions":[{"explanation":"bad"}]}',
          inputTokens: 10,
          outputTokens: 5,
          responseMessages: [
            {
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: '{"questions":[{"explanation":"bad"}]}',
                },
                {
                  type: "reasoning",
                  text: "validation scratchpad",
                },
              ],
            },
          ],
        };
      }

      return {
        providerName: "alibaba",
        model: "qwen3.6-plus",
        text: '{"questions":[{"explanation":"good"}]}',
        inputTokens: 12,
        outputTokens: 8,
      };
    },
    parse: (text) => {
      const parsed = JSON.parse(text) as { questions: Array<{ explanation: string }> };
      if (parsed.questions[0]?.explanation === "bad") {
        throw new Error("content invalid: explanation too weak");
      }
      return parsed;
    },
    buildContinuationPrompt: ({ error }) => `fix content: ${String(error)}`,
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[1]?.prompt, "fix content: Error: content invalid: explanation too weak");
  assert.deepEqual(calls[1]?.messages, [
    {
      role: "user",
      content: "initial prompt",
    },
    {
      role: "assistant",
      content: [
        {
          type: "text",
          text: '{"questions":[{"explanation":"bad"}]}',
        },
        {
          type: "reasoning",
          text: "validation scratchpad",
        },
      ],
    },
  ]);
  assert.deepEqual(result.parsed, {
    questions: [{ explanation: "good" }],
  });
}

console.log("scriptConversation: ok");
