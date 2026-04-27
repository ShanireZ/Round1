# Round1 — UI/UX 与视觉系统设计方案

## Context

Round1 是独立的信息学竞赛（CSP-J/S、GESP 1~8 级）模拟测试平台，服务青少年学生、教练、管理员三类角色，覆盖 20+ 页面。技术栈 React 19 + shadcn/ui + Tailwind CSS + Vite，支持 Light/Dark 双主题。

本设计方案的目标是建立完整的视觉系统（品牌 Logo、配色、字体、令牌、布局、组件、关键页面信息架构、图标与微交互），在进入 step-01 脚手架前完成视觉层定稿，避免后期牵一发动全身的返工。

## 设计原则

**Modern Editorial × Contest Ceremony（现代编辑感 × 竞赛仪式感）**

- **克制的日常 + 高光的瞬间**：Dashboard / 题库 / 设置页安静专业；考试开始、交卷揭晓、段位变化、错题爆破等关键时刻通过过渡、数字滚动、粒子/全屏覆盖层营造仪式感。
- **排版主导层级**：用字号、字重、行距、字距组织信息层级，而非依赖彩色与阴影。
- **留白充裕**：页面四周与区块间距比传统 OJ 大 1.5~2 倍，信息密度低但关键数据字号大。
- **单色 + 焦点色**：整站以中性灰阶构建，仅用一种主品牌色做指挥棒。
- **细节精致**：1px 细边框、Dark 模式微噪点、按钮按下微位移、数字滚动、Tabular Nums 对齐。
- **数据可视化承担视觉重量**：首页、学生详情、统计面板通过图表、热力图、环形进度等承担视觉性，而非堆砌装饰。

## 环节 1 定稿：品牌与 Logo

- **品牌名**：`Round1`
- **Logo 方向**：**A — `R1` 字标（Monogram）**
  - 主 Logo：`R1` 两字符紧密组合，采用自定义字形（R 与 1 的几何关系经过定制）
  - 辅助图形：尖括号 `⟨ ⟩` 用于页面装饰、分隔线、徽章框、成就系统
  - favicon：仅 `R1`，确保 16px/32px 仍可辨识
  - 暗色底与亮色底各需一套（主色反相或使用中性色版本）
- **Slogan**：无
- **焦点主色**：**竞赛红（Crimson 系）** — 详细色值见环节 2

---

## 环节 2 定稿：配色系统

### 品牌与语义色

| 语义                 | Light               | Dark      | 用途                                 |
| -------------------- | ------------------- | --------- | ------------------------------------ |
| `primary` 品牌主色   | `#E63946` 锐利朱红  | `#E63946` | Logo、主 CTA、当前导航高亮、关键 KPI |
| `destructive` 错误色 | `#C8102E` Crimson   | `#E11D48` | WA、删除、表单校验失败               |
| `warning` 警告色     | `#F59E0B` Amber     | `#FBBF24` | TLE、MLE、超时、配额紧张             |
| `success` 成功色     | `#059669` Emerald   | `#10B981` | AC、通过、完成                       |
| `info` 信息色        | `#0284C7` Sky       | `#0EA5E9` | 提示、运行中状态                     |
| `neutral`            | Slate 500 `#64748B` | Slate 400 | 未作答、草稿                         |

**关键决策**：品牌红（亮 `#E63946`）与错误红（深 `#C8102E`）色相同源但亮度饱和度差异明显，共存不冲突；亮色用于品牌活力，深色承担严肃警示。

### Light 模式底色（含品牌氛围）

```
bg-base:     #FEF9F8    页面底（极淡品牌红调暖白，全站品牌氛围）
surface:     #FFFFFF    卡片底（纯白浮起）
subtle:      #FAF3F2    次级面板（少用；多以 border 替代）
border:      #F0E4E2    细边框（略暖匹配底色）
divider:     #E4D6D3
muted:       #94A3B8    次要文字
text-2:      #475569    正文次级
text:        #0F172A    正文主色
ink:         #020617    标题极深
accent-wash: #FDEEEF    品牌红超淡晕（悬浮/选中高亮）
```

### Dark 模式底色

```
bg-base:     #0A0E1A    页面底（近黑带一丝蓝，避免纯黑压迫）+ 微噪点纹理（feTurbulence opacity 0.015）
surface:     #121826    卡片底
subtle:      #1E293B    次级区块
border:      #2D3748
divider:     #475569
muted:       #64748B
text-2:      #CBD5E1
text:        #F1F5F9
ink:         #FFFFFF
```

### 中性家族：Slate（冷调）

整站 90% 的颜色来自此家族，承担 text / border / muted。

### 数据可视化色板（色盲友好）

```
#E63946 (brand red)  #0EA5E9 (sky)     #10B981 (emerald)
#F59E0B (amber)      #8B5CF6 (violet)  #64748B (slate)
```

热力图连续色：`#FEF9F8 → #FDEEEF → #F8B5BC → #E63946 → #8B1538`（底色 → 暖粉 → 品牌红 → 深酒红）

### 双层底色 + 视觉策略

- **Utility 页**（列表/表单/设置/题库/管理）：`bg-base #FEF9F8` + `surface #FFFFFF` 白卡浮起 + 1px border 分隔
- **Hero / Feature 页**（首页/学生详情/成绩揭晓/数据面板/登录）：组合使用 Mesh Gradient + Radial Aura + Large Typography Backdrop + Dot/Grid Pattern，按页面选配

