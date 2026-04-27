# Reference — 数据库 Schema 与数据模型

> 本文件从 [01-reference.md](01-reference.md) 拆分而来。完整参考索引见 [01-reference.md](01-reference.md)。

---

## 数据库 Schema（postgreSQL 18，数据库 `round1`）

Schema 采用版本化迁移（`server/db/migrations/` + `scripts/migrate.ts` + `schema_migrations` 表）。Session 不落 Postgres，由 Redis 通过 `connect-redis` 存储。`__Host-Round1.sid` 为代码常量（非可配置项），不暴露到 .env。

> **对齐说明（2026-04-25）**：`generation_jobs`、`manual_generation_jobs`、`question_bucket_stats`、`bucket_slot_counters`、`paper_question_replacements`、`exam_cooldowns` 与 `papers.replacement_count` 均已删除；原手工导入批次语义并入 `import_batches`。当前 remaining compatibility-first 面主要剩业务语义层的旧约束，不再包含这些 schema/runtime 结构。

> **当前对齐说明（2026-04-26）**：Phase 11 当前已挂载的运行时会在 `startAttempt` 时调度 BullMQ delayed auto-submit job 并回写 `attempts.auto_submit_job_id`；submit / auto-submit finalizer 会写入 `attempts.score`、`attempts.per_section_json`、`attempts.per_primary_kp_json`、`attempts.ai_report_json`、`attempts.report_status`。若请求到达时已超过 `min(started_at + blueprint.duration_minutes, assignment.due_at)`，则将 `attempts.status` 写为 `auto_submitted`。API 与 runtime worker 现在均会启动 5 分钟一次的运行时维护循环，用于补漏超时 auto-submit 与过期 draft 回收。

**连接池**：`pg.Pool` — API 进程 `max=10`、作业进程 `max=5`（PM2 cluster 默认 2 API = 20 连接；runtime/content worker 均为显式开关，启用后按 worker 数量追加）、`idleTimeoutMillis=30000`、`statement_timeout=30s`、API 进程 `application_name=round1-api`、运行时 worker `application_name=round1-worker`、离线内容 worker `application_name=round1-content-worker`。通过 `.env` 中 `DATABASE_POOL_MAX_API` 和 `DATABASE_POOL_MAX_WORKER` 分别配置。

> **Redis 客户端分工**：`connect-redis`（session store）和 `rate-limit-redis` 使用 `node-redis` 客户端；BullMQ delayed jobs 使用 `ioredis` 客户端。两个客户端连接同一 Redis 实例。

### 表定义

