# Sprint R10 — ホーム：两端首页组件与 D-01 布局

**Plan revision:** 2（2026-10-18；§2 已按 RD-33 由主会话代定）。**模式：** existing-codebase / single-generator。**档位：** H。**执行：** Codex 主开发会话，D 线 `/Volumes/ORICO/Dev/worktrees/orbit/redesign-d`（`line-d`），**R20b 之后、R19 之前**。本规划的代码事实固定在 `origin/redesign@cb866e48fbb41e7f540bbf66177f9ae0ac597591`；执行前以实际 `origin/redesign` 和 R20b 的交接复核，不把规划时不存在的实现写成已交付。

**单一目标：** 重写 App `/home` 与 Web `/app/home` 为可编辑组件首页，让数据、空态、布局持久化、右栏和入口在同一账号下可核验。验收按 §8 的 SC；本 Sprint 结束才写 REPORT / REVIEW。本文是执行契约，不是运行结果。

## 0. 给 Codex 的执行说明

1. **工作树与通信。** 在 D 线自己的 worktree 先检查 R20b 的提交 / 未提交改动、`git fetch origin redesign`，再按本线规则 rebase；保护未提交改动，不覆盖其他线。主会话经 `_runs/talk-codex.sh` 联系。每轮最后回复给主会话：已完成 / 未完成 SC、提交号、测试摘要、像素摘要、跨线请求、待主会话代定、待用户授权、下一步。执行者本地按路径提交，**不自行 push**；主会话独立复核后集成。本文档编制阶段不提交也不推送。
2. **先读。** [README](../README.md) 通用规则 10–13、RD-16、RD-24～RD-33；[HOW-TO](../HOW-TO-START-A-FEATURE-SPRINT.md) §0–§10；[HANDOFF](../HANDOFF-TO-FEATURE-SPRINTS.md) 通用口径与 R10-01～10；[DEFERRED-A](../DEFERRED-A.md)；[screen-ownership](../screen-ownership.md) 首页行；[决定表](../maintenance/2026-10-12-decisions.md) D05、§7、§20、§23；[IMPLEMENTATION-PLAN](../../IMPLEMENTATION-PLAN.md) §1.2、D-01、D-15、Q5；R20a / R20b / R11a 的 PLANNER 与最终 REPORT；R31a / R31b 组件交付；两端 AGENTS、`repos/orbits/scripts/visual/README-redesign.md`。跨端状态交接还要按 `bridge/README.md`、`bridge/status.md`、`bridge/handoffs.md` 的格式写版本、另一端影响、未完和验证范围。
3. **基线与环境。** 沿用 D 线 R20a 的独立本地库、Web 3500 / `.next-line-d`、Metro 8085、模拟器 UDID；开工先记录两端全量测试、类型、lint、copy QA 的通过 / 失败数，不能拿既有 REPORT 当本轮结果。设计稿静态服务用本会话独占 **3350 以上**端口（`uv run --no-project python -m http.server <端口> -d docs/designs`；先有 uv 环境），`compare-redesign.mjs --list --design http://localhost:<端口>/redesign-2026-10/<file>` 固定画板序号，用完停服务。预检 `board-preflight.mjs` 先于写 UI；只读预检结果贴本 PLANNER 的执行版 / REPORT，不能省。
4. **开发边界。** 新 App 屏一律 `AppScreen inset="kit"`，`UiText` 与新组件库；Web `ShellPage` + `Orbit2026Scope` / `ToastProvider`，CSS Modules 与 token。缺件写给 A 线请求，不在首页私造组件。D 线拥有导航壳，但不顺手改 B / C / E 线正在写的页面；§1 的只读引用按导出接口消费。热汇总文件只追加本功能项，同步共享契约要运行 `sync:contract` 并核对 App 副本 / 快照。
5. **决定与依赖。** §2 已按 RD-33 由主会话代定；执行时依「数据自洽 → 已定规则一致 → 较新画板优先 → 成熟产品惯例」处理新冲突。遇到新矛盾写 REPORT「待主会话代定」的选项 / 推荐 / 影响 SC，继续其他已授权步骤；需对画板作结构改动时由主会话更新设计源并重跑预检，执行者不能用 `[data]` 解释结构差。R11a 抽屉 / summary 已在本基线交付，按其最终 REPORT 引用；按加入时间排序仍须 B 线补。R13 来源、R28 引导共用投影、R20a 最终交付与 R31 组件状态逐项核实，缺项只阻塞对应 SC。
6. **停止条件与证据。** 单画面最多 3 轮像素迭代；依赖卡住的画面登记交接和重比，独立可做的继续。证据放 `~/orbit-sprint-evidence/redesign/R10/run-01/`，报告写 `R10-home-widgets/REPORT.md`，预检明细可写 `preflight-checklist.md`；报告列 SC、R10-01～10 逐条结果、全部画面 raw / 带数 / 归因路径、未过 / 设计稿无、请求、代定、待用户授权、跨端回读、越线自查和文档更新请求。README / HANDOFF / DEFERRED-A / 决定表 / screen-ownership 汇总修改交主会话，D 线不要覆盖其他会话的未提交版本。
7. **外部边界。** 不连 Neon / 生产、不部署、不改生产环境变量、不做真机分发或生产迁移。需要这些时仅登记 DEFERRED「待用户授权」。本机已有付费 AI 可为验证真调并记录用途、次数、账本；R10 不因展示首页新增付费 AI。若以后新增付费调用，先定每账号硬配额、幂等账本与不可用降级。

## 1. 本线归属的文件 / 不许碰的文件（RD-31，复核逐文件查越线）

**D 线本 Sprint 可改的范围（以实际引用搜索收窄）：**

