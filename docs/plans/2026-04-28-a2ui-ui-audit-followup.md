# A2UI and UI Drift Audit Follow-up

> 日期：2026-04-28
>
> 范围：对照 `standard/04-ui-ux.md`、`standard/05-frontend-engineering.md`、`standard/11-testing-quality.md`、`standard/17-docs-plan-maintenance.md` 与 `standard/22-standard-adoption-and-audit.md`，安装 Google A2UI，复核当前前端已完成骨架中的 UI/UX、导航、认证回跳与浏览器可见问题。
>
> 状态：本文件记录本轮修复与验证，不替代主 backlog。

## 本轮修复

- A2UI 安装：按 Context7 当前文档安装 `@a2ui/react` 与 `@a2ui/web_core`，使用 v0.9 入口 `@a2ui/react/v0_9` 与 `@a2ui/web_core/v0_9`。
- A2UI 集成边界：新增 `client/src/lib/a2ui-design-surface.ts` 与 `client/src/components/a2ui/A2uiDesignSurface.tsx`，作为 agent-facing design surface 的优先体系；Round1 现有 Radix/shadcn primitive 保持为生产页面受控辅助实现。
- A2UI 视觉收口：新增 `client/src/styles/a2ui.css`，把 A2UI CSS variables 映射到 Round1 `tokens.css`，并在 `/dev/ui-gallery` 新增 A2UI 展示板块，防止声明式 agent UI 脱离 Modern Editorial x Contest Ceremony 风格。
- A2UI 浏览器告警收口：接入 `@a2ui/markdown-it` 的 sanitizer markdown renderer，消除 A2UI React 在浏览器中提示未配置 markdown renderer 的 warning；同时把本地 demo surface 改为完整处理 payload 后再交给 React 渲染，避免开发态出现 `[Loading root...]` 占位。
- A2UI basic catalog 覆盖扩展：`/dev/ui-gallery` 示例 surface 现覆盖 Text/Card/Row/Column/List/Tabs/Divider/Icon、TextField、CheckBox、Slider、DateTimeInput、ChoicePicker、data model binding 与 Button action context；目录由已安装 `basicCatalog` 动态生成，便于以后 agent UI/UX 设计先在 Round1 token bridge 中验收。
- A2UI payload 防硬编码：本地示例 surface 从页面长 JSON 收口到 `createRound1A2uiMessages()` factory；渲染前校验 installed `basicCatalog` schema、组件 id 唯一性、引用完整性、action allowlist 和复杂度上限。该校验已捕获并修正 `Slider minValue/maxValue`、`ChoicePicker selections`、`TextField textFieldType`、非法 Icon 名称与动态目录 id 冲突等 drift。
- Edge Tools 告警收口：`Dashboard.tsx` 的成绩柱状图不再使用 JSX inline `style`，改为受控高度 class；`globals.css`、`a2ui.css` 与 Admin Dashboard 不再使用 `color-mix()`，改为 `tokens.css` 中的静态兼容 token；`a2ui.css` 的 checkbox 不再使用 `min-height: auto`，改为明确 `width`/`height`。
- 字体源收口：`globals.css` 的全部 `@font-face` 与 `index.html` preload 已改为同源 `/font/*.woff2`；Vite dev server 通过 `R2_PUBLIC_BASE_URL` 代理通用字体到 R2 `/font/`，CppLearn 字标可通过 `CPPLEARN_FONT_PUBLIC_BASE_URL` 单独代理，生产 Caddy 也必须保留同源 `/font/*` 代理，避免浏览器直接跨域请求字体触发 CORS error。`client/public/fonts` 保留为本地缓存说明，不再作为运行时默认源。
- CSP 收口：`server/app.ts` 的 Helmet CSP 已把 `R2_PUBLIC_BASE_URL` 同步加入 `font-src`，避免后续 API/同源静态部署时远端字体被策略拦截。
- 学生导航漂移：`client/src/lib/navigation.ts` 的主导航从早期 `/questions`、`/exams`、`/analytics`、`/settings` 占位入口收口为当前 UI/UX 契约：`/dashboard`、`/exams/new`、`/account/class`、`/account/security`。
- 认证回跳路径漂移：CppLearn OIDC bind flow 从旧 `/settings/security` 改为当前 `/account/security`，避免成功绑定后跳到未登记前端入口。
- 结果页返回路径漂移：`ExamResult` 的返回 CTA 从旧 `/exams` 占位页改为 `/dashboard`，保留“再来一次”指向 `/exams/new`。
- Coach class 测试漂移：`server/__tests__/coach-classes.integration.test.ts` 的 UUID fixture 改为符合 RFC variant 的值，避免路由 schema 在进入 owner / assignment 业务逻辑前返回 400，恢复已完成 Coach class 流程的回归覆盖。

