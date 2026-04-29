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

## 风险与后续

- Recharts 只作为图表 primitive 的底层实现，不允许页面绕过本地 chart 组件直接散落样式。
- A2UI production slot 第一阶段仍使用本地 guarded payload；真实 agent/MCP 接入前必须补后端权限、审计和操作执行设计。
- 动态背景必须以数据含义驱动，并在 reduced motion 下退化为静态。
