# Scripts Guide

## LLM 场景路由

- 当前脚本链路改为 provider-direct，只保留 2 条 provider lane：`.env` 中的 `LLM_PROVIDER_DEFAULT` 与可选的 `LLM_PROVIDER_BACKUP`。
- lane 值只写 provider slug；内容生产和诊断 override 的统一备选集合为 `xiaomi`、`deepseek`、`alibaba`、`minimax`。
- 每个 provider 单独配置 `API_KEY`、`BASE_URL`、`MODEL`；`deepseek` 默认 base URL 是 `https://api.deepseek.com`，`xiaomi` 默认 base URL 是 `https://api.xiaomimimo.com/v1`，`alibaba` 默认 base URL 是 `https://dashscope.aliyuncs.com/compatible-mode/v1`，`minimax` 默认 base URL 是 `https://api.minimax.io/v1`。
- 脚本默认读取 `.env` 中的 `LLM_PROVIDER_DEFAULT` / `LLM_PROVIDER_BACKUP` provider 链；计划、README 和日常操作命令不应写固定 provider 覆盖参数。
- 显式 route override 仅保留内部诊断能力，并限制在 `deepseek`、`xiaomi`、`alibaba`、`minimax` 四个 provider 内；日常脚本入口不暴露 provider 覆盖参数。
- `LLM_REASONING_DEFAULT` 统一承载离散强度型 reasoning 控制；当前已接入支持 effort / thinkingLevel 的 provider 时才会下发。
- `LLM_THINKING_TYPE_DEFAULT` 承载 enabled/disabled 风格的 thinking 开关；当前已接入 deepseek / xiaomi。
- `LLM_THINKING_BUDGET_DEFAULT` 承载数值预算风格的 thinking 控制；当前已接入支持预算型 thinking 的 provider 时才会下发。
- reasoning summary 统一走 `LLM_REASONING_SUMMARY_DEFAULT`，并只在当前 provider / model 支持时下发。
- `rewritePaperExplanations.ts`、`reviewRealPapers.ts` 等脚本默认复用 `.env` provider 链；日常脚本命令不提供 provider 覆盖入口。

## 采集类

- scrapeLuogu.ts：从洛谷有题抓取 CSP 与 GESP 试卷，输出到 `papers/real-papers`。
- fillAnswersFromLuogu.ts：对已有题库文件回填官方答案。
- exploreLuogu.mjs：统一替代旧的 list/debug/check 系列脚本，支持列出试卷、检查某份试卷结构、批量检查 ID 可用性。

## 导入类

- ingestRealPapers.ts：把 `papers/real-papers` 下的 JSON 题库导入数据库，创建 `question_reviews`，默认走离线 `judge` 场景把记录推进到 `ai_reviewed`；支持 `--skip-ai-review`、`--limit`、`--timeout`。人工确认/拒绝通过 Admin `POST /admin/questions/:id/confirm` 与 `POST /admin/questions/:id/reject` 推进到 `confirmed` / `rejected`。
- buildAcceptanceQuestionBundle.ts：生成确定性的首批规模化验收 question bundle，用于离线 sandbox、导入与验收基线；支持 `--exam-type`、`--question-type`、`--primary-kp-code`、`--difficulty`、`--count`、`--run-id`、`--artifact-version`、`--batch-id`、`--output`。默认输出到 `papers/<year>/<runId>/question-bundles/<runId>__question-bundle__<question-type>__<kp-code>__n<count>__vNN.json`。该脚本不调用 LLM，bundle meta 使用 `local-deterministic` / `acceptance-question-template-v1` 标识本地模板来源。
- validateQuestionBundle.ts：校验 question bundle 结构、蓝图映射、答案字段、去重与程序题 sandbox；`--run-sandbox` 会实际编译运行程序题，`--write` 会在全部通过后写回 `sandboxVerified=true`，`--write-metadata` 会写回 validator 版本、校验时间与 item checksum 清单，`--judge` 会调用 LLM 判官二次校验答案自洽性。
- importQuestionBundle.ts：导入 question bundle，支持 `--dry-run` 与 `--apply`，并写入 `import_batches`。
- buildPrebuiltPaperBundle.ts：基于已发布题库和蓝图构建 prebuilt paper bundle；支持 `--run-id`、`--artifact-version`、`--blueprint-version` 与 `--output` 显式覆盖。默认输出到 `artifacts/prebuilt-papers/<year>/<runId>/<runId>__prebuilt-paper-bundle__blueprint-v<blueprintVersion>__n<count>__vNN.json`，bundle meta 记录 builder provider/model、prompt hash、source batch、source timestamp 与 overlap score。
- validatePrebuiltPaperBundle.ts：校验 prebuilt paper bundle 的题量、分值、题目引用和题目发布状态；`--write-metadata` 会写回 validator 版本、校验时间与 item checksum 清单。
- importPrebuiltPaperBundle.ts：导入 prebuilt paper bundle，支持 `--dry-run` 与 `--apply`，并写入 `import_batches`。
- generate-offline-questions.ts / build-paper-packs.ts / validate-import-artifacts.ts：运营命名薄封装，分别转发到 `generateQuestionBundle.ts`、`buildPrebuiltPaperBundle.ts` 和对应 bundle 类型的 validator，不复制底层业务逻辑。
- importManualQuestions.ts：导入管理员手工生成的题目 JSON；使用 `filePath + --question-type + --exam-type + --primary-kp-id` 指定批次元数据，并将批次审计写入 `import_batches.manual_question_import`。
- updateAnswersInDB.ts：用 `papers/real-papers` 中的答案回写数据库中的同题记录。

