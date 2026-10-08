# Sprint W0047 — 关系强度规则分档与管线页改档位

> revision 4：按 D46 修订（①⑦）：改 `shared/{contract,compute,api-schema}` 的同一提交内执行 App 机械同步脚本 `npm run sync:contract`（只复制、不改 App 逻辑）并跑 App 四个 *-sync 测试为绿，「App 镜像不改」改为「App 逻辑不改、副本经同步更新」；基线行号以开工时 HEAD 为准、按符号重定位。
>
> revision 3：按 REVIEW-2026-10-02-network 裁决修订（R-1、R-7、R-16）：既有 `relationshipStrengthDistribution` 逐字段不动，只新增 `relationshipTierDistribution`，Web 改读新字段，刷新入口不挂 `/api/mobile`，补「旧响应逐字段不变」断言；交接基于完整去重时间线的按时间点计算入口与 `tierCountsAt30d`；验收契约改为「操作链 + 主证据」+ 必需证据子表。
>
> revision 2：按 D44 定稿待定项、W0048 拆分、配额两池（2026-10-02）。本 Sprint 不调用付费 AI，与配额无关；强度的下游快照改由 W0048a 消费。

**Plan revision:** 4。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** RN-05；**定稿共享契约「关系强度 RelationshipStrength」**（W0048a 快照、W0049 健康分布、W0051 洞察、W0052 管线区读它）。**单一目标:** 按 W0046 时间线规则打分、带衰减，得出 新认识／有往来／核心 + 待唤醒；结果存为可重建的读模型，让 `shared/compute` **新增**的档位分布 `relationshipTierDistribution`、管线页、详情、列表读到同一份真实档位（既有 `relationshipStrengthDistribution` 逐字段不动，R-1）；交接一个基于完整去重时间线的按时间点计算入口（30 天变化用，R-7）；下线手动阶段 UI。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 开工时的 `chat-agent` HEAD（编制时 `a48e1749`，行号以它为准）。**依赖 W0046 已合并**：使用其 `RelationshipTimelineItem`、`buildRelationshipTimeline`、`mergeRelationshipTimelineItems`（名字以 W0046 REPORT 为准）。 **行号以开工时 HEAD 为准，按符号重定位（D46⑦）。**
**进入条件:** W0046 completed（登记表依赖）；W47-1～W47-6 已定（D44，见文末）；不需要云端授权、不调用付费 AI、不做 DDL（读模型走 `orbit_records` 新集合）；数据库测试用本机测试库。

## 已查清的事实（按 `a48e1749`）

1. **强度现在没有输入。**`ConnectionDTO.relationshipStrength?` 与 `businessRelevanceScore?`（`shared/domain/contracts.ts:169–186`）无任何写入路径（`businessRelevanceScore` 只有 referral 等少数路径透传）。读取有三处，阈值一致 **70／45**：
   - `shared/compute/dashboard-distribution.ts:560 strengthFor(connection)`：`relationshipStrength ?? businessRelevanceScore ?? 0` → `strong／warm／weak`；`:589 strengthDistribution(graph)`；`:841` 读模型路径用 `model.strengths`。
   - `features/dashboard/storage/dashboard-read-model-postgres-reader.ts:348–374`：SQL `strength_score`（先 `relationshipStrength` 后 `businessRelevanceScore`，否则 0）→ `connection_strengths` 分桶 → `connection_by_contact`（按 `contact_id` 取一条）；`createDashboardReadModelPostgresReader` impact **CRITICAL**（5 个流程，经 `dashboard-live-record-provider.ts createStorageDashboardAggregateProvider`）。
   - `features/dashboard/storage/dashboard-summary-postgres-reader.ts:140–147` 的 `priority_raw` 是**排序优先级**不是强度（先 `businessRelevanceScore`），不改。
   - App 有一份镜像 `repos/orbit-app/src/api/compute/dashboard-distribution.ts`（本地计算）。本 Sprint 不改 App 逻辑；该副本只由同一提交里的 `npm run sync:contract` 逐字更新（D46①）。
   - **App 在消费既有字段**：`/api/mobile/contacts-dashboard` 的 `relationshipStrengthDistribution` 现由上述 `strengthFor`（`dashboard-distribution.ts:560`，`relationshipStrength ?? businessRelevanceScore ?? 0`）与 SQL `strength_score` 算出；改它的数据源或缺行行为就是改 App 已消费字段的语义（R-1），所以本 Sprint 两处都不改。Web 分析页的数据经 `loadContactsAnalysis` 走同一个服务，Web 改读新增字段即可。