### 页面视觉策略映射

| 页面                    | 底层                             | 视觉重量来源                                       |
| ----------------------- | -------------------------------- | -------------------------------------------------- |
| 登录/注册               | Layer B Mesh                     | 左侧品牌 Hero + 右侧表单                           |
| Dashboard 首页          | Layer B 顶部 Hero + Layer A 主体 | Hero 显示最近一战 / 能力摘要 / 下一目标            |
| 学生个人详情            | Layer B                          | 能力雷达 + 错题热力图 + 进步曲线为主视觉           |
| ExamNew                 | Layer A                          | 配置表单 + 倒计时大字                              |
| Exam 考试中             | 纯素 Layer A                     | 去除所有装饰，专注模式                             |
| **ExamResult 交卷揭晓** | **Layer B 全屏仪式**             | **全屏覆盖层 + 数字滚动 + 粒子效果**（最强仪式感） |
| 题库/管理/设置          | Layer A                          | 纯工具形态                                         |
| CoachReport             | Layer B                          | 热力图/雷达图作主视觉                              |

**段位系统**：暂不设计。

---

## 环节 3 定稿：字体系统

### 字体家族

| 类别             | 字体                                            | 用途                                                                         |
| ---------------- | ----------------------------------------------- | ---------------------------------------------------------------------------- |
| 英文无衬线       | **Geist Sans**（Vercel，变量字体）              | 全站 UI / 正文英文 / 数字                                                    |
| 英文等宽         | **Geist Mono**                                  | 代码块、变量、ID、时间戳、题目代码                                           |
| 英文衬线 Display | **Fraunces**（变量，可调 SOFT/WONK 轴）         | 品牌 Logo 衍生大字、Hero 标题、ExamResult 揭晓页大分数、Editorial 背景描边字 |
| 中文正文         | **HarmonyOS Sans SC**（华为开源）               | 全站中文 UI / 正文 / 题干                                                    |
| 中文 Display     | **Source Han Serif SC Heavy**（思源宋体 Heavy） | 首页 Hero、ExamResult 揭晓页等仪式场景                                       |

### CSS 字体栈

```css
--font-sans:
  "Geist", "HarmonyOS Sans SC", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
--font-mono: "Geist Mono", ui-monospace, "HarmonyOS Sans SC", monospace;
--font-serif: "Fraunces", "Source Han Serif SC", Georgia, serif;
```

### 字号阶梯（Major Third 1.25）

| Token       | px  | 用途                   |
| ----------- | --- | ---------------------- |
| `text-xs`   | 12  | 辅助说明、标签、时间戳 |
| `text-sm`   | 14  | 正文次级、表单、表格   |
| `text-base` | 16  | 正文主体               |
| `text-lg`   | 18  | 强调段落               |
| `text-xl`   | 22  | 卡片标题               |
| `text-2xl`  | 28  | 页面 H2                |
| `text-3xl`  | 36  | 页面 H1                |
| `text-5xl`  | 56  | Hero 标题              |
| `text-7xl`  | 84  | 品牌大字 / 揭晓数字    |
| `text-9xl`  | 128 | Editorial 背景描边巨字 |

### 字重

`400` 正文 · `500` 按钮/导航/表单标签 · `600` 卡片标题 · `700` 页面标题 · `800/900` Hero Display

### 行高 / 字距规则

- 正文：`line-height: 1.6` · `letter-spacing: 0`
- xs/sm：`line-height: 1.5` · `letter-spacing: 0.01em`
- 2xl+：`line-height: 1.2` · `letter-spacing: -0.02em`
- Hero Display：`line-height: 1.0` · `letter-spacing: -0.04em`
- 代码：`line-height: 1.6` · `letter-spacing: 0`

### 数字处理

全站数字（分数、时间、倒计时、排行榜、表格数字列）强制：

```css
font-variant-numeric: tabular-nums;
```

### 代码连字

**关闭** — 竞赛场景需呈现真实字符形态。`font-feature-settings: "liga" 0, "calt" 0;`

### 数字滚动动画

**仅用于 ExamResult 交卷揭晓页**的总分与每项得分揭示。其他页面数字直接渲染。

### 特殊场景字体应用

| 场景                                | 字体                                           | 配置                   |
| ----------------------------------- | ---------------------------------------------- | ---------------------- |
| Logo `R1`                           | Fraunces Black（手工调字形）                   | 定制                   |
| 首页 Hero 中文                      | 思源宋体 Heavy                                 | 7xl / 900              |
| 首页 Hero 英文品牌字                | Fraunces Black SOFT=100                        | 9xl / 900              |
| **首页 Hero 背景描边巨字 `Round1`** | Fraunces Black，`-webkit-text-stroke` 空心描边 | 9xl+ 极淡色（#F0E4E2） |
| 题目题干                            | HarmonyOS SC + Geist 混排                      | base / 400 行高 1.8    |
| 题目代码块                          | Geist Mono                                     | sm / 400               |
| 选项 A/B/C/D 前缀                   | Fraunces Regular                               | lg / 圆圈装饰          |
| ExamResult 揭晓分数                 | Fraunces Black + Tabular                       | 9xl / 900 + 滚动动画   |
| 导航 / 按钮                         | Geist Medium                                   | sm / 500               |
| 表格数字                            | Geist Tabular                                  | sm / 400               |

