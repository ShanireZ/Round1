# 前端工程规范

## 技术边界

当前前端技术栈为 React 19、TypeScript、Vite、React Router 7、TanStack Query v5、shadcn/ui、Radix、Tailwind CSS 4、react-hook-form、Zod、lucide-react、motion、sonner。不得无计划引入第二套 UI 组件库、全局状态库或 CSS-in-JS 体系。

## 组件设计

- 组件必须保持 render 纯净：渲染阶段不得写全局变量、发请求、写 localStorage、改 document。
- 副作用必须放在 event handler、TanStack Query mutation 或 `useEffect` 中。
- 多 prop 组件使用 `interface XxxProps`，公共组件 prop 要加必要 JSDoc。
- 页面组件只编排数据和布局；可复用 UI 放 `client/src/components/**`，领域逻辑放 `client/src/lib/**` 或领域组件。
- UI primitive 不直接调用业务 API。
- 组件文件默认只导出一个主要组件；shadcn primitive 可按现有模式导出子组件。

## 状态管理

- 服务端数据使用 TanStack Query；不得用 `useEffect + fetch` 重复实现缓存、重试、失效。
- 表单状态使用 react-hook-form + Zod resolver。
- 仅组件内部交互状态使用 `useState`。
- 跨页面持久偏好仅限主题、必要本地草稿缓存等；写入 localStorage 必须有版本或容错。
- 考试答案可靠性以服务端 autosave 为准，`beforeunload keepalive` 只作为 best-effort 补充。

## API 调用

- API client 必须统一处理 `success/error` envelope、CSRF、401/403/409/429。
- mutation 成功后必须精准 invalidation，禁止全局粗暴刷新全部 query。
- 对考试 autosave 使用增量 patch，不发送整包覆盖。
- 409 `X-Tab-Nonce` 冲突必须提示用户并停止本标签保存，不能静默覆盖。
- 503 `ROUND1_PREBUILT_PAPER_UNAVAILABLE` 必须显示可理解空态。

## 路由与权限

- 路由定义集中在 `client/src/router.tsx` 与导航配置。
- 菜单按角色渐进显示；不得提供角色切换器。
- 未授权页面必须由后端权限兜底，前端隐藏只作为体验优化。
- 旧 Admin 路径 `/admin/jobs`、`/admin/manual-gen` 不得恢复。

## Tailwind 与样式

- 所有设计决策进入 `tokens.css` 或 `globals.css` 的 token，不在页面里散落 magic color。
- Tailwind 类用于布局与状态组合；复杂变体优先用 `class-variance-authority`。
- 使用 `cn()` 合并类名，避免手写字符串拼接导致冲突。
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

## 可维护性

- 组件超过约 250 行或出现多个独立状态机时应拆分。
- 不在页面里直接写长 JSON mock；测试 fixture 放测试目录。
- 不把业务错误码写成散落字符串，优先集中枚举或 helper。
- 新 UI 必须在 `/dev/ui-gallery` 或等价页面补展示，便于视觉回归。

## 前端验证

常规前端变更至少运行：

```bash
npm run build --workspace=client
```

涉及逻辑 helper 时运行对应 `*.test.ts`。涉及关键流程、布局或打印时补 Playwright/截图验收。

## 分层结构

| 层 | 职责 | 禁止 |
| --- | --- | --- |
| `pages/` | 路由页面、数据编排、页面级布局 | 放可复用业务算法 |
| `components/ui/` | shadcn/Radix primitive | 调业务 API |
| `components/layout/` | AppShell/Auth/Focus/Ceremony | 放页面业务状态 |
| `components/brand/` | Logo、Mesh、Backdrop、Noise | 临时页面文案 |
| `lib/` | API client、纯函数、领域 helper | React 组件 |
| `styles/` | tokens/globals/print | 页面私有 magic color |

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

## 前端 PR 检查清单

- 是否新增 magic color、magic spacing 或新字体。
- 是否破坏 UI/UX 定稿的布局与组件规则。
- 是否处理 loading/empty/error/disabled。
- 是否处理移动端和 dark mode。
- 是否有 keyboard/focus/aria。
- 是否有错误码到文案映射。
- 是否有测试或 `/dev/ui-gallery` 展示。
