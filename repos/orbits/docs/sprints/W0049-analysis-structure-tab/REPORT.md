# Sprint W0049 — 执行总结

> 报告由协调者按 Generator 原文写入（子代理写文件被拦）。协调者确认：接受 read-cost `contacts.dashboard` 预算 357651 → 357820（+169 B，同一行多了新维度分组，无新语句、无新行，参照 W0047 先例）。

## 结果

「结构」标签按 ①结构诊断 ②四维分布 ③关系健康 ④结构洞察 重做完成，五个 SC 都有测试或实测证据，本机真实账号（verify-plan）已用浏览器验证。全程付费 AI 0 次。

**已验证能做的**
- 诊断与 2–3 条洞察只来自快照 `blocks`，处处有据：
  - 每块依据点开后列出本人范围内的联系人，链接到联系人详情。
  - 一位可见联系人都没有的块不显示。
  - 姓名读取失败时，①④显示「来源暂时不可用」。
- 四维分布：行业两级、地区、角色层级、关系强度。
  - 人数用全量分布，不是名单分页的 30 条。
  - 每个图例项和 Top5 都能进名单，名单人数等于图上人数。
  - 行业一级可以展开二级 Top5，与计划人脉需求相关的分组带 ◆ 标记。
- 关系健康固定四档，每档显示较 30 天前的变化；30 天前账号里确实没有联系人时显示「数据不足」。
- 打开页面对计划 0 写入，付费 AI 0 次。

**仍不能做 / 不在本 Sprint**
- 本机 verify-plan 有 51 位联系人没有规范地区，归在「地区待完善」。要等生产回填（W0045，待授权）。
- 名单详情页的「关系质量」仍用旧的强／中／弱口径。
- 计划只经 `getCurrent()` 读取，会多读条目全集和最近 50 条记录（D46④ 如实计量）。只读投影列为后续候选。

## 运行记录

| 项 | 值 |
|---|---|
| run | run-01（2026-10-02～03） |
| 基线 | `chat-agent` `de16e0cb` |
| PLANNER SHA256 | `e81de1ea565ce2b7d91ef758c2474823225518836b878085627d877b1acbb794`（开工核对一致） |
| 分支 | `sprint/W0049-analysis-structure-tab`（当前工作树） |
| 提交 | `53dbad30` 功能 → `0add67d7` review 修复 → **`aa6b9f60` 全量回归修复（固定最终 SHA）**；报告由协调者写入 |
| 依赖 | W0043、W0048a（及 W0045～W0047、W0048b）均 completed |
| 证据 | `~/orbit-sprint-evidence/web/sprint-W0049/run-01/` |

## 验收结果（SC → 文件 → SHA → 证据）

### SC-W0049-01 诊断与洞察来自快照，处处有据，页面不调 AI — 通过
- **文件**：`structure-tab-model.ts`、`structure-tab-loader.ts`、`network-analysis-structure.tsx`、`features/network-analysis/evidence-contacts.ts`。
- **提交**：`53dbad30`、`0add67d7`。
- **证据**：
  - `tests/pages/app-network-analysis-structure.test.tsx`（主证据）、`tests/services/structure-tab-model.test.ts`、`tests/services/structure-tab-loader-postgres.test.ts`。
  - 浏览器截图 `screens/01、02、07`。
- **子断言**：
  - 他人与已删除的 id 不出现在依据里。
  - 依据按 `orbit_records.record_id` 读取（与快照同一 id 域）；数据库用例覆盖了 `record_id ≠ payload.id` 的情况，链接用 payload id。
  - 读取只发一条语句，参数只带本人 actor。
  - zh 显示中文，en 显示英文；ja 界面请求 en 快照。
  - 「基于 N 位联系人」等于 `contactCount`。
  - 源码扫描：无 `language.zh/en`，无顶层 `stale`，无 `getCurrentView`／`enterCurrentPhase`。
  - 无快照 → ①④不渲染；快照或姓名读取失败 → ①④ unavailable，②③正常。
  - 付费 AI 主机 0 次请求，快照生成器 0 次调用。

