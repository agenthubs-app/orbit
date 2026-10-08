# Sprint W0050 — 「机会」标签：规则覆盖度、缺口补法、计划直链、待唤醒、报告卡

> revision 4：按 D46 修订（③④⑦）：机会页兜底入队 `plan_match_jobs` 移到 `plan-match` 维护任务，读取路径对任何表 0 写入（不再有例外）；`getCurrent()` 多读字节如实计量，超 D39 预算另加只读瘦身读取（不在本轮默认范围）；基线行号以开工时 HEAD 为准、按符号重定位。
>
> revision 3：按 REVIEW-2026-10-02-network 裁决修订（R-6、R-11、R-16，配额口径统一）：计划读取由 `getCurrentView` 改为只读 `getCurrent()` + 纯投影 `toOpportunityPlanView`，SC-01 加阶段边界夹具 0 写入／0 生成器断言；报告卡加用户主动池总熔断（每人每东京日 10 次操作，已定 D45）置灰与提示；验收契约改为「操作链 + 主证据」+ 必需证据子表。
>
> revision 2：按 D44 定稿待定项、W0048 拆分、配额两池（2026-10-02）。快照与账本来自 W0048a；报告卡按两池显示：手动重新分析计入用户主动池（每天 ≤3），自动重算计入后台池（用完「明天更新」）。

**Plan revision:** 4。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** RN-08 全部；RW-11「匹配永远只是建议、三处共用一个确认组件」沿用；RN-06 报告卡与手动重新分析（用户主动池，每天 ≤3 次）的展示。
**单一目标:** `/app/contacts/dashboard?tab=opportunities` 改为五块：规则覆盖度、缺口补法、本周建议动作、待唤醒、快照报告卡；不再使用旧的固定阈值覆盖度、规则重排的「建议动作」、iOrbit 聊天报告入口与关键词版 `contact-needs`。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 开工时 `chat-agent` HEAD（编制时 `a48e1749`）。W0047、W0048a 合并后开工（登记表依赖）；W0049 若先合并，标签切换方式以它为准。行号按 `a48e1749`，开工时按符号重新定位。 **行号以开工时 HEAD 为准，按符号重定位（D46⑦）。**
**进入条件:**
- **W0048a completed**（登记表依赖），REPORT 交接 `NetworkSnapshotView`（含 `quota.manual`／`quota.background`、`freshness.job`／`retryOn`）、`GET /api/network/snapshot`、`POST /api/network/snapshot/recompute` 及错误码 `MANUAL_REFRESH_LIMIT`。`criteria.targetCount` 由 W0048b 落地，本 Sprint 不依赖 W0048b：读不到时按 W50-1 缺省 1 计，W0048b 合并后同一读取自动生效。
- **W0047 completed**（登记表依赖），交接 `RelationshipStrength { tier, dormant, signals[] }` 的批量读取函数（待唤醒用）；W0046 时间线记录 id（依据用，经 W0047 传递）。
- W50-1～W50-7 已定（D44，见文末）。无付费 AI 调用（本 Sprint 全部规则 + 模板）；`plan_match_jobs` 的约束迁移只写文件与本机验证，生产执行另行授权。

## 已查清的事实（按 `a48e1749`）

