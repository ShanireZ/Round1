# Step 05 — 教练后台 + 管理后台内容库（Phase 12 ~ 13）

> **前置依赖**：Step 01–04（DB、认证、题库、预制卷考试流程均已就绪）
> **交付物**：教练完整班级管理流程、管理员题库/预制卷库/导入中心、真题审核与系统设置
> **可验证 demo**：教练创建班级→生成班级码/邀请链接→学生入班→布置固定预制卷任务→查看热力图；管理员导入并发布题目与预制卷
> **当前对齐说明（2026-04-28）**：当前运行时已经落地 Admin 内容库闭环的主要页面与接口。后端已挂载 `/api/v1/admin/questions`、`/api/v1/admin/questions/:id/references`、`/api/v1/admin/prebuilt-papers`、`/api/v1/admin/prebuilt-papers/:id/references`、`/api/v1/admin/import-batches`、`/api/v1/admin/question-reviews`、`/api/v1/admin/users`、`/api/v1/admin/settings` 及 publish/archive/copy-version/dry-run/apply 路由；前端 router 已接入 `/admin`、`/admin/questions`、`/admin/papers`、`/admin/imports`、`/admin/review`、`/admin/users`、`/admin/settings`，旧 `/admin/jobs`、`/admin/manual-gen` 已删除并进入 404 fallback；Admin 设置已通过 Redis `config:change` 通知 API/runtime worker/content worker 刷新运行时配置。教练后端 slice 已挂载 `/api/v1/classes/join`、`/api/v1/coach/**` 与 Admin 班级教练组管理接口，覆盖班级 CRUD、班级码、邀请链接、成员、owner/collaborator、多教练 owner 转让、固定预制卷 assignment 创建、assignment-only 报表聚合、群体热力图、题型统计、学生趋势与详情下钻所需 payload；前端 `/coach/report` 已接入班级报告页面。Coach 班级/任务列表页面与报表规模化性能验收仍属于后续目标契约。

---

> **Maintenance addendum (2026-04-28)**: `/coach/classes/:id` now routes to `client/src/pages/coach/CoachClassDetail.tsx` and consumes the existing class summary, members, invites, and coaches APIs. The page supports owner-only class rename, member removal, invite creation/revocation, collaborator add/remove, and owner transfer. Remaining follow-up is full browser visual acceptance for the coach route family and richer user search for adding coaches.

> **维护追加（2026-04-28）**：`/coach/classes` 与 `/coach/assignments` 已从占位路由切换为真实 Coach 工作台页面。当前已支持班级列表、创建班级、复制/轮换班级码、归档班级、按班级查看/创建/关闭固定预制卷 assignment，并新增 `GET /api/v1/coach/prebuilt-papers` 作为 coach/admin 可用的已发布预制卷选择器。`CoachClassDetail` 的成员、邀请链、教练组深层管理与更完整浏览器视觉验收仍按 12.6 后续推进。

## Phase 12 — 教练后台

### 12.1 班级管理

- `server/routes/coach.ts` / `server/services/classService.ts`
- CRUD：创建班级、编辑班级信息、归档班级
- **多教练模型**：通过 `class_coaches` M2M 表管理，每个班级至少一位 `role='owner'` 的教练
  - 创建班级时自动将创建者设为 owner
  - Owner 可添加/移除其他教练（collaborator）
  - Owner 可转让 owner 角色给另一位教练（事务中同时切换）
  - Admin 可修改任意班级的教练组
- 学生可加入多个班级
- 归档班级拒绝新入班请求

**教练权限矩阵**：

| 操作            | owner | collaborator |
| --------------- | ----- | ------------ |
| 查看班级数据    | ✓     | ✓            |
| 布置任务        | ✓     | ✓            |
| 查看热力图/报表 | ✓     | ✓            |
| 轮换班级码      | ✓     | ✗            |
| 管理邀请链接    | ✓     | ✗            |
| 添加/移除教练   | ✓     | ✗            |
| 转让 owner      | ✓     | ✗            |
| 归档班级        | ✓     | ✗            |

### 12.2 班级码与邀请链接

**班级码**：

- 6 位大写字母 + 数字，每个班级同一时间仅一个有效码
- 教练可随时轮换（旧码立即失效）
- 学生通过 `POST /api/v1/classes/join` 提交班级码入班
- 入班接口限流 + 错误次数节流