---

## 环节 4 定稿：设计令牌

### 圆角

| Token         | 值       | 用途                                              |
| ------------- | -------- | ------------------------------------------------- |
| `radius-none` | 0        | 分割线、内联代码                                  |
| `radius-sm`   | 4px      | Badge、Tag、Checkbox、Radio                       |
| `radius-md`   | **8px**  | 按钮、Input、Select、Dropdown 项、Tooltip（默认） |
| `radius-lg`   | **12px** | 卡片、Dialog、Panel、Popover                      |
| `radius-xl`   | 16px     | Hero 图卡、大图示                                 |
| `radius-full` | 9999px   | 头像、圆形徽章                                    |

基准：`--radius: 8px`。

### 间距（8pt Grid）

`space-1=4 · space-2=8 · space-3=12 · space-4=16 · space-6=24（卡片默认 padding）· space-8=32 · space-12=48 · space-16=64 · space-24=96（Hero）· space-32=128`

页面外边距：`px-4 / px-6 / px-8` 响应式，内容 `max-w-7xl`（1280px）居中。

### 阴影（边框为主 + 浮层用阴影）

| Token         | 值                                      | 用途                         |
| ------------- | --------------------------------------- | ---------------------------- |
| `shadow-none` | —                                       | 卡片默认（靠 border）        |
| `shadow-sm`   | `0 1px 2px rgba(15,23,42,.04)`          | Hover 微浮                   |
| `shadow-md`   | `0 4px 12px -2px rgba(15,23,42,.08)`    | Dropdown、Tooltip            |
| `shadow-lg`   | `0 12px 32px -4px rgba(15,23,42,.12)`   | Dialog、Modal                |
| `shadow-glow` | `0 0 0 4px rgba(230,57,70,.12)`         | **聚焦环 — 品牌红 12% 透明** |
| `shadow-hero` | `0 40px 80px -20px rgba(230,57,70,.25)` | Hero 关键元素                |

Dark 模式阴影降不透明度，并以 outer glow 替代投射。

### 边框

`border-hair 1px border` · `border-weight 1.5px text-2` · `border-focus 2px primary`

### Z-Index

`base 0 · sticky 10 · fixed 20 · dropdown 30 · popover 40 · overlay 50 · modal 60 · toast 70 · ceremony 100`

### 动效时长

`instant 75 · fast 150（默认）· normal 250 · slow 400 · deliberate 600 · ceremony 1200–2000`

### 动效曲线

```
ease-standard:  cubic-bezier(0.4, 0, 0.2, 1)
ease-enter:     cubic-bezier(0, 0, 0.2, 1)
ease-exit:      cubic-bezier(0.4, 0, 1, 1)
ease-spring:    cubic-bezier(0.34, 1.56, 0.64, 1)
ease-ceremony:  cubic-bezier(0.16, 1, 0.3, 1)
```

### 核心微交互

- **按钮按下**：`translateY(1px)` + 阴影压扁，`fast ease-spring`
- **Focus**：立即 `shadow-glow`（品牌红环），无延迟
- **卡片 Hover**：border 加深 + `translateY(-1px)`，`fast`
- **列表入场（首页/Dashboard/仪表盘）**：stagger fade-in + 上移 8px，子项 40ms 间隔
- **数字变化**（非揭晓）：无动画直接替换
- **Dialog**：`scale 0.96 + translateY 8px` 进入，`slow ease-enter`
- **ExamResult 仪式序列**：黑底淡入 → `R1` 品牌字缩放 → 分数滚动 1500ms 回弹减速 → 粒子爆破 → 按钮滑入
- **`prefers-reduced-motion: reduce`**：关闭所有 >200ms 动画，仪式层退化为静态揭示

### 其他

- `backdrop-blur-md 12px`（Dialog 遮罩、半透明导航栏）
- Lucide 图标线宽 `1.5px`
- 描边字（Hero Backdrop）`-webkit-text-stroke: 2px`

---

## 环节 5 定稿：布局骨架

### Layout 类型

| Layout                  | 用途               | 覆盖页面                                                                         |
| ----------------------- | ------------------ | -------------------------------------------------------------------------------- |
| **L1 · AuthLayout**     | 未登录分栏视觉层   | `/login` `/register` `/forgot-password` `/auth/callback` `/join`（未登录）       |
| **L2 · AppShell**       | 登录后主布局       | `/dashboard` `/exams/new` `/exams/:id/result` `/account/*` `/coach/*` `/admin/*` |
| **L3 · FocusLayout**    | 考试专注模式       | `/exams/:id`                                                                     |
| **L4 · CeremonyLayout** | 全屏仪式层（临时） | ExamResult 揭晓序列（2-3 秒后切回 L2）                                           |

### AppShell (L2) 结构

- **TopBar**：h-14，sticky，`bg-base/80 backdrop-blur-md` + 底部 1px border
  - 左：折叠按钮 · R1 Logo · 面包屑
  - 中：空
  - 右：全局搜索（Cmd+K）· 通知铃铛 · 用户头像菜单
  - 滚动时 border 加深 + `shadow-sm`
