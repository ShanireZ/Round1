# Scripts Consolidation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 把 Round1/scripts 中相近的 offline/local/LLM bundle 脚本收敛成少数稳定入口，抽离共享 CLI 逻辑，并删除无价值薄封装脚本。

**Architecture:** 通过两个稳定入口脚本统一对外命令面，底层继续复用现有 bundle 实现脚本；共享的命令分发与 flag 解析下沉到 scripts/lib。先改入口和公共层，再改 package/README，最后跑脚本级测试和 lint/type check。

**Tech Stack:** TypeScript, tsx, Node.js ESM, top-level await, node:assert 脚本测试

---

### Task 1: 为稳定入口写失败测试

**Files:**
- Create: `scripts/tests/bundleCli.test.ts`

**Step 1: Write the failing test**

覆盖以下行为：

- 解析 `--dry-run` / `--apply` 时必须且只能选择一个
- question bundle 命令映射 `generate-llm -> generateQuestionBundle.ts`
- prebuilt paper bundle 命令映射 `build -> buildPrebuiltPaperBundle.ts`
- 未知命令应抛出包含合法命令列表的错误

**Step 2: Run test to verify it fails**

Run: `npx tsx scripts/tests/bundleCli.test.ts`

Expected: FAIL，原因是新 lib 尚不存在

### Task 2: 实现共享 CLI lib 与稳定入口

**Files:**
- Create: `scripts/lib/scriptCli.ts`
- Create: `scripts/lib/stableScriptEntry.ts`
- Create: `scripts/questionBundle.ts`
- Create: `scripts/prebuiltPaperBundle.ts`

**Step 1: Add shared CLI helpers**

实现：

- 互斥 apply mode 解析
- 简单命令注册表
- 命令帮助文本生成
- 统一执行 legacy implementation script

**Step 2: Wire stable entrypoints**

把 question bundle 与 prebuilt paper bundle 的对外命令统一映射到现有实现脚本。

**Step 3: Run test to verify it passes**

Run: `npx tsx scripts/tests/bundleCli.test.ts`

Expected: PASS

### Task 3: 让现有导入脚本复用公共 CLI 解析

**Files:**
- Modify: `scripts/importQuestionBundle.ts`
- Modify: `scripts/importPrebuiltPaperBundle.ts`
- Modify: `scripts/importQuestionBundles2026.ts`

**Step 1: Extract shared parsing usage**

复用 `scripts/lib/scriptCli.ts` 中的 helper，删除本地重复逻辑。

**Step 2: Run focused validation**

Run: `npx tsx scripts/tests/bundleCli.test.ts`

Expected: PASS

### Task 4: 清理无价值别名脚本并更新命令面

**Files:**
- Delete: `scripts/generate-offline-questions.ts`
- Delete: `scripts/build-paper-packs.ts`
- Delete: `scripts/validate-import-artifacts.ts`
- Modify: `package.json`
- Modify: `scripts/README.md`

**Step 1: Remove alias scripts**

删除纯转发脚本。

**Step 2: Update package and docs**

新增稳定命令，README 改为以新入口为主，旧实现脚本标为内部实现。

**Step 3: Run focused validation**

Run: `npm run lint -- scripts/questionBundle.ts scripts/prebuiltPaperBundle.ts scripts/importQuestionBundle.ts scripts/importPrebuiltPaperBundle.ts scripts/importQuestionBundles2026.ts scripts/lib/scriptCli.ts scripts/lib/stableScriptEntry.ts`

Expected: PASS

### Task 5: 完整验证

**Files:**
- Verify only

**Step 1: Run script tests**

Run: `npx tsx scripts/tests/bundleCli.test.ts`

Expected: PASS

**Step 2: Run lint**

Run: `npm run lint`

Expected: PASS 或仅有与本次无关的既有问题

**Step 3: Run TypeScript error check**

Run: `npx tsc -p scripts/tsconfig.json --noEmit`

Expected: PASS

### Rollback Plan

If something fails:

1. 先保留新 lib，恢复 package.json 和 README 到旧入口
2. 暂停删除 alias scripts，继续保留旧命令面兼容
3. 仅在稳定入口验证通过后再做清理

### Risks

- 通过子命令分发执行 legacy script 时，命令帮助和参数透传可能不一致；通过脚本级断言测试与手工 help 校验控制
- README 中仍可能残留历史脚本名；通过 grep 定点检查和最小化更新控制
- import batch 链路依赖较多，公共 helper 抽取若过度容易引入行为变化；本次只抽取参数解析，不改业务逻辑