# Sprint W0054 — 引导第 1 步满 3 张、分析门槛与示例完整快照

> revision 3：按 REVIEW-2026-10-02-network 裁决修订（R-6、R-12、R-13、R-16，配额口径统一）：进入条件加 W0053（导入入口须真实可用）；读计划处只用 `getCurrent()` + 纯投影，SC-03 加阶段边界夹具 0 写入／0 生成器断言；快照统一读 `NetworkSnapshotView.blocks` + `freshness.stale`；后台池按操作计次；验收契约改为「操作链 + 主证据」+ 必需证据子表。
>
> revision 2：按 D44 定稿待定项、W0048 拆分、配额两池（2026-10-02）。W54-4 的恢复重算规则由 W0048a 的 `decideSnapshotRefresh` 提供，本 Sprint 只消费；恢复后的重算计入后台自动池。

**Plan revision:** 3。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** RN-12（修改 RW-04「第 1 步可跳过」、取代 RW-03 里「示例里没有 AI 人脉分析」的做法）。D41。
**单一目标:** 第 1 步只认 3 位已确认联系人；引导完成状态落库后永不收回；完成后联系人不足 3 位时只替换 AI 分析块；示例期分析三标签显示前端静态的完整示例快照。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 开工时的 `chat-agent` HEAD（编制时 `4ac5a6dc`，GitNexus 索引在 `a48e1749`，只差文档提交）。W0048b、W0049、W0050、W0051 合并后才能开工，届时 HEAD 以开工记录为准。
**进入条件:**
- **W0048b、W0049、W0050、W0051、W0053 completed**（登记表依赖，README 为唯一来源，R-13；W0049～W0051 落地结构／机会／洞察三标签与每人洞察的组件、读模型和选择器，W0048b 让新用户路径第 3 步走 AI 计划并产出 `origin: "plan"` 快照，W0053 让第 1 步与门槛卡里的「导入人脉」入口真实可用（W54-2）；传递要求 W0048a completed）。W0052（概览驾驶舱读快照）若已 completed，驾驶舱里的快照叙述一并纳入门槛与示例（见 W54-3）；未完成则只登记，不等待。
- 共享契约名字以 W0048a（`NetworkAnalysisSnapshot`、`decideSnapshotRefresh`、两池配额）、W0048b（计划 AI 入口）、W0049～W0051（`ContactInsight`、标签组件）REPORT 交接为准——这是本 Sprint 唯一允许读的前序 REPORT，只摘接口一节。
- W54-1～W54-6 已定（D44，见文末）。
- 档位 H。不需要云端授权；不做数据迁移；本 Sprint 自身不新增付费 AI 调用（门槛恢复后的重算走 W0048a 既有通道、计入后台自动池，浏览器验证若触发需在 REPORT 记录次数与 token）。

## 已查清的事实（2026-10-01 按 `4ac5a6dc` 源码复核）

