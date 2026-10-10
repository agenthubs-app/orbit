# Sprint R05 — REPORT

**执行人：** 小雨的执行会话，2026-10-10。**依据：** PLANNER 修订 1、README 通用规则、RD-02、RD-20、RD-21、RD-24、RD-25；R01 复核 m3（转给本 Sprint）。
**基线：** `redesign` `da75d7c6`（R04 走查后）：App 4152 条，开工时跑出 4 条失败——`route-parity`（已知）、`offline-pages-profile-events` 的两条「events tab」（30 秒超时）、`tasks-unification-interactions`（文件级超时）。用 `git stash` 退回基线单独重跑后两组：仍有 3 条失败（两条 events tab 是基线既有失败；tasks-unification 有 1 条偶发）。
**证据：** `~/orbit-sprint-evidence/redesign/R05/run-01/`（`compare.html` 对照页、`sim/` 模拟器开发包实拍 32 张、`design/` 设计稿 b11 浅 / 深、`shell-320.png`、`app-test.log`、`app-tsc.log`、`impact-summary.txt`、`detect-changes.txt`、`baseline-app-test.log`）。

## 做了什么

1. **NAV-V3 底栏**（`src/components/OrbitTabBar.tsx`）：ホーム / 人脈 / iOrbit / イベント / Task 五等分玻璃胶囊（`GlassSurface` + expo-blur，left / right 14、高 62、圆角 999、内边距 6、间距 2、`shadow-float`；字 10 / 700、图标 21；选中 = surface 底 + ink 字，深色 surface-3）。标签读标准用词 `nav.*`，图标读 `Icon`（home / users / sparkle / calendar / task）。iOrbit `router.push("/ai")` 进全屏；其他项 `router.replace`；点当前项不动；键盘弹出时隐藏。
2. **壳统一画底栏**：新增 `ShellTabBar`，由根布局 `app/_layout.tsx` 挂一次（在导航栈之上、弹层之下），只在四个一级路径显示。`AppScreen`、`EventsScreen`、`ProfileScreen` 都不再自己画底栏（源码扫描测试守着）。底栏的几何常量放在无依赖的 `shell-metrics.ts`，页面代码不会因此引入原生模块。
3. **导航模型**（`src/view-models/app-navigation.ts`）：`MainTab = home | contacts | events | task`；`/ai`、`/profile` 不再是一级页。新增 `TASK_SEGMENTS`（冻结顺序 calendar / todo / plan / memo）、`taskHref()`、`legacyTaskRedirect()`。`parentForPath` 的返回目标改到所属的 Task 段（`/tasks/*` → To-do、`/notes/*` → メモ、`/schedule/*` → カレンダー），`/profile` 返回首页；标签都是字典 key（新增 `shell.parent.notes`）。
4. **Task 容器** `app/task.tsx` → `src/screens/task/TaskScreen.tsx`：标题「Task」+ 日期，右上「＋」；`SwipeSegments` 四段（可点、可左右滑、页码点）；`?seg=` 直达；页面第一次显示时才挂载，之后保留。四个插槽 `TASK_SLOTS`：カレンダー = 现有 `ScheduleScreen`；To-do = 新的 `TaskQuickAdd` 添加框 + 现有 `TasksScreen`（页内「全部 / 人脉」「未完成 / 已完成」保留为页内筛选）；プラン = 「目標を決める」空态（按钮提示「近日公開」，R25 再接）；メモ = 现有 `NotesScreen`。「＋」：カレンダー → `/schedule/personal/new`；To-do → 聚焦添加框；プラン → 不显示；メモ → `/notes/new`。
   - 嵌入方式：`AppScreenEmbeddingProvider` 告诉 `AppScreen` 自己在 Task 段里，`AppScreen` **props 不变**，只渲染滚动内容（不画安全区、标题、头部按钮、底栏）。
   - `TaskQuickAdd` 与「今天」页添加框同一写法：在线 `POST /api/tasks`（计划日 = 今天）；断网（原生）进本机任务发件箱，Toast「オフラインで保存しました · 接続後に同期します」。已登记 `route-domain-inventory`。
