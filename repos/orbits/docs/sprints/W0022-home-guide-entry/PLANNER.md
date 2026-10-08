# Sprint W0022 — 老用户首页引导入口与第 4 步提醒

**Plan revision:** 2。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** RW-04（第 4 步以提醒形式留在 iOrbit；D2 老用户只提示去做第 3 步）、RW-10（无计划时引导去第 3 步）。来源是 W0018 REPORT 的交接。
**单一目标:** 首页「帮我制定推进计划 →」在开关打开时改去 `/app/start?step=3`；`/app/start` 接受 `?step` 但不绕过硬顺序；第 4 步未完成时首页「已报名活动」栏首留一行提醒。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 开工时的 `chat-agent` HEAD（revision 2 编制时是 `1d41bdfc`）。
**进入条件:**
- W0018 已完成（已满足）。
- W22-1～W22-4 已由用户于 2026-09-29 决定按 revision 1 的推荐默认（见下表「已定决定」）。
- 不需要云端授权，不调用付费 AI。

## 已查清的事实（revision 2 按源码复核）

1. **链接。** `app/(app)/app/agent/iorbit-0918/iorbit-home.tsx:1377` 在无计划分支里写死 `href="/app/agent/strategy"`；第 1374 行「我该先联系谁 →」是 `/app/agent/strategy?view=contacts`，不改。
   - 计划页无计划时已经有同口径的处理：`plan-route-view-model.ts:417`，开关打开时去 `/app/start`，关闭时回 `/app/agent`。
   - `/app/start` 开关关闭时重定向到 `/app/agent`（`app/(app)/app/start/page.tsx:96`），所以开关关闭时链接不能指向它。
   - D2 老用户进 `/app/start`，由 `resolveStartView`（`features/guide/start-steps.ts:108`）落到第 3 步；但引导记录里 `currentStep` 已是 4 时会停在第 4 步，所以需要 `?step=3`。
   - `AppStartPage`（`start/page.tsx:95`）目前不接 `searchParams`；`start-guide.tsx:231` 用 `resolveStartView(flags, snapshot.currentStep)` 决定初始步骤；引导记录写入是客户端 `PATCH /api/guide/state`（`start-guide.tsx:43、66–72`）。
2. **第 4 步判定所需数据。** `/app/start` 已用 `hasAnyActiveRegistration`（`features/events/registration/active-registration.ts:87`）和 `readCommunityJoinedForActor` 判定第 4 步。`/app/agent/page.tsx` 已在服务端读社群状态（第 244 行 `readCommunityJoinedForActor({ actorId })`）和首页活动的报名（第 220–241 行：`resolveConfiguredActorEventCanonicalIds` → `readRuntimeEventRegistrationStates({ userId: actorId })`），都按 `actorId`（W0018）。
3. **「有生效计划」。** 首页的计划由客户端 `plans/current` 读取（W0021：冷启动最多 1 次），服务端 `page.tsx` 只在 `?plan=` 时读计划卡（第 246 行）。所以服务端只判定「第 4 步未完成」，「有生效计划」沿用首页已有的计划读取结果，不新增请求。

## 已定决定（用户 2026-09-29：按 revision 1 推荐默认）

| 编号 | 决定 |
| --- | --- |
| W22-1 | 提醒放在「已报名活动」栏首（社群行之上）一行文字，链接 `/app/start?step=4`，不可关闭，完成即消失。显示条件：开关打开、不在示例期、已有生效计划（D2 老用户也算）、第 4 步未完成。无计划时只显示第 3 步入口，不同时出两个引导提示 |
| W22-2 | 纳入，但拆到 **W0025**（排序运行时白名单 + 首页 `partial` 修正），本 Sprint 不碰 |
| W22-3 | 不改分词算法；推荐理由验收数据拆到 **W0026** |
| W22-4 | 对话页快捷入口（`iorbit-chat.tsx:127`）和策略页底部药丸不改，登记为观察项 |

开关关闭时链接保持 `/app/agent/strategy`：依据 D1（开关关闭时与改版前一致）、W0018 场景 10、计划页 `guideEnabled` 的既有口径。

## 上下文包（Generator 从这里起步，不通读其他 REPORT）

### 必读文件
- `app/(app)/app/agent/iorbit-0918/iorbit-home.tsx`
  - 第 99 行 `IOrbitHomeProps`（已有 `communityJoined?: boolean`），第 235 行 `IOrbitHome`，第 317 行示例数据覆盖 `communityJoined`。
  - 第 1334–1379 行：无计划分支和两个链接（1374、1377）。
  - 第 1382 行起：「已报名活动」栏，第 1390 行社群行 `data-orbit-iorbit-community`。
