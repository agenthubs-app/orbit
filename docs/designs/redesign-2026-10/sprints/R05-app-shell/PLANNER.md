# Sprint R05 — App 导航壳

**Plan revision:** 1。**模式:** existing-codebase / single-generator（执行人：小雨）。
**单一目标:** NAV-V3 底栏 + `/task` 四段容器 + 首页顶栏入口 + 二级页规则 + 旧路由跳转；去掉屏幕自带底栏；导航测试与路由登记迁移；壳冻结。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** R04 合入后的 `redesign` HEAD。
**进入条件:** R04 completed（组件库、`SwipeSegments`、`ToastProvider`、原生依赖可用）。RD-02、RD-20、RD-21 已定。

## 已查清的事实（按 `9d404c1c8`）

1. **导航结构**：`app/(app)/_layout.tsx:17-19` 只有 `<Stack headerShown:false>` + ErrorBoundary；`tests/app-navigation-source.test.ts:23-27` 断言 `app/(tabs)` 不存在、layout 含 `Stack`、不含 `Tabs` / `tabBar`。`(app)` 组只有 ai、contacts、events、inbox、profile、schedule；`home.tsx`、`today.tsx`、`tasks.tsx` 等在 `app/` 根下。
2. **底栏**：`src/components/OrbitTabBar.tsx:11-17` 写死 home / contacts / ai / events / profile，标签取 `nav.*`；键盘弹出时隐藏（:25）；AI 用 `router.push("/ai")`，其余 `router.replace`（:37）；AI 是深色「planet」底座（:64），永远不是选中态。
3. **`src/view-models/app-navigation.ts`**（55 行）：`MainTab = "home"|"contacts"|"events"|"profile"`（:1）；`mainTabForPath` 只对 4 个路径精确匹配（:3-11）；`parentForPath` 写死中文返回标签（:13-55），默认回 `/home`「首页」。
4. **`AppScreen.tsx`**：`navVisible = showBack ?? (!mainTab && pathname !== "/ai")`（:52-54）；只有 `mainTab` 非空时渲染底栏（:98）；有底栏时内容 `paddingBottom:140`（:131）；返回文案写死「返回」（:68,72）。impact **CRITICAL**（82 个影响点、58 个直接调用方）。
5. **自画底栏的屏幕**：`EventsScreen.tsx:682`（1,424 行）与 `ProfileScreen.tsx:536`（1,971 行）不用 AppScreen，自己渲染 `<OrbitTabBar>`。`AiScreen`（2,185 行）与 `RelationshipInboxScreen`（2,161 行）有自己的 SafeAreaView、无底栏。
6. **现有目标页**：`/home` → `HomeDashboardScreen`（466）；`/today` → `TodayScreen`（514，含添加框）；`/tasks` → `TasksScreen`（307，内部 tablist：全部 / 人脉、未完成 / 已完成），另有 `tasks/[id]`、`tasks/personal`、`tasks/relationship/[id]`；`/schedule` → `ScheduleScreen`（1,045，日 / 周 / 月）及 `schedule/events|meetings|personal/…`；`/notes` → `NotesScreen` 等 4 个路由；`/followups` 已重定向到 `/tasks?scope=relationship`；`/profile` + 7 个子路由；`/settings`；`/inbox` + 3 个子路由。
7. **必须同步的登记与门禁**：
   - `tests/app-wide-route-coverage.test.ts`：新路由加进 `integratedFeatureRoutes`（:168-201）；不要改那 58 条 `expectedRoutes`（否则 README 证据检查要一起改）。
   - `scripts/page-offline-inventory.ts` + `tests/page-offline-inventory.test.ts`：每个路由文件都要登记，改完用 `npx tsx scripts/page-offline-inventory.ts --write` 重新生成 `docs/offline/page-inventory.md`；:48-55 要求 home、`(app)/profile`、tasks、today、`(app)/events` 等 12 个文件是 local-first、sprint 0131（文件移动或改成跳转时要改这条测试）；`(app)/_layout.tsx` 的条目标题是「底部五个标签的布局」（:57）。
   - `src/view-models/mobile-route-access.ts:3-20` 的 `PRIVATE_ROUTE_PREFIXES`（`/notes` 当前不在列表里）。
   - `tests/route-parity.test.ts`：每个 web 页面都要有 native 路由（删除或改名 web 也有的路由会失败）。
   - 按旧底栏断言的测试：`ink-signal-shell.test.ts`（:116-129 `mainTabForPath` 与 9 组 `parentForPath`；:131 四个主 tab；:135 `["首页","人脉","IORBIT","活动","我的"]`；:138-140 IORBIT push、活动 replace；:192 底栏高 72；320pt 下每个 tab ≥44×44；2 倍字号；键盘隐藏）、`ink-signal-events.test.ts:232,448-460`、`home-dashboard-interactions.test.ts:427,485`、`ink-signal-contacts.test.ts:427`、`ink-signal-contact-detail.test.ts:205`、`ink-signal-event-detail.test.ts:682`、`app-navigation-source.test.ts`。
