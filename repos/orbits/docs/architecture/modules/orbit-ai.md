# Orbit AI 模块

## 模块定位

Orbit AI 是面向用户的 AI command center 编排层，负责把聊天输入映射到联系人、事件、任务、dashboard 和 agent 面板。

## 期望行为

模块应读取核心业务服务的摘要，返回中文优先的 AI 响应、建议动作和可打开的功能面板。它不应绕过各业务模块的 service factory。

## Mock 行为

Mock 服务用本地规则和核心模块 factory 组合响应，不调用真实模型、网络、数据库、邮件、日历或通知服务。

## 热拔插边界

调用方必须通过 `features/orbit-ai/service-factory.ts` 获取 `OrbitAiCommandService`。未来可替换为真实 LLM 编排器，但仍需要通过各业务模块 factory 获取能力。
