# Orbit AI 模块

## 模块定位

Orbit AI 是面向用户的 AI command center 和 chat assistant 编排层。它把自然语言输入映射到联系人、活动、跟进、聊天上下文、dashboard 和 Actions 动作，但不拥有这些模块的数据。

模块的职责是选择和组合 Orbit 内部能力；真实业务事实仍来自对应 feature module 的 contract、service factory 和测试。

## 四个 Capability

当前代码把 Orbit AI 拆成四个服务：

- `OrbitAiCommandService`：旧 command center 能力，用于首页输入和功能面板跳转。
- `OrbitAgentConversationService`：产品 chat conversation 能力；mock 模式返回 fixture，live 模式进入 provider planner + 内部 artifact 编排链。服务名仍保留 `Agent` 作为当前代码兼容名。
- `OrbitAgentArtifactTaskService`：生成可复核 artifact，例如活动推荐、人脉推荐、跟进队列或关系聊天上下文。
- `OrbitAiProactiveAgentService`：把 Calendar、Events、Contacts、Followups 或系统状态 signal 转成 Orbit AI 聊天窗口里的主动管家消息。

前三个入口在 `repos/orbits/features/orbit-ai/service-factory.ts`：

- `createOrbitAiCommandService()`
- `createOrbitAgentConversationService()`
- `createOrbitAgentArtifactTaskService()`

主动管家入口在 `repos/orbits/features/orbit-ai/proactive-service-factory.ts`：

- `createOrbitAiProactiveAgentService()`

调用方必须走这些 factory，不直接导入 mock、live provider 或 fixture。

## 期望行为

Orbit AI 应返回中文优先的 assistant reply、建议动作、可打开面板和可复核 artifact。它可以建议下一步，但不能绕过业务模块直接写联系人、发邮件、创建日历、投递通知或修改 live storage。

当 Orbit AI 嵌入 `/app/chat` 或当前 legacy route `/app/agent` 时，自然语言输入先进入 conversation。只有 planner 或本地意图判断需要联系人、活动、跟进或关系聊天上下文时，才创建 artifact task。

当 Calendar、Events、Contacts、Followups 或系统状态产生主动提醒 signal 时，signal 先进入 proactive agent。用户可读内容必须作为 Orbit AI 聊天窗口里的 assistant proactive turn 出现。Notifications 只负责 mobile push、badge、delivery status、quiet hours 和 permission guard，不拥有主动提醒文案，也不成为独立产品入口。

artifact 可以带：

- `preferredSurface`
- generated view
- evidence ids
- source modules
- tool call trace
- artifact producer
- safety ledger

页面只能通过 route view model 渲染这些结果，不能直接消费 raw artifact payload。

## Web 对话待办卡片（2026-09-08）

`/app/agent` 读取既有 conversation 响应的 `taskInteraction`，先经页面 view-model 解码，再展示紧凑卡片。`created` 使用服务端 task ID 打开 `/app/tasks/:id`；`suggested` 提供「加入待办 / 暂不需要」，复用 task suggestions accept/dismiss API；`failed` 或字段无效时显示错误和全部待办入口，不伪造创建成功。

接受成功后以 API 返回的任务替换卡片，并随消息保存到既有 sessions API；重开 Web 历史保留结果。忽略后的 `dismissed` 和无法解析的 `unavailable` 只是页面状态，不扩展共享 AI 响应契约。旧的纯文本 assistant 消息仍可读取。桌面/移动两棵渲染树共用操作锁；网络失败保留操作入口和当前页面内的幂等重试键；切换会话后旧操作不能更新新会话。

同一挂载页面的会话保存按 session ID 排队，避免旧快照晚写覆盖已创建待办；不同会话互不等待。删除排在已有保存之后，并拒绝晚到结果重新保存已删除会话。改名/置顶在执行时读取最新消息，成功后只合并元数据；后续消息快照保留已确认的名称/置顶，失败仍显示原有错误提示。

本项不修改任务创建/建议策略、AI 请求的会话标识规则、App 界面或服务端会话版本契约。历史快照不是待办实时状态源：另一端接受/忽略建议后，旧卡片的再次操作仍由服务端裁定；失败必须可见。现有 App 对消息附加待办元数据的保存/恢复、多标签页并发编辑及真实账号双向回读未在本项验收，不能据此宣称两端历史卡片完全一致。

