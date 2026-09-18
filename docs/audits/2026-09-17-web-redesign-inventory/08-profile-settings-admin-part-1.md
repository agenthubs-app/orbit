# 08-profile-settings-admin：源码明细

证据级别：当前工作区源码。此表列出符号级静态可达实现，不宣称每项都在某个角色/状态实际显示。按钮按 JSX 实现记录；数组 map 可生成多项按钮，条件分支互斥，不能把实现数当 DOM 按钮数。

调用表按所属函数提供 HTTP 路径/方法证据；与按钮 handler 是否连通应结合 handler 源码核对。仅同一文件出现的 API 不等于该按钮调用它。路径常量不是一次额外请求。跨文件、动态路径和 callback 不强行配对。

文案包含原有中文/英文/日文及动态表达式。表格中的长表达式节选有标记；完整内容在对应源码。布局表只证明 HTML/ARIA 分区，不证明实际视觉位置。全局 shell 与 layout 另见 01、02。开发页共享组件的来源入口会标为 /dev，不算客户页面。

## repos/orbits/app/(app)/app/admin/compose-app-admin-platform-from-previously-approved-mock-first-capabilities/admin-platform-route-view-model.ts

源码：[admin-platform-route-view-model.ts](</Users/li/work/orbit/repos/orbits/app/(app)/app/admin/compose-app-admin-platform-from-previously-approved-mock-first-capabilities/admin-platform-route-view-model.ts>)

静态来源入口：`/app/admin`、`/app/admin/events`、`/app/platform`

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 136 | 文案/数据常量 description | "No platform-wide moderation provider or verified platform-admin role is configured." |
| 138 | 文案/数据常量 emptyState | "Personal profile and event records are not platform-wide organizer, user, verification, or review data." |
| 140 | 文案/数据常量 eyebrow | "Platform" |
| 141 | 文案/数据常量 guardrail | "This route fails closed before reading personal workspace data or claiming platform statistics, moderation state, organizer verification, or platform access." |
| 143 | 文案/数据常量 nextStep | "Connect a platform-wide read provider and enforce a persisted platform-admin role before enabling this route." |
| 145 | 文案/数据常量 purpose | "Prevent an authenticated personal account from being presented as a platform administrator." |
| 147 | 文案/数据常量 title | "Platform admin is unavailable" |
| 157 | 文案/数据常量 description | `${surfaceName} has no reviewed event or profile context yet.` |
| 158 | 文案/数据常量 emptyState | "Admin and platform tools stay hidden until sourced events and a workspace profile are available." |
| 160 | 文案/数据常量 eyebrow | "Admin" |
| 161 | 文案/数据常量 guardrail | "This route only reads event and profile sources. It does not approve events, notify organizers, run AI matching, write calendars, or contact external providers." |
| 163 | 文案/数据常量 nextStep | "Create or import a sourced event, then return after the workspace profile is ready." |
| 165 | 文案/数据常量 purpose | "Keep operator tools tied to reviewed live-capable event and profile sources." |
| 167 | 文案/数据常量 title | `${surfaceName} is not ready` |
| 173 | 文案/数据常量 description | `${surfaceName} is waiting for reviewed event or profile context.` |
| 174 | 文案/数据常量 emptyState | "Operator views remain paused until source review finishes." |
| 176 | 文案/数据常量 eyebrow | "Admin" |
| 177 | 文案/数据常量 guardrail | "Pending operator context cannot approve events, send notifications, run AI matching, write calendars, or contact external providers." |
| 179 | 文案/数据常量 nextStep | "Return after event and profile source review completes." |
| 181 | 文案/数据常量 purpose | "Keep operator tools stable while live-capable sources are still loading." |
| 183 | 文案/数据常量 title | `${surfaceName} is loading` |
| 188 | 文案/数据常量 description | `${surfaceName} could not load event or profile context.` |
| 189 | 文案/数据常量 emptyState | "No admin action was applied, no organizer was notified, and no external provider was contacted." |
| 191 | 文案/数据常量 eyebrow | "Admin" |
| 192 | 文案/数据常量 guardrail | "The failed route state stops before event approval, organizer notification, AI matching, calendar writes, email, or outside network work." |
| 194 | 文案/数据常量 nextStep | "Confirm the Events live store, profile sources, and generated fixture records are configured, then retry the operator view." |
| 196 | 文案/数据常量 purpose | `Show a recoverable ${lowerSurfaceName} boundary without falling back to legacy hybrid route data.` |
| 197 | 文案/数据常量 title | `${surfaceName} could not load` |
| 225 | 文案/数据常量 label | "Return to personal workspace" |
| 226 | 文案/数据常量 recoveryCopy | "Continue in the authenticated personal workspace without platform-wide claims." |
| 232 | 文案/数据常量 label | "Open organizer admin" |
| 233 | 文案/数据常量 recoveryCopy | "Use the actor-scoped organizer view for sourced personal events." |
| 241 | 文案/数据常量 label | "Return to events" |
| 242 | 文案/数据常量 recoveryCopy | "Open sourced events before retrying the operator workspace." |
| 248 | 文案/数据常量 label | "Review profile" |
| 249 | 文案/数据常量 recoveryCopy | "Confirm the workspace profile before retrying admin tools." |
| 345 | 文案/数据常量 label | "活动记录" |
| 352 | 文案/数据常量 label | "即将开始" |
| 359 | 文案/数据常量 label | "进行中" |
| 366 | 文案/数据常量 label | "已结束" |

## repos/orbits/app/(app)/app/admin/orbit-real-admin-events.tsx

源码：[orbit-real-admin-events.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/admin/orbit-real-admin-events.tsx>)

静态来源入口：`/app/admin/events`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 22 | OrbitRealAdminEvents | h1 | t({ en: "Events", zh: "活动管理" }) | h-display |
| 26 | OrbitRealAdminEvents | h2 | t({ en: "Authenticated account", zh: "已登录账户" }) | h-section |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 12 | 翻译 en | "No source summary" |
| 12 | 翻译 zh | "暂无来源摘要" |
| 22 | JSX文字 | EVENTS |
| 22 | 翻译 en | "Events" |
| 22 | 翻译 zh | "活动管理" |
| 22 | 翻译 en | "Source events · read only" |
| 22 | 翻译 zh | "来源活动 · 只读" |
| 23 | 翻译 en | "All" |
| 23 | 翻译 zh | "全部" |
| 23 | 翻译 en | "Live" |
| 23 | 翻译 zh | "进行中" |
| 23 | 翻译 en | "Upcoming" |
| 23 | 翻译 zh | "即将" |
| 23 | 翻译 en | "Ended" |
| 23 | 翻译 zh | "已结束" |
| 26 | 翻译 en | "Authenticated account" |
| 26 | 翻译 zh | "已登录账户" |
| 26 | 翻译 en | "Profile source · read only" |
| 26 | 翻译 zh | "资料来源 · 只读" |
| 27 | 翻译 en | "Email unavailable" |
| 27 | 翻译 zh | "邮箱不可用" |

