# 后端 API 与调用规范

## 技术边界

后端使用 Express 5 + TypeScript + Zod + OpenAPI 3.1 + Drizzle + Redis-backed session/rate limit。API 基础路径固定 `/api/v1`。

## Express 结构

- 中间件顺序必须保持：安全头 -> 日志 -> body parser -> session -> CSRF -> rate limit -> response wrapper -> routes -> error handler。
- Express error handler 必须是四参签名，并放在所有路由之后。
- Express 5 会把 async handler 的 rejected promise 传给错误中间件；仍应对预期业务错误使用明确 `AppError` 或 `res.fail`。
- 新路由应放入领域 router，不在 `app.ts` 里堆 handler。

## 响应 envelope

成功：

```json
{ "success": true, "data": {} }
```

失败：

```json
{
  "success": false,
  "error": {
    "code": "ROUND1_VALIDATION_ERROR",
    "message": "请求参数校验失败",
    "details": {}
  }
}
```

禁止返回裸数组、裸字符串或未包装 error。

## 错误码

- 错误码统一 `ROUND1_*`。
- 401 用于未登录或 step-up 复核；403 用于已登录但无权限。
- 409 用于并发/CAS/nonce 冲突。
- 422 可用于语义合法但业务规则不满足；当前如未统一，可继续用 400 但必须带稳定错误码。
- 503 用于当前无可用预制卷等可恢复服务状态。

错误码新增必须满足：

- 代码名表达业务原因，不表达实现细节。
- 前端能据此给出可行动文案。
- 日志能按错误码搜索。
- `plan/reference-api.md` 或 OpenAPI 错误响应同步。
- 不把 secret、SQL、堆栈、内部 provider 原文放入 `message`。

## 输入校验

- 所有写接口必须用 Zod 校验 body。
- query/params 涉及分页、过滤、UUID、枚举时也必须校验。
- 不信任前端角色、用户 ID、状态字段；服务端从 session 和 DB 推导。
- Admin import raw bundle 直接对齐共享 bundle schema，不再包 admin wrapper DTO。

## API 设计

- 资源集合用复数；状态转换用动作端点。
- 列表接口必须有分页或明确上限。
- 任何删除/归档/发布/复制版本接口都必须检查引用关系。
- API 新增或行为变化必须更新 OpenAPI registry 与 `plan/reference-api.md`。
- 不得新增在线组卷、在线换题、运行时 AI 生成题目接口。

## 资源建模

API 应优先表达资源和状态，不把内部实现暴露成接口形状：

- URL path 表示稳定资源层级，避免把一次性筛选条件塞进 path。
- query 用于分页、排序、筛选；body 用于复杂输入。
- response 返回调用方下一步需要的资源摘要或状态摘要，不要求前端再猜测当前状态。
- 字段层级保持浅，复杂 JSON 只用于题目内容、答案、解析、报告等确有结构需求的领域。
- 字段可变性必须清楚：create-only、updateable、read-only 不混用。客户端提交 read-only 字段时应拒绝或忽略，并在 schema/文档中明确。
- create/update/delete/publish/archive/copy-version 的响应必须让前端能刷新局部数据，而不是只能全局 reload。

动作端点只能用于真实领域动作。若只是普通字段更新，使用资源更新接口；若动作会触发状态迁移，则必须符合 [20-product-state-and-workflow.md](20-product-state-and-workflow.md)。

## API 成熟度

新增 API 不应只做到“路由能通”。按影响面分为三档：

| 档位 | 适用 | 最低要求 |
| --- | --- | --- |
| internal | 仅脚本、本地诊断、开发辅助 | 鉴权清楚、错误码稳定、不得被前端主路径依赖 |
| beta | 已给前端或 Admin 使用，但还在收口 | OpenAPI、测试、文档写明缺口和兼容策略 |
| stable | 核心用户路径或生产依赖 | 权限/校验/并发/审计/监控/回滚全部覆盖 |

考试、认证、Admin 设置、导入 apply、assignment 状态迁移默认按 stable 要求处理。

## 并发与幂等

- `startAttempt`、`submit/finalizer`、assignment progress 更新必须用 CAS 或事务保护。
- finalized attempt 再次 submit 必须幂等返回已有结果。
- autosave 只接受匹配 `X-Tab-Nonce` 的请求，不匹配返回 409。
- import dry-run 不写业务表；apply 必须可追溯到 import batch。

## 幂等与重试语义

- 重复提交同一 finalized attempt 必须返回已有结果，不重新评分。
- 重复加入同一班级应返回当前 membership，不制造重复记录。
- import apply 对同一 checksum/sourceFilename 的处理必须可追溯，不静默覆盖历史 batch。
- 外部服务失败应区分可重试和不可重试，返回稳定错误码。
- 前端可重试的写操作必须避免产生重复副作用；必要时增加 idempotency key 或唯一约束。
- 429/503 等可恢复错误应尽量返回 `retryAfterSeconds` 或等价提示，便于前端给出可行动文案。
- 任何“可能被用户重复点击”的写接口都要明确重复请求语义：幂等成功、409 冲突或稳定业务错误。

## 权限

