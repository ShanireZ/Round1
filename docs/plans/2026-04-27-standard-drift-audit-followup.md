# Standard Drift Audit Follow-up

> 日期：2026-04-27
>
> 范围：本次复核对照 `standard/17-docs-plan-maintenance.md`、`standard/22-standard-adoption-and-audit.md`、`standard/09-offline-content-artifacts.md`、`standard/14-deployment-ops.md`、`standard/06-backend-api.md` 与 `standard/11-testing-quality.md`，检查 `plan/`、`docs/plans/` 中已经标记完成或当前对齐的事项是否仍符合实际代码。
>
> 状态：本文件记录本轮已修复漂移与剩余标准债务；不是新的功能范围计划。

## 本轮已修复

- Auth schema 与运行时校验漂移：Passkey verify 请求体不再用 `z.any()`/伪 `credential` 包装，改为顶层 WebAuthn response schema；passkey verify、TOTP verify 与 password reauth 路由已补 `validate(...)`，避免 OpenAPI/运行时校验继续分叉。
- Admin 审计 fail-closed：`server/middleware/adminAudit.ts` 不再 fire-and-forget 吞掉写入失败；敏感 admin mutation 会先创建审计记录，成功响应前补写 before/after，审计链不可用时返回 `ROUND1_ADMIN_AUDIT_FAILED`，并已同步到 `plan/reference-api.md`。
- Production no-runner 口径：`plan/00-overview.md` 不再把 `cpp-runner` 写成生产启动健康前提，改为生产 `/api/v1/health` 与离线内容环境 runner/contentWorker 分层验收。
- cpp-runner 代码注释：`server/services/sandbox/cppRunner.ts` 明确为离线内容环境与校验脚本客户端，避免误读为生产运行时依赖。
- `/api/v1/config/client` 领域边界：从 `server/routes/auth.ts` 拆到 `server/routes/config.ts`，并补充 OpenAPI registry 与测试断言。
- `/api/v1/config/client` 文档口径：`plan/reference-api.md` 与 backlog 已改为现状契约，明确当前返回 autosave、draft TTL、考试类型、难度与 enabled auth providers。
- `/api/v1/docs` 文档口径：`plan/reference-api.md` 与 backlog 已改为开发环境现状契约，生产不暴露。
- `/api/v1/openapi.json` 非开发访问：`server/routes/health.ts` 已从“生产临时 403”收口为非开发环境需 admin session；`plan/reference-api.md` 与 `plan/step-01-scaffold-and-db.md` 同步为开发无鉴权、非开发 admin。
- Admin CRUD 完成项回写：`plan/step-03-question-bank.md` 的管理员题库与预制卷库 CRUD 验证清单已与 `plan/step-05-coach-and-admin.md` 和实际测试对齐。
- `app_settings` 运行时配置口径：backlog 已明确当前 `RUNTIME_SETTING_DEFINITIONS` 范围内的配置读取为 `app_settings > .env > 代码默认值`。
- 离线产物命名 guard：`scripts/verifyOfflineArtifactNames.ts` 已从只查路径升级为路径 + JSON schema/meta/integrity 校验；不再 allowlist `papers/<year>/*.json` 旧 question bundle 布局。
- 当前本地 step3 formal bundle meta：`papers/2026/2026-04-27-step3-llm-csp-j-medium-v01/question-bundles/` 与 `artifacts/prebuilt-papers/2026/2026-04-27-step3-llm-csp-j-medium-v01/` 下的 formal bundle 已把 `createdAt` 规范为 ISO datetime，避免路径合规但 schema 不合规。
- UI/UX 旧口径：`plan/00-overview.md`、`plan/reference-config.md`、`plan/step-01-scaffold-and-db.md` 与 `plan/uiux_plan.md` 已从早期 Codeforces/纯白蓝橙/`apps/web` 路径口径同步到当前 `client/` 路径和 Modern Editorial × Contest Ceremony 定稿。
- UI token 漂移 guard：`client/src` 中考试页、结果页与基础 UI primitive 的原始 hex/rgba 样式已收敛到 token、语义 Tailwind class 或共享 CSS utility；新增 `scripts/verifyUiTokenUsage.ts` 与 `npm run verify:ui-tokens` 防止 TS/TSX 重新引入 magic color。
- UI 构建依赖漂移：`lucide-react@0.475.0` 的当前安装包 barrel export 会引用缺失的 icon 文件，导致 `npm run build --workspace=client` 在 Vite 阶段失败；已升级到 `lucide-react@1.11.0`，客户端生产构建恢复通过。
- `plan/reference-config.md` 目录结构：已补 `server/routes/config.ts`，移除已不存在的 `csrf.ts` / `rateLimit.ts` middleware 口径，改为当前 `authRateLimit.ts` 与 app 内联 CSRF/rateLimit 结构。
- 考试页前端配置消费：`/api/v1/config/client` 已暴露 `autosaveIntervalSeconds`，但 `ExamSession` 只保留本地 30s debounce，未按计划使用后端配置做基础 autosave flush；本轮新增 `client/src/lib/client-config.ts`，考试页用该配置周期性 flush pending patches，同时保留 30s debounce 与 beforeunload keepalive。
- 考试页 autosave 飞行中输入保护：`ExamSession` autosave 成功回包不再直接用服务端快照覆盖本地答案，而是将仍未发送的 pending patches 重放到已保存快照上；`beforeunload` 与最终 submit 判断也显式纳入 pending patch 数量，手动/自动交卷会等待当前 autosave 收尾，避免持续输入时丢失本地答案或漏掉关闭前 keepalive 保存。
- 前端测试入口漂移：仓库已有 `client/vitest.config.ts` 与 `client/src/**/*.test.ts`，但根 `npm run test` 只发现 server 测试；本轮补 `npm run client:test`，避免前端 helper 单测继续沉默。
- 前端 Vitest 配置 ESM 兼容：`client/vitest.config.ts` 不再依赖 `__dirname`，改用 `import.meta.dirname` 作为 root/alias 基准；在 bundle loader 被本机 esbuild spawn 权限限制卡住时，native loader 至少可以正确读取配置。
- 依赖版本与 lockfile 漂移：root/client/server workspace 与独立 `cpp-runner` 的 package spec 和 lockfile 已刷新到当前 npm latest；`cpp-runner` 新增独立 `package-lock.json`，Dockerfile 改为 `npm ci` 后构建并在产物层 `npm prune --omit=dev`。`drizzle-kit` 未被 package script/config 调用且 latest 与旧版都会引入 npm audit 风险链，已从 `server` devDependency 移除，当前迁移真源明确为 `scripts/migrate.ts` + `server/db/migrations`。
- 运行时版本口径：Node.js 标准基线收紧为 `>=24.15.0`，npm 标准基线收紧为 `>=11.12.1`；root/client/server/cpp-runner `package.json` engines、lockfile 顶层 package 元数据、`cpp-runner` Docker base image 与 plan/reference 部署文档已同步。
- Vite / React lint 工具链兼容：`client/vite.config.ts` 改用 `import.meta.dirname` 适配 Vite 8 ESM；`eslint-plugin-react-hooks@7` 保留最新包版本，但当前未启用 React Compiler，因此 lint 配置显式保留稳定 hooks 基线 `rules-of-hooks` 与 `exhaustive-deps`，避免把 Compiler adoption 重构混入依赖升级。
- Zod 4 PATCH default 兼容：`AdminQuestionUpdateBody` 与 `PrebuiltPaperUpdateBody` 不再从带 `default()` 的 create/upsert schema 直接 `.partial()`；创建接口保留默认值，更新接口只包含调用方显式传入的字段，避免 PATCH 隐式清空辅助 KP 或写入空 metadata。
- 考试 session API reference 漏登记：`server/routes/exams.ts`、前端 `fetchExamSession` 与 `exams-runtime.integration.test.ts` 已依赖 `GET /api/v1/exams/:id/session`，但 `plan/reference-api.md` 与 `plan/step-04-exam-and-grading.md` 当前 surface 未列出；本轮已补为现状契约。

