# Search 模块设计文档

## 设计定位

Search 负责自然语言关系搜索和建议。它让用户用“找上次聊过储能试点的人”这类表达检索关系上下文。Search 不拥有联系人事实，也不直接生成业务动作。

它的输出应该是可解释的候选结果，而不是搜索引擎内部 raw hit。

## 子能力范围

- `relationship-natural-search-mock`：自然语言查询、建议词、关系结果和来源解释。
- 被 Contacts、Orbit AI 和 Dashboard 辅助使用。

## 契约与数据边界

契约位于 `features/search/contract.ts`。核心 DTO 包括 query、suggestion、result item、matched fields、source refs、confidence 和 no-index-read 标记。页面不能读取搜索索引 raw score 或内部 analyzer 字段。

Service factory 提供 relationship natural search service。

## Mock 行为

Mock search 使用本地 fixture 和确定性匹配规则。它不访问真实搜索索引、向量数据库、CRM 或外部网络。查询为空、无结果、pending 和 failure 都必须返回明确状态。

## Live 替换方案

Live 可以接全文搜索、向量搜索、关系图谱或混合检索。Provider 结果必须映射成 Search contract。相关性分数可以影响排序，但页面应展示用户能理解的 matched reason。

## API 与页面使用

API 包括 relationship search 和 suggestions。产品上 Search 可嵌入 Contacts 筛选、Orbit AI 意图解析和 Dashboard drill-down。它不需要单独成为主导航页面，除非后续产品需要完整搜索中心。

## 测试要求

- query 测试覆盖关键词、自然语言、空查询、无结果。
- suggestion 测试覆盖常见关系语义。
- no-side-effect 测试确认 mock 不读真实索引。
- live 接入测试确认 raw score 不泄露到页面。

## 团队协作规则

Search 团队只维护检索体验和结果解释。联系人数据归 Contacts/Connections；动作推荐归 Agent/Recommendations。
