# Step 03 — 题库、离线 AI 内容生产与导入（Phase 7 ~ 10）

> **前置依赖**：Step 01（脚手架+DB）、Step 02（认证 — admin 角色可用）
> **交付物**：知识点树 + 真题入库 + LLM 客户端 + question bundle 离线生成/校验/导入 + prebuilt paper bundle 离线构建/导入 + cpp-runner 沙箱
> **可验证 demo**：question bundle dry-run/apply 通过；30 道阅读程序题经沙箱校验后入库；20 道完善程序题经沙箱校验后入库；首批预制卷导入并可发布

> **对齐说明（2026-04-24，2026-04-27 更新命名口径）**：当前仓库仍处于 compatibility-first 过渡期。Step 03 收口目标已经明确为“开发环境离线产出可直接导入的 question bundle 与 prebuilt paper bundle，生产环境只做校验导入、发布、考试”；question bundle 标准存放路径为 `papers/<year>/<runId>/question-bundles/`，prebuilt paper bundle 标准存放路径为 `artifacts/prebuilt-papers/<year>/<runId>/`，任何旧的线上生成、库存补货、题目退役或实时换题逻辑都只能视为待删除遗留，不得继续扩张。2026-04-27 标准漂移复核已将当前本地 step3 产物迁到 `2026-04-27-step3-llm-csp-j-medium-v01` runId 路径，并把 `schemaVersion`、`runId`、`createdAt` 收紧为 raw bundle 必填元数据。

> **当前推进状态（2026-04-26）**：离线 bundle 第一批最小可运行 slice 已经落地：`scripts/lib/bundleTypes.ts` 已定义 raw bundle 契约与统一 `ImportSummary`；`generateQuestionBundle.ts`、`validateQuestionBundle.ts`、`importQuestionBundle.ts` 以及 `buildPrebuiltPaperBundle.ts`、`validatePrebuiltPaperBundle.ts`、`importPrebuiltPaperBundle.ts` 六个 CLI entrypoint 已接入仓库；Admin 导入中心已直接接收 raw `QuestionBundleSchema` / `PrebuiltPaperBundleSchema` 并复用 scripts 侧 workflow。当前 Step 03 的剩余工作重点已经收敛为“更丰富的离线产物元数据与审计信息、批量内容生产实跑规模、知识点/真题复核批次，以及与 Step 04/05 的完整运行时闭环对齐”，而不是重新设计 bundle 基础契约。2026-04-26 已完成首批规模化本地确定性验收 question bundle 与程序题 sandbox 入库验收：阅读程序 30 道、完善程序 20 道均通过离线校验并 apply 入库，且规则去重/判官拦截守卫已实跑通过。该批次不等同于 LLM 出题批次；真实 LLM 生成题目仍需使用 `generateQuestionBundle.ts` 并显式跑 `validateQuestionBundle.ts --judge`。

> **GESP-6 库存补充记录（2026-05-07）**：`2026-05-07-bulk36-gesp6-default-only-gap-fill-v01` 与 `2026-05-07-bulk36-gesp6-default-only-gap-fill-v02` 已分别按 3 题/bundle 生成 12 个 GESP-6 `single_choice/medium/ALG` bundle，共 72 题；生成、两轮 LLM 审核与修复均通过 `--provider-lane default-only` 使用 `.env` 的 `LLM_PROVIDER_DEFAULT`。两轮导入 dry-run 均 12/12 通过，apply 共 72 题，duplicate content hash 均为 0。`artifacts/reports/2026/state/question-inventory.*` 与 `papers/_inventory/*` 已刷新，GESP-6 `single_choice/medium/ALG` 可用数从 30 增至 102，缺口从 195 降至 123。本日继续相同 `bulk36` shard 时需使用新的 `--agent-label` 或不同 pipeline label，避免 `--skip-existing` 复用已有 `bulk36-a01-b0001...` bundle 路径。