1. **第 1 步规则只在一处。** `features/guide/start-steps.ts:38–48` `contactsStepDone` = `grandfathered || step1Skipped || confirmedContacts >= START_REQUIRED_CONTACTS(3)`；`deriveStartGuideFlags`（55–61）、`features/guide/progress.ts:63–84` `deriveGuideProgress` 都调它。服务端（`readGuideStatusForActor`、`readStartGuideForActor`）与客户端（`start-guide.tsx:197–210` 的 `flags`）共用。
2. **跳过的全部落点。** 客户端：`start-guide.tsx:9`（头注释）、`104`（`writer.send` 的 `step1Skipped`）、`171–173`（步骤条副标题「已先跳过」）、`194–197`（`localSkipped`／`skipped`）、`266–282`（`skipContacts`）、`394–409`（传给 `StepCards` 的 `onSkip`／`skipError`／`skipped`／`skipping`）；`start-step-cards.tsx:4`（头注释）、`19–49`（props）、`79–87`（`why` 文案里「你选择了先继续」）、`156–181`（`data-start-skip` 整块）、`182–184`（`skipError`）。服务端：`app/api/guide/state/route-handler.ts:34`（`PATCHABLE_FIELDS`）、`39`、`52`、`63–68`；`features/guide/guide-state.ts:11、38、46、65、86、190–193`；`progress.ts:5、69–70、282、423、440`。
3. **完成状态现在会被收回。** `readGuideStatusForActor`（`progress.ts:227–290`）每次都按实时联系人数、目标、计划推导 `inDemo`，**不读 `completedAt`**：做完引导的人删到 2 位联系人（且没点过跳过、不是 D2 老用户）会被切回示例；计划到期同理。`completedAt` 只在 `readStartGuideForActor`（`progress.ts:425–429`）——即打开 `/app/start` 时——写一次；在引导页第 3 步生成计划后直接去首页的人可能一直没有 `completedAt`。
4. **存量「已跳过」。** `guideState.step1Skipped = true` 只能置 true、不可撤销（`guide-state.ts:190–193`、`route-handler.ts:63–68`）。点过跳过的人里有两类：已做完 2、3 步（大多也有 `completedAt`），和还停在第 2 或 3 步。App 端（`repos/orbit-app`）不调用 `/api/guide/state`（2026-10-01 全文搜索 0 处）。
5. **示例判定的入口。** `app/(app)/app/_demo/demo-guide-view.ts:42–59` `readDemoModeViewForActor` 被 7 个页面调用（首页、计划、人脉列表、关系管线、概览／分析、联系人详情、分组名单）。示例期分析子页：`app/(app)/app/contacts/dashboard/page.tsx:53–67` 概览渲染 `buildDemoNetworkViewModel`／`buildDemoNetworkAnalysis`，`?tab=structure|opportunities` 只渲染 `NetworkDemoAnalysisNotice`（`network-0918/network-shell.tsx:74–89`，「示例里没有 AI 人脉分析」）。分组名单页示例期直接重定向回 `?tab=structure`（`analysis/[dimension]/[bucketId]/page.tsx:24`）。
6. **示例数据。** `_demo/demo-network.ts`（472 行）：30 位示例联系人 `SEEDS`、8 位完整详情 `RICH`；`buildDemoNetworkAnalysis`（383–459）的 `analysis`／`coverage`／`goal` 标为 `unavailable`、结构 `relationship`／`role` 维度为空数组、`summary` 为空——没有快照叙述、洞察、覆盖度。id 带 `demo:` 前缀，写接口见前缀即拒绝。示例写操作拦截用 `useDemoMode().guardWrite(label)`（`demo-mode-core.tsx:38–48`），角标 `DemoTag`（220）。
7. **3001 验收账号。** `scripts/seed-verify-accounts.ts`：`verify-new`（0 联系人、新用户、示例期）；`--reset verify-new --guide-step1` 直接补 3 位已确认联系人（不扫名片、不调识别 AI，1183–1189 行）；`verify-plan`（5 位联系人、D2 老用户、有计划）。W0039 的新用户路径靠「先这样，继续」不花钱地过第 1 步——本 Sprint 之后不再可行，后续验收一律改用 `--guide-step1`。

## 上下文包（Generator 从这里起步，不通读其他 REPORT）

### 必读文件
- `features/guide/start-steps.ts`（149 行全读）：第 1 步规则、`StartGuideSnapshot`。
- `features/guide/progress.ts:1–110、223–290、352–443`：`deriveGuideProgress`、`decideGuideDemo`、`readGuideStatusForActor`、`readStartGuideForActor`、`CONFIRMED_CONTACT_COUNT_SQL`（119–127，门槛计数必须同一谓词）。
- `features/guide/guide-state.ts`（211 行）：`step1Skipped` 只读兼容、`markCompleted`。
- `app/api/guide/state/route-handler.ts:30–90`：PATCH 校验。
- `app/(app)/app/start/start-guide.tsx`（按事实 2 行号）、`start-step-cards.tsx`（186 行全读）。
- `app/(app)/app/_demo/demo-guide-view.ts`（59 行）、`demo-network.ts:1–60、170–200、280–300、380–472`、`demo-mode-core.tsx:20–70、120–230`。
- `app/(app)/app/contacts/dashboard/page.tsx`（97 行全读）、`network-0918/network-shell.tsx:60–90`、`network-0918/network-analysis.tsx`（W0049～W0051 改过后的版本）、`analysis/[dimension]/[bucketId]/page.tsx:1–30`。
- W0048a、W0048b、W0049～W0051（及已完成的 W0052）REPORT 的接口交接一节：快照读取函数名、洞察读取函数名、三标签组件与选择器、重算触发入口与配额返回值。

