# Sprint W0049 — 「结构」标签：有依据的诊断、四维分布、健康变化

> revision 4：按 D46 修订（①④⑦）：改 `shared/{compute,api-schema}` 的同一提交内执行 App 机械同步脚本 `npm run sync:contract`（只复制、不改 App 逻辑）并跑 App 四个 *-sync 测试为绿，注明 `shared/compute` 不得 import `shared/domain/seniority.ts`；`getCurrent()` 多读字节如实计量，超 D39 预算另加只读瘦身读取（不在本轮默认范围）；基线行号以开工时 HEAD 为准、按符号重定位。
>
> revision 3：按 REVIEW-2026-10-02-network 裁决修订（R-6、R-7、R-12、R-16）：计划只读 `getCurrent()` + 纯投影，SC-03 加阶段边界夹具 0 写入／0 生成器断言；30 天变化改读 W0047 由完整去重时间线算出的 `tierCountsAt30d`，不得省略，仅 30 天前确无数据时显示「数据不足」；快照统一读 `NetworkSnapshotView.blocks` + `freshness.stale`；验收契约改为「操作链 + 主证据」+ 必需证据子表。
>
> revision 2：按 D44 定稿待定项、W0048 拆分、配额两池（2026-10-02）。快照改由 W0048a 提供；本 Sprint 页面只读，不占任何配额池。

**Plan revision:** 4。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** RN-07 全部（REQUIREMENTS「大目标 4」）。**单一目标:** 结构标签按 ①诊断 ②四维分布 ③健康四档与 30 天变化 ④结构洞察 重做；①④读快照，②③实时规则计算。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 开工时 `chat-agent` HEAD（编制时 `a48e1749`，W0043～W0048b 均未实施；GitNexus 索引 `behind`，开工先刷新）。下文行号按 `a48e1749`，W0043 会改同一批文件，开工按符号重新定位。 **行号以开工时 HEAD 为准，按符号重定位（D46⑦）。**
**档位:** H（共享契约消费 + `shared/compute` 只加字段 + 读模型 SQL；相关符号 HIGH／CRITICAL）。
**进入条件:**
- **W0043、W0048a completed**（登记表依赖；W0048a 传递要求 W0045、W0046、W0047 completed）。W0043 同改 `network-analysis.tsx` 与 `contacts-analysis-view-model.ts`，本 Sprint 沿用其双语模板与白名单。不依赖 W0048b。
- W49-1～W49-4 已定（D44，见文末）。
- 不调用付费 AI（打开页面只读快照，重算由 W0048a 的后台流程负责、计入后台池）；不做迁移；不需要云端授权。

## 上下文包（Generator 从这里起步，不通读其他 REPORT）

