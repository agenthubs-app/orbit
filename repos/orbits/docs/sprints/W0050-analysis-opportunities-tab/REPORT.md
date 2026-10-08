# Sprint W0050 — 执行总结

> 报告由协调者按 Generator 原文写入（子代理写文件被拦）。

## 结果

「机会」标签（`/app/contacts/dashboard?tab=opportunities`）按五块重做，五个 SC 都通过，全程付费 AI 0 次。

**已验证能做的**
- **规则覆盖度**：数字只按计划人脉需求算——已确认关联的人数（linked 与 established 都算）对比 `targetCount`（缺省按 1），总覆盖度 = Σmin ÷ Σ目标，超额不抵其他需求。快照里写什么都不改变数字。没有计划时，只有覆盖区换成「去生成计划」，其余四块照常显示。
- **缺口补法**：每条还缺人的需求下：
  - 最多 2 场活动，计划点名的在前，其余显示真实命中词；
  - 「待确认 N」打开三处共用的 `PlanMatchSheet`，只列这条需求的候选；点「是」后覆盖数字当场更新；
  - 快照的 gap 句子只在依据可见时显示。
- **现有联系人进「待确认」**：计划版本保存后入队一个 `'plan'` 规则层任务，0 次 AI，每条需求最多 3 个候选。`plan-match` 维护任务每轮兜底补入队。
- **本周建议动作**：列出计划本周的行动（拖期的标「已延后 N 周」），直链 `/app/agent/plan#plan-action-<id>`；另有「N 位待确认」入口。
- **待唤醒**：只列 dormant 且与目标相关的联系人。理由由规则拼成（中英双语），依据是真实记录。「起草邮件」返回可编辑的模板草稿：不发送、不保存、不调模型。
- **报告卡**：显示「生成于／基于 N 人／新增 M 人未纳入」、正在更新、后台池用完时「明天更新」。「重新分析」走用户主动池；手动 3 次或用户池 10 次用满后按钮置灰。
- **打开机会标签对任何表 0 次写入**：
  - 加载器测试和真实 page 入口测试都证明了这一点；
  - 夹具处在「强度缓存待重算」和「快照待自动重算」状态；
  - 计划生成器 0 次，付费 AI 0 次。
- **下线**：网页机会标签上的「⟳ 刷新机会」、固定阈值覆盖拨盘、「高价值／核心关系」、规则重排的建议动作、「去 iOrbit 分析」。

**仍不能做 / 不在本 Sprint**
- 机会标签读的是上次算好的强度缓存，不刷新（review P1 改判）。如果用户只开机会标签，待唤醒可能晚一天反映；刷新由概览、结构、管线等入口负责。
- 依据链接到联系人详情页。时间线没有逐条记录锚点，记录 id 放在 `data-network-dormant-evidence` 里。
- 「为什么现在联系」暂时用规则拼句；W0051 洞察落地后改读 `nextStep`。
- `plan_match_jobs` 迁移 v4 只在本机库执行过，生产执行需另行授权。

## 运行记录

- **结果**：completed（待协调者合并 `chat-agent` 并验证合并树）
- **Generator**：Opus 5.5，2026-10-03；PLANNER revision 4，SHA256 `faa565915936c864942e8433602fff4fc66f3a3c1d9e5d7c0fd6700f3661c5fa`（开工核对一致）
- **基线**：`chat-agent` `eeccc2d4`；分支 `sprint/W0050-analysis-opportunities-tab`（当前工作树）
- **提交**：`8754d72e` 功能 → `a6706281` review 修复 → **`cd37a751` 全量回归修复（固定最终代码 SHA）**；本报告由协调者写入
- **档位**：H
- **全量对照**（RULES 5.2，两次运行用同一组库变量，没有 source .env）：

