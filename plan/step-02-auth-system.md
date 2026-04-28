# Step 02 — 完整认证体系（Phase 2 ~ 6）

> **前置依赖**：Step 01（脚手架 + 数据库）
> **交付物**：完整的注册、登录、密码重置、第三方身份、Passkey、角色管理、Admin step-up 体系
> **可验证 demo**：邮箱注册→密码登录→CppLearn OIDC→Passkey→Admin 权限完整流转

---

## Phase 2 — 邮箱注册 + 密码登录 + Session

### 2.1 Cloudflare Turnstile 集成

- `server/services/auth/turnstileService.ts` — 后端校验 Turnstile token
- `client/src/components/TurnstileWidget.tsx` — 前端组件
- CSP 配置允许：`scriptSrc: ["'self'", "https://challenges.cloudflare.com"]`、`frameSrc: ["'self'", "https://challenges.cloudflare.com"]`

### 2.2 邮箱 Challenge 注册

**路由**：
- `POST /api/v1/auth/register/email/request-challenge` — 创建 challenge，同时发送验证码与一次性链接
- `POST /api/v1/auth/register/email/verify-code` — 校验验证码，换取 `registerTicket`
- `POST /api/v1/auth/register/email/redeem-link` — 兑换邮件链接，换取 `registerTicket`
- `POST /api/v1/auth/register/email/complete` — 消费 ticket，设置用户名/密码，创建 student 账号

**服务**：
- `server/services/auth/emailService.ts` — challenge 创建、验证码/链接校验、ticket 签发
- `server/services/mail/index.ts` — 可插拔邮件 provider（SMTP / Resend / 腾讯云 SES）
- `server/services/auth/templates/register-code.html` — 注册验证邮件模板

**规则**：
- 邮箱先检查临时邮箱黑名单（`config/temp-email-blocklist.txt`）
- `code_hash = sha256(code + challenge_id)`，`link_token_hash = sha256(token)`
- challenge 有效期 10 分钟，ticket 有效期 15 分钟
- 验证码输入错误 5 次后锁定该 challenge
- 邮件链接 GET 打开页面不消费，前端显式 POST 兑换才签发 ticket
- 邮件发送采用 HTML + 纯文本双版本；模板变量通过字符串替换注入，所有用户可控内容先做 HTML 实体转义

**用户名规则**：4~20 位，仅允许大小写字母与数字
**密码规则**：普通用户至少 8 位且 `zxcvbn` score >= 3；管理员至少 14 位且 score >= 4。服务端统一通过 `server/services/auth/passwordPolicy.ts` 校验，注册、complete-profile、重置密码与已登录改密必须复用同一策略。

### 2.3 密码登录

- `POST /api/v1/auth/login/password` — 支持用户名或邮箱作为 identifier
- `password_hash` 使用 `argon2id`
- 登录成功刷新 `users.last_strong_auth_at`
- 登录成功后必须调用 `req.session.regenerate()` 再写入用户信息，防止 session fixation
- 写 `auth_audit_logs`

**设备指纹**：使用 `@fingerprintjs/fingerprintjs` 开源版采集浏览器指纹，生成 `device_id`，存储 `sha256(device_id)` 至 `auth_audit_logs.device_id_hash`。用于频控收敛（单账号+设备+IP）和风险评估。

> **定位说明**：设备指纹仅作为风险评分辅助信号，不作为强身份判定依据，不直接影响放行决策。

> **保留周期**：`auth_audit_logs` 中的 `device_id_hash` 随审计日志保留 180 天后归档清理。隐私告知文案在注册页面底部以及站点隐私政策页展示。

### 2.4 Session Cookie

- `express-session` + `connect-redis`（Redis 唯一 session store）
- Cookie：`__Host-Round1.sid`（`httpOnly`/`Secure`/`SameSite=Lax`/`Path=/`，无 Domain）
- 不设持久化过期时间，浏览器关闭后通常需重新登录
- 服务端 idle TTL（默认 480 分钟）+ absolute TTL（默认 10080 分钟）
- `resave: false` + `saveUninitialized: false` + `rolling: false`

