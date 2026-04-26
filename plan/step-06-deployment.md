# Step 06 — 部署与上线（Phase 14）

> **前置依赖**：Step 01–05 全部完成
> **交付物**：独立域名可访问的生产环境，含完整监控、备份与优雅停机
> **可验证 demo**：独立域名可访问，健康检查全绿
> **配置参考**：数据库 Schema、.env 模板、目录结构等详见 [01-reference.md](01-reference.md)
> **当前对齐说明（2026-04-26）**：本文件描述的是目标部署形态，不是“当前仓库已具备一键上线能力”的现状快照。当前仓库已经完成“两层架构 + production no-runner”方向的代码收口：`scripts/workers/contentWorker.ts` 明确只属于离线内容环境，`config/processTypes.ts` 已把 `runtime-worker` / `content-worker` 进程身份中性化；但仓库内仍没有版本化 `ecosystem.config.js` 或统一的 `scripts/healthcheck.ts`，因此 Step 06 目前仍以部署 runbook 和人工演练清单为主，不能把 PM2 / 健康检查 / 域名验证描述成已自动化落地。

---

## Phase 14 — 生产部署

### 14.1 两层部署架构（生产运行时 + 离线内容环境）

默认目标架构已经调整为“两层”：

| 层级         | 角色               | 默认组件                                             | 说明                                                           |
| ------------ | ------------------ | ---------------------------------------------------- | -------------------------------------------------------------- |
| 生产运行时   | 在线考试与后台 API | Caddy + Express API + Redis + Postgres               | **不部署 cpp-runner，不消费 generation / sandbox verify 队列** |
| 离线内容环境 | 内容生产流水线     | generate / judge / cpp-runner / prebuilt paper build | 可部署在开发机、CI 机器或独立内容机，不要求 24x7 常驻          |

生产导入只接受已验证产物：

- 代码题的 `sandbox_verified` 必须由离线内容环境写入产物。
- 生产导入只做结构校验、哈希校验、知识点校验、引用完整性校验。
- 生产运行时不再现编译 / 运行代码题，不依赖 runner 健康检查。

早期小规模部署可采用单机 2C/4GB：同机运行 Caddy + API + Redis + Postgres；离线内容环境独立于生产运行时。

---

## 生产运行时部署清单

### 生产机（默认单机）