## 2026-04-28 维护追加

- A2UI basic catalog 覆盖继续扩展：`/dev/ui-gallery` 的 Round1 surface 在原有 Text/Card/Row/Column/List/Tabs/Divider/Icon 与交互组件基础上，补入 Image、Modal、AudioPlayer、Video 的 guarded payload，避免“动态目录展示了组件但实际 surface 未覆盖”的验收漂移。
- A2UI action guard 收紧：本地 payload validator 现在显式拒绝 `functionCall` action。真实 agent bridge、权限边界、审计和后端执行策略未设计前，前端 renderer 只允许已登记 event action。
- A2UI data model guard 收紧：`updateDataModel.path` 必须是 `/draft` 或 `/draft/*`，不再接受 `/drafty` 这类仅共享字符串前缀的路径。
- A2UI 引用完整性收口：动态 `List.children.componentId` 模板也纳入引用校验，避免 agent payload 在列表模板缺失时进入渲染阶段才出错。
- A2UI 浏览器错误防护：`A2uiDesignSurface` 不再假设 action context 一定存在；surface 初始化异常会渲染 inline error，不让 React effect 异常升级成 console error / pageerror。
- CoachReport 落地推进：`GET /api/v1/coach/report/:classId` 从基础 assignment 汇总扩展为 `heatmap`、`questionTypeStats`、`students` 与每个学生的趋势/知识点/题型详情；`/coach/report` 前端从占位页切换为真实页面，支持班级选择、群体热力图、题型统计、学生行键盘下钻 Sheet、CSV 导出与打印入口。
- 登录视觉漂移收口：`/login` 从占位页切换为 AuthLayout 分栏登录页，接入密码登录、运行时 provider feature flag、CppLearn OIDC 入口与 QQ 互联入口显示条件。
- CppLearn 字标收口：新增 `HYShangWeiShouShuW` 字体声明与 `--font-cpplearn-logo` token，`贝塔问天录` 仅用于 CppLearn 身份入口；字体运行时仍走 `/font/HYShangWeiShouShuW.woff2` 同源代理，`client/public/fonts/README.md` 记录公开 R2 来源；浏览器复查发现当前 `R2_PUBLIC_BASE_URL=https://r2.round1.cc` 尚未包含该对象，因此补入 `CPPLEARN_FONT_PUBLIC_BASE_URL` 配置化代理，避免直接在组件写死外部 URL。

## 2026-04-28 维护追加（二）