| 运行 | tests | fail | 新增失败 |
|---|---|---|---|
| 基线 `eeccc2d4`（detach 后跑） | 6494 | 81 | — |
| 改后第一次 | 6538 | 84 | 3 |
| 最终 | 6538 | 82 | 1（偶发） |

  - 改后第一次的 3 条：1 条是本 Sprint 引起的 W0017 空闲语句数，已在 `cd37a751` 修复；另 2 条（personal-schedule、canonical-inbox）单独跑 3/3 通过，属于偶发。
  - 最终的 1 条 `notification-discovery-bounds` 在 W0049 的基线清单里也有，单独跑 3/3 通过（`flaky-rerun.txt`）。
- **付费 AI**：0 次。`ai_usage_calls`／`ai_usage_ledger` 在开工之后没有新行（`paid-ai-ledger-check-2.txt`）。
- **push**：未做
- **证据目录**：`~/orbit-sprint-evidence/web/sprint-W0050/run-01/`

## 验收结果

| SC | 结果 | 主证据 |
| --- | --- | --- |
| SC-W0050-01 规则覆盖度、计划只读 | pass | `tests/services/opportunities-tab-loader-postgres.test.ts`（夹具：计划处在阶段边界、快照待自动重算；每张表的写入触发器计数为 0，补细器、生成器、付费主机都是 0，另有对照组）；`tests/pages/app-contacts-dashboard-opportunities-writes-postgres.test.ts`（真实 page 入口，强度缓存待重算：机会标签 0 写入，结构标签作为对照会写）；`plan-need-coverage.test.ts`；`network-no-contact-needs.test.ts` 源码扫描 |
| SC-W0050-02 缺口补法 | pass | `opportunities-view-model.test.ts`（活动规则与排序、gap 依据）；`plan-match-plan-job-postgres.test.ts`（v4 可重复执行；入队幂等；两个连接并发入队只有 1 个任务、1 次调度；0 AI；每条需求 ≤3；dismissed 与已关联不动；维护任务兜底与每轮上限 20）；bootstrap／reanalyze 路由测试；页面测试（弹层只列该需求；点「是」后覆盖更新） |
| SC-W0050-03 本周建议动作 | pass | `app-network-opportunities.test.tsx`（直链、「已延后 N 周」、「N 位待确认」、挂载时 fetch 0 次）；`network-no-contact-needs.test.ts` |
| SC-W0050-04 待唤醒 | pass | `opportunities-view-model.test.ts`（四组筛选、双语、依据、最多 5 人、草稿模板）；`contact-reconnect-draft-route.test.ts`（本人 200；他人、已删除、不存在 404；0 写入；0 次模型调用） |
| SC-W0050-05 报告卡与页面 | pass | 页面测试（9 种状态；recompute 只调一次；两种 429；旧入口消失；英文分隔符）；demo-pages／account-scope（示例模式 0 读取，结构标签不读机会数据）；截图 `screens/01–11`（1440／375、中英文、无计划账号、有 AI 计划账号；控制台错误 0；375 宽无横向溢出）；`traffic-measure.json` |

**数据库测试逐文件非 skip 输出**（`db-tests-per-file-2.txt`；开测前跑了 `assert-local-test-databases`，exit 0）：

| 文件 | tests | pass | fail | skipped |
|---|---|---|---|---|
| `tests/services/opportunities-tab-loader-postgres.test.ts` | 2 | 2 | 0 | **0** |
| `tests/pages/app-contacts-dashboard-opportunities-writes-postgres.test.ts` | 1 | 1 | 0 | **0** |
| `tests/capabilities/plan-match-plan-job-postgres.test.ts` | 4 | 4 | 0 | **0** |
| `tests/api/contact-reconnect-draft-route.test.ts` | 1 | 1 | 0 | **0** |
| `tests/capabilities/plan-matching.test.ts` | 16 | 16 | 0 | **0** |
| `tests/capabilities/plan-maintenance-daily-gate-postgres.test.ts` | 5 | 5 | 0 | **0** |
| `tests/api/agent-plan-candidates-routes.test.ts` | 12 | 12 | 0 | **0** |
| `tests/services/structure-tab-loader-postgres.test.ts` | 3 | 3 | 0 | **0** |
| `tests/services/network-snapshot-service.test.ts` | 16 | 16 | 0 | **0** |
| `tests/capabilities/network-snapshot-postgres.test.ts` | 6 | 6 | 0 | **0** |