1. **页面现状。** `app/(app)/app/contacts/dashboard/page.tsx`：非示例时并行 `loadContactsAnalysis(actor.id, language)`（即 `/api/mobile/contacts-dashboard` 同一服务）与 `loadAppContactsRouteViewModel`；`?tab=structure|opportunities` 进 `NetworkAnalysis`（`network-0918/network-analysis.tsx`，367 行），标签切换是客户端 `setTab`。机会标签第 230–365 行：覆盖拨盘读 `coverage.score`（固定阈值缺口，`shared/compute` 规则）、「⟳ 刷新机会」调 `POST /api/dashboard/opportunities/recompute`（只重排不持久化）、「建议动作」读 `opportunities.highPriorityOpportunities`、「待唤醒」读 `dormantHighValueContacts`、报告卡「去 iOrbit 分析」用 `stashAgentPrefill` 跳 iOrbit 聊天（`contacts.analysis` 报告）。区块 `empty` 被显示成「来源暂时不可用」由 W0043 修。示例模式机会标签只渲染 `NetworkDemoAnalysisNotice`（0 次读取）。
2. **覆盖度的唯一事实来源是计划条目。** `plan_items` 的 `network_need` 有 `criteria { primaryIndustryId, secondaryIndustryId, titleKeywords, description }`（`contract.ts:132`，W0048b 加可选 `targetCount`）与 `contact_links[] { contactId, state: "linked" | "established" }`；两种状态都是用户确认过的关联。**读取只用 `PlanService.getCurrent()`**（`service.ts:688`，编制时按 `4f0aa533` 核实：只开 `repository.read`，读计划行 + 全部条目 + 最近 50 条记录，0 写入），再经本 Sprint 的纯函数投影 `toOpportunityPlanView(snapshot: PlanSnapshot)` 得到覆盖度、需求行与本周行动所需字段（`PlanItem` 是 `PlanViewItem` 的超集，可直接投影）。**不得用 `getCurrentView()`**（`service.ts:1290`）：它在阶段边界会执行 `enterPhaseTransaction()` 写「进入新阶段」记录并经 `defaultPhaseRefiner()`（`phase-refinement.ts:120`）解析生成器（R-6）；也不得调用 `enterCurrentPhase()`。代价：`getCurrent()` 多读全部条目与最近 50 条记录，SC-05 实测字节如实计入；超 D39 预算时另加只读瘦身读取方法，**不在本 Sprint 默认范围**，REPORT 登记 D32 并建议后续 Sprint（D46④）。
3. **待确认候选现成。** `PlanMatchingService.listPending({ actorId })` 返回 `candidates[]`（`needId`、`contactName`、`strength`、`tier`、`industry`、`aiReason`）与 `pendingByNeed`；确认组件 `PlanMatchSheet({ candidates, heading?, onDecided? })`（`iorbit-0918/plan-match-sheet.tsx:212`），客户端 `fetchPlanMatches`／`decidePlanMatch`（`plan-match-client.ts`）。候选只由名片批次入队的任务产生（`enqueuePlanMatchJob`，`source_kind in ('batch','day')`），**现有联系人在生成计划后不会进入待确认**。任务行 `ai_state='skipped'` 时 worker 不调 AI（`match-worker.ts:58`）。
4. **本周行动与直链。** `planWeekActions(items, currentWeek)`（`week.ts:130`）+ `planWeekState(plan, now).currentWeek`；计划页每行有 `id="plan-action-<id>"`（`iorbit-plan.tsx:619`，W0036），`/app/agent/plan#plan-action-<id>` 原生定位。
5. **活动池。** `features/agent/home-event-pool.ts:buildHomeEventPool`（纯函数，计划点名 → 目标匹配 → 近期，去重、剔除已开始／已报名，最后截断）；候选来自 `readPublicUpcomingEvents`（`public-goal-recommendations.ts:395`，目录 1 次 + 本人报名 ≤1 次，规则在 `readBookableCandidates`），但返回的 `PublicGoalUpcomingEvent` **没有 description**；目标匹配用 `matchedTokensForText(title + description, query)`（`event-recommendation-tool.ts:173`）。
6. **起草邮件只有模板。** `features/plans/email-draft.ts`：`createTemplatePlanEmailDraftProvider` 不调模型，注释写明接 AI 需新的用户决定；`draftEmail` 只认「约 TA」行动。
7. **关键词版需求匹配** `features/contact-needs` 与 `/api/contacts/needs-matches` 目前不被网络页使用（grep：只有其 handler、`features/notifications/discovery/qualification-policy.ts`）；W0055 删除。

## 上下文包（Generator 从这里起步，不通读其他 REPORT）

### 必读文件
- `app/(app)/app/contacts/dashboard/page.tsx`（标签与数据装配）；`network-0918/network-analysis.tsx:40–110、225–365`（机会标签、`refresh`、`requestAnalysis`）；`analysis/contacts-analysis-view-model.ts`（现视图类型）；`network-0918/network-shell.tsx`（外壳与样式入口）。
- `features/plans/{week.ts,contract.ts:125–180,matching.ts,matching-service.ts:1–60,matching-repository.ts:145–240,match-worker.ts:44–110,matching-migrations.ts,email-draft.ts,goal-signals.ts:153–219}`。
- `app/(app)/app/agent/iorbit-0918/{plan-match-sheet.tsx:212–300,plan-match-client.ts}`。
- `features/agent/home-event-pool.ts`；`features/events/public-goal-recommendations.ts:390–500`；`features/events/event-recommendation-tool.ts:173`。
- W0048a REPORT 交接节（快照视图、两池用量与 API）；W0047 REPORT 交接节（强度批量读取）。

