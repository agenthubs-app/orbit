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

Orbit AI 的当前权威设计入口：解释 command center、live conversation、artifact producer、planner 工具白名单、人脉推荐方法和产品/trace 共用执行链。

## 审计依据

已核对 artifact-contract、service-factory、live-agent-runtime、live-conversation-service、live-conversation-trace、contact-recommendation artifact service 和相关 capability tests；产品 chat、full-chain trace、planner-only trace 共用同一 runtime。

## 结构化阅读入口

- 第 1 节：Orbit AI Feature 设计
- 第 2 节：这份文档回答什么
- 第 3 节：当前代码事实
- 第 4 节：真实请求链路
- 第 5 节：契约与数据边界
- 第 6 节：Artifact Producer 规则
- 第 7 节：Proactive Agent 规则
- 第 8 节：内部工具所有权
- 第 9 节：Mock 行为
- 第 10 节：Live 模式
- 第 11 节：循环 步骤
- 第 12 节：人脉推荐工具
- 第 13 节：活动推荐工具
- 第 14 节：页面使用规则
- 第 15 节：测试要求
- 第 16 节：协作规则

## 保留的代码与命令证据

### 代码证据 1

```text
Orbit AI planner/runtime
  -> tool registry
  -> feature-owned tool adapter
  -> feature service and optional shared retrieval service
  -> normalized tool result
  -> Orbit AI artifact mapper / synthesis
```

## 源文档正文

## 这份文档回答什么

Orbit AI 是产品里的对话式编排层。它接收自然语言输入，决定应该打开哪个工作面板、调用哪个内部工具、生成哪类可复核 artifact。它不拥有联系人、活动、跟进、通知或聊天数据，也不直接执行外部动作。

阅读时先记住一句话：Orbit AI 负责“理解和编排”，业务事实和副作用边界仍由各 feature module 的 contract、service factory 和测试负责。

## 当前代码事实

当前 `features/orbit-ai` 拆成四个 capability：

- `orbit-ai-command`：旧 command center 能力，主要用于首页和功能侧页联动。入口是 `createOrbitAiCommandService()`。
- `orbit-agent-conversation`：产品 chat agent 能力。mock 模式走稳定 fixture，live 模式走 provider planner、内部 tool/artifact mapping 和可选 synthesis。入口是 `createOrbitAgentConversationService()`。
- `orbit-agent-artifact-task`：把 planner 选出的内部工具请求转换成可复核 artifact。入口是 `createOrbitAgentArtifactTaskService()`。
- `orbit-ai-proactive-agent`：把 Calendar、Events、Contacts、Followups 或系统状态发出的结构化 signal 转换成 Orbit AI 聊天窗口里的主动管家消息。入口是 `createOrbitAiProactiveAgentService()`。
- `orbit-ai-todo-summary`：把对话下一步、活动时间、日程、生日、引荐机会和关系提醒整理成带来源的关系待办摘要。入口是 `createOrbitAiTodoSummaryService()`，评估与 mock-to-live 路径见 `TODO_SUMMARY_EVALUATION.md`。
- `orbit-ai-calendar-action`：把已有 artifact 卡片里的标题、时间、人或活动链接、原因和来源整理成“加入日历”的本地预览。入口是 `createOrbitAiCalendarActionService()`；当前默认不写日历、不写记录、不发通知、不发消息、不请求外部网络。mock-to-live 路径见 `CALENDAR_ACTION_LIVE_IMPLEMENTATION.md`。

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

## Proactive Agent 规则

Orbit AI 的主动性不是独立通知中心，而是 Orbit AI 管家聊天窗口里的 assistant turn。Calendar、Events、Contacts、Followups 和系统状态模块只产出结构化 `AgentSignal`；Orbit AI Proactive Agent 负责解释这个 signal 为什么现在重要、生成用户可读消息、附上证据和可复核动作。

Notifications 只负责底层投递能力，例如 mobile push、badge、delivery status、quiet hours 和 permission guard。它不生成 proactive 文案，也不成为产品内容入口。移动端 push 只能把用户带回 Orbit AI 中对应的 proactive message。

Chat/Messages 的边界仍是用户与人脉之间的沟通，包括联系人会话上下文、草稿、改写、跟进文案和发出前确认。日历提醒、活动准备、关系机会和系统状态不进入 Chat/Messages 作为全局 inbox。

当前 proactive agent 已有 mock 和 live-policy 两个实现。mock 用于稳定 fixture；live-policy 用于 live 模式下的真实运行边界。两者都只生成 Orbit AI 聊天窗口里的 proactive assistant turn，不能调用 live AI provider、push provider、email、calendar、外部网络、live database write 或 websocket。

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