收口集 28 个文件全绿、0 skip（`closing-set-2.txt`）。`npx tsc --noEmit -p .` 源码 0 错，只有 `.next/types` 过期产物。read-cost 基线 2/2，没有上调预算。

## D39 流量

本机 live 库 verify-plan 实测，脚本 `scripts/measure-opportunities-tab-traffic.ts`，结果在 `traffic-measure.json`。

**单次打开机会标签**：17 条语句，13,225 B。

| 读取 | 字节 | 语句 |
|---|---|---|
| 计划 `getCurrent()`（D46④ 多读如实计量） | 7,476 | 5 |
| 快照 `readView(…, {enqueue:false})` | 4,880 | 8 |
| 待唤醒 | 379 | 1 |
| 待确认 | 305 | 2 |
| gap 依据姓名 | 0（本账号无） | 0 |
| 活动目录 + 本人报名（只在有还缺人的需求时读） | 7,980 | 3 |

**与 W0049 去重**：计划和快照两项 W0049 已按「分析子页每次打开」入账；机会标签不再读结构依据姓名（−384 B）。去重后净增：
- verify-plan 的需求全部已满足：485 B/次；
- 上限口径（加回活动读取）：8,465 B/次。

review 修复后，机会标签还省掉了强度刷新的来源戳读取（约 542 B/次），以下数字没有扣除。

**折算**（1000 人 × 每天打开机会标签 1 次／3 次 × 30 天）：

| 口径 | 每天 1 次 | 每天 3 次 |
|---|---|---|
| 直接相加 | 396.8 MB | 1,190.3 MB |
| 去重净增（上限口径） | 254.0 MB | 761.9 MB |

**并入 README D32**（W0049 后三档为 4,937／4,997／5,476 MB）：
- 每天 1 次 → **5,191／5,251／5,730 MB**
- 每天 3 次 → **5,699／5,759／6,238 MB**

都超过 1.6 GB，按惯例登记 D32。维护任务每轮多一条 0 行的 `insert … select` 补扫，不返回行。

**瘦身候选**：
1. 活动目录走 D39 的服务端共享缓存（它是净增的大头）；
2. 计划需求只读投影（W0049 已列，约省 7 KB/次）；
3. `readView` 不重复读资料（W0048a 侧）。

## 假设与额外阅读

- **额外阅读**：
  - W0049 REPORT 全文：读交接时发现 `readView` 会排队；
  - `features/network-analysis/{service,runtime,contract}.ts`；
  - `features/relationship-strength/{read-model,timelines}.ts`、`shared/contract/relationship-{strength,timeline}.ts`；
  - `plan-match-sheet.tsx`／`plan-match-client.ts`；
  - `tests/support/{plan-matching-harness,network-analysis-harness}.ts`；
  - `tests/ui/orbit-0918-anchor-colour.test.ts`；
  - `tests/capabilities/plan-maintenance-daily-gate-postgres.test.ts`。
- **登记的文件补充（RULES §0）**：
  - `app/(app)/app/contacts/analysis/opportunities-report-card.ts`：放客户端安全的纯函数，避免客户端组件引入服务端模块；
  - `app/api/contacts/[id]/reconnect-draft/route-handlers.ts`；
  - `features/network-analysis/service.ts`：`readView` 加可选 `{ enqueue }`，默认行为不变；
  - `features/plans/matching-runtime.ts`：新增 `enqueuePlanSourceMatchAfterSave`；
  - `network-analysis-structure.tsx`：只把 `EvidenceToggle` 改为导出；
  - 新测试：`tests/services/opportunities-tab-loader-postgres.test.ts`、`tests/pages/app-contacts-dashboard-opportunities-writes-postgres.test.ts`、`tests/api/contact-reconnect-draft-route.test.ts`。
