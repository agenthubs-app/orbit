# Notifications 模块设计文档

## 设计定位

Notifications 负责提醒计划和通知投递状态。它不决定谁值得跟进，也不生成消息内容。它只把已经确认的提醒意图转成可排队、可复核、可投递的通知计划。

当前 mock 阶段必须保持通知不送达，只展示 queue 和 delivery guard。

## 子能力范围

- `reminder-schedule-and-notification-mock`：提醒计划、通知队列、投递预览。
- 被 Followups、Agent 和 App shell 读取。

## 契约与数据边界

契约位于 `features/notifications/contract.ts`。核心 DTO 包括 reminder schedule、notification channel、delivery status、scheduled time、review state、source reference 和 provider side-effect ledger。

Service factory 是唯一入口。调用方不能直接调用 push/email provider。

## Mock 行为

Mock 返回稳定的 reminder queue。通知状态应明确为 not delivered 或 held for review。它不会访问 APNs、FCM、邮件、短信、Slack、系统通知或后台调度器。

## Live 替换方案

Live 可以接任务调度器、push provider、email provider 或系统通知。投递前必须检查 Permissions 和 confirmation state。Provider 回执需要映射成 notification contract，不能直接暴露 provider response。

## API 与页面使用

Notifications 可以通过 `/api/notifications` 和 reminder generate API 被页面读取。产品上通常嵌入 Followups 或 Agent，而不是单独占据一个主页面。页面应展示计划时间、渠道、送达状态和复核要求。

## 测试要求

- queue 测试覆盖 scheduled、held、empty、failure。
- provider guard 测试确认 mock 不投递。
- API envelope 测试覆盖 success 和 controlled failure。
- live 接入测试覆盖 provider receipt mapper 和 permission denied。

## 团队协作规则

Notifications 团队只负责通知计划和投递状态。提醒生成归 Followups；动作确认归 Permissions/Agent；消息内容归 Chat 或 Followups。
