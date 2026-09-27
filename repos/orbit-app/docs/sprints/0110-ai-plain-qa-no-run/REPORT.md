# Sprint 0110 执行报告：普通问答不再写运行记录（AI A2）

**run-01**。Generator 为子代理，报告由协调者代存。分支 `sprint/0110-no-run-records-for-chat`，基线是 `85fa19b32` 加开工提交 `e5cbc02f1`。功能提交为 `9096a650e`，没有推送，也没有合并。Planner SHA256 为 `be244bb6…0d4d97`。

**状态：completed。** SC-01、02、03、05 通过。SC-04 有一处契约和事实不符：Planner 说"每次问答都会整类计数"，实际上这段读取只在开发用的 trace 接口里，生产上根本不走。读取我已经去掉，详见 SC-04 一行和第 9 节第 1 条。

## 1. 结论
- **普通问答只写一条请求记录。** 响应里不再有 `runId`；运行记录、步骤记录、统计记录都不增加。请求记录照旧保存计时，只是不再挂到任何运行上（`target_type` 为空）。
- **带动作的问答照常。** 运行记录、步骤、动作、请求记录挂到运行上、状态卡的步骤（由计时拼出）、Agent 账本、确认执行、撤销，都和原来一样。
- **全部统计记录已停写。** 包括运行时服务里 14 处、「查看」路由 2 处、事后跟进工作流 2 处。`recordAnalytics`、`saveAnalyticsEvent`、`recordCompletedRun` 和统计相关类型一并删掉；存量行保留，交给 0111。
- **反馈接口按决定 5 处理。** 代码和设置页入口都没改。普通问答能拿到的任何编号（请求编号、回复消息编号）提交反馈都返回 404，也不写库；带动作的运行和改前留下的旧普通问答运行照常能提交反馈。
- **trace 不再为数条数读整类数据。** 集合列表照旧给出，但 `recordCount` 改为可选，远端集合不再填，`operation` 改为 `skipped`。
- **读取上限棘轮 157 → 156。**

## 2. 逐项验收
| SC | 结果 | 证据 |
|---|---|---|
| 01 普通问答只多一条请求记录 | 通过 | 真库测试先 RED 后 GREEN。运行时：DeepSeek 真问 1 次、App 真问 1 次，前后行数只有 `orbit_agent_chat_requests` 加 1，`runId` 为 null |
| 02 等回复的时间里不再有写运行记录的往返 | 通过（本机数据库太快，墙钟差看不出来） | 同一句本地拦截的问题，改前改后各问 10 次。小票：40 查询 / 31 行 / 43,673B 变成 39 / 30 / 41,732B，少的正是那次写运行记录。`orbit-service` 中位数 12.7ms 对 14.8ms，属于噪声范围 |
| 03 带动作的问答不变 | 通过 | 真库路由测试：运行、步骤、动作、请求记录各加 1，统计 0；状态卡 200；确认后执行完成、账本可见。运行时：真实提醒请求 → 网页「建议与行动」确认执行 → 执行完成、回执完成 → App All Actions 显示「已完成」，点撤销后变成「已撤销」 |
| 04 每轮不再有整类计数读取 | 通过，契约前提有误 | 真库读取计量：改前 10 查询 / 90 行 / 49,530B（随数据量增长），改后 0 / 0 / 0。产品路径 `POST /api/ai/conversations` 从来不调这段代码（GitNexus 显示只有 `traceMessage` 调它；唯一入口是 `/api/dev/orbit-ai/trace`，生产环境返回 404），所以生产小票上看不到下降 |
| 05 统计全停、两端全量、typecheck、棘轮 | 通过 | 见第 5 节 |

## 3. 设计取舍
1. **直接删掉 `persistConversationRunTrace`**，路由直接用执行结果。动作运行和工作流运行的 `runId` 由它们自己的路径给出。
2. **运行详情接口不改代码。** 普通问答没有运行编号，没有东西可查；随便造一个编号去查，会落到旧的 provider-run 分支，和查任何不存在的运行一样。改前写下的普通问答运行照常返回 200，步骤由请求记录的计时拼出（有测试）。
3. **`AgentRuntimeServiceOptions.id` 保留但不再使用**，加了注释。它原来只用来给统计事件起编号；为了不去改 6 个测试调用点，没有删它。
4. **统计集合的常量 `agentAnalyticsEvents` 保留**，注明只剩存量、0111 负责删除。

