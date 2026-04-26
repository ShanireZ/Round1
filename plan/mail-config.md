# 邮件发送配置指南

> Round1 支持三种邮件发送方式：Resend、Postmark、腾讯云 SES。选择任一即可。

---

## 1. 环境变量总览

所有邮件配置项写入项目根目录的 `.env` 文件。

```env
# ── 通用配置 ──────────────────────────────────────────────
MAIL_PROVIDER=resend           # 可选值: resend | postmark | tencent-ses
MAIL_FROM=noreply@example.com  # 发件人地址（必须与域名验证一致）

# ── Resend（仅 MAIL_PROVIDER=resend 时需要）───────────────
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ── Postmark（仅 MAIL_PROVIDER=postmark 时需要）──────────
POSTMARK_SERVER_TOKEN=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# ── 腾讯云 SES（仅 MAIL_PROVIDER=tencent-ses 时需要）──────
TENCENT_SES_SECRET_ID=<你的腾讯云-SecretId>
TENCENT_SES_SECRET_KEY=<你的腾讯云-SecretKey>
TENCENT_SES_REGION=ap-hongkong   # 可选: ap-hongkong, ap-guangzhou 等
```

> **只需配置你选择的 provider 对应的环境变量**，其他 provider 的变量留空即可。

---

## 2. 方案一：Resend（推荐）

[Resend](https://resend.com) 是面向开发者的现代邮件 API，免费额度 100 封/天，API 调用简洁。

### 2.1 申请步骤

1. 注册 [Resend 账户](https://resend.com/signup)
2. Dashboard → Domains → 添加你的域名
3. 按提示在 DNS 添加 MX、SPF、DKIM 记录
4. 等待域名验证通过（通常几分钟内）
5. Dashboard → API Keys → 创建新的 API Key

### 2.2 配置参数

| 环境变量         | 说明                     | 示例                                  |
| ---------------- | ------------------------ | ------------------------------------- |
| `MAIL_PROVIDER`  | 固定 `resend`            | `resend`                              |
| `MAIL_FROM`      | 发件人地址（已验证域名） | `Round1 <noreply@round1.example.com>` |
| `RESEND_API_KEY` | API Key                  | `re_123456789...`                     |

```env
MAIL_PROVIDER=resend
MAIL_FROM=Round1 <noreply@round1.example.com>
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 2.3 免费额度

- 100 封/天（每月 ~3000 封）
- 超出后 $0.5/1000 封
- 足够中小项目使用

---

## 3. 方案二：Postmark

[Postmark](https://postmarkapp.com) 以高送达率著称，专注事务性邮件，开发者体验优秀。

### 3.1 申请步骤

1. 注册 [Postmark 账户](https://account.postmarkapp.com/sign_up)
2. 创建 Server（如 `round1-production`）
3. Sender Signatures → 添加并验证发信域名（配置 DKIM、Return-Path DNS 记录）
4. Server → API Tokens → 复制 Server API Token

### 3.2 配置参数

| 环境变量                | 说明                     | 示例                                  |
| ----------------------- | ------------------------ | ------------------------------------- |
| `MAIL_PROVIDER`         | 固定 `postmark`          | `postmark`                            |
| `MAIL_FROM`             | 发件人地址（已验证域名） | `Round1 <noreply@round1.example.com>` |
| `POSTMARK_SERVER_TOKEN` | Server API Token         | `xxxxxxxx-xxxx-xxxx-xxxx-xxxx...`     |

```env
MAIL_PROVIDER=postmark
MAIL_FROM=Round1 <noreply@round1.example.com>
POSTMARK_SERVER_TOKEN=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

### 3.3 免费额度

- 每月 100 封免费（用于测试）
- 付费起步 $15/月，含 10,000 封
- 送达率业界领先（>99%），适合对邮件到达率要求高的场景

---

## 4. 方案三：腾讯云 SES

[腾讯云邮件发送（SES）](https://cloud.tencent.com/product/ses) 适合国内部署，支持 SMTP 协议。

### 4.1 申请步骤

1. 登录 [腾讯云控制台](https://console.cloud.tencent.com/ses) → 开通邮件发送服务
2. 邮件发送 → 发信域名 → 新建发信域名
3. 按提示配置 DNS 记录（SPF、DKIM、MX、DMARC）
4. 等待域名验证通过
5. 发信地址 → 新建发信地址
6. 获取 Secret ID 和 Secret Key：[访问密钥管理](https://console.cloud.tencent.com/cam/capi)

### 4.2 配置参数

| 环境变量                 | 说明               | 示例                              |
| ------------------------ | ------------------ | --------------------------------- |
| `MAIL_PROVIDER`          | 固定 `tencent-ses` | `tencent-ses`                     |
| `MAIL_FROM`              | 已验证的发信地址   | `noreply@mail.round1.example.com` |
| `TENCENT_SES_SECRET_ID`  | 腾讯云 SecretId    | `<控制台获取>`                    |
| `TENCENT_SES_SECRET_KEY` | 腾讯云 SecretKey   | `<控制台获取>`                    |
| `TENCENT_SES_REGION`     | 地域               | `ap-hongkong`                     |

```env
MAIL_PROVIDER=tencent-ses
MAIL_FROM=noreply@mail.round1.example.com
TENCENT_SES_SECRET_ID=<你的腾讯云-SecretId>
TENCENT_SES_SECRET_KEY=<你的腾讯云-SecretKey>
TENCENT_SES_REGION=ap-hongkong
```

### 4.3 可用地域

| 地域 | 值             |
| ---- | -------------- |
| 香港 | `ap-hongkong`  |
| 广州 | `ap-guangzhou` |

### 4.4 免费额度

- 每日 1000 封免费
- 国内发信延迟低

---

## 5. DNS 配置要点（通用）

无论选择哪个方案，建议为发信域名配置以下 DNS 记录以提高送达率：

| 记录类型  | 名称                      | 说明                                           |
| --------- | ------------------------- | ---------------------------------------------- |
| **SPF**   | TXT `@`                   | `v=spf1 include:xxx ~all` — 允许邮件服务商代发 |
| **DKIM**  | TXT `selector._domainkey` | 由邮件服务商提供的公钥 — 验证邮件签名          |
| **DMARC** | TXT `_dmarc`              | `v=DMARC1; p=quarantine; rua=...` — 防止仿冒   |
| **MX**    | MX `@`                    | 部分服务商要求 MX 指向自身                     |

> 具体记录值由各邮件服务商提供，在其控制台中查看。

---

## 6. 推荐方案

| 场景                | 推荐       | 原因                             |
| ------------------- | ---------- | -------------------------------- |
| **开发 / 小项目**   | Resend     | 免费额度够用，API 简洁，默认方案 |
| **生产 - 高送达率** | Postmark   | 送达率 >99%，适合事务性邮件      |
| **生产 - 国内**     | 腾讯云 SES | 延迟低，每日 1000 封免费         |

---

## 7. 测试验证

配置完成后，可通过注册流程测试邮件发送：

1. 启动 Round1 服务
2. 调用注册接口 `POST /api/v1/auth/register/email/request-challenge`
3. 检查目标邮箱是否收到验证码邮件
4. 检查服务端日志中 `Email sent` 记录

开发环境下（`NODE_ENV=development`），邮件内容会完整打印到日志，便于调试。
