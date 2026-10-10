# Sprint R07 — REPORT

**执行人：** 小雨的执行会话，2026-10-10。**依据：** PLANNER 修订 1、README 通用规则、RD-02、RD-05、RD-17、RD-19、RD-20、RD-24、RD-25；R01 复核 m4、R03 复核 M2（都转给本 Sprint）。
**基线：** `redesign` `4164d44e`（R06 复核修复后）。orbits 6890 条，既有失败 6 条：5 条 Node 26 `DEP0205` 子进程测试、审计「visible controls have static accessible-name evidence」（指向 R04 的 App 文件）。`typecheck` / `typecheck:app` / `lint` 0。App 4170 条 / 3 条既有失败。
**证据：** `~/orbit-sprint-evidence/redesign/R07/run-01/`（`screens/`：本地 dev server 登录 QA 账号后 12 个已登录页面 × 1440 / 1024 / 390 浅色 + 4 个页面 1440 / 390 深色；`compare.html`；`orbits-test.log`、`typecheck*.log`、`lint.log`、`app-test.log`、`impact-summary.txt`、`detect-changes.txt`）。

## 做了什么

1. **新壳 `Orbit2026Shell`**（`A/orbit-2026/shell/`，`A` = `app/(app)/app`），由 `A/layout.tsx` 统一挂载，页面不再自己挂导航：
   - **左栏 84**：logo、ホーム / 人脈 / iOrbit / イベント / Task / 受信箱（未读红点）、⌘K、主催、設定、头像菜单。标签读标准用词 `nav.*`（三语，R03 M2 在此关闭），图标读 `Icon`。当前项 `aria-current="page"`，深层页面高亮所属栏目（运营、分析、现场页高亮「主催」）。
   - **主标题区**：页面用 `<ShellPage title subtitle left right demoPill rightRail />` 设插槽；有插槽时才画（旧页面自带标题，不重复）。
   - **右栏 360**：页面传 `rightRail` 时出现（≥1280）；骨架默认内容是「次の一手」「最近の会話」空态 +「iOrbit に聞く… ⌘K」入口；iOrbit 页永远没有右栏。
   - **三档宽度**：≥1280 左栏 84 + 可选右栏；768–1279 左栏 72 只显示图标（文字留给读屏和 tooltip）、没有右栏；<768 没有左栏，底部玻璃胶囊 5 项，内容底部留 96 不被遮挡。主区外边距 34 / 26 / 18。
   - **作用域**：壳的各部分都是独立的 `[data-orbit-2026]` 小岛，与旧页面的 `[data-orbit-real-page]` 是兄弟节点，互不嵌套（RD-18）。
   - 路由规则 `shell-routes.ts`：已登录的 `/app/**` 都有壳，例外是 `/app`（落地页）、`/app/account/**`、`/app/login-admin`、`/app/admin/**`（主办方管理台自有 `HostShell`）、`/app/o/**`（公开主办方页）、`/app/start`、`/app/register`、`/app/platform`、`/app/profile/onboarding`（全屏引导）。未登录不出现。
   - 常量 `ORBIT_2026_SIDEBAR 84`、`_COMPACT 72`、`_RAIL 360`、`_HISTORY 260`、`_WIDE 1280`、`_NARROW 768` 加进 `orbit-layout-constants.ts`，旧的 212 保留。
2. **头像菜单**（`Popover`）：マイページ、语言（日本語 / 中文 / English，从旧顶栏搬来）、外观 自動 / ライト / ダーク（`setOrbitThemePreference`，默认跟随系统，RD-05）、ログアウト。
3. **⌘K 面板**（`CommandPalette.tsx`，`Modal top` 680）：⌘K / Ctrl+K 在壳里任何地方打开（输入框里也行，普通字母键不会），快捷键只在壳里注册一次；输入后用现有 `POST /api/search/relationships` 搜人（250ms 防抖，最多 6 条），↑↓ 选、↵ 打开联系人；⌘↵ 或最后一行「iOrbit に聞く」把文字交给 iOrbit，沿用悬浮球的交接（`orbit-ask-context` → 页面自己的提问落点或 `stashPendingAsk` → `/app/agent`，`hasPendingOrbitAgentHandoff` 不变）；显示当前页面上下文 chip，`orbit-ask-routes.ts` 的上下文补齐日文并加了 Task。
4. **新入口**：
   - `/app/home`：不再跳 `/app/agent`；占位（说明 + 占位行）、主标题区 🔔 + 編集（提示「近日公開」，与 App 一致，RD-21）、默认右栏。
   - `/app/inbox`：收件箱页面 = 原抽屉组件的内联模式（`RelationshipInboxPanel inline`：没有遮罩、焦点锁、拖宽、关闭）；读取与 15 秒刷新原样。原来打开抽屉的窗口事件（iOrbit 卡片「メールを下書き」等）由壳的 `InboxEventBridge` 转成访问 `/app/inbox`，起草种子经 sessionStorage 带过去。
   - `/app/tasks`：Task 四段容器（`TaskContainer`）：カレンダー = 现有个人日程、To-do = 现有待办页、プラン =「目標を決める」空态、メモ = 空态（Web 原来没有笔记页，R20 做）；页签 + ← → 键（文字输入、页签自身、对话框里不拦截），`?tab=`。插槽冻结。
   - `/app/agent/plan` → `/app/tasks?tab=plan`（`IOrbitPlan`、`read-current-plan.ts` 保留给 R25）。
