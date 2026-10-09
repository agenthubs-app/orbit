# Sprint R07 — Web 导航壳

**Plan revision:** 1。**模式:** existing-codebase / single-generator（执行人：小雨）。
**单一目标:** 新外壳 `Orbit2026Shell`（左栏 + 主标题区 + 可选右栏 + ⌘K + 三档宽度）挂到所有已登录页面；删除 `OrbitTopNav` / `AccountTopNav` / 悬浮球；新入口占位页与 Task 容器；默认主题跟随系统；门禁与路由登记迁移；壳冻结。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** R06 合入后的 `redesign` HEAD。
**进入条件:** R06 completed（组件库与新作用域可用）。RD-02、RD-05、RD-17、RD-19、RD-20 已定。

## 已查清的事实（按 `9d404c1c8`；`A/` = `app/(app)/app/`）

1. **layout 不挂导航**：`A/layout.tsx:33-52` 依次挂 `SessionProvider` → `OrbitLanguageProvider` → starfield 字体（:36）→ `OrbitResponsiveA11y` / `OrbitThemeStyles` / `OrbitThemeRuntime` → `OrbitAskProvider{children}` + `OrbitGlobalAsk` + `CardBatchHost` + `ContactDetailReturnRecorder`。顶栏全部由各页面自己挂。
2. **旧顶栏**：`OrbitTopNav`（`A/orbit-public-shell.tsx:329-472`，浮岛药丸，链接 :386-396，语言切换 :212-250，账号菜单 :47-210，汉堡 :439-469，`OrbitNavActive` :16，`PublicTopNav` :474）；`AccountTopNav`（`A/orbit-account-shell.tsx:22-54`）多挂 `RelationshipInboxTrigger`。收件箱只有抽屉（`A/inbox/relationship-inbox-panel.tsx:1376` 触发器、:1119 `aria-modal`），另有 `/app/inbox/sources/[id]` 一个页面。impact：`OrbitTopNav` **CRITICAL**（51 / 4 / 9）、`AccountTopNav` **CRITICAL**（40 / 27 / 9）。
3. **悬浮球**：`A/orbit-global-ask/*`；门禁 `orbit-global-ask.tsx:41-45`；排除路由 `orbit-ask-routes.ts:22-38`；页面上下文 chip :73-117（只返回 zh / en）；草稿与交接 `orbit-ask-context.tsx` / `orbit-ask-draft.ts`，iOrbit 页用 `hasPendingOrbitAgentHandoff` 接收。
4. **页面与壳**：
   - `/app`：landing（已登录跳 `/app/home`）。
   - `/app/home`：只做 `redirect("/app/agent")`（`A/home/page.tsx:14`）。
   - `/app/home/events`：仍渲染旧 `OrbitRealHome`。
   - `/app/agent` 系：双层 `agent` + `iorbit-0918`，用 `IOrbitShell` / `IOrbitScreenFrame`。
   - contacts、events、events/center、profile、settings、tasks、tasks/personal：各自挂 `AccountTopNav`（events 未登录时挂 `PublicTopNav`）。
   - `/app/start`：没有顶栏。
   - admin：独立的 `HostShell`。
   - 人脉示例模式：`NetworkDemoFrame`。
5. **示例模式药丸**：经 `AccountTopNav` 的 `rightExtra` / `mobileRightExtra` 塞进顶栏，见 `network-demo-frame.tsx:19`、`iorbit-shell.tsx:207`、`iorbit-plan.tsx:175`。新壳必须提供等价插槽。
6. **常量与主题**：
   - `A/orbit-layout-constants.ts:3` 只有 `ORBIT_LEFT_SIDEBAR_WIDTH = 212`（`orbit-sidebar-width-constant` 断言不能改这个值）；
   - `themeInitScript`（`app/layout.tsx:287,305`）默认深色，R01 已改成跟随系统，本 Sprint 负责壳上的切换入口。
7. **会失败的门禁**（在 `tests/ui/`）：
   - `orbit-top-nav-links`：切出 `const links = [` 数组，并断言被删路由名单 :95-100；
   - `orbit-top-nav-structure`：:22-139、:179-212 iOrbit frame 的双层结构与 `AccountTopNav active="agent"`；
   - `orbit-mobile-nav-overlay`；
   - `orbit-sidebar-width-constant`：212 不可改，iOrbit 不得有可拖拽历史侧栏，MobileBar 用 `var(--glass-bar`；
   - `orbit-settings-theme`：设置页必须含 `profile-0918` 作用域与 `AccountTopNav active="settings"`；
   - `orbit-global-ask-routes`、`orbit-global-ask-pinned-bar.test.ts:15-27`、`orbit-0918-anchor-colour`（六域列表）。
   
   另外：30 个测试文件提到 TopNav 或 `orbit-top-nav`，41 个提到 `data-orbit-real-page`（主要在 `tests/pages/*`）。
