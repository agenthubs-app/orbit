# Sprint W0052 — 人脉概览：驾驶舱读快照，管线改档位，动态来自时间线

> revision 4：按 D46 修订（④⑦）：`getCurrent()` 多读字节如实计量，超 D39 预算另加只读瘦身读取（不在本轮默认范围）；基线行号以开工时 HEAD 为准、按符号重定位。
>
> revision 3：按 REVIEW-2026-10-02-network 裁决修订（R-6、R-12、R-16、R-17）：计划只读 `getCurrent()` + W0050 纯投影，SC-01 加阶段边界夹具 0 写入／0 生成器断言；快照统一读 `NetworkSnapshotView.blocks` + `freshness.stale`；进入条件写明「任一待改符号 HIGH/CRITICAL 或共享装配链受影响即升 H」，UNKNOWN 补查写入 REPORT；验收契约改为「操作链 + 主证据」+ 必需证据子表。
>
> revision 2：按 D44 定稿待定项、W0048 拆分、配额两池（2026-10-02）。快照来自 W0048a；本 Sprint 页面只读，不占任何配额池。

**Plan revision:** 4。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** RN-10 全部（REQUIREMENTS「大目标 4」）。**单一目标:** 概览三块改接真实来源：驾驶舱 = 快照句子 + 规则数字；管线区 = 强度档；最近动态 = 关系时间线（双语）。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 开工时 `chat-agent` HEAD（编制时 `a48e1749`；GitNexus 索引 `behind`，开工先刷新）。行号按 `a48e1749`，W0043／W0047／W0049 会先改相关文件，开工按符号重新定位。 **行号以开工时 HEAD 为准，按符号重定位（D46⑦）。**
**档位:** 暂列 L（只改概览展示与服务端装配，前序 Sprint 提供全部读取入口），**只有开工影响分析完成后才能保留 L**（R-17，见进入条件）。W52-3 已定：跨联系人「最近 N 条」由 W0046 的 `readRecentRelationshipTimelineForActor` 提供，本 Sprint 不新写时间线读取。
**进入条件:**
- **W0049、W0050 completed**（登记表依赖；传递要求 W0043、W0045～W0047、W0048a completed）。W0049 共用 `healthRows`／四档分布与依据解析；W0050 提供规则覆盖度函数与本周动作口径（W52-2）；W0043 同文件 `network-overview.tsx` 的双语模板与白名单沿用。不依赖 W0048b。
- W52-1～W52-4 已定（D44，见文末）。
- 不调用付费 AI、不做迁移、不需要云端授权。
- **档位判定（R-17）**：开工刷新 GitNexus 后对每个待改符号跑 upstream impact。**任一待改符号为 HIGH／CRITICAL，或共享装配链受影响（`dashboard/page.tsx` 的服务端装配、`loadContactsAnalysis`／`contactsAnalysisToView`、`healthRows` 等跨标签共用的数据组装、W0049／W0050 的共享读取函数）即升 H**——不只在个别函数 HIGH 时升级；升 H 后按 RULES 5.1 加全量对照与一次 Codex 代码 review。`AppContactsDashboardPage` 等 `UNKNOWN` 一律用文本搜索补查，查询命令与结论写入 REPORT，不把 `UNKNOWN` 当低风险。

## 上下文包（Generator 从这里起步，不通读其他 REPORT）

### 必读文件
- `app/(app)/app/contacts/network-0918/network-overview.tsx`（178 行）：第 41 行 `cockpit(analysis)`；第 48–52 行 `meta`「依据 `people.length` 位联系人」；第 123–150 行管线区（`NETWORK_STAGES`／`stageCounts(people)`／`highlights = stage === "advance"`）；第 152–174 行最近动态（`analysis.activity`）。
- `app/(app)/app/contacts/network-0918/network-overview-model.ts`：`cockpit`（第 24 行，4 卡 = 高价值／待跟进／新增／沉睡，读 `analysis.metrics`）、`distributionRows`（第 11 行；「按来源」用 `sourceCounts(people)`）、`healthRows`。
- `app/(app)/app/contacts/network-0918/network-model.ts`：`NETWORK_STAGES`、`STAGE_LABEL`、`stageCounts`、`sourceCounts`（第 117 行）。
- `app/(app)/app/contacts/dashboard/page.tsx`：真实分支并行读 `loadContactsAnalysis` 与 `loadAppContactsRouteViewModel({}, actor.id)`；**名单默认每页 30 条**（`features/contacts/storage/contact-list-postgres-reader.ts:1176`），所以 `people.length`、`sourceCounts(people)`、`stageCounts(people)` 对 30 人以上账号都是错的。同一 reader 已在 SQL 里按全量算来源分面 `facet_sources`（第 846–849 行），开工核实它是否已进入路由视图模型。示例分支（第 53–68 行）用 `buildDemoNetworkViewModel`／`buildDemoNetworkAnalysis`。
- `app/(app)/app/_demo/demo-network.ts`：示例概览数据（第 404–457 行）；示例静态快照是 W0054，本 Sprint 示例期不显示快照句子。
- `tests/pages/app-network-overview.test.tsx`、`app-network-overview-model.test.ts`、`app-network-demo-pages.test.tsx`、`app-network-demo-mode.test.tsx`：现有断言（4 张 `nw-cockpit-card`、阶段条、「还没有互动记录」）要按新设计改写，不保留两套。