- **Sidebar**：智能自适应
  - Desktop `xl+`：默认展开 `w-60`
  - Laptop `lg`：默认折叠 `w-14`（仅图标 + Tooltip）
  - Mobile `<md`：Sheet 抽屉（TopBar 折叠按钮触发）
  - 顶部：无角色切换器（按权限显示对应分组）
  - 底部：主题切换 · 帮助 · 版本号
- **Content Area**：内部 `max-w-7xl mx-auto px-8 py-12`

### 导航结构（按权限渐进显示）

**所有登录用户（Student 基础组）**：

- 🏠 首页 `/dashboard`
- ✏️ 出卷考试 `/exams/new`
- 👥 我的班级 `/account/class`（若已入班）
- ⚙️ 账号安全 `/account/security`

**Coach 权限追加 "教练" 分组**：

- 📚 我的班级 `/coach/classes`
- 📝 任务管理 `/coach/assignments`
- 📈 班级报告 `/coach/report`

**Admin 权限追加 "管理" 分组**：

- 🧩 管理看板 `/admin`
- 📦 题库 `/admin/questions`
- 🗂️ 预制卷库 `/admin/papers`
- 📥 导入中心 `/admin/imports`
- 👤 用户管理 `/admin/users`
- 📋 审核队列 `/admin/review`
- 🛠️ 系统设置 `/admin/settings`

分组标题：`text-xs uppercase tracking-wider text-muted` + 分组间 `space-6` 分隔。
选中态：左侧 2px 品牌红细条 + `bg-accent-wash` 背景 + 文字品牌红。

### AuthLayout (L1)

左右 60/40 分栏：

- 左 Hero：Mesh gradient + Fraunces `Round1` 超大字 + 中文副标题
- 右表单：居中 max-w-md 白卡 shadow-md，字段间距 space-6
- `<md` 压缩为顶部 h-48 banner + 表单铺满下方

### FocusLayout (L3) 强专注

- 移除：Sidebar、通知、全局搜索
- 保留：顶部精简 Header（进度 · 倒计时 · 交卷按钮）+ 底部题目导航（始终显示）
- 禁用 `beforeunload` 误触刷新、Tab 可见性变化监测
- 倒计时：tabular-nums 大字，最后 5 分钟 warning，最后 1 分钟 destructive
- 题目导航色块：未答灰 / 已答 emerald / 标记 amber / 当前题 品牌红 2px 边框
- `<md` 手机访问：弹警告「建议平板/电脑作答」允许继续

### CeremonyLayout (L4)

全屏 overlay `z-ceremony 100`，出现 2-3 秒：
mesh bg → 品牌字 R1 缩放 → 分数数字滚动回弹 → 粒子爆破 → 自动切至 ExamResult 详情页（ESC 可跳过）。

### CommandBar（Cmd+K 全局命令面板）

实装。分组：导航 · 我的考试（最近 5）· 我的班级（coach+）· 管理操作（admin+）· 设置 · 主题切换。支持模糊搜索、键盘导航。`<sm` 隐藏入口，用户改用头像菜单。

### 响应式断点

Tailwind 默认 `sm/md/lg/xl/2xl`。设计优先级：`xl` 桌面（1280） > `lg` 笔记本 > `md` 平板 > `sm` 手机（考试非推荐场景）。

---

## 环节 6 定稿：核心组件风格

### 按钮 Button

5 Variant · 4 Size：`primary`（品牌红实心 + hover 红光晕）· `secondary`（白底 border）· `ghost`（透明 + hover 浅底）· `destructive`（Crimson 实心）· `link`（下划线 hover）。Sizes：`sm h-8 / md h-10（默认）/ lg h-12 / icon h-10 w-10`。按下 `translateY(1px)` + 阴影压扁，Focus `shadow-glow` 品牌红环，Loading 替换为 Spinner 保持宽度。

Primary hover：`bg #E63946 → #DC2E3B` + `shadow 0 8px 20px -8px rgba(230,57,70,.35)`。

### 表单

- **Input**：`h-10 rounded-md border-hair bg-surface px-3 text-sm`，Focus border-primary + shadow-glow，Error border-destructive + 下方红色说明，Disabled opacity-60
- **Select / Combobox**：Input 规格 + Chevron，Popover `shadow-md rounded-lg`
- **Checkbox / Radio**：12px，border 2px，选中品牌红填充
- **Switch**：28×16，关闭灰 / 开启品牌红
- **Textarea**：min-h 120，可选等宽字体
- **布局**：单列为主，组间距 space-6，组内 space-2，Actions 右对齐

### 卡片 Card

Variants：`card-default`（无阴影 + hover 抬升）· `card-flat`（静态）· `card-hero`（大内边距 + mesh 背景）· `card-stat`（大字 tabular-nums）· `card-interactive`（整卡可点击）。

### 表格 Table

Editorial 低密度风：表头 `h-12 bg-subtle text-xs uppercase tracking-wider`，行高 `h-14`，无斑马纹，单元格 `px-6 text-sm`，数字列 `text-right tabular-nums`，Hover 行 `bg-accent-wash` 淡红晕，选中行 + 左 2px 品牌红条。空态 `h-64` 居中。`<md` 降级为卡片列表。

### 徽章 Badge

**竞赛语义徽章（遵循 OJ 全球约定）**：

- `AC` emerald 实心 + ✓ · `WA` Crimson 实心 + ✗ · `TLE` amber 实心 + ⏱ · `MLE` amber outline · `RE` destructive outline · `未作答` slate outline · `已保存` sky outline