> **阅读程序样例 IO 收口（2026-05-07）**：`reading_program` 题面只保留代码与子问题，不再生成或导入非空 `sampleInputs` / `expectedOutputs`，题干、子题和解析也不得出现“样例输入 / 样例输出”表述；需要固定数据时直接写入 C++ 初始化语句。`completion_program` 仍保留样例 IO，用于校验填空后的完整程序行为。
> 同日追加：已补 `scripts/cleanup_reading_program_sample_io_pdfs.py` 并清理 `example/*quality-sample*.pdf` 中既有阅读程序样例 IO 残留；脚本的 `--check` 可回归确认阅读程序章节不再含“样例输入 / 样例输出”。

### 性能估算假设

离线内容生产先通过少量样本基准测试确定参数：

| 指标                  | 估算方法                                                   |
| --------------------- | ---------------------------------------------------------- |
| 单题单选 LLM 生成时间 | 随机 10 题基准测试，取 P95 时间                            |
| 判官校验时间          | 随机 10 题基准测试，取 P95                                 |
| 每日可生成最大题数    | `(LLM RPM × 60 × 24) / 平均调用次数`，用于规划离线批次大小 |
| Jaccard 拒收率        | 首批 100 题实测，观测拒收率后调整阈值或 prompt             |
| 每日 token 费用账单   | 基准测试后按模型结合 token 价格计算，定每日预算上限        |
| 预制卷平均重叠率      | 首批 30 张卷实测，验证 paper-level overlap 指标            |

---

## Phase 7 — 知识点 + 真题导入 + LLM 客户端

### 7.1 知识点 Bootstrap

- `scripts/bootstrapKnowledgePoints.ts` — 用 LLM 将 `初赛讲义.pdf` 目录与正文段落抽成层级 taxonomy
- 人工 review `prompts/taxonomy.json` 后入库 `knowledge_points` 表
- Category：`basics` / `cpp` / `datastruct` / `algo` / `math` / `common_sense`

### 7.2 历年真题导入

- `scripts/ingestRealPapers.ts` — 导入 CSP-J/S（2020 ~ 2026-03）+ GESP 1~8 级历年真题（仅 C++，截至 2026-03）
- 标记 `source='real_paper'`
- 存放在 `papers/real-papers/` 目录（`csp-j/`、`csp-s/`、`gesp/`）

**真题来源（官方渠道白名单）**：

- CSP-J/S：https://www.noi.cn/ （NOI 官网历年试题）
- GESP 样题：https://gesp.ccf.org.cn/101/1022/10088.html
- GESP 历年真题：https://gesp.ccf.org.cn/101/1010/

> 仅允许从以上官方渠道导入真题，禁止从第三方 OJ 或非官方来源采集。

> **注意**：部分真题官方答案有误，导入时需逐题确认。

> 真题人工审计、解析回填、题面修复与抽样复核的统一流程见 [reference-paper-audit.md](reference-paper-audit.md)。后续进行 `csp-j`、`csp-s`、`gesp` 历史题库修订时，统一按该规范执行。

> 批量复核时优先使用两段式脚本：`scripts/reviewRealPapers.ts` 负责 metadata/explanation 逐题复核与低风险写回，`scripts/rewritePaperExplanations.ts` 负责 explanation 定点补写；两者共用 scripts 侧共享 LLM 客户端，避免提示词与调用主体漂移。

**AI 辅助审核（基于 `question_reviews` 表）**：

导入的真题的审核记录存入 `question_reviews` 表，状态流转：

- `pending` → 导入脚本解析后自动创建 review 记录
- `ai_reviewed` → LLM 独立解题与官方答案比对；一致自动流转，不一致标记差异
- `confirmed` → 人工确认答案正确，题目可转为 `published`
- `rejected` → 人工判定不可用，题目保持 `draft`，拒收原因落在审核记录或导入摘要

> 审核状态与题目发布状态解耦，同一题目可有多轮 review 记录。

