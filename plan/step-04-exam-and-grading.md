# Step 04 — 预制卷考试与批改（Phase 11）

> **前置依赖**：Step 01（DB）、Step 02（认证）、Step 03（题库与预制卷库已发布内容）
> **交付物**：完整的选卷→预览→答题→自动保存→提交→批改→解析→打印流程
> **可验证 demo**：学生按考试类型和难度创建试卷、开始答题、提交后看到分数与每题解析、浏览器打印输出与真题对比
> **当前对齐说明（2026-04-26，2026-04-27 复核更新）**：本文件描述的是 Phase 11 目标状态机与完整目标路由契约。当前 worktree 已挂载的运行时 slice 已扩展为：`GET /api/v1/exams/catalog`、`GET /api/v1/exams/active-draft`、`POST /api/v1/exams`、`POST /api/v1/exams/:id/attempts`、`GET /api/v1/exams/:id/session`、`GET /api/v1/exams/:id/result`、`PATCH /api/v1/attempts/:id`、`POST /api/v1/attempts/:id/submit`、`GET /api/v1/attempts/active`、`GET /api/v1/users/me/attempts`、`GET /api/v1/users/me/stats`。当前实现已经锁定“只能从已发布预制卷克隆实例，禁止在线组卷/换题”的约束；`server/__tests__/exams-runtime.integration.test.ts` 已覆盖 catalog、active draft 查询、重复建 draft 复用、拒绝在线拼题/换题 payload、按已发布预制卷克隆 draft、最近 finalized attempts 的模板级软排除、无模板时返回 `ROUND1_PREBUILT_PAPER_UNAVAILABLE`、startAttempt CAS 与 delayed auto-submit 调度、任务模式 `assignment_progress.pending → in_progress`、session payload 返回题面与当前答案、autosave `patches[] + jsonb_set()` 增量保存与 nonce 冲突、submit finalized 幂等返回、阅读/完善程序子题级聚合、wrongs 报告、独立 result payload、超时落 `auto_submitted`、`attempts/active` 剩余时间恢复 payload、以及 users/me 历史与统计。前端已接入 App 启动恢复、`/api/v1/config/client.autosaveIntervalSeconds` 周期性 pending patch flush、30s autosave debounce、beforeunload keepalive 保存、Dashboard 与打印样式。
> **2026-04-28 前端入口复核**：`/exams/new` 已从占位页切换为 `client/src/pages/exams/ExamNew.tsx`，读取 `GET /api/v1/config/client`、`GET /api/v1/exams/catalog` 与 `GET /api/v1/exams/active-draft`，按运行时 `availableExamTypes` / `availableDifficulties` 渲染 2×5 试卷类型矩阵、难度选择、可用预制卷数量、草稿 TTL 与开考二次确认；创建草稿走 CSRF 保护的 `POST /api/v1/exams`，成功后进入 `/exams/:id` 由 `ExamSession` 开始或复用 attempt。

---

## Phase 11 — 选卷 + 答题 + 批改

### 11.1 prebuiltPaperSelector（按预制卷库选卷）

- 当前最小实现位于 `server/routes/exams.ts`，按 `examType + difficulty` 从 `prebuilt_papers` 中选择 `published` 模板并克隆实例
- 若后续补上“近期 attempts 软排除”或更复杂的模板策略，再抽离为 `server/services/prebuiltPaperSelector.ts`

**选择规则**：

- 输入至少包含 `examType` + `difficulty`
- 只允许选择 `prebuilt_papers.status='published'`
- 优先排除用户最近 `paper.selection.recentExcludeAttempts` 次 submitted attempts 使用过的 `prebuilt_paper_id`
- 若排除后无可用卷，降级为允许重复使用最近卷
- 若仍无可用卷，返回 `ROUND1_PREBUILT_PAPER_UNAVAILABLE`

> 运行时不再执行在线组卷，也不再按题目级库存或退役率做选择。

### 11.2 草稿试卷与单活动 draft 约束

- 自练模式（`assignment_id IS NULL`）：同一用户同一时间最多 1 张活动 draft
- 任务模式（`assignment_id IS NOT NULL`）：同一用户同一时间最多 1 张活动 draft
- 两类 draft 独立计数，互不阻塞
- 重复 `POST /api/v1/exams` 幂等返回现有 draft（按类型匹配）
- `EXAM_DRAFT_TTL_MINUTES` 默认 1440（24h），超期回收为 `abandoned`

