# Sprint R05 — REVIEW（独立复核）

**复核人：** 独立 AI 复核会话（没有参与实现），2026-10-10。
**对象：** `git diff da75d7c6..3e94d23d`（`3e94d23d` 代码 + REPORT + README），在 `redesign` HEAD `3e94d23d` 上复核。
**依据：** PLANNER 修订 1（唯一契约）、GOAL.md、README 通用规则 1–9、RD-02、RD-20、RD-21、RD-24、RD-25。REPORT 只当线索；下面每条结论都由复核人重跑测试、重读源码或做注入得出。
**基线：** `da75d7c6`。按 REPORT，App 共 4152 条，基线既有失败为 `route-parity`（`/start`）和 `offline-pages-profile-events` 的两条 events tab。

## 结论：有条件通过

主体已经做到。以下各项复核人都核实过：

- **底栏**：五项是 home / contacts / iorbit / events / task，标签读 `nav.*`，图标读 `Icon`（home / users / sparkle / calendar / task）。几何按 kit 规格实现：left / right 14、高 62、圆角 999、内边距 6、间距 2、字 10 / 700、图标 21；选中态浅色用 surface，深色用 surface-3。iOrbit 走 `push("/ai")`，其余项走 `replace`，点当前项不动作。键盘弹出时底栏隐藏。底栏由根布局统一绘制一次，`EventsScreen`、`ProfileScreen`、`AppScreen` 都不再自己画底栏，有源码扫描测试守着。
- **`AppScreenProps` 一字未改**：diff 里接口没有变化，只改了函数体（嵌入模式、滚动记忆、返回图标换成 `Icon`）。
- **Task 容器**：四段顺序冻结，`?seg=` 可以直达，「＋」按段分派，计划段是空态，页面首次显示时才挂载。To-do 页里原有的「全部 / 人脉」「未完成 / 已完成」保留为页内筛选。
- **旧路由**：`/schedule`、`/today`、`/tasks`、`/notes` 都改成私有跳转；`/followups` 原本就跳转到 `taskListHref`，现在落到新地址。详情页不变。
- **私有路由前缀**：已加入 `/task` 和 `/notes`（复核人实测 `isPrivateMobileRoute`）。
- **登记**：`app-wide-route-coverage` 和 `page-offline-inventory` 已更新，md 与生成结果一致（测试通过）。
- **门禁只减不增**：Ionicons 允许清单删掉了 `AppScreen.tsx`；写死文字和旧写法的清单没有变动。复核人在 `src/screens/task/` 下注入一个新文件，里面同时有 Ionicons、写死的日文和 `Alert.alert`，三个门禁都拦住了。
- **新文案**：`shell.parent.notes` 和 `shell.task.*` 共 9 个 key，三语齐全，并已登记在 `copy-kinds`；用词是普通人能懂的说法，没有内部用语。
- **旧屏改动（RD-24）**：只做了必要的修改。`EventsScreen` 只删了 2 行；`ProfileScreen` 加返回条和收件箱一行，删底栏；`HomeDashboardScreen` 只改顶栏和链接。

但有 **3 条中等问题**：
- **M1**：各处用 `push` 把 Task（一级页）压进导航栈，底栏又用 `replace` 切换 tab，导致栈里重复堆积一级页。
- **M2**：「连续快点不被晚到的 URL 拉回」没有完全修好。复核人复现出了瞬时回跳，而对应的测试实际测不到这种情况。
- **M3**：通知深链不接受新地址 `/task?seg=…`；`orbit://task?seg=…` 会丢掉段参数。

没有严重问题。

**条件：** M1–M3 在 `redesign` 上修完（RD-25）。M1 属于壳本身的导航语义，壳冻结后功能 Sprint 不能再改结构，所以必须在冻结前修。

## 逐 SC 核实

