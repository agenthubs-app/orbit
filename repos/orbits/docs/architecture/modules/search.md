# Search 模块

## 模块定位

Search 负责自然语言关系搜索和搜索建议，使用户可以用问题形式查找联系人、连接和证据。

## 期望行为

模块应接受自然语言查询，返回匹配对象、解释、建议查询和错误状态。搜索结果必须保留来源引用。

## Mock 行为

Mock 服务用本地规则和 fixture 返回搜索结果、建议、空状态、等待和失败，不访问真实搜索索引、向量库、AI provider、数据库或网络。

## 热拔插边界

调用方必须通过 `features/search/service-factory.ts` 获取 `RelationshipNaturalSearchService`。真实索引、向量检索或 LLM search 可在 factory 后注册。
