# UI/UX V2 与视觉系统硬合同

> 本文件是 Round1 当前 UI/UX 的执行型真源，也是 V2 的硬合同。`plan/uiux_plan.md` 只保留初稿设计理由、历史决策和可追溯背景；日常实现、评审、验收和后续变更以本文件为准。若历史 plan 与本文件冲突，以本文件为准，并同步维护相关 `plan/` 与 `docs/plans/` 记录，防止标准漂移。

## 1. 设计定位

Round1 V2 的视觉方向是 **Precision Workbench x Data Arena**，即“精密工具台 x 数据竞赛场”。

必须保留的体验性格：

- 日常学习、题库、设置、后台页面安静、专业、可扫描。
- Dashboard、CoachReport、AdminDashboard 可以用排名、热力、趋势和状态信号形成数据竞赛氛围。
- 考试开始、交卷揭晓、分数变化等关键节点保留仪式感，但不得影响考试可靠性。
- 排版、留白、数据可视化和状态反馈承担主要视觉层级，而不是依赖大面积装饰。
- 视觉焦点由中性灰阶、单一品牌红和数据语义色控制。
- 细节必须精致：1px 边框、tabular nums、清晰 focus、微位移、低噪声暗色模式。
- 所有视觉值必须进入 token、语义 class、本地 primitive 或受控组件属性；禁止页面散落 magic color、inline style、临时字体和临时动效。

禁止事项：

- 禁止改成营销落地页风格。
- 禁止一页一套独立视觉语言。
- 禁止纯装饰性大渐变、无数据含义的背景动画和不可解释动效。
- 禁止大面积泛紫蓝渐变、单色主题、通用 AI 风格或卡通吉祥物。
- 禁止 Utility 页面伪装成浮卡堆或装饰卡片墙。

## 2. 适用范围与真源治理

本规范覆盖所有前端页面与组件：

- Auth：`/login`、`/register`、`/forgot-password`、`/auth/callback`、`/join` 未登录态。
- Student：`/dashboard`、`/exams/new`、`/exams/:id`、`/exams/:id/result`、`/account/*`。
- Coach：`/coach/classes`、`/coach/classes/:id`、`/coach/assignments`、`/coach/report`。
- Admin：`/admin`、`/admin/questions`、`/admin/papers`、`/admin/imports`、`/admin/users`、`/admin/review`、`/admin/settings`。
- Dev：`/dev/ui-gallery`。

以下内容视为已定稿，不得在普通功能 PR 中随意修改：

- 品牌名、Logo 方向、主色、字体系统。
- Light/Dark 主题底色。
- 圆角、间距、阴影、z-index、动效 token。
- AppShell、AuthLayout、FocusLayout、CeremonyLayout。
- Dashboard、ExamNew、Exam、ExamResult、CoachReport、Admin、Auth、Account 页面 IA。
- shadcn/Radix primitive 的可访问性契约。
- A2UI payload guard、安全边界、production slot policy 和 catalog 验证。
- QuestionRenderer 展示方式，尤其是讲解卡内嵌。

如确需调整，必须新建计划或 ADR，写明：

- 为什么现有方案无法满足。
- 影响哪些页面和组件。
- 如何迁移现有实现。
- 如何做自动化和人工视觉回归。
- 如何回滚到当前硬合同。

## 3. 技术边界

### 3.1 Production primitive

- 生产页面的基础组件以本地 shadcn/Radix primitive 为准。
- shadcn 组件是复制进项目后受 Round1 token 管理的本地组件，不视作外部黑盒 UI 库。
- Radix 包装组件必须保留 `ref`、`asChild`、ARIA、focus trap、keyboard navigation 和关闭后的 focus return。
- 图标库默认 `lucide-react`，线宽固定 `1.5px`，颜色继承 `currentColor`。
- 不引入第二套 UI 组件库、CSS-in-JS 体系或与 token 冲突的全局样式方案。

### 3.2 Data visualization

- Recharts v3 是趋势、雷达、排名、柱状、面积、组合图的首选路线。
- shadcn chart primitive 是 Recharts 的 Round1 token 包装层；不得直接在页面复制 Recharts 样式样板。
- 所有 Recharts 图表必须通过 `client/src/components/ui/chart.tsx` 的 `ChartContainer`、`ChartTooltipContent`、`ChartLegendContent` 或本地同级 primitive。
- 热力矩阵优先保留本地 SVG/CSS 实现，以控制性能、窗口化、打印和 token 映射。
- 图表颜色只用 chart/semantic token；不得在图表组件里写裸色值。
- 图表必须提供文本摘要或等价数据表，关键结论不能只靠图形表达。

### 3.3 A2UI

A2UI 是生产级动态 UI 能力，而不只是 `/dev/ui-gallery` 的设计 surface。

允许场景：

- 全局或页面级 assistant panel。
- Dashboard、CoachReport、AdminDashboard 的动态建议/报告片段。
- Agent 生成的动态表单、操作预览、数据摘要和学习建议。
- ExamResult 的讲解片段和可审计建议。

硬边界：

- 所有 payload 必须经过 catalog schema 校验。
- BYOC 组件必须注册在 Round1 专用 catalog，复用本地 Card/Badge/Progress/Chart primitive。
- action 必须走 allowlist；外部 agent bridge 未设计前禁止 `functionCall` 和动态 `{ call, args }`。
- media/resource URL 必须走 allowlist；禁止 agent payload 任意触发跨站资源请求。
- markdown 必须使用 sanitizer renderer。
- data binding path 必须限制在允许根路径及子路径。
- payload 必须限制消息数、组件数、资源大小和嵌套复杂度。
- 生产 slot 必须有 role-aware 权限、审计事件、错误态和静态 fallback。
- A2UI UI 不能绕过后端权限、状态机或审计。

## 4. 视觉强度分级

所有页面和组件必须声明或继承一个视觉强度等级。

