# Sprint W0048a — 共享人脉分析快照（存储、生成与校验、三层更新）与两池 AI 配额账本

> revision 4：按 D46 修订（②⑦）：`max_calls` 表中计划生成 14 → 4（骨架 1 + 前 2 个阶段 + 快照 1），「季度补细」改为「未细化阶段到期前补细」（仍计后台池、每阶段 1 次操作）；基线行号以开工时 HEAD 为准、按符号重定位。
>
> revision 3：按 REVIEW-2026-10-02-network 裁决修订（R-2、R-3、R-5、R-6、R-11、R-16，配额口径统一）：额度按操作计次、成本按每次 HTTP 一条子账（`ai_usage_calls`，以 operation id 聚合），持有操作者唯一结算，`generateSnapshotNow` 在外部操作下不结算；自动路径排队只 upsert job，worker 取得租约后预留一次并写回 `operation_id`，补崩溃／租约回收用例；`sourceDataVersion` 按来源定义版本算法（`plan_log` 用 `count/sum/max(seq)`）；计划只读 `getCurrent()`；用户主动池总熔断每人每东京日 10 次操作（含手动重新分析 3 次，数值已定（D45，2026-10-02））；验收契约改为「操作链 + 主证据」+ 必需证据子表。
>
> revision 2：按 D44 定稿待定项、W0048 拆分、配额两池（2026-10-02）。本 Sprint 由原 W0048 rev 1 的 SC-01～04 拆出（C-2／W48-1），配额按 C-5 改为两池。

**Plan revision:** 4。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** RN-06 中「快照、三层更新、配额」部分；共享契约「人脉分析快照 NetworkAnalysisSnapshot」「AI 调用配额」在本 Sprint 定稿（rev 3：按操作计次 + 每次 HTTP 一条成本子账）；D43（名片识别不计入）、D44（C-2 拆分、C-5 两池）。计划接 DeepSeek、老模板计划重新生成、读取路径 0 调用在 [W0048b](../W0048b-plan-ai-generator/PLANNER.md)。
**单一目标:** 快照按人存储、可单独重算、按三层规则更新；全部受账本计量的 AI 操作记在 `ai_usage_ledger`（一行一次操作，按 `pool` 分「用户主动」与「后台自动」两池，额度按操作计），每次供应商 HTTP 记一条成本子账 `ai_usage_calls`；提供三层更新入口供导入、回填复用；W0046 的 memo 提取闸门由本 Sprint 开启。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 开工时 `chat-agent` HEAD（编制时 `a48e1749`）。W0045／W0046／W0047 合并后才开工，下文行号按 `a48e1749`，开工时按符号重新定位。 **行号以开工时 HEAD 为准，按符号重定位（D46⑦）。**
**进入条件:**
- **W0045、W0046、W0047 completed**（登记表依赖），REPORT 交接了补全字段（`enrichment.fields`、`canWriteEnrichedValue`、按文字补全入口）、`RelationshipTimelineItem` 与读取函数、`AiQuotaGate` 接口（`reserve`／`beginCall`／`endCall`／`finish`）及其注入点、`RelationshipStrength` 的存储与读取函数；本文用契约名，**具体字段以其 REPORT 为准**。角色层级唯一存储 `publicProfile.seniorityLevel`（6 档），4 档是派生分组 `seniorityGroup()`，不新增字段。
- W48-1～W48-10 已定（D44，见文末；W48-9 与 W48-10 在本 Sprint 只涉及「不切生产」与 `plan_refine` 计入后台池）。
- 付费调用：D42／D43 已批准快照接 DeepSeek；开发与测试默认 mock，真实调用上限见 SC-W0048a-05。生产库迁移、生产环境变量切换不在本 Sprint（W48-9，放 W0055 一起授权）。

## 已查清的事实（按 `a48e1749`）

1. 现有分析报告存为 iOrbit 会话，版本 `contactsAnalysisGraphSourceDataVersion`；`readDashboardGraphState` 一条语句取六个集合的 `count:sum:max(sync_revision)`。本 Sprint 不动聊天报告。
2. DeepSeek 写法照 `ai-matcher.ts`（`json_object`、`thinking` 禁用、超时 + signal、usage 回传、失败也带 usage）。后台：维护 pass（每日 cron + 600 s 心跳，注册 `configured-tasks.ts`）+ `after()`。
3. 快照输入的联系人裁剪可复用计划输入的单一来源 `PLAN_INPUT_CONTACTS_SQL` + `selectPlanContacts`（≤200，只读）。**计划读取只用只读入口**（R-6，编制时按 `4f0aa533` 核实）：`PlanService.getCurrent()`（`features/plans/service.ts:688`）只开 `repository.read`、经 `snapshotOf` 读计划行 + 全部条目 + 最近 50 条 `plan_log`，0 写入；`getCurrentView()`（`service.ts:1290`）在阶段边界会执行 `enterPhaseTransaction()` 写「进入新阶段」记录并经 `defaultPhaseRefiner()`（`phase-refinement.ts:120`）解析生成器——**本 Sprint 任何路径不得调用 `getCurrentView`／`enterCurrentPhase`**；`planNeedVersion` 用 C 节的直接只读 SQL，快照输入里的需求用 `getCurrent()` 的结果做纯投影。
4. 「待确认」入队现成：`enqueuePlanMatchJob(client, { workspaceId, actorId, batchId, contactIds, singleCard, at? })`（≤200 人、幂等、表缺失返回 skipped），唯一调用方是名片批次完成事务。三层更新入口的 ② 层调用它，不改它。
5. 月度重新分析额度记在 `plan_log` 键 `reanalysis:<YYYY-MM>`（`service.ts:711`）；本 Sprint 不碰（计划侧在 W0048b）。

