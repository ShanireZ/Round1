# Reference — API 路由与前端

> 本文件从 [01-reference.md](01-reference.md) 拆分而来。完整参考索引见 [01-reference.md](01-reference.md)。

---

### ErrorResponse 接口与错误码

```ts
interface ErrorResponse {
  success: false;
  error: {
    code: string; // 机器可读错误码
    message: string; // 人类可读描述
    details?: unknown; // 可选附加信息（校验错误等）
  };
}
```

**错误码枚举**（`ROUND1_` 前缀）：

| 错误码                              | HTTP | 说明                     |
| ----------------------------------- | ---- | ------------------------ |
| `ROUND1_VALIDATION_ERROR`           | 400  | 请求参数校验失败         |
| `ROUND1_UNAUTHENTICATED`            | 401  | 未登录或 session 过期    |
| `ROUND1_REAUTH_REQUIRED`            | 401  | 需要 step-up 复核        |
| `ROUND1_FORBIDDEN`                  | 403  | 无权限                   |
| `ROUND1_NOT_FOUND`                  | 404  | 资源不存在               |
| `ROUND1_CONFLICT`                   | 409  | 资源冲突（tab_nonce 等） |
| `ROUND1_RATE_LIMITED`               | 429  | 频控触发                 |
| `ROUND1_TURNSTILE_FAILED`           | 403  | Turnstile 校验失败       |
| `ROUND1_WEAK_PASSWORD`              | 400  | 密码强度不足             |
| `ROUND1_TEMP_EMAIL_BLOCKED`         | 400  | 临时邮箱被拦截           |
| `ROUND1_CHALLENGE_LOCKED`           | 400  | challenge 验证次数耗尽   |
| `ROUND1_PREBUILT_PAPER_UNAVAILABLE` | 503  | 当前难度无可用预制卷     |
| `ROUND1_IMPORT_BUNDLE_INVALID`      | 400  | 导入 bundle 校验失败     |
| `ROUND1_ADMIN_AUDIT_FAILED`         | 500  | Admin 审计日志写入失败   |
| `ROUND1_INTERNAL_ERROR`             | 500  | 服务器内部错误           |

### 前端配置端点

`GET /api/v1/config/client` — 无鉴权，返回前端运行时配置：

```ts
interface ClientConfig {
  autosaveIntervalSeconds: number; // 默认 180
  examDraftTtlMinutes: number; // 默认 1440
  turnstileSiteKey: string;
  powEnabled: boolean;
  powBaseDifficulty: number;
  availableExamTypes: string[]; // ['CSP-J', 'CSP-S', 'GESP-1', ...]
  availableDifficulties: string[]; // ['easy', 'medium', 'hard']
  enabledAuthProviders: string[]; // ['password', 'passkey', ...]（动态）
  authProviderPlaceholders: string[]; // ['qq'] 等视觉占位，不代表登录流程可用
}
```

> **当前对齐说明（2026-04-28）**：`/api/v1/config/client` 已从 auth router 拆出到 `server/routes/config.ts`，当前返回 `turnstileSiteKey`、PoW 字段、`autosaveIntervalSeconds`、`examDraftTtlMinutes`、`availableExamTypes`、`availableDifficulties`、`enabledAuthProviders` 与 `authProviderPlaceholders`。`enabledAuthProviders` 只描述当前可发起的登录方式；QQ 互联在 OAuth adapter 尚未实现前只进入 `authProviderPlaceholders`，供登录页做 feature-flag 视觉占位，不触发 501 流程。autosave 与 draft TTL 读取运行时配置最终生效值；前端不需要也不应知道该值来自 `app_settings`、`.env` 还是代码默认值。`ExamSession` 现在使用 `autosaveIntervalSeconds` 做周期性 pending patch flush；答题变更仍有 30s debounce，以便和后端 per-user autosave rate limit 默认值对齐。

### 前端路由表