| 等级       | 用途                         | 允许内容                                             | 禁止内容                                    |
| ---------- | ---------------------------- | ---------------------------------------------------- | ------------------------------------------- |
| `none`     | 考试专注、打印、敏感表单     | 静态布局、必要 focus、保存/错误反馈                  | 背景动画、装饰粒子、视差、长 stagger        |
| `subtle`   | Utility、Account、Admin 表格 | 微位移、状态色、静态数据背景、轻量 hover/focus       | 自动循环动画、大面积 mesh、页面级装饰       |
| `live`     | Dashboard、Coach/Admin 看板  | 数据驱动背景、排名 ribbon、heatmap aura、signal band | 无数据含义的装饰动效、影响阅读的持续闪烁    |
| `ceremony` | ExamResult、关键成就揭晓     | 分数滚动、ceremony burst、短时 overlay、可跳过仪式   | 不可跳过动画、忽略 reduced motion、阻塞结果 |

默认映射：

- Auth：`subtle`，可使用品牌 mesh 和静态/低频数据纹理。
- Dashboard：`live`，可使用 Rank Ribbon、Heatmap Aura、趋势背景。
- ExamNew：`subtle`，可使用试卷类型数据卡和轻量入场。
- Exam：`none`，只允许进度、保存、倒计时、题目导航反馈。
- ExamResult：`ceremony`，必须支持 ESC/CTA 跳过和 reduced motion 静态揭晓。
- CoachReport：`live`，热力图和排名/学生状态是主视觉。
- AdminDashboard：`live`，系统健康、导入批次、审核状态可形成 Signal Band/Import Timeline。
- Admin/Account Utility：`subtle`。
- Print：强制 `none`。

## 5. 数据驱动背景模式

背景必须有业务含义，并可在 reduced motion 下退化为静态。

| 模式            | 场景                         | 说明                                             |
| --------------- | ---------------------------- | ------------------------------------------------ |
| Rank Ribbon     | Dashboard、ExamResult        | 用最近排名、分位、进步趋势形成窄带背景或头部标尺 |
| Heatmap Aura    | Dashboard、CoachReport       | 由弱项/知识点热力生成低透明网格或环形背景        |
| Signal Band     | AdminDashboard、系统设置     | API/DB/Redis/worker 状态形成水平脉冲或静态状态带 |
| Import Timeline | AdminImports、AdminDashboard | dry-run/apply/fail 批次形成时间轴和风险点        |
| Ceremony Burst  | ExamResult                   | 分数揭晓短时粒子/光带，2-3 秒内结束或可跳过      |

背景实现要求：

- 优先 CSS/SVG/token，不用视频背景。
- 动画只使用 transform/opacity 或 SVG stroke/gradient offset。
- 页面首屏文字和主要 CTA 不得被背景遮挡。
- 任意动态背景必须有 `prefers-reduced-motion` 降级。
- 背景不得成为业务信息唯一来源；关键排名、状态、风险必须有文本。

## 6. 品牌与 Logo

| 项       | V2 硬合同                          |
| -------- | ---------------------------------- |
| 品牌名   | `Round1`                           |
| Logo     | `R1` monogram                      |
| 辅助图形 | 尖括号、赛道线、排名刻度、热力网格 |
| Slogan   | 无                                 |
| favicon  | 仅 `R1`，16px/32px 可辨识          |

Logo 必须提供亮色底和暗色底适配。禁止使用临时文字 Logo 进入生产。

## 7. 颜色与主题 token

### 7.1 品牌与语义色

| 语义          | Light     | Dark      | 用途                             |
| ------------- | --------- | --------- | -------------------------------- |
| `primary`     | `#E63946` | `#E63946` | Logo、主 CTA、当前导航、高亮 KPI |
| `destructive` | `#C8102E` | `#E11D48` | WA、删除、表单错误               |
| `warning`     | `#F59E0B` | `#FBBF24` | TLE、MLE、超时、配额紧张         |
| `success`     | `#059669` | `#10B981` | AC、完成、通过                   |
| `info`        | `#0284C7` | `#0EA5E9` | 提示、运行中                     |
| `neutral`     | Slate 500 | Slate 400 | 未作答、草稿、次要状态           |

品牌红和错误红色相同源但语义不同。品牌红用于引导和品牌记忆；错误红用于风险和破坏性操作，不得互换。

### 7.2 Light 主题

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

### 7.3 Dark 主题

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

### 7.4 图表与热力图色板

定性图表使用：

```text
#E63946  #0EA5E9  #10B981  #F59E0B  #8B5CF6  #64748B
```

热力图使用：

```text
#FEF9F8 -> #FDEEEF -> #F8B5BC -> #E63946 -> #8B1538
```

执行规则：

- 这些裸色只允许出现在 `client/src/styles/tokens.css`、本标准和设计说明文档中。
- 运行时代码必须通过 `--color-*`、Tailwind token class 或本地 helper 引用。
- 禁止为单个图表、单个页面或 A2UI BYOC 临时造色板。

## 8. 字体系统

| 类别         | 字体                      | 用途                                 |
| ------------ | ------------------------- | ------------------------------------ |
| 英文无衬线   | Geist Sans                | UI、正文英文、数字                   |
| 英文等宽     | Geist Mono                | 代码、变量、ID、时间戳               |
| 英文 Display | Fraunces                  | Logo 衍生大字、Hero、ExamResult 分数 |
| 中文正文     | HarmonyOS Sans SC         | 中文 UI、正文、题干                  |
| 中文 Display | Source Han Serif SC Heavy | Hero、ExamResult 仪式页              |

CSS 字体栈固定：

```css
--font-sans:
  "Geist", "HarmonyOS Sans SC", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
--font-mono: "Geist Mono", ui-monospace, "HarmonyOS Sans SC", monospace;
--font-serif: "Fraunces", "Source Han Serif SC", Georgia, serif;
```

字体规则：

- 正文 `line-height: 1.6`，`letter-spacing: 0`。
- xs/sm 可用 `letter-spacing: 0.01em`。
- 紧凑组件内部不得用 hero 字号。
- 代码关闭 ligature：`font-feature-settings: "liga" 0, "calt" 0`。
- 分数、倒计时、表格数字列、排名必须使用 tabular nums。
- 数字滚动动画只允许用于 ExamResult 揭晓。
- 不得使用 viewport-width 驱动字号。

## 9. 字号与层级