| 表                     | 关键列                                                                                                                                                                                                                                             | 用途                                                                                                                                                                     |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `users`                | `id`(PK)、`username`(唯一)、`display_name`、`password_hash`、`password_change_required`、`role`(student/coach/admin)、`session_version`、`status`(active/locked/deleted)、`deleted_at`(可空)、`last_strong_auth_at`、`totp_secret_enc`(可空)、`totp_enabled_at`(可空)          | 用户主表；TOTP 使用 AES-256-GCM + 信封加密（DEK+KEK）：随机 12 字节 IV，存储格式 `IV:encryptedDEK:ciphertext:authTag`；软删除通过 `status='deleted'` + `deleted_at` 实现 |
| `user_emails`          | `id`(PK)、`user_id`(唯一)、`email`(唯一)、`verified_at`、`source`                                                                                                                                                                                  | 用户唯一邮箱真源                                                                                                                                                         |
| `external_identities`  | `id`(PK)、`user_id`、`provider`、`provider_type`、`provider_user_id`、`provider_email`                                                                                                                                                             | 第三方身份绑定（QQ互联 / CppLearn OIDC）                                                                                                                                 |
| `passkey_credentials`  | `id`(PK)、`user_id`、`credential_id`(唯一)、`public_key`、`counter`、`transports_json`、`backup_eligible`、`backup_state`                                                                                                                          | Passkey(WebAuthn) 凭据                                                                                                                                                   |
| `auth_challenges`      | `id`(PK)、`flow`、`email`、`code_hash`、`link_token_hash`、`expires_at`、`attempt_count`                                                                                                                                                           | 邮件 challenge（验证码+链接共用一条）                                                                                                                                    |
| `auth_tickets`         | `id`(PK)、`challenge_id`、`flow`、`ticket_hash`、`payload_json`、`expires_at`、`consumed_at`                                                                                                                                                       | 第二步表单 ticket                                                                                                                                                        |
| `auth_audit_logs`      | `id`(PK)、`user_id`、`action`、`identifier_hash`、`provider`、`ip`、`device_id_hash`、`risk_score`、`result`                                                                                                                                       | 注册/登录/重置操作审计                                                                                                                                                   |
| `admin_audit_logs`     | `id`(PK)、`actor_user_id`、`action`、`target_type`、`target_id`、`before_json`、`after_json`、`reauth_method`                                                                                                                                      | 管理员敏感操作审计                                                                                                                                                       |
| `knowledge_points`     | `id`(PK 自增)、`code`(唯一)、`name`、`category`、`parent_id`、`blueprint_weight`                                                                                                                                                                   | 知识点树                                                                                                                                                                 |
| `questions`            | `id`(PK)、`type`、`difficulty`、`primary_kp_id`、`content_json`、`answer_json`、`explanation_json`、`content_hash`、`status`(draft/reviewed/published/archived)、`sandbox_verified`、`source`                                                      | 核心题库；不再自动退役，由管理员发布和归档                                                                                                                               |
| `question_reviews`     | `id`(PK)、`question_id`(FK)、`review_status`(pending/ai_reviewed/confirmed/rejected)、`ai_confidence`(可空)、`official_answer_diff`(可空 JSON)、`reviewer_notes`(可空)、`reviewed_by`(可空 FK→users)、`reviewed_at`(可空)                          | 真题 AI 审核流程记录；与 `questions.status` 分离                                                                                                                         |
| `question_exam_types`  | `(question_id, exam_type)` 联合 PK                                                                                                                                                                                                                 | 题目↔试卷类型多对多                                                                                                                                                      |
| `question_kp_tags`     | `(question_id, kp_id)` 联合 PK、`tag_role`                                                                                                                                                                                                         | 题目↔知识点标签（1 主 + 0~3 辅）                                                                                                                                         |
| `prebuilt_papers`      | `id`(PK)、`title`、`exam_type`、`difficulty`、`blueprint_version`、`status`(draft/published/archived)、`source_batch_id`(可空)、`metadata_json`、`published_at`(可空)、`archived_at`(可空)                                                         | 预制卷库                                                                                                                                                                 |
| `prebuilt_paper_slots` | `(prebuilt_paper_id, slot_no)` 联合 PK、`question_id`、`question_type`、`primary_kp_id`、`difficulty`、`points`                                                                                                                                    | 预制卷题目槽位                                                                                                                                                           |
| `papers`               | `id`(PK)、`user_id`、`assignment_id`(可空)、`prebuilt_paper_id`、`exam_type`、`difficulty`、`status`、`created_from`(self_practice/assignment)                                                                                                     | 复制到用户名下的试卷实例                                                                                                                                                 |
| `paper_question_slots` | `(paper_id, slot_no)` 联合 PK、`question_id`、`question_type`、`primary_kp_id`、`difficulty`、`points`                                                                                                                                             | 用户试卷实例题目快照                                                                                                                                                     |
| `attempts`             | `id`(PK)、`paper_id`、`user_id`、`started_at`、`submitted_at`、`answers_json`、`score`、`per_section_json`、`per_primary_kp_json`、`tab_nonce`、`status`、`auto_submit_job_id`、`ai_report_json`、`report_status`、`report_error`、`report_job_id` | 答题记录；当前运行时已回写 grouped grader 聚合、wrongs 报告与 delayed auto-submit job id                                                                                 |
| `classes`              | `id`(PK)、`name`、`join_code`(唯一)、`archived_at`、`created_by`                                                                                                                                                                                   | 班级（可轮换班级码）；V1 支持多教练                                                                                                                                      |
| `class_coaches`        | `(class_id, user_id)` 联合 PK、`role`(owner/collaborator)、`added_at`                                                                                                                                                                              | 班级↔教练多对多；至少一位 owner                                                                                                                                          |
| `class_invites`        | `id`(PK)、`class_id`、`token_hash`(唯一)、`expires_at`、`max_uses`、`use_count`、`revoked_at`                                                                                                                                                      | 班级邀请链接                                                                                                                                                             |
| `class_members`        | `(class_id, user_id)` 联合 PK、`joined_via`、`joined_at`                                                                                                                                                                                           | 班级成员                                                                                                                                                                 |
| `assignments`          | `id`(PK)、`class_id`、`created_by`、`title`、`prebuilt_paper_id`、`due_at`、`status`(assigned/closed)、`created_at`、`updated_at`                                                                                                                  | 班级任务，固定绑定一张预制卷                                                                                                                                             |
| `assignment_progress`  | `(assignment_id, user_id)` 联合 PK、`paper_id`、`attempt_id`、`status`                                                                                                                                                                             | 任务进度                                                                                                                                                                 |
| `import_batches`       | `id`(PK)、`bundle_type`(question_bundle/prebuilt_paper_bundle/manual_question_import)、`source_filename`、`checksum`、`status`(dry_run/processing/applied/partial_failed/failed)、`summary_json`、`imported_by`、`created_at`                      | 导入批次审计；同时承接手工题导入批次                                                                                                                                     |
| `llm_provider_logs`    | `id`(PK)、`provider`、`model`、`task`、`tokens_in/out`、`cost_estimate`、`latency_ms`                                                                                                                                                              | 离线内容生产的费用与性能台账                                                                                                                                             |
| `blueprints`           | `exam_type`(PK)、`version`(PK)、`spec_json`                                                                                                                                                                                                        | 蓝图历史；联合主键 `(exam_type, version)`                                                                                                                                |
| `app_settings`         | `key`(PK)、`value_json`、`updated_by`                                                                                                                                                                                                              | 运行时可调配置（热更新 via Redis pub/sub）                                                                                                                               |
| `schema_migrations`    | `id`(PK)、`name`(唯一)、`applied_at`                                                                                                                                                                                                               | 迁移框架自动创建与管理，记录已应用的迁移                                                                                                                                 |