### 关键符号与影响等级（GitNexus `impact --direction upstream -f <file>`，索引 `a48e1749`，2026-10-01）
- `readDemoModeViewForActor(input: { actorId: string; userId?: string | null }, dependencies?: DemoGuideViewDependencies): Promise<DemoModeView | null>`：**CRITICAL**（直接调用方 7：`AppAgentPage`、`AgentPlanPage`、`AppContactDetailPage`、`AppContactsStructureDetailPage`、`AppContactsDashboardPage`、`AppContactsPage`、`AppContactsPipelinePage`）。签名不变；它返回什么由 `readGuideStatusForActor` 的闩锁语义决定。
- `createStorageGuideStateService(input): GuideStateService`：**CRITICAL**（经 `resolveGuideStateService` 到 PATCH 路由、首页、引导页）。只允许删 `update` 里的 `step1Skipped` 写分支，读取兼容不动。
- `contactsStepDone(input: { confirmedContacts: number; grandfathered?: boolean; step1Skipped?: boolean }): boolean`：**HIGH**（`deriveGuideProgress`、`deriveStartGuideFlags` → 首页、引导页）。
- `deriveStartGuideFlags(input: StartGuideFlagInput): StartGuideFlags`：**HIGH**（`StartGuide` 客户端 `flags`、`readStartGuideForActor`）。
- `readGuideStatusForActor(input: { actorId: string; relationshipGoal: string | null | undefined; userId?: string | null }, dependencies?: GuideStatusDependencies): Promise<GuideStatus | null>`：GitNexus 报 LOW（只解析到 `AppAgentPage`），**文本搜索补查**：经 `readDemoModeViewForActor` 默认依赖间接服务全部 7 个页面，按 CRITICAL 对待。
- `readStartGuideForActor`、`deriveGuideProgress`、`decideGuideDemo`、`StepCards`、`NetworkDemoAnalysisNotice`、`buildDemoNetworkAnalysis`（直接调用方 dashboard 与 pipeline 页）：LOW。
- `AppContactsDashboardPage`：UNKNOWN（Next 路由入口，无代码调用方）。
- W0049～W0051 的标签组件与快照／洞察读取器：开工时补跑 impact，名字以 REPORT 为准。

### 前序交接要点
- W0006／W0035：第 1–3 步严格顺序；`completedAt` 只写一次并清空 `currentStep`；`?step` 加载不写记录；非法存量值读成 `null`、写入 400。
- W0004／W0005：示例期页面提前返回，不调用 `loadContactsAnalysis`／`loadAppContactsRouteViewModel`；开关关闭时零读取；示例 id `demo:` 前缀。
- W0048a：快照按 actor 存当前 + 历史，`includedContactIds`、`contactCount`、`stale` 判定；新增 ≥3 人或 ≥20% 自动重算；**恢复规则**（快照引用者里仍存在的 <3 且当前已确认 ≥3 → `threshold`，即 W54-4）；两池配额按操作计次：自动重算在后台池（每人每东京日 60 次操作，一次快照 = 1 次），用完顺延次日、视图 `job: "deferred"` + `retryOn`（显示「明天更新」）。快照视图统一为 `NetworkSnapshotView.blocks` + `freshness.stale`（R-12）。W0048b：新用户第 3 步计划生成走 AI 流水线（用户主动池）。
- W0049～W0051：结构 ①④、机会叙述与报告卡、洞察标签、详情弹窗顶部与列表洞察列来自快照／洞察；统计实时规则计算。
- W0016／W0018：3001 `preview_start {name:"orbits-verify"}`，浏览器 `http://127.0.0.1:3001`；`node --import tsx scripts/verify-session-cookie.ts <账号>`；`--reset <账号>`、`--fingerprint`、`--summary`；`next-env.d.ts` 被改不提交。