2. **契约与 schema。**`shared/compute/dashboard-distribution-contract.ts:38 NetworkRelationshipStrength = "strong" | "warm" | "weak"`、`:154 RelationshipStrengthDistributionBucket`、`:166 relationshipStrengthDistribution`；手机接口 schema `shared/api-schema/mobile-contacts-dashboard.ts:200–210`（`.passthrough()`，新增可选字段兼容）。分析页 `app/(app)/app/contacts/analysis/contacts-analysis-view-model.ts:87` 把它映射成 `health`。
3. **列表强弱是猜的。**`contacts-view-model-adapter.ts:75 strengthFor` 与 `contacts-subroute-route-adapter.tsx:74 strengthForContact` 按价值标签正则（commercial|strategic|invest）给 `OrbitContactStrength = "strong" | "medium" | "weak" | "dormant" | "unscored"`（`orbit-contacts-route-view-model.ts:47`）；`orbit-real-cards-dashboard.tsx:83–171、317–319` 渲染强弱点与「沉睡关系」。
4. **管线页。**`app/(app)/app/contacts/network-0918/network-pipeline.tsx`（134 行）按手动阶段 `NETWORK_STAGES = explore／keep／advance／archived`（`network-model.ts:8`，`stageOf` 第 36 行）分四列；第 92–95 行四个假筛选 chip（阶段／来源／提醒／排序，不可点）；数据 = `loadAppContactsRouteViewModel`（列表**默认每页 30**）+ `loadContactsAnalysis`（`contacts/pipeline/page.tsx:68–71`），示例分支第 57–66 行用 `buildDemoNetworkViewModel`。
5. **手动阶段 UI。**详情「更新状态」按钮（`network-detail-modal.tsx:60、234`，实际只打开写 memo 弹窗）；「待设置关系」面板 `DetailInitializationPanel`（第 45–48、187 行）→ `contact-relationship-initialization.tsx` → `/api/contacts/[id]/relationship-initialization`。**App 也用这个接口**（`orbit-app/src/screens/contacts/ContactRelationshipInitializer.tsx`），接口与后端阶段数据保留。
6. **用户手标有哪些（强度不得读）：**connection／contact `stage`（生命周期阶段、初始化面板设置）、`customTags`、`contact_detail_states.status／tags`、`networkCategory`。**私信**：`features/relationship-communication/**`（`relationship_conversations／messages`）不读（N-Q25）。
7. **时间线来源都在 W0046 读取器里**；memo 提取出的事件类型在 `memo_extractions`（W0046；W0048a 开闸后台池前为空，计分按 memo 基础分）。每日维护入口 `features/operations/maintenance/configured-tasks.ts`（`createPlanDailyRunGate` 先例）；东京日期 `features/plans/week.ts:23 planTokyoDate`。

## 共享契约定稿：RelationshipStrength（落在 `shared/contract/relationship-strength.ts`）

