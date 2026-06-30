# followups 模块架构

本页是 Orbit Wiki 的中文阅读版。它保留原始文档的路径、代码块、命令和接口标识，用中文说明阅读目的、审计依据和结构入口。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/docs/architecture/modules/followups.md` |
| 中文镜像 | `knowledge/docs/zh/module-followups.zh.md` |
| 分类 | `module-architecture` |
| 状态 | `current` |
| 新鲜度 | `verified-current` |
| 负责人域 | `module:followups` |

## 中文摘要

说明 followups 模块的定位、期望行为、Mock 行为和热拔插边界。字段和状态仍以对应 contract 文件为准。

## 审计依据

已登记关联代码路径：repos/orbits/features/followups/service-factory.ts。

## 结构化阅读入口

- 第 1 节：Followups 模块
- 第 2 节：模块定位
- 第 3 节：期望行为
- 第 4 节：Mock 行为
- 第 5 节：热拔插边界

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

## 模块定位

Followups 负责后续任务生成和消息草稿，是把关系分析转化为行动的执行准备层。

## 期望行为

模块应列出任务、生成任务、创建消息草稿并保留触发来源。任何发送行为都应交由 agent/sandbox 或确认流程处理。

## Mock 行为

Mock 服务生成确定性的任务和消息草稿，模拟空状态、等待和失败，不发送真实消息，不调用邮件、短信、AI provider、数据库或网络。

## 热拔插边界

调用方必须通过 `features/followups/service-factory.ts` 获取 task generation 和 message draft 服务。真实任务引擎或草稿生成器只接在 factory 后。