- A2UI BYOC 落地：新增 `client/src/components/a2ui/round1A2uiCatalog.tsx`，以专用 catalog 包装 installed `basicCatalog` 并注册 `Round1CoachReportSnapshot`；该组件复用 Round1 `Card`、`Badge`、`Progress` 与 token class，而不是另起一套视觉 primitive。
- A2UI schema 兼容收口：custom component schema 使用与当前 A2UI v0.9 / `zod-to-json-schema` 兼容的 `zod/v3`，避免 root `zod` v4 对象进入 A2UI 运行时后出现 schema element invalid。
- A2UI 动态函数防护：validator 除了拒绝 Button `functionCall` action，现在也递归拒绝 `{ call, args }` 动态函数绑定。真实 agent bridge、权限、审计和函数目录设计完成前，agent payload 只能走已登记 event action 与 data binding。
- CoachReport 规模化渲染收口：`client/src/lib/coach.ts` 新增集中渲染上限与分页 helper；热力图按 24 名学生/页窗口化，学生表按 25 名学生/页窗口化，详情 Sheet 对趋势、知识点和题型统计设定集中上限，避免一次性渲染全量 student × KP 矩阵。
- CoachReport 浏览器与可达性收口：热力图和表格详情按钮使用可区分的 accessible name；页面移除可见操作说明式文案，保留业务含义描述；报告区补 `data-print-surface`、筛选/分页/导出控件补 `data-no-print`，打印态显示页眉页脚并隐藏交互控件。
- CSV 导出安全收口：`buildCoachReportCsv()` 对以 `= + - @` 开头、前置空白后变成公式、或以 tab / carriage return 开头的单元格加前缀，避免学生姓名等字段在表格软件中被当作公式执行。
- 浏览器验收过程记录：针对 App 级启动请求，Playwright mock 不能只覆盖当前页面 API，还必须覆盖 `/api/v1/config/client`、`/api/v1/auth/session` 与 `/api/v1/attempts/active`；关闭页面前等待 `document.fonts.ready`，避免把字体加载中的正常 abort 误判成页面缺陷。

## 文档同步

- `standard/05-frontend-engineering.md` 已补 A2UI 使用边界：只能作为 agent-facing renderer / 设计辅助 surface，必须继承 Round1 token bridge。
- `standard/05-frontend-engineering.md` 已补浏览器告警 guard：禁止 JSX inline style、`color-mix()` 与 `min-height:auto` / `min-width:auto` 回归，并由 `npm run verify:ui-tokens` 自动检查。
- `standard/05-frontend-engineering.md` 与 `standard/04-ui-ux.md` 已补 A2UI 防硬编码要求：payload 由 factory/basic catalog 生成，按 installed package schema 校验后再渲染。
- `standard/04-ui-ux.md`、`standard/14-deployment-ops.md`、`standard/15-performance-accessibility-print.md` 与 `plan/uiux_plan.md` 已把同源 `/font/` 到 R2 `/font/` 的字体代理纳入当前契约。
- `standard/04-ui-ux.md` 与 `plan/uiux_plan.md` 已把 A2UI token bridge 纳入 `/dev/ui-gallery` / 交付物口径。
- `standard/04-ui-ux.md`、`standard/05-frontend-engineering.md` 与 `plan/uiux_plan.md` 已补 A2UI media/modal 覆盖、`functionCall` 禁止、data model 路径边界和动态 List 模板引用校验口径。
- `standard/04-ui-ux.md`、`standard/05-frontend-engineering.md` 与 `plan/uiux_plan.md` 已补 A2UI Round1 BYOC custom catalog、动态 `{ call, args }` 函数绑定禁止和本地 primitive 复用要求。
- `standard/04-ui-ux.md`、`standard/15-performance-accessibility-print.md`、`plan/uiux_plan.md` 与 `plan/step-05-coach-and-admin.md` 已补 CoachReport 规模化分页/窗口化、打印分区标记和 180×24 浏览器性能验收结果。
- `standard/04-ui-ux.md` 与 `plan/uiux_plan.md` 已补 CppLearn OIDC `贝塔问天录` 字标的使用边界：只用于身份入口，不替代 Round1 主品牌。
- `plan/reference-config.md` 已补 R2 环境变量示例，说明前端字体依赖 `R2_PUBLIC_BASE_URL/font/*.woff2`，CppLearn 字标可临时依赖 `CPPLEARN_FONT_PUBLIC_BASE_URL/font/HYShangWeiShouShuW.woff2` 作为同源代理后端。
- `plan/reference-api.md` 已补 `/account/class` 前端路由表项。
- `plan/step-05-coach-and-admin.md` 与 `docs/plans/2026-04-26-remaining-unfinished-work.md` 已记录 CoachReport payload/frontend 落地现状，并关闭本轮规模化浏览器性能验收缺口；真实生产 p95 继续按性能标准观测。
- `docs/plans/2026-04-26-remaining-unfinished-work.md` 已记录 A2UI 本轮安装与视觉验收边界，UI/UX 截图、移动端、键盘、reduced motion 与打印视觉验收仍未整体关闭。

