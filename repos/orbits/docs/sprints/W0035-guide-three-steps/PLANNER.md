# Sprint W0035 — 引导改为 3 步

**Plan revision:** 3（2026-10-01 按 [REVIEW-2026-10-01](../REVIEW-2026-10-01.md) 修订残留扫描，见文末修订记录；revision 2 写入 D38 决定）。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** RH-01（引导只剩名片、目标、生成计划；取代 RW-04 的第 4 步部分与 W0022 的第 4 步提醒）。D37。
**单一目标:** 第 4 步「活动」从步骤规则、引导记录取值范围、引导页、首页提醒和相关措辞里移除；存量 `currentStep = 4` 的人照常进入引导页。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 开工时的 `chat-agent` HEAD（编制时 `08fe51db`，GitNexus 索引同为 `08fe51d`）。
**进入条件:**
- 无前序 Sprint 依赖（登记表：W0035 依赖「无」）。
- W35-1～W35-3 用户已于 2026-10-01 决定（D38），见下表「已定决定」。
- 档位 H（登记表已同步为 H，理由见「最小测试与检查」）。
- 不需要云端授权，不调用付费 AI，不做数据迁移。

## 已查清的事实（2026-10-01 按 `08fe51db` 源码复核）

1. **步骤规则只在一处。** `features/guide/start-steps.ts` 是服务端与客户端共用的纯函数：第 13–14 行 `GuideStartStep = 1 | 2 | 3 | 4`、`GUIDE_START_STEPS`；第 19 行 `isGuideStartStep`；第 23–37 行 `StartGuideFlags.events`、`StartGuideFlagInput.eventsDone`；第 66 行 `KEY_BY_STEP` 含 `4: "events"`；第 88–94 行状态 `"open"` 只给第 4 步；第 117–120 行 `parseStartStepParam` 正则 `^[1-4]$`。`firstIncompleteStartStep`／`firstThreeStepsDone`（72–82）本来就只看前 3 步。
2. **示例结束条件与第 4 步无关。** `features/guide/progress.ts:43` `GUIDE_STEP_ORDER = ["contacts","goal","plan"]`，`decideGuideDemo`（100–110）按它判定；`readStartGuideForActor`（370–442）里第 4 步只是 `eventsDone: false`（421），`completedAt` 在第 427–431 行「前 3 步完成且未写过」时写一次并清空 `currentStep`。这两处的语义本 Sprint 不变，只删 `eventsDone` 入参和注释里的第 4 步。
3. **存量 `currentStep = 4` 天然兼容。** `features/guide/guide-state.ts:78–88` `stateFrom` 用 `isGuideStartStep` 解析存量值，非法值读成 `null`（注释已写明）。`isGuideStartStep` 收窄到 1–3 后，存量 4 读成 `null` → `resolveStartView` 落到第一个未完成步骤或完成卡片。写入侧 `update`（193–199）与 `app/api/guide/state/route-handler.ts:69–73` 同样用 `isGuideStartStep` 校验：写 4 会抛 `VALIDATION_ERROR`（400）。客户端 `patchGuideState`（`start-guide.tsx:71–84`）失败不抛，所以旧标签页里残留的「写 4」只是一次失败的 PATCH，不影响页面。原始 payload 里的 4 会留到下次写 `currentStep` 或 `markCompleted` 时被覆盖，读出来始终是 `null`，不需要迁移。
4. **完成后还会写出 4。** `markCompleted` 清空 `currentStep` 后，用户在完成卡片点「做第 4 步」会写回 4（`start-guide.tsx:367–370` → `openStep(4)`）。所以「已完成 + currentStep = 4」是真实存在的存量组合，兼容测试要覆盖它。
5. **引导页第 4 步的全部落点。**
   - `app/(app)/app/start/page.tsx`：第 7–9 行注释；第 36–37 行 `START_EVENT_LIMIT`；第 52–84 行 `readStartEvents`（读公开目录 + 报名状态）；第 86–96 行 `readRegisteredAny`（`hasAnyActiveRegistration`）；第 99 行注释 `?step=4`；第 133–137 行并行读社群／活动／报名，第 141–145 行传给壳。删掉后 `/app/start` 不再读社群、目录、报名。
   - `app/(app)/app/start/start-guide.tsx`（526 行）：头注释 4–8；`StartEventView` 45–52；`StartGuideProps` 的 `communityJoined`／`events`／`registeredAnyEvent`（56–59）；`STEP_TITLES[4]`（141）；`stepSubtitle` 的 `"open"` 分支（170）与末尾第 4 步分支（201–204）；`localJoined`／`joined`（218–220）；`eventsDone`（227）；`view === 4` 判断（271）；「共 4 步」（327、413–417）、标题「4 步，…」（339）、完成卡片第 4 步文案和按钮（356–370）、`aria-label` 「引导 4 步」（376）、「先看活动 →」／「回到第 n 步」（421–428）、`StepEvents`（475–482）。
   - `app/(app)/app/start/start-step-events.tsx`（96 行）：整个文件只给第 4 步用（GitNexus：`StepEvents` 唯一调用方 `StartGuide`）。
   - `app/(app)/app/start/start-guide-styles.ts`：第 41 行 `.sg-steps` 是 `repeat(4, …)`，要改 3；第 105–114 行「第 4 步：推荐活动」`.sg-rec*`；第 139 行手机端 `.sg-rec`。