当前 live artifact 链中，`chat.context` 通过 `createOrbitAgentChatContextArtifactService()` 调用 Chat conversation/message service，读取 live `conversations`、`messages`、`contacts` 和 `connections` 派生出的 thread payload，再映射为 `relationship_chat_context` artifact。Orbit AI 只负责工具适配、可复核 artifact、trace 和 safety 标记；artifact 生成不会绕过 feature service 直接读取 `orbit_records`，不会写消息，也不会打开实时传输、外部网络、邮件、日历或通知。

开发调试用的 live trace 有一个例外边界：`database_context` stage 可以读取配置好的 live record store，按 planner 选中的白名单工具列出相关 `orbit_records` collection 的计数和选中状态。这个读取只用于 trace UI 解释“本次工具可见哪些 live 数据”，不把 raw payload 交给 Orbit AI 做业务决策，也不写数据库。没有 live storage 配置时，trace 仍 fallback 到本地 local-remote database 快照，方便无远程库的开发环境调试。

Search/Relationship Search 是底层 retrieval substrate，不是业务工具 owner。当前 `contacts.recommend` 的候选检索和排序已经委托给 `features/contacts/contact-recommendation-search.ts`；Orbit AI 侧的 matcher 只保留方法选择、工具适配、artifact mapping 和 trace。

## Mock 行为

Mock command service 使用本地规则匹配 prompt，返回稳定 intent 和 panel。它不调用 live AI provider，不请求外部网络，不写对话存储。

Mock conversation service 接受自由文本，不要求每句话都绑定工具。Mock artifact task service 只生成可查看的本地推荐或上下文结果，不执行报名、发信、日历、通知、资料写入或数据库写入。

Calendar action service 只根据已有 artifact 生成本地预览。只有卡片同时具备明确标题、时间、人或活动链接、原因和来源时，才会出现加入日历的待确认入口；联系人推荐、活动推荐、跟进队列和待办摘要都走同一个 gate，其中待办摘要额外保留 `todo_summary` 作为未来独立 artifact kind 的显式别名。预览和取消都必须保留 no-side-effect ledger。当前预览还必须带 `completionBoundary`，明确确认暂不可用、尚未创建日历事件，并把下一步限制在查看来源或取消预览。

产品页渲染 calendar action 时，入口文案必须随当前语言本地化，例如中文为「预览加入日历」。可见预览先展示日历级字段：标题、日期、开始时间、结束时间、时区、地点、数据来源、仅本地预览、未确认和尚未创建日历事件；原因、artifact source 与 evidence ids 收进「查看依据」折叠区。数据来源用用户可读中文，例如「参会者意图记录」「活动主题记录」「画像匹配摘要」「已保存关系对话」；raw source id 只能放在诊断/data attribute，不直接作为可见文案。折叠的次要结果只保留只读摘要，不输出隐藏的查看活动或加入日历链接，避免用户和浏览器验证看到不可见但可聚焦的动作。

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

`ORBIT_AGENT_CONVERSATION_MODE` 只切换 Chat Agent conversation provider，不切换其他模块。缺少所选 provider API key 时，live conversation service 必须 fail closed：返回可恢复错误，不回退到 mock、不执行工具、不请求外部网络。

旧 `orbit-ai-command` 面板现在也支持 `ORBIT_MODULE_MODE=live`。它不是模型 provider runtime，而是 read-only command surface：live command service 会读取 Events、Contacts、Followups、Dashboard 和 Agent queue 的 live services，把结果整理成可打开的 stage items，并保留 evidence ids。它不调用 AI provider、不执行外部动作、不发送通知、不写 live storage。任一子服务失败时，command payload 保留失败 evidence 并继续返回可恢复 UI，而不是静默回退 mock。

`orbit-ai-proactive-agent` 的 live 模式是 policy provider，不是推送系统。它把结构化 signal 转成 `deliverySurface: "orbit_ai_chat"` 的 assistant proactive turn，并用 safety ledger 证明没有 push、notification、email、calendar、live storage write、AI provider 或 external network side effect。Notifications 仍只负责底层投递机制和 deep link，不生成主动管家文案。

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

人脉推荐只推荐已有关系证据支持的人，不做开放网络发现。当前实现会从 query、tool arguments 和上下文里抽取行业、合作意图、引荐意图等条件，再调用 relationship natural search service；候选必须带有 evidence ids 和 relationship path。