### 关键索引

- `(username)` on `users`
- `(email)` on `user_emails`
- `(user_id)` on `user_emails`
- `(provider, provider_user_id)` on `external_identities`
- `(credential_id)` on `passkey_credentials`
- `(email, flow, created_at)` on `auth_challenges`
- `(link_token_hash)` on `auth_challenges`
- `(ticket_hash)` on `auth_tickets`
- `(user_id, created_at)` on `auth_audit_logs`
- `(actor_user_id, created_at)` / `(action, created_at)` on `admin_audit_logs`
- `(status, type, primary_kp_id, difficulty)` on `questions`
- `(question_id, exam_type)` on `question_exam_types`
- `(status, exam_type, difficulty)` on `prebuilt_papers`
- `(prebuilt_paper_id, slot_no)` on `prebuilt_paper_slots`
- `(paper_id, slot_no)` on `paper_question_slots`
- `(assignment_id)` on `papers`
- `(join_code)` on `classes`
- `(class_id)` / `(user_id)` on `class_coaches`
- `(token_hash)` on `class_invites`
- `(bundle_type, created_at)` on `import_batches`
- `(provider, task, created_at)` on `llm_provider_logs`

### 用户角色与账号模型

- **单账号单角色**：`student`（默认）、`coach`、`admin`
- **统一账号**：邮箱、密码、第三方身份、Passkey 都绑定同一 `user_id`
- **密码强制**：所有可登录账号必须持有 `password_hash`
- **首次改密强制**：`password_change_required=true` 的用户仅允许访问改密与登出流程；成功改密或密码重置后必须清为 `false` 并递增 `session_version`
- **session_version**：密码重置/强制下线后递增，会话恢复时必须匹配
- **邮箱唯一**：每账号同时只能绑定 1 个邮箱，不支持解绑为空

> **软删除策略**：软删除用户的邮箱和用户名保持唯一约束，不允许新账号复用已删除账号的邮箱或用户名。

> **student+ 含义说明**：标记为 `student+` 的路由允许 student / coach / admin 三种角色访问。这意味着 coach 和 admin 也可以参加考试、加入班级、拥有答题历史，便于测试和体验学生流程。

> **统计排除规则**：所有学生维度的统计报表（成绩曲线、热力图、班级统计等）在聚合查询时统一过滤 `WHERE role = 'student'`，排除 coach/admin 的答题数据。

> **第三方身份同邮箱策略**：第三方登录返回的邮箱与系统中已有用户邮箱相同但 external identity 未绑定时，不自动合并账号。用户需通过邮箱 challenge 验证后手动发起绑定。

### 试卷类型枚举

`CSP-J`、`CSP-S`、`GESP-1` ~ `GESP-8`。枚举校验双层：路由层 Zod `z.enum()` + 数据库层 `CHECK` 约束。

---

## 核心 JSON 字段定义

### content_json / answer_json / explanation_json（题目）

