# 离线内容与产物规范

## 架构边界

生产运行时不生成内容，不运行 cpp-runner，不消费 generation/sandbox-verify 队列。内容生产发生在离线内容环境：

```text
generate / judge / cpp-runner / build prebuilt paper -> JSON bundle -> validate -> admin dry-run/apply -> publish
```

## 产物原则

- 正式资产必须可复现、可追溯、可校验；临时产物必须容易识别和清理。
- 文件名表达内容类型和批次，不靠父目录或人工记忆解释。
- `runId` 是内容生产批次的主线索，必须贯穿 prompt、报告、bundle、checksum、import batch 和发布记录。
- 任何进入 Admin dry-run/apply 的资产都视为审计输入，不能随手覆盖。
- 离线环境可以复杂，生产运行时必须简单：只消费已发布、已验证、已导入的内容。

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

重跑同一目标不得复用旧 `runId`。如果是修复同批次内容，使用新版本号并在报告中写明 supersedes/derivedFrom；如果只是本地 probe，放入 `artifacts/tmp/**`，不得伪装成正式批次。

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
artifacts/reports/<year>/state/
artifacts/reports/<year>/audits/<topic>/
artifacts/reports/<year>/cleanups/<topic>/
artifacts/reports/<year>/runs/<runId>/
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

metadata 不应包含 secret、完整 provider key、个人邮箱、生产用户答案或 session 信息。需要诊断 provider 调用时保存 provider 名称、model、prompt hash、token、latency 和错误摘要即可。

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

## 批次风险分级

| 风险 | 示例 | 额外要求 |
| --- | --- | --- |
| low | 少量手工修正、只补解析 typo | schema validate、review 记录 |
| medium | 新增一批模拟题、改知识点或难度 | 去重、judge/人工抽样、导入 dry-run |
| high | 真题批量导入、预制卷批量发布、程序题大批生成 | sandbox、官方答案比对、人工复核、发布 smoke |

风险越高，越要增加确定性校验和人工抽样；不要用“模型看起来没问题”替代答案一致性和结构校验。

## Admin 导入

- dry-run 与 apply 返回统一 `ImportSummary`。
- dry-run 对合法 batch 返回 accepted item count，不写业务表。
- apply 必须写 `import_batches`，保留 raw checksum 与摘要。
- Admin UI/API/CLI 必须复用同一 import workflow，不分叉三套口径。

dry-run 与 apply 的差异只能是是否写业务表。校验规则、错误码、summary 字段、item 定位方式必须一致，否则 Admin 无法信任 dry-run 结果。

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

脚本输出应默认适合人读，同时支持必要的机器读选项。长批次必须定期输出进度；失败时说明最后安全检查点和可重试命令。

## Bundle Contract

所有 bundle 必须：

- 使用 UTF-8 JSON。
- 顶层有 `meta` 和 `items`。
- meta 包含 bundleType、schemaVersion、runId/sourceBatchId、createdAt。
- items 顺序稳定。
- 每个 item 有可定位 identifier，便于错误报告指向。
- checksum manifest 可复算。

正式 bundle 一旦被 apply 或发布，不再原地修改。发现错误时生成新 bundle、新 import batch 或 copy-version，保留旧批次用于追溯。

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

## 重试与恢复

- 生成失败可以重跑，但正式重跑必须产生新 `runId` 或递增版本。
- validate 失败只修复源文件或生成新 bundle，不直接手改数据库绕过。
- dry-run 失败不应留下业务表副作用。
- apply 中断后必须能通过 import batch、checksum、唯一约束或幂等逻辑判断哪些 item 已写入。
- publish 失败后不得让 UI 显示“已发布”；应保留 draft/imported 状态和错误摘要。

## 错误报告

错误报告必须包含：

- item index 或 identifier。
- 错误码。
- 人类可读原因。
- 是否可修复后重试。
- 相关字段路径。

Admin UI 需要能展示错误报告并支持修复重试。

错误报告应避免一次只报第一个错误。结构类错误可以 fail fast；内容类错误应尽量汇总到 item 级，便于批量修复。

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

Guard 失败信息必须给出修复方向，例如期望路径、当前路径、缺失字段、可运行的 validate 命令。只输出 “invalid” 不满足要求。

## 内容发布检查清单

- question bundle validate 通过。
- prebuilt paper bundle validate 通过。
- import dry-run summary 无 reject。
- apply 写入 import batch。
- Admin publish 成功。
- 运行时 catalog 能看到对应 exam_type/difficulty。
- 测试用户能创建 draft 并开始 attempt。
- 发布记录包含 runId、bundle 路径、import batch、warnings 处理和回滚/归档方式。