### 关键符号（原样）与 impact（索引 behind 时结果，开工复核）
- `export function NetworkOverview({ viewModel, analysis }: { viewModel: OrbitContactsViewModel; analysis: ContactsAnalysisView })` — LOW（1）。本 Sprint 给它加 props（快照、时间线、档位、覆盖度），两个调用点：`dashboard/page.tsx` 真实分支与示例分支。
- `export function cockpit(analysis: ContactsAnalysisView): CockpitCard[]` — LOW（2）。
- `export function distributionRows(key: DistKey, analysis: ContactsAnalysisView, people: readonly NetworkPerson[], language: OrbitLanguage): readonly (readonly [string, number])[]` — LOW（2）。
- `export function healthRows(analysis: ContactsAnalysisView): HealthRow[]` — LOW（2；W0049 可能已改为四档）。
- `export function contactsAnalysisToView(input: unknown, language: OrbitLanguage): ContactsAnalysisView` — **HIGH**（5）。**本 Sprint 尽量不改**：新数据走新 props，不塞进 `ContactsAnalysisView`。
- `AppContactsDashboardPage` — UNKNOWN（路由入口，无代码调用方；文本搜索确认只有 Next 路由）。

### 前序交接要点（字段名以各 REPORT 为准）
- **W0048a → `NetworkSnapshotView`（R-12，统一形态）**：当前快照读取入口；只用 `state`、`blocks`（已是请求语言：「结构诊断一句」取 `kind: "diagnosis"`、「缺口叙述」取 `kind: "gap"`、「计划引用」取 `kind: "plan"`）、`generatedAt`、`contactCount`、`freshness.stale`；不读 `language.{zh,en}` 或顶层 `stale`。无快照／读失败的返回形态以 REPORT 为准。打开页面只读，不触发生成。
- **W0047 → `RelationshipStrength`**：`tier: "new"|"active"|"core"` + `dormant`；全量档位人数来自 `shared/compute` 健康分布的新增字段；每位联系人的档位与最近信号时间（用于挑 2 位重点联系人）由联系人视图模型或 W0047 读模型提供；关系管线页按档位分组的地址与参数（如 `/app/contacts/pipeline?tier=core`）。
- **W0046 → `RelationshipTimelineItem`**：`source`、`occurredAt`、`id`、`title {zh,en}`、`excerpt`；跨联系人、按 actor 取最近 N 条的读取 `readRecentRelationshipTimelineForActor({ actorId, now, limit })`（W46-6／W52-3），本 Sprint `limit` 5；W0046 SC-05 的预估流量行由本 Sprint 实测替换。
- **W0049**：四档分布在视图里的形态、`healthRows` 新签名、依据解析函数。**W0050**：规则覆盖度函数 `planNeedCoverage`（已确认关联人数 ÷ 计划人脉需求总人数）、只读投影 `toOpportunityPlanView` 与「本周建议动作」计数口径。**计划读取只用 `PlanService.getCurrent()`（`service.ts:688`，只读）+ 上述纯投影；不得调用会在阶段边界写「进入新阶段」并解析生成器的 `getCurrentView()`（`service.ts:1290`）或 `enterCurrentPhase()`（R-6）。`getCurrent()` 比投影所需多读的字节（全部条目、最近 50 条记录）如实计量进 SC-05 预算表；超 D39 预算时另加只读瘦身读取方法，不在本 Sprint 默认范围，REPORT 登记 D32 并建议后续 Sprint（D46④）。****W0043**：`network-copy.ts` 双语模板、白名单。