| Token       | px  | 用途                   |
| ----------- | --- | ---------------------- |
| `text-xs`   | 12  | 辅助说明、标签、时间戳 |
| `text-sm`   | 14  | 表单、表格、正文次级   |
| `text-base` | 16  | 正文主体、题干         |
| `text-lg`   | 18  | 强调段落               |
| `text-xl`   | 22  | 卡片标题               |
| `text-2xl`  | 28  | 页面 H2                |
| `text-3xl`  | 36  | 页面 H1                |
| `text-5xl`  | 56  | Hero 标题              |
| `text-7xl`  | 84  | 品牌大字、揭晓数字     |
| `text-9xl`  | 128 | Editorial 背景描边巨字 |

组件内部标题不得超过 `text-xl`，除非组件本身是 Hero、结果揭晓或页面主标题。

## 10. 设计令牌

### 10.1 圆角

| Token         | 值     | 用途                           |
| ------------- | ------ | ------------------------------ |
| `radius-none` | 0      | 分割线、内联代码               |
| `radius-sm`   | 4px    | Badge、Tag、Checkbox、Radio    |
| `radius-md`   | 8px    | Button、Input、Select、Tooltip |
| `radius-lg`   | 12px   | Card、Dialog、Panel、Popover   |
| `radius-xl`   | 16px   | Hero 图卡、大图示              |
| `radius-full` | 9999px | 头像、圆形徽章                 |

### 10.2 间距

使用 8pt grid：

```text
4, 8, 12, 16, 24, 32, 48, 64, 96, 128
```

默认：

- 卡片 padding：`24px`。
- 页面内容：`max-w-7xl`。
- Desktop 内容区：`px-8 py-12`。
- Mobile 内容区：`px-4`。
- 表单组间 `space-6`，组内 `space-2`。

### 10.3 阴影与边框

- 卡片默认无阴影，靠 1px border。
- Hover 只做轻微抬升：`translateY(-1px)` + border 加深。
- Dialog、Dropdown、Tooltip 可用 `shadow-md/lg`。
- Focus 使用 `shadow-glow: 0 0 0 4px rgba(230,57,70,.12)`。
- Dark 模式降低投影，优先使用 outer glow 和 border 对比。

### 10.4 Z-index

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

不得在组件中随意写超过 `z-ceremony` 的层级。新增 overlay 类组件必须复用本表，而不是临时发明 z-index。

## 11. 布局系统

| Layout            | 用途         | 覆盖页面                                   | 必须满足                               |
| ----------------- | ------------ | ------------------------------------------ | -------------------------------------- |
| L1 AuthLayout     | 未登录视觉层 | login/register/forgot/callback/join 未登录 | 左 Hero + 右表单，移动端变顶部 banner  |
| L2 AppShell       | 登录后主布局 | dashboard/account/coach/admin/result       | TopBar + Sidebar + 内容区              |
| L3 FocusLayout    | 考试专注     | `/exams/:id`                               | 移除 Sidebar/通知/搜索                 |
| L4 CeremonyLayout | 揭晓仪式     | ExamResult 短暂 overlay                    | 全屏、可 ESC 跳过、尊重 reduced motion |

### 11.1 AppShell

- TopBar 高 `56px`，sticky，`bg-base/80 + backdrop-blur-md + bottom border`。
- Sidebar desktop 默认 `w-60`，laptop 可折叠 `w-14`，mobile 使用 Sheet。
- TopBar 左侧：折叠按钮、R1 Logo、面包屑。
- TopBar 右侧：Cmd+K、通知、头像菜单。
- 内容区居中，避免全页大浮卡。

### 11.2 导航

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

### 11.3 CommandBar

Cmd+K 全局命令面板必须实装，不能退化为普通搜索框。

分组固定：

- 导航。
- 我的考试，最近 5 条。
- 我的班级，coach+ 可见。
- 管理操作，admin+ 可见。
- 设置。
- 主题切换。

交互要求：

- 支持模糊搜索。
- 支持键盘上下选择、Enter 执行、Esc 关闭。
- `<sm` 隐藏入口，移动端通过头像菜单进入常用操作。
- 不展示用户无权访问的命令。
- 命令执行失败必须以 Toast 或 inline error 反馈。

## 12. 页面视觉策略

| 页面           | V2 强度    | 底层                             | 视觉重量来源                        |
| -------------- | ---------- | -------------------------------- | ----------------------------------- |
| 登录/注册      | `subtle`   | Layer B Mesh                     | 品牌 Hero + 表单                    |
| Dashboard      | `live`     | Layer B 顶部 Hero + Layer A 主体 | 最近一战、能力摘要、图表、排名趋势  |
| ExamNew        | `subtle`   | Layer A                          | 试卷卡片与规则配置                  |
| Exam           | `none`     | 纯素 Layer A                     | 专注答题                            |
| ExamResult     | `ceremony` | Layer B 全屏仪式                 | 分数滚动、ceremony burst、结果 Hero |
| CoachReport    | `live`     | Layer B + Utility content        | 热力图、雷达图、学生详情            |
| AdminDashboard | `live`     | Layer A + Signal Band            | 系统健康、导入批次、审核状态        |
| Admin Utility  | `subtle`   | Layer A Utility                  | 表格、筛选、Sheet、Dialog           |
| Account        | `subtle`   | Layer A Utility                  | 账号安全、班级、会话状态            |

Utility 页面不得使用过量 mesh 或大装饰。

### 12.1 视觉层定义

Layer A 是工具型页面底层：

- `bg-base #FEF9F8` 或 dark `#0A0E1A`。
- `surface` 白/深色面板。
- 1px border 分隔。
- 最少阴影，靠排版、间距和表格层级组织信息。

Layer B 是仪式/品牌视觉层，只能用于本文件指定页面：

- Mesh Gradient。
- Radial Aura。
- Large Typography Backdrop，例如 Fraunces 空心描边 `Round1`。
- Dot/Grid Pattern。
- 数据图表承担装饰，不使用无意义抽象插画堆叠。

Layer B 使用边界：

- Auth、Dashboard 顶部、ExamResult Ceremony、CoachReport、AdminDashboard Hero Band 可以使用。
- Exam 考试中禁止使用。
- 题库、设置、导入中心、用户管理等 Utility 页面只能小剂量继承品牌氛围。

### 12.2 外部设计参照落地

