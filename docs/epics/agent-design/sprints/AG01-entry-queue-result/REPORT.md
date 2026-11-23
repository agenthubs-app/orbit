# Sprint AG01 — 执行总结

> Generator 的工具不允许子 agent 写这个文件，内容由 Generator 交回，协调者原样入库。

## 结果

对应 [GOAL.md](GOAL.md)。

- 已验证能做到：
  - **马上应答（AG01-1）。**`ORBIT_AGENT_V1_MODE=on` 时，协议 3 的发送只认证、去重、落库，马上回 202，带 `requestId`、接收顺序和状态（`running` 或 `queued`）。同一客户端消息键重发，回原 `requestId` 和当时的状态，只处理一次；同一个键配不同内容回 409。
  - **按顺序一轮一轮处理（AG01-2）。**同一会话一次只处理一轮，按服务端接收顺序；中途来的消息回 `queued`。多个进程抢同一会话时只有一个拿到；处理进程没了，租约到期后由下一个进程按原键接手。
  - **结果文档（AG01-3）。**按 `requestId` 读结果文档，两端一致，别的账号读不到。
  - **实时通道（AG01-4）。**SSE，或 `?after=` 的 JSON。带上次序号重连，只推其后的事件；只在通道里出现过的内容不算交付。
  - **停止（AG01-5）。**停止后不再发模型请求，在途调用被中止，迟到的结果不写进文档，排在后面的照常处理，停掉的那条消息不进下一轮上下文。
  - **开关关着（缺省）。**协议 3 回 400，其余与原来相同。
  - **结果卡片（修复轮 1）。**现有运行时的结果卡片写进了交付文本。
  - **评审项级 gate（修复轮 1）。**用例校验器、评审材料、报告都已支持。
- 仍未实现或未验证：
  - ENT-002、ENT-003、ENT-004 里关于回答内容的评审项，已按用例改动顺延到 AG03／AG05 计入（见“改动过的用例”）。
  - 处理阶段的引用与页面上下文校验只有代码路径，门槛用例没覆盖。
  - `contacts.analysis` 入口仍走协议 2。

## 修复轮 1 的诊断与处理（协调者批准）

1. **新入口的适配层丢了结果卡片（已修，`88b49cd2f`）。**
   - 现有运行时最后一步的提示词（`features/orbit-ai/gemini-provider.ts:976-977`）说，查到的记录已作为卡片显示在回复下方，不要在文字里再列。
   - 协议 2 把卡片作为 `artifacts` 返回；协议 3 的适配层原先把它丢了，回答里就没有记录。
   - 现在 `legacy-runtime.ts` 的 `cardsAsText` 把卡片的标题和字段接在回复后面，有测试。
2. **现有运行时本身的原因（不改，协调者已在 `3ea1ef612` 修订用例）：**
   - **ENT-004：**模型给 `tasks.query` 传了 `locale:"ja"`，输入校验只认 zh 和 en（`features/orbit-ai/data-query/query-schema.ts:67`）。错误被 `live-agent-runtime.ts:1246-1247` 吞掉，回复退回到计划阶段那句“確認します”（`:1788-1793`）。
   - **ENT-003 第二条：**本地多意图规则误判，“会议”加“写”被当成两件事（`live-agent-runtime.ts:489-516`，在 `:979` 调用，回复文字在 `:759`），没有调用模型。
   - **ENT-002：**模型把问题路由到 `chat.context`，联系人匹配得分 0.00，没去读笔记 M39。
3. **AG00 基线受影响。**上面三条原因在基线里得出相同的回答。另外，运行器走协议 2 时不把 `artifacts` 写进 transcript 和回答，基线评审看不到卡片里的记录。后一条列为待办，按 CONVENTIONS §8 交给 AG18。
4. **评审项级 gate 的实现（`5f29717e4`）：**
   - 用例校验器接受评审项上的 `gate`；sprint 编号未知、不是字符串、或早于这一例本身的门槛归属时报错。
   - 评审材料加了“评审项”列表，带“（从 AGnn 起计入本例结论）”的说明，并写明每一条都照常评。
   - 报告按逐条结果计算一例是否通过，不取评审写的 `overall`。在 `--gate AGx` 运行里，晚于 AGx 的项不计入，列为“已评、从 AGnn 起计入”；其他运行全部计入。

