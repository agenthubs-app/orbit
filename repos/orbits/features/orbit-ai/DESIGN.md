# Orbit AI 模块设计文档

## 设计定位

Orbit AI 是产品的对话式编排层。它把用户自然语言意图映射到 Profile、Contacts、Events、Followups、Chat、Dashboard 和 Agent 的功能页面或服务动作。它不是单独替代所有模块的超级模型。

核心原则是：AI 负责理解意图和打开合适工作区，业务事实仍由各模块 contract 提供。

## 子能力范围

- AI command center intent parsing。
- 侧边功能面板路由选择。
- 本地建议、预览动作和下一步说明。
- 与 app bootstrap、agent action、chat draft、event recommendation 等模块组合。

## 契约与数据边界

契约位于 `features/orbit-ai/contract.ts`。核心 DTO 包括 user prompt、resolved intent、target panel、suggested action、response copy、source references 和 safety boundary。Orbit AI 输出不能直接改联系人、发送消息或写外部系统。

`features/orbit-ai/service-factory.ts` 提供 command service。页面应通过 `createOrbitAiCommandService()` 获取能力。

Orbit AI 的 conversation、artifact task 和 generated artifact payload 属于编排层 contract，不是产品 presenter 的直接 props。产品路由应通过 feature-owned mapper（例如 artifact view model）或 route-owned mapper，把 artifact/status/provenance/tool intent 转成页面专用 view model 后再渲染。这样 Orbit AI 可以替换 planner、sub-agent 或 live provider，而 UI 只关心稳定的 surface data。

## Mock 行为

Mock 使用规则匹配用户 prompt，返回稳定 intent 和 panel。它不调用 live AI provider，不请求外部网络，不写对话存储。无法识别的 prompt 应返回可恢复建议，而不是假装完成。

## Live 替换方案

Live 可以接 LLM intent parser 或 tool planner。模型输出必须经过 schema validation、allowed intent mapping 和 safety guard。LLM 不能直接返回任意 route 或任意 API call；只能选择注册过的能力。

Gemini live agent 使用 server-side Gemini Interactions API。必需环境变量：

- `ORBIT_AGENT_CONVERSATION_MODE=live`
- `GEMINI_API_KEY=<server-side key>`

可选环境变量：

- `ORBIT_GEMINI_MODEL=gemini-3.5-flash`
- `ORBIT_AGENT_MAX_LOOP_STEPS=3`

`ORBIT_AGENT_CONVERSATION_MODE` 只切换 Chat Agent conversation provider，不切换 `/app` 首页 command center 或其他模块。缺少 `GEMINI_API_KEY` 时，live conversation service 必须 fail closed，返回可恢复错误，不回退到 mock、不执行工具、不请求外部网络。Gemini planner 输出必须通过白名单 schema，只有 `events.recommend`、`contacts.recommend`、`followups.reviewQueue` 和 `chat.context` 可以进入内部工具适配层。

Live agent loop 必须短且可配置。`ORBIT_AGENT_MAX_LOOP_STEPS` 会被限制在 1 到 3 之间：`1` 表示只做 Gemini planner；`2` 表示 planner 后允许 Orbit 内部 tool/artifact mapping；`3` 表示 tool/artifact 返回后再调用 Gemini synthesis 生成最终自然语言回复。默认值是 `3`，不允许开放式无限循环。

## API 与页面使用

主要产品入口是 `/app`。Orbit AI 负责干净的中文优先聊天入口和功能侧页联动。它可以打开联系人、活动、跟进、聊天、关系健康或下一步面板，但页面内容仍来自对应模块。

当 Orbit AI 被嵌入 `/app/chat` 等模块页面时，模块页面不直接依赖 Orbit AI raw payload。嵌入方应在自己的 route view model 中调用 Orbit AI service，把 proposed tool intents、assistant reply 和 artifact surface 映射成该页面的 view model，再传给 UI presenter。

## 测试要求

- intent 测试覆盖联系人、活动、跟进、聊天、dashboard、agent。
- unknown intent 测试覆盖 fallback。
- safety 测试确认 AI command 不执行外部副作用。
- 页面测试确认 prompt 能打开对应功能侧页。
- live 接入测试确认 LLM 输出被 schema 限制。

## 团队协作规则

Orbit AI 团队不直接实现各业务模块。新增功能入口时，先让业务模块提供 service contract 和页面，再把 intent 映射到该功能。

Orbit AI 团队也不拥有产品页面的 presenter props。跨模块编排结果必须停在 service/mapper 边界；页面团队拥有本页面 view model，确保视觉改版不会要求修改 Orbit AI contract，Orbit AI contract 变更也不会直接扩散到 JSX 组件树。