- `app/(app)/app/agent/iorbit-0918/iorbit-shell.tsx`：第 82 行 `IOrbitShellProps`，第 195 行、第 498 行两处渲染 `IOrbitHome`（示例壳与真实壳）。
- `app/(app)/app/agent/page.tsx`（308 行）
  - 第 166 行 `const actorId = actor.id`；第 184–185 行 `readDemoModeViewForActor({ actorId, userId: session.user.id }, …)`（示例判定）。
  - 第 220–241 行报名读取（`resolveConfiguredActorEventCanonicalIds({ actorId, eventIds })`、`readRuntimeEventRegistrationStates({ eventIds, userId: actorId })`）；第 244 行 `readCommunityJoinedForActor({ actorId })`。
- `shared/config/guide-demo.ts:20`：`readGuideDemoConfig(env)`，只读环境变量，没有数据库读取。
- `features/guide/start-steps.ts`：第 19 行 `isGuideStartStep(value)`，第 97 行 `canOpenStartStep(flags, step): boolean`，第 108 行 `resolveStartView(flags, recorded): StartView`。
- `app/(app)/app/start/page.tsx`：第 95 行 `AppStartPage()`（第 99 行未登录重定向 `next=%2Fapp%2Fstart`）；`app/(app)/app/start/start-guide.tsx:231`。
- `features/events/registration/active-registration.ts:87`：`hasAnyActiveRegistration(actorId: string): Promise<boolean>`，1～3 条小查询。

### 关键符号与影响等级（GitNexus，2026-09-29 刷新到 `1d41bdf`）
- `IOrbitHome`：**CRITICAL**（partial；直接调用方 3 个：`IOrbitLiveShell`、`IOrbitDemoBody` 等，经 `IOrbitShell` → `AppAgentPage`）。深度 2 起的数千个受影响节点来自通用方法名的扇出，但按 CLAUDE.md 不降级：新增 props 必须可选、默认值保持现状，示例壳不传即不变。
- `resolveStartView`：**CRITICAL**（partial；直接调用方 2 个，含 `StartGuide`）。本 Sprint 不改它的签名和语义；`?step` 用新的小函数在它之前处理（或等价方式），旧行为由原有用例守住。
- `AppAgentPage`、`AppStartPage`：UNKNOWN（路由入口，无代码调用方；文本搜索确认只由 Next 路由加载）。
- `hasAnyActiveRegistration`：UNKNOWN（直接调用方为 `/app/start`）。只调用，不改。

### 前序交接要点
- W0003：社群状态由服务端读，`communityJoined` 从首帧就正确；社群不是活动（D6）。
- W0006：第 4 步完成 = 报名过任意活动（`hasAnyActiveRegistration`，按 actor id）或有社群加入记录；第 1–3 步严格顺序。
- W0016／W0018：3001 验收 server 用 `preview_start {name:"orbits-verify"}`，浏览器用 `http://127.0.0.1:3001`，登录态用 `scripts/verify-session-cookie.ts`；启动后 `next-env.d.ts` 会被改，不要提交；`scripts/seed-verify-accounts.ts --reset <账号>` 恢复数据。
- W0021：首页 `plans/current` 每次冷启动最多请求 1 次。本 Sprint 不新增客户端请求。

### 易错边界（都对应到 SC）
- 开关关闭时，首页链接、栏目、读取次数与现在完全一样：不调 `hasAnyActiveRegistration`，不出现提醒，链接仍是 `/app/agent/strategy`。（SC-01、SC-02、SC-03）
- `?step=N` 不能绕过硬顺序：步骤锁着时忽略参数，走原有 `resolveStartView`；非法值（`abc`、`9`、数组）忽略；GET 加载不写引导记录（不发 `PATCH /api/guide/state`）。（SC-01）
- 示例期（`guide` 非空）不渲染提醒和新链接，也不做新读取（W0004：示例期不发真实请求）。（SC-02）
- 提醒的读取失败时不显示提醒，也不显示「已完成」。（SC-02）
- 已加入社群、或首页活动里已有报名时，直接判定第 4 步完成，不再调 `hasAnyActiveRegistration`。（SC-02）

## 范围与文件

- **修改：**
  - `iorbit-home.tsx`、`iorbit-shell.tsx`（新增可选 props，例如 `guideEnabled`、`guideStep4Pending`；默认值保持现状）
  - `app/(app)/app/agent/page.tsx`（服务端判定第 4 步未完成）
  - `features/guide/start-steps.ts`、`app/(app)/app/start/page.tsx`、`app/(app)/app/start/start-guide.tsx`（接受 `?step`）
  - 对应测试