外部设计系统只转化为方法，不覆盖 Round1 定稿：

- Material Design 的 token 化、状态层、运动节奏，落地为本文件颜色/间距/动效 token。
- Microsoft Fluent 的可达性、焦点可见、清晰文案，落地为 focus glow、键盘操作和错误反馈。
- Arco Design 的企业中后台效率，落地为 Admin/Coach 的表格、筛选、Sheet 下钻和批量操作一致性。

禁止因为引入 shadcn、Radix、Tailwind、Recharts、A2UI 或任意外部组件库，而替换本方案的品牌红、字体、布局和页面 IA。

## 13. 组件硬合同

### 13.1 Button

Variants：`primary`、`secondary`、`ghost`、`destructive`、`link`。

Sizes：`sm h-8`、`md h-10`、`lg h-12`、`icon h-10 w-10`。

必须：

- Loading 保持宽度，不造成布局跳动。
- Focus 使用品牌红 glow。
- Pressed 使用 `translateY(1px)`。
- Hover 只做轻微抬升或边框/背景变化。
- 图标按钮必须有 `aria-label` 和 Tooltip。

### 13.2 Form

- Input：`h-10 rounded-md border-hair bg-surface px-3 text-sm`。
- Focus：border primary + glow。
- Error：destructive border + 下方错误说明。
- Checkbox/Radio：12px，2px border，选中品牌红。
- Switch：28x16，关闭灰，开启品牌红。
- 表单默认单列，组间 `space-6`，组内 `space-2`。
- 表单错误必须字段关联或 form-level alert，不得只靠颜色。

### 13.3 Card/Surface

允许变体：

- default：白底/暗底 + border。
- flat：静态信息。
- hero：大 padding + mesh/data background。
- stat：大数字 tabular nums。
- interactive：整卡可点击。

规则：

- 卡片默认靠 1px border 和排版建立层级，少用阴影。
- 页面 section 不得伪装成浮卡；重复项列表、Dialog、工具面板可使用卡片。
- 卡片内不得嵌套装饰卡片；如需分区使用 border、separator、tabs 或 table。

### 13.4 Table/List

- 表头 `h-12 bg-subtle text-xs uppercase tracking-wider`。
- 行高 `h-14`。
- 单元格 `px-6 text-sm`。
- 数字列右对齐 + tabular nums。
- 无斑马纹。
- Hover 行 `bg-accent-wash`。
- 选中行左侧 2px 品牌红条。
- Admin/Coach 表格必须支持分页、筛选、排序状态可见。
- `<md` 必须降级为可扫描卡片列表或横向安全布局，不允许页面水平滚动。
- 批量操作必须显示作用范围。
- 刷新后保留合理筛选上下文。

### 13.5 Badge

竞赛语义必须固定：

| 状态   | 风格                |
| ------ | ------------------- |
| AC     | emerald 实心 + 对号 |
| WA     | Crimson 实心 + 叉号 |
| TLE    | amber 实心 + timer  |
| MLE    | amber outline       |
| RE     | destructive outline |
| 未作答 | slate outline       |
| 已保存 | sky outline         |

考试类型 badge 使用 outline：CSP-J 蓝、CSP-S 紫、GESP 1-4 绿、GESP 5-8 橙。

### 13.6 CodeBlock

- 字体 Geist Mono。
- 背景 `bg-subtle`，圆角 `radius-md`，1px border。
- 行号 muted。
- 关键字品牌红、字符串 emerald、数字 amber、注释 muted italic、函数名 sky。
- 复制按钮 hover 出现。
- 填空题高亮行使用 `bg-accent-wash` + 左品牌红条。
- 横向滚动条极细。
- ligature 关闭。

### 13.7 QuestionRenderer

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
- 讲解必须卡片内嵌，不跳页、不开默认抽屉。
- 正确选项 emerald border + 对号；错误选项 destructive border + 叉号。
- FillBlank 输入必须有可访问名称或上下文。

### 13.8 Chart

- 图表主色只能使用本文件定性图表色板映射出的 chart token。
- 所有 Recharts 图表通过 `ChartContainer` 使用。
- `ChartContainer` 必须有明确高度、`min-h-*` 或 aspect，避免首渲染测量失败。
- Recharts 图形必须使用 CSS variable color，例如 `var(--color-chart-1)`。
- Tooltip/Legend 使用本地 `ChartTooltipContent`、`ChartLegendContent`。
- 雷达图、热力图、曲线图必须有图例或可读标签。
- 图表必须有 `accessibilityLayer` 或等价文本摘要。
- 图表 tooltip 必须可键盘触发或提供等价表格摘要。
- 图表不得成为唯一信息来源，关键分数/排名/状态必须有文本。
- 大数据图表必须分页、窗口化、简化抽样或使用热力矩阵本地实现。
- 大数据加载时先显示 Skeleton，不显示空白画布。

### 13.9 Feedback

- Toast：右上角 4s，左侧 4px 语义色条或 token 化状态。
- Dialog：短表单、确认、阻断操作、危险操作模式。
- Sheet：右侧详情下钻，例如题目预览、学生详情、导入错误详情。
- Popover：轻量选择器，不承载复杂编辑流程。
- Empty State：图标、标题、说明、CTA 四段式。
- Skeleton：100ms 以上再出现；长耗时需步骤式进度。
- Progress：考试顶部极细 `h-0.5`，普通进度 `h-1.5`。

### 13.10 Select/Dropdown/Tooltip

- Select 高度与 Input 对齐，默认 `h-10 rounded-md`。
- Dropdown 菜单宽度不得小于触发器宽度。
- 菜单项 hover 使用 `accent-wash`，危险项使用 destructive 文本色。
- Tooltip 延迟 300ms，内容短句，不放长说明。
- Icon-only button 必须同时有 Tooltip 和 `aria-label`。

### 13.11 Dialog/Sheet/Popover

- Dialog 用于确认、短表单、不可忽略的阻断操作。
- Sheet 用于右侧详情下钻，例如题目预览、学生详情、导入错误详情。
- Popover 用于轻量选择器，不承载复杂编辑流程。
- Dialog/Sheet/Popover 必须保留 Radix focus trap、Esc、outside click 策略、ARIA 和关闭后的 focus return。
- Admin 敏感操作确认 Dialog 必须展示动作、影响对象、不可逆风险和 step-up 状态。
- Sheet 宽度 desktop 默认 `480-640px`，移动端全屏。