### SC-W0049-02 四维分布同源、全量、可下钻 — 通过
- **文件**：`shared/compute/dashboard-distribution{,-contract}.ts`、`dashboard-graph.ts`、`dashboard-read-model-postgres-reader.ts`、`dashboard-live-record-provider.ts`（图投影）、`shared/api-schema/mobile-contacts-dashboard.ts`、`contacts-structure-route-service.ts`、`network-copy.ts`、`contacts-analysis-view-model.ts`。
- **提交**：`53dbad30`、`0add67d7`。
- **证据**：
  - `structure-tab-model.test.ts`：35 人夹具、名单 30 条，四维人数之和都是 35，四维百分比之和都是 100。
  - `app-contacts-structure-detail.test.tsx`：每个新维度下钻，名单人数等于图上人数。
  - `dashboard-sql-read-model-postgres.test.ts`：W0049 用例证明 SQL 与图路径产出相同；旧键 `industry`／`location`／`role`／`relationship`、`relationshipStrengthDistribution`、`industryDistribution` 不受新字段影响。
  - `mobile-contacts-dashboard-route.test.ts`：剔除新键后与 W0047 golden 逐字段相同。
  - schema 解析新键不丢失。
  - 截图 `03～06、12～16`。

### SC-W0049-03 高亮只来自计划需求，计划只读 — 通过
- **证据**：`structure-tab-loader-postgres.test.ts`，在阶段边界的计划夹具上：
  - 计划三表前后不变，对计划 INSERT／UPDATE 0 条，补细器 0 次。
  - 对照：同一夹具上调用 `getCurrentView` 确实会写，证明夹具处在阶段边界。
  - A 一级、B1 二级高亮，已建立联系的 C 不高亮。
- 图例「与计划人脉需求相关」；无计划或计划读取失败时无高亮，其余正常（模型与组件测试）。

### SC-W0049-04 关系健康四档与 30 天变化 — 通过
- 当前 3／2／1／1、30 天前 2／2／0／0，显示 +1、持平、+1、+1。
- 30 天前确实没有联系人时，四档都显示「数据不足」，不显示 0，也不省略行。
- 单人超过 12 条信号时，state 行的 30 天前人数等于全量回放，显示的变化也一致。
- 当前人数来自全量档位分布；30 天前人数读页面既有的 `ensureRelationshipStrengthsForPage` 返回的 state 行，不多读。
- 展示时按最大余数分配，保证四档百分比合计 100（三等分用例）。共享层的 `relationshipTierDistribution` 不改。
- 概览页测试通过：`healthRows` 和概览都没改。

### SC-W0049-05 数据库预算与真实页面 — 通过（月流量超 1.6 GB，按惯例登记 D32）
- 流量见下文 D39 节。
- 浏览器：zh／en × 1440／375，见 `browser-notes.md`、`screens/01～16`。
  - 演练了切换四维、点开依据、点地区「日本 · 东京」进名单（3 = 3）、点二级「创业投资」进名单（1 = 1）。
  - 375 宽度无横向溢出，控制台无新增错误。
  - review 期间 hot reload 中途出现过一次 React 错误；重新加载后核对，不再出现。
- H 档检查：
  - 全量 `npm test` 与基线对照，新增失败 0（见测试节）。
  - `npx tsc --noEmit -p .` 源码 0 错，只有 `.next/types` 过期产物。
  - Codex review 一次（处理见下）。
- D46①：同一提交 `53dbad30` 含 `npm run sync:contract` 写出的 4 个 App 副本，App 四个 *-sync 测试 10/10（`app-sync-tests.txt`）。`repos/orbit-app` 只改了 `src/api/{compute,schema}`（`app-diff-stat.txt`）。review 修复没有动共享层。

## 测试与检查

收口前先跑 `node scripts/assert-local-test-databases.mjs`，exit 0。两个库变量都设为 `postgresql://li@localhost:5432/orbit_newui_events_20260922`，没有 source `.env`。

**数据库测试逐文件非 skip 输出**（`db-tests-per-file.txt`）：

