# Sprint R29 — 运营后台换新

**Plan revision:** 2（2026-10-18 主会话复核后修订；代码事实按 `origin/redesign@cb866e48fbb41e7f540bbf66177f9ae0ac597591` 核对）。**模式:** existing-codebase / single-generator；A 线，执行者为 Claude 子任务。
**单一目标:** R31a / R31b 交付后，以新 token、新组件和规范文案更新两端运营后台 11 个既有路由，保留其真实权限与读模型；用截图对照及功能回归验收。
**易读目标:** [GOAL.md](GOAL.md)。**依赖:** R31a、R31b 已合入执行基线；R18b 登录流程与 D 线普通 Orbit2026Shell 按已交接口使用。后台局部壳由 R29 / A 线集成。
**设计门禁结论:** R29 路由无画板；[归属表](../screen-ownership.md) 和交接 R29-01 明定“不重画”。全部状态 **「设计稿无，附截图，不进门禁」**。不生成虚假的像素通过记录。
**生产边界:** 不连 Neon、不做生产迁移 / 部署 / 生产变量 / TestFlight；需此类动作写 DEFERRED「待用户授权」。本 Sprint 不新增付费 AI 调用。

## 0. 给 Claude 子任务的执行说明

1. 在 `/Volumes/ORICO/Dev/worktrees/orbit/redesign-a`（`line-a`）工作，先核对 `origin/redesign` 与 R31a / R31b 交付版本；按 RD-31/32 只在本线提交，不推送。主会话复核后推送；不用本编制 worktree 实施。
2. 阅读本文件、[GOAL](GOAL.md)、[README](../README.md) 通用规则 10–13 与 RD-16、RD-24～33、[HOW-TO](../HOW-TO-START-A-FEATURE-SPRINT.md)、[交接表](../HANDOFF-TO-FEATURE-SPRINTS.md) 通用口径和 R29-01、[DEFERRED-A](../DEFERRED-A.md)、[归属表](../screen-ownership.md)、[决定表](../maintenance/2026-10-12-decisions.md)、[总计划](../../IMPLEMENTATION-PLAN.md) D-06，以及 R31a / R31b 的 REPORT 和组件出口。涉及 Web ↔ App 可见行为时读 `bridge/status.md`、`bridge/handoffs.md`；交接内容写 REPORT 供协调者更新，子任务不改根台账。
3. 开工重跑两端基线并记通过 / 失败摘要；按现代码先写能验证行为的测试，再做最小改动。每次改页面先用文本搜索核对引用；R29 自己改后台局部壳，通用组件与普通 Orbit2026Shell 只向各归属线提请求。README RD-32 已取消 GitNexus 执行要求。截图与日志放 `~/orbit-sprint-evidence/redesign/R29/run-01/`。
4. 验证后**先按路径提交**本线文件，再 `git pull --rebase origin redesign`；解决冲突后重跑受影响检查，`git show --stat HEAD` 核对最终提交与越线，REPORT 记录 rebase 后 SHA。REPORT 列 SC 结果、测试摘要、每页截图路径、允许清单差额、跨端交接、请求、待授权、未完成及实际付费 AI 次数（预计 0）。不推送、不创建 PR；独立复核由主会话安排。
5. 主会话已按 RD-33 代定 §2。遇到新的产品冲突，在 REPORT 写候选、推荐和受影响 SC，先做不依赖的项；缺 A / D 线接口写具体请求。不得用“截图已拍”替代业务通过，不得把无画板页面记为像素通过。

## 1. 本线归属的文件 / 不许碰的文件（RD-31）

**A 线本 Sprint 可改：**