## 契约定稿（本 Sprint 落地，REPORT 交接最终名）

### A. NetworkAnalysisSnapshot（`features/network-analysis/contract.ts`）

```ts
type SnapshotBlockKind = "diagnosis" | "insight" | "gap" | "plan";
interface SnapshotEvidence { contactIds: string[]; recordIds: string[] } // recordIds = RelationshipTimelineItem.id
interface SnapshotBlock { key: string; kind: SnapshotBlockKind; text: { zh: string; en: string }; evidence: SnapshotEvidence; needId?: string }
interface NetworkAnalysisSnapshot {
  id: string; actorId: string; version: number;
  origin: "plan" | "standalone"; planId: string | null;
  trigger: "first" | "threshold" | "goal_changed" | "manual" | "plan";
  sourceDataVersion: string;            // 64 hex
  goalDigest: string;                   // 生成时目标原文的 sha256，只作来历，不是目标的副本
  generatedAt: string;
  contactCount: number;                 // = includedContactIds.length（库里 CHECK 保证）
  includedContactIds: string[];         // 只在写入与阈值比较时读，页面读取路径不取
  blocks: SnapshotBlock[];              // diagnosis 1 条、insight 2–3 条、gap 0–N 条（可挂 needId）、plan 0–1 条
  generator: { provider: "deepseek" | "mock"; model: string; promptVersion: string };
}
```

- **不存任何统计数字**：分布、档位人数、覆盖度、分数一律实时规则算（W0049／W0050）；解析器只认上表字段，模型多给的字段（如 `coverageScore`）丢弃。
- `origin: "plan"` 由 W0048b 的计划流水线经本 Sprint 导出的同步生成入口写入（见 D）；本 Sprint 自身只产生 `standalone`。
- 页面视图 `NetworkSnapshotView`（W0049～W0052 共用；仓储另提供 `getCurrent(actorId, { languages })` 供需要双语的调用方）：`state: "ready" | "none" | "insufficient" | "unavailable"`；`generatedAt`、`contactCount`；`blocks: { key; kind; text: string; evidence: SnapshotEvidence; needId? }[]`（只带**请求语言**的文字与依据，非 `ready` 时为空数组；W0049～W0052 一律读 `blocks` 与 `freshness.stale`，不自行定义 `language.{zh,en}` 或顶层 `stale` 形态，R-12）；`freshness { stale; newContactCount; job: "none" | "queued" | "running" | "deferred"; retryOn?: string }`；`quota { manual: { usedToday; limit: 3 }; user: { usedToday; limit: 10 }; background: { usedToday; limit: 60; retryOn?: string } }`（单位都是「次操作」；`user` 是用户主动池总熔断，含 `manual`，R-11 数值已定（D45，2026-10-02））。依据里已删除的联系人在读取时剔除，剔空的块不返回。

### B. 存储（新迁移 `features/network-analysis/migrations.ts`，锁键 `orbit:network-analysis-schema`）

| 表 | 要点 |
| --- | --- |
| `network_analysis_snapshots` | `(workspace_id, id)` 主键；`actor_id`、`version`（每人递增，`unique (workspace_id, actor_id, version)`）、`status in ('current','superseded')` + 部分唯一索引「每人一份 current」；`origin`、`plan_id`（`origin='plan'` ⇔ 非空）、`trigger`、`source_data_version`（`~ '^[0-9a-f]{64}$'`）、`goal_digest`、`included_contact_ids text[]`、`contact_count`（`= cardinality(included_contact_ids)`）、`narrative_zh jsonb`、`narrative_en jsonb`（按语言分列，读取只取一列）、`evidence jsonb`（按块 key，语言无关只存一份）、`provider/model/prompt_version`、`operation_id`（指向账本操作行）、`generated_at`。写新版本、归档旧版、修剪到每人最近 12 版（W48-4）在**同一事务**。 |
| `ai_usage_ledger`（W0046 只定义闸门接口、不建表，账本由本 Sprint 建） | **一行 = 一次操作**（额度只数这张表）：`id`（= operation id）、`usage_day date`（东京）、**`pool in ('user','background','system')`**、`purpose in ('plan','plan_refine','snapshot','memo_extraction','insight','enrichment')`（与 W0046／W0048b／W0051／W0053 的 purpose 名一致）、`trigger in ('auto','manual','plan')`、`idempotency_key`（`unique (workspace_id, actor_id, idempotency_key)`）、`status in ('reserved','succeeded','failed','released')`、`max_calls`（本操作允许的 HTTP 上限，见 E）、`created_at`、`finished_at`。不另存计数器。 |
| `ai_usage_calls`（成本子账） | **一行 = 一次供应商 HTTP**：`(workspace_id, operation_id, seq)` 主键、外键指向账本操作行；`provider`、`model`、`status in ('started','responded','no_response')`、`input_tokens`、`output_tokens`、`started_at`、`ended_at`。HTTP 发出**之前**插入 `started` 行（插入时在同一语句里校验 `seq ≤ max_calls`，超出则拒绝且不发请求），拿到响应（含输出无效）改 `responded` 并写 token，超时／断线改 `no_response`。成本、调用次数、token 一律按 `operation_id` 聚合这张表得出。 |
| `network_analysis_jobs` | 主键 `(workspace_id, actor_id, kind)`，`kind in ('snapshot','enrichment')`：`status in ('pending','running','deferred')`、`trigger`、`not_before`、租约列（`lease_owner`、`lease_expires_at`）、`attempt_count`、**`operation_id text null`**（worker 取得租约并预留后写回，R-2）；`enrichment` 行另带 `contact_ids text[]`（待补全、去重、上限 200）与 `source_key`。后台任务单飞，完成即删行。 |