### 关键符号（原样）与 impact
- `export function NetworkAnalysis({ viewModel, analysis, initialTab }: { viewModel: OrbitContactsViewModel; analysis: ContactsAnalysisView; initialTab: AnalysisTabKey })` — UNKNOWN（组件），文本搜索：`contacts/dashboard/page.tsx`、`contacts/pipeline/page.tsx`、`_demo/demo-network.ts`，测试 5 个文件（`app-network-*`）。
- `export function contactsAnalysisToView(input: unknown, language: OrbitLanguage): ContactsAnalysisView` — UNKNOWN，文本搜索：route-service、network-analysis、1 个测试。**只加字段不改语义**。
- `export async function loadContactsAnalysis(actorId: string, language: OrbitLanguage, service?: MobileContactsDashboardService): Promise<ContactsAnalysisView>` — LOW（2：dashboard 页、pipeline 页）。不改。
- `export function buildHomeEventPool(input: BuildHomeEventPoolInput): HomeEventPoolItem[]` — LOW（1：首页 `eventPool`）。只调用。
- `export async function readPublicUpcomingEvents(dependencies, accountId: string, now: Date): Promise<readonly PublicGoalUpcomingEvent[]>` — **HIGH**（6：首页示例期与计划补查、流量脚本）。**不改**，旁边新增同规则读取（见 SC-02）。
- `export function matchedTokensForText(text: string, query: string): readonly string[]` — LOW（2）。只调用。
- `export async function enqueuePlanMatchJob(client: PlanMatchQueryClient, input: EnqueuePlanMatchJobInput): Promise<EnqueuePlanMatchJobResult>` — LOW（7，名片批次事务内调用）。不改其行为，新增 `source_kind 'plan'` 的入队函数。
- `createPlanMatchingService` — **HIGH**（11）；`scoreRuleMatches(contacts, needs)` — LOW（7）。只调用，不改签名。
- `export function planWeekActions<TItem extends PlanViewItem>(items: readonly TItem[], currentWeek: number): PlanWeekAction<TItem>[]` — 只调用。

### 前序交接要点
- W0048a：`NetworkSnapshotView`（`state`、当前语言 `blocks`（`gap` 块可挂 `needId`）、`freshness { stale, newContactCount, job, retryOn }`、`quota { manual { usedToday, limit: 3 }, user { usedToday, limit: 10 }, background { usedToday, limit: 60, retryOn } }`，单位「次操作」；`user` 是用户主动池总熔断，含 `manual`），`generatedAt`、`contactCount`；recompute 错误码 `MANUAL_REFRESH_LIMIT`、`USER_DAILY_LIMIT`。W0048b（不依赖，已合并则生效）：`targetCount`（1–5，缺省 1）。
- W0047：`dormant` = 曾为 active/core 且 60 天无新记录；`signals[]` 每条有记录 id、类型、时间。
- W0046：时间线记录 id 可作为依据链接。
- W0036：`#plan-action-<id>` 锚点；活动池组池规则。

### 易错边界（全部写进 SC）
计划只经 `getCurrent()` + 纯投影读取，阶段边界夹具下计划三表 0 写入、生成器 0 次（R-6）；打开机会标签对任何表 0 次写入（D46③）；覆盖度只由 `contact_links` 与 `targetCount` 规则算，快照内容不改变任何数字；无计划时只换覆盖度区；为现有联系人补候选 0 次 AI；不 import `features/contact-needs`、不请求 `/api/contacts/needs-matches`；本周动作不新生成、不调 AI；起草邮件不发送、不保存、不调模型；示例模式 0 次读取；只有机会标签加载机会数据。

## 契约（本 Sprint 定稿，REPORT 交接）