## 4. 文件与提交
- **提交**：`9096a650e` feat(orbits): plain AI answers write only the request record; stop analytics writes and the trace's count scan (0110)
- **源码**（`repos/orbits/` 下）：
  - `app/api/ai/conversations/route.ts`
  - `app/api/agent/actions/[id]/view/route.ts`
  - `features/agent/runtime/{contract,repository,service}.ts`
  - `features/agent/storage/agent-runtime-live-record-provider.ts`
  - `features/orbit-ai/workflows/post-event-followup-v1.ts`
  - `features/orbit-ai/live-conversation-trace.ts`
  - `features/orbit-ai/trace-contract.ts`
- **测试和基线**：
  - `tests/services/agent-run-trace-postgres.test.ts`：新增 7 条，改写 3 条
  - `tests/capabilities/orbit-ai-live-trace-store.test.ts`：契约改为「不扫描」
  - `tests/capabilities/agent-chat-known-workflow-route.test.ts`：普通问答不再有 `runId`
  - 两个测试里的 runtime 桩去掉 `recordCompletedRun`
  - `tests/audits/unbounded-list-reads.baseline.json`：−1，附历史说明
- **没有提交的**：`repos/orbits/next-env.d.ts`（构建自动改的）、全部 `codex-review.md`。原有 stash 没有动。

**新测试及各自证明的内容**（真库，先 RED：换回旧源码跑，14 条里 7 条失败，都是预期的原因）：
1. 普通问答只写请求记录，不写运行、步骤、统计，也没有 `runId`（RED：旧代码返回了 `run:conversation:…`）。
2. 普通问答暴露出的所有编号提交反馈都返回 404，不写反馈行；动作运行能正常提交反馈，作为正向对照（RED：旧代码返回 200）。
3. 带动作的问答：运行、步骤、动作、请求记录各加 1，请求记录挂到运行上，状态卡步骤包含计时，确认执行后完成，账本可见，统计 0（RED：统计多了 2 行）。
4. 查看、推迟、拒绝、取消都不写统计，动作本身照常写（RED：多了 16 行）。
5. 「查看」路由：返回 `{recorded:true}`，会前简报照样标记已查看，不写统计；不存在的动作返回 404（RED：多了 2 行）。
6. 事后跟进工作流照常写运行和动作，不写统计（RED：多了 9 行）。
7. trace 不做任何集合读取，只列出集合、不带条数（RED：10 查询 / 90 行 / 49.5KB）。
8. 回归保护，改前改后都通过：改前的普通问答运行仍能经接口读出，形状不变，步骤带耗时；库里有旧统计行时账本和反馈照常；B 账号读不到 A 的旧运行。

## 5. 全量、typecheck、棘轮、Postgres
- **orbits `npm test`**：5221 条，4728 通过，**0 失败**，492 跳过。棘轮文件里「对话会话 provider 5 > 4」一项是已登记、交给 0112 的待办，不计入失败。
- **App `npm test`**：3718 条，3717 通过，1 条失败，是 `tasks-unification-interactions`「suggestion next page…」。这是 0103 就登记过的不稳定用例；按全量同样的参数单独跑 3 次都是 19/19。本 Sprint 没改 App 代码。
- **typecheck**：orbits `typecheck` 为 0，`typecheck:app` 为 0，App `typecheck` 为 0；`npm run lint` 为 0。
- **棘轮**：157 → 156（`live-conversation-trace.ts` 这一项删除）。读取成本基线没变，测试通过。
- **Postgres 测试**：把所有带 `ORBIT_LIFECYCLE_TEST_DATABASE_URL`、又引用到改动模块或相关集合的测试文件找出来，共 26 个，再加 `agent-worker-postgres-recovery`，全部用 `--test-concurrency=1` 跑：
  - 在 `orbit_test` 上：24 个文件，95/95 通过。文件包括 `conditional-routes`、`read-receipts`、`read-cost`、`read-cost-baseline`、`agent-ledger-paging`、`agent-run-trace`、`canonical-inbox-*`（4 个）、`contact-detail-lifecycle-guard`、`contact-owner-boundary`、`dashboard-snapshot`、`dashboard-sql-read-model`、`event-contact-request-inbox`、`historical-inbox-delivery`、`inbox-record`、`inbox-snooze-projection`、`inbox-source-batch`、`mixed-reminder-inbox-projection`、`personal-schedule-inbox-projection`、`relationship-lifecycle`、`schedule-reminder-refresh-cutover`、`typed-delivery-cutover-offsets`，以及 `agent-worker-postgres-recovery`。
  - 在 `orbit_cutover_test_20260917` 上：`canonical-reminder-wake` 26/26、`canonical-reminder-command-transaction` 12/12。这两个文件要求这个专用库，第一次指向 `orbit_test` 时 38 条因「cutover test database required」失败，换库后全部通过。
  - 合计 **133/133**。

