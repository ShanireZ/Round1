# Round1 Port Map and Exposure Plan

> 日期：2026-04-28
>
> 范围：汇总当前仓库代码、`.env.example`、`docker-compose.dev.yml`、Vite、PM2、healthcheck 与部署计划中出现的端口；供正式部署前重新设计端口与防火墙策略。
>
> 状态：端口设计已确认并同步到代码默认值、`.env.example`、本地 compose、Vite、PM2、healthcheck 与部署 runbook；当前代码默认值以 `config/env.ts`、`client/vite.config.ts`、`docker-compose.dev.yml` 为真源。

## 结论

单机部署时，Redis 和 Postgres 应只走本机回环或 Unix socket，不对公网暴露。当前生产运行时只需要公网入口 `80/443` 给 Caddy；SSH 使用 `9179` 并允许公网访问，不做 IP allowlist。API、Postgres、Redis 都应绑定 `127.0.0.1` 或仅允许内网访问。离线 `cpp-runner` 不属于生产运行时，只能在本地开发或离线内容环境绑定本机或内网。

本轮已把 `docker-compose.dev.yml` 的 Postgres、Redis、cpp-runner 端口发布收紧为 `127.0.0.1:host:container`，避免本地开发环境把服务暴露到局域网。

Caddy 必须强制 HTTPS，并配置 TLS 1.2+ 与 HTTP/2+；`80` 只用于 HTTP -> HTTPS 跳转、ACME 或 Cloudflare 到源站策略。

## Current Port Inventory

| 端口         | 组件                                            | 当前默认                                  | 暴露范围                   | 配置/来源                                                          | 备注                                                           |
| ------------ | ----------------------------------------------- | ----------------------------------------- | -------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------- |
| 80           | Caddy HTTP                                      | 部署层                                    | 公网                       | VPS / Caddy                                                        | 仅用于 HTTP -> HTTPS、ACME 或 Cloudflare 到源站策略。          |
| 443          | Caddy HTTPS                                     | 部署层                                    | 公网                       | VPS / Caddy                                                        | 生产唯一公网业务入口；强制 SSL，TLS 1.2+，HTTP/2+。            |
| 9179         | SSH                                             | VPS 系统层                                | 公网                       | VPS 系统层                                                         | 允许公网访问，不做 IP allowlist；仍应禁用密码登录并启用防护。  |
| 7654         | Express API                                     | `PORT=7654`、`ROUND1_BIND_HOST=127.0.0.1` | 仅 `127.0.0.1`             | `config/env.ts`、`.env.example`、`ecosystem.config.cjs`            | Caddy `reverse_proxy 127.0.0.1:7654`；生产不得公网监听。       |
| 4399         | Vite dev server                                 | `4399`                                    | 仅开发机 `127.0.0.1`       | `client/vite.config.ts`                                            | 只用于本地开发，生产不部署、不开放。                           |
| 4397         | Postgres                                        | `127.0.0.1:4397`                          | 单机为本机；拆库时仅私网   | `.env.example`、`docker-compose.dev.yml`                           | 单机部署不开放公网；本地示例密码与 compose 保持 `round1_dev`。 |
| 4395         | Redis                                           | `127.0.0.1:4395`                          | 单机为本机；拆服务时仅私网 | `.env.example`、`docker-compose.dev.yml`                           | 不开放公网；禁止无鉴权公网 Redis。                             |
| 4401         | cpp-runner                                      | `127.0.0.1:4401`                          | 仅本地开发/离线环境本机    | `config/env.ts`、`docker-compose.dev.yml`、`cpp-runner/Dockerfile` | 生产环境不部署；不进入生产 runtime health。                    |
| 443 outbound | R2 / LLM / mail API / Turnstile / OIDC / Sentry | 外部服务 HTTPS                            | 出站                       | env 中各 provider URL                                              | 不是入站端口；按 provider 域名做 egress 审计即可。             |

## Proposed Production Exposure

| 服务       | 监听地址                    | 防火墙   | 同步项                                   |
| ---------- | --------------------------- | -------- | ---------------------------------------- |
| Caddy      | `0.0.0.0:80`、`0.0.0.0:443` | 允许公网 | 强制 HTTPS、TLS 1.2+、HTTP/2+            |
| SSH        | `0.0.0.0:9179`              | 允许公网 | 禁用密码登录、fail2ban 或等价防护        |
| API        | `127.0.0.1:7654`            | 禁止公网 | `PORT`、Caddy、healthcheck               |
| Postgres   | `127.0.0.1:4397`            | 禁止公网 | `DATABASE_URL`、backup/runbook           |
| Redis      | `127.0.0.1:4395`            | 禁止公网 | `REDIS_URL`、session/rate limit/runbook  |
| cpp-runner | `127.0.0.1:4401`            | 禁止公网 | 仅本地开发/离线环境 `SANDBOX_RUNNER_URL` |
| Vite       | `127.0.0.1:4399`            | 禁止公网 | 本地开发 server，不进入生产部署          |

## Change Checklist

若未来再次重新设计端口，必须同步：

- `config/env.ts` 默认值或部署 `.env`：`PORT`、`ROUND1_BIND_HOST`、`DATABASE_URL`、`REDIS_URL`、`SANDBOX_RUNNER_URL`。
- `.env.example` 与 `plan/reference-config.md` 的示例值。
- `client/vite.config.ts` 的 dev proxy：`/api/v1 -> API`。
- `docker-compose.dev.yml` 的 loopback port mapping。
- `ecosystem.config.cjs` 与 Caddy reverse proxy。
- `scripts/healthcheck.ts` 默认 URL 或部署命令参数。
- `plan/step-06-deployment.md`、`standard/14-deployment-ops.md`、`scripts/README.md` 中的 runbook。

## Confirmed Decisions

- SSH 使用 `9179`，允许公网访问，不做 IP allowlist；仍必须禁用密码登录并启用 fail2ban 或等价防护。
- HTTP/HTTPS 使用 `80/443`，允许公网访问；Caddy 强制 HTTPS，TLS 1.2+，HTTP/2+。
- Express API 使用 `7654`，仅监听 `127.0.0.1`，由 Caddy 反代。
- Postgres 使用 `4397`，Redis 使用 `4395`，均不开放公网。
- Vite dev server 使用 `4399`，只用于本地开发，生产环境不部署。
- cpp-runner 使用 `4401`，只用于本地开发/离线内容环境，生产环境不部署。
