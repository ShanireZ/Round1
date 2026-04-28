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
- 字体源收口：`globals.css` 的全部 `@font-face` 与 `index.html` preload 已改为同源 `/font/*.woff2`；Vite dev server 通过 `R2_PUBLIC_BASE_URL` 代理通用字体到 R2 `/font/`，生产 Caddy 通过 `Caddyfile.example` 中的 R2 源站字面量保留同源 `/font/*` 代理，避免浏览器直接跨域请求字体触发 CORS error。CppLearn OIDC 视觉改用同源 `/logo/cpplearn.jpg` 横幅图片，按开发/生产代理到 R2 `/logo/cpplearn.jpg`。`client/public/fonts` 保留为本地缓存说明，不再作为运行时默认源。
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
- CppLearn 登录视觉收口：早期纯文字字标已移除；`/login` 和 AuthLayout 改用 CppLearn 提供的 `/logo/cpplearn.jpg` 横幅图片，路径集中在 `client/src/lib/brand-assets.ts`；Vite 开发代理读取 `R2_PUBLIC_BASE_URL`，生产 Caddy 通过 `Caddyfile.example` 中的 R2 源站字面量代理到 R2 `/logo/cpplearn.jpg`。

## 2026-04-28 维护追加（二）

- A2UI BYOC 落地：新增 `client/src/components/a2ui/round1A2uiCatalog.tsx`，以专用 catalog 包装 installed `basicCatalog` 并注册 `Round1CoachReportSnapshot`；该组件复用 Round1 `Card`、`Badge`、`Progress` 与 token class，而不是另起一套视觉 primitive。
- A2UI schema 兼容收口：custom component schema 使用与当前 A2UI v0.9 / `zod-to-json-schema` 兼容的 `zod/v3`，避免 root `zod` v4 对象进入 A2UI 运行时后出现 schema element invalid。
- A2UI 动态函数防护：validator 除了拒绝 Button `functionCall` action，现在也递归拒绝 `{ call, args }` 动态函数绑定。真实 agent bridge、权限、审计和函数目录设计完成前，agent payload 只能走已登记 event action 与 data binding。
- CoachReport 规模化渲染收口：`client/src/lib/coach.ts` 新增集中渲染上限与分页 helper；热力图按 24 名学生/页窗口化，学生表按 25 名学生/页窗口化，详情 Sheet 对趋势、知识点和题型统计设定集中上限，避免一次性渲染全量 student × KP 矩阵。
- CoachReport 浏览器与可达性收口：热力图和表格详情按钮使用可区分的 accessible name；页面移除可见操作说明式文案，保留业务含义描述；报告区补 `data-print-surface`、筛选/分页/导出控件补 `data-no-print`，打印态显示页眉页脚并隐藏交互控件。
- CSV 导出安全收口：`buildCoachReportCsv()` 对以 `= + - @` 开头、前置空白后变成公式、或以 tab / carriage return 开头的单元格加前缀，避免学生姓名等字段在表格软件中被当作公式执行。
- 浏览器验收过程记录：针对 App 级启动请求，Playwright mock 不能只覆盖当前页面 API，还必须覆盖 `/api/v1/config/client`、`/api/v1/auth/session` 与 `/api/v1/attempts/active`；关闭页面前等待 `document.fonts.ready`，避免把字体加载中的正常 abort 误判成页面缺陷。

## 2026-04-28 维护追加（Coach 班级/任务）