### 方案要点（单一事实来源、存细粒度、派生粗粒度）
1. **驾驶舱 4 卡（W52-1 已定）**：①结构：快照「结构诊断」句 + 全量联系人数 → `?tab=structure`；②目标缺口：快照「缺口叙述」+ 规则覆盖「已有 a／共 b」（W0050 同一函数）→ `?tab=opportunities`，无计划时数字位换成「生成计划」入口；③本周行动：快照「计划引用」句（没有则不显示句子）+ 本周建议动作数（W0050 同一口径：计划本周行动 + 待确认匹配）→ 计划页；④待唤醒：模板句「N 位曾有往来、60 天没有新记录」+ `dormant` 人数（W0047 全量）→ `?tab=opportunities`。**数字全部实时规则计算、与分析页同一函数**，句子只来自快照或由数字拼出的双语模板；没有快照时卡片只显示数字与标题，不放占位句，不加免责灰字（N-Q6）。
2. **卡片标注**：驾驶舱右上 `meta` 改为「生成于 X · 基于 N 人」（快照 `generatedAt`／`contactCount`）；无快照时「依据 N 位联系人」用全量人数。快照 `stale` 不在概览提示（报告卡与「新增 M 人未纳入」在机会标签，W0050）。
3. **管线区**：标题改「关系档位」，四段条 = 新认识／有往来／核心／待唤醒（全量人数，来自分布，不来自名单）；重点联系人 2 位 = 核心优先、其次有往来，按最近信号时间倒序，取自本页已有名单（名单里没有就少显示，不为此新增读取）；每段与「查看完整管线」链接到 W0047 的按档位分组页。手动阶段标签（待了解／保持联系／推进中／归档）不再出现在概览。
4. **最近动态**：服务端取本人最近 5 条时间线记录（跨联系人，按 `occurredAt` 倒序）。每行：联系人姓名（链接 `/app/contacts/{id}`）、来源徽标（双语，按 `source` 封闭集：memo／笔记／活动同场／计划／日程／跟进完成／扫名片）、摘要、时间。摘要规则：用户写的 memo 与笔记原文照出（用户数据）；系统类来源按结构化字段走双语模板（如「在 {活动名} 同场」），**不渲染任何后端拼好的英文句**；时间线读失败只让这一块显示「来源暂时不可用」。
5. **「按来源」分布**：改用全量来源计数（W52-4 已定：复用 `facet_sources`），不再用 `sourceCounts(people)`；环形图中心人数用全量。
6. **示例期**：示例分支不读快照、时间线（W0004 示例期真实读取为 0 的约定）；卡片显示示例数字、无句子；示例档位与动态用示例数据（`demo-network.ts` 补充档位人数与时间线样例，双语）。

### 易错边界（均已写入 SC）
1. 任何人数（卡片、档位、环形图中心、按来源、meta）都不得来自名单 `people.length`（SC-02、SC-04 用 35 人夹具）。
2. 句子只来自快照或数字模板；后端调试句与 `analysis.activity` 不再进入概览（SC-01、SC-03）。
3. 打开概览不调用付费 AI、不触发快照生成；计划只经 `getCurrent()` + 纯投影读取，阶段边界夹具下计划三表 0 写入、生成器 0 次（SC-01，R-6）。
4. 读取失败按区块隔离：快照、时间线、计划各自失败只影响自己的卡／区块（SC-01、SC-03）。
5. 示例期 0 真实读取不变（SC-04 计调用）。
6. 不改 `shared/compute`、`/api/mobile/contacts-dashboard`（概览只是消费者）；若必须改，升 H 并按契约只加字段。

## 范围与文件
- 修改：`network-overview.tsx`、`network-overview-model.ts`、`network-model.ts`（仅新增档位常量／标签，旧阶段常量留给仍在用的页面）、`contacts/dashboard/page.tsx`（服务端并行读快照、时间线最近 5 条、计划覆盖度与本周动作数、全量来源计数）、`_demo/demo-network.ts`（示例档位与动态）、`network-copy.ts`（来源徽标与模板句）、`network-shell.tsx`（样式）。
- 新建（建议）：`app/(app)/app/contacts/network-0918/network-overview-cockpit-model.ts`（纯函数：4 卡、档位条、动态行）。
- 测试：改 `tests/pages/app-network-overview.test.tsx`、`app-network-overview-model.test.ts`、`app-network-demo-pages.test.tsx`、`app-network-demo-mode.test.tsx`；新建 `tests/pages/app-network-overview-cockpit-model.test.ts`。
- 排除：分析页三个标签（W0049～W0051）、关系管线页本身（W0047）、快照生成与配额（W0048a）、示例静态快照（W0054）、导入（W0053）。

