# Reference — 真题题库审计与解析修订流程

> 适用于 `papers/real-papers/` 下的 `csp-j`、`csp-s`、`gesp` 全部题库审计工作。
> 本规范由 [CSP-J Explanation Audit Implementation Plan](../docs/plans/2026-04-17-csp-j-explanation-audit.md) 提炼而来，用于后续同类批次的复用执行。

---

## 1. 目标与适用范围

本流程用于对既有真题 JSON 进行人工审计和数据修订，覆盖以下四类目标：

1. 确认 `answer` 正确，必要时与官方答案做比对。
2. 将 `explanation` 改写为可复核的推导式解析，而非模板化表述。
3. 修复题面完整性问题，包括缺失的 `stem`、缺失代码、非法转义、尾随逗号等数据错误。
4. 复核 `questionType`、`difficulty`、`primaryKpCode`、`auxiliaryKpCodes`，保证题型结构与知识点标签一致。
5. 为后续导入、组卷、判题和前端展示提供稳定、可解析的数据底座。

该流程默认面向已有真题文件，不负责新增题目生成，也不替代正式入库脚本。

---

## 2. 完成标准

一个批次在“审计完成”前，至少要满足以下条件：

- 目标范围内所有题目的答案槽位非空。
- 目标范围内所有题目的解析槽位非空，且解析能说明答案是如何得出的。
- `reading_program` 与 `completion_program` 所需的代码字段、子题题面字段齐全；若仍缺失，必须作为残留风险显式记录。
- 元数据审计为 0 问题，至少包括 `questionType`、`difficulty`、`primaryKpCode`、`auxiliaryKpCodes` 的结构与合法性检查。
- 所有人工确认无误的题目已直接修订；存在争议的题目被单独列出并等待确认，不混入“已完成”。
- 至少完成一轮脚本校验和一轮人工抽样复核。

---

## 3. 审计原则

### 3.1 人工推理优先，禁止模板化批改

- 单选题必须说明正确项为什么成立，必要时点出干扰项的核心错误。
- 阅读程序题必须按执行流程、状态变化、边界条件或复杂度来源展开。
- 完善程序题必须说明空位与整体算法目标之间的关系，而不是只复述选项文本。

### 3.2 可确认题直接改，存疑题先挂起

- 当人工推理与本地 `answer` 一致时，可直接完善 `explanation`。
- 当人工推理与本地 `answer` 不一致时，不直接覆盖，先记录为待确认项。
- 若用户明确要求保留本地答案与官方答案不一致，也要在批次总结中标明该例外。

### 3.3 先修结构与完整性，再修文字质量

若 JSON 本身无法稳定解析，或题目存在缺失代码、缺失子题题面、非法转义等问题，应优先修数据完整性，再进行解析润色。

### 3.4 来源必须可追溯

- 优先使用官方题面或题库白名单来源。
- 若原文件只有图片或缺少文字题面，可用 OCR、官方页面抓取或可验证的备份来源恢复。
- 任何“人工推断补面”都要尽量保守，不得捏造题意。

---

## 4. 标准执行流程

### Step 0：锁定批次边界

开始前先明确：

- 目标目录，例如 `papers/real-papers/csp-j/`、`papers/real-papers/csp-s/` 或 `papers/real-papers/gesp/level-4-*`。
- 本轮涉及的年份或级别。
- 每份试卷对应的官方来源页面或图片来源。
- 是否存在已知例外项，例如“本地答案故意不跟随官方”。

建议为每个批次建立一份执行计划，命名格式沿用 `docs/plans/YYYY-MM-DD-<series>-explanation-audit.md`。

### Step 1：先跑基线校验

执行前先拿到当前批次的基线输出，至少包括：

```bash
npx tsx scripts/audit.ts audit-real-papers answers --official --limit <N>
npx tsx scripts/audit.ts audit-real-papers coverage
npx tsx scripts/audit.ts audit-real-papers code
npx tsx scripts/audit.ts audit-real-papers quality --dir <DIR>
npx tsx scripts/audit.ts audit-real-papers metadata --dir <DIR>
```

如需限定批次，可附加：

```bash
npx tsx scripts/audit.ts audit-real-papers answers --official --dir csp-j --year 2021 --limit <N>
```

解释：

- `answers --official`：统计答案空缺，并与官方答案做逐槽位比对。
- `coverage`：统计所有解析槽位是否为空。
- `code`：检查阅读程序和完善程序所需代码字段是否缺失。
- `quality`：检查弱 explanation、占位 stem、代码字段中的明显格式问题。
- `metadata`：检查题型、难度、知识点标签与题目结构的一致性。

注意事项：

- `--dir` 支持按输出目录过滤，例如 `csp-j`、`csp-s`、`gesp`，多个值可用逗号分隔。
- `--year` 按 JSON 顶层 `year` 过滤，多个值也可用逗号分隔。
- `--limit <N>` 在过滤之后生效，表示“最多抓取过滤结果中的前 N 份可比对试卷”。

### Step 2：按试卷逐题人工审计

推荐按年份顺序推进，每次处理 1 到 2 份卷后就进行一次保存和回看。

若批次较大，优先使用自动化脚本做两段式复核：

```bash
npx tsx scripts/review.ts review-real-papers --dir csp-s --write --chunk-size 1
```

仅复核元数据时可使用：

```bash
npx tsx scripts/review.ts review-real-papers --dir csp-j --write --chunk-size 1 --metadata-only
```

若只需补强 explanation，可直接使用 explanation 专用脚本：

