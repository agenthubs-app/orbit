# Sprint W0040 — 首页读资料时跳过「资料更新建议」全 workspace 扫描

**Plan revision:** 2（2026-10-01）。revision 1 经 Codex `gpt-5.6-sol` 方案 review（`~/orbit-sprint-evidence/web/sprint-W0040/plan-review.txt`：P0 0 条、P1 3 条、P2 2 条，结论「有条件通过」）后修订，逐条处理见文末「修订记录」。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** RV-03（线上流量核算）、RV-05（用户读取流量瘦身）。来源：用户 2026-10-01 决定开 W0040，排在 W0039 之后；调查材料 `~/orbit-sprint-evidence/web/investigation-home-db-read/REPORT.md`（下称「调查报告」）与 `PRODUCTION-COUNTS.md`（仓库外）。
**单一目标:** `loadAppHomeRouteViewModel` 读资料时不再调用 `signalService.listUpdateSuggestions()`，因而不再触发 `readSignalGraph()` 的五个集合整 workspace 读取；首页账户卡、示例判定、失败页不变；资料页与 `/api/profile/update-suggestions` 的建议行为不变。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 编制时 `chat-agent` = `695748c9`（GitNexus 索引同为 `695748c`）。下文行号都按 `695748c9`。W0038、W0039 会改首页文件（`iorbit-home.tsx`、`agent/page.tsx`），本 Sprint 计划修改的两个文件它们都不改；开工时用 `git diff 695748c9 HEAD -- <修改白名单> 'repos/orbits/app/(app)/app/agent/page.tsx'` 复核，行号有变以开工时为准并在 REPORT 登记。
**进入条件:**
- W0039 已 completed 并合并回 `chat-agent`（用户决定的顺序；W0037～W0039 都在改首页，避免并行）。
- 「待定项」W40-1～W40-5 已由用户决定（或明确「全按推荐」）。W40-3 决定的是预算判定口径，缺它不能写 SC-05 结论。
- 本机 `orbit_test`（`ORBIT_EVENT_DATABASE_URL` → localhost）可用；`node scripts/assert-local-test-databases.mjs` 通过。
- 不需要云端授权，不读写生产／Preview，不调用付费 AI，不做迁移。

## 已查清的事实（按 `695748c9` 源码与 GitNexus 复核，不照抄调查报告）