## run-01 的结论与 run-02

- **run-01：failed。**修复轮 2 的门槛 `20261115-214128-65b2ed1-AG01-gate` 双评 7/8：两位评审都判 AE-ENT-005 R1 不通过——回答正文没说“12:00”和“和田中午餐”，附上的卡片文字是内部字段原样输出（`kind: personal`、`startsAt: 2026-11-19T03:00:00.000Z`），时间是 UTC。这是 AG01 适配层 `cardsAsText` 的缺陷。两个修复轮已用完。
- **run-02（协调者决定）。**RULES §7 写的是失败后“不自动二次生成”；但当前目标是依次实现全部 sprint，而 AG02 起全部依赖 AG01。协调者据此开启 run-02，范围只限：卡片转文字时去掉内部字段、时间按用户时区显示。之后整套门槛重跑、双评。这是对规则的例外，用户可以否决。

### run-02 运行记录

- 结果：**门槛通过。**`20261115-225735-fddf242-AG01-gate` 双评 8/8，两位评审结论一致；不通过的只有顺延项 ENT-002 R1、ENT-003 R3、ENT-004 R3/R4（不计入 AG01），无 caseIssue。已登记 RUNS.md。门槛 `20261115-224854-bfd55f8` 不评，已登记为被取代。
- Generator：Claude Opus 5.5，2026-11-15。run-02 开工时 PLANNER 的 SHA-256 `4339c8f26a65c77df8623061b2a39f3e4c8b5878b2e81267958f9f181acc1875`，基线 HEAD `a1e3e2859`。
- 提交：`ba60b8128` 卡片写成用户读得懂的文字；`bfd55f813` PLANNER 登记 run-02；`fddf24241` 时间范围按时刻比较（协调者批准）。合并：等待协调者。push：无。
- 影响分析：先重建了索引。`createActorQueryInputSchema`、`createAiReadInputSchema` 在 depth 3 报 CRITICAL（约 3,100），各只有 1 个直接调用方，depth 1 为 LOW。`query-service.ts` 的函数重建索引后仍查不到，文本搜索补查：`executeActorScopedQuery` 有 2 个生产调用方（`query-artifact-service.ts`、`query-result.ts`）。`cardsAsText` 不在索引里，文本搜索只有 1 个调用方。detect-changes 风险 low。证据 `run-02/impact-*`。
- 测试：`agent-v1-entry-legacy-runtime.test.ts`（7 例）与 `orbit-ai-query-time-range.test.ts`（6 例）先写，修改前全部不通过、修改后通过；已有 data-query 测试 31/31；`tsconfig.build.json` 无错误。
- 全量对照：开工前 26 失败，现在 24 失败，新增 0（单独跑）。
- 门槛：`20261115-225735-fddf242-AG01-gate`，代码判定 8/8，真实调用 21 次，0.0278 元，`dirtyWorkingTree: false`，已 judge-pack，密钥扫描 71 个文件 0 命中；排队等待 p95 1,542 ms。
- 付费调用（累计）：DeepSeek 真实 168 次，约 0.225 元，余额 58.82。Gemini 0 次。
- 协调者复核：上述定向测试与评测测试 117 通过、0 失败（另 4 例 Postgres 排队测试接本机库单独跑 4/4）；typecheck:app 通过；读过 `instant.ts` 与两处校验改动。

### run-02 说明

