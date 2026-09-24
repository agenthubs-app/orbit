# 06-operations：源码明细

证据级别：当前工作区源码。此表列出符号级静态可达实现，不宣称每项都在某个角色/状态实际显示。按钮按 JSX 实现记录；数组 map 可生成多项按钮，条件分支互斥，不能把实现数当 DOM 按钮数。

调用表按所属函数提供 HTTP 路径/方法证据；与按钮 handler 是否连通应结合 handler 源码核对。仅同一文件出现的 API 不等于该按钮调用它。路径常量不是一次额外请求。跨文件、动态路径和 callback 不强行配对。

文案包含原有中文/英文/日文及动态表达式。表格中的长表达式节选有标记；完整内容在对应源码。布局表只证明 HTML/ARIA 分区，不证明实际视觉位置。全局 shell 与 layout 另见 01、02。开发页共享组件的来源入口会标为 /dev，不算客户页面。

## repos/orbits/app/(app)/app/events/[id]/analytics/event-analytics-route.tsx

源码：[event-analytics-route.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/events/[id]/analytics/event-analytics-route.tsx>)

静态来源入口：`/app/events/[id]/analytics`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 108 | EventAnalyticsRoute | main | canSwitchViews ? ( &lt;nav aria-label="活动报告视图" data-event-analytics-view-switch style={{ display: "flex", flexWrap: "wrap", gap: 8 }} &gt; &lt;button aria-pressed={activeView === "organizer_aggregate"} className={activeView === "organizer_aggregate" ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"} data-event-analytics-view= …（完整表达式见源码） |  |
| 109 | EventAnalyticsRoute | header |  |  |
| 112 | EventAnalyticsRoute | h1 | 活动数据报告 |  |
| 119 | EventAnalyticsRoute | nav | 活动报告视图 |  |

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 37 | [views, setViews] = useState&lt;AnalyticsViews&gt;({ attendee_report: null, organizer_aggregate: null, }) |
| 41 | [activeView, setActiveView] = useState&lt;AnalyticsViewKind \| null&gt;(null) |
| 42 | [error, setError] = useState&lt;string \| null&gt;(null) |
| 43 | [requestVersion, setRequestVersion] = useState(0) |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 114 | link/a · EventAnalyticsRoute | 返回活动详情 | `/app/events/${encodedEventId}` | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 124 | button/button · EventAnalyticsRoute | 组织者汇总 | onclick: () =&gt; setActiveView("organizer_aggregate") | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 133 | button/button · EventAnalyticsRoute | 我的报告 | onclick: () =&gt; setActiveView("attendee_report") | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 151 | button/button · EventAnalyticsRoute | 重试 | onclick: () =&gt; setRequestVersion((version) =&gt; version + 1) | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 54 | load | 调用 | GET/由封装决定 | `/api/events/${encodedEventId}/analytics/aggregate` |
| 54 | load | 路径常量 | 见调用/handler | `/api/events/${encodedEventId}/analytics/aggregate` |
| 57 | load | 调用 | GET/由封装决定 | `/api/events/${encodedEventId}/analytics/attendee` |
| 57 | load | 路径常量 | 见调用/handler | `/api/events/${encodedEventId}/analytics/attendee` |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 111 | JSX文字 | EVENT ANALYTICS |
| 112 | JSX文字 | 活动数据报告 |
| 115 | JSX文字 | 返回活动详情 |
| 119 | 属性 aria-label | 活动报告视图 |
| 131 | JSX文字 | 组织者汇总 |
| 140 | JSX文字 | 我的报告 |
| 156 | JSX文字 | 重试 |
| 162 | JSX文字 | 正在读取活动证据… |

## repos/orbits/app/(app)/app/events/[id]/operations/admission/event-admission-policy-panel.tsx

源码：[event-admission-policy-panel.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/events/[id]/operations/admission/event-admission-policy-panel.tsx>)

静态来源入口：`/app/events/[id]/operations/admission`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 242 | EventAdmissionPolicyPanel | section | 报名政策 | card-flat |
| 248 | EventAdmissionPolicyPanel | header |  |  |
| 251 | EventAdmissionPolicyPanel | h2 | 报名政策 |  |

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 174 | [view, setView] = useState&lt;AdmissionPolicyReadView \| null&gt;(null) |
| 175 | [draft, setDraft] = useState&lt;PolicyDraft&gt;(emptyDraft) |
| 176 | [loading, setLoading] = useState(true) |
| 177 | [error, setError] = useState&lt;string \| null&gt;(null) |
| 178 | [saveState, setSaveState] = useState&lt;PolicySaveState&gt;("idle") |
| 179 | [notice, setNotice] = useState&lt;string \| null&gt;(null) |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 263 | button/button · EventAdmissionPolicyPanel | 重试读取 | onclick: () =&gt; void loadPolicy() | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 282 | form-submit-boundary/form · EventAdmissionPolicyPanel | 录取方式 人工审核 即时录取 容量（留空表示不设上限） 启用候补名单 报名开放时间 报名截止时间 画像编辑截止时间 正在保存… / 保存报名政策 恢复当前版本 | onsubmit: (event) =&gt; void savePolicy(event) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 285 | field/select · EventAdmissionPolicyPanel | 人工审核 即时录取 | onchange: (event) =&gt; setDraft((current) =&gt; ({ ...current, admissionMode: event.target.value as EventAdmissionMode })) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 292 | field/input · EventAdmissionPolicyPanel | 容量（留空表示不设上限） | onchange: (event) =&gt; setDraft((current) =&gt; ({ ...current, capacity: event.target.value })) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 295 | field/input · EventAdmissionPolicyPanel | 启用候补名单 | onchange: (event) =&gt; setDraft((current) =&gt; ({ ...current, waitlistEnabled: event.target.checked })) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 300 | field/input · EventAdmissionPolicyPanel | 报名开放时间 | onchange: (event) =&gt; setDraft((current) =&gt; ({ ...current, registrationOpensAt: event.target.value })) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 304 | field/input · EventAdmissionPolicyPanel | 报名截止时间 | onchange: (event) =&gt; setDraft((current) =&gt; ({ ...current, registrationClosesAt: event.target.value })) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 308 | field/input · EventAdmissionPolicyPanel | 画像编辑截止时间 | onchange: (event) =&gt; setDraft((current) =&gt; ({ ...current, profileEditDeadlineAt: event.target.value })) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 311 | button/button · EventAdmissionPolicyPanel | 正在保存… / 保存报名政策 |  | {"disabled":"saveState === \"saving\"","renderGateProps":[],"conditions":[]} |
| 314 | button/button · EventAdmissionPolicyPanel | 恢复当前版本 | onclick: () =&gt; void loadPolicy() | {"disabled":"saveState === \"saving\"","renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 40 | policyUrl | 路径常量 | 见调用/handler | `/api/events/${encodeURIComponent(eventId)}/admission/policy` |
| 44 | requestJson | 调用 | GET/由封装决定 | url |
| 184 | EventAdmissionPolicyPanel | 调用 | GET/由封装决定 | policyUrl(eventId) |
| 217 | savePolicy | 调用 | PUT | policyUrl(eventId) |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 150 | JSX文字 | 当前活动尚未配置报名政策。 |
| 157 | JSX文字 | 录取方式 |
| 158 | JSX文字 | 容量 |
| 159 | JSX文字 | 候补名单 |
| 160 | JSX文字 | 报名开放 |
| 161 | JSX文字 | 报名截止 |
| 162 | JSX文字 | 画像编辑截止 |
| 242 | 属性 aria-label | 报名政策 |
| 250 | JSX文字 | ADMISSION · POLICY |
| 251 | JSX文字 | 报名政策 |
| 254 | JSX文字 | 当前版本 v |
| 258 | JSX文字 | 正在读取 canonical 报名政策… |
| 263 | JSX文字 | 重试读取 |
| 275 | JSX文字 | 当前政策为只读；只有 Event Core 中的当前活动负责人可以修改报名政策。 |
| 284 | JSX文字 | 录取方式 |
| 286 | JSX文字 | 人工审核 |
| 287 | JSX文字 | 即时录取 |
| 291 | JSX文字 | 容量（留空表示不设上限） |
| 296 | JSX文字 | 启用候补名单 |
| 299 | JSX文字 | 报名开放时间 |
| 303 | JSX文字 | 报名截止时间 |
| 307 | JSX文字 | 画像编辑截止时间 |
| 314 | JSX文字 | 恢复当前版本 |

## repos/orbits/app/(app)/app/events/[id]/operations/admission/event-admission-review-workspace.tsx

源码：[event-admission-review-workspace.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/events/[id]/operations/admission/event-admission-review-workspace.tsx>)

静态来源入口：`/app/events/[id]/operations/admission`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 132 | ApplicationDetail | section | 报名申请详情 | card-flat |
| 138 | ApplicationDetail | header |  |  |
| 140 | ApplicationDetail | h2 | application.profilePayload.displayName \|\| application.actorId |  |
| 151 | ApplicationDetail | section |  |  |
| 152 | ApplicationDetail | h3 | 完整报名画像 |  |
| 168 | ApplicationDetail | section | responses.length === 0 ? ( &lt;div className="card-flat" data-admission-adaptive-empty style={{ color: "var(--text-3)", padding: 12 }}&gt; 该申请没有自适应访谈快照；上方仍完整展示已提交画像字段。 &lt;/div&gt; ) : responses.map((response) =&gt; ( &lt;article className="card-flat" data-admission-adaptive-response={response.responseId} key={response.responseId} style …（完整表达式见源码） |  |
| 169 | ApplicationDetail | h3 | 自适应访谈记录 |  |
| 321 | EventAdmissionReviewWorkspace | main | notice ? &lt;p className="card-flat" role="status" style={{ color: "var(--success, #147d64)", padding: 12 }}&gt;{notice}&lt;/p&gt; : null error ? ( &lt;div className="card-flat" role="alert" style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "space-between", marginBottom: 14, padding: 12 }}&gt; &lt;span&gt;{error}&lt;/span&gt; &lt;bu …（完整表达式见源码） |  |
| 322 | EventAdmissionReviewWorkspace | header |  |  |
| 324 | EventAdmissionReviewWorkspace | h1 | 报名审核 | h-display |
| 332 | EventAdmissionReviewWorkspace | div/tablist | 报名审核视图 |  |
| 333 | EventAdmissionReviewWorkspace | button/tab | 待审核 | !processed ? "btn btn-primary" : "btn btn-ghost" |
| 334 | EventAdmissionReviewWorkspace | button/tab | 已处理 | processed ? "btn btn-primary" : "btn btn-ghost" |
| 346 | EventAdmissionReviewWorkspace | section | processed ? "已处理报名" : "待审核报名" | card-flat |
| 348 | EventAdmissionReviewWorkspace | h2 | processed ? "已处理" : "待审核" |  |
| 376 | EventAdmissionReviewWorkspace | aside | 正在读取完整画像与自适应访谈记录… | card-flat |
| 380 | EventAdmissionReviewWorkspace | aside | 从左侧选择申请，查看完整画像答案与自适应访谈记录。 | card-flat |
| 388 | EventAdmissionReviewWorkspace | details |  |  |
| 389 | EventAdmissionReviewWorkspace | summary | 报名政策与时间设置 | h-section |

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 225 | [view, setView] = useState&lt;ReviewView&gt;("pending") |
| 226 | [items, setItems] = useState&lt;readonly EventAdmissionReviewListItem[]&gt;([]) |
| 227 | [total, setTotal] = useState(0) |
| 228 | [nextCursor, setNextCursor] = useState&lt;string \| null&gt;(null) |
| 229 | [selected, setSelected] = useState&lt;EventAdmissionApplication \| null&gt;(null) |
| 230 | [loading, setLoading] = useState(true) |
| 231 | [loadingMore, setLoadingMore] = useState(false) |
| 232 | [openingActorId, setOpeningActorId] = useState&lt;string \| null&gt;(null) |
| 233 | [busy, setBusy] = useState(false) |
| 234 | [error, setError] = useState&lt;string \| null&gt;(null) |
| 235 | [notice, setNotice] = useState&lt;string \| null&gt;(null) |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 84 | button/button · ApplicantCard | {application.displayName \|\| application.actorId} {statusLabel[application.status]} {&lt;small style={{ color: "var(--text-3)", overflowWrap: "anywhere" }}&gt;{application.actorId}&lt;/small&gt;} / {null} 正在读取完整申请… / {`提交 ${timeLabel(application.submittedAt)} · v${application.applicationVersion}`} | onclick: onOpen | {"disabled":"opening","renderGateProps":[],"conditions":[]} |
| 187 | button/button · ApplicationDetail | 处理中… / 批准报名 | onclick: () =&gt; onDecision("approve") | {"disabled":"busy","renderGateProps":[],"conditions":[]} |
| 196 | button/button · ApplicationDetail | 拒绝报名 | onclick: () =&gt; onDecision("reject") | {"disabled":"busy","renderGateProps":[],"conditions":[]} |
| 327 | link/a · EventAdmissionReviewWorkspace | 运营活动中心 | /app/events/center | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 328 | link/a · EventAdmissionReviewWorkspace | 活动详情 | `/app/events/${encodeURIComponent(eventId)}` | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 333 | button/button · EventAdmissionReviewWorkspace | 待审核 | onclick: () =&gt; setView("pending") | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 334 | button/button · EventAdmissionReviewWorkspace | 已处理 | onclick: () =&gt; setView("processed") | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 341 | button/button · EventAdmissionReviewWorkspace | 重试 | onclick: () =&gt; void loadList() | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 358 | callback-control/ApplicantCard · EventAdmissionReviewWorkspace |  | onopen: () =&gt; void openApplication(application.actorId) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 367 | button/button · EventAdmissionReviewWorkspace | 正在加载… / 加载更多 | onclick: () =&gt; void loadList(true, nextCursor) | {"disabled":"loadingMore","renderGateProps":[],"conditions":[]} |
| 389 | disclosure/summary · EventAdmissionReviewWorkspace | 报名政策与时间设置 |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 46 | requestJson | 调用 | GET/由封装决定 | url |
| 224 | EventAdmissionReviewWorkspace | 路径常量 | 见调用/handler | `/api/events/${encodeURIComponent(eventId)}/admission/reviews` |
| 242 | EventAdmissionReviewWorkspace | 调用 | GET/由封装决定 | `${baseUrl}?${query}` |
| 276 | openApplication | 调用 | GET/由封装决定 | `${baseUrl}/${encodeURIComponent(actorId)}` |
| 293 | decide | 调用 | POST | `${baseUrl}/${encodeURIComponent(selected.actorId)}/decision` |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 132 | 属性 aria-label | 报名申请详情 |
| 139 | JSX文字 | APPLICATION · v |
| 147 | JSX文字 | 提交于 |
| 152 | JSX文字 | 完整报名画像 |
| 154 | JSX文字 | 审核工作区展示本次报名提交的全部八项画像答案，不按可见性做选择隐藏。 |
| 169 | JSX文字 | 自适应访谈记录 |
| 172 | JSX文字 | 该申请没有自适应访谈快照；上方仍完整展示已提交画像字段。 |
| 203 | JSX文字 | 拒绝报名 |
| 208 | JSX文字 | 该申请已处理。处理人 |
| 208 | JSX文字 | ，处理时间 |
| 323 | JSX文字 | EVENT ADMISSION · REVIEW |
| 324 | JSX文字 | 报名审核 |
| 327 | JSX文字 | 运营活动中心 |
| 328 | JSX文字 | 活动详情 |
| 332 | 属性 aria-label | 报名审核视图 |
| 333 | JSX文字 | 待审核 |
| 334 | JSX文字 | 已处理 |
| 341 | JSX文字 | 重试 |
| 346 | 属性 aria-label | processed ? "已处理报名" : "待审核报名" |
| 351 | JSX文字 | 正在读取真实报名记录… |
| 377 | JSX文字 | 正在读取完整画像与自适应访谈记录… |
| 381 | JSX文字 | 从左侧选择申请，查看完整画像答案与自适应访谈记录。 |
| 389 | JSX文字 | 报名政策与时间设置 |

## repos/orbits/app/(app)/app/events/[id]/operations/admission/page.tsx

源码：[page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/events/[id]/operations/admission/page.tsx>)

静态来源入口：`/app/events/[id]/operations/admission`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 32 | Boundary | main |  |  |
| 34 | Boundary | h1 | title | h-display |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 37 | link/a · Boundary | 重试 | `/app/events/${encodeURIComponent(eventId)}/operations/admission` | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 38 | link/a · Boundary | 返回运营活动中心 | /app/events/center | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 33 | JSX文字 | EVENT ADMISSION · REVIEW |
| 37 | JSX文字 | 重试 |
| 38 | JSX文字 | 返回运营活动中心 |
| 60 | 属性 title | 报名审核暂时不可用 |
| 70 | 属性 title | 活动尚未完成迁移 |
| 81 | 属性 title | 没有报名审核权限 |

## repos/orbits/app/(app)/app/events/[id]/operations/check-in/limited-check-in-roster.tsx

源码：[limited-check-in-roster.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/events/[id]/operations/check-in/limited-check-in-roster.tsx>)

静态来源入口：`/app/events/[id]/operations/check-in`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 202 | LimitedCheckInRoster | main | error ? ( &lt;div className="card" role="alert" style={{ borderColor: "var(--rose)", marginTop: 18, padding: 18 }}&gt; &lt;strong&gt;{error}&lt;/strong&gt; &lt;div style={{ marginTop: 12 }}&gt; &lt;button className="btn btn-ghost btn-sm" onClick={() =&gt; void loadRoster()} type="button"&gt; 重试 &lt;/button&gt; &lt;/div&gt; &lt;/div&gt; ) : null loading && !roster ? ( &lt; …（完整表达式见源码） |  |
| 233 | LimitedCheckInRoster | h1 | 活动签到台 | h-display |
| 267 | LimitedCheckInRoster | section | 正在加载签到名单 | card roster-skeleton |
| 288 | LimitedCheckInRoster | section | visibleParticipants.length === 0 ? ( &lt;p role="status" style={{ color: "var(--text-3)", fontSize: 14, marginTop: 16 }}&gt; 没有匹配的参会者。换一个姓名试试，或清空筛选。 &lt;/p&gt; ) : null | card |
| 291 | LimitedCheckInRoster | h2 | 参会者到场状态 | h-title |

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 87 | [roster, setRoster] = useState&lt;EventOperationsLimitedCheckInRoster \| null&gt;(null) |
| 88 | [query, setQuery] = useState("") |
| 89 | [segment, setSegment] = useState&lt;RosterSegment&gt;("all") |
| 90 | [loading, setLoading] = useState(true) |
| 91 | [loginRedirectPending, setLoginRedirectPending] = useState(false) |
| 92 | [error, setError] = useState&lt;string \| null&gt;(null) |
| 93 | [notice, setNotice] = useState&lt;string \| null&gt;(null) |
| 94 | [pendingParticipantIds, setPendingParticipantIds] = useState&lt; ReadonlySet&lt;string&gt; &gt;(new Set()) |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 67 | button/button · CheckInAction | participant.checkedIn ? `${participant.displayName} 已签到` : `将 ${participant.displayName} 标记为已签到` | onclick: () =&gt; onCheckIn(participant) | {"disabled":"participant.checkedIn \|\| busy","renderGateProps":[],"conditions":[]} |
| 209 | link/a · LimitedCheckInRoster | 返回活动 | `/app/events/${encodeURIComponent(eventId)}` | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 243 | button/button · LimitedCheckInRoster | 刷新中… / 刷新名单 | onclick: () =&gt; void loadRoster() | {"disabled":"loading","renderGateProps":[],"conditions":[]} |
| 259 | button/button · LimitedCheckInRoster | 重试 | onclick: () =&gt; void loadRoster() | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 303 | field/input · LimitedCheckInRoster | 按姓名搜索参会者 | oninput: (input) =&gt; setQuery(input.currentTarget.value) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 317 | button/button · LimitedCheckInRoster | {label} | onclick: () =&gt; setSegment(value) | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 97 | LimitedCheckInRoster | 路径常量 | 见调用/handler | `/api/events/${encodeURIComponent(eventId)}/operations/admin/check-ins` |
| 151 | LimitedCheckInRoster | 调用 | GET/由封装决定 | endpoint |
| 179 | markArrived | 调用 | POST | endpoint |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 67 | 属性 aria-label | participant.checkedIn ? `${participant.displayName} 已签到` : `将 ${participant.displayName} 标记为已签到` |
| 219 | JSX文字 | 返回活动 |
| 232 | JSX文字 | EVENT CHECK-IN · 现场签到 |
| 234 | JSX文字 | 活动签到台 |
| 237 | JSX文字 | 逐位确认参会者到场；签到时间以服务器首次记录为准。 |
| 260 | JSX文字 | 重试 |
| 267 | 属性 aria-label | 正在加载签到名单 |
| 289 | JSX文字 | LIMITED ROSTER · 最小权限名单 |
| 292 | JSX文字 | 参会者到场状态 |
| 295 | JSX文字 | 已签到 |
| 299 | JSX文字 | 本页面只显示签到所需的姓名、参会者编号和到场时间。 |
| 303 | 属性 placeholder | 输入姓名快速查找… |
| 303 | 属性 aria-label | 按姓名搜索参会者 |
| 311 | 属性 aria-label | 签到状态筛选 |
| 332 | JSX文字 | 没有匹配的参会者。换一个姓名试试，或清空筛选。 |
| 338 | JSX文字 | 活动签到名单 |
| 341 | JSX文字 | 参会者 |
| 342 | JSX文字 | 状态 |
| 343 | JSX文字 | 签到时间 |
| 344 | JSX文字 | 操作 |
| 355 | 属性 title | participant.participantId |
| 383 | 属性 title | participant.participantId |

## repos/orbits/app/(app)/app/events/[id]/operations/event-operations-admin-workspace.tsx

源码：[event-operations-admin-workspace.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/events/[id]/operations/event-operations-admin-workspace.tsx>)

静态来源入口：`/app/events/[id]/operations`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 182 | PublishedRoundPreview | h3 | title |  |
| 440 | EventOperationsAdminWorkspace | main | error ? &lt;div className="card" role="alert" style={{ borderColor: "var(--rose)", color: "var(--rose)", marginTop: 18, padding: 14 }}&gt;{error}&lt;/div&gt; : null notice ? &lt;div className="card" role="status" style={{ color: "var(--accent)", marginTop: 18, padding: 14 }}&gt;{notice}&lt;/div&gt; : null loading ? &lt;div className="card" style …（完整表达式见源码） |  |
| 447 | EventOperationsAdminWorkspace | h1 | event.title | h-display |
| 482 | EventOperationsAdminWorkspace | section | [ ["已报名", workspace.metrics.participantCount], ["已签到", workspace.metrics.checkedIn], ["名片申请", workspace.metrics.contactRequests], ["已同意", workspace.metrics.acceptedContactRequests], ].map(([label, value]) =&gt; &lt;div className="card" key={label} style={{ padding: 18 }}&gt;&lt;div className="h-title"&gt;{value}&lt;/div&gt;&lt;div style={{ co …（完整表达式见源码） |  |
| 491 | EventOperationsAdminWorkspace | section | confirmingStart ? ( &lt;div className="card-flat" data-generation-start-confirm style={{ display: "grid", gap: 10, marginTop: 12, padding: 14 }}&gt; &lt;strong&gt;将为 {workspace.metrics.participantCount} 位已报名参会者生成推荐与两轮分桌&lt;/strong&gt; &lt;p style={{ color: "var(--text-2)", fontSize: 13, margin: 0 }}&gt;预计 8–12 分钟；失败的片段会自动重试。生成完成后由你预览并确认发布，不会自 …（完整表达式见源码） | card |
| 493 | EventOperationsAdminWorkspace | h2 | AI 生成与发布 | h-title |
| 542 | EventOperationsAdminWorkspace | section | workspace.publishedResult ? ( &lt;div style={{ display: "grid", gap: 18, gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", marginTop: 16 }}&gt; &lt;PublishedRoundPreview participantNames={participantNames} tables={workspace.publishedResult.grouping.roundOne} title="第一轮 · 互补分桌" /&gt; &lt;PublishedRoundPreview participantNames …（完整表达式见源码） | card |
| 544 | EventOperationsAdminWorkspace | h2 | 两轮分桌预览 | h-title |
| 558 | EventOperationsAdminWorkspace | section | timeline.length &gt; 0 ? ( &lt;div style={{ borderTop: "1px solid var(--border)", marginTop: 20, paddingTop: 18 }}&gt; &lt;div className="mono" style={{ color: "var(--text-3)", fontSize: 10 }}&gt;CONFIGURED TIMELINE · LIVE STATUS&lt;/div&gt; &lt;div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", m …（完整表达式见源码） | card |
| 560 | EventOperationsAdminWorkspace | h2 | 运营配置 | h-title |
| 588 | EventOperationsAdminWorkspace | details |  |  |
| 589 | EventOperationsAdminWorkspace | summary | 高级引擎参数（一般无需调整） |  |
| 622 | EventOperationsAdminWorkspace | section |  | card |
| 624 | EventOperationsAdminWorkspace | h2 | 展示或分享参会者签到链接 | h-title |
| 634 | EventOperationsAdminWorkspace | section |  | card |
| 636 | EventOperationsAdminWorkspace | h2 | 参会者与到场状态 | h-title |
| 647 | EventOperationsAdminWorkspace | section | workspace.contactRequests.length === 0 ? &lt;div&gt;尚无名片交换申请。&lt;/div&gt; : workspace.contactRequests.map((request) =&gt; &lt;div key={request.requestId} style={{ borderTop: "1px solid var(--border)", display: "grid", gap: 5, padding: "12px 0" }}&gt;&lt;strong&gt;{request.requesterParticipantId} → {request.targetParticipantId}&lt;/strong&gt;&lt;span&gt;{req …（完整表达式见源码） | card |
| 648 | EventOperationsAdminWorkspace | h2 | 名片交换审计 | h-title |

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 218 | [workspace, setWorkspace] = useState&lt;EventOperationsAdminWorkspace \| null&gt;(null) |
| 219 | [form, setForm] = useState&lt;ConfigurationForm&gt;(() =&gt; formFor(null, event)) |
| 220 | [loading, setLoading] = useState(true) |
| 221 | [busy, setBusy] = useState&lt;string \| null&gt;(null) |
| 222 | [error, setError] = useState&lt;string \| null&gt;(null) |
| 223 | [notice, setNotice] = useState&lt;string \| null&gt;(null) |
| 224 | [currentTimeMs, setCurrentTimeMs] = useState(() =&gt; Date.now()) |
| 225 | [confirmingStart, setConfirmingStart] = useState(false) |
| 228 | [autoRetries, setAutoRetries] = useState&lt;Record&lt;string, number&gt;&gt;({}) |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 441 | link/a · EventOperationsAdminWorkspace | 返回活动 | `/app/events/${encodeURIComponent(event.id)}` | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 452 | link/a · EventOperationsAdminWorkspace | 运营活动中心 | /app/events/center | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 455 | link/a · EventOperationsAdminWorkspace | 打开签到台 | operationsCheckInHref | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 458 | link/a · EventOperationsAdminWorkspace | 报名体验 | `/app/events/${encodeURIComponent(event.id)}/operations/experience` | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 461 | link/a · EventOperationsAdminWorkspace | 查看活动分析 | `/app/events/${encodeURIComponent(event.id)}/analytics` | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 465 | link/a · EventOperationsAdminWorkspace | 管理角色 | `/app/events/${encodeURIComponent(event.id)}/operations/roles` | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 469 | link/a · EventOperationsAdminWorkspace | 导出 CSV | `${baseUrl}/export` | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 496 | button/button · EventOperationsAdminWorkspace | 生成进行中… / 生成匹配 | onclick: () =&gt; setConfirmingStart(true) | {"disabled":"busy === \"start\" \|\| hasActiveGeneration","renderGateProps":[],"conditions":[]} |
| 505 | button/button · EventOperationsAdminWorkspace | 正在开始… / 开始生成 | onclick: startGeneration | {"disabled":"busy === \"start\"","renderGateProps":[],"conditions":[]} |
| 506 | button/button · EventOperationsAdminWorkspace | 取消 | onclick: () =&gt; setConfirmingStart(false) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 536 | button/button · EventOperationsAdminWorkspace | {generationActionLabel(generation)} | onclick: () =&gt; generationAction(generation) | {"disabled":"generation.status === \"published\" \|\| generation.status === \"queued\" \|\| generation.status === \"running\" \|\| busy?.startsWith(generation.generationId)","renderGateProps":[],"conditions":[]} |
| 566 | field/input · EventOperationsAdminWorkspace | {fieldLabels[field]} {field} | oninput: (input) =&gt; { const nextValue = input.currentTarget.value; setForm((value) =&gt; ({ ...value, [field]: nextValue })); } | {"disabled":"canonicalScheduleFields.includes(field as (typeof canonicalScheduleFields)[number])","renderGateProps":[],"conditions":[]} |
| 581 | field/input · EventOperationsAdminWorkspace | {fieldLabels[field]} {field} | oninput: (input) =&gt; { const nextValue = input.currentTarget.value; setForm((value) =&gt; ({ ...value, [field]: nextValue })); } | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 589 | disclosure/summary · EventOperationsAdminWorkspace | 高级引擎参数（一般无需调整） |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 594 | field/input · EventOperationsAdminWorkspace | {fieldLabels[field]} {field} | oninput: (input) =&gt; { const nextValue = input.currentTarget.value; setForm((value) =&gt; ({ ...value, [field]: nextValue })); } | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 602 | button/button · EventOperationsAdminWorkspace | 保存中… / 保存配置 | onclick: saveConfiguration | {"disabled":"busy === \"configuration\"","renderGateProps":[],"conditions":[]} |
| 627 | link/a · EventOperationsAdminWorkspace | 打开签到页 | checkInHref | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 628 | button/button · EventOperationsAdminWorkspace | 复制链接 | onclick: copyCheckInLink | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 642 | button/button · EventOperationsAdminWorkspace | 记录中… / 标记到场 / 签到未开放 | onclick: () =&gt; markParticipantArrived(participant.participantId) | {"disabled":"!checkInOpen \|\| busy !== null","renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 143 | requestJson | 调用 | GET/由封装决定 | url |
| 217 | EventOperationsAdminWorkspace | 路径常量 | 见调用/handler | `/api/events/${encodeURIComponent(event.id)}/operations/admin` |
| 233 | EventOperationsAdminWorkspace | 调用 | GET/由封装决定 | baseUrl |
| 286 | saveConfiguration | 调用 | PUT | baseUrl |
| 305 | startGeneration | 调用 | POST | `${baseUrl}/generations` |
| 331 | EventOperationsAdminWorkspace | 调用 | POST | `${baseUrl}/generations/${encodeURIComponent(generationId)}/retry` |
| 352 | generationAction | 调用 | POST | `${baseUrl}/generations/${encodeURIComponent(generation.generationId)}/${action}` |
| 382 | markParticipantArrived | 调用 | POST | `${baseUrl}/check-ins` |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 183 | JSX文字 | 尚无已发布的分桌。 |
| 187 | JSX文字 | 号桌 · |
| 188 | JSX文字 | 席 |
| 199 | JSX文字 | TABLE ICEBREAKERS |
| 426 | 文案/数据常量 label | "Profile edit deadline" |
| 427 | 文案/数据常量 label | "Registration cutoff" |
| 428 | 文案/数据常量 label | "Check-in opens" |
| 429 | 文案/数据常量 label | "Results available" |
| 430 | 文案/数据常量 label | "Event starts" |
| 431 | 文案/数据常量 label | "Round one starts" |
| 432 | 文案/数据常量 label | "Round two starts" |
| 433 | 文案/数据常量 label | "Event ends" |
| 442 | JSX文字 | 返回活动 |
| 446 | JSX文字 | ORGANIZER · EVENT OPERATIONS |
| 448 | JSX文字 | 配置时间门禁、查看真实报名、运行严格 AI 分片，并发布完整结果。 |
| 453 | JSX文字 | 运营活动中心 |
| 456 | JSX文字 | 打开签到台 |
| 459 | JSX文字 | 报名体验 |
| 462 | JSX文字 | 查看活动分析 |
| 466 | JSX文字 | 管理角色 |
| 470 | JSX文字 | 导出 CSV |
| 478 | JSX文字 | 正在读取运营状态… |
| 493 | JSX文字 | STRICT AI PIPELINE |
| 493 | JSX文字 | AI 生成与发布 |
| 502 | JSX文字 | 将为 |
| 502 | JSX文字 | 位已报名参会者生成推荐与两轮分桌 |
| 503 | JSX文字 | 预计 8–12 分钟；失败的片段会自动重试。生成完成后由你预览并确认发布，不会自动对参会者公开。 |
| 506 | JSX文字 | 取消 |
| 510 | JSX文字 | 所有任务完成并由你发布后，参会者才能看到生成结果；无效、缺失或超时的 AI 输出会保持失败状态，不会被替代内容掩盖。 |
| 512 | JSX文字 | 尚未创建任何生成。 |
| 516 | 属性 title | generation.generationId |
| 516 | JSX文字 | 快照 |
| 516 | JSX文字 | 位参会者 |
| 519 | JSX文字 | 已完成 · |
| 519 | JSX文字 | 失败 · |
| 533 | JSX文字 | 自动重试 |
| 533 | JSX文字 | 次后仍有片段未通过，需要你手动处理。 |
| 543 | JSX文字 | PUBLISHED SEATING PREVIEW |
| 544 | JSX文字 | 两轮分桌预览 |
| 545 | JSX文字 | 此预览只读取已原子发布的结果：真实桌号、座位、话题、桌级归因与桌级破冰问题。 |
| 548 | 属性 title | 第一轮 · 互补分桌 |
| 549 | 属性 title | 第二轮 · 话题桌 |
| 552 | JSX文字 | 尚无已发布的分桌结果；已完成的生成在主办方原子发布前不会出现在这里。 |
| 559 | JSX文字 | TIME GATES & SHARD POLICY |
| 560 | JSX文字 | 运营配置 |
| 561 | JSX文字 | 活动开始与结束时间锁定为主活动档期；其余规则均需主办方显式设定。 |
| 589 | JSX文字 | 高级引擎参数（一般无需调整） |
| 607 | JSX文字 | CONFIGURED TIMELINE · LIVE STATUS |
| 623 | JSX文字 | VENUE CHECK-IN ENTRY |
| 624 | JSX文字 | 展示或分享参会者签到链接 |
| 625 | JSX文字 | 这是真实的已报名参会者签到路由。没有经过验证的本地二维码编码器时不会生成二维码图片；请直接复制或投屏此链接。 |
| 627 | JSX文字 | 打开签到页 |
| 628 | JSX文字 | 复制链接 |
| 631 | JSX文字 | 签到窗口： |
| 635 | JSX文字 | REAL REGISTRATION DIRECTORY |
| 636 | JSX文字 | 参会者与到场状态 |
| 637 | JSX文字 | 人未到场 · 通过主办方专用接口逐一标记到场。 |
| 642 | JSX文字 | 已签到 |
| 648 | JSX文字 | CONSENT AUDIT |
| 648 | JSX文字 | 名片交换审计 |
| 649 | JSX文字 | 尚无名片交换申请。 |

## repos/orbits/app/(app)/app/events/[id]/operations/experience/event-experience-editor.tsx

源码：[event-experience-editor.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/events/[id]/operations/experience/event-experience-editor.tsx>)

静态来源入口：`/app/events/[id]/operations/experience`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 290 | EventExperienceEditor | main | error ? &lt;div className="card" role="alert" style={{ borderColor: "var(--rose)", color: "var(--rose)", marginTop: 18, padding: 14 }}&gt;{error}&lt;/div&gt; : null notice ? &lt;div className="card" role="status" style={{ color: "var(--accent)", marginTop: 18, padding: 14 }}&gt;{notice}&lt;/div&gt; : null loading ? &lt;div className="card" style …（完整表达式见源码） |  |
| 297 | EventExperienceEditor | h1 | 报名体验配置 | h-display |
| 310 | EventExperienceEditor | section | frozen ? &lt;div style={{ color: "var(--amber)", fontSize: 12, marginTop: 12 }}&gt;已到画像编辑截止时间；仍可调整展示字段并保存/发布，但题集轨道、题目和选项必须与当前已发布版本一致。&lt;/div&gt; : null preview ? &lt;div className="card-flat" style={{ borderLeft: `4px solid ${preview.configuration.accentColor ?? "var(--border)"}`, marginTop: 14, padding: 12 }}&gt;&lt;div className="eyebro …（完整表达式见源码） | card |
| 330 | EventExperienceEditor | h2 | 报名问题 · questionCountLabel | h-title |

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 122 | [snapshot, setSnapshot] = useState&lt;EventExperienceSnapshot \| null&gt;(null) |
| 123 | [configuration, setConfiguration] = useState&lt;EventExperienceConfiguration&gt;(initialConfiguration) |
| 124 | [preview, setPreview] = useState&lt;EventExperienceVersion \| null&gt;(null) |
| 125 | [loading, setLoading] = useState(true) |
| 126 | [busy, setBusy] = useState&lt;string \| null&gt;(null) |
| 127 | [error, setError] = useState&lt;string \| null&gt;(null) |
| 128 | [notice, setNotice] = useState&lt;string \| null&gt;(null) |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 291 | link/a · EventExperienceEditor | ← 返回活动运营台 | `/app/events/${encodeURIComponent(eventId)}/operations` | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 314 | field/textarea · EventExperienceEditor | 告诉参与者这场活动适合谁，以及会发生什么。 | onchange: (event) =&gt; setConfiguration((current) =&gt; ({ ...current, introduction: event.target.value \|\| null })) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 318 | field/input · EventExperienceEditor | #6E56CF | onchange: (event) =&gt; setConfiguration((current) =&gt; ({ ...current, accentColor: event.target.value \|\| null })) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 322 | field/select · EventExperienceEditor | V1 · 两题必答兼容 V2 · 0–4 题可选 | onchange: (event) =&gt; updateTrack(event.target.value as EventExperienceQuestionTrack) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 331 | button/button · EventExperienceEditor | + 添加固定维度 | onclick: addQuestion | {"disabled":"configuration.questionSet.questions.length &gt;= 4","renderGateProps":[],"conditions":[]} |
| 341 | button/button · EventExperienceEditor | 移除 | onclick: () =&gt; removeQuestion(index) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 346 | field/input · EventExperienceEditor | 题目 | onchange: (event) =&gt; updateQuestion(index, { prompt: event.target.value }) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 350 | field/input · EventExperienceEditor | 选项（用逗号分隔，2–5 项） | onchange: (event) =&gt; updateQuestion(index, { options: event.target.value.split(",").map((item) =&gt; item.trim()).filter(Boolean) }) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 356 | button/button · EventExperienceEditor | 保存中… / 保存草稿 | onclick: saveDraft | {"disabled":"busy !== null","renderGateProps":[],"conditions":[]} |
| 357 | button/button · EventExperienceEditor | 预览中… / 预览（零写入） | onclick: previewDraft | {"disabled":"busy !== null","renderGateProps":[],"conditions":[]} |
| 358 | button/button · EventExperienceEditor | 发布中… / 发布题集 | onclick: publishDraft | {"disabled":"busy !== null \|\| !snapshot?.draft","renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 90 | requestJson | 调用 | GET/由封装决定 | url |
| 121 | EventExperienceEditor | 路径常量 | 见调用/handler | `/api/events/${encodeURIComponent(eventId)}/experience` |
| 133 | EventExperienceEditor | 调用 | GET/由封装决定 | baseUrl |
| 217 | saveDraft | 调用 | PUT | baseUrl |
| 247 | previewDraft | 调用 | POST | `${baseUrl}/preview` |
| 265 | publishDraft | 调用 | POST | `${baseUrl}/publish` |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 292 | JSX文字 | ← 返回活动运营台 |
| 296 | JSX文字 | ORGANIZER · EVENT EXPERIENCE |
| 297 | JSX文字 | 报名体验配置 |
| 298 | JSX文字 | 只调整有限展示字段与题目；发布后题集不可原地修改。 |
| 301 | JSX文字 | 草稿 revision： |
| 302 | JSX文字 | 已发布版本： |
| 303 | JSX文字 | 画像编辑截止： |
| 308 | JSX文字 | 正在读取活动体验… |
| 313 | JSX文字 | 活动简介（最多 1000 字） |
| 314 | 属性 placeholder | 告诉参与者这场活动适合谁，以及会发生什么。 |
| 317 | JSX文字 | 强调色（#RRGGBB） |
| 318 | 属性 placeholder | #6E56CF |
| 321 | JSX文字 | 题集轨道 |
| 323 | JSX文字 | V1 · 两题必答兼容 |
| 324 | JSX文字 | V2 · 0–4 题可选 |
| 328 | JSX文字 | 活动封面继续由活动本身的可信内容提供；本配置暂不接受 cover assetId 或外部 URL。 |
| 330 | JSX文字 | FIXED PROFILE MAPPING |
| 330 | JSX文字 | 报名问题 · |
| 331 | JSX文字 | + 添加固定维度 |
| 333 | JSX文字 | 每道题只能写入 Orbit 已有的 participant profile 字段；V1 始终保留「想认识谁 / 能提供什么」两题。 |
| 341 | JSX文字 | 移除 |
| 345 | JSX文字 | 题目 |
| 349 | JSX文字 | 选项（用逗号分隔，2–5 项） |
| 360 | JSX文字 | 已到画像编辑截止时间；仍可调整展示字段并保存/发布，但题集轨道、题目和选项必须与当前已发布版本一致。 |
| 361 | JSX文字 | EPHEMERAL PREVIEW |
| 361 | JSX文字 | hash |
| 361 | JSX文字 | · 不会写入数据库 |
| 361 | JSX文字 | accent |

## repos/orbits/app/(app)/app/events/[id]/operations/page.tsx

源码：[page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/events/[id]/operations/page.tsx>)

静态来源入口：`/app/events/[id]/operations`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 79 | AppEventOperationsAdminPage | main |  |  |
| 81 | AppEventOperationsAdminPage | h1 | Event operations access required | h-display |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 83 | link/a · AppEventOperationsAdminPage | Return to events | /app/events | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 80 | JSX文字 | EVENT OPERATIONS |
| 81 | JSX文字 | Event operations access required |
| 82 | JSX文字 | This workspace requires an active per-event operations assignment. |
| 83 | JSX文字 | Return to events |

## repos/orbits/app/(app)/app/events/[id]/operations/roles/event-role-management-workspace.tsx

源码：[event-role-management-workspace.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/events/[id]/operations/roles/event-role-management-workspace.tsx>)

静态来源入口：`/app/events/[id]/operations/roles`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 319 | EventRoleManagementWorkspace | main | error ? &lt;div className="card" role="alert" style={{ borderColor: "var(--rose)", color: "var(--rose)", marginTop: 18, padding: 14 }}&gt;{error}&lt;/div&gt; : null notice ? &lt;div className="card" role="status" style={{ color: "var(--accent)", marginTop: 18, padding: 14 }}&gt;{notice}&lt;/div&gt; : null loading ? &lt;div className="card" role= …（完整表达式见源码） |  |
| 326 | EventRoleManagementWorkspace | h1 | snapshot?.event.title ?? "活动角色管理" | h-display |
| 342 | EventRoleManagementWorkspace | section |  | card |
| 344 | EventRoleManagementWorkspace | h2 | 授予活动范围角色 | h-title |
| 393 | EventRoleManagementWorkspace | section |  | card |
| 395 | EventRoleManagementWorkspace | h2 | 当前活动角色 | h-title |

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 124 | [snapshot, setSnapshot] = useState&lt;RoleMembersPayload \| null&gt;(null) |
| 125 | [loading, setLoading] = useState(true) |
| 126 | [error, setError] = useState&lt;string \| null&gt;(null) |
| 127 | [notice, setNotice] = useState&lt;string \| null&gt;(null) |
| 128 | [busy, setBusy] = useState&lt;string \| null&gt;(null) |
| 129 | [newSubjectActorId, setNewSubjectActorId] = useState("") |
| 130 | [newRole, setNewRole] = useState&lt;DelegatedRole&gt;("operations") |
| 131 | [newReason, setNewReason] = useState("") |
| 132 | [memberEdits, setMemberEdits] = useState&lt;Record&lt;string, { reason: string; role: DelegatedRole }&gt;&gt;({}) |
| 137 | [participantOptions, setParticipantOptions] = useState&lt; readonly { actorId: string; label: string }[] \| null &gt;(null) |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 320 | link/a · EventRoleManagementWorkspace | 返回运营台 | `/app/events/${encodeURIComponent(eventId)}/operations` | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 331 | button/button · EventRoleManagementWorkspace | 刷新角色 | onclick: () =&gt; void load() | {"disabled":"loading \|\| busy !== null","renderGateProps":[],"conditions":[]} |
| 354 | field/select · EventRoleManagementWorkspace | ——手动输入账号 ID—— {participantOptions.map((option) =&gt; ( &lt;option key={option.actorId} value={option.actorId}&gt;{option.label}&lt;/option&gt; ))} | onchange: (input) =&gt; { if (input.target.value) setNewSubjectActorId(input.target.value); } | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 369 | field/input · EventRoleManagementWorkspace | actor:operations-01 | onchange: (input) =&gt; setNewSubjectActorId(input.target.value) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 376 | field/select · EventRoleManagementWorkspace | {ROLE_OPTIONS.map((option) =&gt; &lt;option key={option.value} value={option.value}&gt;{option.label}&lt;/option&gt;)} | onchange: (input) =&gt; setNewRole(roleFromValue(input.target.value)) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 382 | field/input · EventRoleManagementWorkspace | 例如：负责现场签到和嘉宾接待 | onchange: (input) =&gt; setNewReason(input.target.value) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 388 | button/button · EventRoleManagementWorkspace | 正在保存… / 授予角色 | onclick: () =&gt; void grantOrChange({ reason: newReason, role: newRole, subjectActorId: newSubjectActorId }) | {"disabled":"busy !== null","renderGateProps":[],"conditions":[]} |
| 421 | field/select · EventRoleManagementWorkspace | {ROLE_OPTIONS.map((option) =&gt; &lt;option key={option.value} value={option.value}&gt;{option.label}&lt;/option&gt;)} | onchange: (input) =&gt; setMemberEdits((current) =&gt; { const currentEdit = current[member.subjectActorId] ?? { reason: "", role: roleFromValue(member.role) }; return { ...current, [member.subjectActorId]: { ...currentEdit, role: roleFromValue(input.target.value), }, }; }) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 433 | field/input · EventRoleManagementWorkspace | 填写变更或撤销原因 | onchange: (input) =&gt; setMemberEdits((current) =&gt; { const currentEdit = current[member.subjectActorId] ?? { reason: "", role: roleFromValue(member.role) }; return { ...current, [member.subjectActorId]: { ...currentEdit, reason: input.target.value, }, }; }) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 443 | button/button · EventRoleManagementWorkspace | 更新角色 | onclick: () =&gt; void grantOrChange({ reason: edit!.reason, role: edit!.role, subjectActorId: member.subjectActorId }) | {"disabled":"busy !== null","renderGateProps":[],"conditions":[]} |
| 444 | button/button · EventRoleManagementWorkspace | 撤销 | onclick: () =&gt; void revoke(member) | {"disabled":"busy !== null","renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 101 | requestJson | 调用 | GET/由封装决定 | url |
| 123 | EventRoleManagementWorkspace | 路径常量 | 见调用/handler | `/api/events/${encodeURIComponent(eventId)}/access` |
| 145 | EventRoleManagementWorkspace | 调用 | GET/由封装决定 | `/api/events/${encodeURIComponent(eventId)}/operations/admin` |
| 146 | EventRoleManagementWorkspace | 路径常量 | 见调用/handler | `/api/events/${encodeURIComponent(eventId)}/operations/admin` |
| 184 | EventRoleManagementWorkspace | 调用 | GET/由封装决定 | `${baseUrl}/roles` |
| 216 | currentAssignment | 调用 | GET/由封装决定 | `${baseUrl}/assignments/${encodeURIComponent(subjectActorId)}` |
| 246 | grantOrChange | 调用 | PUT | `${baseUrl}/assignments/${encodeURIComponent(subjectActorId)}` |
| 295 | revoke | 调用 | DELETE | `${baseUrl}/assignments/${encodeURIComponent(member.subjectActorId)}` |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 75 | 文案/数据常量 description | "配置运营、受保护参会信息、现场流程与发布。" |
| 75 | 文案/数据常量 label | "运营" |
| 76 | 文案/数据常量 description | "仅受限签到名单与签到写入。" |
| 76 | 文案/数据常量 label | "签到" |
