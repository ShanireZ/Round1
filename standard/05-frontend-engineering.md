# 前端工程规范

## 技术边界

当前前端技术栈为 React 19、TypeScript、Vite、React Router 7、TanStack Query v5、shadcn/ui、Radix、Tailwind CSS 4、react-hook-form、Zod、lucide-react、motion、sonner。不得无计划引入第二套 UI 组件库、全局状态库或 CSS-in-JS 体系。

## 前端产品原则

- 前端首先保证核心流程可靠：登录、恢复考试、保存、提交、结果查看、Admin 导入和设置。
- 视觉和交互遵守 `plan/uiux_plan.md` 与 [04-ui-ux.md](04-ui-ux.md)，不在单页重新发明组件风格。
- 用户可恢复错误要给下一步动作；不可恢复错误要保留 request id 或可排障线索。
- 前端不得把后端权限、状态机或数据校验当作可选项；隐藏按钮只是体验优化。
- 所有复杂 UI 变更都应考虑 loading、empty、error、disabled、offline/slow network、mobile、dark mode、keyboard。

## 组件设计

- 组件必须保持 render 纯净：渲染阶段不得写全局变量、发请求、写 localStorage、改 document。
- 副作用必须放在 event handler、TanStack Query mutation 或 `useEffect` 中。
- 多 prop 组件使用 `interface XxxProps`，公共组件 prop 要加必要 JSDoc。
- 页面组件只编排数据和布局；可复用 UI 放 `client/src/components/**`，领域逻辑放 `client/src/lib/**` 或领域组件。
- UI primitive 不直接调用业务 API。
- 组件文件默认只导出一个主要组件；shadcn primitive 可按现有模式导出子组件。

组件拆分优先按用户任务和领域职责，不按“Header/Body/Footer”机械拆分。一个组件如果需要同时理解权限、表单、表格筛选和弹窗状态，通常应拆出 hook、领域 helper 或子组件。

## 状态管理

- 服务端数据使用 TanStack Query；不得用 `useEffect + fetch` 重复实现缓存、重试、失效。
- 表单状态使用 react-hook-form + Zod resolver。
- 仅组件内部交互状态使用 `useState`。
- 跨页面持久偏好仅限主题、必要本地草稿缓存等；写入 localStorage 必须有版本或容错。
- 考试答案可靠性以服务端 autosave 为准，`beforeunload keepalive` 只作为 best-effort 补充。

状态来源必须清晰：

- URL 保存页面导航、筛选、分页等可分享状态。
- Query cache 保存服务端数据，不作为长期业务真源。
- Form state 保存未提交输入。
- `sessionStorage` 仅保存当前标签相关数据，例如 `tabNonce`。
- `localStorage` 仅保存非敏感偏好，并带版本或兼容读取。

不得把权限、价格、考试状态、题目快照等服务端真源写入本地存储后长期信任。

## API 调用

- API client 必须统一处理 `success/error` envelope、CSRF、401/403/409/429。
- mutation 成功后必须精准 invalidation，禁止全局粗暴刷新全部 query。
- 对考试 autosave 使用增量 patch，不发送整包覆盖。
- 409 `X-Tab-Nonce` 冲突必须提示用户并停止本标签保存，不能静默覆盖。
- 503 `ROUND1_PREBUILT_PAPER_UNAVAILABLE` 必须显示可理解空态。

错误处理要求：

- 401 引导重新登录，并尽量保留用户当前上下文。
- 403 说明无权限，不展示“系统错误”。
- 409 展示冲突对象和建议动作，例如刷新、切换标签、联系管理员。
- 429/503 如果后端返回 retry 信息，前端应展示等待或重试建议。
- validation error 映射到字段；无法定位字段时使用 form-level alert。

页面不得只 `console.error` 后保持静默失败。

## 路由与权限

- 路由定义集中在 `client/src/router.tsx` 与导航配置。
- 菜单按角色渐进显示；不得提供角色切换器。
- 未授权页面必须由后端权限兜底，前端隐藏只作为体验优化。
- 旧 Admin 路径 `/admin/jobs`、`/admin/manual-gen` 不得恢复。

