# UI/UX 与视觉系统规范

## 不可更改的设计方向

Round1 UI/UX 已定稿为 **Modern Editorial x Contest Ceremony**。后续不得改成营销站、常规后台模板、卡通吉祥物风格、单色紫蓝渐变风格或通用 AI 风格页面。

核心原则：

- 日常页面克制专业，关键时刻有竞赛仪式感。
- 排版主导层级，少靠彩色和大阴影。
- 8pt spacing、1px 边框、tabular nums、细腻微交互。
- 数据可视化承担视觉重量，不堆装饰图。
- Utility 页安静高效，Exam/Result 场景专注或仪式化。

## 品牌

- 品牌名固定 `Round1`。
- Logo 方向固定 `R1` monogram，尖括号只作为辅助图形。
- 无 slogan。
- 主色固定竞赛红 `#E63946`；错误红为 `#C8102E` light / `#E11D48` dark。

## 颜色与主题

必须沿用 `client/src/styles/tokens.css` 的 token。新增颜色必须先证明现有语义色无法表达。

| 语义 | Light | Dark |
| --- | --- | --- |
| primary | `#E63946` | `#E63946` |
| destructive | `#C8102E` | `#E11D48` |
| warning | `#F59E0B` | `#FBBF24` |
| success | `#059669` | `#10B981` |
| info | `#0284C7` | `#0EA5E9` |
| bg-base | `#FEF9F8` | `#0A0E1A` |

禁止把品牌红当作所有强调色滥用；数据图表使用既定 6 色板。

## 字体

- UI/正文：`Geist` + `HarmonyOS Sans SC`。
- 代码：`Geist Mono`，关闭 ligature。
- Display：`Fraunces` + `Source Han Serif SC Heavy`，只用于 Hero、Logo、ExamResult 等仪式场景。
- 数字列、计时、分数必须 `font-variant-numeric: tabular-nums`。
- 不得在组件内部随意引入新字体。

## 布局

| Layout | 用途 | 硬约束 |
| --- | --- | --- |
| AuthLayout | 登录、注册、找回密码 | 左视觉右表单，移动端压缩为顶部 banner |
| AppShell | 登录后主布局 | TopBar + Sidebar；权限渐进显示导航 |
| FocusLayout | 考试中 | 隐藏 Sidebar/通知/搜索，只保留进度、倒计时、交卷 |
| CeremonyLayout | 交卷揭晓 | 全屏 overlay，2-3 秒，可 ESC 跳过 |

内容区默认 `max-w-7xl`，桌面 `px-8 py-12`。不得把页面主体包进大浮卡。

## 组件

- Button：`primary / secondary / ghost / destructive / link`，默认 `h-10 rounded-md`。
- Card：默认靠 border，不靠重阴影；卡片内禁止再套装饰卡片。
- Table：行高 `h-14`，无斑马纹，hover 使用淡红晕。
- Badge：竞赛语义必须区分 AC/WA/TLE/MLE/RE/未作答/已保存，且不只靠颜色表达。
- Dialog/Sheet/Popover：使用 Radix/shadcn 基础，保留 focus trap 与 ARIA。
- 图标：统一 lucide-react，线宽 1.5px；图标按钮必须有 aria-label 或 Tooltip。

## 页面 IA

必须保持 `plan/uiux_plan.md` 的页面结构：

- Dashboard：Hero + 最近考试 + 能力/弱项/历史 + 静态建议。
- ExamNew：2x5 试卷类型大卡片 + 规则说明 + 频控倒计时 + 二次确认。
- Exam：FocusLayout、底部题目导航、30s autosave debounce、最后 5/1 分钟警示。
- ExamResult：提交后触发 Ceremony，再进入详情页；讲解卡片内嵌。
- CoachReport：热力图主视觉，点击学生右 Sheet 下钻。
- Admin：题库、预制卷库、导入中心、用户、审核、设置；Utility 风格。

## 动效

- 默认动效只用 transform/opacity。
- 按钮按下 `translateY(1px)`。
- 列表入场可 stagger，但子项间隔约 40-50ms。
- 数字滚动只用于 ExamResult 分数揭晓。
- `prefers-reduced-motion: reduce` 必须关闭 >200ms 动效，仪式层退化为静态揭示。

## 可达性

- 对比度：正文 >= 4.5:1，大标题/图标控件 >= 3:1。
- 键盘全流程可操作。
- Focus 必须可见，使用品牌红 glow。
- 错误提示必须有文字和图标，不只靠颜色。
- 首次访问主题跟随系统，用户选择写入 localStorage。

## 验收

UI 改动必须至少检查：

- Light/Dark 双主题。
- 桌面、笔记本、移动端关键断点。
- 键盘 Tab 顺序。
- `prefers-reduced-motion`。
- 文案不溢出、不遮挡、不与按钮/卡片冲突。
- 需要打印的页面必须用 A4 预览验证。

