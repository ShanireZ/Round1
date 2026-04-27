# 性能、可达性与打印规范

## 性能目标

- 移动端 Lighthouse LCP 目标 < 2.5s。
- 首屏不阻塞在非关键字体、图表库、仪式动画上。
- 动效保持 60fps，优先 transform/opacity。
- API 热路径 p95 latency 应持续观察并建立告警。

## 前端性能

- 字体使用 `font-display: swap`。
- Geist/HarmonyOS 关键字重可 preload；Fraunces/思源宋体 Heavy 只在 Hero/ExamResult/AuthLayout 场景加载。
- 图表库按需 lazy load。
- 大型 JSON、报告、题库详情不得一次性渲染全量；列表分页或虚拟化。
- 代码块和题目渲染器要避免输入时全页重渲染。
- Exam autosave debounce 当前按 30s 与后端频控对齐。

## 后端性能

- 热路径必须有索引：active attempt、exam selection、published prebuilt papers、assignment progress、import batch list。
- 数据库连接池区分 API、runtime worker、content worker。
- 列表接口必须有分页和上限。
- 避免在请求路径同步执行 LLM、cpp-runner、长耗时内容生成。
- 生产 runtime 不依赖 runner 健康状态。

## 可达性

必须满足：

- 键盘完整可达。
- Focus 可见。
- Dialog/Menu/Select 使用 Radix/shadcn 保留 ARIA 行为。
- 图标按钮有 `aria-label` 或 Tooltip。
- 错误不只靠颜色。
- 正文对比度 >= 4.5:1，大字号和 UI 控件 >= 3:1。
- `prefers-reduced-motion` 下关闭长动画。
- 页面有 skip-to-content。

## 考试可达性

- FocusLayout 不应隐藏核心导航。
- 倒计时变化必须有文字状态，不只靠颜色。
- 最后 5 分钟/1 分钟警示应避免过度闪烁。
- 题目选项支持键盘选择。
- 填空题输入框必须有可读标签或上下文。

## 打印

打印样式必须适用于试卷和结果页：

- A4，margin 2cm。
- 移除背景色、阴影、动效、品牌色。
- 中文宋体，英文 Times New Roman，代码 Courier New。
- 每题避免跨页截断。
- FillBlank input 转下划线空格。
- 页眉包含 R1/试卷编号/页码，页脚包含生成时间。

## 视觉回归

涉及 UI/打印/响应式时必须至少人工或 Playwright 检查：

- Dashboard。
- ExamNew。
- Exam。
- ExamResult。
- CoachReport。
- AdminImports。
- `/dev/ui-gallery`。

## 性能例外

如必须引入大依赖或大资源，PR 必须说明：

- 用户价值。
- 包体/加载影响。
- 是否 lazy load。
- 替代方案。
- 回滚路径。

