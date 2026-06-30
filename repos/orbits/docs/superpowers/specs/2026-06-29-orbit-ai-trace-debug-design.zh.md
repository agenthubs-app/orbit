# Orbit AI 可视化 Trace Debug 页面设计

日期：2026-06-29
状态：已实现；2026-06-30 补充共享 runtime 和人脉匹配方法说明
选定方案：完整链路 debug 视图，并展示 planner-only 对比

## 怎么读

这份文档现在同时承担两件事：保留 Trace Debug 页的设计背景，并记录当前实现必须遵守的 runtime 边界。读当前代码时，先看“当前状态”和“Trace Contract”；读历史取舍时，再看后面的页面设计、测试策略和不做范围。

当前权威代码路径是：

- `features/orbit-ai/live-agent-runtime.ts`：产品 chat、full-chain trace 和 planner-only 诊断共用的执行链。
- `features/orbit-ai/live-conversation-trace.ts`：把 runtime 结果转换成 trace payload。
- `features/orbit-ai/trace-contract.ts`：trace payload、runtimeSnapshot、artifact producers、tools、render hints 和 graph 的契约。
- `app/api/dev/orbit-ai/trace/route.ts`：full-chain trace API。
- `app/api/dev/orbit-agent/trace/route.ts`：旧 planner-only API 的兼容入口。
- `app/dev/orbit-ai/trace/orbit-ai-trace-debugger.tsx`：debug UI。

## 目标

做一个只在开发环境可用的 Orbit AI 可视化 debug 页面。页面接收一段用户输入，然后展示这次请求背后的处理链路。

这个页面要回答几个具体问题：

- 哪些本地 guardrail 被检查了，是否有某个边界拦住请求。
- 模型 planner 返回了什么 intent 和 toolRequests。
- Orbit 选择了哪个 tool 或 artifact task。
- artifact 的数据来自哪些模块、证据和 tool call trace。
- agent chain 走到了哪一步，是继续、跳过、失败，还是被某个边界挡住。
- 最终返回给用户的 assistant message 是什么。
- 每一部分输出的原始源码是什么；源码默认折叠，展开后用 pretty print 展示。

本次实现采用用户确认的第二个方案：页面同时展示完整链路 trace 和现有 planner-only trace。完整链路用于看真实执行路径，planner-only 用于诊断模型路由本身。

## 当前状态

代码里现在有几块需要共同维护：

- `/api/dev/orbit-agent/trace`：保留为 planner-only 兼容诊断入口。它现在通过共享 live runtime 以 `maxLoopSteps=1` 执行同一套本地 guardrail 和 planner 路径，但仍跳过 domain tool、artifact generation 和 synthesis。
- `/api/ai/conversations`：调用 Orbit Agent conversation service。在 live mode 下，这条路径会跑本地 guardrail、planner routing、Orbit artifact mapping、可选 synthesis 和最终回复组装。
- `features/orbit-ai/live-agent-runtime.ts`：拥有共享 live 链路，包括本地 guardrail、provider planner、允许工具映射、artifact request 执行、可选 synthesis 和最终 conversation payload 组装。
- `features/orbit-ai/live-conversation-service.ts`：产品 chat API 的薄 wrapper，调用共享 runtime。
- `features/orbit-ai/live-conversation-trace.ts`：把共享 runtime 的结果转换成 `/dev/orbit-ai/trace` 使用的 full-chain trace。
- `features/orbit-ai/contact-recommendation-artifact-service.ts`：处理 `contacts.recommend` 工具产出的 `contact_recommendations` artifact。
- `features/orbit-ai/mock-artifact-task-service.ts`：artifact payload 已经带有 `sourceModules`、`toolCalls`、`generatedView`、`evidenceIds` 和 safety metadata。

新的 debug 页不要重新发明一套 agent 流程。它要把现有流程结构化地暴露出来。

## 架构

新增一个只在开发环境可用的 trace API：

- `POST /api/dev/orbit-ai/trace`
- `GET /api/dev/orbit-ai/trace`，用于简单 query-string probe

这个 API 返回两个诊断 lane：

- `fullChain`：完整 Orbit Agent 路径的结构化 trace。
- `plannerOnly`：现有 planner-only trace 的兼容形态，用来和 full-chain 结果对比。