月度重新分析额度**仍只记在 `plan_log` 的 `reanalysis:<YYYY-MM>`**，不复制进账本。迁移只写文件、注册到 `scripts/migrate-web-runtime.ts`、在本机测试库验证；生产执行另行授权（W48-9）。

### C. sourceDataVersion（按来源分别定义版本算法，R-5）

`sha256(JSON.stringify(["network.snapshot@2", promptVersion, contactsAnalysisGraphSourceDataVersion(graphVersion, profileSection), planNeedVersion, strengthVersion, timelineVersion]))`

| 组成 | 来源 | 版本算法（只读、一条小查询） | 删除如何体现 |
| --- | --- | --- | --- |
| `graphVersion` | `orbit_records` 六集合（`DASHBOARD_GRAPH_VERSION_COLLECTIONS`，含 `contacts`、`contact_detail_states`、`connections`、`tasks` 等） | 复用 `readDashboardGraphState`：`count:sum:max(sync_revision)`；`profileSection` 用 `contactsAnalysisProfileInput`（含目标原文） | `count` 与 `sum` 变化 |
| `timelineVersion` | `orbit_records` 中 W0046 时间线来源、但不在六集合内的集合（`notes`、`human_encounters`、`personal_schedule_items`，以 W0046 REPORT 的来源清单为准） | 同一 `count:sum:max(sync_revision)` 写法，按 actor 与集合名过滤，一条语句 | 同上 |
| `planLogVersion`（并入 `timelineVersion` 数组） | 独立表 `plan_log`（**没有 `sync_revision`**，只有 identity `seq`、`created_at`；`features/plans/migrations.ts` 的 `create table plan_log`） | `count(*):coalesce(sum(seq),0):coalesce(max(seq),0)`，`where workspace_id = $1 and actor_id = $2`；只追加，行只会随计划级联删除 | 级联删除使 `count`／`sum` 变化 |
| `planNeedVersion` | 独立表 `plans`／`plan_items`（`plans.version`、`plan_items.updated_at`；无 `sync_revision`） | 生效计划 `id:version` + `network_need` 条目 `count(*)`、`max(updated_at)`、`sum(extract(epoch from updated_at))`；无生效计划为 `"none"`；**直接 SQL 只读**，不经 `PlanService.getCurrentView`（R-6） | 条目删除使 `count`／`sum` 变化；换计划使 `id:version` 变化 |
| `strengthVersion` | W0047 `relationship_strengths`（`orbit_records` 新集合，W47-1） | 取 W0047 REPORT 交接的 `sourceStamp` + `rulesVersion` | 由 W0047 的 `sourceStamp` 定义覆盖 |

- **不改** `DASHBOARD_GRAPH_VERSION_COLLECTIONS`（会让仪表盘快照全部失效）。
- 每个来源各有一条「**只改这一来源 → 版本变；其余来源不变 → 版本不变**」的测试（SC-03 子表），含 `plan_log` 追加一条、`plan_items` 改一条需求、删一条需求、`notes` 新增、强度 `rulesVersion` 变化。

### D. 三层更新与触发（纯函数 `decideSnapshotRefresh`，`features/network-analysis/refresh-policy.ts`）

- ① 事实层：不经快照（W0049 实时规则算）。
- ② 补全 + 规则匹配进「待确认」：**三层更新入口** `runNewContactLayers(input: { actorId; contactIds; sourceKey; now; budget?: "background" | "system" })`（`features/network-analysis/new-contact-layers.ts`，W0053 导入、W0055 回填调用）：对缺行业／职级／地区的联系人调用 W0045 按文字补全（每批 ≤20 人 = **1 次操作**，写入一律过 `canWriteEnrichedValue`），每批先向账本预留一次操作（默认 `pool: "background"`、`purpose: "enrichment"`；`budget: "system"` 只给回填脚本，记 `pool: "system"`，W55-5），HTTP 逐次登记子账，批结束由本入口 `finish`；后台池不够时把剩余 id 并入 `network_analysis_jobs(kind='enrichment')`，`not_before = 次日 00:00 东京`，返回 `enrichment: "deferred"` + `retryOn`（W0053 导入记录显示「补全明天继续」）；随后调用 `enqueuePlanMatchJob`（`batchId = sourceKey`，0 次 AI）；最后按下面规则判定快照。
- ③ AI 叙述，按下列顺序判定：
  1. 已确认联系人 < 3 → `insufficient`（不调用；展示由 W0054 做，W48-5）；
  2. 无快照 → `first`，自动；
  3. `sourceDataVersion` 相同 → `fresh`，**0 次模型调用**；
  4. `goalDigest` 变了 → `goal_changed`，自动（W48-3）；
  5. **从不足 3 人恢复**：快照 `included_contact_ids` 中仍为本人已确认联系人的人数 < 3、且当前已确认 ≥ 3 → `threshold`，自动（W54-4，W0054 只消费，不改本规则）；
  6. 新增 N 人（当前已确认且不在 `included_contact_ids` 里，SQL 里一条 `count` 算出，不把 id 列表读回应用）满足 `N ≥ 3` 或 `N ≥ ceil(0.2 × contactCount)` → `threshold`，自动；
  7. 否则 `stale`：只返回 `newContactCount`，由报告卡显示「新增 N 人未纳入 · 更新分析」。