8. **设计规格**：玻璃胶囊 left / right 14、bottom 26、高 62、圆角 999、`--glass` + blur 22 saturate 1.6、1px `--glass-line`、`--shadow-float`；五等分、内边距 6、间距 2；每项字 10 / 700、`ink-3`、图标 21；选中 surface 底 + ink 字（深色 surface-3）（`kit/ui.css:97-106`，`kit.js:93-100`）。iOrbit 全屏：无底栏、无返回箭头，左上 ≡、右上 ✕（`01-system.html:674-675, 700-707`）。二级页不显示底栏，左上 ← 回到进入它的一级页并恢复分段和滚动（`01-system.html:672-677`）。Toast：有底栏 bottom 100、无底栏 40。Task 分段 `.tseg` + 页码点 `.tswipe`（`ui.css:721-728`），右上「＋」新建当前段内容。首页顶栏：右上 🔔（红点不显示数字）+「編集」；「我的」从首页左上头像进入（`b5-me-inbox.html:178`）；收件箱在「我的」页保留一行作次入口（`index.html:102`）。

## 上下文包

### 必读
- 上面列出的设计稿位置；`IMPLEMENTATION-PLAN.md` §1.1、§3.3、附录 D-k。
- App：`OrbitTabBar.tsx`、`OrbitNavigationIcon.tsx`、`AppScreen.tsx`、`app-navigation.ts`、`mobile-route-access.ts`、`app/(app)/_layout.tsx`、`EventsScreen.tsx`、`ProfileScreen.tsx`、`HomeDashboardScreen.tsx`、`TasksScreen.tsx`、`TodayScreen.tsx`、`ScheduleScreen.tsx`、`NotesScreen.tsx`、推送通知落地路由的代码（`OrbitNotificationsCoordinator` 等）、第 7 条列出的全部测试与登记文件。

### 关键符号与 impact（开工时重跑）
- `AppScreen` **CRITICAL**：**props 不变**，只改内部渲染（头部样式、返回文案走字典、底栏判定）；补一组渲染测试覆盖有 / 无底栏、二级页、iOrbit。
- `OrbitTabBar` **HIGH**（84 / 3 / 3）、`mainTabForPath` **HIGH**（80 / 1 / 2）。
- `EventsScreen`、`ProfileScreen`：只去掉自画底栏、改用 AppScreen，页面内容不动。
- `HomeDashboardScreen`：UNKNOWN（expo-router 默认导出），文本搜索确认只有 `app/home.tsx` 与 `route-domain-inventory.ts` 引用。

### 易错边界（全部写进 SC）
旧链接和推送通知跳转失效；Task 分段与内嵌页面自己的 tablist 冲突（待办页内部的「全部 / 人脉」保留为页面内筛选，不再是一级分段）；返回时丢失分段或滚动；键盘弹出时底栏没隐藏；iOrbit 从 tab 进入后底栏状态错乱；离线清单的 local-first 断言因文件移动失败；私有路由前缀漏加导致未登录可进 `/task`。

## 契约（本 Sprint 定稿，REPORT 交接）

- **底栏**：`OrbitTabBar` 改为 home / contacts / iorbit / events / task 五项（标签取文案源 `nav.*`，图标取 `Icon`：home、users、sparkle、calendar、task）；玻璃胶囊按第 8 条规格（`expo-blur`）。iOrbit 用 `router.push("/ai")` 进入全屏；其余 `router.replace`。键盘弹出时隐藏。
- **`MainTab`** = `"home" | "contacts" | "events" | "task"`；`mainTabForPath` 覆盖这 4 个一级路径；`/ai` 为全屏、无底栏。`parentForPath` 的标签改为文案 key。
- **Task 容器** `app/task.tsx` → `src/screens/task/TaskScreen.tsx`：
  - 四段：`calendar` = 现有 `ScheduleScreen`；`todo` = 现有 `TasksScreen`，顶部加 `TodayScreen` 的添加框；`plan` = 「目標を決める」空态；`memo` = 现有 `NotesScreen`。
  - 用 `SwipeSegments` 切换，URL 参数 `?seg=calendar|todo|plan|memo` 可直达。
  - 右上「＋」：日历 → 新建个人日程；To-do → 聚焦添加框；计划 → 无（空态里的按钮）；笔记 → 新建笔记。
  - **四段的插槽冻结**：以后 R20（你）替换日历、To-do、笔记，R25（小雨）替换计划，只改各自那一段的组件，不改容器。
- **旧路由**：`/schedule`、`/tasks`、`/today`、`/notes`、`/followups` 改为跳转到 `/task?seg=…`；详情页（`tasks/[id]`、`notes/[id]`、`schedule/…` 子路由）仍是二级页面。推送通知和站内链接里指向旧路由的地方，统一改成新地址；旧地址的跳转保留不删。
- **首页顶栏**：左上头像 → `/profile`；右上 🔔（`/api/inbox/summary` 有未读时显示红点，不显示数字）→ `/inbox`；「編集」按钮点击后弹出 Toast「即将上线」（文案来自字典），R10 再接。首页内容本身不改。
- **「我的」**：变成二级页面，去掉自画底栏，改用 AppScreen；页面里保留「受信箱」一行作次入口。活动页同样去掉自画底栏。
- **二级页**：不显示底栏；返回回到进入它的一级 tab，恢复该 tab 的分段与滚动位置（在导航状态里记住）。Toast 位置随是否有底栏变化（R04 的 `ToastProvider` 读取壳提供的状态）。
- **冻结**：本 Sprint 合入后，`OrbitTabBar.tsx`、`app-navigation.ts`、`AppScreen.tsx`、`TaskScreen.tsx` 的插槽结构列为热点文件（负责人见 R09 的归属表），功能 Sprint 不得改结构。