试卷类型：CSP-J 蓝 · CSP-S 紫 · GESP-1~4 绿 · GESP-5~8 橙（outline 风格）。
难度：入门灰 / 普及绿 / 提高蓝 / 冲刺红（outline）。

### 代码块 CodeBlock

Geist Mono · `bg-subtle rounded-md border-hair p-4` · 行号 muted 小字 · **Shiki 自定义高亮主题**：关键字 `#E63946` · 字符串 emerald · 数字 amber · 注释 muted italic · 函数名 sky · 复制按钮 hover 出现 · 填空题高亮行 `bg-accent-wash` + 左品牌红条 · 填空 `<input>` 下划线样式 · 横向滚动条极细 · 连字 liga/calt 关闭。

### 题目渲染器 QuestionRenderer

通用：QuestionNumber（大号 Fraunces）· QuestionBody（HarmonyOS + Geist 混排 `text-base leading-relaxed`）· 批注浮窗（讲解模式）。

**MCQ 选项前缀**：Fraunces 字母 + 圆圈框（未选空圆 / 已选品牌红实心），整卡 `card-interactive`，hover border 加深 + translateY(-1px)。

**ReadCode**：顶部全宽 CodeBlock + 下方 5 子题列表（`5-1` ~ `5-5`）。

**FillBlank**：代码块内嵌 `<input>` 填空，代码中用 `①②③` 编号标注，下方或就地作答。

**讲解模式**：**直接在题目卡片内嵌展示**。正确选项 emerald border + ✓ · 错误选项 destructive border + ✗ · 用户错选 destructive 填充 · AI 分析文字区在原题下方扩展（折叠/展开 250ms），不跳页不开抽屉。

### 状态反馈组件

- **Toast**：右上角滑入 4s，`shadow-lg rounded-lg` + 左侧 4px 色条
- **Dialog**：居中 overlay + backdrop-blur，`max-w-md rounded-lg shadow-lg`，危险操作模式
- **Sheet**：右侧滑入 `w-96`，用于筛选 / 详情速览
- **Empty State**：图标 + 标题 + 说明 + CTA 垂直居中 `py-24`
- **Skeleton**：`bg-subtle animate-pulse`
- **Progress**：线性 `h-1.5`，环形 SVG stroke，考试页顶部 `h-0.5` 极细线

### 图表 Chart

- 主色：数据可视化 6 色定性色板
- 坐标轴 `text-xs text-muted`，网格虚线 4 4
- Tooltip `bg-ink text-surface rounded-md shadow-lg`
- 动画：首次入场 `duration-deliberate ease-ceremony`，更新 `duration-normal`
- **错题热力图**：7×N 网格，色阶 `#FEF9F8 → #E63946 → #8B1538`
- **能力雷达图**：6-8 轴，品牌红填充 30% 透明 + 实线
- **进步曲线**：面积图，品牌红渐变 + 圆点标记

### 导航辅助

- **Breadcrumb**：TopBar 左侧 Chevron 分隔
- **Tabs**：下划线式，2px 品牌红条滑动切换 `duration-normal`
- **Pagination**：`[<] 1 2 3 … 10 [>]`，当前页实心品牌红
- **Step Indicator**：编号圆圈 + 连线，当前步骤品牌红

### 头像 Avatar

圆形 `sm 24 / md 32 / lg 48 / xl 64`。无图时首字母 + hash 取色。角色小圆点：教练 sky / 管理员 amber。

### 打印样式 Print CSS（完整印刷级）

- 移除所有背景色 / 阴影 / 动效 / 品牌色
- 中文 `SimSun / 宋体` · 英文 `Times New Roman` · 代码 `Courier New`
- `@page { size: A4; margin: 2cm }`
- 每题 `page-break-inside: avoid`
- FillBlank `<input>` → 下划线空格
- 页眉：R1 Logo + 试卷编号 + 页码，页脚：生成时间

---

## 环节 7 定稿：关键页面信息架构

### Dashboard `/dashboard`

**布局**：Hero Band (Layer B mesh + 描边 R1 backdrop) → 双栏（最近考试表格 · 能力雷达）→ 错题热力图（全宽）→ 智能建议侧栏。

Hero：问候 + 一句话摘要 + 目标进度条 + 2 主 CTA（开始模拟 / 查看最近一战）。

智能建议区：MVP 用**占位 + 静态规则版**（如"你最近 X 题错率高"），保持完整视觉，v2 接入 AI。雷达 / 热力图若后端数据尚未就绪，以 Skeleton + "数据积累中" 占位。

**"我的进步"不独立成页**，全部融入 Dashboard。

### ExamNew `/exams/new`

- ① 试卷类型：**2×5 大卡片网格**（card-interactive，品牌红边框选中），`<md` 降级为 1 列滚动
- ② 规则说明：100 分制构成 + 时长 90 分钟 + 立即计时警示
- ③ 频控未过：大号倒计时 "距下次可生成：12:34"，CTA 禁用
- ④ 开始考试 CTA → 二次确认 Dialog

### Exam `/exams/:id`（FocusLayout）