5. **登录路由**：`/app/inbox` 加进 `ORBIT_PRIVATE_APP_PREFIXES`（`/app/home`、`/app/tasks` 原来就在）。
6. **删除**：`AccountTopNav`（23 个文件的挂载点全部移除）、`OrbitGlobalAsk` 悬浮球与其样式文件、`RelationshipInboxTrigger` 的所有挂载（导出保留给测试和抽屉模式）、两个只在已登录场景出现的边界页里的 `PublicTopNav`（`ops-boundary`、`orbit-route-boundary-frame`）。
7. **公开页**：保留现有公开顶栏（`OrbitTopNav` / `PublicTopNav`）——落地页、登录页背景、公开主办方页、未登录的活动列表和活动详情；活动页按 `{authenticated ? null : <PublicTopNav … />}`。
8. **示例模式药丸**：新组件 `ShellDemoPill`（`orbit-2026/shell/ShellDemoPill.tsx`）放在页面的 `DemoModeProvider` 里读示例状态，再把一个不依赖上下文的 R06 `Button`（三语，「サンプル · ガイドを続ける」）交给壳的 `demoPill` 插槽；横条收起时出现，点了重新展开。`network-demo-frame`、`iorbit-shell`（示例分支）、`iorbit-plan`（经 `iorbit-screen-frame` 的 `navExtra`）都改用它；旧的 `DemoNavPill` 删除（三个调用方都已迁移）。
   - 第一版直接把 `<DemoNavPill />` 交给插槽，药丸在壳里拿不到 `DemoModeProvider`、永远不显示，样式也只在旧作用域里有——旧测试迁移时发现，已修（`app-agent-iorbit-home` 4 条、`app-network-demo-mode` 1 条）。
   - 插槽改为**按 `ShellPage` 实例合并**：一个页面可以同时有多个 `ShellPage`（例如示例药丸 + 标题），各自只设自己写的插槽，同一个插槽后挂载的生效；以前后一个会把前一个整个覆盖。
9. **隐私说明**：原悬浮提问框输入框下的「发送后进入 iOrbit 对话 · 涉及对外动作会先经你确认」随悬浮框删掉了；现在放在 ⌘K 面板「iOrbit に聞く」一行下面（三语，`data-orbit-agent-privacy-boundary`）。
10. **测试**：新增 `orbit-2026-shell`（10 条：插槽合并、路由规则、1440 左栏结构与当前项、1024 紧凑栏、右栏 360 与 iOrbit 无右栏、390 底部胶囊不遮挡、示例药丸插槽、未读一次读取、头像菜单语言 / 外观 / 登出、未登录无壳、旧顶栏 / 悬浮球零残留扫描）、`orbit-2026-cmdk`（4 条）、`app-inbox-page`（4 条）、`app-tasks-container`（3 条）。迁移的旧测试见「基线 → 收口」。

## 验收

