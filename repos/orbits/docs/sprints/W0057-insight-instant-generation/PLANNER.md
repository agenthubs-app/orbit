# Sprint W0057 — 洞察即时生成链路（名片确认／重新分析 → 秒级生成；心跳跟随新部署；去掉详情 3 人门槛）

> revision 2（2026-10-03）：按 [REVIEW-2026-10-03.md](../REVIEW-2026-10-03.md) 修订（revision 1 SHA256 `868365cdc158746c747468cfb079a7eabf0b50cfb0e65d71fd6ed781d9b89cc6`）：G-1 池语义写明为对 D45 的修订（D62）；G-2 加「缺行对账」维护步骤，确认后标记不再只靠尽力而为；G-6 重试按「生成轮次」计数；G-7 定向领取（只领本 actor 本次联系人）、无行时也读目标、补行分页；G-8 60 秒预算拆解与 provider 45 s 上限；G-9 心跳接管去掉 `takeover` 参数，回滚改为运维 SQL 并写 `ALTER TABLE`。

**Plan revision:** 2。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** RC-01（REQUIREMENTS 大目标 5）；D59（即时生成与重新分析补行）、D60（去详情门槛）、D62（配额池）、D63（只做 Web、付费上限）。
**单一目标:** 名片确认与计划重新分析之后，在请求之外立即为相关联系人生成洞察（≤60 秒可见），失败可见且自动重试；后台心跳链在新部署上线后自动转到新代码；详情页洞察面板不再受「已确认联系人 ≥3」门槛限制。
**易读目标:** [GOAL.md](GOAL.md)。
**视觉依据:** 原型 <https://claude.ai/artifact/1xi35cdWj5hjv8oPZDbHcV> 画板①「为什么是 TA」块（本 Sprint 只改它的**状态**：正在生成／失败自动重试／无目标引导；布局改版在 W0060）。
**基线:** 编制时 `chat-agent` = `a7c96deb`（W0055 已合并，W0056 planned 未执行）。下文行号按 `a7c96deb`，开工时按符号重定位（D46⑦）。
**进入条件:**
- W0055 completed（已满足）。W0056 若同时在跑，不并行（W0056 改首页服务端读取，与本 Sprint 无文件重叠，但共用全量测试基线；协调者排序即可）。
- 本机 `orbit_test` 可用，`node scripts/assert-local-test-databases.mjs` 通过。
- 付费 AI：开发与测试一律 mock 生成器（`ORBIT_CONTACT_INSIGHT_GENERATOR` 不设即 mock；`scripts/test-paid-ai-boundary.mjs` 默认拦截付费主机）。**本 Sprint 真实 DeepSeek 调用上限 = 0 次**，待用户决定 W57-A 后才可改（见文末）。
- 迁移只写文件与本机验证；生产迁移、部署、push 需单独授权（见「生产授权清单」）。

## 上下文包（Generator 从这里起步，不通读其他 REPORT）

