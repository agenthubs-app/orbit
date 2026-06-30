# Orbit AI 模块

## 模块定位

Orbit AI 是面向用户的 AI command center 和 chat agent 编排层。它把自然语言输入映射到联系人、活动、跟进、聊天上下文、dashboard 和 agent action，但不拥有这些模块的数据。

模块的职责是选择和组合 Orbit 内部能力；真实业务事实仍来自对应 feature module 的 contract、service factory 和测试。

## 三个 Capability

当前代码把 Orbit AI 拆成三个服务：

- `OrbitAiCommandService`：旧 command center 能力，用于首页输入和功能面板跳转。
- `OrbitAgentConversationService`：产品 chat agent 能力；mock 模式返回 fixture，live 模式进入 provider planner + 内部 artifact 编排链。
- `OrbitAgentArtifactTaskService`：生成可复核 artifact，例如活动推荐、人脉推荐、跟进队列或关系聊天上下文。

入口都在 `repos/orbits/features/orbit-ai/service-factory.ts`：

- `createOrbitAiCommandService()`
- `createOrbitAgentConversationService()`
- `createOrbitAgentArtifactTaskService()`

调用方必须走这些 factory，不直接导入 mock、live provider 或 fixture。

## 期望行为

Orbit AI 应返回中文优先的 assistant reply、建议动作、可打开面板和可复核 artifact。它可以建议下一步，但不能绕过业务模块直接写联系人、发邮件、创建日历、投递通知或修改 live storage。

当 Orbit AI 嵌入 `/app/chat` 或 `/app/agent` 时，自然语言输入先进入 conversation。只有 planner 或本地意图判断需要联系人、活动、跟进或关系聊天上下文时，才创建 artifact task。

artifact 可以带：

- `preferredSurface`
- generated view
- evidence ids
- source modules
- tool call trace
- artifact producer
- safety ledger

页面只能通过 route view model 渲染这些结果，不能直接消费 raw artifact payload。

## Mock 行为

Mock 服务使用本地规则、fixture 和核心模块 factory 组合响应。它不调用真实模型、外部网络、数据库、邮件、日历、通知服务或设备 API。

Mock conversation service 接受自由文本，不要求每句话都绑定工具。Mock artifact task service 只生成可查看的本地推荐或上下文结果，不执行报名、发信、日历、通知、资料写入或数据库写入。

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
2. `features/orbit-ai/artifact-contract.ts` 和 `conversation-contract.ts`：确认 payload、safety 和 provenance 字段。
3. `features/orbit-ai/live-agent-runtime.ts`：确认 live conversation 的真实执行顺序。
4. `features/orbit-ai/live-conversation-trace.ts` 和 `trace-contract.ts`：确认 trace 页面暴露了哪些 runtime 事实。
5. `features/orbit-ai/DESIGN.md`：阅读更完整的 feature 设计和协作规则。