- **改动的已有测试**：
  - 旧设计断言换成新设计：`app-network-overview`；
  - 新行为导致：`plan-matching`（维护任务 summary 多了 `planJobsEnqueued`）、`plan-maintenance-daily-gate-postgres`（空闲轮次多一条 0 行补扫）；
  - 补 W50-5 的 mock：`app-network-demo-pages`、`app-contacts-dashboard-account-scope`；
  - 补入队断言：`agent-plans-{bootstrap,reanalyze}-route`。
- **自定的可逆细节**（按成熟惯例）：
  1. 「缺口补法」单独成块，只列还缺人的需求；
  2. 「设置关系目标」放在覆盖块右上角；
  3. 依据链接到联系人详情页；
  4. 起草邮件里的目标 = 计划目标，没有就用资料里的关系目标，并去掉末尾句号；
  5. 「查看全部」：缺口补法链到计划页，待唤醒链到管线页；
  6. `'plan'` 任务带本人最近 200 位联系人（按 created_at），计划没有人脉需求时不入队；
  7. 报告卡在 `unavailable`／`insufficient` 状态下不显示按钮；
  8. 补扫写成 `insert … select`，不用 CTE。
- **本机测试库写入**（只动 verify 账号，可撤销）：
  - plan_matching 迁移 v4 已在本机 public schema 执行；
  - 为浏览器验证改了 verify-plan：need1 设 `targetCount=2`；新增需求 `w0050-seed:need-pilot`，关联已是 dormant 的田中爱子；入队并执行了 1 个 `'plan'` 任务，产出 2 个规则候选；
  - 撤销：证据目录 `browser-seed.ts --revert`。

## review 处理（Codex：1×P1、1×P2、2×P3，全部采纳）

| 意见 | 判断 | 处理 |
| --- | --- | --- |
| P1 打开机会标签仍可能写库：page 无条件调用 `ensureRelationshipStrengthsForPage` | 采纳；**协调者改判**：第一段曾建议「强度缓存刷新不算业务写入」，等于放宽验收条件，已撤回；D46③ 按字面执行，任意表 0 写入 | 先解析标签。机会标签不刷新强度缓存，读上次算好的结果；缓存为空时待唤醒如实显示空态。结构、概览、管线照旧刷新。新增真实 page 入口的数据库测试：夹具处在强度待重算状态，机会标签 0 写入（每张表的触发器计数和进程内所有 pg 写语句都是 0），结构标签作为对照会写。已确认修复前这个测试失败、修复后通过 |
| P2 接受候选后覆盖度不更新 | 采纳 | 「是/不是」的结果传到机会页；点「是」时同步更新该需求的已有／还缺人数和总百分比。页面测试实际点「不是」和「是」，断言 75%→100%、「已满足」、缺口消失、待确认数减 1 |
| P3 并发入队只测了串行 | 采纳 | 两个独立连接池 `Promise.all` 同时入队，跑 5 轮，每轮 1 个任务、1 次调度 |
| P3 英文目标行混入全角冒号 | 采纳 | 分隔符放进双语文本：`Relationship goal: `／`关系目标：`，并加了断言 |

协调者对第一段两个问题的裁决：
- 第 1 题按推荐：结构标签和 GET 接口照旧排队，机会标签只读；
- 第 2 题改判，见上表 P1。

## 影响分析（GitNexus，开工前强制全量重建索引）

- **CRITICAL**：`createNetworkSnapshotService`（11）。只给 `readView` 加了一个可选参数，默认行为不变。
- **HIGH**：
  - `createPostgresPlanMatchRepository`（14）：只新增可选方法，`sourceKind` 联合类型加 `'plan'`；
  - `readPublicUpcomingEvents`（6）：没改；
  - `createPlanMatchingService`（14）：没改。