- Coach 班级入口推进：`/coach/classes` 从 router placeholder 切换为真实页面，接入受保护的 coach session、班级列表、创建班级、复制/轮换班级码、归档班级、进入 assignment-only 报告与任务管理入口；班级码复制失败时给出手动选择反馈。
- Coach 任务入口推进：`/coach/assignments` 从只读/占位状态推进为可创建和关闭任务的页面，按班级读取 assignment，新增 inline 创建表单，绑定已发布预制卷、截止时间与当前班级学生 progress，继续保持 utility 工作台密度而不是营销式页面。
- Coach assignment 选择器补齐：新增 `GET /api/v1/coach/prebuilt-papers`，仅向 coach/admin 暴露已发布预制卷的 assignable 摘要，避免任务创建 UI 依赖 Admin 预制卷库权限或手填 UUID。
- A2UI BYOC 扩展：Round1 custom catalog 新增 `Round1CoachClassSnapshot`，与既有 `Round1CoachReportSnapshot` 一起复用本地 `Card` / `Badge` / `Progress` primitive；`/dev/ui-gallery` 的 A2UI design surface 增加班级/任务数据绑定，覆盖 CoachClasses 设计片段。

## 2026-04-28 维护追加（三）

- 布局 token 漂移收口：`AppShell`、`TopBar`、`Sidebar` 不再引用未定义的 `--layout-*` 变量，改回 `tokens.css` 中已存在的 `--content-max-width`、`--topbar-height`、`--sidebar-width` 与响应式 gutter class；Sidebar 选中态补回 2px 品牌红左边界。
- Dashboard IA 推进：`/dashboard` 从“成绩曲线 + 弱项进度条”调整为 `Hero Band -> 最近考试/能力雷达 -> 弱项热力图 -> 成绩曲线/智能建议`，能力雷达与弱项热力图均由当前 runtime stats 派生，不伪造趋势数据，不引入新图表库，不写 JSX inline style。
- Dashboard helper 收口：新增 `client/src/lib/dashboard.ts` 与单测，把 radar axes、heatmap bucket、heatmap rows、SVG polygon points 从页面中抽为纯函数，便于后续 A2UI/视觉验收复用。
- ExamResult 视觉验收收口：揭晓层补 token 化粒子爆破并尊重 `prefers-reduced-motion: reduce`，reduced motion 下分数和 CTA 立即静态可见；打印态新增页眉页脚，Hero 标记 `data-print-surface`，操作区和 ceremony overlay 标记 `data-no-print`。
- Playwright 视觉验收落地：新增 `server/__tests__/e2e/ui-visual-audit.spec.ts`，使用本地字体文件和 API mock 覆盖 Dashboard 桌面/移动无水平溢出、ExamResult reduced-motion/A4 print markers、`/dev/ui-gallery#plate-11` A2UI BYOC surface；测试 badCount 保留 console warning/error、pageerror 和真实 request failure，过滤导航 reload 导致的正常 `net::ERR_ABORTED`。

## 2026-04-28 维护追加（四）

- QQ 互联视觉占位收口：后端把 auth provider 响应拆分为 `enabledAuthProviders/providers` 与 `authProviderPlaceholders/placeholders`；QQ OAuth adapter 未实现前不再作为可用 provider 暴露，登录页仅在 feature flag 开启时渲染禁用占位卡，不触发 `/api/v1/auth/external/qq/start` 的 501 占位流程。
- 部署验收口径收口：`scripts/healthcheck.ts` 将离线 `round1-content-worker` 从生产 PM2 runtime 检查中拆出，使用 `--expect-content-worker` 独立验收；`cpp-runner` 继续由 `--include-offline --runner-url` 单独检查，符合生产 runtime 不依赖离线内容环境的两层架构。

## 2026-04-28 维护追加（五）