现有 `/api/dev/orbit-agent/trace` 必须保持兼容，但不能再拥有独立 planner 路径。它应该调用 `runLiveOrbitAgentRuntime`，用 `maxLoopSteps=1` 执行，并继续返回原来的 planner-only 形态和 headers。

共享 runtime 是 agent 执行链的所有权边界。产品 chat、完整链路 trace 和 planner-only 诊断都必须调用它，不能各自复制 guardrail、planner、tool mapping、artifact execution 或 synthesis。Trace 代码可以适配和渲染 runtime 输出，但不应该自己实现 agent 决策。

目标文件：

- `features/orbit-ai/trace-contract.ts`：trace stage 和 payload 类型。
- `features/orbit-ai/live-agent-runtime.ts`：产品 chat、full-chain trace 和 planner-only 诊断共用的 Orbit Agent 执行 runtime。
- `features/orbit-ai/live-artifact-task-service.ts`：live artifact task service 的组合边界。
- `features/orbit-ai/live-conversation-trace.ts`：完整链路 trace runner 和转换 helper。
- `features/orbit-ai/contact-recommendation-matching.ts`：人脉推荐方法选择和当前基于关系证据的 matcher。
- `features/orbit-ai/contact-recommendation-artifact-service.ts`：`contact_recommendations` artifact 适配器。
- `app/api/dev/orbit-ai/trace/route.ts`：开发环境 trace API route。
- `app/api/dev/orbit-agent/trace/route.ts`：通过共享 runtime 实现的 planner-only 兼容 route。
- `app/dev/orbit-ai/trace/page.tsx`：debug 页 server shell。
- `app/dev/orbit-ai/trace/orbit-ai-trace-debugger.tsx`：client component，负责输入、运行状态、stage 选择、对比视图和 raw JSON 面板。

## 人脉推荐和方法选择

`contacts.recommend` 是模型可选择的工具名，不是一个静态展示字段。Planner 在判断用户意图是 `contact_recommendations` 后，可以选择这个工具；共享 runtime 会把它映射成 `contact_recommendations` artifact request，并把用户消息、对话上下文和 planner tool arguments 一起传给 artifact service。

人脉推荐方法由服务端环境变量 `ORBIT_CONTACT_RECOMMENDATION_METHOD` 控制：

- 未设置或 `rules_v1`：当前已实现的 matcher。
- `structured_extraction_v1`：已声明，但 matcher 未注册前会返回可见的 unimplemented 状态。
- `semantic_index_v1`：已声明，但当前返回可见的 unimplemented 状态。
- `graph_gated_rag_v1`：为未来 RAG 预留，但必须被关系图和来源证据约束；它不是广泛推荐陌生人。
- 其它值：返回 configuration error artifact 和 failed tool call trace，不会静默 fallback。

当前 `rules_v1` 会读取最新 query、planner tool arguments 和 conversation context，抽取有限的业务意图、行业、帮助类型和价值类型，再调用 relationship natural search service。只有带有已有关系证据和 evidence ids 的联系人会进入 artifact。

产品原则是优先挖掘现有真实链接人脉：不做开放网络发现，不执行外部副作用，也不展示没有可复核关系证据的人脉推荐。未来如果引入 RAG，也应是 graph-gated RAG：先用结构化上下文和关系图约束候选，再用检索或语义索引提高匹配质量，而不是绕过已有关系网络。

因为产品 chat、full-chain trace 和 planner-only 诊断都共用 `live-agent-runtime.ts`，人脉推荐行为变更应该落在 runtime 或 artifact service 中，而不是分别写在 dev route 或 UI component 里。

## Trace Contract

`fullChain` 至少包含这些字段：