### 13.12 Print

打印样式必须独立维护，不能依赖屏幕样式碰巧可打印：

- A4 优先，边距稳定。
- 移除背景色、阴影、动画、筛选、分页和交互控件。
- 代码块使用等宽打印字体，优先 `Courier New`。
- 题目分页避免题干与选项被拆断。
- 打印结果页保留分数、错题、解析、时间信息和页码。

## 14. 页面合同

### 14.1 Dashboard

结构固定：

```text
Hero/Data Band -> 最近考试/能力雷达 -> 错题热力图 -> 智能建议/排名趋势
```

硬要求：

- 允许 `live` 背景：Rank Ribbon、Heatmap Aura、趋势线。
- 最近考试、能力摘要、弱项热力、排名趋势必须有文本摘要。
- 智能建议 MVP 可以是静态规则、A2UI guarded payload 或占位，不得伪造 agent 能力。
- 数据不足时使用 Skeleton/空态，不伪造趋势。
- 不新增“我的进步”独立页面，除非先更新本标准和导航 IA。

### 14.2 ExamNew

必须包含：

- 2x5 试卷类型大卡片，移动端 1 列。
- 100 分制构成、按运行时/蓝图口径展示的时长、进入答题页即服务端计时警示。
- 预制卷目录可用性：缺卷或当前类型/难度无可用 published prebuilt paper 时禁用 CTA 并给出可理解状态；已有 draft 时提示继续草稿。
- 若后端返回稳定 rate-limit / retry-after 语义，前端展示倒计时；不得重新引入旧在线组卷 cooldown 语义。
- 开始考试二次确认 Dialog。

### 14.3 Exam

必须是 FocusLayout：

- 精简 Header：R1、试卷名、进度、倒计时、交卷。
- 顶部 `h-0.5` 品牌红进度条。
- 单题垂直滚动，`max-w-4xl`。
- 底部题目导航始终显示。
- 自动保存状态显示。
- `<md` 首次进入警告但允许继续。
- 禁止 Sidebar、通知、全局搜索、背景动画、营销入口。
- 倒计时最后阶段必须有文字状态，不只靠颜色。
- 自动保存、提交、恢复路径以服务端状态为准。

### 14.4 ExamResult

提交后必须触发可跳过 CeremonyLayout：

```text
黑底淡入 -> R1 缩放 -> 分数滚动 -> Ceremony Burst -> 查看详情
```

详情页必须包含：

- 分数 Hero。
- 构成摘要。
- 打印 PDF、再来一次、班级排名 CTA。
- 错题分布/用时分析。
- 题目列表卡内嵌讲解。
- A2UI `exam-result-explanation` 只能作为 guarded 讲解片段或复盘建议。

交互与打印：

- Ceremony 必须支持 ESC/CTA 跳过。
- reduced motion 下静态显示分数和 CTA。
- 打印隐藏背景、动效、操作控件，保留分数、错题、解析和时间信息。

### 14.5 CoachReport

- 必须以热力图为主视觉，点击学生行打开右侧 Sheet 下钻，不离开报告页。
- KPI、题型统计和第一页热力图优先进入首屏。
- 大班级必须对热力图和学生列表做分页、窗口化或虚拟化。
- 图表/热力必须提供文本摘要或表格替代。
- `coach-report-insight` A2UI slot 可展示班级热力摘要、学生风险提示、导出预览。
- 打印版必须隐藏筛选、分页、导出等操作控件，只保留正式报告内容。

### 14.6 Admin

Admin 是 Utility 风格；只有 AdminDashboard 允许 `live` Signal Band、Import Timeline 和健康状态动效。

Admin 页面必须遵守以下信息架构：

| 页面              | 必须包含                                                       | 禁止                     |
| ----------------- | -------------------------------------------------------------- | ------------------------ |
| AdminDashboard    | KPI、导入批次、系统健康、近期活动、Signal Band/Import Timeline | 营销式 Hero、装饰卡片墙  |
| AdminQuestionPool | 筛选栏、表格、详情 Sheet、引用摘要、发布/归档/删除未引用 draft | 手动生成题、库存补货入口 |
| AdminPaperLibrary | 预制卷筛选、slot 详情、copy-version、发布/归档、引用摘要       | 已发布版本原地编辑       |
| AdminImports      | raw bundle 面板、dry-run/apply、错误明细、批次历史、修复重试   | 三套不同摘要口径         |
| AdminReview       | AI/人工审核差异、confirm/reject、备注、历史                    | 用模型结论自动发布       |
| AdminUsers        | 用户表格、筛选、角色修改、禁用/恢复、step-up                   | 后台直接创建普通用户     |
| AdminSettings     | 认证、频控、邮件、导入等 Tabs，保存后配置热更新反馈            | 无审计修改               |

敏感操作必须 step-up，并展示动作、对象、风险和审计状态。其他 Admin utility 页面保持 `subtle`，优先表格、筛选、Sheet、Dialog。

### 14.7 Auth Pages

AuthLayout 必须保留左侧品牌 Hero + 右侧表单结构。移动端改为顶部品牌 banner + 表单，不改成营销长页。

页面要求：

- `/login`：邮箱/密码、OIDC 入口按 feature flag 显示、找回密码链接。
- CppLearn OIDC 登录视觉使用 CppLearn 提供的横幅图片，占位路径固定为同源 `/logo/cpplearn.jpg`；Vite 开发代理读取 `R2_PUBLIC_BASE_URL`，生产 Caddy 通过 `Caddyfile.example` 中的 R2 源站字面量代理到 R2 `/logo/cpplearn.jpg`。不再使用旧的纯文字字标或单独字体源。
- QQ 互联入口只在 feature flag 返回可用 provider 或 placeholder 时显示；OAuth 流程未实现前只能作为禁用视觉占位，视觉上与密码/CppLearn 入口同级，但不得触发未实现的 501 登录流程，也不得在 flag 未开启时常驻主路径。
- `/register`：邮箱 challenge 流程文案清晰，不暗示 GET 链接会直接登录。
- `/forgot-password`：提交后不暴露账号是否存在。
- `/auth/callback`：显示明确处理中、失败、可重试状态。
- `/join` 未登录态：保留班级加入意图，登录后继续。