6. **首页第 4 步的全部落点（W0022 加的）。**
   - `app/(app)/app/agent/page.tsx`（≈300 行）：头注释 24–26；第 42 行 import `hasAnyActiveRegistration`；第 76–92 行 `readGuideStep4Pending`；第 220–229 行计算 `guideStep4Pending`；第 244 行传给壳。`guideEnabled`（222）**保留**：无计划时「帮我制定推进计划 →」仍按它选 `/app/start?step=3` 或 `/app/agent/strategy`。第 219 行 `readCommunityJoinedForActor` **保留**（社群行还在，见 W35-2）。
   - `iorbit-0918/iorbit-shell.tsx`：第 89–90 行 prop、第 242 行默认值、第 511 行透传。
   - `iorbit-0918/iorbit-home.tsx`（1544 行）：第 107–111 行 prop、第 248 行解构、第 787–788 行 `showGuideStep4`、第 1410–1417 行提醒行。
   - `iorbit-0918/iorbit-home-styles.ts:160–161`：`.ir-m-guide-step4` 样式。
7. **只改措辞、不改逻辑的引用。**
   - `features/community/contract.ts:1–4`：注释「`joined` 即『第 4 步视为完成』」——合同本身没有任何第 4 步逻辑（`membership.ts`、`service-factory.ts:95 readCommunityJoinedForActor` 均无），只改注释。
   - `app/(app)/app/events/events-0918/community-card.tsx:10、67`：注释提到引导第 4 步；`onJoined` 是可选 prop，删掉第 4 步后唯一的传入方消失（`events-list.tsx:390` 不传）。保留 prop、改注释（删 prop 属于顺手清理，不做）。
   - `features/events/registration/active-registration.ts`：头注释「W0006 引导第 4 步」。删掉两处调用后本模块没有生产调用方（见 W35-3）。
   - `features/guide/progress.ts:8–9、367`：注释。
8. **不是引导第 4 步、不要改的引用。** `onboarding-0918/onboarding-flow.tsx:620` 的「第 4 步后」药丸与 `features/profile/intro-draft-service.ts:22` 的「新用户引导第 4 步」指的是 **onboarding 自己的 5 屏**（`onboarding-model.ts:18–22`：profile → goals → persona → **intro** → import），第 4 屏就是「AI 生成介绍」，药丸「一段拿得出手的自我介绍 · 第 4 步后」说的正是它；同组药丸还有「第 2 步后」「第 3 步后」。它们与 `/app/start` 的第 4 步无关，删掉反而让 onboarding 的编号说错。按 W35-1（D38）不改。
9. **其它入口不涉及第 4 步。** `_demo/demo-mode-core.tsx:23`、`plan-route-view-model.ts:417` 只链 `/app/start`（不带 step）；全库没有别处链 `/app/start?step=4`；App 端无引用。

## 已定决定（用户 2026-10-01：D38，全按推荐）

