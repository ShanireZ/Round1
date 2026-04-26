# LLM Reasoning Capabilities Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make reasoning controls model-aware, keep effort-like ladders under LLM_REASONING_DEFAULT, and add dedicated config for thinking mode and thinking budget models.

**Architecture:** The central change stays in config/llm.ts. Provider-only branching is replaced with provider-plus-model capability checks so the runtime can emit effort controls, thinking mode controls, or thinking budget controls based on the active model path. Server and script callers keep the same fallback loop, but consume richer attempt metadata.

**Tech Stack:** TypeScript, zod env validation, Vercel AI SDK 6, Vitest, tsx script tests.

---

### Task 1: Write failing reasoning capability tests

**Files:**
- Modify: server/__tests__/llm-config.test.ts

Add tests that prove the same provider can yield different reasoning options by model, cover xAI effort support, DeepSeek/ZAI thinking mode support, and Gemini 2.5 thinking budget support.

### Task 2: Implement model-aware reasoning and non-effort controls

**Files:**
- Modify: config/env.ts
- Modify: config/llm.ts
- Modify: server/services/llm/index.ts
- Modify: scripts/lib/scriptLlmClient.ts

Add env schema for the new thinking controls, compute reasoning attempts from provider plus model, and merge the new options into the existing retry loop.

### Task 3: Update env templates and docs

**Files:**
- Modify: .env.example
- Modify: .env
- Modify: scripts/README.md

Document the new config surface and explain which controls apply to which provider/model families.

### Task 4: Focused verification

**Files:**
- Modify: server/__tests__/llm-config.test.ts
- Modify: scripts/tests/scriptLlmClient.test.ts

Run the focused config and script validations for the touched reasoning surface.
