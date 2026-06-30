# Search 模块设计文档

## 设计定位

Search 当前更准确地说是 Relationship Search：关系检索服务，而不是产品主导航功能。它让上层模块用“找上次聊过储能试点的人”这类自然语言，配合结构化过滤和权限约束，检索已有关系上下文。

Search 不拥有联系人事实，也不直接生成业务动作。联系人数据归 Contacts/Connections；活动目标归 Events；跟进策略归 Followups；编排和工具选择归 Orbit AI。Search 的输出应该是可解释的候选结果，而不是搜索引擎内部 raw hit。

一句话边界：Search 负责“如何从已有关系证据中找到匹配项”；调用它的 feature 负责“为什么要搜、给什么查询、如何排序解释、下一步是什么”。

## 子能力范围

- `relationship-natural-search-mock`：自然语言查询、建议词、关系结果和来源解释。
- 被 Contacts、Orbit AI 和 Dashboard 辅助使用。

Search 不应提供 `recommendPeopleForEvent`、`chooseBestIntro`、`prioritizeFollowup` 这类产品决策方法。这些方法属于 Events、Contacts、Followups、Agent 或 Recommendations。Search 可以提供底层 retrieval 方法，例如 relationship candidates、evidence、connections 或 source-scoped lookup。

## Feature 与 Search 的分工

上层 feature 拥有业务策略：

- Contacts 决定什么叫“值得推荐的人脉”、候选资格、排序权重和联系人动作。
- Events 决定某个活动下该找什么样的人、参会目标如何影响排序、开场建议如何生成。
- Followups 决定哪些关系进入跟进队列、逾期和沉睡关系如何解释。
- Orbit AI 只选择白名单工具并编排结果，不直接实现这些业务策略。

Search 拥有检索边界：

- 接收自然语言 query、结构化 filters、source/evidence/permission constraints。
- 在已有关系证据、联系人摘要、连接记录或未来索引中召回候选。
- 保留 evidence ids、source references、matched fields、score/rationale 和 provenance。
- 不写联系人、不创建任务、不发送消息、不修改外部系统。

推荐调用形态：

```text
Feature-owned tool or service
  -> builds RelationshipSearchInput
  -> Search retrieves evidence-backed candidates
  -> Feature ranks, explains, and maps to product action/artifact
```

## Query 与结构化字段

自然语言 query 和结构化字段不是二选一。未来 live search 应使用混合检索：

- `semanticQuery` 或当前 `query`：用于 embedding/vector recall、全文检索或 BM25。
- structured filters：用于行业、source、value type、follow-up status、event id、contact id、时间窗口等硬约束或排序 boost。
- constraints：用于 tenant/user 权限、证据必须存在、provider permission、privacy scope。

结构化字段不应该被简单拼进 embedding 后丢失语义。它们是向量搜索的护栏和上下文：先限制可搜索范围，再做 semantic/keyword/graph retrieval，最后映射成 Search contract。

## 契约与数据边界

契约位于 `features/search/contract.ts`。核心 DTO 包括 query、suggestion、result item、matched fields、source refs、confidence 和 no-index-read 标记。页面不能读取搜索索引 raw score、embedding vector、provider raw hit 或内部 analyzer 字段。

Service factory 提供 relationship natural search service。

## Mock 行为

Mock search 使用本地 fixture 和确定性匹配规则：query 被拆成小写 token，所有 token 都必须在候选搜索文本中命中；结构化 filters 使用枚举精确匹配。它不访问真实搜索索引、向量数据库、CRM 或外部网络。查询为空、无结果、pending 和 failure 都必须返回明确状态。

当前 mock 实现已经拆成两层可替换接口：

- `features/search/backend.ts`：声明 `RelationshipSearchBackend` 和 `RelationshipSearchStore`。
- `features/search/backend-factory.ts`：通过 `ORBIT_RELATIONSHIP_SEARCH_BACKEND` 和 `ORBIT_RELATIONSHIP_SEARCH_STORE` 选择实现。
- `features/search/backends/basic-rules-backend.ts`：当前基础检索 backend，执行 token/filter 规则。
- `features/search/stores/fixture-store.ts`：当前基础 store，读取本地 fixture；后续数据库、远程索引或图谱 store 应接同一接口。

当前支持的配置是 `ORBIT_RELATIONSHIP_SEARCH_BACKEND=basic_rules` 和 `ORBIT_RELATIONSHIP_SEARCH_STORE=fixture`。未配置时默认使用这两个实现。未知 backend/store 会返回受控 search failure，不静默 fallback。

## Live 替换方案

Live 可以接全文搜索、向量搜索、关系图谱或混合检索。Provider 结果必须映射成 Search contract。相关性分数可以影响排序，但页面应展示用户能理解的 matched reason。

Live implementation 应分三层：

1. retrieval engine：处理 metadata filtering、vector retrieval、keyword retrieval、graph constraints 和 rerank。
2. contract mapper：把 provider hits 映射成 relationship result item，保留 evidence、matched fields、score、source refs 和 provenance。
3. feature policy：由调用方 feature 根据场景做最终排序、推荐理由、动作和 artifact mapping。

Live provider 不得返回没有 evidence ids 和 source references 的结果；如果 provider hit 缺少来源，应丢弃或返回受控失败，不能伪造关系上下文。

## API 与页面使用

API 包括 relationship search 和 suggestions。产品上 Search 可嵌入 Contacts 筛选、Orbit AI 意图解析和 Dashboard drill-down。它不需要单独成为主导航页面，除非后续产品需要完整搜索中心。

如果未来需要 `/app/search` 搜索中心，它也应该是 Relationship Search 的 consumer，而不是让 Search 拥有联系人、活动或跟进业务动作。

## 测试要求

- query 测试覆盖关键词、自然语言、空查询、无结果。
- suggestion 测试覆盖常见关系语义。
- no-side-effect 测试确认 mock 不读真实索引。
- live 接入测试确认 raw score、embedding vector、provider raw hit 和敏感 query log 不泄露到页面。
- hybrid retrieval 测试确认 filters/permissions 先限制候选范围，semantic retrieval 不能越权返回无证据结果。

## 团队协作规则

Search 团队只维护检索体验、provider adapter、result mapping 和结果解释。联系人数据归 Contacts/Connections；活动推荐归 Events；动作推荐归 Agent/Recommendations；AI 工具编排归 Orbit AI。
