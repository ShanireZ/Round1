# LLM、内容 Agent 与 Prompt 规范

## 架构边界

LLM 只用于离线内容生产、判官复核、解析重写、真题审核、paper audit 等受控场景。生产考试运行时不得调用 LLM 生成题目、换题、在线组卷或实时诊断。

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

## 输出约束

- LLM 输出必须经过 JSON parse、Zod/schema 校验、业务校验。
- 不接受含 Markdown 包裹的 JSON 作为最终导入资产；脚本可清洗但必须记录。
- 题目、答案、解析必须全部可序列化且稳定。
- 任何 `manual_check`、空响应、低置信度、答案矛盾必须进入报告，不得静默通过。

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

## 人工复核

- 真题答案与官方答案冲突时，以人工/官方复核优先，不以模型结论覆盖。
- LLM 复核可辅助标记，但发布前必须有确定性校验或人工确认。
- 抽样策略需要覆盖 CSP-J、CSP-S、GESP 和所有题型。

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

## 成本控制

- 规模化生产前先跑 probe。
- 每批设置最大题数和失败阈值。
- 超过预算或错误率阈值自动停止。
- provider fallback 不能造成双倍重复生成而不记录。
- cost_estimate 未配置费率时必须显式为 0 或 unknown，不得伪造。

## 质量评估

LLM 相关变更至少评估：

- schema 通过率。
- judge accept/reject 比例。
- 空响应/截断比例。
- 重复率。
- 官方答案 mismatch。
- 人工抽样问题数。

规模化内容生产报告应进入 `artifacts/reports/<year>/<runId>/`。

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