### 14.8 Account Pages

账号区保持 Utility 风格，不能做成个人主页装饰页：

- `AccountSecurityPage` 使用 Tabs：密码、Passkey/OIDC 绑定、邮箱、会话管理。
- `AccountClassPage` 展示当前班级、邀请状态、任务入口。
- 安全操作必须显示最近认证状态和 step-up 入口。
- 会话列表显示设备摘要、最近活动、撤销按钮，不展示完整 IP。

### 14.9 Coach Pages

- `CoachClasses`：班级列表、成员数、邀请码状态、归档状态。
- `CoachClassDetail`：成员表、任务列表、邀请管理、进入报告。
- `CoachAssignments`：绑定已发布预制卷、截止时间、单任务单次作答说明。
- `CoachReport`：热力图主视觉、学生行点击右 Sheet 下钻、导出 CSV、打印报告。
- Coach 页面只展示自己参与班级的数据；Admin 的全局视角不得混入 Coach UI。

## 15. A2UI production slot

A2UI slot 分为：

- `assistant-panel`：全局或页面侧边助手。
- `dashboard-insight`：学习建议、排名趋势、下一步行动。
- `coach-report-insight`：班级热力摘要、学生风险提示、导出预览。
- `admin-ops-insight`：导入风险、系统健康、审核差异。
- `exam-result-explanation`：讲解片段和复盘建议。

生产要求：

- 每个 slot 必须声明允许 catalog、允许 action、允许 data root、允许 media origin 和角色边界。
- 每个 slot 必须有静态 fallback，不得因 agent payload 异常导致页面空白。
- 用户可执行 action 必须展示预览或确认，Admin 敏感 action 必须 step-up。
- A2UI UI 不能绕过后端权限、状态机或审计。
- A2UI slot 必须进入 `/dev/ui-gallery` 验收样本。

## 16. 图标、插画与空态

- 图标库固定 `lucide-react`。
- 线宽固定 `1.5px`。
- 图标颜色继承 `currentColor`。
- Logo `R1` 独立 SVG，不用 lucide 替代。
- 插画策略为抽象几何 + 数据元素 + 排版即插画。
- 不使用卡通吉祥物。

空态文案与图标必须沿用以下清单：

| 场景             | 图标       | 标题           | CTA            |
| ---------------- | ---------- | -------------- | -------------- |
| Dashboard 无考试 | `FileText` | 还没有模拟记录 | 开始第一次模拟 |
| 题库无结果       | `Search`   | 没有匹配的题目 | 清除筛选       |
| 班级无成员       | `Users`    | 班级还没有学生 | 复制邀请码     |
| 网络错误         | `WifiOff`  | 网络连接异常   | 重试           |

## 17. Motion 系统

### 17.1 时长

```text
instant 75ms
fast 150ms
normal 250ms
slow 400ms
deliberate 600ms
ceremony 1200-2000ms
```

### 17.2 曲线

```text
ease-standard: cubic-bezier(0.4, 0, 0.2, 1)
ease-enter:    cubic-bezier(0, 0, 0.2, 1)
ease-exit:     cubic-bezier(0.4, 0, 1, 1)
ease-spring:   cubic-bezier(0.34, 1.56, 0.64, 1)
ease-ceremony: cubic-bezier(0.16, 1, 0.3, 1)
```

实现规则：

- `client/src/lib/motion.ts` 必须与 token 时长/曲线对齐。
- 页面入场、列表 stagger、Dialog/Sheet、toast 和 chart reveal 必须使用 motion preset 或 CSS token。
- 动效只能使用 transform/opacity 为主。禁止 layout thrashing 动画。
- reduced motion 下关闭长位移、视差、循环动画、粒子和大 stagger；保留 opacity 或静态状态。
- `prefers-reduced-motion: reduce` 下关闭 >200ms 动画；Ceremony 静态显示分数；粒子和长 stagger 禁用。

## 18. 加载与错误

- `<100ms` 不显示 loading。
- `100ms-1s` 使用 Skeleton。
- `1-5s` Skeleton + 顶部细进度条。
- `>5s` 内容生产/AI 场景使用步骤式进度。

错误页：

- 404/403/500 使用 AuthLayout 风格。
- 左侧大号编号，右侧说明和 CTA。
- 错误文案不责备用户。

## 19. 可达性

硬性要求：

- 键盘 Tab/Enter/Space/Arrow 全覆盖。
- Focus 可见，使用品牌红 glow。
- Radix 组件不得破坏 ARIA、keyboard、focus trap 和 focus return。
- 正文对比度 >= 4.5:1。
- 大标题/UI 控件对比度 >= 3:1。
- 图标按钮必须有 `aria-label` 或 Tooltip。
- 错误必须有文字和图标，不只靠颜色。
- 提供 skip-to-content。
- 图表必须提供文本摘要或等价数据。
- 动效闪烁或无法按 reduced motion 关闭时必须阻塞合并。
- 屏幕阅读器抽测关键流程。

考试页额外要求：

- 倒计时最后阶段不能只靠颜色。
- 题目导航色块必须有文本/aria 语义。
- FillBlank 输入必须有可访问名称或上下文。

## 20. 本地化与文案

- MVP 中文单语。
- 使用“你”，不用“您”。
- 日期常规：`2026年04月15日`。
- 表格紧凑日期：`2026-04-15`。
- 时间 24h：`14:30:45`。
- 分数：`87.5 分`。
- 相对时间：`刚刚 / N 分钟前 / 昨天 / 绝对日期`。
- 数字千分位：`1,234`。

## 21. 字体托管

