# orbit-ai 模块架构

本页是 Orbit Wiki 的中文阅读版。它保留原始文档的路径、代码块、命令和接口标识，用中文说明阅读目的、审计依据和结构入口。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/docs/architecture/modules/orbit-ai.md` |
| 中文镜像 | `knowledge/docs/zh/module-orbit-ai.zh.md` |
| 分类 | `module-architecture` |
| 状态 | `current` |
| 新鲜度 | `verified-current` |
| 负责人域 | `module:orbit-ai` |

## 中文摘要

说明 orbit-ai 模块的定位、期望行为、Mock 行为和热拔插边界。字段和状态仍以对应 contract 文件为准。

## 审计依据

已登记关联代码路径：repos/orbits/features/orbit-ai/service-factory.ts。

## 结构化阅读入口

- 第 1 节：Orbit AI 模块
- 第 2 节：模块定位
- 第 3 节：期望行为
- 第 4 节：Mock 行为
- 第 5 节：热拔插边界

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

## 模块定位

Orbit AI 是面向用户的 AI command center 编排层，负责把聊天输入映射到联系人、事件、任务、dashboard 和 agent 面板。

## 期望行为

模块应读取核心业务服务的摘要，返回中文优先的 AI 响应、建议动作和可打开的功能面板。它不应绕过各业务模块的 service factory。

当 Orbit AI 嵌入 `/app/chat` 时，自然语言输入先进入普通 conversation。只有意图路由判断需要联系人、活动、跟进或关系聊天上下文时，才创建 artifact task。artifact 可以带 `preferredSurface`、generated view、证据、工具调用记录和安全账本；页面只能通过 route view model 渲染这些结果，不能直接消费 raw artifact payload。

## Mock 行为

Mock 服务用本地规则和核心模块 factory 组合响应，不调用真实模型、网络、数据库、邮件、日历或通知服务。

Mock conversation service 接受自由文本，不要求每句话都绑定工具。Mock artifact task service 只生成可查看的本地推荐或上下文结果，不执行报名、发信、日历、通知、资料写入或数据库写入。

## 热拔插边界

调用方必须通过 `features/orbit-ai/service-factory.ts` 获取 `OrbitAiCommandService`、`OrbitAgentConversationService` 和 `OrbitAgentArtifactTaskService`。未来可替换为真实 LLM 编排器、多步 artifact producer 或 live provider，但仍需要通过各业务模块 factory 获取能力。

产品页面不能直接导入 Orbit AI mock、live provider 或 raw contract 作为 presenter props。页面应在本路由的 `*-route-view-model.ts` 中调用 service factory，并把 conversation turn、tool intent、artifact surface 和 provenance 映射成页面自有 view model。
