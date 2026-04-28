# Remaining Unfinished Work Summary

> 生成日期：2026-04-26
>
> 范围：本文件汇总 `plan/` 与现有 `docs/plans/` 中仍未完成或仍需验证的内容。仓库中不存在 `docs/plan/` 单数目录，现有计划目录为 `docs/plans/`，因此本汇总放在该目录下。
>
> 口径：这是基于计划文档与明显仓库现状的 backlog 汇总，不等同于一次完整代码审计。若旧计划与 2026-04-26 的对齐说明冲突，以较新的 `plan/step-*`、`plan/reference-*` 和 `docs/plans/*` 状态说明为准。

## 已基本收口，不作为当前主 backlog

- Step 01 脚手架、迁移、OpenAPI 骨架、基础健康检查、Express 5 中间件兼容性验证已在计划清单中标记完成。
- Step 02 认证主线大多已完成：邮箱注册/登录/找回、CppLearn OIDC、Passkey、Admin step-up、审计、邮箱换绑、频控等均已勾选。
- 早期 LLM 计划已经被后续 provider-direct 与 reasoning capabilities 实现覆盖；当前代码中已存在 `LLM_PROVIDER_DEFAULT` / `LLM_PROVIDER_BACKUP`、`LLM_THINKING_TYPE_DEFAULT`、`LLM_THINKING_BUDGET_DEFAULT`、reasoning summary 与相关测试/文档，因此 `2026-04-20` 到 `2026-04-22` 的 LLM 计划不再列为主要未完成项。
- Offline bundle 的基础 CLI 与 Admin import 最小 slice 已落地：六个脚本 entrypoint、共享 bundle contract、Admin dry-run/apply 基础路径已在 2026-04-26 对齐说明中标记为当前状态。
- Production no-runner 的第一阶段已落地：生产运行时不再依赖 `cpp-runner`，`contentWorker` 明确归入离线内容环境，旧 generation/manual/bucket/replacement/cooldown 表面已大幅收口。

## 当前剩余主线

### 1. 内容生产实跑与质量闭环