**邀请链接**：

- `server/services/classInviteService.ts`
- 高熵 token（`crypto.randomBytes(32).toString('base64url')`）
- 可设置：过期时间、最大使用次数
- 可撤销：教练主动作废
- 加入前二次确认页面

**入班并发规则**：

- 归档班级拒绝加入
- 邀请链接原子扣减（`UPDATE class_invites SET use_count = use_count + 1 WHERE use_count < max_uses AND revoked_at IS NULL AND expires_at > now()` + 检查班级未归档）
- 重复加入幂等成功（已在班成员再次提交不报错）

### 12.3 学生入班前端

- `JoinClassPage.tsx` — 班级码输入 + 邀请链接落地确认页
- 路由：`/join?code=xxx` 或 `/join?invite=token`

### 12.4 Assignment（固定预制卷任务）

- `server/services/assignmentService.ts`
- 教练为班级布置任务：选择一张已发布 `prebuilt_paper` + 截止时间
- 单任务单次作答：同一 assignment 同一学生只能提交一次 attempt

> **`MIN_ASSIGNMENT_START_MINUTES`**（默认 1）：任务截止时间至少为当前时间 + 此值，防止教练创建即刻截止的任务。

**Assignment 状态机**：

> 状态枚举与完整状态转换表见 [reference-schema.md#状态枚举附录](reference-schema.md#状态枚举附录)。

补充规则（本文件特有）：

- 任务绑定一张明确的 `prebuilt_paper_id`，保证同任务下学生面向同一份内容
- 单任务单次作答：同一 assignment 同一学生只能提交一次 attempt
- 自动提交调度规则：`submitAt = min(started_at + duration, assignment.due_at)`
- BullMQ delayed job 负责截止自动提交，cron 兜底每 5 分钟扫描过期未提交的 assignment attempts

### 12.5 教练报表

- `server/routes/report.ts` — 仅返回当前班级内的 assignment attempts
- **报表数据范围**：仅包含班级任务（assignment）的 attempt 数据，不包含学生自练数据

> **统计排除**：coach 和 admin 角色以学生身份体验答题时，其 attempt 数据不纳入班级统计报表。

- 群体热力图：`KpHeatmap` 组件 — 按知识点 × 学生矩阵展示正确率
- 题型统计：`QuestionTypeStats` 组件 — 按题型维度聚合得分
- 学生详情：`StudentProfile` 组件 — 单学生成绩趋势 + 弱项知识点

### 12.6 教练前端页面

- `CoachClasses.tsx` — 班级列表 + 创建/编辑/归档
- `CoachClassDetail.tsx` — 班级详情（成员列表、班级码轮换、邀请链接管理）
- `CoachAssignments.tsx` — 任务列表 + 创建任务
- `CoachReport.tsx` — 热力图 + 题型统计 + 学生详情

---

## Phase 13 — Admin 内容库与导入中心

### 13.1 Admin 看板

- `server/routes/admin.ts`
- 内容总览：按 exam_type / question_type / difficulty 查看题库与预制卷规模
- 导入中心：question bundle / prebuilt paper bundle 的 dry-run、apply、错误摘要
- 审核中心：真题 AI review 队列
- 权限管理：管理员修改用户角色（需 step-up 复核）

> Admin 看板不再承担 Worker 队列、手动出题、库存补货监控。旧 `/admin/jobs`、`/admin/manual-gen`、库存面板已经从前后端收口；旧 API 保持 404，旧前端路径进入 404 fallback。

### 13.2 题库管理

- `GET /api/v1/admin/questions` — 题库列表（筛选/分页）
- `POST /api/v1/admin/questions` — 新建题目
- `GET/PATCH /api/v1/admin/questions/:id` — 详情 / 编辑
- `GET /api/v1/admin/questions/:id/references` — 查看题目被哪些预制卷 / 试卷实例引用
- `DELETE /api/v1/admin/questions/:id` — 删除未引用 draft
- `POST /api/v1/admin/questions/:id/publish` — 发布
- `POST /api/v1/admin/questions/:id/archive` — 归档

**管理规则**：

- `draft` 可编辑、可删除
- `published` 可归档，不允许直接硬删
- `archived` 保留历史引用，可重新发布或继续归档
- 引用查看必须展示 `prebuilt_papers`、`papers`、`assignments` 的引用摘要，帮助管理员决定归档而非误删

### 13.3 预制卷库管理

- `GET /api/v1/admin/prebuilt-papers` — 预制卷列表
- `POST /api/v1/admin/prebuilt-papers` — 新建预制卷
- `GET/PATCH /api/v1/admin/prebuilt-papers/:id` — 详情 / 编辑
- `GET /api/v1/admin/prebuilt-papers/:id/references` — 查看预制卷被哪些任务 / 试卷实例引用
- `POST /api/v1/admin/prebuilt-papers/:id/copy-version` — 复制已存在版本为新的 draft 版本
- `DELETE /api/v1/admin/prebuilt-papers/:id` — 删除未引用 draft
- `POST /api/v1/admin/prebuilt-papers/:id/publish` — 发布
- `POST /api/v1/admin/prebuilt-papers/:id/archive` — 归档

**管理规则**：

- 预制卷必须引用已存在且允许用于该 exam_type 的题目
- 发布前必须通过题量、分值、知识点配额校验
- 已被 assignment 或 paper instance 使用的预制卷只能 archive，不能硬删
- 已发布版本不可原地覆盖；修改发布版本必须复制为新的 draft 版本，再走发布流程
- `blueprint_version` 只表示蓝图版本，不等同于预制卷内容版本。Step 05 收口时必须补显式内容版本 lineage 方案与约束

### 13.4 导入中心

- `GET /api/v1/admin/import-batches` — 导入批次列表
- `POST /api/v1/admin/import-batches/questions/dry-run` — 题目 bundle 试导入
- `POST /api/v1/admin/import-batches/questions/apply` — 题目 bundle 正式导入
- `POST /api/v1/admin/import-batches/prebuilt-papers/dry-run` — 预制卷 bundle 试导入
- `POST /api/v1/admin/import-batches/prebuilt-papers/apply` — 预制卷 bundle 正式导入

**导入规则**：

- 请求体直接使用 raw bundle JSON：题目导入对齐 `QuestionBundleSchema`，预制卷导入对齐 `PrebuiltPaperBundleSchema`；不再额外包一层 `sourceFilename` / `checksum` / `items` 的 admin wrapper DTO
- 服务端统一计算 `checksum` 与 admin 侧 `sourceFilename`，并复用 scripts/lib workflow 做 dry-run / apply
- dry-run 与 apply 返回统一 `ImportSummary` 语义：对合法 batch，dry-run 也返回 `importedCount = accepted item count`、`rejectedCount = 0`，避免 admin/API/CLI 三套摘要口径漂移
- dry-run 不落业务表，只写校验摘要
- apply 成功后写入业务表并记录 `import_batches`
- 失败时保留逐项错误信息，供管理员修复后重新导入

### 13.5 Admin 设置

- `app_settings` 表（key-value）
- 可调参数：`exam.autosaveIntervalSeconds`、`exam.autosaveRateLimitSeconds`、`exam.draftTtlMinutes`、`paper.selection.recentExcludeAttempts`、`import.maxBundleSizeMb`
- 设置变更写入 `admin_audit_logs`
- **热更新范围**：变更后通过 Redis `PUBLISH config:change` 通知所有 API/作业进程重新加载，无需重启

### 13.6 真题 AI 辅助审核 UI

- Phase 7 导入真题时产生的 AI 审核状态（`pending → ai_reviewed → confirmed / rejected`）
- Admin UI 展示待审核题目列表、AI 建议、人工确认/拒绝按钮

### 13.7 Admin 前端页面

- `AdminDashboard.tsx` — 概览看板（当前已接入 router）
- `AdminQuestionLibrary.tsx` — 题库浏览与筛选（当前已接入 router）
- `AdminPaperLibrary.tsx` — 预制卷库浏览与筛选（当前已接入 router）
- `AdminImports.tsx` — 导入中心（当前已接入 router）
- `AdminSettings.tsx` — 系统设置（当前已接入 router，支持默认值合并展示与 app_settings 写入）
- `AdminUsers.tsx` — 用户与角色管理（当前已接入 router，支持列表、角色调整、禁用/恢复）
- `AdminReview.tsx` — 真题 AI 审核 UI（当前已接入 router，支持差异展示、人工确认/拒绝与备注）

### 13.8 旧设计移除清单

- 删除 Admin 侧 Worker 队列、手动出题、库存补货页面与 API；这些入口不属于“线上导入发布”模型
- 保留 question_reviews 审核链、cpp-runner 校验链、import_batches 审计链
- 所有“删除”操作都以“仅允许未引用 draft 硬删、其余只能 archive”为统一语义，避免回到旧的删库式后台

---

## 教练/Admin 分权

| 资源         | Coach                                  | Admin                |
| ------------ | -------------------------------------- | -------------------- |
| 班级         | 仅自己参与的班级（owner/collaborator） | 所有班级             |
| 学生数据     | 仅当前班级内 assignment attempts       | 所有用户             |
| 题库         | 不可见                                 | 完全可见             |
| 预制卷库     | 不可见                                 | 完全可见             |
| 导入中心     | 不可见                                 | 完全可见             |
| 用户角色管理 | 不可操作                               | 可操作（需 step-up） |
| 系统设置     | 不可见                                 | 可操作（需 step-up） |

---

## 验证清单

- [x] 教练创建班级 + 生成班级码 + 轮换码（2026-04-28：`server/routes/coach.ts` + `server/services/classService.ts` 已挂载 create/edit/archive/rotate-code，创建者自动成为 owner。）
- [x] 邀请链接签发 / 加入 / 撤销 / 过期（2026-04-28：邀请 token 只返回明文一次，服务端存 SHA-256 hash；join 时检查撤销、过期、最大次数。）
- [x] 学生通过班级码入班（2026-04-28：`POST /api/v1/classes/join` 支持 `code`。）
- [x] 学生通过邀请链接入班（2026-04-28：`POST /api/v1/classes/join` 支持 `inviteToken`。）
- [x] 已在班成员重复入班幂等成功（2026-04-28：重复提交返回当前 membership，不重复插入。）
- [x] 归档班级拒绝加入（2026-04-28：新入班请求在服务端拒绝，已在班成员重复提交仍幂等成功。）
- [x] 教练布置固定预制卷任务 + 学生单次作答（2026-04-28：`POST /api/v1/coach/assignments` 只接受 published prebuilt paper；`POST /api/v1/exams` 的 assignment 分支使用 assignment 绑定的 `prebuilt_paper_id`，并复用 `assignment_progress` 防止同一学生重复创建任务试卷。）
- [x] 截止时间自动提交（2026-04-28：沿用 Phase 11 已落地的 `min(started_at + duration, assignment.due_at)` delayed job + 维护循环。）
- [x] 热力图展示正确（knowledge_point × student 矩阵，加载时间 < 3s）（2026-04-28：后端 payload 与前端热力图已落地；维护追加已用 Playwright 拦截 API 注入 180 名学生 × 24 个知识点规模化数据，桌面 643ms、移动 2418ms 渲染到第一页热力图，均低于 3s。）
- [x] 学生详情展示正确（2026-04-28：`/coach/report` 已接入右侧 Sheet 下钻、趋势、知识点和题型统计；维护追加已在同一规模化浏览器验收中打开学生详情 Sheet，console warning/error、pageerror 与失败请求均为 0。）
- [x] Coach 只能看到自己班级的数据（2026-04-28：Coach 路由统一按 `class_coaches` 关系授权；Admin 全局教练组管理走 `/api/v1/admin/classes/:id/coaches/**` 独立入口。）
- [x] Admin 题库 CRUD 流程完整
- [x] Admin 预制卷库 CRUD 流程完整
- [x] Admin 导入中心 dry-run/apply 流程完整
- [x] Admin step-up 在设置变更时生效
- [x] `config:change` 热更新通知所有进程刷新配置

## 2026-04-28 Student Class UI Addendum

- `/account/class` and `/join` are no longer router placeholders. `client/src/pages/account/AccountClassPage.tsx` now reads `GET /api/v1/classes/mine`, submits class code or invite token joins through `POST /api/v1/classes/join`, and supports `/join?code=xxx`, `/join?invite=token`, and `/join?inviteToken=token`.
- `server/services/classService.ts` now exposes `listStudentClasses()` to return joined class summaries with open/completed/missed assignment counters for the current student account.
- Coach deep management backlog is unchanged: `CoachClassDetail` member/invite/coach-group management and full browser visual acceptance remain separate follow-up work.
