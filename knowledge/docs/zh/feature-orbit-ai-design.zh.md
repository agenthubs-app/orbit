# orbit-ai Feature 设计

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/features/orbit-ai/DESIGN.md` |
| 中文镜像 | `knowledge/docs/zh/feature-orbit-ai-design.zh.md` |
| 分类 | `feature-design` |
| 状态 | `current` |
| 新鲜度 | `likely-current` |
| 负责人域 | `feature:orbit-ai` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

Orbit AI 的当前权威设计入口：解释 command center、live conversation、artifact producer、planner 工具白名单、内部工具所有权、人脉推荐方法和产品/trace 共用执行链。

## 审计依据

已核对 artifact-contract、service-factory、live-agent-runtime、live-conversation-service、live-conversation-trace、contact-recommendation artifact service 和相关 capability tests；产品 chat、full-chain trace、planner-only trace 共用同一 runtime。

## 结构化阅读入口

- 第 1 节：Orbit AI Feature 设计
- 第 2 节：这份文档回答什么
- 第 3 节：当前代码事实
- 第 4 节：真实请求链路
- 第 5 节：契约与数据边界
- 第 6 节：Artifact Producer 规则
- 第 7 节：内部工具所有权
- 第 8 节：Mock 行为
- 第 9 节：Live 模式
- 第 10 节：循环 步骤
- 第 11 节：人脉推荐工具
- 第 12 节：页面使用规则
- 第 13 节：测试要求
- 第 14 节：协作规则

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

## 这份文档回答什么

Orbit AI 是产品里的对话式编排层。它接收自然语言输入，决定应该打开哪个工作面板、调用哪个内部工具、生成哪类可复核 artifact。它不拥有联系人、活动、跟进、通知或聊天数据，也不直接执行外部动作。

阅读时先记住一句话：Orbit AI 负责“理解和编排”，业务事实和副作用边界仍由各 feature module 的 contract、service factory 和测试负责。

## 当前代码事实

当前 `features/orbit-ai` 拆成三个 capability：

- `orbit-ai-command`：旧 command center 能力，主要用于首页和功能侧页联动。入口是 `createOrbitAiCommandService()`。
- `orbit-agent-conversation`：产品 chat agent 能力。mock 模式走稳定 fixture，live 模式走 provider planner、内部 tool/artifact mapping 和可选 synthesis。入口是 `createOrbitAgentConversationService()`。
- `orbit-agent-artifact-task`：把 planner 选出的内部工具请求转换成可复核 artifact。入口是 `createOrbitAgentArtifactTaskService()`。

这些入口都在 `features/orbit-ai/service-factory.ts`。调用方只应该通过 service factory 获取服务，不直接导入 mock service、live provider 或 raw fixture。

## 真实请求链路

产品 chat 的主要链路是：

1. 页面或 API route 把用户消息传给 `OrbitAgentConversationService`。
2. `live-conversation-service.ts` 调用共享的 `runLiveOrbitAgentRuntime()`。
3. `live-agent-runtime.ts` 依次处理本地 guardrail、provider planner、工具白名单映射、artifact request、可选 synthesis 和最终 payload。
4. artifact 生成由 `live-artifact-task-service.ts` 组合到 artifact task service。
5. trace 页面通过 `live-conversation-trace.ts` 把同一个 runtime 结果转换成 `trace-contract.ts` 定义的调试 payload。

`/api/ai/conversations`、`/dev/orbit-ai/trace` 和旧的 `/api/dev/orbit-agent/trace` 都应复用同一个 live runtime。差异只在运行深度和展示形态：

- `/api/ai/conversations`：产品路径，默认跑 planner、artifact mapping，并在需要时 synthesis。
- `/api/dev/orbit-ai/trace`：完整调试路径，展示 full-chain trace、runtime snapshot、tool calls、artifact producers、数据来源和 planner-only comparison。
- `/api/dev/orbit-agent/trace`：兼容旧诊断入口，固定 `maxLoopSteps=1`，只跑 planner，不执行 artifact 或 synthesis。

新增 AI 行为时，应该优先改 runtime、artifact service 或工具 registry，再让产品 API 和 trace UI 读取同一结果。不要只在某个 route 或 dev 页面里补业务逻辑。

## 契约与数据边界

核心契约分三层：

- `contract.ts`：command center 的 intent、target panel、suggested action、response copy、source references 和 safety boundary。
- `conversation-contract.ts`：chat agent conversation payload、proposed tool intent、provenance、diagnostics timings 和 safety ledger。
- `artifact-contract.ts`：artifact kind、artifact producer、generated view、tool call trace、provenance 和 artifact safety。

Orbit AI 的 conversation、artifact task 和 generated artifact payload 是编排层 contract，不是页面 presenter props。产品路由应先把 artifact/status/provenance/tool intent 映射成本页面自己的 route view model，再交给 UI presenter。

这样做的目的很具体：Orbit AI 可以替换 planner、artifact producer 或 live provider，而页面只依赖稳定的 surface data。

## Artifact Producer 规则

artifact producer 只生成“可复核结果”，不代表动作已经执行。当前 artifact producer 列表来自 `ORBIT_AGENT_ARTIFACT_PRODUCERS`：

- `event_recommendation_producer`
- `contact_recommendation_producer`
- `followup_review_producer`
- `relationship_chat_review_producer`

artifact payload 必须保留：

- `task.artifactProducer`：本次 artifact 由哪个 producer 生成。
- `result.generatedView`：前端可渲染的摘要、section、item 和待确认 action。
- `result.provenance.sourceModules`：数据来自哪些 Orbit 模块。
- `result.provenance.toolCalls`：planner/tool/artifact 的可追踪记录。
- `result.safety`：证明没有外部副作用、数据库写入、邮件、日历、通知或 live storage mutation。

`requiresConfirmation=true` 的 action 永远只是待确认按钮，不能当成已执行动作。

## 内部工具所有权

Orbit AI 拥有 planner、runtime、工具白名单、tool request validation、trace 和 artifact 编排。它不应拥有业务工具的领域策略。

推荐模式是 central planner, distributed tools：

```text
Orbit AI planner/runtime
  -> tool registry
  -> feature-owned tool adapter
  -> feature service and optional shared retrieval service
  -> normalized tool result
  -> Orbit AI artifact mapper / synthesis
