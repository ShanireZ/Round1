# Reference — 部署运维

> 本文件从 [01-reference.md](01-reference.md) 拆分而来。完整参考索引见 [01-reference.md](01-reference.md)。
> **当前对齐说明（2026-04-27）**：Step 06 当前已经明确为“两层架构 + production no-runner”。生产运行时不依赖 `cpp-runner`，离线内容环境单独承载 `scripts/workers/contentWorker.ts` 与 sandbox/生成链路。当前仓库已补 `scripts/maintenance.ts healthcheck` 稳定入口与版本化 `ecosystem.config.cjs`，但真实域名、Caddy/TLS、PM2 reload、外部服务 smoke 与回滚仍需要部署环境演练。

---

## 首次部署初始化顺序

```bash
# 1. 创建数据库表结构
tsx scripts/maintenance.ts migrate up

# 2. 初始化蓝图与考试类型
tsx scripts/maintenance.ts seed-blueprint

# 3. 抽取知识点树（需 LLM 可用）
tsx scripts/maintenance.ts bootstrap-knowledge-points

# 4. 导入历年真题（人工审核后 confirm）
tsx scripts/ingest.ts ingest-real-papers --dir papers/real-papers

# 5. 生成并校验 question bundle（离线内容环境执行）
# 持久化输出：papers/<year>/<runId>/question-bundles/<runId>__question-bundle__<question-type>__<kp-code>__n<count>__vNN.json
tsx scripts/questionBundle.ts generate-llm --exam-type <exam-type> --question-type <question-type> --primary-kp-code <kp-code> --difficulty <difficulty> --count <count> --run-id <runId>
tsx scripts/questionBundle.ts validate papers/<year>/<runId>/question-bundles/<bundle-file>.json --run-sandbox --write

# 6. 导入题目 bundle（生产环境可 dry-run / apply）
tsx scripts/questionBundle.ts import papers/<year>/<runId>/question-bundles/<bundle-file>.json --dry-run
tsx scripts/questionBundle.ts import papers/<year>/<runId>/question-bundles/<bundle-file>.json --apply

# 7. 生成并校验 prebuilt paper bundle（离线内容环境执行）
# 持久化输出：artifacts/prebuilt-papers/<year>/<runId>/<runId>__prebuilt-paper-bundle__blueprint-v<blueprintVersion>__n<count>__vNN.json
tsx scripts/prebuiltPaperBundle.ts build --exam-type <exam-type> --difficulty <difficulty> --count <count> --run-id <runId> --blueprint-version <blueprintVersion>
tsx scripts/prebuiltPaperBundle.ts validate artifacts/prebuilt-papers/<year>/<runId>/<bundle-file>.json

# 8. 导入预制卷 bundle（生产环境可 dry-run / apply）
tsx scripts/prebuiltPaperBundle.ts import artifacts/prebuilt-papers/<year>/<runId>/<bundle-file>.json --dry-run
tsx scripts/prebuiltPaperBundle.ts import artifacts/prebuilt-papers/<year>/<runId>/<bundle-file>.json --apply

# 9. 创建首个管理员账号
# 临时强密码可用以下命令生成：
# node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
ROUND1_INITIAL_ADMIN_PASSWORD='<临时强密码>' tsx scripts/maintenance.ts init-admin --dry-run
ROUND1_INITIAL_ADMIN_PASSWORD='<临时强密码>' tsx scripts/maintenance.ts init-admin
# 固定用户名 elder；脚本只用于首个管理员引导，首次登录后会被 password_change_required 强制要求改密
```

---

## 热路径查询性能预案

针对 300~600 人同时考试场景：

- `prebuilt_papers`：按 `exam_type + difficulty + status='published'` 查询，结合最近 `N` 次 attempts 做 paper 级软排除
- `paper_question_slots`：创建草稿卷时批量复制 `prebuilt_paper_slots`，不再做在线抽题与库存统计
- `attempts.answers_json` autosave：`jsonb_set()` 增量更新单题答案
- **startAttempt 并发峰值**：事务 10~30ms，pg.Pool max=10×2=20，理论吞吐 ~400 TPS（provisional — 需实测验证）
- **班级任务尖峰**：前端 0~3s 随机抖动缓冲
- **autosave 频控**：per-user 默认 1 次/30s，由 `exam.autosaveRateLimitSeconds` 运行时配置控制；前端另通过 `/api/v1/config/client.autosaveIntervalSeconds` 做周期性 pending patch flush
