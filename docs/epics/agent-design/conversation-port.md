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
| refs：bound | Agent 没绑定的线索拿到 recordId（Agent 自己绑定的——@ 点选、上下文句柄、代码——一律不换，影子运行里 AE-SCL-021 引擎绑错了 @ 的那篇）；没有对应线索、而这一部分要操作这类记录时补一条。纠正句只用最后那个指代（被否定的「这个」不用）。类型不同的线索（「王磊那条」里的人）不被改成记录。带内容的指代（「给李薇寄样片那条」）只在绑到的记录名字和这些字有两个字以上连着相同时才采纳：引擎的 World 只有对话里出现过的记录，会把没出现过的那条绑到它唯一认识的待办上（on 全量运行 AE-XL-014；不采纳的记 `conversation.refused`）。 |
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

- 性别不知道：「她 / 他」只有一个候选时引擎也是「问」；2026-11-23 起按 R27 当作定了（§5，`ORBIT_AGENT_CONVERSATION_PRONOUN`）。
- 卡片执行（点确认）不经过图，日志里没有 done；取消、接续按「卡还在等」判断。
- 引擎的「问」不强制 Agent 追问；合并请求里的人、类型、主题只记差别不采纳。

## 5. 给引擎数据、放开的决定（2026-11-23）

负责人定：性别用方案 C（不存、不推断，代词只靠对话本身：最近提到人的那一轮只有一位 → 两种代词都定这位，R27）；先影子、看差别，再直接打开改进的那几类。

**数据**（`conversation/world-read.ts`，经 `finder/world.ts` 的 `conversationWorld`，同一个库、账号 + 工作区范围、评测拒读表、故障注入、字段白名单）：
对话提到过的联系人按 id 读（≤ 10 行，姓名、公司、职位；Agent 没有别名），再读最近那 3 位的最新待办 / 笔记 / 日程（每轮记录合计 ≤ 30 行，
每次查询按剩余额度平分）；对话里已经出现过的记录不再读（AE-SCL-021 的规矩：答过的记录下一轮不重读），活动不读。性别表永远是空的。
只在第一层之后、某一部分有 Agent 没绑定的**人**的指代时才读（`needsWorldRead`），最多再等 250 ms。

**开关**（只在 `ORBIT_AGENT_CONVERSATION=on` 时生效；shadow 下全是影子，legacy 下都不跑）：

| 变量 | 管什么 | 缺省 | 回滚 |
|---|---|---|---|
| `ORBIT_AGENT_CONVERSATION_WORLD` | 引擎的 World 用读来的数据（第二遍引擎，差别记 `world`） | shadow | `off` 连读都不读 |
| `ORBIT_AGENT_CONVERSATION_PRONOUN` | R27：引擎对光秃代词「问」且只有一位候选（不在空闲之后）→ 当作定了，走原来的「只绑 Agent 没绑的线索」 | **on** | `shadow` |
| `ORBIT_AGENT_CONVERSATION_CARRY` | 合并请求里的人：回到上一个请求的读取补上那个人；新请求去掉话里没说、引擎也不带的人 | shadow | — |
| `ORBIT_AGENT_CONVERSATION_NEXT` | 引擎的 ask / go | shadow（只记 `next` 差别） | — |

**阶段 A**（`20261123-073911-0440974-CONV-data-A-shadow`，全部影子、每轮都读，275/281）：读数据让 AE-CTX-002、AE-CTX-004（已绑定的人的关联记录）、
AE-SCL-001（闲聊）、AE-SCL-003（日程线索）的读取检查不过，而读来的 World 一个决定都没改变（`world` 的应用差为零），引擎读法只有 3 轮不同：
AE-REF-001 / 007 把 @ 选中的待办改成「问」（同名笔记进了 World）、AE-FN-009 把「小林」绑到笔记——都更差；AE-EVT-011 合并请求多了待办关联的人（对）。
所以读改成只在有没绑定的人时才读，World 留在影子。代词 3 轮全对（AE-CTX-003 she、AE-CTX-007 彼女、AE-REF-004 他 → 王强，只有最后一轮会改 Agent 的部分）→ 打开。
carry 没有一轮出现，看不出好坏 → 留影子。ask / go：引擎在 229 轮（167 例）Agent 直接回答的地方要「问」，另 5 轮（「えっと…」「你好」等）Agent 问而引擎不问，Agent 对 → 留影子。

**阶段 B**（`20261123-075703-761261a-CONV-data-B-on`，278/281）：代词 on，读改成按需（7 轮读，每轮 4–8 行，读 p50 10 ms / p95 140 ms，第二遍引擎 p50 4 ms / p95 25 ms），读取检查全过。
代词在 AE-CTX-001、AE-REF-004 两轮算出了结果，Agent 自己都已绑好，没有改动。新不过的 AE-SCL-026（单独重跑 2/2 过）、AE-XL-018（3 次都不过：第一层把两条待办当成一部分、两条都关联了王强；
发给模型的请求与基线逐字节相同）都没有经过本次放开的决定。回滚：`ORBIT_AGENT_CONVERSATION_PRONOUN=shadow`；读数据整个关掉：`ORBIT_AGENT_CONVERSATION_WORLD=off`。

