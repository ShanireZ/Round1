# 部署与运维规范

## 目标架构

Round1 采用“两层架构”：

| 层级 | 组件 | 说明 |
| --- | --- | --- |
| 生产运行时 | Caddy + Express API + Redis + Postgres | 在线考试、后台 API、静态资源；不部署 cpp-runner |
| 离线内容环境 | generate / judge / cpp-runner / content worker | 内容生产、校验、bundle 构建；不要求 24x7 |

生产 runtime worker 只允许承载考试会话支持型任务，例如 auto-submit；不得消费 generation 或 sandbox verify。

## 部署前检查

- `npm run lint`
- `npm run test`
- `npm run build --workspace=client`
- `npm run build --workspace=server`
- `npm run migrate:status`
- 数据库备份完成并校验可读。
- `.env` 权限为 600。
- Sentry release/environment 配置正确。
- 静态资源缓存策略明确。

## 生产上线步骤

1. 拉取代码。
2. 安装依赖，仅在 lockfile 变化时执行。
3. 构建 client/server。
4. 备份数据库。
5. 执行兼容迁移。
6. 平滑重启 API。
7. 检查 `/api/v1/health`。
8. 验证登录、配置端点、考试 catalog、Admin 关键页。
9. 观察日志和 Sentry。

## 回滚

- 代码回滚必须回到明确 release tag 或 commit。
- 如果迁移可逆，按迁移工具回滚。
- 如果迁移不可逆，按最近备份恢复到临时库验证后再恢复生产。
- 回滚后必须验证健康检查、登录、考试恢复、Admin 入口。

## 数据库备份

- 使用 `pg_dump` 逻辑备份。
- 备份文件权限 600。
- 定期执行 `pg_restore` 到临时库验证。
- 不可逆迁移前必须有新备份。

## Redis 运维

- 禁止 `FLUSHDB`。
- 按前缀清理：`sess:*`、`bull:*`、`rl:*`、`cfg:*`。
- Redis 断开时应演练降级：已登录用户重新登录，核心答题数据不丢。

## 安全加固

- SSH 禁用密码登录，启用 fail2ban 或等价防护。
- UFW/iptables 只开放 80/443/SSH；Postgres 仅内网。
- 服务使用非 root 用户。
- 自动安全更新按服务器策略开启。
- Cloudflare Full Strict + Caddy TLS 上线前验证。
- PostgreSQL 应用用户最小权限，不使用 superuser。

## 离线内容环境

- 可独立部署在开发机、CI 或内容机。
- cpp-runner 只接受本机/内网访问。
- contentWorker 不属于生产运行时。
- 内容产物必须输出到 [09-offline-content-artifacts.md](09-offline-content-artifacts.md) 规定路径。

## 健康检查

当前仓库仍无统一 `scripts/healthcheck.ts`，部署验证以 runbook 和人工演练为主。若后续纳入仓库，脚本必须覆盖：

- API health。
- DB 连接。
- Redis 连接。
- 前端静态文件可访问。
- 邮件 provider smoke。
- Turnstile smoke。
- 离线内容环境 runner/content worker smoke。

## 事故响应

生产事故处理顺序：

1. 判断是否影响考试作答和数据保存。
2. 冻结相关发布。
3. 保留日志、审计、DB 快照。
4. 回滚或降级。
5. 写复盘并补测试/监控/规范。