| 路径                 | 页面组件              | 鉴权要求       |
| -------------------- | --------------------- | -------------- |
| `/login`             | `LoginPage`           | 仅未登录       |
| `/register`          | `RegisterPage`        | 仅未登录       |
| `/auth/callback`     | `AuthCallbackPage`    | —              |
| `/forgot-password`   | `ForgotPasswordPage`  | 仅未登录       |
| `/join`              | `JoinClassPage`       | 已登录         |
| `/dashboard`         | `Dashboard`           | student+       |
| `/exams/new`         | `ExamNew`             | student+       |
| `/exams/:id`         | `Exam`                | student+       |
| `/exams/:id/result`  | `ExamResult`          | student+       |
| `/account/class`     | `AccountClassPage`    | 已登录         |
| `/account/security`  | `AccountSecurityPage` | 已登录         |
| `/coach/classes`     | `CoachClasses`        | coach+         |
| `/coach/classes/:id` | `CoachClassDetail`    | coach+         |
| `/coach/assignments` | `CoachAssignments`    | coach+         |
| `/coach/report`      | `CoachReport`         | coach+         |
| `/admin`             | `AdminDashboard`      | admin          |
| `/admin/questions`   | `AdminQuestionPool`   | admin          |
| `/admin/papers`      | `AdminPaperLibrary`   | admin          |
| `/admin/imports`     | `AdminImports`        | admin          |
| `/admin/settings`    | `AdminSettings`       | admin(step-up) |
| `/admin/users`       | `AdminUsers`          | admin(step-up) |
| `/admin/review`      | `AdminReview`         | admin          |

### API 路由总表

> **当前对齐说明（2026-04-28）**：当前运行时 surface 以 `server/app.ts` + `server/routes/*.ts` 为准。已挂载的路由组包括 `/health`、`/openapi.json`（开发无鉴权，非开发需 admin session）、`/docs`（仅 `NODE_ENV=development`）、`/config/client`、`/auth/**`、`/admin/**`、`/classes/join`、`/coach/**`，以及 Phase 11 的考试运行时 slice：`GET /api/v1/exams/catalog`、`GET /api/v1/exams/active-draft`、`POST /api/v1/exams`、`POST /api/v1/exams/:id/attempts`、`GET /api/v1/exams/:id/session`、`GET /api/v1/exams/:id/result`、`PATCH /api/v1/attempts/:id`、`POST /api/v1/attempts/:id/submit`、`GET /api/v1/attempts/active`、`GET /api/v1/users/me/attempts`、`GET /api/v1/users/me/stats`。其中 `GET /api/v1/auth/session` 作为前端 auth gate，无登录时返回 `{ authenticated: false }` 而不是制造 Dashboard / CoachReport 401 控制台噪声；autosave 当前是“`X-Tab-Nonce` 校验 + `patches[]` + `jsonb_set()` 增量更新”，并带 per-user 频控；startAttempt 现已调度 BullMQ delayed auto-submit job、回写 `attempts.auto_submit_job_id`，在 `papers.status='draft'` 上做 CAS，并在任务模式下把 `assignment_progress` 从 `pending` 推到 `in_progress`；session 接口返回当前 started attempt、题面 slots 与 `answersJson`；submit 当前已覆盖 finalized attempt 幂等返回、超时时落 `auto_submitted`、基础客观题与阅读/完善程序子题级聚合、`aiReportJson/reportStatus` wrongs 报告回写，以及 manual submit 时的 auto-submit job 取消；result 接口会把 `attempts` 聚合字段、`ai_report_json` 与题面/解析拼成稳定结果页 payload；`attempts/active` 已返回剩余时间与恢复路径。教练后端 slice 已覆盖班级、成员、邀请、多教练、固定预制卷 assignment 创建和 assignment-only 报表；`GET /api/v1/coach/report/:classId` 现状返回群体热力图、题型统计、学生趋势和下钻详情所需 payload，前端 `/coach/report` 已消费该接口。