| 作用 | 路径与边界 |
| --- | --- |
| App 首页 | `repos/orbit-app/app/home.tsx`、`src/screens/home/HomeDashboardScreen.tsx`、本次新建的 `src/screens/home/**` 与首页专用 view-model / hook、对应首页测试 / 字典域。用 `AppScreen inset="kit"`；不重写 AppShell / 通用组件。 |
| App 旧 dashboard | `app/dashboard.tsx`、`src/screens/dashboard/DashboardScreen.tsx` **仅在**全站引用搜索为零、旧地址跳转仍可用且测试通过后删除。被其他屏引用的 view-model / API 不能随屏删除。 |
| Web 首页 | `repos/orbits/app/(app)/app/home/page.tsx`、`app/(app)/app/orbit-2026/home/{HomePlaceholder.tsx,home.module.css}` 与新 `orbit-2026/home/**`、`orbit-2026/copy/home.ts`、首页测试。旧 `home/compose-app-home-*/**`、`home/events/**` 仍被 `/app/agent` / 活动调用，只读保留。 |
| D-01 | 新 `features/home-layout/**`、现有 `app/api/home/layout/route.ts`、共享 `shared/contract/home-layout.ts` 与 `shared/api-schema/home-layout.ts` 的首页字段、对应 mock / 路由 / PG 测试；`features/redesign-contracts/{handlers,service-factory}.ts` 仅对 `home-layout` 精确接 live，不改别的 capability。汇总 `shared/contract/index.ts`、`shared/services/capability-registry.ts` 等只追加本功能项。App `src/api/{contract,schema}/home-layout.ts` 是同步副本，**只由 `sync:contract` 生成**。 |
| D 线导航壳 | Web `orbit-2026/shell/{Orbit2026Shell.tsx,shell.module.css,slots.tsx}` 中仅首页所需的右栏计数 / 抽屉接线；App `src/components/{ShellTopBar,AppScreen}.tsx` 只在确有壳缺口时作最小改动，不为首页重画壳。壳改动需跑所有既有壳画面不退步。 |
| 首页专用读模型 | 可新建服务端 `features/home/**` 或 `app/api/home/guide-progress/**` 的只读聚合，以及 App 对应 schema / 页面副本；真实三步进度的共用纯投影优先放 `shared/compute/guide-real-progress.ts`，R10 / R28 谁先开工谁创建并单独提交里程碑，另一方只 import。已存在域的 API 只调用，不改 B 线 contacts / inbox、C 线引导页面、甲的 plans / events、D 线 R20 的写规则。 |
| 工具与门禁清单 | 新建 `repos/orbits/scripts/visual/views/{web,app}-R10.json`、`attribution-redesign-R10.json`、本目录 REPORT / 预检；不改比较工具或 kit。 |

**不许碰，必要时写 REPORT「请求」给 owner：** A 线 `src/components/ui/**`、Web `orbit-2026/ui/**`、`shared/design/**`、`kit/**` 与 visual 工具；B 线 R11a 的 `features/contacts/**`、`orbit-2026/network/**`、`ContactDrawer` 本体，R13 / R14 的 `features/notifications/**` / inbox 来源、推送；C 线 R28 的引导页面与现有 `features/guide/**`（共用纯投影只按上表的新文件里程碑创建，不改已有读取器）；甲的 `features/plans/**`、`features/events/**`、加人 `CompletionQuestionCard` / `TodayQuestionCard`；E 线 iOrbit 页与会话数据。R10-05 的旧 `home/orbit-real-home.tsx` 含 E 线 `/app/agent` 的 `AgentDock`（事实 10），只允许在 E 线释放该文件后做定位所需的最小变更并交接；未释放时先做其他 SC、发精确请求，不列为 D 线独占文件。App `src/data/sync/**` 与服务端 `features/sync/domain-registry.ts` 不为布局新增同步域；若 `todo/page` 离线页副本缺登记，交 R20a 归属方补，不在 R10 偷改任务数据规则。

## 2. 主会话代定（RD-33 已采纳；按优先级决策）

| # | 主会话定案口径与理由 | 验证 / 转出 |
| --- | --- | --- |
| D10-1 默认布局与画板冲突 | **无记录 / `NOT_IMPLEMENTED` 的五张默认卡按 app.html / web.html 顺序显示：today、planScore、nextEvent、network、secretary。** 当前 `DEFAULT_HOME_LAYOUT` 的 App 多 memo、Web 多 week / eventPick（事实 3），这三块应在组件库而非首次首页；R10 更新共享默认常量与演示 fixture，并通过契约同步。已有用户记录按其布局展示，绝不因改默认而覆盖。以定稿首页与「组件库」区分为准。 | SC-02 / 03 / 11；快照与两端首开截图。 |
| D10-2 Web 跨列冲突 | web.html 初始五卡用 12 列的 **5 / 4 / 3 / 5 / 7**，b11 Web 编辑弹层说小 4 列、中 8 列；契约只存 `s/m`。初始未编辑布局使用画板的展示预设，用户首次实际排序或改尺寸后按小 4 / 中 8 排；不把跨列值写进 D-01。**首次仅进入编辑、尚未排序或改尺寸时，五卡位置与尺寸不得跳变；点「完了」后仍不跳变。** 第一次实际改动后的重排另测并按对应编辑板验收。给 `revision=0` 默认、首次进入 / 退出编辑、已保存布局分别回归。 | SC-03 / 15；web.html #0–#3 与 b11 #25 两组都比，附前后布局测量。 |
| D10-3 计划负数 | `score.todayDelta` 是可为负的整数；`-10` / `−10` 按 N13 字形呈现，绝不拼成「+−10」，不把负数截为 0。**N13-A / N13-W 画的是计划概要，不是首页卡**；首页负数态做行为测试并附截图，标「设计稿无」，不冒称过 N13 整屏门禁。 | SC-07 / 15。 |
| D10-4 秘書与邮件 | R13 先交来源契约时接 `event_deadline` / `event_prep` / `event_pick` 合法条目；未交时本机 mock / 设计 fixture 显示带「サンプル」演示，live 显示真实空态或隐藏该来源，绝不写演示记录进库。Q5 首期不做 Gmail 正文 / メール要約：画板有邮件行时由主会话按已定 Q5 改稿后进门禁；R10 不新开 OAuth scope 或付费 AI。 | SC-10 / 15；R13 交接未到时列依赖重比。 |
| D10-5 三步引导 | `guideState.currentStep` 是停留位置，**不是已完成几步**（事实 8）。`readGuideStatusForActor` 在示例开关关闭时直接返回 null，**不得作为首页进度源**。R10 / R28 共用独立于该开关的真实进度投影：取同一 actor 的已确认联系人、relationshipGoal、生效计划及 guideState v2 的 `step1Skipped` / `completedAt` / `grandfathered`，按既有三步纯规则推导 `completed / nextStep / steps`；完成闩锁与老用户规则保持，任一必要来源失败时不显示假 0/3。共用计算优先新建 `shared/compute/guide-real-progress.ts`；R10 / R28 **谁先开工谁创建并单独提交里程碑，另一方 import**。R10 的 `GET /api/home/guide-progress` 只读适配该投影，不输出 `inDemo`、不依赖示例开关；R28 拥有引导页本体。 | SC-12；独立里程碑 SHA、开关开 / 关同数据结果、完成闩锁 / 老用户 / 失败测试，交 R28。 |
| D10-6 下一场活动 | 从 `GET /api/events/mine?range=upcoming` 中选时间最早且状态 `registered` 的未结束项；`pending_review` / `waitlisted` / `planned` 不写成「参加予定」。`meetCount=null` 时不画虚构人数；无项显示画板的评估入口。活动详情用返回的 `href`，外部活动 `assessment:<id>` 也照返回链接，不拼 id。 | SC-08；R26 契约状态测试。 |
| D10-7 人脈最近四人 | `total` / `addedThisMonth` 来自 R11a 已交的全量 summary，不把首页分页数当总数。**向 B 线请求 R11a 列表接口提供按加入时间倒序的服务端排序**（如 `sort=added`，`addedAt` 同值时以 id 稳定打破平局，并让 cursor 绑定排序）；R10 不自行排序或改 B 线服务。B 线交付前只取当前服务端顺序的前四，标 `TODO(R10: B sort=added)`，不得称其已按加入时间选出。Web 抽屉只调用 B 线已导出的 `ContactDrawer`，不复制详情 UI。 | SC-09；B 线接口 / 游标契约与前四回执，缺排序时 SC-09 的「最近」项未完成。 |
| D10-8 布局离线与冲突 | D-01 原规则优先：App 本地缓存按账号 + API base 隔离；离线编辑即时更新本地待上传布局，恢复时直接 `PUT`（同 mutationId 重试），**不进通用同步 outbox / domain-registry**。409 取服务端 revision 和布局，提示「別の端末で変更されました」，用户可重新编辑；不能悄悄覆盖另一端。Web 在线提交相同 CAS。 | SC-02 / 14；双设备 / 换账号 / 重试证据。 |
| D10-9 每天一问与缺画板 | R10-09 的卡放「今日やること」中并复用 R16 组件与其写接口；卡无题就自然不出现，不将 1 問伪造为 `todo/page` 条目。Web 右栏建议仅取可执行的 3 条，计数等于实际可见建议数。无画板的加载、失败、离线、409、首页负数、Web 390 与部分 1024 内容和编辑深色状态均附截图标「设计稿无」，不进像素通过分母。 | SC-06 / 13 / 14 / 15。 |

