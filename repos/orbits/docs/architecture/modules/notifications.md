# Notifications 模块

## 模块定位

Notifications 负责提醒计划和通知预览，服务于 followup、agent 和关键关系机会的提醒场景。

## 期望行为

模块应列出提醒、生成提醒建议，并明确哪些通知只是草稿、哪些可以进入确认流程。

## Mock 行为

Mock 服务返回本地提醒和生成结果，不触发系统通知、邮件、短信、推送、日历或数据库写入。

## 热拔插边界

调用方必须通过 `features/notifications/service-factory.ts` 获取 `ReminderScheduleNotificationService`。真实通知 provider 只能在 factory 后注册，并继续遵守确认与审计要求。
