# UI/UX V2 Implementation Record

> 日期：2026-04-29
>
> 范围：执行 Round1 UI/UX V2 规范升级与实施方案，覆盖 `standard/04-ui-ux.md` 真源重构、shadcn/Recharts chart primitive、motion token 对齐、A2UI production slot/BYOC 边界、UI Gallery V2 验收面和自动化测试。

## 决策

- UI/UX 真源切换：`standard/04-ui-ux.md` 成为当前执行、评审和验收真源；`plan/uiux_plan.md` 保留初稿设计理由和历史决策。
- 视觉方向升级：从 Modern Editorial x Contest Ceremony 演进为 Precision Workbench x Data Arena，保留工具台克制底盘，同时增强排名、热力、趋势、系统信号和结果仪式。
- 动效强度分级：新增 `none`、`subtle`、`live`、`ceremony` 四级，考试页强制 `none/subtle`，Dashboard/Coach/Admin 看板允许 `live`，ExamResult 使用 `ceremony`。
- 数据可视化路线：引入 Recharts v3，并通过本地 shadcn chart primitive 统一 token、tooltip、legend 和可访问摘要；热力矩阵优先保留本地 SVG/CSS。
- A2UI 边界扩展：A2UI 允许进入生产 slot，但必须具备 schema/action/resource/data-root/complexity guard、role-aware 权限、审计和静态 fallback。
- 具体标准回填：旧版 `standard/04-ui-ux.md` 中的主题色、Light/Dark token、字体栈、字号、圆角、间距、阴影、z-index、组件合同和页面 IA 不视为废弃；已按 V2 结构恢复为现行硬合同，并增加自动守护/人工验收边界。

## 实施面

- 文档：更新 `standard/04-ui-ux.md`、`standard/05-frontend-engineering.md`、`standard/15-performance-accessibility-print.md`、`plan/uiux_plan.md`；`standard/04-ui-ux.md` 保留 V2 真源治理，同时恢复旧版具体设计合同。
- 依赖：`client` workspace 新增 `recharts`，用于 shadcn chart primitive 和 UI Gallery V2 数据可视化样本。
- 前端基础：新增本地 chart primitive、V2 动效/背景样式、motion preset 对齐 token。
- A2UI：扩展 Round1 BYOC catalog 和本地 factory，覆盖 Dashboard 摘要、CoachReport 快照、Admin 健康/导入状态、ExamResult 讲解片段与 production slot guard。
- 验收：UI Gallery 新增 V2 plate，展示 Recharts、四级动效、数据背景模式和 A2UI production slot。

## 验收计划

- `npm run verify:ui-tokens`
- `npm run build:client`
- `npm run client:test`
- `npm run test:e2e -- ui-visual-audit.spec.ts`
- 涉及 server runtime 的完整 `npm run test` 视本机 Redis/Postgres 可用性执行并记录环境阻塞。

## 收口补充

- 2026-04-29 上线测试准备时修复 Tailwind CSS custom-property 任意值写法：生产页面、primitive、A2UI surface 和 UI Gallery 中的 `rounded-[--*]`、`z-[--*]`、`shadow-[--*]`、`duration-[--*]`、`bg-[--*]` 等统一改为显式 `var(--*)`，避免 Vite/Tailwind 产物出现无效 CSS 值。
- 本轮复查结果见 `docs/plans/2026-04-29-release-readiness.md`：`verify:ui-tokens`、`build:client`、`build:server`、`client:test`、`verify:offline-artifacts`、`lint`、`ui-visual-audit`、完整 `npm run test`、`migrate:status` 和本地 API/frontend `healthcheck` 均已复跑。生产域名、Caddy/TLS、PM2、备份恢复、真实邮件/Turnstile、Sentry 与回滚演练仍必须在目标部署环境完成。
- 2026-04-29 UI/UX 与功能页面二次收口：复查考试、账号、Coach、Admin、A2UI BYOC 和 UI Gallery 的真实页面文案，把 `runtime`、接口路径、payload、内部状态、owner/assignment-only 等实现词改为面向学生、教练、管理员的业务语义；功能页仍沿用现有 API/data contract，不新增并行视觉系统。
- 2026-04-29 UI/UX 与功能页面三次收口：继续清理 Login/AuthCallback/CompleteProfile、Dashboard、ExamNew/Session/Result、Account、Coach、Admin content/import/review/settings/users 和导航面上的可见实现词，补齐状态/角色/任务模式/导入类型/JSON 编辑错误等中文映射，并同步 `docs/plans/2026-04-26-remaining-unfinished-work.md` 的历史 backlog 状态。
- 2026-04-29 UI/UX 与功能页面四次收口：补齐 Auth/Account 的 Passkey 浏览器端功能页缺口。`/login` 现在按 `enabledAuthProviders` 展示 Passkey 登录入口，`/account/security` 的 Passkey/OIDC 面板可绑定和移除 Passkey，并新增当前会话管理入口；浏览器端 WebAuthn 流程使用 `@simplewebauthn/browser` 的 `startAuthentication({ optionsJSON })` 与 `startRegistration({ optionsJSON })`，服务端摘要仅回传可删除的凭据记录 id、后缀和备份状态，不暴露公钥材料。
- 2026-04-29 UI/UX 与功能页面五次收口：`/admin/settings` 从平铺表格改为考试与频控、选卷、导入、自定义分组 Tabs，编辑区只允许修改已登记设置并展示来源、配置修订和 Redis `config:change` 通知状态；运行时设置标签改为中文业务语义。`/account/security` 外部身份卡片补齐解绑操作，前端走 CSRF 请求，后端 `DELETE /api/v1/auth/external/:provider` 纳入最近强认证守卫。
- 2026-04-29 配置收口：`.env.example` 改为最小模板，新增 `npm run env:init` 生成 local / production-runtime / offline-content 配置骨架和高熵密钥；Redis、worker、sandbox、连接池、session、认证频控、PM2、healthcheck、trust proxy、本地 HTTPS、autosave 与 assignment timing 默认值回归 `config/env.ts` / 初始化脚本。
- 2026-04-29 UI/UX 与功能页面六次收口：补齐前端路由登录与角色 gate，Dashboard/Exam/Account 入口统一要求登录，Coach/Admin 入口按角色显示 403 业务态而不是落到页面内请求失败；考试 FocusLayout 补齐专注顶栏、可访问交卷入口、移动端作答提示和始终可见的底部题号导航，并把 ExamSession 纳入 Playwright 视觉验收。

## 风险与后续

- Recharts 只作为图表 primitive 的底层实现，不允许页面绕过本地 chart 组件直接散落样式。
- A2UI production slot 第一阶段仍使用本地 guarded payload；真实 agent/MCP 接入前必须补后端权限、审计和操作执行设计。
- 动态背景必须以数据含义驱动，并在 reduced motion 下退化为静态。