## 验证

- 代码级验证：`server/__tests__/pow.test.ts` 现在覆盖 `/api/v1/config/client` 的非敏感前端运行时字段，防止回退为最小 PoW payload。
- OpenAPI 访问验证：`server/__tests__/auth-integration.test.ts` 覆盖非开发环境匿名访问 `/api/v1/openapi.json` 返回 401，admin session 返回 OpenAPI 3.1 文档。
- Admin 完成项验证：`server/__tests__/admin-content.integration.test.ts` 覆盖题库/预制卷 CRUD、引用摘要、发布/归档与 copy-version。
- 文档级验证：本轮复核后，`plan/reference-api.md` 不再把已挂载的 `/api/v1/docs` 与已补齐的 config payload 写成目标态。
- 离线产物 guard 验证：`npm run verify:offline-artifacts` 现在覆盖 formal bundle 路径、meta.runId、schemaVersion、ISO `createdAt`、文件名 count/blueprint/questionType/KP 与 integrity manifest。
- UI token guard 验证：`npm run verify:ui-tokens` 检查 `client/src` TS/TSX 中的原始 hex/rgb/hsl 颜色字面量；`/dev/ui-gallery` 作为 token 展示页豁免。
- 已运行命令：

```bash
npm run test -- server/__tests__/pow.test.ts
npm run test -- server/__tests__/admin-content.integration.test.ts
npm run test -- server/__tests__/exams-runtime.integration.test.ts
npm run test -- server/__tests__/auth-integration.test.ts
npm run verify:offline-artifacts
npm run verify:ui-tokens
npm run client:test -- src/lib/client-config.test.ts src/lib/exam-runtime.test.ts src/lib/exam-session.test.ts
npm run lint
npm run build --workspace=client
npm run build --workspace=server
(cd cpp-runner && npm run build)
npm run client:test -- --configLoader native --pool=vmThreads --maxWorkers=1 --reporter dot
npm test -- server/__tests__/admin-content.integration.test.ts --configLoader native --pool=vmThreads --maxWorkers=1 --reporter verbose
npm test -- server/__tests__/llm-config.test.ts --configLoader native --pool=vmThreads --maxWorkers=1 --reporter verbose
npm test -- server/__tests__/exams-runtime.integration.test.ts --configLoader native --pool=vmThreads --maxWorkers=1 --reporter verbose
npm test -- --configLoader native --maxWorkers=1 --reporter dot
npm outdated --json --long
npm audit --json
(cd cpp-runner && npm outdated --json --long)
(cd cpp-runner && npm audit --json)
npm run migrate:status
git diff --check
node -v
npm -v
```