## 验收契约（最多五项；revision 3 起每项 = 一条操作链 + 一个主证据，其余断言见「必需证据子表」，R-16）

| SC | 操作链（可观察行为） | 主证据 |
| --- | --- | --- |
| SC-W0052-01 | **驾驶舱 4 卡 = 快照句子 + 规则数字。**有快照 + 有计划（计划正处阶段边界）时打开概览：4 卡按 W52-1 映射显示 `blocks` 句子与规则数字（与分析页同一函数结果相等），整个加载对计划 0 写入、0 次生成器调用 | `tests/pages/app-network-overview-cockpit-model.test.ts` + 服务端加载测试（SQL 写语句计数 + 生成器 factory spy） |
| SC-W0052-02 | **管线区改强度档、全量计数。**35 位联系人夹具（名单只返回 30）打开概览，档位条显示 12／10／8／5，和为 35 | 模型单测 |
| SC-W0052-03 | **最近动态来自时间线、双语、按块隔离。**时间线夹具（6 人 9 条）打开概览，显示按时间倒序的 5 条（姓名链接、来源徽标、摘要、时间） | 模型单测 + 组件测试 |
| SC-W0052-04 | **人数口径与示例期。**同一 35 人夹具：环形图中心 35、「按来源」各段之和 35 | 概览组件测试 |
| SC-W0052-05 | **数据库预算与真实页面。**本机 live 真实账号（有快照、有计划、有 memo）打开概览一次，实测新增读取的单次字节与语句数并入 D39 月预算表 | REPORT 预算表 + 测量脚本输出（`~/orbit-sprint-evidence/web/sprint-W0052/run-01/`） |

### 必需证据子表（每条子断言独立留证，缺一即该 SC 不通过）

| SC | 子断言 | 证据 |
| --- | --- | --- |
| 01 | zh 中文、en 与 ja 英文（按界面语言请求视图）；各卡链接到约定地址；meta「生成于 X · 基于 N 人」 | 组件测试 |
| 01 | 只读 `NetworkSnapshotView.state／blocks／generatedAt／contactCount／freshness.stale`，无 `language.zh`／`language.en`／顶层 `stale` 读取（R-12） | 类型检查 + 源码扫描断言 |
| 01 | 无快照：4 卡只有标题与数字，无句子容器、无占位句；meta 用全量人数 | 组件测试 |
| 01 | 快照读失败：4 卡数字照常、无句子，meta「AI 分析暂时不可用」／`AI analysis temporarily unavailable`，不显示其他错误文字 | 组件测试 |
| 01 | 无计划：②卡数字位为「生成计划」入口，③卡计数只含待确认匹配 | 模型单测 |
| 01 | 计划只经 `getCurrent()` + W0050 纯投影；代码无 `getCurrentView`／`enterCurrentPhase` 引用（R-6） | 源码扫描断言 |
| 01 | 付费 AI 边界账本为空；快照生成入口调用为 0 | 服务端加载测试 |
| 02 | 重点联系人 2 位为核心档中最近信号最新的两位（名单里有的），带档位标；各段链接到 W0047 的按档位分组地址 | 模型单测 + 组件测试 |
| 02 | 概览 HTML 不含「待了解」「推进中」「保持联系」「归档」阶段文字 | 组件测试 |
| 03 | zh／en 来源徽标与系统类摘要分别为中文／英文，memo 原文照出；HTML 不含 `live relationship database`、`Live contact source`、`Live task source` | 组件测试 |
| 03 | 空时间线 →「还没有互动记录」；时间线读失败 → 仅本区块「来源暂时不可用」，驾驶舱与管线区正常 | 组件测试 |
| 04 | 行业／地区分段来自全量分布 | 组件测试 |
| 04 | 示例期：示例数字与示例档位、动态（双语），无快照句；快照、时间线、计划读取 0 次（计调用断言）；示例相关现有测试按新设计改写后通过 | `app-network-demo-pages.test.tsx`、`app-network-demo-mode.test.tsx` |
| 05 | 拦截 `pg.Client.prototype.query`（W0017 口径）：新增读取 = 快照、时间线最近 5 条、计划 `getCurrent()`（含多读的条目与最近 50 条记录，如实计量，D46④）与覆盖度／本周动作、全量来源计数（若需额外语句）；按 1000 位活跃用户 × 每人每天 2 次（假设）× 30 天并入开工时 README 最新总账三档；参考行（不进总账）：改前已有读取的单次字节；W0046 预估行用本实测替换；1.6 GB 不作通过条件，超限登记 D32 | REPORT 预算表 |
| 05 | 浏览器 zh／en × 1440／375 截图，点每张卡与一个档位段确认跳转；示例账号概览 1440 一张；控制台无新增错误 | 截图与控制台日志 |
| 05 | **R-17**：REPORT 列逐符号 impact、共享装配链是否受影响、`UNKNOWN` 文本补查；升 H 时另有全量对照（新增失败 0）与一次 Codex 代码 review | REPORT |

