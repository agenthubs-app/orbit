# search Feature 设计

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/features/search/DESIGN.md` |
| 中文镜像 | `knowledge/docs/zh/feature-search-design.zh.md` |
| 分类 | `feature-design` |
| 状态 | `current` |
| 新鲜度 | `likely-current` |
| 负责人域 | `feature:search` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

记录 search feature 的设计边界和 mock-first 实施方向，是模块文档之后的第二层阅读材料。

## 审计依据

已核对 repos/orbits/features/search 目录和 service factory 存在；模块边界还由 modular-boundaries 测试覆盖。

## 结构化阅读入口

- 第 1 节：Search 模块设计文档
- 第 2 节：设计定位
- 第 3 节：子能力范围
- 第 4 节：契约与数据边界
- 第 5 节：Mock 行为
- 第 6 节：Live 替换方案
- 第 7 节：API 与页面使用
- 第 8 节：测试要求
- 第 9 节：团队协作规则

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

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
