# LLM、内容 Agent 与 Prompt 规范

## 架构边界

LLM 只用于离线内容生产、判官复核、解析重写、真题审核、paper audit 等受控场景。生产考试运行时不得调用 LLM 生成题目、换题、在线组卷或实时诊断。

## LLM 使用原则

- LLM 产出是候选材料，不是事实来源、权限判断或最终发布动作。
- 所有模型输出必须先进入结构校验、业务校验、去重、审计和人工/确定性复核链路。
- 模型能力和成本是运行时变量，不能把某个 provider 的临时行为写成业务不变量。
- Prompt 应让模型完成明确任务，不把多个角色混在一次调用里。
- 对外部模型发送的数据必须按 [21-privacy-and-data-lifecycle.md](21-privacy-and-data-lifecycle.md) 做最小化。

## 配置真源

- LLM 配置集中在 `config/llm.ts`。
- 默认与备份链路使用 `LLM_PROVIDER_DEFAULT` / `LLM_PROVIDER_BACKUP`。
- provider 各自拥有 `API_KEY`、`BASE_URL`、`MODEL`。
- reasoning effort、thinking type、thinking budget、reasoning summary 必须由 provider + model 能力判断后再发送。
- route override 只允许内部诊断，不作为常规业务配置。

## Provider 命名

- 使用标准 vendor 名称，不引入个人别名。
- 环境变量前缀保持清晰，如 `OPENAI_*`、`ANTHROPIC_*`、`GOOGLE_*`、`XIAOMI_*`、`ALIBABA_*`、`DEEPSEEK_*`、`MINIMAX_*`。
- 不支持的 provider 不得留在 active config surface。

## Agent 角色

| Agent | 场景 | 产出 |
| --- | --- | --- |
| generate | 离线生成候选题 | question bundle draft |
| judge | 校验题目答案、解析、程序行为 | accept/reject + reason |
| rewrite | 重写解析或补充讲解 | explanation delta |
| paper_audit | 真题/预制卷质量复核 | audit report |
| answer_fill | 补全结构化答案 | answer_json delta |

Agent 输出必须是结构化 JSON 或受 schema 约束的文本，不得直接写入数据库。

## Prompt 设计

- Prompt 必须包含考试类型、题型、知识点、难度、输出 schema、禁止事项、验收标准。
- 禁止在 prompt 中要求模型伪造官方来源。
- 程序题必须要求模型给出可验证答案依据。
- judge prompt 必须独立于 generate prompt，避免同一错误被自我确认。
- Prompt 变更需要记录 hash；重要批次必须把 prompt hash 写入 metadata。

Prompt 文案应清楚、短而完整，避免堆叠互相矛盾的要求。新增约束前先确认它会被后续 schema、validator、judge 或人工 review 检查，否则不要把愿望塞进 prompt 假装已受控。

## 输出约束

- LLM 输出必须经过 JSON parse、Zod/schema 校验、业务校验。
- 不接受含 Markdown 包裹的 JSON 作为最终导入资产；脚本可清洗但必须记录。
- 题目、答案、解析必须全部可序列化且稳定。
- 任何 `manual_check`、空响应、低置信度、答案矛盾必须进入报告，不得静默通过。

结构化输出优先使用明确 schema。模型返回多余字段时，validator 应决定拒绝、忽略或记录 warning；不得让未定义字段悄悄进入正式 bundle。

## 可追溯

每次 LLM 调用应记录：

- scene、lane、provider、model。
- prompt hash、request id、response model/id。
- tokens、latency、finish reason、warnings。
- cost estimate（若费率未知可为 0，但必须可区分）。
- error_message（失败时）。

`llm_provider_logs` 是费用台账和问题排查基础，不得绕过。

## 失败策略

- 默认 provider 失败可走 backup。
- provider 拒绝某个 reasoning/thinking 控制时，按能力降级或重试，不得无限循环。
- 空响应、解析失败、schema 失败必须算失败。
- 规模化生产前先跑小批量 probe，但 probe 只能进入 `artifacts/tmp/**`。