**创建草稿卷**：

1. `prebuiltPaperSelector` 选中模板
2. 创建 `papers(status='draft')`
3. 批量复制 `prebuilt_paper_slots` → `paper_question_slots`

### 11.3 开始答题

- `POST /api/v1/exams/:id/attempts` — startAttempt
- 事务中（隔离级别：READ COMMITTED）：锁定所有 slots、创建 `attempts`
- 生成 `tab_nonce`（UUID v4）返回给前端
- 并发重试返回同一 attempt（CAS 幂等）
- 创建 BullMQ delayed job（调度规则：`submitAt = min(started_at + duration, assignment.due_at)`，自练模式无 `due_at` 约束则取 `started_at + duration`）用于超时自动提交

> **当前实现（2026-04-26）**：startAttempt 路由在 `papers.status='draft'` 上做 CAS 激活，创建 attempt 后调度 BullMQ delayed auto-submit job，把 job id 回写到 `attempts.auto_submit_job_id`，并在任务模式下把 `assignment_progress` 从 `pending` 推到 `in_progress`。并发重试若已存在 started attempt，会返回同一 attempt。

> `startAttempt` 不再记题目参与率，也不再维护题目库存计数。

### 11.4 自动保存

- `PATCH /api/v1/attempts/:id` — autosave
- `answers_json` 增量更新：`jsonb_set()` 单题更新
- 必须携带 `X-Tab-Nonce`，不匹配返回 `409 Conflict`
- per-user rate limit 1 次/30s
- 仅 `started` 状态可写
- autosave 路径只做 session 读（鉴权）不做写（不刷新 expiry）

> **当前实现（2026-04-26）**：路由已挂载，并已覆盖“started attempt + 正确 `X-Tab-Nonce` 可保存”与“nonce 冲突返回 `409`”两条基础语义。当前请求体为 `patches[]`，服务端用 `jsonb_set()` 按 `slotNo/subKey` 增量更新 `answers_json`；同时新增 per-user autosave 频控，默认 30s。

**前端 autosave 策略**：

- 基础轮询间隔：180s（通过 `GET /api/v1/config/client` 下发）
- 答案变更 debounce：30s（用户停止操作 30s 后触发，与后端 per-user 限频对齐）
- `beforeunload` 事件：关闭/刷新页面时最终保存（`fetch(..., { keepalive: true })`）— 支持自定义 method/headers（PATCH + X-Tab-Nonce + X-CSRF-Token）；属于 best-effort，不保证送达；与后端 autosave 已有数据互补，不作为唯一可靠性手段

### 11.5 提交答卷

- `POST /api/v1/attempts/:id/submit`
- 服务端以 `started_at + blueprint.duration_minutes` 判定最终状态：未超时落 `submitted`，已超时落 `auto_submitted`
- 计时由服务端控制，前端只负责展示
- **幂等性**：使用 CAS 模式 `UPDATE attempts SET status='submitted' WHERE id=:id AND status='started'`，重复提交返回已有结果
- 若前端仍有 pending patches，可在 submit 请求中携带 `patches[]` + `X-Tab-Nonce`，服务端先增量写入 `answers_json` 再进入 finalizer
- 提交成功后立即取消超时自动提交 job：`queue.remove(attempt.auto_submit_job_id)`，获取不到时忽略（已触发则无影响）

> **当前最小实现（2026-04-26）**：路由已挂载，并已覆盖 finalized attempt 幂等返回、服务端计时截止判定、`submitted` / `auto_submitted` 两条基础状态流、将对应 `paper` 标记为 `completed`、manual submit 时取消 delayed auto-submit job，以及 `score` / `perPrimaryKpJson` / `perSectionJson` / `aiReportJson` / `reportStatus` 回写。独立 result 接口已经把这些聚合字段与题面/解析拼成稳定 payload；更细的 CAS 并发细化与 richer teacher/runtime 联动仍属于后续目标契约。

**超时自动提交**：