- TopBar 精简：R1 · 试卷名 · 进度 · 倒计时 · 交卷下拉
- 顶部 h-0.5 品牌红进度条
- 单题垂直滚动 `max-w-4xl mx-auto`
- 三种题型专属渲染（MCQ / ReadCode / FillBlank）
- 底部题目导航色块始终显示（未答灰 / 已答 emerald / 标记 amber / 当前品牌红边框）
- 自动保存 debounce 2s，右上角"已保存 · 刚刚"
- 倒计时 5 分钟 warning · 1 分钟 destructive · 0 自动交卷
- `beforeunload` 拦截 + 草稿保存
- `<md` 首次进入：警告 Dialog 允许继续

### ExamResult `/exams/:id/result`

**阶段 A — CeremonyLayout 揭晓（2-3s）**
**提交后立即强制触发**（ESC 跳过，无用户设置开关）：黑底淡入 → R1 缩放 → 分数滚动 1500ms 回弹 → AC 金红粒子 / WA 低饱和粒子 → "查看详情"滑入。

**阶段 B — L2 详情页**
Hero Band（分数 + 构成 + 3 个 CTA：打印 PDF / 再来一次 / 班级排名）→ 错题分布图 · 用时分析图 → 题目列表（可展开讲解，**卡片内嵌**，不跳页/不开抽屉）。

讲解内容：正确答案 · 用户答案 · 代码执行（若适用）· AI 分析文字。

### CoachReport `/coach/report`

- Hero：班级选择器 + 时间范围 + 汇总 KPI
- 班级能力热力图（学生 × 考点），占 50%+ 面积，主视觉
- 高频错题 Top 10 · 班级能力雷达（全班平均）
- 学生列表表格
- **点击学生行 → 右侧 Sheet 抽屉**（不离开报告页，可连续下钻多学生）
- 支持导出 CSV / 打印报告

### 学生个人详情（Coach 下钻视图）

Sheet 内容：顶部姓名 + 累计 + 均分 → 能力雷达 → 错题热力（30/90 天切换）→ 进步曲线 → 高频错题考点。
（学生自己的进步展示**融入 Dashboard**，不做独立页面。）

### AdminDashboard `/admin`

KPI 卡组（今日注册 · 今日考试 · 题库总量 · 已发布预制卷数）→ 导入批次摘要 · 系统健康并列 → 近期活动列表。Utility 风格，保留 Hero Band 承载品牌氛围。

### 其他 Utility 页（IA 简述）

- **AdminQuestionPool**：筛选栏 + 表格（题目/类型/考点/难度/状态/使用次数/参与率）+ 行操作 + 右 Sheet 预览
- **AdminPaperLibrary**：预制卷筛选表格 + 详情预览 + 发布/归档 + 复制新版本
- **AdminImports**：question bundle / prebuilt paper bundle dry-run 结果、错误报告、导入历史；正式可审计产物使用 runId 命名，不展示 `paper-packs.json` 作为推荐入口
- **AdminSettings**：Tabs（认证/频控/邮件/沙箱/导入），**敏感操作保留 step-up 二次验证**
- **AdminUsers**：用户表格 + 筛选 + 角色修改（step-up）
- **AdminReview**：AI 题目人工审核卡片流 + 批准/退回
- **CoachClasses**：班级卡片网格（人数/均分/活跃度）
- **CoachClassDetail**：班级 Tabs（成员/任务/报告）
- **CoachAssignments**：任务表格 + 新建 Drawer
- **JoinClassPage**：居中 Hero 大卡 + 输入班级码
- **AccountSecurityPage**：Tabs（密码/Passkey/OIDC 绑定/邮箱/会话管理）

---

## 环节 8 定稿：图标 / 插画 / 空状态 / 微交互 / 可达性

### 图标库

**Lucide Icons** (`lucide-react`)。线宽 `1.5px`，尺寸 `16/20/24`，颜色 `currentColor` 继承，语义图标用对应语义色。Logo `R1` 独立手绘 SVG。favicon：`R1` SVG 压缩 + PNG 16/32/180。PWA 图标 512×512 + maskable 品牌红底白字版本。

### 插画策略

**抽象几何 + 数据元素 + 排版即插画**，不用卡通吉祥物。空状态 / 错误页用 Lucide 大号图标 + 大字 + 说明 + CTA 四段式。真实数据图表（雷达 / 热力 / 曲线）承担 Hero 区视觉装饰。Editorial 背景大字（Fraunces `Round1` / 数字 / 章节编号 空心描边）作为页面装饰层。

### 空状态清单

| 场景             | 图标            | 文案             | CTA            |
| ---------------- | --------------- | ---------------- | -------------- |
| Dashboard 无考试 | `FileText`      | 还没有模拟记录   | 开始第一次模拟 |
| 题库无结果       | `Search`        | 没有匹配的题目   | 清除筛选       |
| 班级无成员       | `Users`         | 班级还没有学生   | 复制邀请码     |
| 任务空           | `ClipboardList` | 还没有布置任务   | 新建任务       |
| 错题全对         | `PartyPopper`   | 本次全对，恭喜！ | 再来一次       |
| 通知空           | `BellOff`       | 暂无新通知       | —              |
| 频控未过         | `Timer`         | 冷却中：12:34    | —              |
| 网络错误         | `WifiOff`       | 网络连接异常     | 重试           |

### 错误页

404 / 403 / 500 页采用 AuthLayout 风格：左侧 Fraunces 大字编号 + 右侧说明 + CTA。

