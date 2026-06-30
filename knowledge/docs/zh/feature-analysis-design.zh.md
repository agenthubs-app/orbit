# analysis Feature 设计

本页是 Orbit Wiki 的中文阅读版。它保留原始文档的路径、代码块、命令和接口标识，用中文说明阅读目的、审计依据和结构入口。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/features/analysis/DESIGN.md` |
| 中文镜像 | `knowledge/docs/zh/feature-analysis-design.zh.md` |
| 分类 | `feature-design` |
| 状态 | `current` |
| 新鲜度 | `likely-current` |
| 负责人域 | `feature:analysis` |

## 中文摘要

记录 analysis feature 的设计边界和 mock-first 实施方向，是模块文档之后的第二层阅读材料。

## 审计依据

已核对 repos/orbits/features/analysis 目录和 service factory 存在；模块边界还由 modular-boundaries 测试覆盖。

## 结构化阅读入口

- 第 1 节：Analysis 模块设计文档
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

Analysis 负责关系价值判断。它把联系人、事件、互动、来源可信度和业务上下文转成可解释的评分或标签，帮助 Dashboard、Contacts 和 Agent 决定哪些关系值得优先处理。

这个模块不创建联系人，也不发送跟进消息。它只提供判断依据，并说明这个判断来自哪些证据。

## 子能力范围

- `relationship-value-scoring-mock`：模拟关系价值评分、价值标签和解释。
- 供 Contacts 详情页、Dashboard opportunity、Agent action ranking 使用。

## 契约与数据边界

Analysis 应输出稳定的 relationship value DTO，包括 relationship id、score、value labels、rationale、evidence references、confidence 和 stale/refresh 状态。字段应表达产品语义，例如 commercial opportunity、referral path、knowledge exchange，而不是模型内部权重名。

当前模块以 service factory 暴露能力。后续如增加 `contract.ts` 中的评分细节，应保持调用方只读语义字段，不读模型或规则引擎内部结构。

## Mock 行为

Mock scoring 使用确定性规则和 fixture，不调用 AI provider、搜索索引或数据库。相同输入必须得到相同评分。Mock 需要保留证据引用，让页面能解释为什么某个联系人被标成高价值。

## Live 替换方案

Live 可以使用规则引擎、向量检索、ML 模型或人工配置权重。所有结果必须经过 mapper 转成 relationship value contract。模型置信度低时应返回需要复核的状态，而不是给出不可解释的高分。

## API 与页面使用

Analysis 通常作为被组合服务使用，也可以通过 relationship value API 提供重算入口。页面使用它展示“为什么重要”和“建议下一步”的理由，但不展示模型权重、prompt 或 raw scoring payload。

## 测试要求

- service 测试覆盖高价值、低价值、缺证据和失败场景。
- provenance 测试确认每个评分有来源证据。
- 页面组合测试确认评分可被 Contacts、Dashboard 或 Agent 消费。
- live 接入测试确认模型输出被 mapper 收敛。

## 团队协作规则

Analysis 团队维护评分解释和价值标签，不拥有联系人事实。需要新增事实字段时，先与 Contacts、Connections 或 Events 对齐 contract，再在 Analysis 中消费。