2026-04-27 dependency-upgrade verification note: root/workspace and `cpp-runner` `npm outdated --json --long` both returned `{}` and both audit trees returned 0 vulnerabilities. The full server Vitest run with default forks passed 160 tests and left only Redis-dependent suites blocked by local `127.0.0.1:6379` being unavailable (`bullmq-dead-letter`, `auth-integration`, `pow`). `npm run migrate:status` is likewise blocked by local Postgres `127.0.0.1:5432` being unavailable.

当前 Codex 沙箱追加复核时，`npm run client:test -- src/lib/exam-session.test.ts src/lib/client-config.test.ts src/lib/exam-runtime.test.ts` 的默认 bundle loader 在加载 Vite/Vitest 配置阶段触发 Windows `spawn EPERM`；改为 `--configLoader native` 后配置可加载，但 Vitest worker / Vite realpath 仍被同一类 `spawn EPERM` 阻断，未进入测试断言。本轮使用 `node --experimental-strip-types` 对新增 autosave helper 行为做等价断言，并运行 `npx tsc -p client/tsconfig.json --noEmit`、`npm run build:client` 作为补充验证。

## 剩余标准债务

| standard                                                 | gap                                                                                                | risk                                                                                         | mitigation                                                                            | trigger                             | owner          |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------- | -------------- |
| `standard/06-backend-api.md` OpenAPI 规范                | 当前 `GET /api/v1/config/client` 已补注册，但历史 auth/admin/exam 路由仍未全量注册 OpenAPI         | API reference 仍可能依赖人工维护，新增字段或错误码容易漂移                                   | 本轮先补受影响 config 端点；后续按 auth/admin/exams 分批补 registry，并以生成检查守住 | 下一轮触碰对应路由或发布 API 契约前 | backend owner  |
| `standard/04-ui-ux.md` UI/UX 视觉验收                    | 已新增 TS/TSX magic color guard，但尚未完成全路由截图、移动端、键盘、reduced motion 与打印视觉验收 | UI 已完成项仍可能存在运行时视觉/交互漂移，尤其是 ExamResult ceremony 与 Dashboard/Coach 图表 | 本轮先阻断新 magic color；保留 UI/UX backlog，后续用 Playwright/截图分批收口          | 下次触碰前端页面或发布前视觉验收    | frontend owner |
| `standard/22-standard-adoption-and-audit.md` L2/L3 guard | docs/plan 与代码漂移仍主要靠人工 `rg` 复核                                                         | 已完成项可能再次和 reference/backlog 脱节                                                    | 保留本 follow-up；后续可新增链接/路径/状态词 guard                                    | 发布前或完成教练/API 主线后         | docs owner     |

## 后续最小动作

- 触碰 auth/admin/exams 路由时，同步补 OpenAPI registry，不再扩大未注册 surface。
- 发布前复跑 `npm run verify:offline-artifacts`，并抽查 `docs/plans/2026-04-26-remaining-unfinished-work.md` 是否仍只包含真正未完成项。