### 必读文件
- `features/contacts/insights/worker.ts`（226 行）：`prepareInsightGeneration`（:53）、`executeInsightGeneration`（:111）、`processClaimedInsightBatch`（:199，后台池 `reserve` 在其内，幂等键 `insight:auto:<actor>:<fingerprint>:<claimedAt>`）。注意现状：失败行标 `failed`、清待更新、**不自动重调**（文件头注释第 10 行）——本 Sprint 改为有上限的自动重试。
- `features/contacts/insights/repository.ts`：`markContactInsightsDirty`（:138，upsert，状态非 ready 时置 pending）、`markContactInsightsGoalDirty`（:154，**只 UPDATE 已有行**、`goal_hash is distinct from`）、`claimDirtyBatch`（CAS，同一 actor ≤limit 行）、`claimSingle`、`fail`／`defer`／`blockNoGoal`。
- `features/contacts/insights/regenerate.ts`（93 行）：单人重新生成的完整样板——CAS 领租约 → `prepare` → 用户池 `reserve`（`trigger: "manual"`）→ `deps.schedule(run)`（`after`），`schedule` 抛错时就地执行。**即时生成照这个形状写，换池判定与批量领取。**
- `features/contacts/insights/maintenance-task.ts`（62 行）：每轮 sweep 中断租约 → 最多 10 批 `claimDirtyBatch`。
- `features/contacts/insights/runtime.ts`：`getConfiguredContactInsightsRuntime()`（module mode live + DB 才非 null；生成器 `ORBIT_CONTACT_INSIGHT_GENERATOR=deepseek` 且有 key 才真实，否则 mock）。
- `features/contacts/insights/mark.ts`：`markContactInsightsDirtyBestEffort`／`markContactInsightsGoalDirtyBestEffort`（失败只记日志）。
- `features/contacts/insights/view.ts`：`contactInsightView`（无目标 → `no_goal`；无行 → `none`；`inProgress` 由租约判断）。
- `app/(app)/app/contacts/network-0918/network-insight-panel.tsx`（85 行）：状态文案（`INSIGHT_STATE_COPY`，在 `network-insight-copy.ts`）、重新生成按钮、`no_goal` 时「设置关系目标」链接。
- `app/(app)/app/contacts/[id]/page.tsx`：:200 `thresholdPromise = readAnalysisThreshold(actor.id)`；:218–228 `Promise.all` 里 `thresholdPromise.then(threshold => threshold && !threshold.met ? null : readContactInsightDetail(...))`——**门槛在这里**；同一个 `thresholdPromise` 还传给 :201 `loadContactCardRoute(..., { readThreshold })`（列表洞察一句，**不动**）。
- `app/api/contact-drafts/business-card/batches/v2/handlers.ts`（1066 行）：:89–97 `markInsightsDirty` 依赖与 `liveMarkCardInsightsDirty`；:913–917 确认提交后标 dirty（reason `enrichment`，回放同样执行）；确认是**逐张**的（`createConfirmLikeHandler`，:953 确认、:958 手工录入共用）。
- `app/api/agent/plans/reanalyze/route-handlers.ts`（242 行）：:75–76 `defaultMarkInsightsGoalDirty`；:207 `if (!result.replayed) await markInsightsGoalDirty(actorId, rawGoal)`。
- `features/ai-quota/constants.ts`（池、`USER_POOL_DAILY_LIMIT = 10`、`AI_QUOTA_BATCH_SIZE = 20`）与 `features/ai-quota/ledger.ts`：:76–78 计数 `user_used = count(*) filter (where pool='user')`、`manual_used`、`background_used`；:125–132 判定。数据库约束 `features/network-analysis/migrations.ts:35–36`：`purpose in (...)`、`trigger in ('auto','manual','plan')`。
- 心跳：`features/operations/maintenance/heartbeat.ts`（212 行：一行一链 `orbit_maintenance_heartbeat`，`chain_id`／`seq`／`dispatched_seq`；`ensureMaintenanceHeartbeat` 只在链死时重建；`processMaintenanceHeartbeat` 按 `chain_id` 判 superseded）、`features/operations/maintenance/configured.ts`（`sendHeartbeat` 用 `@vercel/queue` `send`；`bootstrapMaintenanceHeartbeat` 由 business-card／agent-action／event-operations 三个队列消费者调用）、`app/api/queues/maintenance/route.ts`、`features/operations/maintenance/http.ts`（`/api/internal/maintenance` 调 `ensureHeartbeat`）、`vercel.json`（cron `0 3 * * *`；queue trigger `maintenance-heartbeat`）。
- 测试先例：`tests/services/contact-insights-postgres.test.ts`（本机库、随机 schema）、insights worker／generator 单测、`tests/api/business-card-ingest-v2-routes.test.ts`、heartbeat 现有测试（`grep -rl processMaintenanceHeartbeat tests`）。