```ts
// 单选题
interface SingleChoiceContent { stem: string; options: { A: string; B: string; C: string; D: string }; }
interface SingleChoiceAnswer { answer: string; }
interface SingleChoiceExplanation { perOption: { A: string; B: string; C: string; D: string }; }

// 阅读程序
interface ReadingProgramContent { description: string; code: string; subQuestions: { no: number; stem: string; options: { A: string; B: string; C: string; D: string } }[]; }
interface ReadingProgramAnswer { answers: { [subNo: string]: string }; }
interface ReadingProgramExplanation { overallAnalysis: string; perSubQuestion: { [subNo: string]: string }; }

// 完善程序
interface CompletionProgramContent { description: string; code: string; blanks: { no: number; hint?: string }[]; subQuestions: { no: number; stem: string; options: { A: string; B: string; C: string; D: string } }[]; }
type CompletionProgramAnswer = ReadingProgramAnswer;
type CompletionProgramExplanation = ReadingProgramExplanation;
```

### answers_json（attempts 表）

```ts
interface AnswersJson {
  [slotNo: string]: {
    subAnswers: { [subNo: string]: string };  // 单选题 subNo='0'，阅读/完善程序 subNo='1','2',...
    updatedAt: string;
  };
}
```

### per_primary_kp_json / per_section_json（attempts 表）

```ts
interface PerPrimaryKpJson { [kpId: string]: { total: number; correct: number; accuracy: number; }; }
interface PerSectionJson { [questionType: string]: { total: number; correct: number; score: number; maxScore: number; }; }
```

> **当前对齐说明（2026-04-26）**：对于 `reading_program` / `completion_program`，当前 grouped grader 以子题为统计粒度累加 `total` / `correct`，并在 schema 缺少显式子题分值字段的前提下，将 slot `points` 按“均分 + 余数前置”拆到各子题。

### ai_report_json（attempts 表）

```ts
interface AttemptReportJson {
  wrongs: Array<{
    slotNo: number;
    questionType: string;
    subQuestionKey: string;
    submittedAnswer: string | null;
    correctAnswer: string;
    points: number;
    explanation: string | null;
  }>;
}
```

> **当前对齐说明（2026-04-26）**：当前 submit / auto-submit finalizer 已将客观题 wrongs 列表写入 `attempts.ai_report_json`，并同步把 `attempts.report_status` 标记为 `completed`。这里的 report 目前承载的是规则型 grader 报告，不是 LLM 诊断报告。

### metadata_json / summary_json

```ts
interface PrebuiltPaperMetadataJson {
  title?: string;
  overlapScore?: number;
  generator?: 'offline-script' | 'manual';
  notes?: string;
}

interface ImportBatchSummaryJson {
  totalItems: number;
  acceptedItems: number;
  rejectedItems: number;
  warnings: string[];
}
```

### app_settings 首发 key 清单

| key                                     | 类型     | 默认值 | 说明                          |
| --------------------------------------- | -------- | ------ | ----------------------------- |
| `exam.autosaveIntervalSeconds`          | `number` | `180`  | 前端 autosave 基础轮询间隔    |
| `exam.autosaveRateLimitSeconds`         | `number` | `30`   | 服务端按用户限制 autosave 间隔 |
| `exam.draftTtlMinutes`                  | `number` | `1440` | 草稿卷过期分钟                |
| `paper.selection.recentExcludeAttempts` | `number` | `3`    | 选卷时参考的近期 attempt 窗口 |
| `import.maxBundleSizeMb`                | `number` | `8`    | 单次导入 bundle 大小上限      |

### app_settings 热更新机制

- Admin 修改 `app_settings` → 写入 DB + `redis.publish('config:change', key)`
- 各 API 进程和作业进程 `redis.subscribe('config:change')` → 收到通知后刷新进程内存缓存
- PM2 cluster 模式下 2 个 API 实例 + 1 个作业实例均需订阅
- BullMQ queue 的延迟作业参数变更无需重启；若未来存在队列并发参数，仍以重启生效为准
- 启动时从 DB 拉取全量配置作为初始值

### content_hash 规范化规则

1. JSON key 字典序递归排序
2. 字符串值：连续空白压缩为单空格，首尾 trim
3. 代码块（`code` key）：保留缩进但 trim 首尾空行
4. 移除元数据 key（`id`、`created_at`）
5. `JSON.stringify()` 后取 `sha256`

### tab_nonce 规范

- 格式：`crypto.randomUUID()`
- 生成：`startAttempt` 事务中写入
- 前端：`sessionStorage` 持久化
- 携带：`X-Tab-Nonce` 请求头
- 恢复：`GET /api/v1/attempts/active` 返回

