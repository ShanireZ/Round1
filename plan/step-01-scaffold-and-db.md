# Step 01 — 脚手架与数据库基础（Phase 0 ~ 1）

> **前置依赖**：无
> **交付物**：可运行的 TypeScript 项目骨架 + 已初始化的 PostgreSQL 数据库
> **可验证 demo**：`npm run dev:server` 启动，`/api/v1/health` 200，`/api/v1/openapi.json` 返回合法 OpenAPI 3.1 Document

---

## Phase 0 — TypeScript 脚手架

### 0.1 项目初始化

- 创建 `package.json`（npm workspaces: `["server", "client"]`）+ `engines: { "node": ">=24.15.0", "npm": ">=11.12.1" }`
- 创建 `server/package.json`（依赖：express, pg, drizzle-orm, ioredis, redis, connect-redis, bullmq, ai@^6.0, @ai-sdk/*, nodemailer, helmet, pino, pino-http, csrf-sync, express-rate-limit, rate-limit-redis, @sentry/node, @asteasolutions/zod-to-openapi, swagger-ui-express, @simplewebauthn/server, zod, argon2, zxcvbn 等；迁移执行由 `scripts/migrate.ts` 负责）
- 创建 `client/package.json`（依赖：react, vite, tailwindcss, @radix-ui/*, react-hook-form, @hookform/resolvers, @simplewebauthn/browser, @sentry/react, @tanstack/react-query, @fingerprintjs/fingerprintjs 等）
- 根 `tsconfig.json` + `server/tsconfig.json`（extends 根配置）
- `eslint.config.js` + `prettier.config.js`
- `.gitignore`（含 `certs/`、`node_modules/`、`dist/`、`data/backups/`）
- `.env` 模板（参见 [01-reference.md](reference-config.md#环境变量配置env)）

### 0.2 Express 骨架

- `server/index.ts` — 入口：加载 `.env`、启动 Express 监听（HTTPS 开发 / HTTP 生产）
- `server/app.ts` — Express 应用配置 + 中间件栈顺序：
  1. `helmet`（含 CSP 配置 — 允许 Cloudflare Turnstile）
  2. `pino-http`
  3. `express.json()`
  4. `express-session` + `connect-redis`
  5. `csrf-sync`（同步器 token）
  6. `rateLimit`（Redis + 进程内 Map fallback）
  7. `responseWrapper`
  8. 路由挂载

> 中间件顺序的完整定义见 [01-reference.md](01-reference.md)，此处仅为摘要。
- `server/middleware/responseWrapper.ts` — 统一 JSON 信封 `{ success, data, error }`
- `app.set('trust proxy', 1)` — 严禁 `true`

### 0.3 Express 5 中间件兼容性验证

Phase 0 必须逐一实测以下中间件在 Express 5 下的兼容性：

| 包                                  | 预期状态 | 说明                                                                |
| ----------------------------------- | -------- | ------------------------------------------------------------------- |
| `helmet` v8+                        | ✅        | 已确认兼容                                                          |
| `express-rate-limit` v7+            | ✅        | 已确认兼容                                                          |
| `pino-http`                         | ✅        | 已确认兼容                                                          |
| `csrf-sync`                         | ✅        | 已确认兼容（Express 5.1 + csrf-sync 4.x，POST 无 token → 403 JSON） |
| `swagger-ui-express`                | ✅        | 已确认兼容（`/api/v1/docs` 返回 200 HTML）                          |
| `express-session` + `connect-redis` | ✅        | 已确认兼容；OIDC 302 回调需在 step-02 完成 OIDC 集成后验证          |

> **Phase 0 实测要求**：除上表外，还需验证 `csrf-sync` 同步器 token 与 `express-session` 在 Express 5 下正常协作。

若不兼容则及时回退 Express 4 或替换为等效包。

### 0.4 Vite + 前端骨架

- `client/vite.config.ts` — HTTPS 开发（读取 `certs/dev-*.pem`）+ `server.proxy` 将 `/api/v1/*` 代理到 `:5100`
- `client/index.html` + `client/src/main.tsx` + `client/src/App.tsx`
- `client/src/router.tsx` — React Router 7 路由骨架（占位页面）
- `client/src/queryClient.ts` — TanStack Query 初始化
- `client/tailwind.config.ts` — 竞赛风主题变量（Light/Dark 双主题）
- `client/src/styles/globals.css` — Tailwind directives + CSS 主题变量

### 0.5 双主题 CSS 变量

> **当前对齐说明（2026-04-27）**：Phase 0 的早期“纯白 + 蓝/橙色块”脚手架口径已被 `plan/uiux_plan.md` 定稿覆盖。当前 UI 目标是 Modern Editorial × Contest Ceremony：Light 底色 `#FEF9F8`、Dark 底色 `#0A0E1A`、品牌红 `#E63946`、中性灰阶和 token 化组件。实现路径以 `client/src/styles/tokens.css`、`client/src/styles/globals.css` 与 `standard/04-ui-ux.md` 为准。

- Light/Dark 主题变量集中在 `client/src/styles/tokens.css` 与 `client/src/styles/globals.css`。
- 页面和组件不得重新引入独立蓝/橙主题或 Codeforces/AtCoder 风格。
- 新增颜色必须进入 token 或已有语义色，不在页面里散落 magic color。

### 0.6 OpenAPI 3.1 骨架

- `server/openapi/registry.ts` — 全局 `OpenAPIRegistry` 单例
- `server/openapi/generator.ts` — 启动时生成 OpenAPI 3.1 JSON → 内存缓存
- `GET /api/v1/openapi.json` — 返回缓存 JSON（开发无鉴权；非开发环境需 admin session）
- `GET /api/v1/docs` — `swagger-ui-express`（仅 `NODE_ENV=development`）
- `server/routes/schemas/common.schema.ts` — 通用分页 / 错误响应 schema

### 0.7 Sentry 基础集成

- `@sentry/node` — 后端未处理异常捕获
- `@sentry/react` — 前端运行时错误捕获
- 生产完善配置延后至 Phase 14

### 0.8 本地 HTTPS 开发环境

- `npm run dev:setup` 脚本封装：`mkcert -install` + 证书生成 + hosts 提示
- `certs/` 目录进 `.gitignore`
- 全环境统一使用 `__Host-Round1.sid`，不做 dev 降级

### 0.9 测试框架初始化

- `vitest.config.ts` — 单元/集成测试配置
- `playwright.config.ts` — E2E 配置

---

## Phase 1 — 数据库连接与版本化迁移

### 1.1 数据库连接

- `server/db.ts` — `pg.Pool` + `drizzle-orm` 客户端 + 迁移加载器
- 连接池配置详见 [01-reference.md — 连接池配置](01-reference.md)
- `scripts/migrate.ts` — 迁移运行器（`up` / `down` / `status`）

> **Worker 与 API 分离**：Worker 与 API 共享 `server/` 代码库，但通过不同入口文件启动（`server/index.ts` vs `server/worker.ts`），通过 `DATABASE_POOL_MAX_API` / `DATABASE_POOL_MAX_WORKER` 环境变量配置不同连接池大小。

### 1.2 首批迁移文件

按模块拆分为 5 个迁移文件，顺序执行：

**迁移 1 — 用户与认证** (`001_users_and_auth.ts`)
- `users`（含 `session_version`、`last_strong_auth_at`、`totp_secret_enc`、`totp_enabled_at`、`status`(active/locked/deleted)、`deleted_at`）
- `user_emails`
- `external_identities`
- `passkey_credentials`
- `auth_challenges`
- `auth_tickets`
- `auth_audit_logs`

**迁移 2 — 题库与蓝图** (`002_question_bank.ts`)
- `knowledge_points`
- `questions` + `question_reviews` + `question_exam_types` + `question_kp_tags`
- `blueprints`

**迁移 3 — 预制卷、考试与成绩** (`003_exam_and_grading.ts`)
- `prebuilt_papers` + `prebuilt_paper_slots`
- `papers` + `paper_question_slots`
- `attempts`

**迁移 4 — 班级与任务** (`004_classes_and_assignments.ts`)
- `classes`
- `class_coaches`（多教练 M2M：`(class_id, user_id)` 联合 PK + `role` + `added_at`）
- `class_members` + `class_invites`
- `assignments` + `assignment_progress`

**迁移 5 — 系统与日志** (`005_system_and_logs.ts`)
- `admin_audit_logs`
- `import_batches`
- `llm_provider_logs`
- `app_settings`

> **注意**：`schema_migrations` 表由迁移运行器自动创建与管理，无需人工建表。

### 1.3 关键索引

参见 [01-reference.md 关键索引](reference-schema.md#关键索引)。

### 1.4 枚举 CHECK 约束

所有 `exam_type` 列添加 `CHECK(exam_type IN ('CSP-J','CSP-S','GESP-1',...,'GESP-8'))` 约束。

### 1.5 数据模型层

- `server/db/schema/*.ts` — 每表一个 Drizzle schema 定义文件

---

## 验证清单

- [x] `npm install` 成功（server + client）
- [x] `npm run dev:server` 启动，`/api/v1/health` 返回 200（响应时间 17ms < 100ms）
- [x] `/api/v1/openapi.json` 返回合法 OpenAPI 3.1 Document（2026-04-27 复核：开发环境无鉴权；非开发环境需 admin session）
- [x] `npm run dev:client` 启动，访问 `https://round1.local` 显示空壳页面
- [x] `tsx scripts/migrate.ts up` 成功创建所有表（执行时间 < 100ms）
- [x] `tsx scripts/migrate.ts status` 显示所有迁移已应用
- [x] `tsx scripts/migrate.ts down` 可回滚最近一次迁移
- [x] Express 5 中间件兼容性全部通过（csrf-sync ✅ swagger-ui ✅ connect-redis ✅；OIDC 302 待 step-02）
- [x] `redis` (node-redis) 客户端连接测试通过（connect-redis session store + rate-limit-redis）
- [x] `ioredis` 客户端连接测试通过（BullMQ）