- A2UI 版本口径复核：Context7 与当前安装的 `@a2ui/react@0.9.1` README 均建议新项目使用 `@a2ui/react/v0_9` + `@a2ui/web_core/v0_9`，本仓库继续以 installed package schema 作为运行时真源；若 a2ui.org 文档页与包内 README 对稳定性标注不一致，禁止直接复制外部示例字段，必须先过本地 schema/test/browser guard。
- UI token guard 收紧：`scripts/verifyUiTokenUsage.ts` 现在扫描 TS/TSX 与非 token CSS 的 raw color literal；`tokens.css` 作为令牌真源保留 raw color，`print.css` 与 `globals.css` 的印刷色、mesh fallback、mask color 已收敛到 token。
- 本地基础设施暴露面收口：`docker-compose.dev.yml` 的 Postgres、Redis、cpp-runner 改为只绑定 `127.0.0.1`，并修正 Postgres volume 到官方数据目录 `/var/lib/postgresql/data`。
- 端口规划文档落地：新增 `docs/plans/2026-04-28-port-map-and-exposure-plan.md` 并维护为确认后的端口设计：SSH `9179` 公网、Caddy `80/443` 公网且强制 HTTPS / TLS 1.2+ / HTTP/2+、Express API `7654` 仅本机反代、Postgres `4397` 与 Redis `4395` 不开放公网、Vite dev `4399` 与 cpp-runner `4401` 仅本地开发/离线环境；Express 保持 `ROUND1_BIND_HOST=127.0.0.1` 默认值，避免仅配置 `PORT` 时 API 监听所有网卡。
- 本地开发 runbook 收口：`plan/other-detail.md` 从旧 `D:\round1`、`certss` 与全网卡默认端口映射修正为当前工作区路径、`certs` 与 loopback-only port publishing；宿主机端口使用 `4397` / `4395`，容器内部仍保留官方默认端口。

## 2026-04-28 维护追加（六）

- ExamNew 占位漂移收口：`/exams/new` 从 `PlaceholderPage` 切换为真实 `ExamNew.tsx`，读取 `/api/v1/config/client`、`/api/v1/exams/catalog` 与 `/api/v1/exams/active-draft`，按运行时 `availableExamTypes` / `availableDifficulties` 生成 2×5 试卷类型矩阵，展示 100 分制、试卷时长口径、草稿回收 TTL、可用预制卷数量、难度选择和二次确认 Dialog；创建草稿走 CSRF 保护的 `POST /api/v1/exams`，成功后进入 `/exams/:id`，由现有 FocusLayout/ExamSession 接管开考。
- ExamNew UI 计划漂移收口：`standard/04-ui-ux.md` 与 `plan/uiux_plan.md` 不再要求旧在线组卷 cooldown 倒计时，改为展示 prebuilt-only 目录可用性、缺卷禁用、活动草稿提示；只有后端返回稳定 rate-limit / retry-after 语义时才展示倒计时。
- A2UI payload guard 再收紧：`assertRound1A2uiMessages()` 现在拒绝 `/draft` 之外的组件 data binding path，并对 Image / AudioPlayer / Video 的本地设计 surface URL 做同源或受限 data URL allowlist，防止后续 agent payload 在接入真实消息前绕过数据根和资源边界。
- UI token guard 例外收口：`scripts/verifyUiTokenUsage.ts` 不再整文件跳过 `/dev/ui-gallery`；图库里残留的品牌红 raw hex 文案改为 token 名称，保证设计样本册本身也接受 raw color / inline style / CSS compat guard。

## 文档同步