- `traceSchemaVersion`：trace payload 的 schema 版本，用来在 agent 架构升级后做兼容判断。
- `input`：归一化后的 prompt、locale、max loop steps、provider 和当前 conversation mode。
- `runtimeSnapshot`：本次执行看到的 agent 架构快照。至少包含 planner provider、artifact producer 列表、tool registry、每个 tool 的 family、artifact kind、source modules、renderer hint 和 output schema 名称。
- `stages`：有序 stage 列表。每个 stage 包含 `id`、`label`、`status`、`summary`、`startedAt`、`completedAt`、`inputs`、`outputs`、`evidenceIds`、`safety`，可选 `skipReason`。
- `stages[].outputSource`：该 stage 输出的源码视图数据。页面默认不展开；展开后按 JSON pretty print 展示。非 JSON 文本保留为 monospaced source block。
- `stages[].renderHint`：页面渲染提示，例如 `summary_card`、`tool_call_table`、`database_table`、`artifact_panel`、`source_json`、`raw_text`。页面按 hint 选择 renderer；不认识的 hint 走通用 source renderer。
- `chain`：给时间线使用的精简顺序摘要。
- `toolCalls`：扁平化后的 planner tool 和 artifact tool call trace。
- `databaseInteractions`：trace 期间读取到的本地 local-remote database 摘要，包括 storage key、schema version、operation、相关 collection 和记录数量。这个字段只描述本地数据上下文，不代表 live database 写入。
- `dataSources`：从 artifact provenance 里抽取的 source modules、artifact source、evidence ids 和 generated view sections。
- `conversation`：最终 `OrbitAgentConversationPayload`，或者失败摘要。
- `raw`：可用时记录 raw planner output 和 raw synthesis output。

Stage 顺序固定：

1. `input_received`
2. `local_guardrails`
3. `planner`
4. `tool_mapping`
5. `database_context`
6. `artifact_generation`
7. `synthesis`
8. `final_response`

Stage status 固定为：

- `completed`
- `skipped`
- `blocked`
- `failed`

如果本地 guardrail 拦住请求，后面的模型和工具 stage 要标记为 `skipped`，并写清楚原因。如果 `ORBIT_AGENT_MAX_LOOP_STEPS` 阻止了某个 phase，也要把限制写进 `skipReason`。如果 provider 失败，失败 stage 要带 provider error code，但不能泄露 secret。

每个有实际输出的 stage 都要带 `outputSource`。这个字段保存脱敏后的原始输出源码，不是 UI 摘要。实现时优先保留对象形式，再由页面用 `JSON.stringify(value, null, 2)` pretty print；如果输出本来就是字符串，就按原文展示。

## 架构变更检测和渲染扩展

当前设计不能假设 agent 架构永远只有固定几类工具。页面要从 `runtimeSnapshot` 和每个 stage 的 `renderHint` 里检测本次实际参与的 planner、artifact producer、tool 和 artifact kind。

检测规则：

- 新 artifact producer 或新 tool 只要进入 trace payload，就必须出现在 `runtimeSnapshot`、`toolCalls`、graph 和相关 stage 里。
- 如果新 tool 使用已有 `renderHint`，页面不需要改代码，直接用现有 renderer 展示。
- 如果新 tool 没有专属 renderer，页面必须显示 `unknown tool` 或 `unregistered renderer` badge，同时保留完整 metadata、sourceModules、toolCalls、evidenceIds 和折叠源码。
- 如果新增的是全新 agent phase，比如 planner 之前多了 retrieval 或 memory phase，trace runner 可以增加新的 stage；页面 timeline 按返回顺序渲染，不依赖硬编码顺序。已有八个 stage 仍作为 baseline，不作为上限。
- 只有当新工具需要全新的可视化形态时，才需要添加新的 renderer。即使没有新 renderer，debug 页面也不能丢输出。

这条设计让页面具备两层能力：已知 render hint 走结构化渲染，未知工具走通用源码渲染。它不能自动发明新 UI，但能自动发现并展示新 agent、工具和输出。

## 页面设计

Route：`/dev/orbit-ai/trace`

这是开发调试工具，不是产品落地页。页面保持高信息密度，复用现有 workbench primitives 和 Orbit 视觉语言，但布局要像 debugger：

- 左侧 rail：prompt textarea、locale selector、max loop steps、run button、安全和 runtime badge。
- 中间主面板：full-chain timeline。每个 stage 一行，展示 status、短摘要、tool 数量、source 数量，以及链路是否停在这里。
- timeline 和来源面板要区分 agent lane 与 data lane。planner、tool mapping、artifact 和 synthesis 使用 agent 色；`database_context`、database interactions 和 data sources 使用 data 色。
- 右侧详情面板：当前选中 stage 的 inputs、outputs、evidence ids、source modules、safety ledger 和相关 raw JSON。每个输出源码面板默认折叠，标题显示输出类型和大小；展开后用 pretty print code block 展示。
- 底部或右侧次级区域：planner-only comparison，展示 raw planner text、parsed intent、planner-selected tools，以及 full-chain 是否 fallback 或提前停止。
- 架构快照区：显示本次 trace 检测到的 artifact producers、tools、render hints 和 unknown renderer warnings。这个区域默认收起，出错或出现 unknown tool 时自动展开。