## 6. 运行时证据
证据在 `build/harness-state/evidence/sprint-0110/run-01/`，分 `api/`、`screens/`、`commands/` 三个子目录。

- **环境**：用 `local-stack start --build` 启 3100，连本机库 `orbit_events`，3000 没碰。
  - 改前：把 9 个源文件临时换回 HEAD 版本构建（没用 stash），构建完立即换回。
  - 改后：用提交时的源码构建。
  - 两次都用 `NODE_OPTIONS --import paid-guard.mjs`，逐条记录付费主机请求，并在代码里硬性限制次数（改前 0 次，改后最多 4 次）。
- **改前对照**（10 次本地拦截的问题，0 付费）：每次都有 `run:conversation:…`；QA 账号新增 10 条运行记录。
- **改后**（同样 10 次）：`runId` 全为 null，运行记录 0 条新增，请求记录加 10。
- **真实普通问答**（DeepSeek，第 1 次付费调用）：`runId` 为 null，全库只有请求记录加 1。
- **真实动作请求**「提醒我明天下午三点跟进 Orbit 试点项目」（第 2 次付费调用）：
  - 生成 `run:natural-language:b5c94266` 和 1 个动作；运行、步骤、动作、请求记录各加 1，统计 0。
  - 运行详情 200，共 8 步，其中 7 步由计时拼出，状态是等待确认。
- **网页**（Playwright，1440 宽）：在「建议与行动」点「确认执行」，transition 返回 200。之后运行、动作、发件箱、回执都是完成状态，界面显示今日进度 1/1。截图 `confirm-02/03`。
- **App**（iPhone 17 Pro Simulator，Debug 版 + Metro，服务器地址 3100，QA 账号 A）：
  - All Actions 显示「创建提醒 · 已完成」，带 Run 编号。点「撤销」后变成「已撤销」。截图 `sim-05/06`。
  - 在 App 里真问一次英文普通问题（第 3 次付费调用），拿到正常回答，全库只有请求记录加 1。截图 `sim-08`。
- **反馈**：用普通问答的请求编号和回复编号调 `POST /api/agent/feedback`，都返回 404。
- **旧数据**：改前写下的普通问答运行，`/api/ai/runs/[id]` 返回 200。
- **统计总数**：从头到尾一直是 650 行，全程没有新增。
- **清理**：
  - 已删除 QA 账号的 orbit_records 共 135 行，以及 QA 小票 117 条。
  - Agent 相关集合的行数和开工前一致：运行 76、步骤 589、统计 650、请求 51。
  - 保留了 8 条来源为 app、没有归属账号的认证/代理类小票，分不清是 QA 产生的，还是 Simulator 启动时连 3000 产生的，所以没删。
  - 3100、两个 worker、Metro 都已按 PID 停止。
  - Simulator 服务器地址已改回 `http://127.0.0.1:3000`（截图 `sim-09`）。**演示账号需要重新登录**，因为切换服务器会退出登录。

## 7. 付费调用记录（上限 4 次）
| # | 时间（UTC） | 主机 | 用途 | 结果 |
|---|---|---|---|---|
| 1 | 2026-09-27 19:31:23 | api.deepseek.com | 接口真问普通问题 | 200，616ms |
| 2 | 2026-09-27 19:31:33 | api.deepseek.com | 接口真问提醒请求（动作） | 200，315ms |
| 3 | 2026-09-27 19:40:36 | api.deepseek.com | App 真问普通问题 | 200，351ms |

共 **3/4** 次，保守按 $0.006 记。改前 10 次、改后 10 次本地拦截问答都是 0 次付费，没有被拦截的请求。`npm test` 的付费拦截没有触发。原始记录在 scratchpad 的 `paid-calls.jsonl`。账本累计请协调者在已知的 $0.062249 上，加上之后各 Sprint 的记录再加本次的数字。