## 3. 交接条目映射（HANDOFF R10 每条进 SC 或明确转出）

| # | 本 Sprint 落点 | SC |
| --- | --- | --- |
| R10-01 | Web `HomePlaceholder` → 五卡 / 空少多 / 编辑；W-R07-01 / 03 重比。 | 03、04、15 |
| R10-02 | 右栏三建议与「✨ … ホームから」/ 最近会话；计数传给 `ShellRailButton`；1024 N07/N07b、W-R07-03D。会话来源未由 E 线交时只呈可用条目，不造会话。 | 04、13、15 |
| R10-03 | App / Web 编辑全链，完成后删除「近日公開」Toast；b12 A-R05-12 临时板退役。 | 03、14、15 |
| R10-04 | App 日期 / 问候 / 白圆铃铛红点 / 白胶囊编辑；旧用词随首页整屏替换。 | 05、12、15 |
| R10-05 | `AgentDock` 按主区居中；E 线占用时按 §1 请求释放 / 交接。 | 13、15 |
| R10-06 | `home-layout` live、缺失时 `DEFAULT_HOME_LAYOUT`；D-01 CAS / 离线。 | 02、14 |
| R10-07 | `plans/v2/summary.current=null` 空态；`segments[key=event]` 解释为イベント枠。 | 07 |
| R10-08 | 负 `todayDelta` 按 N13 表达；N13 是概要画板，首页负数附截图。 | 07、15 |
| R10-09 | R16 的每天一问组件与服务端回执挂首页，未交组件则记录跨线请求。 | 06、13 |
| R10-10 | R11a 已交 Web `ContactDrawer`、App 详情路由和 summary；首页按导出 props / Asia/Tokyo 月界消费浓度、来源与人数，不重算；按加入时间排序另向 B 线请求。 | 09、15 |

**通用口径逐项处理：** G01 → SC-04/05（整屏换标题）；G02 → SC-15（次要字按 `ink-3` 例外）；G03 → SC-03/15（移除不用危险色，若出现危险动作用 coral-text）；G04 → SC-05/15（App 按钮可见 40、触控 44，组件归 A）；G05/G06 → SC-01/15/16（逐像素、快慢两档、20% 复核）；G07 → §7/SC-15（较新板、作废板排除）；G08/G09 → SC-01/10/15（只读 fixture，示例标签，系统外壳排除）；G10/G11 → SC-04/13（ShellPage 插槽、首页 `phoneFold`）；G12 → SC-04（390 不加 🔍/⌘K）；G13 → SC-04/15（全局 CSS、bottom inset、层级）；G14 → 非本线 kiosk / 公开页，SC-16 核对首页仍是登录页；G15/G16/G17 → SC-05/15（`AppScreen inset="kit"`、底栏转场、UiText、壳背景与顶栏）；G18/G19 → SC-02/06/10/14（尚未实现、响应宽进、请求严出）；G20 → SC-15（旧屏 allowlist 只减）；G21/G22 → SC-04/15（Web 新作用域、语言 cookie）；G23/G23b → A 线 R31a / R31b 负责，SC-15 等组件交付重比，不打页面补丁；G24 → SC-05/15（日文粗体用 UiText）；G25 → SC-01/15/16（文字结论优先、3 轮上限、按路径提交）；G26 → SC-15（已有字号 / 圆角 token 直接用，预检差值先核实）。REPORT 把这行展开为逐项结果，不能用「已读」代替通过。

## 4. 已查清的代码事实（逐条按 `git show origin/redesign:<path>` 核对）

以下路径均相对仓库根；行号只对应上述 `cb866e48f`，实施时重新定位。GitNexus 旧索引不覆盖本 SHA，本文代码结论只据远端树，不拿旧图谱零调用判无人使用。

