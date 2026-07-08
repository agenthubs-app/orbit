# Orbit AI 跟进上下文评估说明

## 目标

Sprint 85 的评估目标是让 `/app/agent` 右侧面板在 seeded follow-up 请求里解析到真实关系上下文，而不是展示：

`No mock chat conversation fixture matches that conversation id.`

评估只证明能力边界：planner 生成 `chat.context` 工具计划，artifact service 从 Chat conversation service 读取 source-backed context，解析达到阈值后调用 follow-up context generator。它不证明任何外部发送、通知、日历或写库已经执行。

## 设计-评估-分析循环

循环按固定顺序执行：

1. Design：把请求拆成 query、tool arguments、conversation candidates、relationship fields、privacy mode。
2. Evaluate：对每个 candidate 计算 resolution score，并记录 matchedBy。
3. Analyze：如果 top score 低于 `FOLLOWUP_CONTEXT_ACCEPTED_SCORE`，或 top candidates 分差小于 0.03，返回 pending panel。
4. Generate：只有 `state=resolved` 且 score 达标时，调用 `OrbitAgentFollowupContextGenerator`。
5. Present：产品路由先展示一段关系摘要，说明对象是谁、为什么认识、具体关系来源、最近上下文、来源、置信标签、建议跟进和确认状态。具体关系来源必须来自可追踪会话输入，例如首条保存聊天的日期和互动内容，不能只说“活动后的交流证据”。关系卡片只补充最近跟进记录、首条保存互动和待确认动作，不重复同一段 rationale。最近消息的复核动作必须带日期或主题，例如“复核 6月29日 排期冲突”，避免右侧面板出现多枚不可区分的“复核上下文”。可见来源使用“来自已保存的关系聊天”这类用户语言；recent message title / subtitle / metadata 必须把 `Orbit operator`、`orbit_user` 和 ISO timestamp 改写为“已保存聊天”“已保存关系记录”和本地化日期。provider/model、tool family、message id、matchedBy、raw source label 等技术字段只放在折叠诊断信息里。移动端默认只展开 summary、关系决策卡和待确认动作；历史证据和诊断信息都放在默认折叠的 `<details>` 中，避免首屏变成连续日志。
6. Verify：测试确认 panel summary 来自 generator，metadata 暴露 score / matchedBy / privacy，provenance 保留 `chat.context` tool trace，`/api/ai/conversations` 的默认产品路径能把 `总结和Aoba的关系上下文` 解析到 `胡家明 · Aoba Technologies`，且 `/app/agent` 不把 loop-limit 或 provider 文案放在用户第一眼看到的关系摘要中。

接受阈值：

- `FOLLOWUP_CONTEXT_ACCEPTED_SCORE = 0.7`
- ready panel 必须 `score >= 0.7`
- 非 ID 的 query / contact-name / organization 解析可以通过 `0.86` 的 source-backed 分数进入 ready，但不能伪装成显式 conversation id / contact id 命中。
- ambiguous high-score match 仍必须 pending
- missing / low-score match 不能调用 generator

## 十个命名用例

`tests/capabilities/orbit-ai-followup-context-evaluation.test.ts` 固定覆盖：

1. `direct match`：显式 `conversation_001` 解析到 山田 千尋。
2. `missing conversation`：planner 给出 stale conversation id，但 query / tool arguments 解析到 Aoba Technologies 的 `conversation_010`。
3. `ambiguous person`：两个 Alex Chen 同分匹配，保持 pending，不调用 generator。
4. `stale relationship`：曾伟 / Kansai Community 通过联系人名解析。
5. `recent event`：Aoba Technologies 的近期活动语义不改变 relationship context 工具边界。
6. `pending reply`：needs-follow-up 语义必须仍通过联系人解析，而不是发送消息。
7. `Chinese-language request`：中文 query 解析 Aoba Technologies。
8. `English-language request`：英文 query 解析 Aoba Technologies。
9. `schedule conflict`：日程冲突语义只作为上下文，不创建日历。
10. `privacy-limited context`：generator 只收到 privacy-limited 标记和最近消息窗口。