1. **卡片写成文字（`ba60b8128`）。**按请求语言（zh、en、ja）写；时间用记录自己的时区，没写就用 `ORBIT_DEFAULT_TIME_ZONE`（缺省 Asia/Tokyo）。日程写“标题 · 11月19日（周四）12:00–13:00”，待办和跟进写截止时间和状态，笔记写标题和日期（没有标题取正文开头）。内部字段、编号、原始枚举值和英文分区标题不再出现。
2. **时间范围按时刻比较（`fddf24241`，协调者批准）。**run-02 的第一次门槛里，模型按 11:00–14:00（+09:00）查日程，`query-service.ts` 把存储的 UTC 字符串和带 `+09:00` 的字符串按字面比较，12:00 的午餐被筛掉。这是现有产品的真实缺陷：按时间段查询会随模型给的时区写法漏记录。新增 `features/orbit-ai/data-query/instant.ts`，两边都能解析就按时刻比较，否则保留原来的字符串比较。改了日程、待办、跟进三处范围过滤（`query-service.ts:404-405`、`:256-257`、`:334-335`），四处排序（`:125`、`:218`、`:324`、`:394`），以及两个输入校验里“开始不晚于结束”的检查（`query-schema.ts:72`、`:150`）。
3. **门槛核对。**8 份 transcript 不含内部字段；AE-ENT-005 交付“和田中午餐 · 11月19日（周四）12:00–13:00”。这次模型用的是整天范围，新的比较方式在完整对话里没被触发，靠单元测试覆盖。
4. 用例和运行器都没有改。

## 修复轮 2

- **问题（两位评审对 AE-ENT-006 的同一个 caseIssue）。**运行 `20261115-213218-5f29717` 里，`entry.started` 在 seq 45，App 的 `turn.disconnect` 在 seq 47，只隔 1 ms；第一次通道推送在约 150 ms 之后。所以 App 重连时带的是 `after: 0`，服务端从头推送是对的，但“带上次序号续传”这条路径在完整对话层面没有被检验到。
- **修法（只改运行器，用例不变，`65b2ed13b`）：**
  - 带 `while_running` 的 `disconnect`，先等这一端收到正在处理那一轮的至少一个通道事件，再断开。
  - 如果这一轮先结束，或 30 秒内没收到事件，记 `turn.disconnect_late` 并写明原因，照样断开。
  - 重连时带上最后收到的序号（Last-Event-ID）。
  - transcript 新增“实时通道重连”一节，逐次写明带上的序号、服务端用的 `after`、重连后收到的序号，以及有没有重复。
  - 评审材料的事件索引能显示 `turn.disconnect`、`turn.reconnect`、`entry.channel.open`、`entry.channel.push`、`client.channel_event`。
  - 测试：`tests/agent-eval/entry-client.test.ts` 先写，修改前不通过，修改后通过。
- **新门槛 `20261115-214128-65b2ed1-AG01-gate` 的核对（AE-ENT-006）：**
  - App 收到 #1、#2（seq 67、68）后在 seq 72 断开，断开时最后收到 #2。
  - seq 117 重连，Last-Event-ID 为 2；服务端 seq 129 `entry.channel.open after 2`，seq 136 只推了 [3]。
  - App 只收到 #3 一次，之前的事件没有重推。
  - AE-ENT-005 的 App 同样 `after=2`；Web 从一开始就离线，`after=0` 是对的。
  - 全部用例都没有出现 `turn.disconnect_late`。
- 产品代码没改，评测服务没有重建。这是最后一个修复轮。
- 这次运行的 `manifest.json` 里 `dirtyWorkingTree: true`，来自协调者当时未提交的 `RUNS.md` 和本文件（只是文档，不影响被测代码）。

## 改动过的用例（评测规范 §7；登记见 CHANGES.md，协调者 `3ea1ef612`）

- **规范 §3.3、§6：**新增评审项级 `gate`；一例是否通过由报告按逐条结果计算。
- **AE-ENT-002：**R1（Emily 会发 dashboard spec）加 `gate: AG05`。
- **AE-ENT-003：**原 R2 拆成两条：
  - R2：没有混进日程的内容，AG01 计入。
  - R3：是两条写会议纪要的技巧，`gate: AG03`。
