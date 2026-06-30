# search 模块架构

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/docs/architecture/modules/search.md` |
| 中文镜像 | `knowledge/docs/zh/module-search.zh.md` |
| 分类 | `module-architecture` |
| 状态 | `current` |
| 新鲜度 | `verified-current` |
| 负责人域 | `module:search` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已和代码或测试做过明确核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

说明 Search 作为 Relationship Search 底层检索能力的职责、Mock 行为、热拔插边界和阅读顺序。字段、状态和副作用规则仍以对应 contract 与测试为准。

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

Search 是 Relationship Search 的底层检索能力，不是独立的产品主功能。它负责把自然语言 query、结构化 filters 和权限/证据约束转换成可解释的关系候选结果。

## 期望行为

模块应接受自然语言查询和结构化过滤条件，返回匹配对象、matched reason、source reference、evidence ids、建议查询和错误状态。搜索结果必须保留来源引用，不能暴露搜索 provider 的 raw hit、embedding vector 或内部 analyzer 字段。

Search 不决定最终业务动作。Contacts、Events、Followups、Dashboard 或 Orbit AI 调用 Search 后，仍由各自 feature 解释、排序并映射成产品动作或 artifact。

## Mock 行为

Mock 服务用本地 token 包含规则、精确枚举 filters 和 fixture 返回搜索结果、建议、空状态、等待和失败，不访问真实搜索索引、向量库、AI provider、数据库或网络。

## 热拔插边界

调用方必须通过 `features/search/service-factory.ts` 获取 `RelationshipNaturalSearchService`。真实索引、向量检索、全文检索、图谱检索或混合检索可在 factory 后注册。

推荐 live 结构：

- retrieval engine：metadata filtering、vector retrieval、keyword retrieval、graph constraints、rerank。
- contract mapper：把 provider hits 收敛成 Search contract，保留 evidence/provenance。
- feature policy：由调用方 feature 做最终推荐、排序、action 和 UI mapping。

当前实现已经把 retrieval engine 和数据读取拆成可替换接口：

- `ORBIT_RELATIONSHIP_SEARCH_BACKEND=basic_rules`
- `ORBIT_RELATIONSHIP_SEARCH_STORE=fixture`

新增数据库、全文索引、向量索引或图谱读取时，应添加新的 backend/store 实现并注册到 `features/search/backend-factory.ts`，不要改变 API route 或上层 feature 的调用方式。