## 8. GitNexus
- `createAgentRuntimeService`、`createStorageAgentRuntimeRepository`：**CRITICAL**，影响 37–38 处，涉及对话 POST、actions GET/accept/dismiss。本次只删除统计写入和 `recordCompletedRun`，已由真库动作测试、Postgres 集合 133 条和两端全量覆盖。
- `createPostEventFollowupWorkflow`：**HIGH**，影响 7 处（事后跟进、会面笔记 handler、已知工作流路由）。只删了 2 处统计调用，已由工作流真库测试和全量覆盖。
- `persistConversationRunTrace`、`remoteDatabaseInteractionForTools`、view 路由：LOW。
- `recordAnalytics`、`saveAnalyticsEvent`、`recordCompletedRun`：UNKNOWN，已用全文搜索确认调用点，全部处理完毕。
- staged detect-changes：15 个文件、24 个符号，risk high，影响 8 个 POST 对话流程，都在预期范围内。

## 9. 生产上线步骤（给用户）
1. **不需要迁移，也不需要执行回填。** 部署后新的普通问答自然不再写运行记录和统计。
2. **存量不用在本 Sprint 清理。** 旧的统计行、普通问答运行记录都能照常读取（有测试）。按设计删除交给 0111；因为统计已全部停写，0111 的保留期任务不用再考虑统计集合的新增。删除前先查生产行数并备份：
   ```sql
   select collection_name, count(*) from orbit_records
    where collection_name in ('agentAnalyticsEvents','agentRuns','agentRunSteps')
    group by 1;
   ```
3. 0103 的 `db:migrate:agent-run-targets` 如果生产上还没执行，仍需执行，这件事与本 Sprint 无关。

## 10. 遗留与需要知悉
1. **SC-04 的前提与事实不符**：设计案第三节和 Planner 写的「每轮在 :1044 调用」其实只发生在开发用的 trace 接口里，生产环境不会发生这段读取，所以生产小票上看不到下降。读取已删、真库计量也证明了 0 读取，但「每次问答省下的流量」这个收益在生产上并不存在。
2. **网页恢复会话时不显示状态卡**：从侧栏打开带动作的历史会话，看不到「确认」卡片，只能到「建议与行动」里确认。我没在改前构建上对照过，但这个 Sprint 没碰前端或会话恢复，判断是原来就这样，建议另开任务处理。
3. **修了一个 0122 留下的不稳定用例**：`agent-run-trace-postgres` 里「past clock」偶尔失败，原因是账本的 `provenance.collectedAt` 用的是墙钟，两次读取可能差 1ms。现在比较时忽略这个字段，属于纯测试修复。
4. **`recordCount` 契约变化**：变成可选。唯一的消费方是开发 trace 页面，它只显示 summary，不受影响。
5. **本机时延看不出差别**：本机数据库写一次不到 1ms，SC-02 的墙钟差被噪声盖住。在生产上（Vercel 到云数据库）每次普通问答省一次写库往返。
## 11. 协调者复核

协调者在 `9096a650e` 上独立复核：

- **orbits 全量**：5221 条，4728 通过，0 失败，492 跳过。
- **App 全量**：3718/3718 通过。子代理那次遇到的已知不稳定用例，这次没有出现。
- **Postgres 测试**：协调者按「涉及 agent、orbit-ai、收件箱、读取成本、小票、看板」挑出所有使用 `ORBIT_LIFECYCLE_TEST_DATABASE_URL` 的文件，在 `orbit_test` 上跑，共 185 条，155 通过，26 失败，4 跳过。
  - 26 条失败全部来自两个文件：`contact-search-pagination`（23 条）和 `read-projection-parity-postgres`（3 条）。这两个文件都需要 `orbit_cutover_test_20260917` 库。
  - 把 `read-projection-parity-postgres` 指向这个库重跑，5/5 通过。`contact-search-pagination` 在这个库上本来就有 7 条既有失败，0126 已登记。
  - 结论：这些是测试环境造成的失败，与本 Sprint 无关。
- **第 10 节第 1 条**（SC-04 的前提与事实不符）：协调者接受子代理的说明。读取已经删除，设计案里对生产收益的估计据此修正：只有开发用的 trace 接口受益，普通问答在生产上省下的是一次写运行记录的往返。
- **第 10 节第 2 条**（网页恢复历史会话时不显示状态卡）：记为 P2，放到 0112（AI 会话分页，会改会话恢复）一并查看。
- **付费账本**：本 Sprint 3 次，保守记 $0.006。0098 以来登记的累计（保守）：0106 之前是 $0.062249；0126 的 AI 对话 1 次、自我介绍 2 次、报名问题最多 7 次；0127 自我介绍 2 次；0128 报名问题 1 次；本 Sprint 3 次。合计约 **$0.10 / $5**。另有 0123 之前测试泄漏的付费请求，估计不到 $1，见 0123 REPORT。