- 路由必须显式声明 public / authenticated / coach / admin / admin step-up。
- Admin 设置、角色变更、危险内容操作必须接入 `requireRecentAuth` 和 admin audit。
- Coach 路由必须基于班级教练关系授权，不得只看 `role='coach'`。

## 客户端配置端点

`GET /api/v1/config/client` 应只暴露前端必需且非敏感字段。目标字段包括：

- `autosaveIntervalSeconds`
- `examDraftTtlMinutes`
- `availableExamTypes`
- `availableDifficulties`
- `enabledAuthProviders`

不得暴露 secret、provider API key、内部 base URL。

字段规则：

- 字段名必须稳定；新增字段先可选，前端兼容后再依赖。
- 布尔 feature flag 必须表达 enabled/disabled，不让前端反推。
- 时间配置统一用 seconds 或 minutes，字段名写单位。
- 考试类型、难度、认证 provider 等枚举必须来自后端可用配置，不由前端写死。
- 如果 app_settings、env、默认值发生冲突，响应应体现最终生效值，而不是泄露配置来源细节。

## API 验证

- 新路由必须有 unit 或 integration 测试。
- 权限、校验失败、成功、边界状态至少各覆盖一条。
- OpenAPI 生成不得失败。

## 可诊断性

- 每个请求应可关联 request id；日志、错误响应和审计记录尽量使用同一关联字段。
- 业务错误必须有稳定 `ROUND1_*` code。错误 message 面向前端和操作者，不暴露内部 SQL、secret、provider 原始响应。
- validation error 的 `details` 可以包含字段路径、期望类型、业务限制，但不得回显敏感输入。
- rate limit、缺卷、外部 provider 不可用、step-up 过期等可恢复错误必须让前端知道下一步动作。
- 对外部依赖失败，日志记录 provider、latency、error category；响应只返回稳定错误码和安全摘要。

## 路由模块结构

每个领域路由应包含：

- route handler：只解析请求、调用 service、返回响应。
- schema：Zod body/query/params/response schema。
- service：业务规则、事务、权限上下文。
- repository 或 query helper：复杂 DB 读写。
- OpenAPI registration：路径、方法、鉴权、错误响应。

禁止在 route handler 中写大段 SQL、状态机或跨领域业务流程。

## 领域 API 边界

- `auth` 只处理身份、会话、安全绑定，不夹带业务角色页面数据。
- `exams` 只处理自练考试、attempt、result、active recovery。
- `coach` 只处理班级、邀请、assignment、班级报表，必须基于 class coach membership 授权。
- `admin` 处理全局内容、用户、系统设置和审核队列，敏感写操作必须 step-up。
- `config` 只暴露非敏感客户端配置。
- `health/docs` 只服务运维和开发，不承载业务状态修改。

跨领域读模型可以由 service 组合，但不能让前端调用多个内部端点拼出权限边界。

## 分页与过滤

列表接口必须支持：

- `page` 或 cursor。
- `pageSize` 且有最大值。
- 稳定排序字段。
- 返回总数或 `hasMore`，按性能选择。

Admin 列表应支持筛选条件回显，避免前端猜测实际过滤。

## OpenAPI 规范

- 每个公开 API 必须注册 OpenAPI。
- schema 名称使用 PascalCase。
- 错误响应引用统一 ErrorResponse。
- `student+`、`coach+`、`admin`、`admin(step-up)` 必须在描述中写明。
- 现状未挂载的目标 API 不得在 OpenAPI 中伪装为可用。

## 状态转换 API

状态转换必须满足：

- 请求体只包含必要输入。
- 服务端读取当前状态并验证合法迁移。
- 使用事务或 CAS。
- 返回迁移后的最新资源或稳定摘要。
- 写审计或事件日志。

适用：`publish`、`archive`、`copy-version`、`startAttempt`、`submit`、`close assignment`。

## 安全响应策略

- 认证失败不暴露账号是否存在，除非流程明确需要。
- 权限失败统一 403，不返回资源隐私细节。
- 生产 5xx 响应只返回通用 message。
- validation details 可以返回字段级错误，但不得包含 secret 原文。

## API 兼容策略

- `/api/v1` 内避免破坏性字段删除。
- 新字段默认可选，前端先兼容再依赖。
- 字段重命名必须保留兼容期或新版本。
- 行为变更必须更新 `plan/reference-api.md` 的当前对齐说明。
- 已被前端、脚本或 Admin UI 使用的错误码、状态值、字段单位视为契约；不能因为实现方便直接改名。
- 新增必填字段、改变分页默认排序、改变状态迁移结果，都属于兼容风险，必须补计划或迁移说明。
- 弃用字段应先在文档标记 legacy，观察无读取后再删除；不得让前端在同一发布里既依赖新字段又失去旧字段回退。

## 后端 PR 检查清单

- 是否有 Zod 校验。
- 是否有权限守卫。
- 是否返回统一 envelope。
- 是否注册 OpenAPI。
- 是否处理并发/幂等。
- 是否有审计。
- 是否有 integration test。
- 是否保持 prebuilt-only。
- 是否写清 API 档位、兼容策略和错误码语义。