| SC | 结论 | 证据 |
| --- | --- | --- |
| 01 全站新壳 | ✅ | 本地 dev server 登录 QA 账号后依次打开 12 个已登录页面，三种宽度下每页 `[data-orbit-2026-shell]` 存在、旧顶栏 0（脚本输出写在 `screens/` 旁）；`orbit-2026-shell` 零残留扫描（`app/`、`features/` 里没有 `AccountTopNav` / `OrbitGlobalAsk` / `RelationshipInboxTrigger` 挂载） |
| 02 三档宽度 | ✅ | `orbit-2026-shell`：84 / 72 / 胶囊、右栏 360（≥1280）、390 下最后一行在胶囊之上、无横向滚动；截图 `*-1440/1024/390-light.png` |
| 03 ⌘K | ✅ | `orbit-2026-cmdk`：Ctrl+K / ⌘K（含输入框内）打开、普通 k 不开、焦点在输入框、680 宽距顶 96、搜索 ↑↓↵ 打开联系人、⌘↵ 交给 iOrbit（`/app/agent`）、日文上下文 chip、快捷键只注册一次 |
| 04 新入口 | ✅ | `/app/home` 200 无跳转（截图 `home-*`）；`app-inbox-page`（内联模式、读取与频率不变）；`app-tasks-container`（四段、← →、`?tab=`）；dev server 上 `/app/agent/plan` 落到 `/app/tasks?tab=plan` |
| 05 登录与路由 | ✅ | `app-inbox-page`（`/app/inbox`、`/app/tasks`、`/app/home` 都是私有前缀）；审计与产品清单更新后通过 |
| 06 主题与示例模式 | ✅ | 默认跟随系统（R01 的初始化脚本）；头像菜单切 ダーク / 自動（`orbit-2026-shell`）；示例药丸在主标题区（同上）；深色截图 `*-dark.png` |

### 必需证据子表

| SC | 子断言 | 结论 |
| --- | --- | --- |
| 01 | 新壳根节点不在旧作用域里；旧页面内容在各自旧作用域里正常显示 | ✅ `orbit-2026-shell`（两者互不嵌套）、`orbit-2026-scope`（旧页面文件不渲染新作用域）、截图 |
| 01 | 旧顶栏、悬浮球代码已删，无引用残留 | ✅ 扫描测试 |
| 03 | 全局快捷键只在壳里注册一次，不在被 `orbit-modal-standard` 扫描的对话框文件里 | ✅ `orbit-2026-cmdk` |
| 04 | 收件箱页轮询频率与读取字节和改造前一致 | ✅ 同一组件同一读取：面板 15 秒 `refreshCounts`（仅可见时、不重叠）+ 当前页签自己的读取，内联模式没有改动这些代码；红点由壳在挂载时读一次（旧顶栏每进一个页面读一次，现在壳跨页面存活，读取次数只会更少）。测量方式写在「已知例外」 |
| 全部 | 两端全量零新增；`tsc` / `typecheck:app` / `lint`；`detect-changes` | 见下 |

## 自定决定（用户指示：疑问一律选推荐方案，写明理由）

1. **公开页保留现有公开顶栏**，不做「访客模式」的新壳：公开页只有落地页、公开主办方页、未登录活动列表 / 详情、登录页背景这几类，它们分别属于落地页 / 活动的功能 Sprint（归属表），换壳会和那些页面的重写重复。`OrbitTopNav` 因此保留（只给公开页用），`AccountTopNav` 删除。
2. **壳的各部分是新作用域「小岛」，旧页面是它们的兄弟**，而不是一个大作用域包住旧页面：新作用域的基础重置（按钮、标题、列表）会漏进旧页面（R06 复核 m5 已把优先级降到 0，但兄弟结构更彻底）。
3. **主标题区只在页面设了插槽时出现**：旧页面都自带大标题，壳再画一个会重复；新页面（首页、Task、收件箱）设插槽。
4. **右栏按页面选择**（只有首页占位用了默认右栏）：旧页面按全宽设计，强加 360 右栏会把它们挤坏；功能 Sprint 换页时再接右栏。
5. **收件箱红点只在壳挂载时读一次**、不轮询；收件箱页本身保持 15 秒刷新。对标 Gmail 网页版左栏未读数随页面刷新而不是高频轮询；这样读取次数不增加（D24 / D25 轮询约束）。
6. **⌘K 在输入框里也生效**，普通键不生效。对标 Linear、Slack、GitHub。
7. **Task 的日历段放现有「个人日程」**（Web 没有日历网格），与 RD-20「先放现有页面」一致；`/app/tasks/personal` 仍可直接打开。
8. **`/app/agent/plan` 按契约跳到 プラン 段**，代价是现有 iOrbit 计划界面在改版分支里暂时没有入口（R25 重做）。请产品负责人事后确认；如需保留旧计划界面，可把它放进 プラン 插槽，不改容器。
9. **⌘K 的人脈搜索复用 `/api/search/relationships`**，最多显示 6 条：契约指定；全量结果在人脉页。
10. **语言名用各自的语言写**（日本語 / 中文 / English，所有界面语言下一样）：通行做法，方便看不懂当前界面语言的人切回来。
11. **左栏文字字号用 `--fs-caption` 11**（设计稿 10.5）：R06 门禁只认 token，差 0.5px 不值得为它再加一个 token。
12. **隐私说明放在 ⌘K 面板「iOrbit に聞く」下面**：⌘K 是悬浮提问框的继任入口；iOrbit 对话页本身的输入区属于旧屏（R21 重写），不在骨架里改。对标 ChatGPT / Copilot 在输入入口下方常驻一行数据说明。
13. **示例药丸改用新组件 `Button`（accent、sm、三语）**，不沿用旧的 `.ir-demo-pill` 样式：药丸现在画在壳的新作用域里，旧作用域的样式够不到；颜色与旧药丸同属强调色。
14. **旧测试迁移交给一个只改测试的子会话**，源码只由本会话改：它报告的 2 个源码问题（示例药丸拿不到上下文、隐私说明丢失）由本会话修（「做了什么」8、9）。