### 关键符号（原样）
- `export async function processClaimedInsightBatch(deps: ContactInsightWorkerDeps, batch: ClaimedInsightBatch): Promise<InsightBatchOutcome>`
- `export async function requestContactInsightRegeneration(deps: InsightRegenerationDeps, input: { actorId: string; contactId: string }): Promise<InsightRegenerationOutcome>`
- `export async function markContactInsightsDirty(executor, input: { workspaceId; actorId; contactIds; reason; now? }): Promise<string[]>`
- `export async function markContactInsightsGoalDirty(executor, input: { workspaceId; actorId; goal; now? }): Promise<number>`
- `export async function ensureMaintenanceHeartbeat({ pool, workspaceId, send, intervalSeconds, now, id })`、`export async function processMaintenanceHeartbeat(message, { pool, workspaceId, runPass, send, intervalSeconds, now })`
- impact：开工时对上述符号 + `createConfirmLikeHandler`、`createPlanReanalyzeRouteHandlers`、`contactInsightView`、`NetworkInsightPanel`、ledger `reserve` 跑 upstream；ledger `reserve` 预期 HIGH（所有付费 AI 共用），按 H 档处理。

### 前序交接要点
- W0051：`contact_insights` 表（含 `dirty_seq`／`claimed_seq` 栅栏、租约列、`attempts`、`last_error_code`）、`markContactInsightsDirty` 各调用点、维护任务 `contact-insights` 每轮 ≤10 批、每批 ≤20 人 = 1 次操作、读取路径 0 次模型调用。
- W0048a／D45：用户主动池总熔断每人每东京日 10 次操作（含手动重新分析 3 次）；后台池 60 次；按操作计次、按 HTTP 子账计成本。
- W0054：门槛 `readAnalysisThreshold`（已确认联系人 ≥3）；列表洞察一句与分析页门槛卡**保持**（RN-12），本 Sprint 只去掉详情面板这一处（D60）。
- **生产实证（2026-10-03，Neon `orbit-production-20260924`、Vercel `orbit-staging-20260917`）**：生产开关 `ORBIT_CONTACT_INSIGHT_GENERATOR=deepseek` 已设；9 条 `contact_insights` 自 09:42 起一直 pending；心跳 10:31、11:01 两次 `last_result.tasks` 都**不含** `contact-insights`／network snapshot／contact import——心跳链仍在旧部署代码上运行（推断：自续的队列消息回到发出它的旧部署）。手动点 Cron Run 后 11:03 九条全部 ready（`deepseek-v4-flash`，后台池 1 次调用）。

