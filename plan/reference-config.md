# Reference — 配置与目录结构

> 本文件从 [01-reference.md](01-reference.md) 拆分而来。完整参考索引见 [01-reference.md](01-reference.md)。
> **当前对齐说明（2026-04-27）**：本文件描述的是“仓库内已存在的配置与目录结构”，不是部署环境的外部资产清单。`config/env.ts` 是环境变量的唯一代码级真源；版本化 PM2 ecosystem 位于 `ecosystem.config.cjs`，运行时 worker 与离线内容 worker 均通过显式环境变量开关启用。Step 06 已收口到“两层架构 + production no-runner”：运行时 worker 入口位于 `server/services/worker/worker.ts`，离线内容 worker 入口位于 `scripts/workers/contentWorker.ts`。

---

## 关键决策（完整）

| #   | 决策项                  | 选择                                                                                                                                                                                                 |
| --- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 后端部署                | Node.js `>=24.15.0` + npm `>=11.12.1` + `Express 5` + `TypeScript` 独立进程（`server/`），监听本机端口（默认 `127.0.0.1:7654`），Caddy 按域名反代                                                    |
| 2   | 前端部署                | `React 19` + `TypeScript` + `Vite` + `React Router 7` + `TanStack Query v5` + `shadcn/ui` + `Tailwind CSS` + `react-hook-form`（`client/`），独立域名、独立构建产物                                  |
| 3   | 代码存放                | 独立项目 `Round1/`，独立 Git 仓库；除 CppLearn OIDC 对接外，与其无代码依赖                                                                                                                           |
| 4   | 数据库                  | `postgreSQL 18` 独立数据库 `round1`，通过 `pg` 驱动 + `drizzle-orm` 访问（schema 版本化迁移）；自有 `users` 表；session 不落库，交给 Redis                                                           |
| 5   | LLM 客户端              | 基于 `Vercel AI SDK (ai)` 统一多供应商路由；server 与 scripts 共享 `config/llm.ts` 的 scene 路由，支持 `provider:model` 级别配置（`generate` / `judge` / `rewrite` / `paper_audit` / `answer_fill`） |
| 6   | 内容生产策略            | 开发环境离线生成 question bundle 与 prebuilt paper bundle；生产环境只支持导入、发布、归档                                                                                                            |
| 7   | 视觉风格                | Modern Editorial × Contest Ceremony，Light / Dark 双主题，品牌红 + 中性灰阶；当前视觉真源为 `plan/uiux_plan.md` 与 `standard/04-ui-ux.md`                                                            |
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
├─ package.json                    → npm workspaces（server, client）+ engines: node>=24.15.0, npm>=11.12.1
├─ tsconfig.json                   → TypeScript 基础配置
├─ vitest.config.ts / playwright.config.ts
├─ .env / .gitignore / eslint.config.js / prettier.config.js
├─ ecosystem.config.cjs             → 版本化 PM2 ecosystem：API cluster + 可选 runtime/content worker
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
│   ├─ routes/                     → auth.ts / config.ts / exams.ts / health.ts / admin.ts
│   │   └─ schemas/                → auth.schema.ts / exams.schema.ts / adminContent.schema.ts / common.schema.ts / ...
│   ├─ middleware/                  → auth.ts / authRateLimit.ts / requireRecentAuth.ts / adminAudit.ts / responseWrapper.ts / validate.ts
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
│   ├─ questionBundle.ts / prebuiltPaperBundle.ts   → 离线 bundle 对外稳定入口
│   ├─ collect.ts / ingest.ts / review.ts / audit.ts / maintenance.ts
│   ├─ commands/                                   → 具体脚本实现
│   └─ workers/contentWorker.ts                    → 离线内容环境 worker 入口
```

---

## 环境变量配置（`.env`）

`config/env.ts` 是默认值真源；`.env.example` 只保留最小模板，避免把单机部署默认值重复写进环境文件。Redis、worker、sandbox、连接池、session TTL、认证频控、PM2、healthcheck、trust proxy、本地 HTTPS 证书、autosave 与 assignment timing 等默认值均由代码或初始化脚本承接，部署时只有确实需要覆盖拓扑时才写入 `.env`。

生成最小配置骨架：

```bash
npm run env:init -- --profile local --print
npm run env:init -- --profile production-runtime --print
npm run env:init -- --profile offline-content --print
```

高熵密钥生成命令：

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

生产运行时 `.env` 建议只保留以下骨架，并把真实域名、数据库口令和服务凭证替换为部署值：

```env
NODE_ENV=production
DATABASE_URL=postgres://round1:<数据库密码>@127.0.0.1:4397/round1
APP_PUBLIC_URL=https://round1.example.com
APP_API_ORIGIN=https://round1.example.com

SESSION_SECRET=<高熵密钥>
TOTP_ENCRYPTION_KEK=<高熵 KEK 密钥>
ROUND1_INITIAL_ADMIN_PASSWORD=

