# dashboard 模块架构

本页是 Orbit Wiki 的中文阅读版。它保留原始文档的路径、代码块、命令和接口标识，用中文说明阅读目的、审计依据和结构入口。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/docs/architecture/modules/dashboard.md` |
| 中文镜像 | `knowledge/docs/zh/module-dashboard.zh.md` |
| 分类 | `module-architecture` |
| 状态 | `current` |
| 新鲜度 | `verified-current` |
| 负责人域 | `module:dashboard` |

## 中文摘要

说明 dashboard 模块的定位、期望行为、Mock 行为和热拔插边界。字段和状态仍以对应 contract 文件为准。

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
