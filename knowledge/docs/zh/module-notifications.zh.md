# notifications 模块架构

本页是 Orbit Wiki 的中文阅读版。它保留原始文档的路径、代码块、命令和接口标识，用中文说明阅读目的、审计依据和结构入口。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/docs/architecture/modules/notifications.md` |
| 中文镜像 | `knowledge/docs/zh/module-notifications.zh.md` |
| 分类 | `module-architecture` |
| 状态 | `current` |
| 新鲜度 | `verified-current` |
| 负责人域 | `module:notifications` |

## 中文摘要

说明 notifications 模块的定位、期望行为、Mock 行为和热拔插边界。字段和状态仍以对应 contract 文件为准。

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