1. Web `app/(app)/app/home/page.tsx:8-18` 已是登录后真实 `/app/home`，但只渲染 `HomePlaceholder`；`orbit-2026/home/HomePlaceholder.tsx:12-35` 的编辑按钮只弹 `comingSoon` Toast，`ShellPage` 已带 `rightRail phoneFold`。删除整个旧 home 目录会误删 `/app/agent` 仍引用的 `home-route-view-model.tsx`（`app/(app)/app/agent/page.tsx:42,120-123`）。
2. App `app/home.tsx:2-4` 挂 `HomeDashboardScreen`；`HomeDashboardScreen.tsx:2-5,38-59,61-76,100-107,152-168` 是旧周条 / 快捷键 / `/api/tasks/page` 读取，且仍导入 Ionicons，旧首页本机镜像和页面副本不能整段无条件删除。旧 `app/dashboard.tsx:1-4` 仍挂 `DashboardScreen`，删前查引用。
3. D-01 类型 `shared/contract/home-layout.ts:4-25` 只有 10 个 key、`s/m`、`revision`、分端数组与 `hintDismissedAt`，PUT 带 `expectedRevision/mutationId`。两端 schema `shared/api-schema/home-layout.ts:9-55`、App 同步副本同名文件 `:9-55`：响应跳未知 key、未知尺寸回落 `s`；请求 `.strict()`、每端最多 10 且 key 不可重复；当前默认 App 6 卡 / Web 7 卡，与两端画板首次 5 卡冲突（D10-1）。
4. `app/api/home/layout/route.ts:1-3` 只 re-export R08 handlers；`features/redesign-contracts/handlers.ts:24-33` 只调用 `redesignMock`；`features/redesign-contracts/service-factory.ts:32-45` 的 live capability 列表没有 `home-layout`，live 因而是 `NOT_IMPLEMENTED`，不能把 mock 回执说成布局已持久化。
5. `app/api/agent/plans/v2/summary/route.ts:1-4` 已指 R22 live handler；`shared/contract/plan-v2.ts:114-126,145-169` 的 `score.todayDelta` 是整数、`current` 可为 null，`segments` 为数组。首页不重算分数，`key=event` 按 R10-07 叫イベント枠。
6. `app/api/events/mine/route.ts:1-5` 已提供 upcoming；`shared/contract/events-mine.ts:9-39` 有状态、`startsAt`、`meetCount?`、`href`，说明该接口明确被 R10 首页消费；已报名与仅计划的状态不能混称。
7. `app/api/contacts/summary/route.ts:1-4` 走联系人汇总；`shared/contract/contact-card-page.ts:40-45,55-72` 的 `addedAt?` / `addedThisMonth?` 可省略，`total` 必填。R11a `REPORT.md:74-76` 已交 Web `ContactDrawer` 与 summary；`features/contacts/card-service.ts:94-112`、`features/contacts/contract.ts:107-134` 尚无按加入时间排序参数，故 D10-7 必须给 B 线请求，不在 R10 对分页结果重排。
8. `features/guide/guide-state.ts:13-20,30-40` 的 v2 `currentStep` 是页面停步，`completedAt` 是完成闩锁；`features/guide/progress.ts:4-19,45-87,227-242,253-303` 的纯三步规则从确认联系人 / 目标 / 计划推导，但 `readGuideStatusForActor` 受示例开关控制，开关关闭即 null，不能供真实首页进度；`app/api/guide/state/route-handler.ts:34-76` 的 PATCH 只允许 `bannerCollapsed/currentStep`，不能用它写首页完成计数。
9. `orbit-2026/shell/Orbit2026Shell.tsx:59-65,83-110,152-165` 的 `ShellRailButton` 接受 `count?`，但调用点没传；768–1279 右栏变抽屉，抽屉头结构已有。首页数据要传真实计数给 D 线壳，不能在首页画第二个按钮。
10. `home/orbit-real-home.tsx:596-625` 的旧 `AgentDock` 用 `position:fixed;left:50%`，相对视口而非主内容区；该组件当前仍服务旧 iOrbit / home 复用路径，改定位时不可删它的其余行为。
11. App `src/components/AppScreen.tsx:24-38,48-64,92,127,145,196-197` 支持 `inset="kit"` 且一级页自己装 `TabPageBar`；R10 新屏须显式传 `kit`，不能自画底栏 / 状态栏。
12. App `src/data/sync/page-copies.ts:48-61` 已有 `home-schedule` 但未登记新的 `todo/page`；`web-mirror-storage.ts:18` 的页面副本 ID 是白名单。服务端 `features/sync/domain-registry.ts:3-16,57-61` 的字段同样是白名单；新字段如果走同步域会被丢。D-01 计划 §D-01 已决定布局**不进同步域**，只做在线读写 + 本地缓存；R20a 的 To-do 离线副本需要先核对最终交付。
13. `src/screens/add/CompletionQuestionCard.tsx:27,105` 已有 App 组件，`route-domain-inventory.ts:593-595` 登记了它的 GET / answer / skip；Web 组件由 R16 所有。R10 只能 import / 组合，不复制写请求。
14. `features/redesign-contracts/service-factory.ts:1-7` 明说 live 未交 capability 返回 `NOT_IMPLEMENTED`，生产不能看 mock。秘书来源当前只在 `shared/contract/inbox-notifications.ts:6` 预留；R13 尚无本 Sprint 可核实的来源聚合导出，故 SC-10 保留先交契约门槛。
15. 画板源码 `app.html:384-445` 的首页五卡 / 库分类、`web.html:429-448` 的五卡与 5/4/3/5/7 排列、`b11-nav-v3.html:1644-1684` 的长按 0.4 秒 / 排序 / 撤销 / 分类 / 小中、决定表 `2026-10-12-decisions.md:98` 的 N07 优先级均已逐条读；不能仅用旧 `IMPLEMENTATION-PLAN` 的大致描述替换定稿画板。

## 5. 契约与数据来源

### 5.1 D-01 `home-layout` live（SC-02 / 03 / 14）

