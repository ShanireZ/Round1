# 生产无 Runner 收口方案

**目标**

- 生产运行时只保留 Caddy + API + Redis + Postgres。
- 代码题校验彻底前移到离线内容环境。
- 生产导入只接收已验证产物，不再现编译 / 运行代码题。

## 目标架构

### 生产运行时

- 组件：Caddy + Express API + Redis + Postgres。
- 不部署 `cpp-runner`。
- 不消费 `generation` / `sandbox-verify` 队列。
- 只负责登录、题库查询、预制卷发放、考试作答、提交与报告查询。

### 离线内容环境

- 组件：generate / judge / `contentWorker` / `cpp-runner`。
- 负责 AI 生成、判官复核、代码题 sandbox 校验、prebuilt paper 构建。
- 输出 question bundle / prebuilt paper bundle 给生产导入。

## 已落地修改

1. 发布门禁：代码题 `sandboxVerified !== true` 时禁止发布。
2. 导入门禁：question bundle 中未带离线校验结果的代码题禁止导入生产。
3. Worker 拆分：
   - `server/services/worker/worker.ts` 变为运行时 worker 入口，不再消费离线内容队列。
   - `scripts/workers/contentWorker.ts` 作为离线内容 worker 入口，负责 generation / sandbox verify。
4. 数据库连接池识别 `runtime-worker` / `content-worker` 两类进程类型。
5. 部署文档切换为“两层架构”，并把 runner 健康检查移出生产运行时。
6. 运行时遗留面进一步收口：
   - `server/db/schema/index.ts` 不再导出 `generationJobs` / `manualGenerationJobs`。
   - `server/routes/schemas/questionBank.schema.ts` 不再保留 manual generation / inventory 旧请求体。
   - 离线 queue 常量与实例迁到 `scripts/lib/offlineQueues.ts`，`server/services/worker/queue.ts` 删除。
   - 手动题导入逻辑迁到 `scripts/lib/manualQuestionImport.ts`，`server/services/manualGenerationService.ts` 删除。
   - `server/services/worker/inventoryPlanner.ts` 与其测试删除。
7. offline-only 生成链路进一步移出 `server/` 目录语义：
   - `generationProcessor`、`generationWorkerEvents`、`deadLetter` 迁到 `scripts/lib/`。
   - `contentWorker` 迁到 `scripts/workers/`，只保留离线入口语义。
8. compatibility-first 旧表进一步收口：
   - `generation_jobs`、`manual_generation_jobs` schema 文件删除，并通过迁移直接删表。
   - `manual_generation_jobs` 的批次/发起人/部分失败语义并入 `import_batches`，新增 `manual_question_import` 批次类型。
9. 兼容统计面继续收口：
   - `question_bucket_stats`、`bucket_slot_counters` schema 文件删除，并通过迁移直接删表。
   - generation / manual import / sandbox verify 不再维护兼容统计计数。
10. worker 启动约定进一步中性化：
   - `ROUND1_PROCESS_TYPE` 常量与 DB application name 规则迁到 `config/processTypes.ts`。

## 改造清单

### A. 产物契约

1. question bundle 对代码题必须显式携带 `sandboxVerified`。
2. 离线内容环境负责写入该字段，生产不得重算。
3. prebuilt paper bundle 只引用已导入且满足发布条件的题目。

### B. 生产门禁

1. 代码题没有 `sandboxVerified=true` 不得 `published`。
2. question bundle 导入时，代码题没有离线校验结果直接拒绝。
3. 生产环境不再以 runner 可达性作为健康条件。

### C. 进程边界

1. 生产默认只启动 `Round1-api`。
2. 运行时 worker 如未来启用，只允许承载运行时延迟任务。
3. `contentWorker` 只在离线内容环境部署。

### D. 后续收尾项

1. 继续收口剩余 compatibility-first 业务语义遗留面，避免重新引入在线换题、冷却表或其他运行时拼题结构。
2. 为离线 bundle 增加更明确的产物元数据，例如校验时间、校验器版本、来源批次。
3. 若需要更强审计，可为 question bundle 增加签名或 checksum 清单。

## 具体修改方案

### 方案 1：最小可落地方案（当前已实现）

- 保留现有 generation / sandbox 代码，但只让它们存在于离线内容环境。
- 生产端通过发布门禁和导入门禁阻断未校验代码题。
- 优点：改动小，风险低，能立刻把 runner 从生产运行时移出。
- 缺点：仓库中仍保留部分旧生成链路代码，后续还需要继续减法。

### 方案 2：进一步收口方案（下一阶段）

- 将 `generationProcessor`、`sandboxVerifyProcessor`、`inventoryPlanner` 从在线服务代码面继续剥离，沉到 `scripts/` 或独立内容服务。
- 继续压缩离线内容相关共享模块，把中性队列/worker 启动约定从 `server/` 目录进一步抽离。
- 当前已完成 runtime surface 收口、旧 generation/manual 表删除、旧 bucket 统计表删除、`paper_question_replacements` / `exam_cooldowns` / `papers.replacement_count` 删除，以及 `contentWorker` / queue / process type 下沉到更中性的离线层；剩余项主要是压缩兼容业务语义和进一步抽出中性基础设施模块。
- 优点：运行时/内容生产边界更清晰。
- 缺点：涉及更大范围的 schema 和服务裁剪，需要单独回归。

**推荐**：先完成方案 1，待离线 bundle 流程稳定后再执行方案 2。