- **覆盖度（纯函数 `planNeedCoverage`，`features/plans/coverage.ts`，W0052 驾驶舱可复用）：** 每条需求 `t = criteria.targetCount ?? 1`，`a = contactLinks.length`（linked + established）；`have = a`、`missing = max(0, t − a)`；总覆盖度 `Σ min(a, t) ÷ Σ t`，取整百分比；无需求时 `null`（显示「计划里还没有人脉需求」）。
- **视图 `OpportunitiesTabView`**（`app/(app)/app/contacts/analysis/opportunities-view-model.ts`）：`coverage: { state: "no_plan" } | { state: "ready"; percent; needs: NeedCoverageRow[] }`；`NeedCoverageRow { needId, title, phaseTitle, have, target, missing, pendingCount, events: NeedEventRow[], gapNote?: { text, evidence } }`；`weekActions: { planActions: [{ id, title, weeksOverdue, href }], pendingMatches: number }`；`dormant: [{ contactId, name, why, evidence, draftAvailable }]`；`report: NetworkSnapshotView`。
- **需求 ↔ 活动（纯函数 `needEventRows`）：** 候选 = 新读取 `readPublicBookableEvents`（与 `readPublicUpcomingEvents` 共用 `readBookableCandidates`，多带 `description`，原函数不动）按 `buildHomeEventPool({ planEventIds, goalMatches: [], upcoming, limit: 全部 })` 排序；某需求的活动 = 该需求所在阶段的计划活动条目（理由「计划点名」）+ `matchedTokensForText(title + description, 需求标题 + 职位关键词 + 行业中英名 + 描述)` 非空的（理由显示命中词），每条需求最多 2 场（W50-6）。
- **现有联系人进「待确认」（W50-2）：** `plan_match_jobs.source_kind` 加 `'plan'`（`matching-migrations.ts` 追加 version 4，只改 check 约束）；`source_key = <planId>`，`contact_ids` = 本人已确认联系人最近 200 位，入队时 `ai_state = 'skipped'`；规则层结果每条需求最多 3 个（strong 优先、再按添加时间），不覆盖已有 pending／dismissed／已关联。入队时机：任一计划版本保存成功后（bootstrap／reanalyze 路由，提交后、失败只记日志）；**兜底入队移到维护任务（D46③）**：既有 `plan-match` 维护任务（`features/plans/match-maintenance-task.ts`，同处注册）每轮先扫描「生效计划还没有 `'plan'` 任务」的计划并幂等入队（`on conflict do nothing`，每轮有上限常量），再照常领取；执行用 `after()` 领取 + 该维护任务兜底。机会标签加载**不入队**。
- **待唤醒（W50-3 已定）：** `dormant === true` 且（关联在任一计划人脉需求上，或 `isGoalRelatedContact(contact, goalArchetype(goal))`）；按最近一条信号时间倒序，最多 5 人；`why` 由规则拼：「上次往来：<日期> <记录类型>；与目标相关：<同属行业／计划需求「标题」>」中英双语，`evidence` = 那条记录 id。起草邮件：`email-draft.ts` 加 `reconnect` 场景（模板，W50-4），新接口 `POST /api/contacts/[id]/reconnect-draft` 只返回草稿文字。
- **报告卡：** 「生成于 <M/D> · 基于 N 人」+（`newContactCount > 0` 时）「· 新增 M 人未纳入」；按钮「重新分析（今天还剩 k 次）」调 `POST /api/network/snapshot/recompute`（用户主动池 1 次操作，k = min(3 − `quota.manual.usedToday`, 10 − `quota.user.usedToday`)，与后台池互不占用）；`job: queued|running` →「正在更新」；`deferred`（后台池当日 60 次操作用完）→「今日自动更新次数已用完，明天更新」（手动按钮仍可用）；`quota.manual.usedToday >= 3` 或 429 `MANUAL_REFRESH_LIMIT` → 按钮置灰「今天已重新分析 3 次」；`quota.user.usedToday >= 10` 或 429 `USER_DAILY_LIMIT` → 按钮置灰并提示「今天次数已用完，明天可用」（用户主动池总熔断，已定（D45，2026-10-02））；`none` →「生成分析」；`insufficient` 只写一句（完整卡由 W0054 做）。快照 `gap` 块按 `needId` 挂到对应需求行下（文字 + 依据图标），没有就不显示。
- **下线（只在网页机会标签）：** 「⟳ 刷新机会」、旧覆盖拨盘与「高价值／核心关系」两行、`highPriorityOpportunities` 建议动作、`dormantHighValueContacts`、「去 iOrbit 分析」（`stashAgentPrefill`）。`/api/mobile/contacts-dashboard`、`/api/dashboard/opportunities/recompute`、`shared/compute/*` 不改（App 仍用）。
- **加载边界（W50-5）：** 标签改为 URL 驱动（`?tab=`），机会数据只在 `tab=opportunities` 时于服务端读取（`loadOpportunitiesTab(actorId, language, now)`）；W0049 若已改标签方式则沿用。
- **读取路径的写入边界（R-6、D46③）：** 打开机会标签对**任何表** 0 次 INSERT／UPDATE／DELETE（含 `plan_match_jobs`，不再有例外）、计划生成器 0 次解析；`'plan'` 任务的兜底入队只在维护任务里发生。

