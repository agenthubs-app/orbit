# chat Feature 设计

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/features/chat/DESIGN.md` |
| 中文镜像 | `knowledge/docs/zh/feature-chat-design.zh.md` |
| 分类 | `feature-design` |
| 状态 | `current` |
| 新鲜度 | `likely-current` |
| 负责人域 | `feature:chat` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

记录 chat feature 的设计边界和 mock-first 实施方向，是模块文档之后的第二层阅读材料。

## 审计依据

已核对 repos/orbits/features/chat 目录和 service factory 存在；模块边界还由 modular-boundaries 测试覆盖。

## 结构化阅读入口

- 第 1 节：Chat 模块设计文档
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

Chat 负责 Orbit 内部的对话与写作辅助。它不是外部聊天传输系统的直接封装。当前阶段所有消息、摘要、改写和隐私控制都保持本地 preview，直到用户明确确认。

Chat 的产品角色是让用户围绕关系上下文写消息、复盘对话和提取下一步，而不是制造不可追踪的 AI 建议。

Sprint 84 增加了异步关系通信视角：`/app/chat` 默认呈现 relationship inbox、选中 thread、source context、草稿回复、下一步行动和 schedule context。这里的 conversation 是 correspondence snapshot，不是 websocket chat。

页面还必须处理无效 conversation id：route view model 保留 service 的
`ASYNC_CONVERSATION_NOT_FOUND` envelope，页面回到默认 inbox，并显示本地状态面板。
这个面板只给用户恢复路径，不触发发送、日历、保存记录或网络 side effect。

## 子能力范围

- `chat-conversation-and-message-mock`：会话、消息线程和本地回复记录。
- `async-relationship-conversation`：异步关系通信 inbox、thread、草稿、下一步行动、联系人、connection、event、task 和 schedule context。
- `chat-writing-assist-mock`：消息草稿、改写和语气辅助。
- `chat-summary-and-extraction-mock`：对话摘要、行动项和关系信号提取。
- `chat-privacy-controls-mock`：隐私开关和分析许可。

## 契约与数据边界

主契约在 `features/chat/contract.ts`。关键字段包括 conversation id、participants、message delivery state、source references、summary、extractions、privacy state 和 no-side-effect provenance。Chat 不应暴露 LLM prompt、provider token 或外部 transport payload。

Service factory 注册 conversation、writing assist、summary 和 privacy services。

异步关系通信契约同样在 `contract.ts`，并由 `AsyncRelationshipConversationService` 暴露。该契约必须同时返回 inbox、selected thread、draft reply、next actions、contact、connection、event、follow-up task、schedule context 和 no-side-effect flags。页面只消费 route view model，不直接渲染 feature DTO。

产品 UI 不直接把这些 contract payload 当作 React props。`/app/chat` 使用同目录 route view model 把 conversation、writing assist、summary/extraction、privacy 和 local action result 映射成页面专用结构。Chat contract 可以为 API 和服务保持稳定，页面 presenter 只消费 render-neutral view model。

## Mock 行为

Mock 不连接 websocket、不写生产消息存储、不发送通知、不调用 AI provider。发送消息动作只记录本地 preview，delivery state 必须明确说明没有外部发送。

异步关系通信 mock 的 stage action 只返回 `staged_local_preview`。它必须明确显示没有 external message、notification、calendar entry、saved record 或 network side effect。

`/app/chat` 的 draft reply 区允许用户在页面内编辑草稿文本、复制回复意图和标记已检查。
这些控件是 local-only 预览控件；它们不能发送外部消息、创建日历、保存 follow-up 记录或调用网络。

## Live 替换方案

Live 可以分阶段接入：先接真实 conversation store，再接外部消息 transport，最后接 AI writing provider。每一步都必须保留 privacy controls。AI 输出进入页面前应经过 mapper、safety validator 和 confirmation guard。

异步关系通信的 live 替换见 `features/chat/ASYNC_CONVERSATION_MOCK_TO_LIVE.md`。第一阶段只允许接只读 conversation/contact/connection/event/task/schedule storage。外部发送、日历创建、通知和 CRM 写入不属于该能力。

## API 与页面使用

产品入口是 `/app/chat`，用于异步关系通信 inbox 和本地行动预览。API 包括 conversation list、thread、messages、summary、extractions、rewrite、follow-up draft 和 privacy。页面显示可复核草稿，不直接发送。

页面组合规则：

- `chat-service-factory.ts` 聚合 Chat 子服务，但不渲染 UI。
- `chat-route-view-model.ts` 是业务 contract 到 UI view model 的唯一转换点。
- `/app/chat/page.tsx` 只做 route adapter；`chat-command-center.tsx` 渲染页面专用 view model。
- `chat-view-model-adapter.ts` 仍保留给旧 Orbit Agent 映射使用，但 `/app/chat` 的产品 UI 不再依赖通用 agent shell。
- 真实 Chat UI 不直接 import `features/chat/*` 或 `features/orbit-ai/*` contract/service。

## 测试要求

- conversation 测试覆盖 thread、empty、pending、failure。
- send message 测试确认 message sent 为 false 或 local only。
- writing assist 测试确认 live AI provider 未被请求。
- privacy 测试确认关闭分析时 summary/extraction 不运行。
- 页面测试确认用户能看到隐私和本地预览边界。
- 异步关系通信测试确认 conversation 可解析到 contact、connection、event、follow-up task 和 schedule context。
- 异步关系通信测试确认无效 conversation id 返回可见的 not-found envelope。
- stage preview 测试确认没有外部消息、通知、日历、保存记录或网络 side effect。
- 页面测试确认 inbox heading、local-only draft controls、invalid conversation 状态面板和 staged preview 状态面板可见。
- 页面解耦测试确认页面 presenter 不直接 import feature contract/service，业务依赖只出现在 route view model 或 service factory。

## 团队协作规则

Chat 团队不拥有联系人事实，也不拥有外部动作执行权。需要跟进任务时调用 Followups；需要发送外部消息时通过 Agent sandbox 和 confirmation guard。