- Web 六个既有路由的页面内容：`repos/orbits/app/(app)/app/admin/{page.tsx,access/page.tsx,events/page.tsx,read-cost/page.tsx,read-cost/read-cost-copy.ts}`、`app/(app)/app/login-admin/page.tsx`、`app/(app)/app/platform/page.tsx`；后台专用 `orbit-real-admin-{login,workspace,events,shell}.tsx`、`admin/compose-app-admin-platform-from-previously-approved-mock-first-capabilities/admin-platform-route-view-model.ts`、`orbit-admin-platform-route-view-model.ts`。`orbit-real-admin-shell.tsx` 是本后台局部壳，桌面按钮、手机 tabs 和退出入口由 R29 换新组件并集成；新建本组 CSS Modules 和 `orbit-2026/copy/admin.ts`。现有 route model 的数据来源、状态枚举与外部导出只作兼容性修改。
- App 五个既有路由 `app/{admin.tsx,admin/access.tsx,admin/events.tsx,login-admin.tsx,platform.tsx}`；`src/screens/admin/{AdminScreen,AdminLoginScreen}.tsx`、`src/screens/platform/PlatformScreen.tsx`、`src/view-models/{admin,platform}.ts`；新建 `src/i18n/{ja,zh,en}/admin.ts` 与本屏测试。
- 本屏的允许清单**只删自己条目**：App `tests/fixtures/{ionicons-legacy-allowlist,hardcoded-copy-legacy-allowlist,legacy-ui-allowlist}.json`，Web `tests/fixtures/hardcoded-copy-legacy-allowlist.json`；相关源测试、route coverage / offline inventory 的本屏行按实际改变修正。文案域和路由的汇总文件只追加本线项，不覆盖他线项。
- 本目录后续 `REPORT.md` 与截图证据；本任务编制阶段只创建 GOAL / PLANNER。没有 R29 画板，不建 `views/*-R29.json` 或 `attribution-redesign-R29.json` 来伪装门禁。

**不许碰；需改就给归属线请求：**

- D 线普通导航壳：Web `orbit-2026/shell/**`（含 `shell-routes.ts`）；App `src/components/{AppScreen,ShellTopBar,OrbitTabBar,TabPageBar}.tsx` 与 `src/view-models/app-navigation.ts`。A 线只传既有普通壳参数；R29 的后台局部壳是上面的本线可改文件，不等 D 线交付。
- R31a / R31b 已交的通用组件与 token：App `src/components/ui/**`、Web `orbit-2026/ui/**`、`shared/design/tokens.json`、`kit/**`；缺尺寸/状态参数向 A 线组件维护段提请求，不能在后台页手写仿制件。若同一 A 线执行者继续维护组件，也须先单列组件范围和回归，不把通用改动藏进页面提交。
- C 线认证与账户、B 线联系人/收件箱、E 线 iOrbit；两端通用认证、服务端管理权限、`features/operations/read-cost/**`、`app/api/admin/read-cost/**`、活动/主办写入服务、离线同步基础设施、`shared/contract/**`。R29 只消费现有读接口，不改 schema、不新增 API / 迁移 / AI 用途。
- README、HANDOFF、DEFERRED-A、决定表、screen-ownership、Bridge 台账由主会话协调；子任务在 REPORT 给逐项更新请求。`orbit-reference-styles.tsx` 与旧全局 CSS 被其他页面使用，不直接删除。

**隔离:** Web dev server、`distDir`、本地测试库、Metro 与模拟器按 A 线现有分配，不能占其他线端口/库；画板查询临时服务用 3350+ 独立端口并关闭。只用本机测试数据。

## 2. 主会话代定（RD-33；2026-10-18 主会话复核采纳）

