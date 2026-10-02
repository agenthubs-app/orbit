# Sprint W0043 — 人脉页不出调试英文，空态说实话

> revision 3：按 REVIEW-2026-10-02-network 裁决修订（R-16）：验收契约改为「操作链 + 主证据」，其余断言移入必需证据子表；SC 数与通过条件不变。
>
> revision 2：按 D44 定稿待定项、W0048 拆分、配额两池（2026-10-02）。

**Plan revision:** 3。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** RN-01 全部（REQUIREMENTS「大目标 4」）。**单一目标:** Web 展示层只渲染真实内容：后端调试句不进用户界面，`empty` 显示真实空态、接口失败才显示「不可用」，文案中英双语。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 开工时的 `chat-agent` HEAD（编制时 `a48e1749`；GitNexus 索引状态 `behind`，开工先按根 `CLAUDE.md` 刷新索引再复核下文 impact）。下文行号以 `a48e1749` 为准，开工按符号重新定位。
**档位:** **H**（D44 / W43-1 已定，登记表已同步）。`contactsAnalysisToView` upstream impact = **HIGH**（5 个受影响符号，跨人脉概览／分析页与关系管线页两个路由），按 RULES 5.1 属 H。
**进入条件:** 无前序依赖（登记表）；W43-1～W43-3 已定（D44，见文末）；不需要云端授权、不调用付费 AI、不做迁移；无新增数据库读取（本 Sprint 只改展示层），不需要 D39 预算 SC。

## 上下文包（Generator 从这里起步，不通读其他 REPORT）

### 必读文件
- `app/(app)/app/contacts/analysis/contacts-analysis-view-model.ts`（105 行）：唯一的数据→视图边界。第 55–56 行 `section` 把后端 `empty` 映射成 `{ state: "empty", data }`；第 64、88、90、96–98、102、72 行把后端句子原样带进视图。
- `app/(app)/app/contacts/network-0918/network-analysis.tsx`（367 行）：结构／机会两个标签。第 54 行 `emptyCopy` 除 pending 外一律「来源暂时不可用」；第 91–93 行只在 `state === "ready"` 时取数据，所以 `empty` 落入不可用分支（**本次 bug 根因**）；第 303、324、344 行的真实空态只在 ready 且列表为空时才出现。
- `app/(app)/app/contacts/network-0918/network-overview.tsx`（178 行）：第 160–173 行「最近动态」渲染 `a.label` 与 `metSummary(a.source)`。
- `app/(app)/app/contacts/network-0918/network-pipeline.tsx:31`：关系管线页也渲染 `opportunities.actions`（`dueLabel`、`judgment`）。
- `app/(app)/app/contacts/network-0918/network-overview-model.ts`：`healthRows`、`distributionRows`（标签来自 view model）。
- `app/(app)/app/contacts/analysis/contacts-structure-route-service.ts` + `contacts-structure-detail.tsx`：分组详情页 `insight` 与分组名。
- `app/(app)/app/_demo/demo-network.ts`：示例期直接构造 `ContactsAnalysisView`（第 404–457 行），类型改动必须同步；示例文案已双语、summary 已为空串。
- `shared/api-schema/mobile-contacts-dashboard.ts`：各区块 zod 结构（`.passthrough()`，`gapType` 未声明但会保留）。只读，不改。

### 关键符号（原样）与 impact（`node .gitnexus/run.cjs impact <sym> -f <file> --direction upstream --repo .`，索引 behind 时的结果）
- `export function contactsAnalysisToView(input: unknown, language: OrbitLanguage): ContactsAnalysisView` — **HIGH**，impacted 5（`loadContactsAnalysis`、`NetworkAnalysis.refresh`、`AppContactsDashboardPage`、`AppContactsPipelinePage`）。
- `export type AnalysisSection<T> = { state: "unavailable" | "pending" } | { state: "ready" | "empty"; data: T };`
- `export function NetworkAnalysis({ viewModel, analysis, initialTab }: { viewModel: OrbitContactsViewModel; analysis: ContactsAnalysisView; initialTab: AnalysisTabKey })` — LOW（1）。
- `export function NetworkOverview({ viewModel, analysis }: { viewModel: OrbitContactsViewModel; analysis: ContactsAnalysisView })` — LOW（1）。
- `export function structureDetailToView(input: unknown, dimension: string, bucketId: string, language: OrbitLanguage): ContactsStructureDetailView` — LOW（2）。
- `cockpit`／`healthRows`／`distributionRows`（`network-overview-model.ts`）— LOW（各 2）。
- **不改（只读参考）**：`buildDashboardSummaryFromGraph`、`createDashboardSummaryPostgresReader` **CRITICAL**（11）；`networkGapCoreFromGraph` **HIGH**（4）；`createMobileContactsDashboardService` **HIGH**；`createOpportunityActionBrief` LOW。