```ts
export type RelationshipTier = "new" | "active" | "core";
export interface RelationshipStrengthSignal {
  timelineItemId: string;              // = RelationshipTimelineItem.id
  source: RelationshipTimelineSource;  // 冗余一份类型，方便聚合
  occurredAt: string;
  basePoints: number;                  // 衰减前
  points: number;                      // 衰减后贡献（保留 1 位小数）
}
export interface RelationshipStrength {
  contactId: string;
  tier: RelationshipTier;              // score ≥ 70 core；≥ 45 active；其余 new（与 shared/compute 70／45 同阈值）
  dormant: boolean;                    // 曾达 active（峰值 ≥ 45）且最近 60 天无非 capture 记录
  score: number;                       // 0–100 整数，min(100, round(Σ points))
  peakScore: number;                   // 历史峰值（由信号重放得出，不另存历史）
  lastSignalAt: string | null;         // 最近一条非 capture 记录时间
  signals: readonly RelationshipStrengthSignal[]; // 按 points 降序，最多 12 条
  computedAt: string;                  // 计算时刻（now）
  rulesVersion: string;                // 例如 "rs-2026-10-v1"，参数变更必须升版本
}
```
- **只由时间线推出**：`computeRelationshipStrength(items: readonly RelationshipTimelineItem[], now: Date, rules?: RelationshipStrengthRules): RelationshipStrength` 是纯函数，输入类型里**没有** stage／tags／status／私信字段。
- **按时间点计算（R-7）**：`computeRelationshipStrength` 只计 `occurredAt ≤ at` 的条目（`at` 即 `now` 参数），因此同一函数对**完整、去重后的时间线**传 `at = now − 30 天` 就是「30 天前」的档位；另导出 `computeRelationshipTierCountsAt(timelines: ReadonlyMap<string, readonly RelationshipTimelineItem[]>, at: Date, rules?)`：只计 `capture.occurredAt ≤ at` 的联系人，返回 `{ asOf, counts: { new; active; core; dormant }, contactCount }`。**不得用缓存里最多 12 条的 `signals` 回放**（会漏算）。`ensureRelationshipStrengths` 重算时（本来就批量读完整时间线）在同一遍里算出 `now − 30 天` 的档位人数，写进 `relationship_strength_state.tierCountsAt30d`，W0049 直接读这一行，打开页面不额外读时间线。
- **与 `shared/compute` 的对应（只加字段，R-1）**：既有 `relationshipStrengthDistribution` **逐字段不动**——graph 路径 `strengthFor` 与 SQL 读模型 `strength_score` 的取值来源、70／45 阈值、缺行行为都不改，App 看到的响应与改前逐字段相同。**只新增**可选 `relationshipTierDistribution?: readonly { tier: RelationshipTier | "dormant"; relationshipCount: number; percentage: number; contactIds: readonly string[] }[]`，数据来自 `relationship_strengths` 缓存（`dormant` 单独成组，四组人数之和 = 有缓存行的联系人数，缺行的联系人不计入任何档），graph 路径与 SQL 读模型路径都补上同一计算；手机 schema 同步加可选项。Web（`contacts-analysis-view-model.ts` 及管线、详情、列表）改读新字段；`core → strong` 等映射只用于 Web 列表强弱点。
- **读模型**：`orbit_records` 新集合 `relationship_strengths`（非同步集合，每 actor×contact 一行，payload = `RelationshipStrength`），外加每 actor 一行 `relationship_strength_state`（`sourceStamp`、`tokyoDate`、`rulesVersion`、`tierCountsAt30d { asOf, counts, contactCount }`、`earliestCaptureAt`）。它是**缓存**，随时可由时间线重建；不写 `connections`。
- **刷新入口（R-1）**：`ensureRelationshipStrengths` 只由 Web 服务端加载器调用（`contacts/dashboard/page.tsx`、`contacts/pipeline/page.tsx`、`contacts/[id]/page.tsx`、所有人脉列表页的服务端加载，在读分析／名单之前）与后台维护入口；**不挂在 `/api/mobile/contacts-dashboard` 或任何 `/api/mobile/**` 路由上**，手机接口只读已有缓存（新字段 optional，缓存为空时该字段为空数组）。

### 打分规则（集中在一张常量表 `RELATIONSHIP_STRENGTH_RULES`，W47-3 已定按初稿，`rulesVersion` 起始 `rs-2026-10-v1`）