Fallback 必须可追溯：同一 item 经 default 和 backup 生成/修复时，报告应记录最终采用哪条 lane，以及另一条 lane 的失败或拒收原因。不得在成本、质量和来源记录不清楚时合并两个 provider 的输出。

## 人工复核

- 真题答案与官方答案冲突时，以人工/官方复核优先，不以模型结论覆盖。
- LLM 复核可辅助标记，但发布前必须有确定性校验或人工确认。
- 抽样策略需要覆盖 CSP-J、CSP-S、GESP 和所有题型。

人工复核应关注模型最容易错的地方：题面条件遗漏、选项歧义、程序边界、知识点错标、解析跳步、难度误判、真题年份/来源错误。复核结论要能回写到 report 或 question_reviews。

## 禁止事项

- 禁止将模型输出直接 apply 到生产表。
- 禁止把 runtime 用户答案、隐私数据、session 信息发送给内容生产模型。
- 禁止在公开文档或日志中记录 API key。
- 禁止用 LLM 运行结果替代测试。

## Prompt 资产管理

- prompt 模板应放在 `prompts/` 或脚本内清晰常量，禁止散落在临时命令中。
- 生产批次必须记录 prompt hash。
- few-shot 示例必须标明来源和适用题型。
- prompt 变更应有小批量回归，不直接用于规模化生产。
- prompt 中的输出 schema 必须与 Zod/bundle schema 对齐。

Prompt hash 变化但 schema/validator 不变时，仍需记录批次差异；schema 变化时必须同步脚本、测试 fixture、bundle contract 和文档。

## 模型能力矩阵

对每个 provider/model 维护以下能力认知：

- 是否支持 reasoning effort。
- 是否支持 thinking mode。
- 是否支持 thinking budget。
- 是否支持 reasoning summary。
- 最大输入/输出 token。
- JSON 输出稳定性。
- 费用估算是否已配置。

能力判断必须在 `config/llm.ts` 集中，不在各脚本分叉。

能力矩阵只描述当前已验证能力，不写市场宣传式能力。未验证能力按 unsupported/unknown 处理，直到有 probe、文档或测试证明可用。

## 成本控制

- 规模化生产前先跑 probe。
- 每批设置最大题数和失败阈值。
- 超过预算或错误率阈值自动停止。
- provider fallback 不能造成双倍重复生成而不记录。
- cost_estimate 未配置费率时必须显式为 0 或 unknown，不得伪造。

每个批次应设置停止条件：连续失败数、schema 失败率、答案矛盾率、成本上限或人工复核拒收率。达到停止条件时先产出报告，不继续扩大损失。

## 质量评估

LLM 相关变更至少评估：

- schema 通过率。
- judge accept/reject 比例。
- 空响应/截断比例。
- 重复率。
- 官方答案 mismatch。
- 人工抽样问题数。

规模化内容生产报告应进入 `artifacts/reports/<year>/<runId>/`。

质量评估不能只看通过率。一个高通过率批次如果重复率高、解析空泛、难度偏移或知识点分布失衡，也不能直接发布。

## 隐私与版权

- 不向模型发送用户个人信息、session、邮箱、真实 IP。
- 真题内容进入模型前必须确认用途属于内部审核/解析，不公开泄露第三方受限材料。
- 模型输出不得声称“官方解析”，除非确有官方来源。
- 引用外部资料时保留来源字段。

## Agent 间协作

多个 agent 参与内容生产时：

- generate 只产候选。
- judge 只判定，不修改原题。
- rewrite 只能生成 delta。
- human/admin 决定最终 publish。
- import workflow 负责写库。

禁止让一个 agent 同时生成、判定、发布同一批内容。

## LLM 变更检查清单

- 是否仍只用于离线/受控场景。
- 是否更新 `config/llm.ts` 能力与配置真源。
- 是否有 prompt hash、runId、provider/model、成本和错误率记录。
- 是否有 schema/validator/fixture 对齐。
- 是否没有发送用户隐私、session、邮箱、真实 IP 或生产用户答案。
- 是否有小批量 probe 和失败停止条件。
- 是否说明人工复核或确定性校验如何覆盖模型风险。
