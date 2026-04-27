# Reference — 配置与目录结构

> 本文件从 [01-reference.md](01-reference.md) 拆分而来。完整参考索引见 [01-reference.md](01-reference.md)。
> **当前对齐说明（2026-04-26）**：本文件描述的是“仓库内已存在的配置与目录结构”，不是部署环境的外部资产清单。`config/env.ts` 是环境变量的唯一代码级真源；PM2 ecosystem 文件当前不在仓库版本管理内。Step 06 已收口到“两层架构 + production no-runner”：运行时 worker 入口位于 `server/services/worker/worker.ts`，离线内容 worker 入口位于 `scripts/workers/contentWorker.ts`。

---

## 关键决策（完整）

| #   | 决策项                  | 选择                                                                                                                                                                                                 |
| --- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 后端部署                | `Node 24 LTS` + `Express 5` + `TypeScript` 独立进程（`server/`），监听独立端口（默认 `:5100`），Caddy 按域名反代                                                                                     |
| 2   | 前端部署                | `React 19` + `TypeScript` + `Vite` + `React Router 7` + `TanStack Query v5` + `shadcn/ui` + `Tailwind CSS` + `react-hook-form`（`client/`），独立域名、独立构建产物                                  |
| 3   | 代码存放                | 独立项目 `Round1/`，独立 Git 仓库；除 CppLearn OIDC 对接外，与其无代码依赖                                                                                                                           |
| 4   | 数据库                  | `postgreSQL 18` 独立数据库 `round1`，通过 `pg` 驱动 + `drizzle-orm` 访问（schema 版本化迁移）；自有 `users` 表；session 不落库，交给 Redis                                                           |
| 5   | LLM 客户端              | 基于 `Vercel AI SDK (ai)` 统一多供应商路由；server 与 scripts 共享 `config/llm.ts` 的 scene 路由，支持 `provider:model` 级别配置（`generate` / `judge` / `rewrite` / `paper_audit` / `answer_fill`） |
| 6   | 内容生产策略            | 开发环境离线生成 question bundle 与 prebuilt paper bundle；生产环境只支持导入、发布、归档                                                                                                            |
| 7   | 视觉风格                | 独立双主题（Light / Dark），学院竞赛风：纯白底 + 深色文字 + 亮色品牌色块，类 Codeforces/AtCoder 风格                                                                                                 |
| 8   | 用户与权限              | 自有账号体系，`role` 字段区分 student / coach / admin；V1 单账号单角色                                                                                                                               |
| 9   | Worker                  | `BullMQ + Redis` 仅承担考试超时自动提交等运行时作业，不再承担题目生成与库存补货                                                                                                                      |
| 10  | 试卷类型                | 10 个试卷类型：CSP-J、CSP-S、GESP-1 ~ GESP-8                                                                                                                                                         |
| 11  | 题型范围                | 三类：单选(15) + 阅读程序(3×5) + 完善程序(2×5) = 100 分                                                                                                                                              |
| 12  | 输出形式                | `@media print` 浏览器打印保存 PDF，服务器零压力                                                                                                                                                      |
| 13  | 知识点数据源            | `初赛讲义.pdf` + CSP-J/S 历年真题(2020-2025) + GESP 1~8 级历年真题（仅 C++），每题 1 主 + 0~3 辅知识点                                                                                               |
| 14  | 嵌入去重                | MVP 仅规则去重（`content_hash` + Jaccard ≥ 0.85）；向量去重推迟到后续迭代                                                                                                                            |
| 15  | 选卷策略                | 从已发布 `prebuilt_papers` 中按 `exam_type + difficulty` 选择，并对最近作答的预制卷做 paper 级软排除                                                                                                 |
| 16  | 自练入口                | 允许用户直接创建预制卷实例，不再设置线上 AI 组卷冷却                                                                                                                                                 |
| 17  | 题目解析                | 每题自带正误原因分析；阅读/完善程序采用整体逻辑分析                                                                                                                                                  |
| 18  | 登录态                  | `express-session` + `connect-redis` + `__Host-Round1.sid`（httpOnly/Secure/SameSite/Path=/，无 Domain）；idle TTL + absolute TTL                                                                     |
| 19  | 认证方案                | 本地账号为主；CppLearn OIDC 首发；QQ互联 feature flag；Passkey 并行入口                                                                                                                              |
| 20  | 防滥用                  | Turnstile + 前端自适应 PoW + 临时邮箱黑名单 + 设备指纹 + 分层 Rate Limit                                                                                                                             |
| 21  | 部署方案                | 两层部署：生产运行时 Caddy + API + Redis + Postgres；离线内容环境独立承载 cpp-runner / content worker                                                                                                |
| 22  | 代理信任拓扑            | Cloudflare → Caddy → Express 一跳；`trust proxy = 1`                                                                                                                                                 |
| 23  | Cookie 前缀与本地 HTTPS | 全环境 `__Host-` 前缀 + `mkcert` 本地 HTTPS                                                                                                                                                          |
| 24  | 频控分层防线            | L1 Cloudflare WAF + L2 Redis + L3 进程内 Map fail-closed                                                                                                                                             |
| 25  | API 规范                | OpenAPI 3.1，Zod schema via `@asteasolutions/zod-to-openapi` 自动生成                                                                                                                                |

