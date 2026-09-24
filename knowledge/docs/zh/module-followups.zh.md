# followups 模块架构

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/docs/architecture/modules/followups.md` |
| 中文镜像 | `knowledge/docs/zh/module-followups.zh.md` |
| 分类 | `module-architecture` |
| 状态 | `current` |
| 新鲜度 | `verified-current` |
| 负责人域 | `module:followups` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已和代码或测试做过明确核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

说明 followups 模块的职责、Mock 行为、热拔插边界和阅读顺序。字段、状态和副作用规则仍以对应 contract 与测试为准。

## 审计依据

已登记关联代码路径：repos/orbits/features/followups/service-factory.ts。

## 结构化阅读入口

- 第 1 节：Followups 模块
- 第 2 节：模块定位
- 第 3 节：期望行为
- 第 4 节：Mock 行为
- 第 5 节：名片联系人邀请
- 第 6 节：热拔插边界

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

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