- [x] 跑通 `scripts/ingestRealPapers.ts` 真题导入，并验证 `question_reviews` 的 `pending -> ai_reviewed -> confirmed / rejected` 状态机。（2026-04-26：已抽出可测试导入库，CLI 增加 `--limit` 小批量验证；`--skip-ai-review --limit 20` 实跑导入 2 题并创建 pending review；聚焦测试覆盖 pending、ai_reviewed、confirmed、rejected。）
- [x] 对 CSP-J/S、GESP 历史题库继续按 `plan/reference-paper-audit.md` 做题面、答案、解析、知识点标签与官方答案比对复核。（2026-04-26：已完成一轮全量确定性审计与官方答案比对，修复 2 道 GESP 题面/答案/解析问题，并消除官方小写选项字母导致的比对假阳性；随后用 `scripts/reviewRealPapers.ts --write` 完成覆盖 CSP-J、CSP-S、GESP 及单选/阅读程序/完善程序的 LLM/人工语义抽样复核，所有报告均无 skipped/warnings/manual_check；详见 `docs/plans/2026-04-26-real-paper-audit-followup.md`。）
- [x] 实际验证 LLM 生成与判官两类任务可用，并确认 `llm_provider_logs` 可记录 tokens、费用、延迟与失败信息。（2026-04-26：新增 `scripts/verifyLlmTasks.ts`，用合成 prompt 实跑 `generate` / `judge`，默认链路按 `.env` 解析为 `xiaomi -> deepseek`；本次实跑记录 generate tokens=53/256、latency=6273ms，judge tokens=88/128、latency=2831ms，并通过指向 localhost 的受控 deepseek 失败确认 `error_message` 写入。`cost_estimate` 字段已落库；当前 `mimo-v2.5-pro` 未在本地静态费率表中维护价格，估算值为 0。显式 route override 已收窄为内部诊断能力，仅允许 `deepseek` / `xiaomi` / `alibaba` / `minimax`。）
- [x] 进行首批规模化 question bundle 生产，而不仅是脚本存在性验证。（2026-04-26：新增 `scripts/buildAcceptanceQuestionBundle.ts` 并生成阅读程序 30 道、完善程序 20 道的本地确定性验收 bundle；最初本地文件名为 `papers/2026/2026-04-26-reading_program-30.json` 与 `papers/2026/2026-04-26-completion_program-20.json`，2026-04-27 命名收口后不再作为当前资产路径保留。当前可导入资产统一在 `papers/2026/2026-04-27-step3-llm-csp-j-medium-v01/question-bundles/` 的 runId 路径下，guard 已拒绝 `papers/<year>/*.json` 旧布局。该批次不等同于真实 LLM 出题批次；真实 LLM 生成题目仍需使用 `generateQuestionBundle.ts` 并显式跑 `validateQuestionBundle.ts --judge`。）
- [x] 完成阅读程序 30 道、完善程序 20 道的离线 sandbox 校验后入库验收。（2026-04-26：`validateQuestionBundle --run-sandbox --write` 对 50 道程序题全部通过并写回 `sandboxVerified=true`；随后 `importQuestionBundle --apply` 入库 reading_program=30、completion_program=20，数据库回查均为 `sandbox_verified=true`。2026-04-26 追加 LLM 判官逐题复核：阅读程序 30/30 通过，完善程序 20/20 通过；完善程序初次校验有 7 道遇到 LLM 空响应，按 item 重试后全部通过，无题目内容拒收。）
- [x] 验证规则去重可拦截近似题，判官二次校验可拦截答案不一致题。（2026-04-26：新增并实跑 `scripts/verifyQuestionBundleGuards.ts`；同题干不同选项候选被 `DUPLICATE_JACCARD` 拦截，故意错误答案题被 LLM 判官以 `JUDGE_REJECTED` 拦截。）
- [x] 实跑 `validateQuestionBundle` / `importQuestionBundle --apply`，确认写入 `import_batches` 且导入摘要与 Admin UI/API 口径一致。（2026-04-26：两份 question bundle 均完成 validate、dry-run 与 apply；`import_batches` 写入 dry_run/apply 共 4 条，摘要分别为 30/30/0 与 20/20/0，沿用 scripts/Admin 共享 workflow 口径。）
- [x] 实跑 `validatePrebuiltPaperBundle` / `importPrebuiltPaperBundle --apply`，确认预制卷可导入、发布，并能被运行时选卷。（2026-04-26：补足并发布 GESP-1/easy 验收题资产后，历史验收产物曾使用 `artifacts/prebuilt-papers/paper-packs.json`；2026-04-27 后新产物改用 runId 持久化命名。`validatePrebuiltPaperBundle` summary=1/1/0；`importPrebuiltPaperBundle --apply` 写入 batch=`a231db53-95ae-42de-9860-c5b057a9d791`；随后发布预制卷 `2a2e4c76-e7aa-48b3-9226-36c838220a0c`，按运行时 `status + exam_type + difficulty` 选卷查询可命中，slot=20、totalPoints=100。）
- [x] 为 bundle 增加更丰富的元数据：校验时间、校验器版本、来源批次、provider/model、prompt hash、source timestamp、overlap score 等。（2026-04-26：`QuestionBundleMeta` / `PrebuiltPaperBundleMeta` 增加 `sourceBatchId/sourceBatchIds`、`validation`、`integrity`；prebuilt builder 写入 provider/model/promptHash/sourceBatchId/sourceTimestamp/overlapScore；validator `--write-metadata` 写入 `validatedAt`、`validatorVersion`、checksum algorithm 与 item checksum manifest。2026-04-27 标准漂移复核补齐 `schemaVersion`、`runId`、`createdAt` 为 raw bundle 必填字段，并迁移当前本地 step3 资产到 runId 路径。）
- [x] 如需要对外运营命名，增加薄封装脚本别名：`generate-offline-questions.ts`、`build-paper-packs.ts`、`validate-import-artifacts.ts`，但不复制底层业务逻辑。（2026-04-26：三者均为薄封装；前两者直接转发现有 CLI，`validate-import-artifacts.ts` 只读取 `meta.bundleType` 并分派到现有 validator。）
- [x] 评估是否给 question bundle 增加签名或 checksum 清单，提升导入审计与防篡改能力。（2026-04-26：先落地 item 级 SHA-256 checksum manifest，并在 question/prebuilt validator 中校验；签名暂不引入，原因是需要额外的私钥保管、轮换与验签信任根，当前本地离线导入阶段以 checksum 清单 + import batch raw checksum 满足审计与防篡改基线。）

### 2. Admin 内容库完整闭环

