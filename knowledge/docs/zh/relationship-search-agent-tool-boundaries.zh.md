# 关系搜索与 Orbit Agent 工具边界设计

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/docs/superpowers/specs/2026-07-01-relationship-search-and-agent-tools-design.md` |
| 中文镜像 | `knowledge/docs/zh/relationship-search-agent-tool-boundaries.zh.md` |
| 分类 | `sprint-spec` |
| 状态 | `current` |
| 新鲜度 | `likely-current` |
| 负责人域 | `orbit-ai` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

确立中央 planner + 分布式工具归属的目标边界：Orbit AI 负责规划/白名单/trace/合成，业务 feature 拥有工具策略（contacts.recommend、events.recommend 等），Relationship Search 只做证据背书的检索基底（关键词/向量/元数据/图约束混合），不得拥有推荐策略或写副作用；并规定 live 检索的 provenance 与权限要求。

## 审计依据

记录目标边界的设计文档，边界原则仍是权威（roadmap 与 codex prompt 均引用）；当前检索实现以 repos/orbits/features/search/live-service.ts 及 tests/capabilities/relationship-natural-search-live-store.test.ts 为准，contact-recommendation-matching 的迁移仍是方向性描述。

## 结构化阅读入口

- 第 1 节：关系 搜索 和 Orbit Agent Tool 边界
- 第 2 节：上下文
- 第 3 节：源标题：Decision
- 第 4 节：关系 搜索 Scope
- 第 5 节：源标题：Feature Policy Scope
- 第 6 节：源标题：Hybrid Retrieval Model
- 第 7 节：当前 Mock Behavior
- 第 8 节：源标题：Live Replacement Requirements
- 第 9 节：源标题：Migration Implications
- 第 10 节：源标题：Testing Expectations

## 保留的代码与命令证据

### 代码证据 1

```text
Orbit AI planner/runtime
  -> tool registry
  -> feature-owned tool adapter
  -> feature service and optional shared retrieval service
  -> normalized tool result
  -> Orbit AI artifact mapper / synthesis
```

### 代码证据 2

```text
Orbit AI contacts.recommend
  -> Contacts/Recommendations tool adapter
  -> Relationship Search queryRelationships/queryCandidates
  -> Contacts/Recommendations ranking and action policy
  -> Orbit AI artifact mapping and synthesis
```

## 源文档正文

源文档正文主要不是中文。中文镜像不直接机翻全文，避免生成一份看似同步、实际难以审计的副本；阅读时先看本页摘要、审计依据、标题入口和代码证据。需要逐段核对时，请打开上方原始来源。
