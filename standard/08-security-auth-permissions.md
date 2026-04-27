# 安全、认证与权限规范

## 安全基线

- 全环境统一使用 `__Host-Round1.sid` session cookie。
- Cookie 必须 `httpOnly`，生产必须 `secure`，`path=/`，不设置 domain。
- `trust proxy` 固定精确 hop，当前为 1，禁止设置为 `true`。
- CSRF 保护覆盖非 GET/HEAD/OPTIONS 请求。
- Helmet CSP 只允许必要来源；新增外部资源必须更新 CSP 并说明原因。
- 密码使用 argon2id；不得记录明文密码、验证码、token、secret。

## 注册与登录

- 邮箱 challenge 链接 GET 打开页面不消费，前端显式 POST 兑换才签发 ticket。
- 邮件模板必须提供 HTML + 纯文本双版本。
- 用户可控内容进入邮件/HTML 前必须转义。
- 临时邮箱黑名单、auth rate limit、Turnstile/PoW 按计划执行，不得只依赖前端防护。

## Session 与强制失效

- `session_version` 变化后旧 session 必须失效。
- 密码重置、修改密码、安全风险事件后必须递增 session version。
- Session 过期后重新登录，应能通过 `GET /attempts/active` 恢复仍在进行的考试。

## OIDC / OAuth

- CppLearn 使用 Authorization Code Flow + PKCE。
- 必须校验 issuer、aud、nonce、state、redirect_uri、一次性 code。
- `provider_email` 存在但可能为空或不可验证时，不得作为可绑定邮箱事实源。
- OIDC 回调中 provider email 与本地邮箱一致时，不自动合并账号；用户需登录本地账号后走 bind 流程。
- `safeReturnTo` 必须防开放跳转。
- QQ 互联仍为 feature flag，未启用时前端不展示入口、后端拒绝流程。

## Passkey / TOTP / Step-up

- Admin 敏感操作必须要求最近强认证。
- `AUTH_STEP_UP_WINDOW_MINUTES` 默认 10 分钟，可通过 env/app settings 调整。
- TOTP secret 加密密钥由环境变量管理，不得落库明文。
- Passkey 绑定、解绑、登录必须记录 auth audit。

## 权限矩阵

| 操作 | student | coach | admin |
| --- | --- | --- | --- |
| 自练考试 | 可以 | 可以 | 可以 |
| 班级任务作答 | 可以 | 仅作为学生体验 | 仅作为学生体验 |
| 管理自己班级 | 禁止 | 可以 | 可管理全部 |
| 题库/预制卷库 | 禁止 | 禁止 | 可以 |
| 用户角色管理 | 禁止 | 禁止 | 可以 + step-up |
| 系统设置 | 禁止 | 禁止 | 可以 + step-up |

权限必须由后端校验。前端隐藏入口不能替代授权。

## 审计

必须审计：

- Admin 用户角色变更、禁用/恢复。
- Admin 设置变更。
- 题目/预制卷 publish/archive/delete/copy-version。
- bundle dry-run/apply。
- 认证安全事件、OIDC bind/unbind、Passkey/TOTP 变更。

审计记录应包含 actor、target、action、before/after 摘要、request id、时间。

## 禁止事项

- 禁止在日志、错误响应、前端配置端点暴露 secret。
- 禁止生产环境启用宽松 CORS；当前同源部署无需 CORS。
- 禁止 Redis `FLUSHDB` 处理问题；必须按 key 前缀清理。
- 禁止以 admin 后台创建用户；用户必须自助注册，角色提升通过 role patch。