### 易错边界（都对应到 SC）
- **新跳过一条路都不留**：UI、客户端写、PATCH、服务层 `update` 四处都关；但存量 `step1Skipped = true` 的读取兼容按 W54-1 保留，不迁移、不批量改记录。（SC-01）
- **完成状态只进不退**：有 `completedAt` 后删联系人、计划到期、目标清空都不回示例、不重开引导；首页路径第一次推导出完成时补写 `completedAt`，写失败不影响本次显示、不抛错。（SC-02）
- **门槛只换 AI 块**：统计图、档位人数、覆盖度数字、首页、计划页、联系人列表本身都照常；旧快照叙述与洞察文字**不进入服务端下发的数据**（不是只在 CSS 上藏）；不足 3 位时打开页面不排队重算、不调 AI。门槛计数与引导用同一谓词和同一常量。（SC-03）
- **读计划处只读（R-6）**：本 Sprint 新增或改动的任何计划读取（门槛接线、示例分支除外的三标签加载、引导完成判定）只用 `PlanService.getCurrent()`（`service.ts:688`）+ 纯投影，不调用 `getCurrentView()`／`enterCurrentPhase()`；阶段边界计划夹具下打开三标签，计划三表 0 写入、计划生成器 0 次解析。（SC-03）
- **「导入人脉」真实可用（R-13）**：第 1 步与门槛卡的「导入人脉」链到 W0053 已上线的 `/app/contacts/new`，不是占位。（SC-01）
- **示例 0 调用 0 写**：示例快照是前端静态数据；示例期服务端不调用真实快照／洞察／分析读取器与 AI provider，客户端除顶栏既有的 `/api/account/me` 外对真实接口 0 请求；任何「重新分析／起草邮件／点分组」走 `guardWrite`。（SC-04）
- **验收不花钱**：新用户过第 1 步用 `--guide-step1`，不扫名片；不足 3 位用 `verify-plan` 在页面上删联系人造，结束 `--reset`。（SC-05）

## 范围与文件

- **修改：**
  - 引导：`features/guide/start-steps.ts`、`features/guide/progress.ts`、`features/guide/guide-state.ts`（删 `step1Skipped` 写分支，读取保留）、`app/api/guide/state/route-handler.ts`、`app/(app)/app/start/start-guide.tsx`、`start-step-cards.tsx`、`start-guide-styles.ts`（删 `.sg-skip` 样式时）。
  - 门槛：一个纯函数模块（`features/network-analysis/analysis-threshold.ts`，W0048a 的目录）导出 `NETWORK_ANALYSIS_MIN_CONTACTS = START_REQUIRED_CONTACTS` 与「还差 N 位」计算；W0049～W0051（及已完成的 W0052）落地的标签组件与快照读取接线处；门槛卡组件放在 `network-0918/` 下。
  - 示例：`app/(app)/app/_demo/demo-network.ts`（或拆出 `_demo/demo-network-analysis.ts`）补示例快照、洞察、补全字段与强度档；`dashboard/page.tsx` 示例分支；`network-shell.tsx` 删 `NetworkDemoAnalysisNotice`。
  - 测试：`tests/services/guide-start.test.ts`、`tests/services/guide-progress.test.ts`、`tests/api/guide-state-routes.test.ts`、`tests/pages/app-start-guide.test.tsx`、`tests/pages/app-start-guide-page.test.tsx`、`tests/pages/app-network-demo-mode.test.tsx`、`tests/pages/app-network-demo-pages.test.tsx`、`tests/pages/app-network-demo-data.test.ts`，以及 W0049～W0051 新增的标签测试文件（门槛用例加在里面）。
- **新建：** 门槛纯函数模块及其测试；示例快照静态模块（若拆文件）。
- **排除：** 快照生成、配额、重算阈值本身（W0048a）；三标签布局（W0049～W0051）；导入器（W0053）；回填脚本与死代码清理（W0055）；`features/guide/guide-state.ts` 的存量数据迁移；App 端。

## 验收契约（五项；revision 3 起每项 = 一条操作链 + 一个主证据，其余断言见「必需证据子表」，R-16）

