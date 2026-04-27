# Offline Content And Prebuilt Papers Design

## Goal

将 Round1 从“线上 AI 生成题目 + 在线组卷 + 自动退役补货”切换为“开发环境离线生产内容 + 生产环境导入发布 + 线上从预制卷库选卷”。生产环境只保留题库/预制卷库管理、考试实例创建、客观批改和教练报表，不再承担内容生成与库存补货职责。

> **对齐说明（2026-04-24）**：这是目标设计文档，不是兼容期现状快照。当前仓库里仍保留部分 compatibility-first 遗留实现；凡与本文冲突之处，均以后续收口任务将代码与 step/reference 对齐为准。

## Decisions

1. 生产环境不再运行题目生成 Worker、库存补货、退役检查或用户侧动态组卷。
2. 开发者在开发环境结合现有 AI agents、LLM 路由和 cpp-runner 生成题目 JSON 与预制卷 JSON。
3. 生产环境通过管理员导入流程接收 question bundle 和 prebuilt paper bundle，并提供 dry-run、apply、publish、archive、审计回溯。
4. 题目不再自动退役；目标生命周期收敛为 draft、reviewed、published、archived。物理删除只允许未被引用的 draft。
5. 用户自练考试按 exam_type + difficulty 从已发布预制卷池中选择一套，再复制为个人 paper instance。
6. 教练任务优先绑定明确的 prebuilt paper，保证同任务下学生面对同一张卷。
7. BullMQ 仅保留给考试会话支持型任务，例如超时自动提交；不再承担内容生成链路。

## Why This Direction

- 线上负载显著降低：没有 LLM 调用、没有题目补货、没有实时组卷搜索。
- 成本更可控：生成成本集中在开发环境，可分批审查和回滚。
- 审计更完整：题目与预制卷都变成可导入、可发布、可归档的内容资产。
- 风险更低：生产环境故障面从“运行时生成失败”收缩为“导入校验失败”与“预制卷不足”。

## Target Runtime Model

### Question Lifecycle

- `draft`: 刚导入或刚创建，尚未发布。
- `reviewed`: 已完成离线审查或人工确认，可进入发布候选池。
- `published`: 可被预制卷引用，也可被管理员浏览和编辑说明。
- `archived`: 不再进入新预制卷与新考试分配，但保留历史引用。

> 审核拒收原因继续保留在 `question_reviews` 与 import summary，不再作为长期题目主状态扩散到运行时模型。

### Prebuilt Paper Lifecycle

- `draft`: 已导入或在后台创建，但尚未开放给用户/任务使用。
- `published`: 可被自练选卷或教练任务引用。
- `archived`: 不再参与新的考试实例分配，但保留历史记录。

> 已发布预制卷必须视为不可变资产。修改已发布版本时，只允许复制出新的 draft 版本，再走发布流程，禁止原地覆盖。

### Student Exam Flow

1. 用户在前端选择 exam type 与 difficulty。
2. 服务端从已发布预制卷库中选择一张合适的卷。
3. 服务端复制预制卷为用户私有的 paper instance。
4. 用户开始答题、自动保存、提交、客观批改、查看解析。

## Offline Content Pipeline

### Question Bundle Pipeline

1. `bootstrapKnowledgePoints` 维护知识点树。
2. `ingestRealPapers` 导入官方真题并创建 `question_reviews`。
3. `generateQuestionBundle` 生成单选、阅读程序、完善程序题目 bundle。
4. `validateQuestionBundle` 做 schema、去重、答案结构、知识点映射、沙箱校验。
5. `importQuestionBundle` 在生产环境 dry-run 或 apply。
6. 管理员在后台执行 publish、archive、review。

> question bundle 与 prebuilt paper bundle 均必须使用持久化、不可覆盖的 `runId` 命名。`runId` 格式为 `YYYY-MM-DD-<pipeline>-<exam-type-slug>-<difficulty>-vNN`。question bundle 标准产物统一放入 `papers/<year>/<runId>/question-bundles/<runId>__question-bundle__<question-type>__<kp-code>__n<count>__vNN.json`；prebuilt paper bundle 标准产物统一放入 `artifacts/prebuilt-papers/<year>/<runId>/<runId>__prebuilt-paper-bundle__blueprint-v<blueprintVersion>__n<count>__vNN.json`。`paper-packs.json`、`latest.json`、`probe*.json` 等无 runId 名称只允许作为本地临时 alias，不得作为可导入/可审计资产。详细规范与迁移任务见 `docs/plans/2026-04-27-offline-artifact-naming-convention.md`。仓库内部脚本名可以继续使用 `generateQuestionBundle` / `buildPrebuiltPaperBundle` 这一类实现名。