### questions.status 枚举

| 状态        | 含义                                     |
| ----------- | ---------------------------------------- |
| `draft`     | 刚导入或刚创建，尚未发布                 |
| `reviewed`  | 已通过离线校验或审核确认，等待发布       |
| `published` | 已发布，可被预制卷引用并进入新考试实例   |
| `archived`  | 已下线，不再进入新的预制卷与新的考试实例 |

> 题目不再自动退役。删除只允许发生在未被任何预制卷或试卷实例引用的 draft 题目上。

> 题目主生命周期已经收敛到 `draft / reviewed / published / archived`。审核拒收原因沉淀在 `question_reviews.review_status='rejected'` 与 import summary，而不是 `questions.status`。

### prebuilt_papers.status 枚举

| 状态        | 含义                                 |
| ----------- | ------------------------------------ |
| `draft`     | 已导入或创建，但尚未开放给运行时使用 |
| `published` | 可被自练选卷或教练任务引用           |
| `archived`  | 已下线，不再进入新的考试实例分配     |

> `blueprint_version` 仅表示蓝图版本，不等同于预制卷内容版本。已发布预制卷必须视为不可变；复制新版本、版本 lineage 与引用保护的显式约束在 Step 05 收口时补齐。

### import_batches.status 枚举

| 状态      | 含义                                     |
| --------- | ---------------------------------------- |
| `dry_run` | 试导入，只做校验和摘要统计，不落业务数据 |
| `applied` | 正式导入成功                             |
| `failed`  | 导入失败，保留错误报告                   |

### 状态枚举附录

#### papers.status

| 状态        | 含义                               |
| ----------- | ---------------------------------- |
| `draft`     | 草稿，已从预制卷复制但尚未开始答题 |
| `active`    | 已开始答题（startAttempt 后）      |
| `completed` | 已提交答卷                         |
| `abandoned` | 超过 draft TTL 未开始，或用户放弃  |

#### attempts.status

| 状态             | 含义                       |
| ---------------- | -------------------------- |
| `started`        | 正在答题                   |
| `submitted`      | 学生手动提交               |
| `auto_submitted` | 服务端认定已超时后完成提交 |
| `abandoned`      | 过期未提交，系统回收       |

> **当前对齐说明（2026-04-26）**：当前运行时已经会在 submit / auto-submit 路径上产出 `submitted` / `auto_submitted` 两个 finalized 状态，并同步写入 `score`、`per_section_json`、`per_primary_kp_json`、`ai_report_json`、`report_status`。过期 draft paper 会由运行时维护循环标记为 `abandoned`；`attempts.abandoned` 仍保留为未来放弃/回收扩展。

#### assignments.status

| 状态       | 含义                 |
| ---------- | -------------------- |
| `assigned` | 已布置，接受学生作答 |
| `closed`   | 截止或教练手动关闭   |

#### assignment_progress.status

| 状态          | 含义                     |
| ------------- | ------------------------ |
| `pending`     | 已分配，学生尚未开始     |
| `in_progress` | 学生已开始答题           |
| `completed`   | 学生已提交               |
| `missed`      | 截止时间到达，学生未开始 |

### 任务考试状态模型

任务考试涉及四张表的状态协调：

> **当前对齐说明（2026-04-26）**：当前已挂载的运行时已覆盖 `papers: draft → active → completed / abandoned`、`attempts: started → submitted / auto_submitted`，以及 BullMQ delayed auto-submit 调度。`assignment_progress` 现在会在 startAttempt 时从 `pending` 推到 `in_progress`，在 finalize 时做最小 `completed` 回写，并在过期 draft 回收时把 pending 任务标记为 `missed`；cron 兜底 auto-submit 已由运行时维护循环落地。

```
assignments.status:           assigned → closed
assignment_progress.status:   pending → in_progress → completed / missed
papers.status:                draft → active → completed / abandoned
attempts.status:              started → submitted / auto_submitted / abandoned
```

**Source of Truth 规则**：
- 判断学生是否完成任务 → `assignment_progress.status`
- 判断试卷当前状态 → `papers.status`
- 判断答题过程状态 → `attempts.status`

**唯一约束**：`assignment_progress(assignment_id, user_id)` — 每个学生每个任务只有一条进度记录。