- **AE-ENT-004：**
  - R1 拆成 R1（第一条针对待办，没有因第二条中断或改答，AG01 计入）和 R3（列出未完成的待办，`gate: AG05`）。
  - R2 拆成 R2（第二条针对明天的日程，不是再列待办，AG01 计入）和 R4（说出 11 月 16 日的团队周会，`gate: AG05`）。
- **CONVENTIONS §8 新增两行：**一是评审项级 gate；二是旧入口卡片缺口交给 AG18。
- 原有要求一条没删。

## 运行记录

- 结果：门槛等待评审（代码判定 8/8）。
- Generator：Claude Opus 5.5，2026-11-15。Planner rev 1，开工 SHA-256 `d8d21e9fadda4d0fe9d3e2b95d8cc80aa9da5577d2a5f320eda7f62d7415a60b`（后来追加了核对记录）。基线 HEAD `c891947e8`。
- 分支 `sprint/AG01-entry-queue-result` 的提交：
  - `31b3cbcb5` 协议 3 契约
  - `b960ead44` 新入口
  - `1947839a8` 停掉的那一轮不进下一轮上下文
  - `175438778` 运行器支持协议 3
  - `f201cfeb5` 预加载：被中止的调用也记 `model.response`
  - `e1cf3d546` PLANNER 追加核对记录
  - `88b49cd2f` 修复轮 1：交付卡片内容
  - `3ea1ef612`（协调者）用例与规范修订
  - `5f29717e4` 评审项级 gate
  - `65b2ed13b` 修复轮 2：处理中断开要先收到这一轮的事件
- 合并：等待协调者。档位 H。push：无。
- 全量对照：
  - 开工前 26 失败，收口 25 失败，新增 0；少掉的一条是 contract-snapshot 测试。
  - 之后的提交只改了评测代码：`tests/agent-eval` 67/67 通过，收口集 147/147 通过、0 skip，`agent-eval:check` 0 问题，`tsconfig.json` 仍是原有的 14 个错误。
- App：
  - 四个同步测试 10/10。
  - `npm ci --prefer-offline --ignore-scripts` 装了 713 个包；`package-lock.json` 的哈希不变，git 状态干净。
  - App 的 `tsc --noEmit` 有 1 个错误：`tests/ios-scene-lifecycle-config.test.ts:47`（`'entry' is possibly 'undefined'`）。本 sprint 没有改这个文件，它对 App 的改动只有三个同步副本。
- 门槛运行：

| 运行 | 代码判定 | 真实调用 | 费用（元） | 处理 |
|---|---|---|---|---|
| `20261115-214128-65b2ed1-AG01-gate` | 8/8 | 21 | 0.0288 | **修复轮 2，交评审**；已 judge-pack；密钥扫描 71 个文件 0 命中 |
| `20261115-213218-5f29717-AG01-gate` | 8/8 | 21 | 0.0282 | 修复轮 1，已双评 8/8（四条顺延项不计入）；ENT-006 的 caseIssue 引出修复轮 2 |
| `20261115-212357-88b49cd-AG01-gate` | 8/8 | 21 | 0.0289 | 已 judge-pack，被上一行取代 |
| `20261115-211014-f201cfe-AG01-gate` | 8/8 | 21 | 0.0266 | 已 judge-pack，被取代 |
| `20261115-210805-1754387-AG01-gate` | 8/8 | 21 | 0.0276 | 预加载缺记录，未交评审 |
| `20261115-210133-b960ead-dev1` | 8/8 | 21 | 0.0267 | 开发试跑，只用于调试 |

- 付费调用：
  - DeepSeek 真实 126 次。最后一次门槛的用量：prompt 80,597（缓存命中 74,368），completion 5,270。
  - 合计约 0.167 元，余额 59.03 → 58.88。Gemini 0 次；单元测试 0 次真实调用。
