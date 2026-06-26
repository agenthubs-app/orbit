# Followups 模块

## 模块定位

Followups 负责后续任务生成和消息草稿，是把关系分析转化为行动的执行准备层。

## 期望行为

模块应列出任务、生成任务、创建消息草稿并保留触发来源。任何发送行为都应交由 agent/sandbox 或确认流程处理。

## Mock 行为

Mock 服务生成确定性的任务和消息草稿，模拟空状态、等待和失败，不发送真实消息，不调用邮件、短信、AI provider、数据库或网络。

## 热拔插边界

调用方必须通过 `features/followups/service-factory.ts` 获取 task generation 和 message draft 服务。真实任务引擎或草稿生成器只接在 factory 后。