**attempt 创建时机**：学生点击“开始任务”或“开始自练”时，在事务中同时创建或激活 paper（`draft → active`）、创建 attempt（`started`），并在任务模式下更新 `assignment_progress`（`pending → in_progress`）。当前已挂载的运行时已在 startAttempt 中落实这段前半程联动，并会在创建 attempt 后立刻调度 delayed auto-submit job。

**当前运行时（2026-04-26）**：当 `POST /api/v1/attempts/:id/submit` 到达时，如果服务端判定 `min(started_at + blueprint.duration_minutes, assignment.due_at) <= now()`，则直接把 `attempts.status` 落为 `auto_submitted`，同步回写 `score`、`per_section_json`、`per_primary_kp_json`、`ai_report_json`、`report_status`，并将 `papers.status` 标记为 `completed`。同一套 finalizer 也被 runtime worker 的 delayed auto-submit job 与 5 分钟维护循环复用。

**目标态：截止自动提交写入顺序**：
1. `attempts.status` → `auto_submitted`
2. `papers.status` → `completed`
3. `assignment_progress.status` → `completed`（若是任务）
4. 取消 BullMQ delayed job（若存在）

**当前运行时（2026-04-26）**：`submitAt = min(started_at + duration, assignment.due_at ?? Infinity)` 已由 delayed BullMQ job 调度实现；cron 兜底补漏已由 API/runtime worker 的 5 分钟维护循环实现。

### ExamResult 读模型（当前 API 投影）

```ts
interface ExamResultPayload {
  paper: {
    id: string;
    examType: string;
    difficulty: string | null;
    status: string;
    assignmentId: string | null;
  };
  attempt: {
    id: string;
    status: string;
    submittedAt: string | null;
    score: number | null;
    perSectionJson: PerSectionJson | null;
    perPrimaryKpJson: PerPrimaryKpJson | null;
    reportStatus: string | null;
    report: AttemptReportJson | null;
  };
  items: Array<{
    slotNo: number;
    questionType: string;
    primaryKpId: number;
    points: number;
    contentJson: unknown;
    submittedAnswers: Record<string, string>;
    result: {
      earnedScore: number;
      maxScore: number;
      correctCount: number;
      totalCount: number;
      subQuestions: Array<{
        key: string;
        submittedAnswer: string | null;
        correctAnswer: string;
        isCorrect: boolean;
        points: number;
        explanation: string | null;
      }>;
    };
  }>;
}
```

> **当前对齐说明（2026-04-26）**：`GET /api/v1/exams/:id/result` 已把 `attempts` 的分数聚合、`ai_report_json` wrongs 报告，以及 `paper_question_slots + questions.content_json / answer_json / explanation_json` 归一化成结果页读模型，避免前端直接依赖底层存储形状。

### spec_json 蓝图接口定义

```ts
interface BlueprintSpec {
  examType: string;                  // e.g. 'CSP-J', 'GESP-3'
  durationMinutes: number;           // 考试时长（分钟）
  sections: BlueprintSection[];
}

interface BlueprintSection {
  questionType: string;              // 'single_choice' | 'reading_program' | 'completion_program'
  questionCount: number;             // 本 section 总题数
  subQuestionsPerGroup?: number;     // 阅读/完善程序每组子题数
  groupCount?: number;               // 阅读/完善程序组数
  pointsPerQuestion: number;         // 每小题分值
  maxScore: number;                  // 本 section 满分
  difficultyDistribution: Record<string, number>;  // { easy: 0.3, medium: 0.5, hard: 0.2 }
  primaryKpQuota: { kpId: number; count: number }[];  // 按 primary_kp 配额分配
}
```

> **参数值来源**：所有 `durationMinutes`、`difficultyDistribution`、`primaryKpQuota` 等参数均基于 CSP-J/S 历年真题统计及 GESP 认证大纲分析，在 Phase 7 蓝图初始化时确定。蓝图主要服务离线预制卷生成，而非运行时在线组卷。

### 时间戳规范

- **所有表**默认包含 `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- **需要 `updated_at`** 的表：`users`、`questions`、`prebuilt_papers`、`papers`、`attempts`、`assignments`、`classes`、`app_settings`
- `updated_at` 通过应用层在写入时显式设置，不使用数据库触发器

### 运行时配置优先级链

```
app_settings (数据库热配置) > .env 环境变量 > 代码默认值
```

适用于：`exam.autosaveIntervalSeconds`、`exam.draftTtlMinutes`、`paper.selection.recentExcludeAttempts`、`import.maxBundleSizeMb` 等可运行时调整的参数。
