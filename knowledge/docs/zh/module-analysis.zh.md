# analysis 模块架构

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/docs/architecture/modules/analysis.md` |
| 中文镜像 | `knowledge/docs/zh/module-analysis.zh.md` |
| 分类 | `module-architecture` |
| 状态 | `current` |
| 新鲜度 | `verified-current` |
| 负责人域 | `module:analysis` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已和代码或测试做过明确核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

说明 analysis 模块的职责、Mock 行为、热拔插边界和阅读顺序。字段、状态和副作用规则仍以对应 contract 与测试为准。

## 审计依据

已登记关联代码路径：repos/orbits/features/analysis/service-factory.ts。

## 结构化阅读入口

- 第 1 节：Analysis 模块
- 第 2 节：模块定位
- 第 3 节：期望行为
- 第 4 节：Mock 行为
- 第 5 节：热拔插边界

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

## 模块定位

Analysis 负责关系价值评分和优先级解释，是联系人、连接、事件和后续行动之间的分析层。

## 期望行为

模块应基于可追溯证据输出关系价值、优先级、解释和建议下一步。真实实现可以接入评分模型或规则引擎，但必须保留来源、限制和错误 envelope。

## Mock 行为

Mock 服务用 fixture 和本地规则生成关系价值评分、重算结果、空状态、等待状态和受控失败，不调用 AI、外部评分服务、网络或数据库。

## 热拔插边界

调用方必须通过 `features/analysis/service-factory.ts` 获取 `RelationshipValueScoringService`。评分算法可在 factory 后替换，API 和页面只依赖 contract。