5. **旧路由跳转**（`src/components/LegacyTaskRedirect.tsx`，私有路由包装保持）：`/schedule` → `?seg=calendar`（保留 `date`）、`/today` → `?seg=todo`、`/tasks` → `?seg=todo`（保留 `scope` / `view`）、`/followups` → `?seg=todo&scope=relationship`、`/notes` → `?seg=memo`（带 `contactId` 的「某个联系人的笔记」仍是独立二级页）。详情页（`tasks/[id]`、`notes/[id]`、`schedule/…`）不变，仍是二级页。
6. **链接改新地址**：`taskListHref`（待办列表、登录回跳、启动路由、`/followups`）、通知深链 `notificationHrefFromDeepLink`（旧的 `/schedule`、`/today` 提醒落到 Task 段；`/task` 也接受）、首页卡片与快捷入口、`today-task-pages` / `home-dashboard` / `schedule` / `schedule-event-preview` 生成的链接；启动路由 `initial-route` 认识 `/task?seg=`。旧屏里写死的旧地址（AI 页、联系人页等）不改（RD-24），靠第 5 条的跳转落到正确的段。
7. **首页顶栏**（`HomeDashboardScreen` 只改顶栏）：左上头像（`Avatar`）→ `/profile`；右上 🔔（`/api/inbox/summary` 有未读时 coral 红点，不显示数字）→ `/inbox`；「編集」按钮弹出 Toast「近日公開」（RD-21）。
8. **マイページ 变二级页**：去掉自画底栏，顶部加 `ShellBackBar`（← 回首页，与 `AppScreen` 返回按钮同规则）；页面里加「受信箱」一行作次入口（`ShellInboxRow`）。イベント 页去掉自画底栏，改由壳画。
9. **返回恢复**（`src/view-models/shell-state.ts`）：一级页和每个 Task 段在会话内记住滚动位置；Task 记住上次的段。push 进二级页时一级页本来就留在栈里；tab 之间 `replace`、直接打开后的「返回」、旧地址跳转这些「重新挂载」的情况由这份记忆恢复——内容随数据加载变高后才恢复，用户先拖动则放弃恢复。
10. **R01 复核 m3（冷启动闪主题）**：外观选择额外写一份到 `expo-sqlite/kv-store`（已是原生依赖，不新增），根布局模块加载时同步读出并 `Appearance.setColorScheme`，第一帧就是用户选的明暗；AsyncStorage 仍是来源，第一次启动时把旧值写进同步副本。Web / 测试用空实现（`appearance-sync.ts`）。
11. **登记与门禁**：`PRIVATE_ROUTE_PREFIXES` 加 `/task`、`/notes`；`app-wide-route-coverage` 加 `/task`；`page-offline-inventory`：`/task` local-first（sprint `R05`），`/tasks`、`/today`、`/schedule` 改为跳转条目，根布局 / `(app)` 分组标题更新，`docs/offline/page-inventory.md` 重新生成（97 条路由）；Ionicons 允许清单删去 `AppScreen.tsx`（返回箭头改用 `Icon`）；新代码 0 处写死文字、0 处 Ionicons、0 处旧写法。
12. **R04 组件小修**：`Segmented` 的选项加 `aria-selected`（网页读屏与测试可读选中态）；`SwipeSegments` 加页码点、外部改值时移动页面、首次布局定位；修掉一个只在 iOS 出现的问题（见「走查中发现并修复」）。

## 验收

| SC | 结论 | 证据 |
| --- | --- | --- |
| 01 新底栏 | ✅ | `ink-signal-shell`（迁移后 22 条）：五项日文 / 中文标签顺序、选中态、iOrbit push、其他 replace、当前项不动、マイページ / iOrbit / 二级页无底栏、62pt 胶囊、320pt 每项 ≥44×44、2× 字号标签不出界、键盘隐藏与恢复、草稿不丢；`app-navigation-source` 仍断言没有 `Tabs`。模拟器 `sim/01-home.png`（底栏）、`18-iorbit-fullscreen.png`（全屏无底栏）、`05-…keyboard.png`（键盘弹出底栏隐藏） |
| 02 Task 容器 | ✅ | `task-container.test.tsx`（8 条）：四段顺序、`?seg=` 直达、只挂载显示过的段、嵌入页不画自己的标题 / 头部按钮 / 底栏、点段切页且 URL 同步、连续快点不被晚到的 URL 拉回、「＋」按段（新建日程 / 聚焦添加框 / 计划无 / 新建笔记）、计划空态按钮提示近日公開、320 + 2× 字号不溢出。模拟器 `03`、`04`（左滑切到 To-do）、`05`–`07`、`09`、`10`；添加框真实创建一条待办（本地服务器日志 `POST /api/tasks 201`，首页随即显示该待办 `16-…`） |
| 03 旧链接与推送 | ✅（推送用深链模拟） | `task-container` 第 6、7 条：五个旧地址的跳转、`taskListHref`、通知深链（`orbit://today`、`/schedule` → Task 段，详情深链不变）、旧路由文件仍是私有跳转。模拟器用 `simctl openurl` 打开 `orbit://schedule`、`followups`、`notes`、`today`、`task?seg=todo` 都落到对应段（`12`–`15`、`08`）。真推送见「已知例外」 |
| 04 首页入口 | ✅ | `ink-signal-profile`、`home-dashboard-interactions`（62 条，含红点不显示数字）；模拟器：头像进マイページ（`16-avatar-to-me-secondary.png`）、🔔 进收件箱（`17`）、編集 弹出「即将上线」（`02`） |
| 05 二级页规则 | ✅ | `shell-back-restore.test.tsx`（4 条，含重新挂载后滚动恢复、联系人 / 活动 / 设置 / 待办详情 / マイページ / iOrbit / 收件箱 / 笔记 / 日程详情都无底栏、源码扫描）；模拟器：新建笔记二级页无底栏、取消回到 メモ 段（`10`、`11`）；To-do 段滚到中间 → 切到首页 → 回到 Task，段和滚动位置都恢复（`21`、`22`） |
| 06 离线与适配 | ✅（壳）/ ⚠️ 本地数据见例外 | 四段内嵌页面本身是 local-first（原有 `offline-pages-tasks`、`notes-local-first`、`offline-pages-schedule` 等全过）；`page-offline-inventory` 已重新生成并一致。模拟器停掉服务器后冷启动，Task 四段都能打开、切换、显示各自的离线提示（`30`–`33`）。320pt：`shell-320.png`；系统超大字号重启后首页、Task、底栏不溢出（`40`、`43`） |