### 2.5 CSRF 防护

- `csrf-sync` 中间件 — 同步器 token 模式（token 存入 session）
- `GET /api/v1/auth/csrf-token` — 获取当前 CSRF token（**公开路由，无需登录**；首次调用为匿名 session 签发 token，登录 / session regenerate 后自动轮换）
- CSRF token header：`X-CSRF-Token`
- 豁免方法：`GET`、`HEAD`、`OPTIONS`
- 无需额外 CSRF cookie；token 随 session 生命周期自动管理

### 2.6 前端页面

- `LoginPage.tsx` — 登录页（三入口骨架）
- `RegisterPage.tsx` — 注册页（两步表单）

### 2.7 前端自适应 PoW

- 注册/登录/找回密码表单支持前端 PoW（`AUTH_POW_ENABLED=1`）
- 风险升高时叠加使用

---

## Phase 3 — 密码重置 + 修改密码 + 安全加固

### 3.1 密码重置

**路由**：
- `POST /api/v1/auth/password/request-challenge` — 发起找回密码（统一返回泛化提示，防枚举）
- `POST /api/v1/auth/password/verify-code` — 校验验证码，换取 `resetTicket`
- `POST /api/v1/auth/password/redeem-link` — 兑换邮件链接，换取 `resetTicket`
- `POST /api/v1/auth/password/reset` — 消费 ticket 重置密码，递增 `session_version`

**邮件模板**：`server/services/auth/templates/reset-password.html`

### 3.2 已登录修改密码

- `POST /api/v1/auth/password/change` — `{ currentPassword, newPassword }`
- 校验旧密码 + 弱密码拦截
- 成功后递增 `session_version`（其他设备会话失效），刷新 `last_strong_auth_at`，当前会话保持

### 3.3 session_version 失效机制

- 密码重置、强制下线、安全风险事件后递增
- 会话恢复时必须匹配当前版本

### 3.4 临时邮箱黑名单

- `config/temp-email-blocklist.txt` — 注册与换绑邮箱前检查

### 3.5 Auth 专项限流

- 单邮箱 challenge 发送上限：1 小时 5 次
- challenge 重发冷却：60 秒
- 登录失败：单账号 15 分钟 10 次、单设备 10 分钟 20 次
- 找回密码：单邮箱 1 小时 3 次
- 注册：单 IP 10 分钟 20 次
- NAT/校园网友好策略：优先按"账号+设备ID+精确IP"收敛

### 3.6 前端页面

- `ForgotPasswordPage.tsx` — 找回密码两步表单

---

## Phase 4 — CppLearn OIDC

### 4.1 OIDC 对接

- `server/services/auth/oidcService.ts` — 使用 `openid-client` v6（原生 ESM）
- Discovery / PKCE / `state.intent` (login/register/bind) / nonce / code exchange

### 4.2 路由

- `GET /api/v1/auth/oidc/cpplearn/start` — 发起 OIDC 流程
- `GET /api/v1/auth/oidc/cpplearn/callback` — 后端独占回调

### 4.3 OAuth/OIDC Callback 决策表

| intent   | 会话状态    | 绑定情况   | 系统动作                                     |
| -------- | ----------- | ---------- | -------------------------------------------- |
| login    | 无登录      | 已绑定     | 建立会话，302 到 Dashboard                   |
| login    | 无登录      | 未绑定     | 签发 `complete_profile_ticket`，提示需注册   |
| register | 无登录      | 未绑定     | 签发 `complete_profile_ticket`，进入资料补齐 |
| register | 无登录      | 已绑定     | 直接建立会话（已注册用户）                   |
| bind     | 已登录+匹配 | 未绑定     | 绑定到当前账号                               |
| bind     | 已登录+匹配 | 已绑定当前 | 幂等成功                                     |
| bind     | 已登录+匹配 | 已绑定其他 | 拒绝绑定                                     |

### 4.4 统一 complete-profile

- `POST /api/v1/auth/complete-profile` — 消费 `completeProfileTicket`，设置用户名+密码
- 密码规则与邮箱注册一致；若目标账号为管理员，必须满足管理员密码强度策略
- 未设密码不得完成注册

