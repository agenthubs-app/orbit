# Sprint W0022 — 老用户首页引导入口与策略页

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** RW-04（第 4 步以提醒形式留在 iOrbit；D2 老用户只提示去做第 3 步）、RW-01（「我该先联系谁」「帮我制定推进计划」放在本周推进栏底部，数据全部真实）、RW-07（推荐理由如实）、RW-08、RW-10（无计划时引导去第 3 步）。来源是 W0018 REPORT 的交接。
**单一目标:** 首页「帮我制定推进计划」改去引导第 3 步；第 4 步未完成时首页留提醒；「先联系谁」恢复成真实数据；推荐理由可以在页面上复验。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 开工时的 `chat-agent` HEAD（编制时是 `23563a57`）。
**进入条件:**
- W0018 已完成（已满足）。
- 用户已回答下面的 W22-1～W22-4，或明确接受推荐默认。
- 不需要云端授权，不调用付费 AI。

## 已查清的事实（编制时核对）

1. **链接。** `iorbit-home.tsx:1377` 在无计划分支里写死了 `href="/app/agent/strategy"`。
   - 计划页无计划时已经有同口径的处理：`plan-route-view-model.ts:417`，开关打开时去 `/app/start`，关闭时回 `/app/agent`。
   - `/app/start` 开关关闭时重定向到 `/app/agent`（`start/page.tsx`），所以开关关闭时链接不能指向它。
   - D2 老用户进 `/app/start`，由 `resolveStartView` 落到第 3 步。但如果引导记录里 `currentStep` 已经是 4，就会停在第 4 步。所以需要 `?step=3`。
2. **「来源暂时不可用」。**
   - 策略页 `whoFirstState` 为 `unavailable`，是因为 `facts.followups.state === "unavailable"`；快照本身读到了，「下一步去哪」显示的是 no_match。
   - 跟进读取走 `loadBoundedFollowups` → `createLifecycleHomeSummaryReader().read()` → `assertLifecycleNodeSortRuntime()`（`features/followups/storage/lifecycle-task-pages.ts:175`）。
   - 这个断言只放行 `node 25.6.0 / icu 78.2 / unicode 17.0`。本机是 `26.10.0 / 78.3 / 17.0`，所以抛 `LIFECYCLE_SORT_RUNTIME_UNVERIFIED`，被吞掉后变成 unavailable。
   - 本机 PG 元组符合 zod 的字面量要求：`pg 160012`、`collversion 153.136`。
   - 这个白名单来自 `e08a0806`，按 `docs/operations/2026-09-25-bounded-read-v2-execution.md` 第 68、136 行，它是「经等价测试的运行时白名单、其他组合 fail-closed、生产组合未验证即发布门」。
   - 同一断言还影响 `/app/tasks` 的跟进分页（`lifecycle-pages-route-service.ts`）和 `features/connections/lifecycle/task-page.ts`。
   - `e08a0806` 在 chat-agent 上、不在 main 上。
3. **首页的「部分来源不可用」判断漏了跟进来源。** `iorbit-home.tsx:866` 的 `partial` 只看 snapshot、signals 和待确认名片，不看 `facts.followups.state`。跟进来源失败时，首页仍会说「今天没有必须处理的事」。
4. **推荐理由在现有数据下为空，原因有两个：**
   - 推荐排除本人已报名的活动（`public-goal-recommendations.ts` 约第 305–316 行），而种子里的活动都被本人报了名。
   - `tokensFor`（`event-recommendation-tool.ts:133`）只按非字母数字切分。中文目标会被切成整段，比如「位做跨境支付的产品负责人」；长度 ≥2 的数字（如「10」）也会成为词。

## 等待用户决定（未回答不启动）

| 编号 | 问题 | 推荐默认 |
| --- | --- | --- |
| W22-1 | 第 4 步提醒的位置、样式、是否可关闭、对谁显示 | 放在「已报名活动」栏首（社群行之上）一行文字，链接到 `/app/start?step=4`，不可关闭，完成即消失。显示条件：开关打开、不在示例期、已有生效计划（前 3 步完成；D2 老用户也算）、第 4 步未完成。无计划时只显示第 3 步入口，不同时出两个引导提示 |
| W22-2 | 是否在本 Sprint 把排序运行时从单一组合改成白名单，并加入本机组合 | 纳入。本机组合经现有 PG 差分测试通过后才加入；生产组合（Vercel Node 版本 + Neon PG／排序规则版本）列为 W0019 发布门，本 Sprint 不声称生产可用。同时修正第 3 条：跟进来源不可用时首页不下确定结论 |
| W22-3 | 中文目标分词让推荐理由几乎匹配不到，是否改算法 | 本 Sprint 不改算法。种子按现有算法造出真实可匹配的活动文字，复验页面；分词改进（中文切词、去掉纯数字词）登记为新 Sprint 候选 |
| W22-4 | 对话页快捷入口（`iorbit-chat.tsx:127`）和策略页底部药丸是否一起改去第 3 步 | 本 Sprint 不改，只改 W0018 发现的首页入口，其余登记为观察项 |

