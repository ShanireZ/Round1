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

## 并发与幂等

- `startAttempt`、`submit/finalizer`、assignment progress 更新必须用 CAS 或事务保护。
- finalized attempt 再次 submit 必须幂等返回已有结果。
- autosave 只接受匹配 `X-Tab-Nonce` 的请求，不匹配返回 409。
- import dry-run 不写业务表；apply 必须可追溯到 import batch。

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

## API 验证

- 新路由必须有 unit 或 integration 测试。
- 权限、校验失败、成功、边界状态至少各覆盖一条。
- OpenAPI 生成不得失败。

## 路由模块结构

每个领域路由应包含：

- route handler：只解析请求、调用 service、返回响应。
- schema：Zod body/query/params/response schema。
- service：业务规则、事务、权限上下文。
- repository 或 query helper：复杂 DB 读写。
- OpenAPI registration：路径、方法、鉴权、错误响应。

禁止在 route handler 中写大段 SQL、状态机或跨领域业务流程。

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

## 后端 PR 检查清单

- 是否有 Zod 校验。
- 是否有权限守卫。
- 是否返回统一 envelope。
- 是否注册 OpenAPI。
- 是否处理并发/幂等。
- 是否有审计。
- 是否有 integration test。
- 是否保持 prebuilt-only。
