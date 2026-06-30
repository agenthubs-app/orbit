# notifications 模块架构

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/docs/architecture/modules/notifications.md` |
| 中文镜像 | `knowledge/docs/zh/module-notifications.zh.md` |
| 分类 | `module-architecture` |
| 状态 | `current` |
| 新鲜度 | `verified-current` |
| 负责人域 | `module:notifications` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已和代码或测试做过明确核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

说明 notifications 模块的职责、Mock 行为、热拔插边界和阅读顺序。字段、状态和副作用规则仍以对应 contract 与测试为准。

## 审计依据

已登记关联代码路径：repos/orbits/features/notifications/service-factory.ts。

## 结构化阅读入口

- 第 1 节：Notifications 模块
- 第 2 节：模块定位
- 第 3 节：期望行为
- 第 4 节：Mock 行为
- 第 5 节：热拔插边界

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

## 模块定位

Notifications 负责提醒计划和通知预览，服务于 followup、agent 和关键关系机会的提醒场景。

## 期望行为

模块应列出提醒、生成提醒建议，并明确哪些通知只是草稿、哪些可以进入确认流程。

## Mock 行为

Mock 服务返回本地提醒和生成结果，不触发系统通知、邮件、短信、推送、日历或数据库写入。

## 热拔插边界

调用方必须通过 `features/notifications/service-factory.ts` 获取 `ReminderScheduleNotificationService`。真实通知 provider 只能在 factory 后注册，并继续遵守确认与审计要求。