开关关闭时链接保持 `/app/agent/strategy`：依据 D1（开关关闭时与改版前一致）、W0018 场景 10、以及计划页 `guideEnabled` 的既有口径。这一项不需要决定。策略页不退役：依据 RW-01（「我该先联系谁」入口保留在本周推进栏底部）和 RW-07（推荐理由显示在策略页「下一步去哪」）。

## 上下文包（Generator 从这里起步，不通读其他 REPORT）

### 必读文件
- `app/(app)/app/agent/iorbit-0918/iorbit-home.tsx`
  - 第 1334–1379 行：无计划分支和两个链接。
  - 第 1382 行起：「已报名活动」栏和社群行。
  - 第 866 行：`partial`。
  - 第 99 行：`IOrbitHomeProps`。
- `app/(app)/app/agent/iorbit-0918/iorbit-shell.tsx`：第 82 行 `IOrbitShellProps`（已有 `communityJoined`），第 498 行把 props 传给 `IOrbitHome`。
- `app/(app)/app/agent/page.tsx`
  - 第 185 行 `readDemoModeViewForActor`（示例判定）。
  - 第 200–229 行：报名读取（已按 `actorId`）和 `readCommunityJoinedForActor`。
- `shared/config/guide-demo.ts:20`：`readGuideDemoConfig(env)`，只读环境变量，没有数据库读取。
- `features/guide/start-steps.ts`：第 97 行 `canOpenStartStep(flags, step)`，第 108 行 `resolveStartView(flags, recorded)`，`isGuideStartStep`。
- `app/(app)/app/start/page.tsx`（`AppStartPage`，目前不接 `searchParams`）；`app/(app)/app/start/start-guide.tsx:231`，初始 `view` 由 `resolveStartView` 决定。
- `features/events/registration/active-registration.ts:87`：`hasAnyActiveRegistration(actorId): Promise<boolean>`，1～3 条小查询。
- `features/followups/storage/lifecycle-task-pages.ts:174–177`：`lifecycleSortRuntimeSchema`、`assertLifecycleNodeSortRuntime()`；`features/followups/storage/lifecycle-home-summary.ts:64–75`。
- `app/(app)/app/agent/home-facts-route-service.ts:814–870`：`loadFollowups` / `loadBoundedFollowups`。
- `app/(app)/app/agent/strategy/strategy-route-view-model.ts`（`whoFirstState`）；`app/(app)/app/agent/iorbit-0918/iorbit-strategy.tsx:124–150` 和 `:265`（理由文案）；`app/(app)/app/agent/plan/plan-route-view-model.ts:628`（`planEventReasons`）。
- `features/events/public-goal-recommendations.ts`（排除已报名、最多 3 场）；`features/events/event-recommendation-tool.ts:133–181`（`tokensFor` / `matchedTokensForText`）。
- `scripts/seed-verify-accounts.ts`：第 460–600 行 `seedEvent`（活动 + 报名），第 617 行 `seedPlanInProgress`，第 912 行 `seedAccount`，`--reset` 与指纹检查。新活动 id 必须以 `orbit-verify-` 开头，并登记在对应账号的 `eventIds` 里，reset 才能清理。
- `docs/operations/2026-09-25-bounded-read-v2-execution.md` 第 60–70 行、第 130–140 行：运行时白名单的原始约定。

### 关键符号与影响等级（GitNexus，索引 `6c6916a`）
- `IOrbitHome`：HIGH。直接调用方是 `IOrbitLiveShell`、`IOrbitDemoBody`（经 `IOrbitShell` → `AppAgentPage`）。示例壳也渲染它，新增 props 必须有安全默认值。
- `resolveStartView`：LOW，直接调用方 1 个（`StartGuide`）。
- `assertLifecycleNodeSortRuntime`：LOW，3 个直接调用方（三个 `read`）。但它是跨 `/app/tasks`、首页、联系人详情的共享契约，按 H 处理。
- `AppAgentPage`、`AppStartPage`：UNKNOWN（路由入口，无代码调用方）。
- `seedAccount`：LOW。
- `hasAnyActiveRegistration`：UNKNOWN（进程轴 LOW，直接调用方为 `/app/start`）。

