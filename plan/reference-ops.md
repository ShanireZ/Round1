# Reference — 部署运维

> 本文件从 [01-reference.md](01-reference.md) 拆分而来。完整参考索引见 [01-reference.md](01-reference.md)。
> **当前对齐说明（2026-04-26）**：Step 06 当前已经明确为“两层架构 + production no-runner”。生产运行时不依赖 `cpp-runner`，离线内容环境单独承载 `scripts/workers/contentWorker.ts` 与 sandbox/生成链路。当前仓库仍没有统一的 `scripts/healthcheck.ts` 或版本化 PM2 ecosystem，因此本文件以“人工 runbook + 明确边界”作为当前现状，而不是声明一键自动化部署已完成。

---

## 首次部署初始化顺序

```bash
# 1. 创建数据库表结构
tsx scripts/migrate.ts up

# 2. 初始化蓝图与考试类型
tsx scripts/seedBlueprint.ts

# 3. 抽取知识点树（需 LLM 可用）
tsx scripts/bootstrapKnowledgePoints.ts

# 4. 导入历年真题（人工审核后 confirm）
tsx scripts/ingestRealPapers.ts

# 5. 生成并校验 question bundle（离线内容环境执行）
# 默认输出：papers/<year>/YYYY-MM-DD-<questionType>-<count>.json
tsx scripts/generateQuestionBundle.ts --exam-type <exam-type> --question-type <question-type> --primary-kp-code <kp-code> --difficulty <difficulty> --count <count>
tsx scripts/validateQuestionBundle.ts papers/<year>/<bundle-file>.json --run-sandbox --write

# 6. 导入题目 bundle（生产环境可 dry-run / apply）
tsx scripts/importQuestionBundle.ts papers/<year>/<bundle-file>.json --dry-run
tsx scripts/importQuestionBundle.ts papers/<year>/<bundle-file>.json --apply

# 7. 生成并校验 prebuilt paper bundle（离线内容环境执行）
tsx scripts/buildPrebuiltPaperBundle.ts --exam-type <exam-type> --difficulty <difficulty> --count <count> --output artifacts/prebuilt-papers/paper-packs.json
tsx scripts/validatePrebuiltPaperBundle.ts artifacts/prebuilt-papers/paper-packs.json

# 8. 导入预制卷 bundle（生产环境可 dry-run / apply）
tsx scripts/importPrebuiltPaperBundle.ts artifacts/prebuilt-papers/paper-packs.json --dry-run
tsx scripts/importPrebuiltPaperBundle.ts artifacts/prebuilt-papers/paper-packs.json --apply

# 9. 创建首个管理员账号
# 当前仓库暂无 scripts/initAdmin.ts；首个管理员通过数据库手工设置 role 或后续补专用脚本
```

---

## 热路径查询性能预案

针对 300~600 人同时考试场景：
- `prebuilt_papers`：按 `exam_type + difficulty + status='published'` 查询，结合最近 `N` 次 attempts 做 paper 级软排除
- `paper_question_slots`：创建草稿卷时批量复制 `prebuilt_paper_slots`，不再做在线抽题与库存统计
- `attempts.answers_json` autosave：`jsonb_set()` 增量更新单题答案
- **startAttempt 并发峰值**：事务 10~30ms，pg.Pool max=10×2=20，理论吞吐 ~400 TPS（provisional — 需实测验证）
- **班级任务尖峰**：前端 0~3s 随机抖动缓冲
- **autosave 频控**：per-user 1 次/30s