| # | 推荐决定及理由 | 落点 |
| --- | --- | --- |
| A-1 | R29-01 与归属表优先于通用 RD-16：11 个屏均无后台画板，维持现有信息架构，只换 token、组件与文案；每屏浅/深截图和功能回归，不用其他画板冒充后台设计。以后若补画，再另列门禁。 | §7、SC-02～11 |
| A-2 | `/app/admin/access`、`/app/login-admin` 与 App `/admin/access`、`/login-admin` 是**公开登录入口**；统一 CTA 到既有账号登录并带安全的返回地址。App `admin/access` 不再在未登录状态装载 `AdminScreen` 的资料请求；后台首页 / 活动 / platform 仍需登录。它解决当前 App 公共入口预取问题，不授予管理员角色。 | SC-02、07、11 |
| A-3 | 后台首页 / 活动保持“当前账号来源记录，只读”口径；报名、签到、容量、匹配、团队或全平台审核若无专用可信读源就不显示数字和动作。Web `/platform` 保持 `PLATFORM_ADMIN_PROVIDER_UNAVAILABLE` 的封闭状态；App `/platform` 现读公开活动，只能称“公开活动来源核对”，不能称审核队列或平台健康指标，不加批准 / 驳回。 | SC-03、04、06、09、10、11 |
| A-4 | `read-cost` 仅 Web；沿用 `ORBIT_READ_COST_ADMIN_ACCOUNT_IDS` 守卫、UTC 日/抽样放大/未归属的既有口径。改前后用**同一账号、同一固定数据与同一路由参数**逐项对账；无记录才显示空态，缺 runtime 或汇总读取抛错显示可恢复的页面故障态，不能再落成“暂无数据”。未登录跳转、非授权页面 404 / API 403、API 故障 503 均保持；App 不补读数页。 | SC-05、11 |
| A-5 | R17-15 的公开主催页「通報する」需要公开反馈表单、服务端存储、滥用防护与运营处理流程，超出本次“只换 token + 组件”。**明确转出**为后续独立功能请求，保留现有复制 URL 退路；R29 不修改 `/o/[slug]` 或把公开表单藏在需登录的 `/app/admin` 下。**承接人：A 线 Claude（R29 之后另开独立反馈功能 Sprint）；主会话负责排期及更新 HANDOFF / DEFERRED-A。R17-15 保持未完成，不记 R29 完成。** | SC-15 |
| A-6 | 视觉验收取旧版行为截图作“前”，新 token / 组件作“后”；有无画板都不允许“像素通过”字样。现有界面中文/英文硬编码改为本屏 ja/zh/en 文案；异常文案也要进字典。没有数据源的原型词只作工程说明，不冒充实际角色。 | SC-12～14 |

## 3. 交接条目映射（每条进入 SC 或明确转出）

| 条目 | R29 去向 |
| --- | --- |
| **R29-01** | A-1；11 路由的 token / 组件 / 文案换新，SC-02～10；无画板例外与截图 SC-13。负责人 RD-31/32 已定 A 线 Claude。 |
| **R17-15 / DEFERRED-A R17-15** | A-5，SC-15 明确转出给 A 线 Claude，在 R29 后另开独立反馈功能 Sprint；主会话登记排期。R17-15 仍为未完成，不在 R29 偷加 API 或标 done。 |
| G01 / G10 / G11 / G12 | 后台局部壳由 R29 / A 线换新组件并集成（SC-12）；普通 Orbit2026Shell 归 D 线且现有排除规则不改。验证返回与窄屏，不给普通页面新增 ⌘K / 搜索按钮。 |
| G02 / G03 / G04 | SC-12：次要提示可用 `ink-3` 例外，其余文字对比度；危险动作用 `coral-text`；App 可见按钮与触控区复用 R31a 组件。 |
| G05 / G06 / G07 / G08 / G09 | G05 的后台无画板例外按 A-1；SC-13 附截图不跑门禁。真实/只读 fixture 拍中途态，不写库、不调 AI；系统状态栏不手画。 |
| G13 / G14 | SC-12：旧 `.btn` 不漏入新组件；后台独立壳、公开登录入口仍符合排除规则；公开页不塞进私有路由。 |
| G15 / G16 / G17 | SC-07～10：App `AppScreen inset="kit"`，二级返回/系统安全区由现有壳负责，不直接 import `OrbitTabBar`。 |
| G18 / G19 | SC-11：能力缺失显式降级，示例不入生产；本 Sprint 不加 DTO 字段。若实施不得不加，先核对 App strict 读取、响应宽进与同步副本，另列请求。 |
| G20 | SC-14：本组 Ionicons / 写死文字 / 旧写法清单逐文件清零，只删本组行；通用旧组件有外部引用时保留。 |
| G21 / G22 / G23 / G23b / G24 / G25 / G26 | SC-12～14：Web 新作用域/CSS Modules、cookie 语言不拼 `?lang=`、新组件与 UiText、已有字号/圆角 token；组件缺口提请求，相关截图与回归证据。 |