## 基线 → 收口

| | 基线（`4164d44e`） | 收口 |
| --- | --- | --- |
| orbits `npm test`（en-US） | 6890 条，6 条既有失败 | 6928 条（+38），全量一次跑出 8 条失败，其中 2 条是新增、已修并单独重跑通过（见下），其余 6 条 = 基线的 6 条 |
| `typecheck` / `typecheck:app` / `lint` | 0 / 0 / 0 | 0 / 0 / 0 |
| App `npm test` | 4170 条 / 3 条既有失败 | R07 不改 App；R08 收口时 4172 条 / 同样 3 条 |

- **全量里新增的 2 条，已修**：
  1. `product-surface-manifest`「manifest generation…」：扫描器只认 `aria-label` / `title` / 子文字，不认 R04 / R06 组件必填的 `label` 属性，`ShellDemoPill` 的按钮被当成「没有可读名称」。修扫描器（大写开头的组件取 `label`，新增夹具测试：`<Button label>` / `<IconButton label>` 有名称、小写 `<button label>` 仍没有），测试恢复成原来的 `p1Candidates === 0`（迁移子会话一度加的「已知 P1 清单」撤掉）。
  2. `no-hardcoded-copy`「the allow list only shrinks」：`demo-mode-core.tsx` 删掉 `DemoNavPill` 后少了 2 处缺日文的字符串，允许清单跟着从 20 降到 18（只减）。
- **基线的 6 条**：5 条 Node 26 `DEP0205` 子进程测试；审计「visible controls have static accessible-name evidence」（读的是已提交的 `inventory.json`，列表里除了 R04 的 App 文件，现在还有 R07 的 `HomePlaceholder.tsx:29`、`ShellDemoPill.tsx:23` 和 R06 的 `States.tsx:34`，原因同上：审计生成器不认 `label` 属性）。重新生成 `inventory.json` 会带进约 20 万行与本 Sprint 无关的 App 漂移，因此不在 R07 里做，列进 R09「合回前总验收」。
- **迁移的旧测试**（由一个只改测试的子会话完成，我逐个核对过；48 个文件左右）：只删 `AccountTopNav` mock 的 7 个；把「页面自己挂顶栏」改成「页面不挂导航、由壳提供」的 11 个；悬浮提问框断言改到 iOrbit 对话输入区或 ⌘K 面板的 5 个；收件箱入口、`aria-modal`、`/app/home`、`/app/agent/plan` 重定向、示例药丸、审计计数（回放 27→26、同源「退出登录」32→9）各自对应修改。**删掉的断言**：设置页旧「退出登录」控件的历史证据（控件随旧顶栏删除，按处理函数查证据的部分保留）；悬浮框里的 3 条轮换提示语（没有继任者）；`aria-describedby` 指向悬浮框隐私说明（隐私说明已搬到 ⌘K，见「做了什么」9）；「建议问题只填入不发送」和 `!isOrbitAskHome`（⌘K 面板没有这两样）；悬浮球的 `--orbit-pinned-bar-h` 偏移；`/app/agent/plan` 的 3 条服务端读取顺序（页面只剩重定向，`IOrbitPlan` 的组件测试还在）。
- **`web-route-transport` 仍按已提交清单计 53 页**：`/app/inbox` 没进 `inventory.json`（同上，重新生成会带进大量无关漂移）；它的路由、登录与渲染由 `app-inbox-page` 覆盖。列进 R09。
- **`detect-changes`**（`detect-changes.txt`，工作区同时含 R08 未提交改动和用户自己的 `bridge/handoffs.md`）：99 个文件、86 个符号、250 条流程，风险 critical——来自壳替换涉及的所有已登录页面（`AppEventsPage` 等的流程都经过被删的旧顶栏）；与「做了什么」的范围一致，没有范围外的符号。

