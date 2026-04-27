# UI/UX 与视觉系统规范

> 本文件是 `plan/uiux_plan.md` 的执行型标准。`plan/uiux_plan.md` 保留完整设计方案与设计理由；本文件规定日常实现、评审和验收时必须遵守的硬约束。若两者冲突，以 `plan/uiux_plan.md` 的已定稿设计决策为准，并同步修正本文件。

## 1. 设计定位

Round1 的视觉方向固定为 **Modern Editorial x Contest Ceremony**，即“现代编辑感 x 竞赛仪式感”。

必须保留的体验性格：

- 日常学习、题库、设置、后台页面安静、专业、可扫描。
- 考试开始、交卷揭晓、分数变化等关键节点具备仪式感。
- 排版、留白、数据可视化承担主要层级，而不是依赖大面积装饰。
- 视觉焦点由中性灰阶和单一品牌红控制。
- 细节必须精致：1px 边框、tabular nums、清晰 focus、微位移、低噪声暗色模式。

禁止事项：

- 禁止改成营销落地页风格。
- 禁止引入卡通吉祥物作为主视觉。
- 禁止使用泛紫蓝渐变、单色大面积主题或通用 AI 风格。
- 禁止为单个页面重新设计一套独立视觉语言。
- 禁止把 Utility 页面做成装饰卡片堆叠。

## 2. 适用页面

本规范覆盖所有前端页面与组件：

- Auth：`/login`、`/register`、`/forgot-password`、`/auth/callback`。
- Student：`/dashboard`、`/exams/new`、`/exams/:id`、`/exams/:id/result`、`/account/*`。
- Coach：`/coach/classes`、`/coach/classes/:id`、`/coach/assignments`、`/coach/report`。
- Admin：`/admin`、`/admin/questions`、`/admin/papers`、`/admin/imports`、`/admin/users`、`/admin/review`、`/admin/settings`。
- Dev：`/dev/ui-gallery`。

## 3. 设计变更治理

以下内容视为已定稿，不得在普通功能 PR 中修改：

- 品牌名、Logo 方向、主色、字体系统。
- Light/Dark 主题底色。
- 圆角、间距、阴影、动效 token。
- AppShell、AuthLayout、FocusLayout、CeremonyLayout。
- 页面 IA：Dashboard、ExamNew、Exam、ExamResult、CoachReport、Admin 信息架构。
- QuestionRenderer 展示方式，尤其是讲解卡内嵌。

如确需调整，必须新建计划或 ADR，写明：

- 为什么现有方案无法满足。
- 影响哪些页面和组件。
- 如何迁移现有实现。
- 如何做视觉回归。

## 4. 品牌与 Logo

| 项 | 标准 |
| --- | --- |
| 品牌名 | `Round1` |
| Logo | `R1` monogram |
| 辅助图形 | 尖括号 `⟨ ⟩`，仅用于装饰、分隔线、徽章框、成就系统 |
| Slogan | 无 |
| favicon | 仅 `R1`，16px/32px 可辨识 |

Logo 必须提供亮色底和暗色底适配。禁止使用临时文字 Logo 进入生产。

## 5. 颜色系统

### 5.1 品牌与语义色

| 语义 | Light | Dark | 用途 |
| --- | --- | --- | --- |
| `primary` | `#E63946` | `#E63946` | Logo、主 CTA、当前导航、高亮 KPI |
| `destructive` | `#C8102E` | `#E11D48` | WA、删除、表单错误 |
| `warning` | `#F59E0B` | `#FBBF24` | TLE、MLE、超时、配额紧张 |
| `success` | `#059669` | `#10B981` | AC、完成、通过 |
| `info` | `#0284C7` | `#0EA5E9` | 提示、运行中 |
| `neutral` | Slate 500 | Slate 400 | 未作答、草稿、次要状态 |

品牌红和错误红色相同源但语义不同。品牌红用于引导和品牌记忆；错误红用于风险和破坏性操作，不得互换。

### 5.2 Light 主题

```text
bg-base:     #FEF9F8
surface:     #FFFFFF
subtle:      #FAF3F2
border:      #F0E4E2
divider:     #E4D6D3
muted:       #94A3B8
text-2:      #475569
text:        #0F172A
ink:         #020617
accent-wash: #FDEEEF
```

Light 页面底色必须带极淡品牌红调，不使用纯白作为全页背景。

### 5.3 Dark 主题

```text
bg-base: #0A0E1A
surface: #121826
subtle:  #1E293B
border:  #2D3748
divider: #475569
muted:   #64748B
text-2:  #CBD5E1
text:    #F1F5F9
ink:     #FFFFFF
```