1. **首页链路。** `app/(app)/app/agent/page.tsx:139–148` 定义请求内记忆化的 `loadHomeModel()` → `loadAppHomeRouteViewModel(undefined, actor)`；示例判定 `readRelationshipGoal`（第 154–159 行）与真实首页（第 187 行起）共用，同一请求只调一次。`home-route-view-model.tsx:244 loadAppHomeRouteViewModel` 第 256–261 行 `Promise.all` 并行 `loadAppEventsRouteViewModel`、`loadAppContactsRouteViewModel`、**`loadAppProfileRouteViewModel(actor)`**（第 259 行，不传 controls）、`readCanonicalParticipantEventJourneys`。
2. **首页只用资料的哪些部分。** `homeViewModel`（第 122–167 行）只读 `input.profile.profile.profile` 的 14 个字段拼 `account`（`displayName`、`headline`、`role`、`organization`、`industry`、`homeMarket`、`relationshipGoal`、`bio`、`offering`、`seeking`、`topics`、`targetRelationshipTypes`、`preferredIntroChannels`、`preferredFollowUpWindow`）。失败时 `childRouteState`／`evidenceFromProfile`（第 177–242 行）读 `routeState.evidenceIds` 或 `failure.evidenceIds`。**首页从不读 `suggestionCount`、`firstSuggestion`、`reviewSummary`。**
3. **建议读取在资料组合函数里。** `profile-route-view-model.ts:498 loadAppProfileRouteViewModel(actor?, controls = {})`：解析服务（第 511–525 行，`createAppProfileRouteServices()` 抛错 → route-state failure）→ `getProfile`（抛错／`success:false` → route-state failure）→ onboarding 校验（不合格 → `PROFILE_ONBOARDING_UNAVAILABLE`）→ **第 577–583 行无条件调用 `services.signalService.listUpdateSuggestions({ actorId })`，`.catch(() => null)`**（注释写明建议可选，失败不让页面失败）→ 无持久资料时用 `actorOnboardingProfile`（第 369 行）组 success，否则用持久资料组 success。建议结果只进入 `successViewModel`（第 395 行）的 `firstSuggestion`／`suggestionCount`／`reviewSummary` 三个字段。`AppProfileRouteControls`（第 25–27 行）目前只有 `scenario`。
4. **全 workspace 扫描在 provider。** `features/profile/storage/profile-signal-live-record-provider.ts:455 createStorageProfileSignalProvider` 的 `readSignalGraph(actorId)`（第 464 行起）并行 6 次 `store.listRecords({ limit: "unbounded", … })`：profiles／contacts／connections／interactionMemories／evidence **只按 workspace + collection**，第 6 次 `profileSuggestionDecisions` 按 `userId`；之后在 Node 里用 `belongsToActor`（第 417–422 行：`record.userId === actorId || payload.accountId === actorId`）、connection 的 `contactId`、memory 的 `contactId`／`connectionId`、被引用的 evidence id 过滤。调用方（`readSignalGraph` 是对象字面量方法，GitNexus 返回 `UNKNOWN`，已用文本搜索补齐）：`features/profile/live-signal-service.ts:585`（`readPayload` ← `listUpdateSuggestions`，第 601 行）、第 648 行（`acceptUpdateSuggestion`）、第 720 行（`dismissUpdateSuggestion`）。
5. **`loadAppProfileRouteViewModel` 的调用方（GitNexus upstream depth 1：CRITICAL，direct 4；文本搜索一致）：**
   - `home-route-view-model.tsx:259`（首页、`/app/home/events/page.tsx:33`、示例判定都经它）；
   - `profile/profile-0918/load-profile-editor-page.tsx:142`（资料页）；
   - `admin/…/admin-platform-route-view-model.ts:398`（管理台，只用 route 状态与资料字段）；
   - 测试 `tests/pages/app-profile-live-route-services.test.ts` 等。
   **Web 资料页 UI 不显示建议：**`profile-editor-adapter.ts:55 profileRouteToOrbitProfileEditorViewModel` 只读 `profile.profile`、`expectedUpdatedAt`、`hasPersistedProfile`、`onboarding`；全仓 `app/` 下除 view model 本身外没有读这三个建议字段的代码。真正展示建议的是 **App 端**：`repos/orbit-app/src/screens/profile/ProfileScreen.tsx`、`ProfileSuggestionsScreen.tsx` 调 `GET /api/profile/update-suggestions`（`app/api/profile/update-suggestions/handler.ts:35`）及 accept／dismiss，每次都走 `readSignalGraph`。