```bash
npx tsx scripts/review.ts rewrite-paper-explanations --file 2025.json --start-q 16 --end-q 18 --write --chunk-size 1 --timeout 180000
```

说明：

- 计划文档中的示例命令默认不写命令行 provider 覆盖参数。脚本会读取 `.env` 中的 `LLM_PROVIDER_DEFAULT` / `LLM_PROVIDER_BACKUP` 形成默认链路；只有临时诊断 provider 故障时才在本地命令行显式覆盖。
- `reviewRealPapers.ts` 会对低风险项直接写回，并将低置信度、`stemStatus=manual_check`、`codeStatus=manual_check` 或题型变化项输出到 `scripts/.tmp/paper-review-report-*.json`。
- `rewritePaperExplanations.ts` 只处理 explanation 槽位，不改 metadata。

各题型的审计重点如下：

- `single_choice`
  - 独立解题，确认正确选项。
  - 解析要交代公式、定义、复杂度比较或逻辑判断依据。
- `reading_program`
  - 核对 `cppCode` 与子题题面是否完整。
  - 按程序运行过程或算法性质解释结论。
  - 若子题仍是“第 x 小题”之类占位文本，先恢复真实题面。
- `completion_program`
  - 从整体算法目标反推每个空位的语义。
  - 解析要说明“为什么这个空必须这样填”，而不是只说“标准二分写法”。

### Step 3：处理数据质量问题

在人工审计过程中，以下问题视为同一批次内必须顺手修复的数据质量问题：

- 非法 JSON 转义，例如未转义的反斜杠。
- 尾随逗号、对象缺字段、重复字段等结构错误。
- `reading_program` 或 `completion_program` 缺失代码字段。
- 子题 `stem` 仍是占位文本，没有真实题面。
- 因图片依赖导致本地无法审题的题目。

处理顺序建议为：先让文件恢复为可解析状态，再补齐题面或代码，再优化解析。

### Step 4：冲突与例外处理

若出现下列情况，不应直接混入“已修完”结果：

- 本地答案与人工推理冲突。
- 本地答案与官方答案冲突。
- 官方题面、样例或页面抓取文本存在明显缺损。
- 代码字段缺失，且短时间内无法从可信来源恢复。

此时应输出待确认清单，至少写明：

- 题目位置。
- 当前本地答案。
- 官方答案或来源内容。
- 人工推理结论。
- 建议动作，例如“等待用户确认”或“继续补源”。

若使用 `reviewRealPapers.ts`，这些高风险项应直接落入 `paper-review-report-*.json`，不要静默覆盖。

### Step 5：分批回归校验

每完成 1 到 2 份卷，至少重新跑一次：

```bash
npx tsx scripts/audit.ts audit-real-papers coverage
npx tsx scripts/audit.ts audit-real-papers code
npx tsx scripts/audit.ts audit-real-papers quality --dir <DIR>
npx tsx scripts/audit.ts audit-real-papers metadata --dir <DIR>
```

在批次收尾阶段，再补跑一次官方答案比对：

```bash
npx tsx scripts/audit.ts audit-real-papers answers --official --limit <N>
```

若本轮刚修过 JSON 结构，也应额外做一轮解析验证，例如使用编辑器错误检查或命令行 JSON 解析校验。

### Step 6：人工抽样复核

脚本校验后，还要做人工抽样复核，最少满足以下覆盖：

- 至少 1 道单选题。
- 至少 1 组阅读程序子题。
- 至少 1 道完善程序题。
- 若本轮修过数据完整性问题，再额外抽 1 处已修复的数据问题复看。

抽样时重点检查：

- 解析是否真的给出推导过程，而不是只复述答案。
- 题面、选项、答案、解析之间是否互相一致。
- 修复过的子题题面、代码字段是否能支撑读题。
- 是否还残留未说明的例外项。

### Step 7：形成批次结论

批次结束时，输出应至少包含：

- 已完成的试卷范围。
- 运行过的校验命令与关键结果。
- 抽样复核覆盖了哪些题型或年份。
- 明确保留的例外项。
- 尚未解决的残留风险。

---

## 5. 推荐记录模板

### 5.1 已完成项

- 哪些年份或级别已经完成答案审计。
- 哪些文件已经完成解析重写。
- 哪些题面或代码缺失问题已被恢复。

### 5.2 待确认项

- 题目位置。
- 本地答案。
- 官方答案。
- 人工结论。
- 需要谁做决定。

### 5.3 残留风险

- 仍缺代码的题。
- 官方来源本身存在歧义的题。
- 脚本能力不足导致只能人工补的部分。

---

## 7. 当前落地脚本约定

- `scripts/audit.ts audit-real-papers`：确定性基线与回归审计。
- `scripts/review.ts review-real-papers`：逐题 metadata + explanation 复核，支持 `--metadata-only`。
- `scripts/review.ts rewrite-paper-explanations`： explanation 专用重写，用于清理 `quality` 审计剩余弱项。
- `scripts/lib/scriptLlmClient.ts`：统一 scripts 侧 scene 路由和 provider fallback，避免 prompt 逻辑与调用主体耦合。

---

## 6. 后续批次建议

- `csp-s`：先确认官方比对脚本的目录过滤问题，再开始批量比对。
- `gesp`：优先按级别分批，不建议一次性覆盖所有 level；每个 level 单独建执行计划和收尾总结。
- 若后续此类批次持续发生，建议继续扩展 `scripts/audit.ts audit-real-papers` 的目录、年份或 glob 过滤能力，减少人工解释 `--limit` 含义的成本。