Dark 模式必须有微噪点纹理，opacity 约 `0.015`。禁止使用纯黑全页背景。

### 5.4 图表色板

定性图表使用：

```text
#E63946  #0EA5E9  #10B981  #F59E0B  #8B5CF6  #64748B
```

热力图使用：

```text
#FEF9F8 -> #FDEEEF -> #F8B5BC -> #E63946 -> #8B1538
```

禁止为单个图表临时造色板。

## 6. 字体系统

| 类别 | 字体 | 用途 |
| --- | --- | --- |
| 英文无衬线 | Geist Sans | UI、正文英文、数字 |
| 英文等宽 | Geist Mono | 代码、变量、ID、时间戳 |
| 英文 Display | Fraunces | Logo 衍生大字、Hero、ExamResult 分数 |
| 中文正文 | HarmonyOS Sans SC | 中文 UI、正文、题干 |
| 中文 Display | Source Han Serif SC Heavy | 首页 Hero、ExamResult 仪式页 |

CSS 字体栈固定：

```css
--font-sans: 'Geist', 'HarmonyOS Sans SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
--font-mono: 'Geist Mono', ui-monospace, 'HarmonyOS Sans SC', monospace;
--font-serif: 'Fraunces', 'Source Han Serif SC', Georgia, serif;
```

字体规则：

- 正文 `line-height: 1.6`，`letter-spacing: 0`。
- xs/sm 可用 `letter-spacing: 0.01em`。
- 2xl+ 标题按 plan 可用轻微负字距；紧凑组件内部不得用 hero 字号。
- 代码关闭 ligature：`font-feature-settings: "liga" 0, "calt" 0`。
- 分数、倒计时、表格数字列、排名必须使用 tabular nums。
- 数字滚动动画只允许用于 ExamResult 揭晓。

## 7. 字号与层级

| Token | px | 用途 |
| --- | --- | --- |
| `text-xs` | 12 | 辅助说明、标签、时间戳 |
| `text-sm` | 14 | 表单、表格、正文次级 |
| `text-base` | 16 | 正文主体、题干 |
| `text-lg` | 18 | 强调段落 |
| `text-xl` | 22 | 卡片标题 |
| `text-2xl` | 28 | 页面 H2 |
| `text-3xl` | 36 | 页面 H1 |
| `text-5xl` | 56 | Hero 标题 |
| `text-7xl` | 84 | 品牌大字、揭晓数字 |
| `text-9xl` | 128 | Editorial 背景描边巨字 |

组件内部标题不得超过 `text-xl`，除非组件本身是 Hero 或仪式层。

## 8. 设计令牌

### 8.1 圆角

| Token | 值 | 用途 |
| --- | --- | --- |
| `radius-none` | 0 | 分割线、内联代码 |
| `radius-sm` | 4px | Badge、Tag、Checkbox、Radio |
| `radius-md` | 8px | Button、Input、Select、Tooltip |
| `radius-lg` | 12px | Card、Dialog、Panel、Popover |
| `radius-xl` | 16px | Hero 图卡、大图示 |
| `radius-full` | 9999px | 头像、圆形徽章 |

### 8.2 间距

使用 8pt grid：

```text
4, 8, 12, 16, 24, 32, 48, 64, 96, 128
```

默认：

- 卡片 padding：`24px`。
- 页面内容：`max-w-7xl`。
- Desktop 内容区：`px-8 py-12`。
- Mobile 内容区：`px-4`。

### 8.3 阴影与边框

- 卡片默认无阴影，靠 1px border。
- Hover 只做轻微抬升：`translateY(-1px)` + border 加深。
- Dialog/Dropdown/Tooltip 可用 `shadow-md/lg`。
- Focus 使用 `shadow-glow: 0 0 0 4px rgba(230,57,70,.12)`。
- Dark 模式降低投影，使用 outer glow。

### 8.4 Z-index

```text
base 0
sticky 10
fixed 20
dropdown 30
popover 40
overlay 50
modal 60
toast 70
ceremony 100
```

不得在组件中随意写超过 `z-ceremony` 的层级。

## 9. 布局系统

| Layout | 用途 | 覆盖页面 | 必须满足 |
| --- | --- | --- | --- |
| L1 AuthLayout | 未登录视觉层 | login/register/forgot/callback/join 未登录 | 左 Hero + 右表单，移动端变顶部 banner |
| L2 AppShell | 登录后主布局 | dashboard/account/coach/admin/result | TopBar + Sidebar + 内容区 |
| L3 FocusLayout | 考试专注 | `/exams/:id` | 移除 Sidebar/通知/搜索 |
| L4 CeremonyLayout | 揭晓仪式 | ExamResult 短暂 overlay | 全屏、可 ESC 跳过、尊重 reduced motion |

