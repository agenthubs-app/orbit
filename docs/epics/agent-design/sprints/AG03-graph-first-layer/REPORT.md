# Sprint AG03 — 执行总结

## 结果

对应 [GOAL.md](GOAL.md)。

- 已验证能做到：
  - **一句话拆成几件事，各有去处（AG03-1、AG03-2）。**
    - `ORBIT_AGENT_V1_MODE=on` 时，新入口的每条消息由 LangGraph 图处理：`intake → understand → route → answer → deliver`。
    - 第一层（主模型一次调用）把本轮原话拆成子目标，只给出所需能力、数据来源、交付物、清晰程度、限定和依赖。
    - `verdict`、`route`、`waitReason` 由代码 `decideRoute()` 按设计稿 §3.1 和附录 A 算出；模型自带的这类字段被丢弃并记事件。
    - 门槛里的例子：
      - “田中访谈＋Acme 价格＋日本市场调研”拆成三件：前两件由 Orbit 承接（读取、联网），第三件建议交给用户自己的 Codex 或 Claude。
      - “深度尽调，再据此写三条要点”：后一件等前一件。
      - 读另一位用户的笔记：说明没有授权，不建议绕道。
      - “一直找下去”：改成定期留意 Orbit 活动目录，等用户接受。用户回一句“好”，只记下接受了哪一版方案，不调决定接口、不建规则。
    - 每件事的原话引用都是本轮原句的子串。“先别改”“don't add”“もし…”和转述别人的命令都不会落到写入。
  - **普通讨论一次调用直接回答（AG03-3）。** 第一层判定为普通讨论、代码也认定每件都是讨论时，直接展示它给的回答，不再调第二次。整个流程除 `intake` 核对 @ 联系人外不读业务记录，也不出写入提议。
  - **上文四样（AG03-4）。**
    - 第一层只看四样：最近 10 条消息（只有文字，长回答截短但保留它引用的记录编号）、未结事项、上一份清单、每类最近提到的一条。
    - 模型看到的是 r1、o1 这样的短编号，代码再换回记录编号。
    - 空闲超过 60 分钟后，前三样不给模型；“上次提到的那位”只留给代码，作追问的第一候选。
    - 记录正文不进上文。只有本轮原话能产生子目标，引用旧消息的子目标被校验拒收。
    - 会话级状态（上一份清单、最近提到的、未结事项）存在新集合 `agent_v1_session_states`。
    - 检查点只放引用和进度：线程编号是 `requestId`；状态里是子目标在原话里的起止位置、去向、状态和绑定的记录编号，没有原话、上文、模型输出。
  - **修复一次，预算由代码守（AG03-5）。**
    - 输出不合规时，把错在哪告诉模型，修复一次；仍不合规就如实说这次没处理成。
    - 调用失败（超时、5xx）用同一个“再试一次”的名额。
    - 每进模型节点先核对本轮已用次数。默认上限 4（`ORBIT_AGENT_MODEL_CALL_LIMIT`），部署侧更低的值优先。
    - 到上限就交付代码已定的部分；没做完的写明“这一轮的处理次数用完了”。
    - 单次调用 15 秒超时。
  - **其他交付。**
    - `models/main.ts` 显式用 DeepSeek，调用名取 `ORBIT_DEEPSEEK_MODEL`，未设时 `deepseek-flash`。`gemini-provider.ts` 的默认名同时改为 `deepseek-flash`，活动运营、会后产物两处随之改变。
    - 代码定的去向用中日英固定文案：外部 Agent、无权限、替代方案、这一版还做不了、等前一件、追问、次数用完。文案复述用户原话和绑定对象的名称，不编内容；无权限一句不复述原话，免得把另一账号的记录名带进回答。回复语言按本轮原话定。
    - 结果文档的每个子目标带 `sourceQuote`、`verdict`、`route`、`waitReason`、`reason`。契约里都是可选字段，App 副本已同步。
    - 有子目标等用户时，委托记为 `waiting_user`，会话队列照常往下走。
  - **两项遗留。**
    - `--gate AGx` 也跑带 `gate: AGx` 评审项的用例；AE-ENT-003 因此进本门槛，R3 计入。
    - 运行器对重发点击按服务端应答记为 `accepted: true, replayed: true`，`decisions` 只数一次。