### 易错边界（都对应到 SC）
1. **请求不等模型：**确认／重新分析接口的响应不得等待生成；生成在 `after()`（`next/server`）里跑，`after` 不可用（测试或非请求作用域）时退回「只标 dirty，交给维护任务」，**不在请求内同步调用模型**（SC-01）。
2. **合批与不重复调用（rev 2 G-7）：**逐张确认会连续触发多次；即时执行器必须用**定向** CAS 领取——新增 `claimForActor({ actorId, contactIds?, limit })`，只领本 actor 的待更新行（优先本次 contactIds，其余同 actor 待更新行补满 ≤20），**不得**用全局 `claimDirtyBatch`（它取全库最老的 actor，会让确认请求去处理别人的积压）；同一行同一时刻只有一个执行器；短时间内连续确认应尽量合进同一批（实现可选：`after` 内短暂等待 ≤3 s 再领取，或只在批次最后一张确认／批次完成时踢一次 + 单张手工录入单独踢）。上限：连续确认 5 张（间隔 <1 s）provider 调用 ≤2 次（SC-01）。
3. **池判定（D62，rev 2 G-1：这是对 D45「用户主动池总熔断 10 次」的修订——即时生成从 10 次总熔断里剔除、另设独立计数，README D62 已写明）：**即时生成记 `pool: "user"`、`purpose: "insight"`、`trigger: "auto"`（单人重新生成是 `trigger: "manual"`），**不计入** `USER_POOL_DAILY_LIMIT`（10 次）的 `user_used`；另设即时生成自己的日上限 `INSTANT_INSIGHT_DAILY_LIMIT = 20` 次操作／人／东京日（= 最多 400 人，Planner 定，对标见文末 W57-1）；超过时**不报错**，退回只标 dirty、由后台池维护任务处理。详情面板「今天次数已用完」判定（`features/contacts/insights/read.ts` `readConfiguredUserPoolUsed`，读 `readUsageToday(...).user`）必须同步改为排除即时生成，否则按钮会被即时生成误置灰。实现优先「不改库约束」：`trigger` 复用 `auto`，ledger 计数改为 `user_used = count(*) filter (where pool='user' and not (purpose='insight' and trigger='auto'))` 并新增 `instant_used`；若确需新 `trigger` 值，则写迁移（`trigger` check 放宽）并列入生产授权（SC-03）。
4. **幂等：**即时生成的幂等键 `insight:instant:<actorId>:<fingerprint>`（fingerprint = 本批 contactId + sourceDataVersion 的摘要，照 worker 现有算法）；同一批同一版本重复踢（如确认回放、重复点击）只预留 1 次；名片确认回放（`replayed`）照常标 dirty 与踢，不会重复计费（SC-03）。
5. **失败自动重试且不重复计费（rev 2 G-6）：**现有 `attempts` 每次领取都 +1、成功不清零，不能直接当重试次数。新增列 `retry_count`（迁移 v3）：每次**新一轮待更新**（dirty_seq 前进且上一轮已结束）或生成成功时清零；生成失败（provider 错误、超时、`INVALID_OUTPUT`）时 +1。行改为「`failed` + 自动重试排期」：`retry_count` 为 1／2 时（第 1、2 次失败） `dirty_at` 保留、`deferred_until` 分别为 +5、+10 分钟，由心跳维护任务按后台池重试；第 3 次失败（`retry_count = 3`）停下等用户「重新生成」。每次重试是新的操作（幂等键带 `retry_count`），`ai_state=started` 先提交的防重复规则不变；进程中途退出（租约过期）仍按 W0051 由 sweep 处理，并纳入同一重试排期（SC-04）。
6. **状态可见（rev 2 G-7：没有洞察行时 `readContactInsightDetail` 现在直接返回 `goalKnown:false` 不读目标——改为无行时也读目标，无目标显示设目标引导、有目标显示「正在生成」）：**详情面板四种新状态文案（中英）：pending 且无租约 →「正在生成，通常 1 分钟内」；租约中 →「正在生成…」；failed 且有重试排期 →「生成失败，稍后自动重试」；failed 且 attempts ≥3 →「生成失败」+「重新生成」。pending／生成中时面板**每 5 秒轻量轮询**一次只读状态接口（只读本人一行、0 次模型调用、最多 24 次 = 2 分钟后停止并提示刷新），ready 后无整页刷新地替换内容（SC-02）。
7. **门槛（D60）：**删掉 `[id]/page.tsx` 详情这一处 `threshold.met` 判断，详情只要「有目标」就渲染面板；无目标显示「设置关系目标」引导（现有 `no_goal`）。`thresholdPromise` 仍给列表用，列表与分析页门槛卡行为不变（SC-02）。
8. **无目标与首次设目标：**无目标时即时执行器不调用模型、不预留（沿用 `blockNoGoal`）；**目标从空变为非空保存成功后**，把本人 `blocked_no_goal` 行转 pending 并即时触发（Planner 定，对标见 W57-2）；已 ready 行改目标仍按 W51-1 只显示「目标已更新」角标、不自动重算（SC-03）。
9. **重新分析补行（D59）：**`reanalyze` 保存成功后：①对**已确认联系人中没有洞察行**的（`confirmedContactPredicate` 过滤，按 `record_id` 游标分页、每页 500，直到补完；rev 2 G-7）insert pending 行（reason `goal`）；②沿用 `markContactInsightsGoalDirty`；③即时触发（每次最多 5 批 = 100 人，余下交心跳）。**`replayed` 时同样执行**（三步都幂等：insert on conflict do nothing、goal 哈希比较、生成幂等键），用来补上原请求尽力而为失败的情况——这是对现状 :207 `if (!result.replayed)` 的有意修改（SC-03）。
10. **心跳链跟随新部署（SC-05；rev 2 G-9）：**链行记录拥有它的部署（`deployment_id`，取 `VERCEL_DEPLOYMENT_ID`，本地为空）与构建先后标记（构建期写入 bundle 的时间戳，例如 `next.config` 注入 `ORBIT_BUILD_AT`）。规则：①`ensure` 时若当前进程构建**更新**于行内拥有者 → 原子换新 `chain_id`、重置 seq 并发首个 tick（旧链消息到达旧部署后按现有 `chain_id` 不符逻辑判 superseded、不跑 pass、不续发）；②旧部署处理 tick 时若发现行内拥有者构建更新于自己 → superseded 退出；③构建更旧的进程**不得**抢回链（防来回抢）。**不加任何 query 参数**（`features/operations/maintenance/http.ts` 规定内部维护入口拒绝一切 query）。回滚到旧部署时（旧代码不认识新列），运维步骤写进 REPORT：经授权在生产执行 `delete from orbit_maintenance_heartbeat where workspace_id = …`，下一次 cron／内部维护请求／队列消费者即在当前部署重建链。表结构变更必须写 `alter table … add column if not exists`（`MAINTENANCE_HEARTBEAT_SCHEMA_SQL` 只有 `create table if not exists`，对已存在的表不生效）。新部署的接管时机：每日 cron、`/api/internal/maintenance`、三个队列消费者已有的 `bootstrapMaintenanceHeartbeat`，**再加**本 Sprint 的即时生成 `after()` 末尾调用一次 `bootstrapMaintenanceHeartbeat()`（失败吞掉只记日志）。`last_result` 增记 `deploymentId` 与 `tasks` 名单，便于生产核对。
11. **读取 0 次模型调用不变：**详情页、列表、洞察标签、状态轮询接口都不 import 生成器与配额（沿用 W0051 架构测试）。
12. **确认后标记的持久性（rev 2 G-2）：**现状确认后 `markInsightsDirty(...).catch(() => undefined)`，失败即永久漏生成（没有行，维护任务捞不到）。新增维护步骤「缺行对账」：`contact-insights` 任务每轮先对**有目标的 actor** 查「已确认、创建／更新于近 7 天、没有洞察行」的联系人（按 `record_id` 游标、每轮 ≤200 行、走索引），insert pending 后交给同一轮领取；全量历史缺行仍归回填授权。确认请求里的标记失败也要重试 1 次再记日志（SC-01）。
13. **60 秒预算（rev 2 G-8）：**测量点 = 确认接口返回 200 的时刻 → 详情面板出现 ready 文本的时刻。预算：合批等待 ≤3 s + provider 上限 **45 s**（即时路径单独设，后台仍 60 s）+ 写回 ≤2 s + 轮询间隔 ≤5 s ≤ 55 s；确认路由与 manual-entry 路由显式设 `maxDuration`（≥60 s）以容纳 `after()`。