1. 安装 Node 24 LTS + Redis 7+ + postgreSQL 18
2. 克隆代码、`npm install` + `npm run build`
3. 配置 `.env`（见 [01-reference.md — 环境变量配置](reference-config.md#环境变量配置env)）
4. 安装并配置 Caddy（见 [14.2 Caddy 配置](#142-caddy-配置)）
5. 启动 `Round1-api` 进程
6. 执行首次部署初始化脚本（见 [01-reference.md — 首次部署初始化顺序](reference-ops.md#首次部署初始化顺序)）
7. 运行 API 与依赖检查：`curl -fsS https://round1.example.com/api/v1/health`

### 可选：数据库独立主机

当并发、备份窗口或数据库负载上升后，再把 Postgres 拆到独立主机：

1. 创建数据库 `round1`、应用用户，仅允许生产应用主机访问
2. 配置 `pg_hba.conf`：仅内网 `scram-sha-256` 认证，禁止外网
3. 迁移、备份、种子脚本仍从生产应用主机通过 `DATABASE_URL` 远程执行

## 离线内容环境部署清单

1. 安装 Node 24 LTS，按需安装 Redis（如需要 BullMQ 队列）
2. 安装 Docker + gVisor（`runsc` runtime）
3. 构建并启动 `cpp-runner`
4. 启动 `scripts/workers/contentWorker.ts`，仅消费 `generation` / `sandbox-verify` 队列
5. 执行 generate、judge、代码题离线校验、prebuilt paper 构建
6. 输出 question bundle / prebuilt paper bundle，再导入生产

---

### 14.2 Caddy 配置

- Cloudflare Origin CA 15 年源证书，Full (Strict) 加密模式
- 覆盖 `X-Forwarded-*` 头，防止客户端伪造：使用 `CF-Connecting-IP` 作为 `X-Forwarded-For`
- `reverse_proxy localhost:5100`
- `app.set('trust proxy', 1)`（一跳 = Caddy），严禁 `true`

### 14.3 PM2 配置

- `Round1-api`：cluster 模式 2 实例，端口 5100
- 生产默认**不启动 Worker**；当前目标运行时仅保留 Caddy + API + Redis + Postgres
- 若未来恢复运行时延迟任务，`Round1-worker` 只允许承载运行时队列，禁止消费 `generation` / `sandbox-verify`
- `Round1-content-worker` 仅存在于离线内容环境，不部署到生产运行时
- 当前仓库未提供版本化 `ecosystem.config.js`；PM2 app 名称与 ecosystem 文件路径应由部署环境自行管理
- 连接池配置详见 [01-reference.md — 连接池配置](01-reference.md)

### 14.4 生产构建与静态文件

- Vite 构建产物（`client/dist/`）由 **Caddy** 直接托管静态文件，Express 仅处理 API 请求
- Caddy 配置：
  - `root * /opt/round1/client/dist`
  - `file_server`
  - `try_files {path} /index.html`（SPA fallback）
  - `@api path /api/*`
  - `reverse_proxy @api localhost:5100`
- 散列文件名 → `Cache-Control: public, max-age=31536000, immutable`
- `index.html` → `Cache-Control: no-cache`

### 14.5 优雅停机

- Express 侦听 `SIGTERM` / `SIGINT` → 停止接受新连接 → 等待进行中请求完成（30s 超时）
- 生产运行时关闭顺序：API → Redis → Postgres 连接池
- 离线内容环境关闭顺序：content worker → Redis → Postgres / runner
- PM2 `kill_timeout: 35000` 配合优雅停机超时

### 14.6 Sentry 生产完善配置

- Phase 0 已完成基础接入
- 生产补充：采样率 `tracesSampleRate`、环境标记、Release 版本标记、`beforeSend` 敏感数据过滤

### 14.7 Postgres 备份

- 当前仓库尚无 `scripts/backup.ts`；生产环境直接使用 `pg_dump` / `pg_restore`
- 备份命令：`mkdir -p data/backups && pg_dump -Fc "$DATABASE_URL" -f data/backups/<timestamp>.dump`
- 频率：每日一次全量 + 每次部署前自动触发
- 保留最近 7 天，过期自动清理
- 恢复校验：`pg_restore` 到临时库 + `SELECT count(*)` 核心表行数校验 + 关键约束一致性检查，建议每周一次
- 备份完成后记录 `sha256` 校验和，恢复时先比对校验和确保文件完整

**异地备份**：
- 每日全量备份完成后，上传至对象存储（S3 兼容服务或 Backblaze B2）
- 保留策略：本地 7 天，远端 30 天
- RPO ≤ 24h，RTO ≤ 2h
- 每月执行一次恢复演练，验证远端备份可用性

### 14.8 数据库迁移回滚

- 每个迁移文件同时包含 `up` 和 `down`
- `tsx scripts/migrate.ts --down [count]`（默认回滚最近一次）
- 不可逆 `down` 脚本打印警告并要求 `--force`

### 14.8.1 线上迁移兼容规则

PM2 cluster + 平滑 reload 场景下，新旧代码可能短暂共存。为避免不兼容：
- **Expand 阶段**（先部署）：只做加列、加表、加索引等向后兼容变更
- **Code 部署**：部署引用新列/表的新代码
- **Contract 阶段**（后续部署）：删除旧列、旧表等不再使用的结构
- **禁止**：同一次部署中执行不兼容的删列 / 改列语义 / 重命名列

### 14.9 DNS 与邮件配置

- SPF、DKIM、DMARC 记录
- 建议专用发送子域（`mail.round1.example.com`）
- 部署检查清单增加邮件通道 SMTP EHLO 握手测试

### 14.10 Redis 降级策略

Redis 不可用时：
- 生产运行时若无 worker，主要影响 session / 频控；已导入题库与已发布预制卷仍可正常使用
- 离线内容环境的 generate / sandbox verify 队列暂停，但不影响已上线考试
- HTTP 频控降级：L3 进程内 Map fail-closed 兜底
- Session 丢失：已登录用户需重新登录（session 存储在 Redis）
- 核心答题数据不丢失（持久化在 Postgres）
- 部署检查清单检测并报警

### 14.11 错误监控与日志

- Sentry（后端未处理异常 + 前端运行时错误）
- PM2 日志轮转（`pm2-logrotate`）+ `grep` 检索
- 升级阈值：单次排障 > 30min 或日志量 > 1GB/day 时引入 Loki + Grafana

### 14.12 健康检查

当前仓库没有统一的 `scripts/healthcheck.ts`，部署时使用以下检查组合：

- `curl -fsS https://round1.example.com/api/v1/health`：检查 Express / Postgres / Redis。
- 邮件通道：执行 SMTP EHLO 或对应邮件供应商 API 探活。
- Turnstile：确认站点 key / secret 已配置，并完成一次真实验票。

离线内容环境单独执行：

- `curl -fsS http://127.0.0.1:6100/health`：检查 cpp-runner 可达。
- `scripts/workers/contentWorker.ts` 启动日志：确认只消费 `generation` / `sandbox-verify`。

> 应用专属运行时变量使用 `ROUND1_*` 前缀，其余按功能模块分组（如 `DATABASE_*`、`SESSION_*`、`AUTH_*`、`LLM_*` 等），详见 [01-reference.md — 环境变量配置](reference-config.md#环境变量配置env)。

---

## 手动部署 SOP

以下为常规生产运行时代码更新步骤：

```bash
# 1. 拉取最新代码
cd /opt/round1 && git pull origin main

# 2. 安装依赖（若 package-lock.json 有变更）
npm ci

# 3. 构建
npm run build

# 4. 部署前备份数据库
mkdir -p data/backups && pg_dump -Fc "$DATABASE_URL" -f data/backups/predeploy-$(date +%Y%m%d-%H%M%S).dump

# 5. 运行新增迁移（若有）
tsx scripts/migrate.ts up

# 6. 平滑重启（零停机）
pm2 reload <pm2-app-or-ecosystem>

# 7. 健康检查
curl -fsS https://round1.example.com/api/v1/health

# 8. 验证关键页面可访问
curl -sS https://round1.example.com/api/v1/health | jq
```

离线内容环境的 runner / content worker 升级与生产运行时解耦，独立执行，不作为生产上线阻塞步骤。

---

## 回滚流程

### 代码回滚

```bash
# 1. 回退到上一个 release tag
cd /opt/round1 && git checkout tags/<上一版本 tag>

# 2. 重新构建
npm ci && npm run build

# 3. 回滚迁移（若本次部署含新迁移）
tsx scripts/migrate.ts --down 1

# 4. 重启
pm2 reload <pm2-app-or-ecosystem>

# 5. 健康检查
curl -fsS https://round1.example.com/api/v1/health
```

> **版本管理约定**：每次部署前打 tag（格式 `v{date}-{seq}`，如 `v20260412-1`）。回滚后需创建新分支 `hotfix/<issue>` 修复问题，再合入主干并打新 tag 部署。

### 数据库回滚

```bash
# 从最近备份恢复（仅在迁移回滚不可逆时使用）
pg_restore --clean --if-exists --no-owner --dbname "$DATABASE_URL" data/backups/<最近备份>.dump

# 恢复后运行健康检查
curl -fsS https://round1.example.com/api/v1/health
```

### 回滚决策表

| 状况                       | 操作                                                                                                                                                                                           |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 新代码有 bug，无数据库迁移 | `git checkout` + rebuild + reload                                                                                                                                                              |
| 新迁移可逆                 | `migrate --down` + 代码回滚                                                                                                                                                                    |
| 新迁移不可逆，数据库有变更 | 从备份恢复 + 代码回滚                                                                                                                                                                          |
| Redis 相关问题             | **禁止 `FLUSHDB`**；按 key 前缀分类处理：`sess:*`（session）用 `redis-cli --scan --pattern "sess:*" \| xargs redis-cli DEL`；`bull:*`（队列）/ `rl:*`（频控）/ `cfg:*`（配置通知）同理按需清除 |

---

## 安全加固清单

### 系统层

- [ ] 所有 VPS 启用 UFW/iptables，仅开放必要端口
  - 生产运行时：80, 443（公网）+ SSH
  - 独立数据库主机：5432（仅内网）+ SSH
  - 离线内容环境：6100（仅本机/内网）+ SSH
- [ ] SSH 禁用密码登录，仅允许密钥认证
- [ ] 启用 `fail2ban` 防暴力破解
- [ ] 定期自动安全更新（`unattended-upgrades`）
- [ ] 非 root 用户运行所有服务

### 应用层

- [ ] `.env` 文件权限 `600`，仅应用用户可读
- [ ] `NODE_ENV=production` 已设置
- [ ] Helmet CSP 配置正确（仅允许必要来源）
- [ ] CSRF 同步器 token 生效
- [ ] Session cookie 使用 `__Host-` 前缀（Secure + Path=/）
- [ ] `trust proxy` 设为 `1`（非 `true`）
- [ ] argon2id 用于密码哈希

### 数据库层

- [ ] PostgreSQL 仅监听内网接口
- [ ] 应用用户权限最小化（不使用 superuser）
- [ ] `statement_timeout=30s` 防慢查询
- [ ] 备份文件权限 `600`

### 网络层

- [ ] Cloudflare WAF 规则已启用
- [ ] Caddy 覆盖 `X-Forwarded-*` 头（防伪造）
- [ ] VPS-2/VPS-3 默认不开放公网入站；公网出站按白名单/时间窗控制（允许包更新、时间同步等运维动作）
- [ ] 各 VPS 间通信走内网

---

## CORS 与 Vite 代理

- 开发模式：Vite `server.proxy` 代理 `/api/v1/*` → Express `:5100`，同域无 CORS
- 生产环境：同源部署（Caddy 直接托管 `client/dist`，Express 仅处理 API），无需 CORS
- 后续拆分域名时在 Express 配置 `cors()` 白名单

---

## 开发模式（本地强制 HTTPS）

- `npm run dev:setup` 封装：`mkcert -install` + 证书生成 + hosts 提示
- `npm run dev:server` → Express `https://round1.local:5100`
- `npm run dev:client` → Vite `https://round1.local:5173`，proxy `/api/v1/*` → `:5100`
- 全环境统一 `__Host-Round1.sid`，不做 dev 降级
- `certs/` 进 `.gitignore`

---

## 验证清单

### 当前仓库/文档已对齐

- [x] 生产运行时不再把 `cpp-runner` 视为在线健康前提；runner 健康检查已收敛到离线内容环境
- [x] `scripts/workers/contentWorker.ts` 只消费 `generation` / `sandbox-verify`，不属于生产运行时
- [x] `config/processTypes.ts` 已统一 `runtime-worker` / `content-worker` 进程身份与 DB application name 规则
- [x] 当前仓库仍无版本化 `ecosystem.config.js` 与统一 `scripts/healthcheck.ts`，部署验证仍以 runbook + 人工演练为主

### 目标部署演练待验证

- [ ] 独立域名可访问
- [ ] `GET /api/v1/health` 返回 ok，且邮件 / Turnstile 已按清单验证；离线内容环境单独验证 `cpp-runner` 与 `contentWorker`
- [ ] PM2 cluster 模式 2 实例启动正常，生产默认不启动运行时 worker
- [ ] 优雅停机：`pm2 reload <pm2-app-or-ecosystem>` 期间无请求丢失
- [ ] Caddy TLS 证书正确（Cloudflare Full Strict）
- [ ] 静态资源长期缓存头正确
- [ ] `pg_dump` 备份 + `pg_restore` 到临时库的恢复校验通过
- [ ] Sentry 生产环境事件上报正常
- [ ] Redis 断开后已登录用户需重新登录，核心答题数据（Postgres）不丢失
- [ ] SPF / DKIM / DMARC 记录生效，验证码邮件不进垃圾箱
- [ ] 安全加固清单全部勾选
- [ ] 手动部署 SOP 演练通过
- [ ] 回滚流程演练通过