| 时间线来源（条件） | 基础分 |
| --- | --- |
| `capture`：名片／扫码／活动交换 | 10（手动添加 5） |
| `memo`：默认 | 15 |
| `memo`：提取事件含 `met`／`introduced` | 20 |
| `memo`：提取事件含 `collaborated` | 30 |
| `encounter`（当面记录） | 20 |
| `schedule`：已发生的 meeting | 25 |
| `schedule`：已发生的 event（共同参加） | 10 |
| `schedule`：未来的 meeting（已约） | 5（不衰减，发生后按上行重算） |
| `followup_done` | 10 |
| `plan`：`contact_established` | 20 |
| `plan`：`contact_linked` | 5 |
| `plan`：其他事件、`note` 提及 | 0（只进时间线，不计分） |

- **衰减**：`points = basePoints × 0.5^(ageDays / 90)`，`ageDays` = 东京日差（未来项按 0）。半衰期 90 天。
- **去重**：同一来源同一东京日只计最高的一条；同一 `ref` 只计一次。
- **待唤醒**：`peakScore ≥ 45` 且 `now − lastSignalAt ≥ 60 天`（capture 不算往来）。
- **示意**：扫名片 10 + 当天 memo 15 = 25 新认识；再加一次已发生的约见 25 = 50 有往来；一个月后再约见一次并写 memo：50 × 0.5^(30/90) ≈ 40 + 40 ≈ 80 核心；之后 90 天无记录 → 分数减半、`dormant = true`（第 60 天起）。

## 上下文包（Generator 从这里起步，不通读其他 REPORT）

### 必读文件
- W0046 产物：`shared/contract/relationship-timeline.ts`、`features/relationship-timeline/build.ts`、`reader.ts`（以 W0046 REPORT 的导出签名为准）。
- `shared/compute/dashboard-distribution.ts:540–660、820–875、979–1000`；`shared/compute/dashboard-distribution-contract.ts:38、154–170`；`shared/api-schema/mobile-contacts-dashboard.ts:195–215`。
- `features/dashboard/storage/dashboard-read-model-postgres-reader.ts:340–380、500–515、670–690`；`features/dashboard/storage/dashboard-live-record-provider.ts:140–160`。
- `app/(app)/app/contacts/network-0918/network-pipeline.tsx`、`network-model.ts`、`network-detail-modal.tsx`（第 45–60、180–240 行）、`contacts/pipeline/page.tsx`。
- `app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-view-model-adapter.ts:75`、`contacts-subroute-route-adapter.tsx:74`；`app/(app)/app/contacts/analysis/contacts-analysis-view-model.ts:80–95`；`_demo/demo-network.ts`（示例档位静态数据）。

### 关键符号（原样）与 impact
- `function strengthFor(connection: ConnectionDTO): NetworkRelationshipStrength`（shared/compute）— 私有；`strengthDistribution` GitNexus ambiguous（2 个），文本搜索：本文件第 647、982 行 2 处调用。
- `export function createDashboardReadModelPostgresReader(...)` — **CRITICAL**，直接 1（`createStorageDashboardAggregateProvider`），5 个流程；开工先报告。
- `export function NetworkPipeline({ viewModel, analysis }: { viewModel: OrbitContactsViewModel; analysis: ContactsAnalysisView })` — LOW，直接 1（`AppContactsPipelinePage`）。
- `export function stageOf(contact: Pick<OrbitContactView, "pipelineStatus" | "relationshipStatus">): NetworkStage` — LOW，直接 3（详情、写 memo 弹窗、`toPerson`）。
- `ContactRelationshipInitializationPanel` — LOW，直接 1（`DetailInitializationPanel`）。
- `createLiveNetworkDistributionAnalyticsService` — ambiguous（3 个，含 App 镜像），只改 `shared/compute` 这一个。