8. **路由登记**：
   - `features/auth/app-auth-routing.ts:1-18`：需要登录的前缀；`:46` 登录后默认回到 `/app/home`。
   - `tests/audits/web-route-transport.test.ts`：Web 页面数写死为 53（:51-52、:114 一带），数据来自 `docs/audits/full-product-functional-audit/inventory.json`；动态路由样例在 `scripts/verify-web-route-transport.mjs:18-53`。
   - `tests/audits/product-surface-manifest.test.ts`：必含路由 :20-42、纯重定向别名 :177-194，由 `scripts/generate-product-surface-manifest.mjs` 生成。
   - ⌘K 替换悬浮球后，`orbit-ask-routes.ts` 的 `PAGE_CONTEXTS` 和相关测试要迁移。
9. **设计规格**：
   - **画框**：1440×960，网格 `84px 1fr 360px`，无右栏时 `84px 1fr`（`kit/ui.css:250-279`，`kit.js:103-110`）。
   - **左栏**：上下内边距 22；logo 42（圆角 14，ink 底）；每项宽 64、内边距 9 / 0 / 7、圆角 16、字 10.5 / 700；选中 surface 底，悬停 surface-2；底部 主催 / 設定 + 头像 40。
   - **主区**：内边距 26 / 34 / 40；12 列网格，间距 18。
   - **右栏 360**：左描边，surface 55% + blur 10，内边距 24 / 22，内容是「次の一手」+ 最近の会話 +「iOrbit に聞く… ⌘K」（`web.html:409-422`）；iOrbit 页没有右栏。
   - **主标题区 `mainhead`**：网格 `1fr auto 1fr`，居中标题 20 / 800，副标题 12；首页右侧是 🔔 + 編集（`web.html:407`）。
   - **⌘K**：`.wmodal.top` 宽 680、距顶 96；⌘↵ 把输入交给 iOrbit（`01-system.html:375, 570`）。
   - **断点**（`b8-responsive.html:1248-1259`）：
     - ≥1280：左栏 84、右栏常驻；
     - 768–1279：左栏 72 只显示图标 + tooltip，右栏变成主标题区按钮或 380 抽屉；
     - <768：左栏隐藏、换成底部胶囊 5 项，右栏收进 Task › To-do；
     - 主区外边距依次 34 / 26 / 18；详情抽屉依次 600 / 520 / 全屏页。
   - **Task**：用页签，← → 键切换（`index.html:104`）。

## 上下文包

### 必读
- 第 9 条列出的设计稿位置；`IMPLEMENTATION-PLAN.md` §1.1、§1.8、§3.3、附录 D-k。
- Web：第 1–8 条列出的全部文件与测试；`A/agent/iorbit-0918/{iorbit-shell,iorbit-screen-frame}.tsx`、`A/inbox/relationship-inbox-panel.tsx`、`A/tasks/*`、`A/home/page.tsx`。

### 关键符号与 impact（开工时重跑）
- `OrbitTopNav` **CRITICAL**、`AccountTopNav` **CRITICAL**：本 Sprint 删除。必须先让所有调用方改用新壳，typecheck 和 30 个相关测试迁移完成后才删。
- `RelationshipInboxTrigger` / 收件箱面板：抽屉内容搬到新页面；触发器从顶栏移到左栏「受信箱」。
- `OrbitGlobalAsk`（LOW）：删除，交接逻辑迁到 ⌘K。
- `loadAppHomeRouteViewModel`（LOW）：`/app/home` 不再重定向；首页组件内容是 R10 的事，本 Sprint 只放占位。

### 易错边界（全部写进 SC）
- 某个页面漏挂新壳或仍残留旧顶栏；
- 新壳包进了旧作用域（按钮重置生效）；
- 示例模式药丸丢失；
- ⌘K 和浏览器或输入框快捷键冲突（输入框聚焦时 ⌘K 仍应打开面板，但普通字母键不应触发）；
- 全局快捷键监听写进了被 `orbit-modal-standard` 扫描的对话框文件；
- 收件箱从抽屉搬成页面后，未读计数和轮询频率变化（不得增加读取次数，见 D24 / D25 的轮询约束）；
- 未登录访问 `/app/inbox`、`/app/tasks` 没有跳登录；
- 窄屏下底部胶囊遮挡页面内容；
- `/app/agent/plan` 的旧链接失效。