- [x] Admin 题库 CRUD 完整验收：列表、筛选、详情、编辑、删除未引用 draft、发布、归档、引用摘要。（2026-04-26：后端补 `GET /admin/questions/:id/references`；前端 `/admin/questions` 接入列表筛选、详情 JSON 编辑、新建 draft、发布、归档、仅未引用 draft 删除与引用摘要。）
- [x] Admin 预制卷库 CRUD 完整验收：列表、筛选、详情、编辑、删除未引用 draft、发布、归档、引用摘要。（2026-04-26：后端补 `GET /admin/prebuilt-papers/:id/references`，详情返回 slots；前端 `/admin/papers` 接入筛选、详情、slot/metadata 编辑、新建 draft、发布、归档、复制版本与引用摘要。）
- [x] 明确预制卷内容版本 lineage：已发布版本不可原地覆盖，只能复制为新 draft 后再发布。（2026-04-26：`PATCH /admin/prebuilt-papers/:id` 仍只允许 draft；`POST /publish` 增加 draft-only 约束，published/archived 需先 `copy-version` 产生新 draft，保留 root/parent/versionNo lineage。）
- [x] 完成 Admin 导入中心 dry-run/apply 的端到端体验验收，包括错误报告、批次历史、摘要统计与重新导入修复流。（2026-04-26：`/admin/imports` 已展示 dry-run/apply 回显、错误明细、批次历史、摘要统计；失败批次增加“修复重试”入口切回对应 raw bundle 面板，支持修复后再次 dry-run/apply。）
- [x] 落地 Admin 审核队列 UI：展示真题 AI review 差异、人工确认/拒绝、审核备注与历史记录。（2026-04-26：新增 `GET /admin/question-reviews` 与 `/admin/review` 页面，展示 officialAnswerDiff、题目 content/answer/explanation 快照、reviewer notes、reviewedBy/reviewedAt，并调用 confirm/reject。）
- [x] 落地 Admin 用户管理页与系统设置页；当前计划中这两类页面仍被描述为占位。（2026-04-26：router 将 `/admin/users`、`/admin/settings` 从占位页替换为真实页面；用户页接入列表、角色调整、禁用/恢复；设置页接入 `app_settings` 默认值合并展示与 PATCH 更新，step-up/audit 已在后端路由上生效。）
- [x] Admin 设置变更需经过 step-up，并通过 Redis `config:change` 通知所有 API/作业进程刷新配置。（2026-04-26：`PATCH /admin/settings/:key` 已接入 `requireRecentAuth` 与 admin audit；新增运行时配置缓存服务，API、runtime worker、content worker 启动时加载 `app_settings` 并订阅 `config:change`，Admin 设置保存后刷新本进程缓存并发布 Redis 通知。）
- [x] 最终移除或硬收口旧 Admin worker/job/manual generation/inventory 入口，避免重新引入线上生成、库存补货或换题语义。（2026-04-26：后端旧 inventory/manual/generation API 仍保持 404；前端删除 `/admin/jobs` 与 `/admin/manual-gen` 兼容重定向，旧路径进入 404 fallback。）

### 3. 考试运行时与前端恢复体验

