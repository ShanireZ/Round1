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

## 风险分层

测试强度按风险决定，避免普通改动被重流程拖慢，也避免高风险改动只跑单测。

| 风险 | 示例 | 最低验证 |
| --- | --- | --- |
| R0 | 权限、认证、考试提交、迁移、导入 apply | 单元 + 集成 + 关键 E2E/演练 + 回滚说明 |
| R1 | API 行为、状态机、Admin 设置、Coach 报表 | 集成测试 + 前端/后端契约验证 |
| R2 | 普通 UI、列表筛选、非敏感脚本 | build + 相关单测/截图或手工验收 |
| R3 | 文档、注释、低风险样式 | 链接/路径/格式检查 |

PR 描述应写明选择的风险级别。降级验证必须说明原因和残余风险。

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

## 契约测试

跨层契约必须有测试或生成校验：

- API envelope、错误码、分页字段。
- `/api/v1/config/client` 暴露字段与前端读取字段。
- DB enum 与服务端状态机允许迁移。
- question/prebuilt bundle schema 与 validator/importer。
- Admin dry-run/apply summary 与 UI 展示。
- CoachReport 聚合口径只包含 assignment attempts。

不得只靠 TypeScript 编译证明运行时契约正确。

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

## 按变更类型选择测试

| 变更 | 必跑 |
| --- | --- |
| 纯文档 | 链接/路径/术语检查 |
| 前端组件 | client build、组件测试或 UI gallery、截图 |
| API 路由 | server build、integration test、OpenAPI |
| DB 迁移 | migrate status、迁移测试、回滚/恢复说明 |
| 认证权限 | auth integration、权限矩阵、审计检查 |
| 考试状态机 | exams runtime integration、并发/CAS、E2E、[20-product-state-and-workflow.md](20-product-state-and-workflow.md) 不变量 |
| 隐私/日志 | 脱敏断言、权限过滤、导出字段检查、[21-privacy-and-data-lifecycle.md](21-privacy-and-data-lifecycle.md) |
| 离线脚本 | script unit、CLI smoke、fixture validate |
| 部署 | runbook smoke、health、备份恢复演练 |

## 回归测试要求

以下问题修复必须补回归测试：

- 数据覆盖或丢失。
- 权限绕过。
- 考试提交/自动保存/恢复异常。
- bundle 导入口径漂移。
- Admin 发布/归档/删除错误。
- UI 关键流程不可操作。

## Fixture 规范

- Fixture 必须最小化。
- 文件名表达场景。
- 不包含真实 secret 或个人信息。
- 大型题库批次不作为 unit fixture。
- 需要真实题目结构时，优先脱敏/裁剪到最小样本。

## Flaky 测试处理

- 不允许简单 skip。
- 先隔离根因：时间、随机数、网络、并发、外部服务。
- 必须记录 issue/计划。
- 对 CI 不稳定但本地稳定的测试，补日志和重试边界，而不是放宽断言。

## 外部服务测试

- 默认使用 fake/mock provider，避免 CI 依赖真实邮件、OIDC、Turnstile、LLM。
- 真实 provider smoke 只在本地、预发或上线演练执行，并记录时间、账号、结果摘要。
- LLM 实跑测试必须使用小 prompt、预算上限和受控失败样本。
- 邮件 smoke 不记录验证码、完整链接或收件人批量列表。
- OIDC smoke 必须覆盖 state/nonce/PKCE/redirect_uri 失败路径。

## 测试可读性

测试应遵循 Arrange/Act/Assert。每个测试只验证一个行为主题。断言业务结果，不断言无关实现细节。

## 发布前质量门禁

发布前必须确认：

- 当前 failing tests 已解释。
- 关键 smoke 路径通过。
- 迁移状态正确。
- 没有临时 debug 输出。
- 没有未处理 TODO 影响上线。
- 文档/标准同步完成，并按 [22-standard-adoption-and-audit.md](22-standard-adoption-and-audit.md) 记录影响面。