- **自动路径（R-2，唯一预留者 = 取得租约的 worker）**：
  1. 请求路径判定为自动时**只 upsert** `network_analysis_jobs(kind='snapshot')`（`pending`，不预留、不写 `operation_id`），`after()` 尝试领取；维护任务 `network-snapshot` 兜底（每轮最多 10 人，同时消化 `kind='enrichment'` 的顺延行）。
  2. worker 用 CAS 取得租约（`pending`／租约过期的 `running` → `running`，写 `lease_owner`、`lease_expires_at`）后**重新判定**：若已 `fresh`／`insufficient` → 删 job，0 次预留；若 job 上已有 `operation_id`（上一个 worker 预留后崩溃）→ 复用该操作，不再预留；否则向后台池预留 1 次操作（幂等键 `snapshot:auto:<actorId>:<job 创建时刻>`），**同一事务**把 `operation_id` 写回 job。
  3. 后台池不够 → job 改 `deferred`、`not_before = 次日 00:00 东京`、`operation_id` 保持 null，视图 `job: "deferred"` + `retryOn`。
  4. 结束路径全部明确：生成并写入快照 → `finish(succeeded)`、删 job；拿到响应但校验失败 → `finish(failed)`、删 job；0 个子账拿到响应（未发出／无响应）→ `finish` 落为 `released`（不计次），job 回 `pending` 待重试（`attempt_count` 上限 3，超限删 job 并 `released`）；租约过期由下一个 worker 按第 2 步回收并复用 `operation_id`。
- **快照重算永不改写计划**：不调用 `PlanService` 的任何写方法，也不调用会写的 `getCurrentView`／`enterCurrentPhase`；计划阶段与目标只在每月重新分析、到期下一份、用户点 AI 重新生成时吸收（W0048b）。
- 手动重新分析 `POST /api/network/snapshot/recompute`：用户主动池 1 次操作（`purpose='snapshot'`、`trigger='manual'`），每东京日 ≤3 次，且受用户主动池总熔断（见 E）约束；同步执行（`maxDuration` 120），路由是该操作的唯一结算者；第 4 次 429 `MANUAL_REFRESH_LIMIT`、总熔断用满 429 `USER_DAILY_LIMIT`，两者都 0 次调用。
- 同步生成入口 `generateSnapshotNow(input: { actorId; trigger; origin; planId?; operationId; now })`（R-3）：调用方已在账本预留好操作并持有 `operationId`（W0048b 计划流水线用用户主动池的计划操作，手动重新分析路由用自己的操作，worker 用 job 上的操作）；本入口**不预留、不 `finish`**，只在每次 HTTP 前后登记子账，返回 `{ snapshot | null, callsResponded, error? }`，由持有者最终结算一次。

### E. 两池配额（`features/ai-quota/`，W0046／W0048b／W0051／W0053／W0055 共用）

- **额度按「操作」计次（rev 3 统一口径）**：一次快照生成 = 1，一条 memo 提取 = 1，一批洞察（≤20 人）= 1，一批按文字补全（≤20 人）= 1，一次计划生成（bootstrap／reanalysis／next_plan／ai_regenerate，含同请求快照）= 1，一个未细化阶段的补细 = 1（D46②），一次单人洞察重新生成 = 1，一次手动重新分析 = 1。一次操作内部可发多次 HTTP，但额度只算 1 次。
- **成本按「每次供应商 HTTP 一条子账」记**（`ai_usage_calls`），以 `operation_id` 聚合出调用次数与 token；REPORT 的「调用次数与 token」一律从子账聚合。每个操作在 `reserve` 时写定 `max_calls`：快照 1、memo 提取 1、洞察批 1、补全批 1、单人洞察 1、阶段补细 1、计划生成 4（骨架 1 + 前 2 个阶段 + 快照 1，W0048b；D46② 起生成时只细化前 2 个阶段）；子账插入超过 `max_calls` 即拒绝、不发请求。
- **用户主动池 `pool='user'`**：手动重新分析（`snapshot`／`manual`，每东京日 ≤3 次）、计划生成与重生成（`plan`；频次另由计划侧既有规则约束——bootstrap 幂等、每月一次重新分析、next_plan 到期、ai_regenerate 每份老计划一次）、单人洞察「重新生成」（`insight`／`manual`，W51-2；幂等键 `insight-regen:<contactId>:<sourceDataVersion>`，同版本失败后最多再试 1 次）。**总熔断：每人每东京日 10 次操作（含手动重新分析 3 次）**，用满后相关按钮置灰并提示「今天次数已用完，明天可用」，接口返回 429 `USER_DAILY_LIMIT`、0 次调用。**数值已定（D45，2026-10-02）（R-11）**：10 与 3 写成常量 `USER_POOL_DAILY_LIMIT`、`MANUAL_REANALYSIS_DAILY_LIMIT`，用户改数值只改常量。
- **后台自动池 `pool='background'`**：memo 提取（`memo_extraction`）、洞察批量（`insight`／`auto`）、导入补全（`enrichment`）、快照自动重算（`snapshot`／`auto`）、计划未细化阶段到期前补细（`plan_refine`，W48-10／D46②：AI 计划第 3 段起在前一阶段成为当前时补细，W0048b 接入）。**每人每东京日 60 次操作**，每批 ≤20 人；超限 0 次调用、顺延到次日 00:00 东京，对应位置显示「明天更新」（快照报告卡 W0050、洞察 W0051、导入记录「补全明天继续」W0053、未细化阶段 W0048b）。
- **`pool='system'`**：只给回填脚本（W55-5），不计入任何用户额度，受脚本 `--max-ai-calls` 约束（按子账计 HTTP 次数），仍逐次记子账以便汇总 token。
- **名片识别（含 RN-03 补全）不经过账本**（D5／D43）。
- 实现 W0046 定义的 `AiQuotaGate`（只放宽 `purpose`／`trigger` 枚举，不改形状）：
  - `reserve({ actorId, pool, purpose, trigger, idempotencyKey, now })`：按 `(actor, pool)` advisory lock 的事务里数当日 `status in ('reserved','succeeded','failed')` 的操作行；后台池对比 60，用户主动池同时对比 10（总熔断）与手动 3（仅 `snapshot`／`manual`）；不够则返回 `{ ok: false, reason: "daily_limit", retryOn: 次日 00:00 东京 }`，**不调用模型**；同一幂等键重放返回原操作（不新增行、不再计次）。
  - `beginCall(operationId, { provider, model })`／`endCall(callId, usage | null)`：见 B 的子账规则。
  - `finish(operationId, outcome)`：**只由持有 `operationId` 的发起方调用一次**（W48-6）：子账里有 ≥1 条 `responded` → 记 `succeeded`／`failed` 并计次；0 条 `responded` → 记 `released` 不计次；重复调用为 no-op。两池分别计数，互不占用。