- `GET /api/home/layout`：认证 actor 独占 `homeLayouts` 一人一条（`record_id=actorId`）；不存在时回 `DEFAULT_HOME_LAYOUT`、`revision=0`，不写库。`PUT` 严格校验 `HomeLayoutUpdateInput`；CAS `expectedRevision`，每个 `mutationId` 幂等，同一 ID 不得将不同 payload 当同一请求；成功回完整 `HomeLayoutContract`，409 带当前 revision / 布局供重载。并发两写只一胜，跨 actor 绝不互见；读预算 / 错误显式可观测。仅本机 PG 验证，无生产迁移。
- App 与 Web 保留各自数组，修改一端时从最近一次完整回执带上另一端数组，不能拿本地旧值覆盖它；`hintDismissedAt` 全账号共享。编辑完成保存；移除 Toast 的撤销若在提交前恢复则不发删，提交后恢复发新 revision。后台或跨端更改后重读再编辑，不绕过 CAS。
- App 离线编辑写**独立的本地布局草稿与缓存**（按 actor + baseURL 分区），联网直接 PUT；本 Sprint 不加 sync domain/outbox kind。登出 / 换账号不显示旧人布局；缓存过期与失联显示「以前の情報」而非默当服务器事实。服务器 503 且 reason `NOT_IMPLEMENTED` 用本地 / `DEFAULT_HOME_LAYOUT`，其他 503 显式重试，不把错误当重置。首次生效之前测试 fallback，live 交付后测试持久。
- 共享契约保持响应宽进、请求严出；`contract-snapshot`、schema parity、`sync:contract` 同步副本一起过。只加字段须查 App strict 读取与页面副本登记；不要因前端只看得到新字段便声称同步到设备。layout 无 DDL，`homeLayouts` 由现有 `orbit_records` 存储。

### 5.2 首页卡的数据链（SC-06～13）

| 卡 / 区域 | 读源与投影 | 空、降级与点击 |
| --- | --- | --- |
| 今日やること | **前置：R20a 最终交付且同 actor 首页 ↔ Task 同源回读。** `GET /api/todo/page` 的三块与件数是唯一 To-do 聚合事实；`/api/schedule-items` 提取账号时区的今日予定（按真实 startsAt，取消 / 过期不过滤成新任务）。App 离线只消费 R20a 已登记的 page copy 与既有 schedule 镜像；不能另造一套待办判定。 | 按 R20a 的来源 href 跳 Task › To-do / カレンダー；部分来源 `unavailable` 只降级本段；整块 `NOT_IMPLEMENTED` 隐藏依赖内容并给可用入口，不展示假条目。每天一问接 R16 卡，回答 / 跳过复用 R16 回执。缺最终交付或同源回读时 SC-06 不记完成。 |
| プラン スコア | `GET /api/agent/plans/v2/summary` 的 `current.score.total/todayDelta/segments`、`current.todayChance`；不从主页事件反算分数。 | `current=null` →「目標を決める」并进 Task › プラン；失败给重试，不把 null 与失败混用；负 delta 保符号。 |
| 次のイベント | `GET /api/events/mine?range=upcoming` 的最早 registered，`startsAt/title/venue/meetCount/href`；时间词按 `asOf` 和账号时区。 | 没有参加予定按画板给「評価する」入口；`meetCount` 缺失不画人数。卡片和会う準備必须落到存在的 R27 页面。 |
| 人脈 | R11a 已交的 `GET /api/contacts/summary` 取 `total/addedThisMonth/densityCounts/sourceChips`；最近四人待 B 线给 `GET /api/contacts/page` 增加按 `addedAt` 倒序的稳定排序。未交前取服务端原顺序前四并标 TODO，R10 不自行排序；App 离线只保留已取得的服务端顺序，不在镜像重排。 | 0 人按空态，不把未返回的 `addedThisMonth` 当 0；Web 点击人开已导出的 `ContactDrawer`，App 进 `/contacts/<id>`；查看更多去人脈一级页。浓度 / 来源用 R11a 共用 compute，不从四人反推。 |
| 秘書から | R13 的秘书来源契约过滤合法 `event_deadline/event_prep/event_pick`，显示最多画板行数、未读和目标 `href`；完整列表进受信箱「秘書」。 | R13 未交时 mock 中用 demo-world 合成人事物并标 `sample:true`；live 不显示不存在的邮件 / 提醒；未知 sourceKind 跳过整条（规则 10），失败只降级卡片。 |
| 库：判断待ち / 今週 / イベント推薦 / メモ | 分别复用 R20a `todo/page`、`schedule-items`、`recommendations/events`、R20b `notes` 读模型。 | 未加进布局不额外请求；加后无数据有各自空态。判断待ち不做新写命令，事件推荐读真实 `valueScore`，メモ 点击 Task › メモ。契约 key `deadline` 暂不在无板的库里公开。 |
| 三步空态 / 🔔 | 三步用 §2 D10-5 的真实进度投影，共用纯计算与 R10 只读适配均不依赖示例开关；铃铛用 `/api/inbox/summary` 的消息 / 通知未读和壳现有 dot 规则。 | 完成闩锁 / 老用户规则生效；进度来源失败不猜 0/3。铃铛只画红点不画数字，点入 R13 受信箱；入口未交时用既有路由，不在首页实现收件箱。 |
| Web「次の一手」 | 从已有 Today / plan / schedule / 秘書可执行目标投影至多三张建议，同一 target 不重复；最近会话只用 E 线现有可读摘要。计数 = 实际可见建议数。 | 没有数据按 web.html 空态；不调 `POST ...signals?view=home` 或付费 AI 生成建议；`ShellPage` slot 先在页面读好值，再传壳。E 线会话摘要未交就不造 🕘 行，登记依赖。 |

## 6. 交互、路由与旧屏清理

