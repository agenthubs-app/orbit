# search 能力 Live 交接：relationship natural search mock

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/features/search/relationship-natural-search-mock/LIVE_IMPLEMENTATION.md` |
| 中文镜像 | `knowledge/docs/zh/live-handoff-feature-search-relationship-natural-search-mock.zh.md` |
| 分类 | `implementation-handoff` |
| 状态 | `generated-evidence` |
| 新鲜度 | `likely-current` |
| 负责人域 | `feature:search` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

记录 search 模块中 relationship natural search mock 能力从 mock-first 实现切换到 live provider 时需要替换和验证的边界。当前重点是：live search 可以接全文、向量和图谱，但必须先受权限、结构化 filters 和 evidence constraints 约束。

## 审计依据

已核对对应 feature 目录存在：repos/orbits/features/search/relationship-natural-search-mock。目录级实时行为仍以 service factory、API route 和测试为准。

## 结构化阅读入口

- 第 1 节：关系 Natural 搜索 Mock Live Handoff
- 第 2 节：Live 服务 Provider files
- 第 3 节：源标题：Switch mechanism
- 第 4 节：Required env vars or 权限
- 第 5 节：Privacy 和 provenance constraints
- 第 6 节：Hybrid retrieval shape
- 第 7 节：Replacement 测试

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

## 中文要点

- 当前 sprint 只实现 mock-first 的 Relationship natural search 边界；mock 使用确定性 fixture 和规则过滤，不调用 live search、storage、AI、calendar、email、notification、device 或 provider services。
- Live provider 必须保留 `features/search/service.ts` 的公开接口，route handler 只能消费 service interface，不能直接依赖 provider client。
- 每个搜索结果都必须保留 source evidence ids、source type、captured time 和命中原因。缺少 evidence 的 provider hit 应被丢弃或转成受控失败。
- 当前可配置实现是 `ORBIT_RELATIONSHIP_SEARCH_BACKEND=basic_rules` 和 `ORBIT_RELATIONSHIP_SEARCH_STORE=fixture`。新数据库、向量库、全文索引或图谱读取应新增 backend/store 并注册到 `features/search/backend-factory.ts`，不要改 API route 或上层 feature 调用方式。
- 结构化 filters 和 permission constraints 必须先于广义 semantic expansion 执行。向量搜索可以提高召回，但不能返回当前用户/account 权限之外或缺少来源证据的记录。
- Live relationship search 应组合 semantic query、keyword query、metadata filters、graph constraints 和 feature-owned reranking。
- Search provider 可以拥有 vector/full-text/graph retrieval 机制，但 Contacts、Events、Followups、Chat、Agent 和 Orbit AI 仍拥有各自产品策略。
- 不要在 Search service 增加 `recommendPeopleForEvent`、`prioritizeFollowups` 这类产品方法。调用方 feature 可以构造 `RelationshipNaturalSearchInput`，调用 Search 后再做排序、解释、动作和 artifact mapping。
- 替换测试必须覆盖 API envelope、empty/pending/failure、provider evidence/provenance、raw payload/query log 隐私，以及 hybrid retrieval 的 filters/permissions 约束。

源文档正文主要不是中文。中文镜像不直接机翻全文，避免生成一份看似同步、实际难以审计的副本；阅读时先看本页摘要、审计依据、标题入口和代码证据。需要逐段核对时，请打开上方原始来源。