## 验证记录

- `npm run lint`：通过，0 errors / 0 warnings。
- `npm run verify:ui-tokens`：通过，`verifyUiTokenUsage: ok (81 files checked)`，现已实际扫描 CSS 并阻断 `min-height:auto` / `min-width:auto` 兼容告警回归。
- `npm run client:test -- client/src/lib/a2ui-design-surface.test.ts`：通过，1 file / 8 tests。
- `npm run client:test -- src/lib/coach.test.ts src/lib/a2ui-design-surface.test.ts`：通过，2 files / 15 tests，覆盖 CoachReport 分页/CSV 防公式和 A2UI BYOC / 函数绑定 guard。
- `npm run verify:offline-artifacts`：通过，`verifyOfflineArtifactNames: ok (137 files checked)`。
- `npm run test -- server/__tests__/safeReturnTo.test.ts`：通过，18 tests。
- `npm run test -- server/__tests__/coach-classes.integration.test.ts`：通过，7 tests，覆盖班级报告热力图、题型统计、学生详情与趋势 payload。
- `npm run test`：通过，29 files / 218 tests。
- `npm run client:test`：通过，8 files / 49 tests。
- `npm run build:server`：通过。
- `npm run build:client`：通过；`/font/*.woff2` 仍按运行时同源代理解析，Vite build-time unresolved 提示符合当前字体托管设计。
- Browser check：`https://127.0.0.1:5175/dev/ui-gallery#plate-11` headless Chromium 桌面视口中 A2UI surface 真实渲染，console badCount=0（0 errors / 0 warnings / 0 pageerror）。2026-04-28 维护追加后，`https://127.0.0.1:5177/login` 首次复查发现 `HYShangWeiShouShuW.woff2` 404，已补 `CPPLEARN_FONT_PUBLIC_BASE_URL` 同源代理并复查为 0 warnings / 0 errors；`/coach/report` 首次复查发现未登录 401 resource error，已补 `/api/v1/auth/session` 前置守卫并复查桌面/移动均为 0 warnings / 0 errors；`/dev/ui-gallery#plate-11` 维护追加后复查仍为 0 warnings / 0 errors。维护追加（二）在 `https://127.0.0.1:5178/coach/report` 使用 Playwright 拦截 API 注入 180 名学生 × 24 个知识点规模化数据：桌面首屏热力图 643ms、移动 2418ms，均无水平溢出；学生详情 Sheet 可打开并渲染题型下钻；打印态页眉为 `block`、`data-no-print` 为 `none`、打印区 `break-inside: avoid`；`https://127.0.0.1:5178/dev/ui-gallery#plate-11` 的 Round1 BYOC 可见；最终 badCount=0（0 console warning/error、0 pageerror、0 requestfailed）。

## 剩余风险

- A2UI 当前只接入 `/dev/ui-gallery` 示例 surface，尚未连接真实 agent/MCP payload；后续若接入外部 agent 消息，必须先补 payload 校验、权限边界、复杂度限制与 XSS/DoS 防护。Markdown 已接入 sanitizer renderer，但外部 payload 的字段级校验与执行限制仍不能省略。
- 字体代理当前按本机 `.env` 的公开 `R2_PUBLIC_BASE_URL=https://r2.round1.cc` 与 `CPPLEARN_FONT_PUBLIC_BASE_URL=https://r2.betaoi.cc` 收口；若部署环境变更公开域名，必须同步 Vite/Caddy `/font/*` 代理、CSP 和本文件记录，避免字体源再次漂移。
- UI/UX 仍保留全路由截图、移动端、键盘、reduced motion 与打印视觉验收债务，本轮只收口 A2UI bridge、R2 字体源、浏览器告警 guard 与发现的导航/回跳漂移。
