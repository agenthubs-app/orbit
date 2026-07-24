# Followups 模块

## 模块定位

Followups 负责后续任务生成和消息草稿，是把关系分析转化为行动的执行准备层。

## 期望行为

模块应列出任务、生成任务、创建消息草稿并保留触发来源。任何发送行为都应交由 agent/sandbox 或确认流程处理。

## Mock 行为

Mock 服务生成确定性的任务和消息草稿，模拟空状态、等待和失败，不发送真实消息，不调用邮件、短信、AI provider、数据库或网络。

## 名片联系人邀请

联系人写入成功后，Followups 可以生成“加入 Orbit”的可编辑 invitation 草稿。准备草稿、确认联系人和确认邀请是三个独立动作。`POST /api/contact-invitations` 只生成预览；`PATCH /api/contact-invitations` 要求显式确认编辑后的主题和正文。

测试阶段没有邮件投递 provider，确认结果只到 `ready_for_delivery`。`externalSendRequested`、`emailProviderRequested` 和 `messageSent` 必须为 `false`，产品文案显示“邀请已准备，尚未发送”。真实投递需要另行增加持久队列、发送幂等、provider 和审计。

## 热拔插边界

调用方必须通过 `features/followups/service-factory.ts` 获取 task generation、message draft 和 staged contact invitation 服务。真实任务引擎、草稿生成器或邮件投递只接在 factory 后。