| 文件 | 结果 |
|---|---|
| `tests/services/dashboard-sql-read-model-postgres.test.ts` | tests 4，pass 4，fail 0，**skipped 0** |
| `tests/services/structure-tab-loader-postgres.test.ts` | tests 3，pass 3，fail 0，**skipped 0**（含计划零写入） |
| `tests/services/network-snapshot-service.test.ts` | tests 16，pass 16，fail 0，**skipped 0**（含 R-6 计划零写入） |
| `tests/capabilities/plan-current-view-postgres.test.ts` | tests 5，pass 5，fail 0，**skipped 0** |

**收口集**：26 个文件 **197／197 通过，0 skip**（`closing-set-3.txt`）。

**全量 `npm test` 与基线对照**（RULES 5.2，同一组环境变量）：

| 运行 | 结果 | 失败数 |
|---|---|---|
| 基线 `de16e0cb`（detach 后跑，跑完切回） | 6469 tests | 82 fail（去重 83 条） |
| 改后第一次 | 6494 tests | 新增 3 |
| 最终 `aa6b9f60` | 6494 tests | 81 fail；**新增失败 0**（`new-failures-2.txt` 为空） |

改后第一次的 3 条新增失败，处理如下：
1. **0918 `<a>` 字色门禁**：新链接补了自带颜色的基础规则和 hover 规则，已修。
2. **read-cost `contacts.dashboard` +169 B**：`structure_groups` 在同一行里多了新维度的分组，没有新语句、没有新行。参照 W0047 先例，在 `read-cost-baseline.json` 把预算从 357651 调到 357820，并写了历史条目。协调者已确认接受。
3. **`sync-revision-migration` 锁超时**：偶发，基线里同文件的另一条也失败过。单独连跑 3 次都是 10／10（`sync-revision-rerun.txt`）。

## review 处理（Codex：5×P2、1×P3，无 P1；原文 `codex-review.txt`）

| 编号 | 裁决 | 处理 |
|---|---|---|
| P2-1 依据 id 域 | 采纳 | 改为按 `record_id = any($3)` 查询，返回 `record_id` 与 payload id，链接用 payload id；actor、accountId、lifecycle 三项过滤保留；补 `record_id ≠ payload.id` 的数据库用例 |
| P2-2 无据句子 | 采纳 | 姓名读取异常 → ①④ unavailable；没有可见联系人的块不显示；补了「姓名读取异常」「只有 recordIds」「依据全部被剔除」三类用例 |
| P2-3 档位百分比 | 采纳 | 只在 Web 四维视图投影时按最大余数分配，共享层不改；补三等分用例，去掉 tier 的百分比例外 |
| P2-4 第 6 名起无法下钻 | 采纳 | 每个图例项都有「名单 →」链接；行业一级的「看二级分布」按钮与名单链接并列、不嵌套；测试覆盖第 6、7 名和一级名单链接 |
| P2-5 缺库变量静默 skip | 部分采纳 | 门控不改（全仓约定）；本报告逐文件列出非 skip 输出，收口前先跑 assert |
| P3-6 区块顺序 | 采纳 | 改为 诊断 → 分布 → 关系健康 → 洞察，并加 DOM 顺序断言 |

## 打开页面时的写入（协调者要求注明）

页面读快照用的是 W0048a 的 `NetworkSnapshotService.readView`，与 `GET /api/network/snapshot` 是同一入口。判定需要自动重算时，它只把任务排进 `network_analysis_jobs`：
- 这是幂等的单行 upsert，主键 (actor, kind)；已有任务时不写。
- 不预留配额，请求内不生成；本加载器也不安排 after() 领取，由维护任务在后台池执行。
- 页面路径付费 AI 0 次，计划写入 0 次。
- 这与 W0048a 的契约（「判定为自动重算时只 upsert 一行 job（不预留）」）一致。
- 本机实测打开 verify-plan 时没有发生这次写入（快照是新的）。

## D39 流量（本机 live 库 verify-plan：60 人、1 份计划、快照 ready；`scripts/measure-structure-tab-traffic.ts`，拦截 `pg.Client.prototype.query`）

改后实测见 `traffic-measure-2.json`；首次测量在 `traffic-measure.json`、`traffic-d39.md`。