**ask / go 过多要「问」**（2026-11-23，`cda4831`、`ece624b`，`conversation/bridge.ts` `runAskGo`，`conversation-next.test.ts`）：fix3 全量里引擎在 232 处 Agent 答对的地方要「问」。
原因（fix3 影子回放 205 轮，按首要原因）：World 只有对话提过的记录、第一次说到的名字 / 标题指向空 88；第一层报了引擎自己读不出来的词（first、第一、it、这个）41；「@」选中的记录（引擎不认带 @ 的字，
没标题的笔记按选中时的标签找不到）34；描述一类记录的词当成了指代（下周的活动、某位人脉、my contacts）29；新建的那条记录的标题当成了指代 7；有候选的「问」6。
修法只用在 ask / go 的比较上（记下的提示和其它决定不变）：提示只留指代；ask / go 在 deliver 用本轮库里读到、绑定、列出、给出的选项、卡片上的记录重跑引擎，绑定的词（名字、去掉「那条待办」的标题）
和不带空格的中日名字的前两个字也是这条记录的叫法；精确选中的、引擎自己找到而第一层没报的词指向空不算问的理由；代词 on 时 R27 也算。
结果：差别 238 → 82（见 RUNS.md `NEXT-fix-shadow`、`NEXT-fix2-shadow`）。剩下的 63 处引擎要问、Agent 都答对；19 处 Agent 问、引擎不问，其中有必须问的
（「えっと…」「你好」、新建同名联系人前查重、删被引用的私人活动前问关联记录怎么办）：引擎的 ask / go 只看指代，不看意图是否说清、也不看写入前的确认。**NEXT 留影子**；
另外 `ORBIT_AGENT_CONVERSATION_NEXT=on` 现在没有接任何地方（只有影子比较），要打开得先决定 on 做什么（只把引擎的「问」加在 Agent 的「答」上，从不去掉 Agent 的问题），再看剩下的 63 处。


**r10「什么时候该问」移植**（2026-11-23，实验室 41c7a53d6，`e237a62`、`c3812bf`、`ac62507`）：impl 换成 r10（新增 `impl/confirm.ts`；每个 .ts 仍是逐字节拷贝加两行头）。r10 的 next 不只看指代：
光打招呼 / 口头禅、复数代词对不上人数、分不出类型、新建日程没有日子、「往后推一推」没说推到哪，都要问；写入前要确认的（和账号里没完成的同类记录重复、和对话里做过的写入重复、
删还被别的记录连着的联系人 / 活动、改重复日程没说哪一次）也要问；第一层的 clarity 是证据：`missing_one` / `none` 一律问，`clear` / `statement` 取消只由引擎自己读指代得出的「问」。
桥接只改了测试（`conversation-next.test.ts` 的提示不再默认 `clear`，另加一条 clarity 规则的测试）。

确认要用的记录经同一个有上限的读（`world-read.ts confirmNeedsOf`、`finder/world.ts conversationWorld` 的 `confirm`）：只对**明确的写入部分**（clarity clear、指令或选择、
没有否定 / 假设 / 别的读法），只读它已绑定的目标连着的记录——给已绑定的人新建待办 / 笔记 / 日程读这个人的关联记录，删已绑定的联系人读它的关联记录，改 / 删已绑定的日程读这条日程本身（重复规则）；
先读、同样的 30 行上限、同样的范围和拒读表；没有没绑定的人时不读联系人、不读别人的记录。ask / go 在 deliver 的那次引擎用这份读来的 World。
第一版（R10-NEXT-shadow）给每个新建部分读「最新的同类未完成记录」，也读了只是可能写入的部分，打破 6 例的读取检查（AE-AMB-009/010/012、AE-CTX-005、AE-FN-010、AE-UND-010）→ 改成上面的范围。
没读的：第一次说到、还没绑定的目标；活动的出席记录和关联它的笔记（出席表一次读全，不受上限）；重复日程的例外（例外表一次读全）；私人活动 `privateEvent.*` 在桥接里没有类型，引擎不确认。

结果（`R10-NEXT-shadow-2`，281/282，只有 AE-H-008 已知；读了库的 7 例双评 6 过，AE-FN-009 是判断模型置信度波动，单独重跑 2/2 回到基线）：next 差别 81 → 31（Agent 答、引擎要问 62 → 10；Agent 问、引擎不问 19 → 21）。
引擎要问的 10 处：对或等价 4（AE-ANS-025 / 026 / 038 Agent 在回答里其实是在问是哪一位 / 什么目标，只是部分没标成等回答；AE-H-001「你好」）；错 6，而且打开都会伤人：
AE-AMB-005、AE-AMB-006（@ 选中的笔记 / 联系人「帮我看看」：第一层报 multiple_readings，Agent 按 §3.11 第 3 行做最可能的只读读法并写明怎么理解，引擎按「missing_one 一律问」去问）、
AE-SCL-021 第二轮（同样是 @ 选中的一篇）、AE-CMP-005 第三轮（打字「确认」：Agent 说明要点卡片，引擎按「不是请求」去问要做什么）、
AE-SCL-015、AE-WEB-009（「他们给我的价格」「他们官网」里的「他们」是公司，引擎按 R44 复数代词对不上人去问）。
第一版里读了最新记录时，引擎还在 AE-XL-015 / 016 / 017 按 R34 指出新建的待办和已有的「回复田中的询价」「给李薇寄样片」「约山本吃饭」重复（对），收窄读的范围之后这三处不再读到（人在理解时还没绑定）。
Agent 问、引擎不问的 21 处照旧多是引擎没有的规则（新建联系人前查重、删被引用的私人活动、@ 网页查询前问是哪位等），打开 on 也不会去掉 Agent 的问题。
**NEXT 留影子**：引擎对的不明显多于错的，而且错的 6 处都会把该直接回答的请求变成追问。`ORBIT_AGENT_CONVERSATION_NEXT=on` 仍没有接。
要打开至少要先：「missing_one 一律问」只用在写入部分（只读部分按 Agent 的最可能读法）、复数代词前面有公司 / 组织时不算人、卡片等着时打字的「确认」不算「不是请求」，这些是实验室规则，应在实验室下一轮里改。