MAIL_PROVIDER=resend
MAIL_FROM=Round1 <no-reply@round1.example.com>
RESEND_API_KEY=
# POSTMARK_SERVER_TOKEN=
# TENCENT_SES_SECRET_ID=
# TENCENT_SES_SECRET_KEY=
# TENCENT_SES_REGION=ap-hongkong

AUTH_TURNSTILE_SITE_KEY=
AUTH_TURNSTILE_SECRET_KEY=

CPPLEARN_OIDC_ISSUER=
CPPLEARN_OIDC_CLIENT_ID=
CPPLEARN_OIDC_CLIENT_SECRET=
CPPLEARN_OIDC_REDIRECT_URI=

R2_PUBLIC_BASE_URL=
```

离线内容环境才需要补充 LLM 和 runner 相关配置，例如：

```env
ROUND1_PM2_ENABLE_CONTENT_WORKER=1
SANDBOX_RUNNER_URL=http://127.0.0.1:4401
LLM_PROVIDER_DEFAULT=alibaba
LLM_PROVIDER_BACKUP=deepseek
ALIBABA_API_KEY=
ALIBABA_MODEL=qwen3.6-plus
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-v4-pro
LLM_REASONING_DEFAULT=max>xhigh>high>medium>default
LLM_THINKING_TYPE_DEFAULT=enabled
LLM_THINKING_BUDGET_DEFAULT=default
LLM_REASONING_SUMMARY_DEFAULT=auto
```

LLM provider 变量面以 `config/llm.ts` 与 `.env.example` 为准。当前 `LLM_PROVIDER_DEFAULT` / `LLM_PROVIDER_BACKUP` 支持以下 provider slug；每个 provider 均按对应前缀配置 `<PREFIX>_API_KEY`、可选 `<PREFIX>_BASE_URL` 与 `<PREFIX>_MODEL`：

| provider slug | env prefix   | 备注                                            |
| ------------- | ------------ | ----------------------------------------------- |
| `openai`      | `OPENAI`     | OpenAI 官方接口                                 |
| `anthropic`   | `ANTHROPIC`  | Anthropic 官方接口                              |
| `google`      | `GOOGLE`     | Google Gemini 接口                              |
| `xiaomi`      | `XIAOMI`     | OpenAI-compatible provider path                 |
| `alibaba`     | `ALIBABA`    | DashScope compatible-mode                       |
| `moonshotai`  | `MOONSHOTAI` | Moonshot AI / Kimi 接口                         |
| `openrouter`  | `OPENROUTER` | `OPENROUTER_MODEL` 必须使用 `vendor/model` 格式 |
| `deepseek`    | `DEEPSEEK`   | DeepSeek 接口                                   |
| `minimax`     | `MINIMAX`    | MiniMax 接口                                    |
| `volcengine`  | `VOLCENGINE` | 火山方舟接口                                    |
| `xai`         | `XAI`        | xAI 接口                                        |
| `zai`         | `ZAI`        | Z.ai / BigModel 接口                            |

字体当前需要在 `${R2_PUBLIC_BASE_URL}/font/` 下提供 Geist、HarmonyOS、Fraunces 与 Source Han Serif SC。CppLearn OIDC 横幅图片由 CppLearn 提供并上传到 `${R2_PUBLIC_BASE_URL}/logo/cpplearn.jpg`；运行时页面只引用同源 `/logo/cpplearn.jpg`。

端口设计与暴露面见 `docs/plans/2026-04-28-port-map-and-exposure-plan.md`。单机部署时 `PORT=7654`、`ROUND1_BIND_HOST=127.0.0.1`、`REDIS_URL=redis://127.0.0.1:4395` 与离线 runner 默认值均已在 `config/env.ts` 中定义；生产 `.env` 通常只需要写 `DATABASE_URL`、密钥、域名和真实外部服务凭证。生产公网入口只开放 Caddy `80/443` 与 SSH `9179`。`Caddyfile.example` 为独立配置文件，不从 `.env` 读取域名、静态目录、API upstream、日志路径或 R2 源站；部署时直接修改 Caddyfile 中的字面量。Caddy 默认协议集为 `h1/h2/h3`；不要只配置 `h2/h3`，因为当前 `h2` 仍需要 `h1`。若保留 Caddy HTTP/3，同一 `443` 还需允许 UDP；若使用 `MAIL_PROVIDER=tencent-ses`，需要允许 SMTP 465 出站。若重新设计端口，必须同步 `config/env.ts` 默认值或明确的 `.env` 覆盖、`docker-compose.dev.yml`、`Caddyfile.example`、Vite proxy、healthcheck、`.env.example` 可选覆盖提示与部署 runbook。

> 邮件提供商、大模型提供商通道、工作器开关与默认值以 `config/env.ts` 为准；本节示例仅保留最常用部署骨架，避免与代码真源重复漂移。
