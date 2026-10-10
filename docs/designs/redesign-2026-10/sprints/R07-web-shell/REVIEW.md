# Sprint R07 — REVIEW（独立复核）

**复核人：** 独立 AI 复核会话（不是执行人），2026-10-10。
**对象：** `git diff 4164d44e..9e577124`（Web `repos/orbits`），在 `redesign` HEAD `9e577124` 上复核（工作区另有 R08 未提交改动，未触碰）。
**依据：** PLANNER 修订 1（唯一契约）、GOAL.md；设计依据 `b8-responsive.html` 断点表（`RULES`）、`web.html`。REPORT 只作线索，下面的结论都是复核人重读源码、重跑测试或查证据目录得出的。
**说明：** `4164d44e` 误带了 `orbit-global-ask*.tsx` 的删除，REPORT「已知例外」已如实说明，本复核不再计为问题。

## 结论：有条件通过

主体已经做到，复核人独立核实过：
- **新壳挂载方式正确**：`A/layout.tsx` 统一挂 `Orbit2026Shell`；`AccountTopNav`、`OrbitGlobalAsk`、`RelationshipInboxTrigger` 挂载在 `app/`、`features/` 里零残留（扫描测试 + 复核人 grep）。
- **作用域不嵌套**：壳的左栏、标题区、右栏、胶囊都是独立的 `[data-orbit-2026]` 小岛，与 `[data-orbit-real-page]` 是兄弟节点，测试有断言。
- **插槽实现安全**：`slots.tsx` 把 setter 放在独立的 context 里，值不变；`ShellPage` 不订阅插槽值，不会出现渲染循环。卸载时 cleanup 会移除自己那一项，不会残留旧插槽。多个 `ShellPage` 按实例合并。
- **依赖页面上下文的节点**：`ShellDemoPill` 在页面的 `DemoModeProvider` 里读状态，再把不依赖上下文的 `Button` 交给插槽；`HomeHeaderActions` 的 `useToast` 取的是标题区自己的 `ToastProvider`。两处做法都正确。
- **登录路由**：dev server（未登录）实测 `/app/inbox`、`/app/tasks`、`/app/home`、`/app/agent/plan`、`/app/tasks?tab=plan` 都 307 到登录页，`next` 参数正确。
- **收件箱读取不增加**：红点走 `readInboxUnreadCounts`，与旧触发器 `fetchBadgeCount` 是同一路径，挂载时读一次。收件箱页 15 秒刷新的代码没有改动。
- **隐私说明**：已搬到 ⌘K 的「iOrbit に聞く」一行下方，三语齐全。
- **⌘K 的人脉搜索**：`/api/search/relationships` 走规则后端（`basic-rules-backend`），不调付费 AI。
- **R07 测试与 `tsc`**：复核人重跑 12 个相关测试文件，68 / 68 通过；`tsc --noEmit` exit 0。

但有 **5 条中等问题**：
- **M1**：窄屏（<768）下，收件箱、设置、主催、头像菜单（登出 / 语言 / 外观）、⌘K 全都没有入口。
- **M2**：签到 / 入场审核的 kiosk 页面挂上了新壳和 ⌘K，违反契约里「排除路由沿用 `orbit-ask-routes`」和「kiosk 保持现状」两条。
- **M3**：底部胶囊盖住了旧页面里固定定位的控件（活动详情的「问 iOrbit」球、`/app/home/events` 的提问坞），也没有给 Safari 底栏留安全区。
- **M4**：768–1279 档的右栏规格（变成标题区按钮或 380 抽屉）没有实现，右栏内容直接消失；REPORT 的 SC-02 却记为 ✅。
- **M5**：`/app/agent/plan` 跳到空的プラン段之后，产品里十多处「我的计划」链接都落到空态，现有计划在 Web 上没有入口。这是契约规定的做法，但碰到了契约自己的易错边界「旧链接失效」，需要产品负责人决定。

没有严重问题。

**条件：**
- M1–M4 在 `redesign` 上修完（RD-25）。壳在本 Sprint 冻结，这几条都改的是壳的结构，必须在功能 Sprint 开工前修，否则功能 Sprint 只能去改冻结文件。
- M5 由产品负责人二选一：接受（登记为已知例外，R25 前计划在 Web 上没有入口）；或者按 REPORT 自定决定 8 的建议，把现有 `IOrbitPlan` 放进プラン插槽，容器不用改。