### 必读文件
- `app/(app)/app/contacts/network-0918/network-analysis.tsx`：结构标签在第 126–229 行（hero 诊断、维度环形图 + Top5、结构洞察卡、关系健康）。**把结构标签抽到新文件 `network-analysis-structure.tsx`**，`network-analysis.tsx` 只保留标签切换与机会标签，减少与 W0050／W0051 的同文件冲突。
- `app/(app)/app/contacts/analysis/contacts-analysis-view-model.ts`：`structure` 区块映射（第 80–89 行）；W0043 之后是白名单视图模型。
- `app/(app)/app/contacts/network-0918/network-overview-model.ts:43` `healthRows`（strong/warm/weak 三档，本 Sprint 改四档后概览也会受影响，见易错 6）。
- `app/(app)/app/contacts/dashboard/page.tsx`：服务端并行读 `loadContactsAnalysis` 与 `loadAppContactsRouteViewModel({}, actor.id)`（**名单默认每页 30 条**，`contact-list-postgres-reader.ts:1176`）；示例期分支（第 53–68 行）结构标签只显示 `NetworkDemoAnalysisNotice`，本 Sprint 不改示例（W0054）。
- `shared/compute/dashboard-distribution.ts`：两条分布计算路径必须同时改——**graph 路径** `structureDistribution`（第 383 行）／`structureDistributions`（第 431 行）／`strengthDistribution`（第 589 行），与 **SQL 读模型路径** `readModelDescriptor`（第 687 行）／`distributionPayloadFromReadModel`（第 780 行起，分组来自 `features/dashboard/storage/dashboard-read-model-postgres-reader.ts:454` 的 `structure_groups`）；维度白名单 `structureDimensions`（第 295 行），名单下钻 `structureDetailPayload`（第 1118 行）与 `getStructureDetail`（第 1318 行，会拒绝不在白名单的维度）。
- `shared/compute/dashboard-distribution-contract.ts:173` `NetworkStructureDimensionId`。
- `shared/api-schema/mobile-contacts-dashboard.ts:202–207`：`structureDistributions` 是**非 passthrough 的 `z.object`**，未声明的新维度会被 Web 的 `safeParse` **静默剥掉**；新键必须在这里声明为 optional（手机 App 用自己的 schema 副本 `repos/orbit-app/src/api/schema/…`，由同一提交里的 `npm run sync:contract` 逐字更新，不改 App 逻辑，D46①）。
- `app/(app)/app/contacts/analysis/contacts-structure-route-service.ts`：`dimensionSchema`（第 9 行）也要接受新维度；`app/(app)/app/contacts/analysis/[dimension]/[bucketId]/page.tsx`。
- `features/plans/contract.ts:132` `NetworkNeedCriteria`（`primaryIndustryId`、`secondaryIndustryId`、`titleKeywords`）；计划读取入口见「前序交接」。
- `shared/domain/industries.ts`：`SECONDARY_INDUSTRY_CATALOG`、`secondaryIndustryLabel`、`industryLabel`。

### 关键符号（原样）与 impact（索引 behind 时结果，开工复核）
- `export function contactsAnalysisToView(input: unknown, language: OrbitLanguage): ContactsAnalysisView` — **HIGH**（5）。
- `export function createLiveNetworkDistributionAnalyticsService({` — **HIGH**（10）。
- `export function createDashboardReadModelPostgresReader({` — **CRITICAL**（11）。
- `function structureDistributions(graph: LiveDashboardGraph): NetworkStructureDistributions` — **UNKNOWN**（索引未解析调用方，文本搜索：同文件第 645 行 1 处）。
- `function readModelDescriptor(dimension: NetworkStructureDimensionId, group: StructureReadGroup): { id: string; label: string; missing: boolean }` — LOW（3）；`function structureDetailPayload(` — LOW（1）；`distributionPayloadFromReadModel` — LOW（1）。
- `export function structureDetailToView(input: unknown, dimension: string, bucketId: string, language: OrbitLanguage): ContactsStructureDetailView` — LOW（2）。
- `export function NetworkAnalysis({ viewModel, analysis, initialTab }: …)` — LOW（1）；`export function healthRows(analysis: ContactsAnalysisView): HealthRow[]` — LOW（2）；`AppContactsDashboardPage` — UNKNOWN（Next 路由入口，无代码调用方）。

