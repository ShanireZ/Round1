# Offline Bundle Scripts Task List

## Goal

把 question bundle / prebuilt paper bundle 的离线链路拆成可执行任务，后续可以直接按任务顺序实现、验证和串联到 Admin 导入中心。

## Status Snapshot (2026-04-26)

- Track 1 / Track 2 的 shared bundle contract 与 6 个 CLI entrypoint 已落地，当前不再是“从零开始设计 bundle 脚本”的阶段。
- Track 3.1 ~ 3.3 的 Admin import API / UI 最小 slice 已落地；旧 `/admin/jobs` 与 `/admin/manual-gen` 前端兼容入口已删除，旧路径进入 404 fallback。
- 2026-04-26 追加收口：bundle 元数据已补 `sourceBatchId/sourceBatchIds`、validator 校验元数据与 item checksum manifest；`buildPrebuiltPaperBundle` 会写入 provider/model/prompt hash/source timestamp/overlap score；已增加 `generate-offline-questions.ts`、`build-paper-packs.ts`、`validate-import-artifacts.ts` 三个运营薄封装入口。

> 本文现阶段更适合作为“剩余缺口跟踪表”使用；凡与当前仓库已落地实现冲突之处，以 `scripts/lib/bundleTypes.ts`、`server/routes/admin.ts`、`client/src/pages/admin/AdminImports.tsx` 和相关测试为准。

## Step Alignment

- Step 03 / Phase 8：`bundleTypes.ts`、`generateQuestionBundle.ts`、`validateQuestionBundle.ts`、`importQuestionBundle.ts`
- Step 03 / Phase 10：`buildPrebuiltPaperBundle.ts`、`validatePrebuiltPaperBundle.ts`、`importPrebuiltPaperBundle.ts`
- Step 05 / Phase 13.4：Admin import API / UI 复用同一 import summary shape，展示 dry-run 与 apply 结果

## Naming Alignment

- 仓库内部实现名继续使用 `generateQuestionBundle.ts` / `buildPrebuiltPaperBundle.ts` / `validatePrebuiltPaperBundle.ts`
- 持久化内容产物采用 `runId` 组织，格式为 `YYYY-MM-DD-<pipeline>-<exam-type-slug>-<difficulty>-vNN`，例如 `2026-04-27-step3-llm-csp-j-medium-v01`
- question bundle 标准产物统一放入 `papers/<year>/<runId>/question-bundles/<runId>__question-bundle__<question-type>__<kp-code>__n<count>__vNN.json`
- prebuilt paper bundle 标准产物统一放入 `artifacts/prebuilt-papers/<year>/<runId>/<runId>__prebuilt-paper-bundle__blueprint-v<blueprintVersion>__n<count>__vNN.json`
- LLM probe、草稿输出、调试 JSON 等非导入产物必须放入 `artifacts/tmp/<year>/<runId>/`；校验摘要、二次 judge 摘要和导入记录导出放入 `artifacts/reports/<year>/<runId>/`
- 禁止把 `paper-packs.json`、`latest.json`、`probe3-single.json` 这类无 runId 的名称作为持久化/可导入资产；它们只能作为本地临时 alias 或 legacy 文件存在
- 详细迁移和脚本实现计划见 `docs/plans/2026-04-27-offline-artifact-naming-convention.md`
- 如后续需要对外脚本别名，可增加薄封装 `generate-offline-questions.ts` / `build-paper-packs.ts` / `validate-import-artifacts.ts`，但不复制底层业务实现

---

## Track 1 — Question Bundle

### Task 1.1 — Define shared bundle types

**Files**
- Create: `scripts/lib/bundleTypes.ts`
- Modify: `scripts/tsconfig.json`

**Deliverables**
- `QuestionBundle`
- `QuestionBundleItem`
- `QuestionBundleMeta`
- `ImportSummary`

**Checks**
- bundle item 覆盖 `single_choice` / `reading_program` / `completion_program`
- metadata 包含 provider/model/prompt hash/source timestamp

**Verification**
- `npm run build:server`

### Task 1.2 — Implement `generateQuestionBundle.ts`

**Files**
- Create: `scripts/generateQuestionBundle.ts`
- Reuse: `scripts/lib/scriptLlmClient.ts`
- Reuse: `prompts/generate-initial.md`

**Inputs**
- `--exam-type`
- `--question-type`
- `--primary-kp-code`
- `--difficulty`
- `--count`
- `--output`

**Outputs**
- UTF-8 JSON file under `papers/<year>/<runId>/question-bundles/`
- Validated question bundle filename format: `<runId>__question-bundle__<question-type>__<kp-code>__n<count>__vNN.json`

**Checks**
- 输出合法 JSON
- 每题带 `source_prompt_hash`
- 每题带 `examTypes`、`primaryKpCode`、`difficulty`

**Verification**
- `tsx scripts/generateQuestionBundle.ts --help`

### Task 1.3 — Implement `validateQuestionBundle.ts`

**Files**
- Create: `scripts/validateQuestionBundle.ts`
- Reuse: `server/services/deduplicationService.ts`
- Reuse: `server/services/sandbox/cppRunner.ts`

