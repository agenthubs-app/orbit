# recommendations Feature 设计

本页是 Orbit Wiki 的中文阅读版。它保留原始文档的路径、代码块、命令和接口标识，用中文说明阅读目的、审计依据和结构入口。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/features/recommendations/DESIGN.md` |
| 中文镜像 | `knowledge/docs/zh/feature-recommendations-design.zh.md` |
| 分类 | `feature-design` |
| 状态 | `current` |
| 新鲜度 | `likely-current` |
| 负责人域 | `feature:recommendations` |

## 中文摘要

记录 recommendations feature 的设计边界和 mock-first 实施方向，是模块文档之后的第二层阅读材料。

## 审计依据

已核对 repos/orbits/features/recommendations 目录和 service factory 存在；模块边界还由 modular-boundaries 测试覆盖。

## 结构化阅读入口

- 第 1 节：Recommendations 模块设计文档
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

Recommendations 负责推荐谁值得认识、参加哪个活动、如何开场，以及哪个事件更有价值。它提供建议和解释，不直接执行连接动作。

这个模块连接 Events、Contacts、Analysis 和 Agent，但不能替代它们的事实来源。

## 子能力范围

- `event-recommendation-and-opening-line-mock`：活动参会者推荐和开场白。
- `event-value-recommendation-mock`：活动价值推荐和接受预览。

## 契约与数据边界

契约位于 `features/recommendations/contract.ts`。核心 DTO 包括 recommendation id、target event/contact、rank、rationale、opening line、source evidence、confidence 和 acceptance preview。推荐理由必须能追溯到事件、联系人或关系证据。

Service factory 提供 event recommendation 和 event value recommendation services。

## Mock 行为

Mock 使用本地事件和联系人 fixture 排序。开场白是确定性文案，不调用 AI provider。接受推荐只返回本地 preview，不修改日历、不创建任务、不发通知。

## Live 替换方案

Live 可以接 ranking model、LLM opening-line generator、搜索索引或活动数据库。模型输出必须经过 mapper 和 safety validator。开场白应保留来源理由，并在发送前交给 Chat/Agent/Permissions。

## API 与页面使用

Recommendations 被 `/app/events`、`/app/events/[id]` 和 `/app` 消费。API 包括 event recommendations、opening line 和 accept。页面应展示“为什么推荐”和“如何行动”，而不是只展示分数。

## 测试要求

- ranking 测试确认推荐有 evidence 和 rationale。
- opening line 测试确认不调用 live AI provider。
- accept 测试确认没有日历、消息或通知副作用。
- 页面测试确认推荐能进入活动详情工作流。

## 团队协作规则

Recommendations 团队不创建活动、不创建联系人、不发送消息。需要事实时消费 Events/Contacts；需要执行时交给 Agent 或 Followups。