## 4. 已查清的代码事实（均按 `git show origin/redesign:<path>` 逐项核实）

以下 `file:line` 以仓库根目录为基准；执行基线吸收 R31a / R31b 后要按符号重定位，不直接沿用行号。

1. **路由范围。** `repos/orbit-app/app/admin.tsx:1-10`、`admin/access.tsx:1-9`、`admin/events.tsx:1-10`、`login-admin.tsx:1-9`、`platform.tsx:1-10` 均调用对应旧屏并包 online-only；除 `admin/access`、`login-admin` 外有 private boundary。Web 六页对应 `repos/orbits/app/(app)/app/admin/{page.tsx:63-99,access/page.tsx:10-18,events/page.tsx:61-97,read-cost/page.tsx:164-190}`、`app/(app)/app/login-admin/page.tsx:10-18`、`platform/page.tsx:43-69`。
2. **公开入口与权限。** Web `repos/orbits/features/auth/app-auth-routing.ts:3-18,34-52` 把 `/app/admin`、`/app/platform` 设为私有，只放行 `/app/admin/access`、`/app/login-admin`；`admin/orbit-real-admin-login.tsx:6-10,23-30` 的 CTA 去 `/app/account/login?next=/app/admin`。App `src/view-models/mobile-route-access.ts:3-27` 把 `/admin/access` 列为公开例外。当前 App `app/admin/access.tsx:1-9` 却直接挂 `AdminScreen`，其 `src/screens/admin/AdminScreen.tsx:42-55` 在入口就取 events/profile/dashboard；刷新 UI 不是权限证明，应先修公共入口预取。
3. **Web admin 真正的数据边界。** `admin/page.tsx:63-80` 和 `admin/events/page.tsx:61-78` 先查会话，再把账号 id 交 route model；`admin/compose-app-admin-platform-from-previously-approved-mock-first-capabilities/admin-platform-route-view-model.ts:396-435` 只从账号事件与资料组成成功态，失败/待定走 route-state；`:311-369` 四个数字来自事件来源与日期。`admin/orbit-real-admin-workspace.tsx:49-60` 明说来源只读、缺专用 provider 的指标隐藏。不能把这些数叫平台总量。
4. **Web platform 封闭。** `admin/compose-app-admin-platform-from-previously-approved-mock-first-capabilities/admin-platform-route-view-model.ts:384-394` 对 platform 固定返回 `PLATFORM_ADMIN_PROVIDER_UNAVAILABLE`；`platform/page.tsx:43-66` 登录后渲染 route-state，不给平台成功态。新组件不得把 route-state 改成空白或虚构平台总览。
5. **Web read-cost 授权、统计与故障缺口。** `admin/read-cost/page.tsx:164-185` 未登录跳账号登录、未列入管理员账号 404；`:174-185` 缺 runtime 时把 `data` 置 `null` 并显示 `noData`，读取抛错则未捕获，页面没有可恢复故障态。`app/api/admin/read-cost/handler.ts:25-42` 对非授权账号 403 且先于读库，缺存储/读取失败 503，响应 `no-store`。`admin/read-cost/read-cost-copy.ts:5-33` 只有 zh/en，统计说明明确 UTC 日、抽样放大、不读库请求不在内和未归属；新文案不能改统计口径。
6. **App 旧 UI 与数据。** `src/screens/admin/AdminScreen.tsx:1-23,42-108` 仍 import Ionicons、旧 DataCard / States / token helper，events/profile/dashboard 三个资源并行读；`:136-166` dashboard / events / access 各有内容和“移动端只核对/跳转”边界。`src/screens/admin/AdminLoginScreen.tsx:13-49` 根据登录态显示 CTA，旧 Pressable / DataCard / Ionicons；`src/screens/platform/PlatformScreen.tsx:34-73,85-104` 读 publicEvents，却写“平台健康”和“审核”类标题；不能把公开目录当审核来源。
7. **后台局部导航与复用。** `admin/orbit-real-admin-shell.tsx:33-47` 自画 dashboard/events 导航、退出按钮与手机 tabs；`admin/orbit-real-admin-workspace.tsx:71-73` 和 `admin/orbit-real-admin-events.tsx:15-30` 都引用它。它是后台自己的局部壳，归 R29 / A 线换新组件并集成；`admin/access/page.tsx:6-15` 与 `login-admin/page.tsx:6-15` 共用旧登录组件，不能通过删共用文件来“清理旧屏”。Web `orbit-2026/shell/shell-routes.ts:6-25` 把 admin/platform/login-admin 排除普通主导航壳，改变该规则才归 D 线。
8. **现有新组件与文案缺口。** Web `orbit-2026/ui/index.ts:1-24` 导出 Button、Card、Table、States、Overlay、Scope；App `src/components/ui/index.ts:1-44` 导出 Button、Card、UiText、States、Icon 等。App `src/i18n/{ja,zh,en}/` 当前无 admin 域，Web `orbit-2026/copy/` 当前无 admin 域；因此 R29 的新增文案域须登记汇总索引。App `src/view-models/{admin.ts:63-140,platform.ts:34-106}` 仍含中文 fallback 与原型词过滤，不能只换视觉组件漏掉状态文案。
9. **白名单与外部引用。** App `tests/fixtures/hardcoded-copy-legacy-allowlist.json:34-35,54`、`ionicons-legacy-allowlist.json:4-5,33`、`legacy-ui-allowlist.json:4-12,104-106` 登记本组三个屏；Web `tests/fixtures/hardcoded-copy-legacy-allowlist.json:76-98` 登记后台三组件、局部壳、read-cost 页面及 copy。App `tests/app-wide-account.test.ts:66-70`、`app-wide-route-coverage.test.ts:135-139` 直接引用/登记旧屏；删除前须逐条核对。Web 两页面共用登录组件、两个后台页面共用局部壳（事实 7）。
10. **画板核对。** `compare-redesign.mjs --list` 在本机临时服务 `:3399` 查过 `web.html`、`app.html`、`b1-onboarding-cards.html`、`b6-host-polish.html`、`b7-account-misc.html`、`b12-missing-states.html` 的画板标题，无 R29/admin/platform/read-cost/login-admin 对应屏；`docs/designs/redesign-2026-10/sprints/screen-ownership.md:56,84,91,96` 两端 R29 行也明确“无设计稿”及交付顺序。服务已停止。`b7` 中“サブスクリプション管理”属于账户/付费，不是后台画板。