---

## 代码目录布局

```
Round1/
├─ package.json                    → npm workspaces（server, client）+ engines: node>=24
├─ tsconfig.json                   → TypeScript 基础配置
├─ vitest.config.ts / playwright.config.ts
├─ .env / .gitignore / eslint.config.js / prettier.config.js
│                                   → PM2 ecosystem 文件由部署环境自行维护，当前不在仓库版本管理内
├─ cpp-runner/                     → 独立 C++ 隔离执行器
│   ├─ Dockerfile / entrypoint.sh / package.json
├─ certs/                          → 本地 HTTPS 开发证书（.gitignore）
├─ data/backups/                   → Postgres 逻辑备份
├─ papers/                         → 真题源文件与可导入离线题目产物
│   ├─ real-papers/                → 历年真题（csp-j/ csp-s/ gesp/）
│   └─ <year>/<runId>/question-bundles/
│                                    → 已生成、已校验、可直接导入的 question bundle（runId 持久化命名）
├─ prompts/                        → Prompt 模板 + few-shot + taxonomy + manual-output/
├─ config/                         → env.ts / auth.ts / llm.ts / blueprint.ts / sandbox.ts / temp-email-blocklist.txt
├─ server/
│   ├─ package.json / tsconfig.json
│   ├─ index.ts / app.ts / db.ts
│   ├─ db/migrations/
│   ├─ openapi/                    → registry.ts / generator.ts
│   ├─ routes/                     → auth.ts / exams.ts / health.ts / admin.ts
│   │   └─ schemas/                → auth.schema.ts / exams.schema.ts / adminContent.schema.ts / common.schema.ts / ...
│   ├─ middleware/                  → auth.ts / requireRecentAuth.ts / adminAudit.ts / csrf.ts / responseWrapper.ts / rateLimit.ts / validate.ts
│   ├─ db/schema/                  → user / userEmail / externalIdentity / passkeyCredential / authChallenge / authTicket / authAuditLog / adminAuditLog / question / paper / attempt / class / classInvite / assignment / ...
│   ├─ repositories/
│   ├─ services/
│   │   ├─ auth/                   → email / oidc / provider / passkey / totp / session / turnstile / risk + templates/
│   │   ├─ mail/                   → index.ts（SMTP / Resend / 腾讯云 SES）
│   │   ├─ llm/                    → index.ts + prompts/ + schemas.ts
│   │   ├─ sandbox/                → cppRunner.ts / policies.ts
│   │   ├─ worker/                 → worker.ts / sandboxVerifyProcessor.ts
│   │   └─ imports/ / prebuiltPaperSelector.ts / questionLibraryService.ts / prebuiltPaperLibraryService.ts / grader.ts / reportBuilder.ts / classService.ts / classInviteService.ts / assignmentService.ts / ...
│   └─ __tests__/                  → unit/ / integration/ / e2e/
├─ client/
│   ├─ package.json / index.html / vite.config.ts / tailwind.config.ts
│   └─ src/
│       ├─ main.tsx / App.tsx / router.tsx / queryClient.ts
│       ├─ styles/                 → globals.css / print.css
│       ├─ pages/                  → Login / Register / AuthCallback / ForgotPassword / AccountSecurity / Dashboard / ExamNew / Exam / ExamResult / JoinClass / Coach* / Admin
│       ├─ components/ / hooks/ / api/
├─ scripts/
│   ├─ generateQuestionBundle.ts / validateQuestionBundle.ts / importQuestionBundle.ts
│   ├─ buildPrebuiltPaperBundle.ts / validatePrebuiltPaperBundle.ts / importPrebuiltPaperBundle.ts
│   ├─ auditRealPapers / reviewRealPapers / rewritePaperExplanations / ingestRealPapers / importManualQuestions / updateAnswersInDB / bootstrapKnowledgePoints / seedBlueprint / dev-setup / migrate / db-stats
│   └─ workers/contentWorker.ts    → 离线内容环境 worker 入口
```