- 仍未实现或未验证：
  - 读取、联网、写入提议这一版都还没有。这类子目标去向已定，回答写明“这一版还做不了”，状态 `unfinished`，分别留给 AG05、AG09、AG06。
  - 追问只有最小版：
    - 要写入但缺对象时问一句，候选只取会话里记下的对象。
    - 没被回答、又来两条无关消息后，从未结事项里搁置并记事件。
    - 但已交付的旧委托文档里那个子目标不会回头改成 `unfinished`。
    - 点选、恢复、`optionsFor()` 在 AG04。
  - 替代方案的文案在没有活动线索时读起来生硬（AE-UND-011：“与「帮我找…满意为止。」相符的内容”）。

## 运行记录

- 结果：**completed**。门槛 `20261116-011123-b685349-AG03-gate` 代码判定 39/39，两名评审各自 38 过 1 不过，不过的那一项是 AE-ENT-003 R1（`gate: AG05`，不计入本门槛）；报告按逐条结果算出 39/39（见文末协调者复核）。
- Generator：Claude Opus 5.5，2026-11-16，run-01。Planner rev 1。
  - 开工 SHA-256 `0d50396d8b55d62b8accc3b8b2b0ad84951078043ccd29921601d5471f41e8f1`（末尾追加了启动核对记录）。
  - 基线 HEAD `c0b7bd8e5`。
- 分支 `sprint/AG03-graph-first-layer` 的提交：
  - `b2c1d2271` 依赖：
    - `@langchain/langgraph` 1.7.4、`@langchain/langgraph-checkpoint-postgres` 1.1.3、`@langchain/core` 1.3.7，均锁定版本。
    - core 选 1.3.7：1.4.x 要求 zod ^4.6.6，会把应用的 zod 从 4.5.4 抬到 4.6.7。
    - 间接依赖 `@langchain/langgraph-checkpoint` 1.2.2、`@langchain/langgraph-sdk` 1.16.0；lock 只有新增。
  - `d223fde79` 图与第一层（AG03-1～5），契约与 App 同步
  - `c03d5e8f5` 评测运行器（新判定词、`--gate` 扩展、重发记录、会话与设置、预加载）
  - `9a7d01aab` 用例改动（待协调者确认，见下）与 PLANNER 追加
  - `b68534930` 修复轮 1
- 合并：等待协调者。档位 H。push：无。
- 门槛：

| 运行 | 代码判定 | 真实／模拟调用 | 费用（元） | 处理 |
|---|---|---|---|---|
| `20261116-011123-b685349-AG03-gate` | 39/39 | 55／3 | 0.1110 | **修复轮 1 之后的整套重跑，交评审**。已 judge-pack（39 份，每份两评）；`dirtyWorkingTree: false`；打印的 bundle `d6931722f81e`；密钥扫描 319 个文件 0 命中 |
| `20261116-010334-9a7d01a-AG03-gate` | 38/39 | 59／3 | 0.1222 | 第一次门槛。AE-UND-014 的 `parts` 不通过：上限 1 次，第一层输出里有一条 `entity: "text"` 的线索被校验拒收，没有修复的额度。未交评审，被上一行取代 |

- 开发运行（只用于调试，不交评审）：
  - `20261116-004847-c0b7bd8-dev1`：8 例，0.0280 元
  - `20261116-005156-c0b7bd8-dev2`：整个门槛，34/39，0.1133 元
  - `20261116-010038-b2c1d22-dev3`：6 例，0.0453 元
  - `20261116-011031-b685349-dev4`：4 例，0.0187 元
- 付费调用：
  - DeepSeek 真实 212 次（dev1 12、dev2 57、dev3 22、门槛 59、dev4 7、门槛 55），合计约 0.339 元；余额 58.64 → 58.28。
  - 交评审的门槛用量：prompt 91,612（缓存命中 79,232），completion 24,249。
  - 判断模型、联网 0 次。单元测试 0 次真实调用，模型都经 `fetchImplementation` 桩。
- 全量对照：
  - 开工前 8341 例，24 失败。
  - 收口时（在最后一次代码改动 `b68534930` 之后跑）8400 例，24 失败，是同一批，新增 0。
  - skip 多 1 例，是 Postgres 检查点测试，没有库变量时跳过。
