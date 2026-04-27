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

## CLI 标准

离线脚本必须满足：

- 支持 `--help`。
- 参数名使用 kebab-case。
- 写文件前确保目标目录存在。
- 默认输出到标准持久化路径；`--output` 只作为显式 override。
- 失败时非 0 exit code。
- 输出 summary，包含 accepted/rejected/warnings。
- 不在脚本中复制底层业务逻辑；薄封装只转发到共享 workflow。

## Bundle Contract

所有 bundle 必须：

- 使用 UTF-8 JSON。
- 顶层有 `meta` 和 `items`。
- meta 包含 bundleType、schemaVersion、runId/sourceBatchId、createdAt。
- items 顺序稳定。
- 每个 item 有可定位 identifier，便于错误报告指向。
- checksum manifest 可复算。

## 导入生命周期

```text
local/tmp probe
-> persistent bundle
-> validate
-> dry-run import batch
-> apply import batch
-> admin publish/archive
```

不得跳过 validate 直接 apply。dry-run 成功不代表已发布，只代表可导入。

## 错误报告

错误报告必须包含：

- item index 或 identifier。
- 错误码。
- 人类可读原因。
- 是否可修复后重试。
- 相关字段路径。

Admin UI 需要能展示错误报告并支持修复重试。

## 资产保留策略

| 路径 | 保留策略 |
| --- | --- |
| `papers/**` | 保留，审计输入 |
| `artifacts/prebuilt-papers/**` | 保留，审计输入 |
| `artifacts/reports/**` | 保留，审计/复盘 |
| `artifacts/tmp/**` | 可清理 |

清理脚本不得删除前三类，除非明确传入危险参数并有备份。

## Guardrail

应提供 guard 脚本检查：

- 正式资产路径是否包含 runId。
- 是否出现 `paper-packs.json` 等通用名。
- tmp/probe 是否混入正式目录。
- bundle meta 与文件名是否一致。
- checksum manifest 是否可复算。

## 内容发布检查清单

- question bundle validate 通过。
- prebuilt paper bundle validate 通过。
- import dry-run summary 无 reject。
- apply 写入 import batch。
- Admin publish 成功。
- 运行时 catalog 能看到对应 exam_type/difficulty。
- 测试用户能创建 draft 并开始 attempt。
