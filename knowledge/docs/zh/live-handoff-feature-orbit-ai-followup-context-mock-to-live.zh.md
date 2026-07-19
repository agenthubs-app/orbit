# orbit-ai 能力 Live 交接：followup context

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/features/orbit-ai/FOLLOWUP_CONTEXT_MOCK_TO_LIVE.md` |
| 中文镜像 | `knowledge/docs/zh/live-handoff-feature-orbit-ai-followup-context-mock-to-live.zh.md` |
| 分类 | `implementation-handoff` |
| 状态 | `generated-evidence` |
| 新鲜度 | `likely-current` |
| 负责人域 | `feature:orbit-ai` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

记录 orbit-ai 模块 followup context 能力的 mock-to-live 切换 边界：需要替换的服务、环境变量、权限约束和验证要求。

## 审计依据

已核对对应 feature 目录存在：repos/orbits/features/orbit-ai。具体切换行为以 service factory 与测试为准。

## 结构化阅读入口

- 第 1 节：Orbit AI 跟进上下文 Mock-to-Live 替换说明
- 第 2 节：当前边界
- 第 3 节：Live 替换文件
- 第 4 节：源标题：Provider gating
- 第 5 节：Prompt 输入
- 第 6 节：Provenance 与隐私约束
- 第 7 节：Replacement 测试

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

## 当前边界

`chat.context` 的产品路径是：

1. `createLiveOrbitAgentConversationService()` 调用配置的模型 provider 生成 `relationship_chat_context` 工具计划。
2. `createOrbitAgentChatContextArtifactService()` 通过 Chat conversation service 读取 `conversations` / `messages` / `contacts` / `connections` 派生出的 thread payload。
3. artifact service 先用 `FOLLOWUP_CONTEXT_ACCEPTED_SCORE` 对请求、tool arguments、联系人、组织、会话和最近消息做解析评分。
4. 只有解析状态为 `resolved` 且无歧义时，才调用配置的 `OrbitAgentFollowupContextGenerator`，把结构化 relationship / conversation / message / privacy 输入转成右侧面板文案。

当前默认 generator 是本地可重复实现；测试会注入 generator spy，证明右侧面板不是 planner 的 canned final answer，也不是 preview fixture。无 provider key 的产品默认路径保留一条 typed Aoba demonstration conversation（`胡家明 · Aoba Technologies`），由 mock conversation service 调用同一个 `chat.context` artifact service 和 generator，而不是返回预制最终答案。

产品 `/app/agent` 只把 generator 产出的关系摘要作为默认可见内容：联系人、组织、关系原因、具体关系来源、最近上下文、来源、置信标签、下一步和确认状态。具体关系来源优先来自最近窗口里的首条保存聊天日期和互动摘要，例如“2026年6月24日首条保存聊天：活动上聊到 Aoba Technologies...”。关系卡片不再重复同一段“为什么认识 / 最新上下文”rationale，只补充最近跟进记录、首条保存互动和待确认动作。provider/model、tool family、message id、matchedBy、raw source label 等仍保留在 artifact provenance / metadata 中，但产品 route 把它们放进折叠诊断信息，避免用户把 harness trace 当成关系建议。

默认 generator 还负责把 demonstration / generated relationship data 的 matcher 标签改写成用户能理解的关系语言。类似 `matches retail_omnichannel through post-event follow-up workflow operator` 的底层标签只能作为解析依据或 metadata，不能直接出现在“为什么认识”“最新上下文”或最近消息摘要里。

可见来源标签必须先映射成人能理解的来源，例如“来自已保存的关系聊天”。`Chat conversation Postgres live storage`、`Orbit AI ... live storage` 或 provider record id 仍要保留在技术 metadata / provenance，供 verifier 和后续 live 调试引用，但不能作为主面板来源文案。

最近消息证据进入 `generatedView` 前也必须完成用户化转换：`Orbit operator`、`orbit_user`、raw sender role、ISO timestamp 只能作为 provider/debug 原始输入存在，不能出现在 artifact 的 title、subtitle、body 或用户 metadata 中。默认产品面板只展开关系决策卡；最近消息复核记录和诊断信息必须放进默认折叠的历史证据 / 诊断区域，移动端首屏优先展示“是谁、为什么匹配、下一步是否安全”。

## Live 替换文件

后续替换 live 生成时，不要让 UI 或 dev page 直接读 provider payload。替换点应保持在 `features/orbit-ai/**`：

- `features/orbit-ai/chat-context-artifact-service.ts`：继续拥有 `OrbitAgentFollowupContextGenerator` 输入输出协议、解析阈值和 artifact 映射。
- `features/orbit-ai/mock-conversation-service.ts`：仅保留无 key / default 产品演示用的 Aoba typed conversation data；live 替换时删除该内置数据，改由 Chat conversation service provider 返回相同 DTO shape。
- `features/orbit-ai/live-conversation-service.ts`：通过 `LiveOrbitAgentRuntimeConfig.artifactTaskService` 或后续显式 config 注入 live generator 组合服务。
- 可新增 `features/orbit-ai/followup-context-live-generator.ts`：封装 provider 请求、超时、schema 校验和 fail-closed 错误。
- 可新增 `features/orbit-ai/followup-context-provider.ts`：读取 provider、model、endpoint、key，并返回 `NOT_IMPLEMENTED` / provider failure 形状，不允许静默回退 fixture。

## Provider gating

Live generator 必须和 Orbit Agent planner 一样 fail closed：

- `ORBIT_AGENT_CONVERSATION_MODE=live` 才进入 live agent conversation。
- 缺少所选 provider key 时，不发起网络请求，不调用 Chat service，不生成右侧成功面板。
- 允许的 provider key 仍应来自 server env，例如 `GEMINI_API_KEY`、`DEEPSEEK_API_KEY`、`OPENAI_API_KEY`。
- 任何 provider 输出必须校验为 `OrbitAgentFollowupContextGenerationResult`，不能直接把原始文本塞进 `generatedView.summary`。

## Prompt 输入

Live generator prompt 只能接收结构化输入：

- `query`：用户原始请求。
- `selectedConversation`：conversation id、participant contact id、participant name、status、last message time。
- `relationship`：contact id、participant name、organization、relationship stage、relationship reason、latest context、recommended follow-up。
- `messages`：最近 5 条 source-backed messages，包含 message id、sender、created time、body、evidence ids。
- `privacy`：`full` 或 `limited`，以及 included / excluded message counts。
- `resolution`：matchedBy、score、state。

不要把全部 raw fixture、未筛选 provider payload、其它联系人资料或无关 workspace 数据放进 prompt。
不要把底层 demo 文案原样输出给用户，例如 `Follow up about ... with a concrete next step`、`Review source evidence before recording another live-storage message` 或 `matches <segment> through <label>`。live generator 可以引用这些记录的主题，但必须改写成当前语言下的关系摘要和待确认动作。
如果 `messages` 非空，live generator 必须把首条可见保存消息作为关系来源候选输入，保留日期、sender role、body 和 evidence ids。provider 输出可以改写 body，但不能删掉具体日期或把来源降级成“活动后的交流证据”这类泛化说法。

## Provenance 与隐私约束

- `provenance.toolCalls[0]` 必须记录 `chat.context`、解析分、匹配方式和 evidence ids。
- `generatedView` 的 metadata 必须保留 resolution score、matched by、privacy scope；产品 UI 可以把来源、置信标签和匹配分作为用户可读摘要展示，provider/model/runtime/tool family 等技术字段仍默认折叠，dev/evidence surface 仍可读取。
- 主面板来源只能展示映射后的用户语言；raw source label 必须通过 `Technical source` / `技术来源` metadata、provenance 或 diagnostics 暴露。
- `generatedView.sections[0].items[0].actions` 必须保留待确认主动作、暂不继续次动作和复核动作；确认动作只能进入本地生成建议或复核流程，不得发送、写库、通知或创建日程。
- `generatedView.sections[1].items[*].actions[0].label` 必须包含消息日期或主题，例如“复核 6月29日 排期冲突”，不能重复输出不可区分的“复核上下文”。
- `generatedView.sections[1].items[*]` 的 title、subtitle 和用户 metadata 必须使用“已保存聊天”、本地化日期和可理解角色，不得输出 `Orbit operator`、`orbit_user` 或 ISO timestamp。
- `externalSideEffectsExecuted`、`liveDatabaseWriteExecuted`、`emailProviderRequested`、`calendarProviderRequested`、`notificationDelivered` 必须保持 `false`。
- ambiguous / missing context 只能返回 pending panel，不能调用 generator，也不能拿第一条 conversation 兜底。
- privacy-limited 请求只能给 generator 最近窗口和关系摘要，不得扩展读取其它联系人。
- `/app/agent` 必须给结果页提供单一 `h1`，并对长 provenance token 设置换行和最大宽度，防止 technical details 造成横向滚动。

## Replacement tests

保留并扩展这些测试：

- `tests/capabilities/orbit-ai-followup-context-evaluation.test.ts`：十个命名评估用例、阈值、歧义 pending、generator spy。
- `tests/capabilities/orbit-ai-chat-context-live-artifact.test.ts`：seeded stale conversation id 解析、默认 `/api/ai/conversations` Aoba 产品路径、Aoba Technologies / 胡家明 右侧面板、具体首条保存互动来源、按日期/主题区分的复核动作、禁止旧 mock missing-conversation 文案、禁止用户首屏泄漏 provider/model/loop-limit/tool family 技术文案、禁止 matcher 标签进入默认关系摘要、校验 agent route 的 h1 和 `/app` 返回链接、可见 artifact action 与 overflow 防护。
- 同一个 artifact 测试还必须拒绝 `Orbit operator` 和 ISO timestamp 进入用户文案，并确认 `/app/agent` 使用 primary relationship item + collapsed secondary evidence 的层级。

Live provider 替换后新增：

- provider 缺 key 时 fail closed 且不读 Chat service。
- provider schema 无效时不渲染 ready panel。
- provider 输出不能声称已发送、已排日程、已通知或已写库。
- privacy-limited case 的 prompt 快照不包含 excluded messages。