## 逐 SC 核实

| SC | 结论 | 复核人做了什么 / 证据 |
| --- | --- | --- |
| 01 全站新壳 | ⚠️ 基本达成 | 路由规则 `shell-routes.ts` 与 `layout.tsx` 挂载经读码确认；零残留扫描成立。<br>「所有已登录页面」的证据只有路由规则单测，加上 12 个页面的截图（`screens/` 共 44 张）。联系人详情、活动详情、运营子页、iOrbit 子屏、`/app/inbox/sources/[id]` 都没有截图，也没有渲染测试（m6）。<br>kiosk 页面不该挂壳却挂上了（M2） |
| 02 三档宽度 | ❌ 部分 | 84 / 72 / 胶囊、1440 下右栏 360，测试成立。<br>1024 档右栏没有变成标题区按钮或抽屉（M4）。<br>390 档：胶囊只有 5 项，收件箱、设置、账号都没有入口（M1）；固定定位的旧控件被胶囊盖住（M3）。测试只检查了文档流里最后一行在胶囊之上 |
| 03 ⌘K | ⚠️ 基本达成 | Ctrl / ⌘+K（输入框里也能打开）、普通 k 不触发、680 宽距顶 96、↑↓↵、⌘↵ 交给 iOrbit、日文 chip、快捷键只注册一次，测试都成立。<br>没有沿用排除路由（M2）。<br>⌘↵ 的测试只断言了跳到 `/app/agent`，没有断言交接的文字和上下文（m6）。<br>左栏 ⌘K 按钮的可读名称是「⌘K」（m3） |
| 04 新入口 | ⚠️ | `/app/home` 不再跳转；`/app/inbox` 是内联面板；Task 四段、← →、`?tab=` 都有测试；`/app/agent/plan` 跳转在 dev server 上实测成立。<br>首页标题在中文 / 英文下仍显示「ホーム」（m1）；← → 抢占范围太宽（m4）；计划链接落到空态（M5） |
| 05 登录与路由 | ✅ / ⚠️ | 登录跳转经 dev server 实测成立。<br>`web-route-transport` 仍是 53，`inventory.json` 没有重新生成；契约写的是「53 → 新数量」，REPORT 转给了 R09（m7） |
| 06 主题与示例模式 | ✅ | 头像菜单的 自動 / ライト / ダーク 有测试；`ShellDemoPill` 读码正确，有迁移后的页面测试（`app-agent-iorbit-home`、`app-network-demo-mode`）。但窄屏下头像菜单没有入口（M1） |

### 必需证据子表

| SC | 子断言 | 复核结论 |
| --- | --- | --- |
| 01 | 新壳根节点不在旧作用域里 | ✅ |
| 01 | 旧顶栏、悬浮球代码已删，无引用残留 | ✅ `AccountTopNav` / `OrbitGlobalAsk` 已删。`OrbitTopNav` 按自定决定 1 保留给公开页，但其中只在登录后出现的分支（账号菜单、语言切换）已经没有调用方（m7） |
| 03 | 全局快捷键只在壳里注册一次 | ✅ |
| 04 | 收件箱轮询频率与读取字节不变 | ✅ 代码路径一致（同一函数、同一计时器）。没有实测字节，REPORT 已如实说明。REPORT 说「壳跨页面存活，读取只会更少」不成立，见 m2 |
| 全部 | 全量零新增、`tsc`、`detect-changes` | ⚠️ 复核人只重跑了相关测试（68 / 68）和 `tsc`（0）。按指示没有跑全量；`detect-changes` 只核对了证据文件 |

## 运行时抽查

| 命令 / 操作 | 结果 |
| --- | --- |
| `node scripts/run-node-tests.mjs`：`orbit-2026-shell`、`orbit-2026-cmdk`、`app-inbox-page`、`app-tasks-container`、`orbit-2026-scope`、`orbit-2026-css-tokens`、`no-hardcoded-copy`、`orbit-top-nav-structure`、`orbit-global-ask-pinned-bar`、`orbit-settings-theme`、`orbit-modal-standard`、`orbit-global-ask-routes`（en-US） | 68 / 68 通过 |
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `curl` dev server（未登录）`/app/inbox`、`/app/tasks`、`/app/home`、`/app/agent/plan`、`/app/tasks?tab=plan` | 全部 307 到 `/app/account/login?next=…`，`next` 编码正确 |
| 查看 `~/orbit-sprint-evidence/redesign/R07/run-01/screens/` | 44 张，覆盖 12 个路由。`home_events-390` 里看不到 `AgentDock`，它在胶囊下面（M3）；`inbox-1440` 里内容贴着左栏，没有主区外边距（m5） |