### 易错边界（都有对应 SC）
- 强度（新档位）只从时间线来：不读 stage／tags／status／customTags／networkCategory，不读私信表、不读 `businessRelevanceScore`（SC-01）；既有强弱分布照旧读 `relationshipStrength ?? businessRelevanceScore`，不在本 Sprint 改（SC-03）。
- 不写 `connections`（同步集合，会触发 App 同步与版本冲突）；读模型可整表删除后重建得到相同结果（SC-02）。
- 刷新：同一 actor 的 `sourceStamp` 与东京日期都未变时 0 次时间线读取；任一来源有新记录或跨日（衰减／待唤醒）时重算；并发刷新结果一致、全部或全不写（单事务 + 比较后写）；刷新入口不在 `/api/mobile/**`（SC-02）。
- `shared/compute` 与手机接口只加字段：同一夹具下手机响应除新增可选 `relationshipTierDistribution` 外与改前**逐字段相同**，`relationshipStrengthDistribution` 仍按 `relationshipStrength ?? businessRelevanceScore ?? 0` 计算（SC-03，R-1）。
- 30 天前档位只由完整去重时间线算，单人 >12 条信号时与全量回放一致（SC-01，R-7）。
- 下线手动阶段 UI 但不删接口与数据；示例模式不发请求（SC-04）。

## 范围与文件

- 新建：`shared/contract/relationship-strength.ts`；`features/relationship-strength/`（`rules.ts` 常量表、`compute.ts` 纯函数、`read-model.ts` 刷新与读取、批量时间线读取 `readRelationshipTimelinesForActor`）；测试。
- 修改：`shared/compute/dashboard-distribution.ts`、`shared/compute/dashboard-distribution-contract.ts`、`shared/api-schema/mobile-contacts-dashboard.ts`（只加可选字段，既有字段计算不动）；`features/dashboard/storage/dashboard-read-model-postgres-reader.ts`（**新增**按 `relationship_strengths` 聚合的档位分组，既有 `strength_score` 不改）、`dashboard-live-record-provider.ts`（图路径同样只新增档位输入）；Web 服务端加载器（刷新入口，见上；`app/api/mobile/**` 不改）；`network-pipeline.tsx`、`network-model.ts`、`network-detail-modal.tsx`、`contacts/pipeline/page.tsx`、`contacts/[id]/page.tsx`；两个列表适配器的强弱函数；`contacts-analysis-view-model.ts`；`_demo/demo-network.ts`；样式。
- 排除：分析页「结构」标签改版与 30 天变化展示（W0049，本 Sprint 只交接 `tierCountsAt30d` 与按时间点入口）、列表列与档位筛选（W0051）、概览管线区（W0052）；`app/api/mobile/**` 任何文件；既有 `relationshipStrengthDistribution` 的计算；`contact-relationship-initialization.tsx` 与其 API 保留（只是详情不再挂载）；App 端不改；不删除阶段数据；不做拖拽；不让用户手动改档位。
- 同步副本（D46①）：`repos/orbit-app/src/api/{contract,schema,compute}` 中由 `npm run sync:contract` 写出的变化与本 Sprint 代码同一提交（「App 端不改」指不改 App 逻辑与界面）；新契约 `shared/contract/relationship-strength.ts` 只能 `./` 互引，`shared/compute` 引用它必须 `import type`（`shared-compute-audit`）。

## 验收契约（最多五项；revision 3 起每项 = 一条操作链 + 一个主证据，其余断言见「必需证据子表」，R-16）

