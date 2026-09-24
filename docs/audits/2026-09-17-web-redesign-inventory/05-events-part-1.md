# 05-events：源码明细

证据级别：当前工作区源码。此表列出符号级静态可达实现，不宣称每项都在某个角色/状态实际显示。按钮按 JSX 实现记录；数组 map 可生成多项按钮，条件分支互斥，不能把实现数当 DOM 按钮数。

调用表按所属函数提供 HTTP 路径/方法证据；与按钮 handler 是否连通应结合 handler 源码核对。仅同一文件出现的 API 不等于该按钮调用它。路径常量不是一次额外请求。跨文件、动态路径和 callback 不强行配对。

文案包含原有中文/英文/日文及动态表达式。表格中的长表达式节选有标记；完整内容在对应源码。布局表只证明 HTML/ARIA 分区，不证明实际视觉位置。全局 shell 与 layout 另见 01、02。开发页共享组件的来源入口会标为 /dev，不算客户页面。

## repos/orbits/app/(app)/app/admin/events/page.tsx

源码：[page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/admin/events/page.tsx>)

静态来源入口：`/app/admin/events`

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 41 | 属性 title | routeState.copy.title |

## repos/orbits/app/(app)/app/dashboard/compose-app-dashboard-from-previously-approved-mock-first-capabilities/dashboard-service-factory.ts

源码：[dashboard-service-factory.ts](</Users/li/work/orbit/repos/orbits/app/(app)/app/dashboard/compose-app-dashboard-from-previously-approved-mock-first-capabilities/dashboard-service-factory.ts>)

静态来源入口：`/app/dashboard`

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 107 | 文案/数据常量 message | "Dashboard route services are unavailable in the requested mode." |

## repos/orbits/app/(app)/app/dashboard/orbit-real-dashboard.tsx

源码：[orbit-real-dashboard.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/dashboard/orbit-real-dashboard.tsx>)