### 已查清的事实：调试句从哪来、在哪显示
| 视图字段 | 后端来源（只读） | 显示位置 |
| --- | --- | --- |
| `summary` | `dashboard-summary-postgres-reader.ts:532–537、578–581`（4 句英文） | 结构诊断 h2（`network-analysis.tsx:133`） |
| `structure.summary` | `dashboard-distribution.ts:649、871、1226` | 分布小结（:187） |
| `coverage.summary` | `dashboard-distribution.ts:1063、1285` | 结构洞察（:197）、机会 hero（:237） |
| `coverage.gaps[].label/action` | `dashboard-distribution.ts:999–1046`（`"<行业> coverage"`、`Investor access coverage` 等 + 英文建议） | 覆盖建议（:297） |
| `opportunities.summary` | `dashboard-opportunity.ts:856` | 机会 hero h2（:236） |
| `actions[].judgment` | `actionBrief.judgment`（**仅中文**，:154–168）或 `reason`＝`connection.summary`（可能是 `features/connections/live-service.ts:295` 的英文句） | 建议动作（:318）、管线页 |
| `actions[].dueLabel` | `dashboard-opportunity.ts:462–484` 封闭集：`No due date`／`Due soon`／`Due today`（含已逾期，`days <= 0`）／`Due tomorrow`／`Due in N days` | 建议动作标签（:317）、管线页 |
| `dormant[].reason/action` | `dashboard-opportunity.ts:643–644`；`lastTouchpointDays = 45 + index * 14`（:639）**是编造的数字** | 待唤醒（:338） |
| `activity[].label/source` | `dashboard-summary-postgres-reader.ts:219–234`（SQL）与 `:627–639`（graph 路径）：`<姓名> added to the live relationship database`、`Live contact source`／`Live task source`；`activityId` 形如 `activity:dashboard:contact:<contactId>`／`activity:dashboard:task:<taskId>` | 最近动态（`network-overview.tsx:163–165`） |
| 分组名 | `dashboard-distribution.ts:302–306、324–356、374`：系统分组 id 封闭集（`location_unknown`、`location_tokyo/osaka/kyoto/kobe/yokohama`、`role_unknown/decision_maker/business_growth/professional_advisor/operations`、`unclassified`、`strong/warm/weak`）只有中文名 | 维度图例、Top5、详情页标题（英文界面显示中文） |
| 详情 `insight` | `dashboard-distribution.ts:1167–1170`（仅中文） | 分组详情页 |

