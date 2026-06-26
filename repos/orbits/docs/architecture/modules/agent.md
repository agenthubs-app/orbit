# Agent 模块

## 模块定位

Agent 负责 AI 建议动作队列、自动化设置和外部动作沙箱。它连接智能建议和真实执行之间的人工确认边界。

## 期望行为

模块应列出可解释、可拒绝、可确认的行动建议，并在任何外部副作用前保留确认、审计和来源证据。自动化设置应控制 agent 能做什么、不能做什么。

## Mock 行为

Mock 服务返回确定性的建议动作、设置和沙箱执行记录。所有外部发送、真实 API 调用、数据库写入和通知动作都保持未执行状态。

## 热拔插边界

调用方必须通过 `features/agent/service-factory.ts` 获取 action queue、autonomy settings 和 external action sandbox。真实执行适配器只能接入 factory 后方，不能绕过确认和沙箱契约。