### 4.5 provider_email 采用规则

- `external_identities.provider_email` 只是候选信息
- 若用户选择采用，登录后立即发起 `change_email` challenge
- challenge 成功后才写入 `user_emails`

> **同邮箱策略**：当 OIDC 回调中 `provider_email` 与已有本地账号邮箱一致时，**不自动合并**账号。用户需先以本地账号登录，再通过 `bind` 流程主动绑定；绑定前系统触发邮箱 challenge 以证明所有权。

### 4.6 开放跳转防护 `safeReturnTo`

- `config/auth.ts` 导出 `safeReturnTo(input)` 函数
- 只接受站内相对路径（以 `/` 开头且不以 `//` 开头）
- 解析后 origin 必须与当前站点一致
- 拒绝绝对 URL、`javascript:`、`data:` 协议
- 先 `decodeURIComponent` 后再校验一次
- 不合法统一回 `/`

### 4.7 bind 会话快照

- `state.intent='bind'` 额外携带 `user_id + session_id_hash + session_version_snapshot`
- callback 时要求与当前登录会话一致

### 4.8 前端页面

- `AuthCallbackPage.tsx` — 统一过渡页

---

## Phase 4.5 — QQ互联 OAuth 2.0（Feature Flag）

- `server/services/auth/providerService.ts` — QQ OAuth 2.0 adapter
- `GET /api/v1/auth/external/:provider/start` — 发起 OAuth 流程
- `GET /api/v1/auth/external/:provider/callback` — 后端独占回调
- `AUTH_PROVIDER_QQ_ENABLED=0` 默认关闭
- `GET /api/v1/auth/providers` — 返回当前启用的登录方式，前端据此动态渲染按钮

> **当前实现对齐（2026-04-28）**：QQ OAuth adapter 仍未实现，`AUTH_PROVIDER_QQ_ENABLED=1` 仅把 `qq` 放入 `authProviderPlaceholders` / `placeholders` 用于登录页视觉占位；`enabledAuthProviders` / `providers` 不包含 `qq`，避免前端把 501 占位接口展示成可用登录流程。完整登录 / 注册 / 绑定跑通后，才可把 `qq` 移入可用 provider。

---

## Phase 5 — Passkey (WebAuthn)

### 5.1 Passkey 登录

- `POST /api/v1/auth/login/passkey/options` — 获取登录 challenge
- `POST /api/v1/auth/login/passkey/verify` — 校验并建立会话
- 使用 `@simplewebauthn/server` + `@simplewebauthn/browser`
- 登录成功刷新 `last_strong_auth_at`

### 5.2 Passkey 绑定与解绑

- `POST /api/v1/auth/passkeys/register/options` — 申请绑定
- `POST /api/v1/auth/passkeys/register/verify` — 完成绑定
- `DELETE /api/v1/auth/passkeys/:credentialId` — 解绑

### 5.3 前端页面

- `AccountSecurityPage.tsx` — 账号安全页（密码修改 / 邮箱换绑 / Passkey / 第三方身份绑定与解绑）

---

## Phase 6 — 角色管理 + Admin Step-up

### 6.1 角色判定中间件

- `server/middleware/auth.ts` — Session 鉴权 + `requireRole('admin'|'coach')` 守卫

### 6.2 Admin 用户管理

- `GET /api/v1/admin/users` — 用户列表（分页 + 角色过滤）
- `PATCH /api/v1/admin/users/:uid` — 修改用户角色
- `DELETE /api/v1/admin/users/:uid` — 软删除（禁用）：将 `status` 设为 `'deleted'`、写入 `deleted_at`，递增 `session_version`（立即踢下线）
- `POST /api/v1/admin/users/:uid/restore` — 恢复账号：将 `status` 设回 `'active'`、清空 `deleted_at`
  - 软删除用户不可登录（登录时检查 `status != 'deleted'`）
  - 班级关联、作答历史等保留，仅屏蔽显示