### 前序交接要点（字段名以各 REPORT 为准，这里只写契约名与用途）
- **W0048a → `NetworkSnapshotView`（R-12，统一形态）**：按 actor 的当前快照读取入口（名称以 W0048a REPORT 为准）；只用 `state`（`ready|none|insufficient|unavailable`）、`blocks`（已是请求语言：「结构诊断一句」取 `kind: "diagnosis"`、「2–3 条结构洞察」取 `kind: "insight"`，每块 `text` 与 `evidence.contactIds`）、`generatedAt`、`contactCount`、`freshness.stale`。不读 `language.{zh,en}`、不读顶层 `stale`；打开页面只读，不触发生成。
- **W0047 → `RelationshipStrength`**：`tier: "new"|"active"|"core"` + `dormant`、`signals[]`（`occurredAt`、贡献分）。当前四档人数读 `shared/compute` **新增**的 `relationshipTierDistribution`（既有 `relationshipStrengthDistribution` 不用，R-1）；30 天前四档人数读 W0047 交接的 `relationship_strength_state.tierCountsAt30d`（由完整去重时间线按时间点算出，`computeRelationshipTierCountsAt`）与 `earliestCaptureAt`（R-7）。
- **W0045 → 补全字段**：`publicProfile.seniorityLevel`（6 档：`individual_contributor`／`manager`／`director`／`vp`／`c_level`／`founder`）是角色层级**唯一存储**；4 档分组是派生：`c_level`／`vp`／`founder`／`director`→决策层，`manager`→管理层，`individual_contributor`→执行层，空→其他。规范地区存联系人 `region { countryCode, city }`（W0045 定稿，最终名以其 REPORT 为准）。6→4 派生直接复用 W0045 的 `seniorityGroup()`：映射本体在 `shared/compute/seniority-group.ts`（compute 内同目录 import，满足审计），`shared/domain/seniority.ts` 只是再导出（协调者 2026-10-02 裁决，已写进 W0045）；分布、名单下钻、高亮共用，本 Sprint 不另写映射。**注意（D46①）：**`shared/compute` 受 `tests/support/shared-compute-audit.ts` 约束，只能 import 同目录、`import type` 契约与 `../domain/industries`／`../domain/language`，**不能** import `shared/domain/seniority.ts`（App 也没有它的副本）。compute 侧直接 import 同目录的 `./seniority-group`；不得在 compute 里另抄一份映射。
- **W0043**：`app/(app)/app/contacts/analysis/network-copy.ts`（双语模板、系统分组名封闭集）；视图模型白名单（后端句子字段不进视图）不得放宽。

### 方案要点（数据建模：单一事实来源、存细粒度、派生粗粒度）
1. **分布不存储，按细粒度字段实时派生。** 每位联系人的 `primaryIndustryId`／`secondaryIndustryId`、`seniorityLevel`、规范地区、强度档是唯一事实；四维分布、Top5、名单下钻、高亮都从同一个计算函数派生，保证「图上 N 人 = 点进去 N 人」。
2. **维度只加不改。** 在 `structureDistributions` 新增键（建议 `seniority`、`tier`、`region`，以及行业桶上的 `secondary[]` 子桶；`tier` 复用 W0047 新增的 `relationshipTierDistribution` 计算，不另算一遍），旧键 `industry`／`location`／`role`／`relationship` 语义与内容不动（App 仍在用）。graph 与 SQL 读模型两条路径输出必须一致（复用 `tests/services/dashboard-sql-read-model-postgres.test.ts` 的对照方式）。Web 结构标签只显示新四维（W49-4）。
3. **总数用全量。** 环形图中心人数、百分比分母、健康档人数取分布计算结果（全部联系人），不再用 `viewModel.connections.length`（最多 30）。
4. **诊断与洞察只来自快照**：按界面语言读取 `NetworkSnapshotView`（ja 请求 en），直接用 `blocks[].text`；依据 = `blocks[].evidence.contactIds`，用一次按 id 的有界读取（≤ 所有洞察 evidence 去重后的人数，上限 30）拿姓名，**只解析本人 actor 范围内的联系人**，不在范围或已删除的 id 静默略去；渲染为依据图标，点开列出姓名链接 `/app/contacts/{id}`。快照读失败只让①④显示「来源暂时不可用」，②③照常。
5. **高亮只来自结构化条件**：当前计划中未满足（`open`／`linked`）的 `network_need` 的 `criteria.primaryIndustryId`／`secondaryIndustryId` 命中的行业桶加高亮；当前 `NetworkNeedCriteria` 只有行业与职位关键词（W0048b 只加 `targetCount`），所以本 Sprint 只有行业高亮，地区与角色层级不高亮（W49-2：不从文字猜）。计划读取**只用** `PlanService.getCurrent()`（`features/plans/service.ts:688`，编制时按 `4f0aa533` 核实：只开 `repository.read`，读计划行 + 条目 + 最近 50 条记录，0 写入），再经本 Sprint 的**纯函数投影** `planNeedHighlights(snapshot: PlanSnapshot)` 取未满足需求的结构化条件；`getCurrent()` 比纯投影所需多读的字节（条目全集、最近 50 条记录）**如实计量**进 SC-05 预算表；超 D39 预算时另加只读瘦身读取方法，**不在本 Sprint 默认范围**，在 REPORT 登记 D32 并建议后续 Sprint（D46④）。**不得调用** `getCurrentView()`（`service.ts:1290`，阶段边界会经 `enterPhaseTransaction()` 写「进入新阶段」并经 `defaultPhaseRefiner()` 解析生成器）或 `enterCurrentPhase()`（R-6）。
6. **30 天变化必须显示**（W49-1、R-7）：当前四档人数 − W0047 `tierCountsAt30d.counts`（W0047 在重算时用完整去重时间线按 `now − 30 天` 算好并存在 state 行，本 Sprint 不回放缓存里的 12 条 `signals`、不额外读时间线）。**不得因接口缺失省略**——W0047 未交接 `tierCountsAt30d` 即本 Sprint blocked。唯一允许不显示数字的情形：`earliestCaptureAt` 晚于 `now − 30 天`（30 天前账号里确实还没有联系人），此时每档显示「数据不足」／`Not enough data`，**不显示 0**。

