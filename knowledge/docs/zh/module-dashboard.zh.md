# dashboard 模块架构

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/docs/architecture/modules/dashboard.md` |
| 中文镜像 | `knowledge/docs/zh/module-dashboard.zh.md` |
| 分类 | `module-architecture` |
| 状态 | `current` |
| 新鲜度 | `verified-current` |
| 负责人域 | `module:dashboard` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已和代码或测试做过明确核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

说明 dashboard 模块的职责、Mock 行为、热拔插边界和阅读顺序。字段、状态和副作用规则仍以对应 contract 与测试为准。

## 审计依据

已登记关联代码路径：repos/orbits/features/dashboard/service-factory.ts。

## 结构化阅读入口

- 第 1 节：Dashboard 模块
- 第 2 节：模块定位
- 第 3 节：期望行为
- 第 4 节：Mock 行为
- 第 5 节：热拔插边界

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

## 模块定位

Dashboard 负责关系网络总览、分布分析、网络缺口和机会提醒，是运营视角的聚合分析层。

## 期望行为

模块应汇总联系人、连接、事件、任务和 agent 状态，输出可解释的指标、分布、缺口和建议行动。

## Mock 行为

Mock 服务用固定 fixture 生成 dashboard summary、network distribution 和 opportunity reminder，不执行真实分析任务、数据库查询、外部网络或通知。

## 热拔插边界

调用方必须通过 `features/dashboard/service-factory.ts` 获取 aggregate、distribution 和 opportunity 服务。真实分析仓库、图计算或 job runner 只在 factory 后注册。