```

工具名仍由 Orbit AI 白名单控制，例如 `events.recommend`、`contacts.recommend`、`followups.reviewQueue` 和 `chat.context`。但工具实现应归对应 feature：

- `events.recommend`：Events 拥有活动目标、参会者上下文、活动准备和活动推荐策略。
- `contacts.recommend`：Contacts 或 Recommendations 拥有人脉候选资格、联系人排序、推荐理由和联系人动作；它可以调用 Relationship Search 获取 evidence-backed candidates。
- `followups.reviewQueue`：Followups 拥有跟进队列、逾期/沉睡关系解释和提醒动作边界。
- `chat.context`：Chat 拥有会话上下文、隐私边界和草稿准备策略。

Search/Relationship Search 是底层 retrieval substrate，不是业务工具 owner。当前 `contacts.recommend` 的候选检索和排序已经委托给 `features/contacts/contact-recommendation-search.ts`；Orbit AI 侧的 matcher 只保留方法选择、工具适配、artifact mapping 和 trace。

## Mock 行为

Mock command service 使用本地规则匹配 prompt，返回稳定 intent 和 panel。它不调用 live AI provider，不请求外部网络，不写对话存储。

Mock conversation service 接受自由文本，不要求每句话都绑定工具。Mock artifact task service 只生成可查看的本地推荐或上下文结果，不执行报名、发信、日历、通知、资料写入或数据库写入。

无法识别的 prompt 应返回可恢复建议，而不是假装完成。

## Live 模式

Live conversation 使用 server-side model provider API。必需环境变量：

- `ORBIT_AGENT_CONVERSATION_MODE=live`
- `ORBIT_AGENT_PROVIDER=gemini | deepseek | openai`
- 对应 provider 的 server-side key：`GEMINI_API_KEY`、`DEEPSEEK_API_KEY` 或 `OPENAI_API_KEY`

可选环境变量：

- `ORBIT_GEMINI_MODEL=gemini-3.5-flash`
- `ORBIT_DEEPSEEK_MODEL=deepseek-v4-flash`
- `ORBIT_OPENAI_MODEL=gpt-4.1`
- `ORBIT_AGENT_MAX_LOOP_STEPS=3`
- `ORBIT_CONTACT_RECOMMENDATION_METHOD=rules_v1 | structured_extraction_v1 | semantic_index_v1 | graph_gated_rag_v1`

`ORBIT_AGENT_CONVERSATION_MODE` 只切换 Chat Agent conversation provider，不切换 `/app` 首页 command center 或其他模块。缺少所选 provider API key 时，live conversation service 必须 fail closed：返回可恢复错误，不回退到 mock、不执行工具、不请求外部网络。

Provider planner 输出必须经过 schema validation、allowed intent mapping 和 safety guard。当前只有 `events.recommend`、`contacts.recommend`、`followups.reviewQueue` 和 `chat.context` 可以进入内部工具适配层。

Provider API 映射：

- `gemini` 使用 Gemini Interactions API。
- `deepseek` 使用 DeepSeek Chat Completions API。
- `openai` 使用 OpenAI Responses API；`gpt` 是 `openai` 的别名。

## Loop Steps

Live agent loop 必须短且可配置。`ORBIT_AGENT_MAX_LOOP_STEPS` 会被限制在 1 到 3：

- `1`：只做 model provider planner。
- `2`：planner 后允许 Orbit 内部 tool/artifact mapping。
- `3`：tool/artifact 返回后，再调用 model provider synthesis 生成最终自然语言回复。

默认值是 `3`，但交互路径可以选择更低的默认值以减少顺序 provider round trip。任何实现都不允许开放式无限循环。

## 人脉推荐工具

`contacts.recommend` 是 provider planner 可选择的白名单工具名。Runtime 会把它映射为 `contact_recommendations` artifact，并把用户最新消息、conversation context 和 planner tool arguments 传给 artifact service。

人脉推荐只推荐已有关系证据支持的人，不做开放网络发现。当前已实现的 `rules_v1` 会从 query、tool arguments 和上下文里抽取行业、合作意图、引荐意图等条件，再调用 relationship natural search service；候选必须带有 evidence ids 和 relationship path。

长期边界是：`contacts.recommend` 的产品策略应归 Contacts 或 Recommendations。当前基础实现通过 `createContactsRecommendationSearchTool()` 调用 Relationship Search；Search 只负责根据 query、filters 和 evidence constraints 召回候选；Contacts/Recommendations 负责候选资格、排序、推荐理由和下一步动作；Orbit AI 负责选择工具、记录 trace、生成 artifact 和综合回复。

`ORBIT_CONTACT_RECOMMENDATION_METHOD` 控制匹配方法：

- `rules_v1`：默认且当前已实现。
- `structured_extraction_v1`、`semantic_index_v1`、`graph_gated_rag_v1`：已声明的未来方法，当前返回可见的未实现状态，不静默 fallback。
- 非法值：返回 configuration error artifact 和 failed tool call trace。

未来 RAG 必须是 graph-gated RAG：先被关系图、来源证据和现有链接约束，再做语义检索或生成排序；不能绕过 Orbit 的真实关系网络。

## 页面使用规则

主要产品入口是 `/app`。Orbit AI 可以打开联系人、活动、跟进、聊天、关系健康或下一步面板，但页面内容仍来自对应模块。

当 Orbit AI 嵌入 `/app/chat` 等模块页面时，模块页面不直接依赖 raw payload。嵌入方应在自己的 route view model 中调用 Orbit AI service，把 proposed tool intents、assistant reply 和 artifact surface 映射成该页面的 view model。

## 测试要求

- intent 测试覆盖联系人、活动、跟进、聊天、dashboard 和 agent。
- unknown intent 测试覆盖 fallback。
- safety 测试确认 AI command 和 artifact producer 不执行外部副作用。
- artifact contract 测试确认 generated view、tool call trace、source modules、evidence ids 和 safety ledger 保留。
- live 接入测试确认 provider 输出被 schema 和工具白名单限制。
- trace 测试确认新增 tool 或 artifact producer 能出现在 `runtimeSnapshot`、timeline 和源码面板里。

## 协作规则

Orbit AI 团队不直接实现各业务模块。新增功能入口时，先让业务模块提供 service contract、mock/live 边界和页面，再把 intent 或 tool mapping 接到该能力。

Orbit AI 团队也不拥有产品页面的 presenter props。跨模块编排结果必须停在 service/mapper 边界；页面团队拥有本页面 view model，确保视觉改版不会要求修改 Orbit AI contract，Orbit AI contract 变更也不会直接扩散到 JSX 组件树。
