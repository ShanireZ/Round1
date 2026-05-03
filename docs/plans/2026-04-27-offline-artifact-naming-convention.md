# Offline Artifact Naming Convention Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为离线 question bundle、prebuilt paper bundle、探针/临时产物建立可长期追溯、不可覆盖、可脚本解析的持久化目录与文件命名规范。

**Architecture:** 所有可导入内容资产使用同一个 `runId` 组织目录，`papers/` 保存 question bundle，`artifacts/` 保存预制卷 bundle、报告和非导入临时产物。文件名必须包含内容类型、考试类型、难度、题型/知识点或蓝图版本、数量和递增版本号，禁止使用会被覆盖的通用名。

**Tech Stack:** Node/TypeScript CLI scripts, JSON bundle schemas, PostgreSQL import audit, PowerShell runbooks.

---

## Implementation Status

- [x] Task 1 path helpers and lightweight tests are implemented in `scripts/lib/paperPaths.ts` and `scripts/tests/offlineArtifactPaths.test.ts`.
- [x] Task 2 CLI defaults and help text are implemented for `generateQuestionBundle.ts`, `buildAcceptanceQuestionBundle.ts`, and `buildPrebuiltPaperBundle.ts`; `--output` remains an explicit override.
- [x] Task 3 current artifact migration is complete for the local ignored runtime assets present in this worktree.
- [x] Task 4 guardrails are implemented in `scripts/verifyOfflineArtifactNames.ts` and exposed as `npm run verify:offline-artifacts`; the guard now rejects all `papers/<year>/*.json` question bundle files and validates formal bundle JSON meta against the runId filename.

---

## Current Finding

- 原有弱规范：
  - `scripts/lib/paperPaths.ts` 曾默认 question bundle 输出为 `papers/<year>/YYYY-MM-DD-<questionType>-<count>.json`。
  - `docs/plans/2026-04-24-offline-content-prebuilt-papers-design.md` 曾允许 prebuilt paper bundle 使用 `paper-packs.json`。
  - `plan/reference-ops.md` 的 runbook 曾示例为 `artifacts/prebuilt-papers/paper-packs.json`。
- 已修复问题：
  - `generateQuestionBundle.ts`、`buildAcceptanceQuestionBundle.ts`、`buildPrebuiltPaperBundle.ts` 的默认输出已改为 runId 持久化路径；`--output` 仅保留为显式覆盖。
- 2026-04-27 复核修复：
  - `papers/2026/step3-llm-2026-04-27/2026-04-27-*.json` 已迁移到 `papers/2026/2026-04-27-step3-llm-csp-j-medium-v01/question-bundles/`。
  - `artifacts/prebuilt-papers/step3-llm-cspj-medium-paper-packs.json` 已迁移到 `artifacts/prebuilt-papers/2026/2026-04-27-step3-llm-csp-j-medium-v01/`。
  - `artifacts/llm-step3/probe*.json` 已迁移到 `artifacts/tmp/2026/2026-04-27-step3-llm-csp-j-medium-v01/`。
  - 迁移时补齐 bundle/probe meta 的 `schemaVersion`、`runId`、`createdAt` 字段；2026-04-27 追加复核已把 formal bundle 的 `createdAt` 统一为 ISO datetime，并让 `verifyOfflineArtifactNames.ts` 校验 schema 与文件名一致，防止路径合规但 JSON contract 漂移。

## Persistent Naming Convention

### Shared Rules

- 使用 ASCII 小写 kebab-case；唯一例外是 schema 内部枚举值仍保持现有值，例如 `CSP-J`、`single_choice`。
- 每次内容生产运行必须有稳定 `runId`：
  - 格式：`YYYY-MM-DD-<pipeline>-<exam-type-slug>-<difficulty>-vNN`
  - 示例：`2026-04-27-step3-llm-csp-j-medium-v01`
- `runId` 一经生成不可复用；同一天同一 pipeline 重新跑批时递增 `vNN`。
- 可导入 JSON 文件名必须包含：
  - `runId`
  - bundle 类型：`question-bundle` 或 `prebuilt-paper-bundle`
  - 关键维度：题型/知识点或蓝图版本
  - 数量：`n<count>`
  - 文件版本：`vNN`
- `latest.json`、`paper-packs.json`、`probe3-single.json` 这类无 runId 的名称只允许作为本地临时 alias，禁止进入可导入/可审计资产目录。

### Question Bundle Layout

正式 question bundle 放在：

```text
papers/<year>/<runId>/question-bundles/
```

文件名：

```text
<runId>__question-bundle__<question-type>__<kp-code>__n<count>__vNN.json
```

示例：

```text
papers/2026/2026-04-27-step3-llm-csp-j-medium-v01/question-bundles/
  2026-04-27-step3-llm-csp-j-medium-v01__question-bundle__single-choice__bas__n12__v01.json
  2026-04-27-step3-llm-csp-j-medium-v01__question-bundle__reading-program__cpp__n10__v01.json
```

### Prebuilt Paper Bundle Layout

正式 prebuilt paper bundle 放在：

```text
artifacts/prebuilt-papers/<year>/<runId>/
```

文件名：

```text
<runId>__prebuilt-paper-bundle__blueprint-v<blueprintVersion>__n<count>__vNN.json
```

示例：

```text
artifacts/prebuilt-papers/2026/2026-04-27-step3-llm-csp-j-medium-v01/
  2026-04-27-step3-llm-csp-j-medium-v01__prebuilt-paper-bundle__blueprint-v1__n1__v01.json
```

### Reports And Temporary Artifacts