- [x] 选卷策略补“最近 attempts 的预制卷软排除”，并保证只作用于模板级，不回到题目级换题/冷却表。（2026-04-26：`POST /exams` 会读取最近 finalized attempts 的 `prebuilt_paper_id`，在同 `examType+difficulty` 的 published 模板候选中软排除；若全部命中排除窗口则降级复用模板，不触碰题目级替换、冷却或库存语义。）
- [x] `startAttempt` 与 submit/finalizer 的并发/CAS 细节继续收口。（2026-04-26：startAttempt 在 `papers.status='draft'` 上 CAS 激活；并发命中已有 started attempt 时幂等返回。finalizer 继续用 `attempts.status='started'` CAS，并把 assignment dueAt 纳入超时判定。）
- [x] autosave 从整包 `answersJson` 覆写收敛到 `jsonb_set()` 单题增量更新。（2026-04-26：`PATCH /attempts/:id` 接收 `patches[]`，按 `slotNo/subKey` 用 `jsonb_set()` 增量写入 `answers_json`。）
- [x] autosave 补 per-user 频控，并与前端 debounce/轮询策略对齐。（2026-04-26：新增 `exam.autosaveRateLimitSeconds=30`，Redis 优先、内存 fallback；前端答题变更 debounce 调整为 30s，并只发送待保存 patch。2026-04-27 复核补齐前端对 `/api/v1/config/client.autosaveIntervalSeconds` 的消费，用该后端配置做周期性 pending patch flush，避免持续输入时长期只依赖 idle debounce。）
- [x] autosave 成功回包不会覆盖飞行中的本地输入。（2026-04-27 标准复核：保存成功后以前端 pending patches 重放到服务端已保存快照上；`beforeunload` 与最终 submit 判断显式纳入 pending patch 数量，手动/自动交卷等待当前 autosave 收尾，避免持续输入时漏保存。）
- [x] 验证 `beforeunload` 最终保存链路，特别是 `fetch(..., { keepalive: true })` 与 `X-Tab-Nonce` / CSRF header 的兼容性。（2026-04-26：前端预取 CSRF token，beforeunload 时用 keepalive PATCH 发送 pending patches，保留 `X-Tab-Nonce` 与 `X-CSRF-Token`；`exam-runtime.test.ts` 已覆盖请求形状。）
- [x] cron 兜底 auto-submit：每 5 分钟扫描超时未提交 attempt，补漏 delayed job 失败场景。（2026-04-26：新增 `examRuntimeMaintenance`，API 与 runtime worker 每 5 分钟扫描 started attempts，按 `min(started_at+duration, assignment.due_at)` 调用 finalizer 落 `auto_submitted`。）
- [x] `GET /api/v1/attempts/active` 补剩余时间字段，前端在 App 启动时自动检测并跳转恢复考试。（2026-04-26：active attempt 返回 `startedAt`、`submitAt`、`remainingMs`、paper 元信息与 `resumePath`；`App.tsx` 启动后自动跳转到 `/exams/:paperId`。）
- [x] 验证 session 过期后重新登录仍可继续同一场答题。（2026-04-26：恢复入口只依赖登录后的 `GET /attempts/active` 与后端 started attempt 状态，不依赖旧前端内存；重新登录后 App gate 会重新检测并恢复。）
- [x] 草稿过期与未开始/未提交的 `abandoned` 回收仍需落地。（2026-04-26：维护循环按 `exam.draftTtlMinutes` 将过期 draft paper 标记为 `abandoned`，任务 draft 同步把 `assignment_progress.pending` 推到 `missed`；已开始但超时未提交的 attempt 走 auto-submit fallback 而不是题目级回收。）
- [x] 浏览器打印输出排版仍需验收，包含试卷页与结果页。（2026-04-26：`print.css` 已纳入全局样式，试卷页新增打印按钮，试卷/结果题卡标记为打印块并补充 A4/overflow/page-break 样式；前端生产构建通过。）
- [x] Dashboard 成绩曲线、答题历史、弱项统计与静态建议区需要完整前端验收。（2026-04-26：`/dashboard` 从占位页切换为真实页面，接入 `/users/me/attempts` 与 `/users/me/stats`，展示成绩曲线、历史、弱项 KP 与静态建议；前端生产构建通过。）
- [x] LLM 诊断报告仍为预留能力；当前 `ai_report_json` 承载的是规则型 wrongs 报告。（2026-04-26：文档口径保持不变，本轮未引入 LLM runtime 诊断，继续把 `ai_report_json` 视为规则型 wrongs 报告承载字段。）

### 4. 教练后台与班级/任务闭环