- **默认 / 编辑：** App 标题区日期 + 问候、铃铛红点、编辑按钮；Web 左栏和主标题区由壳画，首页正文从提示条开始。长按 0.4 秒出现大小菜单 / 进入编辑；拖动有占位，落位后保存；「−」立即移除、Toast 撤销；组件库分类 `すべて / 今日 / 人脈 / イベント / プラン / 秘書` 与「ウィジェットを検索」做本地过滤，已添加不可重复加。App sheet 与 Web 编辑右栏共用 D-01 key 集；小 / 中仅两档，禁大尺寸。键盘和屏幕阅读器要能以「上へ / 下へ」「サイズを変更」完成同一排序与尺寸操作，reduced motion 去抖动只留淡入。
- **提示条：** 未编辑「長押しで組み替え」可关闭；关闭时间写 `hintDismissedAt`，两端刷新不再出现。编辑态显示「ドラッグで並べ替え · − で外す …」，退出编辑恢复普通布局；悬停 / 长按菜单与键盘顺序一致。Toast 使用 A 线组件，撤销先关 Toast 再回调，App 底栏上方定位。
- **路由：** App 一级 `/home` 保持壳的 `openMainTab` 规则，Web `/app/home` 仍要求登录，未登录 `next` 保留。旧 `/dashboard` 由新首页代替但旧入口须明确重定向；App `home/events` / Web `/app/home/events` 属活动线，保留或按 R26/R27 已有跳转，不能因目录名相近删除。新屏上线后只删除已无引用的旧屏文件 / allowlist 行；`home-route-view-model` 及 `orbit-real-home` 的其他消费者保留。
- **壳与层级：** Web `ShellPage` 保留 `phoneFold`，390 不新增 🔍 / ⌘K；768–1279 的右栏按钮、抽屉头按 b12 N07 / N07b，b6 旧抽屉作废。右栏从首页数据投影，抽屉中段不要停在空壳；关闭抽屉恢复焦点。D 线修 count 传值，不改通用计数语义。旧页面全局 `.btn` 漏入、底部 inset、弹层 z-index 与 `AgentDock` 相对主区居中均需回归。Web 非公开首页不放到需要登录的路由之外；公开页仍不挂私有壳。

## 7. 屏幕 ID ↔ 画板、预检和像素门禁

本机 3357 静态服务下 `compare-redesign.mjs --list` 的序号；正式执行时重新 `--list` 锁定。深色按同一画板可用 `--theme dark` 的情况仍要真实截图；仅明示无独立画板的组合按下表「设计稿无」记录，不拿另一宽度充数。

| 屏幕 ID（清单建议） | 画板 `--design` + `--board-index` | 操作链 / 用途 |
| --- | --- | --- |
| A-R10-01 / 02 / 03 / 03S | `app.html` #0 / #1 / #2 / #3 | 新用户三步、少量、较多、滚动后；App 390×844 浅。 |
| A-R10-04 / 05 | `app.html` #4 / #5 | 首页编辑、点「ウィジェットを追加」打开 sheet；浅。 |
| A-R10-03D | `app.html` #33 | 首页较多深色。 |
| A-R10-06～10 | `b11-nav-v3.html` #20 / #21 / #22 / #23 / #24 | 长按 → 菜单、拖动占位、移除 Toast / 元に戻す、按类搜索库、选小中；#48 是 #21 的深色。 |
| W-R10-01 / 02 / 03 / 04 | `web.html` #0 / #1 / #2 / #3 | 1440 空 / 少 / 多 / 编辑，浅；#21 是多数据深色 W-R10-03D。 |
| W-R10-05 | `b11-nav-v3.html` #25 | 1440 Web 编辑拖动、大小弹层、右栏组件库。 |
| W-R10-06 / 07 | `b12-missing-states.html` #86–#87 N07、#88–#89 N07b | 1024 浅深：标题区次の一手按钮 → 点击 → 380 抽屉（R10-02）。旧 b6 1024 抽屉板不进门禁。 |
| A/W-R10-N13-reference | `b12-missing-states.html` #218–#219 N13-A、#222–#223 N13-W | 这是 **Task › プラン 概要**负「今日 −10」参考板；R10 首页卡只借符号口径，不把该整屏算首页门禁。 |

**设计稿无，截图但不进像素门禁：** 首页 Web 390、Web 1024 的空 / 少 / 多 / 编辑正文（N07 只覆盖 1024 标题与抽屉）、App 空 / 少 / 编辑等没有独立深色板的组合；布局 409、离线 / 加载 / 单块失败、首页负数与 R13 尚未交付的 live 秘書空态。依 b8 #15 断点、已有浅色结构与 token 做响应式和深色；REPORT 列每张截图与无板原因，向主会话给补画 / 重比请求。A-R05-12「編集 → 近日公開」是过渡态，R10 完成后退役，不进新门禁。

**已经执行的画板预检（只读，`board-preflight.mjs --no-variants`）：**

| 画板组 | token / 自洽 / 数据来源结论 | 执行前要处理 |
| --- | --- | --- |
| `app.html` #0–#5、#33 | #0 57 值中 7 缺 token；#1 66/9；#2/#3/#33 68/9；#4 编辑 71 值中 1 近似 + 10 缺；#5 库 78 值中 2 近似 + 10 缺。抽查各板疑似数字不自洽 **0**、无功能 **0**；#5 是 sheet 打开中途态。 | 编辑板 `minus` 行高 1 vs token 1.05；手机画框外壳的 54px 圆角 / island / shadow 属系统装饰，按规则 13 排除；业务位置的非 token 值须逐项核对 kit，不能近似抄写。 |
| `web.html` #0–#3、#21 | #0 54 值中 2 缺；#1 66/4；#2/#21 67/3；#3 72 值中 2 近似 + 4 缺。抽查各板疑似不自洽 **0**、无功能 **0**。 | #3 `span.sz` 行高 1.45 vs `--lh-body` 1.5、`minus` 1 vs 1.05，先核 kit；Web 外画框 shadow 不进产品。 |
| `b11` #20–#25、#48 | #20 75 值中 11 缺；#21 72 中 1 近似 + 11 缺；#22 71 中 2 近似 + 8 缺；#23 84 中 2 近似 + 11 缺；#24 79 中 1 近似 + 10 缺；#25 73 中 2 近似 + 4 缺。#20–#25 抽查不自洽 **0**；#22 Toast，#23/#24 sheet 为中途态。 | #23 唯一疑似无功能是「ウィジェットを検索」自由输入，按 §6 本地过滤真实组件 key / 文案。拖动占位、撤销、选尺寸要用操作链进入，不能静态替身冒充功能。 |
| `b12` #86/#88/#218/#222 | N07 68 值中 4 缺；N07b 74 中 1 近似 + 4 缺；N13-A 74 中 8 缺，N13-W 80 中 1 近似 + 5 缺；本组各板自洽报警 **0**。N07b 抽屉打开中途态。 | 不同画板「会いたい人」6 / 14 / 9 等是不同数据状态，不能同一 fixture 内矛盾；N13 的装饰 emoji 不算未实现动作。 |

