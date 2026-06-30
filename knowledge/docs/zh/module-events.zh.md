# events 模块架构

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/docs/architecture/modules/events.md` |
| 中文镜像 | `knowledge/docs/zh/module-events.zh.md` |
| 分类 | `module-architecture` |
| 状态 | `current` |
| 新鲜度 | `verified-current` |
| 负责人域 | `module:events` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已和代码或测试做过明确核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

说明 events 模块的职责、Mock 行为、热拔插边界和阅读顺序。字段、状态和副作用规则仍以对应 contract 与测试为准。

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