| SC | 结论 | 复核人做了什么 / 证据 |
| --- | --- | --- |
| 01 新底栏 | ✅（有一处证据缺口，m1） | 重读 `OrbitTabBar.tsx` 和 `app/_layout.tsx:92-102`：五项的顺序、文案 key、图标、push / replace 规则、点当前项不动、键盘隐藏、规格数值都对。`ink-signal-shell` 通过；`skeleton-japanese` 断言了日文标签「ホーム / 人脈 / iOrbit / イベント / Task」。看了截图 `sim/01-home.png`：胶囊、五项、选中态都对。但 32 张模拟器截图全是中文界面，SC 要求的日文底栏没有实拍（m1） |
| 02 Task 容器 | ⚠️ | `task-container.test.tsx` 8 条通过。重读 `TaskScreen.tsx`：`TASK_SLOTS` 四个插槽、「＋」分派（`:78-82`）、计划段空态都对。连续快点有瞬时回跳，测试测不出来（M2） |
| 03 旧链接与推送 | ⚠️ | 复核人用 `probe-notif.ts` 实测：旧地址 `/today` 和 `orbit://today` 都落到 `/task?seg=todo`，`/schedule` 落到 `?seg=calendar`。但新地址 `/task?seg=todo` 返回 `null`，`orbit://task?seg=todo` 返回不带段的 `/task`（M3）。推送的生成方（App 的 `TaskDetailScreen:463`、Web 的 `tasks-client.ts:130`）只发 `/tasks/:id`，这条路径不受影响。旧屏里写死的旧地址照 RD-24 保留，靠跳转到达，但用 push 进入时会触发 M1 |
| 04 首页入口 | ✅ | 读 diff：头像 → `navigate("/profile")`；🔔 换成 `Icon bell`，红点用 coral，渲染时不显示数字（`home-dashboard-interactions` 覆盖）；「編集」弹出 Toast `homeEdit.comingSoon`（三语都有：近日公開 / Coming soon / 中文）。截图 `01`、`02`、`16`、`17` 都看过 |
| 05 二级页规则 | ⚠️ | `mainTabForPath` 是精确匹配，所以二级页都没有底栏（`shell-back-restore`、`ink-signal-shell` 都覆盖）。「我的」页用 `ShellBackBar` 返回首页；截图 `16` 中返回条和受信箱一行都在。**滚动恢复**：只对普通一级页做了渲染测试；Task 每段各自的滚动恢复只有记忆的纯函数测试和截图 `21`/`22`（m2）。**返回到原 tab**：push 进二级页再返回没有问题，但 M1 会让「原 tab」下面还压着另一个一级页 |
| 06 离线与适配 | ✅ | `page-offline-inventory` 通过：`/task` 标为 local-first、sprint R05；`/tasks`、`/today`、`/schedule` 改成跳转条目。320 宽下五项都 ≥44×44，标签 `maxFontSizeMultiplier=1`，不会随字号放大。断网下 Task 四段能打开（截图 `30`–`33`），但本地同步租约返回 503，四段的内容是否可读只能靠原有的 local-first 测试保证（REPORT 已如实登记） |

### 必需证据子表

| SC | 子断言 | 复核结论 |
| --- | --- | --- |
| 01 | `app-navigation-source` 仍断言没有 Tabs | ✅ 复核人重跑通过 |
| 03 | 推送和站内链接改成新地址；旧地址跳转保留 | ⚠️ 集中生成链接的地方（`taskListHref`、首页、`home-dashboard`、`schedule*` 视图模型、`initial-route`）已改；旧地址的跳转文件都在。通知解析不接受新地址（M3） |
| 05 | 「我的」和活动页不再自己画底栏 | ✅ 源码扫描测试；复核人 grep 确认两个文件里已没有 `OrbitTabBar` |
| 06 | 离线清单 md 已重新生成且一致 | ✅ |
| 全部 | 全量零新增；`tsc`；`detect-changes`；`AppScreen` props 不变 | ✅ 见下文。`detect-changes` 只核对了证据文件 `detect-changes.txt`（56 个文件、68 个符号、critical、216 个流程，多数是 `MainTab` 同名连边造成的噪声），复核人没有重跑 |

## 运行时抽查

### 重跑（`repos/orbit-app`）

| 命令 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | exit 0 |
| 指定测试：`task-container`、`shell-back-restore`、`ink-signal-shell`、`page-offline-inventory`、`mobile-route-access`、`ionicons-ratchet`、`legacy-ui-ratchet`、`no-hardcoded-copy`、`app-navigation-source`、`skeleton-japanese`、`notification-model`、`initial-route` | 91 / 91 通过 |
| `npm test` 全量 | 4164 条，4159 通过，5 失败（逐条分析见下） |