## 范围与文件

- 读取：上下文包所列；额外需要的先 GitNexus 再读，REPORT 登记。
- 修改：`features/contacts/insights/{worker,repository,regenerate,mark,view,runtime,maintenance-task}.ts`（失败重试排期、actor 级领取入口、补行 insert）；新建 `features/contacts/insights/instant.ts`（即时执行器：领取 → prepare → 池判定 → execute → 结尾 bootstrap 心跳）；`features/ai-quota/{constants,ledger}.ts`（`instant_used` 与 `user_used` 排除规则、`INSTANT_INSIGHT_DAILY_LIMIT`）；`app/api/contact-drafts/business-card/batches/v2/handlers.ts`（确认后踢即时执行器，依赖可注入）；`app/api/agent/plans/reanalyze/route-handlers.ts`（补行 + 即时 + replayed 语义）；目标保存处（GitNexus 查 `readSnapshotProfile` 读的 goal 写入函数，只加「空→非空」后的解封调用）；`app/(app)/app/contacts/[id]/page.tsx`（去门槛）；`network-insight-panel.tsx`、`network-insight-copy.ts`（状态与轮询）；新建只读状态接口 `app/api/contacts/[id]/insight/route.ts`（GET，本人一行，返回 `ContactInsightView` 子集）；`features/operations/maintenance/{heartbeat,configured,http}.ts`、`app/api/queues/maintenance/route.ts`（接管规则）、`next.config.*`（构建时间戳注入）；对应测试。
- 新建测试：`tests/services/contact-insights-instant-postgres.test.ts`、`tests/services/maintenance-heartbeat-deployment.test.ts`（或扩现有 heartbeat 测试）、`tests/api/contact-insight-status-route.test.ts`；扩 `tests/api/business-card-ingest-v2-routes.test.ts`、`tests/pages/app-network-detail-modal.test.tsx`、reanalyze 路由测试、ledger 测试。
- 排除：详情布局改版（W0059／W0060）；推测字段（W0058）；列表与分析页门槛卡；`POST /api/network/snapshot/recompute` 的补行（D59 只点名计划重新分析，保持 W51-1 现状）；其他队列（canonical reminder wake、business-card、event-operations）同类「回到旧部署」问题只在 REPORT 登记为候选，不改；App 端。

