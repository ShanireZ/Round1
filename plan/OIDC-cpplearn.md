# CppLearn OIDC 对接指南

> 本文档收口当前 **CppLearn 分支实现** 对接 Round1 的 OIDC Provider 合同，并给出 Round1 接入时必须使用的关键参数。

---

## 1. 当前实现结论

CppLearn 当前按 **Authorization Code Flow + PKCE** 提供 OIDC 登录能力，面向 Round1 的固定协议面如下：

- Discovery: `GET {ISSUER_URL}/.well-known/openid-configuration`
- Authorization: `GET {ISSUER_URL}/oauth/authorize`
- Token: `POST {ISSUER_URL}/oauth/token`
- UserInfo: `GET {ISSUER_URL}/oauth/userinfo`
- JWKS: `GET {ISSUER_URL}/.well-known/jwks.json`
- Revocation: `POST {ISSUER_URL}/oauth/revoke`

固定安全基线：

- 仅支持 `authorization_code`
- 强制 PKCE，`code_challenge_method` 固定 `S256`
- ID Token 签名算法固定 `RS256`
- Redirect URI 必须逐项精确匹配
- Phase 1 不发放 Refresh Token

---

## 2. Discovery 关键字段

CppLearn Discovery 至少应满足以下合同：

```json
{
  "issuer": "https://cpplearn.example.com",
  "authorization_endpoint": "https://cpplearn.example.com/oauth/authorize",
  "token_endpoint": "https://cpplearn.example.com/oauth/token",
  "userinfo_endpoint": "https://cpplearn.example.com/oauth/userinfo",
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

---

## 3. Claims 合同

`id_token` / `userinfo` 当前按以下语义输出：

| Claim   | 说明                       | 当前实现                                         |
| ------- | -------------------------- | ------------------------------------------------ |
| `sub`   | 稳定且不可变的外部身份标识 | 由 `oauth_subjects.subject` 持久化               |
| `name`  | Round1 可用于显示的名称    | 取 `users.nickname`，缺失时回退 `users.username` |
| `email` | Round1 预留的邮箱字段      | 当前固定返回空字符串 `""`                        |

必备 JWT Claims 仍需包含：

- `iss`
- `sub`
- `aud`
- `exp`
- `iat`
- `nonce`

> 当前 CppLearn 没有可用邮箱事实源，因此即使请求了 `email` scope，返回的 `email` claim 也固定为空字符串。Round1 侧必须按“字段存在但值为空”处理，不能把空字符串当成可绑定邮箱。

---

## 4. Round1 必须使用的关键参数

### Round1 -> CppLearn 注册参数

| 项目          | 当前值 / 规则                                                   |
| ------------- | --------------------------------------------------------------- |
| Redirect URI  | `https://{ROUND1_DOMAIN}/api/v1/auth/oidc/cpplearn/callback`    |
| Scope         | `openid email profile`                                          |
| Grant Type    | `authorization_code`                                            |
| Response Type | `code`                                                          |
| PKCE          | 必须启用，方法固定 `S256`                                       |
| Token Auth    | 推荐并默认 `client_secret_post`，兼容支持 `client_secret_basic` |

### CppLearn -> Round1 提供参数

| 项目                | 说明                                                      |
| ------------------- | --------------------------------------------------------- |
| `issuer`            | CppLearn OIDC Issuer，例如 `https://cpplearn.example.com` |
| `client_id`         | 由 CppLearn 预注册签发给 Round1                           |
| `client_secret`     | 由 CppLearn 预注册签发给 Round1                           |
| `jwks_uri`          | `{ISSUER_URL}/.well-known/jwks.json`                      |
| `userinfo_endpoint` | `{ISSUER_URL}/oauth/userinfo`                             |

---

## 5. CppLearn 环境变量

CppLearn 侧当前使用以下环境变量控制 OIDC Provider：

```env
OAUTH_ISSUER=https://cpplearn.example.com
OAUTH_JWKS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
...
-----END PRIVATE KEY-----"
OAUTH_JWKS_KID=cpplearn-signing-key-20260417-v1
OAUTH_ROUND1_CLIENT_ID=round1-web
OAUTH_ROUND1_CLIENT_SECRET=<一段高强度随机字符串>
OAUTH_ROUND1_TOKEN_ENDPOINT_AUTH_METHOD=client_secret_post
OAUTH_ROUND1_REDIRECT_URIS=https://round1.example.com/api/v1/auth/oidc/cpplearn/callback

```

约束：

- `OAUTH_ROUND1_TOKEN_ENDPOINT_AUTH_METHOD` 只允许：
  - `client_secret_post`
  - `client_secret_basic`
- `OAUTH_ROUND1_REDIRECT_URIS` 必须与 Round1 实际回调地址逐项精确匹配

说明：

- OAUTH_ISSUER
填 CppLearn 对外的 HTTPS 根地址，建议不要带尾部 /，也不要带路径。比如 https://cpplearn.example.com。
- OAUTH_JWKS_PRIVATE_KEY
填 RSA 私钥的 PEM 内容本身，不是文件路径。当前实现固定要求 RS256，所以这里必须是 RSA 私钥。
```powershell
cd /certs
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem
```
- OAUTH_JWKS_KID
填这把签名 key 的标识符。它不是密钥，可以是可读字符串，比如 cpplearn-signing-key-20260417-v1。
- OAUTH_ROUND1_CLIENT_ID
填 Round1 在 CppLearn 里的预注册客户端 ID。建议固定成稳定值，比如 round1-web。
- OAUTH_ROUND1_CLIENT_SECRET
填 Round1 的客户端密钥。必须高强度随机，建议至少 48 字节随机数转成 base64url。
- OAUTH_ROUND1_TOKEN_ENDPOINT_AUTH_METHOD
推荐填 client_secret_post。只有当 Round1 明确按 Basic 方式换 token 时，才改成 client_secret_basic。
- OAUTH_ROUND1_REDIRECT_URIS
填 Round1 回调地址，必须和 Round1 实际请求里带的 redirect_uri 完全一致。多个地址就英文逗号分隔。

---

## 6. Round1 环境变量示例

Round1 接入时可按以下形式配置：

```env
CPPLEARN_OIDC_ISSUER=https://cpplearn.example.com
CPPLEARN_OIDC_CLIENT_ID=<由CppLearn签发>
CPPLEARN_OIDC_CLIENT_SECRET=<由CppLearn签发>
CPPLEARN_OIDC_REDIRECT_URI=https://round1.example.com/api/v1/auth/oidc/cpplearn/callback
```

---

## 7. 联调检查点

- Discovery 返回的 `issuer`、`jwks_uri`、`userinfo_endpoint` 与实际部署地址一致
- Round1 授权请求必须带 `scope=openid email profile`
- Round1 Token 交换必须使用注册时约定的 client auth 方式
- `sub` 在同一 CppLearn 用户生命周期内保持稳定不变
- `email` 返回空字符串时，Round1 不得据此自动认领本地账号
