# search 模块架构

本页是 Orbit Wiki 的中文阅读版。它保留原始文档的路径、代码块、命令和接口标识，用中文说明阅读目的、审计依据和结构入口。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/docs/architecture/modules/search.md` |
| 中文镜像 | `knowledge/docs/zh/module-search.zh.md` |
| 分类 | `module-architecture` |
| 状态 | `current` |
| 新鲜度 | `verified-current` |
| 负责人域 | `module:search` |

## 中文摘要

说明 search 模块的定位、期望行为、Mock 行为和热拔插边界。字段和状态仍以对应 contract 文件为准。

## 审计依据

已登记关联代码路径：repos/orbits/features/search/service-factory.ts。

## 结构化阅读入口

- 第 1 节：Search 模块
- 第 2 节：模块定位
- 第 3 节：期望行为
- 第 4 节：Mock 行为
- 第 5 节：热拔插边界

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

## 模块定位

Search 负责自然语言关系搜索和搜索建议，使用户可以用问题形式查找联系人、连接和证据。

## 期望行为

模块应接受自然语言查询，返回匹配对象、解释、建议查询和错误状态。搜索结果必须保留来源引用。

## Mock 行为

Mock 服务用本地规则和 fixture 返回搜索结果、建议、空状态、等待和失败，不访问真实搜索索引、向量库、AI provider、数据库或网络。

## 热拔插边界

调用方必须通过 `features/search/service-factory.ts` 获取 `RelationshipNaturalSearchService`。真实索引、向量检索或 LLM search 可在 factory 后注册。