### 易错边界（均已写入 SC）
1. 新维度未在 `shared/api-schema` 声明 → Web 解析时被静默剥掉，页面全空（SC-02 用真实 schema 走一遍）。
2. 只改了 graph 路径或只改了 SQL 路径 → 本机 live 与测试结果不一致（SC-02）。
3. 名单下钻维度白名单（`structureDimensions`、`contacts-structure-route-service.ts` 的 `dimensionSchema`）漏加 → 点分组 404 或「错误」（SC-02）。
4. 依据联系人跨账号泄漏：只按本人 actor 范围解析（SC-01）。
5. 打开页面调用付费 AI 或写计划：测试用付费 AI 边界账本断言 0 次；阶段边界计划夹具下服务端加载 INSERT／UPDATE 0 条、计划生成器 0 次解析（SC-03，R-6）。
6. `healthRows` 是概览与分析共用的：改四档后概览「关系健康」若仍用三档映射会显示错或为空。本 Sprint 只改结构标签使用的路径，概览改造归 W0052；若共用函数必须改，概览测试要同步通过（SC-04）。
7. 统计数字不写进快照，也不从快照读（契约）；快照里的 `contactCount` 只用于「基于 N 人」标注。

## 范围与文件
- 修改：`network-analysis.tsx`（抽出结构标签）、`contacts-analysis-view-model.ts`、`network-overview-model.ts`（仅在共用函数必须改时）、`contacts-structure-route-service.ts`、`contacts/dashboard/page.tsx`（服务端多读快照、计划需求、依据姓名）、`shared/compute/dashboard-distribution.ts`、`shared/compute/dashboard-distribution-contract.ts`、`features/dashboard/storage/dashboard-read-model-postgres-reader.ts`（SQL 分组加键）、`shared/api-schema/mobile-contacts-dashboard.ts`（只加 optional 键）、`network-copy.ts`（新维度分组名双语）、`network-shell.tsx`（样式，不写内联）。
- 新建：`app/(app)/app/contacts/network-0918/network-analysis-structure.tsx`；`app/(app)/app/contacts/analysis/structure-tab-model.ts`（纯函数：四维视图、高亮、30 天变化、依据解析）；（角色层级派生复用 W0045 的 `seniorityGroup()`，不新建）。
- 测试：新建 `tests/pages/app-network-analysis-structure.test.tsx`、`tests/services/structure-tab-model.test.ts`；改 `tests/pages/app-network-overview.test.tsx`（结构标签断言迁移）、`tests/pages/app-contacts-analysis-view-model.test.ts`、`tests/pages/app-contacts-structure-detail.test.tsx`、`tests/services/dashboard-sql-read-model-postgres.test.ts`。
- 排除：机会标签（W0050）、洞察标签（W0051）、概览（W0052）、示例静态快照与不足 3 人卡（W0054）、快照生成与配额（W0048a）、App 端逻辑与界面。
- 同步副本（D46①）：`repos/orbit-app/src/api/{schema,compute}` 中由 `npm run sync:contract` 写出的变化与本 Sprint 代码同一提交。

## 验收契约（最多五项；revision 3 起每项 = 一条操作链 + 一个主证据，其余断言见「必需证据子表」，R-16）