## GitNexus

- `OrbitTopNav` **CRITICAL**（PLANNER：51 / 4 / 9）、`AccountTopNav` **CRITICAL**（40 / 27 / 9）：本次 impact 返回 UNKNOWN（索引没有解析到 `app/(app)` 下的这两个符号，`impact-summary.txt`），按规则用文本搜索确认全部调用方：`AccountTopNav` 23 个文件全部移除挂载后才删除定义；`OrbitTopNav` 只剩公开页的调用，未修改其实现。对策：零残留扫描测试 + 全量回归。
- `OrbitGlobalAsk`（PLANNER：LOW）：删除；唯一挂载点是 `A/layout.tsx`。
- `RelationshipInboxPanel`：只加可选参数 `inline`，默认行为不变（原有 `app-relationship-inbox-panel` 测试覆盖抽屉模式）。
- `isOrbitPrivateAppPath` **CRITICAL**（经代理传导到所有请求）：只往私有前缀表加了 `/app/inbox`；`app-auth-routing` 与新测试覆盖。
- `orbitAskPageContext`、`AppLayout`、`AppTasksPage`：UNKNOWN，文本搜索确认调用方只有壳、Next 约定加载和测试。

## 交接

- **功能页面怎么设标题、按钮、右栏**：页面树里任意位置渲染 `<ShellPage title="…" subtitle="…" left={…} right={…} demoPill={…} rightRail />`（`A/orbit-2026/shell/slots.tsx`）。`rightRail` 传 `true` 用默认右栏，传节点用自己的内容，不传或 `false` 不显示。`right` 里的按钮可用 `useToast()`（标题区有 `ToastProvider`）。
- **Task 容器的插槽**：`A/orbit-2026/task/TaskContainer.tsx`，`calendar` / `todo` 由 `A/tasks/page.tsx` 传入；`plan` / `memo` 是容器内的空态，R25 / R20 只替换自己那一段，不改页签、键盘和 `?tab=`。
- **⌘K 的扩展**：结果分组在 `CommandPalette.tsx`；加一组时保持「最后一行 = iOrbit に聞く、⌘↵ 交给 iOrbit」；需要页面自己接住提问的，用 `useOrbitAskTarget`（与原来一样）。
- **被删组件**：`AccountTopNav`、`OrbitGlobalAsk`、`orbit-global-ask-styles.ts`；`RelationshipInboxTrigger` 不再挂载。
- **公开页**：`OrbitTopNav` / `PublicTopNav` 只给未登录页面用；已登录页面一律不挂导航。
- **热点文件（冻结结构，归属见 R09）**：`orbit-2026/shell/**`、`orbit-2026/task/TaskContainer.tsx`、`A/layout.tsx` 的挂载点。

## 已知例外

- **R06 复核修复提交 `4164d44e` 误带了 R07 的两处删除**（`orbit-global-ask.tsx`、`orbit-global-ask-styles.ts`：R07 开工时用 `git rm` 删的，暂存区随 R06 的提交一起进去了），而 `4164d44e` 里的 `layout.tsx` 仍引用它们，所以 **`4164d44e` 这个提交本身编译不过**（远端 `origin/redesign` 在 R07 提交之前一直是这个状态）。R07 提交让 `layout.tsx` 不再引用它们，恢复一致；R06 的功能和测试不受影响。以后的 Sprint 用 `git commit <路径>` 或先 `git diff --cached --stat` 确认暂存区。

- **收件箱读取的「实测」**：本地服务器上收件箱为空（QA 账号无消息），读取次数用代码路径和测试证明（同一组件、同一计时器）；没有做线上字节测量。
- **旧页面在深色下仍是浅色**（R01 复核 m4）：新壳在深色下是深色，旧页面的内容区仍按 0918 浅色画。这是旧屏的问题，随各功能 Sprint 整屏重写消失；产品负责人看深色截图时请知道这一点。`orbit-reference-styles.tsx` 里写死的 `.orbit-organizer-topnav` 颜色属于旧屏，未改（RD-24）。
- **dev 截图左下角的「N」**是 Next.js 开发模式的指示器，不是产品界面。
- 旧页面在日文界面下多数显示英文（旧屏缺日文，按 R03 的允许清单只减不增），随功能 Sprint 重写。