## 5. 行为、数据与组件契约

- **只消费现有读源。** Web admin 保持 actor-scoped 来源事件与资料，platform 保持封闭；App admin 继续读既有 events/profile/dashboard，App platform 的 publicEvents 只表达公开活动来源。read-cost 不新建 API、迁移、配额或后台调度。任何新增付费 AI 功能须先定义用途、每账号/全局配额、失败降级和调用账本；R29 预计真实调用 0。
- **认证与失败。** 公共登录页不发需要身份的后台请求；已登录按安全返回地址进入 `/admin` / `/app/admin`。私有页面登出后回登录，非法 `next` 不越站。read-cost 页面将“确有 0 条记录”和“没有 runtime / 汇总查询抛错”分开：后者给可恢复故障态与重试入口，不泄露内部错误；API 保持 403/503，未授权页面保持 404。App online-only 离线态显示需要联网，不把缓存当管理实时数据。无权限/无 provider 的控件隐藏或禁用，并说明原因。
- **文案与样式。** 所有静态用户文案进入 App ja/zh/en 字典和 Web 本组 copy；语言源按 cookie / App 当前 locale，不拼 `?lang=`。Web 使用 `Orbit2026Scope`、`ToastProvider`、CSS Modules 与 `var(--token)`；App 新屏 `AppScreen inset="kit"`、UiText、ui/Icon、ui/Card/Button/ListRow/States。纯布局容器允许保留，不能手写第二套 Card / Button / chip / 表格；Web read-cost 用 ui/Table 或其支持的表格 API，缺排序/小图等参数时给 A 线具体请求。系统外壳不画。
- **跨端与同步。** 本 Sprint原则上不改共享契约，也不在 outbox / domain-registry 中加入新字段。若执行中发现必须加字段：先核对 App strict schema、响应宽进与请求严出；查 `src/data/sync/**` outbox 序列化、`route-domain-inventory.ts` 和同步 domain-registry 白名单是否会丢字段；同步 `shared/**` 副本并跑快照/跨端测试，再向主会话申请扩充范围。只通过路由/类型检查不能宣布业务对齐。