### 方案（为什么在 Web 视图模型做，而不是改后端）
- 共享契约：`shared/compute/*` 与 `/api/mobile/contacts-dashboard` **只加字段、不改现有字段语义**；后端相关符号 CRITICAL／HIGH。把英文句改成中文会改变手机 App（旧版本读整份返回）看到的字段内容，属于改语义；新增 `{zh,en}` 字段则要同时动 SQL 读模型与 graph 两条路径（CRITICAL）。而 RN-07～RN-10 会用快照与规则重建这些区块，W0043 是止血。
- 所以 W0043 **只改 Web 视图模型与组件**，采用**白名单**：`contactsAnalysisToView` 不再把任何后端「句子字段」（`summary`、`nextAction`、`reason`、`suggestedAction`、`recommendedAction`、`label`（gap／activity）、`sourceLabel`、`lastTouchpointLabel`、`actionBrief.judgment/steps/evidence`）复制进视图；用户可见文字只来自两类：**用户数据**（联系人姓名、公司、任务标题、用户填写的地区原文、关系目标文字）与 **Web 端双语模板 × 结构化字段**（计数、id、`type`、`gapType`、`bucketId`、`dueLabel` 封闭集）。没有真实内容的句子输出空串，组件不渲染该句（不放「暂无总结」类占位）。这样后端以后再加调试句也进不了界面。
- 语言：视图模型已接收 `language`，模板在视图模型内按 zh／en 选（ja 回退 en，沿用 `t()` 惯例）；客户端 `refresh()` 也传 `language`，两处一致。
- 最近动态：`new_contact` 从 `activityId` 的结构化前缀取 contactId（视图类型加 `contactId?: string`），组件用 `viewModel.connections` 按 id 找姓名，显示「新增联系人 · 王敏」／「New contact · Wang Min」；找不到（名单分页只含前 30 位）时只写「新增联系人」，**不解析英文句子取名字**。`followup_due` 显示任务标题（用户数据）。来源列按 `type` 给双语「联系人／跟进」，不渲染后端 `sourceLabel`。开工先核实 `activityId` 里的 contactId 与 `OrbitContactView` 的 id 同源；任务标题若查到系统生成的英文模板，在 REPORT 列出并按封闭集处理。
- 建议动作（机会页与管线页）：标题 = 任务标题（空则模板「联系 {姓名}」）；标签由 `dueLabel` 封闭集映射为双语（`Due today` → 「今天到期或已逾期」，因为后端把逾期也归为 today）；`Due soon` 与未知值不显示标签；不显示判断句（中文 brief 无英文对应，且后端 `reason` 不可信）。
- 待唤醒：只显示姓名、公司与「沉睡」标签；**绝不显示 `lastTouchpointDays`**。
- 分组名：系统 `bucketId` 封闭集映射双语名；行业继续用 `industryLabel`；其余（用户填写的地区原文）原样。详情页 `insight` 用计数与主要关系质量在 `structureDetailToView` 内按模板重拼双语句。
- 覆盖度与缺口（W43-2）：W0050 之前**不显示**固定阈值的覆盖度分数与缺口；机会页覆盖区只显示关系目标文字 + 「生成计划」入口（链 `/app/agent/plan`，与 RN-08 无计划态一致），未设目标时显示「尚未设置关系目标」。
- 没有真实句子的 hero（W43-3）：「结构诊断」「结构洞察」「机会」hero 与洞察卡在没有真实句子时**整块不渲染**，保留下方图表与列表；W0049／W0050 用快照填回。

### 易错边界（均已写入 SC）
1. `empty` ≠ 失败：`empty` 显示该区块真实空态；只有 `section === null`（后端放进 `unavailableSections`）或整页 `state: "error"` 才显示「来源暂时不可用」；`pending` 显示「分析生成中」。三者各有用例（SC-01）。
2. 白名单不是黑名单：测试既断言已知调试句不出现，也断言视图里这些字段只等于模板或用户数据（SC-02），防止换一句英文又漏出。
3. 不改 `shared/compute`、`features/dashboard`、`features/mobile`、`shared/api-schema`、`app/api` 任何文件（SC-04）。
4. 不出编造数字：`lastTouchpointDays` 不渲染（SC-02）。
5. 示例期（`demo-network.ts`）显示不变：类型变化同步，示例页测试保持通过（SC-04）。
6. 联系人总数「依据 N 位」仍用名单 `people.length`（最多 30）——这是 W0052 的范围，本 Sprint 不改，REPORT 登记。

## 范围与文件
- 修改：`contacts-analysis-view-model.ts`、`network-analysis.tsx`、`network-overview.tsx`、`network-overview-model.ts`（如需）、`network-pipeline.tsx`（只跟随视图字段）、`contacts-structure-route-service.ts`、`contacts-structure-detail.tsx`（如需）、`_demo/demo-network.ts`（只同步类型）。
- 新建（建议）：`app/(app)/app/contacts/analysis/network-copy.ts`——双语模板与封闭集映射（`bucketId`→名称、`dueLabel`→标签、`gapType`→名称／建议），纯函数，供视图模型与详情页共用。
- 测试：`tests/pages/app-contacts-analysis-view-model.test.ts`、`tests/pages/app-network-overview.test.tsx`、`tests/pages/app-network-pipeline.test.tsx`、`tests/pages/app-contacts-structure-detail.test.tsx`、`tests/pages/app-network-overview-model.test.ts`；新建 `tests/fixtures/network-debug-payload.ts`（按上表真实后端输出构造的完整 payload，含全部调试句）。
- 排除：后端／`shared/compute`／手机接口；快照、强度、时间线（W0046～W0048a）；概览人数口径与驾驶舱（W0052）；结构／机会标签重做（W0049／W0050）；死代码清理（W0055）。

## 验收契约（五项；revision 3 起每项 = 一条操作链 + 一个主证据，其余断言见「必需证据子表」，R-16）