- Postgres 测试：带 `ORBIT_LIFECYCLE_TEST_DATABASE_URL`（本机 `orbit_agent_v1_entry_test`）单独跑，检查点测试和入口队列测试 5/5，0 skip。
- 证据目录 `~/orbit-sprint-evidence/agent-design/sprint-AG03/run-01/`：
  - 测试：`npm-test-before*`、`npm-test-after*`、`npm-test-new-failures.txt`（空）、`red-*`（先写的失败测试）、`postgres-tests.txt`
  - 影响分析：`impact-*`、`detect-changes-*`
  - App：`app-sync-tests.txt`、`app-typecheck.txt`
  - 运行：`env-build-*`、`seed.txt`、`dev*-run.txt`、`gate-run-1.txt`、`gate-run-2-repair1.txt`、`judge-pack.txt`、`secret-scan-gate.txt`

## 验收结果

| SC | 结果 | 证据 |
| --- | --- | --- |
| AG03-1 | pass（门槛待评审） | `tests/agent-v1/understand-validate.test.ts`：三件事各是原句子串，只规整首尾空白；非子串与旧消息里的话被拒；否定留在 `constraints`；成环、自依赖、未知依赖被拒；编号只能是上文给的；代码定的字段被丢、批准标志被拒并记事件；无效线索丢弃、普通讨论空子目标补成一件。门槛 UND-001（`parts_split` 3 个、verbatim）、002、003、008、010 |
| AG03-2 | pass（门槛待评审） | `tests/agent-v1/route-decide.test.ts`：附录 A 表驱动 14 行；模型自带结论被丢弃；依赖未完成即等待；接受替代方案优先于“一直找”；文字接受替代方案记下 `acceptedAlternativeRef`，0 卡片、0 决定、不说已建好。门槛 UND-001、004、006、007、008、009、011、012 |
| AG03-3 | pass（门槛待评审） | `tests/agent-v1/graph-flow.test.ts`：普通讨论模型桩计数 1、`deepseek-flash`、JSON 输出、读取 0、写提议 0；代码判定不是讨论时不展示第一层的回答；经入口时子目标进结果文档、`waiting_user` 不挡队列；AG02 边界仍在外面，已有卡时写入项等点击；开关关着协议 3 返回 400、图不运行。门槛 UND-005、006、SCL-001 |
| AG03-4 | pass（门槛待评审） | `tests/agent-v1/first-layer-context.test.ts`：10 条、长回答截短留编号、59／61 分钟两侧、按清单与最近提到的解析“第二个”“他”、正文不进上文、旧请求不成子目标、两条无关消息后搁置、内存检查点无正文。`tests/agent-v1/graph-checkpoint-postgres.test.ts`：本机库 `agent_v1_graph` 模式里的检查点、写入、blob 没有原话、上文、目标描述和名字，只有引用。门槛 CTX-001～005、007，SCL-001～003 |
| AG03-5 | pass（门槛待评审） | `tests/agent-v1/graph-budget.test.ts`：修复一次后用修复结果；仍不合规不调第三次，如实说没处理成；调用失败重试一次，再失败如实说；上限 1 时外部建议照常交付、讨论项写明次数用完；默认 4、部署值更低优先；超过上限不发请求；15 秒超时。门槛 UND-013、014 |

- 收口集：
  - 五个 PLANNER 测试文件，加 `graph-checkpoint-postgres`、`tests/agent-eval/*.test.ts`，共 131 例，0 失败。
  - PLANNER 列的提供方与活动测试、AG01 入口测试都在全量里，不在新增失败中。
- 类型检查：`tsc -p .` 只有原有的 `redesign-pixel-lib.test.ts` 与 orbit-app 无依赖的错误。
- App：`npm run sync:contract` 写出两个副本，四个同步测试 10/10，`tsc --noEmit` 只有原有的 `tests/ios-scene-lifecycle-config.test.ts:47`。
- 契约快照 `node scripts/contract-snapshot.mjs --write` 只增。有一处已有联合类型的成员顺序变了，取值不变（与 AG02 同一处）。
- 种子：改动后重跑了 `agent-eval:seed`，三份快照重写；`env --build` 自检 19 项通过。

## 改动过的用例（评测规范 §7；登记见 CHANGES.md）