非导入产物必须与正式 bundle 分开：

```text
artifacts/reports/<year>/runs/<runId>/
artifacts/tmp/<year>/<runId>/
```

规则：

- LLM probe、草稿输出、调试 JSON 放 `artifacts/tmp/<year>/<runId>/`。
- 校验摘要、二次 judge 摘要、导入记录导出放 `artifacts/reports/<year>/runs/<runId>/`。
- `artifacts/tmp/**` 可清理；`papers/**`、`artifacts/prebuilt-papers/**`、`artifacts/reports/**` 作为审计输入保留。

## Task 1: Update Path Helpers

**Files:**

- Modify: `scripts/lib/paperPaths.ts`
- Test: `scripts/tests` 或新增轻量 path helper 单测

**Step 1: Add failing tests for runId naming**

Verify helpers generate:

```text
papers/2026/2026-04-27-step3-llm-csp-j-medium-v01/question-bundles/2026-04-27-step3-llm-csp-j-medium-v01__question-bundle__single-choice__bas__n12__v01.json
artifacts/prebuilt-papers/2026/2026-04-27-step3-llm-csp-j-medium-v01/2026-04-27-step3-llm-csp-j-medium-v01__prebuilt-paper-bundle__blueprint-v1__n1__v01.json
```

**Step 2: Implement helpers**

Add helpers for:

- `formatOfflineRunId(date, pipeline, examType, difficulty, versionNo)`
- `defaultQuestionBundleOutputPath({ runId, questionType, kpCode, count, versionNo })`
- `defaultPrebuiltPaperBundleOutputPath({ runId, blueprintVersion, count, versionNo })`
- `defaultOfflineReportPath({ runId, reportName })`
- `defaultOfflineTmpPath({ runId, artifactName })`

**Step 3: Run tests**

Run:

```bash
npm run test -- scripts/tests
```

Expected: path helper tests pass.

## Task 2: Update CLI Defaults And Help Text

**Files:**

- Modify: `scripts/generateQuestionBundle.ts`
- Modify: `scripts/buildAcceptanceQuestionBundle.ts`
- Modify: `scripts/buildPrebuiltPaperBundle.ts`
- Modify: `scripts/README.md`
- Modify: `plan/reference-ops.md`

**Step 1: Add optional naming inputs**

Support optional:

- `--run-id`
- `--artifact-version`
- `--blueprint-version` for prebuilt output naming if not already derived

Keep `--output` as an escape hatch, but help text must call it an explicit override.

**Step 2: Replace generic defaults**

Update defaults away from the legacy forms:

```text
papers/<year>/YYYY-MM-DD-<questionType>-<count>.json
artifacts/prebuilt-papers/paper-packs.json
```

to the persistent layout above.

**Step 3: Run CLI help checks**

Run:

```bash
npx tsx scripts/generateQuestionBundle.ts --help
npx tsx scripts/buildPrebuiltPaperBundle.ts --help
```

Expected: help text documents runId and persistent output paths.

## Task 3: Migrate Current Step3 Artifacts

**Status (2026-04-27): completed for current local assets.**

**Files:**

- Moved: `papers/2026/step3-llm-2026-04-27/*.json`
- Moved: `artifacts/prebuilt-papers/step3-llm-cspj-medium-paper-packs.json`
- Moved: `artifacts/llm-step3/probe*.json`

**Step 1: Create target directories**

Use runId:

```text
2026-04-27-step3-llm-csp-j-medium-v01
```

Create:

```text
papers/2026/2026-04-27-step3-llm-csp-j-medium-v01/question-bundles/
artifacts/prebuilt-papers/2026/2026-04-27-step3-llm-csp-j-medium-v01/
artifacts/tmp/2026/2026-04-27-step3-llm-csp-j-medium-v01/
```

**Step 2: Rename question bundles**

Map existing files into the new format, for example:

```text
2026-04-27-single_choice-BAS-12.json
→ 2026-04-27-step3-llm-csp-j-medium-v01__question-bundle__single-choice__bas__n12__v01.json
```

**Step 3: Rename prebuilt bundle**

```text
artifacts/prebuilt-papers/step3-llm-cspj-medium-paper-packs.json
→ artifacts/prebuilt-papers/2026/2026-04-27-step3-llm-csp-j-medium-v01/2026-04-27-step3-llm-csp-j-medium-v01__prebuilt-paper-bundle__blueprint-v1__n1__v01.json
```

**Step 4: Move probes to tmp**

```text
artifacts/llm-step3/probe*.json
→ artifacts/tmp/2026/2026-04-27-step3-llm-csp-j-medium-v01/
```

**Step 5: Re-run validation using new paths**

Run:

```bash
npx tsx scripts/validate-import-artifacts.ts <new-question-bundle-path> --skip-duplicate-checks
npx tsx scripts/validatePrebuiltPaperBundle.ts <new-prebuilt-bundle-path>
```

Expected: validators pass with the renamed paths.

## Task 4: Add Guardrails

**Files:**

- Create: `scripts/verifyOfflineArtifactNames.ts`
- Modify: `scripts/README.md`

**Step 1: Validate filename schema**

The guard should reject:

- `artifacts/prebuilt-papers/paper-packs.json`
- `artifacts/llm-step3/probe3-single.json`
- all question bundle files directly under `papers/<year>/`; historical evidence should remain in docs/plans records, not as current persistent import assets

**Step 2: Run guard in local checks**

Run:

```bash
npx tsx scripts/verifyOfflineArtifactNames.ts
```

Expected: no new nonconforming persistent artifacts.