路由恢复和跳转必须尊重考试优先级：存在 active attempt 时，不得把用户直接带到普通 Dashboard 而丢失继续作答入口。认证回跳只接受 `safeReturnTo` 允许的站内路径。

## Tailwind 与样式

- 所有设计决策进入 `tokens.css` 或 `globals.css` 的 token，不在页面里散落 magic color。
- Tailwind 类用于布局与状态组合；复杂变体优先用 `class-variance-authority`。
- 使用 `cn()` 合并类名，避免手写字符串拼接导致冲突。
- 禁止在 JSX 中使用 `style` prop 写动态样式；动态视觉值必须收敛为 token、预定义 class、CSS utility 或受控组件属性，避免 Microsoft Edge Tools `no-inline-styles` 告警。
- 禁止在生产 CSS/TSX 中使用 `color-mix()`，直到浏览器支持基线明确放宽；渐变和透明混色应落到 `tokens.css` 的静态 token，避免 Chrome < 111 兼容告警。
- 禁止写入会触发当前浏览器基线告警的 CSS 值，例如 `min-height: auto` / `min-width: auto`；需要重置控件尺寸时使用明确的 `width`、`height`、`min-height: 0` 或 token 化尺寸。
- 不使用 viewport-width 驱动字体大小。
- 卡片圆角默认遵守 token：按钮/输入 8px，卡片/Dialog 12px。
- Dark 模式必须通过 token 支持，不得写只适配 light 的硬编码颜色。

## 表单

- 所有提交前端先做 Zod 校验，后端仍必须重复校验。
- 错误信息放在字段附近，并把 server error 映射到对应字段或 form-level alert。
- loading 状态保持按钮宽度，不造成布局跳动。
- destructive 操作必须有确认 Dialog；Admin 敏感操作还需要 step-up。

## 图表与数据展示

- 数字、分数、计时、排行榜使用 tabular nums。
- Dashboard/CoachReport 可用 Skeleton 表示数据积累中，不得伪造趋势。
- 图表颜色使用既定 6 色板；热力图使用既定连续色阶。

表格和列表必须做到：

- 分页、筛选、排序状态可见。
- 空态区分“没有数据”和“当前筛选无结果”。
- 批量操作前展示范围，例如当前页、当前筛选结果或选中项。
- Admin 列表刷新后保留合理筛选上下文，不让操作者误以为操作失败。

## 可维护性

- 组件超过约 250 行或出现多个独立状态机时应拆分。
- 不在页面里直接写长 JSON mock；测试 fixture 放测试目录。
- 不把业务错误码写成散落字符串，优先集中枚举或 helper。
- 新 UI 必须在 `/dev/ui-gallery` 或等价页面补展示，便于视觉回归。

新增依赖前必须说明为什么现有 React、Radix、TanStack Query、Zod、Tailwind 或少量本地 helper 无法解决。纯 UI 便利库、日期库、图表库、表格库尤其要评估包体、可达性和样式一致性。

A2UI 是 agent-facing UI renderer 与设计辅助 surface 的优先体系，用于接收声明式 agent payload 并在本地验收。A2UI surface 必须通过 Round1 token bridge 继承 `tokens.css`，现有 Radix/shadcn primitive 作为生产页面的受控辅助实现，不得绕过页面 IA、品牌色、字体系统或核心流程组件契约。A2UI markdown 内容必须使用官方 sanitizer renderer 或等价的 HTML sanitizer，不得直接渲染未净化的 agent markdown/HTML。

当前 `/dev/ui-gallery` A2UI 示例必须覆盖 surface lifecycle、data model binding、Text/Card/Row/Column/List/Tabs/Divider/Icon、Image/AudioPlayer/Video/Modal、Button action、TextField、CheckBox、Slider、DateTimeInput、ChoicePicker、basic catalog 动态目录和 sanitizer markdown 渲染。A2UI payload 不得以页面内长 JSON 硬编码散落，必须经本地 factory、installed `basicCatalog` schema、组件 id 唯一性、引用完整性、action allowlist 与复杂度上限校验后再交给 renderer。引用完整性必须覆盖动态 `List.children.componentId` 模板。data model 更新路径必须严格限定在允许根路径或其子路径，例如 `/draft` 或 `/draft/*`，禁止仅靠字符串前缀放行。Button action 只允许已登记 `event.name`；`functionCall` 在未完成显式 agent bridge、权限和审计设计前禁止进入前端 renderer。若 Context7 文档示例与本项目已安装 A2UI package schema 出现字段差异，以运行时 package schema 为准并同步测试。若后续接入真实 agent/MCP payload，必须先补字段级 schema 校验、复杂度限制、权限边界和 XSS/DoS 防护。

