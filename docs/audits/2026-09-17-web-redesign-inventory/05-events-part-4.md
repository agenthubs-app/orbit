| 182 | 翻译 en | "This route only reads event, attendee, recommendation, and profile sources. It does not check people in, create contacts, send notifications, write calendars, call AI, or contact external providers." |
| 183 | 翻译 zh | "此入口只读取活动、参会者、推荐和个人资料来源；不会签到、创建联系人、发送通知、写入日历、调用 AI 或联系外部服务。" |
| 187 | 翻译 en | "Keep the Party experience tied to reviewed live-capable event sources." |
| 188 | 翻译 zh | "确保 Party 体验只使用经过复核、可由真实服务读取的活动来源。" |
| 191 | 翻译 en | "Party is not ready" |
| 192 | 翻译 zh | "Party 尚未就绪" |
| 197 | 翻译 en | "Party could not load event or profile context." |
| 198 | 翻译 zh | "Party 无法加载活动或个人资料上下文。" |
| 201 | 翻译 en | "No check-in was recorded, no contact was created, and no external provider was contacted." |
| 202 | 翻译 zh | "没有记录签到、没有创建联系人，也没有联系任何外部服务。" |
| 204 | 文案/数据常量 eyebrow | "Party" |
| 206 | 翻译 en | "The failed route state stops before check-in writes, notifications, contact creation, calendar, email, AI, or outside network work." |
| 207 | 翻译 zh | "失败边界会在签到写入、通知、联系人创建、日历、邮件、AI 或外部网络操作前停止。" |
| 210 | 翻译 en | "Confirm the Events live store, event capability records, and profile sources are configured, then retry Party mode." |
| 211 | 翻译 zh | "确认活动实时存储、活动能力记录和个人资料来源已配置，再重试 Party 模式。" |
| 214 | 翻译 en | "Show a recoverable Party boundary without falling back to legacy hybrid route data." |
| 215 | 翻译 zh | "展示可恢复的 Party 边界，不回退到旧的混合路由数据。" |
| 218 | 翻译 en | "Party could not load" |
| 219 | 翻译 zh | "Party 无法加载" |
| 224 | 翻译 en | "Party context is waiting for reviewed event, attendee, recommendation, or profile sources." |
| 225 | 翻译 zh | "Party 上下文正在等待活动、参会者、推荐或个人资料来源完成复核。" |
| 228 | 翻译 en | "The Party screen is held until the live-capable event workspace is ready." |
| 229 | 翻译 zh | "在可由真实服务读取的活动工作区就绪前，Party 界面会保持等待。" |
| 231 | 文案/数据常量 eyebrow | "Party" |
| 233 | 翻译 en | "Pending Party context cannot create check-ins, contacts, notifications, or external work." |
| 234 | 翻译 zh | "等待中的 Party 上下文不能创建签到、联系人、通知或外部操作。" |
| 237 | 翻译 en | "Check the event again after roster and recommendation review finishes." |
| 238 | 翻译 zh | "名单和推荐复核完成后，再次查看这场活动。" |
| 241 | 翻译 en | "Keep Party mode stable while source review is pending." |
| 242 | 翻译 zh | "在来源复核期间保持 Party 模式稳定。" |
| 245 | 翻译 en | "Party is loading" |
| 246 | 翻译 zh | "Party 正在加载" |
| 267 | 翻译 en | "Return to current event" |
| 268 | 翻译 zh | "返回当前活动" |
| 271 | 翻译 en | "Return to events" |
| 272 | 翻译 zh | "返回活动" |
| 304 | 文案/数据常量 en | "Check in at the venue to unlock tonight's matches." |
| 305 | 文案/数据常量 zh | "到场签到后即可解锁今晚的匹配结果。" |
| 307 | 文案/数据常量 en | "Check-in opens" |
| 307 | 文案/数据常量 zh | "开始签到" |
| 312 | 文案/数据常量 en | "Find your table and seat; tablemates are matched to complement each other." |
| 313 | 文案/数据常量 zh | "按桌号入座，同桌伙伴经过互补匹配，附开场建议。" |
| 315 | 文案/数据常量 en | "Round one tables" |
| 315 | 文案/数据常量 zh | "第一轮分桌" |
| 320 | 文案/数据常量 en | "Tables remix around shared topics for a second round of conversations." |
| 321 | 文案/数据常量 zh | "围绕共同话题重新组桌，开启第二轮交流。" |
| 323 | 文案/数据常量 en | "Round two topic tables" |
| 323 | 文案/数据常量 zh | "第二轮话题桌" |

## repos/orbits/app/(app)/app/party/event-operations-controls.tsx

源码：[event-operations-controls.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/party/event-operations-controls.tsx>)