- 证据目录 `~/orbit-sprint-evidence/agent-design/sprint-AG01/run-01/`：
  - 测试与影响分析：`npm-test-*`、`impact-*`、`impact-text-search.txt`、`detect-changes-*`
  - App：`app-sync-tests.txt`、`app-npm-ci.txt`、`app-typecheck.txt`
  - 运行：`env-build-*`、`gate-run-1.txt`、`gate-run-2.txt`、`gate-run-3-repair1.txt`、`gate-run-4-repair1-final.txt`、`judge-pack*.txt`
  - 指标与扫描：`queue-metrics-*.txt`、`secret-scan*.txt`

## 验收结果

| SC | 结果 | 证据 |
|---|---|---|
| AG01-1 | pass（门槛待评审） | `agent-v1-entry-accept.test.ts`；`agent-v1-conversation-v3-route.test.ts`；契约快照；App 同步测试；门槛 ENT-001、ENT-002 的 `request_states` 和 `requests` 通过 |
| AG01-2 | pass（门槛待评审） | `agent-v1-entry-queue-postgres.test.ts`（本机 Postgres，0 skip，连跑 3 次稳定）；门槛 ENT-003、ENT-004、ENT-008 的 `order` 和 `request_states` 通过 |
| AG01-3 | pass（门槛待评审） | `agent-v1-entry-result-document.test.ts`；门槛 ENT-002、ENT-003、ENT-005 的 `client_view_matches_result` 通过 |
| AG01-4 | pass（门槛待评审） | `tests/services/agent-v1-entry-events.test.ts`（序号递增；`after` 之后只给其后的；SSE 带 Last-Event-ID 续传无重复；开关关着 404；只在通道里的片段判未交付）；`tests/agent-eval/entry-client.test.ts`（处理中断开要先收到这一轮的事件，否则记 `turn.disconnect_late`）。门槛 `20261115-214128-65b2ed1`：AE-ENT-006 的 App 断开前收到 #1、#2，重连带 Last-Event-ID 2，服务端 `after 2` 只推 #3，没有重复；AE-ENT-005 的 App 同样；ENT-006、ENT-007 的 `client_view_matches_result` 通过 |
| AG01-5 | pass（门槛待评审） | `agent-v1-entry-cancel.test.ts`；门槛 ENT-007、ENT-008：`turn.stop` 之后没有新的 `model.request`，在途调用标 `aborted: true` |

排队样本（最后一次门槛，12 个委托）：
- 处理中又来消息的有 3/12。
- 排队等待 p50 0 ms，p95 1,535 ms，最大 1,535 ms。
- 之前三次门槛的 p95 在 1.5 到 6.7 秒之间。

## 与 PLANNER 不同（CONVENTIONS／SPRINTS／brief 优先）

1. Generator 停在 judge-pack；评审、report 和 RUNS 登记由协调者做。
2. `requestId` 由服务端生成；协议 3 不带 `expectedMessageRevision`。
3. 结果文档只放 AG01 填得了的字段，其余字段以后以可选字段加上。
4. 委托记录共用 `orbit_agent_chat_requests`，记录编号函数移到共用模块；队列和通道事件用新集合。
5. 会话事务用 read committed 加会话级咨询锁。
6. 评测环境缺省 `ORBIT_AGENT_V1_MODE=on`，`app_old` 仍走协议 2。
7. 运行器的 `stop` 在 running 之后再等 1.5 秒才点。
8. `contacts.analysis` 入口回 400；`shadow` 按 off 处理。
9. 定向的 DB 测试用本机新建的 `orbit_agent_v1_entry_test`。
10. 修复轮 1：交付卡片内容；实现评审项级 gate（规范由协调者修订）。

## 影响分析