- `standard/05-frontend-engineering.md` 已补 A2UI 使用边界：只能作为 agent-facing renderer / 设计辅助 surface，必须继承 Round1 token bridge。
- `standard/05-frontend-engineering.md` 已补浏览器告警 guard：禁止 JSX inline style、`color-mix()` 与 `min-height:auto` / `min-width:auto` 回归，并由 `npm run verify:ui-tokens` 自动检查。
- `standard/05-frontend-engineering.md` 与 `standard/04-ui-ux.md` 已补 A2UI 防硬编码要求：payload 由 factory/basic catalog 生成，按 installed package schema 校验后再渲染。
- `standard/04-ui-ux.md`、`standard/14-deployment-ops.md`、`standard/15-performance-accessibility-print.md` 与 `plan/uiux_plan.md` 已把同源 `/font/` 到 R2 `/font/` 的字体代理，以及同源 `/logo/cpplearn.jpg` 到 R2 `/logo/cpplearn.jpg` 的 CppLearn 横幅代理纳入当前契约。
- `standard/04-ui-ux.md` 与 `plan/uiux_plan.md` 已把 A2UI token bridge 纳入 `/dev/ui-gallery` / 交付物口径。
- `standard/04-ui-ux.md`、`standard/05-frontend-engineering.md` 与 `plan/uiux_plan.md` 已补 A2UI media/modal 覆盖、`functionCall` 禁止、data model 路径边界和动态 List 模板引用校验口径。
- `standard/04-ui-ux.md`、`standard/05-frontend-engineering.md` 与 `plan/uiux_plan.md` 已补 A2UI Round1 BYOC custom catalog、动态 `{ call, args }` 函数绑定禁止和本地 primitive 复用要求。
- `standard/04-ui-ux.md`、`standard/15-performance-accessibility-print.md`、`plan/uiux_plan.md` 与 `plan/step-05-coach-and-admin.md` 已补 CoachReport 规模化分页/窗口化、打印分区标记和 180×24 浏览器性能验收结果。
- `standard/04-ui-ux.md` 与 `plan/uiux_plan.md` 已补 CppLearn OIDC 横幅图片的使用边界：只用于身份入口，不替代 Round1 主品牌。
- `plan/reference-config.md` 已补 R2 环境变量示例，说明 Vite 开发代理使用 `R2_PUBLIC_BASE_URL`，生产 Caddy 直接使用 `Caddyfile.example` 中的 R2 源站字面量，前端页面始终只引用同源 `/font/*` 与 `/logo/*`。
- `plan/reference-api.md` 已补 `/account/class` 前端路由表项。
- `plan/reference-api.md`、`plan/step-02-auth-system.md`、`standard/04-ui-ux.md`、`standard/08-security-auth-permissions.md`、`standard/13-config-env.md` 与 `standard/06-backend-api.md` 已补 QQ placeholder 与 enabled provider 的区别，避免未实现 OAuth 被误写为现状可用能力。
- `standard/14-deployment-ops.md`、`plan/step-06-deployment.md` 与 `scripts/README.md` 已补 `contentWorker` 独立 healthcheck 口径。
- `plan/step-05-coach-and-admin.md` 与 `docs/plans/2026-04-26-remaining-unfinished-work.md` 已记录 CoachReport payload/frontend 落地现状，并关闭本轮规模化浏览器性能验收缺口；真实生产 p95 继续按性能标准观测。
- `docs/plans/2026-04-26-remaining-unfinished-work.md` 已记录 A2UI 本轮安装与视觉验收边界，UI/UX 截图、移动端、键盘、reduced motion 与打印视觉验收仍未整体关闭。
- `docs/plans/2026-04-26-remaining-unfinished-work.md` 已关闭 ExamResult/Dashboard/打印 A4 的本轮 Playwright 视觉验收缺口，并保留全路由截图、键盘与真实打印预览等整体 UI/UX 债务。
- `plan/step-06-deployment.md` 与 `docs/plans/2026-04-28-single-vps-deployment-recommendation.md` 已记录单 VPS 部署方式推荐：首发 Caddy + PM2/systemd + native Postgres/Redis，Podman Quadlet 二期可选，Kubernetes/k3s 在单 VPS 阶段 deferred。
- `standard/05-frontend-engineering.md`、`standard/14-deployment-ops.md`、`plan/reference-config.md`、`plan/step-06-deployment.md` 与 `docs/plans/2026-04-28-port-map-and-exposure-plan.md` 已补端口暴露与 token guard 收口口径：单机 Postgres/Redis 默认本机访问，生产公网入口为 SSH 9179 与 Caddy 80/443，API/DB/Redis/runner 不公网监听。
- `plan/step-04-exam-and-grading.md` 与 `docs/plans/2026-04-26-remaining-unfinished-work.md` 已补 `/exams/new` 真实页面落地和本轮视觉验收口径，避免 Step 04 已完成运行时接口与前端入口仍是占位之间的漂移。
- `standard/04-ui-ux.md` 与 `plan/uiux_plan.md` 已把 ExamNew 从旧 cooldown 文案更新为 prebuilt-only 可用性文案，避免 UI 标准重新要求已删除的在线组卷冷却语义。

## 验证记录

