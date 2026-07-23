# 关系搜索后端抽象实施计划

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/docs/superpowers/plans/2026-07-01-search-backend-abstractions.md` |
| 中文镜像 | `knowledge/docs/zh/app-plan-search-backend-abstractions.zh.md` |
| 分类 | `implementation-plan` |
| 状态 | `historical` |
| 新鲜度 | `likely-current` |
| 负责人域 | `search` |

## 怎么读

这页主要提供历史背景。不要把它当成当前实现说明，当前行为应回到相关代码路径、主题知识页和更新后的设计文档确认。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

为 Relationship Search 引入可配置的 backend/store 抽象：默认保持 fixture-backed 确定性实现，用 ORBIT_RELATIONSHIP_SEARCH_BACKEND / _STORE 环境变量选择实现（非法值显式失败），API 载荷保持稳定；并新增 Contacts 拥有的 contacts.recommend 搜索适配器，让 Orbit AI matcher 通过它委托检索而不越权拥有业务策略。

## 审计依据

这是一份一次性 TDD 实施计划，明确了 Search 拥有检索机制、Contacts 拥有推荐策略、Orbit AI 拥有工具选择的分工；现状应以 features/search/backend-factory.ts、stores/fixture-store.ts 与 features/contacts/contact-recommendation-search.ts 为准。

## 结构化阅读入口

- 第 1 节：搜索 Backend Abstractions 实现 计划
- 第 2 节：源标题：Global Constraints
- 第 3 节：任务 1: 搜索 backend 和 store selector 测试
- 第 4 节：任务 2: Fixture backed backend store 实现
- 第 5 节：任务 3: Feature owned 联系人 推荐 搜索 adapter
- 第 6 节：任务 4: Docs 和 验证

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

源文档正文主要不是中文。中文镜像不直接机翻全文，避免生成一份看似同步、实际难以审计的副本；阅读时先看本页摘要、审计依据、标题入口和代码证据。需要逐段核对时，请打开上方原始来源。