| SC | 操作链（可观察行为） | 主证据 |
| --- | --- | --- |
| SC-W0049-01 | **诊断与洞察来自快照、处处有据、页面不调 AI。**用 `NetworkSnapshotView` 夹具（诊断 + 3 条洞察，各带 2–3 个 evidence id）打开结构标签：显示 `blocks` 的文字，每条洞察展开依据只列出本人范围内存在的联系人 | `tests/pages/app-network-analysis-structure.test.tsx` |
| SC-W0049-02 | **四维分布同源、全量、可下钻。**35 位联系人夹具（名单只返回 30）打开四个维度，每维人数之和 = 35；任选一个分组点进名单，人数等于图上人数 | `tests/services/structure-tab-model.test.ts` + 名单页测试 |
| SC-W0049-03 | **目标相关高亮只来自计划需求，计划只读。**有生效计划（2 条 open／linked、1 条 established）且计划正处阶段边界时打开结构标签：A 一级桶、B1 二级桶高亮，C 不高亮；整个服务端加载对计划 0 写入、0 次生成器调用（R-6） | 服务端加载测试（SQL 写语句计数 + 生成器 factory spy） |
| SC-W0049-04 | **关系健康四档与 30 天变化。**用 W0047 state 夹具（当前 新认识 3／有往来 2／核心 1／待唤醒 1，`tierCountsAt30d` 为 2／2／0／0）打开结构标签，显示 `+1`、持平、`+1`、`+1` | `structure-tab-model` 单测 + 结构标签组件测试 |
| SC-W0049-05 | **数据库预算与真实页面。**本机 live 真实账号（有快照、有计划）打开 `?tab=structure` 一次，实测新增读取的单次字节与语句数并入 D39 月预算表 | REPORT 预算表 + 测量脚本输出（`~/orbit-sprint-evidence/web/sprint-W0049/run-01/`） |

### 必需证据子表（每条子断言独立留证，缺一即该 SC 不通过）