## 范围与文件

- 新建：`features/plans/coverage.ts`（含 `planNeedCoverage` 与只读投影 `toOpportunityPlanView`）；`app/(app)/app/contacts/analysis/{opportunities-route-service.ts,opportunities-view-model.ts}`；`network-0918/network-opportunities.tsx`（机会标签组件，从 `network-analysis.tsx` 拆出）；`features/plans/plan-match-plan-job.ts`（`'plan'` 入队）；`app/api/contacts/[id]/reconnect-draft/route.ts`；`scripts/measure-opportunities-tab-traffic.ts`；测试 `tests/services/plan-need-coverage.test.ts`、`tests/services/opportunities-view-model.test.ts`、`tests/capabilities/plan-match-plan-job-postgres.test.ts`、`tests/pages/app-network-opportunities.test.tsx`、`tests/architecture/network-no-contact-needs.test.ts`。
- 修改：`network-analysis.tsx`（机会标签换成新组件、删旧入口）、`contacts/dashboard/page.tsx`（按 tab 加载）、`public-goal-recommendations.ts`（只新增导出）、`matching-migrations.ts`（version 4）、`matching-repository.ts`（只新增方法）、`email-draft.ts`（新增场景）、`app/api/agent/plans/{bootstrap,reanalyze}/route-handlers.ts`（保存后入队）、`features/plans/match-maintenance-task.ts`（兜底扫描入队，D46③）、样式文件、受影响测试（`app-network-demo-pages`、`app-network-demo-mode`、`app-contacts-dashboard-account-scope`）。
- 排除：结构标签（W0049）、洞察标签与每人洞察（W0051，到时可替换 `why`）、概览（W0052）、不足 3 人卡与示例快照（W0054）、`contact-needs` 删除（W0055）、App 端、AI 起草。

## 验收契约（五项；revision 3 起每项 = 一条操作链 + 一个主证据，其余断言见「必需证据子表」，R-16）

| SC | 操作链（可观察行为） | 主证据 |
| --- | --- | --- |
| SC-W0050-01 规则覆盖度、计划只读 | 生效计划正处阶段边界时打开机会标签：2 条需求（`targetCount` 2 与缺省）、关联 3 人 → 覆盖度 = `Σmin/Σt` 的取整值、每行「已有 a／还缺 b」；整个加载对任何表 0 次 INSERT／UPDATE／DELETE、计划生成器 0 次解析（R-6、D46③） | `opportunities-route-service` 加载测试（阶段边界夹具 + SQL 写语句计数 + 生成器 factory spy） |
| SC-W0050-02 缺口补法 | 未满足的需求下显示最多 2 场活动与「待确认 N」，点开 `PlanMatchSheet` 只列该需求候选 | `tests/services/opportunities-view-model.test.ts`（活动筛选与排序） |
| SC-W0050-03 本周建议动作 | 机会标签列出本周计划行动与「N 位待确认」入口，行动链接到 `/app/agent/plan#plan-action-<id>` | 页面测试（链接与计数） |
| SC-W0050-04 待唤醒 | 待唤醒区只列 `dormant` 且与目标相关的人，「起草邮件」返回可编辑模板草稿 | `opportunities-view-model.test.ts`（筛选四组） |
| SC-W0050-05 报告卡与页面 | 点报告卡「重新分析」调 recompute 一次，卡片随 `NetworkSnapshotView` 状态变化；用满后按钮置灰 | 页面测试（各状态与按钮） + 1440／375 截图（`~/orbit-sprint-evidence/web/sprint-W0050/run-01/`） |

### 必需证据子表（每条子断言独立留证，缺一即该 SC 不通过）