- 用账本实现替换 W0046「始终拒绝」注入点，memo 提取由此开闸（后台池；`daily_limit` 时 W0046 作业记 `deferred` 到 `retryOn`）。

## 上下文包（Generator 从这里起步，不通读其他 REPORT）

### 必读文件
- `features/mobile/contacts-analysis-report-provider.ts:97–150`（现有 sourceDataVersion 组装）；`features/dashboard/storage/dashboard-snapshot.ts:1–125`（`readDashboardGraphState`）。
- `features/plans/ai-matcher.ts`（DeepSeek 请求写法）、`features/plans/match-maintenance-task.ts`（维护任务写法）、`features/plans/migrations.ts`（迁移模块写法；`plan_log`／`plan_items` 列定义，C 节版本算法依据）、`features/plans/input-source.ts`、`input-selector.ts`（联系人裁剪，只读）、`features/plans/matching-repository.ts:145–240`（`enqueuePlanMatchJob`）、`features/plans/service.ts:688 getCurrent`（只读入口）与 `:1290 getCurrentView`（会写，禁止调用）。
- `features/operations/maintenance/configured-tasks.ts`；`scripts/migrate-web-runtime.ts`。
- W0045／W0046／W0047 REPORT 的「交接」节（只读交接节）。

### 关键符号（原样）与 impact
- 只调用不改：`contactsAnalysisGraphSourceDataVersion(graphVersion: string, profileSection: unknown): string`（HIGH，6）、`readDashboardGraphState(client, workspaceId, accountId): Promise<DashboardGraphState | null>`（LOW，5）、`createConfiguredPlanInputSource(): PlanInputSource | null`（LOW，2）、`enqueuePlanMatchJob(client: PlanMatchQueryClient, input: EnqueuePlanMatchJobInput): Promise<EnqueuePlanMatchJobResult>`（LOW，7）；`createDeepseekPlanAiMatcher` 只作参照（HIGH，9，不改）。
- W0046 的 `AiQuotaGate` 注入点（名字以其 REPORT 为准）：开工跑 upstream impact，替换实现不改接口。
- `registerConfiguredMaintenanceTasks`（或 `configured-tasks.ts` 实际导出名）：开工 impact，只追加任务。

### 前序交接要点
- W0045：`publicProfile.seniorityLevel`（6 档）+ 派生 4 档、规范地区 `region`、补全来源 `enrichment.fields.<field>`（含 W0046 写入的 offering／seeking／topics，C-4）、`canWriteEnrichedValue`、按文字补全入口（每次 ≤20 人、返回 usage、不自行扣额度）；快照输入按派生 4 档给模型，原值不改。
- W0046：`RelationshipTimelineItem { id, source, occurredAt, title, excerpt? … }` 的读取函数；快照输入每人最多 2 条最近记录（摘要 ≤80 字），其 `id` 是依据里的 `recordIds`。`AiQuotaGate` 接口（`reserve`／`beginCall`／`endCall`／`finish`，按操作计次）与「始终拒绝」实现（本 Sprint 替换为账本实现）。
- W0047：`RelationshipStrength { tier, dormant, score, signals[] }` 存在 `orbit_records` 集合 `relationship_strengths`（W47-1），读时按来源戳重算（W47-2），交接 `ensureRelationshipStrengths` 与 `sourceStamp`（决定 `strengthVersion`）。