| SC | 子断言 | 证据 |
| --- | --- | --- |
| 01 | 夹具里 1 个 evidence id 属于另一 actor、1 个已删除：两者都不出现；链接 `/app/contacts/{id}` | 组件测试；服务端加载计量桩断言依据读取只带本人 actor |
| 01 | zh 显示中文，en 与 ja 显示英文（按界面语言请求视图，ja 请求 en）；诊断旁「基于 N 人」= `contactCount` | 组件测试 |
| 01 | 只读 `NetworkSnapshotView.state／blocks／generatedAt／contactCount／freshness.stale`，代码中无 `language.zh`／`language.en`／顶层 `stale` 读取（R-12） | 类型检查 + 源码扫描断言 |
| 01 | 无快照 → ①④不渲染，②③正常；快照读失败 → ①④「来源暂时不可用」，②③正常 | 组件测试 |
| 01 | 页面渲染与服务端加载付费 AI 调用 0 次（`scripts/test-paid-ai-boundary.mjs` 账本为空） | 服务端加载测试 |
| 02 | 行业（一级环形图 + 选中一级显示二级 Top5，W49-3）、地区（规范地区）、角色层级（6→4 派生覆盖 6 档与空值）、关系强度档（新认识／有往来／核心／待唤醒）；百分比分母 35 | `structure-tab-model.test.ts` |
| 02 | 每维任选一个分组，`/app/contacts/analysis/<dimension>/<bucketId>` 名单人数等于图上人数 | `tests/pages/app-contacts-structure-detail.test.tsx` |
| 02 | graph 路径与 SQL 读模型路径对同一数据产出相同的新维度 | `tests/services/dashboard-sql-read-model-postgres.test.ts`（本机测试库，REPORT 证明未 skip） |
| 02 | 新键在 `shared/api-schema` 声明后经 `mobileContactsDashboardPayloadSchema` 解析不丢失；旧键 `industry/location/role/relationship` 与 `relationshipStrengthDistribution` 输出与改前逐字段相同 | schema 测试 + SQL 对照测试 |
| 03 | 图例「与计划人脉需求相关」；无计划、计划读取失败 → 无高亮且其余正常 | `structure-tab-model` 单测 + 组件测试 |
| 03 | 计划只经 `getCurrent()` + 纯投影 `planNeedHighlights` 读取；代码中无 `getCurrentView`／`enterCurrentPhase` 调用（R-6） | 源码扫描断言 |
| 04 | 30 天前确无联系人（`earliestCaptureAt` 晚于截止）→ 每档显示「数据不足」／`Not enough data`，不显示 `0`、不省略该行（R-7） | `structure-tab-model` 单测 |
| 04 | W0047 交接的 30 天前人数来自完整去重时间线：夹具含单人 >12 条信号，页面显示的变化与全量回放一致（复用 W0047 SC-01 夹具） | `structure-tab-model` 单测 |
| 04 | 当前人数来自全量 `relationshipTierDistribution`，不来自名单；概览页现有测试仍通过（或按 W0052 前的过渡方案同步修改并说明） | 组件测试、`tests/pages/app-network-overview.test.tsx` |
| 05 | 拦截 `pg.Client.prototype.query`（W0017 口径）：新增读取 = 快照、计划 `getCurrent()`（含多读的条目与最近 50 条记录，如实计量，D46④）、依据姓名、新增维度带来的读模型增量、`tierCountsAt30d` 所在 state 行；按 1000 位活跃用户 × 每人每天 2 次（假设，REPORT 注明）× 30 天并入开工时 README 最新总账三档；参考行（不进总账）：改前已有读取的单次字节；1.6 GB 不作通过条件，超限登记 D32 | REPORT 预算表 |
| 05 | 浏览器 zh／en × 1440／375 截图：切换四个维度、点开一条洞察依据、点一个分组进名单；控制台无新增错误 | 截图与控制台日志 |
| 05 | H 档：全量 `npm test` 对照基线新增失败 0、`npx tsc --noEmit -p .`、一次 Codex 代码 review | 全量清单、review 处理 |
| 05 | **D46①**：同一提交含 `npm run sync:contract` 写出的 App 副本，App 端 `contract-sync`／`api-schema-sync`／`compute-sync`／`domain-sync` 四个测试全绿；`repos/orbit-app` 除 `src/api/{contract,schema,compute,domain}` 外无改动 | 同步命令输出、App *-sync 测试输出、`git diff --stat` |

## 一次 Generator 的执行顺序
1. 复核进入条件（W0043、W0048a completed；W49-1～4 已定）；读 W0045／W0047／W0048a REPORT 的交接段（只读交接段）确认字段名；记录基线与 Planner SHA256。
2. 刷新 GitNexus 索引，对「修改」符号重跑 upstream impact；HIGH／CRITICAL 在 REPORT 记录。
3. RED：`structure-tab-model` 单测（分布同源、高亮、30 天回放、依据解析）与 SQL／graph 对照用例。
4. 实现：`shared/compute` 加维度（两条路径）→ schema 声明 → 下钻白名单 → 视图模型 → 抽出结构标签组件 → 服务端加载（快照、计划需求、依据姓名并行）。
5. 定向 GREEN → 收口集 → typecheck → 全量对照 → 数据库实测 → 浏览器 → 在 `repos/orbit-app` 执行 `npm run sync:contract` 并跑 App 四个 *-sync 测试为绿（D46①）→ `detect-changes --scope staged` → 路径限定 commit（含同步副本）→ REPORT → 交接。