**全量的 5 条失败：**
- **基线既有，3 条**：`route-parity`（`/start`）；`offline-pages-profile-events` 的两条 events tab（30 秒超时）。
- **与 R05 无关，2 条**：
  - `design-sync`「design-token copy is byte-identical」：工作区里 `repos/orbits/shared/design/tokens.json` 和 `tokens.ts` 有别的会话正在做、尚未提交的修改（新增 `menu`、`tile`、`xs` 等字段），不在 `3e94d23d` 里。单独重跑仍失败，原因相同。
  - `personal-schedule-interactions`「save waits for independent authenticated GET…」：单独重跑通过，是偶发失败。

结论：R05 零新增失败。

### 探针（复核人临时放在 `tests/zz-r05-review-probe.tsx` 和 scratchpad，用完已删除）

| 探针 | 结果 |
| --- | --- |
| `notificationHrefFromDeepLink` 对 13 个地址求值 | `/task?seg=todo` → `null`；`/task?seg=memo` → `null`；`orbit://task?seg=todo` → `/task`（段丢失）；`/today` → `/task?seg=todo` ✅；`/schedule?date=…` → `null`（改动前也是 `null`）→ M3 |
| `isPrivateMobileRoute` | `/task`、`/notes`、`/notes/new`、`/tasks`、`/today` 都返回 true ✅ |
| Task 容器：`setParams` 回写延迟 600ms，先点カレンダー、紧接着点メモ，记录选中段的变化序列 | 序列为 `["カレンダー","メモ","カレンダー","メモ"]`：晚到的 `seg=calendar` 把段拉回カレンダー，随后又跳回メモ → M2 |
| 同一场景，用现有测试的参数（延迟 150ms，两次点击间隔 `waitForTimeout(50)`） | 序列为 `["カレンダー","メモ"]`：Playwright 每次点击本身就超过 100ms，`calendar` 在点メモ之前就已经回写，现有测试根本没有走到竞态 → M2 |

### 注入（验证后已删除）

| 注入 | 位置 | 结果 |
| --- | --- | --- |
| `import { Ionicons }` | 新文件 `src/screens/task/ZzReviewProbe.tsx` | ✅ `ionicons-ratchet` 拦住 |
| `Alert.alert("x")` | 同上 | ✅ `legacy-ui-ratchet` 拦住 |
| 写死文字 `<Text>近日公開です</Text>` | 同上 | ✅ `no-hardcoded-copy` 拦住 |

## 问题清单

### 严重

无。

### 中等

**M1 一级页 Task 被 push 进导航栈，底栏又用 replace 切换，栈里会堆积一级页**

- **现象**：底栏的设计假设「一级页在栈底，只用 replace 互换」（`OrbitTabBar.tsx:48`）。但很多入口用 `router.push` 打开 Task 或旧的 Task 地址。旧地址的 `<Redirect>` 做的是 replace，结果 Task 落在栈的中间：
  - 首页快捷入口和「全部日程 / 全部待办」：`HomeDashboardScreen.tsx:50-57` 的 href，经 `:233` 的 `navigate()` 调用 `router.push`；
  - 通知：`OrbitNotificationsCoordinator.tsx:53` 用 `router.push(href)`，地址是 `/task?seg=…`；
  - 旧屏：「我的」页统计格 `ProfileScreen.tsx:1379-1380` push `/tasks`、`/schedule`；联系人详情 `ContactDetailScreen.tsx:397` push `/schedule`；`ContactPipelineScreen.tsx:162` push `/tasks?scope=relationship`；
  - 笔记详情的返回按钮：`NoteDetailScreen.tsx:128` 用 `onBack={() => router.replace("/notes")}`，经跳转后得到栈 `[/task, /task?seg=memo]`。
- **复现（按 expo-router 57 的语义推断）**：
  1. 在首页点「查看日程」，栈变为 `[/home, /task]`。Task 上显示底栏，但下面还压着首页。
  2. 点底栏「ホーム」，`replace` 得到 `[/home, /home]`。iOS 左缘右滑会退到另一个首页。
  3. 反复「首页 → 快捷入口 → 底栏回首页」，栈每轮增加一层，不会回收。
  4. 从联系人详情 push `/schedule`，得到 `[/contacts, /contacts/1, /task]`。此时点底栏任何一项，都只替换最上面一层，联系人详情一直压在下面。
- **证据**：上面列出的源码位置。expo-router 57 的 `push` 总是压栈，`Redirect` 是 replace。复核人没有在模拟器上实测，REPORT 的走查也没有做「一级页之间来回切换后检查返回手势」。
- **影响**：
  - 违反 NAV-V3「五个 tab 平级」的模型；
  - 返回手势会落到意外的页面；
  - 被压住的一级页一直挂载，占内存、继续轮询；
  - 壳冻结后，功能 Sprint 无权修改这个结构。