领域分类遵循 understanding in model, deterministic retrieval in code：planner 在工具参数里输出 `searchTerms`（英文检索词）和 `domains`（多选，最多 5 个，只能取 `ORBIT_AGENT_RECOMMENDATION_DOMAINS` 固定枚举，schema 校验会过滤枚举外的值）。有模型判断时，Contacts 适配器取全量关系池并按 token 相关度排名：姓名/职位/组织/地点等身份字段命中权重高于证据文本命中，证据文本命中封顶计入以抑制模板句噪音；每个选中的 domain 由代码补上确定性的行业+角色扩展词（`domainRankingExpansions`），保证同类查询不随模型抽词波动。结果按 contactId 去重、取前 8 条，matchScore 反映本次查询相关度。planner 检索词零命中时，用 `language-normalization-service` 抽的英文词确定性重试一次。完全没有模型判断时（无 key/测试环境）回退到 `extractRuleCriteria` 正则分桶 + 后端子串匹配——正则词表只作为无模型环境的兜底，不在 live 主路径承担领域判断。

长期边界是：`contacts.recommend` 的产品策略应归 Contacts 或 Recommendations。当前基础实现通过 `createContactsRecommendationSearchTool()` 调用 Relationship Search；Search 只负责根据 query、filters 和 evidence constraints 召回候选；Contacts/Recommendations 负责候选资格、排序、推荐理由和下一步动作；Orbit AI 负责选择工具、记录 trace、生成 artifact 和综合回复。

## 活动推荐工具

`events.recommend` 在 live 路径映射为 `event_recommendations` artifact，由 Events 拥有的 `createEventsRecommendationTool()` 从 events live store 读取全部未取消活动并按查询排名：token 采用词边界匹配（拉丁词）+ 子串匹配（CJK），会从中日文句子里抽出嵌入的拉丁词（如「参加AI相关的活动」里的 ai），合并 planner 提供的 `toolArguments.searchTerms`；英文虚词进停用词表。还没开始的活动加权（+15），带关键词却零命中的活动被过滤。artifact 卡片文案不透出导入原始串，改为确定性生成的本地化「匹配理由 + 未开始/已结束状态」，双语标题按 locale 挑选，动作链接指向 `/app/events/{id}`。不注入该工具时，artifact service 回退到固定画像的 goal 推荐实现（mock 与评估路径）。

`ORBIT_CONTACT_RECOMMENDATION_METHOD` 控制匹配方法：

- `rules_v1`：默认方法，使用当前规则抽取和 Contacts/Search adapter。
- `structured_extraction_v1`、`semantic_index_v1`、`graph_gated_rag_v1`：作为可选方法进入同一个 feature-owned retrieval 边界；当前不会静默 fallback 成 `rules_v1`，artifact metadata、trace reason 和 task id 会保留实际选中的 method。现阶段这些方法仍是 deterministic relationship retrieval，不调用 embedding/vector provider、外部 RAG、AI 排序或开放网络。
- 非法值：返回 configuration error artifact 和 failed tool call trace。

未来 RAG 必须是 graph-gated RAG：先被关系图、来源证据和现有链接约束，再做语义检索或生成排序；不能绕过 Orbit 的真实关系网络。

## 页面使用规则

主要产品入口是 `/app`。Orbit AI 可以打开联系人、活动、跟进、聊天、关系健康或下一步面板，但页面内容仍来自对应模块。

`/app/agent` 的聊天框直接调用 `/api/ai/conversations`（POST，带 `locale` 和最近 8 轮 `history`），把返回的 `contact_recommendations` / `event_recommendations` / `followup_queue` artifact 在页面自己的 view-model 映射后渲染到侧边面板（人脉卡 / 活动卡 / 待办卡）；卡片文案由 artifact 服务按 locale 本地化（followup 卡对种子模板标题做确定性重组：`跟进 <姓名>` + 来源方式本地化），页面不再使用本地关键词剧本回答。assistant 气泡按轻量 markdown 渲染。

会面备忘录（备忘录/会前准备）复用 `chat.context`：planner 把人名放进 `arguments.searchTerms`，synthesis 按固定四段模板输出（背景/上次进展/建议话题/待确认事项），只允许使用工具结果与对话历史里的事实，缺口写「待补充」。

`history` 在服务端的用途：route 校验角色和长度后透传；runtime 把同一份最近轮次交给 planner（消解追问指代并按前文目标路由工具）、artifact contextMessages（参与检索词抽取与路径选择）和 synthesis（保持多轮连贯）。会话仍不做服务端持久化，历史由页面随每次请求携带。

带推荐结果的 assistant 轮在 history 中附加 `[本轮推荐明细]` 结构化行（名称/时间/地点/分数/理由）。实体详情查询走两级：明细块已含答案时 planner 用 general_chat 直接作答；需要完整记录时 planner 复用 `events.recommend` / `contacts.recommend`，把实体名放进 `arguments.searchTerms` 从 live 库取回完整记录（Contacts 排名 token 支持中日文名子串匹配；planner 提供的 searchTerms 优先于抽词服务，不会被覆盖）。不为实体详情新增白名单工具。等待回复期间侧边栏保持上一轮结果，新回复带结果时才替换。

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
