# notifications Feature 设计

本页是 Orbit Wiki 的中文阅读版。它保留原始文档的路径、代码块、命令和接口标识，用中文说明阅读目的、审计依据和结构入口。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/features/notifications/DESIGN.md` |
| 中文镜像 | `knowledge/docs/zh/feature-notifications-design.zh.md` |
| 分类 | `feature-design` |
| 状态 | `current` |
| 新鲜度 | `likely-current` |
| 负责人域 | `feature:notifications` |

## 中文摘要

记录 notifications feature 的设计边界和 mock-first 实施方向，是模块文档之后的第二层阅读材料。

## 审计依据

已核对 repos/orbits/features/notifications 目录和 service factory 存在；模块边界还由 modular-boundaries 测试覆盖。

## 结构化阅读入口

- 第 1 节：Notifications 模块设计文档
- 第 2 节：设计定位
- 第 3 节：子能力范围
- 第 4 节：契约与数据边界
- 第 5 节：Mock 行为
- 第 6 节：Live 替换方案
- 第 7 节：API 与页面使用
- 第 8 节：测试要求
- 第 9 节：团队协作规则

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

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