- 字体自托管于 Cloudflare R2，后续可迁国内 CDN。
- 不使用 Google Fonts CDN。
- 前端 `@font-face` 与 `index.html` preload 必须使用同源 `/font/*.woff2` 路径；开发环境由 Vite 读取 `R2_PUBLIC_BASE_URL` 代理到 R2 `/font/*.woff2`，生产环境由 `Caddyfile.example` 中的 R2 源站字面量代理到同一路径。
- CppLearn 横幅图片使用同源 `/logo/cpplearn.jpg`，同样按开发/生产代理到 R2 `/logo/cpplearn.jpg`。
- 避免浏览器直接跨域请求字体或品牌图片。`client/public/fonts` 只作为本地缓存/备份说明，不作为运行时默认源。
- `font-display: swap`。
- 中文字体全量加载，接受初次 5-10MB 代价。
- R2/CDN 必须配置一年长缓存和版本哈希。
- 关键字重 preload，Display 字体按场景懒加载。

## 22. 实现文件映射

当前仓库路径以实际代码为准：

| 类型          | 当前路径                                           | 职责                                      |
| ------------- | -------------------------------------------------- | ----------------------------------------- |
| tokens        | `client/src/styles/tokens.css`                     | 颜色、字体、圆角、阴影、z-index、motion   |
| globals       | `client/src/styles/globals.css`                    | 全局样式、数据背景、reduced motion 降级   |
| print         | `client/src/styles/print.css`                      | A4 打印、隐藏交互控件、分页控制           |
| UI primitives | `client/src/components/ui/*`                       | shadcn/Radix 本地 primitive               |
| Chart         | `client/src/components/ui/chart.tsx`               | Recharts token wrapper                    |
| Layout        | `client/src/components/layout/*`                   | Auth/App/Focus/Ceremony 布局              |
| Brand         | `client/src/components/brand/*`                    | Logo、品牌入口                            |
| Theme         | `client/src/lib/theme.tsx`                         | Light/Dark 切换                           |
| Motion        | `client/src/lib/motion.ts`                         | 动效时长、曲线和强度降级                  |
| Chart helper  | `client/src/lib/chart.ts`                          | chart token 映射和文本摘要                |
| A2UI guard    | `client/src/lib/a2ui-design-surface.ts`            | catalog、slot、action/resource/data guard |
| A2UI catalog  | `client/src/components/a2ui/round1A2uiCatalog.tsx` | BYOC 组件与本地 primitive bridge          |
| UI Gallery    | `client/src/pages/dev/UIGallery.tsx`               | V2 设计验收台                             |

旧计划记录中若出现 `apps/web` 路径，属于方案阶段命名；当前仓库落地路径为 `client/`。

## 23. UI Gallery

`/dev/ui-gallery` 是 V2 视觉验收台，必须展示：

- token、字体、颜色、圆角、阴影、间距、z-index。
- Button 所有 variant/size/state。
- Input/Form error。
- Card/Table/Badge/Tabs/Dialog/Sheet/Toast。
- Light/Dark 对比。
- Skeleton/Empty/Error。
- Exam 相关题目组件样式。
- shadcn/Radix primitive 的 default/hover/focus/active/disabled/error 状态。
- Recharts/shadcn chart primitive：趋势、雷达、排名/柱状、tooltip、legend、文本摘要。
- 四级视觉强度：none/subtle/live/ceremony。
- 数据背景模式：Rank Ribbon、Heatmap Aura、Signal Band、Import Timeline、Ceremony Burst。
- A2UI basic catalog、Round1 BYOC、production slot guard、静态 fallback。
- A2UI agent surface 的 Round1 token bridge 示例，确保声明式 agent UI 不脱离当前视觉系统。
- A2UI 示例必须由 basic catalog / payload factory 生成并经过 schema 校验，不得在页面中散落硬编码长 JSON。
- A2UI 示例 surface 必须覆盖已安装 basic catalog 的主要能力：surface lifecycle、data model binding、Text/Card/Row/Column/List/Tabs/Divider/Icon、Image/AudioPlayer/Video/Modal、Button action、TextField、CheckBox、Slider、DateTimeInput、ChoicePicker、动态目录与 sanitizer markdown 渲染。
- A2UI 示例必须至少包含一个 Round1 BYOC custom catalog 组件，用本地 Card/Badge/Progress/Chart 等 primitive 渲染真实页面验收片段；custom schema、动态绑定和 action guard 必须有测试覆盖。
- 移动端、keyboard、reduced motion 状态。

生产环境可隐藏 dev 入口，但本地验收页面必须保留。

## 24. 自动守护与人工验收矩阵

| 守护方式                             | 自动守住的内容                                                                                                                                                                  | 不自动守住的内容                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `npm run verify:ui-tokens`           | 阻断 client 源码里的 raw color literal、非法 inline style、浏览器基线不兼容 CSS 回归；保护 token 真源只能在允许文件中出现                                                       | 无法判断页面 IA 是否正确、颜色是否“用得合适”、视觉层级是否美观、截图是否符合设计意图 |
| UI Gallery                           | 展示 token、primitive、图表、A2UI、动效等级、数据背景、Light/Dark、移动端/reduced-motion 样本；作为开发和评审的视觉样本库                                                       | 不替代真实业务页面截图，不证明所有路由状态都已覆盖                                   |
| Playwright `ui-visual-audit.spec.ts` | 覆盖 Dashboard、ExamNew、Auth、Account、Coach、Admin、ExamResult、A2UI Gallery、V2 charts/data background 的无横向溢出、关键元素可见、reduced-motion/print marker、部分键盘入口 | 不做像素级审美判断，不覆盖每个浏览器字体差异，不替代人工打印预览                     |
| `npm run client:test`                | 守住 motion token helper、chart token 映射/文本摘要、A2UI schema/slot/action/resource/data guard 等逻辑合同                                                                     | 不证明真实页面视觉效果、不替代 Radix 全链路键盘抽测                                  |
| `npm run build:client`               | 守住 TypeScript、bundling、依赖引入和 lazy chunk 基线                                                                                                                           | 不证明运行时数据状态、交互体验或截图质量                                             |

必须人工验收的内容：

- Dashboard、ExamNew、Exam、ExamResult、CoachReport、AdminDashboard、Auth、Account、UI Gallery 的桌面和移动截图。
- Light/Dark 双主题视觉层级、颜色氛围、空态/错误态/长文本。
- 关键流程至少一次 keyboard-only 验收：登录、Cmd+K、ExamNew 开考、Exam 答题/提交、ExamResult 跳过仪式、Admin 敏感 Dialog/Sheet。
- Radix Dialog/Sheet/Popover 的 focus trap、Esc 关闭、关闭后 focus return。
- ExamResult、CoachReport、试卷/解析页 A4 打印预览。
- 背景动画 60fps 体感、reduced motion 视觉降级、Ceremony 可跳过。
- 屏幕阅读器抽测关键流程和图表文本摘要可读性。