| 编号 | 决定 |
| --- | --- |
| W35-1 | onboarding 的「第 4 步后」药丸与 `intro-draft-service.ts:22` 注释**不改**：它们指 onboarding 自己的第 4 屏（AI 介绍），不是引导第 4 步（RH-01 已按此修订）。REPORT 只写核对结论 |
| W35-2 | 本 Sprint **只删首页第 4 步提醒行**；已报名栏里的社群行与「看看推荐 →」保留，由 W0037 删除（W0037 同时加入社群置顶的活动小模组，首页不出现没有社群入口的空档） |
| W35-3 | `features/events/registration/active-registration.ts` 与它的测试**保留**，只改头注释（写明「W0035 后暂无生产调用方」）；删不删交给 W0036 决定 |

## 上下文包（Generator 从这里起步，不通读其他 REPORT）

### 必读文件
- `features/guide/start-steps.ts`（156 行，全读）：本 Sprint 的规则中心。
- `features/guide/guide-state.ts:20–90、180–210`：存量解析 `stateFrom`、写入校验 `update`、`markCompleted`。
- `app/api/guide/state/route-handler.ts:30–90`：PATCH 校验与报错文案「1 to 4」。
- `features/guide/progress.ts:1–45、360–442`：注释、`GUIDE_STEP_ORDER`、`readStartGuideForActor`（只删 `eventsDone`）。
- `app/(app)/app/start/page.tsx`（163 行，全读）、`start-guide.tsx`（按上面行号）、`start-step-events.tsx`（删除）、`start-guide-styles.ts:40–52、100–144`。
- `app/(app)/app/agent/page.tsx:20–92、215–250`；`iorbit-shell.tsx:82–95、236–246、505–515`；`iorbit-home.tsx:99–115、244–252、784–790、1398–1445`；`iorbit-home-styles.ts:155–165`。
- 措辞：`features/community/contract.ts:1–5`、`community-card.tsx:8–12、64–70`、`active-registration.ts:1–12`。

### 关键符号与影响等级（GitNexus `impact --direction upstream`，索引 `08fe51d`，2026-10-01）
- `IOrbitHome(props: IOrbitHomeProps)`：**CRITICAL**（直接调用方 `IOrbitLiveShell`、`IOrbitDemoBody`，经 `IOrbitShell` → `AppAgentPage`）。只删可选 prop `guideStep4Pending` 与一处渲染分支；示例壳本来不传。按 CLAUDE.md 不降级。
- `resolveStartView(flags: StartGuideFlags, recorded: GuideStartStep | null): StartView`：**HIGH**（直接调用方 `resolveRequestedStartView`，执行流 `AppStartPage`／`StartGuide`）。签名文字不变，但入参类型随 `GuideStartStep` 收窄；语义「记录能打开就用，否则第一个未完成或完成卡片」不变。
- `startStepStatus`、`startStepDone`、`canOpenStartStep`、`deriveStartGuideFlags`：**HIGH**（调用方 `StartGuide`、`stepSubtitle`、`openStep`、`readStartGuideForActor`）。删 `"open"` 状态与 `events` 标志。
- `isGuideStartStep(value: unknown): value is GuideStartStep`：LOW，但直接调用方是 `stateFrom`、`update`、`parsePatch`——**存量读取与写入校验**，这是升 H 的第二个理由。
- `parseStartStepParam`、`resolveRequestedStartView`、`firstThreeStepsDone`、`readStartGuideForActor`、`StepEvents`、`IOrbitLiveShell`：LOW。
- `CommunityCard`：HIGH（调用方 `EventsList`、`StepEvents`）。本 Sprint 只删一个调用方、改注释，不改组件。
- `hasAnyActiveRegistration`、`StartGuide`、`IOrbitShell`：GitNexus 报同名多候选 → **UNKNOWN**；Web 端候选均为 LOW。文本搜索确认：`hasAnyActiveRegistration` 生产调用方只有 `start/page.tsx:92`、`agent/page.tsx:88`；`StartGuide` 只由 `start/page.tsx` 渲染；`IOrbitShell` 只由 `agent/page.tsx` 渲染。
- `AppStartPage`、`AppAgentPage`：UNKNOWN（Next 路由入口，无代码调用方）。

