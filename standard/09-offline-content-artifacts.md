# 离线内容与产物规范

## 架构边界

生产运行时不生成内容，不运行 cpp-runner，不消费 generation/sandbox-verify 队列。内容生产发生在离线内容环境：

```text
generate / judge / cpp-runner / build prebuilt paper -> JSON bundle -> validate -> admin dry-run/apply -> publish
```

## 资产类型

- question bundle：可导入题目资产，放入 `papers/`。
- prebuilt paper bundle：可导入预制卷资产，放入 `artifacts/prebuilt-papers/`。
- report：校验摘要、judge 摘要、导入导出记录，放入 `artifacts/reports/`。
- tmp：probe、草稿、调试 JSON，放入 `artifacts/tmp/`。

## runId

每次内容生产运行必须有稳定且不可复用的 `runId`：

```text
YYYY-MM-DD-<pipeline>-<exam-type-slug>-<difficulty>-vNN
```

示例：

```text
2026-04-27-step3-llm-csp-j-medium-v01
```

同一天同 pipeline 重跑必须递增 `vNN`。

## question bundle 命名

目录：

```text
papers/<year>/<runId>/question-bundles/
```

文件：

```text
<runId>__question-bundle__<question-type>__<kp-code>__n<count>__vNN.json
```

示例：

```text
papers/2026/2026-04-27-step3-llm-csp-j-medium-v01/question-bundles/2026-04-27-step3-llm-csp-j-medium-v01__question-bundle__single-choice__bas__n12__v01.json
```

## prebuilt paper bundle 命名

目录：

```text
artifacts/prebuilt-papers/<year>/<runId>/
```

文件：

```text
<runId>__prebuilt-paper-bundle__blueprint-v<blueprintVersion>__n<count>__vNN.json
```

## 临时与报告

```text
artifacts/reports/<year>/<runId>/
artifacts/tmp/<year>/<runId>/
```

- `artifacts/tmp/**` 可清理。
- `papers/**`、`artifacts/prebuilt-papers/**`、`artifacts/reports/**` 作为审计输入保留。
- `latest.json`、`paper-packs.json`、`probe*.json` 只能作为本地临时 alias，不得进入可导入/可审计目录。

## 元数据

bundle metadata 必须包含：

- bundle type、schema version、createdAt。
- sourceBatchId/sourceBatchIds。
- provider/model、prompt hash、source timestamp（如适用）。
- validator version、validatedAt、checksum algorithm。
- item checksum manifest。
- overlap score 或去重摘要（如适用）。

## 校验链

question bundle apply 前必须通过：

1. JSON schema 校验。
2. 题型/知识点/考试类型枚举校验。
3. 结构完整性和答案解析一致性校验。
4. 去重校验。
5. 程序题 sandbox 或等价离线校验。
6. LLM 判官或人工抽样复核（按批次风险决定）。

prebuilt paper bundle apply 前必须通过：

1. schema 校验。
2. 引用题目存在且可用于目标 exam_type。
3. 题量、分值、知识点配额、难度分布校验。
4. slot points 合计 100。
5. 不引用 archived 或不合格题目。

## Admin 导入

- dry-run 与 apply 返回统一 `ImportSummary`。
- dry-run 对合法 batch 返回 accepted item count，不写业务表。
- apply 必须写 `import_batches`，保留 raw checksum 与摘要。
- Admin UI/API/CLI 必须复用同一 import workflow，不分叉三套口径。

## 禁止事项

- 禁止新建运行时内容生成接口。
- 禁止把 prebuilt paper 作为可变模板在线换题。
- 禁止覆盖已发布预制卷。
- 禁止无 runId 的正式资产进入审计目录。

