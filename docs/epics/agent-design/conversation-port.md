# 多轮理解引擎移植（conversation lab r07 → features/agent-v1/conversation）

开关 `ORBIT_AGENT_CONVERSATION = legacy | shadow | on`，缺省 shadow。引擎是实验台 `impl/`（lab-conv c8717763a，r07）原样复制，
只加两行 `@ts-nocheck` 出处头；`types.ts` 是实验台的 types.ts，只把 World 的 import 指到 `finder/types.ts`（同一份文件）。
`impl/` 可以整个换掉（任何实现实验台 `Conversation` 接口的 index.ts 都能用；x03 已定不用）。

## 1. 现在的 Agent 怎么处理多轮

| 事 | 在哪里 | 怎么做 |
|---|---|---|
| 第一层的输出 | `understand/schema.ts` UnderstandPart | 每部分：sourceQuote、clarity、`continues {kind, ref}`（接哪个开着的事项，句柄 o1…）、objectClues（指代的字 + 可选句柄 r1…）、requiredCapabilities、readFilter（时间、状态、字）。**没有**「和上一个请求的关系」这一类字段，也没有合并后的请求。 |
| 每个会话记什么 | `context/session-state.ts` | shownList（最后列的清单）、lastMentioned（**每类只留最后一条**）、openItems（问题 / 等接受的方案，含选项、问的什么、是否写入、两句不相关就搁置）、lastList（再列一次用）。**不记**卡片、已执行的写入、每一轮各提到了谁。 |
| 对话原文 | `graph/deps.loadMessages` | 最近消息的文字和回答引用的记录 id；第一层只看最近 10 条，空闲超过 60 分钟就不给。 |
| 指代 | `graph/nodes/understand.ts` graphPartsOf（句柄 → recordId）、`references/marks.ts`、`propose/resolve.ts`（代词 → lastMentioned 第一个联系人）、`graph/nodes/resolve.ts`（读记录时按名字找人，同名就问） | |
| 跟进 | `understand/read-window.ts`（只换时间）、`understand/follow-list.ts`（就刚列的清单发问）、`understand/repeat-list.ts` + route（再看一次 / 这次加上）、「那 @X 呢」 | 各自的规则，分散在各处。 |
| 回答追问 | `clarify/attribution.ts`（第一层说的 continues，代码核对）、`propose/asked.ts`（打字回答写入问题的选项） | |
| 搁置 | `graph/nodes/deliver.ts` nextSessionState | 两句不相关或空闲之后搁置。 |

## 2. 对应关系

**Agent 的状态 → 实验台 HistoryEntry。** 开关不是 legacy 时，会话状态多存一份 `conversation` 日志（`conversation/bridge.ts`，最多 30 轮）：

| HistoryEntry | 来自 |
|---|---|
| user：text / at / hint | 这一轮的消息、时刻、第一层输出转成的 ModelHint |
| agent.mentions | 这一轮新记的 lastMentioned、各部分绑定的记录、卡上改的记录和卡上关联的人（`after` 里的 contact id，名字取 `shown.names`） |
| agent.listed | 这一轮设的 shownList |
| agent.asks | 这一轮开的 clarification 事项：id = 事项 ref，options = 事项的选项（实验台 id + 标签），writes，for = 引擎对那一部分的合并请求 |
| agent.card | 这一轮冻结的卡：第一项的 capability、目标、日期类的值 |
| agent.answered | 没有追问时，引擎对第一个新部分的合并请求（新建的不算） |
| agent.done | **空**：卡是在账本里点确认的，不经过这张图，所以引擎不知道哪张卡已执行 |
| World | 只放对话里出现过名字的记录（日志、上下文句柄、事项选项），不为引擎读库；性别一律 unknown |
| gone | 上下文里标为打不开的记录 |

**第一层输出 → ModelHint。** quote = sourceQuote；clarity 照搬（multiple_readings 当 missing_one）；continues = 开着的问题的 ref（只认 clarification）；
refs = objectClues（said = 字，kind = 记录类型，id = 句柄对应的记录）；slots = 能力的类型和动作、readFilter 的时间 / 状态 / 字、绑定了的联系人。
followUp 和 pick 第一层不给，留空由引擎自己判。**「王磊那条」**：第一层常把「王磊」报成联系人；名字后面紧跟记录指示词（那条 / 那篇 / 那个 / のあの件 / 's one）时，
提示里写成整段「王磊那条」、记录类型、不绑定，人不进 slots.people。

**实验台 PartResult → Agent 做什么**（`conversation/apply.ts`，只在 on 时改；shadow 只记差别）：

| PartResult | on 时 |
|---|---|
| refs：bound | Agent 没绑定的线索拿到 recordId（Agent 自己绑定的——@ 点选、上下文句柄、代码——一律不换，影子运行里 AE-SCL-021 引擎绑错了 @ 的那篇）；没有对应线索、而这一部分要操作这类记录时补一条。纠正句只用最后那个指代（被否定的「这个」不用）。类型不同的线索（「王磊那条」里的人）不被改成记录。 |
| refs：ask / none | 不绑、也不解绑；Agent 自己的查找照旧（会问的照旧问） |
| continues | Agent 当成新请求、而引擎认为在回答某个没人接的问题时，接上那个问题；Agent 自己的归属不移、不清（影子运行里 AE-AMB-009、AE-EVT-009 引擎判得不同）。只管问题，方案和卡片仍按第一层 |
| request（合并后的请求） | 只用时间：读的部分是 repeat / swap_period / refine / adjust / follow_list / ask_again_about、自己没有时间时用引擎的时间（只在 Asia/Tokyo，引擎的日历是东京的） |
| 取消（请求为空、上一轮有卡或写入问题） | 这一部分不提写入 |
| next（ask / go） | 只记差别，追问仍由 Agent 的 clarify 决定 |
| shelved | 只记差别（规则相同：两句不相关或空闲之后） |
| redo | 引擎永远是空；Agent 不经新卡和点击不会重做写入 |

## 3. 接在哪里、怎样不出事

- `graph/nodes/understand.ts`：第一层的部分做好之后调 `conversationTurn`（shadow：比较；on：比较并改部分）。
- `graph/nodes/deliver.ts` nextSessionState：调 `conversationAfterTurn`，补上 ask / go 和搁置的差别，发 `conversation.shadow` 追踪、
  写影子记录（`rollout/conversation-shadow.ts`，集合 `agentV1ConversationShadow`，按账号分区，应答之后写），并把这一轮加进日志。
- 报告：`rollout/shadow-report.ts` 多一节「多轮理解引擎」；`scripts/agent-v1-shadow-report.ts --from-run` 从评测每例的 trace 汇总。
- 引擎是同步的纯函数，不能中途打断：输入有上限（30 轮、只含对话里的记录），跑完超过 `ORBIT_AGENT_CONVERSATION_BUDGET_MS`（缺省 400 ms）就丢掉结果按 legacy 走；
  出错同样按 legacy 走，都记 `conversation.error` / `conversation.over_budget`。单元测试里最长一次约 100 ms。
- legacy：引擎不跑，会话状态不加日志，和以前完全一样。

## 4. 已知的差距

- 性别不知道：「她 / 他」只有一个候选时引擎也是「问」，on 时不采纳（Agent 照旧绑最后提到的人）。
- 卡片执行（点确认）不经过图，日志里没有 done；取消、接续按「卡还在等」判断。
- 引擎的「问」不强制 Agent 追问；合并请求里的人、类型、主题只记差别不采纳。
