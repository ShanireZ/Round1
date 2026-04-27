# 算法竞赛测试平台 — 方案总览

## 项目背景

为参加 CSP-J/S、GESP 等信息学竞赛的青少年构建客观题在线模拟测试平台（完全独立项目）。

**用户痛点**：初赛真题有限、模拟题质量参差、错题缺乏个性化诊断、教练难掌握全班薄弱面。

**核心价值**：
1. **AI 辅助离线内容生产** — 在开发环境离线生成、审查和发布题目与预制卷，确保内容质量与可回滚性
2. **自动批改与预生成解析** — 提交后同步返回客观得分与每题正误原因分析；AI 学习建议延后至未来版本
3. **数据沉淀** — 学生看进步曲线；教练看班级群体热力图及单个学生详情、布置任务
4. **独立域名与多方式登录** — 邮箱验证注册 / CppLearn OIDC / Passkey / 用户名或邮箱+密码；QQ互联为 feature flag 增强项
5. **线上低负载运行** — 生产环境只做导入、发布、选卷、答题与批改，不承担题目生成与在线组卷

**试卷类型**（10 种）：`CSP-J`、`CSP-S`、`GESP-1` ~ `GESP-8`。

---

## 技术栈

| 层级      | 选型                                                                                         |
| --------- | -------------------------------------------------------------------------------------------- |
| 后端      | Node 24 LTS + Express 5 + TypeScript，端口 `:5100`                                           |
| 前端      | React 19 + TypeScript + Vite + React Router 7 + TanStack Query v5 + shadcn/ui + Tailwind CSS |
| 数据库    | postgreSQL 18（独立数据库 `round1`），pg + drizzle-orm                                       |
| 缓存/队列 | Redis — Session Store / 频控 / 延迟作业                                                      |
| LLM       | 开发环境离线脚本使用 Vercel AI SDK（`ai`）多供应商路由                                       |
| 沙箱      | 独立 `cpp-runner` 服务（Docker + gVisor），用于离线题目生产与导入校验                        |
| 部署      | Caddy 反向代理 + PM2，三 VPS 分离（应用/沙箱/数据库）                                        |

---

## 系统架构

```
Developer + AI Agents (offline)
  ├─ LLM providers
  ├─ cpp-runner
  └─ question bundle / prebuilt paper bundle JSON

Browser (React 19 + Vite)
  │  round1.example.com
  │  /api/v1/*  session cookie
  ▼
Caddy 反向代理
  └─ round1.example.com → :5100

Express 5 + TypeScript (:5100)
  ├─ 中间件、路由、服务层（详见 01-reference.md）
  ├─ postgreSQL 18 → round1
  ├─ Redis → session / rate limit / delayed jobs
  ├─ Admin 导入中心 → 导入并发布内容 bundle
  └─ 预制卷选择与考试实例复制

External: CppLearn OIDC Provider
```

---

## 关键决策摘要

| #   | 决策项       | 选择摘要                                                                       |
| --- | ------------ | ------------------------------------------------------------------------------ |
| 1   | 项目形态     | 独立 Git 仓库 `Round1/`，与 CppLearn 仅 OIDC 对接                              |
| 2   | 题型范围     | 单选(15)+阅读程序(3×5)+完善程序(2×5)=100 分                                    |
| 3   | 内容生产策略 | 开发环境离线生成题目与预制卷，生产环境仅导入与发布                             |
| 4   | 去重策略     | MVP 仅规则去重（content_hash + Jaccard），不使用向量嵌入                       |
| 5   | 选卷策略     | 从已发布预制卷库按 exam_type + difficulty 选择，paper 级软排除 recent attempts |
| 6   | 题库生命周期 | 无自动退役；管理员可 publish / archive，未引用 draft 才允许硬删除              |
| 7   | 认证方案     | 本地账号为主，CppLearn OIDC 首发，QQ 为 feature flag                           |
| 8   | 会话模型     | express-session + Redis，idle/absolute TTL                                     |
| 9   | 频控分层防线 | L1 Cloudflare WAF + L2 Redis + L3 进程内 Map 兜底                              |
| 10  | API 规范     | OpenAPI 3.1，Zod schema 自动生成                                               |
| 11  | 视觉风格     | Modern Editorial × Contest Ceremony，Light/Dark 双主题，品牌红 + 中性灰阶；以 `plan/uiux_plan.md` 和 `standard/04-ui-ux.md` 为准 |
| 12  | 多教练模型   | V1 即支持多教练（class_coaches M2M），班级至少一位 owner                       |

> 完整决策表与全量技术细节见 [01-reference.md](01-reference.md)。

---

## 里程碑与分步索引

| 分步文件                                                   | 覆盖 Phase | 里程碑                                |
| ---------------------------------------------------------- | ---------- | ------------------------------------- |
| [step-01-scaffold-and-db.md](step-01-scaffold-and-db.md)   | 0 ~ 1      | 脚手架 + 数据库基础                   |
| [step-02-auth-system.md](step-02-auth-system.md)           | 2 ~ 6      | 完整认证体系                          |
| [step-03-question-bank.md](step-03-question-bank.md)       | 7 ~ 10     | 题库 + 离线 AI 内容生产 + 导入 + 沙箱 |
| [step-04-exam-and-grading.md](step-04-exam-and-grading.md) | 11         | 预制卷考试 + 批改 + 打印              |
| [step-05-coach-and-admin.md](step-05-coach-and-admin.md)   | 12 ~ 13    | 教练后台 + 管理后台内容库             |
| [step-06-deployment.md](step-06-deployment.md)             | 14         | 生产部署 + 运维                       |

---

## 验证策略概要

- **单元/集成测试**：Vitest — 认证服务、内容导入、预制卷选择、批改、班级、沙箱等核心模块
- **协议集成测试**：完整 flow 测试（注册→登录→选卷→答题→报告→班级→任务）
- **E2E**：Playwright — 覆盖注册、登录、选卷、答题、打印、班级入班、管理后台内容库等核心场景
- **启动健康检查**：生产运行时使用 `GET /api/v1/health`（应用 + Postgres + Redis）；邮件 / Turnstile 按部署清单手工校验；离线内容环境单独检查 `GET ${SANDBOX_RUNNER_URL}/health`（cpp-runner）与 `scripts/workers/contentWorker.ts`。

---

## 补充规范

- 真题题库的人工审计、解析回填、来源修复与抽样复核流程见 [reference-paper-audit.md](reference-paper-audit.md)。