### 9.1 AppShell

- TopBar 高 `56px`，sticky，`bg-base/80 + backdrop-blur-md + bottom border`。
- Sidebar desktop 默认 `w-60`，laptop 可折叠 `w-14`，mobile 使用 Sheet。
- TopBar 左侧：折叠按钮、R1 Logo、面包屑。
- TopBar 右侧：Cmd+K、通知、头像菜单。
- 内容区居中，避免全页大浮卡。

### 9.2 导航

Student 基础组：

- 首页 `/dashboard`
- 出卷考试 `/exams/new`
- 我的班级 `/account/class`
- 账号安全 `/account/security`

Coach 追加：

- 我的班级 `/coach/classes`
- 任务管理 `/coach/assignments`
- 班级报告 `/coach/report`

Admin 追加：

- 管理看板 `/admin`
- 题库 `/admin/questions`
- 预制卷库 `/admin/papers`
- 导入中心 `/admin/imports`
- 用户管理 `/admin/users`
- 审核队列 `/admin/review`
- 系统设置 `/admin/settings`

选中态固定：左侧 2px 品牌红细条 + `bg-accent-wash` + 品牌红文字。

## 10. 页面视觉策略

| 页面 | 底层 | 视觉重量来源 |
| --- | --- | --- |
| 登录/注册 | Layer B Mesh | 品牌 Hero + 表单 |
| Dashboard | Layer B 顶部 Hero + Layer A 主体 | 最近一战、能力摘要、图表 |
| ExamNew | Layer A | 试卷卡片与规则配置 |
| Exam | 纯素 Layer A | 专注答题 |
| ExamResult | Layer B 全屏仪式 | 分数滚动、粒子、结果 Hero |
| CoachReport | Layer B | 热力图、雷达图 |
| Admin/Settings | Layer A Utility | 表格、筛选、状态 |

Utility 页面不得使用过量 mesh 或大装饰。

## 11. 组件规范

### 11.1 Button

Variants：`primary`、`secondary`、`ghost`、`destructive`、`link`。

Sizes：`sm h-8`、`md h-10`、`lg h-12`、`icon h-10 w-10`。

必须：

- Loading 保持宽度。
- Focus 使用品牌红 glow。
- Pressed 使用 `translateY(1px)`。
- 图标按钮有 `aria-label` 或 Tooltip。

### 11.2 Form

- Input：`h-10 rounded-md border-hair bg-surface px-3 text-sm`。
- Focus：border primary + glow。
- Error：destructive border + 下方错误说明。
- Checkbox/Radio：12px，2px border，选中品牌红。
- Switch：28x16，关闭灰，开启品牌红。
- 表单默认单列，组间 `space-6`，组内 `space-2`。

### 11.3 Card

允许变体：

- default：白底/暗底 + border。
- flat：静态信息。
- hero：大 padding + mesh 背景。
- stat：大数字 tabular nums。
- interactive：整卡可点击。

禁止卡片内嵌套装饰卡片。重复项列表可以用卡片，但页面 section 不得伪装成浮卡堆。

### 11.4 Table

- 表头 `h-12 bg-subtle text-xs uppercase tracking-wider`。
- 行高 `h-14`。
- 单元格 `px-6 text-sm`。
- 数字列右对齐 + tabular nums。
- 无斑马纹。
- Hover 行 `bg-accent-wash`。
- 选中行左侧 2px 品牌红条。
- `<md` 降级为卡片列表。

### 11.5 Badge

竞赛语义必须固定：

| 状态 | 风格 |
| --- | --- |
| AC | emerald 实心 + 对号 |
| WA | Crimson 实心 + 叉号 |
| TLE | amber 实心 + timer |
| MLE | amber outline |
| RE | destructive outline |
| 未作答 | slate outline |
| 已保存 | sky outline |

考试类型 badge 使用 outline：CSP-J 蓝、CSP-S 紫、GESP 1-4 绿、GESP 5-8 橙。

### 11.6 CodeBlock

- 字体 Geist Mono。
- 背景 `bg-subtle`，圆角 `radius-md`，1px border。
- 行号 muted。
- 关键字品牌红、字符串 emerald、数字 amber、注释 muted italic、函数名 sky。
- 复制按钮 hover 出现。
- 填空题高亮行使用 `bg-accent-wash` + 左品牌红条。
- 横向滚动条极细。
- ligature 关闭。