静态来源入口：`/app/party`、`/app/party/checkin`、`/app/party/graph`

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 76 | [localRequestId, setLocalRequestId] = useState&lt;string \| null&gt;( cachedState?.requestId ?? null, ) |
| 79 | [localContactId, setLocalContactId] = useState&lt;string \| null&gt;( cachedState?.contactId ?? null, ) |
| 82 | [localDirection, setLocalDirection] = useState&lt; OrbitPartyPersonView["contactRequestDirection"] \| null &gt;(cachedState?.direction ?? null) |
| 85 | [localRevision, setLocalRevision] = useState&lt;number \| null&gt;( cachedState?.revision ?? null, ) |
| 88 | [localStatus, setLocalStatus] = useState&lt; OrbitPartyPersonView["contactRequestStatus"] \| null &gt;(cachedState?.status ?? null) |
| 91 | [busy, setBusy] = useState(false) |
| 92 | [error, setError] = useState&lt;string \| null&gt;(null) |
| 360 | [recordedAt, setRecordedAt] = useState(checkedInAt) |
| 361 | [busy, setBusy] = useState(false) |
| 362 | [error, setError] = useState&lt;string \| null&gt;(null) |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 267 | button/button · EventContactRequestControl | Sending… / 发送中… / Request contact / 申请交换联系信息 / Contact requests open when the event starts / 活动开始后可申请交换联系 | onclick: createRequest | {"disabled":"busy \|\| !contactRequestsOpen","renderGateProps":[],"conditions":[]} |
| 278 | button/button · EventContactRequestControl | Saving… / 保存中… / Accept / 同意 | onclick: () =&gt; respond(true) | {"disabled":"busy","renderGateProps":[],"conditions":[]} |
| 283 | button/button · EventContactRequestControl | Decline / 拒绝 | onclick: () =&gt; respond(false) | {"disabled":"busy","renderGateProps":[],"conditions":[]} |
| 291 | button/button · EventContactRequestControl | Withdraw request / 撤回申请 | onclick: () =&gt; void withdraw() | {"disabled":"busy","renderGateProps":[],"conditions":[]} |
| 318 | link/a · EventContactRequestControl | Open contact / 打开联系人 | `/app/contacts/${encodeURIComponent(contactId)}` | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 328 | link/a · EventContactRequestControl | Open contact / 打开联系人 | `/app/contacts/${encodeURIComponent(contactId)}` | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 341 | button/button · EventContactRequestControl | Request contact again / 再次申请交换联系信息 / Contact requests open when the event starts / 活动开始后可再次申请交换联系 | onclick: () =&gt; void createRequest() | {"disabled":"busy \|\| !contactRequestsOpen","renderGateProps":[],"conditions":[]} |
| 386 | button/button · EventCheckInControl | Checking in… / 签到中… / Check in now / 立即签到 / Check-in window is closed / 当前不在签到时间内 | onclick: checkIn | {"disabled":"!enabled \|\| busy","renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 48 | postJson | 调用 | POST | url |
| 140 | createRequest | 路径常量 | 见调用/handler | `/api/events/${encodeURIComponent(eventId)}/operations/contact-requests` |
| 186 | respond | 路径常量 | 见调用/handler | `/api/events/${encodeURIComponent(eventId)}/operations/contact-requests/${encodeURIComponent(responseRequestId)}/respond` |
| 230 | withdraw | 路径常量 | 见调用/handler | `/api/events/${encodeURIComponent(eventId)}/operations/contact-requests/${encodeURIComponent(requestId)}/withdraw` |
| 369 | checkIn | 路径常量 | 见调用/handler | `/api/events/${encodeURIComponent(eventId)}/operations/check-in` |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 170 | 翻译 en | "This contact request is missing its persisted request id. Refresh Party before retrying." |
| 171 | 翻译 zh | "此联系申请缺少已持久化的申请 ID，请刷新 Party 后重试。" |
| 214 | 翻译 en | "This contact request is missing its persisted request id. Refresh Party before retrying." |
| 215 | 翻译 zh | "此联系申请缺少已持久化的申请 ID，请刷新 Party 后重试。" |
| 270 | 翻译 en | "Sending…" |
| 270 | 翻译 zh | "发送中…" |
| 272 | 翻译 en | "Request contact" |
| 272 | 翻译 zh | "申请交换联系信息" |
| 273 | 翻译 en | "Contact requests open when the event starts" |
| 273 | 翻译 zh | "活动开始后可申请交换联系" |
| 280 | 翻译 en | "Saving…" |
| 280 | 翻译 zh | "保存中…" |
| 281 | 翻译 en | "Accept" |
| 281 | 翻译 zh | "同意" |
| 284 | 翻译 en | "Decline" |
| 284 | 翻译 zh | "拒绝" |
| 290 | 翻译 en | "Waiting for their consent" |
| 290 | 翻译 zh | "等待对方授权" |
| 291 | 翻译 en | "Withdraw request" |
| 291 | 翻译 zh | "撤回申请" |
| 297 | 翻译 en | "Contact exchange accepted" |
| 297 | 翻译 zh | "双方已同意交换联系信息" |
| 302 | 翻译 en | "Start / manage appointment" |
| 302 | 翻译 zh | "发起/管理约谈" |
| 312 | 翻译 en | "The accepted exchange is missing its request id. Refresh Party before scheduling." |
| 313 | 翻译 zh | "这次已接受的名片交换缺少申请 ID，请刷新 Party 后再发起约谈。" |
| 319 | 翻译 en | "Open contact" |
| 319 | 翻译 zh | "打开联系人" |
| 326 | 翻译 en | "Contact exchange accepted" |
| 326 | 翻译 zh | "双方已同意交换联系信息" |
| 329 | 翻译 en | "Open contact" |
| 329 | 翻译 zh | "打开联系人" |
| 336 | 翻译 en | "Contact request declined" |
| 336 | 翻译 zh | "联系申请已拒绝" |
| 340 | 翻译 en | "Contact request withdrawn" |
| 340 | 翻译 zh | "联系申请已撤回" |
| 341 | 翻译 en | "Request contact again" |
| 341 | 翻译 zh | "再次申请交换联系信息" |
| 341 | 翻译 en | "Contact requests open when the event starts" |
| 341 | 翻译 zh | "活动开始后可再次申请交换联系" |
| 383 | 翻译 en | "Checked in" |
| 383 | 翻译 zh | "已签到" |
| 389 | 翻译 en | "Checking in…" |
| 389 | 翻译 zh | "签到中…" |
| 391 | 翻译 en | "Check in now" |
| 391 | 翻译 zh | "立即签到" |
| 392 | 翻译 en | "Check-in window is closed" |
| 392 | 翻译 zh | "当前不在签到时间内" |
| 397 | 翻译 en | "The same registration is written once; repeating this action returns the existing check-in record." |
| 398 | 翻译 zh | "同一报名只写入一次；重复操作会返回已有签到记录。" |

## repos/orbits/app/(app)/app/party/graph/page.tsx

源码：[page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/party/graph/page.tsx>)

静态来源入口：`/app/party/graph`

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 50 | 属性 title | routeState.copy.title |

## repos/orbits/app/(app)/app/party/page.tsx

源码：[page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/party/page.tsx>)

静态来源入口：`/app/party`

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 52 | 属性 title | routeState.copy.title |

## repos/orbits/app/(app)/app/register/compose-app-register-from-previously-approved-mock-first-capabilities/register-route-view-model.ts

源码：[register-route-view-model.ts](</Users/li/work/orbit/repos/orbits/app/(app)/app/register/compose-app-register-from-previously-approved-mock-first-capabilities/register-route-view-model.ts>)

静态来源入口：`/app/register`

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 79 | 文案/数据常量 description | "Choose a source-backed event before collecting registration profile details." |
| 81 | 文案/数据常量 emptyState | "No registration event is ready, and no registration profile was saved." |
| 83 | 文案/数据常量 eyebrow | "Registration" |
| 84 | 文案/数据常量 guardrail | "This route only reads event and profile context. It does not create attendees, send messages, trigger notifications, or contact external providers." |
| 86 | 文案/数据常量 nextStep | "Return to events and open registration from a reviewed event record." |
| 88 | 文案/数据常量 purpose | "Keep the registration entry visible while preserving source-backed event boundaries." |
| 90 | 文案/数据常量 title | "Registration is not ready" |
| 93 | 文案/数据常量 description | "Registration could not load event or profile context." |
| 94 | 文案/数据常量 emptyState | "No registration profile was saved, no attendee was created, and no external provider was contacted." |
| 96 | 文案/数据常量 eyebrow | "Registration" |
| 97 | 文案/数据常量 guardrail | "The failed route state stops before registration writes, notifications, email, calendar, AI, or outside network work." |
| 99 | 文案/数据常量 nextStep | "Confirm the Events live store and profile sources are configured, then retry registration." |
| 101 | 文案/数据常量 purpose | "Show a recoverable registration boundary without falling back to mock data." |
| 103 | 文案/数据常量 title | "Registration could not load" |
| 106 | 文案/数据常量 description | "Registration context is waiting for reviewed event or profile sources." |
| 108 | 文案/数据常量 emptyState | "The registration form is held until source-backed context is ready." |
| 110 | 文案/数据常量 eyebrow | "Registration" |
| 111 | 文案/数据常量 guardrail | "Pending registration context cannot create attendees or trigger external work." |
| 113 | 文案/数据常量 nextStep | "Check the event again after its source-backed registration context is ready." |
| 115 | 文案/数据常量 purpose | "Keep the registration entry stable while source review is pending." |
| 117 | 文案/数据常量 title | "Registration is loading" |
| 132 | 文案/数据常量 label | "Return to events" |
| 133 | 文案/数据常量 recoveryCopy | "Open an event with reviewed source context before retrying registration." |
| 142 | 文案/数据常量 label | "Retry registration" |
| 143 | 文案/数据常量 recoveryCopy | "Retry registration after confirming the event and profile services are configured." |

## repos/orbits/app/(app)/app/register/page.tsx

源码：[page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/register/page.tsx>)

静态来源入口：`/app/register`

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 17 | 属性 title | routeState.copy.title |

## repos/orbits/app/(app)/app/schedule/events/[id]/event-preview-route-view-model.ts

源码：[event-preview-route-view-model.ts](</Users/li/work/orbit/repos/orbits/app/(app)/app/schedule/events/[id]/event-preview-route-view-model.ts>)

静态来源入口：`/app/schedule/events/[id]`

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 93 | 文案/数据常量 description | "这个安排的活动来源暂时不可用。返回日程后可以继续复核其他关系安排。" |
| 97 | 文案/数据常量 guardrail | "来源不可用时，Orbit 不会自动改动你的日历，也不会替你发出任何消息。" |
| 100 | 文案/数据常量 label | "返回日程" |
| 101 | 文案/数据常量 label | "查看活动列表" |
| 104 | 文案/数据常量 title | "安排预览无法加载" |
| 129 | 文案/数据常量 description | "活动详情工作区还在接入中；这里先保留这条安排需要的活动名称、时间、来源和下一步。" |
| 132 | 文案/数据常量 guardrail | "这是本地预览：不会自动改动你的日历，也不会替你报名或发出任何消息。" |
| 135 | 文案/数据常量 label | "返回日程" |
| 136 | 文案/数据常量 label | "查看活动列表" |
| 139 | 文案/数据常量 title | "活动安排预览" |

## repos/orbits/app/(app)/app/schedule/events/[id]/orbit-real-schedule-event.tsx

源码：[orbit-real-schedule-event.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/schedule/events/[id]/orbit-real-schedule-event.tsx>)

静态来源入口：`/app/schedule/events/[id]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 44 | ScheduleEventPreviewSuccess | main |  | orbit-personal-page |
| 63 | ScheduleEventPreviewSuccess | section |  | card |
| 73 | ScheduleEventPreviewSuccess | h1 | model.title | h-display |
| 116 | ScheduleEventPreviewSuccess | h2 | model.event.title | h-title |
| 208 | ScheduleEventPreviewFailure | main |  | orbit-personal-page |
| 218 | ScheduleEventPreviewFailure | section | model.errorCode ? ( &lt;div className="badge" style={{ justifySelf: "start" }}&gt; 来源状态 {model.errorCode} &lt;/div&gt; ) : null | card |
| 231 | ScheduleEventPreviewFailure | h1 | model.title | h-title |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 26 | link/a · PreviewActions | {action.label} | action.href | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 17 | 属性 aria-label | 恢复操作 |
| 72 | JSX文字 | 日程安排 |
| 230 | JSX文字 | 日程安排 |
| 252 | JSX文字 | 来源状态 |

## repos/orbits/features/dashboard/dashboard-aggregate-mock/debug-view.tsx

源码：[debug-view.tsx](</Users/li/work/orbit/repos/orbits/features/dashboard/dashboard-aggregate-mock/debug-view.tsx>)

静态来源入口：`/dev/capabilities/[slug]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 287 | RecentActivityList | h3 | item.label | relationship-name |
| 513 | DashboardAggregateMockDemo | header |  | workbench-header |
| 515 | DashboardAggregateMockDemo | h1 | Dashboard aggregate mock |  |
| 535 | DashboardAggregateMockDemo | header |  | workbench-header |
| 537 | DashboardAggregateMockDemo | h1 | Dashboard aggregate mock |  |
| 547 | DashboardAggregateMockDemo | section | Dashboard aggregate capability details | workbench-grid |
| 569 | DashboardAggregateMockDemo | section | Dashboard aggregate relationship details | workbench-grid |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 89 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/dashboard" |
| 96 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/dashboard/summary" |
| 103 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/dashboard?scenario=empty" |
| 110 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/dashboard?scenario=pending" |
| 117 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/dashboard?scenario=failure" |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 88 | 文案/数据常量 label | "Dashboard aggregate" |
| 95 | 文案/数据常量 label | "Dashboard summary" |
| 102 | 文案/数据常量 label | "Empty dashboard aggregate" |
| 109 | 文案/数据常量 label | "Pending dashboard aggregate" |
| 116 | 文案/数据常量 label | "Controlled failure" |
| 135 | 属性 aria-label | Dashboard aggregate evidence ids |
| 148 | 文案/数据常量 label | "Relationship asset totals" |
| 153 | 文案/数据常量 label | "New contacts" |
| 158 | 文案/数据常量 label | "High-value relationships" |
| 163 | 文案/数据常量 label | "Pending followups" |
| 168 | 文案/数据常量 label | "Dormant contacts" |
| 175 | 属性 aria-label | Dashboard aggregate metric cards |
| 196 | 属性 aria-label | Dashboard new contacts |
| 201 | JSX文字 | from |
| 201 | JSX文字 | . Evidence |
| 216 | 属性 aria-label | Dashboard high-value relationships |
| 237 | 属性 aria-label | Dashboard pending followups |
| 256 | 属性 aria-label | Dashboard dormant contacts |
| 260 | JSX文字 | days |
| 277 | 属性 aria-label | Dashboard recent activity |
| 289 | JSX文字 | at |
| 304 | 属性 aria-label | Dashboard aggregate mock-only execution checks |
| 309 | JSX文字 | Live analytics |
| 311 | JSX文字 | live analytics queries |
| 315 | JSX文字 | Materialized aggregates |
| 317 | JSX文字 | production materialized aggregates |
| 322 | JSX文字 | External network |
| 323 | JSX文字 | external network requested |
| 326 | JSX文字 | Database reads |
| 327 | JSX文字 | database reads |
| 330 | JSX文字 | Database writes |
| 331 | JSX文字 | database writes |
| 334 | JSX文字 | AI provider |
| 335 | JSX文字 | AI provider requested |
| 338 | JSX文字 | Email and calendar |
| 340 | JSX文字 | email |
| 340 | JSX文字 | ; calendar |
| 345 | JSX文字 | Notifications |
| 347 | JSX文字 | notification provider requested |
| 352 | JSX文字 | Device APIs |
| 353 | JSX文字 | device requested |
| 361 | 属性 title | Dashboard aggregate stays evidence-backed |
| 367 | JSX文字 | Scan this first: the aggregate combines relationship asset totals, new contacts, high-value count, pending followups, dormant contacts, and recent activity from deterministic local fixtures. |
| 371 | 属性 aria-label | Dashboard aggregate operator checkpoint |
| 376 | JSX文字 | State |
| 382 | JSX文字 | Relationship assets |
| 383 | JSX文字 | contacts |
| 386 | JSX文字 | Evidence-backed |
| 389 | JSX文字 | relationships |
| 393 | JSX文字 | Recent activity |
| 394 | JSX文字 | local events |
| 414 | 属性 title | Harness-visible states |
| 415 | 属性 aria-label | Dashboard aggregate state matrix |
| 420 | JSX文字 | Success state |
| 421 | JSX文字 | Success: |
| 421 | JSX文字 | contacts |
| 424 | JSX文字 | Empty state |
| 425 | JSX文字 | Empty: |
| 428 | JSX文字 | Pending state |
| 429 | JSX文字 | Pending: |
| 432 | JSX文字 | Failure state |
| 434 | JSX文字 | Failure: controlled error |
| 439 | JSX文字 | Empty and pending states stay successful envelopes; controlled failures use a service-unavailable envelope. |
| 514 | JSX文字 | Developer capability runtime |
| 515 | JSX文字 | Dashboard aggregate mock |
| 517 | JSX文字 | The deterministic dashboard aggregate fixtures did not load, so this dev surface stopped inside a controlled local state. |
| 536 | JSX文字 | Developer capability runtime |
| 537 | JSX文字 | Dashboard aggregate mock |
| 539 | JSX文字 | Dev-only surface for verifying the dashboard aggregate boundary. The page reads the mock service for success, empty, pending, and failure states before any live analytics provider exists. |
| 547 | 属性 aria-label | Dashboard aggregate capability details |
| 551 | 属性 title | Success state |
| 560 | 属性 title | Provider boundaries |
| 563 | JSX文字 | Dashboard aggregate data stays local until the documented provider switch and replacement tests are added. |
| 569 | 属性 aria-label | Dashboard aggregate relationship details |
| 573 | 属性 title | New contacts |
| 577 | 属性 title | High-value relationships |
| 583 | 属性 title | Pending followups |
| 587 | 属性 title | Dormant contacts |
| 592 | 属性 title | Recent activity |
| 603 | 属性 title | Rule-based summary |
| 610 | JSX文字 | from |
| 610 | JSX文字 | evidence ids |
| 617 | 属性 title | Declared probes |
| 621 | 属性 aria-label | Dashboard aggregate API probe details |
| 629 | JSX文字 | returns |
| 637 | 属性 title | Replacement notes |
| 643 | JSX文字 | Handoff doc |
| 649 | JSX文字 | Switch mechanism |
| 651 | JSX文字 | ORBIT_DASHBOARD_AGGREGATE_PROVIDER |
| 651 | JSX文字 | remains documented before live aggregate providers are wired. |

## repos/orbits/features/dashboard/network-distribution-analytics-mock/debug-view.tsx

源码：[debug-view.tsx](</Users/li/work/orbit/repos/orbits/features/dashboard/network-distribution-analytics-mock/debug-view.tsx>)

静态来源入口：`/dev/capabilities/[slug]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 262 | NetworkGapCards | h3 | gap.label | relationship-name |
| 492 | NetworkDistributionAnalyticsMockDemo | header |  | workbench-header |
| 494 | NetworkDistributionAnalyticsMockDemo | h1 | Network distribution analytics mock |  |
| 514 | NetworkDistributionAnalyticsMockDemo | header |  | workbench-header |
| 516 | NetworkDistributionAnalyticsMockDemo | h1 | Network distribution analytics mock |  |
| 530 | NetworkDistributionAnalyticsMockDemo | section | Network distribution analytics capability details | workbench-grid |
| 556 | NetworkDistributionAnalyticsMockDemo | section | Network distribution analytics bucket details | workbench-grid |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 109 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/dashboard/distributions" |
| 116 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/dashboard/network-gaps" |
| 123 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/dashboard/distributions?scenario=empty" |
| 130 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/dashboard/network-gaps?scenario=pending" |
| 137 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/dashboard/network-gaps?scenario=failure" |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 108 | 文案/数据常量 label | "Network distributions" |
| 115 | 文案/数据常量 label | "Network gaps" |
| 122 | 文案/数据常量 label | "Empty distributions" |
| 129 | 文案/数据常量 label | "Pending gaps" |
| 136 | 文案/数据常量 label | "Controlled failure" |
| 154 | 属性 aria-label | Network distribution evidence ids |
| 170 | 属性 aria-label | Network distribution analytics source references |
| 177 | JSX文字 | source type |
| 177 | JSX文字 | ; provider record |
| 191 | 属性 aria-label | Industry distribution |
| 199 | JSX文字 | % of sourced contacts |
| 217 | 属性 aria-label | Value type distribution |
| 222 | JSX文字 | relationships, |
| 222 | JSX文字 | % of the fixture. Evidence |
| 237 | 属性 aria-label | Relationship strength distribution |
| 244 | JSX文字 | risk |
| 247 | JSX文字 | relationships, |
| 247 | JSX文字 | % of the fixture. |
| 258 | 属性 aria-label | Network gap analysis |
| 261 | JSX文字 | severity |
| 280 | 属性 aria-label | Network distribution analytics mock-only execution checks |
| 285 | JSX文字 | Graph boundary |
| 286 | JSX文字 | graph algorithms |
| 289 | JSX文字 | Embedding boundary |
| 290 | JSX文字 | embedding search |
| 293 | JSX文字 | Analytics jobs |
| 294 | JSX文字 | live analytics jobs |
| 297 | JSX文字 | External network |
| 298 | JSX文字 | external network requested |
| 301 | JSX文字 | Database reads |
| 302 | JSX文字 | database reads |
| 305 | JSX文字 | Database writes |
| 306 | JSX文字 | database writes |
| 309 | JSX文字 | AI provider |
| 310 | JSX文字 | AI provider requested |
| 313 | JSX文字 | Email and calendar |
| 315 | JSX文字 | email |
| 315 | JSX文字 | ; calendar |
| 320 | JSX文字 | Notifications |
| 322 | JSX文字 | notification provider requested |
| 327 | JSX文字 | Device APIs |
| 328 | JSX文字 | device requested |
| 342 | 属性 title | Network analytics stays mock-only |
| 348 | JSX文字 | Scan this first: the capability buckets relationship context by industry, value type, and relationship strength, then applies local fixture rules to produce network gap recommendations. |
| 352 | 属性 aria-label | Network distribution analytics operator checkpoint |
| 357 | JSX文字 | State |
| 363 | JSX文字 | Industries |
| 364 | JSX文字 | buckets |
| 367 | JSX文字 | Gap coverage |
| 368 | JSX文字 | score |
| 371 | JSX文字 | Gap recommendations |
| 372 | JSX文字 | local rules |
| 394 | 属性 title | Harness-visible states |
| 395 | 属性 aria-label | Network distribution analytics state matrix |
| 400 | JSX文字 | Success state |
| 402 | JSX文字 | Success: |
| 402 | JSX文字 | industry buckets and |
| 403 | JSX文字 | gap recommendations |
| 407 | JSX文字 | Empty state |
| 408 | JSX文字 | Empty: |
| 411 | JSX文字 | Pending state |
| 412 | JSX文字 | Pending: |
| 415 | JSX文字 | Failure state |
| 417 | JSX文字 | Failure: controlled error |
| 422 | JSX文字 | Empty and pending states stay successful envelopes; controlled failures use a service-unavailable envelope. |
| 493 | JSX文字 | Developer capability runtime |
| 494 | JSX文字 | Network distribution analytics mock |
| 496 | JSX文字 | The deterministic network distribution analytics fixtures did not load, so this dev surface stopped inside a controlled local state. |
| 515 | JSX文字 | Developer capability runtime |
| 516 | JSX文字 | Network distribution analytics mock |
| 518 | JSX文字 | Dev-only surface for verifying the network distribution analytics boundary. The page reads the mock service for success, empty, pending, and failure states before graph analytics or live providers exist. |
| 530 | 属性 aria-label | Network distribution analytics capability details |
| 534 | 属性 title | Industry distribution |
| 545 | 属性 title | Provider boundaries |
| 550 | JSX文字 | Distribution analytics stay local until the documented provider switch and replacement tests are added. |
| 556 | 属性 aria-label | Network distribution analytics bucket details |
| 560 | 属性 title | Value type distribution |
| 566 | 属性 title | Relationship strength distribution |
| 573 | 属性 title | Network gap analysis |
| 589 | 属性 title | Declared probes |
| 593 | 属性 aria-label | Network distribution analytics API probe details |
| 601 | JSX文字 | returns |
| 609 | 属性 title | Replacement notes |
| 615 | JSX文字 | Handoff doc |
| 621 | JSX文字 | Switch mechanism |
| 623 | JSX文字 | ORBIT_NETWORK_DISTRIBUTION_ANALYTICS_PROVIDER |
| 624 | JSX文字 | remains documented before live network analytics providers are wired. |

## repos/orbits/features/dashboard/opportunity-reminder-analytics-mock/debug-view.tsx

源码：[debug-view.tsx](</Users/li/work/orbit/repos/orbits/features/dashboard/opportunity-reminder-analytics-mock/debug-view.tsx>)

静态来源入口：`/dev/capabilities/[slug]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 279 | HighPriorityOpportunityCards | h3 | opportunity.title | relationship-name |
| 632 | OpportunityReminderAnalyticsMockDemo | header |  | workbench-header |
| 634 | OpportunityReminderAnalyticsMockDemo | h1 | Opportunity reminder analytics mock |  |
| 654 | OpportunityReminderAnalyticsMockDemo | header |  | workbench-header |
| 656 | OpportunityReminderAnalyticsMockDemo | h1 | Opportunity reminder analytics mock |  |
| 670 | OpportunityReminderAnalyticsMockDemo | section | Opportunity reminder analytics capability details | workbench-grid |
| 696 | OpportunityReminderAnalyticsMockDemo | section | Opportunity reminder analytics relationship details | workbench-grid |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 549 | link/a · ScenarioExerciseControls | {control.actionLabel} | control.path | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 553 | form-submit-boundary/form · ScenarioExerciseControls | {control.actionLabel} |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 554 | button/button · ScenarioExerciseControls | {control.actionLabel} |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 142 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/dashboard/opportunities" |
| 149 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/dashboard/opportunities/recompute" |
| 156 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/dashboard/opportunities?scenario=empty" |
| 163 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/dashboard/opportunities/recompute?scenario=pending" |
| 170 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/dashboard/opportunities/recompute?scenario=failure" |
| 190 | (module / render callback) | 路径常量 | 见调用/handler | "/api/dashboard/opportunities" |
| 198 | (module / render callback) | 路径常量 | 见调用/handler | "/api/dashboard/opportunities?scenario=empty" |
| 206 | (module / render callback) | 路径常量 | 见调用/handler | "/api/dashboard/opportunities/recompute" |
| 214 | (module / render callback) | 路径常量 | 见调用/handler | "/api/dashboard/opportunities/recompute?scenario=pending" |
| 222 | (module / render callback) | 路径常量 | 见调用/handler | "/api/dashboard/opportunities/recompute?scenario=failure" |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 141 | 文案/数据常量 label | "Opportunity reminders" |
| 148 | 文案/数据常量 label | "Opportunity recompute" |
| 155 | 文案/数据常量 label | "Empty reminders" |
| 162 | 文案/数据常量 label | "Pending recompute" |
| 169 | 文案/数据常量 label | "Controlled failure" |
| 230 | 属性 aria-label | Opportunity reminder analytics evidence ids |
| 249 | 属性 aria-label | Opportunity reminder analytics source references |
| 256 | JSX文字 | source type |
| 256 | JSX文字 | ; provider record |
| 270 | 属性 aria-label | High-priority opportunities |
| 277 | JSX文字 | priority · |
| 300 | 属性 aria-label | Dormant high-value contacts |
| 325 | 属性 aria-label | Current goal matching |
| 332 | JSX文字 | Matched opportunities |
| 348 | 属性 aria-label | Suggested contact reasons |
| 367 | 属性 aria-label | Opportunity reminder analytics mock-only execution checks |
| 372 | JSX文字 | Predictive scoring |
| 374 | JSX文字 | predictive scoring |
| 378 | JSX文字 | Background mining |
| 380 | JSX文字 | background opportunity mining |
| 385 | JSX文字 | Analytics jobs |
| 386 | JSX文字 | live analytics jobs |
| 389 | JSX文字 | External network |
| 390 | JSX文字 | external network requested |
| 393 | JSX文字 | Database reads |
| 394 | JSX文字 | database reads |
| 397 | JSX文字 | Database writes |
| 398 | JSX文字 | database writes |
| 401 | JSX文字 | AI provider |
| 402 | JSX文字 | AI provider requested |
| 405 | JSX文字 | Email and calendar |
| 407 | JSX文字 | email |
| 407 | JSX文字 | ; calendar |
| 412 | JSX文字 | Notifications |
| 414 | JSX文字 | notification provider requested |
| 419 | JSX文字 | Device APIs |
| 420 | JSX文字 | device requested |
| 434 | 属性 title | Opportunity reminders stay deterministic |
| 440 | JSX文字 | Scan this first: the capability ranks opportunity reminders from local relationship evidence, current goals, dormancy windows, and suggested contact reasons. No predictive provider or background miner runs. |
| 444 | 属性 aria-label | Opportunity reminder analytics operator checkpoint |
| 449 | JSX文字 | State |
| 455 | JSX文字 | High-priority opportunities |
| 456 | JSX文字 | reminders |
| 459 | JSX文字 | Dormant high-value contacts |
| 460 | JSX文字 | contacts |
| 463 | JSX文字 | Recompute output |
| 464 | JSX文字 | opportunities generated |
| 484 | 属性 title | Harness-visible states |
| 485 | 属性 aria-label | Opportunity reminder analytics state matrix |
| 490 | JSX文字 | Success state |
| 492 | JSX文字 | Success: |
| 492 | JSX文字 | opportunities and |
| 493 | JSX文字 | suggested reasons |
| 497 | JSX文字 | Empty state |
| 498 | JSX文字 | Empty: |
| 501 | JSX文字 | Pending state |
| 502 | JSX文字 | Pending: |
| 505 | JSX文字 | Failure state |
| 507 | JSX文字 | Failure: controlled error |
| 512 | JSX文字 | Empty and pending states stay successful envelopes; controlled failures use a service-unavailable envelope. |
| 527 | 属性 title | Exercise API states from this page |
| 532 | JSX文字 | Use these controls while checking the mock route. GET opens a JSON envelope; POST submits to the recompute boundary. |
| 535 | 属性 aria-label | Opportunity reminder analytics scenario exercise controls |
| 563 | JSX文字 | These controls only hit the mock API envelopes documented for this sprint. They do not start notifications, providers, analytics jobs, or background mining. |
| 633 | JSX文字 | Developer capability runtime |
| 634 | JSX文字 | Opportunity reminder analytics mock |
| 636 | JSX文字 | The deterministic opportunity reminder analytics fixtures did not load, so this dev surface stopped inside a controlled local state. |
| 655 | JSX文字 | Developer capability runtime |
| 656 | JSX文字 | Opportunity reminder analytics mock |
| 658 | JSX文字 | Dev-only surface for verifying the opportunity reminder analytics boundary. The page reads the mock service for success, empty, pending, and failure states before predictive scoring or live background opportunity mining exists. |
| 670 | 属性 aria-label | Opportunity reminder analytics capability details |
| 674 | 属性 title | High-priority opportunities |
| 685 | 属性 title | Provider boundaries |
| 690 | JSX文字 | Opportunity reminders stay local until the documented provider switch and replacement tests are added. |
| 696 | 属性 aria-label | Opportunity reminder analytics relationship details |
| 700 | 属性 title | Dormant high-value contacts |
| 709 | 属性 title | Current goal matching |
| 719 | 属性 title | Suggested contact reasons |
| 728 | 属性 title | Rule-based recompute output |
| 734 | JSX文字 | Evaluated contacts |
| 738 | JSX文字 | Changed opportunities |
| 744 | JSX文字 | Next action |
| 759 | 属性 title | Declared probes |
| 760 | 属性 aria-label | Opportunity reminder analytics API probe details |
| 768 | JSX文字 | returns |
| 776 | 属性 title | Replacement notes |
| 782 | JSX文字 | Handoff doc |
| 788 | JSX文字 | Switch mechanism |
| 790 | JSX文字 | ORBIT_OPPORTUNITY_REMINDER_ANALYTICS_PROVIDER |
| 791 | JSX文字 | remains documented before live opportunity analytics providers are wired. |

## repos/orbits/features/events/attendee-roster/debug-view.tsx

源码：[debug-view.tsx](</Users/li/work/orbit/repos/orbits/features/events/attendee-roster/debug-view.tsx>)

静态来源入口：`/dev/capabilities/[slug]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 449 | EventAttendeeRosterMockDemo | header |  | workbench-header |
| 451 | EventAttendeeRosterMockDemo | h1 | Event attendee roster mock |  |
| 466 | EventAttendeeRosterMockDemo | section | Event attendee roster states | workbench-grid |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 331 | form-submit-boundary/form · RosterFilterPanel | Mock event attendee roster import form |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 338 | field/input · RosterFilterPanel | Event id |  | {"disabled":"true","renderGateProps":[],"conditions":[]} |
| 341 | field/select · RosterFilterPanel | All attendee tags Climate operator Known contact Storage pilot |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 348 | button/button · RosterFilterPanel | Stage recommendation pool |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 372 | form-submit-boundary/form · ApiProbeActions | Run event attendee roster API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 377 | button/button · ApiProbeActions | Run roster probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 381 | form-submit-boundary/form · ApiProbeActions | Run event attendee roster import API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 386 | button/button · ApiProbeActions | Run import probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 390 | form-submit-boundary/form · ApiProbeActions | Run empty event attendee roster API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 395 | button/button · ApiProbeActions | Run empty probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 399 | form-submit-boundary/form · ApiProbeActions | Run pending event attendee roster API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 404 | button/button · ApiProbeActions | Run pending probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 408 | form-submit-boundary/form · ApiProbeActions | Run controlled failure event attendee roster API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 413 | button/button · ApiProbeActions | Run failure probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 84 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/events/demo-event-1/attendees" |
| 91 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/events/demo-event-1/attendees/import" |
| 99 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/events/demo-event-1/attendees/import?scenario=empty" |
| 107 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/events/demo-event-1/attendees/import?scenario=pending" |
| 115 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/events/demo-event-1/attendees/import?scenario=failure" |
| 332 | RosterFilterPanel | 路径常量 | 见调用/handler | "/api/events/demo-event-1/attendees/import" |
| 373 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/events/demo-event-1/attendees" |
| 382 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/events/demo-event-1/attendees/import" |
| 391 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/events/demo-event-1/attendees/import?scenario=empty" |
| 400 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/events/demo-event-1/attendees/import?scenario=pending" |
| 409 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/events/demo-event-1/attendees/import?scenario=failure" |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 83 | 文案/数据常量 label | "Read attendee roster" |
| 90 | 文案/数据常量 label | "Import eligible attendees" |
| 97 | 文案/数据常量 label | "Empty roster import" |
| 105 | 文案/数据常量 label | "Pending roster access" |
| 113 | 文案/数据常量 label | "Controlled failure" |
| 132 | 属性 aria-label | Event attendee roster evidence |
| 146 | 属性 aria-label | Attendee tags |
| 167 | JSX文字 | at |
| 190 | JSX文字 | from |
| 224 | 属性 aria-label | Mock-only event attendee roster execution checks |
| 229 | JSX文字 | Organizer feed |
| 235 | JSX文字 | Live database writes |
| 241 | JSX文字 | Model calls |
| 247 | JSX文字 | Notifications |
| 271 | 属性 title | Ready for verifier review |
| 277 | JSX文字 | Scan this first: the roster exposes attendee tags, known-contact markers, and an eligible recommendation pool while mock execution flags keep external work false. |
| 281 | 属性 aria-label | Event attendee roster operator checkpoint |
| 286 | JSX文字 | Event |
| 292 | JSX文字 | Attendee tags |
| 296 | JSX文字 | Known contacts |
| 297 | JSX文字 | roster row has a known-contact marker. |
| 300 | JSX文字 | Eligible recommendation pool |
| 302 | JSX文字 | candidates staged in |
| 307 | JSX文字 | Mock execution |
| 309 | JSX文字 | organizer feed |
| 309 | JSX文字 | ; database writes |
| 321 | 属性 title | Filter the local roster |
| 327 | JSX文字 | This form posts to the route handler that uses the event attendee roster mock service. It filters local rows and stages eligible recommendation candidates without touching organizer systems. |
| 331 | 属性 aria-label | Mock event attendee roster import form |
| 337 | 属性 label | Event id |
| 340 | 属性 label | Attendee tag |
| 342 | JSX文字 | All attendee tags |
| 343 | JSX文字 | Climate operator |
| 344 | JSX文字 | Known contact |
| 345 | JSX文字 | Storage pilot |
| 349 | JSX文字 | Stage recommendation pool |
| 352 | 属性 aria-label | Event attendee roster guardrails |
| 353 | JSX文字 | fixture roster |
| 354 | JSX文字 | privacy-gated access |
| 355 | JSX文字 | review before action |
| 363 | 属性 aria-label | Event attendee roster API probe actions |
| 368 | JSX文字 | These probes exercise roster read, import, empty, pending, and controlled failure paths inside the event attendee roster mock boundary. |
| 372 | 属性 aria-label | Run event attendee roster API probe |
| 378 | JSX文字 | Run roster probe |
| 381 | 属性 aria-label | Run event attendee roster import API probe |
| 387 | JSX文字 | Run import probe |
| 390 | 属性 aria-label | Run empty event attendee roster API probe |
| 396 | JSX文字 | Run empty probe |
| 399 | 属性 aria-label | Run pending event attendee roster API probe |
| 405 | JSX文字 | Run pending probe |
| 408 | 属性 aria-label | Run controlled failure event attendee roster API probe |
| 414 | JSX文字 | Run failure probe |
| 450 | JSX文字 | Developer capability runtime |
| 451 | JSX文字 | Event attendee roster mock |
| 453 | JSX文字 | Mock-first boundary for reading privacy-approved event attendee rosters, tagging attendees, marking known contacts, and staging eligible recommendation candidates before live organizer access exists. |
| 466 | 属性 aria-label | Event attendee roster states |
| 470 | 属性 title | Success state |
| 480 | JSX文字 | Attendees |
| 481 | JSX文字 | roster rows. |
| 484 | JSX文字 | Eligible recommendation pool |
| 486 | JSX文字 | mock candidates. |
| 498 | 属性 title | Empty state |
| 504 | JSX文字 | Attendees |
| 505 | JSX文字 | No attendees are available for review. |
| 508 | JSX文字 | Recommendations |
| 509 | JSX文字 | No recommendation candidates are staged. |
| 519 | 属性 title | Pending state |
| 525 | JSX文字 | Roster access |
| 531 | JSX文字 | Next action |
| 542 | 属性 title | Failure state |
| 547 | JSX文字 | Error code |
| 553 | JSX文字 | Message |
| 557 | JSX文字 | Recovery |
| 567 | 属性 title | Tags explain why each row matters |
| 574 | JSX文字 | Tags come from deterministic roster rules so product pages can later show context before suggesting a follow-up action. |
| 583 | 属性 title | Known contacts stay out of duplicate recommendations |
| 593 | JSX文字 | The mock sets organizer feed, privacy roster access, database, model, calendar, email, and notification execution flags to false. |
| 605 | 属性 title | Event attendee roster routes use shared envelopes |
| 610 | JSX文字 | The declared probes cover attendee roster read and roster import routes. Empty and controlled failure probes document non-success states without leaving the mock boundary. |
| 616 | JSX文字 | Failure mapping |
| 624 | JSX文字 | maps to a shared failure envelope. |
| 629 | 属性 aria-label | Event attendee roster API probes |
| 641 | JSX文字 | Expected status: |
| 648 | 属性 title | Replacement notes stay with the event roster capability |
| 654 | JSX文字 | Handoff doc |
| 660 | JSX文字 | Switch |
| 662 | JSX文字 | ORBIT_EVENT_ATTENDEE_ROSTER_PROVIDER |

## repos/orbits/features/events/encounter-note/debug-view.tsx

源码：[debug-view.tsx](</Users/li/work/orbit/repos/orbits/features/events/encounter-note/debug-view.tsx>)

静态来源入口：`/dev/capabilities/[slug]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 368 | StateComparison | h3 | row.label |  |
| 583 | EventEncounterNoteCaptureMockDemo | header |  | workbench-header |
| 585 | EventEncounterNoteCaptureMockDemo | h1 | Event encounter note capture mock |  |
| 604 | EventEncounterNoteCaptureMockDemo | section | Event encounter note states | workbench-grid |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 398 | form-submit-boundary/form · NoteCaptureForm | Mock event encounter note capture form |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 405 | field/input · NoteCaptureForm | Event id |  | {"disabled":"true","renderGateProps":[],"conditions":[]} |
| 408 | field/input · NoteCaptureForm | Contact |  | {"disabled":"true","renderGateProps":[],"conditions":[]} |
| 414 | field/textarea · NoteCaptureForm | Typed note |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 420 | button/button · NoteCaptureForm | Capture note |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 444 | form-submit-boundary/form · ApiProbeActions | Run event encounter note capture API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 449 | button/button · ApiProbeActions | Run capture probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 453 | form-submit-boundary/form · ApiProbeActions | Run event encounter evidence API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 458 | button/button · ApiProbeActions | Run evidence probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 462 | form-submit-boundary/form · ApiProbeActions | Run empty event encounter evidence API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 467 | button/button · ApiProbeActions | Run evidence empty |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 471 | form-submit-boundary/form · ApiProbeActions | Run pending event encounter evidence API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 476 | button/button · ApiProbeActions | Run evidence pending |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 480 | form-submit-boundary/form · ApiProbeActions | Run controlled failure event encounter evidence API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 485 | button/button · ApiProbeActions | Run evidence failure |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 489 | form-submit-boundary/form · ApiProbeActions | Run empty event encounter note API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 494 | button/button · ApiProbeActions | Run empty probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