> **用户创建**：所有用户（含 coach/admin）均只能通过自助注册流程创建，Admin 不提供后台创建用户接口。角色提升通过 `PATCH` 修改。
> **首个管理员引导**：唯一例外是部署引导脚本 `scripts/initAdmin.ts`。脚本固定引导用户名 `elder`，从 `ROUND1_INITIAL_ADMIN_PASSWORD` 读取临时密码，必须满足管理员密码强度，并写入 `password_change_required=true`；首次登录后仅允许改密或登出，改密成功后清除此标记并递增 `session_version`。

### 6.3 Admin Step-up（Passkey / TOTP）

- `server/middleware/requireRecentAuth.ts` — 校验 `last_strong_auth_at`，超出 `AUTH_STEP_UP_WINDOW_MINUTES`（默认 10，可通过 .env 配置）分钟返回 `401 REAUTH_REQUIRED`
- `POST /api/v1/auth/reauth/passkey/options` — step-up Passkey challenge
- `POST /api/v1/auth/reauth/passkey/verify` — step-up Passkey 校验
- `POST /api/v1/auth/totp/enroll/start` — 开始绑定 TOTP
- `POST /api/v1/auth/totp/enroll/verify` — 确认 TOTP 绑定
- `POST /api/v1/auth/reauth/totp` — step-up TOTP 校验
- `DELETE /api/v1/auth/totp` — 解绑 TOTP

**TOTP 信封加密方案**：
- 算法：AES-256-GCM + 信封加密（DEK + KEK）
- DEK（数据加密密钥）：每条 TOTP secret 随机生成独立 DEK
- KEK（密钥加密密钥）：通过 `TOTP_ENCRYPTION_KEK` 环境变量配置，用于加密 DEK
- 随机 12 字节 IV，存储格式：`IV:encryptedDEK:ciphertext:authTag`
- 轮换 KEK 时只需重新加密 DEK 层，无需解密全部 TOTP secret

### 6.4 Admin TOTP 强制要求

- `role='admin'` 账号必须绑定 Passkey 或 TOTP
- 前端 `/admin` 首次进入时检测并引导绑定

### 6.5 Admin 操作审计

- `server/middleware/adminAudit.ts` — 写入 `admin_audit_logs`（含 `before_json`/`after_json`/`reauth_method`）
- 所有 admin 变更路由挂载此中间件

### 6.6 邮箱换绑

- `POST /api/v1/auth/email/change/request-challenge`
- `POST /api/v1/auth/email/change/verify-code`
- `POST /api/v1/auth/email/change/redeem-link`
- `POST /api/v1/auth/email/change/confirm`

**邮件模板**：`server/services/auth/templates/change-email.html`

### 6.7 第三方身份解绑

- `DELETE /api/v1/auth/external/:provider`

### 6.8 登出

- `POST /api/v1/auth/logout` — 销毁 session + 清除 cookie

---

## 验证清单

- [x] 邮箱注册（验证码/链接两条路径）→ 登录成功
- [x] 密码登录（用户名/邮箱） → session cookie 生效（登录响应时间 < 500ms）
- [x] 找回密码 → 重置 → 旧会话失效
- [x] 已登录修改密码 → 其他设备会话失效
- [x] zxcvbn 弱密码拦截生效（score < 3 被拒绝）
- [x] CppLearn OIDC 登录/注册/绑定三类流程跑通
- [ ] QQ互联（feature flag=1 时）登录/注册/绑定跑通（当前仅视觉占位，未进入可用 provider）
- [x] Passkey 绑定 → 登出 → Passkey 登录 → 解绑
- [x] Admin step-up：改角色 → 401 REAUTH_REQUIRED → Passkey/TOTP 复核 → 重放成功
- [x] Admin 审计日志可追溯
- [x] 邮箱换绑流程跑通
- [x] 第三方身份已绑定到其他账号 → 返回冲突状态
- [x] 临时邮箱黑名单拦截
- [x] 各频控规则生效
- [x] FingerprintJS 设备指纹写入 audit log
- [x] TOTP 信封加密存储正确（DEK+KEK）
