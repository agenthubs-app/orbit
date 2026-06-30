# Search 模块

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
