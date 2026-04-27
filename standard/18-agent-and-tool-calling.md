# Agent 协作与工具调用规范

## 适用对象

本规范适用于 Codex、Claude、内容生产 agent、审查 agent、脚本执行 agent，以及所有通过 MCP/插件/CLI 修改仓库的自动化协作者。

## 基本原则

- 先读现状，再改文件。
- 尊重工作区已有改动；不得回滚自己没有做的修改。
- 小步执行、及时验证、记录残余风险。
- 安全、数据、考试公平、UI/UX 定稿优先于速度。
- 对库、框架、SDK、CLI、云服务问题，必须用 Context7 或官方文档确认当前用法。

## 文件修改

- 代码和文档手动编辑优先使用 `apply_patch`。
- 不用脚本批量改文件，除非变更机械且可验证。
- 不在无关文件做格式化或重排。
- 新增文件必须放入正确目录，并在索引/README/reference 中补链接。
- 写中文文档可使用中文标点；代码保持仓库格式。

## Shell 调用

- 搜索优先 `rg` / `rg --files`。
- 文件读取可并行，避免串联嘈杂输出。
- 不运行 destructive 命令，除非用户明确要求或单独批准。
- 重要命令因沙箱/网络失败时，按权限流程请求提升，不绕过审批。
- 长任务必须等完成或明确说明未完成，不能留后台关键进程。

## MCP/插件

- Context7：库/框架/SDK/API/CLI/云服务当前文档。
- Browser Use / Playwright：本地浏览器、localhost、截图、交互验证。
- GitHub：远程 issue/PR/CI 信息。
- Cloudflare：仅在明确涉及 Cloudflare 配置/API 时使用。
- Presentations/Documents/Spreadsheets：仅在对应文件类型任务使用。

## 子 Agent

只有用户明确要求并行 agent、sub-agent、delegation 时才可派发。派发时必须：

- 任务自包含、边界清晰。
- 写明文件所有权。
- 告知 sub-agent 不要回滚他人改动。
- 不把当前关键阻塞任务交出去等待。

## 内容生产 Agent

- 只能在离线内容环境生成候选资产。
- 输出必须进 `artifacts/tmp/**` 或标准 bundle 路径。
- 不直接写生产 DB。
- 必须经过 schema、去重、sandbox、judge/人工复核后才可 apply。

## 调用外部服务

- 不发送 secret、session、验证码、用户隐私、未脱敏日志。
- LLM 调用必须记录 provider/model/tokens/latency/error。
- 邮件、Turnstile、OIDC、Cloudflare 等调用必须走配置真源。
- 网络失败不得静默吞掉；要返回可行动错误。

## Agent 输出规范

实现类任务最终说明必须包含：

- 改了哪些文件。
- 核心行为变化。
- 运行了哪些验证。
- 未运行验证的原因。
- 需要用户注意的风险。

审查类任务必须先列 findings，带文件和行号；无问题也要说明残余测试风险。

## 禁止事项

- 禁止为了让测试通过而删除有效测试。
- 禁止改 UI/UX 定稿风格。
- 禁止恢复在线组卷、在线换题、运行时 AI 生成题。
- 禁止伪造已运行测试或外部查询结果。
- 禁止在计划和文档中把未落地能力写成已完成。
- 禁止把临时 alias 当作正式可审计资产。

