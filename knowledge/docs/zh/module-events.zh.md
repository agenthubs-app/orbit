# events 模块架构

本页是 Orbit Wiki 的中文阅读版。它保留原始文档的路径、代码块、命令和接口标识，用中文说明阅读目的、审计依据和结构入口。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/docs/architecture/modules/events.md` |
| 中文镜像 | `knowledge/docs/zh/module-events.zh.md` |
| 分类 | `module-architecture` |
| 状态 | `current` |
| 新鲜度 | `verified-current` |
| 负责人域 | `module:events` |

## 中文摘要

说明 events 模块的定位、期望行为、Mock 行为和热拔插边界。字段和状态仍以对应 contract 文件为准。

## 审计依据

已登记关联代码路径：repos/orbits/features/events/service-factory.ts。

## 结构化阅读入口

- 第 1 节：Events 模块
- 第 2 节：模块定位
- 第 3 节：期望行为
- 第 4 节：Mock 行为
- 第 5 节：热拔插边界

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

## 模块定位

Events 负责活动创建、导入、参会者名单、目标准备、现场记录、想连接对象和会后联系人复核。

## 期望行为

模块应支持活动全生命周期：活动详情、参会者、活动目标、准备度、现场 encounter、want-to-connect 和 post-event review。每一步都应保留来源和操作边界。

## Mock 行为

Mock 服务返回固定活动、参会者、准备度、现场记录、连接意向和会后复核数据，不访问真实日历、活动平台、消息系统、数据库或外部网络。

## 热拔插边界

调用方必须通过 `features/events/service-factory.ts` 获取事件子服务。真实活动平台、日历或现场记录系统可逐项替换，不影响其他模块。