### 7.3 蓝图初始化

- `config/blueprint.ts` — 10 种试卷类型蓝图定义（题数、分值、难度分布、考点类别配额、考试时长）
- `scripts/seedBlueprint.ts` — 将蓝图写入 `blueprints` 表
- 蓝图版本管理：修改时递增 `version`

**各试卷类型默认考试时长**：

| 试卷类型 | 时长 | 说明                                         |
| -------- | ---- | -------------------------------------------- |
| CSP-J    | 120m | 对齐 CSP-J 初赛                              |
| CSP-S    | 120m | 对齐 CSP-S 初赛                              |
| GESP-1~8 | 60m  | 统一 60 分钟（模拟练习场景，非官方考试时长） |

> 蓝图用于离线构建预制卷，而非运行时在线组卷。`spec_json` 接口定义见 [reference-schema.md#spec_json-蓝图接口定义](reference-schema.md#spec_json-蓝图接口定义)。

### 7.4 LLM 客户端

- `server/services/llm/index.ts` — 基于 Vercel AI SDK (`ai@^6.0`) 构建
- `config/llm.ts` — scene 路由配置，支持 `generate`、`judge`、`rewrite`、`paper_audit`、`answer_fill`；默认链路来自 `.env` 的 `LLM_PROVIDER_DEFAULT` / `LLM_PROVIDER_BACKUP`
- `scripts/lib/scriptLlmClient.ts` — scripts 共享调用主体，复用同一套 scene 路由与 provider fallback
- 每次调用写 `llm_provider_logs`（成功/失败/tokens/cost/latency）
- SDK 原生 Zod structured output + token 计数
- 热切换：改 `.env` 中 `LLM_PROVIDER_DEFAULT` / `LLM_PROVIDER_BACKUP` 或 provider 默认模型后重启即可；显式 route override 仅作为内部诊断能力保留，并限制在 `deepseek`、`xiaomi`、`alibaba`、`minimax` 四个 provider 内

**当前 scene 约定**：

- `generate`：离线出题主流程
- `judge`：判官与二次校验
- `rewrite`：explanation 专用重写脚本
- `paper_audit`：逐题真题复核脚本
- `answer_fill`：答案补齐类脚本

---

## Phase 8 — question bundle 离线生成 + 去重 + 导入

### 8.1 question bundle 生成脚本

- `scripts/generateQuestionBundle.ts` — 离线生成单选 / 阅读程序 / 完善程序题目 bundle
- 输出 UTF-8 JSON 文件，标准产物存放在 `papers/<year>/<runId>/question-bundles/`，命名为 `<runId>__question-bundle__<question-type>__<kp-code>__n<count>__vNN.json`
- `papers/<year>/<runId>/question-bundles/` 下只放已生成、已校验、可直接导入的 raw `QuestionBundleSchema` JSON；临时 LLM 草稿或未通过 sandbox 的程序题 bundle 不进入该目录
- 输入参数至少包含：`examType`、`questionType`、`primaryKpCode`、`difficulty`、`count`

**离线生成流水线**：

1. `buildPrompt(target, fewShotsFromRealPapers)` → prompt
2. `llm.generate(prompt, task='generate')` → raw
3. `Zod.parse(raw)` → parsed（含 explanation_json + primaryKpCode + auxiliaryKpCodes）
4. `llm.generate(judgePrompt, task='judge')` → 判官二次校验
5. 写入 question bundle 草稿文件，并附带生成元数据

**溯源标识**：`source_prompt_hash = sha256(provider+model+templateId+kpCode+difficulty+nonce)`

### 8.2 规则去重与结构校验

- `server/services/deduplicationService.ts` — `content_hash` 精确去重 + Jaccard ≥ 0.85 近似去重
- `scripts/validateQuestionBundle.ts` — 结构校验、知识点校验、去重校验、答案字段校验、exam_type 映射校验
- `content_hash` 规范化规则见 [reference-schema.md#content_hash-规范化规则](reference-schema.md#content_hash-规范化规则)

### 8.3 question bundle 导入

- `scripts/importQuestionBundle.ts` — 支持 `--dry-run` 与 `--apply`
- 生产环境导入写入 `import_batches`
- 导入后题目默认进入 `draft`，再由管理员发布或归档
- `POST /api/v1/admin/import-batches/questions/{dry-run,apply}` 直接接收 raw question bundle JSON；服务端统一计算 `checksum` / `sourceFilename`，不再额外包一层 admin 专用 DTO

**导入流水线**：

1. Zod 校验
2. 去重校验
3. 代码题沙箱校验（若适用）
4. 批量写入 `questions` / `question_exam_types` / `question_kp_tags`
5. 记录 `import_batches.summary_json`

### 8.4 管理后台题库 CRUD

- `GET/POST /api/v1/admin/questions` — 列表 / 新建题目
- `GET/PATCH/DELETE /api/v1/admin/questions/:id` — 详情 / 编辑 / 删除未引用 draft
- `POST /api/v1/admin/questions/:id/publish` — 发布题目
- `POST /api/v1/admin/questions/:id/archive` — 归档题目

> 线上内容入口只有“导入 bundle”和“管理员 CRUD”，不再提供线上自动出题作业。

---

## Phase 9 — cpp-runner 沙箱 + 程序题离线校验

### 9.1 cpp-runner 独立服务

- `cpp-runner/Dockerfile` + `cpp-runner/entrypoint.sh` + `cpp-runner/package.json`
- Node.js + Express，`POST /run` + `GET /health`
- 接收 `{ source, stdin, timeoutMs }` → 返回 `{ compileOk, compileStderr, runOk, stdout, stderr, exitCode, timedOut, peakMemoryKb, wallMs }`

**生产（Ubuntu 24.04）— Docker + gVisor**：

```
docker run --rm --runtime=runsc --read-only --network=none \
  --pids-limit=64 --memory=256m --cpus=1 --cap-drop=ALL \
  --security-opt=no-new-privileges --user 65534:65534 \
  --tmpfs /work:rw,size=16m,mode=1777,noexec=off \
  cpp-runner:latest /entrypoint.sh
```

- 编译/运行两阶段容器
- 编译超时 10s，运行超时 1s
- 回退方案：runc + seccomp default profile

**开发（Win11 + WSL2 + Docker Desktop）**：

- `SANDBOX_RUNNER_URL=http://127.0.0.1:4401`
- 健康检查失败 → stub 返回 `{ runOk: null, reason: 'runner_unavailable' }`，`sandbox_verified=false`，该题不得导入为 published

### 9.2 主进程 RPC 客户端

- `server/services/sandbox/cppRunner.ts` — Unix socket（生产）/ loopback HTTP（开发）
- 所有代码均按不可信代码处理

### 9.3 阅读程序 / 完善程序题校验

- 阅读程序与完善程序题不再由线上 Worker 生成，而是在离线 bundle 阶段校验
- 导入流程增加 `cppRunner.verify()`：阅读程序仅做自包含代码编译/运行健康检查且禁止样例 IO；完善程序执行样例输入并做期望输出比对
- `sandbox_verified=false` 的题目不允许发布
- 阅读/完善程序题解析统一采用整体逻辑分析 + 逐小题分析

---

## Phase 10 — prebuilt paper bundle 构建 + 导入

### 10.1 预制卷离线构建

- `scripts/buildPrebuiltPaperBundle.ts` — 基于已发布题库与蓝图生成预制卷 bundle
- 输出 UTF-8 JSON 文件，标准产物命名为 `artifacts/prebuilt-papers/<year>/<runId>/<runId>__prebuilt-paper-bundle__blueprint-v<blueprintVersion>__n<count>__vNN.json`
- 同一 exam_type + difficulty 下，尽量降低卷间 overlap score

**构建规则**：

- 题量与分值必须满足蓝图
- 阅读/完善程序题主知识点不过度重复
- 同一张预制卷内不得重复题目
- 尽量软排除最近批次中已使用过的题目组合

### 10.2 预制卷校验与导入

- `scripts/validatePrebuiltPaperBundle.ts` — 校验题量、分值、知识点配额、题目引用完整性、重复率
- `scripts/importPrebuiltPaperBundle.ts` — 支持 `--dry-run` 与 `--apply`
- 正式导入后写入 `prebuilt_papers`、`prebuilt_paper_slots` 和 `import_batches`
- `POST /api/v1/admin/import-batches/prebuilt-papers/{dry-run,apply}` 直接接收 raw prebuilt paper bundle JSON；服务端统一计算 `checksum` / `sourceFilename`，并复用 scripts 侧导入 workflow

### 10.3 管理后台预制卷库 CRUD

- `GET/POST /api/v1/admin/prebuilt-papers` — 列表 / 新建预制卷
- `GET/PATCH/DELETE /api/v1/admin/prebuilt-papers/:id` — 详情 / 编辑 / 删除未引用 draft
- `POST /api/v1/admin/prebuilt-papers/:id/publish` — 发布预制卷
- `POST /api/v1/admin/prebuilt-papers/:id/archive` — 归档预制卷

### 10.4 离线化收口修复

- 题目资产目标生命周期已经收敛为 `draft → reviewed → published → archived`。拒收原因和审核链继续落在 `question_reviews` 与 import summary，不再作为题目主状态扩散到新接口；旧 `active/retired` 仅允许存在于历史迁移语义中。
- 仓库内部实现名可以继续使用 `generateQuestionBundle.ts` / `buildPrebuiltPaperBundle.ts` / `validatePrebuiltPaperBundle.ts`，但 question bundle 与 prebuilt paper bundle 的对外交付标准统一改为 runId 持久化命名；`paper-packs.json`、`latest.json`、`probe*.json` 等无 runId 名称只允许作为本地临时 alias，不得进入可导入/可审计资产目录。`generate-offline-questions.ts` / `build-paper-packs.ts` / `validate-import-artifacts.ts` 继续作为运营命名薄封装，不复制业务逻辑。
- `question_bucket_stats`、`bucket_slot_counters`、`generation_jobs`、`manual_generation_jobs` 已删除；原手工导入批次/发起人/部分失败语义并入 `import_batches`，不再作为线上运行前提。

---

## 验证清单

- [x] `scripts/bootstrapKnowledgePoints.ts` 生成知识点树入库
- [x] `scripts/ingestRealPapers.ts` 导入真题，状态机流转正常（2026-04-26：CLI 小批量导入已跑通；`question_reviews` 的 pending / ai_reviewed / confirmed / rejected 状态流已由聚焦测试覆盖）
- [x] CSP-J/S 与 GESP 历史题库完成一轮全量确定性审计、官方答案比对和 LLM/人工语义抽样复核（2026-04-26：官方比对 110 份卷 mismatch=0；解析覆盖、代码字段、质量、元数据、结构审计均为 0 问题；`reviewRealPapers.ts --write` 抽样覆盖 CSP-J、CSP-S、GESP 和单选/阅读程序/完善程序，skipped/warnings/manual_check 均为 0）
- [x] LLM 客户端可调用生成/判官两种任务（2026-04-26：`scripts/verifyLlmTasks.ts` 用合成 prompt 实跑 `generate` / `judge`，`.env` 默认链路解析为 `xiaomi -> deepseek`）
- [x] `llm_provider_logs` 记录费用台账（2026-04-26：实跑确认成功日志记录 tokens/latency/cost_estimate，受控失败日志记录 error_message；当前 `mimo-v2.5-pro` 未维护本地静态费率，cost_estimate 为 0）
- [x] `scripts/validateQuestionBundle.ts` dry-run 通过（2026-04-26：两份首批规模化 question bundle 均完成 `--run-sandbox --write` 校验，summary 为 30/30/0 与 20/20/0）
- [x] `scripts/importQuestionBundle.ts --apply` 导入成功，并写入 `import_batches`（2026-04-26：reading bundle apply batch=`1f74c813-8425-4847-8ac8-17f072e76565`，completion bundle apply batch=`56fcb6ab-9ba9-4369-90fa-e8828b29afb9`）
- [x] `cpp-runner` 健康检查通过（响应时间 < 200ms）
- [x] 30 道阅读程序题经沙箱校验后入库（2026-04-26：历史本地验收文件曾位于 `papers/2026/2026-04-26-reading_program-30.json`，数据库回查 30/30 且追加 LLM 判官逐题复核 30/30 通过；2026-04-27 后当前资产路径已收口为 `papers/2026/<runId>/question-bundles/`，不再允许 `papers/<year>/*.json` 旧布局）
- [x] 20 道完善程序题经沙箱校验后入库（2026-04-26：历史本地验收文件曾位于 `papers/2026/2026-04-26-completion_program-20.json`，数据库回查 20/20 且追加 LLM 判官逐题复核 20/20 通过；2026-04-27 后当前资产路径已收口为 `papers/2026/<runId>/question-bundles/`，不再允许 `papers/<year>/*.json` 旧布局）
- [x] 去重规则拦截近似题（2026-04-26：`scripts/verifyQuestionBundleGuards.ts` 构造同题干不同选项候选，触发 `DUPLICATE_JACCARD`）
- [x] 判官二次校验拦截答案不一致的题（2026-04-26：`scripts/verifyQuestionBundleGuards.ts` 构造错误答案题，触发 `JUDGE_REJECTED`）
- [x] `scripts/validatePrebuiltPaperBundle.ts` dry-run 通过（2026-04-26：历史验收产物曾使用 `artifacts/prebuilt-papers/paper-packs.json`，2026-04-27 后新产物改用 runId 持久化命名；校验 summary=1/1/0，`dbChecksSkipped=false`；校验前通过 `validate-import-artifacts.ts --write-metadata` 写回 validator 版本、校验时间与 item checksum manifest）
- [x] 当前本地 step3 LLM 产物命名 guard 通过（2026-04-27：旧 `papers/2026/step3-llm-2026-04-27/*.json`、`artifacts/prebuilt-papers/step3-llm-cspj-medium-paper-packs.json` 与 `artifacts/llm-step3/probe*.json` 只作为历史迁移来源记录；当前正式 question bundle 位于 `papers/2026/2026-04-27-step3-llm-csp-j-medium-v01/question-bundles/`，prebuilt paper bundle 位于 `artifacts/prebuilt-papers/2026/2026-04-27-step3-llm-csp-j-medium-v01/`。后续以 `npm run verify:offline-artifacts` 作为命名 guard。）
- [x] `scripts/importPrebuiltPaperBundle.ts --apply` 导入成功，并可在后台发布（2026-04-26：apply batch=`a231db53-95ae-42de-9860-c5b057a9d791`；发布预制卷 `2a2e4c76-e7aa-48b3-9226-36c838220a0c` 后，运行时选卷查询可命中 GESP-1/easy，slot=20、totalPoints=100）
- [x] 管理员题库 CRUD 流程完整（2026-04-27 复核：`server/__tests__/admin-content.integration.test.ts` 覆盖 create/edit/delete draft、publish/archive 与 references；`/admin/questions` 已接入列表、筛选、详情 JSON 编辑与引用摘要。）
- [x] 管理员预制卷库 CRUD 流程完整（2026-04-27 复核：`server/__tests__/admin-content.integration.test.ts` 覆盖 create/edit/delete draft、publish/archive、copy-version 与 references；`/admin/papers` 已接入 slot/metadata 编辑、发布、归档、复制版本与引用摘要。）