| SC | 操作链（可观察行为） | 主证据 |
| --- | --- | --- |
| SC-W0047-01 | **规则打分纯函数（含按时间点）。**对同一份完整时间线分别以 `now` 与 `now − 30 天` 调用 `computeRelationshipStrength`／`computeRelationshipTierCountsAt`，得到按规则表、衰减、去重算出的档位，结果只取决于时间线与时间点 | 表驱动测试（含示意场景与单人 >12 条信号夹具） |
| SC-W0047-02 | **读模型与刷新。**Web 加载器调用 `ensureRelationshipStrengths(actorId, now)`：来源戳与东京日都未变时只读缓存、时间线读取 0 次；写一条 memo 后再调用即重算并单事务写入全部行与 state | memory + Postgres 测试（本机测试库，证明未 skip）的读写调用计数断言 |
| SC-W0047-03 | **共享计算只加字段，旧响应逐字段不变（R-1）。**同一夹具先后调用 `/api/mobile/contacts-dashboard`（改前快照 vs 改后），响应除新增可选 `relationshipTierDistribution` 外逐字段相同 | `tests/api/mobile-contacts-dashboard-route.test.ts` 新增「旧响应逐字段不变」用例（改前输出存为夹具） |
| SC-W0047-04 | **界面改档位。**打开管线页看到 新认识／有往来／核心／待唤醒 四列，点开一位联系人详情看到档位标签与依据弹层 | 组件测试 + 浏览器 1440／375 截图（管线页、详情依据弹层） |
| SC-W0047-05 | **H 档收口与流量。**本机 50+ 联系人且各来源有数据的账号跑一次 `sourceStamp` 读取、一次缓存读取、一次全量重算，实测语句数与返回字节并入 D39 月预算表 | REPORT 预算表（`~/orbit-sprint-evidence/web/sprint-W0047/run-01/`） |

### 必需证据子表（每条子断言独立留证，缺一即该 SC 不通过）

| SC | 子断言 | 证据 |
| --- | --- | --- |
| 01 | 规则表分值、半衰期 90 天、同来源同日去重、`tier` 70／45；示意场景 25／50／≈80 | 表驱动测试 |
| 01 | `dormant` = 峰值 ≥45 且 60 天无非 capture 记录：第 59／60 天边界；未来约见；memo 事件类型 | 表驱动测试 |
| 01 | 每条 `signals[].timelineItemId` 能在输入时间线里找到；同输入同时间点结果逐字段相同 | 表驱动测试 |
| 01 | 修改联系人 stage、tags、status、customTags 后（时间线不变）结果不变；输入类型不含这些字段与私信 | 表驱动测试 + 类型断言 |
| 01 | **R-7**：单人 >12 条信号夹具，`now − 30 天` 的档位由完整去重时间线算出，与「只用缓存 12 条 signals 回放」的结果不同时以前者为准（断言等于全量回放）；`capture` 晚于时间点的联系人不计入 `computeRelationshipTierCountsAt` | 表驱动测试 |
| 02 | 跨东京日或 `rulesVersion` 变化触发重算；重算同一遍写出 `tierCountsAt30d` 与 `earliestCaptureAt`，与 SC-01 纯函数结果一致 | Postgres 测试 |
| 02 | 两个并发刷新后读模型与串行结果相同；删除全部缓存行后重算结果相同 | Postgres 并发用例 |
| 02 | 他人 0 行；`connections` 集合 0 次写 | 写调用计数断言 |
| 02 | 刷新入口只在 Web 服务端加载器与后台入口：`app/api/mobile/**` 无 `ensureRelationshipStrengths` 引用（R-1） | 源码扫描测试或 `rg` 输出存证 |
| 03 | `relationshipStrengthDistribution` 仍按 `relationshipStrength ?? businessRelevanceScore ?? 0`（`dashboard-distribution.ts:560`）与 SQL `strength_score` 计算，缓存缺行不影响它；既有分布测试不改且通过 | `shared/compute` 与两个 reader 的既有测试 |
| 03 | 新增 `relationshipTierDistribution`：SQL 读模型路径与图路径对同一夹具输出相同，含 `dormant`，四组人数之和 = 有缓存行的联系人数 | `shared/compute` 与两个 reader 的新增测试 |
| 03 | 手机 schema 解析新旧两种响应都通过 | `tests/api-schema/mobile-contacts-dashboard-schema.test.ts` |
| 04 | 列头人数来自全部联系人；卡片按 `lastSignalAt` 倒序每列至多 30；`dormant` 优先归入待唤醒；无拖拽、无假筛选 chip | 组件测试 |
| 04 | 依据弹层列出 `signals`（日期、来源、时间线标题）；详情不再渲染「更新状态」与「待设置关系」面板 | 组件测试 |
| 04 | 列表强弱点改读缓存（core→strong、active→medium、new→weak、dormant→dormant，无行→unscored）；Web 分析视图改读 `relationshipTierDistribution` | 列表适配器与视图模型测试 |
| 04 | 示例模式静态档位、0 请求；中英双语 | 组件测试 |
| 05 | 按「管线／分析／详情／列表每人每天合计 8 次读缓存 + 每天 2 次重算 × 30 天 × 1000 人」折算，并入开工时 README 最新三档；超 1.6 GB 如实登记 D32 | REPORT 预算表 |
| 05 | 全量 `npm test` 对照基线新增失败 0；`npx tsc --noEmit -p .`；一次 Codex 代码 review | 全量清单、review 处理 |
| 05 | REPORT「App 影响」一节（R-9）：新增 optional 字段、SC-03 旧响应逐字段不变的证据、未验证范围 | REPORT |
| 05 | **D46①**：同一提交含 `npm run sync:contract` 写出的 App 副本，App 端 `contract-sync`／`api-schema-sync`／`compute-sync`／`domain-sync` 四个测试全绿；`repos/orbit-app` 除 `src/api/{contract,schema,compute,domain}` 外无改动 | 同步命令输出、App *-sync 测试输出、`git diff --stat` |

