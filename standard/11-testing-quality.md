# 测试与质量门禁规范

## 测试分层

| 层级 | 覆盖对象 | 工具 |
| --- | --- | --- |
| Unit | 纯函数、schema、helper、权限判断、路径命名 | Vitest |
| Integration | API + DB + Redis/mock、导入 workflow、考试状态机 | Vitest + Supertest |
| Script | CLI 参数、bundle validate/import/build | Vitest / tsx smoke |
| E2E | 注册登录、考试、Admin 导入、打印、恢复 | Playwright |
| Visual/A11y | UI gallery、关键页面 Light/Dark、截图、axe | Playwright/Lighthouse/人工 |
| Ops | 迁移、备份恢复、健康检查、部署回滚 | runbook 演练 |

## 默认命令

常规代码变更至少运行：

```bash
npm run lint
npm run test
```

前端 UI 变更：

```bash
npm run build --workspace=client
```

后端/API/DB 变更：

```bash
npm run build --workspace=server
npm run migrate:status
```

涉及浏览器流程：

```bash
npm run test:e2e
```

## 测试设计

- 测试名称必须描述行为，不描述实现。
- 每个 bug fix 必须先添加能失败的回归测试，除非明确无法自动化。
- 测试断言必须验证结果，不只验证函数被调用。
- 时间、随机数、UUID、外部 API 必须可控。
- 不使用生产 secret、真实用户数据、不可重复外部服务作为测试前提。

## 覆盖要求

必须覆盖：

- 认证成功、失败、过期、step-up。
- 权限边界：student/coach/admin。
- API validation error。
- 考试状态：draft、started、submit、auto_submit、active recovery、nonce conflict。
- Admin 内容操作：publish/archive/delete/copy-version/reference summary。
- Import：dry-run/apply/error report/batch history。
- LLM：成功日志、受控失败日志、provider fallback、schema reject。
- 离线产物命名 guard。

## UI 验收

UI 改动必须检查：

- Light/Dark。
- `<md`、`lg`、`xl`。
- keyboard-only。
- `prefers-reduced-motion`。
- 长中文、长英文、错误态、加载态、空态。
- 关键流程截图无重叠、溢出、遮挡。

## 质量门禁

禁止合并：

- lint/typecheck/test 失败且无明确例外。
- 删除或放宽安全测试。
- 对 prebuilt-only 约束没有测试的运行时改动。
- 迁移不可回滚且无备份/恢复说明。
- UI 变更未对照 `plan/uiux_plan.md`。
- 新脚本没有 `--help` 或 README 示例。

## 测试数据

- Fixture 放在 `scripts/tests/fixtures` 或对应测试目录。
- 真实试卷/真题数据必须标明来源和处理状态。
- 大型产物不要直接塞进单元测试；用最小可验证样本。

## 手工验收记录

无法自动化的验证必须写入 PR 或 `docs/plans/*`：

- 执行日期。
- 环境。
- 操作步骤。
- 实际结果。
- 截图或日志位置。
- 残余风险。