| SC | 操作链（可观察行为） | 主证据 |
| --- | --- | --- |
| SC-W0043-01 | **空态与失败分开。**用夹具 A（各区块 `state: "empty"`）渲染结构／机会两标签：每个区块显示自己的真实空态，zh 与 en 下都不出现「来源暂时不可用」／`Source temporarily unavailable` | `NetworkAnalysis` 渲染测试（夹具 A，zh／en 各一次） |
| SC-W0043-02 | **不出调试英文、不出编造数字。**用 `network-debug-payload` 夹具渲染概览、分析（结构／机会）、管线页、分组详情页：SC-02 清单里的片段与 `lastTouchpointDays` 独特值一个都不出现 | 渲染测试里的禁用片段断言（清单原样写在测试里） |
| SC-W0043-03 | **双语与真实内容。**en 界面打开结构／机会／概览／详情：系统分组名、最近动态、建议动作标签、详情 `insight` 都是英文模板或用户原文，zh 界面对应中文 | `network-copy.ts` 封闭集单测 + 视图模型 zh／en 对照测试 |
| SC-W0043-04 | **后端与手机契约不动、示例不变。**Sprint 分支相对基线的改动只落在 Web 视图模型与组件 | `git diff --stat <基线>..HEAD` 输出（证据目录） |
| SC-W0043-05 | **真实页面验证。**本机 dev 以真实账号依次打开 `/app/contacts/dashboard`、`?tab=structure`、`?tab=opportunities`、`/app/contacts/pipeline`、一个分组详情页，SC-02 清单 0 命中 | `get_page_text` 检索输出 + 1440／375 截图（`~/orbit-sprint-evidence/web/sprint-W0043/run-01/`） |

### 必需证据子表（每条子断言独立留证，缺一即该 SC 不通过）

| SC | 子断言 | 证据 |
| --- | --- | --- |
| 01 | 夹具 A：结构页「当前维度暂无数据」类空态与健康区空态；机会页覆盖区为关系目标文字 + 「生成计划」入口（W43-2，无覆盖度分数与缺口）、「当前没有优先行动建议」「暂无待唤醒关系」；目标区「尚未设置关系目标」 | 渲染测试 |
| 01 | 夹具 B：区块为 `null` 且列入 `unavailableSections` → 对应区块显示「来源暂时不可用」 | 视图模型测试 + 渲染测试 |
| 01 | 夹具 C：`aggregate.state: "pending"` →「分析生成中」；整页 `error` 仍显示不可用 | 视图模型测试 |
| 02 | 禁用片段（不区分大小写）：`live relationship database`、`Live contact source`、`Live task source`、`Live opportunity source`、`source-backed`、`aggregate`、`deterministic`、`Rule-based`、`Seed or import`、`Review live context`、`context refresh`、`nurture relationship`、`live connection store`、`Investor access coverage`、`Strong relationship coverage`、`<行业名> coverage`（按夹具拼出；不禁止界面自带的 `coverage`）、`No due date`、`Due today`、`Due tomorrow`、`Due in`、`Due soon`、`days since last`；`lastTouchpointDays = 173` 不出现；zh、en 各跑一次 | 渲染测试 |
| 02 | 视图模型单测：`summary`、`structure.summary`、`coverage.summary`、`opportunities.summary` 无真实内容时为空串；`actions[].judgment` 不等于后端 `reason`／`judgment` | `app-contacts-analysis-view-model.test.ts` |
| 03 | 系统分组名封闭集全覆盖（`unclassified`→Unclassified、`role_decision_maker`→Decision makers 等）；用户填写的地区原文原样 | `network-copy.ts` 单测 |
| 03 | 最近动态 zh「新增联系人 · 王敏」、en「New contact · 王敏」（姓名来自 `viewModel.connections`），名单找不到 id 时只显示「新增联系人」；来源列「联系人／跟进」双语 | 概览组件测试 |
| 03 | 建议动作标签按 `dueLabel` 封闭集双语，`Due soon` 与未知值不显示；详情页 `insight` 双语、数字与夹具一致 | 视图模型测试、详情页测试 |
| 03 | 空串句子不渲染容器（无「暂无总结」占位）；无真实句子的结构诊断／结构洞察／机会 hero 整块不渲染（W43-3） | 组件测试 |
| 04 | diff 不含 `shared/`、`features/`、`app/api/` 下任何文件 | `git diff --stat` 输出 |
| 04 | `tests/services/mobile-contacts-dashboard-service.test.ts`、`tests/api/mobile-contacts-dashboard-route.test.ts`、`tests/pages/app-network-demo-pages.test.tsx`、`app-network-demo-mode.test.tsx`、`app-network-demo-data.test.ts` 不改且通过 | 命令退出码 |
| 05 | zh、en × 1440、375 各截图；控制台无新增错误 | 截图与控制台日志 |
| 05 | H 档收口：全量 `npm test` 对照基线新增失败 0、`npx tsc --noEmit -p .`、一次 Codex 代码 review | 全量清单、review 处理（REPORT） |

