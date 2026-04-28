# Single VPS Deployment Recommendation

> 日期：2026-04-28
>
> 范围：回答 4H16G、14M 带宽单 VPS 上 Round1 的生产运行时部署方式选择；同步 `standard/14-deployment-ops.md` 与 `plan/step-06-deployment.md` 的当前两层架构口径。
>
> 状态：部署方案推荐与取舍说明；真实域名、TLS、备份、PM2 reload、外部服务 smoke 与回滚仍需按 Step 06 实机演练。

## Recommendation

当前推荐：**不要为单 VPS 首发引入 Kubernetes/k3s**。生产运行时先采用：

- Caddy 继续作为唯一公网入口，负责 TLS、静态资源、SPA fallback、`/api/*` 反代与 `/font/*` 同源字体代理。
- Node API 使用当前仓库已有 `ecosystem.config.cjs` + PM2 cluster 2 实例，或等价 systemd service；短期以 PM2 为准，因为代码、healthcheck 与 plan 已经对齐。
- Postgres、Redis 使用系统包或受控 systemd service；Postgres 数据目录、备份、恢复演练优先级高于容器化。
- `client/dist` 由 Caddy 直接托管，hashed assets 长缓存，`index.html` 不长缓存。
- 离线内容环境继续与生产运行时分离，不在生产机运行 `cpp-runner`、generation 或 sandbox verify。

可选增强：当需要依赖隔离、镜像化发布或降低 Node/npm 漂移时，再引入 **rootless Podman + Quadlet/systemd** 管理 API 或 Redis；Postgres 是否容器化单独评估，不能因为容器化而降低备份与恢复演练要求。

## Why Not Kubernetes First

Context7 当前 Kubernetes 文档显示，Kubernetes v1.24 起 kubelet 已移除 dockershim，集群需要 containerd、CRI-O 等 CRI 运行时。也就是说，`containerd` 是 Kubernetes 使用的容器运行时之一，不是一个直接替代部署方案；加 Kubernetes 会额外引入 kubelet、API server、scheduler/controller、CNI、Ingress、存储与证书/升级面。

对单 VPS 来说，Kubernetes/k3s 的收益主要是声明式编排、Deployment/Service/Ingress 生态和未来多节点迁移路径；代价是控制面、网络、存储、备份、观测、升级和排障复杂度。单节点 Kubernetes 也不提供真正高可用，反而容易把“一个进程重启”变成“集群组件排障”。

因此 Kubernetes/k3s 作为后续触发项：

- 需要第二台以上应用节点，或明确要迁移到托管 Kubernetes。
- 需要多服务滚动发布、HPA、统一 Secret/ConfigMap/GitOps，并且团队能维护集群。
- 已完成 Postgres 备份恢复、Caddy/TLS、healthcheck、Sentry、Redis 降级等基础运维演练。

## Podman Option

Context7 Podman 文档显示，Podman 是 daemonless 容器引擎，支持 rootless 运行和 systemd/Quadlet 声明式管理容器、pod、volume、network。它比 Kubernetes 更贴近单机部署：仍由 systemd 接管启动、重启、日志和依赖顺序，不需要集群控制面。

适合 Round1 的 Podman 使用边界：

- API 容器：可 rootless 运行，挂载只读 release 与 `.env`，暴露到 `127.0.0.1:5100` 给 Caddy。
- Redis 容器：可接受，数据 volume 与持久化策略要写清。
- Postgres 容器：可以做，但首发不优先；数据库故障恢复、升级、备份、权限更关键，系统包部署更直观。
- Caddy：建议继续系统包安装，不放进同一个容器栈，保持公网入口和证书生命周期简单。

Podman 优点：

- 无常驻 Docker daemon，rootless 安全面更小。
- OCI 镜像让 Node/npm 依赖和运行时更可重复。
- Quadlet 复用 systemd，单机排障模型清晰。

Podman 缺点：

- 需要新增镜像构建、镜像分发、volume 管理和 rootless 网络知识。
- Windows 本地与 Linux 生产的构建/调试链路需要额外文档。
- 对 Postgres/Redis 的备份恢复没有天然简化，仍要演练。

## Current Target Architecture

```text
Cloudflare DNS / WAF
        |
        v
Caddy :443
  |-- /api/*       -> 127.0.0.1:5100 Round1 API (PM2 cluster)
  |-- /font/*      -> R2 public font origin
  |-- /*           -> /opt/round1/current/client/dist

systemd/PM2
  |-- round1-api x2
  |-- redis
  |-- postgres

offline-content environment
  |-- generation / judge / cpp-runner / content worker
  |-- outputs audited bundles imported into production
```

## Release Shape

- `/opt/round1/releases/<commit>` 保存构建结果。
- `/opt/round1/current` 指向当前 release。
- `.env` 权限 `600`，不放进 release。
- 上线前：`npm ci`、`npm run build:client`、`npm run build:server`、`pg_dump`。
- 上线中：兼容 migration、切换 symlink、`pm2 reload ecosystem.config.cjs --env production`。
- 上线后：`npm run healthcheck -- --api-url https://<domain>/api/v1/health --frontend-url https://<domain> --pm2`，再人工 smoke 登录、配置、考试 catalog、Admin 关键页。

## Bandwidth Notes

14M 带宽下，前端字体与静态资源缓存是主要收益点：

- 字体继续走 R2 `/font/` 同源代理，一年长缓存。
- `client/dist/assets/*` 使用 immutable 长缓存。
- `index.html` 不长缓存，避免回滚后旧 HTML 引用新旧资源混乱。
- 首屏不要依赖非关键图表库、仪式动画或大字体阻塞考试作答。

## Decision Matrix

| 方案 | 推荐度 | 优点 | 缺点 | 触发条件 |
| --- | --- | --- | --- | --- |
| Caddy + PM2/systemd + native Postgres/Redis | 首发推荐 | 最少移动件，贴合现有代码和 runbook，排障直接 | 依赖隔离弱，Node/npm 需严格 pin | 当前 4H16G 单 VPS |
| Caddy + rootless Podman Quadlet | 可选二期 | 运行时可重复，rootless 隔离，systemd 管理清晰 | 增加镜像、volume、rootless 网络维护 | 需要镜像化发布或依赖隔离 |
| k3s/Kubernetes + containerd/CRI-O | 暂缓 | 未来多节点和 GitOps 路径清晰 | 单节点无 HA，控制面和网络/存储复杂度高 | 多节点、托管 K8s 或团队已有集群运维能力 |

## Open Verification

- 独立域名、Cloudflare Full Strict、Caddy TLS。
- PM2 cluster reload 与优雅停机。
- Postgres `pg_dump` + `pg_restore` 临时库恢复。
- Redis 断开降级。
- Sentry release 与敏感信息过滤。
- 邮件 SPF/DKIM/DMARC 与真实投递。
- 静态资源和字体 cache headers。