| SC | 操作链（可观察行为） | 主证据 |
| --- | --- | --- |
| SC-W0054-01 | **第 1 步只认 3 位。**已确认 2 位联系人的新用户打开 `/app/start`：停在第 1 步，没有跳过入口，只有「扫名片」与「导入人脉」 | `tests/pages/app-start-guide.test.tsx`（先 RED） |
| SC-W0054-02 | **完成状态永不收回。**有 `completedAt` 的用户把联系人删到 2 位后打开首页：`readGuideStatusForActor` 返回 `inDemo: false`，且不读联系人计数与计划 | `tests/services/guide-progress.test.ts` 闩锁用例（计数 spy） |
| SC-W0054-03 | **门槛只换 AI 块。**已确认 2 位的真实数据用户打开 `?tab=structure` 等三个标签：每页一张「再添加 1 位联系人即可更新分析」卡 + 「扫名片」，统计图照常，下发数据不含旧快照句子与洞察文字 | W0049～W0051 标签测试文件里的 2 位／3 位夹具组（序列化 props／HTML 断言） |
| SC-W0054-04 | **示例完整快照。**示例期打开 `?tab=structure|opportunities|insight` 三标签都有完整示例内容并带「示例」角标，服务端与客户端对真实接口 0 调用 | `app-network-demo-pages.test.tsx` 改写（三标签内容 + 读取器／provider／store 计数 spy） |
| SC-W0054-05 | **真实页面与收口。**3001 上依次跑 ①`verify-new`（0 位）②`verify-new --guide-step1`（3 位）③`verify-plan` 删到 2 位 ④存量跳过样本，四组场景表现符合 SC-01～04 | 截图（1440／375）与网络记录（`~/orbit-sprint-evidence/web/sprint-W0054/run-01/`） |

### 必需证据子表（每条子断言独立留证，缺一即该 SC 不通过）

| SC | 子断言 | 证据 |
| --- | --- | --- |
| 01 | `contactsStepDone({confirmedContacts: 2})` false、`{3}` true、D2 老用户 true；存量 `step1Skipped: true` 仍算完成（W54-1） | `guide-start.test.ts`（54–60、154–170、401–420 行一带改写） |
| 01 | `PATCH {step1Skipped: true}` 返回 400 `VALIDATION_ERROR` 且记录不变；`GuideStateService.update` 不再接受该字段 | `guide-state-routes.test.ts`（206–222、285–293 行一带） |
| 01 | 引导页无 `data-start-skip`、无「先这样，继续」与代价文案、副标题不再出现「已先跳过」；「导入人脉」链到 W0053 的 `/app/contacts/new`（识别不可用时为主按钮，W54-2、R-13）；离开再进仍停在第 1 步，首页仍是示例 | `app-start-guide.test.tsx`（327–345 行一带）、`app-start-guide-page.test.tsx` |
| 01 | `rg -n 'step1Skipped\|data-start-skip\|先这样' app features` 只剩 W54-1 允许的只读兼容位置 | `rg` 原样输出 + REPORT 逐行说明 |
| 02 | 无生效计划、目标为空两种情况同样 `inDemo: false` 且不读联系人计数与计划 | `guide-progress.test.ts` |
| 02 | 第一次推导出 3 步完成且无 `completedAt` 时写一次，写失败仍返回 `inDemo: false` 不抛错，第二次读不再写 | `markCompleted` spy 断言 1 次 |
| 02 | `/app/start` 对有 `completedAt` 的人显示完成卡片（即使联系人 < 3）；没有 `completedAt` 的未完成用户行为与改前一致 | `guide-start.test.ts`；`app-agent-guide-demo-page.test.tsx` 补「completedAt + 2 位 → 真实首页」 |
| 03 | N = 3 − 已确认数；「扫名片」→ `/app/contacts/new?method=scan`；档位人数、覆盖度数字照常（W54-3） | 标签测试 |
| 03 | 不足 3 位时打开页面对快照重算入口、洞察生成、AI provider 0 次调用 | 计数 spy |
| 03 | **R-6**：阶段边界计划夹具下打开三标签，计划三表 0 次 INSERT／UPDATE、计划生成器 0 次解析；改动的计划读取处只用 `getCurrent()` + 纯投影（无 `getCurrentView`／`enterCurrentPhase` 引用） | 服务端加载测试（SQL 写语句计数 + 生成器 factory spy）+ 源码扫描 |
| 03 | 联系人回到 3 位后按 W0048a 恢复规则立即排队重算（W54-4），完成前显示「正在更新分析」而非旧快照；后台池用完显示「明天更新」 | 标签测试 |
| 03 | 门槛计数与引导共用常量与谓词；新增读取（若有）实测字节与次数写 REPORT | 门槛纯函数测试、REPORT |
| 04 | `?tab=structure`：诊断一句、四维分布（行业两级、地区、角色层级、强度档）、健康四档、2–3 条结构洞察；`?tab=opportunities`：覆盖度（已有／还缺）、补法、本周建议、待唤醒、报告卡；`?tab=insight`：30 位示例联系人每人一条洞察可排序筛选；中英双语 | 改写后的 demo 页测试 |
| 04 | `data-network-demo-analysis` 与「示例里没有 AI 人脉分析」不再出现 | demo 页测试 |
| 04 | 示例期服务端对 `loadContactsAnalysis`、`loadAppContactsRouteViewModel`、W0048a 快照读取、W0051 洞察读取、AI provider 均 0 次，live record store 写入 0 次；客户端除 `/api/account/me` 外 0 请求 | `app-network-demo-mode.test.tsx` 计数 spy |
| 04 | 「重新分析」「起草邮件」「点分组」触发 `guardWrite` 拦截（W54-6）；示例快照证据 id 都指向 30 位示例联系人 | demo-mode 测试、`app-network-demo-data.test.ts` |
| 05 | ①引导第 1 步无跳过、示例分析三标签有内容带角标、网络面板无真实分析／AI 请求；②第 1 步完成可进第 2 步；③三标签出现门槛卡、首页与列表照常、引导不出现；④存量跳过样本（开工前在旧代码 3001 上写入）改动后按 W54-1 停在第 2 步 | 截图、控制台、网络记录 |
| 05 | 控制台 0 错误；结束后 `--reset verify-new`、`--reset verify-plan`，`--fingerprint` 前后一致 | 指纹前后 |
| 05 | 受影响测试文件全过、`npx tsc --noEmit -p .`、一次全量基线对照（RULES §5.2）无新增失败、Codex 代码 review 一次 | 定向集、tsc、全量对照清单、`codex review` 全文 |