- **建议修法**：
  - 加一个壳级的 `openMainTab(href)`，先 `router.dismissAll()`（或 `dismissTo` 到栈底），再 `replace`。底栏、首页快捷入口、通知协调器打开一级页时都改用它。
  - `LegacyTaskRedirect` 在 `router.canGoBack()` 时也走这个函数，旧屏 push 进来的旧地址也能落到栈底。
  - 补一条测试：路由替身记录栈，断言「push 一级页 → 点底栏」之后，栈里只剩一个一级页。
  - 模拟器补走一遍：首页 → 快捷入口 → 底栏回首页 → 左缘右滑没有反应。

**M2 连续快点分段仍会被晚到的 URL 瞬时拉回；对应测试测不到**

- **现象**：`TaskScreen.tsx:57-61` 只记录「上一次看到的 URL 值」。连续点 A、B 时，A 的 `setParams` 如果在点 B 之后才回写，URL 值从旧值变成 A，代码会把它当成「新链接」，执行 `setSegment(A)`；随后 B 回写，又切回 B。中间这一下回跳，会让 `SwipeSegments` 的 effect（`Segmented.tsx` 里的 `scrollTo(animated:false)`）把页面拉到 A 再拉回来。
- **复现**：见「探针」表，600ms 延迟下的序列是 `カレンダー → メモ → カレンダー → メモ`。
- **测试问题**：`task-container.test.tsx:117-127` 用 150ms 延迟、两次点击之间 `waitForTimeout(50)`。但 Playwright 的 `click()` 本身就超过 100ms，竞态根本不会出现，只断言了最终状态。REPORT「走查中发现并修复 2」和 SC-02 的说法因此只对了一半。
- **影响**：真机上 `setParams` 一般只晚一帧，概率不高；但在慢设备或主线程繁忙时，会出现肉眼可见的页面闪跳。而且这一条被登记成「已修复、有测试保护」。
- **建议修法**：用 ref 记录自己发出、还没回写的 `seg` 值（队列，或只记最后一次）。URL 值等于其中任何一个时只消化、不跟随；只有不是自己发出的值才当作外部链接。测试改成在一次 `page.evaluate` 里同步连点两次，并用 MutationObserver 断言选中序列里没有回跳。

**M3 通知深链不接受新地址，`orbit://task?seg=` 会丢段**

- **现象**：`notification-model.ts:37-41` 的 `taskSegmentPaths` 按完整路径精确匹配，`:66` 拿整条 `path` 去查。所以：
  - 带查询串的 `/task?seg=todo` 两张表都查不到，返回 `null`，通知点开后什么都不做；
  - `orbit://task?seg=todo` 只取了 `host + pathname`，查询串被丢掉，落到「上次用的段」。
- **对照**：PLANNER 契约要求「推送通知和站内链接里指向旧路由的地方，统一改成新地址」；SC-03 要求推送落到正确的段。现在只有旧地址能用，新地址反而不能用。
- **影响**：R13（推送）或服务端一旦按新地址发 `deepLink`，通知会静默失效。目前生成方只发 `/tasks/:id`，所以线上暂时没有坏。
- **建议修法**：解析出查询串，路径是 `/task` 时只保留合法的 `seg`（以及 To-do 的 `scope`、`view`），复用 `initial-route.ts:297-302` 的同一套规则。补测试：`/task?seg=todo`、`orbit://task?seg=memo`、非法的 `seg`。

### 轻微