1. **规范 §3.3** 补一句运行器行为（协调者交代）：`--gate AGnn` 也跑带 `gate: AGnn` 评审项的用例；其中晚于 AGnn 的评审项照样不计入，早于它的照常计入。
2. **AE-ENT-003 R1 加 `gate: AG05`。**
   - 新入口从 AG03 起由图处理，图在 AG05 之前不读业务记录，“明天有什么日程”只能说这一版还查不了（dev1 的 transcript）。
   - AG01 时这一条靠旧运行时的日程查询通过。
   - 与 ENT-002 R1、ENT-004 R3/R4 同样顺延到 AG05。R3（两条会议纪要技巧）仍在本门槛计入。
3. **AE-BND-008 补 `card_ops`**（`todo.create`，标题「見積書のドラフトを見直す」，计划日 2026-11-18），与 AE-BND-001 的处理相同。
   - BND ×12 作为不变量进本门槛，AG06 之前唯一的出卡途径是 `--seed-cards`，而 008 没有可预置的内容。
   - dev1 里它没有卡可点，`decisions`、`decision_result`、`card_state` 不通过。

如果协调者不接受 2 或 3，对应的一例在本门槛不通过。原因是 AG05 或 AG06 的能力，不是 AG03 的缺陷。

## 与 PLANNER 不同（CONVENTIONS／SPRINTS／brief 优先）

1. **门槛用例**：按 SPRINTS.md 是 UND ×14、CTX ×6、SCL ×3（CTX-006、008 已顺延到 AG04），加不变量包 BND ×12、H ×3，再加 ENT-003，共 39 例。
2. **`--seed-cards`**：CONVENTIONS §3 写“只给 AG02 用”，但 BND ×12 在不变量包里，AG06 之前只有预置这条出卡途径，所以本门槛也加了。需要协调者确认并改 CONVENTIONS 的写法。
3. **`model.request`／`model.response` 由预加载记**，带 `source`，现在还带 `node`。产品侧不再重复发，否则 `model_calls_max` 会数两遍。产品侧记 `budget`、`model.failed`、`understand.prompt`、`understand.invalid`、`understand.fields_dropped`、`context.built`、`first_layer.handoff`、`node.enter`／`node.exit`、`open_item.shelved`。
4. **附录 C 之外加了两个可选字段**：`dataOwner`（`other_user` 时无权限）和 `persistence`（`until_satisfied` 时给替代方案）。附录 C 没有这两种信号，代码又必须据此定去向。
5. **重试**：调用失败（超时、429、5xx）也给一次机会，与“修复一次”共用同一个名额，仍在 4 次之内。dev2 里 AE-UND-008 的第一层调用 15 秒超时，没有这一条就整句作废。
6. **评测端口** 3110（CONVENTIONS §2），不是进入条件里的 3100。
7. **故障点 `understand`** 由预加载按调用所在的节点注入，产品代码里没有新的故障入口。
   - 同一位置再布一个故障时，前一个 `*_always` 结束；这样 AE-UND-013 第二轮的 `malformed_once` 才生效。
   - 预加载的 `malformed_*` 应答补上 `finish_reason: stop`；否则 DeepSeek 适配器把它当成调用失败，测不到“输出不合规”。
   - `model-budget-1` 经预加载的每例设置交给产品的 `evalSetting()`，生产构建里不存在。
8. **测试顺序**：
   - 两项遗留（`--gate` 扩展、重发记录）和新判定词，先写失败测试（`red-*.txt`），再实现。
   - 图和第一层的五个测试文件是在第一版实现之后写的，没有逐项看到红灯。
   - 之后的行为改动（替代方案优先、空子目标、无效线索、重试）先补测试再改。

## 影响分析

- 用 `npx gitnexus@latest analyze --index-only` 刷新索引后，对要改的符号跑了 upstream impact（证据 `impact-*.json`）：
  - HIGH：
    - `processRequest`（9，经 `kickSession` 到发送、停止、读取各路由）
    - `runWithTraceContext`（9）
    - 改动只是读执行结果里新的可选字段，追踪上下文多一个可选的 `node`。
  - CRITICAL：`emitTrace`（39）。只在上下文带 `node` 时多写一个字段。
  - LOW：`configuredAgentEntryDependencies`、`selectCases`、`runCase`、`takeEvalFault`、`AgentTraceContext`。
  - UNKNOWN，用文本搜索补查：
    - `DEFAULT_DEEPSEEK_ORBIT_AGENT_MODEL`（常量，索引不记读）：`gemini-provider.ts:425`、`events/post-event-artifact/provider-config.ts:27`、`events/event-operations/ai-provider.ts:682`，三处都是“环境变量没设时”的默认值。
    - `waitIdle`：不在索引里，只有 runner 两处调用。
  - 新加的函数在建索引之后才有，没有 impact；它们只被本 sprint 的新文件调用。
