# 首次部署手册

> 范围：全新服务器上的 Round1 production-runtime 首次部署。
> 状态：部署执行手册；当前检查日期为 2026-04-29。
> 不适用：离线内容生成机、`cpp-runner`、content worker、常规增量发版。

## 部署结论

首次生产部署默认采用单 VPS 两层架构：

```text
Cloudflare / DNS / WAF
  -> Caddy :80/:443
      -> /api/* 反代 127.0.0.1:7654
      -> /* 托管 client/dist
  -> Postgres 127.0.0.1:4397
  -> Redis 127.0.0.1:4395
```

生产 runtime 禁止部署 `cpp-runner`，禁止运行 generation、judge、sandbox verify 或 content worker。离线内容环境负责生成和校验产物，生产只导入已验证 bundle。

## 已核对真源

本手册按以下仓库真源编写：

| 主题            | 真源                                                  |
| --------------- | ----------------------------------------------------- |
| Node/npm 基线   | `package.json`、`standard/14-deployment-ops.md`       |
| 环境变量 schema | `config/env.ts`                                       |
| `.env` 生成     | `scripts/initEnv.ts`、`.env.example`                  |
| PM2 进程        | `ecosystem.config.cjs`                                |
| Caddy 模板      | `Caddyfile.example`                                   |
| 健康检查        | `scripts/healthcheck.ts`                              |
| DB 迁移         | `scripts/migrate.ts`、`server/db/migrations/`         |
| 首个管理员      | `scripts/initAdmin.ts`                                |
| 端口暴露        | `docs/plans/2026-04-28-port-map-and-exposure-plan.md` |

Context7 已核对当前 Caddyfile 与 PM2 文档：Caddy 支持 `root` + `file_server` 托管静态文件、`try_files {path} /index.html` 支持 SPA 回退、matcher + `reverse_proxy` 只代理 `/api/*`；PM2 支持 ecosystem 文件、cluster 模式、`env_production` 与 `pm2 reload ecosystem.config.cjs --env production`。Round1 的最终命令仍以本仓库脚本为准。

## 上线前确认

部署前必须拿到以下信息：

- 生产域名，例如 `round1.example.com`。
- Cloudflare 模式与 TLS 方案；目标是 Full Strict + Caddy HTTPS。
- 服务器 SSH 端口 `9179`，禁用密码登录，启用 fail2ban 或等价防护。
- Postgres 应用用户、数据库名、强密码。
- Redis 监听地址，默认 `redis://127.0.0.1:4395`。
- 邮件 provider：`resend`、`postmark` 或 `tencent-ses` 三选一。
- 发送域名的 SPF、DKIM、DMARC 记录。
- Turnstile site key 与 secret。
- CppLearn OIDC issuer、client id、client secret、redirect URI。
- R2 公开资源源站，需提供 `/font/*` 与 `/logo/cpplearn.jpg`。
- Sentry DSN、release/environment 命名。
- 已验证 question bundle / prebuilt paper bundle 路径、checksum 与导入顺序。
- 回滚 commit 或 tag，以及部署前 DB 备份位置。

以下任一项未满足时禁止继续：

- 无法创建或恢复验证数据库备份。
- `.env` 缺少生产 secret 或权限不满足仅应用用户可读。
- `server/db/migrations/` 存在重复三位序号，且没有明确收口计划或例外记录。
- `npm run build:client`、`npm run build:server`、`npm run test` 或 `npm run migrate:status` 无法通过。
- 生产机公网暴露了 API、Postgres、Redis、Vite 或 `cpp-runner` 端口。
- 无法执行登录、配置端点、考试 catalog、Admin 关键页 smoke。

## 服务器基线

在生产机上安装并验证：

```bash
node -v
npm -v
pm2 -v
caddy version
psql --version
redis-server --version
```

最低版本：

| 组件     | 要求                                                       |
| -------- | ---------------------------------------------------------- |
| Node.js  | `>=24.15.0`                                                |
| npm      | `>=11.12.1`                                                |
| Postgres | 18                                                         |
| Redis    | 7+，当前本地 compose 使用 Redis 8                          |
| Caddy    | 支持 Caddyfile、自动 HTTPS、`reverse_proxy`、`file_server` |
| PM2      | 支持 ecosystem config、cluster、reload                     |

应用服务必须使用非 root 用户运行。推荐为 Round1 创建独立应用用户并让 `/opt/round1` 归该用户所有；只有 Caddy、Postgres、Redis、系统防火墙和 PM2 startup 的 systemd 注册步骤需要 root 或 sudo。