## repos/orbits/app/(app)/app/admin/orbit-real-admin-login.tsx

源码：[orbit-real-admin-login.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/admin/orbit-real-admin-login.tsx>)

静态来源入口：`/app/admin/access`、`/app/login-admin`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 12 | OrbitRealAdminLogin | main |  | orbit-admin-access-page |
| 13 | OrbitRealAdminLogin | section |  | orbit-admin-access-art |
| 17 | OrbitRealAdminLogin | h1 | t({ en: "Organizer admin", zh: "主办方后台" }) | h-display orbit-admin-access-art-title |
| 22 | OrbitRealAdminLogin | section |  | orbit-admin-access-panel |
| 26 | OrbitRealAdminLogin | h1 | t({ en: "Sign in to admin", zh: "登录后台" }) | h-display orbit-admin-access-title |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 29 | link/a · OrbitRealAdminLogin | Continue to secure sign in / 继续安全登录 | signInHref | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 17 | 翻译 en | "Organizer admin" |
| 17 | 翻译 zh | "主办方后台" |
| 18 | 翻译 en | "Review actor-scoped event source records and the authenticated account profile. Registration, attendance, capacity, matching, and team data stay unavailable until dedicated providers are connected." |
| 18 | 翻译 zh | "查看按账户隔离的活动来源记录和已登录账户资料。在接入专用数据服务前，不展示报名、签到、容量、匹配或团队数据。" |
| 24 | JSX文字 | ADMIN SESSION |
| 25 | JSX文字 | ORGANIZER ADMIN / SECURE SIGN IN |
| 26 | 翻译 en | "Sign in to admin" |
| 26 | 翻译 zh | "登录后台" |
| 27 | 翻译 en | "Continue through the secure account sign-in flow. Admin access is granted only after the authenticated session is verified." |
| 27 | 翻译 zh | "请通过安全账号登录流程继续。只有在验证登录会话后，才能进入后台。" |
| 29 | 翻译 en | "Continue to secure sign in" |
| 29 | 翻译 zh | "继续安全登录" |
| 31 | JSX文字 | Admin |

## repos/orbits/app/(app)/app/admin/orbit-real-admin-shell.tsx

源码：[orbit-real-admin-shell.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/admin/orbit-real-admin-shell.tsx>)

静态来源入口：`/app/admin`、`/app/admin/events`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 35 | HostShell | aside |  | orbit-host-sidebar |
| 39 | HostShell | nav | hostNav.map(([key, icon, label, href]) =&gt; &lt;button className={`orbit-host-nav-item${active === key ? " is-active" : ""}`} key={key} onClick={() =&gt; navigateTo(href)} type="button"&gt;&lt;Icon name={icon} size={18} /&gt;{label}&lt;/button&gt;) | orbit-host-nav |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 39 | button/button · HostShell | {label} | onclick: () =&gt; navigateTo(href) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 41 | button/button · HostShell | Exit admin / 退出后台 | onclick: () =&gt; navigateTo("/app") | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 47 | button/button · HostShell | {label} | onclick: () =&gt; navigateTo(href) | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 16 | 翻译 en | "Dashboard" |
| 16 | 翻译 zh | "仪表盘" |
| 17 | 翻译 en | "Events" |
| 17 | 翻译 zh | "活动管理" |
| 38 | 翻译 en | "Workspace" |
| 38 | 翻译 zh | "工作区" |
| 41 | 翻译 en | "Exit admin" |
| 41 | 翻译 zh | "退出后台" |

## repos/orbits/app/(app)/app/admin/orbit-real-admin-workspace.tsx

源码：[orbit-real-admin-workspace.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/admin/orbit-real-admin-workspace.tsx>)

静态来源入口：`/app/admin`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 53 | AdminDashContent | h1 | t({ en: "Dashboard", zh: "仪表盘" }) | h-display |
| 56 | AdminDashContent | h2 | t({ en: "Event source records", zh: "活动来源记录" }) | h-section |
| 58 | AdminDashContent | h2 | t({ en: "Authenticated account profile", zh: "已登录账户资料" }) | h-section |
| 59 | AdminDashContent | h2 | t({ en: "Data boundary", zh: "数据边界" }) | h-section |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 53 | JSX文字 | DASHBOARD |
| 53 | 翻译 en | "Dashboard" |
| 53 | 翻译 zh | "仪表盘" |
| 53 | 翻译 en | "Source records · read only" |
| 53 | 翻译 zh | "来源记录 · 只读" |
| 56 | 翻译 en | "Event source records" |
| 56 | 翻译 zh | "活动来源记录" |
| 56 | 翻译 en | "records" |
| 56 | 翻译 zh | "条" |
| 58 | 翻译 en | "Authenticated account profile" |
| 58 | 翻译 zh | "已登录账户资料" |
| 58 | 翻译 en | "Profile source" |
| 58 | 翻译 zh | "资料来源" |
| 59 | 翻译 en | "Data boundary" |
| 59 | 翻译 zh | "数据边界" |
| 59 | 翻译 en | "Registration, attendance, capacity, matching, team membership, and live activity metrics are hidden until dedicated actor-scoped providers are connected." |
| 59 | 翻译 zh | "在接入专用且按账户隔离的数据服务前，不展示报名、签到、容量、匹配、团队成员或实时动态指标。" |
| 68 | 翻译 en | "Email unavailable" |
| 68 | 翻译 zh | "邮箱不可用" |

## repos/orbits/app/(app)/app/admin/page.tsx

源码：[page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/admin/page.tsx>)

静态来源入口：`/app/admin`

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 43 | 属性 title | routeState.copy.title |

## repos/orbits/app/(app)/app/platform/page.tsx

源码：[page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/platform/page.tsx>)

静态来源入口：`/app/platform`

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 23 | 属性 title | routeState.copy.title |

## repos/orbits/app/(app)/app/profile/compose-app-profile-from-previously-approved-mock-first-capabilities/profile-route-view-model.ts

源码：[profile-route-view-model.ts](</Users/li/work/orbit/repos/orbits/app/(app)/app/profile/compose-app-profile-from-previously-approved-mock-first-capabilities/profile-route-view-model.ts>)

静态来源入口：`/app/admin`、`/app/admin/events`、`/app/agent`、`/app/home/events`、`/app/platform`、`/app/profile`

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 509 | 文案/数据常量 message | "A profile page service returned an unexpected failure." |
| 523 | 文案/数据常量 message | "No authenticated actor was available for profile access." |

## repos/orbits/app/(app)/app/profile/orbit-real-profile.tsx

源码：[orbit-real-profile.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/profile/orbit-real-profile.tsx>)