## 一次 Generator 的执行顺序
1. 复核进入条件（W0049、W0050 completed；W52-1～4 已定）；只读 W0046、W0047、W0048a、W0049、W0050 REPORT 的交接段确认入口名；记录基线与 Planner SHA256。
2. 刷新 GitNexus 索引，对「修改」符号重跑 upstream impact；按进入条件「档位判定」（R-17）决定 L 或 H，`UNKNOWN` 文本补查，结论写 REPORT。
3. RED：`network-overview-cockpit-model` 单测（4 卡、档位条、动态行、全量口径）。
4. 实现模型 → 组件 → 服务端装配（并行读取，各自失败隔离）→ 示例数据。
5. 定向 GREEN → 收口集 → typecheck → 数据库实测 → 浏览器 → `detect-changes --scope staged` → 路径限定 commit → REPORT → 交接。

## 最小测试与检查
- **档位 L**（升 H 条件见进入条件「档位判定」，R-17）。
- **开发定向集**（cwd `repos/orbits`）：`node scripts/run-node-tests.mjs tests/pages/app-network-overview-cockpit-model.test.ts tests/pages/app-network-overview.test.tsx`。
- **收口集**：定向集 + `app-network-overview-model.test.ts`、`app-network-demo-pages.test.tsx`、`app-network-demo-mode.test.tsx`、`app-network-demo-data.test.ts`、`app-contacts-dashboard-account-scope.test.ts`、`app-network-pipeline.test.tsx`、W0049 的 `app-network-analysis-structure.test.tsx`（共用 `healthRows`）；`npx tsc --noEmit -p .`。
- **全量**：L 档默认不跑；升 H 时收口跑一次 `npm test` 基线对照。
- **不运行**：真实 AI 调用；App 端测试（不改共享计算与手机接口）。

## 失败与交接
缺前置先不启动。REPORT 写 SC 映射、SHA、预算表、是否升 H 及理由（逐符号 impact 结果、共享装配链是否受影响、`UNKNOWN` 文本补查命令与结论，R-17）、额外阅读。交接给 W0054／W0055：概览 props 形态（示例静态快照接入点）、示例数据新增字段、仍在使用旧阶段常量的页面清单（供 W0055 清理）。

## 已定（D44，2026-10-02）

| 编号 | 定稿结论 | 对标做法 |
| --- | --- | --- |
| W52-1 | 驾驶舱 4 卡：①结构（诊断句 + 总人数）②目标缺口（缺口叙述 + 覆盖 a／b）③本周行动（计划引用句 + 本周建议动作数）④待唤醒（数字模板句 + 待唤醒人数）；原「高价值关系／新增人脉」卡下线（新增人数仍在分布卡底部） | HubSpot／Salesforce 首页 KPI 卡：每卡一个可点进明细的核心数字 + 一句解释，数字与明细报表同源 |
| W52-2 | W0052 排在 W0050 之后（登记表依赖为 W0049、W0050），②③卡复用 W0050 的覆盖度函数与本周动作口径 | Linear／Notion 的同一指标只有一个定义与实现，界面复用而不是先各写一版再合并 |
| W52-3（= W46-6） | 跨联系人「最近 N 条」由 W0046 提供（`readRecentRelationshipTimelineForActor`），本 Sprint 不另写聚合、保持 L 档 | HubSpot 的活动时间线既按单条记录查也按账户全局 feed 查，不另建一套「动态」数据 |
| W52-4 | 「按来源」分布与环形图中心人数用全量计数，复用联系人列表读取已有的 `facet_sources`；未进视图模型则本 Sprint 接出，不新增语句 | HubSpot 报表、LinkedIn 网络分析都在全量数据上聚合，不以分页列表当分母 |