## 问题清单

### 严重

无。

### 中等

**M1 窄屏（<768）没有收件箱、设置、主催、账号菜单和 ⌘K 的入口**
- **现象**：
  - `Orbit2026Shell.tsx:166-178` 的底部胶囊只有 ホーム / 人脈 / iOrbit / イベント / Task 五项。
  - `shell.module.css:153-158` 在 <768 时整个隐藏左栏，左栏里的受信箱、⌘K、主催、設定、头像菜单一起消失。
  - 旧页面不设插槽，标题区不出现，所以窄屏下壳里没有其他入口。
- **对照**：`b8-responsive.html` 断点表 390 列写的是「底部胶囊 5 项……；**受信箱 进顶部圆钮**」。旧顶栏在手机上有汉堡菜单（个人资料、我的活动、运营中心、设置、退出登录）和收件箱触发器。
- **影响**：手机浏览器上用户不能登出，不能切换语言或外观，打不开收件箱、设置、主催；只能手动输网址。悬浮提问球已删，⌘K 在触屏上也按不出来，所以窄屏上除了 iOrbit 页以外没有提问入口。`orbit-2026-shell.test.tsx:82` 断言胶囊正好 5 个链接，把这个缺口锁进了测试。
- **建议修法**：
  - <768 时始终画一条精简的顶部条（或让标题区始终出现）：右侧放受信箱圆钮（带红点）和头像；
  - 头像菜单在窄屏下增加 設定、主催 两行，以及一个搜索 / iOrbit に聞く 入口（打开同一个面板）；
  - 390 测试补「受信箱、头像菜单、登出可达」的断言。

**M2 kiosk（签到 / 入场审核）挂上了新壳和 ⌘K；排除路由规则失效**
- **现象**：
  - `shell-routes.ts:8-9` 的例外里没有 `/app/events/[id]/operations/check-in` 和 `/admission`；
  - `orbit-2026-shell.test.tsx:32` 反而断言 check-in 有壳；
  - `CommandPalette.tsx` 和 `useCommandPaletteShortcut` 都不调用 `allowsOrbitAsk`（`orbit-ask-routes.ts:56`）。这个函数现在只有 `orbit-global-ask-routes` 测试在用，等于死代码，测试却还在为它的排除名单把关。
- **对照**：PLANNER 契约写「排除路由沿用 `orbit-ask-routes.ts` 的规则」；「失败与交接」写「如 kiosk、admin：保持现状」。`orbit-ask-routes.ts` 自己的注释也说明了原因：签到与入场是「手上有事、旁边有人排队」的场景，浮层只会碍事。
- **影响**：签到大屏上出现左栏和底部胶囊，工作人员可以误点离开签到页；⌘K 能在 kiosk 上打开搜索人脉的面板。
- **建议修法**：
  - `shell-routes` 增加按路径片段排除（复用 `orbit-ask-routes` 的 `EXCLUDED_SEGMENTS`，或直接让 `shellAppliesTo` 调用 `allowsOrbitAsk` 加壳自己的例外）；
  - 快捷键在 `!allowsOrbitAsk(pathname)` 时不注册；
  - 测试把 check-in / admission 移到「没有壳」一组。

**M3 底部胶囊盖住旧页面的固定定位控件；没有给 Safari 底栏留安全区**
- **现象**：
  - 胶囊：`shell.module.css:112-118`，`position: fixed`，left / right / bottom 都是 14，高 62，`z-index: var(--z-sticky)`（100）。
  - 活动详情的「问 iOrbit」球：`events-shell.tsx:294`、`:304`，z 80，在 <760 时位于 right 14 / bottom 14、54×54。它被胶囊完全盖住，点不到。
  - `/app/home/events` 的 `AgentDock`：`orbit-real-home.tsx:623`，bottom 18，z 也是 sticky。它在 DOM 里排在胶囊前面，所以被盖住。截图 `home_events-390-light.png` 里看不到它。
  - 胶囊 `bottom: 14px` 没有加 `env(safe-area-inset-bottom)`。
