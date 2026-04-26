# LLM Gateway Official Provider Cut Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Hard-cut the LLM stack to official Vercel AI Gateway provider slugs and env names, and add reasoning summary, gateway ordering/sort/timeouts, and richer LLM observability.

**Architecture:** Keep the existing two-lane Gateway-first model design, but replace legacy provider aliases with official Gateway slugs and enrich the config layer so routing and observability stay centralized in `config/llm.ts`. Surface richer model metadata from AI SDK results and persist key runtime fields in `llm_provider_logs`.

**Tech Stack:** TypeScript, Vercel AI SDK 6, AI Gateway provider options, Drizzle schema/migrations, Vitest, tsx test scripts.

---

### Task 1: Update failing tests first

**Files:**
- Modify: `server/__tests__/llm-config.test.ts`
- Modify: `server/__tests__/llm-service.test.ts`
- Modify: `scripts/tests/scriptLlmClient.test.ts`
- Modify: `scripts/tests/rewriteLlmClient.test.ts`

Add expectations for official provider env names (`ALIBABA_API_KEY`, `ZAI_API_KEY`, `MOONSHOTAI_API_KEY`, `GOOGLE_API_KEY`), reasoning summary options, gateway provider ordering/sort/timeouts, and richer LLM result/log metadata.

### Task 2: Hard-cut provider/env naming

**Files:**
- Modify: `config/env.ts`
- Modify: `config/llm.ts`
- Modify: `scripts/lib/rewriteLlmClient.ts`
- Modify: `.env.example`
- Modify: `.env`

Replace legacy provider aliases and old env names with the official Gateway provider naming set, and remove legacy aliases from active code paths.

### Task 3: Add Gateway routing and reasoning summary support

**Files:**
- Modify: `config/env.ts`
- Modify: `config/llm.ts`
- Modify: `server/services/llm/index.ts`
- Modify: `scripts/lib/scriptLlmClient.ts`

Add lane-scoped gateway `order`, `only`, `sort`, and `providerTimeouts` config plus a global `LLM_REASONING_SUMMARY_DEFAULT`, then merge them into Gateway provider options for both server and script callers.

### Task 4: Expand observability fields

**Files:**
- Modify: `server/db/schema/llmProviderLogs.ts`
- Add: `server/db/migrations/006_llm_provider_log_observability.ts`
- Modify: `server/services/llm/index.ts`

Persist richer metadata such as lane, response model/id, finish reason, warnings, provider metadata, and summarized reasoning text while also returning richer response metadata from public LLM helpers.

### Task 5: Documentation and verification

**Files:**
- Modify: `scripts/README.md`

Update script route examples to official slugs and run targeted compile/test verification for config, server, scripts, Vitest LLM tests, and script test harnesses.