### 前序交接要点
- W0006：第 1–3 步严格顺序、`completedAt` 只写一次并清空 `currentStep`、`?step` 加载不写引导记录；社群加入记录 `communityMembership/current`。
- W0022：`?step=3` 入口（保留）、`?step=4` 与首页第 4 步提醒（本 Sprint 删除）；`guideEnabled` 也决定无计划链接（保留）。
- W0004／W0014：示例期页面提前返回，不读真实数据；开关关闭时零读取。
- W0016／W0018：3001 验收 server `preview_start {name:"orbits-verify"}`，浏览器用 `http://127.0.0.1:3001`；登录态 `node --import tsx scripts/verify-session-cookie.ts <账号>`；恢复数据 `node --import tsx scripts/seed-verify-accounts.ts --reset <账号>`；启动后 `next-env.d.ts` 会被改，不提交。

### 易错边界（都对应到 SC）
- **存量 `currentStep = 4` 不能卡住或报错**：读成 `null`，落到第一个未完成步骤或完成卡片；加载时不发 PATCH；不写迁移脚本、不批量改记录。（SC-02）
- **`completedAt` 语义不变**：仍只在前 3 步完成且未写过时写一次；已完成的人不因本次改动被重写。**示例结束条件不变**：`decideGuideDemo`、`GUIDE_STEP_ORDER` 不动。（SC-01）
- **社群加入记录、报名数据不迁移不删**：不改 `features/community/membership.ts`、`service-factory.ts`、报名存储；只删读取方。（SC-02、SC-04）
- **开关关闭时与现在一致**：`/app/start` 仍重定向 `/app/agent`；首页无计划链接仍是 `/app/agent/strategy`，社群行照旧；首页读取次数不增加（第 4 步读取本来在关闭时就是 0）。（SC-04、SC-05）
- `?step=4` 当非法值忽略：与 `abc`、`9` 同样处理，不报错、不写记录。（SC-01、SC-03）
- 首页的 `guideEnabled`、社群读取不要跟着删（W35-2）。（SC-04）

## 范围与文件

- **修改：**
  - `features/guide/start-steps.ts`、`features/guide/guide-state.ts`（报错文案 1–3）、`features/guide/progress.ts`（删 `eventsDone`、改注释）
  - `app/api/guide/state/route-handler.ts`（报错文案与注释 1–3）
  - `app/(app)/app/start/page.tsx`、`start-guide.tsx`、`start-guide-styles.ts`
  - `app/(app)/app/agent/page.tsx`、`iorbit-0918/iorbit-shell.tsx`、`iorbit-0918/iorbit-home.tsx`、`iorbit-0918/iorbit-home-styles.ts`
  - 只改注释：`features/community/contract.ts`、`app/(app)/app/events/events-0918/community-card.tsx`、`features/events/registration/active-registration.ts`
  - 测试：`tests/services/guide-start.test.ts`、`tests/api/guide-state-routes.test.ts`、`tests/pages/app-start-guide.test.tsx`、`tests/pages/app-start-guide-page.test.tsx`、`tests/pages/app-agent-guide-demo-page.test.tsx`、`tests/pages/app-agent-iorbit-home.test.tsx`；`tests/services/guide-progress*.test.ts` 只在受 `eventsDone` 删除影响时改