- **对照**：PLANNER 易错边界「窄屏下底部胶囊遮挡页面内容」；`b8` 断点表「Safari 底栏之上」。
- **测试的缺口**：`.content { padding-bottom: 96px }` 只对文档流内容有效。测试（`orbit-2026-shell.test.tsx:76-90`）也只检查了文档流里最后一行。
- **影响**：窄屏下活动详情页的提问入口消失；`/app/home/events` 的输入坞被遮住。在 iPhone 上，胶囊离 Home 指示条太近。
- **建议修法**：
  - 壳在 <768 时往根节点写一个 CSS 变量，例如 `--orbit-shell-bottom-inset: calc(76px + env(safe-area-inset-bottom))`；
  - 旧页面里固定在底部的元素（`ev-orb-dock`、`AgentDock`、各页 toast）的 `bottom` 都加上这个变量；
  - 胶囊自己的 `bottom` 改为 `calc(14px + env(safe-area-inset-bottom))`；
  - 390 测试补一条：页面内所有 `position: fixed` 的可交互元素不与胶囊的矩形相交；
  - 另外，`AgentDock` 用 `left: 50%` 居中，1440 下没算上 84 的左栏，会偏出主区中线。顺手改为按主区居中。

**M4 768–1279 档的右栏规格没有实现，REPORT 的 SC-02 记为 ✅ 不成立**
- **现象**：`shell.module.css:146` 在 <1280 时直接 `display: none` 右栏。REPORT「做了什么」1 写「768–1279……没有右栏」，没有替代入口。
- **对照**：PLANNER「已查清的事实」第 9 条：「768–1279：……右栏变成主标题区按钮或 380 抽屉」。SC-02「左栏、右栏、底部胶囊、抽屉宽度都符合断点规格」。详情抽屉的 600 / 520 / 全屏三档，R07 也没有提供证据。
- **影响**：1024 下首页的「次の一手」和「iOrbit に聞く… ⌘K」入口直接消失。更关键的是，壳的插槽结构本 Sprint 冻结；功能 Sprint 接上右栏数据时，要么改冻结文件，要么在 1024 下没有右栏。
- **建议修法**：
  - <1280 且页面设了 `rightRail` 时，标题区右侧自动加一个按钮（以后可带计数），点了用 R06 的 `Drawer` 以 380 宽打开同一份右栏内容；
  - 测试补 1024 下「按钮存在、抽屉 380」；
  - 详情抽屉三档宽度如果属于 R06 `Drawer`，在 REPORT 里注明证据位置。

**M5 `/app/agent/plan` 跳到空的プラン段：产品里的计划链接全部落到空态（需产品决定）**
- **现象**：`agent/plan/page.tsx` 只做 `redirect("/app/tasks?tab=plan")`，プラン段是「目標を決める」空态，按钮只提示即将上线。复核人 grep 到仍指向 `/app/agent/plan` 的入口：
  - `contacts/analysis/opportunities-report-card.ts:9`、`opportunities-view-model.ts`：「本周建议动作」直链 `#plan-action-<id>`；
  - `agent/iorbit-0918/iorbit-plan-card.tsx:24`；`iorbit-strategy.tsx:571`、`:606`；`iorbit-home.tsx:804`「查看日程」；
  - `_demo/demo-persona.ts:239`、`:274`；
  - `inbox/inbox-panel-view-model.ts:239`、`:265`；
  - `agent/home-facts-route-service.ts:66`；
  - `orbit-product-href.ts:20-22`；
  - `contacts/network-0918/detail-return.ts:173`。
- **对照**：契约确实规定了这个跳转，以及プラン段先放空态。但契约的易错边界也写了「`/app/agent/plan` 的旧链接失效」。现在链接不是 404，而是落到一个没有计划内容的空态，锚点也丢了。REPORT 自定决定 8 已请产品负责人确认。
- **影响**：已有计划的用户在 Web 改版分支上看不到自己的计划、本周行动和约见准备；iOrbit 卡片和分析页的「去计划」都变成死路。
- **建议修法（二选一，由产品负责人定）**：
  - (a) 把现有 `IOrbitPlan`（服务端按 `read-current-plan.ts` 组好）放进プラン插槽，空态只给没有计划的用户。容器、页签、`?tab=` 都不变，R25 只替换这一段。跳转同时保留 hash：`/app/tasks?tab=plan#plan-action-…` 由客户端补上。
  - (b) 接受现状，登记为已知例外，并把上面这些入口暂时改指 `/app/tasks?tab=plan`，至少少一次跳转。