6. **`loadAppHomeRouteViewModel` 的调用方（GitNexus：CRITICAL，direct 3；索引把 `loadHomeModel` 误标在 `features/profile/mock-service.ts`，以文本搜索为准）：**`agent/page.tsx:141`、`home/events/page.tsx:33`、测试（`app-agent-guide-demo-page.test.tsx:106` 以 `require.cache` 桩计数 `home` 操作、`app-agent-registration-actor-id.test.tsx`、`canonical-participant-event-journeys.test.ts` 等）。
7. **字节构成（调查报告实测，本机 `user_verify_plan`）：**SSR 复合读取 9,593,285 B／17 条语句，其中五个整 workspace 集合合计 9,534,477 B（evidence 7,009,656、connections 1,222,800、interactionMemories 1,037,324、contacts 244,849、profiles 19,848）+ decisions 0 行。跳过建议后预计剩 9,593,285 − 9,534,477 = **58,808 B／11 条语句**（contacts 有界读取约 32 KB、legacy events 整 workspace 17,613 B、canonical 目录 5,507 B、参与旅程 1,770 B、direct profile 919 B、direct account 503 B），以 Generator 实测为准。
8. **生产估算（`PRODUCTION-COUNTS.md`，只读计数）：**生产只有一个 workspace（`workspace:orbit-small-staging-20260917`），五集合 connections 31／contacts 34／evidence 76／profiles 5／interactionMemories 0，按本机平均 JSON 行宽估算约 **276 KB／次**（真实集合计数 × 本机行宽，是估算不是实测）。「6.6 MB × N²、N≈16 超 1.6 GB」是**敏感度模型**：假设 profiles 行数＝活跃用户数、每位用户贡献的联系人／关系／证据与当前样本成比例、且首页每人每天 4 次——这些都未经证实（5 条 profile 不等于 5 位活跃用户），只能说明「单次成本随 workspace 总量增长」这一结构风险，不能当生产事实或排期依据。生产 `orbit_read_cost_daily_routes` 为空，没有实测可校正。
9. **首页 SSR 复合读取从没进过数据库总账。**W0017 流量表（计划 GET、周一小结、待确认名片、活动归属、匹配候选）与 W0029 总账（884 + 10.35 + 18.30 + 25.2 + 50.00 + 118.98 = 1,106.83 MB）都不含 `loadAppHomeRouteViewModel`；W0036 示例期调用矩阵把它记为「既有」未计量。当前总账（README D32 周检追加，W0037 后）：**1,222.78／1,282.63／1,761.38 MB**（无目标用户 10%／20%／100%）。跳过建议后的剩余 58.8 KB 若按首页每人每天 4 次 × 30 天 × 1000 人，约 **7.06 GB／月**，单这一行就远超 1.6 GB——这部分来自 contacts／events 页面模型复用（调查报告 P2），不在本 Sprint 范围，见待定项 W40-3。
10. **测试注入方式已有先例。**`tests/pages/app-profile-onboarding-editor.test.tsx:223–247` 用 `t.mock.method(profileSignalReviewQueueServiceFactory, "create", …)` 替换 `listUpdateSuggestions`，可直接用来计调用次数；`profileServiceFactory` 同法可造资料失败、无持久资料、onboarding 不合格；`profileSignalReviewQueueServiceFactory.create`／`profileDocumentExtractionServiceFactory.create` 返回 `success:false` 可造**服务解析失败**（`profile-service-factory.ts:54–94`：三个服务任一解析失败，`createAppProfileRouteServices` 抛错，route 映射为 `PROFILE_ROUTE_FAILURE`，`profile-route-view-model.ts:511–524`）。测量脚本先例：调查报告 `probe.ts`（拦截 `pg.Client.prototype.query`，逐语句记返回行 JSON 字节，断言 localhost）、`scripts/measure-home-event-pool-traffic.ts`。

## 范围（P0 做，P1～P5 不做）

- **做（P0）：**给 `AppProfileRouteControls` 加一个默认「包含建议」的开关（例如 `suggestions?: "include" | "skip"`，命名由 Generator 定），`skip` 时不调用 `listUpdateSuggestions`，建议三字段走现有「不可用」默认值；`loadAppHomeRouteViewModel` 传 `skip`。服务解析、`getProfile`、onboarding 校验、无持久资料分支**全部照旧执行**，所以首页的失败语义一字不变（这就是选「开关」而不是「另写窄 reader」的理由：窄 reader 会让 signal 服务解析失败不再拖垮首页、失败页 evidenceIds 也会变，等于改行为）。
- **P1（`readSignalGraph` 按 actor 在 SQL 里收窄）不在本 Sprint，另开 H 档 Sprint（待定项 W40-1；顺序见 W40-3）。**理由：① P0 之后首页对 P1 的收益为 0，两者改动面不相交（P0 在 app 层组合函数，P1 在 `features/profile/storage` 与 live-record 读取）；② P1 是共享存储读取，要证明 `belongsToActor`／contactId／connectionId／被引用 evidence 四类归属规则与旧过滤逐项等价、坏数据失败语义一致（同 D20／D23 的做法），并覆盖 App 端 `/api/profile/update-suggestions` 与 accept／dismiss，风险中到高，单独一个 H 档 Sprint 更好审；③ 合在一起会让本 Sprint 超过五项 SC，且一个 Generator 要读两套上下文。P1 的月成本取决于 App 资料建议页（及 accept／dismiss）的真实调用频次，目前没有测量；先后顺序见待定项 W40-3。
- **不做：**P2（首页 SSR 改窄 contacts／events 摘要，含 legacy events 整 workspace 读取）、P3（SSR 与 dashboard 重复读取合并）、P4（目录与报名投影收窄）、P5（cold-open 总账门禁脚本入库）。资料编辑页与管理台继续默认计算建议（待定项 W40-2）。不改 `features/profile/**`、`app/api/profile/**`、App 端、迁移、部署。