### 易错边界（全部写进 SC 并要求测试）
版本未变或不达阈值 0 次调用；每个版本来源「只改它版本就变」（R-5）；快照重算不写计划三表、不调 `getCurrentView`（R-6）；依据里编造的 id 丢弃、模型分数不进库；自动路径只有 worker 预留一次、`operation_id` 写回 job、所有结束路径明确结算、崩溃与租约回收不重复预留（R-2）；外部持有操作时 `generateSnapshotNow` 不结算（R-3）；额度按操作计、成本按 HTTP 子账聚合、子账不超 `max_calls`；两池分别计数、后台池满 0 次调用且顺延、手动第 4 次与用户池总熔断用满都拒绝（R-11）、并发预留只成功一路；名片识别不写账本；`system` 池不占用户额度；三层入口补全只走 `canWriteEnrichedValue`、不改计划；示例模式不读写快照、不预留配额。

## 范围与文件

- 新建：`features/network-analysis/`（contract、source-version、refresh-policy、snapshot-validator、snapshot-generator（mock）、deepseek-snapshot-generator、input-source、repository、migrations、service、runtime、maintenance-task、new-contact-layers）；`features/ai-quota/` 下（W0046 已建 `gate.ts`）新增账本仓储（操作行 + `ai_usage_calls` 子账）、`reserve`／`beginCall`／`endCall`／`finish` 与 `AiQuotaGate` 的账本实现、配额常量（`USER_POOL_DAILY_LIMIT` 10〔已定（D45，2026-10-02）〕、`MANUAL_REANALYSIS_DAILY_LIMIT` 3、`BACKGROUND_POOL_DAILY_LIMIT` 60、批 20、`max_calls` 表）；`tests/services/network-snapshot-source-version-postgres.test.ts`；`features/ai/deepseek-json-chat.ts`（快照与 W0048b 计划共用，不改 `ai-matcher.ts`）；`app/api/network/snapshot/{route.ts,recompute/route.ts}`；`scripts/measure-network-snapshot-traffic.ts`；对应测试。
- 修改：`configured-tasks.ts`（注册 `network-snapshot`）；`migrate-web-runtime.ts`；W0046 `AiQuotaGate` 的注入点；受影响的既有测试。
- 排除：计划生成器、`ai_regenerate`、`defaultPhaseRefiner`、计划页（W0048b）；分析页三标签展示（W0049～W0052）；不足 3 人卡与示例快照（W0054）；导入（W0053）；聊天报告删除（W0050／W0055）；`ai-matcher.ts` 重构；`shared/compute/*` 与 `/api/mobile/contacts-dashboard`；App 端。

## 验收契约（五项；revision 3 起每项 = 一条操作链 + 一个主证据，其余断言见「必需证据子表」，R-16）

| SC | 操作链（可观察行为） | 主证据 |
| --- | --- | --- |
| SC-W0048a-01 存储与读取 | 本机测试库跑迁移后写入一份新快照，`GET /api/network/snapshot?lang=zh` 返回请求语言的 `blocks`、`freshness`、`quota`，每人恰好一份 current，他人读不到 | `tests/capabilities/network-snapshot-postgres.test.ts`（真实本机库，证明未 skip） |
| SC-W0048a-02 快照生成与校验器 | 用含编造 id、单语块、模型分数的假响应调用 `generateSnapshotNow`：编造 id 与分数被丢弃，关键块不足时整份失败、不写库 | `tests/services/network-snapshot-validator.test.ts`（编造 id、单语、带分数、全无依据四组） |
| SC-W0048a-03 三层更新与触发 | 计数假生成器下依次「连开 3 次（版本不变）→ 新增 2 人 → 再新增 1 人」：生成器调用次数为 0、0、1，`newContactCount` 正确 | `tests/services/network-snapshot-service.test.ts`（调用计数） |
| SC-W0048a-04 两池配额账本与自动路径结算（R-2 用例见子表） | 后台池用到 60 次操作后再触发一次自动快照：0 次调用、job `deferred` 到次日 00:00 东京、视图给出 `retryOn` | `tests/capabilities/ai-usage-ledger-postgres.test.ts`（并发、东京日边界、两池隔离、崩溃与租约回收） |
| SC-W0048a-05 真实调用与收口 | 本机测试账号真实 DeepSeek 跑首次快照、阈值重算、手动重新分析、memo 提取，HTTP 次数与 token 从 `ai_usage_calls` 按 `operation_id` 聚合，总计 ≤8 次 HTTP | REPORT 调用次数与 token 表（子账聚合输出，`~/orbit-sprint-evidence/web/sprint-W0048a/run-01/`） |

### 必需证据子表（每条子断言独立留证，缺一即该 SC 不通过）