执行版用 `board-preflight.mjs --suite ... --md ...` 生成逐屏数据来源清单，填每个数字 / 文案 / 按钮对应 §5 的字段或纯视觉说明；把五项结论和源 SHA 附 REPORT。门禁先 Web `--style-diff` 看文字 / 控件几何，数字说不清才看裁剪图；再两端完整页面比对。Web 1440 / 1024 / 390 × 浅深、App 模拟器浅深；**有板的组合**才算门禁分母。记录 raw 与每条超阈带；RD-29 / 决定表 §20 判定以所有超阈带经 `[data]` / `[raster]` / 逐像素可验证的 `[contrast]` 正当归因且无结构缺块为准，raw 仅参考。不能用数据归因掩盖颜色、顺序、尺寸、缺卡。归因文件 `attribution-redesign-R10.json`；复核重跑未过 / 改过 + 抽查 ≥20% 已过。R31a / R31b 合入后才作组件相关像素收口。

## 8. 验收契约（SC；每条写操作链与证据）

| SC | 操作链 / 必须观察到 | 证据 |
| --- | --- | --- |
| SC-R10-01 开工与归属 | D 线确认 R20b / 远端版本、两端基线、服务端口 / 模拟器独占；查 R11a `ContactDrawer`、R13 来源与 R31 组件是否交付；`--list` 锁定 §7，预检逐屏五项、填数据来源；缺口建请求而非占别人文件。 | SHA / 基线摘要、预检与画板清单、越线白名单。 |
| SC-R10-02 D-01 live | 本机 PG：账号 A GET 默认 5 卡、PUT 调整 App 而 Web 不变、重开 GET 相同；账号 B 看不到 A；两个并发 expectedRevision 只有一胜；同 mutationId 重放不重写、同 ID 异体失败；旧 revision 409 回最新。mock 仍给 `sample` fixture、live 不回演示；schema / 快照 / `sync:contract` 通过。 | 路由 + PG 测试、跨端 JSON 回执、契约检查。 |
| SC-R10-03 编辑全链 | 两端从「編集」与长按 0.4 秒进编辑；Web 默认五卡首次进编辑、未改动退出时位置 / 尺寸不跳变 → 再拖动排序 → 小 / 中 →「−」移除 → Toast 元に戻す → 库按类 / 搜索加一块 →「完了」→ 重开顺序 / 尺寸不丢；不可重复、最多 10、键盘 / VoiceOver 替代操作可用；旧近日公開 Toast 不再出现。 | App 模拟器与 Web 浏览器逐步操作记录、Web 首次编辑前 / 中 / 后卡片边界框与顺序、重开回执、UI 测试。 |
| SC-R10-04 Web 首页 | 登录进 `/app/home` 见五卡与空 / 少 / 多；标题年月、铃铛红点、提示条、正常右栏；1024 次の一手按钮和 N07b 380 抽屉点开 / Esc 关 / 焦点返还，390 无 🔍；链接分别进 Task / イベント / 人脈 / 受信箱，不留死 CTA。 | Web 操作录像 / 截图、W-R10 画面与路由测试。 |
| SC-R10-05 App 首页 | `/home` 以 `AppScreen inset="kit"` 显示日期大标题、问候、白圆 🔔 红点、白胶囊「編集」，点铃铛 push 受信箱再返回保留首页滚动；一级底栏与二级转场不重复、旧周条和快捷四键消失，日文字形来自 UiText。 | 模拟器浅深截图、点按 / 返回测试、旧 UI 文本搜索。 |
| SC-R10-06 今日やること | **前置：R20a 最终交付且首页同 actor 与 Task 同源回读；缺任一项不得记完成。** 交付后的 fixture 同时有今日の一手、判断待ち、予定、1問 → 首页件数与 Task 同源；点每行到对的段 / 详情；完成或回答后回首页刷新值变化；只一来源失败只该区重试，离线显示带时间的已存副本，不另发写请求。 | R20a 最终 REPORT / SHA、同 actor Task↔首页 GET 回执与操作链、响应 / UI 测试、离线截图。 |
| SC-R10-07 プラン スコア | `current=null` → 目標を決める → Task › プラン；有计划显示 /100、segments（event = イベント枠）、todayChance；todayDelta 10、0、−10 三态正确，撤销加点后独立刷新仍是负数，不拼 `+−`；接口失败不伪装空计划。 | 三态契约 fixture + 两端截图、N13 符号参考。 |
| SC-R10-08 次のイベント | upcoming 混 registered / planned / waitlisted / cancelled → 只选最早真实 registered；点卡与准备钮到返回的详情 href；`meetCount=null` 不出假数字；无 registered → 评估入口；App / Web 对同一账号同一活动。 | 事件契约 / 视图测试、两端点击链。 |
| SC-R10-09 人脈 | 0 / 5 / 286 联系人时总数、本月增量取 R11a summary；向 B 线请求按加入时间排序，交付后验证最近四人与稳定翻页，同账号新增一人回首页 +1 且列表可见、换号隔离。交付前只展示服务端现有顺序前四并标 TODO，不能将「最近」项记完成；Web 点人开 B 线 `ContactDrawer`、关闭回原滚动，App 点人进详情返回不丢首页状态；浓度与来源遵循 R10-10。 | B 线 `sort=added` 等效契约 / 游标测试、R11a summary 回执、两端操作链与截图；缺排序单列未完成。 |
| SC-R10-10 秘書から | R13 先交契约后：期限 / 会前准备 / 推荐各一条，首页顺序、未读和受信箱目标同源；未知 sourceKind 整条跳过；未交时本机 mock 有 `サンプル`、live 无假提醒；Q5 邮件摘要不请求 Gmail / AI、无孤立邮件按钮。 | mock 与 live 分别截图、来源契约测试、网络请求 / AI 次数 0。 |
| SC-R10-11 组件库四块 | 从库依次加 判断待ち / 今週 / イベント推薦 / メモ → 各块只在可见时读本域接口、无数据空态、点行走本域新路由；Web / App 小中内容差别符合画板，不把「期限」无板 key 露在库；移除再加不会复制项。 | 两端库筛选 / 加回链、请求计数与 UI 测试。 |
| SC-R10-12 三步与铃铛 | 先交 R10 / R28 共用真实进度投影的独立里程碑；示例开关开 / 关对同一 actor 都从真实事实得到相同 0/3 → 逐步完成 → 3/3，完成闩锁重开仍隐藏；老用户不误入，任一来源失败不显示假 0/3；App / Web 🔔 仅在消息或通知有未读时红点，无数字，点受信箱回首页。 | 共用模块独立 SHA、guideState v2 / 开关开关两态回执、两端空态 / 完成截图、铃铛路由测试。 |
| SC-R10-13 右栏与每天一问 | Web 1440 右栏三张真实可执行建议、来源「✨ … ホームから」、🕘 最近会话仅当 E 线摘要可用，1024 按钮 count 等于可见建议数；零建议不显示旧数；R16 每天一问首页回答 / 跳过后与人脈右栏、Task 一致；`AgentDock` 1440 按主区而非视口居中且不影响 E 线会话页。 | 建议源对照表、计数测试、W-R07-03D / AgentDock 位置截图。 |
| SC-R10-14 断网 / 409 / 单源失败 | App 在线改布局 → 飞行模式再改 → 重开保持本地 → 恢复 PUT；另一设备先改导致 409 时采用服务端版并 Toast，旧本地版不能静默盖回；切账号 / baseURL 无串用。布局 503 NOT_IMPLEMENTED 才 fallback，其他错误可重试；四卡任一读取失败只降该卡，不清空其余。 | 两设备回执、离线 / 错误截图、App 缓存与服务测试。 |
| SC-R10-15 旧屏 / 像素 / 不退步 | §7 所有有画板组合用实屏过门禁，raw / 带数 / 归因齐全；缺板注明「设计稿无」并截图；b12 A-R05-12 退役、旧 dashboard 仅引用归零后删；Web 旧 home view-model 的 agent / events 引用保持；R05 壳、R07 壳、R11a 抽屉、R20 Task / メモ入口不退步；旧屏 allowlist 只删本次项。 | 门禁总表、文本引用搜索、route / ratchet 测试、截图对照页。 |
| SC-R10-16 全量与交接 | 两端全量对照 SC-01 基线零新增失败；orbits test / typecheck / typecheck:app / lint / copy QA、App test / tsc；同账号 App 改 App layout→Web GET 不变→Web 改 Web layout→App GET 两数组均正确，换号隔离；REPORT 逐条回 R10-01～10，写 Bridge 的本端版本、另一端影响、未完与联验范围；独立复核自己重跑定向、全量和像素抽查。 | 命令退出码与通过 / 失败数、跨端回读表、REPORT / REVIEW。 |