## 6. 屏幕 ID ↔ 画板、截图预检（无画板的明确例外）

`compare-redesign.mjs --list` 已查相关画板文件；本 Sprint **没有可用于逐像素比对的 screen id ↔ board id**。以下 P id 是 R29 截图/回归编号，板栏统一写“设计稿无”。执行者在 R31a/b 合入后再查一次 `--list`，若出现新画板，先请主会话代定是否纳入门禁；不能自动拿别的业务板比。

| P id | 路由 / 屏 | 画板 | 截图组合与到达状态 |
| --- | --- | --- | --- |
| W01 | `/app/login-admin` | 设计稿无 | 1440/1024/390 × 浅/深；未登录 → 安全登录 CTA |
| W02 | `/app/admin/access` | 设计稿无 | 同上；公开入口，CTA 与 W01 同目的地 |
| W03 | `/app/admin` | 设计稿无 | 同上；登录 → 仪表盘成功/空/失败 |
| W04 | `/app/admin/events` | 设计稿无 | 同上；登录 → 活动列表/空/失败 → 返回 |
| W05 | `/app/admin/read-cost` | 设计稿无 | 同上；获授权 → 日/路由/账号/趋势/报警；另截真正空态、缺 runtime/查询抛错的页面故障态；无权限 404 |
| W06 | `/app/platform` | 设计稿无 | 同上；登录 → provider 未就绪状态与恢复链接 |
| A01 | `/login-admin` | 设计稿无 | iOS 模拟器浅/深；未登录 / 已登录 CTA |
| A02 | `/admin/access` | 设计稿无 | 同上；未登录公开入口，不发后台资源请求 |
| A03 | `/admin` | 设计稿无 | 同上；登录 → 成功/空/离线/失败与刷新 |
| A04 | `/admin/events` | 设计稿无 | 同上；登录 → 来源活动 / 空 / 返回 |
| A05 | `/platform` | 设计稿无 | 同上；登录 → 公开来源核对 / 空 / 离线 |

**五项预检（无画板时的适用方式）：**

| 项 | 实施前可核结论 / 待执行动作 |
| --- | --- |
| ① 自洽 | 不造示例统计：admin 计数要与同一来源活动条数、状态日期一致；App platform 公开活动条数与列表一致；read-cost 同账号同固定数据逐项核日期/路由/账号/趋势/报警、单位/7 天/30 天/UTC，另用真实本机数据核一轮。 |
| ② 数据/动作 | W03/W04 当前账号事件与资料；W05 每日汇总、路由与报警；W06 provider unavailable；A03/A04 events/profile/dashboard；A05 publicEvents；W01/W02/A01/A02 只登录跳转。无专用来源的指标/审核按钮不展示。 |
| ③ token/组件 | 只取 R31a/b 导出与设计 token；将旧 DataCard/Pressable/全局 `.card` / `.btn` / inline 色逐处映射。缺 Table 小图/导航参数写 A/D 线请求；不以近似色和本屏仿制控件顶替。 |
| ④ 行为与文案 | 公共入口不预取私有数据；平台不冒称角色/审核；read-cost 无记录、缺 runtime、查询抛错和无权限各有正确状态；ja/zh/en 无混语原型词。 |
| ⑤ 宽度/主题/中途态 | W01–W06 各 3 宽 × 2 主题；A01–A05 真模拟器 2 主题，空/失败/离线另附图。设计稿无，附截图，不进门禁；开发 fixture 不能进入正式构建。 |

