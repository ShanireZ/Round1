# Standard Drift Audit Follow-up

> 日期：2026-04-27
>
> 范围：本次复核对照 `standard/17-docs-plan-maintenance.md`、`standard/22-standard-adoption-and-audit.md`、`standard/09-offline-content-artifacts.md`、`standard/14-deployment-ops.md`、`standard/06-backend-api.md` 与 `standard/11-testing-quality.md`，检查 `plan/`、`docs/plans/` 中已经标记完成或当前对齐的事项是否仍符合实际代码。
>
> 状态：本文件记录本轮已修复漂移与剩余标准债务；不是新的功能范围计划。

## 本轮已修复

- Production no-runner 口径：`plan/00-overview.md` 不再把 `cpp-runner` 写成生产启动健康前提，改为生产 `/api/v1/health` 与离线内容环境 runner/contentWorker 分层验收。
- cpp-runner 代码注释：`server/services/sandbox/cppRunner.ts` 明确为离线内容环境与校验脚本客户端，避免误读为生产运行时依赖。
- `/api/v1/config/client` 领域边界：从 `server/routes/auth.ts` 拆到 `server/routes/config.ts`，并补充 OpenAPI registry 与测试断言。
- `/api/v1/config/client` 文档口径：`plan/reference-api.md` 与 backlog 已改为现状契约，明确当前返回 autosave、draft TTL、考试类型、难度与 enabled auth providers。
- `/api/v1/docs` 文档口径：`plan/reference-api.md` 与 backlog 已改为开发环境现状契约，生产不暴露。
- Admin CRUD 完成项回写：`plan/step-03-question-bank.md` 的管理员题库与预制卷库 CRUD 验证清单已与 `plan/step-05-coach-and-admin.md` 和实际测试对齐。
- `app_settings` 运行时配置口径：backlog 已明确当前 `RUNTIME_SETTING_DEFINITIONS` 范围内的配置读取为 `app_settings > .env > 代码默认值`。

## 验证

- 代码级验证：`server/__tests__/pow.test.ts` 现在覆盖 `/api/v1/config/client` 的非敏感前端运行时字段，防止回退为最小 PoW payload。
- Admin 完成项验证：`server/__tests__/admin-content.integration.test.ts` 覆盖题库/预制卷 CRUD、引用摘要、发布/归档与 copy-version。
- 文档级验证：本轮复核后，`plan/reference-api.md` 不再把已挂载的 `/api/v1/docs` 与已补齐的 config payload 写成目标态。
- 已运行命令：

```bash
npm run test -- server/__tests__/pow.test.ts
npm run test -- server/__tests__/admin-content.integration.test.ts
npm run verify:offline-artifacts
npm run build --workspace=server
```

## 剩余标准债务

| standard | gap | risk | mitigation | trigger | owner |
| --- | --- | --- | --- | --- | --- |
| `standard/06-backend-api.md` OpenAPI 规范 | 当前 `GET /api/v1/config/client` 已补注册，但历史 auth/admin/exam 路由仍未全量注册 OpenAPI | API reference 仍可能依赖人工维护，新增字段或错误码容易漂移 | 本轮先补受影响 config 端点；后续按 auth/admin/exams 分批补 registry，并以生成检查守住 | 下一轮触碰对应路由或发布 API 契约前 | backend owner |
| `standard/22-standard-adoption-and-audit.md` L2/L3 guard | docs/plan 与代码漂移仍主要靠人工 `rg` 复核 | 已完成项可能再次和 reference/backlog 脱节 | 保留本 follow-up；后续可新增链接/路径/状态词 guard | 发布前或完成教练/API 主线后 | docs owner |

## 后续最小动作

- 触碰 auth/admin/exams 路由时，同步补 OpenAPI registry，不再扩大未注册 surface。
- 发布前复跑 `npm run verify:offline-artifacts`，并抽查 `docs/plans/2026-04-26-remaining-unfinished-work.md` 是否仍只包含真正未完成项。