## 一次 Generator 的执行顺序
1. 复核进入条件（W43-1～3 已定，D44）；记录基线 SHA 与 Planner SHA256；`git status` 确认用户未提交文件不动。
2. 刷新 GitNexus 索引后对上表「修改」符号重跑 upstream impact，HIGH 在 REPORT 记录。
3. RED：先写 `network-debug-payload` 夹具与 SC-01／02 断言（应失败）。
4. 实现 `network-copy.ts` → 改视图模型白名单 → 改组件空态分支 → 详情页 → 同步示例类型。
5. 定向 GREEN → 收口集 → typecheck → 全量对照 → 浏览器验证 → `detect-changes --scope staged` → 路径限定 commit → REPORT → 交接协调者合并 `chat-agent`。

## 最小测试与检查
- **档位 H**（impact HIGH，见上）。
- **开发定向集**（cwd `/Users/li/work/orbit/repos/orbits`）：`node scripts/run-node-tests.mjs tests/pages/app-contacts-analysis-view-model.test.ts tests/pages/app-network-overview.test.tsx`。
- **收口集**：定向集 + `tests/pages/app-network-pipeline.test.tsx`、`app-contacts-structure-detail.test.tsx`、`app-network-overview-model.test.ts`、`app-network-demo-pages.test.tsx`、`app-network-demo-mode.test.tsx`、`app-network-demo-data.test.ts`、`app-contacts-dashboard-account-scope.test.ts`、`app-network-archived-status.test.tsx`、`app-network-source-labels.test.tsx`、`tests/services/mobile-contacts-dashboard-service.test.ts`、`tests/api/mobile-contacts-dashboard-route.test.ts`；`npx tsc --noEmit -p .` 一次。
- **全量触发**：本 Sprint 为 H，本地代码收口后按 RULES 5.2 跑一次 `npm test` 基线对照（stash 只列本 Sprint 路径），只调查新增失败。不 source `.env`。
- **代码 review**：H 档一次 Codex 代码 review，意见交回同一 Generator 修。
- **不运行**：数据库读取计量（无新增读取）；手机 App 端测试（不改 App 与共享代码）。

## 失败与交接
外部条件缺失先不启动；run 已开始按规则产出 failed／blocked 报告，不降 SC。REPORT 列 SC→文件→SHA→证据、全量对照新增失败清单、review 处理、未完成项（含「依据 N 位」口径留给 W0052）；交接本线分支 `sprint/W0043-network-stop-fake-copy`、固定最终 SHA、目标主线 `chat-agent`。**给后续 Sprint 的交接**：`network-copy.ts` 的模板与封闭集是 W0049～W0052 的双语文案基础；视图白名单规则（后端句子字段不进视图）后续 Sprint 不得放宽。

## 已定（D44，2026-10-02）

| 编号 | 定稿结论 | 对标做法 |
| --- | --- | --- |
| W43-1（= C-1） | 升 H：多一次 Codex 代码 review 与一次全量对照；登记表档位已改 H | 被多个页面共用的展示层边界改动走评审 + 回归（如 Linear 改共享组件跑全量 UI 回归），不按「只是改文案」降级 |
| W43-2 | W0050 之前不显示固定阈值的覆盖度与缺口；覆盖区显示目标文字 + 「生成计划」入口 | HubSpot Goals／Salesforce 只在用户设定目标与目标值后才显示达成度，不用系统默认阈值冒充「你的目标」 |
| W43-3 | 没有真实句子的结构诊断、结构洞察、机会 hero 整块隐藏，保留图表与列表，等 W0049／W0050 用快照填回 | Notion AI、HubSpot Breeze 在没有 AI 产出时不显示 AI 卡片，而不是放占位句或系统摘要 |