## 契约（本 Sprint 定稿，REPORT 交接）

- **`Orbit2026Shell`**（`A/orbit-2026/shell/`）：
  - 由 `A/layout.tsx` 为所有已登录页面统一挂载，页面不再自己挂导航。
  - 插槽：`title`、`subtitle`、`left`、`right`（按钮区）、`demoPill`（示例模式药丸）、`rightRail`（可选，iOrbit 页不显示）。
  - 新的布局常量（`ORBIT_2026_SIDEBAR = 84`、`ORBIT_2026_SIDEBAR_COMPACT = 72`、`ORBIT_2026_RAIL = 360`、`ORBIT_2026_HISTORY = 260`）放进 `orbit-layout-constants.ts`，旧的 212 常量保留，等人脉旧屏替换后再删。
  - 层级只用 `ORBIT_Z`。
- **左栏**：ホーム `/app/home`、人脈 `/app/contacts`、iOrbit `/app/agent`、イベント `/app/events`、Task `/app/tasks`、受信箱 `/app/inbox`；底部 主催 `/app/events/center`、設定 `/app/settings`、头像菜单（我的、语言、登出）。标签取文案源 `nav.*`，图标取 `Icon`。语言切换从旧顶栏搬到头像菜单。
- **右栏**：骨架里只放结构和「iOrbit に聞く… ⌘K」入口；「次の一手」的数据是功能 Sprint 的事，先显示空态。
- **⌘K 面板**：`Modal top`（680）。
  - 内容：输入框 + 搜索结果分组（先接现有 `/api/search/relationships`）+「iOrbit に聞く」，⌘↵ 交给 iOrbit。
  - 沿用悬浮球的「当前页面上下文」与草稿交接逻辑（`orbit-ask-context`、`hasPendingOrbitAgentHandoff`），上下文 chip 补齐 ja。
  - 快捷键在 `<Orbit2026Shell>` 里注册一次。
  - 排除路由沿用 `orbit-ask-routes.ts` 的规则。
- **新入口**：
  - `/app/home`：组件首页占位，空态说明 + 主标题区「編集」按钮（点了提示即将上线，与 App 一致），不再重定向。
  - `/app/inbox`：把现有收件箱抽屉的内容放进页面；未读计数和轮询沿用现有接口与频率。
  - `/app/tasks`：Task 四段容器，页签 + ← → 键切换；日历 = 现有 `/app/tasks/personal`，To-do = 现有 `/app/tasks`，计划 = 「目標を決める」空态，笔记 = 空态（Web 原来没有笔记页，说明 R20 会做）。
  - `/app/agent/plan` 跳到 `/app/tasks?tab=plan`。
  - 四段插槽冻结（R20 / R25 只替换自己那一段）。
- **主题切换**：头像菜单或设置页提供 自动 / 浅色 / 深色（与 R01 的默认跟随系统配合）。
- **删除**：`OrbitTopNav`、`AccountTopNav`、`PublicTopNav`（如果只有已登录页面在用）、悬浮球全部文件、各页面的顶栏挂载代码、`OrbitTopNav` 里重复插入的 Google Fonts（R01 已统一加载）。未登录的公开页面（landing、未登录的活动页）用新壳的「访客模式」或保留一个最小公开顶栏，开工时按页面数量选定，写进 REPORT。
- **冻结**：`Orbit2026Shell` 与 Task 容器的插槽结构列为热点文件（负责人见 R09）。

## 范围与文件

- **新建**：`A/orbit-2026/shell/**`（左栏、主标题区、右栏、底部胶囊、⌘K）、`/app/inbox/page.tsx`、Task 容器组件、`/app/home` 占位。
- **修改**：
  - `A/layout.tsx`；所有挂 `AccountTopNav` / `OrbitTopNav` 的页面；iOrbit 外框；
  - 收件箱面板（内容复用）、`orbit-layout-constants.ts`、`orbit-ask-*`；
  - `features/auth/app-auth-routing.ts`、审计与清单的生成脚本和数据。