## 一次 Generator 的执行顺序

1. 复核进入条件（W0048b、W0049～W0051 completed；W54-1～6 已定），记录 HEAD、Planner 哈希、`git status`；摘 W0048a、W0048b、W0049～W0051（W0052）REPORT 接口；对上表符号与 W0049～W0051 标签组件跑 upstream impact，HIGH／CRITICAL／UNKNOWN 登记进 REPORT。**改代码前**在 3001 造好 SC-05 ④ 的存量跳过样本（改动后跳过写入会被拒）。
2. RED：引导规则与 PATCH、闩锁、门槛（2／3 位两组）、示例三标签与 0 调用 spy。
3. 实现顺序：`start-steps.ts`／`guide-state.ts`／路由 → `progress.ts` 闩锁 → 引导页 UI → 门槛纯函数与标签接线 → 示例静态快照与 dashboard 示例分支 → 删 `NetworkDemoAnalysisNotice`。
4. 按两条操作链提交（引导规则与闩锁；门槛与示例）；每次提交前暂存区 `detect-changes`（`partial`／`truncated` 重跑）。
5. 3001 浏览器验证、全量对照、Codex 代码 review 一次（同一 Generator 修）；写 REPORT，交接分支 `sprint/W0054-network-threshold-demo` 与固定 SHA。

## 最小测试与检查