- 当前最小实现：startAttempt 已调度 BullMQ delayed job；如果 submit 请求到达时已超过 `started_at + duration`，则同步落库为 `auto_submitted`；runtime worker 也会复用同一 finalizer 处理 delayed auto-submit job
- 主机制：BullMQ delayed job，jobId 存入 `attempts.auto_submit_job_id`
- 兜底：API 与 runtime worker 每 5 分钟扫描 `status='started'` attempt，按 `min(started_at + duration, assignment.due_at)` 补漏落 `auto_submitted`

### 11.6 grader 客观打分

- 当前最小实现：submit / auto-submit finalizer 会读取 `paper_question_slots` + `questions.answer_json` / `questions.explanation_json`，按 `answers_json.subAnswers` 做 grouped grader。`reading_program` / `completion_program` 已按子题粒度累计分数、知识点与 section 统计，并把 wrongs + explanation 聚合写入 `attempts.ai_report_json`
- `server/services/grader.ts` — 比对 `answers_json`（大题组 `subAnswers` map 结构），子题级累加
- 输出：`{ total, perPrimaryKp, perQuestionType, wrongs }`
- 预聚合写入 `attempts.per_primary_kp_json` + `per_section_json`

### 11.7 解析展示

- 每道错题展示预生成的 `explanation_json`
- 单选题：各选项正误原因
- 阅读/完善程序：整体逻辑分析 + 逐小题分析

> **当前最小实现（2026-04-26）**：`GET /api/v1/exams/:id/result` 已返回 `paper`、finalized `attempt` 聚合、以及按 slot 归一化的 `items` 列表。每个 item 当前包含 `contentJson`、`submittedAnswers` 和 `result.subQuestions[]`，后者已串起正确答案、用户答案、得分、正误与 explanation，供结果页直接渲染卡片内讲解。

### 11.8 诊断报告（预留）

- `server/services/reportBuilder.ts` — 首发未使用
- `attempts.ai_report_json` / `report_status` / `report_error` / `report_job_id` — schema 已定义；当前运行时已使用前两者承载规则型 grader wrongs 报告，LLM 诊断扩展仍预留

### 11.9 考试会话恢复

- session idle/absolute TTL 到期 → 用户重新登录 → 继续同一场答题
- `GET /api/v1/attempts/active` — 返回进行中 attempt（含 `tabNonce`、`paperId`、剩余时间）
- `App.tsx` 加载时自动检测并跳转恢复

> **当前实现（2026-04-26）**：`GET /api/v1/attempts/active` 返回 `id`、`paperId`、`status`、`tabNonce`、`startedAt`、`submitAt`、`remainingMs`、paper 元信息与 `resumePath`；`App.tsx` 启动时自动检测并跳转到 `/exams/:paperId` 恢复答题。

### 11.10 前端路由与页面

- `GET /api/v1/exams/catalog` — 查询可用 exam_type / difficulty 目录
- `GET /api/v1/exams/active-draft` — 查询当前活动 draft
- `ExamNew.tsx` — 选择考试类型 + 难度 + 可用预制卷状态展示；当前路径为 `client/src/pages/exams/ExamNew.tsx`
- `Exam.tsx` — 试卷预览 / 答题 / 计时器 / autosave
- `ExamResult.tsx` — 报告 + 每题解析 + 打印按钮
- `GET /api/v1/exams/:id/result` — 结果页读取接口（当前已挂载，返回稳定结果 payload）

### 11.11 学生 Dashboard 与统计

- `Dashboard.tsx` — 成绩曲线 + 薄弱 KP 概览 + 答题历史
- `GET /api/v1/users/me/attempts` — 分页答题历史（当前已挂载，按 finalized attempts 返回最小列表）
- `GET /api/v1/users/me/stats` — 聚合统计（当前已挂载，聚合 submitted + auto_submitted）

> **当前实现（2026-04-26）**：`/dashboard` 已从占位页替换为真实页面，接入上述两个接口展示成绩曲线、答题历史、弱项 KP 与静态建议区。

### 11.12 打印样式优化

#### @media print 样式

- `client/src/styles/print.css` — 试卷与报告页面打印样式
- 试卷打印：题号、选项、代码块清晰排版
- 报告打印：分数、解析、知识点统计

#### 浏览器打印