## 一次 Generator 的执行顺序

1. 复核进入条件（W0046 合并 SHA、契约名以其 REPORT 为准）；记录基线 SHA、Planner SHA256；确认用户未提交文件不动。
2. impact：上表符号 + 实际修改的 reader／adapter 函数；报告 CRITICAL；ambiguous 用文本搜索补查。
3. RED → 实现：纯函数 → 批量时间线读取与读模型 → 两个 dashboard 路径与契约 → 管线／详情／列表 UI → 示例。
4. 收口集 → 浏览器 → 流量测量 → 全量对照 → Codex review → 有限修复 → 在 `repos/orbit-app` 执行 `npm run sync:contract` 并跑 App 四个 *-sync 测试为绿（D46①）→ 路径限定提交（含同步副本）→ REPORT → 交接。

## 最小测试与检查

- **档位 H**：共享契约定稿 + CRITICAL 共享读取 + 新写入（读模型）。
- **开发定向集**：新强度测试；`grep -rl "dashboard-distribution\|dashboard-read-model\|relationshipStrengthDistribution" tests` 命中文件；`grep -rl "network-pipeline\|network-detail-modal" tests`。
- **收口集**：定向集 + 列表适配器测试（`grep -rl "contacts-view-model-adapter\|contacts-subroute-route-adapter" tests`）、`tests/pages/app-contacts-subroutes-live-route-services.test.ts`、`tests/audits/unbounded-list-reads.test.ts`、`tests/performance/read-cost-baseline.test.ts`（若基线变化按其流程更新并在 REPORT 说明）、`npx tsc --noEmit -p .`。
- **数据库**：先 `node scripts/assert-local-test-databases.mjs`，REPORT 证明未 skip。
- **全量**：本地代码收口一次（RULES 5.2）。
- **App 机械同步（D46①，RULES §6）：**本 Sprint 改动 `shared/{contract,api-schema,compute,domain}`，须在**同一提交**里于 `repos/orbit-app` 执行 `npm run sync:contract`（即 `scripts/sync-contract.mjs`：`shared/contract`→`src/api/contract`、`shared/api-schema`→`src/api/schema`、`shared/compute`→`src/api/compute` 整目录逐字复制，`shared/domain` 只复制 `industries.ts`／`language.ts`→`src/api/domain`），只复制、不改 App 逻辑；再在 `repos/orbit-app` 跑 `node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/contract-sync.test.ts tests/api-schema-sync.test.ts tests/compute-sync.test.ts tests/domain-sync.test.ts`，须全绿（2026-10-02 编制时 4 文件 10 例全绿）。被同步的文件只能引用同步范围内的文件：`shared/contract` 只能 `./` 互引（`contract-sync` 的「自包含」用例），`shared/compute` 受 `tests/support/shared-compute-audit.ts` 约束（只可 `./`、`import type` 契约与两个字典），`shared/api-schema` 引 `../domain/*` 只限 `industries`／`language`；违反时改 Web 侧写法，不改 App。除同步脚本写出的副本外，本 Sprint diff 不含 `repos/orbit-app` 其他文件；App 界面与 App typecheck 不在本 Sprint 验收内，在 REPORT「App 影响」写明未验证。
- **不运行**：App 端 *-sync 以外的测试（App 逻辑不改，手机接口只加可选字段，由 schema 测试覆盖）；付费 AI。