| 接口组                                                                                                                                                                                                                                                                       | 状态     | 备注                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/v1/health`、`/api/v1/openapi.json`、`/api/v1/auth/**`、`/api/v1/admin/**`                                                                                                                                                                                              | 现状契约 | 当前已挂载                                                                                                                                                     |
| `/api/v1/config/client`                                                                                                                                                                                                                                                      | 现状契约 | 当前已挂载，返回前端非敏感运行时配置完整字段；由 `server/routes/config.ts` 注册 OpenAPI                                                                        |
| `/api/v1/exams/catalog`、`/api/v1/exams/active-draft`、`POST /api/v1/exams`、`POST /api/v1/exams/:id/attempts`、`GET /api/v1/exams/:id/session`、`GET /api/v1/exams/:id/result`、`PATCH /api/v1/attempts/:id`、`POST /api/v1/attempts/:id/submit`、`/api/v1/attempts/active` | 现状契约 | 当前已挂载的 Phase 11 运行时接口，严格 prebuilt-only；session 返回题面与当前答案；autosave 增量保存；submit/result 已含 grouped grader 与稳定结果 payload 语义 |
| `/api/v1/users/me/**`                                                                                                                                                                                                                                                        | 现状契约 | 学生历史与统计已挂载，并被当前 Dashboard 消费                                                                                                                  |
| `/api/v1/classes/join`、`/api/v1/coach/**`                                                                                                                                                                                                                                   | 现状契约 | 当前已挂载教练后端 slice：班级、成员、邀请、多教练、assignment、群体热力图、题型统计和学生下钻报表；`/coach/report` 前端已接入，班级/任务页面仍需继续收口      |
| `/api/v1/docs`                                                                                                                                                                                                                                                               | 现状契约 | Swagger UI 仅在 `NODE_ENV=development` 挂载，生产不暴露                                                                                                        |

| 方法     | 路径                                                       | 说明                                                                                                                        | 鉴权                     |
| -------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `GET`    | `/api/v1/health`                                           | 健康检查                                                                                                                    | 无                       |
| `GET`    | `/api/v1/openapi.json`                                     | OpenAPI 文档                                                                                                                | 开发无鉴权；非开发 admin |
| `GET`    | `/api/v1/docs`                                             | Swagger UI                                                                                                                  | 仅开发                   |
| `GET`    | `/api/v1/config/client`                                    | 前端运行时配置                                                                                                              | 无                       |
| `GET`    | `/api/v1/auth/providers`                                   | 可用登录方式与 feature flag 视觉占位；`providers` 不包含未实现的 QQ 流程                                                    | 无                       |
| `GET`    | `/api/v1/auth/session`                                     | 当前浏览器会话状态；匿名返回 `authenticated=false`，供前端避免未登录时请求受保护 Dashboard / CoachReport 数据               | 无                       |
| `POST`   | `/api/v1/auth/register/email/request-challenge`            | 注册发起 challenge                                                                                                          | 无                       |
| `POST`   | `/api/v1/auth/register/email/verify-code`                  | 注册验证码校验                                                                                                              | 无                       |
| `POST`   | `/api/v1/auth/register/email/redeem-link`                  | 注册链接兑换                                                                                                                | 无                       |
| `POST`   | `/api/v1/auth/register/email/complete`                     | 注册完成                                                                                                                    | 无                       |
| `POST`   | `/api/v1/auth/login/password`                              | 密码登录                                                                                                                    | 无                       |
| `POST`   | `/api/v1/auth/login/passkey/options`                       | Passkey 登录 challenge                                                                                                      | 无                       |
| `POST`   | `/api/v1/auth/login/passkey/verify`                        | Passkey 登录校验                                                                                                            | 无                       |
| `POST`   | `/api/v1/auth/password/request-challenge`                  | 找回密码发起                                                                                                                | 无                       |
| `POST`   | `/api/v1/auth/password/verify-code`                        | 找回密码验证码                                                                                                              | 无                       |
| `POST`   | `/api/v1/auth/password/redeem-link`                        | 找回密码链接兑换                                                                                                            | 无                       |
| `POST`   | `/api/v1/auth/password/reset`                              | 重置密码                                                                                                                    | 无                       |
| `POST`   | `/api/v1/auth/password/change`                             | 已登录修改密码                                                                                                              | 已登录                   |
| `GET`    | `/api/v1/auth/oidc/cpplearn/start`                         | OIDC 登录发起                                                                                                               | —                        |
| `GET`    | `/api/v1/auth/oidc/cpplearn/callback`                      | OIDC 回调                                                                                                                   | —                        |
| `GET`    | `/api/v1/auth/external/:provider/start`                    | 第三方登录发起                                                                                                              | —                        |
| `GET`    | `/api/v1/auth/external/:provider/callback`                 | 第三方登录回调                                                                                                              | —                        |
| `POST`   | `/api/v1/auth/complete-profile`                            | 补齐资料（OIDC 注册）                                                                                                       | 无                       |
| `POST`   | `/api/v1/auth/passkeys/register/options`                   | Passkey 绑定申请                                                                                                            | 已登录                   |
| `POST`   | `/api/v1/auth/passkeys/register/verify`                    | Passkey 绑定完成                                                                                                            | 已登录                   |
| `DELETE` | `/api/v1/auth/passkeys/:credentialId`                      | Passkey 解绑                                                                                                                | 已登录                   |
| `POST`   | `/api/v1/auth/reauth/passkey/options`                      | Step-up Passkey challenge                                                                                                   | 已登录                   |
| `POST`   | `/api/v1/auth/reauth/passkey/verify`                       | Step-up Passkey 校验                                                                                                        | 已登录                   |
| `POST`   | `/api/v1/auth/totp/enroll/start`                           | TOTP 绑定开始                                                                                                               | 已登录                   |
| `POST`   | `/api/v1/auth/totp/enroll/verify`                          | TOTP 绑定确认                                                                                                               | 已登录                   |
| `POST`   | `/api/v1/auth/reauth/totp`                                 | Step-up TOTP 校验                                                                                                           | 已登录                   |
| `DELETE` | `/api/v1/auth/totp`                                        | TOTP 解绑                                                                                                                   | 已登录                   |
| `POST`   | `/api/v1/auth/email/change/request-challenge`              | 换绑邮箱发起                                                                                                                | 已登录                   |
| `POST`   | `/api/v1/auth/email/change/verify-code`                    | 换绑邮箱验证码                                                                                                              | 已登录                   |
| `POST`   | `/api/v1/auth/email/change/redeem-link`                    | 换绑邮箱链接兑换                                                                                                            | 已登录                   |
| `POST`   | `/api/v1/auth/email/change/confirm`                        | 换绑邮箱确认                                                                                                                | 已登录                   |
| `DELETE` | `/api/v1/auth/external/:provider`                          | 第三方身份解绑                                                                                                              | 已登录                   |
| `POST`   | `/api/v1/auth/logout`                                      | 登出                                                                                                                        | 已登录                   |
| `GET`    | `/api/v1/exams/catalog`                                    | 查询可用预制卷目录                                                                                                          | student+                 |
| `GET`    | `/api/v1/exams/active-draft`                               | 查询活动草稿                                                                                                                | student+                 |
| `POST`   | `/api/v1/exams`                                            | 从预制卷库创建试卷草稿                                                                                                      | student+                 |
| `POST`   | `/api/v1/exams/:id/attempts`                               | 开始答题，CAS 激活 draft，调度 BullMQ delayed auto-submit job，并在任务模式下推进 `assignment_progress` 到 `in_progress`    | student+                 |
| `GET`    | `/api/v1/exams/:id/session`                                | 读取当前 started attempt、题面 slots 与 `answersJson`                                                                       | student+                 |
| `GET`    | `/api/v1/exams/:id/result`                                 | 结果页读取接口（返回 paper、finalized attempt 聚合、wrongs 报告与题面解析明细）                                             | student+                 |
| `PATCH`  | `/api/v1/attempts/:id`                                     | 自动保存（nonce 校验 + `patches[]` + `jsonb_set()` 增量写入，per-user 频控）                                                | student+                 |
| `POST`   | `/api/v1/attempts/:id/submit`                              | 提交答卷（可携带 pending `patches[]`；finalized 幂等返回；超时落 `auto_submitted`；回写 grouped grader 聚合与 wrongs 报告） | student+                 |
| `GET`    | `/api/v1/attempts/active`                                  | 进行中 attempt（返回 `id`/`paperId`/`status`/`tabNonce`/`submitAt`/`remainingMs`/`resumePath`）                             | student+                 |
| `GET`    | `/api/v1/users/me/attempts`                                | 分页答题历史（当前返回 finalized attempts 的 `examType`/`difficulty`/`score`/`submittedAt`）                                | student+                 |
| `GET`    | `/api/v1/users/me/stats`                                   | 聚合统计（当前返回 `totalAttempts`/`averageScore`/`bestScore`/`latestSubmittedAt`/`weakPrimaryKps`）                        | student+                 |
| `POST`   | `/api/v1/classes/join`                                     | 加入班级                                                                                                                    | student+                 |
| `GET`    | `/api/v1/coach/classes`                                    | 教练班级列表                                                                                                                | coach+                   |
| `POST`   | `/api/v1/coach/classes`                                    | 创建班级                                                                                                                    | coach+                   |
| `GET`    | `/api/v1/coach/classes/:id`                                | 班级详情                                                                                                                    | coach+                   |
| `PATCH`  | `/api/v1/coach/classes/:id`                                | 编辑班级                                                                                                                    | coach+                   |
| `POST`   | `/api/v1/coach/classes/:id/archive`                        | 归档班级                                                                                                                    | owner                    |
| `POST`   | `/api/v1/coach/classes/:id/rotate-code`                    | 轮换班级码                                                                                                                  | owner                    |
| `GET`    | `/api/v1/coach/classes/:id/invites`                        | 邀请链接列表                                                                                                                | owner                    |
| `POST`   | `/api/v1/coach/classes/:id/invites`                        | 创建邀请链接                                                                                                                | owner                    |
| `DELETE` | `/api/v1/coach/classes/:id/invites/:inviteId`              | 撤销邀请链接                                                                                                                | owner                    |
| `POST`   | `/api/v1/coach/assignments`                                | 布置任务                                                                                                                    | coach+                   |
| `GET`    | `/api/v1/coach/report/:classId`                            | 班级报表                                                                                                                    | coach+                   |
| `GET`    | `/api/v1/admin/users`                                      | 用户列表                                                                                                                    | admin                    |
| `PATCH`  | `/api/v1/admin/users/:uid`                                 | 修改角色                                                                                                                    | admin(s-u)               |
| `DELETE` | `/api/v1/admin/users/:uid`                                 | 软删除用户                                                                                                                  | admin(s-u)               |
| `POST`   | `/api/v1/admin/users/:uid/restore`                         | 恢复账号                                                                                                                    | admin(s-u)               |
| `GET`    | `/api/v1/admin/settings`                                   | 获取所有运行时配置                                                                                                          | admin                    |
| `PATCH`  | `/api/v1/admin/settings/:key`                              | 修改单个配置项                                                                                                              | admin(s-u)               |
| `GET`    | `/api/v1/auth/csrf-token`                                  | 获取 CSRF token（允许匿名 session）                                                                                         | 无                       |
| `GET`    | `/api/v1/admin/questions`                                  | 题库列表（筛选/分页）                                                                                                       | admin                    |
| `POST`   | `/api/v1/admin/questions`                                  | 新建题目                                                                                                                    | admin                    |
| `GET`    | `/api/v1/admin/questions/:id`                              | 题目详情                                                                                                                    | admin                    |
| `GET`    | `/api/v1/admin/questions/:id/references`                   | 题目引用摘要                                                                                                                | admin                    |
| `PATCH`  | `/api/v1/admin/questions/:id`                              | 编辑题目                                                                                                                    | admin                    |
| `DELETE` | `/api/v1/admin/questions/:id`                              | 删除未引用 draft 题目                                                                                                       | admin                    |
| `POST`   | `/api/v1/admin/questions/:id/publish`                      | 发布题目                                                                                                                    | admin                    |
| `POST`   | `/api/v1/admin/questions/:id/archive`                      | 归档题目                                                                                                                    | admin                    |
| `POST`   | `/api/v1/admin/questions/:id/confirm`                      | 真题审核确认                                                                                                                | admin                    |
| `POST`   | `/api/v1/admin/questions/:id/reject`                       | 真题审核拒绝                                                                                                                | admin                    |
| `GET`    | `/api/v1/admin/prebuilt-papers`                            | 预制卷库列表                                                                                                                | admin                    |
| `POST`   | `/api/v1/admin/prebuilt-papers`                            | 新建预制卷                                                                                                                  | admin                    |
| `GET`    | `/api/v1/admin/prebuilt-papers/:id`                        | 预制卷详情                                                                                                                  | admin                    |
| `GET`    | `/api/v1/admin/prebuilt-papers/:id/references`             | 预制卷引用摘要                                                                                                              | admin                    |
| `POST`   | `/api/v1/admin/prebuilt-papers/:id/copy-version`           | 复制为新的 draft 版本                                                                                                       | admin                    |
| `PATCH`  | `/api/v1/admin/prebuilt-papers/:id`                        | 编辑预制卷                                                                                                                  | admin                    |
| `DELETE` | `/api/v1/admin/prebuilt-papers/:id`                        | 删除未引用 draft 预制卷                                                                                                     | admin                    |
| `POST`   | `/api/v1/admin/prebuilt-papers/:id/publish`                | 发布预制卷                                                                                                                  | admin                    |
| `POST`   | `/api/v1/admin/prebuilt-papers/:id/archive`                | 归档预制卷                                                                                                                  | admin                    |
| `GET`    | `/api/v1/admin/import-batches`                             | 导入批次列表                                                                                                                | admin                    |
| `POST`   | `/api/v1/admin/import-batches/questions/dry-run`           | 题目 bundle 试导入                                                                                                          | admin                    |
| `POST`   | `/api/v1/admin/import-batches/questions/apply`             | 题目 bundle 正式导入                                                                                                        | admin                    |
| `POST`   | `/api/v1/admin/import-batches/prebuilt-papers/dry-run`     | 预制卷 bundle 试导入                                                                                                        | admin                    |
| `POST`   | `/api/v1/admin/import-batches/prebuilt-papers/apply`       | 预制卷 bundle 正式导入                                                                                                      | admin                    |
| `GET`    | `/api/v1/coach/classes/:id/members`                        | 班级成员列表                                                                                                                | coach+                   |
| `DELETE` | `/api/v1/coach/classes/:id/members/:userId`                | 移除班级成员                                                                                                                | owner                    |
| `GET`    | `/api/v1/coach/classes/:id/coaches`                        | 班级教练组列表                                                                                                              | coach+                   |
| `POST`   | `/api/v1/coach/classes/:id/coaches`                        | 添加教练                                                                                                                    | owner                    |
| `DELETE` | `/api/v1/coach/classes/:id/coaches/:userId`                | 移除教练                                                                                                                    | owner                    |
| `POST`   | `/api/v1/coach/classes/:id/coaches/:userId/transfer-owner` | 转让 owner                                                                                                                  | owner                    |
| `GET`    | `/api/v1/coach/classes/:id/assignments`                    | 班级任务列表                                                                                                                | coach+                   |
| `GET`    | `/api/v1/coach/assignments/:id`                            | 任务详情（含学生进度）                                                                                                      | coach+                   |
| `PATCH`  | `/api/v1/coach/assignments/:id`                            | 编辑任务（如延期）                                                                                                          | coach+                   |
| `POST`   | `/api/v1/coach/assignments/:id/close`                      | 手动关闭任务                                                                                                                | coach+                   |
| `GET`    | `/api/v1/admin/classes/:id/coaches`                        | Admin 查看任意班级教练组                                                                                                    | admin                    |
| `POST`   | `/api/v1/admin/classes/:id/coaches`                        | Admin 添加任意班级协作教练                                                                                                  | admin(s-u)               |
| `DELETE` | `/api/v1/admin/classes/:id/coaches/:userId`                | Admin 移除任意班级教练                                                                                                      | admin(s-u)               |
| `POST`   | `/api/v1/admin/classes/:id/coaches/:userId/transfer-owner` | Admin 转让任意班级 owner                                                                                                    | admin(s-u)               |

> `student+` 表示 student/coach/admin 均可访问；`coach+` 表示 coach/admin；`admin(s-u)` 表示需 step-up 复核。