- [x] 挂载 `/api/v1/classes/join`。（2026-04-28：`server/routes/coach.ts` 已挂载，支持 `code` 或 `inviteToken` 二选一。）
- [x] 挂载 `/api/v1/coach/**` 路由组与后端服务：班级、成员、邀请、任务、报表。（2026-04-28：后端 slice 覆盖 classes/members/invites/coaches/assignments/report；Coach 前端页面仍为后续项。）
- [x] 教练创建/编辑/归档班级，生成与轮换班级码。（2026-04-28：创建者自动成为 owner，归档后拒绝新入班和新邀请。）
- [x] 邀请链接签发、加入、撤销、过期与最大使用次数原子扣减。（2026-04-28：邀请 token 服务端只存 hash，join 用 `UPDATE class_invites SET use_count = use_count + 1` 的条件更新扣减。）
- [x] 学生通过班级码或邀请链接入班；重复入班幂等成功；归档班级拒绝加入。（2026-04-28：重复 membership 返回当前记录，不制造重复行；归档班级拒绝新 membership。）
- [x] 多教练模型完整实现：owner/collaborator 权限、添加/移除教练、转让 owner、Admin 可管理任意班级教练组。（2026-04-28：Coach 路由按 `class_coaches` 授权，Admin 通过 `/api/v1/admin/classes/:id/coaches/**` + step-up/audit 管理任意班级教练组。）
- [x] 教练布置固定预制卷任务，并保证同一 assignment 同一学生只允许一次作答。（2026-04-28：assignment 只绑定 published `prebuilt_paper`；考试创建的 assignment 分支不再重新选卷，改用 `assignments.prebuilt_paper_id`。）
- [x] assignment 截止时间与考试时长共同决定自动提交时间，补 cron 兜底。（2026-04-28：沿用 Phase 11 delayed job + 5 分钟维护循环，assignment draft 创建已接回固定预制卷。）
- [x] `assignment_progress` 补完整 `pending -> in_progress -> completed / missed` 状态流。（2026-04-28：创建 assignment 时给当前 student 成员写 pending；startAttempt/finalizer/维护循环已推进 in_progress/completed/missed。）
- [x] 教练报表只包含班级 assignment attempts，不混入学生自练数据。（2026-04-28：`GET /api/v1/coach/report/:classId` 从 `assignments -> assignment_progress -> attempts` 聚合。）
- [x] coach/admin 以学生身份体验答题的数据需在班级统计中排除。（2026-04-28：基础报表聚合显式过滤 `users.role = 'student'`。）
- [x] 群体热力图、题型统计、学生详情、学生趋势与下钻 Sheet 需要落地和性能验收。（2026-04-28：后端 `GET /api/v1/coach/report/:classId` 已追加 heatmap、questionTypeStats、students、student trend；前端 `/coach/report` 已从占位页切到真实页面，支持班级选择、群体热力图、题型统计、学生详情 Sheet、CSV 导出和打印入口。维护追加已用 Playwright 拦截 API 注入 180 名学生 × 24 个知识点规模化数据，桌面 643ms、移动 2418ms 渲染到第一页热力图，学生详情 Sheet 与题型下钻可用，browser warning/error/pageerror/requestfailed 均为 0；真实生产 p95 继续按性能标准观测。）
- [x] Coach 权限边界验收：只能看到自己参与班级的数据。（2026-04-28：后端 Coach API 均通过 `class_coaches` 关系授权；Coach 前端页面接入与视觉验收仍随下一条 UI 项推进。）

### 5. API 与配置契约补齐

- [x] `/api/v1/config/client` 补齐前端运行时配置字段。（2026-04-27 标准漂移复核：路由已拆到 `server/routes/config.ts`，返回 `autosaveIntervalSeconds`、`examDraftTtlMinutes`、`availableExamTypes`、`availableDifficulties`、`enabledAuthProviders`，并补 OpenAPI 注册和测试覆盖。）
- [x] `/api/v1/docs` Swagger UI 现状口径已对齐。（2026-04-27：`server/routes/health.ts` 仅在 `NODE_ENV=development` 挂载 `/api/v1/docs`；生产不暴露。）
- [x] `app_settings` 的运行时优先级链已落地到运行时配置读取。（2026-04-27 复核：`initializeRuntimeConfigRuntime()` 启动加载 `app_settings`，运行时配置以 `app_settings > .env > 代码默认值` 形成最终生效值；当前适用于 `RUNTIME_SETTING_DEFINITIONS` 中登记的运行时设置。）
- [x] 补 `scripts/initAdmin.ts` 设置首个管理员角色。（2026-04-27：脚本固定用户名 `elder`，从 `ROUND1_INITIAL_ADMIN_PASSWORD` 读取临时密码，强制管理员密码策略，并写入 `password_change_required=true`；首次登录后只能改密或登出。）
- [x] 补版本化 PM2 ecosystem 与统一健康检查脚本。（2026-04-27：新增 `ecosystem.config.cjs`、`scripts/healthcheck.ts`、`npm run healthcheck` 与相关 `ROUND1_*` 环境变量；真实部署演练仍留在运维验收清单。）

### 6. 部署、运维与安全演练

- [ ] 独立域名可访问并完成 Cloudflare Full Strict + Caddy TLS 验证。
- [ ] `GET /api/v1/health`、邮件通道、Turnstile、离线内容环境 `cpp-runner` 与 `contentWorker` 分别完成部署验收。
- [ ] PM2 cluster 模式 2 实例启动与优雅停机演练；生产默认不启动运行时 worker。
- [ ] 静态资源长期缓存头验证。
- [ ] `pg_dump` 备份与 `pg_restore` 临时库恢复校验。
- [ ] Sentry 生产环境 release、采样、敏感信息过滤与事件上报验证。
- [ ] Redis 断开降级演练：已登录用户重新登录，核心答题数据不丢失。
- [ ] SPF / DKIM / DMARC 生效，验证码邮件不进垃圾箱。
- [ ] 系统层安全加固：UFW/iptables、SSH 禁用密码、fail2ban、自动安全更新、非 root 运行服务。
- [ ] 应用层安全加固：`.env` 权限 600、`NODE_ENV=production`、Helmet CSP、CSRF、`__Host-` cookie、`trust proxy = 1`、argon2id。
- [ ] 数据库层安全加固：Postgres 内网监听、应用用户最小权限、`statement_timeout=30s`、备份权限 600。
- [ ] 手动部署 SOP 与回滚流程演练。
- [x] 已纳入 `scripts/healthcheck.ts` 和版本化 `ecosystem.config.cjs`；真实域名、Caddy/TLS、PM2 reload、外部服务 smoke 与回滚仍需实机演练。