**Checks**
- Zod schema 校验
- question type 与 payload 结构匹配
- `content_hash` 可生成
- 近似去重/Jaccard 阈值
- 程序题执行 sandbox verify
- `examType` / `primaryKpCode` 映射存在

**Verification**
- `tsx scripts/validateQuestionBundle.ts <bundle-path>`

### Task 1.4 — Implement `importQuestionBundle.ts`

**Files**
- Create: `scripts/importQuestionBundle.ts`
- Reuse: `server/db/schema/questions.ts`
- Reuse: `server/db/schema/questionExamTypes.ts`
- Reuse: `server/db/schema/questionKpTags.ts`
- Reuse: `server/db/schema/importBatches.ts`

**Modes**
- `--dry-run`
- `--apply`

**Checks**
- dry-run 只输出摘要，不写业务表
- apply 写入题库与 `import_batches`
- 默认写入 `questions.status='draft'`

**Verification**
- `tsx scripts/importQuestionBundle.ts <bundle-path> --dry-run`

---

## Track 2 — Prebuilt Paper Bundle

### Task 2.1 — Define prebuilt paper bundle types

**Files**
- Modify: `scripts/lib/bundleTypes.ts`

**Deliverables**
- `PrebuiltPaperBundle`
- `PrebuiltPaperBundleItem`
- `PrebuiltPaperSlot`

**Checks**
- slot 包含 `questionId`、`questionType`、`primaryKpId`、`difficulty`、`points`
- metadata 包含 `overlapScore` 与 blueprint version

**Verification**
- `npm run build:server`

### Task 2.2 — Implement `buildPrebuiltPaperBundle.ts`

**Files**
- Create: `scripts/buildPrebuiltPaperBundle.ts`
- Reuse: `config/blueprint.ts`
- Reuse: `server/db/schema/questions.ts`

**Inputs**
- `--exam-type`
- `--difficulty`
- `--count`
- `--output`

**Checks**
- 只从 `published` questions 选题
- 同卷不重复题目
- 满足 blueprint 题量/分值/题型要求
- 记录 overlap score

**Verification**
- `tsx scripts/buildPrebuiltPaperBundle.ts --help`

### Task 2.3 — Implement `validatePrebuiltPaperBundle.ts`

**Files**
- Create: `scripts/validatePrebuiltPaperBundle.ts`
- Reuse: `server/db/schema/prebuiltPapers.ts`
- Reuse: `server/db/schema/prebuiltPaperSlots.ts`

**Checks**
- slot 数量正确
- points 总和正确
- 所有 questionId 可解析
- question type / difficulty / exam type 兼容
- 阅读/完善程序题结构完整

**Verification**
- `tsx scripts/validatePrebuiltPaperBundle.ts <bundle-path>`

### Task 2.4 — Implement `importPrebuiltPaperBundle.ts`

**Files**
- Create: `scripts/importPrebuiltPaperBundle.ts`
- Reuse: `server/db/schema/prebuiltPapers.ts`
- Reuse: `server/db/schema/prebuiltPaperSlots.ts`
- Reuse: `server/db/schema/importBatches.ts`

**Modes**
- `--dry-run`
- `--apply`

**Checks**
- dry-run 只输出摘要
- apply 写入 `prebuilt_papers`、`prebuilt_paper_slots`、`import_batches`
- 默认写入 `prebuilt_papers.status='draft'`

**Verification**
- `tsx scripts/importPrebuiltPaperBundle.ts <bundle-path> --dry-run`

---

## Track 3 — Admin And Ops Integration

### Task 3.1 — Bind import batch summary to admin API

**Files**
- Modify: `server/routes/admin.ts`
- Modify: `server/routes/schemas/adminContent.schema.ts`

**Checks**
- import batch list能按 `bundleType` / `status` 过滤
- 后续 dry-run/apply 接口复用同一 summary shape

**Verification**
- `npm test -- server/__tests__/admin-content.integration.test.ts`

### Task 3.2 — Add Admin import actions

**Files**
- Modify: `server/routes/admin.ts`
- Create: `server/services/admin/importService.ts`

**Checks**
- `POST /api/v1/admin/import-batches/questions/dry-run`
- `POST /api/v1/admin/import-batches/questions/apply`
- `POST /api/v1/admin/import-batches/prebuilt-papers/dry-run`
- `POST /api/v1/admin/import-batches/prebuilt-papers/apply`

**Verification**
- `npm test -- server/__tests__/admin-content.integration.test.ts`

### Task 3.3 — Add Admin import UI

**Files**
- Modify: `client/src/pages/admin/AdminImports.tsx`

**Checks**
- question bundle / prebuilt paper bundle 入口分栏
- dry-run 与 apply 状态区分
- 批次摘要可见

**Verification**
- `npm run build:client`

---

## Execution Order

1. `bundleTypes.ts`
2. `generateQuestionBundle.ts`
3. `validateQuestionBundle.ts`
4. `importQuestionBundle.ts`
5. `buildPrebuiltPaperBundle.ts`
6. `validatePrebuiltPaperBundle.ts`
7. `importPrebuiltPaperBundle.ts`
8. Admin import endpoints
9. Admin import UI