## 前端验证

常规前端变更至少运行：

```bash
npm run build --workspace=client
```

涉及逻辑 helper 时运行对应 `*.test.ts`。涉及关键流程、布局或打印时补 Playwright/截图验收。

手工验收必须写明浏览器宽度或设备类型。涉及 Admin、Coach、Student 差异时，至少验证受影响角色，不用一个 admin 账号代替全部角色。

## 分层结构

| 层                   | 职责                            | 禁止                 |
| -------------------- | ------------------------------- | -------------------- |
| `pages/`             | 路由页面、数据编排、页面级布局  | 放可复用业务算法     |
| `components/ui/`     | shadcn/Radix primitive          | 调业务 API           |
| `components/layout/` | AppShell/Auth/Focus/Ceremony    | 放页面业务状态       |
| `components/brand/`  | Logo、Mesh、Backdrop、Noise     | 临时页面文案         |
| `lib/`               | API client、纯函数、领域 helper | React 组件           |
| `styles/`            | tokens/globals/print            | 页面私有 magic color |

新增目录前必须证明现有层无法表达。

## React 规则

- 组件和 hooks 必须遵守 React purity：同输入同输出。
- `useEffect` 只用于同步外部系统；能在 render 中派生的值不得放 effect。
- 不在 effect 中无依赖 setState 造成循环。
- 不直接 mutate props、state、query result。
- 列表 key 必须稳定，不用数组 index 表示可重排数据。
- `useMemo/useCallback` 只用于性能或引用稳定需求，不作为默认仪式。
- Error boundary 用于页面级崩溃隔离；表单错误不用 Error boundary。

## TanStack Query 规则

- Query key 必须结构化，包含领域和过滤条件。
- Mutation 成功后只 invalidate 受影响 key。
- 后端 401/403/409/429 必须由统一 API 层标准化。
- 可恢复错误在页面展示，不只 console.error。
- 对考试/提交等关键 mutation，按钮 loading 期间应防重复提交。

## React Router 规则

- 路由路径集中定义，不在组件中散落硬编码 path。
- 导航菜单使用同一配置源。
- 受保护路由前端只做体验 gate，后端必须兜底。
- App 启动恢复考试必须优先于普通 dashboard 跳转。

## shadcn/Radix 规则

- 不破坏 Radix 的 aria、focus trap、keyboard navigation。
- 包装组件时必须透传 `ref` 和关键 props。
- Dialog/Sheet/Popover 关闭后 focus 应回到触发器。
- Dropdown destructive item 必须有清晰样式和确认策略。

## 考试前端可靠性

- `tabNonce` 存在 `sessionStorage`，请求用 `X-Tab-Nonce`。
- autosave 只发送 pending patches。
- submit 应携带最后 pending patches。
- keepalive 保存不保证成功，UI 不得把它当唯一可靠保存。
- 进入 Exam 页时必须能从服务端 active attempt 恢复。

考试页渲染失败时应优先保留恢复路径：显示可重试错误和返回 Dashboard/active attempt 的入口，而不是空白页。提交按钮必须在最后一次 pending patch 处理期间防重复点击，并对最终状态以服务端结果为准。

## 前端 PR 检查清单

- 是否新增 magic color、magic spacing 或新字体。
- 是否破坏 UI/UX 定稿的布局与组件规则。
- 是否处理 loading/empty/error/disabled。
- 是否处理移动端和 dark mode。
- 是否有 keyboard/focus/aria。
- 是否有错误码到文案映射。
- 是否有测试或 `/dev/ui-gallery` 展示。