- `npm run lint`：通过，0 errors / 0 warnings。
- `npm run verify:ui-tokens`：通过，`verifyUiTokenUsage: ok (83 files checked)`，现已实际扫描 CSS 并阻断 `min-height:auto` / `min-width:auto` 兼容告警回归。
- `npm run client:test -- client/src/lib/a2ui-design-surface.test.ts`：通过，1 file / 8 tests。
- `npm run client:test -- src/lib/coach.test.ts src/lib/a2ui-design-surface.test.ts`：通过，2 files / 15 tests，覆盖 CoachReport 分页/CSV 防公式和 A2UI BYOC / 函数绑定 guard。
- `npm run verify:offline-artifacts`：通过，`verifyOfflineArtifactNames: ok (137 files checked)`。
- `npm run test -- server/__tests__/safeReturnTo.test.ts`：通过，18 tests。
- `npm run test -- server/__tests__/coach-classes.integration.test.ts`：通过，7 tests，覆盖班级报告热力图、题型统计、学生详情与趋势 payload。
- `npm run test`：通过，29 files / 218 tests。
- `npm run client:test`：通过，9 files / 52 tests。
- `npm run client:test -- src/lib/dashboard.test.ts src/lib/a2ui-design-surface.test.ts`：通过，2 files / 13 tests，覆盖 Dashboard radar/heatmap helper 与 A2UI guard。
- `npm run client:test -- src/lib/client-config.test.ts`：通过，1 file / 2 tests，覆盖 `authProviderPlaceholders` 前端配置读取。
- `npm run test -- server/__tests__/auth-integration.test.ts -t "auth/providers"`：通过，2 tests，覆盖 QQ 仅作为 placeholder 暴露且不混入 enabled provider。
- `npm run test -- server/__tests__/pow.test.ts -t "GET /config/client"`：通过，1 test，确认 `/api/v1/config/client` 返回 `authProviderPlaceholders` 且不泄露 secret。
- `npm run test:e2e -- ui-visual-audit.spec.ts`：通过，3 tests，覆盖 Dashboard 桌面/移动、ExamResult reduced-motion/print markers 与 A2UI BYOC gallery。
- `npm run build:server`：通过。
- `npm run build:client`：通过；`/font/*.woff2` 仍按运行时同源代理解析，Vite build-time unresolved 提示符合当前字体托管设计。
- `npm run healthcheck -- --help`：通过，确认 `--expect-content-worker` 离线内容环境验收参数已出现在脚本 usage。
- `npm run client:test -- src/lib/exam-new.test.ts src/lib/exam-runtime.test.ts src/lib/a2ui-design-surface.test.ts`：通过，3 files / 26 tests，覆盖 ExamNew 配置矩阵/API client、A2UI data binding/media URL guard 与既有 payload schema。
- `npm run verify:ui-tokens`：通过，`verifyUiTokenUsage: ok (87 files checked)`；确认 `/dev/ui-gallery` 不再依赖整文件豁免且本轮新增页面未引入裸色值、inline style 或 flex/browser-warning 回归。
- `npx eslint <本轮前端/测试 touched files>`：通过，覆盖 ExamNew、exam runtime helper、A2UI guard、UI token guard 与新增视觉 E2E。
- `npx prettier --check <本轮 touched files>` 与 `git diff --check`：通过，确认本轮代码/文档排版与空白检查无异常。
- `npm run build:client`：通过，确认 `/exams/new` lazy route、A2UI guard 与 UI gallery token guard 源码可通过 TypeScript/Vite 构建；`/font/*.woff2` 仍按运行时同源代理解析。
- `npm run test:e2e -- server/__tests__/e2e/ui-visual-audit.spec.ts --grep ExamNew`：通过，1 test，覆盖 `/exams/new` 桌面/移动无水平溢出、运行时 catalog 渲染与开考确认 Dialog。
- Browser check：`https://127.0.0.1:5175/dev/ui-gallery#plate-11` headless Chromium 桌面视口中 A2UI surface 真实渲染，console badCount=0（0 errors / 0 warnings / 0 pageerror）。2026-04-28 维护追加后，`/login` 的 CppLearn OIDC 入口已从纯文字字标切换为 `/logo/cpplearn.jpg` 同源横幅图片；`/coach/report` 首次复查发现未登录 401 resource error，已补 `/api/v1/auth/session` 前置守卫并复查桌面/移动均为 0 warnings / 0 errors；`/dev/ui-gallery#plate-11` 维护追加后复查仍为 0 warnings / 0 errors。维护追加（二）在 `https://127.0.0.1:5178/coach/report` 使用 Playwright 拦截 API 注入 180 名学生 × 24 个知识点规模化数据：桌面首屏热力图 643ms、移动 2418ms，均无水平溢出；学生详情 Sheet 可打开并渲染题型下钻；打印态页眉为 `block`、`data-no-print` 为 `none`、打印区 `break-inside: avoid`；`https://127.0.0.1:5178/dev/ui-gallery#plate-11` 的 Round1 BYOC 可见；最终 badCount=0（0 console warning/error、0 pageerror、0 requestfailed）。
- `npm run client:test -- src/lib/coach.test.ts src/lib/a2ui-design-surface.test.ts`：通过，2 files / 18 tests，覆盖 Coach helper、assignment 状态汇总与 A2UI Coach BYOC/data binding guard；首次运行因本地 `node_modules` 缺少已声明的 A2UI 包失败，执行 `npm install` 后恢复，`package-lock.json` 内容 hash 与 HEAD 一致。
- `npm run test -- server/__tests__/coach-classes.integration.test.ts`：通过，1 file / 8 tests，新增覆盖 coach/admin 读取已发布预制卷 assignable 摘要。
- `npx eslint <本轮 Coach/A2UI/server touched files>`、`npx prettier --check <本轮 touched files>` 与 `git diff --check`：通过，确认新增 Coach 页面、A2UI BYOC、coach route/schema/service 与计划文档均保持当前 lint/format/whitespace gate 干净。
- `npm run verify:ui-tokens`：通过，`verifyUiTokenUsage: ok (89 files checked)`，确认新增 Coach 页面和 A2UI BYOC 未引入 raw color / inline style / CSS compat 回归。
- `npm run build:client`：通过，确认 `/coach/classes`、`/coach/assignments` lazy route、A2UI catalog 与 UI gallery payload 可通过 TypeScript/Vite 构建；`/font/*.woff2` 仍按运行时同源代理解析。
- `npm run build:server`：通过，确认 `GET /api/v1/coach/prebuilt-papers` route/schema/service 可通过 TypeScript 构建。