## 验收契约（最多五项；每项 = 一条操作链 + 一个主证据，子断言见下表）

| SC | 操作链（可观察行为） | 主证据 |
| --- | --- | --- |
| SC-W0057-01 | **确认即生成（rev 2：含缺行对账）。**有目标的账号确认 1 张名片：响应不等模型；`after` 里即时执行器领取该联系人、用户池（即时）预留 1 次、mock 生成器调用 1 次，行变 ready；连续确认 5 张（间隔 <1 s）provider 调用 ≤2 次、每次 ≤20 人 | `tests/services/contact-insights-instant-postgres.test.ts`（本机库，证明未 skip；mock 生成器计数） |
| SC-W0057-02 | **详情 60 秒内可见、去门槛。**只有 1 位已确认联系人的账号：确认后打开详情，面板先显示「正在生成，通常 1 分钟内」，轮询拿到 ready 后显示「和你目标的关系」+ 依据 + 下一步；无目标时显示设目标引导；列表洞察一句的门槛不变 | `app-network-detail-modal.test.tsx` 与新状态接口测试 + 本机浏览器计时（1440／375 截图，证据目录记录确认时刻与出现时刻，≤60 s） |
| SC-W0057-03 | **池、幂等与补行。**即时生成不占 10 次名额；单人重新生成照常计 10 次；即时超 20 次／日退回后台池；同批同版本重复踢只预留 1 次；重新分析（含 replayed）为缺行的已确认联系人补 pending 行并即时触发；目标从空变非空解封 `blocked_no_goal` 行 | ledger 单测 + Postgres 测试 + reanalyze 路由测试 |
| SC-W0057-04 | **失败自动重试。**mock 生成器第 1、2 次抛错、第 3 次成功：行依次 failed（重试排期 5、10 分钟）→ 心跳维护任务按排期重试 → ready；三次都失败则停在 failed、面板显示「重新生成」；任何重试都不重复计费 | worker／maintenance-task 单测（假时钟、provider 计数、账本桩） |
| SC-W0057-05 | **心跳跟随新部署。**模拟构建 A 拥有链、构建 B 调 `ensure`：B 换链并发 tick；A 收到旧链 tick → superseded、不跑 pass、不续发；A 再调 `ensure` 不能抢回；删除链行后任一构建可重建；schema SQL 对已有旧表补列；`last_result` 含 `deploymentId` 与 `contact-insights` | heartbeat 单测（注入 env 与假 `send`，Postgres 测试库） |

### 必需证据子表