## 范围与文件

- **新建**：`app/task.tsx`、`src/screens/task/TaskScreen.tsx`、壳相关渲染测试。
- **修改**：
  - `OrbitTabBar.tsx`、`OrbitNavigationIcon.tsx`（或并入 `Icon`）、`AppScreen.tsx`、`app-navigation.ts`、`mobile-route-access.ts`；
  - `EventsScreen.tsx`、`ProfileScreen.tsx`、`HomeDashboardScreen.tsx`（只改顶栏）；
  - 旧路由文件改为跳转；推送和站内链接生成处。
- **登记**：
  - `app-wide-route-coverage`：加入 `/task`；
  - `page-offline-inventory`：`/task` 登记为 local-first（内嵌页面本来就是 local-first），更新 :48-55 的断言，重新生成 md；
  - `PRIVATE_ROUTE_PREFIXES`：加入 `/task` 和 `/notes`；
  - `route-parity` 保持通过。
- **测试**：迁移第 7 条列出的全部导航测试到新结构（新的五项日文标签、iOrbit 进入全屏、Task 四段）；新增 `task-container.test.tsx`（四段切换、`?seg` 直达、旧路由跳转、离线可读）、`shell-back-restore.test.tsx`（返回恢复分段和滚动）。
- **不做**：首页内容（R10）；iOrbit 全屏的抽屉、✕ 和左缘右滑退出（R21）；各 tab 页面本身的重做。

## 验收契约

| SC | 操作链 | 主证据 |
| --- | --- | --- |
| SC-R05-01 新底栏 | 五项日文标签、玻璃胶囊；切换 ホーム / 人脈 / イベント / Task，点 iOrbit 进全屏（无底栏）；键盘弹出时底栏隐藏 | `ink-signal-shell`（迁移后）+ 模拟器截图 |
| SC-R05-02 Task 容器 | 四段可滑可点；`?seg=` 直达；「＋」按段行为正确；计划段空态 | `task-container.test.tsx` |
| SC-R05-03 旧链接与推送 | 旧的 `/schedule`、`/tasks`、`/today`、`/notes`、`/followups` 和一条推送通知都落到正确的段 | 测试 + 模拟器走查 |
| SC-R05-04 首页入口 | 头像进「我的」；🔔 有未读时显示红点（不显示数字）、点进收件箱；「編集」弹出即将上线 | 渲染测试 + 截图 |
| SC-R05-05 二级页规则 | 进入联系人详情、活动详情、设置、待办详情都没有底栏；返回后回到原 tab，分段和滚动位置恢复 | `shell-back-restore.test.tsx` + 模拟器 |
| SC-R05-06 离线与适配 | 断网时 Task 四段可读；320 宽和 2 倍字号下底栏每项 ≥44×44、标签不溢出 | 离线渲染测试 + `ink-signal-shell` |

### 必需证据子表

| SC | 子断言 | 证据 |
| --- | --- | --- |
| 01 | `app-navigation-source` 仍断言没有 Tabs（保持 Stack + 自画底栏） | 测试 |
| 03 | 推送和站内链接已改成新地址；旧地址的跳转仍保留 | 扫描 + 测试 |
| 05 | 「我的」和活动页不再自己渲染底栏 | 源码扫描测试 |
| 06 | 离线清单 md 已重新生成并与生成结果一致 | `page-offline-inventory.test.ts` |
| 全部 | 两端全量对照基线零新增失败；`tsc` 通过；`detect-changes` 写进 REPORT；`AppScreen` 的 props 没有变化 | 全量清单 + diff |

## 执行顺序

1. 记录基线；对 `AppScreen`、`OrbitTabBar`、`mainTabForPath` 跑 impact，在 REPORT 写明 CRITICAL / HIGH 的对策。
2. 先写导航新结构的测试（RED）：迁移旧测试、新增容器和返回恢复测试。
3. 实现底栏、`MainTab`、`AppScreen` 内部改动。
4. 实现 Task 容器和旧路由跳转；修改首页顶栏和「我的」。
5. 更新路由登记和离线清单；改推送和站内链接。
6. 模拟器全流程走查、全量测试、写 REPORT。

## 失败与交接

推送通知跳转无法在模拟器验证：用单元测试覆盖链接生成，并在 REPORT 写明用真机验证的步骤。

REPORT 交接内容：
- 壳的热点文件清单和插槽说明：各功能 Sprint 怎么往 Task 的某一段或某个 tab 放页面；
- 新的导航测试写法；
- 旧路由跳转表。
