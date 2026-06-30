# Relationship Search 与 Orbit Agent 工具边界

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/docs/superpowers/specs/2026-07-01-relationship-search-and-agent-tools-design.md` |
| 中文镜像 | `knowledge/docs/zh/relationship-search-and-agent-tools-design.zh.md` |
| 分类 | `architecture-design` |
| 状态 | `current` |
| 新鲜度 | `verified-current` |
| 负责人域 | `architecture:relationship-search-orbit-ai` |

## 怎么读

这页记录 Search、Orbit AI 和各业务 feature 之间的目标边界。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

如果只想看结论，先读“设计决策”和“混合检索模型”。如果要落地实现，再读 Search、Orbit AI、Contacts 的 feature/module 文档。

## 中文摘要

采用 central planner, distributed tools：Orbit AI 负责 planner、runtime、工具白名单、trace、artifact mapping 和 synthesis；Contacts、Events、Followups、Chat 等业务 feature 负责各自工具策略。Relationship Search 是共享检索底座，只负责从已有关系证据中找候选，不拥有推荐策略或产品动作。

## 审计依据

已同步到以下文档入口：

- `repos/orbits/features/search/DESIGN.md`
- `repos/orbits/docs/architecture/modules/search.md`
- `repos/orbits/features/orbit-ai/DESIGN.md`
- `repos/orbits/docs/architecture/modules/orbit-ai.md`
- `repos/orbits/features/contacts/DESIGN.md`
- `repos/orbits/docs/architecture/modules/contacts.md`
- `repos/orbits/features/search/relationship-natural-search-mock/LIVE_IMPLEMENTATION.md`

## 结构化阅读入口

- 第 1 节：Context
- 第 2 节：Decision
- 第 3 节：Relationship Search Scope
- 第 4 节：Feature Policy Scope
- 第 5 节：Hybrid Retrieval Model
- 第 6 节：Current Mock Behavior
- 第 7 节：Live Replacement Requirements
- 第 8 节：Migration Implications
- 第 9 节：Testing Expectations

## 保留的代码与命令证据

源文档中的调用方向保留如下：

```text
Orbit AI planner/runtime
  -> tool registry
  -> feature-owned tool adapter
  -> feature service and optional shared retrieval service
  -> normalized tool result
  -> Orbit AI artifact mapper / synthesis
```

## 源文档正文

## Context

Orbit AI 是对话编排层。Relationship Search 是面向关系证据的检索边界。当前文档已经把这两个概念分开，但实现上开始把部分产品工具策略放进 `features/orbit-ai`，尤其是 `contacts.recommend`。

这份设计在继续接 live search、向量检索和 agent 工具之前，先记录目标边界。

## Decision

采用 central planner, distributed tools：

```text
Orbit AI planner/runtime
  -> tool registry
  -> feature-owned tool adapter
  -> feature service and optional shared retrieval service
  -> normalized tool result
  -> Orbit AI artifact mapper / synthesis
```

Orbit AI 拥有 intent planning、allowed tool names、schema validation、runtime guardrails、trace、artifact mapping 和 final synthesis。业务 feature 拥有工具策略。

Relationship Search 仍是共享 retrieval substrate。它不拥有产品推荐或动作。

## Relationship Search Scope

Relationship Search 回答的问题是：给定 semantic 或 keyword query，再加 filters 和 constraints，哪些已有 relationship records、evidence、connections 或 candidate contacts 匹配？

它可以拥有：

- query 和 filter input contract
- metadata filtering
- keyword/full-text retrieval
- vector retrieval
- graph constraints
- provider result mapping
- evidence ids、source refs、matched fields、score/rationale 和 provenance

它不能拥有：

- 最终联系人推荐策略
- 活动场景下“我该见谁”的决策
- follow-up prioritization
- message drafting
- 外部副作用
- 对 Contacts、Events、Followups、Chat 或 Agent state 的写入

## Feature Policy Scope

Feature 决定为什么搜索，以及搜索结果要怎么变成产品结果。

- Contacts 或 Recommendations 拥有 `contacts.recommend`：候选资格、排序、推荐理由和联系人动作。
- Events 拥有 `events.recommend`：活动目标、参会者上下文、准备状态、开场需求和活动级排序。
- Followups 拥有 `followups.reviewQueue`：逾期和沉睡关系解释、队列排序和提醒边界。
- Chat 拥有 `chat.context`：会话上下文、隐私边界和草稿准备。

这些工具可以调用 Relationship Search 做候选召回，但由它们自己决定候选如何变成 artifact 或 action。

## Hybrid Retrieval Model

未来 AI search 不应只依赖向量搜索。Live search path 应组合：

- semantic query：用于 embedding/vector recall
- keyword query：用于 lexical fallback 或 BM25
- metadata filters：用于 industry、source type、value type、relationship stage、event id、contact id、follow-up status 和 time range
- constraints：用于 tenant、user、permissions、privacy scope 和 evidence-required guarantees
- graph constraints：用于已有 relationship paths 和 source-backed connections
- feature-specific reranking：检索后由业务 feature 做最终排序

结构化字段不是向量搜索的替代品。它们是护栏和上下文：限制候选范围，防止权限泄漏，保留可解释性，也提供纯语义相似度无法安全推断的 ranking boost。

## Current Mock Behavior

当前 `features/search` mock 是确定性的：

- query text 被拆成小写 terms
- 每个 token 都必须包含在候选 search text 中
- filters 是精确枚举匹配
- query 和 filter groups 用 AND 组合
- filter group 内的 values 用 OR 组合
- semantic search、embeddings、external indexes、live database reads 和 external network calls 都显式为 false

这适合作为 mock-first contract，但不是语义搜索实现。

## Live Replacement Requirements

Live Relationship Search 必须保持 public service interface 稳定，并把所有 provider hits 映射成 Search contract。

必要属性：

- 没有 evidence ids 和 source references 的结果不能返回
- page data 不能暴露 raw provider payloads、embedding vectors、raw scores 或 analyzer internals
- 不记录未经 redaction 和 account scoping 的敏感 raw query
- metadata 和 permission constraints 必须先于广义 semantic expansion 执行
- semantic search、embedding generation、cross-provider index queries、database reads 和 provider calls 都要有明确 provenance
- 如果 provider hit 不能绑定到 source-backed relationship evidence，应受控失败或省略

## Migration Implications

现有 `features/orbit-ai/contact-recommendation-matching.ts` 可以作为过渡实现保留，但目标所有权应把 recommendation policy 移到 Contacts 或 Recommendations。

推荐方向：

```text
Orbit AI contacts.recommend
  -> Contacts/Recommendations tool adapter
  -> Relationship Search queryRelationships/queryCandidates
  -> Contacts/Recommendations ranking and action policy
  -> Orbit AI artifact mapping and synthesis
```

Events、Followups 和 Chat 也应采用同样模式，不应长期停留在 Orbit AI preview-only artifacts。

## Testing Expectations

测试需要证明：

- Search mock 仍然确定、无副作用。
- Live search 保留 Search DTO shape，不暴露 provider internals。
- Filters 和 permission constraints 能防止 vector retrieval 返回越权记录。
- Feature-owned tools 能使用 Search，而不把业务策略移入 Search。
- Orbit AI tool whitelist 和 trace 能展示 selected tools、source modules、artifact producers、safety 和 evidence provenance。