| SC | 子断言 | 证据 |
| --- | --- | --- |
| 01 | `planNeedCoverage` 全分支：含 1 位 established、1 条超额不抵其他需求 | `tests/services/plan-need-coverage.test.ts` |
| 01 | 替换为任意快照（含写着「覆盖度 90%」的文字）数字不变 | `app-network-opportunities.test.tsx` |
| 01 | 无计划 → 覆盖区只显示「去生成计划」入口（链 `/app/agent/plan`），其余四块照常；计划无需求 → 如实空态 | `app-network-opportunities.test.tsx` |
| 01 | 计划只经 `getCurrent()` + `toOpportunityPlanView` 纯投影；机会标签代码路径无 `getCurrentView`／`enterCurrentPhase` 引用（R-6） | 源码扫描断言 |
| 01 | 加载期间 0 次写入（含 `plan_match_jobs`，D46③）：生效计划还没有 `'plan'` 任务时打开标签也不入队 | 加载测试（按表计数） |
| 02 | 计划点名在前、其余显示真实命中词，已开始／已报名／本人主办的不出现 | `opportunities-view-model.test.ts` |
| 02 | 保存计划版本后入队 1 个 `'plan'` 任务（重复保存同一版本仍 1 个），执行 0 次 AI、每条需求 ≤3 个候选、不动已 dismissed／已关联 | `plan-match-plan-job-postgres.test.ts`（证明未 skip） |
| 02 | **D46③**：生效计划缺 `'plan'` 任务时，`plan-match` 维护任务一轮补入队 1 个（重复跑仍 1 个、每轮不超上限常量），随后照常领取、0 次 AI | `plan-match-plan-job-postgres.test.ts`、维护任务测试 |
| 02 | 迁移 v4 在本机库可重复执行 | 同上 |
| 03 | 拖期标「已延后 N 周」；不生成新内容、0 次 AI | 页面测试 |
| 03 | 机会标签代码路径不 import `features/contact-needs`、不请求 `/api/contacts/needs-matches`、不再请求 `/api/dashboard/opportunities/recompute` | `network-no-contact-needs.test.ts`（静态扫描）；fetch 计数断言 |
| 04 | 非 dormant 或不相关的不出现；无人 →「暂无待唤醒关系」 | `opportunities-view-model.test.ts` |
| 04 | `why` 中英双语、来自真实记录并带依据链接 | 同上 |
| 04 | 起草邮件不发送、不保存、0 次模型调用；他人联系人 id 请求草稿 404 | 路由测试（本人／他人）；`email-draft` 单测 |
| 05 | 报告卡文字与 `NetworkSnapshotView` 一致：生成于／基于 N 人／新增 M 人未纳入、正在更新、后台池用完时「明天更新」且手动按钮仍可用、`none`／`insufficient` | 页面测试 |
| 05 | 手动 3 次后或 429 `MANUAL_REFRESH_LIMIT` →「今天已重新分析 3 次」；用户主动池当日 10 次操作用满或 429 `USER_DAILY_LIMIT` → 置灰并提示「今天次数已用完，明天可用」（已定（D45，2026-10-02）） | 页面测试 |
| 05 | 旧入口全部消失；示例模式机会标签 0 次读取；结构标签不读机会数据 | 页面测试（读取计数） |
| 05 | 1440／375 截图（有计划、无计划各一）无控制台错误 | 证据目录截图与控制台日志 |
| 05 | 单次打开机会标签新增读取字节实测（含 `getCurrent()` 多读的条目与最近 50 条记录，如实计量；超 D39 预算另加只读瘦身读取、不在本 Sprint 默认范围，D46④）；REPORT 预算表：开工时 README D32 最新三档 + W0048a 快照读取 + 本项（1000 人 × 每日打开 1 次与 3 次），>1.6 GB 登记 D32 | `measure-opportunities-tab-traffic.ts` 输出 |
| 05 | H 档：全量 `npm test` 对照基线新增失败 0、`npx tsc --noEmit -p .`、一次 Codex 代码 review | 全量清单、review 处理 |

## 一次 Generator 的执行顺序

1. 核对进入条件、W50 已定项、W0047／W0048a 交接名；记哈希与基线；对 `readPublicUpcomingEvents`、`createPlanMatchingService` 的 HIGH 先报告（本 Sprint 都不改它们）。
2. 纯函数：`planNeedCoverage`、`needEventRows`、待唤醒筛选与 `why` 拼句（RED → GREEN）。
3. 存储：`matching-migrations.ts` v4 + `'plan'` 入队 + 路由保存后入队 + `plan-match` 维护任务兜底入队（D46③）（postgres 测试）。
4. 装配 `loadOpportunitiesTab` 与新组件，删旧入口，报告卡接 W0048a API；URL 驱动标签。
5. 浏览器验证、流量实测；按操作链提交（规则与存储／页面），`detect-changes --scope staged`，REPORT，交接。