### 11.7 QuestionRenderer

必须支持：

- MCQ。
- ReadCode。
- FillBlank。
- 讲解模式。

规则：

- 题号使用大号 Fraunces。
- 题干使用 HarmonyOS + Geist，`text-base leading-relaxed`。
- MCQ 选项前缀使用 Fraunces 字母 + 圆圈。
- 选项 hover border 加深 + `translateY(-1px)`。
- 讲解必须卡片内嵌，不跳页、不开抽屉。
- 正确选项 emerald border + 对号；错误选项 destructive border + 叉号。

### 11.8 Feedback

- Toast：右上角 4s，左侧 4px 色条。
- Dialog：居中、backdrop blur、危险操作模式。
- Sheet：右侧 `w-96`，用于筛选/详情速览。
- Empty State：图标、标题、说明、CTA 四段式。
- Skeleton：`bg-subtle animate-pulse`。
- Progress：考试顶部极细 `h-0.5`，普通进度 `h-1.5`。

## 12. 页面 IA 硬约束

### 12.1 Dashboard

结构固定：

```text
Hero Band -> 最近考试/能力雷达双栏 -> 错题热力图 -> 智能建议
```

智能建议 MVP 可以是静态规则或占位。不得新增“我的进步”独立页面。

### 12.2 ExamNew

必须包含：

- 2x5 试卷类型大卡片，移动端 1 列。
- 100 分制构成、时长、立即计时警示。
- 频控倒计时。
- 开始考试二次确认 Dialog。

### 12.3 Exam

必须是 FocusLayout：

- 精简 Header：R1、试卷名、进度、倒计时、交卷。
- 顶部 `h-0.5` 品牌红进度条。
- 单题垂直滚动，`max-w-4xl`。
- 底部题目导航始终显示。
- 自动保存状态显示。
- `<md` 首次进入警告但允许继续。

### 12.4 ExamResult

提交后必须触发 CeremonyLayout：

```text
黑底淡入 -> R1 缩放 -> 分数滚动 -> 粒子爆破 -> 查看详情
```

详情页必须包含：

- 分数 Hero。
- 构成摘要。
- 打印 PDF、再来一次、班级排名 CTA。
- 错题分布/用时分析。
- 题目列表卡内嵌讲解。

### 12.5 CoachReport

必须以热力图为主视觉，点击学生行打开右侧 Sheet 下钻，不离开报告页。

### 12.6 Admin

Admin 是 Utility 风格：

- 看板：KPI、导入批次、系统健康、近期活动。
- 题库：筛选、表格、右 Sheet 预览、发布/归档。
- 预制卷库：筛选、详情、复制版本、发布/归档。
- 导入中心：dry-run/apply、错误报告、批次历史、修复重试。
- 设置：Tabs，敏感操作 step-up。

## 13. 图标、插画与空态

- 图标库固定 `lucide-react`。
- 线宽固定 `1.5px`。
- 图标颜色继承 `currentColor`。
- Logo `R1` 独立 SVG，不用 lucide 替代。
- 插画策略为抽象几何 + 数据元素 + 排版即插画。
- 不使用卡通吉祥物。

空态文案与图标必须沿用 plan 清单，例如：

| 场景 | 图标 | 标题 | CTA |
| --- | --- | --- | --- |
| Dashboard 无考试 | `FileText` | 还没有模拟记录 | 开始第一次模拟 |
| 题库无结果 | `Search` | 没有匹配的题目 | 清除筛选 |
| 班级无成员 | `Users` | 班级还没有学生 | 复制邀请码 |
| 网络错误 | `WifiOff` | 网络连接异常 | 重试 |

## 14. 动效

### 14.1 时长

```text
instant 75ms
fast 150ms
normal 250ms
slow 400ms
deliberate 600ms
ceremony 1200-2000ms
```

### 14.2 曲线

```text
ease-standard: cubic-bezier(0.4, 0, 0.2, 1)
ease-enter:    cubic-bezier(0, 0, 0.2, 1)
ease-exit:     cubic-bezier(0.4, 0, 1, 1)
ease-spring:   cubic-bezier(0.34, 1.56, 0.64, 1)
ease-ceremony: cubic-bezier(0.16, 1, 0.3, 1)
```

动效只能使用 transform/opacity 为主。禁止 layout thrashing 动画。

### 14.3 Reduced Motion

`prefers-reduced-motion: reduce` 下：

