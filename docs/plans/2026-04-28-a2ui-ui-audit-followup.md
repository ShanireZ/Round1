# A2UI and UI Drift Audit Follow-up

> 日期：2026-04-28
>
> 范围：对照 `standard/04-ui-ux.md`、`standard/05-frontend-engineering.md`、`standard/11-testing-quality.md`、`standard/17-docs-plan-maintenance.md` 与 `standard/22-standard-adoption-and-audit.md`，安装 Google A2UI，复核当前前端已完成骨架中的 UI/UX、导航、认证回跳与浏览器可见问题。
>
> 状态：本文件记录本轮修复与验证，不替代主 backlog。

## 本轮修复

- A2UI 安装：按 Context7 当前文档安装 `@a2ui/react` 与 `@a2ui/web_core`，使用 v0.9 入口 `@a2ui/react/v0_9` 与 `@a2ui/web_core/v0_9`。
- A2UI 集成边界：新增 `client/src/lib/a2ui-design-surface.ts` 与 `client/src/components/a2ui/A2uiDesignSurface.tsx`，只作为 agent-facing design surface，不替换 Round1 现有 Radix/shadcn primitive。
- A2UI 视觉收口：新增 `client/src/styles/a2ui.css`，把 A2UI CSS variables 映射到 Round1 `tokens.css`，并在 `/dev/ui-gallery` 新增 A2UI 展示板块，防止声明式 agent UI 脱离 Modern Editorial x Contest Ceremony 风格。
- A2UI 浏览器告警收口：接入 `@a2ui/markdown-it` 的 sanitizer markdown renderer，消除 A2UI React 在浏览器中提示未配置 markdown renderer 的 warning；同时把本地 demo surface 改为完整处理 payload 后再交给 React 渲染，避免开发态出现 `[Loading root...]` 占位。
- 学生导航漂移：`client/src/lib/navigation.ts` 的主导航从早期 `/questions`、`/exams`、`/analytics`、`/settings` 占位入口收口为当前 UI/UX 契约：`/dashboard`、`/exams/new`、`/account/class`、`/account/security`。
- 认证回跳路径漂移：CppLearn OIDC bind flow 从旧 `/settings/security` 改为当前 `/account/security`，避免成功绑定后跳到未登记前端入口。
- 结果页返回路径漂移：`ExamResult` 的返回 CTA 从旧 `/exams` 占位页改为 `/dashboard`，保留“再来一次”指向 `/exams/new`。
- Coach class 测试漂移：`server/__tests__/coach-classes.integration.test.ts` 的 UUID fixture 改为符合 RFC variant 的值，避免路由 schema 在进入 owner / assignment 业务逻辑前返回 400，恢复已完成 Coach class 流程的回归覆盖。

## 文档同步

- `standard/05-frontend-engineering.md` 已补 A2UI 使用边界：只能作为 agent-facing renderer / 设计辅助 surface，必须继承 Round1 token bridge。
- `standard/04-ui-ux.md` 与 `plan/uiux_plan.md` 已把 A2UI token bridge 纳入 `/dev/ui-gallery` / 交付物口径。
- `plan/reference-api.md` 已补 `/account/class` 前端路由表项。
- `docs/plans/2026-04-26-remaining-unfinished-work.md` 已记录 A2UI 本轮安装与视觉验收边界，UI/UX 截图、移动端、键盘、reduced motion 与打印视觉验收仍未整体关闭。

## 验证记录

- `npm run lint`：通过。
- `npm run verify:ui-tokens`：通过，`verifyUiTokenUsage: ok (71 files checked)`。
- `npm run verify:offline-artifacts`：通过，`verifyOfflineArtifactNames: ok (137 files checked)`。
- `npm run test -- server/__tests__/safeReturnTo.test.ts`：通过，18 tests。
- `npm run test -- server/__tests__/coach-classes.integration.test.ts`：修复 UUID fixture 后通过，6 tests。
- `npm run test`：通过，29 files / 217 tests。
- `npm run client:test`：通过，7 files / 36 tests。
- `npm run build:server`：通过。
- `npm run build:client`：通过。
- Browser check：`https://127.0.0.1:5174/dev/ui-gallery#plate-11` 桌面与 390px 移动视口中 A2UI surface 均真实渲染，console 结果为 0 errors / 0 warnings。

## 剩余风险

- A2UI 当前只接入 `/dev/ui-gallery` 示例 surface，尚未连接真实 agent/MCP payload；后续若接入外部 agent 消息，必须先补 payload 校验、权限边界、复杂度限制与 XSS/DoS 防护。Markdown 已接入 sanitizer renderer，但外部 payload 的字段级校验与执行限制仍不能省略。
- UI/UX 仍保留全路由截图、移动端、键盘、reduced motion 与打印视觉验收债务，本轮只收口 A2UI bridge 与发现的导航/回跳漂移。