## 上下文包（Generator 从这里起步，不通读其他 REPORT）

### 必读文件
- `app/(app)/app/profile/compose-app-profile-from-previously-approved-mock-first-capabilities/profile-route-view-model.ts`（644 行）：第 19–27 行 `AppProfileActor`／`AppProfileRouteControls`；第 77–110 行 `AppProfileSuccessViewModel`；第 369 行 `actorOnboardingProfile`；第 395–496 行 `successViewModel`（建议三字段在第 429–441、485–494 行）；第 498–644 行 `loadAppProfileRouteViewModel`（第 577–583 行是要加开关的位置）。
- `app/(app)/app/home/compose-app-home-from-previously-approved-mock-first-capabilities/home-route-view-model.tsx`：第 122–167 行 `homeViewModel`，第 177–242 行失败映射，第 244–319 行 `loadAppHomeRouteViewModel`（第 259 行改为传开关）。
- `app/(app)/app/agent/page.tsx:139–160`：`loadHomeModel` 与示例判定（只读，不改）。
- `app/(app)/app/profile/profile-0918/load-profile-editor-page.tsx:142`、`admin/…/admin-platform-route-view-model.ts:396–399`：确认它们不传开关（只读）。
- `features/profile/service-factory.ts`：`profileSignalReviewQueueServiceFactory`（第 46 行）、`profileServiceFactory`（第 25 行），测试替身入口。
- `features/profile/storage/profile-signal-live-record-provider.ts:455–575`：只读，理解被跳过的读取长什么样，用于测量脚本给语句打标签。
- 测试先例：`tests/pages/app-profile-onboarding-editor.test.tsx:223–247`；`tests/pages/app-agent-guide-demo-page.test.tsx:100–120、550–600`（示例期 `home` 恰好 1 次、开关关闭各读一次）。
- 测量：复制 `~/orbit-sprint-evidence/web/investigation-home-db-read/probe.ts` 到本 Sprint 证据目录扩展，不放进仓库。

### 关键符号（原样）
- `export async function loadAppProfileRouteViewModel(actor?: AppProfileActor | null, controls: AppProfileRouteControls = {}): Promise<AppProfileRouteViewModel>` — CRITICAL，direct 4（首页组合、资料页、管理台、测试）。
- `export interface AppProfileRouteControls { scenario?: AppProfileRouteScenario; }` — 要加可选字段，默认行为不变。
- `export async function loadAppHomeRouteViewModel(searchParams?: AppHomeSearchParams, actor?: AppHomeActor | null, dependencies: AppHomeRouteDependencies = {}): Promise<AppHomeRouteViewModel>` — CRITICAL，direct 3（`agent/page.tsx`、`home/events/page.tsx`、测试）。签名不变。
- `readSignalGraph: (actorId: string) => LiveProfileSignalProviderResult<LiveProfileSignalGraph>` — 不改；GitNexus `UNKNOWN`，文本搜索 3 个调用点（事实 4）。

### 前序交接要点
- W0017／W0021／W0029／W0036：流量口径＝每条语句返回行的 JSON 字节之和（拦截 `pg.Client.prototype.query`），不含协议开销；首页频次每人每天 4 次，示例期每位新用户 10 次，1000 位活跃用户，30 天，十进制 MB。
- W0036／W0037：示例期 `loadHomeModel` 只用于判定、不注入示例壳（`home={null}`），测试断言 `home` 操作恰好 1 次；本 Sprint 不改这个次数，只让这 1 次变轻。
- D39：用户路径数据库总账上限 1.6 GB；D32 周检记录当前三档 1,222.78／1,282.63／1,761.38 MB（W0038／W0039 若有新增，以开工时 README 为准）。