| SC | 子断言 | 证据 |
| --- | --- | --- |
| 01 | 三张表 + `ai_usage_calls` 迁移可重复执行（第二次 no-op，改 SQL 报 checksum） | Postgres 测试 |
| 01 | 写新快照在一个事务里归档旧版并修剪到 12 版 | Postgres 测试 |
| 01 | GET 只取 `narrative_zh` 与 `evidence`、**不取** `included_contact_ids`；已删除联系人从依据剔除、剔空的块不返回；`quota.manual／user／background` 当日用量正确（单位「次操作」） | 路由测试 |
| 01 | 示例模式 0 次读写 | 路由测试 |
| 01 | 单次读取字节实测；REPORT 预算表：开工时 README D32 最新三档基线 + 本项（1000 人 × 每日打开分析页 1 次与 3 次两档），任一档 >1.6 GB 登记 D32 | `measure-network-snapshot-traffic.ts` 输出 |
| 02 | mock 与 DeepSeek 两个实现同一接口；同一次调用产出 zh+en，任一语言为空的块丢弃 | 校验器测试 |
| 02 | diagnosis 被丢或 insight <2 条 → 整份失败、不写库、持有者 `finish(failed)`（W48-7）；mock 文字只由真实数据拼出 | 校验器 + 服务测试 |
| 02 | **R-3**：`generateSnapshotNow` 在外部持有的 `operationId` 下只登记子账、不预留、不 `finish`；调用前后账本操作行状态不被它改变 | 服务测试（账本 spy） |
| 02 | DeepSeek 请求体：`thinking` 禁用、`json_object`、超时；每次 HTTP 前插 `started` 子账、响应后写 token、超时记 `no_response` | `deepseek-snapshot-generator` 假 fetch 测试 |
| 03 | 版本变、新增 2 人（基数 20）0 次调用且 `newContactCount=2`；新增 3 人或 ≥20% 恰 1 次；目标改了恰 1 次；快照引用者删到 2 人后补回 3 人恰 1 次（恢复规则）；<3 人 `insufficient` 0 次 | refresh-policy 纯函数全分支 + `network-snapshot-service.test.ts` 调用计数 |
| 03 | 两次并发打开只 1 次（job 单飞） | Postgres 并发用例 |
| 03 | **R-5**：`orbit_records` 六集合、`notes`／`human_encounters`／`personal_schedule_items`、`plan_log`（追加一条 → `count:sum(seq):max(seq)` 变）、`plan_items`（改一条需求、删一条需求）、强度 `sourceStamp`／`rulesVersion` 各有一条「只改它 → 版本变」用例，另有「都不改 → 版本不变」用例；SQL 不引用 `plan_log.sync_revision` | source-version Postgres 测试 |
| 03 | `runNewContactLayers` 按 ≤20 人一批补全（每批 1 次操作）、`user` 值不被覆盖、入队一次待确认任务（0 次 AI） | `tests/services/network-new-contact-layers.test.ts` |
| 03 | **R-6**：重算与三层入口前后 `plans`／`plan_items`／`plan_log` 行与 `updated_at` 不变；在阶段边界夹具上运行，INSERT／UPDATE 0 条、计划生成器解析 0 次（不调 `getCurrentView`） | 服务测试（SQL 写语句计数 + 生成器 factory spy） |
| 04 | 后台池满时 memo 提取、洞察、补全同样 0 次调用并顺延；维护任务次日执行 | 账本 + 服务测试 |
| 04 | 用户主动池：手动第 4 次 429 `MANUAL_REFRESH_LIMIT`、0 次调用；用户池当日 10 次操作用满后手动重新分析 429 `USER_DAILY_LIMIT`、0 次调用（R-11，数值已定（D45，2026-10-02），测试读常量） | 路由测试 |
| 04 | 后台池满时手动重新分析仍可用、手动用满不影响后台任务（两池互不占用）；`pool='system'` 行不计入两池 | 账本测试 |
| 04 | 同键重放返回原操作、不重复计次；额度剩 1 时两路并发预留只成功一路 | 账本 Postgres 并发用例 |
| 04 | 一次操作内多次 HTTP 只计 1 次额度，子账条数 = HTTP 次数；子账超过 `max_calls` 时插入被拒、不发请求；0 条 `responded` 的操作 `finish` 后为 `released` 不计次 | 账本测试 |
| 04 | **R-2** 四个故障用例：①排队后崩溃（job 无 `operation_id`）→ 下一个 worker 预留恰 1 次；②预留后崩溃（job 有 `operation_id`、租约过期）→ 回收的 worker 复用该操作，全程操作行 1 条；③二次判定变 `fresh` → 0 次预留（或已有操作 `released`）、删 job；④租约过期回收与正常完成并发 → 只有一个 worker 写快照、操作只结算一次 | `ai-usage-ledger-postgres.test.ts` + `network-snapshot-service.test.ts` |
| 04 | W0046 `AiQuotaGate` 换成账本实现后 memo 提取开闸并计入后台池；名片识别路径不写账本 | 闸门测试；既有 `deepseek-business-card-ocr-provider.test.ts` 不变通过 |
| 05 | 每次 HTTP 记录 pool／purpose／token（子账）；生产环境变量与生产迁移不动（`ORBIT_NETWORK_ANALYSIS_GENERATOR` 生产仍为 mock，W48-9） | REPORT |
| 05 | H 档：全量 `npm test` 对照基线新增失败 0、`npx tsc --noEmit -p .`、一次 Codex 代码 review | 全量清单、review 处理 |

## 一次 Generator 的执行顺序

1. 核对进入条件，读三份前序交接节，记哈希与基线；对上文符号跑 impact，HIGH 先报告。
2. 迁移 + 仓储 + 账本（SC-01、SC-04 存储部分）→ 纯函数（版本、判定、校验器）→ 快照服务、API、维护任务、三层入口（SC-02、SC-03）→ 替换 W0046 闸门（SC-04）。
3. 本机测试账号真实调用（≤8 次）、流量实测；按操作链提交（存储与账本／快照服务与三层入口），`detect-changes --scope staged`，REPORT，交接。

## 最小测试与检查

- **档位 H**（新表迁移、共享契约、付费 AI、配额并发）。数据库测试先跑 `node scripts/assert-local-test-databases.mjs`，REPORT 证明未 skip。
- 开发定向集：SC 表所列新测试。
- 收口集：`tests/services/contacts-analysis-report-provider.test.ts`（证明未波及）、W0046 memo 提取作业测试（闸门换实现后）、`tests/capabilities/plan-matching.test.ts`（入队不回归）、维护任务注册相关测试；`npx tsc --noEmit -p .`。
- 全量：本地代码收口一次 `npm test`，按 RULES 5.2 对照基线；不 source `.env`。
- 浏览器：本 Sprint 无界面改动（报告卡在 W0050），不做截图；只用路由测试与 curl 式路由调用存证据。
- 不运行：App 端、`shared/compute` 消费者、生产迁移与部署。