- **LOW**：`runClaimedMatchJob`、`createPlanMatchMaintenanceTask`、两个路由 handler、迁移、`mapJob`、`createTemplatePlanEmailDraftProvider`（没改它，另加了新函数）。
- **UNKNOWN 已用文本搜索补查**：`NetworkAnalysis`、`AppContactsDashboardPage`。
- **提交前 `detect-changes --scope staged`**：
  - 功能提交：critical，36 个文件；
  - review 修复：high，5 个文件；
  - 回归修复：2 个文件，没有重叠的已索引符号；
  - 三次都没有 partial/truncated。分支上没有外来提交。

## 交接

- **`features/plans/coverage.ts`**（W0052 驾驶舱可复用）：
  - `planNeedCoverage(needs: {id, criteria:{targetCount?}|null, contactLinks:{contactId}[]}[]) → { percent: number|null; needs: {needId, have, target, missing}[] }`；
  - `planNeedTarget(criteria)`：只认 1–5 的整数，其他一律按 1；
  - `toOpportunityPlanView(getCurrent 快照, now)`：只读投影。
- **视图、加载器与组件**：
  - `OpportunitiesTabView`（`opportunities-view-model.ts`）：`coverage` 为 `no_plan | unavailable | ready{percent, needs[]}`；另有 `weekActions{planActions|null, pendingMatches|null}`、`dormant[]|null`、`report: NetworkSnapshotView`；需求行带 `candidates`（≤3）；
  - 加载器 `loadOpportunitiesTab({actorId, language, now, goal})`，依赖可注入；
  - 组件 `NetworkOpportunities`；`NetworkAnalysis` 新增 `opportunities` prop，导出 `ANALYSIS_TAB_HREF`。
- **读取函数**：
  - `readPublicBookableEvents`：与原函数同一候选规则，多带 `description`；
  - `readDormantCandidates`：一条 SQL，取 dormant 强度行与本人联系人，并带最近一条信号。
- **`'plan'` 匹配任务**（`features/plans/plan-match-plan-job.ts`）：
  - `source_kind='plan'`、`source_key=计划 id`、`ai_state='skipped'`；
  - 入队：`enqueuePlanSourceMatchJob`；repository 上有 `enqueuePlanJob`／`claimPlanJob`；路由侧用 `enqueuePlanSourceMatchAfterSave`（保存后入队，在 `after()` 里执行）；
  - 兜底：`plan-match` 维护任务里的 `enqueueMissingPlanJobs`，每轮上限 `PLAN_MATCH_PLAN_BACKFILL_LIMIT = 20`；
  - 每条需求候选上限 `PLAN_MATCH_PLAN_CANDIDATES_PER_NEED = 3`。
- **接口**：`POST /api/contacts/:id/reconnect-draft` → `{ draft: { subject, body, provider:"template" } }`。
- **标签方案**：URL 驱动 `?tab=structure|opportunities`，服务端只读当前标签的数据；机会标签不刷新强度缓存。
- **快照只读读取**：`readView(actorId, lang, { enqueue: false })`。
- **W0055 待删清单**：
  - 网页机会标签已断开 `contacts.analysis` 的 iOrbit 入口（`stashAgentPrefill`）；
  - 网页不再请求 `/api/dashboard/opportunities/recompute`；
  - `features/contact-needs` 与 `/api/contacts/needs-matches` 在网页上没有引用；
  - `ContactsAnalysisView` 的 `opportunities`／`coverage` 区块在网页机会标签上已不用（概览仍在用）。
- **需要授权**：`plan_match_jobs` 迁移 v4 在生产执行（可随 W0055 的生产迁移一起）。
- **回退**：按序 revert `cd37a751`、`a6706281`、`8754d72e`。迁移 v4 只放宽了 check 约束，回退代码不需要回退迁移。

## 需要用户决定

无。D32 按惯例登记，数字见上文 D39 节。