| SC | 子断言 | 证据 |
| --- | --- | --- |
| 01 | `after` 不可用时只标 dirty、请求内 0 次 provider 调用 | 路由测试（`after` 桩抛错） |
| 01 | 手工录入（`createIngestV2ManualEntryHandler`）同样即时触发；确认回放（`replayed: true`）不重复计费 | 路由测试 |
| 01 | 即时执行器结尾调用 `bootstrapMaintenanceHeartbeat`，失败不影响结果 | 单测 |
| 01 | 定向领取：库里另有别的 actor 更早的积压时，确认请求只处理本 actor（G-7） | Postgres 测试 |
| 01 | 确认后标记两次都失败 → 下一轮维护「缺行对账」补出 pending 行并生成（G-2） | Postgres 测试 |
| 02 | 无洞察行：有目标显示「正在生成」、无目标显示设目标引导（G-7） | 读取单测 |
| 03 | 补行 >500 人时分页补全（夹具 1,050 人） | Postgres 测试 |
| 03 | 即时生成后详情「重新生成」按钮的次数判定不受影响（`readConfiguredUserPoolUsed` 同口径） | 读取单测 |
| 04 | `retry_count` 在新一轮待更新与成功时清零；历史成功次数不消耗新一轮重试 | repository 测试 |
| 02 | 状态接口只读本人一行：他人 contactId → 404；0 次生成器／配额 import（架构测试） | 路由测试 + `tests/architecture/*` |
| 02 | 轮询最多 24 次后停止并提示刷新；ready 后停止 | 组件测试（假定时器） |
| 02 | 四种状态中英文案；`no_goal` 链接到目标编辑 | 组件测试 |
| 03 | `user_used` 排除即时生成；`manual_used`、后台池计数不变；W0048a 现有 ledger 测试全绿 | ledger 测试 |
| 03 | 补行只对 `confirmedContactPredicate` 通过的本人联系人；他人联系人不被插入 | Postgres 测试 |
| 03 | 已 ready 行改目标：只显示「目标已更新」，不自动重算（W51-1 不回归） | 现有用例 + Postgres 测试 |
| 04 | sweep 中断的租约行进入同一重试排期 | maintenance-task 单测 |
| 05 | 本地（无 `VERCEL_DEPLOYMENT_ID`）行为与现状一致；`ORBIT_MAINTENANCE_HEARTBEAT=0` 时不启用 | heartbeat 单测 |
| 全部 | typecheck；一次全量基线对照（新增失败 0）；一次 Codex 代码 review | `npm test` 对照清单 |

## 一次 Generator 的执行顺序

1. 登记 run-01、Planner SHA256、基线；`git status` 确认用户未提交文件不动。
2. 批量 impact（上表符号）；HIGH 先报告，`UNKNOWN` 用 grep 补查。
3. 账本池判定（SC-03）→ 失败重试排期（SC-04）→ 即时执行器与两个触发点（SC-01、SC-03）→ 状态接口、面板、去门槛（SC-02）→ 心跳接管（SC-05）；每步 RED → GREEN，最多两轮本地修复。
4. 本机浏览器计时验证（mock 生成器），截图与日志存 `~/orbit-sprint-evidence/web/sprint-W0057/run-01/`。
5. 路径限定暂存 → `node .gitnexus/run.cjs detect-changes --scope staged --repo .` → `sprint/W0057-insight-instant-generation` 提交 → 全量基线对照 → Codex 代码 review 一次（意见回本 Generator）→ REPORT → 协调者合并回 `chat-agent` 并验证合并树。

## 最小测试与检查

- **档位：H**（付费 AI 触发路径与配额判定、幂等、共享 ledger、心跳调度、可能的迁移）。
- **开发定向集**：上文新建与扩展的测试文件。
- **操作链收口集**：上述 + `tests/services/contact-insights-postgres.test.ts`、insights 全部单测、`tests/api/business-card-ingest-v2-routes.test.ts`、reanalyze 路由测试、ledger／network-analysis 账本测试、`tests/pages/app-network-detail-modal.test.tsx`、`contact-card-route.test.ts`（列表门槛不回归）、heartbeat 全部测试、`tests/architecture/offline-policy.test.ts`；`npx tsc --noEmit -p .`。
- **全量**：本地代码收口一次 `npm test`，按 RULES 5.2 基线对照（不要 source `.env`）。
- **不运行**：生产部署、生产迁移、真实 DeepSeek 调用（上限 0，待 W57-A）。

