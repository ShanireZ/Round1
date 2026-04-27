# 文档与计划维护规范

## 文档分层

| 层级 | 目录 | 用途 |
| --- | --- | --- |
| 标准 | `standard/` | 长期规范、评审准则 |
| 方案 | `plan/` | 产品/架构/reference/阶段目标 |
| 执行计划 | `docs/plans/` | 日期化计划、推进记录、收口说明 |
| 脚本说明 | `scripts/README.md` | CLI 使用、运营 runbook |
| 用户入口 | `README.md` | 项目简介和本地启动 |

禁止新增 `docs/plan/` 单数目录。

## 写作规则

- 重要文档使用中文，保留必要英文术语。
- 文件开头说明范围、状态、日期或适用对象。
- 明确区分“当前已落地”和“目标契约”。
- 使用“必须/禁止/应该/可以”表达约束强度。
- 命令必须给出工作目录或上下文。
- 不写无主语的“后续优化”；必须写 owner 或触发条件。

## 计划文档

新增执行计划使用：

```text
docs/plans/YYYY-MM-DD-<topic>.md
```

建议结构：

- Goal。
- Current State。
- Target State。
- Non-goals。
- Tasks。
- Verification。
- Rollback/Risk。

旧计划被新实现覆盖时，必须追加状态说明或归档标记，避免误读。

## Reference 文档

以下变化必须同步 reference：

- API 路由和错误码。
- DB schema、状态机、JSON 字段。
- 环境变量。
- 部署结构。
- 内容产物路径。
- UI/UX 决策。

## 外部资料引用

- 技术库、框架、SDK、CLI、云服务信息必须查当前官方文档或 Context7。
- 公司规范参照优先使用官方公开资料。
- 引用资料要写链接，不复制大段原文。
- ByteDance 相关公开参照以 Arco Design 公开仓库/官网为准，不臆造内部规范。

## 文档验收

文档变更应检查：

- 链接存在。
- 路径与当前仓库一致。
- 没有与 UI/UX 定稿冲突。
- 没有把目标态写成已落地。
- 没有暴露 secret 或真实个人信息。

## 维护节奏

- 每完成一个大项，同步更新对应 `plan/step-*.md` 验证清单。
- 每次发布前检查 `docs/plans/2026-04-26-remaining-unfinished-work.md` 或后续 backlog 是否需要更新。
- 标准目录每次重大架构决策后复核一次。