防火墙入站只开放：

```bash
80/tcp
443/tcp
443/udp   # 仅保留 Caddy HTTP/3 时开放
9179/tcp
```

`7654`、`4397`、`4395`、`4401`、`4399` 不得公网监听。

## 数据服务准备

Postgres 单机部署按 Round1 端口规划监听本机：

```text
listen_addresses = '127.0.0.1'
port = 4397
```

创建应用数据库和最小权限用户：

```sql
CREATE ROLE round1 LOGIN PASSWORD '<strong-db-password>';
CREATE DATABASE round1 OWNER round1;
GRANT CONNECT ON DATABASE round1 TO round1;
```

Redis 单机部署应绑定本机并使用 Round1 默认端口：

```text
bind 127.0.0.1
port 4395
```

如果生产服务使用系统默认端口而不是 Round1 默认端口，必须显式写入 `.env`，并同步 Caddy、healthcheck、端口文档和本手册。

## 代码与依赖

推荐应用目录为 `/opt/round1`。如果使用 `/opt/round1/current` release symlink，Caddy、PM2 `cwd`、`.env` symlink 和 healthcheck 命令必须统一指向当前 release。

```bash
cd /opt
git clone <repo-url> round1
cd /opt/round1

node -v
npm -v
npm ci
```

根目录没有 `npm run build`。生产构建必须分别执行：

```bash
npm run build:client
npm run build:server
```

如果启用前端 Sentry，`VITE_SENTRY_DSN` 是 Vite 构建时变量，应在构建 client 时通过环境传入，或写入生产机上不入库的 `client/.env.production`。服务端 Sentry 使用根 `.env` 的 `SENTRY_DSN`。

构建产物：

| 产物         | 路径                          |
| ------------ | ----------------------------- |
| 前端静态文件 | `client/dist/`                |
| 后端运行入口 | `dist/server/server/index.js` |

## 生产环境变量

`config/env.ts` 是环境变量代码真源。`.env.example` 是最小模板，不重复所有默认值。

生成生产 `.env`：

```bash
npm run env:init -- --profile production-runtime --path .env
chmod 600 .env
```

如果 `.env` 已存在，先用只读模式核对：

```bash
npm run env:init -- --profile production-runtime --print
```

生产 runtime 必须填写：

| 变量                          | 说明                                                        |
| ----------------------------- | ----------------------------------------------------------- |
| `NODE_ENV=production`         | 生产模式                                                    |
| `DATABASE_URL`                | `postgres://round1:<password>@127.0.0.1:4397/round1`        |
| `APP_PUBLIC_URL`              | 生产站点 URL                                                |
| `APP_API_ORIGIN`              | 生产 API 同源 URL                                           |
| `SESSION_SECRET`              | 高熵 session secret                                         |
| `TOTP_ENCRYPTION_KEK`         | 高熵 TOTP envelope KEK                                      |
| `MAIL_PROVIDER`               | `resend`、`postmark` 或 `tencent-ses`                       |
| `MAIL_FROM`                   | 已验证域名发件人                                            |
| provider key                  | `RESEND_API_KEY`、`POSTMARK_SERVER_TOKEN` 或腾讯云 SES 凭证 |
| `AUTH_TURNSTILE_SITE_KEY`     | Turnstile 前端 site key                                     |
| `AUTH_TURNSTILE_SECRET_KEY`   | Turnstile 服务端 secret                                     |
| `CPPLEARN_OIDC_ISSUER`        | CppLearn OIDC issuer                                        |
| `CPPLEARN_OIDC_CLIENT_ID`     | CppLearn client id                                          |
| `CPPLEARN_OIDC_CLIENT_SECRET` | CppLearn client secret                                      |
| `CPPLEARN_OIDC_REDIRECT_URI`  | `https://<domain>/api/v1/auth/oidc/cpplearn/callback`       |
| `R2_PUBLIC_BASE_URL`          | 字体和品牌图片公开源站                                      |
| `SENTRY_DSN`                  | 服务端生产 Sentry DSN                                       |

前端构建时可选：

| 变量              | 说明                                                    |
| ----------------- | ------------------------------------------------------- |
| `VITE_SENTRY_DSN` | 前端生产 Sentry DSN；只在 `npm run build:client` 时读取 |

只在首次管理员引导时使用：

| 变量                            | 说明                                         |
| ------------------------------- | -------------------------------------------- |
| `ROUND1_INITIAL_ADMIN_PASSWORD` | 临时强密码；初始化后立即从环境和 `.env` 移除 |