- 关闭 >200ms 动画。
- Ceremony 静态显示分数。
- 粒子和长 stagger 禁用。

## 15. 加载与错误

- `<100ms` 不显示 loading。
- `100ms-1s` 使用 Skeleton。
- `1-5s` Skeleton + 顶部细进度条。
- `>5s` 内容生产/AI 场景使用步骤式进度。

错误页：

- 404/403/500 使用 AuthLayout 风格。
- 左侧大号编号，右侧说明和 CTA。
- 错误文案不责备用户。

## 16. 可达性

硬性要求：

- 键盘 Tab/Enter/Space/Arrow 全覆盖。
- Focus 可见，使用品牌红 glow。
- Radix 组件不得破坏 ARIA。
- 正文对比度 >= 4.5:1。
- 大标题/UI 控件对比度 >= 3:1。
- 图标按钮必须有 `aria-label` 或 Tooltip。
- 错误必须有文字和图标，不只靠颜色。
- 提供 skip-to-content。
- 屏幕阅读器抽测关键流程。

考试页额外要求：

- 倒计时最后阶段不能只靠颜色。
- 题目导航色块必须有文本/aria 语义。
- FillBlank 输入必须有可访问名称或上下文。

## 17. 本地化与文案

- MVP 中文单语。
- 使用“你”，不用“您”。
- 日期常规：`2026年04月15日`。
- 表格紧凑日期：`2026-04-15`。
- 时间 24h：`14:30:45`。
- 分数：`87.5 分`。
- 相对时间：`刚刚 / N 分钟前 / 昨天 / 绝对日期`。
- 数字千分位：`1,234`。

## 18. 字体托管

- 字体自托管于 Cloudflare R2，后续可迁国内 CDN。
- 不使用 Google Fonts CDN。
- `font-display: swap`。
- 中文字体全量加载，接受初次 5-10MB 代价。
- R2/CDN 必须配置一年长缓存和版本哈希。
- 关键字重 preload，Display 字体按场景懒加载。

## 19. 实现文件映射

当前仓库路径以实际代码为准：

| 类型 | 当前路径 |
| --- | --- |
| tokens | `client/src/styles/tokens.css` |
| globals | `client/src/styles/globals.css` |
| print | `client/src/styles/print.css` |
| UI primitives | `client/src/components/ui/*` |
| Layout | `client/src/components/layout/*` |
| Brand | `client/src/components/brand/*` |
| Theme | `client/src/lib/theme.tsx` |
| Motion | `client/src/lib/motion.ts` |
| UI Gallery | `client/src/pages/dev/UIGallery.tsx` |

`plan/uiux_plan.md` 中早期写到的 `apps/web` 路径属于方案阶段命名；当前仓库落地路径为 `client/`。

## 20. UI Gallery

`/dev/ui-gallery` 必须展示：

- 颜色 token。
- 字体层级。
- Button 所有 variant/size/state。
- Input/Form error。
- Card/Table/Badge/Tabs/Dialog/Sheet/Toast。
- Light/Dark 对比。
- Skeleton/Empty/Error。
- Exam 相关题目组件样式。

生产环境可隐藏 dev 入口，但组件展示页应保留给本地验收。

## 21. 禁止清单

- 禁止新增可见功能介绍文案来解释 UI 怎么用。
- 禁止把 Hero 文字放进卡片里。
- 禁止页面 section 做浮卡。
- 禁止卡片套卡片。
- 禁止大面积使用紫色/蓝紫渐变。
- 禁止一页一个新主色。
- 禁止使用不在 token 中的 magic color。
- 禁止使用没有 aria-label 的 icon-only button。
- 禁止在考试页出现非必要装饰、通知或营销入口。
- 禁止把讲解做成跳页或默认抽屉。
- 禁止修改已定 UI/UX 方向而不更新 plan。

## 22. 验收标准

UI/UX 相关 PR 必须检查：

- `plan/uiux_plan.md` 决策未被破坏。
- `client/src/styles/tokens.css` 没有无依据 token 漂移。
- Light/Dark 双主题可用。
- `sm/md/lg/xl` 断点无遮挡、溢出、重叠。
- 键盘可操作。
- Focus 可见。
- `prefers-reduced-motion` 可用。
- 长中文、长英文、空态、错误态、loading 态可用。
- ExamResult ceremony 可跳过。
- 打印页 A4 预览可读。
- `/dev/ui-gallery` 覆盖新增组件或状态。

推荐验证命令：

```bash
npm run build --workspace=client
npm run test:e2e
```

如未运行 E2E 或截图验收，PR/最终说明必须写明原因。