---

## 环境变量配置（`.env`）

```env
# 服务
PORT=5100
NODE_ENV=development

# 数据库
DATABASE_URL=postgres://round1:round1@127.0.0.1:5432/round1
DATABASE_POOL_MAX_API=10
DATABASE_POOL_MAX_WORKER=5
DATABASE_STATEMENT_TIMEOUT_MS=30000

# 认证
SESSION_SECRET=<高熵密钥>
TOTP_ENCRYPTION_KEK=<高熵 KEK 密钥>
SESSION_COOKIE_SECURE=1
SESSION_COOKIE_SAMESITE=lax
SESSION_IDLE_MINUTES=480
SESSION_ABSOLUTE_MINUTES=10080
EXAM_DRAFT_TTL_MINUTES=1440
SESSION_STORE=redis
AUTH_TURNSTILE_SITE_KEY=
AUTH_TURNSTILE_SECRET_KEY=
AUTH_POW_ENABLED=1
AUTH_POW_BASE_DIFFICULTY=18
AUTH_TEMP_EMAIL_BLOCKLIST_PATH=./config/temp-email-blocklist.txt
AUTH_EMAIL_CODE_EXPIRES_SECONDS=600
AUTH_EMAIL_CODE_RESEND_SECONDS=60
AUTH_EMAIL_CODE_MAX_PER_EMAIL_PER_HOUR=5
AUTH_EMAIL_CODE_MAX_PER_IP_PER_10M=20
AUTH_FORGOT_PASSWORD_MAX_PER_EMAIL_PER_HOUR=3
AUTH_LOGIN_FAIL_PER_ACCOUNT_PER_15M=10
AUTH_LOGIN_FAIL_PER_DEVICE_PER_10M=20
AUTH_REGISTER_PER_IP_PER_10M=20
AUTH_STEP_UP_WINDOW_MINUTES=10
APP_PUBLIC_URL=https://round1.local
APP_API_ORIGIN=https://round1.local
TRUST_PROXY_HOPS=1
DEV_HTTPS_CERT=./certs/dev-cert.pem
DEV_HTTPS_KEY=./certs/dev-key.pem

# 邮件
MAIL_PROVIDER=resend
MAIL_FROM=
RESEND_API_KEY=
# POSTMARK_SERVER_TOKEN=
# TENCENT_SES_SECRET_ID=
# TENCENT_SES_SECRET_KEY=
# TENCENT_SES_REGION=

# 第三方身份
AUTH_PROVIDER_QQ_ENABLED=0
QQ_CONNECT_CLIENT_ID=
QQ_CONNECT_CLIENT_SECRET=
QQ_CONNECT_REDIRECT_URI=
CPPLEARN_OIDC_ISSUER=
CPPLEARN_OIDC_CLIENT_ID=
CPPLEARN_OIDC_CLIENT_SECRET=
CPPLEARN_OIDC_REDIRECT_URI=

# LLM
# 推荐直接配置 provider lane；离线 scripts 与审核脚本共用同一组 provider-direct 路由解析逻辑
# scene:
#   generate     -> 离线题目生成脚本
#   judge        -> 离线判官/审核脚本
#   rewrite      -> scripts/rewritePaperExplanations.ts
#   paper_audit  -> scripts/reviewRealPapers.ts
#   answer_fill  -> 答案回填/补全脚本
# 当前 provider-direct 方案只保留 2 条 lane：
#   LLM_PROVIDER_DEFAULT -> 主 lane provider slug
#   LLM_PROVIDER_BACKUP  -> 备用 lane provider slug
# 日常脚本入口不写 provider 覆盖参数；显式 route override 仅用于内部诊断，
# 并限制在 deepseek / xiaomi / alibaba / minimax 四个 provider 内。
# 示例：
# LLM_PROVIDER_DEFAULT=xiaomi
# LLM_PROVIDER_BACKUP=deepseek
# LLM_REASONING_DEFAULT=xhigh>high>default
# LLM_REASONING_SUMMARY_DEFAULT=auto
LLM_PROVIDER_DEFAULT=
LLM_PROVIDER_BACKUP=
LLM_REASONING_DEFAULT=
LLM_REASONING_SUMMARY_DEFAULT=
OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-5.4-mini
ANTHROPIC_API_KEY=
ANTHROPIC_BASE_URL=https://api.anthropic.com/v1
ANTHROPIC_MODEL=claude-sonnet-4-20250514
GOOGLE_API_KEY=
GOOGLE_BASE_URL=https://generativelanguage.googleapis.com/v1beta
GOOGLE_MODEL=gemini-2.5-flash
XIAOMI_API_KEY=
XIAOMI_BASE_URL=https://api.xiaomimimo.com/v1
XIAOMI_MODEL=mimo-v2.5-pro
ALIBABA_API_KEY=
ALIBABA_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
ALIBABA_MODEL=qwen3.6-plus
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-pro
MOONSHOTAI_API_KEY=
MOONSHOTAI_BASE_URL=https://api.moonshot.ai/v1
MOONSHOTAI_MODEL=kimi-k2.5
OPENROUTER_API_KEY=
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_MODEL=openai/gpt-5.2
MINIMAX_API_KEY=
MINIMAX_BASE_URL=https://api.minimax.io/v1
MINIMAX_MODEL=MiniMax-M2.7
VOLCENGINE_API_KEY=
VOLCENGINE_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
VOLCENGINE_MODEL=doubao-seed-2-0-lite-260215
XAI_API_KEY=
XAI_BASE_URL=https://api.x.ai/v1
XAI_MODEL=grok-3-beta

# Sandbox
SANDBOX_RUNNER_URL=http://127.0.0.1:6100
SANDBOX_RUNNER_IMAGE=cpp-runner:latest
SANDBOX_RUNNER_RUNTIME=runsc
SANDBOX_COMPILE_TIMEOUT_MS=10000
SANDBOX_TIMEOUT_MS=1000
SANDBOX_MEM_MB=256
SANDBOX_PIDS_LIMIT=64

# Redis / Worker
REDIS_URL=redis://127.0.0.1:6379
ROUND1_WORKER_ENABLED=0              # 生产默认关闭运行时 worker；离线内容环境单独启 content worker
ROUND1_WORKER_CONCURRENCY=3


# 其他
MIN_ASSIGNMENT_START_MINUTES=1
AUTOSAVE_INTERVAL_SECONDS=180          # 前端轮询间隔（通过 GET /api/v1/config/client 下发）；后端另有 1次/30s 兜底限频

```

> 邮件 provider、LLM provider lane、worker 开关与默认值以 `config/env.ts` 为准；本节示例仅保留最常用部署骨架，避免与代码真源重复漂移。