### 7. UI/UX 与前端体验收口

- [ ] UI 设计系统中的 tokens、字体托管、组件库、布局、品牌资产、打印样式与 `/dev/ui-gallery` 仍需按当前代码状态逐项验收。（2026-04-27：已新增 `npm run verify:ui-tokens`，阻断 `client/src` TS/TSX 中重新引入原始 hex/rgb/hsl magic color；截图、键盘、移动端、reduced motion 与打印视觉验收仍需继续收口。2026-04-28：已安装 Google A2UI，并在 `/dev/ui-gallery` 增加 A2UI token bridge 示例，用于后续 agent UI/UX 设计辅助验收；现有 Radix/shadcn 生产组件作为受控辅助实现。同日已扩展 `verify:ui-tokens` 阻断 JSX inline style、`color-mix()` 与 `min-height:auto` / `min-width:auto` 兼容告警回归，并将字体运行时源收口到公开 R2 `/font/`。维护追加已把 A2UI 扩展到 Round1 BYOC custom catalog，并用本地 Card/Badge/Progress 渲染 CoachReport snapshot；`/dev/ui-gallery#plate-11` 浏览器复查 A2UI BYOC 可见且 warning/error 为 0。）
- [ ] AI 智能建议文案模板为 v2 事项；MVP 可保持静态规则或占位。
- [ ] QQ 互联登录视觉需随 feature flag 流程一起补齐。
- [x] CppLearn 登录视觉需补齐：`贝塔问天录` 字标使用 HYShangWeiShouShuW 字体，字体通过 `/font/HYShangWeiShouShuW.woff2` 同源代理加载。（2026-04-28：`/login` 已接入真实 AuthLayout 分栏与 CppLearn OIDC provider 入口，`client/public/fonts/README.md` 记录该字体对象来源。）
- [ ] i18n 多语言为未来扩展项。
- [ ] 字体当前设计为 Cloudflare R2 自托管，后续可迁国内 CDN。
- [ ] ExamResult 揭晓动画、Dashboard 雷达/热力图、打印 A4 样式仍需 Playwright/视觉验收覆盖；CoachReport 下钻与打印标记已在 2026-04-28 维护追加中覆盖。

### 8. 外部对接与 feature flag

- [ ] QQ 互联在 `AUTH_PROVIDER_QQ_ENABLED=1` 时的登录、注册、绑定流程仍未在 Step 02 清单中勾选。
- [ ] CppLearn OP 侧测试清单仍需联调确认：Discovery、JWKS、Authorization、Token、PKCE、nonce、aud、一次性 code、redirect_uri 严格匹配、HTTPS 全链路。
- [ ] CppLearn 当前邮箱 claim 可能为空字符串；Round1 侧必须继续按“存在但不可作为可绑定邮箱事实源”处理。

## 建议执行顺序

1. **先完成内容资产闭环**：真题复核、LLM/判官实跑、question bundle 与 prebuilt paper bundle apply、首批可发布预制卷。
2. **再补考试可靠性**：active attempt 恢复、autosave 增量与频控、cron auto-submit、session 过期恢复、打印验收。
3. **随后推进教练闭环**：班级/邀请/任务/报表 API 与页面，确保 assignment 与考试状态机连通。
4. **最后做上线演练**：健康检查、PM2/Caddy/TLS、备份恢复、Sentry、邮件 DNS、安全加固与回滚。

## 继续维护建议

- 每完成一个大项，同步更新对应 `plan/step-*.md` 的验证清单，避免本文件和源计划再次漂移。
- 对已经被新实现覆盖的旧 `docs/plans/*`，可追加状态说明或归档标记，降低后续误读概率。
- 新增计划时优先写“现状 / 目标 / 已落地 / 剩余 backlog”四段，避免旧实现任务和当前收口任务混在一起。