- **删除：** `app/(app)/app/start/start-step-events.tsx`。
- **排除：**
  - 首页社群行、「看看推荐 →」、已报名栏其他内容（W0037）；今日要事、活动池（W0036）；月历（W0038）
  - onboarding 药丸与 `intro-draft-service`（W35-1：不改）
  - `active-registration.ts` 的删除（W35-3）、`CommunityCard` 的 `onJoined` prop
  - 数据迁移、付费 AI、部署

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-W0035-01 | 步骤规则只剩 1–3：`GUIDE_START_STEPS` 为 `[1,2,3]`，没有 `"open"` 状态与 `events` 标志；`parseStartStepParam("4")` 与 `"abc"`、`"9"`、数组一样返回 `null`；`resolveRequestedStartView(flags, null, null)` 在前 3 步完成时为 `"finish"`；`decideGuideDemo` 与 `GUIDE_STEP_ORDER` 的既有用例原样通过（示例结束条件不变）；`readStartGuideForActor` 仍只在前 3 步完成且无 `completedAt` 时写一次（既有用例原样通过） | `tests/services/guide-start.test.ts` 改写第 4 步用例（61–137 行一带）并先 RED 后 GREEN；`tests/services/guide-progress.test.ts` 不改即通过 |
| SC-W0035-02 | 数据兼容：存量 payload `currentStep: 4` 经 `stateFrom` 读成 `null`（含「已完成 + 4」与「未完成 + 4」两种）；`GET /api/guide/state` 返回 `currentStep: null`；`PATCH {currentStep: 4}` 返回 400 `VALIDATION_ERROR` 且记录不变；带存量 4 的人打开引导页：未完成时停在第一个未完成步骤、已完成时显示完成卡片，加载不产生 PATCH、不抛错；本 Sprint diff 不含任何对社群加入记录或报名存储的写入／删除代码 | `tests/services/guide-start.test.ts`（引导记录段 173–240 行一带新增存量用例）、`tests/api/guide-state-routes.test.ts`（234–235 行改为 PATCH 4 → 400，另取 1–3 做双端同步）、`tests/pages/app-start-guide.test.tsx`（`snapshot.currentStep` 由服务端已映射为 `null` 的两种进度）；REPORT 附 `git diff --stat` 说明 community／registration 存储文件未改 |
| SC-W0035-03 | 引导页按 3 步显示：步骤条 3 格（`.sg-steps` 3 列）、手机进度线 3 段、「引导 · 第 n 步 / 共 3 步」、标题与完成卡片不再提第 4 步、没有「做第 4 步」「先看活动 →」；`/app/start` 服务端不再调用 `readCommunityJoinedForActor`、公开目录和 `hasAnyActiveRegistration`（开关打开时 0 次）；`?step=4` 到达壳时为 `requestedStep: null`；开关关闭时带不带 `?step` 都重定向 `/app/agent` 且零读取 | `tests/pages/app-start-guide.test.tsx`（203–300、534 行一带的第 4 步用例改写或删除）、`tests/pages/app-start-guide-page.test.tsx`（159–265 行一带：读取计数、`?step=4` 被丢弃） |
| SC-W0035-04 | 首页不再有第 4 步提醒：任何状态下都没有 `data-orbit-iorbit-guide-step4`；`AppAgentPage` 在开关打开（未加入社群、无报名）、开关关闭、示例期三种情况下 `hasAnyActiveRegistration` 都是 0 次；`IOrbitShell`／`IOrbitHome` 不再有 `guideStep4Pending`；无计划链接（开关开 `/app/start?step=3`、关 `/app/agent/strategy`）、社群行（加入／未加入两态）、「看看推荐 →」、`readCommunityJoinedForActor` 1 次与改动前一致 | `tests/pages/app-agent-guide-demo-page.test.tsx`（534–590 行一带改为 0 次断言）、`tests/pages/app-agent-iorbit-home.test.tsx`（2282–2340 行一带：提醒用例改为「不出现」，第 3 步入口用例保留；复用 `mountHome`） |
| SC-W0035-05 | 回归与真实页面：措辞扫描 `rg -n '第 4 步|step=4|guideStep4|Step 4|共 4 步|4 步，' app features shared`（cwd `repos/orbits`）只剩 W35-1 允许的两处、且只有这两行：`app/(app)/app/profile/onboarding-0918/onboarding-flow.tsx:620`（「第 4 步后」药丸）与 `features/profile/intro-draft-service.ts:22`（「新用户引导第 4 步」注释）；行号以 `08fe51db` 为准，本 Sprint 不改这两个文件，行号应不变，若变了在 REPORT 说明原因；3001 上 `verify-new`（3 步、`?step=4` 被忽略）、`verify-plan`（首页无提醒、社群行在）各在 1440 与 375 截图，存量 4 样本：**开工前**在旧代码的 3001 上用 `verify-new` 点第 4 步（未完成 + 4）、用 `verify-plan` 在完成卡片点「做第 4 步」（已完成 + 4）各写入一次，改动后再打开 `/app/start`，分别停在第 1 步与完成卡片、控制台 0 错误，之后两个账号 `--reset` 恢复；3000（开关关闭）首页链接与栏目和改动前一致；受影响测试文件全部通过；`npx tsc --noEmit -p .` 通过；一次全量基线对照没有新增失败；Codex 代码 review 一次 | 截图与控制台记录（证据目录）、`rg` 扫描原样输出（只含上述两行）、定向集、tsc、RULES §5.2 全量对照、`codex review` 全文 |

