# 术语表（Glossary）

> 本文档定义 Round1 计划文档中频繁出现的领域术语，供团队成员和 AI 代理统一理解。

| 术语             | 英文 / 缩写       | 定义                                                                            |
| ---------------- | ----------------- | ------------------------------------------------------------------------------- |
| 蓝图             | Blueprint         | 试卷类型的离线配置模板，定义题数、分值、时长、知识点配额、难度分布等参数        |
| 预制卷           | Prebuilt paper    | 离线生成并发布到试卷库的一张标准卷，用户考试时从中复制个人实例                  |
| 试卷库           | Paper library     | 已导入的预制卷集合，支持 draft / published / archived 生命周期                  |
| 题库             | Question library  | 已导入的问题集合，支持 draft / reviewed / published / archived 生命周期         |
| 导入批次         | Import batch      | 一次 JSON bundle dry-run 或 apply 的审计记录，记录来源文件、校验摘要和导入结果  |
| 内容 bundle      | Content bundle    | 开发环境离线生成的 JSON 文件，类型包括 question bundle 与 prebuilt paper bundle |
| 主知识点         | primary_kp        | 每道题唯一绑定的核心考查知识点（`knowledge_points` 表中的节点）                 |
| primaryKpQuota   | —                 | 蓝图中按 `primary_kp` 编码指定的各知识点题量配额，用于离线生成预制卷            |
| 软排除           | Soft exclude      | 选卷时优先排除用户近期做过的预制卷或近期已使用的卷模板，不满足时再降级允许重复  |
| slot             | 大题组            | 试卷中一个题位，阅读程序和完善程序题的一个 slot 包含多个子题（subAnswers）      |
| subAnswers       | —                 | `attempts.answers_json` 中按 slot 聚合的子题答案 map，key 为子题编号            |
| attempt          | 作答记录          | 学生对一张试卷的一次完整答题过程，从 `started` 到 `submitted`                   |
| assignment       | 任务              | 教练布置给班级的定向测试，有截止时间和单次作答约束                              |
| draft            | 草稿试卷          | 从预制卷库复制出的个人考试实例，尚未开始答题                                    |
| publish          | 发布              | 将 draft 状态题目或预制卷开放给运行时使用                                       |
| archive          | 归档              | 将已发布内容从新分配流程下线，但保留历史引用                                    |
| challenge        | 验证挑战          | 注册/密码重置/换绑邮箱时的一次性验证流程（验证码或链接）                        |
| ticket           | 凭据              | challenge 验证成功后签发的一次性 token，用于完成后续操作（注册/重置密码等）     |
| step-up          | 二次认证          | Admin 执行敏感操作时要求的近期强认证校验（Passkey 或 TOTP）                     |
| grader           | 评分器            | 比对学生答案与标准答案的自动评分服务                                            |
| judge            | 判官              | LLM 二次校验角色，验证 AI 生成题目的正确性                                      |
| question_reviews | 审核记录表        | 独立于题目库存状态的审核追踪表，记录每轮人工/AI 审核结果                        |
| DEK / KEK        | 数据/密钥加密密钥 | TOTP 信封加密方案中的双层密钥结构                                               |
| VPS-1/2/3        | —                 | 三 VPS 分离架构：VPS-1（应用+控制面）、VPS-2（沙箱）、VPS-3（数据库）           |
| cpp-runner       | —                 | 独立的 C++ 编译运行沙箱服务，用于验证阅读/完善程序题的正确性                    |
| content_hash     | —                 | 题目内容的 SHA-256 归一化哈希，用于精确去重                                     |
| tab_nonce        | —                 | 答题会话的浏览器标签唯一标识（UUID v4），防止多标签页冲突                       |