- **删除**：旧顶栏、悬浮球、相关的死代码。
- **测试**：
  - 迁移第 7 条列出的门禁：旧顶栏的结构断言改成新壳的结构断言，被删路由名单保留；
  - `orbit-settings-theme` 改为断言新壳；
  - 新增 `orbit-2026-shell.test.tsx`（所有已登录页面都由新壳渲染、没有旧顶栏、三档宽度结构、示例药丸插槽）、`orbit-2026-cmdk.test.tsx`（快捷键、上下文、交接）、`app-inbox-page.test.tsx`（未读与轮询次数不增加）、`app-tasks-container.test.tsx`；
  - 更新 `web-route-transport`（53 → 新数量）、`product-surface-manifest` 与 inventory 数据。
- **不做**：各页面内容（旧内容保留旧作用域，直到功能 Sprint 替换）；首页组件（R10）；右栏「次の一手」数据；收件箱的秘书分类（R13）。

## 验收契约

| SC | 操作链 | 主证据 |
| --- | --- | --- |
| SC-R07-01 全站新壳 | 浏览器依次打开所有已登录页面：每页都有新左栏，没有旧顶栏和悬浮球 | `orbit-2026-shell.test.tsx` + 1440 截图集 |
| SC-R07-02 三档宽度 | 1440 / 1024 / 390 下左栏、右栏、底部胶囊、抽屉宽度都符合断点规格；底部胶囊不遮挡内容 | 截图 + 渲染测试 |
| SC-R07-03 ⌘K | ⌘K / Ctrl+K 打开，搜索有结果，⌘↵ 把输入交给 iOrbit 并带上当前页面上下文；键盘能完整操作 | `orbit-2026-cmdk.test.tsx` + 键盘走查 |
| SC-R07-04 新入口 | `/app/home` 显示占位、不再跳转；`/app/inbox` 是完整页面且读取次数没有增加；`/app/tasks` 四段可切、← → 可用；`/app/agent/plan` 跳到计划段 | 页面测试 + 截图 |
| SC-R07-05 登录与路由 | 未登录访问 `/app/inbox`、`/app/tasks`、`/app/home` 跳到登录；路由审计与产品清单更新后通过 | `app-auth-routing` 测试 + 审计测试 |
| SC-R07-06 主题与示例模式 | 首次访问跟随系统明暗；可切 自动 / 浅色 / 深色；示例模式药丸出现在主标题区 | 测试 + 截图 |

### 必需证据子表

| SC | 子断言 | 证据 |
| --- | --- | --- |
| 01 | 新壳根节点不在 `[data-orbit-real-page]` 内部；旧页面内容仍在各自旧作用域里正常显示 | `orbit-2026-scope`（R06）+ 截图 |
| 01 | `OrbitTopNav`、`AccountTopNav`、悬浮球的代码已删除，无引用残留 | 扫描测试 |
| 03 | 全局快捷键只在新壳注册一次，不在被 `orbit-modal-standard` 扫描的对话框文件里 | 测试 |
| 04 | 收件箱页的轮询频率与读取字节和改造前一致（实测写进 REPORT） | 测量记录 |
| 全部 | 两端全量对照基线零新增失败（orbits 用 en-US 语言环境）；`tsc`、`typecheck:app`、`lint` 通过；`detect-changes` 写进 REPORT | 全量清单 |

## 执行顺序

1. 记录基线；对 `OrbitTopNav`、`AccountTopNav`、`OrbitGlobalAsk`、收件箱面板跑 impact，在 REPORT 写明对策。
2. 先写新壳的结构测试（RED）；迁移旧门禁的断言。
3. 实现 `Orbit2026Shell`（左栏、主标题区、右栏、底部胶囊）并挂到 layout。
4. 逐个页面去掉旧顶栏，接上插槽（标题、按钮、示例药丸）。
5. ⌘K 面板，迁移悬浮球的交接逻辑。
6. 新入口：首页占位、收件箱页、Task 容器、计划段跳转。
7. 更新路由登记、审计数据和产品清单，删除旧代码。
8. 三档宽度截图、键盘走查、全量测试、写 REPORT。

## 失败与交接

某个页面因为结构特殊无法挂进新壳（如 kiosk、admin）：保持现状并写进 REPORT，说明原因和以后由哪个 Sprint 处理。

REPORT 交接内容：
- 新壳的插槽说明（功能页面怎么设标题、按钮、右栏）；
- Task 容器的插槽；
- ⌘K 的扩展方式；
- 被删组件清单；
- 公开页面的处理方式。