- `window.print()` 实现，无需服务端 PDF 端点
- 学生仅能打印自己的 attempt
- 教练可打印班级范围内学生的
- Admin 可打印任意

---

## 自练试卷 / 草稿 / 会话状态机

> 状态枚举与完整状态机定义见 [reference-schema.md#状态枚举附录](reference-schema.md#状态枚举附录)。

补充规则（本文件特有）：

- `draft` 状态下只允许预览，不允许在线替换题目
- `draft` 状态下只允许预览；不提供在线换题入口，也不再引入新的 replacement 表或 replacement API
- session 过期后重新登录可在 `started` 状态继续答题
- 超时自动提交规则：`submitAt = min(started_at + duration, assignment.due_at)`
- 两类 draft（自练 / 任务）独立计数，互不阻塞

### 11.13 运行时收口修复

- 线上考试路径固定为“选已发布预制卷 → 克隆实例 → 作答 → 批改”，不得恢复在线拼题、在线换题或运行时 AI 组卷。
- `paper_question_replacements`、`papers.replacement_count` 与 `exam_cooldowns` 已通过删表迁移和运行时收口删除；Step 04 后续只允许保留模板级软排除语义，不得重新引入题目替换表、冷却表或对应运行时 API。
- “近期做过预制卷软排除”只允许作用在选模板阶段，不能重新演化成题目级替换逻辑。

---

## 验证清单

### 当前最小运行时 slice 已验证

- [x] `GET /api/v1/exams/catalog` 返回正确的 exam_type / difficulty 目录
- [x] `GET /api/v1/exams/active-draft` 返回当前活动 draft
- [x] `/exams/new` 前端入口读取运行时目录并能创建/复用 draft（2026-04-28：新增 `ExamNew.tsx`、`client/src/lib/exam-new.ts` 与相关 client 测试；视觉验收覆盖桌面/移动无溢出和确认 Dialog）
- [x] `POST /api/v1/exams` 拒绝在线拼题 / 换题 payload
- [x] 自练按指定难度成功从已发布预制卷克隆 draft
- [x] 重复创建自练试卷返回同一 draft
- [x] 无可用预制卷时返回 `ROUND1_PREBUILT_PAPER_UNAVAILABLE`
- [x] `POST /api/v1/exams/:id/attempts` 成功创建 started attempt 并返回 `tabNonce`
- [x] 任务模式 startAttempt 推进 `assignment_progress.pending → in_progress`
- [x] `GET /api/v1/exams/:id/session` 返回 started attempt、题面 slots 与当前 `answersJson`
- [x] autosave 通过 `patches[] + jsonb_set()` 增量写入 `answersJson`
- [x] autosave + `X-Tab-Nonce` 冲突返回 `409`
- [x] submit 基础状态切换成功（attempt → `submitted`，paper → `completed`）
- [x] 重复提交已 finalized attempt 返回已有结果
- [x] submit 回写基础客观题 `score` / `perPrimaryKpJson` / `perSectionJson`
- [x] 超时 submit 落 `auto_submitted`
- [x] `GET /api/v1/attempts/active` 返回当前 started attempt、剩余时间与恢复路径
- [x] startAttempt 调度 delayed auto-submit job
- [x] grouped grader 覆盖阅读/完善程序子题级累计
- [x] submit 回写 wrongs 报告与解析聚合
- [x] `GET /api/v1/exams/:id/result` 返回稳定结果页 payload
- [x] `GET /api/v1/users/me/attempts` 返回分页历史
- [x] `GET /api/v1/users/me/stats` 返回最小聚合统计

### 目标态待验证

- [x] session 过期后重新登录继续答题（通过 `GET /attempts/active` + App 启动恢复链路支持）
- [x] 浏览器打印输出排版正确（`print.css` 已全局导入，试卷页/结果页题卡已按 print block 标记，生产构建通过）
- [x] Dashboard 成绩曲线与答题历史展示正常（真实 Dashboard 已接入 users/me 历史与统计，生产构建通过）
- [x] autosave beforeunload 最终保存（fetch keepalive）正常触发（客户端单测覆盖 keepalive + nonce + CSRF header）
- [x] cron 兜底 auto-submit 补漏（`examRuntimeMaintenance` 每 5 分钟扫描 started attempts）