## 剩余风险

- A2UI 当前只接入 `/dev/ui-gallery` 示例 surface，尚未连接真实 agent/MCP payload；后续若接入外部 agent 消息，必须先补 payload 校验、权限边界、复杂度限制与 XSS/DoS 防护。Markdown 已接入 sanitizer renderer，但外部 payload 的字段级校验与执行限制仍不能省略。
- 字体和品牌图片代理当前按本机 `.env` 的公开 `R2_PUBLIC_BASE_URL=https://r2.round1.cc` 以及 `Caddyfile.example` 的 R2 源站字面量收口；若部署环境变更公开域名，必须同步 Vite `/font/*`、`/logo/*` 开发代理、Caddyfile 生产代理、CSP 和本文件记录，避免资源源再次漂移。
- UI/UX 仍保留全路由截图、键盘、真实 Chrome 打印预览 PDF、登录/考试/Admin 全流程截图等整体视觉验收债务；本轮已收口 A2UI bridge、R2 字体源、浏览器告警 guard、导航/回跳漂移、Dashboard 雷达/热力图、ExamResult reduced-motion 与打印 marker 验收。
- 单 VPS 部署推荐已形成，但真实域名、Caddy/TLS、PM2 reload、备份恢复、Sentry、邮件 DNS、安全加固与回滚仍未实机演练，不能视为生产上线完成。
