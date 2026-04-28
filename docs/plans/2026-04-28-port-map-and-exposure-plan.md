# Round1 Port Map and Exposure Plan

> 日期：2026-04-28
>
> 范围：汇总当前仓库代码、`.env.example`、`docker-compose.dev.yml`、Vite、PM2、healthcheck 与部署计划中出现的端口；供正式部署前重新设计端口与防火墙策略。
>
> 状态：端口盘点与暴露面建议。最终公网端口、SSH 端口、是否拆独立数据库主机由部署设计确认；当前代码默认值仍以 `config/env.ts`、`client/vite.config.ts`、`docker-compose.dev.yml` 为真源。

## 结论

单机部署时，Redis 和 Postgres 应只走本机回环或 Unix socket，不对公网暴露。当前生产运行时只需要公网入口 `80/443` 给 Caddy；API、Postgres、Redis 都应绑定 `127.0.0.1` 或仅允许内网访问。离线 `cpp-runner` 不属于生产运行时，只能在离线内容环境绑定本机或内网。

本轮已把 `docker-compose.dev.yml` 的 Postgres、Redis、cpp-runner 端口发布收紧为 `127.0.0.1:host:container`，避免本地开发环境把服务暴露到局域网。

## Current Port Inventory

| 端口         | 组件                                            | 当前默认                                  | 建议暴露范围               | 配置/来源                                                          | 备注                                                           |
| ------------ | ----------------------------------------------- | ----------------------------------------- | -------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------- |
| 80           | Caddy HTTP                                      | 未在仓库硬编码                            | 公网                       | 部署层                                                             | 用于 HTTP -> HTTPS、ACME 或 Cloudflare 到源站策略。            |
| 443          | Caddy HTTPS                                     | 未在仓库硬编码                            | 公网                       | 部署层                                                             | 生产唯一公网业务入口，托管静态资源并反代 `/api/*`、`/font/*`。 |
| 22 或自定义  | SSH                                             | 未在仓库硬编码                            | 管理 IP allowlist          | VPS 系统层                                                         | 建议不使用密码登录；是否改非 22 由运维策略决定。               |
| 5100         | Express API                                     | `PORT=5100`、`ROUND1_BIND_HOST=127.0.0.1` | 仅 `127.0.0.1`             | `config/env.ts`、`.env.example`、`ecosystem.config.cjs`            | Caddy `reverse_proxy 127.0.0.1:5100`；生产不应公网监听。       |
| 5173         | Vite dev server                                 | `5173`                                    | 仅开发机 `127.0.0.1`       | `client/vite.config.ts`                                            | 只用于本地开发，生产不开放。                                   |
| 5432         | Postgres                                        | `127.0.0.1:5432`                          | 单机为本机；拆库时仅私网   | `.env.example`、`docker-compose.dev.yml`                           | 单机部署不开放公网；独立 DB 主机时只允许应用主机访问。         |
| 6379         | Redis                                           | `127.0.0.1:6379`                          | 单机为本机；拆服务时仅私网 | `.env.example`、`docker-compose.dev.yml`                           | 不开放公网；禁止无鉴权公网 Redis。                             |
| 6100         | cpp-runner                                      | `127.0.0.1:6100`                          | 离线内容环境本机/内网      | `config/env.ts`、`docker-compose.dev.yml`、`cpp-runner/Dockerfile` | 不进入生产运行时 health；只用于离线校验。                      |
| 443 outbound | R2 / LLM / mail API / Turnstile / OIDC / Sentry | 外部服务 HTTPS                            | 出站                       | env 中各 provider URL                                              | 不是入站端口；按 provider 域名做 egress 审计即可。             |

## Proposed Production Exposure

| 服务       | 监听地址                                | 防火墙    | 是否由你重新设计                                   |
| ---------- | --------------------------------------- | --------- | -------------------------------------------------- |
| Caddy      | `0.0.0.0:80`、`0.0.0.0:443`             | 允许公网  | 是                                                 |
| SSH        | `0.0.0.0:<ssh-port>`                    | 仅管理 IP | 是                                                 |
| API        | `127.0.0.1:<api-port>`                  | 禁止公网  | 是，需同步 `PORT`、Caddy、healthcheck              |
| Postgres   | `127.0.0.1:<postgres-port>`             | 禁止公网  | 是，需同步 `DATABASE_URL`、backup/runbook          |
| Redis      | `127.0.0.1:<redis-port>`                | 禁止公网  | 是，需同步 `REDIS_URL`、session/rate limit/runbook |
| cpp-runner | 离线机 `127.0.0.1:<runner-port>` 或私网 | 禁止公网  | 是，仅影响离线环境 `SANDBOX_RUNNER_URL`            |
| Vite       | `127.0.0.1:<vite-port>`                 | 禁止公网  | 可选，仅开发体验                                   |

## Change Checklist

若你重新设计端口，必须同步：

- `config/env.ts` 默认值或部署 `.env`：`PORT`、`ROUND1_BIND_HOST`、`DATABASE_URL`、`REDIS_URL`、`SANDBOX_RUNNER_URL`。
- `.env.example` 与 `plan/reference-config.md` 的示例值。
- `client/vite.config.ts` 的 dev proxy：`/api/v1 -> API`。
- `docker-compose.dev.yml` 的 loopback port mapping。
- `ecosystem.config.cjs` 与 Caddy reverse proxy。
- `scripts/healthcheck.ts` 默认 URL 或部署命令参数。
- `plan/step-06-deployment.md`、`standard/14-deployment-ops.md`、`scripts/README.md` 中的 runbook。

## Open Decisions

- 公网只开放 `80/443`，SSH 是否保留 `22` 还是切到自定义端口。
- API 是否继续用 `5100`，或改成只在 release/runbook 内部使用的新端口。
- Postgres/Redis 是否继续默认端口但只绑本机，或改本机非默认端口降低误连概率。
- 离线内容环境是否和生产同机。如果同机，`cpp-runner` 仍不得对公网暴露，且生产 runtime health 不检查它。
