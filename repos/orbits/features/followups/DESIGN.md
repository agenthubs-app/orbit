# Followups 模块设计文档

## 设计定位

Followups 负责把关系承诺变成可复核的下一步。它不负责聊天传输，也不负责通知投递本身。它回答：谁需要跟进，为什么现在跟进，草稿是什么，提醒是否已经准备好。

所有外部发送和提醒投递都必须停在确认边界前。

## 子能力范围

- `followup-task-generation-mock`：根据关系触发器生成 follow-up task。
- `message-draft-generator-mock`：生成消息草稿和跟进话术。

## 契约与数据边界

契约位于 `features/followups/contract.ts`。核心 DTO 包括 task、trigger、priority、due window、draft、audit、source reference 和 no-side-effect provenance。Followups 不暴露 AI prompt、通知 provider payload 或任务数据库 row。

Service factory 提供 task generation 和 message draft generator services。

## Mock 行为

Mock 根据本地关系和活动 fixture 生成稳定任务。生成任务不会写真实 task store；生成草稿不会调用 AI provider；完成任务只返回本地 preview，不发送消息或通知。

## Live 替换方案

Live 可以接任务数据库、调度器、AI 草稿 provider、邮箱或通知队列。草稿生成结果必须经过 mapper 和 confirmation guard。提醒投递由 Notifications 或 Agent sandbox 控制，不在 Followups 内直接执行。

## API 与页面使用

产品入口是 `/app/followups`。API 包括 task list、generate、message drafts 和 notification queue 的关联读取。页面应按“承诺工作流”展示任务，不做成普通 todo list。

## 测试要求

- task generation 测试覆盖 eligible、empty、pending、failure。
- message draft 测试确认 live AI provider 未请求。
- completion preview 测试确认 message sent 和 notification delivered 为 false。
- 页面测试确认任务来源、草稿和提醒边界清楚。

## 团队协作规则

Followups 团队不直接改 Chat、Notifications 或 Agent 的执行逻辑。需要发送时交给 Agent sandbox 和确认保护；需要投递提醒时交给 Notifications。