## 失败与交接

外部条件缺失先不启动；run 已开始按 RULES 产出 failed／blocked 报告。REPORT 写：SC 映射与 SHA；**契约最终字段与 `rulesVersion`**、规则表实际取值（W0048a 快照 `sourceDataVersion` 要覆盖它）；`ensureRelationshipStrengths` 签名与调用点（只在 Web 加载器与后台入口）；**按时间点入口**（`computeRelationshipTierCountsAt` 与 state 行 `tierCountsAt30d`／`earliestCaptureAt` 的字段，W0049 直接用，R-7）；`relationshipTierDistribution` 字段形态；「App 影响」一节（新增 optional 字段、旧字段逐字段不变的证据、同步的副本与四个 *-sync 测试结果、未验证范围，交 W0055 汇总进 Bridge handoff）；CRITICAL impact 处理；流量表；截图；全量清单；review 处理；App 端观察项（App 本地计算仍无真实强度，需 App 线另议）。交接列本线分支、固定最终 SHA、待合并目标 `chat-agent`。

## 已定（D44，2026-10-02）

| 编号 | 定稿结论 | 对标做法 |
| --- | --- | --- |
| W47-1 | 强度存独立读模型 `relationship_strengths`（`orbit_records` 新集合，可重建缓存），读取时作为**新增**档位输入交给 `shared/compute`（`relationshipTierDistribution`），既有 `relationshipStrengthDistribution` 不改（R-1），不写 `connections` | Affinity 的 relationship strength、HubSpot 的 calculated／score 属性是系统计算的只读值，与用户可编辑字段分开、可随规则重算 |
| W47-2 | 读时按需重算：先比 `sourceStamp` 与东京日期，变了才重算；不设夜间任务 | Affinity 新互动进来即时更新强度、每日刷新衰减；HubSpot 分数在属性变化时重算、衰减按日生效 |
| W47-3 | 按初稿：半衰期 90 天、待唤醒 60 天、核心 ≥70／有往来 ≥45；参数集中一张表、带 `rulesVersion`，上线后按真实分布再调 | HubSpot 评分属性按 1／3／6／12 个月衰减窗口；Affinity 强度看新近度与频次、当面与会议权重高于单向记录 |
| W47-4 | 所有人脉列表的强弱点本 Sprint 改读真实档位（只换数据来源，列与档位筛选仍是 W0051） | Salesforce／HubSpot 的计算字段在所有视图引用同一属性，不在各页面各算一套 |
| W47-5 | 管线列头人数统计全部联系人，每列卡片按最近往来取前 30；「查看该档全部」留给 W0051 的档位筛选 | HubSpot、Pipedrive 看板列头显示全量计数、卡片分批加载 |
| W47-6 | 不显示数字分数，只显示档位与依据（信号列表） | Affinity 用强度条而非分数、LinkedIn 只显示关系度数 |

App 端遗留（C-6，D44）：App 的 dashboard-distribution 镜像没有真实强度，本大目标不改 App，登记为 App 线后续候选（REPORT 观察项照写）。