### 必需证据子表

| SC | 子断言 | 结论 |
| --- | --- | --- |
| 01 | `app-navigation-source` 仍断言没有 Tabs | ✅ |
| 03 | 推送和站内链接改成新地址；旧地址跳转保留 | ✅ 第 6 条；`task-container` 扫描旧路由文件 |
| 05 | 「我的」和活动页不再自己渲染底栏 | ✅ `shell-back-restore` 源码扫描 |
| 06 | 离线清单 md 已重新生成且一致 | ✅ `page-offline-inventory.test.ts` |
| 全部 | 全量零新增失败；`tsc` 0；`detect-changes`；`AppScreen` props 未变 | ✅ 见下表；`AppScreenProps` 接口一字未改（diff 只动了函数体和样式） |

## 走查中发现并修复

1. **点分段跳到错的页（只在 iOS）**：`SwipeSegments` 每次渲染都传新的 `contentOffset`，iOS 会在动画滚动途中按新值再跳一次，结果落在相邻页（例：从 To-do 点 プラン 落到 メモ）。改为只在第一次用 `contentOffset`，之后只用 `scrollTo`。
2. **点分段后被 URL 拉回旧段**：`setParams` 晚一拍才更新参数，中间那一拍的旧参数被当成「新链接」。改为只在 URL 参数真的变了时才跟随（测试用延迟回写的路由替身复现了 RED → GREEN）。
3. **滚动只恢复一部分**：页面数据分几次到达，内容还不够高就恢复会被截断。改为内容高度够了再恢复。

## 自定决定（用户指示：疑问一律选推荐方案，写明理由）