- **m1 模拟器证据没有日文界面**：`sim/` 下 32 张截图全是中文界面。SC-01 写的是「五项日文标签」，日文只由 `skeleton-japanese` 单测证明。修法：在日文界面下补拍首页底栏和 Task 四段各一张。
- **m2 Task 各段的滚动恢复没有渲染测试**：`shell-back-restore.test.tsx` 只测了普通一级页重新挂载后的滚动恢复；Task 嵌入页的滚动键 `/task#seg` 只有纯函数测试，加截图 `21`/`22`。修法：在 `task-container` 里给 To-do 插槽放一个长列表，滚动、卸载、重新挂载后断言 `scrollTop`。
- **m3 嵌入后笔记页「新建」的离线保护没了**：`NotesScreen.tsx:57,64` 在 web 离线时禁用「新建」；嵌入后这个头部按钮不显示，容器的「＋」（`TaskScreen.tsx:81`）无条件 push `/notes/new`。原生端不受影响（`needsNetwork` 只在 web 为真）。修法：`memo` 的「＋」读取同样的离线状态，必要时禁用；或者在交接文档里写明「＋」的禁用状态由插槽提供。
- **m4 `TaskQuickAdd` 和「今天」页添加框不是同一种写法**：`TodayScreen` 在已知离线时直接写进发件箱；`TaskQuickAdd.tsx:50` 每次都先发网络请求，离线时要等请求超时才进发件箱，期间一直显示「保存中」。另外 `client.post` 外面没有 `try`，如果抛异常，`saving` 会一直卡在 true。REPORT「自定决定 5」写的是「逐行对照」。修法：先读离线状态，离线时直接进发件箱；整段放进 `try/finally`。
- **m5 `legacyTaskRedirect("/followups")` 是死分支；REPORT 有一处说法不准**：`app/followups.tsx` 仍渲染 `FollowupsScreen`，后者用 `taskListHref` 跳转，从不调用 `app-navigation.ts:47`。`task-container` 断言的正是这条死分支。REPORT「后续」说「`FollowupsScreen` 不再有路由直接渲染」也不对。修法：`app/followups.tsx` 改用 `LegacyTaskRedirect`，或者删掉这条分支、让测试改测 `FollowupsScreen` 实际跳到的地址。
- **m6 底栏的显示跟着路径瞬间切换**：底栏挂在导航栈外面，由 `usePathname()` 决定显隐。所以 push 二级页时，底栏在转场一开始就消失；返回时在转场时立刻出现，不会像 `hidesBottomBarWhenPushed` 那样跟着页面滑动。另外键盘把底栏藏起来时，Toast 仍按「有底栏」放在 bottom 100。这两条是代码推断，未在模拟器核实。修法：由产品负责人在模拟器上看一眼是否可以接受；Toast 的 `hasTabBar` 可以再与 `keyboardVisible` 取与。

## 对 REPORT「自定决定」的评价

| # | 评价 |
| --- | --- |
| 1 底栏由根布局统一绘制 | 合理，旧屏的改动最小；但「tab 属于容器」需要一级页总在栈底，这一点没有做到（M1） |
| 2 默认段 = 上次的段 | 合理，有测试 |
| 3 页内筛选保留 | 符合「易错边界」 |
| 4 嵌入页不画自己的标题和头部按钮 | 合理，`AppScreen` 的 props 不变；副作用是丢了 web 离线禁用（m3） |
| 5 `TaskQuickAdd` 新写，不改 `TodayScreen` | 方向符合 RD-24，但写法与 `TodayScreen` 不一致（m4） |
| 6 只改集中生成链接的地方 | 符合 RD-24；但旧屏 push 旧地址会引出 M1 |
| 7 `/notes?contactId=` 保留为独立页 | 合理 |
| 8 「我的」页只加返回条 | 合理，与 `AppScreen` 规则一致（截图 `16`） |
| 9 冷启动主题用 expo-sqlite 同步存储 | 合理，不新增依赖；读写都有 `try`，web 和测试用空实现 |
| 10 底栏 bottom = 安全区 − 8 | 合理，Face ID 机型正好是 26 |
| 11 iOrbit 的 ≡ / ✕ 不做 | 符合 PLANNER「不做」 |

**REPORT 的数字与说法核实：**
- tsc 0：一致。
- 全量 4164 条：一致。复核人这次 5 条失败，多出的 2 条已证明与 R05 无关（见上）。
- `AppScreen` props 未变：一致。
- 与实际不符的说法：
  - 「连续快点不被晚到的 URL 拉回」（M2）；
  - 「`FollowupsScreen` 不再有路由直接渲染」（m5）；
  - 「添加框写法逐行对照 `TodayScreen`」（m4）。

## 附：复核人留下的痕迹

- 探针 `tests/zz-r05-review-probe.tsx` 和注入文件 `src/screens/task/ZzReviewProbe.tsx` 用完即删；`probe-notif.ts` 在 scratchpad。
- 没有修改任何源代码或测试，没有提交，没有连接 Neon，没有部署。
- `git status` 里只有本文件是复核人新增的。其余未提交的改动都不是复核人做的：
  - 用户自己的文件：`bridge/*`、`docs/designs/Orbit_0918/`、`repos/orbits/docs/...`；
  - 复核期间另一个会话正在进行的改动（看内容是 R06 Web 组件库）：`shared/design/tokens.*`、App 的 `src/api/design/tokens.ts`、`repos/orbits/app/(app)/app/orbit-2026/**`、`repos/orbits/app/showcase/components/`。全量里 `design-sync` 那条失败就是它们造成的。