### 前序交接要点
- W0003：社群状态由服务端读，`communityJoined` 从首帧就正确；社群不是活动（D6）。
- W0006：第 4 步完成 = 报名过任意活动（`hasAnyActiveRegistration`，按 actor id）或有社群加入记录；第 1–3 步严格顺序。
- W0016／W0018：3001 验收 server 用 `preview_start {name:"orbits-verify"}`，浏览器用 `http://127.0.0.1:3001`，登录态用 `scripts/verify-session-cookie.ts`。启动后 `next-env.d.ts` 会被改，不要提交。`seed-verify-accounts.ts --reset <账号>` 用于恢复数据。
- W0021：首页 `plans/current` 每次冷启动最多请求 1 次。本 Sprint 不新增客户端请求。
- W0018 已把 `/app/agent` 的报名读取改为按 `actorId`。

### 易错边界（都对应到 SC）
- 开关关闭时，首页链接、提醒、读取次数与现在完全一样：不读 `hasAnyActiveRegistration`，不出现提醒，链接仍是 `/app/agent/strategy`。
- `?step=N` 不能绕过硬顺序：步骤锁着时忽略参数，走原有 `resolveStartView`。非法值忽略。GET 加载不写引导记录。
- 示例期（`guide` 非空）不渲染提醒和新链接，也不做新读取（W0004 SC：示例期不发真实请求）。
- 提醒的读取失败时不显示提醒，也不显示「已完成」。不能因为读不到而误导用户。
- 运行时白名单只加入经差分测试证明结果一致的组合；其他组合仍然 fail-closed。生产组合不在本 Sprint 加入，也不能写「生产可用」。
- 种子只写 `verify-*` 数据；`--reset` 两次结果一致；非 verify 行的指纹前后一致。不改现有账号的目标文字（W0018 的场景依赖它们）。

## 范围与文件

- **修改：**
  - `iorbit-home.tsx`、`iorbit-shell.tsx`（新增可选 props：`guideEnabled`、`guideStep4Pending`，或等价命名）
  - `app/(app)/app/agent/page.tsx`（服务端判定第 4 步）
  - `features/guide/start-steps.ts`、`app/(app)/app/start/page.tsx`、`start-guide.tsx`（接受 `?step`）
  - `features/followups/storage/lifecycle-task-pages.ts`（单一组合改为白名单；W22-2 采纳时）
  - `scripts/seed-verify-accounts.ts`（推荐理由用的活动与计划条目）
  - 对应测试
- **新建：** 必要测试。
- **排除：**
  - 分词算法（W22-3）
  - 对话页和策略页的其他入口（W22-4）
  - 策略页「等 W4」的空态
  - 生产运行时白名单
  - 付费 AI、部署、迁移

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-W0022-01 | 首页无计划分支的「帮我制定推进计划 →」：开关打开时是 `/app/start?step=3`，关闭时是 `/app/agent/strategy`；「我该先联系谁 →」不变。`/app/start?step=3` 在第 3 步可打开时（含 D2 老用户、前 2 步已完成、`currentStep` 记录为 4）直接显示第 3 步；第 3 步锁着时（前 2 步未完成）按原逻辑显示第一个未完成步骤，不解锁；`?step=abc`、`?step=9` 被忽略；带参加载不产生 `PATCH /api/guide/state` | 首页组件测试（复用 `tests/pages/app-agent-iorbit-home.test.tsx` 的 `mountHome`）、`tests/services/guide-start.test.ts`、`tests/pages/app-start-guide-page.test.tsx` / `app-start-guide.test.tsx` |
| SC-W0022-02 | 第 4 步提醒（按 W22-1 的决定）：开关打开、不在示例期、有生效计划、未加入社群、没有任何报名时显示，链接到 `/app/start?step=4`；已加入社群、或首页活动里已有报名、或 `hasAnyActiveRegistration` 为真时不显示；开关关闭、示例期、无计划时不显示；读取失败时不显示。读取：开关关闭时新增 0 次；已加入社群或首页活动已有报名时新增 0 次；其余情况最多 1 次 `hasAnyActiveRegistration`。按 W0017 口径，1000 人每月新增 ≤30 MB，实测写进 REPORT | 页面测试（沿用 `app-agent-guide-demo-page.test.tsx` 的 require.cache 替换，计数读取调用）+ 首页组件测试 + 测量（语句数和返回字节） |
| SC-W0022-03 | 按 W22-2 的决定：本机组合 `node 26.10.0 / icu 78.3 / unicode 17.0` 在 `tests/services/lifecycle-task-pages-postgres.test.ts` 全部差分用例通过后才加入白名单（`ORBIT_LIFECYCLE_TEST_DATABASE_URL` 指向本机 `orbit_neon_audit_20260925`，0 skip）；不在白名单的组合仍抛 `LIFECYCLE_SORT_RUNTIME_UNVERIFIED`（单测）；3001 上 verify-legacy 的策略页「先联系谁」显示真实列表，或「当前没有待推进的联系人机会」；首页在 `facts.followups.state === "unavailable"` 时不显示「今天没有必须处理的事」。W22-2 未采纳时，本项只剩首页的 `partial` 修正，另在 REPORT 写明原因和发布门 | PG 差分测试 + 单测 + 首页组件测试 + 3001 页面截图 |
| SC-W0022-04 | 推荐理由可复验：种子新增未开始、已发布、目标账号未报名的验收活动，活动文字按现有 `tokensFor` 真实包含该账号目标里的一个词；verify-plan 的计划里挂一条状态为 recommended 的该活动条目。之后 3001 策略页「下一步去哪」上，一个账号显示「匹配你的目标：『…』」，verify-plan 显示「对应你计划第 n 阶段：…」。`--reset` 连续两次结果一致，非 verify 行指纹不变，W0018 各场景用到的数据不被破坏（变化逐项写进 REPORT） | 种子脚本运行输出 + 数据库读回 + 3001 截图（桌面 1440、手机 375） |
| SC-W0022-05 | 回归：3000（开关关闭）的首页链接和栏目与改动前一致，控制台 0 错误；受影响测试文件全部通过；typecheck 通过；一次全量基线对照没有新增失败 | 定向集、`npx tsc --noEmit -p .`、RULES §5.2 全量对照、浏览器截图 |