## 最小测试与检查
- **档位 H**：共享契约消费、`shared/compute` 加字段、读模型 SQL（CRITICAL）。
- **开发定向集**（cwd `repos/orbits`）：`node scripts/run-node-tests.mjs tests/services/structure-tab-model.test.ts tests/pages/app-network-analysis-structure.test.tsx`。
- **收口集**：定向集 + `tests/services/dashboard-sql-read-model-postgres.test.ts`、`tests/services/sync-dashboard-graph-postgres.test.ts`、`tests/services/mobile-contacts-dashboard-service.test.ts`、`tests/api/mobile-contacts-dashboard-route.test.ts`、`tests/pages/app-contacts-analysis-view-model.test.ts`、`app-contacts-structure-detail.test.tsx`、`app-network-overview.test.tsx`、`app-network-overview-model.test.ts`、`app-network-pipeline.test.tsx`、`app-network-demo-pages.test.tsx`、`app-contacts-dashboard-account-scope.test.ts`；以及 W0047／W0048a REPORT 列出的强度与快照测试文件；`npx tsc --noEmit -p .`。数据库测试先跑 `node scripts/assert-local-test-databases.mjs`。
- **全量触发**：本地代码收口后一次 `npm test`，按 RULES 5.2 基线对照只查新增失败；不 source `.env`。
- **代码 review**：一次 Codex 代码 review，意见交回同一 Generator。
- **App 机械同步（D46①，RULES §6）：**本 Sprint 改动 `shared/{contract,api-schema,compute,domain}`，须在**同一提交**里于 `repos/orbit-app` 执行 `npm run sync:contract`（即 `scripts/sync-contract.mjs`：`shared/contract`→`src/api/contract`、`shared/api-schema`→`src/api/schema`、`shared/compute`→`src/api/compute` 整目录逐字复制，`shared/domain` 只复制 `industries.ts`／`language.ts`→`src/api/domain`），只复制、不改 App 逻辑；再在 `repos/orbit-app` 跑 `node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/contract-sync.test.ts tests/api-schema-sync.test.ts tests/compute-sync.test.ts tests/domain-sync.test.ts`，须全绿（2026-10-02 编制时 4 文件 10 例全绿）。被同步的文件只能引用同步范围内的文件：`shared/contract` 只能 `./` 互引（`contract-sync` 的「自包含」用例），`shared/compute` 受 `tests/support/shared-compute-audit.ts` 约束（只可 `./`、`import type` 契约与两个字典），`shared/api-schema` 引 `../domain/*` 只限 `industries`／`language`；违反时改 Web 侧写法，不改 App。除同步脚本写出的副本外，本 Sprint diff 不含 `repos/orbit-app` 其他文件；App 界面与 App typecheck 不在本 Sprint 验收内，在 REPORT「App 影响」写明未验证。
- **不运行**：真实 AI 调用（本 Sprint 不需要）；App 端 *-sync 以外的测试（不改 App 逻辑；只加 optional 键）。

## 失败与交接
缺前置先不启动。REPORT 写 SC 映射、SHA、预算表、review 处理、额外阅读（含读过的前序 REPORT 段落）。交接给 W0050／W0051／W0052：`network-analysis-structure.tsx` 与 `structure-tab-model.ts` 的导出；新增维度键名；角色层级派生函数位置（若按 D46① 移入 `shared/compute`，写明新位置与 re-export）；App 同步副本与四个 *-sync 测试结果；依据解析函数（W0050／W0051 的依据展示复用，不再各写一份）；30 天回放是否可用。

## 已定（D44，2026-10-02）

| 编号 | 定稿结论 | 对标做法 |
| --- | --- | --- |
| W49-1（rev 3 按 R-7 修订） | 30 天变化用当前规则对完整去重时间线求 30 天前的档位（W0047 重算时算好存在 state 行，派生、可重建，不存每日人数）；规则调整后随之重算（REPORT 注明）；不得因接口缺失省略，仅 30 天前确无联系人时显示「数据不足」 | Mixpanel／Amplitude 的历史指标按原始事件实时回算，HubSpot 存每条记录的属性历史而不是汇总人数 |
| W49-2 | 无计划（或计划无人脉需求）时不高亮；只按计划需求的结构化条件高亮，不按关系目标文字做关键词或 AI 猜测 | LinkedIn Sales Navigator 只按用户保存的结构化 ICP 条件标「匹配」，不从自由文本推断 |
| W49-3 | 行业一级环形图与 Top5；选中一级后在图例下展开其二级 Top5，两级都可点进名单；无二级值归「未细分」 | Google Analytics／HubSpot 报表主维度 → 次维度下钻，不把两级平铺在同一张饼图里 |
| W49-4 | Web 结构标签下线旧 `role`／`relationship` 两维，只显示新四维；后端旧键保留给 App，不删 | Linear／Notion 字段单一事实来源，旧字段迁移后从界面撤下而不是并列两套口径 |