## 一次 Generator 的执行顺序

1. 复核进入条件（W35-1～3 已由 D38 决定），保存基线与 Planner 哈希，保留用户未提交文件。对上表符号跑 upstream impact，HIGH／CRITICAL／UNKNOWN 登记进 REPORT。**改代码前**先在 3001 造好 SC-05 的两个存量 4 样本（改动后 PATCH 4 会被拒，届时无法再造）。
2. RED：`guide-start`（规则 + 存量 4）、`guide-state-routes`（PATCH 4 → 400）、引导页两份测试、首页两份测试。
3. 实现顺序：`start-steps.ts` 收窄 → 引导记录与路由文案 → `progress.ts` → 引导页（含删 `start-step-events.tsx` 与样式）→ 首页提醒与 `agent/page.tsx` 读取 → 注释措辞。
4. 一条操作链提交；提交前跑暂存区 `detect-changes`（`partial`／`truncated` 重跑）。
5. 3001 浏览器验证（含存量 4 的手动样本）、3000 查开关关闭；全量对照；一次 Codex 代码 review，同一 Generator 修。写 REPORT，交接分支 `sprint/W0035-guide-three-steps` 与固定 SHA。

## 最小测试与检查

- **档位：H（登记表已由 L 改为 H）。** 依据 W0022 先例与 RULES §5.1：`IOrbitHome` 为 CRITICAL，`startStepStatus`／`canOpenStartStep`／`startStepDone`／`deriveStartGuideFlags`／`resolveStartView` 为 HIGH；且 `isGuideStartStep` 收窄改变了**引导记录的存量解析与 PATCH 写入校验**（RULES 列为 H 的「写入／共享契约」）。改动本身是删除为主、可逆，但不降级。
- **开发定向集（cwd `/Users/li/work/orbit/repos/orbits`）：**
  - `tests/services/guide-start.test.ts`（规则、引导记录存量）
  - `tests/api/guide-state-routes.test.ts`（PATCH 校验、双端同步）
  - `tests/pages/app-start-guide.test.tsx`、`tests/pages/app-start-guide-page.test.tsx`（引导页 UI、服务端读取计数）
  - `tests/pages/app-agent-guide-demo-page.test.tsx`、`tests/pages/app-agent-iorbit-home.test.tsx`（首页读取计数、提醒消失、社群行与无计划链接不变）
- **操作链收口集：** 上述完整文件 + `tests/services/guide-progress.test.ts`、`tests/pages/app-events-community-card.test.tsx`、`tests/services/active-registration.test.ts`（仅确认注释改动无影响）；按钮／样式 ratchet 类 UI 测试若计数到 `start-guide-styles.ts`／`iorbit-home-styles.ts` 一并跑；`npx tsc --noEmit -p .`。
- **集成：** 一次全量基线对照（RULES §5.2，不 source `.env`）。
- **浏览器：** 3001（`verify-new`、`verify-plan`、存量 4 样本）桌面与手机各一次；3000 查开关关闭。证据放 `~/orbit-sprint-evidence/web/sprint-W0035/run-01/`。
- **不运行：** 付费 AI、Preview、PG 差分。

## 失败与交接

REPORT 必须写：W35-1 的核对结论（D38：不改）、W35-2／W35-3 的处理（社群行与「看看推荐 →」留给 W0037，`active-registration.ts` 删否交 W0036）、存量 4 的验证方式与截图路径、首页与引导页实测读取次数。若 Generator 发现必须删除社群行才能通过某项测试，停下说明，不自行扩到 RH-04。

## 修订记录

| review 意见（[REVIEW-2026-10-01](../REVIEW-2026-10-01.md)） | 处理 |
| --- | --- |
| P3-01（扫描命令未用 `rg`） | 接受。SC-05 改为 `rg -n '第 4 步|step=4|guideStep4|Step 4|共 4 步|4 步，' app features shared`，并列出允许残留的精确位置：`onboarding-flow.tsx:620`、`intro-draft-service.ts:22`。另：按 `08fe51db` 实跑核对，revision 2 写的「无关的 `sync-revision-migration.ts`」在 `app`／`features`／`shared` 下并不命中，已删去 |
| P1-01～P1-04、P2-01～P2-05 | 不涉及本 Sprint |
