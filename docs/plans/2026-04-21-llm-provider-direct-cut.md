# LLM Provider Direct Cut Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current AI Gateway-first LLM stack with provider-direct configuration and calls while keeping shared reasoning controls, default/backup fallback, and observability.

**Architecture:** Keep two execution lanes, but change them from model identifiers to provider identifiers via `LLM_PROVIDER_DEFAULT` and `LLM_PROVIDER_BACKUP`. Each provider owns its own `API_KEY`, `BASE_URL`, and `MODEL`, and `config/llm.ts` becomes the single place that resolves provider configs, builds direct SDK models, and applies shared reasoning effort/summary options without any Gateway routing layer.

**Tech Stack:** TypeScript, Vercel AI SDK 6, direct provider adapters, Drizzle, Vitest, tsx script tests.

---

### Task 1: Rewrite tests for provider-direct config

**Files:**
- Modify: `server/__tests__/llm-config.test.ts`
- Modify: `server/__tests__/llm-service.test.ts`
- Modify: `scripts/tests/scriptLlmClient.test.ts`
- Modify: `scripts/tests/rewriteLlmClient.test.ts`

Update env/test fixtures to remove Gateway fields, switch to `LLM_PROVIDER_DEFAULT` / `LLM_PROVIDER_BACKUP`, add per-provider `*_BASE_URL` and `*_MODEL`, and remove `deepseek` / `zai` expectations from active direct-call paths.

### Task 2: Refactor config to provider-direct resolution

**Files:**
- Modify: `config/env.ts`
- Modify: `config/llm.ts`

Remove `AI_GATEWAY_*` and all `LLM_GATEWAY_*` env schema entries. Add lane provider envs plus per-provider `API_KEY` / `BASE_URL` / `MODEL`. Replace Gateway-specific route parsing with provider-direct resolution and direct model construction helpers.

### Task 3: Switch server and script callers off Gateway

**Files:**
- Modify: `server/services/llm/index.ts`
- Modify: `scripts/lib/scriptLlmClient.ts`

Update runtime execution to call provider-direct models, keep shared reasoning summary/effort merging, and preserve default-to-backup retry behavior and richer response metadata.

### Task 4: Remove unsupported providers from active config surface

**Files:**
- Modify: `config/env.ts`
- Modify: `config/llm.ts`
- Modify: `.env`
- Modify: `.env.example`
- Modify: `scripts/lib/rewriteLlmClient.ts`

Drop `deepseek` and `zai` from the active provider-direct configuration surface per request, while keeping standard vendor naming for the remaining supported providers.

### Task 5: Docs and focused verification

**Files:**
- Modify: `scripts/README.md`
- Modify: `plan/reference-config.md`
- Modify: `plan/reference-paper-audit.md`

Update examples to provider-direct env/config usage and run focused LLM verification commands after implementation.