验证入口：`tests/pages/app-agent-task-interaction.test.tsx` 覆盖真实页面响应映射、双视图锁、操作结果保存、失败重试与历史解码；`tests/pages/app-agent-task-interaction.browser.mjs` 在隔离临时预览中拦截全部浏览器 API 流量，检查 1440px / 390px 的接受、忽略、失败、重开历史、按钮可辨识性与布局。它们不证明真实 AI provider、业务数据库或跨端线上同步已验收。

## Mock 行为

Mock 服务使用本地规则、fixture 和核心模块 factory 组合响应。它不调用真实模型、外部网络、数据库、邮件、日历、通知服务或设备 API。

Mock conversation service 接受自由文本，不要求每句话都绑定工具。Mock artifact task service 只生成可查看的本地推荐或上下文结果，不执行报名、发信、日历、通知、资料写入或数据库写入。

Mock proactive agent service 接受结构化 `AgentSignal`，生成 `deliverySurface: "orbit_ai_chat"` 的主动 assistant 消息。Live proactive agent service 是 policy provider，也生成同一个 Orbit AI chat turn 形状。两者都不调用 push provider、不写日历、不发送邮件、不访问外部网络、不写 live storage，也不调用 live AI provider。

## Live 行为

Live conversation 由 `features/orbit-ai/live-agent-runtime.ts` 拥有执行链：

1. 本地 guardrail。
2. provider planner。
3. 工具白名单和 artifact kind 映射。
4. artifact task service。
5. 可选 provider synthesis。
6. 最终 conversation payload。

产品 API、full-chain trace 和 planner-only 兼容入口都应调用同一个 runtime：

- `/api/ai/conversations`：产品 conversation API。
- `/api/dev/orbit-ai/trace`：完整开发 trace。
- `/api/dev/orbit-agent/trace`：旧 planner-only 诊断 API，固定 `maxLoopSteps=1`。

旧 `OrbitAiCommandService` 不是模型对话 runtime。它现在有 live command
service，用于把 Events、Contacts、Followups、Dashboard 和 Agent queue 的 live
read services 组合成 command center stage items。该服务只读、可恢复、无外部副作用；子服务失败时保留 failure evidence，不回退到 mock。

`OrbitAiProactiveAgentService` 的 live 实现是 live-policy provider。它只把结构化 signal 转成 Orbit AI 聊天窗口里的 proactive assistant turn，不负责 mobile push、badge、quiet hours 或 delivery status；这些仍然属于 Notifications。

## 热拔插边界

Live provider、artifact producer 和 matching method 都可以替换，但替换点必须停在 service factory、runtime、artifact service 或工具 registry。页面不应该知道当前 planner 是哪个 provider，也不应该依赖某个具体 artifact producer 的内部实现。

当前 artifact producer 名称由 `ORBIT_AGENT_ARTIFACT_PRODUCERS` 定义。新增 producer 后，trace payload 必须在 `runtimeSnapshot.artifactProducers`、timeline 和源码面板里展示它；未知 renderer 也不能丢数据。

## 工具所有权

Orbit AI 是 central planner，不是所有业务工具的实现仓库。它拥有工具白名单、planner schema、runtime safety、trace 和 artifact mapping；业务工具策略归对应 feature。

目标调用方向：

```text
Orbit AI planner
  -> tool registry
  -> feature-owned tool adapter
  -> feature service / relationship search
  -> normalized tool result
  -> Orbit AI artifact / synthesis
```

`contacts.recommend` 应由 Contacts 或 Recommendations 拥有人脉推荐策略，并可调用 Relationship Search 获取候选。`events.recommend` 应由 Events 拥有活动语境和推荐策略。`followups.reviewQueue` 应由 Followups 拥有队列和提醒边界。Orbit AI 只负责选择、调用、记录和呈现可复核结果。

## 阅读代码顺序

1. `features/orbit-ai/service-factory.ts`：先确认调用方能拿到哪些服务。
2. `features/orbit-ai/proactive-contract.ts` 和 `proactive-service-factory.ts`：确认主动管家 signal 到 Orbit AI chat turn 的边界。
3. `features/orbit-ai/artifact-contract.ts` 和 `conversation-contract.ts`：确认 payload、safety 和 provenance 字段。
4. `features/orbit-ai/live-agent-runtime.ts`：确认 live conversation 的真实执行顺序。
5. `features/orbit-ai/live-conversation-trace.ts` 和 `trace-contract.ts`：确认 trace 页面暴露了哪些 runtime 事实。
6. `features/orbit-ai/DESIGN.md`：阅读更完整的 feature 设计和协作规则。