## 一次 Generator 的执行顺序

1. 复核进入条件：W22-1～4 的答复写进 REPORT。保存基线和 Planner 哈希，保留用户未提交的文件。刷新 GitNexus 索引后，对 `IOrbitHome`、`resolveStartView`、`assertLifecycleNodeSortRuntime`、`AppAgentPage` 做 upstream impact。
2. 先写 RED：首页链接和提醒、`?step`、白名单拒绝与放行、首页 `partial`。
3. 实现：链接和 `?step` → 服务端第 4 步判定与提醒 → 白名单（先跑差分测试，通过后再加组合）→ 种子。
4. 第一条操作链（入口 + 提醒）先提交；第二条（「先联系谁」 + `partial`）和第三条（种子 + 推荐理由）各自提交。提交前都跑暂存区的 `detect-changes`。
5. 在 3001 做浏览器验证，在 3000 查开关关闭时的样子。写 REPORT，交接分支和固定 SHA。

## 最小测试与检查

- **档位：H。** 理由：`IOrbitHome` 影响等级 HIGH，运行时白名单是跨页面的共享契约。收口做一次 Codex 代码 review。
- **开发定向集：**
  - `tests/pages/app-agent-iorbit-home.test.tsx`
  - `tests/pages/app-agent-guide-demo-page.test.tsx`
  - `tests/services/guide-start.test.ts`
  - `tests/pages/app-start-guide-page.test.tsx`、`tests/pages/app-start-guide.test.tsx`
  - `tests/pages/app-agent-strategy-route-view-model.test.ts`
  - `tests/pages/app-home-facts-followup-reader.test.ts`、`tests/pages/app-agent-home-dashboard-entry.test.ts`
  - `tests/services/lifecycle-task-pages-postgres.test.ts`：先 `node scripts/assert-local-test-databases.mjs`，再显式导出 `ORBIT_LIFECYCLE_TEST_DATABASE_URL`，库名必须是 `orbit_neon_audit_20260925`，用户名和密码取自本机 `ORBIT_EVENT_DATABASE_URL`，不要 source `.env`。
- **收口：** typecheck；一次全量基线对照。白名单改动后，旧基线里因运行时不符而失败的用例可能变绿，要在 REPORT 里单列。
- **浏览器：** 3001 用 verify-legacy（入口、第 3 步、「先联系谁」）、verify-plan（提醒、计划理由）、目标可匹配的那个账号（目标词理由），桌面和手机各一次；3000 查开关关闭。
- **不运行：** 付费 AI、Preview。

## 失败与交接

REPORT 必须写：
- W22-1～4 的答复；
- 白名单加入的组合和差分测试结果；
- 给 W0019 的发布门：生产 Node/ICU 与 Neon PG／排序规则版本要先验证。没验证就部署 chat-agent 的话，「先联系谁」、`/app/tasks` 跟进分页、首页跟进补位在生产都会不可用；
- 提醒的实测读取字节；
- 种子数据变化；
- 分词问题、其他入口两个观察项。