推荐自动验证命令：

```bash
npm run verify:ui-tokens
npm run build:client
npm run client:test
npm run test:e2e -- ui-visual-audit.spec.ts
```

涉及 server runtime 的完整 `npm run test` 视本机 Redis/Postgres 可用性执行并记录环境阻塞。如未运行 E2E、截图、键盘或打印验收，PR/最终说明必须写明原因。

## 25. 可达性、性能与打印红线

可达性红线：

- 键盘无法完成核心流程。
- Dialog/Sheet focus 丢失或无法关闭。
- icon-only button 无可访问名称。
- 错误只用颜色表示。
- 图表无文本摘要或等价数据。
- 动效闪烁或无法按 reduced motion 关闭。

性能红线：

- 考试页被图表、字体、agent surface 或动画阻塞。
- 背景动画导致持续掉帧。
- Admin/Coach 大表一次性渲染全量。
- 新大依赖未说明用户价值、包体影响、lazy load 和回滚路径。

打印要求：

- 打印强制 `none` 强度。
- A4 边距稳定，移除背景、阴影、动效、交互控件。
- 题目、答案、解析、代码缩进、分数和页码必须可读。
- CoachReport、ExamResult、试卷/解析页必须保留打印验收。

## 26. 禁止清单

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
- 禁止页面绕过本地 chart primitive 直接复制 Recharts 样式样板。
- 禁止 A2UI payload 绕过本地 guard、权限、审计或静态 fallback。
- 禁止修改已定 UI/UX 方向而不更新 standard/plan/docs。

## 27. 验收标准

UI/UX 相关 PR 必须检查：

- `standard/04-ui-ux.md` 是当前真源，相关 plan/docs 已同步。
- `client/src/styles/tokens.css` 没有无依据 token 漂移。
- `verify:ui-tokens` 通过。
- Light/Dark 双主题可用。
- 320px 到桌面宽度无水平溢出、遮挡、重叠。
- 键盘、focus、ARIA 和 reduced motion 可用。
- loading/empty/error/disabled/offline/slow network 状态可用。
- Recharts 图表通过本地 chart primitive，并有文本摘要。
- A2UI payload 通过 schema、action、resource、data root 和 complexity guard。
- `/dev/ui-gallery` 覆盖新增 primitive、chart、A2UI slot 或背景模式。
- 涉及打印的页面有 A4 预览或自动化 marker 验收。

## 28. plan 覆盖矩阵

本矩阵用于防止旧 plan 中已定稿的具体内容被 V2 结构压缩掉。UI/UX PR 必须逐项确认，不允许只说“符合设计风格”。

| plan 环节          | 已定稿内容                                                                | V2 standard 落点 | 验收方式                                          |
| ------------------ | ------------------------------------------------------------------------- | ---------------- | ------------------------------------------------- |
| 环节 1 品牌与 Logo | Round1、R1 monogram、尖括号/赛道/排名刻度辅助图形、无 slogan、双主题 Logo | 6                | Logo 资源、favicon、暗/亮底截图                   |
| 环节 2 配色系统    | 品牌红、错误红、Light/Dark 底色、图表色板、Layer A/B 页面映射             | 7、12            | token diff、Light/Dark 截图、图表色检查           |
| 环节 3 字体系统    | Geist、Geist Mono、Fraunces、HarmonyOS SC、思源宋体 Heavy、tabular nums   | 8、9、21         | 字体加载、数字列、ExamResult 分数截图             |
| 环节 4 设计令牌    | 圆角、8pt grid、边框优先、focus glow、z-index、动效时长和曲线             | 10、17           | `/dev/ui-gallery` token 面板、motion tests        |
| 环节 5 布局骨架    | AuthLayout、AppShell、FocusLayout、CeremonyLayout、Cmd+K、响应式          | 11、14           | 路由截图、键盘操作、断点检查                      |
| 环节 6 核心组件    | Button/Form/Card/Table/Badge/CodeBlock/QuestionRenderer/Chart/Print       | 13               | 组件状态快照、chart tests、打印预览               |
| 环节 7 页面 IA     | Dashboard、ExamNew、Exam、ExamResult、CoachReport、Admin、Account         | 14               | Playwright 关键流程截图、人工页面验收             |
| 环节 8 细节        | Lucide、空态、错误页、加载态、微交互、a11y、本地化、字体托管              | 16-21            | axe/键盘抽测、reduced motion、长文本、错误态      |
| V2 新增            | A2UI production slot、Recharts 路线、四级动效、数据背景模式               | 3-5、15、23      | client tests、UI Gallery、Playwright visual audit |
| 交付物             | tokens/globals/ui/layout/domain/theme/motion/print/gallery                | 22、23           | 文件存在、导出路径、build 通过                    |
| 验证策略           | 视觉一致性、E2E、a11y、性能、打印、人工截图                               | 24、25、27       | 验证记录写入 PR 或最终说明                        |

## 29. UI/UX 变更阻塞条件

以下情况必须阻塞合并：

- 页面 IA 与本文件不一致且没有 ADR/计划记录。
- 新增 raw color、inline style、临时字体、临时圆角/阴影/z-index。
- 新组件没有 default/hover/focus/active/disabled/error 状态。
- Radix 包装破坏 ARIA、keyboard 或 focus trap。
- 考试页出现 Sidebar、通知、搜索、营销入口、装饰背景或大装饰。
- ExamResult 未触发 Ceremony、不可跳过或 reduced motion 失效。
- Admin/Coach Utility 页面被改成营销风或装饰卡片堆叠。
- A2UI payload 未经过本地 guard 或绕过权限/审计。
- 图表只靠颜色/图形表达关键业务结论。
- `/dev/ui-gallery` 未覆盖新增基础组件、图表、A2UI slot 或动效等级。
- Light/Dark、移动端、键盘、reduced motion 任一基础验收未做且未说明。