- detect-changes（staged）：提交 1、5 没有命中已索引的符号；提交 2、3、4 风险 low，受影响流程 0。

## 假设与额外阅读

- 额外读了：
  - 入口的 `store.ts`（`finish` 怎样处理新状态）、`entry-client.ts` 的 `waitIdle`
  - 预加载的故障与改写
  - `seed.ts` 的会话写入、`bulk-generator.ts` 的对话生成、`world.ts` 的增量
  - `live-record-store` 与 `configured-live-record-store` 的接口
  - 联系人详情契约（取名字）、`legacy-runtime.ts` 的历史读取
  - LangGraph 与 Postgres 检查点的 d.ts
- 选择：
  - **图与检查点。** 图按请求编译，节点闭包持有原话、上文和模型输出；检查点里只有状态。检查点表在本机库的 `agent_v1_graph` 模式里，由检查点自己的 `setup()` 建。生产库目前没有这些表，`mode=on` 上线前要按发布规则另行授权；未在任何远程库执行。
  - **回答排列。** 结果文档的回答按子目标在原话里的先后排列，一件一段。
  - **回复语言。** 有假名为日语，有汉字无假名为中文，其余英文。
  - **引用。** 只认 @ 联系人；活动、笔记引用到 AG05 才授权。运行器发消息时也只带联系人引用，其余记为“步骤不受支持”。
  - **读取怎么算。**
    - 运行器把 `connection:<编号>` 的读取算作同编号联系人的读取：种子用 `initializeAcquiredRelationship` 同时写联系人和关系，核对 @ 联系人会读到关系记录。
    - 会话本身（`conversation` 夹具）的读取不算业务读取。
  - **种子。** 给夹具对话的消息存 `recordRefs`（`<类型>:<产品编号>`），并经产品的会话状态存储写入 `shownList`、`lastMentioned`。`openItems` 暂无夹具用到，有就记缺口。
  - **提示词改动。** 三处都按设计稿 §3.11 的定义写成通用规则，没有写进用例的原话：
    - dev2 发现的两处：普通讨论时 `parts` 为空、清晰程度 `none` 的含义。来自 val 组的 AE-CTX-003 与 dev 组的 AE-SCL-003。
    - 修复轮 1 的“谢谢、寒暄是陈述”：来自 val 组的 AE-CTX-005，起因是我上一轮对 `none` 的改动。
  - **修复轮 1 的回答提示词。** 加了“不在文字里请用户确认改动”。

## 未完成与待办

1. 需要协调者决定：上面两项用例改动（ENT-003 R1、BND-008）；CONVENTIONS §3 里 `--seed-cards` 的写法。（已决定：都保留，见文末协调者复核。）
2. 追问搁置后回写旧委托文档里那个子目标的状态，留给 AG04。
3. 替代方案没有活动线索时的文案（AE-UND-011）可读性一般，AG04 做可点方向时一并改。
4. 生产库的检查点表需要单独授权建立；在此之前不能在生产打开 `ORBIT_AGENT_V1_MODE=on`。
5. 第一层用的是 DeepSeek 默认的思考模式，调用多为 3～6 秒，dev2 里有一次超过 15 秒。需要时再评估关闭思考或调整超时。

## 交接（给 AG04、AG05 起）

- **图**（`features/agent-v1/graph/`）：
  - `buildAgentGraph(scope)`、`runAgentGraph(deps, input)`；节点在 `graph/nodes/`。
  - 状态 `AgentGraphState`（`graph/state.ts`）。子目标 `GraphPart` 只存原话起止位置、去向、状态、`refs`（记录编号）、`continues`。
  - 新节点（`clarify`、`probe`、`propose` 等）在 `build.ts` 加边；每个节点用 `traced()` 包一层。