1. **底栏由根布局统一画一次，而不是每个页面各画一个**。对标：iOS `UITabBarController` / React Navigation 的 tab bar 都属于容器而不是页面。理由：PLANNER 要求「我的」和活动页不再自己画底栏，而活动页不用 `AppScreen`；把底栏放进壳，旧屏只删一行，不用把 1,424 行的活动页改成 `AppScreen`（RD-24）。
2. **Task 默认段 = 上次用过的段，第一次打开是カレンダー（第一个插槽）**。对标：iOS 各 App 的分段控件记住上次选择；设计稿 01-system N3TASK 以第 0 段为默认。
3. **页内筛选保留在页面里**（To-do 的「全部 / 人脈」「未完成 / 已完成」、メモ 的筛选）：PLANNER 易错边界明确保留为页内筛选。
4. **嵌入页面不显示自己的标题和头部按钮**：Task 头部已有标题和「＋」，同一屏两个标题、两个加号会混淆；`AppScreen` 用 context 判断，props 不变。
5. **To-do 添加框写成新组件 `TaskQuickAdd`，不从 `TodayScreen` 抽取**：`TodayScreen` 是旧屏（归 R20 重写），RD-24 不改旧屏；写同一条请求（计划日 = 今天），共用 `buildOfflineTaskMutation` 和任务发件箱。判断离线的方式不同：「今天」页看自己页面副本的离线标记，添加框看 `serverReachability`（服务器上次没应答就直接进发件箱），请求失败于网络时也进发件箱（复核 m4 后）。`/today` 页本身不再有入口（跳到 To-do），文件保留到 R20 删除。
12. **一级页永远在栈底**（复核 M1）：打开一级页（底栏、首页快捷入口、通知、被旧屏 push 的旧 Task 地址）一律先退到栈底再替换。对标：iOS `UITabBarController` 切 tab 不压栈；Android 底部导航「切 tab 清掉该 tab 之上的页」。
6. **只把集中生成链接的地方改成新地址**，旧屏里写死的 `/tasks`、`/schedule` 等不改，靠跳转到达。对标：网站改版保留 301 跳转、只改模板和站点地图。理由：RD-24；这些旧屏会被整屏重写。
7. **`/notes?contactId=` 保留为独立页**：它是「某个人的笔记」，属于联系人详情的下一层，放进 Task 的 メモ 段会丢掉返回联系人的路径。
8. **「我的」页不改用 `AppScreen`，只在顶部加一个与 `AppScreen` 同规则的返回条**（`ShellBackBar`）：`ProfileScreen` 1,971 行、自带滚动和刷新，改成 `AppScreen` 等于重写（归 R18）；返回行为、文案、读屏标签与 `AppScreen` 一致。
9. **冷启动主题用 expo-sqlite 的同步键值存储**，不加 `expo-splash-screen`：不新增原生依赖、不用重编原生包；对标 RN 社区常用 MMKV 做主题同步读取的做法（同一思路，用现有依赖）。
10. **底栏位置**：设计稿 bottom 26 是画在手机框里；真机按「安全区 − 8」（Face ID 机型 34 − 8 = 26），没有安全区的设备至少 14。
11. **iOrbit 全屏页的 ≡ / ✕ / 左缘右滑退出不做**（PLANNER「不做」，R21）；现在仍是旧 AI 页的「← 首页」返回。

## 基线 → 收口

| 项目 | 基线 `da75d7c6` | 收口 | 对照 |
| --- | --- | --- | --- |
| App `npm test` | 4152 条，4 失败（见上） | **4164 条，4161 通过，3 失败** | 只剩基线既有：`route-parity`（`/start`）、两条 events tab 离线（基线单独重跑也失败）；偶发项单独重跑通过。**零新增** |
| App `npm test`（复核修复后） | — | **4170 条，4167 通过，3 失败** | 同样只剩上面 3 条基线既有失败；零新增 |
| App `tsc` | 0 | **0**（复核修复后同） | |
| orbits | — | 未改 orbits（`shared/**` 未动），未重跑 | 与 R04 相同处理 |

中途问题：第一次全量 945 条失败——`AppScreen` 引入底栏后几十个旧测试的打包替身缺 `useSafeAreaInsets` / expo-blur；改为页面只依赖无依赖的 `shell-metrics.ts`、首页按需单独导入组件后解决。迁移的旧测试：`ink-signal-shell`、`ink-signal-contacts` / `events`（夹具里加根布局的 `ShellTabBar`）、`ink-signal-profile`（二级页断言）、`home-dashboard-interactions`、`notes-interactions`、`tasks-unification-interactions`（直接渲染 To-do 插槽的 `TasksScreen`）、`navigation-icon`、`skeleton-japanese`、`mobile-route-access`、`page-offline-inventory`、`app-wide-route-coverage`、`app-performance-wiring`、`initial-route`、`task-list-scope`、`ink-signal-followups`、`notification-model`、`home-dashboard`、`home-local`、`today-task-pages`、`schedule-view-model`、`schedule-event-preview-view-model`、`agent-ledger-route-wiring`、`today-tasks-screen-source`、`offline-read-inventory`（只改旧地址期望值或夹具，断言意图不变）。

## GitNexus（`impact-summary.txt`）