通常不需要写入 `.env`，除非改变拓扑：

| 默认变量                           | 默认值                   |
| ---------------------------------- | ------------------------ |
| `PORT`                             | `7654`                   |
| `ROUND1_BIND_HOST`                 | `127.0.0.1`              |
| `REDIS_URL`                        | `redis://127.0.0.1:4395` |
| `TRUST_PROXY_HOPS`                 | `1`                      |
| `SESSION_COOKIE_SECURE`            | `true`                   |
| `ROUND1_PM2_API_INSTANCES`         | `2`                      |
| `ROUND1_PM2_ENABLE_RUNTIME_WORKER` | false                    |
| `ROUND1_PM2_ENABLE_CONTENT_WORKER` | false                    |
| `ROUND1_HEALTHCHECK_TIMEOUT_MS`    | `5000`                   |
| `AUTOSAVE_INTERVAL_SECONDS`        | `180`                    |
| `EXAM_DRAFT_TTL_MINUTES`           | `1440`                   |

生产 runtime 不填写 LLM provider、sandbox runner 或 content worker 配置，除非该机器被明确划为离线内容环境。

## Caddy 配置

复制模板并改字面量：

```bash
sudo cp /opt/round1/Caddyfile.example /etc/caddy/Caddyfile
sudoedit /etc/caddy/Caddyfile
```

必须替换：

- `round1.example.com` 为生产域名。
- `/opt/round1/client/dist` 为实际 `client/dist` 路径。
- `127.0.0.1:7654` 保持指向 Express API。
- `/var/log/caddy/round1-access.json` 为生产日志路径。
- `https://r2.example.com` 为 R2 公开资源源站。

验证并加载：