### 易错边界（都有对应 SC）
- 首页路径（真实期、示例判定、`/app/home/events`）`listUpdateSuggestions` 调用 0 次；资料页、管理台默认路径仍是 1 次（SC-01、SC-03）。
- 不许为了跳过建议而跳过服务解析、`getProfile`、onboarding 校验：这些失败照旧让首页进 route-state，copy／evidenceIds／source 与改前逐项相等（SC-02）。**最容易被「顺手优化」的是 signal／extraction 服务的解析**：首页虽不用它们，但解析失败当前会让首页失败，`skip` 后必须照旧失败；而 `listUpdateSuggestions()` **运行时**抛错当前被 catch、首页成功，`skip` 后也成功且账户卡相同。两类分开测（SC-02）。
- 不改 `features/profile/**`（provider、live／mock signal service）和 `app/api/profile/**`，App 端建议接口零变化（SC-03）。
- 示例期 `home` 读取仍恰好 1 次且 `home={null}`；开关关闭真实路径的各项读取次数不变（SC-04）。
- 不用缓存掩盖全扫；不新增 `limit: "unbounded"`；测量只连 localhost，噪声数据只写本机测试库的临时 workspace，测完删除。**临时 workspace 必须真的是被测运行时的 configured workspace**：测量子进程把连接指向本机测试库，并把 `ORBIT_WORKSPACE_ID`（target 为 local 时是 `ORBIT_LOCAL_WORKSPACE_ID`，见 `shared/storage/live-database-config.ts:56–79`）设成临时 workspace id，脚本开头打印 `resolveLiveDatabaseConnectionConfig()` 的 host 与 workspaceId（不打印连接串）以证明（SC-01）。
- 预算表必须补上从未进账的首页 SSR 复合读取，超 1.6 GB 如实登记，不得用「不在本 Sprint 范围」把它省掉（SC-05）。

## 范围与文件

- **修改：**
  - `app/(app)/app/profile/compose-app-profile-from-previously-approved-mock-first-capabilities/profile-route-view-model.ts`（加开关，默认包含）
  - `app/(app)/app/home/compose-app-home-from-previously-approved-mock-first-capabilities/home-route-view-model.tsx`（传开关）
  - 受影响的既有测试（若断言了首页路径的建议调用或类型）
- **新建：**`tests/pages/app-home-profile-read-trim.test.ts`（名字可调）：首页路径 0 次、资料路径 1 次、账户卡与失败页等价矩阵、示例期／开关关闭计数（或扩展 `app-agent-guide-demo-page.test.tsx`）。
- **证据（仓库外）：**`~/orbit-sprint-evidence/web/sprint-W0040/run-01/`：测量脚本、改前／改后输出、噪声对照、预算表计算、截图、全量对照清单。
- **排除：**`features/profile/**`、`app/api/profile/**`、`repos/orbit-app/**`、资料编辑页与管理台的调用参数、P1～P5、`iorbit-home.tsx` 等首页 UI、迁移与部署、生产读取。