`board-preflight.mjs` 需要画板输入，本组无画板，因此**不运行它并不记通过**；执行者把上表落实到 REPORT 的预检与截图清单。截图“前/后”须同一账号、同一数据/状态与语言，记录 viewport、主题、步骤和文件名；功能回归才是放行条件。

## 7. 验收契约（15 条；每条有操作链与主证据）

| SC | 操作链 / 通过条件 | 主证据 |
| --- | --- | --- |
| **SC-R29-01 基线/依赖** | 在 A 线吸收 R31a/b → 核对新组件出口和本组旧引用 → 跑 Web/App 基线 → 记差额与版本；不改他线文件 | 两端版本、测试摘要、文件归属检查 |
| **SC-R29-02 W01/W02 登录** | 退出账号 → 打开两个公开 Web 入口 → 点击 CTA → 既有账号登录 → 安全返回 `/app/admin`；非法 next 回退；浅/深三宽无私有数据 | 路由/认证测试、W01/W02 前后截图 |
| **SC-R29-03 W03 仪表盘** | 登录账号 → `/app/admin` → 只读来源数字与事件/资料互相对账 → 切语言/主题 → 空/读取失败状态可恢复 | route-model 测试、W03 截图、数据对账记录 |
| **SC-R29-04 W04 活动** | 从仪表盘进入 events → 核对现有只读状态标签的计数与列表一致（不把静态标签升级为筛选功能）→ 打开已有活动 → 返回保持可用；无源时空态、失败时不假造记录 | 交互测试、W04 截图、只读请求记录 |
| **SC-R29-05 W05 读取量** | 同一获授权账号、同一固定汇总数据和 `route` 参数截改前/后 → 逐项对账 7 天日期/请求/字节/覆盖率、Top 20 路由和账号、选中路由 30 天趋势、报警及单位/排序 → 返回；再以 0 记录、缺 runtime、查询抛错分别进入空态与可重试页面故障态，不能把后两者显示成 `noData`。未登录跳转、非授权页面 404/API 403、API 故障 503，零泄漏 | 逐项对账表、页面空/故障截图、权限/读模型测试、HTTP 状态日志 |
| **SC-R29-06 W06 平台** | 登录普通账号打开 platform → 明示 provider/角色未就绪 → 返回个人工作区或 admin；不出现假审核队列/批准操作 | route-state 测试、W06 截图 |
| **SC-R29-07 A01/A02 登录** | 退出 → App 两公开入口 → CTA 去现有账号登录 → 登录后进 admin；未登录网络记录没有 events/profile/dashboard；离线呈 online-only 状态 | 原生操作、请求日志、A01/A02 截图 |
| **SC-R29-08 A03 仪表盘** | 登录 → `/admin` → 下拉刷新 → 核对来源数与列表、空/失败/离线；`AppScreen inset="kit"`、UiText 与新组件 | App 渲染/模型测试、A03 模拟器截图 |
| **SC-R29-09 A04 活动** | admin → `/admin/events` → 打开来源活动 → 返回 admin；数量/状态与既有数据一致，无写操作假按钮 | App 导航/渲染测试、A04 截图 |
| **SC-R29-10 A05 平台** | 登录 → `/platform` → 显示公开活动来源核对而非审核结果 → 空/离线/失败/返回；没有批准/驳回 | App 模型/渲染测试、A05 截图 |
| **SC-R29-11 权限与契约** | 逐路由测未登录/普通账号/获授权账号、空与 provider unavailable → 核对 API 权限和无数据泄漏；无新增字段；若发生契约请求按 §5 全部检查 | 权限测试、响应形状与同步清单 |
| **SC-R29-12 新组件与壳** | 每个屏逐项查 token、组件、Web scope/CSS Modules、App inset/安全区；R29 / A 线把 `orbit-real-admin-shell.tsx` 的桌面导航按钮、手机 tabs、退出入口换新组件并接入 admin/events；复查旧全局 `.btn`、390 布局、导航/退出/返回与大字，普通 Orbit2026Shell 不改 | 局部壳组件引用审计、桌面/窄屏/大字截图、导航操作记录 |
| **SC-R29-13 无画板截图** | W01–W06 × 三宽×浅深、A01–A05 ×浅深及异常态 → 逐张标“设计稿无，附截图，不进门禁” → 和旧行为/新组件展示页对照，不写 raw/归因通过 | `R29/run-01/` 截图索引与对照页 |
| **SC-R29-14 清单/全量回归** | 本组三个 App 屏与 Web 本组文件的 Ionicons/写死文字/旧 UI 允许项清零 → 只删本组行 → 两端全量、typecheck、Web lint/copy:qa、路由审计与真模拟器回归；零新增失败 | 清单差额、测试摘要、越线自查 |
| **SC-R29-15 交接/收口** | 对照 R29-01、G01–G26、R17-15 → 将公开反馈转给 A 线 Claude 的后续独立功能 Sprint，R17-15 保持未完成；列普通壳/组件请求、Bridge 版本与另一端影响；需生产动作记“待用户授权” → 交主会话独立复核 | REPORT 逐条表、注明承接人的交接四栏原文、独立复核结果 |