- `AppScreen` **CRITICAL**（58 个直接调用方）：props 不变，只改内部（不画底栏、返回图标、嵌入模式、滚动记忆）；全量回归零新增；`ink-signal-shell`、`skeleton-japanese` 覆盖返回按钮。
- `mainTabForPath` / `parentForPath` / `OrbitTabBar` **CRITICAL**（约 80，经根布局传导）：签名不变；返回目标改动逐条写进 `ink-signal-shell` 和 `task-container`。
- `notificationHrefFromDeepLink`、`isPrivateMobileRoute`、`taskListHref`、`loadAppearancePreference`、`setAppearanceChoice`、`homeScheduleToView` **CRITICAL**（数千，`partial`，都经根布局传导到全 App）：签名不变，只改返回的地址或多写一份同步副本；各自原有测试全部更新并通过，新增断言见 `task-container`、`appearance-preference`。
- `SwipeSegments`、`resolveSupportedInitialRouteHref`、`RootLayout`：**UNKNOWN**。文本搜索确认：`SwipeSegments` 只有新的 `TaskScreen` 使用；`resolveSupportedInitialRouteHref` 只被 `initial-route` / `LegacyDeepLinkRoute` 和测试使用；`RootLayout` 是 expo-router 按约定加载的默认导出，只有 `app-performance-wiring` 测试直接打包它（已更新）。
- `HomeDashboard`、`ProfileScreen`、`EventsScreen`、`Segmented`：LOW。
- **detect-changes（提交前）：56 个已跟踪文件、68 个符号、风险 critical、受影响流程 216**（`detect-changes.txt`）。216 个流程几乎都经类型 `MainTab` 的同名匹配被牵连（如 `CreateGeneration`、`ReapExhaustedLeases` 这类与导航无关的后端流程），是索引按名字连边的噪声；真实的影响面就是上面逐项列出的符号，全量回归零新增失败。列表里的 `bridge/handoffs.md` 是用户自己的未提交文件，不在本次提交里。

## 交接

- **热点文件（冻结结构，归属见 R09 归属表）**：`OrbitTabBar.tsx`、`app-navigation.ts`、`AppScreen.tsx`、`AppScreenEmbedding.tsx`、`shell-state.ts`、`TaskScreen.tsx`（插槽结构）、`app/_layout.tsx`（`ShellTabBar` 挂载点）。
- **往 Task 的某一段放页面**：只改 `TASK_SLOTS` 里自己那一项（R20：calendar / todo / memo；R25：plan）。页面若用 `AppScreen`，在段里会自动变成「只有内容」；不用 `AppScreen` 的新页面自己不要画安全区顶部和标题。「＋」的行为在 `TaskScreen` 的 `add()` 里按段分派，换段内容时如需改「＋」，只改自己那一支。
- **往某个 tab 放页面**：一级页路径固定为 `/home`、`/contacts`、`/events`、`/task`；页面用 `AppScreen`（自动留出底栏高度、记住滚动）。不要在页面里画底栏。
- **二级页**：用 `AppScreen`（自动有返回）；不用 `AppScreen` 的放 `ShellBackBar`。新的二级路径要在 `parentForPath` 里写清楚返回到哪个 tab / 段。
- **新的导航测试写法**：渲染页面时在夹具里同时渲染 `<ShellTabBar />`（根布局就是这样挂的），替身补 `useSafeAreaInsets` 和 `expo-blur`；Task 相关用 `tests/helpers/stubs/task-shell-router.js`（会延迟回写 `setParams`，能测出「被 URL 拉回」这类问题）。
- **旧路由跳转表**：`/schedule` → `/task?seg=calendar`（带 `date`）；`/today` → `/task?seg=todo`；`/tasks` → `/task?seg=todo`（带 `scope`、`view`）；`/followups` → `/task?seg=todo&scope=relationship`；`/notes` → `/task?seg=memo`（带 `contactId` 时不跳）。通知深链 `/schedule`、`/today` 同样映射。

## 已知例外

- **真推送**：模拟器不能收远程推送。通知的落地完全由 `notificationHrefFromDeepLink` 决定（单测覆盖），模拟器用同一深链 `simctl openurl` 验证了落点。真机步骤：在本地服务器给 QA 账号排一个今天的提醒（deepLink `/today`），锁屏收到后点开，应停在 Task 的 To-do 段。
- **本地服务器的同步租约返回 503**（`/api/sync/lease`），本机副本没有建立，所以走查里日历 / To-do 列表 / 笔记显示「暂时打不开」类提示——这是本地环境（旧页面在 `/schedule` 下同样如此），不是壳的问题；断网走查只证明了壳和四段在断网时可打开、可切换。四段内容的离线可读由原有的 local-first 测试保证。
- **触感**：模拟器无触感硬件，底栏点按的轻触感需真机确认。
- **底栏随路径即时出现 / 消失**，不像 iOS `hidesBottomBarWhenPushed` 那样随转场滑动（复核 m6）：请产品负责人在模拟器上看是否接受。
- **系统字号「实时」调大时已打开的页面会被截断**（R04 已记录的 RN 现象），重启后正常（`43`）。

## 后续（不属于 R05）

- iOrbit 全屏页的 ≡ / ✕ / 左缘右滑（R21）；首页编辑（R10）；计划段（R25）。
- `TodayScreen` 不再有路由直接渲染（被 To-do 段取代），留给 R20 删除；`FollowupsScreen` 仍由 `/followups` 渲染，只是一个转到 To-do「人脉」的跳转。