### 加载态分级

- `<100ms` 不显示
- `100ms-1s` Skeleton
- `1-5s` Skeleton + 顶部 `h-0.5` 品牌红进度条
- `>5s`（AI 生成）**全屏大卡 + 步骤式进度 + 品牌红环形 stroke 动画**（步骤：分析配额 → 抽题 → 组卷 → 校验），背景淡品牌红 mesh

### 微交互清单

选项选中缩放回弹 · 复制成功✓切换 · 倒计时最后 10s 脉动 · 保存 Toast spring 弹入 · 拖拽 scale+shadow · Tab 下划线滑动 · Sidebar 宽度动画 · 主题切换全页 transition-colors · 通知铃摆动 · AC 展开对号脉动 glow。

### 可达性 a11y（硬性）

- 键盘全覆盖 Tab/Enter/Space/Arrow
- Focus 可见（品牌红 glow 环）
- ARIA（Radix 自带 dialog/menu/option）
- 对比度 text ≥ 4.5:1 · 标题 ≥ 3:1 · Primary CTA ≥ 4.5:1
- `prefers-reduced-motion: reduce` → 关闭 >200ms 动画，仪式层退化为静态分数揭示
- `prefers-color-scheme`：**首次访问跟随系统，之后 localStorage 记住用户选择**
- 错误不仅靠颜色（+ 图标 + 文字）
- 图标按钮必有 `aria-label` 或 Tooltip
- Skip to content 跳过导航链接

### 本地化（MVP 中文单语）

日期 `2026年04月15日` / 紧凑表格 `2026-04-15` · 时间 24h `14:30:45` · 数字千分位 `1,234` tabular-nums · 分数 `87.5 分` · 相对时间 `刚刚 / N 分钟前 / 昨天 / 绝对日期`。文案用 "你" 而非 "您"，青少年友好；错误不责备用户。

### 字体托管 / 加载策略

**托管**：项目自托管字体文件于 **Cloudflare R2**（后续迁移国内 CDN），走 `@font-face` 本地引用，不走 Google Fonts CDN。

**加载策略**：

- **Fallback 优先 FOUT**：`font-display: swap`，首屏用系统字体（`-apple-system`、`Segoe UI`、系统宋体）立刻渲染，Web 字体加载完毕后替换
- **全量加载中文字体**（HarmonyOS SC 正文 + 思源宋体 Heavy），不做 subset；接受 5-10MB 初次下载代价
- **HTTP 长缓存**：R2 配置 `Cache-Control: public, max-age=31536000, immutable` 一年长缓存 + 版本哈希
- **preload 关键字重**：HTML `<head>` preload Geist 400/500/600 + HarmonyOS 400，其他字重延迟
- **Fraunces / 思源宋体 Heavy 懒加载**：仅在 Hero 场景（首页 / ExamResult / AuthLayout）需要时加载

### 性能预算

- Hero 描边大字 SVG 渲染
- Mesh gradient 纯 CSS `radial-gradient + conic-gradient`
- Dark 模式噪点 `<svg feTurbulence>` 复用
- 图表库 `React.lazy + Suspense` 按需加载
- 动效仅用 `transform + opacity`（GPU）

### Design Tokens 实现

- `client/src/styles/tokens.css` — 所有令牌 CSS 变量
- Tailwind 4 `@theme` 引用变量
- shadcn/ui `globals.css` 追加 Light/Dark 变量组
- 主题切换：`html.dark` 类切换 + `transition-colors duration-normal` 平滑过渡

### 未来扩展预留

段位系统（rank-scale 色板）· AI 智能建议（Dashboard 占位区）· QQ 互联（AuthLayout 社交区可扩展）· 多语言（字体栈已含西文+中文 fallback）· 真题审核工作流增强。

---

## 关键交付物清单（给 step-01 脚手架）

1. **`client/src/styles/tokens.css`** — 全部设计令牌（颜色 / 圆角 / 间距 / 阴影 / 字体栈 / 动效曲线）
2. **`client/src/styles/globals.css`** — Light / Dark 主题 CSS 变量，字体 `@font-face`（R2 URL）
3. **`client/src/components/ui/*`** — shadcn/ui 基础组件（Button / Input / Select / Card / Dialog / Toast / Tabs / Tooltip / Sheet / Dropdown / Badge / Table / Skeleton / Progress / Avatar / Switch / Checkbox / Radio）按本方案视觉规则微调
4. **`client/src/components/layout/*`** — `AppShell` / `AuthLayout` / `FocusLayout` / `CeremonyLayout` / `TopBar` / `Sidebar` / `CommandBar`
5. **`client/src/components/brand/*`** — `Logo`（SVG）、`HeroBackdrop`（描边大字背景）、`MeshGradient`（mesh 背景）、`NoiseTexture`（Dark 噪点）
6. **`client/src/components/domain/*`** — `QuestionRenderer`（MCQ / ReadCode / FillBlank）、`CodeBlock`（Shiki 自定义主题）、`StatBadge`（AC/WA/TLE/MLE/RE）、`ExamTypeBadge`、`DifficultyBadge`、`RankHeatmap`、`AbilityRadar`、`ProgressCurve`、`ScoreReveal`（揭晓动画 + 粒子）
7. **`client/src/lib/theme.tsx`** — 主题切换逻辑（prefers-color-scheme + localStorage）
8. **`client/src/lib/motion.ts`** — 动效预设（framer-motion variants 或 CSS 动画配置）
9. **`client/src/styles/print.css`** — 印刷级打印样式
10. **字体文件** — 上传至 Cloudflare R2，HTML 中 preload 关键字重
11. **Favicon 套件** — `favicon.svg` / `favicon.ico` / `apple-touch-icon.png` / `maskable.png` / `manifest.json`
12. **Shiki 自定义主题 JSON** — 品牌红关键字 + emerald 字符串 + amber 数字 + muted 注释 + sky 函数名
13. **Lucide Icons** — `lucide-react` 依赖引入