## 9. 执行顺序

1. SC-01 固定远端与 R20a 最终交付、R20b / R13 / R31 实际交付及 R11a 已交的接口、基线、画板 `--list` 与 `board-preflight`；先向 B 线提出联系人按加入时间排序请求，再列其他缺组件 / 契约请求。R20b 未交也可做 D-01 与五卡结构，不把其メモ源标 live；R20a 未最终交付不启动 SC-06 的完成验收。
2. SC-02 先让 D-01 在本机 PG 真读写，补 CAS / actor / 幂等测试，再 SC-03 做编辑与离线缓存。先处理 D10-1 / D10-2 的默认排布矛盾，避免 UI 完成后返工。
3. SC-04 / 05 做两端容器、标题 / 铃铛 / 编辑；SC-06～12 按读源逐卡接入。SC-12 的 R10 / R28 共用纯投影先单独提交里程碑、另一方 import，首页 API 随后接入。R13 来源未交就用 §5 的空态 / mock 并登记重比；R11a 已交抽屉按 R10-10 直接消费，排序未交只取服务端原顺序前四并标 TODO，不能由 D 线写联系人查询层。
4. SC-13 做 Web 右栏计数、1024 抽屉与 R16 卡，按 E 线文件交接修 AgentDock。SC-14 做离线、409、单源错误；检查 page copy 与所有白名单，确保新字段不丢。
5. R31a / R31b 组件到位后，SC-15 跑完整像素清单、旧屏归零 / 不退步；SC-16 全量与跨端联验。REPORT 给主会话提供 README / HANDOFF / DEFERRED-A / 决定表 / screen-ownership 的**四栏更新原文**，以及 R19 / R28 / E 线的精确输入。主会话独立复核后决定集成；本执行会话不 push。

## 10. 失败与交接

- **依赖缺项只阻塞对应 SC。** R20a 最终交付或首页同源回读缺一 → SC-06 不记完成，先做布局 / 计划 / 活动；B 线按加入时间排序未交 → SC-09「最近四人」未完成，服务端原顺序前四仅作带 TODO 的临时显示；R13 无秘書来源 → SC-10 的本机样例 / live 空态；R16 卡未交 → SC-06/13 请求；A 线组件差 → SC-15 标「待组件库」并登记重比；E 线占用旧 `AgentDock` → SC-13 的定位点请求。所有暂缓写 HANDOFF 四栏草案与 DEFERRED 对应行草案交主会话，解锁后回来重跑，不能把「缺依赖」写成通过。
- **失败必须显式。** `todo/page` 部分 unavailable、plan summary 读失败、联系人 summary 未含 `addedThisMonth`、秘書未知 sourceKind、布局 409 / 503、guide 进度不可推导都按 §5 分别降级，不显示 0 或示例冒充真实值。TDD 按本线已定流程；新失败先诊断并作有界修复，全量未跑不写「全量通过」。
- **交给 R19 / R28 / B / E。** R19 只消费本 Sprint 已验证的卡数据投影，不复刻规则；R28 接三步只读投影并负责引导页，不由 R10 改其页面；B 线接收首页所需秘书来源 / ContactDrawer 的精确契约与重比；E 线接收 `AgentDock` 单点定位与会话摘要依赖。桥接记录写实际 SHA、App / Web 另一端影响、未完成项和本机同 actor 验证范围；仅路由 / 类型检查不代表业务对齐。
- **授权边界。** 生产数据修复、生产 `homeLayouts` 迁移（若最终需要）、Neon、部署 / 环境变量 / 真机分发均登记 DEFERRED「待用户授权」；本 Sprint 无这些动作。新增付费 AI 必须先有配额 / 账本 / 降级，本 Sprint 首页读取不新增调用。
