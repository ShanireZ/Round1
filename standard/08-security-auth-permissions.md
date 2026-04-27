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

审计日志、隐私字段、导出与保留策略必须同时遵守 [21-privacy-and-data-lifecycle.md](21-privacy-and-data-lifecycle.md)。

## 禁止事项

- 禁止在日志、错误响应、前端配置端点暴露 secret。
- 禁止生产环境启用宽松 CORS；当前同源部署无需 CORS。
- 禁止 Redis `FLUSHDB` 处理问题；必须按 key 前缀清理。
- 禁止以 admin 后台创建用户；用户必须自助注册，角色提升通过 role patch。

## 威胁模型

Round1 必须默认防护：

- 账号撞库和验证码轰炸。
- CSRF 与 session fixation。
- OIDC state/nonce/code replay。
- 多标签页覆盖考试答案。
- Admin 越权或敏感操作误触。
- 导入恶意 bundle 覆盖内容资产。
- LLM/日志泄密。
- Redis/DB 短暂不可用导致考试数据丢失。

## 分层防护

| 层 | 防护 |
| --- | --- |
| Edge | Cloudflare WAF、TLS、基础频控 |
| API | Helmet CSP、CSRF、rate limit、Zod 校验 |
| Session | Redis store、`__Host-` cookie、session_version |
| Auth | Turnstile、PoW、邮件 challenge、argon2id |
| Admin | role guard、step-up、audit |
| Data | 事务、CAS、引用保护、备份 |

## 密钥轮换

- `SESSION_SECRET` 轮换需要会话失效计划。
- `TOTP_ENCRYPTION_KEK` 轮换必须有重新加密流程，不能直接替换导致无法解密。
- Provider API key 轮换后需验证 LLM/邮件/OIDC smoke。
- `.env.example` 只能写占位符。

## Rate Limit

必须分层限制：

- 注册 challenge：按 email、IP。
- 找回密码：按 email、IP。
- 登录失败：按账号、设备、IP。
- autosave：按 user/attempt。
- Admin import：按 admin user 和 bundle size。

触发频控必须返回稳定错误码和可理解文案。

## CORS 与 CSP

- 当前生产同源部署，无需 CORS。
- 若未来拆域名，只能白名单具体 origin。
- CSP 新增来源必须说明用途、页面、是否可替代。
- `style-src 'unsafe-inline'` 只因当前样式方案需要保留；不得扩大 script 权限。

## 安全 Review 检查清单

- 是否新增 secret 或外部服务。
- 是否新增 public route。
- 是否改变 session/cookie/CSRF。
- 是否改变 role/permission。
- 是否新增 Admin 敏感操作但缺 step-up。
- 是否新增日志字段可能泄密。
- 是否新增 bundle/import 路径绕过校验。