主流程：

1. 用户输入 prompt。
2. 用户点击运行 trace。
3. 页面 POST 到 `/api/dev/orbit-ai/trace`。
4. 页面渲染 full-chain timeline，并默认选中第一个非 completed stage；如果全部完成，就选中 `final_response`。
5. 用户点击任意 stage，查看该 stage 的数据来源和 raw payload。
6. 用户展开某个 stage 的输出源码面板，查看脱敏后的 pretty printed source。

提交按钮只在两种情况下 disabled：prompt 为空，或者请求正在执行。

## 安全和运行边界

Trace API 只能在开发环境使用：

- `NODE_ENV=production` 时返回 404。
- 响应加 `Cache-Control: no-store`。
- 响应 header 包含 `X-Orbit-Dev-Trace: orbit-ai-full-chain` 和 `X-Orbit-Privacy: developer-debug-prompt-visible`。
- 不暴露 API key、环境变量值或 secret。
- `outputSource` 必须先脱敏再返回给页面。
- 不执行外部 side effect。
- 不写 live database。trace 只允许读取本地 local-remote database 的表级摘要，用于说明数据上下文。
- 不发送 email，不创建 calendar event，不投递 notification，不修改 live storage。
- 唯一允许的外部网络请求，是现有 live Orbit Agent planner/synthesis 路径已经会调用的模型 provider。

页面上要明确标注：prompt 会在 developer debug 中可见；tool artifact 是 review-only，不代表动作已经执行。

## 错误处理

API 要返回结构化失败：

- 缺少 prompt。
- production runtime。
- provider key 缺失。
- provider request failure。
- provider schema failure。
- trace runner 未预期失败。

如果某一步失败，响应要尽量保留已经完成的 stages。页面展示失败 stage、恢复建议，以及现有 app error envelope 允许暴露的 raw error context。

## 测试策略

实现前先写 RED 测试。

RED 测试覆盖：

- `POST /api/dev/orbit-ai/trace` 对 event recommendation prompt 返回 full-chain payload，包含有序 stages、tool calls、data sources、safety metadata 和 planner-only comparison。
- 有输出的 stage 返回 `outputSource`；页面默认折叠源码面板，展开后显示 pretty printed JSON。
- 新增工具或 artifact producer 的 trace payload 会出现在 `runtimeSnapshot`、timeline 和 source 面板里；未知 renderer 不丢数据，走通用 fallback。
- 本地 guardrail prompt 会在 planner 和工具执行前停止，后续 stage 标记为 skipped。
- production runtime 返回 404。
- 现有 `/api/dev/orbit-agent/trace` planner-only contract 继续通过。
- `/dev/orbit-ai/trace` 渲染输入表单、stage timeline、选中 stage 详情区域、planner-only 对比区域，并 fetch `/api/dev/orbit-ai/trace`。

实现后的验证命令：

- 新 trace API 和页面的 targeted tests。
- 现有 Orbit Agent live tests。
- `npm test`
- `npm run lint`
- `npm run build`
- 启动 dev server 后，用浏览器验证 `/dev/orbit-ai/trace`。

## 不做

- 生产环境 admin observability。
- 持久化 trace run。
- streaming trace。
- 真实数据库写入或生产数据库读写。
- email、calendar、notification 或外部动作执行。
- 替换正常 chat UI。

## 验收标准

- 开发者可以打开 `/dev/orbit-ai/trace`，输入 prompt，并看到 full-chain execution 和 planner-only comparison。
- full-chain 视图能显示链路在哪里继续、跳过、失败或停止。
- 页面能看到 tool name、artifact kind、source modules、tool call traces、evidence ids、generated artifact summaries 和 safety metadata。
- 页面能展开查看每个 stage 的输出源码；源码默认折叠，展开后是 pretty print，不是压缩 JSON。
- 新增 artifact producer 或工具后，页面能从 trace payload 检测到它；有已知 `renderHint` 时使用对应 renderer，未知时显示 warning 并用通用源码面板展示。
- 本地 guardrail 作为一等 stage 展示。
- 现有 planner-only trace 行为保持兼容。
- 页面和 API 在 production 中不可用。
- 测试和 build verification 能证明行为正确，且不会暴露 secret。