### Prebuilt Paper Bundle Pipeline

1. `buildPrebuiltPaperBundle` 基于已发布题库与 blueprint 生成预制卷。
2. 生成策略以“低重复率 + 蓝图覆盖正确 + 阅读/完善程序主知识点不过度重复”为准。
3. `validatePrebuiltPaperBundle` 校验题量、分值、知识点配额、重复率、引用完整性。
4. `importPrebuiltPaperBundle` 在生产环境 dry-run 或 apply。
5. 管理员在后台执行 publish、archive、preview。

## Schema Delta

### Remove From Runtime Design

- `question_bucket_stats`
- `bucket_slot_counters`
- `generation_jobs`
- `manual_generation_jobs`
- `exam_cooldowns`
- `paper_question_replacements`
- `rotationChecker`
- `inventoryPlanner`
- `paperAssembler`

### Add Or Reframe

- `prebuilt_papers`
- `prebuilt_paper_slots`
- `import_batches`
- `questions.status`: draft/reviewed/published/archived
- `assignments`: 从“考试类型 + 蓝图版本”转为“绑定 prebuilt paper”
- `prebuilt_papers`: 增补显式内容版本化与 lineage 约束，支持复制新版本而非覆盖已发布版本

## API Delta

### Remove

- 题目生成作业相关 API
- BullMQ 内容生成监控相关 API
- 在线组卷替换题目 API
- 组合桶库存与退役监控 API

### Add

- 预制卷目录查询 API
- 题库 CRUD + publish/archive API
- 预制卷库 CRUD + publish/archive API
- 题目 / 预制卷引用摘要 API
- 预制卷复制新版本 API
- question bundle / prebuilt paper bundle 导入 API
- import batch 审计 API

## Admin UX

### Question Library

- 列表、筛选、详情、编辑、发布、归档、删除未引用 draft。
- 真题审核列表与 AI review 差异展示。

### Prebuilt Paper Library

- 列表、筛选、详情预览、发布、归档、删除未引用 draft。
- 查看每张卷的题目组成、难度、来源 bundle、版本。
- 支持复制已发布版本为新的 draft 版本。

### Import Center

- question bundle dry-run / apply
- prebuilt paper bundle dry-run / apply
- import batch 历史、错误报告、摘要统计

## Migration Plan

### Phase A: Freeze Design And Docs

1. 在方案文档中移除退役、在线组卷、线上生成链路。
2. 统一 terminology 为“题库 / 预制卷库 / 离线 bundle / 导入批次”。

### Phase B: Schema Refactor

1. 移除库存与退役相关表。
2. 增加 `prebuilt_papers`、`prebuilt_paper_slots`、`import_batches`。
3. 调整 `questions.status`、`papers`、`assignments` 设计。

### Phase C: Runtime API Refactor

1. 将 `/api/v1/exams` 改为“从预制卷库选卷并复制实例”。
2. 删除在线替换题目与内容生成作业 API。
3. 增加管理后台的题库/预制卷库 CRUD 与导入 API。

### Phase D: Offline Script Set

1. 新增 question bundle 生成、校验、导入脚本。
2. 新增 prebuilt paper bundle 构建、校验、导入脚本。
3. 保留 real paper 审核与 cpp-runner 验证链路。

### Phase E: Admin UI Refactor

1. 下线 Job/死信/库存补货面板。
2. 上线题库、预制卷库、导入中心。

## Acceptance Criteria

- 方案文档中不存在“自动退役”“inventoryPlanner”“rotationChecker”“用户在线 AI 组卷”作为主设计路径。
- schema、API、step-03/04/05 对同一运行模型表述一致。
- 生产环境内容入口仅为 JSON bundle 导入与管理员 CRUD。
- 自练与任务流程均能基于 prebuilt paper 运行。