静态来源入口：`/app/dashboard`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 394 | PriorityPanel | section | priority ? ( &lt;div className="orbit-dashboard-priority"&gt; &lt;div&gt; &lt;h3&gt;{priority.title}&lt;/h3&gt; &lt;p&gt; {priority.contactName} · {priority.organization} &lt;/p&gt; &lt;p&gt;{priority.action}&lt;/p&gt; &lt;/div&gt; &lt;span className="orbit-dashboard-score-pill"&gt;{priority.score}&lt;/span&gt; &lt;span className="orbit-dashboard-chip"&gt; &lt;Icon name="clock" size={14} /&gt; { …（完整表达式见源码） | orbit-dashboard-panel |
| 398 | PriorityPanel | h2 | t({ en: "Relationship health", zh: "关系健康" }) |  |
| 402 | PriorityPanel | h3 | priority.title |  |
| 425 | GapCard | h3 | gap.label |  |
| 444 | CoveragePanel | section |  | orbit-dashboard-panel |
| 448 | CoveragePanel | h2 | t({ en: "Where to build next", zh: "下一步补哪里" }) |  |
| 483 | IndustryPanel | section |  | orbit-dashboard-panel |
| 487 | IndustryPanel | h2 | t({ en: "Industry concentration", zh: "行业集中度" }) |  |
| 515 | RecentActivityPanel | section |  | orbit-dashboard-panel |
| 519 | RecentActivityPanel | h2 | t({ en: "What changed", zh: "发生了什么" }) |  |
| 525 | RecentActivityPanel | h3 | item.label |  |
| 557 | OrbitRealDashboard | main |  | orbit-dashboard-main |
| 558 | OrbitRealDashboard | section |  | orbit-dashboard-hero |
| 563 | OrbitRealDashboard | h1 | t({ en: "Keep the right relationships moving.", zh: "让关键关系持续推进。" }) | orbit-dashboard-title |
| 568 | OrbitRealDashboard | aside | t({ en: "Network coverage score", zh: "网络覆盖评分" }) | orbit-dashboard-score |
| 586 | OrbitRealDashboard | section | t({ en: "Dashboard metrics", zh: "仪表盘指标" }) | orbit-dashboard-grid |
| 592 | OrbitRealDashboard | section |  | orbit-dashboard-section-grid |
| 594 | OrbitRealDashboard | section |  | orbit-dashboard-panel |
| 598 | OrbitRealDashboard | h2 | t({ en: "Review state", zh: "复核状态" }) |  |
| 631 | OrbitRealDashboard | section |  | orbit-dashboard-section-grid |
| 636 | OrbitRealDashboard | section |  | orbit-dashboard-section-grid |
| 638 | OrbitRealDashboard | section |  | orbit-dashboard-panel |
| 642 | OrbitRealDashboard | h2 | t({ en: "Current workspace", zh: "当前工作区" }) |  |
| 646 | OrbitRealDashboard | h3 | t({ en: "Contacts", zh: "联系人" }) |  |
| 652 | OrbitRealDashboard | h3 | t({ en: "Connections", zh: "关系" }) |  |
| 658 | OrbitRealDashboard | h3 | t({ en: "Events represented", zh: "关联活动" }) |  |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 339 | 文案/数据常量 en | "Checked" |
| 339 | 文案/数据常量 zh | "已检查" |
| 340 | 文案/数据常量 en | "Dormant" |
| 340 | 文案/数据常量 zh | "沉睡联系人" |
| 341 | 文案/数据常量 en | "Backed" |
| 341 | 文案/数据常量 zh | "有来源" |
| 342 | 文案/数据常量 en | "High-value" |
| 342 | 文案/数据常量 zh | "高价值关系" |
| 343 | 文案/数据常量 en | "New contacts" |
| 343 | 文案/数据常量 zh | "新增人脉" |
| 344 | 文案/数据常量 en | "Warnings" |
| 344 | 文案/数据常量 zh | "警告" |
| 345 | 文案/数据常量 en | "Follow-ups" |
| 345 | 文案/数据常量 zh | "待跟进" |
| 346 | 文案/数据常量 en | "Relationship assets" |
| 346 | 文案/数据常量 zh | "关系资产" |
| 357 | 文案/数据常量 en | "Collections checked" |
| 357 | 文案/数据常量 zh | "已检查集合" |
| 358 | 文案/数据常量 en | "Needs reactivation" |
| 358 | 文案/数据常量 zh | "需要重新激活" |
| 359 | 文案/数据常量 en | "Relationships with sources" |
| 359 | 文案/数据常量 zh | "带来源的关系" |
| 360 | 文案/数据常量 en | "Source-backed signal" |
| 360 | 文案/数据常量 zh | "来源支持的信号" |
| 361 | 文案/数据常量 en | "Source-backed signal" |
| 361 | 文案/数据常量 zh | "来源支持的信号" |
| 362 | 文案/数据常量 en | "Open source warnings" |
| 362 | 文案/数据常量 zh | "来源警告" |
| 363 | 文案/数据常量 en | "Needs review" |
| 363 | 文案/数据常量 zh | "需要复核" |
| 364 | 文案/数据常量 en | "Evidence-backed network" |
| 364 | 文案/数据常量 zh | "有来源网络" |
| 396 | 翻译 en | "Current Priority" |
| 396 | 翻译 zh | "当前优先级" |
| 398 | 翻译 en | "Relationship health" |
| 398 | 翻译 zh | "关系健康" |
| 415 | 翻译 en | "No urgent relationship action is currently queued." |
| 415 | 翻译 zh | "当前没有紧急关系动作。" |
| 446 | 翻译 en | "Coverage" |
| 446 | 翻译 zh | "覆盖缺口" |
| 448 | 翻译 en | "Where to build next" |
| 448 | 翻译 zh | "下一步补哪里" |
| 485 | 翻译 en | "Network Mix" |
| 485 | 翻译 zh | "网络分布" |
| 487 | 翻译 en | "Industry concentration" |
| 487 | 翻译 zh | "行业集中度" |
| 517 | 翻译 en | "Recent Movement" |
| 517 | 翻译 zh | "最近动态" |
| 519 | 翻译 en | "What changed" |
| 519 | 翻译 zh | "发生了什么" |
| 543 | 翻译 en | "Add source-backed contacts before reviewing relationship trends or creating follow-up actions." |
| 544 | 翻译 zh | "先添加有来源的联系人，再复核关系趋势或创建跟进动作。" |
| 549 | 翻译 en | "No sourced relationship data yet" |
| 550 | 翻译 zh | "还没有有来源的关系数据" |
| 561 | 翻译 en | "Relationship Dashboard" |
| 561 | 翻译 zh | "关系仪表盘" |
| 564 | 翻译 en | "Keep the right relationships moving." |
| 564 | 翻译 zh | "让关键关系持续推进。" |
| 568 | 属性 aria-label | t({ en: "Network coverage score", zh: "网络覆盖评分" }) |
| 568 | 翻译 en | "Network coverage score" |
| 568 | 翻译 zh | "网络覆盖评分" |
| 572 | 翻译 en | "Coverage Score" |
| 572 | 翻译 zh | "覆盖评分" |
| 586 | 属性 aria-label | t({ en: "Dashboard metrics", zh: "仪表盘指标" }) |
| 586 | 翻译 en | "Dashboard metrics" |
| 586 | 翻译 zh | "仪表盘指标" |
| 596 | 翻译 en | "Source Readiness" |
| 596 | 翻译 zh | "来源状态" |
| 598 | 翻译 en | "Review state" |
| 598 | 翻译 zh | "复核状态" |
| 602 | 翻译 en | "Relationships with sources" |
| 602 | 翻译 zh | "带来源的关系" |
| 604 | 翻译 en | "Backed" |
| 604 | 翻译 zh | "有来源" |
| 611 | 翻译 en | "Collections checked" |
| 611 | 翻译 zh | "已检查集合" |
| 613 | 翻译 en | "Checked" |
| 613 | 翻译 zh | "已检查" |
| 620 | 翻译 en | "Open source warnings" |
| 620 | 翻译 zh | "来源警告" |
| 622 | 翻译 en | "Warnings" |
| 622 | 翻译 zh | "警告" |
| 640 | 翻译 en | "Assets" |
| 640 | 翻译 zh | "关系资产" |
| 642 | 翻译 en | "Current workspace" |
| 642 | 翻译 zh | "当前工作区" |
| 646 | 翻译 en | "Contacts" |
| 646 | 翻译 zh | "联系人" |
| 652 | 翻译 en | "Connections" |
| 652 | 翻译 zh | "关系" |
| 658 | 翻译 en | "Events represented" |
| 658 | 翻译 zh | "关联活动" |

## repos/orbits/app/(app)/app/dashboard/orbit-real-party.tsx

源码：[orbit-real-party.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/dashboard/orbit-real-party.tsx>)

静态来源入口：`/app/party`、`/app/party/checkin`、`/app/party/graph`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 116 | PartyMobileTopTabs | header |  | orbit-party-top-tabs orbit-mobile-only |
| 118 | PartyMobileTopTabs | div/tablist | t({ en: "Event pages", zh: "活动页面" }) | orbit-party-top-tab-list |
| 122 | PartyMobileTopTabs | button/tab | label | `chip orbit-party-top-tab${selected ? " is-active" : ""}` |
| 187 | PartyDesktopChrome | nav/tablist | t({ en: "Event pages", zh: "活动内部页面" }) | orbit-party-desktop-tabs |
| 191 | PartyDesktopChrome | button/tab | label | `orbit-party-desktop-tab${selected ? " is-active" : ""}` |
| 323 | PartyEventWindows | section | t({ en: "Event matching schedule", zh: "活动匹配时间" }) | card |
| 327 | PartyEventWindows | h2 | t({ en: "Your event persona and results", zh: "你的活动画像与匹配结果" }) | h-section |
| 406 | PartyHome | h1 | t({ en: "Good evening, ", zh: "晚上好，" }) viewModel.me.initial | h-display |
| 432 | PartyHome | h2 | t({ en: "People recommended for you", zh: "为你推荐的人脉" }) | h-section |
| 483 | PartyHome | h2 | t({ en: "Tonight's agenda", zh: "今晚流程" }) | h-section |
| 532 | PartyRoundTableCard | section | table.memberPrompts.length ? ( &lt;div style={{ background: "var(--accent-softer)", borderRadius: 12, padding: 14 }}&gt; &lt;strong style={{ color: "var(--accent)", fontSize: 13 }}&gt;{t({ en: "Your conversation prompts", zh: "你的对话提示" })}&lt;/strong&gt; {table.memberPrompts.map((prompt) =&gt; &lt;p key={prompt} style={{ color: "var(--text-2)" …（完整表达式见源码） | card |
| 536 | PartyRoundTableCard | h2 | t({ en: `Table ${table.tableNumber}`, zh: `第 ${table.tableNumber} 桌` }) · table.theme | h-title |
| 596 | PartyTable | h1 | t({ en: "Your table assignments", zh: "你的双轮桌次" }) | h-display orbit-party-table-title |
| 643 | PartyRecommendations | h1 | t({ en: "For you", zh: "推荐给你" }) | h-display orbit-party-network-title |
| 698 | PartyAttendees | h1 | t({ en: "All attendees", zh: "全部参会者" }) | h-display orbit-party-network-title |
| 786 | PartyAgenda | h1 | t({ en: "Agenda", zh: "流程议程" }) | h-display orbit-party-network-title |
| 1005 | PersonDetailOverlay | section | detail.placements.map((placement) =&gt; ( &lt;div data-party-placement={`${placement.roundNumber}:${placement.tableNumber}:${placement.seat}`} key={`${placement.roundNumber}:${placement.tableNumber}`} style={{ alignItems: "center", display: "grid", gap: 12, gridTemplateColumns: "auto 1fr auto" }}&gt; &lt;span style={{ alignItems: …（完整表达式见源码） |  |
| 1036 | PersonDetailOverlay | h2 | person.name | h-display |
| 1069 | PersonDetailOverlay | section | detail.responses.map((response) =&gt; ( &lt;article className="card" data-party-profile-response={response.fieldKey} key={response.fieldKey} style={{ padding: 16 }}&gt; &lt;div style={{ alignItems: "center", display: "flex", gap: 8, justifyContent: "space-between" }}&gt; &lt;strong style={{ fontSize: 13.5 }}&gt;{t(response.label)}&lt;/strong&gt; …（完整表达式见源码） |  |
| 1072 | PersonDetailOverlay | h3 | t({ en: "What they shared for this event", zh: "TA 为本场活动填写的内容" }) | h-section |
| 1100 | PersonDetailOverlay | section |  | card |
| 1102 | PersonDetailOverlay | h3 | t({ en: "Why Orbit recommended this connection", zh: "为什么 Orbit 推荐你们认识" }) | h-section |
| 1123 | OrbitRealPartyCheckin | header |  | orbit-party-checkin-top |
| 1139 | OrbitRealPartyCheckin | main |  | orbit-party-checkin-shell |
| 1140 | OrbitRealPartyCheckin | section |  | orbit-party-action-card card |
| 1145 | OrbitRealPartyCheckin | h1 | viewModel.checkedInAt ? t({ en: "You are checked in", zh: "你已完成签到" }) : t({ en: "Confirm your arrival", zh: "确认到场" }) | h-title |
| 1214 | OrbitRealPartyGraph | h1 | t({ en: "Tonight's", zh: "今晚的" }) | h-display |
| 1285 | PartyGraphInline | h1 | t({ en: "Social graph", zh: "社交图谱" }) | h-display orbit-party-graph-title |

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 607 | [industry, setIndustry] = useState("") |
| 608 | [query, setQuery] = useState("") |
| 685 | [query, setQuery] = useState("") |
| 934 | [detail, setDetail] = useState&lt;EventParticipantDetailView \| null&gt;(null) |
| 935 | [detailError, setDetailError] = useState&lt;string \| null&gt;(null) |
| 936 | [loading, setLoading] = useState(true) |
| 1176 | [scale, setScale] = useState(0.95) |
| 1177 | [selected, setSelected] = useState&lt;OrbitPartyPersonView \| null&gt;(null) |
| 1270 | [scale, setScale] = useState(1) |
| 1443 | [tab, setTab] = useState&lt;PartyTab&gt;("home") |
| 1444 | [selectedPerson, setSelectedPerson] = useState&lt;OrbitPartyPersonView \| null&gt;(null) |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 85 | button/button · PartyReturnButton | t({ en: "Back to event", zh: "返回活动" }) | onclick: onExit | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 122 | button/button · PartyMobileTopTabs | {label} | onclick: () =&gt; setTab(key); onkeydown: (event) =&gt; handlePartyTabKey(event, tabs, key, setTab) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 170 | button/button · PartyDesktopChrome | Exit event / 退出活动 | onclick: onExit | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 191 | button/button · PartyDesktopChrome | {label} | onclick: () =&gt; setTab(key); onkeydown: (event) =&gt; handlePartyTabKey(event, tabs, key, setTab) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 227 | button/button · NetworkPerson | t({ en: `View ${p.name}'s details`, zh: `查看 ${p.name} 的详情` }) | onclick: () =&gt; onSelect(p) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 356 | link/a · PartyEventWindows | Edit event persona / 编辑本场活动画像 | eventProfileHref | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 412 | button/button · PartyHome | Checked in / 已签到 / Check-in unavailable / 暂不支持签到 / Check-in closed / 签到已结束 / Check in / 签到 | onclick: () =&gt; navigateTo(partyHrefForEvent(viewModel.eventId, "/checkin")) | {"disabled":"!viewModel.checkInAvailable \|\| viewModel.eventPhase === \"ended\"","renderGateProps":[],"conditions":[]} |
| 422 | button/button · PartyHome | {`${t({ en: "My seat", zh: "我的座位" })} ${viewModel.me.seat}`} / Seat not assigned / 尚未分配座位 | onclick: () =&gt; go("table") | {"disabled":"!viewModel.me.seat \|\| viewModel.me.groupNumber === null","renderGateProps":[],"conditions":[]} |
| 435 | button/button · PartyHome | All / 全部 | onclick: () =&gt; go("recommendations") | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 658 | field/input · PartyRecommendations | t({ en: "Search name / company / industry", zh: "搜索姓名 / 公司 / 行业" }) | onchange: (event) =&gt; setQuery(event.target.value) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 660 | field/select · PartyRecommendations | t({ en: "Filter by industry", zh: "按行业筛选" }) | onchange: (event) =&gt; setIndustry(event.target.value) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 677 | callback-control/NetworkPerson · PartyRecommendations |  | onselect: onSelect | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 703 | field/input · PartyAttendees | t({ en: "Search attendees", zh: "搜索参会者" }) | onchange: (event) =&gt; setQuery(event.target.value) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 731 | button/button · PartyAttendees | t({ en: `View ${person.name}'s details`, zh: `查看 ${person.name} 的详情` }) | onclick: () =&gt; onSelect(person) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 892 | role-button/g · SocialGraphLite | node.name | onclick: () =&gt; onSelect(node); onkeydown: (event) =&gt; { if (event.key === "Enter" \|\| event.key === " ") { event.preventDefault(); onSelect(node); } } | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 996 | callback-control/ModalShell · PersonDetailOverlay | Back / 返回 {&lt;section style={{ background: "linear-gradient(135deg, var(--ink), color-mix(in srgb, var(--ink) 82%, var(--accent)))", borderRadius: 18, color: "var(--on-dark)", display: "grid", gap: 12, marginBottom: 20, padding: 18, }} &gt; &lt;div className="mono" style={{ fontSize: 10.5, letterSpacing: ".2em", opacity: 0.72 }}&gt; {t({ en: "SEAT ASSIGNMENTS", zh: "座位安排" })} &lt;/div&gt; {detail.placements.map((placement) =&gt; ( &lt;div data-party-placement={`${placement.roundNumber}:${placement. …（完整表达式见源码） | onclose: onClose | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 998 | button/button · PersonDetailOverlay | t({ en: "Close participant details", zh: "关闭参会者详情" }) | onclick: onClose | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1124 | link/a · OrbitRealPartyCheckin | t({ en: "Back", zh: "返回" }) | partyHrefForEvent(viewModel.eventId) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1164 | link/a · OrbitRealPartyCheckin | Return to event home / 返回活动主页 | partyHrefForEvent(viewModel.eventId) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1191 | button/button · OrbitRealPartyGraph | t({ en: "Back", zh: "返回" }) | onclick: () =&gt; navigateTo(partyHrefForEvent(viewModel.eventId)) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1247 | button/button · OrbitRealPartyGraph | t({ en: "Zoom out", zh: "缩小" }) | onclick: () =&gt; setScale((value) =&gt; Math.max(0.5, value - 0.2)) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1253 | button/button · OrbitRealPartyGraph | t({ en: "Zoom in", zh: "放大" }) | onclick: () =&gt; setScale((value) =&gt; Math.min(4, value + 0.2)) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1258 | callback-control/SocialGraphLite · OrbitRealPartyGraph |  | onselect: setSelected | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1264 | callback-control/PersonDetailOverlay · OrbitRealPartyGraph |  | onclose: () =&gt; setSelected(null) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1288 | button/button · PartyGraphInline | t({ en: "Zoom out", zh: "缩小" }) | onclick: () =&gt; setScale((value) =&gt; Math.max(0.6, value - 0.2)) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1291 | button/button · PartyGraphInline | t({ en: "Zoom in", zh: "放大" }) | onclick: () =&gt; setScale((value) =&gt; Math.min(2.5, value + 0.2)) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1312 | callback-control/SocialGraphLite · PartyGraphInline |  | onselect: onSelect | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1453 | callback-control/PartyRecommendations · OrbitRealParty |  | onselect: setSelectedPerson | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1454 | callback-control/PartyAttendees · OrbitRealParty |  | onselect: setSelectedPerson | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1455 | callback-control/PartyGraphInline · OrbitRealParty |  | onselect: setSelectedPerson | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1458 | callback-control/PersonDetailOverlay · OrbitRealParty |  | onclose: () =&gt; setSelectedPerson(null) | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 943 | PersonDetailOverlay | 调用 | GET/由封装决定 | `/api/events/${encodeURIComponent(eventId)}/operations/participants/${encodeURIComponent(person.id)}` |
| 944 | PersonDetailOverlay | 路径常量 | 见调用/handler | `/api/events/${encodeURIComponent(eventId)}/operations/participants/${encodeURIComponent(person.id)}` |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 85 | 属性 aria-label | t({ en: "Back to event", zh: "返回活动" }) |
| 85 | 翻译 en | "Back to event" |
| 85 | 翻译 zh | "返回活动" |
| 105 | 翻译 en | "Live home" |
| 105 | 翻译 zh | "现场主页" |
| 106 | 翻译 en | "For you" |
| 106 | 翻译 zh | "推荐给你" |
| 107 | 翻译 en | "All attendees" |
| 107 | 翻译 zh | "全部参会者" |
| 109 | 翻译 en | "Groups" |
| 109 | 翻译 zh | "分组" |
| 111 | 翻译 en | "Graph" |
| 111 | 翻译 zh | "关系图谱" |
| 112 | 翻译 en | "Agenda" |
| 112 | 翻译 zh | "流程议程" |
| 118 | 属性 aria-label | t({ en: "Event pages", zh: "活动页面" }) |
| 118 | 翻译 en | "Event pages" |
| 118 | 翻译 zh | "活动页面" |
| 157 | 翻译 en | "Live home" |
| 157 | 翻译 zh | "现场主页" |
| 158 | 翻译 en | "For you" |
| 158 | 翻译 zh | "推荐给你" |
| 159 | 翻译 en | "All attendees" |
| 159 | 翻译 zh | "全部参会者" |
| 161 | 翻译 en | "Groups" |
| 161 | 翻译 zh | "分组" |
| 163 | 翻译 en | "Graph" |
| 163 | 翻译 zh | "关系图谱" |
| 164 | 翻译 en | "Agenda" |
| 164 | 翻译 zh | "流程议程" |
| 172 | 翻译 en | "Exit event" |
| 172 | 翻译 zh | "退出活动" |
| 174 | 翻译 en | "E" |
| 174 | 翻译 zh | "活" |
| 176 | 翻译 en | "Live event" |
| 176 | 翻译 zh | "活动现场" |
| 179 | 翻译 en | "Your seat" |
| 179 | 翻译 zh | "你的座位" |
| 180 | 翻译 en | "No source-backed seat assignment" |
| 180 | 翻译 zh | "暂无来源可核验的座位安排" |
| 184 | 翻译 en | "Ended" |
| 184 | 翻译 zh | "已结束" |
| 187 | 属性 aria-label | t({ en: "Event pages", zh: "活动内部页面" }) |
| 187 | 翻译 en | "Event pages" |
| 187 | 翻译 zh | "活动内部页面" |
| 227 | 属性 aria-label | t({ en: `View ${p.name}'s details`, zh: `查看 ${p.name} 的详情` }) |
| 228 | 翻译 en | `View ${p.name}'s details` |
| 228 | 翻译 zh | `查看 ${p.name} 的详情` |
| 240 | 翻译 en | `Group ${p.groupNumber}` |
| 240 | 翻译 zh | `第${p.groupNumber}组` |
| 274 | 翻译 en | "AI generation failed" |
| 274 | 翻译 zh | "AI 生成失败" |
| 277 | 翻译 en | "The organizer can retry failed shards. No substitute result was published." |
| 277 | 翻译 zh | "组织者可重试失败分片；系统没有发布替代结果。" |
| 281 | 翻译 en | "Results are not open yet" |
| 281 | 翻译 zh | "结果尚未开放" |
| 283 | 翻译 en | `Results open at ${formatOrbitPartyDateTime(viewModel.resultsAvailableAt)}.` |
| 284 | 翻译 zh | `结果将在 ${formatOrbitPartyDateTime(viewModel.resultsAvailableAt)} 开放。` |
| 289 | 翻译 en | "Results have not been generated" |
| 289 | 翻译 zh | "结果尚未生成" |
| 290 | 翻译 en | "The organizer has not published an AI generation for this registration snapshot." |
| 290 | 翻译 zh | "组织者尚未为当前报名快照发布 AI 生成结果。" |
| 294 | 翻译 en | "AI generation is processing" |
| 294 | 翻译 zh | "AI 正在生成" |
| 295 | 翻译 en | "The result will appear only after every shard succeeds and the organizer publishes it." |
| 295 | 翻译 zh | "只有全部分片成功且组织者发布后，结果才会出现。" |
| 299 | 翻译 en | "No recommended match" |
| 299 | 翻译 zh | "暂无推荐匹配" |
| 302 | 翻译 en | "The published AI result did not return a match for this participant." |
| 302 | 翻译 zh | "已发布的 AI 结果未为该参会者返回匹配。" |
| 323 | 属性 aria-label | t({ en: "Event matching schedule", zh: "活动匹配时间" }) |
| 323 | 翻译 en | "Event matching schedule" |
| 323 | 翻译 zh | "活动匹配时间" |
| 326 | JSX文字 | MATCHING TIMELINE |
| 328 | 翻译 en | "Your event persona and results" |
| 328 | 翻译 zh | "你的活动画像与匹配结果" |
| 333 | 翻译 en | "Persona editable" |
| 333 | 翻译 zh | "画像可编辑" |
| 334 | 翻译 en | "Persona locked" |
| 334 | 翻译 zh | "画像已锁定" |
| 340 | 翻译 en | "PERSONA EDIT DEADLINE" |
| 340 | 翻译 zh | "画像编辑截止" |
| 348 | 翻译 en | "RESULTS OPEN" |
| 348 | 翻译 zh | "结果开放时间" |
| 358 | 翻译 en | "Edit event persona" |
| 358 | 翻译 zh | "编辑本场活动画像" |
| 363 | 翻译 en | "Event persona is read only" |
| 363 | 翻译 zh | "本场活动画像仅可查看" |
| 369 | 翻译 en | "Changes saved before the deadline are included in the frozen matching snapshot." |
| 370 | 翻译 zh | "截止时间前保存的修改会进入冻结的匹配快照。" |
| 373 | 翻译 en | "The persona deadline has been reached. This event persona is locked so the published matching snapshot cannot change." |
| 374 | 翻译 zh | "画像截止时间已到；本场活动画像已锁定，以确保已发布的匹配快照不再变化。" |
| 390 | 翻译 en | "Live" |
| 390 | 翻译 zh | "进行中" |
| 394 | 翻译 en | "Upcoming" |
| 394 | 翻译 zh | "即将开始" |
| 398 | 翻译 en | "Ended" |
| 398 | 翻译 zh | "已结束" |
| 403 | 翻译 en | "RECAP · On site" |
| 403 | 翻译 zh | "回顾 · 现场" |
| 404 | 翻译 en | "On site" |
| 404 | 翻译 zh | "现场" |
| 407 | 翻译 en | "Good evening, " |
| 407 | 翻译 zh | "晚上好，" |
| 415 | 翻译 en | "Checked in" |
| 415 | 翻译 zh | "已签到" |
| 417 | 翻译 en | "Check-in unavailable" |
| 417 | 翻译 zh | "暂不支持签到" |
| 419 | 翻译 en | "Check-in closed" |
| 419 | 翻译 zh | "签到已结束" |
| 420 | 翻译 en | "Check in" |
| 420 | 翻译 zh | "签到" |
| 425 | 翻译 en | "My seat" |
| 425 | 翻译 zh | "我的座位" |
| 426 | 翻译 en | "Seat not assigned" |
| 426 | 翻译 zh | "尚未分配座位" |
| 433 | 翻译 en | "People recommended for you" |
| 433 | 翻译 zh | "为你推荐的人脉" |
| 440 | 翻译 en | "All" |
| 440 | 翻译 zh | "全部" |
| 455 | 翻译 en | "Match" |
| 455 | 翻译 zh | "匹配" |
| 466 | 翻译 en | "Why recommended" |
| 466 | 翻译 zh | "为什么推荐" |
| 471 | 翻译 en | "Icebreakers" |
| 471 | 翻译 zh | "破冰问题" |
| 475 | JSX文字 | 0 |
| 484 | 翻译 en | "Tonight's agenda" |
| 484 | 翻译 zh | "今晚流程" |
| 509 | 翻译 en | "Live" |
| 509 | 翻译 zh | "进行中" |
| 537 | 翻译 en | `Table ${table.tableNumber}` |
| 537 | 翻译 zh | `第 ${table.tableNumber} 桌` |
| 540 | 翻译 en | "Your seat" |
| 540 | 翻译 zh | "你的座位" |
| 545 | 翻译 en | "Why you are at this table" |
| 545 | 翻译 zh | "你为什么被分到这桌" |
| 554 | 翻译 en | "Table icebreakers" |
| 554 | 翻译 zh | "全桌破冰" |
| 559 | JSX文字 | 0 |
| 567 | 翻译 en | "Your conversation prompts" |
| 567 | 翻译 zh | "你的对话提示" |
| 577 | 翻译 en | "Seat" |
| 577 | 翻译 zh | "座位" |
| 579 | 翻译 en | "Why this member" |
| 579 | 翻译 zh | "成员分组理由" |
| 595 | JSX文字 | TWO AI ROUNDS |
| 596 | 翻译 en | "Your table assignments" |
| 596 | 翻译 zh | "你的双轮桌次" |
| 599 | 属性 label | ROUND 01 · COMPLEMENTARY |
| 600 | 属性 label | ROUND 02 · TOPIC |
| 642 | JSX文字 | FOR YOU |
| 643 | 翻译 en | "For you" |
| 643 | 翻译 zh | "推荐给你" |
| 648 | JSX文字 | RECOMMENDED |
| 658 | 属性 placeholder | t({ en: "Search name / company / industry", zh: "搜索姓名 / 公司 / 行业" }) |
| 658 | 翻译 en | "Search name / company / industry" |
| 658 | 翻译 zh | "搜索姓名 / 公司 / 行业" |
| 660 | 属性 aria-label | t({ en: "Filter by industry", zh: "按行业筛选" }) |
| 661 | 翻译 en | "Filter by industry" |
| 661 | 翻译 zh | "按行业筛选" |
| 667 | 翻译 en | "All industries" |
| 667 | 翻译 zh | "全部行业" |
| 697 | JSX文字 | ATTENDEES |
| 698 | 翻译 en | "All attendees" |
| 698 | 翻译 zh | "全部参会者" |
| 699 | 翻译 en | `${viewModel.attendees.length} registered attendees` |
| 699 | 翻译 zh | `共 ${viewModel.attendees.length} 位真实报名参会者` |
| 703 | 属性 placeholder | t({ en: "Search attendees", zh: "搜索参会者" }) |
| 703 | 翻译 en | "Search attendees" |
| 703 | 翻译 zh | "搜索参会者" |
| 714 | 翻译 en | "My seat" |
| 714 | 翻译 zh | "我的席位" |
| 715 | 翻译 en | "No source-backed seat assignment" |
| 715 | 翻译 zh | "暂无来源可核验的座位安排" |
| 731 | 属性 aria-label | t({ en: `View ${person.name}'s details`, zh: `查看 ${person.name} 的详情` }) |
| 732 | 翻译 en | `View ${person.name}'s details` |
| 732 | 翻译 zh | `查看 ${person.name} 的详情` |
| 770 | 翻译 en | "Event live" |
| 770 | 翻译 zh | "活动进行中" |
| 772 | 翻译 en | "Upcoming" |
| 772 | 翻译 zh | "即将开始" |
| 773 | 翻译 en | "Ended" |
| 773 | 翻译 zh | "已结束" |
| 785 | JSX文字 | AGENDA |
| 786 | 翻译 en | "Agenda" |
| 786 | 翻译 zh | "流程议程" |
| 787 | 翻译 en | "Tonight's agenda" |
| 787 | 翻译 zh | "今晚流程" |
| 892 | 属性 aria-label | node.name |
| 926 | JSX文字 | YOU |
| 957 | 翻译 en | "Participant details could not be loaded." |
| 958 | 翻译 zh | "暂时无法加载参会者详情。" |
| 970 | 翻译 en | "Participant details could not be loaded." |
| 971 | 翻译 zh | "暂时无法加载参会者详情。" |
| 996 | 属性 label | person.name |
| 998 | 属性 aria-label | t({ en: "Close participant details", zh: "关闭参会者详情" }) |
| 998 | 翻译 en | "Close participant details" |
| 998 | 翻译 zh | "关闭参会者详情" |
| 1000 | 翻译 en | "Back" |
| 1000 | 翻译 zh | "返回" |
| 1017 | 翻译 en | "SEAT ASSIGNMENTS" |
| 1017 | 翻译 zh | "座位安排" |
| 1022 | JSX文字 | R |
| 1026 | 翻译 en | `Table ${placement.tableNumber}` |
| 1026 | 翻译 zh | `第 ${placement.tableNumber} 桌` |
| 1046 | 翻译 en | `Group ${person.groupNumber}` |
| 1046 | 翻译 zh | `第${person.groupNumber}组` |
| 1060 | 翻译 en | "Loading verified profile responses…" |
| 1060 | 翻译 zh | "正在加载可核验的活动资料…" |
| 1071 | JSX文字 | PROFILE RESPONSES |
| 1073 | 翻译 en | "What they shared for this event" |
| 1073 | 翻译 zh | "TA 为本场活动填写的内容" |
| 1081 | 翻译 en | "Participant-provided" |
| 1081 | 翻译 zh | "参会者填写" |
| 1087 | 翻译 en | "Question asked: " |
| 1087 | 翻译 zh | "本场提问：" |
| 1092 | 翻译 en | "Historical answer; the original question was not stored." |
| 1092 | 翻译 zh | "历史回答，原始问题未被保存。" |
| 1101 | JSX文字 | WHY THIS PERSON |
| 1102 | 翻译 en | "Why Orbit recommended this connection" |
| 1102 | 翻译 zh | "为什么 Orbit 推荐你们认识" |
| 1124 | 属性 aria-label | t({ en: "Back", zh: "返回" }) |
| 1125 | 翻译 en | "Back" |
| 1125 | 翻译 zh | "返回" |
| 1132 | JSX文字 | ON-SITE CHECK-IN |
| 1133 | 翻译 en | "Check-in status" |
| 1133 | 翻译 zh | "签到状态" |
| 1136 | 翻译 en | "ZH / JA" |
| 1136 | 翻译 zh | "中 / 日" |
| 1144 | JSX文字 | PERSISTED EVENT CHECK-IN |
| 1147 | 翻译 en | "You are checked in" |
| 1147 | 翻译 zh | "你已完成签到" |
| 1148 | 翻译 en | "Confirm your arrival" |
| 1148 | 翻译 zh | "确认到场" |
| 1152 | 翻译 en | "This writes an actor-scoped arrival record for your real event registration during the organizer-defined check-in window." |
| 1153 | 翻译 zh | "该操作会在组织者设定的签到时间窗内，为你的真实活动报名写入仅限本人范围的到场记录。" |
| 1166 | 翻译 en | "Return to event home" |
| 1166 | 翻译 zh | "返回活动主页" |
| 1191 | 属性 aria-label | t({ en: "Back", zh: "返回" }) |
| 1191 | 翻译 en | "Back" |
| 1191 | 翻译 zh | "返回" |
| 1196 | JSX文字 | STEP 02 / 02 |
| 1198 | 翻译 en | "Social graph" |
| 1198 | 翻译 zh | "社交图谱" |
| 1201 | 翻译 en | "ZH / JA" |
| 1201 | 翻译 zh | "中 / 日" |
| 1206 | JSX文字 | SOCIAL GRAPH |
| 1210 | 翻译 en | "Published" |
| 1210 | 翻译 zh | "已发布" |
| 1211 | 翻译 en | "Unavailable" |
| 1211 | 翻译 zh | "不可用" |
| 1215 | 翻译 en | "Tonight's" |
| 1215 | 翻译 zh | "今晚的" |
| 1217 | 翻译 en | "connection map." |
| 1217 | 翻译 zh | "连接图。" |
| 1219 | 翻译 en | "Zoom in to see the whole night's connections. You can zoom and tap any node to view their details." |
| 1219 | 翻译 zh | "放大看一眼整场连接关系。你可以缩放，并点击任意节点查看对方详情。" |
| 1221 | 翻译 en | "Published generation only" |
| 1221 | 翻译 zh | "仅展示已发布生成结果" |
| 1222 | 翻译 en | `${viewModel.graph?.nodes.length ?? 0} nodes` |
| 1222 | 翻译 zh | `${viewModel.graph?.nodes.length ?? 0} 个节点` |
| 1223 | 翻译 en | `${viewModel.graph?.edges.length ?? 0} connections` |
| 1223 | 翻译 zh | `${viewModel.graph?.edges.length ?? 0} 条真实连接` |
| 1230 | 翻译 en | "How to use" |
| 1230 | 翻译 zh | "操作方式" |
| 1232 | 翻译 en | "Zoom / tap a node" |
| 1232 | 翻译 zh | "缩放 / 点击节点" |
| 1236 | 翻译 en | "Data source" |
| 1236 | 翻译 zh | "数据来源" |
| 1238 | 翻译 en | "Real recommendation graph" |
| 1238 | 翻译 zh | "真实推荐图谱" |
| 1242 | 翻译 en | "This graph is source-backed and read only. Open a node to review its contact context." |
| 1242 | 翻译 zh | "该图谱基于来源数据且为只读。打开节点可查看联系人上下文。" |
| 1247 | 属性 aria-label | t({ en: "Zoom out", zh: "缩小" }) |
| 1247 | 翻译 en | "Zoom out" |
| 1247 | 翻译 zh | "缩小" |
| 1253 | 属性 aria-label | t({ en: "Zoom in", zh: "放大" }) |
| 1253 | 翻译 en | "Zoom in" |
| 1253 | 翻译 zh | "放大" |
| 1284 | JSX文字 | SOCIAL GRAPH |
| 1285 | 翻译 en | "Social graph" |
| 1285 | 翻译 zh | "社交图谱" |
| 1288 | 属性 aria-label | t({ en: "Zoom out", zh: "缩小" }) |
| 1288 | 翻译 en | "Zoom out" |
| 1288 | 翻译 zh | "缩小" |
| 1291 | 属性 aria-label | t({ en: "Zoom in", zh: "放大" }) |
| 1291 | 翻译 en | "Zoom in" |
| 1291 | 翻译 zh | "放大" |
| 1299 | 翻译 en | "Nodes" |
| 1299 | 翻译 zh | "节点" |
| 1303 | 翻译 en | "Connections" |
| 1303 | 翻译 zh | "连接" |
| 1306 | 翻译 en | "Published" |
| 1306 | 翻译 zh | "已发布" |
| 1306 | 翻译 en | "Unavailable" |
| 1306 | 翻译 zh | "不可用" |
| 1307 | 翻译 en | "Results" |
| 1307 | 翻译 zh | "结果" |

## repos/orbits/app/(app)/app/dashboard/page.tsx

源码：[page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/dashboard/page.tsx>)

静态来源入口：`/app/dashboard`

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 32 | 属性 title | routeState.copy.title |

## repos/orbits/app/(app)/app/events/[id]/orbit-appointment-negotiation.tsx

源码：[orbit-appointment-negotiation.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/events/[id]/orbit-appointment-negotiation.tsx>)

静态来源入口：`/app/contacts/[id]`、`/app/events/[id]`、`/app/party`、`/app/party/graph`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 213 | OrbitAppointmentNegotiation | section | loading ? &lt;p aria-live="polite" style={{ color: "var(--text-3)", fontSize: 13, margin: 0 }}&gt;{t({ en: "Loading appointment…", zh: "正在读取约谈…" })}&lt;/p&gt; : null !loading && !appointment && !appointmentId ? &lt;button className="btn btn-primary btn-sm" disabled={busy} onClick={() =&gt; void createDraft()} style={{ justifySelf: "star …（完整表达式见源码） | card-flat |

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 85 | [slots, setSlots] = useState(["", "", ""]) |
| 86 | [duration, setDuration] = useState(45) |
| 87 | [note, setNote] = useState("") |
| 119 | [appointment, setAppointment] = useState&lt;AppointmentView \| null&gt;(null) |
| 120 | [loading, setLoading] = useState(true) |
| 121 | [busy, setBusy] = useState(false) |
| 122 | [error, setError] = useState("") |
| 123 | [showProposal, setShowProposal] = useState(false) |
| 124 | [clockMs, setClockMs] = useState(() =&gt; Date.now()) |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 94 | form-submit-boundary/form · ProposalForm | Counter with 3 times / 反提 3 个时间 / Propose 3 times / 提议 3 个时间 {slots.map((slot, index) =&gt; &lt;input aria-label={t({ en: `Candidate ${index + 1}`, zh: `候选时间 ${index + 1}` })} className="field" key={index} min={localDateTimeValue(new Date(Date.now() + 30 * 60_000))} onInput={(event) =&gt; updateSlot(index, event.currentTarget.value)} type="datetime-local" value={slot} /&gt;)} 30 min 45 min 60 min 90 min {timezone} · Google Meet is requested only after mutual confirmation; unconfigured pr …（完整表达式见源码） | onsubmit: (event) =&gt; { event.preventDefault(); if (parsed.every((value): value is string =&gt; Boolean(value))) void onSubmit({ candidateTimes: parsed.map((startsAtUtc) =&gt; ({ startsAtUtc })), durationMinutes: duration, medium: { kind: "video", provider: "google_meet", joinUrl: null }, note, timezone }); } | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 96 | field/input · ProposalForm | t({ en: `Candidate ${index + 1}`, zh: `候选时间 ${index + 1}` }) | oninput: (event) =&gt; updateSlot(index, event.currentTarget.value) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 98 | field/select · ProposalForm | t({ en: "Duration", zh: "时长" }) | onchange: (event) =&gt; setDuration(Number(event.target.value)) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 99 | field/input · ProposalForm | t({ en: "Meeting note", zh: "约谈备注" }) | onchange: (event) =&gt; setNote(event.target.value) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 102 | button/button · ProposalForm | Send counter / 发送反提议 / Send proposal / 发送提议 |  | {"disabled":"busy \|\| parsed.some((value) =&gt; !value)","renderGateProps":[],"conditions":[]} |
| 216 | button/button · OrbitAppointmentNegotiation | Start scheduling / 开始约时间 | onclick: () =&gt; void createDraft() | {"disabled":"busy","renderGateProps":[],"conditions":[]} |
| 218 | callback-control/ProposalForm · OrbitAppointmentNegotiation |  | onsubmit: (proposal) =&gt; command(pendingProposal ? "counter" : "propose", { proposal }) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 219 | button/button · OrbitAppointmentNegotiation | {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: pendingProposal.timezone }).format(new Date(candidate.startsAtUtc))} | onclick: () =&gt; void command("accept", { candidateId: candidate.candidateId }) | {"disabled":"busy","renderGateProps":[],"conditions":[]} |
| 219 | button/button · OrbitAppointmentNegotiation | Counter / 反提时间 | onclick: () =&gt; setShowProposal(true) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 219 | button/button · OrbitAppointmentNegotiation | Decline / 拒绝 | onclick: () =&gt; void command("decline") | {"disabled":"busy","renderGateProps":[],"conditions":[]} |
| 220 | link/a · OrbitAppointmentNegotiation | Join Google Meet / 加入 Google Meet | appointment.confirmed.medium.joinUrl | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 221 | button/button · OrbitAppointmentNegotiation | Request reschedule / 申请改期 | onclick: () =&gt; setShowProposal(true) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 221 | button/button · OrbitAppointmentNegotiation | Mark completed / 标记已完成 | onclick: () =&gt; void command("complete") | {"disabled":"busy \|\| !completionGate.enabled","renderGateProps":[],"conditions":[]} |
| 221 | button/button · OrbitAppointmentNegotiation | Cancel / 取消约谈 | onclick: () =&gt; void command("cancel") | {"disabled":"busy","renderGateProps":[],"conditions":[]} |
| 222 | link/a · OrbitAppointmentNegotiation | Record post-meeting memo / 记录会后纪要 | `/app/contacts/${encodeURIComponent(contactId)}?capture=meeting-memo&appointmentId=${encodeURIComponent(appointment.appointmentId)}&eventId=${encodeURIComponent(eventId)}` | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 149 | OrbitAppointmentNegotiation | 调用 | GET/由封装决定 | `/api/appointments/${encodeURIComponent(appointmentId)}` |
| 149 | OrbitAppointmentNegotiation | 路径常量 | 见调用/handler | `/api/appointments/${encodeURIComponent(appointmentId)}` |
| 159 | OrbitAppointmentNegotiation | 调用 | GET/由封装决定 | "/api/appointments" |
| 159 | OrbitAppointmentNegotiation | 路径常量 | 见调用/handler | "/api/appointments" |
| 177 | createDraft | 调用 | POST | "/api/appointments" |
| 177 | createDraft | 路径常量 | 见调用/handler | "/api/appointments" |
| 189 | command | 调用 | POST | `/api/appointments/${encodeURIComponent(appointment.appointmentId)}/commands` |
| 189 | command | 路径常量 | 见调用/handler | `/api/appointments/${encodeURIComponent(appointment.appointmentId)}/commands` |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 95 | 翻译 en | "Counter with 3 times" |
| 95 | 翻译 zh | "反提 3 个时间" |
| 95 | 翻译 en | "Propose 3 times" |
| 95 | 翻译 zh | "提议 3 个时间" |
| 96 | 属性 aria-label | t({ en: `Candidate ${index + 1}`, zh: `候选时间 ${index + 1}` }) |
| 96 | 翻译 en | `Candidate ${index + 1}` |
| 96 | 翻译 zh | `候选时间 ${index + 1}` |
| 98 | 属性 aria-label | t({ en: "Duration", zh: "时长" }) |
| 98 | 翻译 en | "Duration" |
| 98 | 翻译 zh | "时长" |
| 98 | JSX文字 | 30 min |
| 98 | JSX文字 | 45 min |
| 98 | JSX文字 | 60 min |
| 98 | JSX文字 | 90 min |
| 99 | 属性 placeholder | t({ en: "Purpose and context", zh: "目的与上下文" }) |
| 99 | 属性 aria-label | t({ en: "Meeting note", zh: "约谈备注" }) |
| 99 | 翻译 en | "Meeting note" |
| 99 | 翻译 zh | "约谈备注" |
| 99 | 翻译 en | "Purpose and context" |
| 99 | 翻译 zh | "目的与上下文" |
| 101 | 翻译 en | "Google Meet is requested only after mutual confirmation; unconfigured providers remain not synced." |
| 101 | 翻译 zh | "双方确认后才请求 Google Meet；未配置的服务会保持“未同步”。" |
| 102 | 翻译 en | "Send counter" |
| 102 | 翻译 zh | "发送反提议" |
| 102 | 翻译 en | "Send proposal" |
| 102 | 翻译 zh | "发送提议" |
| 127 | 翻译 en | "Appointments are temporarily unavailable." |
| 128 | 翻译 zh | "约谈功能暂时不可用。" |
| 131 | 翻译 en | "This appointment does not belong to this contact and event." |
| 132 | 翻译 zh | "该约谈不属于当前联系人和活动。" |
| 181 | 翻译 en | "Only an accepted business-card exchange can start an appointment." |
| 181 | 翻译 zh | "只有已接受的名片交换才能发起约谈。" |
| 196 | 翻译 en | "The appointment changed. Reload and retry the action." |
| 196 | 翻译 zh | "约谈状态已变化，请刷新后重试。" |
| 198 | 翻译 en | "You can mark the appointment completed only after its scheduled end time." |
| 198 | 翻译 zh | "约谈结束后才能标记已完成。" |
| 200 | 翻译 en | "This action is not available in the appointment's current state." |
| 200 | 翻译 zh | "当前约谈状态不允许执行此操作。" |
| 202 | 翻译 en | "Review the candidate times and meeting details, then retry." |
| 202 | 翻译 zh | "请检查候选时间和约谈信息后重试。" |
| 204 | 翻译 en | "The accepted contact relationship is no longer available. Reload the participant detail." |
| 204 | 翻译 zh | "已接受的联系人关系当前不可用，请刷新参会者详情。" |
| 206 | 翻译 en | "Scheduling is temporarily unavailable. Your draft is unchanged; retry later." |
| 206 | 翻译 zh | "约谈服务暂时不可用；草稿未变化，请稍后重试。" |
| 207 | 翻译 en | "The request did not reach a confirmed result. Your draft is unchanged; retry safely." |
| 207 | 翻译 zh | "请求未得到确认结果；草稿未变化，可以安全重试。" |
| 214 | 翻译 en | "Appointment" |
| 214 | 翻译 zh | "约谈" |
| 214 | 翻译 en | "Versioned negotiation with mutual confirmation" |
| 214 | 翻译 zh | "带版本记录的双方确认流程" |
| 215 | 翻译 en | "Loading appointment…" |
| 215 | 翻译 zh | "正在读取约谈…" |
| 216 | 翻译 en | "Start scheduling" |
| 216 | 翻译 zh | "开始约时间" |
| 217 | JSX文字 | v |
| 217 | 翻译 en | "Calendar synced" |
| 217 | 翻译 zh | "日历已同步" |
| 217 | 翻译 en | "Calendar sync failed" |
| 217 | 翻译 zh | "日历同步失败" |
| 217 | 翻译 en | "Calendar not synced" |
| 217 | 翻译 zh | "日历未同步" |
| 217 | 翻译 en | "Meet ready" |
| 217 | 翻译 zh | "会议已创建" |
| 217 | 翻译 en | "Meet creation failed" |
| 217 | 翻译 zh | "会议创建失败" |
| 217 | 翻译 en | "Meet not synced" |
| 217 | 翻译 zh | "会议未同步" |
| 219 | 翻译 en | "No additional note" |
| 219 | 翻译 zh | "无额外备注" |
| 219 | 翻译 en | "Counter" |
| 219 | 翻译 zh | "反提时间" |
| 219 | 翻译 en | "Decline" |
| 219 | 翻译 zh | "拒绝" |
| 219 | 翻译 en | "Waiting for the other person to respond." |
| 219 | 翻译 zh | "等待对方回应。" |
| 220 | JSX文字 | min · |
| 220 | 翻译 en | "Join Google Meet" |
| 220 | 翻译 zh | "加入 Google Meet" |
| 220 | 翻译 en | "In-app reminders: T−24h, T−1h; memo prompt: T+15m" |
| 220 | 翻译 zh | "站内提醒：提前 24 小时、提前 1 小时；会后 15 分钟提醒记录" |
| 221 | 翻译 en | "Request reschedule" |
| 221 | 翻译 zh | "申请改期" |
| 221 | 翻译 en | "Mark completed" |
| 221 | 翻译 zh | "标记已完成" |
| 221 | 翻译 en | "Cancel" |
| 221 | 翻译 zh | "取消约谈" |
| 221 | 翻译 en | "Available after" |
| 221 | 翻译 zh | "可标记时间" |
| 222 | 翻译 en | "Record post-meeting memo" |
| 222 | 翻译 zh | "记录会后纪要" |

## repos/orbits/app/(app)/app/events/[id]/orbit-encounter-capture.tsx

源码：[orbit-encounter-capture.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/events/[id]/orbit-encounter-capture.tsx>)

静态来源入口：`/app/events/[id]`、`/app/party`、`/app/party/graph`

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 12 | [talked, setTalked] = useState&lt;"yes" \| "no" \| "uncertain"&gt;("yes") |
| 13 | [noteText, setNoteText] = useState("") |
| 14 | [commitments, setCommitments] = useState("") |
| 15 | [nextStep, setNextStep] = useState("") |
| 16 | [tags, setTags] = useState("") |
| 20 | [state, setState] = useState&lt;"idle" \| "saving" \| "saved" \| "failed"&gt;("idle") |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 29 | form-submit-boundary/form · OrbitEncounterCapture | Record an encounter / 记录一次真实交流 Only your explicit input is recorded. Check-in and table placement never imply that you talked. / 只记录你明确填写的内容；签到或同桌不会被推断为已经交流。 Yes, we talked / 是，聊过 No / 没有 Not sure / 不确定 Privacy: private to you. Relationship sharing is not configured. / 隐私：仅自己可见；关系共享尚未配置。 Save encounter / 保存交流记录 {&lt;span style={{ color: "var(--success)", fontSize: 12 }}&gt;{t({ en: "Saved. Timeline projection is pending.", zh: "已保存，正在投影到联系人时间线。" })}&lt;/span&gt;} / {null} {&lt;span style={{ …（完整表达式见源码） | onsubmit: async (event) =&gt; { event.preventDefault(); setState("saving"); try { observedAt.current ??= new Date().toISOString(); const response = await fetch("/api/encounters", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": idempotencyKey.current }, body: JSON.stringify({ commitments: commitments.split("\n").filter(Boolean), contactId, eventId, nextStep, noteText, observedAt: observedAt.current, privacy: "private", talked, tags: tags.split(/[,，]/).filter(Boolean) }) }); if (!response.ok) throw new Error("capture-failed"); lastSavedSnapshot.current = snapshot; idempotencyKey.cur …（完整表达式见源码） | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 43 | field/select · OrbitEncounterCapture | t({ en: "Did you talk?", zh: "是否聊过" }) | onchange: (event) =&gt; { setTalked(event.target.value as typeof talked); beginEdit(); } | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 44 | field/textarea · OrbitEncounterCapture | t({ en: "Encounter note", zh: "交流记录" }) | onchange: (event) =&gt; { setNoteText(event.target.value); beginEdit(); } | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 45 | field/textarea · OrbitEncounterCapture | t({ en: "Commitments", zh: "双方承诺" }) | onchange: (event) =&gt; { setCommitments(event.target.value); beginEdit(); } | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 46 | field/input · OrbitEncounterCapture | t({ en: "Next step", zh: "下一步" }) | onchange: (event) =&gt; { setNextStep(event.target.value); beginEdit(); } | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 47 | field/input · OrbitEncounterCapture | t({ en: "Tags", zh: "标签" }) | onchange: (event) =&gt; { setTags(event.target.value); beginEdit(); } | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 49 | button/button · OrbitEncounterCapture | Save encounter / 保存交流记录 |  | {"disabled":"state === \"saving\" \|\| lastSavedSnapshot.current === snapshot \|\| (!noteText.trim() && !nextStep.trim() && !commitments.trim())","renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 33 | OrbitEncounterCapture | 调用 | POST | "/api/encounters" |
| 33 | OrbitEncounterCapture | 路径常量 | 见调用/handler | "/api/encounters" |

### 文字明细