## 失败与交接

依赖未合并：不启动。DeepSeek 不可用：SC-05 的真实调用部分记 blocked，mock 部分照常验收，不降低 SC。
REPORT 交接（给 W0048b、W0049～W0055）：表名与列（含 `ai_usage_calls` 子账与 job 的 `operation_id`）、`NetworkAnalysisSnapshot`／`NetworkSnapshotView` 最终字段（`blocks`、`freshness.stale`、`quota.manual／user／background`）、`sourceDataVersion` 各来源算法、`decideSnapshotRefresh` 与阈值常量（含恢复规则）、`generateSnapshotNow`（持有者结算）与 `runNewContactLayers` 签名、账本 `reserve／beginCall／endCall／finish` 签名与「谁持有谁结算」规则、`max_calls` 表、两池常量（手动 3、用户池总熔断 10〔已定（D45，2026-10-02）〕、后台 60、批 20，单位「次操作」）与 `purpose` 枚举、两个 API 的路径与错误码（`MANUAL_REFRESH_LIMIT`、`USER_DAILY_LIMIT`）、生产需设的环境变量（`ORBIT_NETWORK_ANALYSIS_GENERATOR=deepseek`）、真实调用次数与 token、预算表。列本线分支 `sprint/W0048a-network-snapshot-quota`、固定最终 SHA，交协调者合并 `chat-agent`。

## 已定（D44，2026-10-02）

| 编号 | 定稿结论 | 对标做法 |
| --- | --- | --- |
| W48-1 | 原 W0048 拆为 W0048a（本 Sprint：快照、三层更新、配额）与 W0048b（计划接 DeepSeek）；W0049～W0053 不依赖 b（W0052 经 W0049／W0050 间接依赖 a）；b 依赖 a | Linear／Notion 发布 AI 能力都先上「数据层 + 计量」再逐个入口接入，每次可单独回滚 |
| W48-2（= C-5；rev 3 按 REVIEW R-3／R-11 改为按操作计次） | 两池：用户主动池（手动重新分析 ≤3／东京日、计划生成与重生成、单人洞察「重新生成」；总熔断每人每东京日 10 次操作，数值已定（D45，2026-10-02））与后台自动池（memo 提取、洞察批量、导入补全、快照自动重算、计划未细化阶段到期前补细（D46②）；每人每东京日 60 次操作、每批 ≤20 人，超限顺延次日并显示「明天更新」）；成本按每次 HTTP 一条子账；共用 `ai_usage_ledger`，按 `pool` 区分；名片识别不计入（D43）；回填记 `pool='system'`、不占用户配额（W55-5）；账本由本 Sprint 建并实现 W0046 的闸门 | Notion AI／HubSpot Breeze：用户动作与后台富化分开计量，超额明确告知何时恢复、不静默降级 |
| W48-3 | 目标改了自动重算快照（后台池）；计划不自动改，只出现 W0012 既有的「目标已改，要不要重新分析」提示 | HubSpot Goals 改了目标值立即重算达成度，但不自动改已安排的任务 |
| W48-4 | 快照每人保留最近 12 版（含 current），写新版本时同事务修剪 | Google Analytics 报告快照、HubSpot 报告历史保留有限版本供对比，旧版自动清理 |
| W48-5 | 已确认联系人 <3 不生成快照，视图 `insufficient`，展示交 W0054 | LinkedIn 在数据不足时显示「再添加 N 位即可解锁洞察」而不是给空洞结论 |
| W48-6 | 一次操作内有任一 HTTP 拿到供应商响应（含输出无效）才计次；全部未发出或无响应记 `released` 不计次；每次 HTTP 的成本都记子账 | Stripe metered billing 只记真实发生的用量；与 `ai-matcher` 失败也记 usage 一致 |
| W48-7 | 快照依据里编造的 id 在解析层丢弃，校验器兜底；只有关键块（diagnosis、insight ≥2）全丢才整份失败 | Perplexity、Notion AI Q&A 丢掉无出处的引用而不是让整次回答失败 |
| W48-8 | 快照自动重算用 `after()` + 维护任务 `network-snapshot` 兜底（rev 3：排队只 upsert job，worker 取得租约后才预留，R-2）；手动重新分析请求内同步（`maxDuration` 120）；计划生成的同步方式见 W0048b | Notion AI、Linear AI 长任务靠幂等重试与后台补跑，不新建任务队列系统 |
| W48-9 | 本 Sprint 不切生产：`ORBIT_NETWORK_ANALYSIS_GENERATOR` 生产仍为 mock，生产迁移不执行；与 W0048b 的计划开关一起放 W0055 收口时授权 | 新 AI 功能用开关灰度（LaunchDarkly 式 feature flag），先迁移再开开关 |
| W48-10（rev 4 按 D46②） | 计划未细化阶段（生成时只细化前 2 段，其余含一年期后续季度）到期前补细计入后台池（`purpose='plan_refine'`，每阶段 1 次操作），接入在 W0048b | Linear Cycles 自动排期在后台任务里做，打开页面不触发重计算 |