## 验收契约（五项）

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-W0040-01 | **首页不再触发资料建议图，单次读取实测。**硬判据三条：(a) 用 `profileSignalReviewQueueServiceFactory` 替身计数，`loadAppHomeRouteViewModel`（有／无 `rawSubject` 两种 actor）`listUpdateSuggestions` 调用 0 次；(b) 本机按 W0017 口径测首页 SSR 复合读取，改后逐语句标签里**不出现** profiles／contacts／connections／interactionMemories／evidence 的整 workspace `listRecords` 与 `profileSuggestionDecisions` 读取（共 6 条）；(c) 噪声对照：在本机测试库的临时 workspace（按「易错边界」证明它是 configured workspace）给**其他账号**往五个集合各加 ≥100 条记录，本人首页 SSR 字节与语句数改后**完全不变**（改前同条件应增长，作为对照）；测完删除。**报告指标（不作门槛）：**`user_verify_new`／`user_verify_legacy`／`user_verify_plan` 三账号改前／改后字节、行数、语句数与下降比例（理论约 99.39%） | 新测试 RED→GREEN、0 skip；测量脚本输出（改前／改后／噪声三份，含 workspace 证明行） |
| SC-W0040-02 | **首页账户卡与失败页不变。**以「改前默认路径（include）」为对照，改后（skip）逐项深相等：(a) 有持久资料、无持久资料（`actorOnboardingProfile` 分支）、建议服务返回多条建议、**`listUpdateSuggestions()` 运行时抛错**四种情况下 route 均为 success，`home.account` 14 个字段与 `initial`／`fullName` 相等；(b) 失败下首页 route-state 的 `copy`、`evidenceIds`、`source`、`recoveryActions` 相等，逐一覆盖：**signal 服务解析失败**、**extraction 服务解析失败**、profile 服务解析失败、`getProfile` 抛错、`getProfile` 返回 `success:false`、onboarding 不合格、无 actor。真实页面 1440／375 各看一次账户卡，与改前截图一致 | 等价矩阵测试；`agent/page`、`home/events` 既有测试通过；截图 |
| SC-W0040-03 | **资料页「更新建议」行为不变。**不传开关时 `loadAppProfileRouteViewModel` 仍调用 `listUpdateSuggestions` 恰好 1 次、参数 `{ actorId }` 不变；有建议／无建议／建议抛错三种情况下 `suggestionCount`、`firstSuggestion`、`reviewSummary` 与改前相等；资料编辑页与管理台调用处未传开关；`git diff` 证明 `features/profile/**`、`app/api/profile/**` 零改动 | 新测试；`tests/pages/app-profile-onboarding-editor.test.tsx`、`tests/api/profile-suggestion-decisions.test.ts`（建议 API 的直接消费者）通过；diff 输出。其余 profile capability／provider 测试由 H 档全量对照覆盖 |
| SC-W0040-04 | **示例期与开关关闭不回退。**开关打开、在引导中：首页复合读取仍恰好 1 次、示例壳 `home` 仍为 null、关系目标判定（空目标进示例、有目标且满足 D2 进真实首页）与改前一致、`listUpdateSuggestions` 0 次；开关关闭：真实路径 home／events／registrations／community 各 1 次（W0014 既有断言）、`listUpdateSuggestions` 0 次；D2 老用户路径不变 | `tests/pages/app-agent-guide-demo-page.test.tsx` 扩展计数；全部通过 |
| SC-W0040-05 | **数据库月预算表重算（D39 1.6 GB）。**REPORT 一张表，先写**人群模型**：真实期 1000 位活跃用户 × 首页 4 次／天 × 30 天；示例期 1000 位新用户 × 10 次（W0036 口径）；两者按单次请求互斥，沿用 W0036 的**保守直接相加**，同时给一列「去重口径」（示例期用户计入活跃用户时只算一次）。行：① 开工时最新总账三档（编制时 1,222.78／1,282.63／1,761.38 MB）；② **新增行：首页 SSR 复合读取（改后实测单次 × 真实期频次）**；③ **新增行：示例期同一复合读取（改后实测单次 × 示例期频次）**；④ 被消除的项（不进总账，对照用）：改前本机实测、按生产计数估算的 276 KB／次，以及标明假设的 N² 敏感度表（N = 5／16／100／1000）对照改后 0；⑤ 参考行（不进总账）：资料页与 `/api/profile/update-suggestions` 默认路径单次实测字节，供 W40-3 排序。给出三档合计两种口径，按 W40-3 的决定判定；超过 1.6 GB 登记为 D32 风险并写明主要来源，不得删行或降口径 | REPORT 预算表；测量脚本输出 |

## 一次 Generator 的执行顺序