| 新增读取（每次打开分析子页，结构或机会标签） | 语句 | 单次字节 |
|---|---|---|
| 计划 `getCurrent()`：计划 758 + 条目全集 4,903 + 最近 50 条记录 1,815（D46④ 多读如实计量） | 5 | 7,476 |
| 快照 `readView`（W0048a 入口：资料、版本、强度戳、配额、视图） | 8 | 4,880 |
| 依据姓名（记录 id ≤30，本人范围） | 1 | 384 |
| 分布读模型新维度增量（15 个分组，并入既有语句） | 0 | 1,775 |
| 30 天前人数（state 行已在既有语句里） | 0 | 0 |
| **合计** | 14 | **14,515** |

- **折算假设**：1000 位活跃用户 × 每人每天 2 次 × 30 天。
- **直接相加**：870.9 MB／月。
- **去重**：扣掉 W0048a 已入账的「分析页每天打开 1 次，1,810 B ≈ 54.3 MB」，净增约 816.6 MB／月。
- **并入 README D32**（W0048b 后三档 4,120／4,180／4,659 MB）：去重后 **4,936.6／4,996.6／5,475.6 MB**，直接相加 4,990.9／5,050.9／5,529.9 MB。都超过 1.6 GB，按惯例登记 D32。
- **参考行（不进总账）**：
  - 改前的分布读模型语句约 17,028 B（改后 18,803 B）。
  - 图投影新增三个字段，本账号 60 人共 6,663 B（约 111 B／人），影响名单下钻、缺口兜底和 App 设备同步的整图读取。
- **瘦身候选**：
  1. 计划需求只读投影：只取 network_need 的 status 和 criteria，约省 7 KB／次，约 430 MB／月（D46④，后续 Sprint）。
  2. 只在 `?tab=structure` 时加载附加数据。
  3. `readView` 不重复读资料（W0048a 侧）。

## 付费 AI

0 次。`ai_usage_ledger`／`ai_usage_calls` 在本 Sprint 开工（2026-10-02 23:16 JST）之后没有新行，最近一行是 W0048b 验证留下的（`paid-ai-ledger-check.txt`）。验证中没有保存 memo，也没有生成计划；dev server 没有设置两个生成器环境变量。

## 影响分析（GitNexus，开工前强制全量重建索引）

- **CRITICAL**：`createDashboardReadModelPostgresReader`（11）。只加了 3 个 key 列和 3 路 union，证据分组限定在旧四维；SQL 与图路径对照测试通过。
- **HIGH**：
  - `createLiveNetworkDistributionAnalyticsService`（10）：下钻白名单扩大，只有 tier 维度才读档位。
  - `ensureRelationshipStrengthsForPage`（4）：返回值从 void 改成 state 或 null，四个调用方都忽略返回值。
- **其余 LOW**。
- **UNKNOWN 已用文本搜索补查**：
  - `contactFromRecord`：只在 `dashboard-graph.ts` 内使用。
  - `DASHBOARD_GRAPH_PROJECTION_SQL`：图读取，以及 `features/sync/dashboard-graph-reader.ts`。
  - `structureDistributions`：只有 1 处调用。
- **提交前 `detect-changes --scope staged`**：三次分别为 high（31 个文件、14 条流程）、low、low，都没有 partial／truncated（`detect-changes-staged-{1,2,3}.txt`）。分支上只有本 Sprint 的提交，没有外来提交。

## App 影响

- **改动的共享文件**：`shared/compute/dashboard-distribution{,-contract}.ts`、`dashboard-graph.ts`、`shared/api-schema/mobile-contacts-dashboard.ts`，都只加不改：
  - `structureDistributions` 新增可选的 `seniority`、`region`。
  - 行业分组新增可选的 `secondary`。
  - 下钻维度新增 4 个。
  - 图联系人新增 3 个可选字段。
- **App 侧变化**：
  - 设备同步的 dashboard-graph 投影多了 3 个字段（约 111 B／人）。不能省，否则设备与服务端的一致性测试会不同。
  - 旧 App 忽略新键。
- **未验证**：App 界面与 App typecheck（`NetworkStructureDetailPayload.dimension` 的联合类型扩大了）。

