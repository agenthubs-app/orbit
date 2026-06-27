# Orbit AI 模块

## 模块定位

Orbit AI 是面向用户的 AI command center 编排层，负责把聊天输入映射到联系人、事件、任务、dashboard 和 agent 面板。

## 期望行为

模块应读取核心业务服务的摘要，返回中文优先的 AI 响应、建议动作和可打开的功能面板。它不应绕过各业务模块的 service factory。

当 Orbit AI 嵌入 `/app/chat` 时，自然语言输入先进入普通 conversation。只有意图路由判断需要联系人、活动、跟进或关系聊天上下文时，才创建 artifact task。artifact 可以带 `preferredSurface`、generated view、证据、工具调用记录和安全账本；页面只能通过 route view model 渲染这些结果，不能直接消费 raw artifact payload。

## Mock 行为

Mock 服务用本地规则和核心模块 factory 组合响应，不调用真实模型、网络、数据库、邮件、日历或通知服务。

Mock conversation service 接受自由文本，不要求每句话都绑定工具。Mock artifact task service 只生成可查看的本地推荐或上下文结果，不执行报名、发信、日历、通知、资料写入或数据库写入。

## 热拔插边界

调用方必须通过 `features/orbit-ai/service-factory.ts` 获取 `OrbitAiCommandService`、`OrbitAgentConversationService` 和 `OrbitAgentArtifactTaskService`。未来可替换为真实 LLM 编排器、多步 sub-agent 或 live provider，但仍需要通过各业务模块 factory 获取能力。

产品页面不能直接导入 Orbit AI mock、live provider 或 raw contract 作为 presenter props。页面应在本路由的 `*-route-view-model.ts` 中调用 service factory，并把 conversation turn、tool intent、artifact surface 和 provenance 映射成页面自有 view model。