1. 复核进入条件（W0039 已合并、W40 待定项已决定），记录基线 SHA 与 Planner SHA256；`git status --short` 确认 RULES §4 列出的用户未提交文件不动。
2. GitNexus：对 `loadAppProfileRouteViewModel`（用 `--uid` 指定 orbits 版本）、`loadAppHomeRouteViewModel` 跑 upstream impact，两者 CRITICAL，REPORT 记录并按 H 档处理；`readSignalGraph` 为 UNKNOWN，已有文本搜索结论（事实 4），复核未变即可。
3. 先跑改前测量（SC-01 (b)(c) 的改前、SC-01 报告指标与 SC-05 ⑤），存证据；写 RED：首页路径计数 0 次、等价矩阵。
4. 最小实现：加开关、首页传开关。跑定向集；再跑改后测量与噪声对照。
5. 浏览器：复用 `http://localhost:3000`（或开工时协调者指定的验收端口），1440／375 账户卡截图与控制台。
6. H 档收口：全量对照基线（RULES §5.2），一次 Codex 代码 review，意见交回本 Generator 修，协调者裁决。
7. 暂存前 `node .gitnexus/run.cjs detect-changes --scope staged --repo .`（`partial`／`truncated` 重跑）；路径限定 commit；写 REPORT（短模板）；交接分支 `sprint/W0040-home-profile-read-trim` 与固定最终 SHA，由协调者合并回 `chat-agent` 并验证合并树。

## 最小测试与检查

- **档位：H。**理由：两个改动符号都是 CRITICAL；`loadAppProfileRouteViewModel` 是首页、资料页、管理台共用契约；首页示例期读取边界相关。收口一次全量对照 + 一次 Codex 代码 review。
- **开发定向集（cwd `repos/orbits`）：**新测试文件；`tests/pages/app-profile-onboarding-editor.test.tsx`；`tests/pages/app-agent-guide-demo-page.test.tsx`。
- **操作链收口集：**上述 + `tests/pages/app-profile-live-route-services.test.ts`、`app-profile-onboarding-navigation.test.ts`、`app-home-live-route-services.test.ts`、`app-agent-registration-actor-id.test.tsx`、`app-canonical-agent-personal-scope.test.ts`、`tests/services/canonical-participant-event-journeys.test.ts`、`tests/api/profile-suggestion-decisions.test.ts`；`npx tsc --noEmit -p .` 一次。profile capability／provider 测试（`tests/capabilities/profile-signal-review-*.test.ts`）与 `tests/audits/unbounded-list-reads.test.ts` 不在定向集，由收口全量对照覆盖（这些代码零改动）。
- **集成：**H 档收口一次 `npm test` 全量，按 RULES §5.2 对照新增失败；不 source `.env`。
- **测量：**只连 localhost；`node scripts/assert-local-test-databases.mjs` 先过；噪声数据只写本机测试库临时 workspace，测完删除，REPORT 写删除证明。
- **不运行：**生产／Preview 读取、部署、App 端测试（App 端代码与 API 零改动，SC-03 以 diff 证明）。

## 待定项（需要用户决定，附推荐）

| 编号 | 问题 | 推荐 |
| --- | --- | --- |
| W40-1 | P1（`readSignalGraph` 按 actor 在 SQL 收窄）是否并入 W0040 | **不并入，另开 H 档 Sprint**（排序见 W40-3）。理由见「范围」：首页收益为 0、改动面不相交、需要独立的逐项等价与失败语义证明 |
| W40-2 | Web 资料编辑页与管理台也不显示建议，是否同样跳过 | **本 Sprint 不改**（保持「资料页行为不变」字面成立、范围最小）。留给 P1 Sprint 一并决定：P1 做完后它们只读本人数据，再跳过的收益很小 |
| W40-3 | 预算判定与后续顺序：跳过建议后首页 SSR 仍剩约 58.8 KB／次（本机），1000 人约 7 GB／月，单行超 1.6 GB；这部分以前从未进账 | **W0040 不以总账 ≤1.6 GB 作通过条件**（剩余来自 P2 范围的既有读取），SC-05 如实补行、超限登记 D32 风险。**后续顺序默认 W0041 = P2**（首页 SSR 改用窄联系人计数与首页活动摘要，含 legacy events 整 workspace 读取；每次打开首页都发生、已确定超预算）、**W0042 = P1**；只有当 SC-05 ⑤ 的单次实测乘以可信的 App 资料建议页调用频次（需另行取得）证明 P1 月成本更高时，才把 P1 提前 |
| W40-4 | 上线后是否用生产数据核对效果 | 部署与生产观测按 D32 周检另行授权；本 Sprint 不连生产 |
| W40-5 | 生产 `orbit_read_cost_daily_routes` 为空，D32 周检无法按路由核对；N² 模型缺少活跃用户数与建议接口频次 | 本 Sprint 不处理。建议协调者另行（经授权、只读）查生产 `ORBIT_PG_READ_METRICS` 是否开启、五集合按 `user_id`／`payload.accountId` 的去重人数，用于 W40-3 的排序复核 |

