# Chat 模块设计文档

## 设计定位

Chat 负责 Orbit 内部的对话与写作辅助。它不是外部聊天传输系统的直接封装。当前阶段所有消息、摘要、改写和隐私控制都保持本地 preview，直到用户明确确认。

Chat 的产品角色是让用户围绕关系上下文写消息、复盘对话和提取下一步，而不是制造不可追踪的 AI 建议。

## 子能力范围

- `chat-conversation-and-message-mock`：会话、消息线程和本地回复记录。
- `chat-writing-assist-mock`：消息草稿、改写和语气辅助。
- `chat-summary-and-extraction-mock`：对话摘要、行动项和关系信号提取。
- `chat-privacy-controls-mock`：隐私开关和分析许可。

## 契约与数据边界

主契约在 `features/chat/contract.ts`。关键字段包括 conversation id、participants、message delivery state、source references、summary、extractions、privacy state 和 no-side-effect provenance。Chat 不应暴露 LLM prompt、provider token 或外部 transport payload。

Service factory 注册 conversation、writing assist、summary 和 privacy services。

产品 UI 不直接把这些 contract payload 当作 React props。`/app/chat` 使用同目录 route view model 把 conversation、writing assist、summary/extraction、privacy 和 local action result 映射成页面专用结构。Chat contract 可以为 API 和服务保持稳定，页面 presenter 只消费 render-neutral view model。

## Mock 行为

Mock 不连接 websocket、不写生产消息存储、不发送通知、不调用 AI provider。发送消息动作只记录本地 preview，delivery state 必须明确说明没有外部发送。

## Live 替换方案

Live 可以分阶段接入：先接真实 conversation store，再接外部消息 transport，最后接 AI writing provider。每一步都必须保留 privacy controls。AI 输出进入页面前应经过 mapper、safety validator 和 confirmation guard。

## API 与页面使用

产品入口是 `/app/chat`，也会被 Orbit AI command center 触发。API 包括 conversation list、thread、messages、summary、extractions、rewrite、follow-up draft 和 privacy。页面显示可复核草稿，不直接发送。

页面组合规则：

- `chat-service-factory.ts` 聚合 Chat 子服务，但不渲染 UI。
- `chat-route-view-model.ts` 是业务 contract 到 UI view model 的唯一转换点。
- `chat-command-center.tsx` 和 `agent-artifact-side-panel.tsx` 只接收页面 view model，不 import `features/chat/*` 或 `features/orbit-ai/*` contract/service。
- Orbit Agent 生成的 artifact 也先映射成 Chat 页面自己的 artifact surface view model，再传给 side panel。

## 测试要求

- conversation 测试覆盖 thread、empty、pending、failure。
- send message 测试确认 message sent 为 false 或 local only。
- writing assist 测试确认 live AI provider 未被请求。
- privacy 测试确认关闭分析时 summary/extraction 不运行。
- 页面测试确认用户能看到隐私和本地预览边界。
- 页面解耦测试确认 command center 和 side panel 不直接 import feature contract/service，业务依赖只出现在 route view model 或 service factory。

## 团队协作规则

Chat 团队不拥有联系人事实，也不拥有外部动作执行权。需要跟进任务时调用 Followups；需要发送外部消息时通过 Agent sandbox 和 confirmation guard。