- **依赖**（`graph/deps.ts`）：`authorizeReferences`、`loadMessages`、`sessionState`、`checkpointer`、`fetchImplementation`、`now`、`modelCallLimit`。测试用 `tests/agent-v1/graph-kit.ts`。
- **入口接线**：`graph/executor.ts` 的 `createGraphExecutor(mode, overrides)`，外面仍是 `runWithConfirmBoundary`。执行结果可带 `partResults` 和 `status: "waiting_user"`。
- **第一层**：
  - `understand/schema.ts`（`UnderstandOutput`，含 `dataOwner`、`persistence`）
  - `understand/validate.ts`（`validateUnderstandOutput`、`parseModelJson`）
  - `understand/prompt.ts`（版本 `understand@ag03.3`、`answer-discussion@ag03.3`）
- **去向**：
  - `route/capabilities.ts`（附录 A）
  - `route/decide.ts`（`decideRoute`、`statusForRoute`、`settleDependencies`、`NOT_YET_ROUTES`）。AG05、AG06、AG09 交付读取、写入、联网时，从 `NOT_YET_ROUTES` 去掉对应去向。
  - `route/handoff-copy.ts`（中日英固定文案、`replyLanguage`）
- **上文**：`context/build.ts`（`buildFirstLayerContext`，10 条、60 分钟）；`context/session-state.ts`（集合 `agent_v1_session_states`，`NamedRecordRef`、`SessionOpenItem`）。
- **模型**：`models/main.ts` 的 `callMainModel`（预算、15 秒、节点进追踪上下文、失败带 `retryable`）、`modelCallLimit`。
- **评测**：
  - 判定 `parts_split`、`part_plan`、`parts`、`routes_absent`、`first_layer_context`、`context_messages_max` 读 `Observation.firstLayer`；`clarifications` 也数结果文档里的 `awaiting_clarification`。
  - 预加载：事件带 `node`；`state.settings` 经 `__orbitAgentEval.setting()` 给产品。
  - `conversation: <夹具>` 和增量里的对话都接着已存的会话说。
- **回退**：`ORBIT_AGENT_V1_MODE=off` 时协议 3 返回 400，旧入口不变。

## 协调者复核（2026-11-16）

- **评审**：两名独立评审（Claude Opus 5.5 新会话，N=1、N=2）各自评了 39 例，都是 38 过、1 不过、0 不确定，没有记 `caseIssue`。不过的都是 AE-ENT-003 R1：问明天的日程，只得到“这一版还查不了记录”，没说出 11 月 16 日 10:00 的团队周会。这一项 `gate: AG05`，不计入本门槛，`judged.json` 里记为“R1 已评（fail, fail），从 AG05 起计入”。R2、R3（会议纪要技巧，`gate: AG03`）两评都过。
- **报告**：`agent-eval:report --judges 2 --append-runs` 算出 39/39，已追加进 RUNS.md；第一次门槛 `20261116-010334-9a7d01a` 手工补了一行“未评”。
- **用例改动**：ENT-003 R1 顺延到 AG05、BND-008 补 `card_ops` 两处确认保留，CHANGES.md 追加了确认行；CONVENTIONS §3 的 `--seed-cards` 改为 AG02～AG05 使用，§8 登记了这一条和“AG03～AG04 新入口不读记录”。
- **复跑**：
  - `tests/agent-v1/*.test.ts` 与 `tests/agent-eval/*.test.ts`，带本机 `ORBIT_LIFECYCLE_TEST_DATABASE_URL`：133/133，0 skip。
  - `agent-eval:check`：222 例，0 问题。
  - `typecheck:app`：退出码 0。
  - 全量 `npm test`（en_US）：8400 例，24 失败，与 AG02 合并时的 24 条名字逐条相同，新增 0。
- **检查点连的库**：`graph/checkpointer.ts` 用产品同一套 `resolveLiveDatabaseConnectionConfig()`，评测环境是本机库。若在指向远程库的环境里打开 `ORBIT_AGENT_V1_MODE=on`，第一次请求就会由 `setup()` 在那个库里建 `agent_v1_graph` 模式，所以未完成第 4 条在发布前必须先处理；默认开关是关的。
- **交给 AG04 的一条**：评测规范 §3.3 说顺延的评审项要在报告里列为“已评、从 AGnn 起计入”，现在只写进 `judged.json`，运行目录的 `report.md` 里看不到。AG04 在报告命令里补上，先写测试。