- **新建：** 必要测试（优先加到现有文件）。
- **排除：**
  - 排序运行时白名单、「先联系谁」、首页 `partial`（W0025）
  - 推荐理由种子（W0026）、分词算法
  - 对话页和策略页的其他入口（W22-4）
  - 策略页「等 W4」的空态
  - 付费 AI、部署、迁移

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-W0022-01 | 首页无计划分支「帮我制定推进计划 →」：开关打开时是 `/app/start?step=3`，关闭时是 `/app/agent/strategy`；「我该先联系谁 →」不变。`/app/start?step=3` 在第 3 步可打开时（含 D2 老用户、前 2 步已完成、`currentStep` 记录为 4）直接显示第 3 步；第 3 步锁着时（前 2 步未完成）按原逻辑显示第一个未完成步骤，不解锁；`?step=4` 同理；`?step=abc`、`?step=9`、重复参数被忽略；带参加载不产生 `PATCH /api/guide/state` | 首页组件测试（复用 `tests/pages/app-agent-iorbit-home.test.tsx` 的 `mountHome`）、`tests/services/guide-start.test.ts`、`tests/pages/app-start-guide-page.test.tsx`、`tests/pages/app-start-guide.test.tsx`，先 RED 后 GREEN |
| SC-W0022-02 | 第 4 步提醒（W22-1）：开关打开、不在示例期、有生效计划、未加入社群、没有任何报名时显示，链接 `/app/start?step=4`；已加入社群、或首页活动已有报名、或 `hasAnyActiveRegistration` 为真时不显示；开关关闭、示例期、无计划时不显示（无计划时只有第 3 步入口）；读取失败时不显示。读取计数：开关关闭／示例期新增 0 次；已加入社群或首页活动已有报名时新增 0 次；其余情况最多 1 次 `hasAnyActiveRegistration`。按 W0017 口径实测返回字节，1000 人每月新增 ≤30 MB（假设每人每天打开首页 4 次），写进 REPORT | 页面测试（沿用 `tests/pages/app-agent-guide-demo-page.test.tsx` 的 require.cache 替换，计数调用次数与参数）+ 首页组件测试 + 本机测量（语句数、返回字节） |
| SC-W0022-03 | 回归与真实页面：3001 上 verify-legacy 走「首页入口 → 第 3 步 → 生成计划（mock）→ 回首页看到提醒 → 点提醒到第 4 步」，桌面 1440、手机 375 各一次，控制台 0 错误，之后 `--reset verify-legacy` 恢复；3000（开关关闭）首页链接与栏目和改动前一致；受影响测试文件全部通过；`npx tsc --noEmit -p .` 通过；一次全量基线对照没有新增失败 | 截图、定向集、tsc、RULES §5.2 全量对照 |

## 一次 Generator 的执行顺序

1. 复核进入条件，保存基线和 Planner 哈希，保留用户未提交的文件。对 `IOrbitHome`、`resolveStartView`、`canOpenStartStep`、`AppAgentPage`、`AppStartPage` 做 upstream impact（CRITICAL 先在 REPORT 登记，不降级）。
2. 先写 RED：首页链接（开关开／关）、`?step` 的放行与拒绝、提醒出现／消失／读取计数。
3. 实现：`?step` → 首页链接 → 服务端第 4 步判定与提醒。
4. 一条操作链提交；提交前跑暂存区 `detect-changes`。
5. 3001 浏览器验证，3000 查开关关闭。一次 Codex 代码 review，同一 Generator 修复。写 REPORT，交接分支和固定 SHA。

## 最小测试与检查

- **档位：H。** 理由：`IOrbitHome`、`resolveStartView` 在刷新后的图谱里是 CRITICAL；首页是共享入口。收口做一次 Codex 代码 review。
- **开发定向集（cwd `/Users/li/work/orbit/repos/orbits`）：**
  - `tests/pages/app-agent-iorbit-home.test.tsx`（链接、提醒渲染）
  - `tests/pages/app-agent-guide-demo-page.test.tsx`（示例期 0 读取、读取计数）
  - `tests/services/guide-start.test.ts`（`?step` 纯函数）
  - `tests/pages/app-start-guide-page.test.tsx`、`tests/pages/app-start-guide.test.tsx`（页面接参、不发 PATCH）
- **收口：** typecheck；一次全量基线对照（RULES §5.2）。
- **浏览器：** 3001 verify-legacy（桌面、手机各一次）；3000 查开关关闭。
- **不运行：** 付费 AI、Preview、PG 差分测试（属于 W0025）。

## 失败与交接

REPORT 必须写：W22-1～4 的已定决定、`?step` 规则、提醒的实测读取字节与月估算、3001／3000 截图路径；对话页快捷入口和策略页药丸两个观察项。

## 修订记录

| review 意见（codex-plan-review.txt） | 处理 |
| --- | --- |
| P1-3（W0022 混合三条操作链） | 接受。本 Sprint 只保留首页入口、`?step`、第 4 步提醒；排序运行时白名单与首页 `partial` 拆到 W0025（H），推荐理由验收数据拆到 W0026（L） |
| P2-2（`app/(app)/app/agent/page.tsx` 行号不准） | 接受。按源码改为：报名读取第 220–241 行（`resolveConfiguredActorEventCanonicalIds`、`readRuntimeEventRegistrationStates({ userId: actorId })`），社群读取第 244 行（`readCommunityJoinedForActor({ actorId })`） |
| 其余 | 不涉及本 Sprint。另：GitNexus 索引刷新到 `1d41bdf` 后 `IOrbitHome`、`resolveStartView` 变为 CRITICAL（revision 1 为 HIGH／LOW），已按 CLAUDE.md 如实登记；W22-1～4 由用户 2026-09-29 定为推荐默认，进入条件改为已满足 |
