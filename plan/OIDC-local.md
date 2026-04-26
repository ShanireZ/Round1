# CppLearn OIDC 对接指南

> 本文档面向 **CppLearn 开发侧**，说明如何实现 OIDC Provider（OP），使 CppLearn 用户可一键登录/注册/绑定 Round1 平台。

---

## 1. 协议概述

Round1 作为 **Relying Party（RP）**，使用 [OpenID Connect 1.0](https://openid.net/specs/openid-connect-core-1_0.html) 的 **Authorization Code Flow + PKCE** 与 CppLearn OIDC Provider 对接。

```
┌──────────┐         ┌──────────┐         ┌──────────────┐
│  Browser  │ ──(1)──▶│  Round1  │ ──(2)──▶│  CppLearn OP │
│           │◀──(7)── │  (RP)    │◀──(5)── │              │
│           │ ──(3)──▶│          │ ──(4)──▶│  /authorize  │
│           │◀──(6)── │          │         │  /token      │
└──────────┘         └──────────┘         └──────────────┘

(1) 用户点击 "CppLearn 登录"
(2) Round1 构建 Authorization URL，302 重定向
(3) 浏览器跳转到 CppLearn 授权页
(4) 用户授权后，CppLearn 302 回调 Round1
(5) Round1 后端用 authorization_code 换取 tokens
(6) Round1 从 id_token 提取用户信息
(7) 完成登录/注册/绑定流程
```

---

## 2. CppLearn 需实现的端点

### 2.1 Discovery 端点（必须）

```
GET {ISSUER_URL}/.well-known/openid-configuration
```

返回 JSON，至少包含以下字段：

```jsonc
{
  "issuer": "https://cpplearn.example.com",
  "authorization_endpoint": "https://cpplearn.example.com/oauth/authorize",
  "token_endpoint": "https://cpplearn.example.com/oauth/token",
  "userinfo_endpoint": "https://cpplearn.example.com/oauth/userinfo",   // 可选，但推荐
  "jwks_uri": "https://cpplearn.example.com/.well-known/jwks.json",
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code"],
  "subject_types_supported": ["public"],
  "id_token_signing_alg_values_supported": ["RS256"],
  "scopes_supported": ["openid", "email", "profile"],
  "code_challenge_methods_supported": ["S256"],
  "token_endpoint_auth_methods_supported": ["client_secret_post", "client_secret_basic"]
}
```

### 2.2 Authorization 端点

```
GET /oauth/authorize
```

**请求参数**（Query String）：

| 参数                    | 类型   | 必须 | 说明                                |
| ----------------------- | ------ | ---- | ----------------------------------- |
| `response_type`         | string | ✅    | 固定 `code`                         |
| `client_id`             | string | ✅    | Round1 的 client_id                 |
| `redirect_uri`          | string | ✅    | Round1 回调地址                     |
| `scope`                 | string | ✅    | `openid email profile`              |
| `state`                 | string | ✅    | Round1 传入的不透明字符串，原样返回 |
| `nonce`                 | string | ✅    | 随机值，嵌入 id_token               |
| `code_challenge`        | string | ✅    | PKCE S256 challenge                 |
| `code_challenge_method` | string | ✅    | 固定 `S256`                         |

**行为**：
1. 展示授权页面，用户确认授权
2. 成功后 302 重定向到 `redirect_uri?code={authorization_code}&state={state}`
3. 失败时 302 重定向到 `redirect_uri?error={error_code}&error_description={message}&state={state}`

### 2.3 Token 端点

```
POST /oauth/token
Content-Type: application/x-www-form-urlencoded
```

**请求参数**：

| 参数            | 类型   | 必须 | 说明                            |
| --------------- | ------ | ---- | ------------------------------- |
| `grant_type`    | string | ✅    | 固定 `authorization_code`       |
| `code`          | string | ✅    | 上一步获得的 authorization_code |
| `redirect_uri`  | string | ✅    | 与授权请求相同                  |
| `client_id`     | string | ✅    | Round1 的 client_id             |
| `client_secret` | string | ✅    | Round1 的 client_secret         |
| `code_verifier` | string | ✅    | PKCE 原始 verifier              |

**响应**（200 OK）：

```jsonc
{
  "access_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "id_token": "eyJ...",       // JWT，必须包含
  "scope": "openid email profile"
}
```

**PKCE 校验**：`SHA256(code_verifier)` 的 base64url 编码必须等于授权时传入的 `code_challenge`。

### 2.4 JWKS 端点

```
GET /.well-known/jwks.json
```

返回用于验证 `id_token` 签名的 RSA 公钥集合（JWK Set）：

```jsonc
{
  "keys": [
    {
      "kty": "RSA",
      "kid": "key-id-1",
      "use": "sig",
      "alg": "RS256",
      "n": "...",
      "e": "AQAB"
    }
  ]
}
```

---

## 3. ID Token 规范

`id_token` 是一个 JWT（RS256 签名），**Claims** 需包含：

| Claim   | 类型         | 必须 | 说明                                    |
| ------- | ------------ | ---- | --------------------------------------- |
| `iss`   | string       | ✅    | Issuer，与 Discovery 中的 `issuer` 一致 |
| `sub`   | string       | ✅    | 用户唯一标识（不可变，不可重用）        |
| `aud`   | string/array | ✅    | 值为 Round1 的 `client_id`              |
| `exp`   | number       | ✅    | 过期时间（Unix 时间戳），建议 5-60 分钟 |
| `iat`   | number       | ✅    | 签发时间                                |
| `nonce` | string       | ✅    | 与授权请求中传入的 nonce 一致           |
| `email` | string       | 推荐 | 用户邮箱（CppLearn 注册邮箱）           |
| `name`  | string       | 推荐 | 显示名称 / 昵称                         |

### 关键约束

- **`sub` 必须是稳定的、不可变的**。即使用户改名/改邮箱，`sub` 也不能变。推荐使用数据库主键或 UUID
- `email` 非必须，但如果提供，Round1 会作为 `provider_email` 存储，用户登录后可选择采用
- `name` 非必须，但如果提供，Round1 会作为页面显示名称候选

---

## 4. 客户端注册

CppLearn 需要为 Round1 注册一个 OAuth Client，提供以下信息：

### Round1 → CppLearn（由 Round1 提供）

| 项目             | 值                                                           |
| ---------------- | ------------------------------------------------------------ |
| **Redirect URI** | `https://{ROUND1_DOMAIN}/api/v1/auth/oidc/cpplearn/callback` |
| **Scopes**       | `openid email profile`                                       |
| **Grant Type**   | `authorization_code`                                         |
| **Token Auth**   | `client_secret_post` 或 `client_secret_basic`                |

### CppLearn → Round1（由 CppLearn 签发）

| 项目            | 说明                                                          |
| --------------- | ------------------------------------------------------------- |
| `client_id`     | CppLearn 为 Round1 分配的客户端 ID                            |
| `client_secret` | 客户端密钥（至少 32 字符，安全随机生成）                      |
| `issuer`        | CppLearn OIDC Issuer URL（如 `https://cpplearn.example.com`） |

Round1 侧将这些值配置到环境变量：

```env
CPPLEARN_OIDC_ISSUER=https://cpplearn.example.com
CPPLEARN_OIDC_CLIENT_ID=<由CppLearn签发>
CPPLEARN_OIDC_CLIENT_SECRET=<由CppLearn签发>
CPPLEARN_OIDC_REDIRECT_URI=https://round1.example.com/api/v1/auth/oidc/cpplearn/callback
```

---

## 5. 安全要求

| 要求                      | 说明                                                               |
| ------------------------- | ------------------------------------------------------------------ |
| **HTTPS**                 | 所有端点必须使用 HTTPS                                             |
| **PKCE**                  | 必须支持 S256 code_challenge_method                                |
| **State**                 | 必须原样回传 state 参数                                            |
| **Nonce**                 | 必须在 id_token 中包含请求时的 nonce                               |
| **CORS**                  | Token 端点无需 CORS（Round1 使用后端 server-to-server 调用）       |
| **Authorization Code**    | 一次性使用，有效期建议 ≤ 10 分钟                                   |
| **Redirect URI 严格匹配** | 只允许预注册的 redirect_uri，不允许通配符                          |
| **client_secret 保密**    | 客户端密钥仅在后端使用，不暴露给前端                               |
| **密钥轮换**              | 建议 JWKS 支持多 key（用 `kid` 区分），便于密钥轮换时新旧 key 共存 |

---

## 6. Round1 回调行为说明

Round1 收到回调后，根据 `state` 中编码的 `intent` 执行不同逻辑：

| intent     | 用户状态 | 绑定情况   | 系统动作                         |
| ---------- | -------- | ---------- | -------------------------------- |
| `login`    | 未登录   | 已绑定     | 建立会话，跳转到首页             |
| `login`    | 未登录   | 未绑定     | 签发 ticket，跳转到资料补齐页    |
| `register` | 未登录   | 未绑定     | 签发 ticket，进入用户名/密码设置 |
| `register` | 未登录   | 已绑定     | 直接登录（已注册用户）           |
| `bind`     | 已登录   | 未绑定     | 绑定 CppLearn 身份到当前账号     |
| `bind`     | 已登录   | 已绑定当前 | 幂等成功                         |
| `bind`     | 已登录   | 已绑定其他 | 拒绝绑定                         |

> **注意**：Round1 在 `state` 参数中编码了 `intent` 信息，CppLearn **无需解析**，只需原样回传。

---

## 7. 测试清单

CppLearn 完成 OP 实现后，请确认以下测试项：

- [ ] Discovery 端点返回格式正确，`issuer` 与实际 URL 一致
- [ ] JWKS 端点返回有效的 RSA 公钥
- [ ] Authorization 请求正确处理 `state`、`nonce`、`code_challenge`
- [ ] Token 端点正确校验 PKCE `code_verifier`
- [ ] `id_token` 中 `sub` 稳定不变
- [ ] `id_token` 中 `nonce` 与请求一致
- [ ] `id_token` 中 `aud` 等于配置的 `client_id`
- [ ] Authorization code 为一次性使用
- [ ] 拒绝未注册的 `redirect_uri`
- [ ] HTTPS 全链路

---

## 8. 参考实现

如果 CppLearn 后端为 Node.js，推荐使用 [`oidc-provider`](https://github.com/panva/node-oidc-provider) 包快速搭建：

```bash
npm install oidc-provider
```

```typescript
import Provider from "oidc-provider";

const oidc = new Provider("https://cpplearn.example.com", {
  clients: [
    {
      client_id: "round1",
      client_secret: "your-secure-secret-at-least-32-chars",
      redirect_uris: ["https://round1.example.com/api/v1/auth/oidc/cpplearn/callback"],
      grant_types: ["authorization_code"],
      response_types: ["code"],
      scope: "openid email profile",
      token_endpoint_auth_method: "client_secret_post",
    },
  ],
  scopes: ["openid", "email", "profile"],
  claims: {
    openid: ["sub"],
    email: ["email"],
    profile: ["name"],
  },
  pkce: {
    required: () => true,
    methods: ["S256"],
  },
  // 自定义 findAccount 逻辑
  async findAccount(ctx, id) {
    // 从数据库查找用户
    const user = await db.findUserById(id);
    return user
      ? {
          accountId: user.id,
          async claims(use, scope) {
            const claims: Record<string, unknown> = { sub: user.id };
            if (scope.includes("email")) claims.email = user.email;
            if (scope.includes("profile")) claims.name = user.displayName;
            return claims;
          },
        }
      : undefined;
  },
});

// 挂载到 Express / Koa
app.use("/oidc", oidc.callback());
```

如果 CppLearn 后端为 Python，推荐 [`authlib`](https://docs.authlib.org/en/latest/flask/2/openid-connect.html)。

---

## 9. 联调流程

1. CppLearn 部署 OIDC Provider，确保 Discovery 端点可访问
2. CppLearn 为 Round1 注册 Client，提供 `client_id` / `client_secret` / `issuer`
3. Round1 配置环境变量
4. 在开发环境测试三种 intent（login / register / bind）
5. 确认 `sub` claim 在用户生命周期内稳定不变
6. 生产部署