## 审计与回填类

- auditRealPapers.ts：统一替代 verifyAnswers.ts、debug-check-code.ts、audit-code.ts，支持答案覆盖率、官方答案比对、explanation 覆盖率、代码字段完整性检查，并支持 `--dir`、`--year` 过滤目标批次；官方答案比对会把 A-D 选项字母按大小写无关处理。
- auditRealPapers.ts `quality` 模式：额外检查缺失/占位题面、代码中的全角标点、过弱或模板化 explanation，适合真题人工审校前后的批量回归。
- auditRealPapers.ts `metadata` 模式：检查 `questionType`、`difficulty`、`primaryKpCode`、`auxiliaryKpCodes` 的合法性、结构匹配、重复和冲突。
- backfillExplanations.ts：为 explanation 为空的题目批量补基础解析文本。
- rewritePaperExplanations.ts： explanation 专用重写脚本，调用共享 LLM 主体，只负责提供 prompt、schema 和目标范围；支持 `--scene`、`--start-q`、`--end-q`、`--chunk-size`。
- reviewRealPapers.ts：逐题 LLM 复核脚本，统一复核 `questionType`、`difficulty`、知识点标签与 explanation；支持 `--metadata-only`、`--write`，并将低置信度或 stem/code 可疑项输出到 `scripts/.tmp/paper-review-report-*.json`。
- verifyLlmTasks.ts：用合成 prompt 实跑 `generate` / `judge` 两类 LLM 任务，并回查 `llm_provider_logs` 是否记录 tokens、cost estimate、latency 与受控失败信息。
- verifyQuestionBundleGuards.ts：构造临时候选题，验证规则去重可用 `DUPLICATE_JACCARD` 拦截近似题，并验证 LLM 判官可用 `JUDGE_REJECTED` 拦截答案不一致题。
- verifyOfflineArtifactNames.ts：检查正式离线产物是否使用 runId 持久化命名，并校验 bundle JSON meta 与文件名一致；拒绝 `paper-packs.json`、`artifacts/llm-step3/probe*.json` 以及所有 `papers/<year>/*.json` 旧布局。
- verifyUiTokenUsage.ts：检查 `client/src` 的 TS/TSX 与非 token CSS 是否重新引入原始 hex/rgb/hsl 颜色字面量；颜色应落到 design token、语义 Tailwind class 或共享 CSS utility。
- tests/verifyExamMappings.ts：校验共享考试映射是否包含关键批次。

## 初始化与维护类

- migrate.ts：数据库迁移管理，支持 up/down/status。
- dev-setup.ts：本地 HTTPS 开发环境初始化。
- initEnv.ts：生成最小 `.env` 骨架并自动生成高熵 `SESSION_SECRET` / `TOTP_ENCRYPTION_KEK`；默认值继续由 `config/env.ts` 承接，支持 `--profile local|production-runtime|offline-content`、`--print` 与 `--force`。
- workers/contentWorker.ts：离线内容 worker 入口，仅运行 generation / sandbox verify，不属于生产运行时入口。
- bootstrapKnowledgePoints.ts：初始化知识点树。
- seedBlueprint.ts：初始化蓝图配置。
- initAdmin.ts：首个管理员引导脚本，固定用户名 `elder`，读取 `ROUND1_INITIAL_ADMIN_PASSWORD`，写入 admin 角色与 `password_change_required=true`；支持 `--dry-run` 与 `--rotate`。
- healthcheck.ts：统一健康检查脚本，默认检查 API readiness，可选检查前端静态资源、外部配置、离线 runner、离线 contentWorker 与 PM2 进程；contentWorker 需用 `--expect-content-worker` 单独声明，避免混入生产 runtime health。
- db-stats.cjs：查看题库与数据表统计。

## 共享库