## 处理记录（执行会话，2026-10-10）

| 编号 | 处理 | 位置 / 证据 |
| --- | --- | --- |
| M1 | 已修：新增壳级 `openMainTab()`（`src/components/shell-navigation.ts`）：按根导航状态里焦点路径上还能退的栈层数，逐层 `dismissAll`（POP_TO_TOP），再 `replace`。根状态由根布局里的 `ShellTabBar` 用 `useRootNavigationState` 镜像。底栏、首页快捷入口（Task 地址）、通知协调器（一级页地址）、`LegacyTaskRedirect`（被旧屏 push 进来时）、`/followups`（`FollowupsScreen` 改用 `LegacyTaskRedirect`）都走它 | `shell-navigation.test.ts`（层数计算、先退后换、五个入口源码扫描）；模拟器：首页「查看日程」进 Task 后左缘右滑无反应（`sim/50`、`51`），「我的」统计格 push 旧地址 `/tasks` 进 Task 后左缘右滑无反应（`52`、`53`） |
| M2 | 已修：记录本页 `setParams` 写出、还没回来的值（按顺序），回写时只消化不跟随；其他值才当作外部链接 | `task-container`「two taps in a row are never pulled back」：同一个脚本里连点两次、路由替身按顺序每 600ms 回写一次、MutationObserver 记录选中序列；把修复回退成旧逻辑时该测试 RED（序列出现 メモ → カレンダー），修复后 GREEN。路由替身改为按顺序延迟回写（`task-shell-router.js`） |
| M3 | 已修：通知深链解析查询串；`/task` 只保留合法 `seg`（To-do 再保留规范化后的 `scope` / `view`，复用 `taskListHref`），非法段落回 `/task`；`orbit://task?seg=` 不再丢段；其他带查询串的地址仍拒绝 | `task-container`「old addresses and notifications」新增 5 条断言 |
| m1 | 已补：界面切到日本語后补拍首页底栏、Task To-do、Task プラン（`sim/54`–`56`），拍完切回「跟随设备」 | `sim/54-ja-home.png` 等 |
| m2 | 已补：`task-container`「a Task segment mounted again comes back at the same scroll position」：To-do 插槽放长列表，滚到 800、重新挂载 Task 后仍在 800。为此 `SwipeSegments` 把页面高度设为翻页容器的高度（react-native-web 不会像原生那样拉伸横向滚动容器的子项，页内纵向滚动原来不受限） | `Segmented.tsx`、`task-container.test.tsx` |
| m3 | 已修：Web 上服务器连不上时，メモ 段的「＋」禁用（与笔记页自己的规则一致，读 `serverReachability`）；原生不受影响 | `TaskScreen.tsx` |
| m4 | 已修：已知离线（服务器上次没有应答）时直接进本机发件箱，不等请求超时；整段放进 `try/finally`，异常时 Toast「保存できませんでした」且不再卡在保存中。REPORT 的「逐行对照」改为如实描述 | `TaskQuickAdd.tsx`、REPORT 自定决定 5 |
| m5 | 已修：`FollowupsScreen` 改为渲染 `LegacyTaskRedirect`，`/followups` 分支是实际路径；`legacyTaskRedirect` 的 `/tasks`、`/followups` 改用 `taskListHref` 规范化 `scope` / `view`（与旧行为一致，`ink-signal-followups` 通过）。REPORT「后续」更正 | `FollowupsScreen.tsx`、`followups-screen-source.test.ts`、`app-navigation.ts` |
| m6 | 部分修：键盘弹出、底栏隐藏时 Toast 按「无底栏」放在 bottom 40（`app/_layout.tsx` 的 `hasTabBar` 与键盘状态取与）。底栏随路径即时出现 / 消失、不随转场滑动：保留，请产品负责人在模拟器上看是否接受（对标：iOS `hidesBottomBarWhenPushed` 会随页面滑动；要做到需要把底栏放进每个一级页的转场里，与「壳统一画一次底栏」的结构冲突，改动面大） | REPORT「已知例外」 |

全量回归见 REPORT「复核修复后」一行。