---

## 验证策略

### 视觉一致性验证

- **Storybook** 或 **shadcn showcase 页**：在 `/dev/ui-gallery` 路由展示所有令牌、组件、变体、状态（dev 环境专用，生产移除）
- 每个组件 6 个状态快照：default / hover / focus / active / disabled / error
- Light / Dark 双主题并排对比

### 关键流程 E2E（Playwright）

1. **注册 → 登录**：视觉截图对比 AuthLayout Hero
2. **Dashboard 首屏**：Hero Band + 描边大字 + 最近考试 + 雷达 + 热力图 渲染完成
3. **ExamNew 流程**：2×5 卡片 + 频控倒计时 + 二次确认 Dialog
4. **Exam 考试流程**：FocusLayout 侧栏隐藏 + 自动保存 + 题目导航色块
5. **ExamResult 揭晓序列**：CeremonyLayout 全屏 → 分数滚动 → 粒子 → 详情页
6. **CoachReport**：热力图 + 点击学生行右侧 Sheet 抽屉
7. **打印试卷**：触发打印样式，PDF 输出符合 A4 印刷级标准

### 可达性验证

- `axe-core` 自动化扫描每个页面
- 键盘 Tab 顺序人工验收
- 对比度 `Lighthouse` / `WAVE` 工具验收 AA
- `prefers-reduced-motion` 模拟开启，仪式层退化确认
- 屏幕阅读器（NVDA / VoiceOver）抽测关键流程

### 性能验证

- Lighthouse 首屏 LCP < 2.5s（移动端）
- 字体 FOUT 无跳变
- 动效 60fps（Chrome DevTools Performance tab）
- Dark 模式切换无闪烁

### 打印验证

- Chrome 打印预览 `Cmd+P` → A4 PDF
- 移除所有品牌色、阴影、动效
- 每题 `page-break-inside: avoid` 确认无跨页截断
- 代码块用 Courier New 字体

---

## 决策摘要（快速索引）

| 环节    | 决策                                                                                                                                                                          |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. 品牌 | Round1 · Logo 方向 A（`R1` 字标 Monogram + 尖括号辅助）· 无 Slogan                                                                                                            |
| 2. 主色 | 品牌红 `#E63946` · 错误红 `#C8102E` · Light 底 `#FEF9F8` · Dark 底 `#0A0E1A` + 微噪点 · 中性 Slate · 无段位                                                                   |
| 3. 字体 | Geist Sans + Geist Mono + Fraunces（Display）+ HarmonyOS SC（中文正文）+ 思源宋体 Heavy（中文 Hero）· 关闭代码连字 · 数字滚动仅 ExamResult · 首页 Hero 空心描边 `Round1` 背景 |
| 4. 令牌 | 8px 按钮 / 12px 卡片 · 边框优先 + 浮层阴影 · 按下 translateY(1px) + 阴影压扁 · 列表 stagger fade-in · Focus 品牌红 12% 透明 glow                                              |
| 5. 布局 | TopBar + Sidebar · Desktop 展开 / Laptop 折叠 / Mobile 抽屉 · Cmd+K 实装 · FocusLayout 强专注 · 按权限显示导航（无角色切换器）· `<md` 考试警告允许继续                        |
| 6. 组件 | Primary 加红光晕 · 表格 h-14 无斑马纹 + 淡红晕 hover · MCQ 选项 Fraunces 字母圆圈 · Shiki 自定义高亮（品牌红关键字）· 讲解卡内嵌展示 · 完整印刷级打印                         |
| 7. 页面 | Dashboard 智能建议占位 + 静态规则 · ExamResult 揭晓强制触发 ESC 可跳过 · CoachReport 右 Sheet 下钻 · ExamNew 2×5 大卡片 · 进步融入 Dashboard · Admin 敏感操作 step-up         |
| 8. 细节 | Lucide Icons · 抽象几何 + 数据 + 排版即插画 · AI 生成步骤式进度 + 环形 stroke · 主题跟随系统 + localStorage · 字体 Cloudflare R2 自托管 · 全量中文字体 + FOUT + 长缓存        |

---

## 待定 / 后续迭代项

- AI 智能建议文案模板（v2）
- QQ 互联登录视觉（feature flag）
- i18n 多语言（若国际化）

## 强烈建议和注意事项

本视觉系统已基本定稿，后续需要进行：

- 搭建 React 19 + Vite + Tailwind 4 + shadcn/ui 脚手架
- 实装本方案全部设计令牌、字体托管、组件库
- 构建 `/dev/ui-gallery` 组件展示页作视觉验收基线
- 之后所有页面和功能，按需调用本视觉系统组件，不再重复设计决策