- lib/examMappings.ts：共享的考试批次与输出文件映射。
- lib/offlineQueues.ts：离线 generation / sandbox verify 队列常量、队列实例与 QueueEvents 工具，不再依赖 `server/services/worker/queue.ts`。
- lib/paperFiles.ts：`papers/real-papers` 文件枚举与通用读取工具。
- lib/paperPaths.ts：统一维护 `papers/`、`papers/real-papers` 与 question bundle 默认输出路径。
- lib/scriptLlmClient.ts：scripts 共享 LLM 调用主体，负责 provider lane/scene 路由解析、直连 provider model 构建、reasoning fallback、超时控制和统一响应格式。
- lib/rewriteLlmClient.ts：底层 provider HTTP 兼容层，供共享脚本客户端复用；当前覆盖 OpenAI Responses 与 chat/completions 两类协议家族，并使用官方 provider slug（如 `deepseek`、`alibaba`、`moonshotai`、`openrouter`、`zai`、`volcengine`）。
- lib/modelJson.ts：从模型原始输出中提取 JSON 对象。
- lib/taxonomyCatalog.ts：读取 `prompts/taxonomy.json` 的叶子知识点目录。
- lib/paperReview.ts：reviewRealPapers 的安全闸门，负责 schema 归一化、低风险校验与应用写回。

## 测试与临时产物

- `scripts/tests/*.test.ts` 是可执行断言脚本，使用 `npx tsx scripts/tests/<file>.test.ts` 运行，不走 Vitest 的 suite 发现机制。
- `scripts/.tmp/*.txt` 是单题审校中间产物，可随时清理，默认不应进入版本控制。
- `scripts/.tmp/paper-review-report-*.json` 是批量审校残留报告，保留用于人工复核和回溯。

## 推荐命令

- 生成本地 `.env` 预览：`npm run env:init -- --profile local --print`
- 生成生产运行时 `.env` 预览：`npm run env:init -- --profile production-runtime --print`
- 生成离线内容环境 `.env` 文件：`npm run env:init -- --profile offline-content --path .env.offline --force`
- explanation 质量回归：`npx tsx scripts/auditRealPapers.ts quality --dir csp-s`
- 元数据回归：`npx tsx scripts/auditRealPapers.ts metadata --dir csp-j,csp-s`
- explanation 定点重写：`npx tsx scripts/rewritePaperExplanations.ts --dir csp-s --file 2025.json --start-q 16 --end-q 18 --write --chunk-size 1 --timeout 180000`
- 全量 metadata-only 复核：`npx tsx scripts/reviewRealPapers.ts --dir csp-j --write --chunk-size 1 --metadata-only`
- 生成阅读程序验收 bundle：`npx tsx scripts/buildAcceptanceQuestionBundle.ts --exam-type GESP-1 --question-type reading_program --primary-kp-code CPP --difficulty easy --count 30 --run-id 2026-04-26-acceptance-gesp-1-easy-v01 --batch-id 2026-04-26-scale-reading`
- 生成完善程序验收 bundle：`npx tsx scripts/buildAcceptanceQuestionBundle.ts --exam-type GESP-1 --question-type completion_program --primary-kp-code CPP --difficulty easy --count 20 --run-id 2026-04-26-acceptance-gesp-1-easy-v02 --batch-id 2026-04-26-scale-completion`
- 程序题离线 sandbox 校验并写回：`npx tsx scripts/validateQuestionBundle.ts papers/2026/<runId>/question-bundles/<bundle-file>.json --run-sandbox --write --write-metadata`
- question bundle 守卫验证：`npx tsx scripts/verifyQuestionBundleGuards.ts`
- 离线产物命名守卫：`npm run verify:offline-artifacts`
- 首个管理员 dry-run：`ROUND1_INITIAL_ADMIN_PASSWORD='<临时强密码>' npm run init:admin -- --dry-run`
- 生产健康检查：`npm run healthcheck -- --api-url https://round1.example.com/api/v1/health --frontend-url https://round1.example.com --pm2`
- 离线内容环境健康检查：`npm run healthcheck -- --include-offline --runner-url http://127.0.0.1:4401/health --expect-content-worker`

## Question bundle 来源口径

- `generateQuestionBundle.ts`：真实 LLM 出题入口，bundle meta 记录实际 provider/model。
- `buildAcceptanceQuestionBundle.ts`：本地确定性验收入口，不调用 LLM，只用于验证 schema、sandbox、导入和守卫流程。
- `validateQuestionBundle.ts --judge`：LLM 判官入口；出题与判官是分离步骤。只有显式跑过 `--judge` 的 bundle 才算完成 LLM 二次语义校验。
- 已导入或已整理过的候选资产复核可加 `--skip-duplicate-checks`，避免把自身历史入库记录判为重复；若只需重试少数题，可加 `--judge-items 2,3` 和 `--judge-attempts 3`。

## 已合并/删除的旧脚本

- list-all-luogu.mjs、list-luogu-exams*.mjs、debug-luogu-answer*.mjs、check-gesp-202603\*.mjs 已合并到 exploreLuogu.mjs。
- verifyAnswers.ts、debug-check-code.ts、audit-code.ts 已合并到 auditRealPapers.ts。
- debug-2020mock.mjs、debug-2021.mjs、debug-images.mjs、debug-raw-2019.mjs 属于历史一次性诊断脚本，已移除。