### 轻微

- **m1 首页标题在中文 / 英文下仍是「ホーム」**：`HomePlaceholder.tsx:15` 的 `useStandardCopy()` 在 `Orbit2026Scope` 之外调用，`useScope` 回退到日文（`Scope.tsx:73-76`）。修法：改用 `pickCopy`，或者用 `standardCopyFor(language).nav.home`。
- **m2 左栏是普通 `<a>`，每次点击都整页重载；REPORT 的说法不准**：`Orbit2026Shell.tsx:101-123`、`:171`。
  - 壳并不「跨页面存活」：每点一次都重新挂载、重读一次红点，与旧顶栏一样，并不是「只会更少」。⌘K 草稿也会丢。
  - 旧顶栏的 `preserveHref` 会带上 `?lang=`，新壳没有带。用户靠网址参数（而不是 cookie）进来时，换页后语言可能回退。
  - 修法：用 `next/link`（或至少 `preserveHref`），并改 REPORT 那句话。
- **m3 左栏紧凑档和 ⌘K 按钮的无障碍**：
  - 1024 下文字只放在原生 `title` 里。设计要求悬停时出黑色 tooltip；键盘聚焦时什么都不显示。
  - ⌘K 按钮的可读名称是「⌘K」（`Orbit2026Shell.tsx:112-115`），读屏听到的不是「iOrbit に聞く」。Windows 上也显示 ⌘ 而不是 Ctrl。
  - 修法：加 `aria-label`；做一个在悬停和聚焦时都出现的 tooltip；按平台显示快捷键。
- **m4 Task 的 ← → 抢占范围太宽**：`TaskContainer.tsx:31-45` 在 window 上监听，只排除了输入框、tablist 和 dialog。焦点在旧页面的 radiogroup / listbox / menu / slider / grid 或可横向滚动的区域时，方向键会被拿去切页签。effect 没有依赖数组，每次渲染都会重新注册。`:29` 的 `router.replace` 会丢掉 `view=completed` 等其他参数。修法：只在焦点位于 body、页签栏或容器本身时响应（或者额外排除上述 role 和可滚动容器）；保留其他查询参数。
- **m5 收件箱页细节**：
  - 已经在 `/app/inbox` 时如果再触发 compose 事件，`router.push` 到同一个地址不会重新挂载页面，起草种子留在 sessionStorage 里，下次进来才突然弹出（`inbox-bridge.tsx:15-18`）。修法：在收件箱页时直接派发给已挂载的面板。
  - 内联面板贴着左栏，没有主区外边距 34 / 26 / 18（截图 `inbox-1440-light.png`）。
- **m6 测试证据偏弱**：
  - `app-inbox-page` 四条全是对源码做正则匹配；
  - SC-01「所有已登录页面」只有路由规则单测；
  - shell 测试里的示例药丸是普通 `<button>`，不是真实的 `ShellDemoPill`；
  - ⌘↵ 没有断言交接的文字和上下文；
  - 没有左栏的键盘走查测试（Tab 顺序、`aria-current`、头像菜单用键盘打开和关闭）。
  - 修法：补渲染测试，至少覆盖联系人详情、活动详情、一个运营子页、iOrbit 子屏、收件箱来源页。
- **m7 遗留与登记**：
  - `allowsOrbitAsk` 已无调用方（见 M2）；
  - `OrbitTopNav` 里只在登录后出现的账号菜单和语言切换已无调用方；
  - `iorbit-plan.tsx:175` 的 `ShellDemoPill` 接线目前不可达（见 M5）；
  - 旧账号菜单的「我的活动」（`/app/events?scope=registered`）在新壳里没有入口；
  - `web-route-transport` 仍是 53，`inventory.json` 没有 `/app/inbox`。契约写的是「53 → 新数量」，REPORT 转给了 R09。
  - 以上都请写进 R09 的总验收清单。

