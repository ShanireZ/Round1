# 01-reference — 全局参考索引

> 本文件为全局参考的索引入口。详细内容已拆分到以下四个文件中。

## 文件索引

| 文件                                       | 内容范围                                               |
| ------------------------------------------ | ------------------------------------------------------ |
| [reference-schema.md](reference-schema.md) | 数据库 Schema、JSON 字段、状态机、蓝图接口、配置优先级 |
| [reference-api.md](reference-api.md)       | API 路由总表、前端路由、错误码、前端配置端点           |
| [reference-config.md](reference-config.md) | 关键决策、代码目录布局、环境变量（.env）               |
| [reference-ops.md](reference-ops.md)       | 首次部署初始化、热路径性能预案                         |
| [glossary.md](glossary.md)                 | 术语表（Glossary）                                     |

## 快速锚点导航

以下锚点保留兼容性，指向拆分后的具体文件：

### 数据库与数据模型
- [表定义](reference-schema.md#表定义)
- [关键索引](reference-schema.md#关键索引)
- [用户角色与账号模型](reference-schema.md#用户角色与账号模型)
- [试卷类型枚举](reference-schema.md#试卷类型枚举)
- [核心 JSON 字段定义](reference-schema.md#核心-json-字段定义)
- [content_hash 规范化规则](reference-schema.md#content_hash-规范化规则)
- [questions.status 枚举](reference-schema.md#questionsstatus-枚举)
- [prebuilt_papers.status 枚举](reference-schema.md#prebuilt_papersstatus-枚举)
- [import_batches.status 枚举](reference-schema.md#import_batchesstatus-枚举)
- [状态机附录](reference-schema.md#状态枚举附录)
- [任务考试状态模型](reference-schema.md#任务考试状态模型)
- [spec_json 蓝图接口定义](reference-schema.md#spec_json-蓝图接口定义)
- [app_settings 首发 key 清单](reference-schema.md#app_settings-首发-key-清单)
- [运行时配置优先级链](reference-schema.md#运行时配置优先级链)
- [时间戳规范](reference-schema.md#时间戳规范)

### API 与前端
- [API 路由总表](reference-api.md#api-路由总表)
- [前端路由表](reference-api.md#前端路由表)
- [ErrorResponse 接口与错误码](reference-api.md#errorresponse-接口与错误码)
- [前端配置端点](reference-api.md#前端配置端点)

### 配置
- [关键决策](reference-config.md#关键决策完整)
- [代码目录布局](reference-config.md#代码目录布局)
- [环境变量配置](reference-config.md#环境变量配置env)

### 运维
- [首次部署初始化顺序](reference-ops.md#首次部署初始化顺序)
- [热路径查询性能预案](reference-ops.md#热路径查询性能预案)