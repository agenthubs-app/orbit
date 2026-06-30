# connections Feature 设计

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/features/connections/DESIGN.md` |
| 中文镜像 | `knowledge/docs/zh/feature-connections-design.zh.md` |
| 分类 | `feature-design` |
| 状态 | `current` |
| 新鲜度 | `likely-current` |
| 负责人域 | `feature:connections` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

记录 connections feature 的设计边界和 mock-first 实施方向，是模块文档之后的第二层阅读材料。

## 审计依据

已核对 repos/orbits/features/connections 目录和 service factory 存在；模块边界还由 modular-boundaries 测试覆盖。

## 结构化阅读入口

- 第 1 节：Connections 模块设计文档
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

Connections 负责关系本身的证据、时间线、阶段和个人资料片段。Contacts 负责“人”的列表与状态，Connections 负责“这段关系为什么存在、发生过什么、现在到哪一步”。

这个模块让联系人详情页可以展示可追踪的关系上下文，而不是只显示静态名片。

## 子能力范围

- `connection-and-evidence-service-mock`：关系证据、时间线、来源链接。
- `relationship-stage-and-profile-mock`：关系阶段、关系画像和阶段变更。

## 契约与数据边界

契约位于 `features/connections/contract.ts`。核心 DTO 包括 connection record、evidence item、timeline event、stage、profile summary 和 provenance。证据必须有 source reference，阶段变更必须可解释。

Service factory 提供 connection evidence 和 relationship stage/profile services。

## Mock 行为

Mock 使用本地 fixture 模拟关系证据和阶段。它不会写生产联系人库，不会读真实 CRM，不会调用搜索索引。添加 evidence 的动作只能返回本地 preview。

## Live 替换方案

Live 可以接 CRM、内部关系图谱、事件日志或用户手动记录库。Provider payload 必须映射成 connection DTO。真实阶段判断可以使用规则或模型，但输出必须保留 rationale 和 evidence refs。

## API 与页面使用

Connections 支撑 `/app/contacts/[id]`，也可被 Dashboard 和 Agent 使用。API 包括 connection list/detail、evidence、profile 和 stage。页面应先展示关系理由，再展示技术证据。

## 测试要求

- evidence 测试确认每条证据有 source reference。
- stage 测试确认阶段变更不会直接写外部系统。
- API envelope 测试覆盖 detail、evidence、profile、stage。
- 页面测试确认联系人详情可以从 connection DTO 渲染关系工作区。

## 团队协作规则

Connections 团队维护关系上下文，不维护联系人采集入口。新联系人进入系统前归 Acquisition；联系人列表状态归 Contacts；关系价值评分归 Analysis。