## 8. 执行顺序与收口

1. 吸收 R31a/b，跑基线，按 §4 重查调用点；先记录 W/A 旧版同数据截图。核对 A、D 线文件是否正被其他任务修改，避免越线。
2. 先修公开入口 A02 的私有预取边界与两端登录 CTA，再把 App 三屏换 `AppScreen inset="kit"` / 新组件 / 文案；每屏做成功、空、错误、离线回归。Web 依次换登录、admin、events、read-cost、platform 内容，并在本线换新、集成后台局部壳；只涉及普通 Orbit2026Shell 的变更才向 D 线请求。
3. 每页完毕拍同条件“后”图，逐项核对 §6；read-cost 另交同账号同数据逐项对账与页面故障态证据。白名单只删除已真正清零的本屏行。新组件若缺参数，给 A 线组件维护段请求并继续做其余屏；局部壳未集成不得完成 SC-12 或 R29。
4. 收口跑两端全量和必要审计，核对零新增失败、Web/App 权限与跨端含义；REPORT 写 15 条 SC、11 屏截图索引、问题/转出/待授权、调用次数、越线自查。主会话独立复核时亲自重跑关键权限与截图检查；R29 无像素门禁可重跑。

## 9. 失败、请求与交接

- **基线已有失败**逐项记名与版本；新增失败先做有界修复，不把跳过项记通过。读源缺失、权限不明或外部 provider 未就绪时保持封闭状态，其他页面继续验收。
- **给 A 线组件维护的请求**写现有组件、欠缺的参数/状态、哪一屏/哪一幅截图、期望行为；只有要改普通 Orbit2026Shell 的排除或返回路径才给 D 线请求。后台局部壳由 R29 自己完成，不在页面外再写替代壳。
- **给主会话的交接**包含本端 rebase 后 commit、R31a/b 基线、另一端受影响路径、Bridge 交接四栏、HANDOFF R29-01 的完成结果，以及 R17-15 的转出原文：承接人 A 线 Claude、R29 后另开独立反馈功能 Sprint、R17-15 继续记未完成；由主会话更新 HANDOFF / DEFERRED-A 并排期。若需生产迁移/部署/变量、Neon、TestFlight 或真机分发，只登记 DEFERRED「待用户授权」；本地截图与测试不能代替发布验收。