```bash
sudo caddy fmt --overwrite /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Caddy 必须负责：

- HTTPS、TLS 1.2+、HTTP/2+。
- `/api/*` 反代到 Node。
- `client/dist` 静态托管与 SPA 回退。
- `/font/*` 和 `/logo/*` 同源代理到 R2。
- HSTS、CSP、`X-Content-Type-Options`、`X-Frame-Options`、`Referrer-Policy`、`Permissions-Policy`。
- 访问日志 JSON 化和滚动。
- hashed assets 长缓存，`index.html` 不缓存。

## 数据库迁移与初始化

先检查迁移编号：

```bash
find server/db/migrations -maxdepth 1 -type f -name '[0-9][0-9][0-9]_*.ts' -printf '%f\n' \
  | cut -c1-3 \
  | sort \
  | uniq -d
```

命令不得输出任何编号。若输出编号，按 `standard/07-data-and-migrations.md` 收口后再部署。

首次执行：

```bash
npm run migrate:status
npm run migrate:up
npm run migrate:status
```

初始化基础数据：

```bash
npx tsx scripts/seedBlueprint.ts
npx tsx scripts/bootstrapKnowledgePoints.ts
```

导入离线内容产物时必须先 dry-run，再 apply：

```bash
npx tsx scripts/importQuestionBundle.ts <question-bundle.json> --dry-run
npx tsx scripts/importQuestionBundle.ts <question-bundle.json> --apply

npx tsx scripts/importPrebuiltPaperBundle.ts <prebuilt-paper-bundle.json> --dry-run
npx tsx scripts/importPrebuiltPaperBundle.ts <prebuilt-paper-bundle.json> --apply
```

生产导入前必须确认 bundle 已在离线内容环境完成 sandbox / judge / checksum / 人工复核。生产 runtime 不重新运行 `cpp-runner`。

## 首个管理员

生成临时强密码：

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

先把临时密码放进当前 shell 的环境变量，避免写入命令历史：

```bash
read -r -s -p "Initial admin password: " ROUND1_INITIAL_ADMIN_PASSWORD
export ROUND1_INITIAL_ADMIN_PASSWORD
npm run init:admin -- --dry-run
npm run init:admin
unset ROUND1_INITIAL_ADMIN_PASSWORD
```

脚本固定引导：

| 字段     | 值       |
| -------- | -------- |
| 用户名   | `elder`  |
| 角色     | `admin`  |
| 首次登录 | 强制改密 |

初始化完成后必须移除 `ROUND1_INITIAL_ADMIN_PASSWORD`，并确认临时密码没有进入 shell history、日志或部署记录。

## PM2 启动

启动 API：

```bash
cd /opt/round1
pm2 start ecosystem.config.cjs --env production
pm2 status
pm2 save
pm2 startup
```

`pm2 startup` 会打印一条需要 root 执行的 systemd 命令；按 PM2 输出执行一次，再重新 `pm2 save`。

生产默认只应看到：

```text
round1-api
```

只有明确需要运行时 delayed job 时，才设置 `ROUND1_PM2_ENABLE_RUNTIME_WORKER=1` 并看到 `round1-runtime-worker`。生产 runtime 不应出现 `round1-content-worker`。

平滑重启：

```bash
pm2 reload ecosystem.config.cjs --env production
```

## 健康检查与 smoke

基础健康：

```bash
curl -fsS https://<domain>/api/v1/health
npm run healthcheck -- --api-url https://<domain>/api/v1/health --frontend-url https://<domain> --pm2
```

外部配置存在性检查：

```bash
npm run healthcheck -- --api-url https://<domain>/api/v1/health --frontend-url https://<domain> --include-external --pm2
```

人工 smoke 必须覆盖：

- 首页和登录页可访问。
- 本地账号登录。
- CppLearn OIDC 登录回调。
- Turnstile 验票。
- 验证码邮件真实投递。
- `GET /api/v1/config/client` 不泄露 secret。
- 考试 catalog 有可用预制卷。
- 开始考试、autosave、提交、结果页。
- Admin 登录后进入 Dashboard、用户、题库、预制卷、导入、设置页。
- Caddy 静态缓存头和安全头。
- Sentry 前后端 release/environment 可见。

## 备份与恢复演练

部署前备份：

```bash
DATABASE_URL="$(node -e "require('dotenv').config(); process.stdout.write(process.env.DATABASE_URL || '')")"
test -n "$DATABASE_URL"
mkdir -p data/backups
pg_dump -Fc "$DATABASE_URL" -f data/backups/predeploy-$(date +%Y%m%d-%H%M%S).dump
chmod 600 data/backups/*.dump
sha256sum data/backups/*.dump > data/backups/SHA256SUMS
```

恢复演练必须在临时库执行，不得直接覆盖生产库。以下命令以具备 `CREATE DATABASE` 权限的数据库管理员执行；若 Postgres 不在默认连接位置，补充 `-h 127.0.0.1 -p 4397` 等连接参数：

```bash
createdb round1_restore_check
pg_restore --clean --if-exists --no-owner --dbname round1_restore_check data/backups/<backup>.dump
psql round1_restore_check -c "select count(*) from users;"
dropdb round1_restore_check
```

如果无法完成恢复演练，必须记录风险并推迟生产开放。

## 回滚

代码回滚：

```bash
cd /opt/round1
git checkout <previous-tag-or-commit>
npm ci
npm run build:client
npm run build:server
pm2 reload ecosystem.config.cjs --env production
npm run healthcheck -- --api-url https://<domain>/api/v1/health --frontend-url https://<domain> --pm2
```

迁移回滚只支持最近一次：

```bash
npm run migrate:down
```

不可逆迁移或导入事故优先从备份恢复到临时库验证，再决定是否恢复生产。Redis 问题禁止 `FLUSHDB`，只能按前缀清理并先评估 session、rate-limit、config refresh 影响。

## 首次部署记录

部署完成后记录：

- commit 或 tag。
- Node/npm、Postgres、Redis、Caddy、PM2 版本。
- `.env` 关键配置差异，不记录 secret 值。
- 迁移状态输出。
- 导入 bundle 路径、runId、checksum、dry-run/apply 结果。
- DB 备份路径与 restore check 结果。
- Caddy validate、PM2 status、healthcheck 输出。
- smoke 结果和观察窗口。
- 未完成项、例外和下一次收口触发条件。

记录位置可以是 `docs/plans/YYYY-MM-DD-release-<topic>.md`、issue、PR 或运维台账，但必须能被后续排障者找到。

## 当前检查快照

2026-04-29 本地检查结果：

- 当前工作区位于 `main`，未创建额外 branch 或 worktree。
- 本机 Node `v24.15.0`、npm `11.12.1`，与标准基线一致。
- `npm run env:init -- --profile production-runtime --print` 可生成生产 `.env` 骨架。
- `npm run healthcheck -- --help` 可列出 API、frontend、external、offline、PM2 检查参数。
- `npm run init:admin -- --help` 可列出首个管理员引导参数。
- 根 `package.json` 没有 `npm run build`；首次部署必须使用 `npm run build:client` 和 `npm run build:server`。
- `scripts/migrate.ts` 支持 `up`、`down`、`status`；不要使用旧文档里的 `--down` 参数。
- 当前迁移目录存在重复编号 `009` 和 `010`，触碰部署冻结条件；生产迁移前必须收口或写明例外。