## 最小测试与检查

- **档位 H**（迁移改约束、计划写路径加入队、共享页面）。数据库测试前 `node scripts/assert-local-test-databases.mjs`，REPORT 证明未 skip。
- 开发定向集：SC 表所列新测试。
- 收口集：`tests/pages/app-network-{demo-pages,demo-mode,overview,pipeline}.test.tsx`、`app-contacts-dashboard-account-scope.test.ts`、`app-contacts-analysis-view-model.test.ts`、`tests/capabilities/plan-matching.test.ts`、`tests/services/plan-matching-rules.test.ts`、`tests/api/{agent-plans-bootstrap-route,agent-plans-reanalyze-route,agent-plan-candidates-routes}.test.ts`、`tests/pages/app-plan-match-sheet.test.tsx`；`npx tsc --noEmit -p .`。
- 全量：本地代码收口一次 `npm test`，按 RULES 5.2 对照基线；不 source `.env`。
- 浏览器：`orbits` 端口 3000（占用即复用），cookie 注入；本机测试账号需有生效计划、≥1 条已关联需求、≥1 位 dormant 联系人（用测试库种子，不碰真实用户数据）；证据 `~/orbit-sprint-evidence/web/sprint-W0050/run-01/`。
- 不运行：App 端、`shared/compute` 消费者（未改）、付费 AI。

## 失败与交接

依赖未合并：不启动。W0047 未交接批量强度读取：SC-04 记 blocked，其余照常，不降低 SC。
REPORT 交接：`planNeedCoverage` 签名与口径、`OpportunitiesTabView`、`readPublicBookableEvents`、`'plan'` 任务的入队函数、维护任务兜底入队的位置与每轮上限常量（D46③）、`reconnect-draft` 接口、标签 URL 方案、预算表；W0055 待删清单（`contacts.analysis` 网页入口已断、`contact-needs` 网页无引用）。列本线分支、固定最终 SHA，交协调者合并 `chat-agent`。

## 已定（D44，2026-10-02）

| 编号 | 定稿结论 | 对标做法 |
| --- | --- | --- |
| W50-1 | 每条需求的目标人数只存 `criteria.targetCount`（W0048b 由 AI 给 1–5），老计划与 W0048b 合并前缺省 1；总覆盖度 `Σmin(已有, 目标) ÷ Σ目标`，超额不抵其他需求 | HubSpot Goals 每个目标有自己的目标值、达成度按目标封顶；Linear 项目进度 = 已完成范围 ÷ 总范围 |
| W50-2 | 现有联系人经规则层任务进同一张 `plan_match_candidates`（0 次 AI、每条需求 ≤3 个），确认／忽略沿用三处共用组件，忽略后不再出现 | LinkedIn「可能认识的人」持久化建议、忽略后不再推荐；建议与确认用同一组件 |
| W50-3 | 「为什么现在联系」本 Sprint 用规则拼句（最近一条真实记录 + 与目标的关系）；W0051 洞察落地后改读其 `nextStep`，改读不在本 Sprint | HubSpot、LinkedIn 的「重新联系」提示基于具体事实（上次互动、职位变化），不写泛泛理由 |
| W50-4 | 待唤醒「起草邮件」用模板草稿（不调 AI、不发送、不保存）；AI 起草不在 D43 范围，另行决定 | HubSpot Sales 模板 + 个性化字段；止于草稿与现有「约 TA」一致 |
| W50-5 | 标签改为 URL 驱动 `?tab=`（structure／opportunities／insight），服务端只读当前标签的数据 | Linear、HubSpot 的标签可分享、可回退，未打开的标签不预取数据 |
| W50-6 | 每条需求活动 ≤2 场、候选 ≤3 位；本周行动全部显示；待唤醒 ≤5 人；其余「查看全部」进对应页 | LinkedIn、HubSpot 卡片只放前 2–5 条并提供「查看全部」 |
| W50-7 | 网页机会标签下线 iOrbit 聊天报告入口，统一用快照；`/api/mobile/contacts-dashboard` 的 `analysis` 字段不动（App 仍用），代码删除放 W0055 | 单一事实来源：同一份分析只在一个地方生成与展示，旧入口下线而不是并存 |