静态来源入口：`/app/profile`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 263 | Section | section | children |  |
| 264 | Section | header | desc ? &lt;p style={{ color: "var(--text-3)", fontSize: 13, lineHeight: 1.5, margin: "5px 0 0", paddingLeft: 12 }}&gt;{desc}&lt;/p&gt; : null |  |
| 265 | Section | h2 | title |  |
| 835 | OrbitRealProfile | main |  |  |
| 844 | OrbitRealProfile | h1 | t({ en: "Universal profile", zh: "通用档案" }) |  |
| 849 | OrbitRealProfile | aside |  | orbit-profile-preview |

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 433 | [draft, setDraft] = useState("") |
| 605 | [profile, setProfile] = useState&lt;EditableProfile&gt;(() =&gt; ({ ...viewModel.profile, offering: [...viewModel.profile.offering], seeking: [...viewModel.profile.seeking], topics: [...viewModel.profile.topics] })) |
| 606 | [industryEdited, setIndustryEdited] = useState(false) |
| 607 | [industryReady, setIndustryReady] = useState(false) |
| 608 | [method, setMethod] = useState&lt;Method&gt;("manual") |
| 609 | [extractText, setExtractText] = useState("") |
| 610 | [extracting, setExtracting] = useState(false) |
| 611 | [saving, setSaving] = useState(false) |
| 612 | [message, setMessage] = useState("") |
| 613 | [messageKind, setMessageKind] = useState&lt;NoticeKind&gt;("info") |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 309 | button/button · ProfileMethods | {label} | onclick: () =&gt; setMethod(key) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 336 | link/a · ProfileMethods | Scan/import in Import hub / 到导入中心扫描/导入 | /app/contacts/new | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 348 | field/textarea · ProfileMethods | t({ en: "Paste your business, experience, focus areas, or who you want to meet", zh: "粘贴业务、经历、关注方向或希望认识的人" }) | onchange: (event) =&gt; setExtractText(event.target.value) | {"disabled":null,"renderGateProps":[],"conditions":[{"propName":"method","value":"text","matches":true}]} |
| 349 | button/button · ProfileMethods | Extracting… / 提取中… / Extract to form / 提取到表单 | onclick: onTextExtract | {"disabled":"extracting","renderGateProps":[],"conditions":[{"propName":"method","value":"text","matches":true}]} |
| 375 | field/input · FieldInput | {label} | onchange: onValue ? (event) =&gt; onValue(event.target.value) : undefined | {"disabled":"readOnly","renderGateProps":[],"conditions":[]} |
| 413 | field/textarea · FieldTextarea | {label} | onchange: (event) =&gt; onValue(event.target.value) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 462 | button/button · ChipGroup | {&lt;Icon name="check" size={13} /&gt;} / {null} {option} | onclick: () =&gt; onToggle(section, option) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 470 | field/input · ChipGroup | t({ en: `Add ${label.toLowerCase()} item`, zh: `添加${label}项目`, }) | onchange: (event) =&gt; setDraft(event.target.value); onkeydown: onDraftKeyDown | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 486 | button/button · ChipGroup | Add / 添加 | onclick: addDraft | {"disabled":"!draft.trim() \|\| values.includes(draft.trim())","renderGateProps":[],"conditions":[]} |
| 541 | field/select · EditSections | t({ en: "Primary industry", zh: "一级行业" }) | onchange: event =&gt; updateIndustry({ primaryIndustryId: (event.target.value \|\| null) as IndustryIdCode \| null, secondaryIndustryId: null }) | {"disabled":"industryDisabled","renderGateProps":[],"conditions":[]} |
| 547 | field/select · EditSections | t({ en: "Secondary industry", zh: "二级行业" }) | onchange: event =&gt; updateIndustry({ primaryIndustryId: profile.primaryIndustryId, secondaryIndustryId: (event.target.value \|\| null) as SecondaryIndustryIdCode \| null }) | {"disabled":"industryDisabled \|\| !profile.primaryIndustryId","renderGateProps":[],"conditions":[]} |
| 570 | callback-control/ChipGroup · EditSections |  | ontoggle: toggleTag | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 571 | callback-control/ChipGroup · EditSections |  | ontoggle: toggleTag | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 572 | callback-control/ChipGroup · EditSections |  | ontoggle: toggleTag | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 839 | form-submit-boundary/form · OrbitRealProfile | Back / 返回 Universal profile / 通用档案 {subText} {alert} This is how you appear to matches — updates as you type. / 这是别人看到的你，边填边更新。 Cancel / 取消 Saving… / 保存中… / Save profile / 保存档案 | onsubmit: onSubmit | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 842 | button/button · OrbitRealProfile | t({ en: "Back", zh: "返回" }) | onclick: () =&gt; orbitNavigate("/home") | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 859 | button/button · OrbitRealProfile | Cancel / 取消 | onclick: () =&gt; orbitNavigate("/home") | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 860 | button/button · OrbitRealProfile | Saving… / 保存中… / Save profile / 保存档案 |  | {"disabled":"saving \|\| !industryReady","renderGateProps":[],"conditions":[]} |
| 866 | form-submit-boundary/form · OrbitRealProfile | {subText} {alert} | onsubmit: onSubmit | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 867 | button/button · OrbitRealProfile | Saving… / 保存中… / Save / 保存 |  | {"disabled":"saving \|\| !industryReady","renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 620 | OrbitRealProfile | 调用 | GET/由封装决定 | "/api/profile" |
| 620 | OrbitRealProfile | 路径常量 | 见调用/handler | "/api/profile" |
| 683 | extractProfile | 调用 | POST | "/api/profile/extractions/resume" |
| 683 | extractProfile | 路径常量 | 见调用/handler | "/api/profile/extractions/resume" |
| 774 | onSubmit | 调用 | PUT | "/api/profile" |
| 774 | onSubmit | 路径常量 | 见调用/handler | "/api/profile" |
| 788 | onSubmit | 调用 | GET/由封装决定 | "/api/profile" |
| 788 | onSubmit | 路径常量 | 见调用/handler | "/api/profile" |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 180 | 翻译 en | "Secondary industry not set" |
| 180 | 翻译 zh | "二级未填写" |
| 187 | 翻译 en | "WeChat" |
| 187 | 翻译 zh | "微信" |
| 188 | 文案/数据常量 label | "LINE" |
| 189 | 文案/数据常量 label | "Email" |
| 203 | 翻译 en | "Your name" |
| 203 | 翻译 zh | "你的名字" |
| 216 | 属性 label | t({ en: "OFFERING", zh: "能提供" }) |
| 216 | 翻译 en | "OFFERING" |
| 216 | 翻译 zh | "能提供" |
| 217 | 属性 label | t({ en: "SEEKING", zh: "想认识" }) |
| 217 | 翻译 en | "SEEKING" |
| 217 | 翻译 zh | "想认识" |
| 238 | 翻译 en | "Completeness" |
| 238 | 翻译 zh | "档案完成度" |
| 241 | 翻译 en | "Ready to be matched" |
| 241 | 翻译 zh | "可被匹配 ✓" |
| 241 | 翻译 en | "Missing: " |
| 241 | 翻译 zh | "还差：" |
| 294 | 翻译 en | "Manual entry" |
| 294 | 翻译 zh | "手动填写" |
| 295 | 翻译 en | "Structured text extract" |
| 295 | 翻译 zh | "结构化文本提取" |
| 298 | 翻译 en | "Paste text with explicit labels such as Name, Company, Title, Market, and Goal. Only stated fields are extracted; review before saving." |
| 298 | 翻译 zh | "粘贴带有“姓名、公司、职位、市场、关系目标”等明确标签的文本。只提取原文明确写出的字段，保存前请复核。" |
| 299 | 翻译 en | "Fill in the sections below field by field." |
| 299 | 翻译 zh | "直接在下方各区块逐项填写。" |
| 304 | 属性 aria-label | t({ en: "Fill method", zh: "填写方式" }) |
| 304 | 翻译 en | "Fill method" |
| 304 | 翻译 zh | "填写方式" |
| 342 | 翻译 en | "Scan/import in Import hub" |
| 342 | 翻译 zh | "到导入中心扫描/导入" |
| 348 | 属性 placeholder | t({ en: "Paste your business, experience, focus areas, or who you want to meet", zh: "粘贴业务、经历、关注方向或希望认识的人" }) |
| 348 | 翻译 en | "Paste your business, experience, focus areas, or who you want to meet" |
| 348 | 翻译 zh | "粘贴业务、经历、关注方向或希望认识的人" |
| 351 | 翻译 en | "Extracting…" |
| 351 | 翻译 zh | "提取中…" |
| 351 | 翻译 en | "Extract to form" |
| 351 | 翻译 zh | "提取到表单" |
| 452 | 属性 aria-label | label |
| 455 | 翻译 en | `${values.length} selected` |
| 455 | 翻译 zh | `已选 ${values.length}` |
| 470 | 属性 placeholder | t({ en: "Enter a specific item", zh: "输入具体内容", }) |
| 470 | 属性 aria-label | t({ en: `Add ${label.toLowerCase()} item`, zh: `添加${label}项目`, }) |
| 472 | 翻译 en | `Add ${label.toLowerCase()} item` |
| 473 | 翻译 zh | `添加${label}项目` |
| 480 | 翻译 en | "Enter a specific item" |
| 481 | 翻译 zh | "输入具体内容" |
| 492 | 翻译 en | "Add" |
| 492 | 翻译 zh | "添加" |
| 531 | 属性 title | t({ en: "Quick fill", zh: "快速填充" }) |
| 531 | 翻译 en | "Auto-fill the form from a pasted bio or a business card photo." |
| 531 | 翻译 zh | "粘贴简介或拍张名片，几秒填好档案。" |
| 531 | 翻译 en | "Quick fill" |
| 531 | 翻译 zh | "快速填充" |
| 534 | 属性 title | t({ en: "Basics", zh: "基本信息" }) |
| 534 | 翻译 en | "Basics" |
| 534 | 翻译 zh | "基本信息" |
| 536 | 属性 label | t({ en: "Name", zh: "姓名" }) |
| 536 | 翻译 en | "Name" |
| 536 | 翻译 zh | "姓名" |
| 537 | 属性 label | t({ en: "Company", zh: "公司" }) |
| 537 | 翻译 en | "Company" |
| 537 | 翻译 zh | "公司" |
| 538 | 属性 label | t({ en: "Title", zh: "职位" }) |
| 538 | 翻译 en | "Title" |
| 538 | 翻译 zh | "职位" |
| 539 | 属性 label | t({ en: "Industry", zh: "行业" }) |
| 539 | 翻译 en | "Industry" |
| 539 | 翻译 zh | "行业" |
| 540 | 翻译 en | "Primary industry" |
| 540 | 翻译 zh | "一级行业" |
| 541 | 属性 aria-label | t({ en: "Primary industry", zh: "一级行业" }) |
| 541 | 翻译 en | "Primary industry" |
| 541 | 翻译 zh | "一级行业" |
| 542 | 翻译 en | "Not selected" |
| 542 | 翻译 zh | "未选择" |
| 546 | 翻译 en | "Secondary industry" |
| 546 | 翻译 zh | "二级行业" |
| 547 | 属性 aria-label | t({ en: "Secondary industry", zh: "二级行业" }) |
| 547 | 翻译 en | "Secondary industry" |
| 547 | 翻译 zh | "二级行业" |
| 548 | 翻译 en | "Not selected" |
| 548 | 翻译 zh | "未选择" |
| 554 | 属性 title | t({ en: "Contact", zh: "联系方式" }) |
| 554 | 翻译 en | "Fill in WeChat or LINE (at least one) so matches can reach you." |
| 554 | 翻译 zh | "微信或 LINE 至少填一个，匹配后对方才能联系到你。" |
| 554 | 翻译 en | "Contact" |
| 554 | 翻译 zh | "联系方式" |
| 556 | 属性 label | t({ en: "WeChat ID", zh: "微信号" }) |
| 556 | 翻译 en | "WeChat ID" |
| 556 | 翻译 zh | "微信号" |
| 557 | 属性 label | t({ en: "LINE ID", zh: "LINE ID" }) |
| 557 | 翻译 en | "LINE ID" |
| 558 | 属性 label | t({ en: "Email", zh: "邮箱" }) |
| 558 | 翻译 en | "Email" |
| 558 | 翻译 zh | "邮箱" |
| 561 | 属性 title | t({ en: "About you", zh: "自我介绍" }) |
| 561 | 翻译 en | "Shown to people you match with." |
| 561 | 翻译 zh | "这些内容会展示给和你匹配到的人。" |
| 561 | 翻译 en | "About you" |
| 561 | 翻译 zh | "自我介绍" |
| 563 | 属性 label | t({ en: "One-line intro", zh: "一句话介绍" }) |
| 563 | 翻译 en | "One-line intro" |
| 563 | 翻译 zh | "一句话介绍" |
| 564 | 属性 label | t({ en: "Bio", zh: "简介" }) |
| 564 | 翻译 en | "Bio" |
| 564 | 翻译 zh | "简介" |
| 565 | 属性 label | t({ en: "Opener", zh: "开场白" }) |
| 565 | 翻译 en | "Opener" |
| 565 | 翻译 zh | "开场白" |
| 568 | 属性 title | t({ en: "Matching preferences", zh: "匹配偏好" }) |
| 568 | 翻译 en | "Tags drive who we match you with — pick what fits." |
| 568 | 翻译 zh | "标签决定我们帮你匹配谁，选贴合的就好。" |
| 568 | 翻译 en | "Matching preferences" |
| 568 | 翻译 zh | "匹配偏好" |
| 570 | 属性 label | t({ en: "I can offer", zh: "我能提供" }) |
| 570 | 翻译 en | "I can offer" |
| 570 | 翻译 zh | "我能提供" |
| 571 | 属性 label | t({ en: "I'm seeking", zh: "我想寻求" }) |
| 571 | 翻译 en | "I'm seeking" |
| 571 | 翻译 zh | "我想寻求" |
| 572 | 属性 label | t({ en: "Topics to chat about", zh: "想聊的话题" }) |
| 572 | 翻译 en | "Topics to chat about" |
| 572 | 翻译 zh | "想聊的话题" |
| 632 | 翻译 en | "Could not load your industry. Reload the page before saving." |
| 632 | 翻译 zh | "行业信息读取失败，请刷新页面后再保存。" |
| 638 | 翻译 en | "Fill it once, auto-reused when registering for every event." |
| 638 | 翻译 zh | "填一次，报名各场活动自动复用。" |
| 643 | 翻译 en | "Name" |
| 643 | 翻译 zh | "姓名" |
| 644 | 翻译 en | "WeChat or LINE" |
| 644 | 翻译 zh | "微信或 LINE" |
| 645 | 翻译 en | "Company" |
| 645 | 翻译 zh | "公司" |
| 646 | 翻译 en | "Title" |
| 646 | 翻译 zh | "职位" |
| 647 | 翻译 en | "Industry" |
| 647 | 翻译 zh | "行业" |
| 648 | 翻译 en | "Bio" |
| 648 | 翻译 zh | "简介" |
| 649 | 翻译 en | "Opener" |
| 649 | 翻译 zh | "开场白" |
| 650 | 翻译 en | "Offering" |
| 650 | 翻译 zh | "能提供" |
| 651 | 翻译 en | "Seeking" |
| 651 | 翻译 zh | "想寻求" |
| 652 | 翻译 en | "Topics" |
| 652 | 翻译 zh | "话题" |
| 694 | 翻译 en | "Profile extraction failed." |
| 694 | 翻译 zh | "档案提取失败。" |
| 702 | 翻译 en | "No profile fields were extracted. Your profile was not changed." |
| 703 | 翻译 zh | "未提取到档案字段，你的档案没有发生变化。" |
| 713 | 翻译 en | "Extracted draft fields were filled into the form. Review them before saving." |
| 714 | 翻译 zh | "提取出的草稿字段已填入表单，请复核后再保存。" |
| 722 | 翻译 en | "Profile extraction failed." |
| 722 | 翻译 zh | "档案提取失败。" |
| 735 | 翻译 en | "Paste profile text before extracting." |
| 736 | 翻译 zh | "请先粘贴档案文本再提取。" |
| 756 | 翻译 en | "Choose a secondary industry for the selected primary industry." |
| 756 | 翻译 zh | "请为所选一级行业选择二级行业。" |
| 763 | 翻译 en | "Add your name before saving the profile." |
| 764 | 翻译 zh | "请填写姓名后再保存档案。" |
| 784 | 翻译 en | "Profile save failed." |
| 784 | 翻译 zh | "档案保存失败。" |
| 803 | 翻译 en | "The save response could not be verified by reading the profile back." |
| 804 | 翻译 zh | "保存响应无法通过重新读取档案完成核验。" |
| 812 | 翻译 en | "Profile saved and verified." |
| 813 | 翻译 zh | "档案已保存并完成复读核验。" |
| 821 | 翻译 en | "Profile save failed." |
| 821 | 翻译 zh | "档案保存失败。" |
| 842 | 属性 aria-label | t({ en: "Back", zh: "返回" }) |
| 842 | 翻译 en | "Back" |
| 842 | 翻译 zh | "返回" |
| 844 | 翻译 en | "Universal profile" |
| 844 | 翻译 zh | "通用档案" |
| 852 | 翻译 en | "This is how you appear to matches — updates as you type." |
| 852 | 翻译 zh | "这是别人看到的你，边填边更新。" |
| 859 | 翻译 en | "Cancel" |
| 859 | 翻译 zh | "取消" |
| 860 | 翻译 en | "Saving…" |
| 860 | 翻译 zh | "保存中…" |
| 860 | 翻译 en | "Save profile" |
| 860 | 翻译 zh | "保存档案" |
| 867 | 属性 title | t({ en: "Universal profile", zh: "通用档案" }) |
| 867 | 翻译 en | "Saving…" |
| 867 | 翻译 zh | "保存中…" |
| 867 | 翻译 en | "Save" |
| 867 | 翻译 zh | "保存" |
| 867 | 翻译 en | "Universal profile" |
| 867 | 翻译 zh | "通用档案" |

## repos/orbits/app/(app)/app/profile/page.tsx

源码：[page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/profile/page.tsx>)

静态来源入口：`/app/profile`

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 30 | 属性 title | routeState.copy.title |

## repos/orbits/app/(app)/app/settings/orbit-agent-automation-settings.tsx

源码：[orbit-agent-automation-settings.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/settings/orbit-agent-automation-settings.tsx>)

静态来源入口：`/app/settings`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 525 | OrbitAgentAutomationSettings | section |  | card |
| 549 | OrbitAgentAutomationSettings | h2 | t({ en: "Agent Playbooks", zh: "Agent Playbook" }) |  |
| 765 | OrbitAgentAutomationSettings | details |  |  |
| 766 | OrbitAgentAutomationSettings | summary | t({ en: "Version history", zh: "版本记录" }) ( automation.revisions.length ) |  |

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 148 | [automations, setAutomations] = useState&lt;AgentAutomation[]&gt;([]) |
| 149 | [loading, setLoading] = useState(true) |
| 150 | [saving, setSaving] = useState(false) |
| 151 | [compiling, setCompiling] = useState(false) |
| 152 | [trialing, setTrialing] = useState(false) |
| 153 | [pendingId, setPendingId] = useState&lt;string \| null&gt;(null) |
| 154 | [deleteConfirmId, setDeleteConfirmId] = useState&lt;string \| null&gt;(null) |
| 155 | [editingId, setEditingId] = useState&lt;string \| null&gt;(null) |
| 156 | [error, setError] = useState&lt;string \| null&gt;(null) |
| 157 | [notice, setNotice] = useState&lt;string \| null&gt;(null) |
| 158 | [naturalRequest, setNaturalRequest] = useState("") |
| 159 | [draft, setDraft] = useState&lt;AgentPlaybookDraft \| null&gt;(null) |
| 160 | [trial, setTrial] = useState&lt;{ summary: string; sourceModules: readonly string[]; evidenceIds: readonly string[]; } \| null&gt;(null) |
| 165 | [capabilityId, setCapabilityId] = useState("followups.reviewQueue") |
| 166 | [title, setTitle] = useState("") |
| 167 | [instruction, setInstruction] = useState("") |
| 168 | [triggerKind, setTriggerKind] = useState&lt;TriggerKind&gt;("schedule") |
| 169 | [scheduleKind, setScheduleKind] = useState&lt;ScheduleKind&gt;("daily") |
| 170 | [onceAt, setOnceAt] = useState(defaultOnceValue) |
| 171 | [time, setTime] = useState("09:00") |
| 172 | [daysOfWeek, setDaysOfWeek] = useState&lt;number[]&gt;([1]) |
| 173 | [signalTypes, setSignalTypes] = useState&lt;AgentAutomationSignalType[]&gt;([ "relationship_stale", ]) |
| 176 | [minimumImportance, setMinimumImportance] = useState(60) |
| 177 | [timeZone] = useState( () =&gt; Intl.DateTimeFormat().resolvedOptions().timeZone \|\| "UTC", ) |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 574 | field/textarea · OrbitAgentAutomationSettings | t({ en: "Natural-language Playbook", zh: "自然语言 Playbook" }) | onchange: (event) =&gt; setNaturalRequest(event.target.value) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 587 | button/button · OrbitAgentAutomationSettings | Compiling… / 正在生成… / Generate draft / 生成草案 | onclick: () =&gt; void compileNaturalRequest() | {"disabled":"compiling \|\| !naturalRequest.trim()","renderGateProps":[],"conditions":[]} |
| 616 | field/select · OrbitAgentAutomationSettings | t({ en: "Review type", zh: "复核类型" }) | onchange: (event) =&gt; setCapabilityId(event.target.value) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 624 | field/input · OrbitAgentAutomationSettings | t({ en: "Playbook name", zh: "Playbook 名称" }) | onchange: (event) =&gt; setTitle(event.target.value) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 628 | field/textarea · OrbitAgentAutomationSettings | t({ en: "Playbook instruction", zh: "Playbook 指令" }) | onchange: (event) =&gt; setInstruction(event.target.value) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 632 | field/select · OrbitAgentAutomationSettings | t({ en: "Trigger", zh: "触发方式" }) | onchange: (event) =&gt; setTriggerKind(event.target.value as TriggerKind) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 643 | field/select · OrbitAgentAutomationSettings | t({ en: "Frequency", zh: "运行频率" }) | onchange: (event) =&gt; setScheduleKind(event.target.value as ScheduleKind) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 652 | field/input · OrbitAgentAutomationSettings | t({ en: "Run at", zh: "运行时间" }) | onchange: (event) =&gt; setOnceAt(event.target.value) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 657 | field/input · OrbitAgentAutomationSettings | t({ en: "Local time", zh: "本地时间" }) | onchange: (event) =&gt; setTime(event.target.value) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 664 | button/button · OrbitAgentAutomationSettings | {option[language]} | onclick: () =&gt; toggleWeekday(option.value) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 675 | button/button · OrbitAgentAutomationSettings | {option[language]} | onclick: () =&gt; toggleSignal(option.value) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 682 | field/input · OrbitAgentAutomationSettings | t({ en: "Minimum importance", zh: "最低重要性" }) | onchange: (event) =&gt; setMinimumImportance(Number(event.target.value)) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 691 | button/button · OrbitAgentAutomationSettings | Cancel edit / 取消编辑 | onclick: resetEditor | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 695 | button/button · OrbitAgentAutomationSettings | Running trial… / 正在试运行… / Trial run / 试运行 | onclick: () =&gt; void dryRun() | {"disabled":"trialing \|\| !formReady","renderGateProps":[],"conditions":[]} |
| 698 | button/button · OrbitAgentAutomationSettings | Saving… / 正在保存… / Save new version / 保存新版本 / Enable Playbook / 启用 Playbook | onclick: () =&gt; void savePlaybook() | {"disabled":"saving \|\| !formReady","renderGateProps":[],"conditions":[]} |
| 766 | disclosure/summary · OrbitAgentAutomationSettings | Version history / 版本记录 ( {automation.revisions.length} ) |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 778 | button/button · OrbitAgentAutomationSettings | Run now / 立即运行 | onclick: () =&gt; void runNow(automation) | {"disabled":"pending \|\| automation.status === \"running\"","renderGateProps":[],"conditions":[]} |
| 779 | button/button · OrbitAgentAutomationSettings | Edit / 编辑 | onclick: () =&gt; edit(automation) | {"disabled":"pending \|\| automation.status === \"running\"","renderGateProps":[],"conditions":[]} |
| 780 | button/button · OrbitAgentAutomationSettings | Resume / 恢复 / Pause / 暂停 | onclick: () =&gt; void updateStatus(automation, automation.status === "paused" ? "active" : "paused") | {"disabled":"pending \|\| automation.status === \"running\"","renderGateProps":[],"conditions":[]} |
| 783 | button/button · OrbitAgentAutomationSettings | Confirm delete / 确认删除 / Delete / 删除 | onclick: () =&gt; void remove(automation) | {"disabled":"pending \|\| automation.status === \"running\"","renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 193 | load | 调用 | GET/由封装决定 | "/api/agent/automations" |
| 193 | load | 路径常量 | 见调用/handler | "/api/agent/automations" |
| 279 | compileNaturalRequest | 调用 | POST | "/api/agent/automations/compile" |
| 279 | compileNaturalRequest | 路径常量 | 见调用/handler | "/api/agent/automations/compile" |
| 313 | dryRun | 调用 | POST | "/api/agent/automations/dry-run" |
| 313 | dryRun | 路径常量 | 见调用/handler | "/api/agent/automations/dry-run" |
| 351 | savePlaybook | 调用 | editing ? PATCH : POST | editing ? `/api/agent/automations/${encodeURIComponent(editingId)}` : "/api/agent/automations" |
| 353 | savePlaybook | 路径常量 | 见调用/handler | `/api/agent/automations/${encodeURIComponent(editingId)}` |
| 354 | savePlaybook | 路径常量 | 见调用/handler | "/api/agent/automations" |
| 404 | updateStatus | 调用 | PATCH | `/api/agent/automations/${encodeURIComponent(automation.automationId)}` |
| 405 | updateStatus | 路径常量 | 见调用/handler | `/api/agent/automations/${encodeURIComponent(automation.automationId)}` |
| 434 | runNow | 调用 | POST | `/api/agent/automations/${encodeURIComponent(automation.automationId)}/run` |
| 435 | runNow | 路径常量 | 见调用/handler | `/api/agent/automations/${encodeURIComponent(automation.automationId)}/run` |
| 464 | remove | 调用 | DELETE | `/api/agent/automations/${encodeURIComponent(automation.automationId)}` |
| 465 | remove | 路径常量 | 见调用/handler | `/api/agent/automations/${encodeURIComponent(automation.automationId)}` |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 21 | 文案/数据常量 en | "Follow-up review" |
| 21 | 文案/数据常量 zh | "跟进关系复核" |
| 22 | 文案/数据常量 en | "Contact recommendations" |
| 22 | 文案/数据常量 zh | "人脉机会推荐" |
| 23 | 文案/数据常量 en | "Event recommendations" |
| 23 | 文案/数据常量 zh | "活动机会推荐" |
| 24 | 文案/数据常量 en | "Relationship context review" |
| 24 | 文案/数据常量 zh | "关系上下文复核" |
| 28 | 文案/数据常量 en | "Mon" |
| 28 | 文案/数据常量 zh | "一" |
| 29 | 文案/数据常量 en | "Tue" |
| 29 | 文案/数据常量 zh | "二" |
| 30 | 文案/数据常量 en | "Wed" |
| 30 | 文案/数据常量 zh | "三" |
| 31 | 文案/数据常量 en | "Thu" |
| 31 | 文案/数据常量 zh | "四" |
| 32 | 文案/数据常量 en | "Fri" |
| 32 | 文案/数据常量 zh | "五" |
| 33 | 文案/数据常量 en | "Sat" |
| 33 | 文案/数据常量 zh | "六" |
| 34 | 文案/数据常量 en | "Sun" |
| 34 | 文案/数据常量 zh | "日" |
| 38 | 文案/数据常量 en | "Follow-up becomes due" |
| 38 | 文案/数据常量 zh | "跟进到期" |
| 39 | 文案/数据常量 en | "Event is approaching" |
| 39 | 文案/数据常量 zh | "活动临近" |
| 40 | 文案/数据常量 en | "Relationship becomes stale" |
| 40 | 文案/数据常量 zh | "关系转冷" |
| 199 | 翻译 en | "Playbooks could not be loaded." |
| 199 | 翻译 zh | "Playbook 暂时无法读取。" |
| 207 | 翻译 en | "Playbooks could not be loaded." |
| 207 | 翻译 zh | "Playbook 暂时无法读取。" |
| 293 | 翻译 en | "Orbit could not compile this Playbook." |
| 293 | 翻译 zh | "Orbit 没能生成安全的 Playbook 草案。" |
| 299 | 翻译 en | "Draft generated. Review it or run a trial before enabling." |
| 299 | 翻译 zh | "草案已生成；请复核或先试运行，再启用。" |
| 330 | 翻译 en | "The Playbook trial failed." |
| 330 | 翻译 zh | "Playbook 试运行失败。" |
| 362 | 翻译 en | "Updated from Settings." |
| 362 | 翻译 zh | "从设置页更新。" |
| 376 | 翻译 en | "The Playbook was not saved." |
| 376 | 翻译 zh | "Playbook 没有保存成功。" |
| 390 | 翻译 en | `Version ${automation.version} saved.` |
| 390 | 翻译 zh | `已保存版本 ${automation.version}。` |
| 391 | 翻译 en | "Playbook enabled." |
| 391 | 翻译 zh | "Playbook 已启用。" |
| 416 | 翻译 en | "Status was not changed." |
| 416 | 翻译 zh | "状态没有更新成功。" |
| 442 | 翻译 en | "The Playbook did not run." |
| 442 | 翻译 zh | "Playbook 没有运行成功。" |
| 449 | 翻译 en | "Playbook finished." |
| 449 | 翻译 zh | "Playbook 已完成。" |
| 470 | 翻译 en | "The Playbook was not deleted." |
| 470 | 翻译 zh | "Playbook 没有删除成功。" |
| 550 | 翻译 en | "Agent Playbooks" |
| 550 | 翻译 zh | "Agent Playbook" |
| 554 | 翻译 en | "Describe a recurring relationship review, inspect the compiled trigger, and trial it before enabling. Playbooks stay read-only." |
| 555 | 翻译 zh | "用自然语言描述关系工作，复核生成的触发条件，并可先试运行再启用。Playbook 始终只读。" |
| 572 | 翻译 en | "Describe a Playbook" |
| 572 | 翻译 zh | "用一句话创建 Playbook" |
| 574 | 属性 placeholder | t({ en: "When a relationship becomes stale, review who needs attention first and explain why.", zh: "当关系转冷时，复核谁最需要跟进并说明原因。", }) |
| 574 | 属性 aria-label | t({ en: "Natural-language Playbook", zh: "自然语言 Playbook" }) |
| 575 | 翻译 en | "Natural-language Playbook" |
| 575 | 翻译 zh | "自然语言 Playbook" |
| 579 | 翻译 en | "When a relationship becomes stale, review who needs attention first and explain why." |
| 580 | 翻译 zh | "当关系转冷时，复核谁最需要跟进并说明原因。" |
| 594 | 翻译 en | "Compiling…" |
| 594 | 翻译 zh | "正在生成…" |
| 595 | 翻译 en | "Generate draft" |
| 595 | 翻译 zh | "生成草案" |
| 600 | 翻译 en | "Why this draft" |
| 600 | 翻译 zh | "草案说明" |
| 615 | 翻译 en | "Review type" |
| 615 | 翻译 zh | "复核类型" |
| 616 | 属性 aria-label | t({ en: "Review type", zh: "复核类型" }) |
| 616 | 翻译 en | "Review type" |
| 616 | 翻译 zh | "复核类型" |
| 623 | 翻译 en | "Name" |
| 623 | 翻译 zh | "名称" |
| 624 | 属性 aria-label | t({ en: "Playbook name", zh: "Playbook 名称" }) |
| 624 | 翻译 en | "Playbook name" |
| 624 | 翻译 zh | "Playbook 名称" |
| 627 | 翻译 en | "What should Orbit review?" |
| 627 | 翻译 zh | "希望 Orbit 复核什么？" |
| 628 | 属性 aria-label | t({ en: "Playbook instruction", zh: "Playbook 指令" }) |
| 628 | 翻译 en | "Playbook instruction" |
| 628 | 翻译 zh | "Playbook 指令" |
| 631 | 翻译 en | "Trigger" |
| 631 | 翻译 zh | "触发方式" |
| 632 | 属性 aria-label | t({ en: "Trigger", zh: "触发方式" }) |
| 632 | 翻译 en | "Trigger" |
| 632 | 翻译 zh | "触发方式" |
| 633 | 翻译 en | "Schedule" |
| 633 | 翻译 zh | "按时间" |
| 634 | 翻译 en | "Relationship signal" |
| 634 | 翻译 zh | "关系信号" |
| 642 | 翻译 en | "Frequency" |
| 642 | 翻译 zh | "运行频率" |
| 643 | 属性 aria-label | t({ en: "Frequency", zh: "运行频率" }) |
| 643 | 翻译 en | "Frequency" |
| 643 | 翻译 zh | "运行频率" |
| 644 | 翻译 en | "One time" |
| 644 | 翻译 zh | "一次" |
| 645 | 翻译 en | "Daily" |
| 645 | 翻译 zh | "每天" |
| 646 | 翻译 en | "Weekly" |
| 646 | 翻译 zh | "每周" |
| 651 | 翻译 en | "Run at" |
| 651 | 翻译 zh | "运行时间" |
| 652 | 属性 aria-label | t({ en: "Run at", zh: "运行时间" }) |
| 652 | 翻译 en | "Run at" |
| 652 | 翻译 zh | "运行时间" |
| 656 | 翻译 en | "Local time" |
| 656 | 翻译 zh | "本地时间" |
| 657 | 属性 aria-label | t({ en: "Local time", zh: "本地时间" }) |
| 657 | 翻译 en | "Local time" |
| 657 | 翻译 zh | "本地时间" |
| 662 | 属性 aria-label | t({ en: "Weekdays", zh: "星期" }) |
| 662 | 翻译 en | "Weekdays" |
| 662 | 翻译 zh | "星期" |
| 673 | 属性 aria-label | t({ en: "Signal types", zh: "信号类型" }) |
| 673 | 翻译 en | "Signal types" |
| 673 | 翻译 zh | "信号类型" |
| 681 | 翻译 en | "Minimum importance" |
| 681 | 翻译 zh | "最低重要性" |
| 682 | 属性 aria-label | t({ en: "Minimum importance", zh: "最低重要性" }) |
| 682 | 翻译 en | "Minimum importance" |
| 682 | 翻译 zh | "最低重要性" |
| 692 | 翻译 en | "Cancel edit" |
| 692 | 翻译 zh | "取消编辑" |
| 696 | 翻译 en | "Running trial…" |
| 696 | 翻译 zh | "正在试运行…" |
| 696 | 翻译 en | "Trial run" |
| 696 | 翻译 zh | "试运行" |
| 701 | 翻译 en | "Saving…" |
| 701 | 翻译 zh | "正在保存…" |
| 703 | 翻译 en | "Save new version" |
| 703 | 翻译 zh | "保存新版本" |
| 704 | 翻译 en | "Enable Playbook" |
| 704 | 翻译 zh | "启用 Playbook" |
| 712 | 翻译 en | "Trial result — no side effects" |
| 712 | 翻译 zh | "试运行结果 · 无副作用" |
| 715 | 翻译 en | "evidence records" |
| 715 | 翻译 zh | "条依据" |
| 723 | 翻译 en | "Your Playbooks" |
| 723 | 翻译 zh | "你的 Playbook" |
| 725 | 翻译 en | "Loading…" |
| 725 | 翻译 zh | "正在加载…" |
| 727 | 翻译 en | "No Playbooks yet." |
| 727 | 翻译 zh | "还没有 Playbook。" |
| 737 | JSX文字 | · v |
| 742 | 翻译 en | "Enabled" |
| 742 | 翻译 zh | "已启用" |
| 744 | 翻译 en | "Paused" |
| 744 | 翻译 zh | "已暂停" |
| 746 | 翻译 en | "Running" |
| 746 | 翻译 zh | "执行中" |
| 748 | 翻译 en | "Completed" |
| 748 | 翻译 zh | "已完成" |
| 749 | 翻译 en | "Failed" |
| 749 | 翻译 zh | "失败" |
| 754 | 翻译 en | `${automation.runCount} runs` |
| 754 | 翻译 zh | `已运行 ${automation.runCount} 次` |
| 758 | 翻译 en | "Latest result" |
| 758 | 翻译 zh | "最近结果" |
| 761 | 翻译 en | "evidence records" |
| 761 | 翻译 zh | "条依据" |
| 767 | 翻译 en | "Version history" |
| 767 | 翻译 zh | "版本记录" |
| 772 | JSX文字 | v |
| 778 | 翻译 en | "Run now" |
| 778 | 翻译 zh | "立即运行" |
| 779 | 翻译 en | "Edit" |
| 779 | 翻译 zh | "编辑" |
| 781 | 翻译 en | "Resume" |
| 781 | 翻译 zh | "恢复" |
| 781 | 翻译 en | "Pause" |
| 781 | 翻译 zh | "暂停" |
| 784 | 翻译 en | "Confirm delete" |
| 784 | 翻译 zh | "确认删除" |
| 784 | 翻译 en | "Delete" |
| 784 | 翻译 zh | "删除" |

## repos/orbits/app/(app)/app/settings/orbit-agent-execution-settings.tsx

源码：[orbit-agent-execution-settings.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/settings/orbit-agent-execution-settings.tsx>)

静态来源入口：`/app/settings`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 255 | OrbitAgentExecutionSettings | section | integrations.map((integration) =&gt; { const label = { google_calendar: "Google Calendar", gmail: "Gmail 元数据", microsoft_graph: "Microsoft Calendar / Mail metadata", }[integration.provider]; const connected = integration.status === "active"; const healthLabel = { healthy: "连接正常", not_checked: "待检查", action_required: "需要授权 …（完整表达式见源码） |  |
| 263 | OrbitAgentExecutionSettings | h2 | 安全执行与外部连接 |  |

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 104 | [preferences, setPreferences] = useState&lt;Preferences&gt;(DEFAULT_PREFERENCES) |
| 105 | [loading, setLoading] = useState(true) |
| 106 | [saving, setSaving] = useState(false) |
| 107 | [message, setMessage] = useState&lt;string \| null&gt;(null) |
| 109 | [integrations, setIntegrations] = useState&lt;readonly IntegrationStatus[]&gt;([]) |
| 111 | [checkingProvider, setCheckingProvider] = useState&lt;IntegrationStatus["provider"] \| null&gt;(null) |
| 113 | [operationsHealth, setOperationsHealth] = useState&lt;AgentOperationsHealth \| null&gt;(null) |
| 114 | [refreshingHealth, setRefreshingHealth] = useState(false) |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 92 | field/input · ToggleRow | {label} | onchange: (event) =&gt; onChange(event.target.checked) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 278 | callback-control/ToggleRow · OrbitAgentExecutionSettings |  | onchange: (autoPrepareMeetingNotes) =&gt; setPreferences((current) =&gt; ({ ...current, autoPrepareMeetingNotes, })) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 288 | callback-control/ToggleRow · OrbitAgentExecutionSettings |  | onchange: (externalCalendarWritesEnabled) =&gt; setPreferences((current) =&gt; ({ ...current, externalCalendarWritesEnabled, })) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 298 | callback-control/ToggleRow · OrbitAgentExecutionSettings |  | onchange: (postEventReminderPushEnabled) =&gt; setPreferences((current) =&gt; ({ ...current, postEventReminderPushEnabled, })) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 308 | callback-control/ToggleRow · OrbitAgentExecutionSettings |  | onchange: (preEventBriefPushEnabled) =&gt; setPreferences((current) =&gt; ({ ...current, preEventBriefPushEnabled, })) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 328 | field/input · OrbitAgentExecutionSettings | 安静时段开始 | oninput: (event) =&gt; { const start = event.currentTarget.value; setPreferences((current) =&gt; ({ ...current, quietHours: { ...current.quietHours, start, }, })); } | {"disabled":null,"renderGateProps":[],"conditions":[]} |