## 失败案例分析

已知失败必须显式呈现：

- Stale conversation id：不能直接调用 `getMessageThread` 后把 `CHAT_CONVERSATION_NOT_FOUND` 文案渲染到面板；必须先尝试关系解析。
- Ambiguous person：不能默认拿第一条候选会话；必须 pending 并要求澄清。
- Planner canned answer：不能把 planner 的 `assistantMessage` 当成 follow-up context artifact；artifact summary 必须来自 generator。
- Privacy-limited request：不能扩大 prompt 范围到全部关系库或其它联系人。
- Product panel leakage：不能把 `Orbit Agent live reply via provider:model`、`ORBIT_AGENT_MAX_LOOP_STEPS`、`message_****` 或 `relationship_chat` 当成主要结果文案；这些只属于可折叠技术细节或 provenance。
- Generated matcher leakage：`胡家明 matches retail_omnichannel through post-event follow-up workflow operator` 这类生成数据标签不能出现在“为什么认识”或“最新上下文”的默认可见文案中；generator 必须改写成活动来源、讨论主题和当前跟进需要，原始 matcher 只保留在 metadata / provenance。
- Generic fixture copy：`Follow up about ... with a concrete next step` 和 `Review source evidence before recording another live-storage message` 只能作为底层 demo/storage 线索，生成器必须改写成具体关系语言。
- Horizontal overflow：右侧结果卡片、技术 token 和移动内联 panel 必须设置最大宽度与换行，不能把桌面或平板视口撑出横向滚动。
- Default product route gap：`/app/agent?q=总结和Aoba的关系上下文` 走默认 mock conversation / API path 时，也必须通过 typed conversation data 调用 `chat.context` artifact service；不能只在注入 live Chat service 的单元测试里解析成功。
- No visible next step：如果 artifact action 只保存在 payload 里但产品 panel 不渲染，用户无法继续复核；首屏必须显示“确认并生成跟进建议”的主动作、“暂不继续”的次动作，并保留复核关系上下文动作。
- Ambiguous confirmation path：只显示“请确认是否继续”会让用户不知道确认后的结果；主动作文案必须说明确认后只是生成跟进建议，不发送消息、不创建日程、不通知任何人。
- Repeated relationship rationale：右侧面板不能在 summary 和卡片 body 中重复“为什么认识 / 最新上下文”；summary 负责完整关系判断，卡片 body 只显示最近跟进记录、状态或来源补充。
- Raw source leakage：`Chat conversation Postgres live storage`、`Orbit AI ... live storage` 等 raw source label 只能保留在折叠诊断或 provenance，主面板使用“来自已保存的关系聊天”。
- Empty top-nav home link：`/app/agent` 使用 agent-local top nav，品牌链接必须有可见 Orbit 文案和返回首页的 accessible name，避免 shared shell 的图标-only home link 影响 Sprint 85 evidence。
- Generic origin leakage：主面板不能只显示“关系来自活动后的交流证据”；如果 conversation messages 可用，必须展示首条保存聊天的日期和互动摘要，例如 `2026年6月24日首条保存聊天：活动上聊到 Aoba Technologies...`。
- Repeated review buttons：最近消息不能全部渲染成同一个“复核上下文”按钮；action label 必须包含日期或主题，让用户能选择要复核的那条记录。
- Raw actor / timestamp leakage：`Orbit operator 的消息`、`orbit_user` 和 `2026-06-19T13:00:00+09:00` 不能出现在产品默认可见的关系上下文或 `generatedView` 用户文案中；必须转换为“已保存聊天”和本地化日期。
- Flat mobile evidence hierarchy：移动端不能默认连续展示 summary、联系人 metadata、三条以上最近消息、诊断和动作；默认可见层级必须是对象、匹配原因、最安全下一步，历史证据和诊断折叠展示。

## 证据命令

当前 focused gate：

```bash
npm test -- tests/capabilities/orbit-ai-followup-context-evaluation.test.ts tests/capabilities/orbit-ai-chat-context-live-artifact.test.ts
```

发布前还必须运行：

```bash
npm run lint
npm run build
```