## 对 REPORT「自定决定」的评价

| # | 评价 |
| --- | --- |
| 1 公开页保留公开顶栏 | 合理（页面少，且归功能 Sprint）；`OrbitTopNav` 的登录后分支应清理（m7） |
| 2 壳是新作用域小岛、旧页面是兄弟节点 | 合理，比整体包住更彻底，复核确认没有嵌套 |
| 3 标题区只在设了插槽时出现 | 桌面上合理；窄屏会因此没有任何顶部入口（M1） |
| 4 右栏按页面选择 | 合理；但 <1280 的替代形态缺失（M4） |
| 5 红点只在挂载时读 | 合理；「读取只会更少」的理由不成立（m2） |
| 6 ⌘K 在输入框里也生效 | 合理，对标成立 |
| 7 日历段放个人日程 | 合理（RD-20） |
| 8 `/app/agent/plan` 按契约跳转 | 照契约执行，影响面比 REPORT 写的大（M5） |
| 9 人脉搜索复用接口、最多 6 条 | 合理；复核确认不调用付费 AI |
| 10 语言名用各自语言 | 合理 |
| 11 左栏字号 11 | 合理 |
| 12 隐私说明放 ⌘K | 合理 |
| 13 示例药丸改用新 `Button` | 合理 |
| 14 旧测试交子会话迁移 | 可以；被删的断言都列了，复核抽查 `app-agent-guide-demo-page` 的 W0014 三条，理由成立（页面只剩跳转） |

**REPORT 与实际不符的说法**：
- SC-02「三档宽度 ✅」（M1、M3、M4）；
- 「壳跨页面存活，读取次数只会更少」（m2）；
- SC-01「依次打开所有已登录页面」：实际只有 12 个路由（m6）。

## 附：复核人留下的痕迹

- 没有修改任何仓库文件，本次只新增了本文件。测试日志在会话 scratchpad。
- 没有启动服务器，只用 `curl` 访问了已在运行的 dev server（未登录）。没有登录，没有连 Neon，没有调用付费 AI。

## 处理记录（执行人，2026-10-10）

M1–M4 和全部 m 已修；M5 按契约（RD-20）保留跳转，产品选择列在最后。修复后：R07 相关测试（`orbit-2026-shell` 13 条、`app-tasks-container`、`app-inbox-page`、`orbit-2026-cmdk`、作用域 / token / 写死文字门禁等）全过，`tsc` 0，`copy:qa` 0；全量见 R09 REPORT 的基线对照。