## 假设与额外阅读

- **额外阅读**：
  - W0043／W0045／W0047／W0048a／W0048b 各 REPORT 的交接段。
  - `features/network-analysis/{service,runtime,contract,input-source}.ts`（确认 `readView` 的行为与 id 域）。
  - `tests/support/network-analysis-harness.ts`、`plan-fixture.ts`、`tests/performance/read-cost-baseline.{test.ts,json}`、`tests/ui/orbit-0918-anchor-colour.test.ts`。
- **登记的文件补充（RULES §0）**：
  - `features/network-analysis/evidence-contacts.ts`（依据姓名读取，W0050／W0051 复用）。
  - `app/(app)/app/contacts/analysis/structure-tab-loader.ts`。
  - `shared/compute/dashboard-graph.ts` 与图投影。
  - `features/relationship-strength/read-model.ts`（返回 state）。
  - `scripts/measure-structure-tab-traffic.ts`。
  - 测试：`tests/services/structure-tab-loader-postgres.test.ts`、`tests/support/structure-tab-fixture.ts`。
  - 改动：`tests/api/mobile-contacts-dashboard-route.test.ts`、`tests/performance/read-cost-baseline.json`。
- **自定的可逆细节**（按成熟惯例）：
  1. tier 维度直接复用 `relationshipTierDistribution`，不在 `structureDistributions` 加键。
  2. 新维度分组不带 evidenceIds。
  3. 地区按「国家 + 城市」分组，id 为 `region_<CC>[_<URI 编码城市>]`，显示名用 Intl 生成。
  4. 未细分的 id 为 `<一级>.unspecified`。
  5. 名单页的分母与百分比同口径：二级取所在一级人数，tier 取有档位缓存的人数。
  6. 默认展开人数最多、且有二级的一级分组。
  7. 结构和机会两个标签都加载附加数据，概览不加载。
  8. 快照 `insufficient` 按 `none` 处理（不足 3 人的卡片属于 W0054）。
  9. 底栏「强关系占比」改名为「核心关系占比」。
  10. 英文依据按钮写成 `Evidence: N contacts`。

## 交接（给 W0050／W0051／W0052）

- **`structure-tab-model.ts` 导出**：`structureDimensionView`、`planNeedHighlights`、`healthTiles`／`tierChangeLabel`、`structureSnapshotView`、`evidenceContactIds`、类型 `StructureTabExtras`／`EvidencePerson`／`StructureBlockView`。
- **`structure-tab-loader.ts`**：`loadStructureTabExtras`、`defaultStructureTabLoaderDeps`。
- **`network-analysis-structure.tsx`**：`NetworkAnalysisStructure`。`NetworkAnalysis` 新增可选的 `structureExtras`。
- **依据解析（W0050／W0051 复用）**：`readEvidenceContactNames({ client, workspaceId }, actorId, recordIds) → Map<recordId, { contactId, name }>`，再交给 `structureSnapshotView` 过滤无据块。
- **新键名**：
  - 分布：`structureDistributions.seniority`、`structureDistributions.region`，以及 `industry[].secondary[]`。
  - 下钻维度：`seniority`、`region`、`industry_secondary`、`tier`。
  - 分组 id：`seniority_{decision|manager|staff|other}`、`region_<CC>[_<city>]`／`region_unknown`、`<一级>.unspecified`。
- **角色层级派生**：仍是 W0045 的 `shared/compute/seniority-group.ts`，没有另写。
- **30 天变化**：可用。`ensureRelationshipStrengthsForPage` 现在返回 `RelationshipStrengthState | null`。
- **App 同步**：副本与四个 *-sync 测试已在 `53dbad30` 完成。
- **概览（W0052）**：`network-analysis-structure.tsx` 里的关系健康图标和文案与 `network-overview-model.ts` 的 `HEALTH_META` 重复，可在 W0052 统一。

## 回退

按序 revert `aa6b9f60`、`0add67d7`、`53dbad30`，再在 App 端重跑 `npm run sync:contract`。没有迁移，新增字段都是可选的。

## 需要用户决定

无。D32 登记与 read-cost 预算 +169 B 由协调者按惯例确认。