## 付费 AI 调用上限

- 本 Sprint 执行期间真实 DeepSeek 调用：**0 次**（待用户决定 W57-A）。全部测试与浏览器验证用 mock 生成器。
- 上线后的运行期调用由本 Sprint 的配额规则约束：即时生成每人每东京日 ≤20 次操作（每次 ≤20 人、≤1 次 HTTP），超出退回后台池（每人 60 次／日，W0048a）。

## 生产授权清单（本 Sprint 不执行，由协调者转用户）

1. 部署含本 Sprint 的 `chat-agent`（及 push）。部署后第一次触发即时生成或任一队列消费者，会让心跳链换到新部署；核对方法：查 `orbit_maintenance_heartbeat.last_result` 的 `deploymentId` 与 `tasks` 含 `contact-insights`。
2. 生产迁移：`contact_insights` v3（`retry_count`）；心跳表加列（运行时 `alter table … add column if not exists`，随部署自动执行，也须在授权里写明）；若实现最终需要放宽 `ai_usage_ledger.trigger` 约束，也在此列。
4. 回滚到本 Sprint 之前的部署时：经授权执行 `delete from orbit_maintenance_heartbeat where workspace_id = …`，让旧部署重建心跳链。
3. 生产 9 条已 ready 的洞察不需要回填；其余存量联系人的洞察回填仍按 W0055 授权清单第 4 项。

## 回滚

按提交逆序 revert。心跳接管逻辑回滚后，链行多出的列不影响旧代码（旧代码不读）；`ai_usage_ledger` 若放宽了约束，回滚代码不需回滚约束。

## 风险

- `after()` 在 Vercel 上受函数 `maxDuration` 约束：即时执行器每次最多 5 批，单批 60 s 超时；超出部分留给心跳。
- 逐张确认的合批策略选择不当会多花调用：SC-01 的「5 张 ≤2 次」是硬门槛。
- 心跳接管依赖构建时间戳单调：同一提交重复部署时时间戳不同但代码相同，接管无害。

## Planner 定（对标）与待用户决定

| 编号 | 结论 | 对标做法 |
| --- | --- | --- |
| W57-1 | 即时生成独立日上限 20 次操作／人／东京日，超出静默退回后台池（显示「正在生成」不变，只是更慢） | Notion AI／HubSpot Breeze：交互触发的生成有单独限流，超限降级为排队而不是报错 |
| W57-2 | 目标从空变非空时解封 `blocked_no_goal` 行并即时生成；改已有目标仍只显示角标（W51-1） | Apollo：首次定义 ICP 后对全部线索打分；之后改 ICP 由用户手动「重新打分」 |
| W57-3 | 失败自动重试 3 次、指数退避 5／10／20 分钟，之后停下等用户 | Stripe webhook／Vercel Queues 的有限次退避重试 |
| W57-4 | 心跳链按构建先后接管，回滚靠运维删链行重建（rev 2） | 单 leader 选举按「更新版本优先」+ 运维手动 failover |
| **W57-A（待用户决定）** | 是否允许本机用真实 DeepSeek 演练一次即时生成（建议 ≤5 次 HTTP，按子账记录次数与 token）；未决定前为 0 | — |

## 追加记录（执行期，2026-10-03；不改上文，原 revision 2 SHA256 `670702f4d80c9686c07e8cc0bcc6bc646da534b08edec7c1064ee0b10d307034`）

- **W57-A 已决定**（用户在主会话批准，经协调者转达）：本 Sprint 本机真实 DeepSeek 调用上限从 0 改为 **≤5 次 HTTP**，只用于最后的端到端验证（名片确认 → ≤60 秒出「为什么是 TA」）；只在本机独立验收 dev server、本机专用测试账号上打开 `ORBIT_CONTACT_INSIGHT_GENERATOR=deepseek`，每次调用的次数与 token 记入 REPORT；其余测试仍用 mock。上文「上限 = 0」各处以本条为准。
- D62 配额按推荐保持：即时生成不占用户池 10 次，独立每日 20 次。