| # | 处理 |
| --- | --- |
| M1 | <768 加顶部条（`ShellMobileTop`）：搜索 / iOrbit に聞く（打开同一个 ⌘K 面板）、受信箱圆钮（带红点）、头像菜单；头像菜单增加「参加するイベント」（`/app/events?scope=registered`，旧菜单的「我的活动」），窄屏下再加「設定」「主催」。红点读取由左栏和顶部条共用（一次）。测试：390 下顶部条可达受信箱、面板、菜单的四个链接和登出，读取只有一次；胶囊仍是 5 项（与 App NAV-V3 一致） |
| M2 | `shellAppliesTo` 叠加 `allowsOrbitAsk`（排除 check-in / admission 等 kiosk 页面），壳不挂、⌘K 也就不注册；`allowsOrbitAsk` 因此重新有调用方。测试把这两个路径移到「没有壳」一组 |
| M3 | 胶囊 `bottom` 加 `env(safe-area-inset-bottom)`，内容区底部留白同样加安全区；壳在 <768 设 `--orbit-shell-bottom-inset: 76px`，活动详情的提问球和 `/app/home/events` 的 `AgentDock` 把它加进自己的 `bottom`（其他宽度为 0，不变；`AgentDock` impact 为 CRITICAL，改动只是在 `bottom` 里加一个缺省为 0 的变量）。测试：390 下旧页面的固定控件在胶囊之上。`AgentDock` 在 1440 下按视口居中（没算左栏）属于旧屏外观，登记给 R10 |
| M4 | 页面要右栏且宽度 <1280 时，主标题区右侧出现「次の一手を開く」按钮，点开 R06 `Drawer`（`sm` = 380）显示同一份右栏内容；换页自动关闭。测试：1024 下按钮存在、抽屉 380、Escape 关闭。详情抽屉 600 / 520 / 全屏三档属于 R06 `Drawer`，证据在 R06 `orbit-2026-modal` 测试 |
| M5 | 保留 `/app/agent/plan` → `/app/tasks?tab=plan`（PLANNER 契约、RD-20：プラン段先放「目標を決める」空态）。浏览器在服务端跳转时会保留原 `#plan-action-…` 片段。现有链接不改（跳转可用，R25 重写计划时统一换）。**请产品负责人二选一**：(a) 把现有 `IOrbitPlan` 放进プラン插槽，空态只给没有计划的人；(b) 维持现状（已登记为已知例外） |
| m1 | `HomePlaceholder` 标题改用 `standardCopyFor(language)`，中英文界面显示「首页 / Home」 |
| m2 | 左栏、胶囊、顶部条、头像菜单全部改用 `next/link`，壳跨页面保持挂载；REPORT 的说法已改。`?lang=` 网址参数：语言以 cookie 为准（`orbit-lang`），不再拼参数 |
| m3 | 紧凑档的文字以 tooltip 在悬停和键盘聚焦时出现（`data-tip` + `:focus-visible`，测试断言聚焦时的伪元素内容）；⌘K 按钮的可读名称改为「検索 · iOrbit に聞く（⌘K / Ctrl K）」，非 Apple 平台显示 Ctrl K |
| m4 | ← → 只在焦点位于页面本身或 Task 栏时切页签，插槽里的任何控件（单选组、列表、滚动区等）都保留方向键；监听只注册一次；切页签保留其他网址参数。测试补单选组和可滚动区 |
| m5 | 已在收件箱页时，桥接直接把起草种子交给已挂载的面板（面板按新种子重新挂载），不再等下次进入；收件箱页加主区外边距（34 / 26 / 18）。测试改为渲染测试：不在收件箱时带种子跳转，在收件箱时直接送达、不跳转 |
| m6 | 补了渲染测试：窄屏顶部条、1024 抽屉、tooltip 与 Tab 顺序、固定控件不被遮挡、桥接两条路径、kiosk 无壳、Task 方向键范围。真实的 `ShellDemoPill` 由 `app-network-demo-mode` 和 `app-agent-iorbit-home` 在插槽里渲染覆盖。全站逐页走查放在 R09（1440 / 1024 / 390 × 浅深 × 三语 × 键盘） |
| m7 | 写进 R09 的「合回前总验收」：`OrbitTopNav` 登录后分支已无调用方、`iorbit-plan.tsx` 的药丸接线在 M5 定案前不可达、`web-route-transport` 与 `inventory.json` 未含 `/app/inbox` |

**请产品负责人确认**：M5（プラン段放现有计划，还是维持空态）。

### 产品决定后的处理（2026-10-10）

M5 已按产品决定 (a) 落实（原话：「7的话a就行」）：
- Task › プラン 显示现有「我的计划」界面（`agent/plan/plan-slot.tsx`，与原 `/app/agent/plan` 页同一套服务端组装：示例模式、当前计划 + 联系人名 + 跟踪信息、「计划暂时读不到」）；只有没有计划的人看到「目標を決める」空态，按钮去原来的起点（引导开时 `/app/start`，否则 `/app/agent`）。容器、页签、`?tab=` 不变，R25 只替换这一段；
- 服务端只在 `?tab=plan` 时读计划，客户端切到プラン会重新请求页面（读取前显示骨架）；
- `/app/agent/plan` 保留为兼容跳转：浏览器跨跳转保留 `#plan-action-…`，プラン段挂载后定位到对应行（真实页面验证：跳到 `/app/tasks?tab=plan#plan-action-…` 且该行在视口内，`plan-slot/` 截图）；
- 旧入口（UI 里十多处、`features/**` 服务端产生的 href、活动跟进 `taskHref` 的字面量类型）没有逐个改：它们经兼容跳转都能落到正确位置和锚点，而且大多在 R21 / R25 要整屏重写的旧屏里，逐个改要动 38 个测试文件（RD-24）。登记进合回前总验收：R25 统一换地址并删除跳转；
- 测试：`app-tasks-container` 新增 3 条（有计划显示界面、无计划空态按钮去起点、未读取显示骨架；锚点定位；服务端只在 `?tab=plan` 读取且旧地址仍是跳转）。
