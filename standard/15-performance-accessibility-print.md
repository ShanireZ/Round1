# 性能、可达性与打印规范

## 性能目标

- 移动端 Lighthouse LCP 目标 < 2.5s。
- 首屏不阻塞在非关键字体、图表库、仪式动画上。
- 动效保持 60fps，优先 transform/opacity。
- API 热路径 p95 latency 应持续观察并建立告警。
- V2 数据背景、A2UI slot 和 Recharts 图表不得阻塞登录、考试、提交、结果查看、Coach 报告和 Admin 操作主路径。

性能目标用于发现退化，不用于追求空泛高分。考试作答、保存、提交、恢复的可靠性优先于装饰性动效和低价值包体优化。

## 前端性能

- 字体使用 `font-display: swap`。
- 字体默认通过同源 `/font/` 加载；开发环境由 Vite 读取 `R2_PUBLIC_BASE_URL` 代理到 R2 `/font/`，生产环境由 `Caddyfile.example` 中的 R2 源站字面量代理到同一路径。Geist/HarmonyOS 关键字重可 preload；Fraunces/思源宋体 Heavy 只在 Hero/ExamResult/AuthLayout 场景加载。CppLearn OIDC 横幅图片通过同源 `/logo/cpplearn.jpg` 按开发/生产代理到 R2 `/logo/cpplearn.jpg`，按普通静态资源缓存。
- 图表库按需 lazy load。
- 大型 JSON、报告、题库详情不得一次性渲染全量；列表分页或虚拟化。
- CoachReport 热力图和学生表在规模化班级中必须分页、窗口化或虚拟化，禁止一次性渲染全量 student × knowledge point 矩阵；分页大小等渲染上限应集中在领域 helper 常量中，不能散落硬编码。
- 代码块和题目渲染器要避免输入时全页重渲染。
- Exam autosave debounce 当前按 30s 与后端频控对齐。

页面级策略：

- Dashboard/CoachReport 图表可延迟加载，但首屏 KPI 和主要 CTA 必须先可用。
- Exam 页不得因图表、仪式动画或非必要字体阻塞题目渲染。
- ExamResult 仪式层失败时必须退化为普通结果页，不影响分数和解析查看。
- Admin 大表格必须分页、筛选和局部刷新；不得一次性渲染全量题库或导入历史。
- Recharts 图表必须通过本地 chart primitive，并给容器设置明确高度、`min-h-*` 或 aspect，避免 responsive chart 首次测量失败。
- 动态背景只允许 CSS/SVG/轻量 motion，必须有 reduced-motion 静态降级；禁止视频背景和不可解释循环装饰。
- A2UI production slot 必须 lazy/idle 初始化或在主内容后渲染；payload 解析失败时显示静态 fallback，不得让页面空白。

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
- Recharts 图表、热力图和 A2UI 生成报告必须提供文本摘要或等价数据表；关键结论不能只靠图形或颜色。

可达性实现以语义和可操作性为先，不用 ARIA 修补本来可以用原生元素表达的控件。

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
- 报告型页面必须显式标记打印区和非打印控件，例如 `data-print-surface` 与 `data-no-print`，避免 CSV/筛选/分页控件进入正式打印材料。

## 视觉回归

涉及 UI/打印/响应式时必须至少人工或 Playwright 检查：

- Dashboard。
- ExamNew。
- Exam。
- ExamResult。
- CoachReport。
- AdminImports。
- AdminDashboard。
- Account/Auth。
- `/dev/ui-gallery`。

## 性能例外

如必须引入大依赖或大资源，PR 必须说明：

- 用户价值。
- 包体/加载影响。
- 是否 lazy load。
- 替代方案。
- 回滚路径。

## 性能预算

| 项            | 目标                        |
| ------------- | --------------------------- |
| LCP           | 移动端 < 2.5s               |
| 交互动画      | 60fps，transform/opacity    |
| 动态背景      | reduced motion 可静态降级   |
| Recharts 图表 | 容器尺寸明确，首屏可测量    |
| A2UI slot     | 有 fallback，payload 有上限 |
| API p95       | 按路由建立基线，异常需告警  |
| autosave      | 30s debounce 与后端限频对齐 |
| 页面初始数据  | 只取首屏必要数据            |
| 图表库        | lazy load                   |

性能预算不是绝对上线阻断，但超过预算必须记录原因和优化计划。

## 浏览器与响应式

- 支持现代 Chrome/Edge/Safari/Firefox。
- 页面必须在 320px 宽度可重排，无水平滚动。
- 文本缩放到 200% 不应裁切关键内容。
- 页面缩放到 400% 时主要内容应可访问。
- 考试页手机可继续，但必须提示推荐平板/电脑。

## 可达性测试

每个关键页面至少覆盖：

- 键盘 Tab 顺序。
- Dialog/Sheet 打开和关闭后的 focus。
- 屏幕阅读器可识别主要 heading。
- 表单错误与字段关联。
- 图表有文本摘要或数据表替代。
- reduced motion 模式。
- A2UI slot 的异常/fallback、键盘可达和 action 确认路径。

测试时至少包含一次“只用键盘完成核心路径”的检查。考试、登录、Admin step-up、导入 apply、Coach 下钻属于核心路径。

## 可达性严重级别

| 级别    | 示例                                                      | 处理                     |
| ------- | --------------------------------------------------------- | ------------------------ |
| A0 阻断 | 键盘无法提交考试、Dialog focus 丢失无法关闭、错误只靠颜色 | 合并前修复               |
| A1 必修 | 图表无文本摘要、表单错误未关联字段、移动端关键按钮遮挡    | 本 PR 修复或记录短期收口 |
| A2 改进 | 非核心页面 heading 层级不够理想、辅助文案不够清晰         | 可排 backlog             |

不得把 A0/A1 问题用“用户很少这样操作”作为唯一延期理由。

## 打印验收细则

打印页面必须检查：

- Chrome 打印预览 A4。
- 题目不被截断。
- 代码块不横向溢出不可读。
- 背景、阴影、品牌色已移除。
- 页眉页脚不遮挡正文。
- 结果页讲解在打印中可读。

打印版是正式学习材料，不只是浏览器截图。打印中可以牺牲品牌氛围，但不能牺牲题目、答案、解析、代码缩进和页码。

## 性能测量方式

- 前端首屏用 Lighthouse 或 Playwright trace 记录关键页面，不只凭肉眼感觉。
- 热路径 API 以日志/指标中的 p95、错误率、DB 查询耗时判断，不用单次本地请求代表生产表现。
- 大依赖引入前后应比较 build output 或 network waterfall。
- 打印和可达性无法自动化时，按 [11-testing-quality.md](11-testing-quality.md) 记录手工验收证据。

## 无障碍红线

禁止合并：

- 键盘无法完成核心流程。
- icon-only button 无可访问名称。
- 错误只用红色表示。
- focus 被 CSS 移除且无替代。
- 动效闪烁或无法按 reduced motion 关闭。