- 索引用 `npx gitnexus@latest`；`[id]` 目录下的路由用文本搜索补查。
- CRITICAL：
  - `emitTrace`：只是补上 requestId。
  - `buildEvalEnvironment`、`runHardChecks`：depth 1，各只有 1 个调用方。
  - `runCase`、`requestRecordId`：只在 depth 3 出现，是同名扩散。
- LOW：`createOrbitAgentConversationServiceForActor`，只加了一个可选参数。
- 修复轮 1 改了 `checkCase`、`decideCase`、`judgeRun`、`renderJudgePacket`，都只在评测代码里使用，提交前 detect-changes 风险 low。

## 假设与额外阅读

- 修复轮 1 额外读了：`data-query/query-schema.ts`、`data-query/query-reply.ts`、`agent-tools/registry.ts`、`artifact-contract.ts`，`live-agent-runtime.ts` 的边界规则与收尾部分，以及 `gemini-provider.ts` 最后一步的提示词。
- 其余见前一版：处理放在 `after()` 里；租约 30 秒、心跳 5 秒；会话消息只作下一轮的上下文。

## 未完成与待办

1. 旧入口卡片缺口：运行器协议 2 路径（`app_old`）的 transcript 和回答里没有 `artifacts`。按 CONVENTIONS §8 交给 AG18，在第一个用到 `app_old` 的门槛（CMP 区）之前补上。
2. 顺延的评审项由后续门槛收：
   - ENT-003 R3 在 AG03 的门槛运行里计入。
   - ENT-002 R1、ENT-004 R3 和 R4 在 AG05 的门槛运行里计入。
   - 这需要 AG03、AG05 的门槛把 ENT 区一并跑上。
3. App 测试文件 `tests/ios-scene-lifecycle-config.test.ts:47` 有一个 typecheck 错误，与本 sprint 无关。

## 交接（给 AG02）

- **入口**（`features/agent-v1/entry/service.ts`）：`acceptMessage`、`getRequestResult`、`cancelCurrentRun`、`listSessionEvents`、`kickSession`、`maybeResumeSession`、`createStoppableFetch`。
  - 依赖 `AgentEntryDependencies = { store, execute, sessions?, now?, schedule?, leaseMs?, heartbeatMs?, workerId? }`。
  - AG03 只需替换 `execute`；现在用的是 `createLegacyRuntimeExecutor`，它会附上卡片内容（`cardsAsText`）。
- **HTTP**（`features/agent-v1/entry/http.ts`）：`handleAgentV1Send`、`readAgentV1RequestDocument`、`handleAgentV1Events`、`handleAgentV1Cancel`、`configuredAgentEntryDependencies`。
- **存储**（`features/agent-v1/entry/store.ts`）：
  - 委托记录在 `orbit_agent_chat_requests`，`protocolVersion = 3`，`targetType = agent_v1_session`。
  - 队列 `agent_v1_session_lanes`，事件 `agent_v1_session_events`。
  - `requestId = agentRequestIdFor(actorId, sessionId, clientMessageId)`。
- **契约**：`shared/contract/agent-v1.ts`，校验在 `shared/api-schema/agent-v1.ts`。以后加字段一律写成可选。
- **开关**：`features/agent-v1/entry/mode.ts`。
- **追踪**：`runWithTraceContext({ requestId }, fn)` 内的事件都带 `requestId`。入口事件有 `entry.accepted`、`entry.replayed`、`entry.queued`、`entry.started`、`entry.finished`、`entry.cancelled`、`entry.discarded`、`entry.model_call_refused`、`entry.channel.open`、`entry.channel.push`。
- **评测**：
  - `tests/agent-eval/lib/entry-client.ts` 负责两端的通道、按 requestId 读回和等待。
  - 判定：`request_states`、`order`、`client_view_matches_result`、`request_status`。
  - `Observation.entry`。
  - 评审项级 gate：`judging.ts` 的 `countedRubric` 和 `decideCase({ deferred })`。
- **回退**：开关设 off 即回到原行为。