- **档位：H。** `readDemoModeViewForActor`、`createStorageGuideStateService` 为 CRITICAL，`contactsStepDone`、`deriveStartGuideFlags` 为 HIGH；改动涉及引导记录写入校验（PATCH）与「是否进示例」的共享判定，影响 7 个页面。
- **开发定向集（cwd `/Users/li/work/orbit/repos/orbits`）：** `tests/services/guide-start.test.ts`、`tests/services/guide-progress.test.ts`、`tests/api/guide-state-routes.test.ts`、`tests/pages/app-start-guide.test.tsx`、`tests/pages/app-start-guide-page.test.tsx`、`tests/pages/app-agent-guide-demo-page.test.tsx`、`tests/pages/app-network-demo-*.test.ts(x)`、门槛纯函数测试、W0049～W0051 标签测试文件。
- **操作链收口集：** 上述完整文件 + `tests/services/guide-progress-postgres.test.ts`（需本机测试库，先 `node scripts/assert-local-test-databases.mjs`，REPORT 证明未 skip）、`tests/pages/app-agent-iorbit-home.test.tsx`（首页示例分支不变）、`npx tsc --noEmit -p .`。
- **集成：** 本地代码收口时一次全量对照（RULES §5.2，不 source `.env`）。
- **浏览器：** 3001 四组场景 × 1440／375；证据目录 `~/orbit-sprint-evidence/web/sprint-W0054/run-01/`。
- **不运行：** 生产／Preview、名片识别真实调用、PG 差分。门槛恢复触发的真实重算若在 3001 发生，记录次数与 token；不主动为验收触发。

## 失败与交接

REPORT 必须写：W54-1～6 的执行结果；`rg` 扫描中保留的 `step1Skipped` 只读位置；闩锁的读取次数变化（有 `completedAt` 的人首页少读几次）；门槛新增读取的实测字节与次数（交 W0055 汇总进 D39 总账）；示例快照的数据来源说明（全部来自 30 位示例联系人，证据 id 可追溯）。交接给 W0055：新用户验收改用 `--reset verify-new --guide-step1`；门槛卡与示例的选择器。若 W0049～W0051 的组件结构使「只替换 AI 块」必须改动它们的数据读取签名，先 impact 再改，并在 REPORT 登记；W54-4 只消费 W0048a 的恢复规则；若发现该规则不足以满足 W54-4，停下交协调者，不在本 Sprint 改共享阈值。

## 已定（D44，2026-10-02）

| 编号 | 定稿结论 | 对标做法 |
| --- | --- | --- |
| W54-1 | 存量已跳过第 1 步（`step1Skipped = true`）的用户不打回，只读兼容算完成；新的跳过一律关闭——UI 去掉按钮，`PATCH {step1Skipped:true}` 返回 400 `VALIDATION_ERROR`；这些人联系人不足 3 位时由分析门槛卡在功能处提示 | HubSpot／Linear／Notion 升级引导要求时不把已过那一步的老用户拉回引导，只在依赖该数据的功能处设门槛 |
| W54-2 | 第 1 步在「扫名片」旁常驻「导入人脉」→ `/app/contacts/new`（CSV／vCard，W0053）；识别不可用时它升为主按钮；导入的已确认联系人照样计入 | HubSpot、LinkedIn 的「导入联系人」引导总给多个来源，从不只留一条依赖单个服务的路径 |
| W54-3 | 门槛卡对所有看真实数据的用户生效（只看已确认联系人 <3）；整块位置每页只放一张卡；行内位置（详情顶部「和你目标的关系」、列表洞察一句）只隐藏；统计图、档位人数、覆盖度数字照常 | HubSpot 报表组件数据不足时整块显示空态并给补数据入口；LinkedIn 信息不够时直接隐藏洞察模块 |
| W54-4 | 补回 3 位视同达阈值立即重算（由 W0048a 恢复规则判定），期间显示「正在更新分析」、不回显旧快照；后台池用完显示「明天更新」 | Notion、HubSpot 的分析不展示引用已删除记录的结论，数据源变化后先显示「更新中」再出新结果 |
| W54-5 | `completedAt` 为唯一闩锁：`readGuideStatusForActor` 首次推导出 3 步完成时补写一次（失败不影响本次显示）；有 `completedAt` 后直接返回「不在示例」，不再读联系人数和计划 | HubSpot 入门清单、Linear onboarding 在服务端记一次完成，之后不再按实时数据重新评估 |
| W54-6 | 示例快照里点分组、重新分析、起草邮件走既有示例拦截（`guardWrite`），不新建示例名单页 | HubSpot 示例联系人、Linear 演示工作区可浏览，深入到依赖真实数据的报表时给「接入你的数据」提示 |