## 失败与交接

外部条件缺失先不启动；run 已开始则按 RULES 产出 failed／blocked 报告，不自动重跑。
REPORT 必须写：SC 映射与 SHA；impact 结果（两个 CRITICAL、`readSignalGraph` UNKNOWN 的文本补查）；开关的最终名字与默认值；改前／改后／噪声三份测量摘要；SC-05 预算表（人群模型、首页 SSR 真实期与示例期新增行、标明假设的 N² 敏感度对照、资料建议参考行、两种口径合计、是否超 1.6 GB 与 D32 登记）；截图路径；全量对照新增失败清单；Codex review 处理。交接列本线分支、固定最终 SHA、待合并目标 `chat-agent`；未完成 commit 或合并树验证不能标 completed。

## 修订记录

| 修订 | 内容 |
| --- | --- |
| 1（2026-10-01） | 初稿。按 `695748c9` 源码与 GitNexus 复核调查报告：确认首页只用资料 14 字段、建议读取只在 `profile-route-view-model.ts:577–583`、Web 资料页 UI 不显示建议、App 端经 `/api/profile/update-suggestions` 使用；发现首页 SSR 复合读取从未进总账 |
| 2（2026-10-01，Codex 方案 review 后） | 逐条处理见下表 |

### Codex 方案 review 处理（`~/orbit-sprint-evidence/web/sprint-W0040/plan-review.txt`）

| 意见 | 处理 |
| --- | --- |
| P0：无。确认 P0 机制成立，`/app/agent`（真实与示例判定）与 `/app/home/events` 都只经 `home-route-view-model.tsx:259` 一个调用点；事实、行号、算术与 README 总账核对一致 | 无需修改 |
| P1-1：先 P1 后 P2 的推荐与已确认预算风险相反；P2 每次打开首页都发生、已确定超预算，P1 频次未测 | 接受。W40-3 默认顺序改为 W0041 = P2、W0042 = P1，P1 只在实测频次证明成本更高时提前；W40-1 保留「不并入」，删去「N² 不能拖」的排期论据 |
| P1-2：「失败语义不变」没锁住 signal／extraction 服务解析失败这一最易误改的边界 | 接受。SC-02 (b) 显式加 signal、extraction 服务解析失败用例；(a) 显式加 `listUpdateSuggestions()` 运行时抛错用例；易错边界写明两类语义的区别；事实 10 补测试造法 |
| P1-3：生产 N² 外推缺少「5 位活跃用户」的证据，不能作排期硬依据 | 接受。事实 8 改为「276 KB／次是估算、N² 是带假设的敏感度模型」；SC-05 ④ 标明假设；W40-5 增加经授权只读查去重人数与指标开关的建议 |
| P2-1：SC-05 示例期与日常频次关系不清，可能重复累计 | 接受。SC-05 先写人群模型，沿用 W0036 保守直接相加并另给去重口径；示例期单列为 ③ |
| P2-2：SC-01／SC-03 证据过载，≥99% 是脆弱门槛，噪声 workspace 未说明如何成为被测 workspace | 接受。SC-01 硬判据收为「0 次调用、6 条图读取不出现、噪声不变」，下降比例改为报告指标；SC-03 只绑定 route-model 测试与建议 API 直接消费者，其余 capability／provider 测试交全量对照；易错边界写明用 `ORBIT_WORKSPACE_ID`／`ORBIT_LOCAL_WORKSPACE_ID` 指定临时 workspace 并打印证明 |
