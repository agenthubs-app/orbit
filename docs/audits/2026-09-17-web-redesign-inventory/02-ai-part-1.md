# 02-ai：源码明细

证据级别：当前工作区源码。此表列出符号级静态可达实现，不宣称每项都在某个角色/状态实际显示。按钮按 JSX 实现记录；数组 map 可生成多项按钮，条件分支互斥，不能把实现数当 DOM 按钮数。

调用表按所属函数提供 HTTP 路径/方法证据；与按钮 handler 是否连通应结合 handler 源码核对。仅同一文件出现的 API 不等于该按钮调用它。路径常量不是一次额外请求。跨文件、动态路径和 callback 不强行配对。

文案包含原有中文/英文/日文及动态表达式。表格中的长表达式节选有标记；完整内容在对应源码。布局表只证明 HTML/ARIA 分区，不证明实际视觉位置。全局 shell 与 layout 另见 01、02。开发页共享组件的来源入口会标为 /dev，不算客户页面。

## repos/orbits/app/(app)/app/agent/agent-action-status-card.tsx

源码：[agent-action-status-card.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/agent/agent-action-status-card.tsx>)

静态来源入口：`/app/agent`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 478 | AgentActionStatusCard | section | language === "zh" ? "本次 Agent 操作" : "Agent actions from this turn" |  |

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 281 | [actions, setActions] = useState&lt;AgentChatLinkedAction[]&gt;([]) |
| 282 | [runView, setRunView] = useState&lt;AgentChatRunView \| null&gt;(null) |
| 283 | [loading, setLoading] = useState(true) |
| 284 | [pendingActionId, setPendingActionId] = useState&lt;string \| null&gt;(null) |
| 285 | [error, setError] = useState&lt;string \| null&gt;(null) |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 572 | button/button · AgentActionStatusCard | 正在取消… / Canceling… / 取消本次请求 / Cancel this request | onclick: () =&gt; void cancelRun() | {"disabled":"pendingActionId === \"run:cancel\"","renderGateProps":[],"conditions":[]} |
| 589 | button/button · AgentActionStatusCard | 重新提交请求 / Retry request | onclick: () =&gt; void retryRequest() | {"disabled":"pendingActionId === \"run:retry-request\"","renderGateProps":[],"conditions":[]} |
| 655 | button/button · AgentActionStatusCard | 在 Today 查看 / Open in Today | onclick: () =&gt; navigate(`/today?entry=${encodeURIComponent(action.actionId)}`) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 665 | button/button · AgentActionStatusCard | 全部安排 / All arrangements | onclick: () =&gt; navigate( `/contacts/all-actions?entry=${encodeURIComponent(action.actionId)}`, ) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 677 | button/button · AgentActionStatusCard | 确认执行 / Confirm | onclick: () =&gt; void applyTransition(action, "confirm") | {"disabled":"pending","renderGateProps":[],"conditions":[]} |
| 694 | button/button · AgentActionStatusCard | 稍后处理 / Later | onclick: () =&gt; void applyTransition(action, "defer") | {"disabled":"pending","renderGateProps":[],"conditions":[]} |
| 704 | button/button · AgentActionStatusCard | 忽略 / Ignore | onclick: () =&gt; void applyTransition(action, "reject") | {"disabled":"pending","renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 293 | refresh | 调用 | GET/由封装决定 | `/api/ai/runs/${encodeURIComponent(runId)}` |
| 294 | refresh | 路径常量 | 见调用/handler | `/api/ai/runs/${encodeURIComponent(runId)}` |
| 344 | refreshExecutionStatus | 调用 | GET/由封装决定 | `/api/ai/runs/${encodeURIComponent(runId)}` |
| 345 | refreshExecutionStatus | 路径常量 | 见调用/handler | `/api/ai/runs/${encodeURIComponent(runId)}` |
| 377 | cancelRun | 调用 | POST | `/api/ai/runs/${encodeURIComponent(runId)}/transition` |
| 378 | cancelRun | 路径常量 | 见调用/handler | `/api/ai/runs/${encodeURIComponent(runId)}/transition` |
| 429 | applyTransition | 调用 | POST | `/api/agent/ledger/${encodeURIComponent(action.actionId)}/transition` |
| 430 | applyTransition | 路径常量 | 见调用/handler | `/api/agent/ledger/${encodeURIComponent(action.actionId)}/transition` |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 171 | 文案/数据常量 en | "Safety check" |
| 171 | 文案/数据常量 zh | "安全边界检查" |
| 172 | 文案/数据常量 en | "Plan" |
| 172 | 文案/数据常量 zh | "理解与规划" |
| 173 | 文案/数据常量 en | "Replan from evidence" |
| 173 | 文案/数据常量 zh | "根据证据继续规划" |
| 174 | 文案/数据常量 en | "Choose tools" |
| 174 | 文案/数据常量 zh | "选择可信工具" |
| 175 | 文案/数据常量 en | "Read context" |
| 175 | 文案/数据常量 zh | "读取关系上下文" |
| 177 | 文案/数据常量 en | "Read additional context" |
| 178 | 文案/数据常量 zh | "补充读取上下文" |
| 180 | 文案/数据常量 en | "Synthesize" |
| 180 | 文案/数据常量 zh | "综合证据" |
| 181 | 文案/数据常量 en | "Prepare response" |
| 181 | 文案/数据常量 zh | "生成答复" |
| 183 | 文案/数据常量 en | "Validate actions" |
| 184 | 文案/数据常量 zh | "校验操作方案" |
| 224 | 文案/数据常量 en | "Approved" |
| 224 | 文案/数据常量 zh | "已确认" |
| 225 | 文案/数据常量 en | "Needs confirmation" |
| 225 | 文案/数据常量 zh | "等待确认" |
| 226 | 文案/数据常量 en | "Canceled" |
| 226 | 文案/数据常量 zh | "已取消" |
| 227 | 文案/数据常量 en | "Completed" |
| 227 | 文案/数据常量 zh | "已完成" |
| 228 | 文案/数据常量 en | "Later" |
| 228 | 文案/数据常量 zh | "稍后处理" |
| 229 | 文案/数据常量 en | "Running" |
| 229 | 文案/数据常量 zh | "执行中" |
| 230 | 文案/数据常量 en | "Failed" |
| 230 | 文案/数据常量 zh | "执行失败" |
| 231 | 文案/数据常量 en | "Partially failed" |
| 231 | 文案/数据常量 zh | "部分失败" |
| 232 | 文案/数据常量 en | "Ignored" |
| 232 | 文案/数据常量 zh | "已忽略" |
| 233 | 文案/数据常量 en | "Undone" |
| 233 | 文案/数据常量 zh | "已撤销" |
| 234 | 文案/数据常量 en | "Checking" |
| 234 | 文案/数据常量 zh | "正在同步" |
| 258 | 文案/数据常量 en | "Save draft" |
| 258 | 文案/数据常量 zh | "保存草稿" |
| 259 | 文案/数据常量 en | "External action" |
| 259 | 文案/数据常量 zh | "外部操作" |
| 260 | 文案/数据常量 en | "Read only" |
| 260 | 文案/数据常量 zh | "只读" |
| 261 | 文案/数据常量 en | "Writes to Orbit" |
| 261 | 文案/数据常量 zh | "写入 Orbit" |
| 264 | 文案/数据常量 en | "Review required" |
| 265 | 文案/数据常量 zh | "需要复核" |
| 478 | 属性 aria-label | language === "zh" ? "本次 Agent 操作" : "Agent actions from this turn" |
| 513 | 属性 aria-label | language === "zh" ? `Agent 进度 ${runView.progress.percent}%` : `Agent progress ${runView.progress.percent}%` |

## repos/orbits/app/(app)/app/agent/agent-chat-history-organization.tsx

源码：[agent-chat-history-organization.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/agent/agent-chat-history-organization.tsx>)

静态来源入口：`/app/agent`

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 132 | [open, setOpen] = useState(false) |
| 133 | [newName, setNewName] = useState("") |
| 134 | [names, setNames] = useState&lt;Record&lt;string, string&gt;&gt;({}) |
| 135 | [pendingDeleteGroupId, setPendingDeleteGroupId] = useState&lt;string \| null&gt;(null) |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 139 | button/button · AgentChatHistoryOrganization | {tr("Groups", "分组")} | onclick: () =&gt; setOpen((value) =&gt; !value) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 143 | button/button · AgentChatHistoryOrganization | {tr("All conversations", "全部会话")} | onclick: () =&gt; onFilter(null) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 145 | field/input · AgentChatHistoryOrganization | tr(`Group name: ${group.name}`, `分组名称：${group.name}`) | onchange: (event) =&gt; setNames((current) =&gt; ({ ...current, [group.id]: event.target.value })) | {"disabled":"busy","renderGateProps":[],"conditions":[]} |
| 147 | button/button · AgentChatHistoryOrganization | {tr("Open", "打开")} | onclick: () =&gt; onFilter(group.id) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 148 | button/button · AgentChatHistoryOrganization | {tr("New", "新建")} | onclick: () =&gt; onNew(group.id) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 149 | button/button · AgentChatHistoryOrganization | {tr("Rename", "改名")} | onclick: () =&gt; onRename(group, names[group.id] ?? group.name) | {"disabled":"busy \|\| !(names[group.id] ?? group.name).trim()","renderGateProps":[],"conditions":[]} |
| 151 | button/button · AgentChatHistoryOrganization | {tr("Cancel", "取消")} | onclick: () =&gt; setPendingDeleteGroupId(null) | {"disabled":"busy","renderGateProps":[],"conditions":[]} |
| 152 | button/button · AgentChatHistoryOrganization | {tr("Confirm delete", "确认删组")} | onclick: () =&gt; { setPendingDeleteGroupId(null); onDelete(group); } | {"disabled":"busy","renderGateProps":[],"conditions":[]} |
| 153 | button/button · AgentChatHistoryOrganization | {tr("Delete", "删组")} | onclick: () =&gt; setPendingDeleteGroupId(group.id) | {"disabled":"busy","renderGateProps":[],"conditions":[]} |
| 157 | field/input · AgentChatHistoryOrganization | tr("New group name", "新分组名称") | onchange: (event) =&gt; setNewName(event.target.value) | {"disabled":"busy","renderGateProps":[],"conditions":[]} |
| 158 | button/button · AgentChatHistoryOrganization | {tr("Create", "创建")} | onclick: () =&gt; { onCreate(newName); setNewName(""); } | {"disabled":"busy \|\| !newName.trim()","renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 15 | (module / render callback) | 路径常量 | 见调用/handler | "/api/ai/conversations/sessions" |
| 16 | (module / render callback) | 路径常量 | 见调用/handler | "/api/ai/conversations/groups" |
| 41 | loadAgentChatGroups | 调用 | GET/由封装决定 | GROUP_PATH |
| 53 | patchAgentChatSessionOrganization | 调用 | PATCH | `${SESSION_PATH}/${encodeURIComponent(sessionId)}` |
| 74 | groupMutation | 调用 | GET/由封装决定 | path |
| 99 | deleteAgentChatGroup | 调用 | DELETE | `${GROUP_PATH}/${encodeURIComponent(groupId)}` |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 145 | 属性 aria-label | tr(`Group name: ${group.name}`, `分组名称：${group.name}`) |
| 157 | 属性 placeholder | tr("New group", "新分组") |
| 157 | 属性 aria-label | tr("New group name", "新分组名称") |

## repos/orbits/app/(app)/app/agent/agent-task-interaction-card.tsx

源码：[agent-task-interaction-card.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/agent/agent-task-interaction-card.tsx>)

静态来源入口：`/app/agent`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 26 | AgentTaskInteractionCard | section | status |  |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 42 | button/button · AgentTaskInteractionCard | `${english ? "Add task" : "加入待办"}：${interaction.title}` | onclick: () =&gt; onResolve("accept") | {"disabled":"busy","renderGateProps":[],"conditions":[]} |
| 45 | button/button · AgentTaskInteractionCard | `${english ? "Not now" : "暂不需要"}：${interaction.title}` | onclick: () =&gt; onResolve("dismiss") | {"disabled":"busy","renderGateProps":[],"conditions":[]} |
| 49 | link/a · AgentTaskInteractionCard | View task / 查看待办 | preserveHref(`/app/tasks/${encodeURIComponent(interaction.taskId)}`) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 50 | link/a · AgentTaskInteractionCard | All tasks / 全部待办 | preserveHref("/app/tasks") | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 26 | 属性 aria-label | status |
| 33 | JSX文字 | JST |
| 42 | 属性 aria-label | `${english ? "Add task" : "加入待办"}：${interaction.title}` |
| 45 | 属性 aria-label | `${english ? "Not now" : "暂不需要"}：${interaction.title}` |

## repos/orbits/app/(app)/app/agent/orbit-agent-dashboard.tsx

源码：[orbit-agent-dashboard.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/agent/orbit-agent-dashboard.tsx>)

静态来源入口：`/app/agent`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 207 | OrbitAgentDashboard | h1 | home.account.fullName | h-display |
| 228 | OrbitAgentDashboard | section | home.stats.people === 0 ? ( &lt;section data-orbit-agent-empty-account-demo style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", display: "grid", gap: 12, marginTop: 16, padding: 16, }} &gt; &lt;div&gt; &lt;b&gt;{t({ en: "Try the decision flow before importing", zh: "还没导入联系人，也可以先体验决策流程" …（完整表达式见源码） | brief |
| 276 | OrbitAgentDashboard | section | showEmptyAccountDemo ? ( &lt;div data-orbit-agent-demo-result style={{ display: "grid", gap: 8 }}&gt; {[ t({ en: "1 · Potential customer — validate a current need", zh: "1 · 潜在客户角色——先验证当前需求" }), t({ en: "2 · Trusted peer — ask for a focused introduction", zh: "2 · 熟悉的同行角色——提出一次明确引荐" }), t({ en: "3 · Channel partner — test a …（完整表达式见源码） |  |
| 336 | OrbitAgentDashboard | h2 | t({ en: "Upcoming appointment", zh: "即将到来的约谈" }) |  |
| 337 | OrbitAgentDashboard | section | t({ en: "Appointment", zh: "约谈提醒" }) | card appt |
| 385 | OrbitAgentDashboard | h2 | t({ en: "What you can do now", zh: "现在可以做" }) |  |
| 386 | OrbitAgentDashboard | section | nextEvent ? ( &lt;article className="card act span2"&gt; &lt;div className="act-top"&gt; &lt;span className="act-ic ic-teal"&gt;&lt;Icon name="calendar" size={17} /&gt;&lt;/span&gt; &lt;b&gt;{nextEvent.name \|\| nextEvent.code}&lt;/b&gt; &lt;/div&gt; &lt;div className="stage-row"&gt; &lt;span className={`stage${nextEventRegistered ? " done" : eventRegistrationIsOpen(nextEventR …（完整表达式见源码） | grid |
| 476 | OrbitAgentDashboard | h2 | t({ en: "My event journeys", zh: "我的活动旅程" }) |  |
| 478 | OrbitAgentDashboard | section | journeys.map((event) =&gt; { const badge = journeyStageBadge( event, registrationAvailabilityByEventId[event.id] ?? "unavailable", t, ); const bounds = eventTemporalBounds(event.startsAt, event.endsAt); const date = eventDateLabel(bounds.start); const timeLabel = bounds.start ? new Intl.DateTimeFormat(locale, { hour: "2-d …（完整表达式见源码） | card journeys |
| 504 | OrbitAgentDashboard | section |  | card journeys |

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 109 | [appointments, setAppointments] = useState&lt;AppointmentView[]&gt;([]) |
| 110 | [briefText, setBriefText] = useState(initialBriefText) |
| 111 | [showEmptyAccountDemo, setShowEmptyAccountDemo] = useState(false) |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 244 | form-submit-boundary/form · OrbitAgentDashboard |  | onsubmit: (event) =&gt; { event.preventDefault(); sendBrief(); } | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 252 | field/input · OrbitAgentDashboard | t({ en: "Ask iOrbit", zh: "向 iOrbit 提问" }) | onchange: (event) =&gt; setBriefText(event.target.value) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 259 | button/button · OrbitAgentDashboard | t({ en: "Send", zh: "发送" }) |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 265 | button/button · OrbitAgentDashboard | {chip.label} | onclick: () =&gt; onAsk(chip.query) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 297 | button/button · OrbitAgentDashboard | Hide example / 收起示例结果 / Preview a top-3 result / 预览“最值得联系的 3 位” | onclick: () =&gt; setShowEmptyAccountDemo((value) =&gt; !value) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 324 | button/button · OrbitAgentDashboard | Import contacts when ready / 准备好后导入联系人 | onclick: () =&gt; navigate("/app/contacts/new") | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 366 | button/button · OrbitAgentDashboard | Open card & evidence / 查看名片与依据 | onclick: () =&gt; navigate(`/app/contacts/${encodeURIComponent(upcomingAppointment.contactId ?? "")}`) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 371 | button/button · OrbitAgentDashboard | Open event / 打开活动 | onclick: () =&gt; navigate(`/app/events/${encodeURIComponent(upcomingAppointment.eventId ?? "")}`) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 375 | button/button · OrbitAgentDashboard | Let iOrbit prep me / 让 iOrbit 帮我准备 | onclick: () =&gt; onAsk(t({ en: "Help me prepare for my upcoming appointment", zh: "帮我准备即将到来的约谈" })) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 421 | button/button · OrbitAgentDashboard | Open event journey / 进入活动旅程 | onclick: () =&gt; navigate(`/app/events/${encodeURIComponent(nextEvent.id)}`) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 436 | button/button · OrbitAgentDashboard | Generate debrief / 生成复盘 | onclick: () =&gt; navigate(`/app/events/${encodeURIComponent(endedPending.id)}`) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 452 | button/button · OrbitAgentDashboard | Browse open events / 查看开放报名活动 / View event status / 查看活动状态 | onclick: () =&gt; navigate("/app/events") | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 469 | button/button · OrbitAgentDashboard | Open contacts / 打开人脉 / Add your first contact / 添加第一位联系人 | onclick: () =&gt; navigate(home.stats.people &gt; 0 ? "/app/contacts" : "/app/contacts/new") | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 491 | button/button · OrbitAgentDashboard | {date.m} {date.d} {event.name \|\| event.code} {[timeLabel, event.venue \|\| event.place].filter(Boolean).join(" · ")} {badge.label} | onclick: () =&gt; navigate(`/app/events/${encodeURIComponent(event.id)}`) | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 115 | OrbitAgentDashboard | 调用 | GET/由封装决定 | "/api/appointments" |
| 115 | OrbitAgentDashboard | 路径常量 | 见调用/handler | "/api/appointments" |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 63 | 翻译 en | "Working late" |
| 63 | 翻译 zh | "夜深了" |
| 64 | 翻译 en | "Good morning" |
| 64 | 翻译 zh | "早上好" |
| 65 | 翻译 en | "Good afternoon" |
| 65 | 翻译 zh | "中午好" |
| 66 | 翻译 en | "Good afternoon" |
| 66 | 翻译 zh | "下午好" |
| 67 | 翻译 en | "Good evening" |
| 67 | 翻译 zh | "晚上好" |
| 75 | 翻译 en | "Ended" |
| 75 | 翻译 zh | "已结束" |
| 76 | 翻译 en | "Live now" |
| 76 | 翻译 zh | "进行中" |
| 78 | 翻译 en | "Registered" |
| 78 | 翻译 zh | "已报名" |
| 163 | 翻译 en | `next event in ${daysToNext} days` |
| 163 | 翻译 zh | `距下一场活动还有 ${daysToNext} 天` |
| 165 | 翻译 en | "1 appointment coming up" |
| 165 | 翻译 zh | "1 个约谈待赴约" |
| 170 | 翻译 en | `Help me prepare for ${nextEvent.name}` |
| 170 | 翻译 zh | `帮我准备「${nextEvent.name}」` |
| 170 | 翻译 en | `Help me prepare for the event ${nextEvent.name}` |
| 170 | 翻译 zh | `帮我准备活动「${nextEvent.name}」` |
| 171 | 翻译 en | "Which events are worth attending?" |
| 171 | 翻译 zh | "有哪些值得去的活动？" |
| 171 | 翻译 en | "Which upcoming events are worth attending for my goals?" |
| 171 | 翻译 zh | "按我的目标看看有哪些值得去的活动" |
| 172 | 翻译 en | "Who is worth following up?" |
| 172 | 翻译 zh | "谁值得跟进一下？" |
| 172 | 翻译 en | "Who in my contacts is worth following up right now?" |
| 172 | 翻译 zh | "我的人脉里现在谁值得跟进？" |
| 174 | 翻译 en | "Debrief my last event" |
| 174 | 翻译 zh | "复盘上一场活动" |
| 174 | 翻译 en | `Debrief the ended event ${endedPending.name}` |
| 174 | 翻译 zh | `复盘已结束的活动「${endedPending.name}」` |
| 175 | 翻译 en | "Organize my follow-ups" |
| 175 | 翻译 zh | "整理我的跟进" |
| 175 | 翻译 en | "Organize my pending follow-ups" |
| 175 | 翻译 zh | "整理我的待办跟进" |
| 215 | 翻译 en | "Events" |
| 215 | 翻译 zh | "活动" |
| 216 | 翻译 en | "Contacts" |
| 216 | 翻译 zh | "人脉" |
| 217 | 翻译 en | "Following up" |
| 217 | 翻译 zh | "跟进中" |
| 218 | 翻译 en | "Appointments" |
| 218 | 翻译 zh | "待赴约谈" |
| 231 | JSX文字 | iOrbit |
| 232 | 翻译 en | "Based on your real state · external actions always need your confirmation" |
| 232 | 翻译 zh | "基于你的真实状态 · 涉及对外动作会先经你确认" |
| 252 | 属性 placeholder | t({ en: "Ask iOrbit: what do you want to get done?", zh: "问 iOrbit：你想促成什么？" }) |
| 252 | 属性 aria-label | t({ en: "Ask iOrbit", zh: "向 iOrbit 提问" }) |
| 253 | 翻译 en | "Ask iOrbit" |
| 253 | 翻译 zh | "向 iOrbit 提问" |
| 255 | 翻译 en | "Ask iOrbit: what do you want to get done?" |
| 255 | 翻译 zh | "问 iOrbit：你想促成什么？" |
| 259 | 属性 aria-label | t({ en: "Send", zh: "发送" }) |
| 259 | 翻译 en | "Send" |
| 259 | 翻译 zh | "发送" |
| 270 | 翻译 en | "iOrbit only answers from the events and contacts you authorized; external actions always need your confirmation." |
| 271 | 翻译 zh | "iOrbit 只根据你已授权的活动与人脉数据回答；涉及对外动作会先经你确认。" |
| 289 | 翻译 en | "Try the decision flow before importing" |
| 289 | 翻译 zh | "还没导入联系人，也可以先体验决策流程" |
| 292 | 翻译 en | "This uses three clearly labeled archetypes, not real people or account data." |
| 293 | 翻译 zh | "这里使用 3 个明确标注的角色示例，不会冒充真实联系人或账号数据。" |
| 304 | 翻译 en | "Hide example" |
| 304 | 翻译 zh | "收起示例结果" |
| 305 | 翻译 en | "Preview a top-3 result" |
| 305 | 翻译 zh | "预览“最值得联系的 3 位”" |
| 310 | 翻译 en | "1 · Potential customer — validate a current need" |
| 310 | 翻译 zh | "1 · 潜在客户角色——先验证当前需求" |
| 311 | 翻译 en | "2 · Trusted peer — ask for a focused introduction" |
| 311 | 翻译 zh | "2 · 熟悉的同行角色——提出一次明确引荐" |
| 312 | 翻译 en | "3 · Channel partner — test a small joint next step" |
| 312 | 翻译 zh | "3 · 渠道伙伴角色——验证一个小型合作下一步" |
| 320 | 翻译 en | "After you import contacts, iOrbit replaces these archetypes with your authorized records, evidence, and editable drafts." |
| 321 | 翻译 zh | "导入联系人后，iOrbit 会用你已授权的真实记录、依据和可编辑草稿替换这些角色示例。" |
| 325 | 翻译 en | "Import contacts when ready" |
| 325 | 翻译 zh | "准备好后导入联系人" |
| 336 | 翻译 en | "Upcoming appointment" |
| 336 | 翻译 zh | "即将到来的约谈" |
| 336 | 翻译 en | "From your contacts · confirmed by both sides" |
| 336 | 翻译 zh | "来自你的人脉 · 双方已确认" |
| 337 | 属性 aria-label | t({ en: "Appointment", zh: "约谈提醒" }) |
| 337 | 翻译 en | "Appointment" |
| 337 | 翻译 zh | "约谈提醒" |
| 347 | 翻译 en | "Time confirmed" |
| 347 | 翻译 zh | "时间已确认" |
| 350 | JSX文字 | min |
| 353 | 翻译 en | `in ${appointmentDayCount} days` |
| 353 | 翻译 zh | `还有 ${appointmentDayCount} 天` |
| 358 | 翻译 en | "Online appointment" |
| 358 | 翻译 zh | "线上约谈" |
| 359 | 翻译 en | "Confirmed by both" |
| 359 | 翻译 zh | "双方已确认" |
| 367 | 翻译 en | "Open card & evidence" |
| 367 | 翻译 zh | "查看名片与依据" |
| 372 | 翻译 en | "Open event" |
| 372 | 翻译 zh | "打开活动" |
| 375 | 翻译 en | "Help me prepare for my upcoming appointment" |
| 375 | 翻译 zh | "帮我准备即将到来的约谈" |
| 376 | 翻译 en | "Let iOrbit prep me" |
| 376 | 翻译 zh | "让 iOrbit 帮我准备" |
| 385 | 翻译 en | "What you can do now" |
| 385 | 翻译 zh | "现在可以做" |
| 385 | 翻译 en | "Ordered by your current state" |
| 385 | 翻译 zh | "按你的当前状态排序" |
| 398 | 翻译 en | "Registration complete" |
| 398 | 翻译 zh | "已完成报名" |
| 400 | 翻译 en | "Register + answer 2 questions" |
| 400 | 翻译 zh | "报名与回答 2 题" |
| 406 | 翻译 en | "Event profile" |
| 406 | 翻译 zh | "完成活动画像" |
| 409 | 翻译 en | "Check match status" |
| 409 | 翻译 zh | "查看匹配进度" |
| 411 | 翻译 en | "Event day" |
| 411 | 翻译 zh | "活动当天" |
| 422 | 翻译 en | "Open event journey" |
| 422 | 翻译 zh | "进入活动旅程" |
| 432 | 翻译 en | "Debrief pending" |
| 432 | 翻译 zh | "会后复盘待生成" |
| 433 | JSX文字 | iOrbit |
| 435 | 翻译 en | `“${endedPending.name}” has ended — the debrief is not generated yet. Do it while it is fresh.` |
| 435 | 翻译 zh | `「${endedPending.name}」已结束，复盘报告还没生成——趁记忆还热。` |
| 437 | 翻译 en | "Generate debrief" |
| 437 | 翻译 zh | "生成复盘" |
| 445 | 翻译 en | "Find your next event" |
| 445 | 翻译 zh | "发现下一场活动" |
| 449 | 翻译 en | "There are events accepting registration now. Review their requirements to register." |
| 449 | 翻译 zh | "目前有活动正在开放报名，可查看要求后提交报名。" |
| 450 | 翻译 en | "Review upcoming events and their current registration status." |
| 450 | 翻译 zh | "查看近期活动及各自的真实报名状态。" |
| 454 | 翻译 en | "Browse open events" |
| 454 | 翻译 zh | "查看开放报名活动" |
| 455 | 翻译 en | "View event status" |
| 455 | 翻译 zh | "查看活动状态" |
| 462 | 翻译 en | "Contacts" |
| 462 | 翻译 zh | "人脉库" |
| 466 | 翻译 en | `${home.stats.people} contacts — people you met at events live here.` |
| 466 | 翻译 zh | `${home.stats.people} 位联系人——活动里认识的人都沉淀在这里。` |
| 467 | 翻译 en | "No contacts yet. People you meet at events land here; you can also add one manually." |
| 467 | 翻译 zh | "还没有联系人。从活动里认识的人会自动沉淀到这里，也可以手动添加第一位。" |
| 470 | 翻译 en | "Open contacts" |
| 470 | 翻译 zh | "打开人脉" |
| 470 | 翻译 en | "Add your first contact" |
| 470 | 翻译 zh | "添加第一位联系人" |
| 476 | 翻译 en | "My event journeys" |
| 476 | 翻译 zh | "我的活动旅程" |
| 476 | 翻译 en | "One page per event, registration to debrief" |
| 476 | 翻译 zh | "每场活动一个页面，从报名到复盘" |
| 506 | 翻译 en | "No event journeys yet — register for one and it appears here, from registration to debrief." |
| 506 | 翻译 zh | "还没有活动旅程——报名一场活动后，从报名到复盘都会出现在这里。" |

## repos/orbits/app/(app)/app/agent/orbit-agent-today-workspace.tsx

源码：[orbit-agent-today-workspace.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/agent/orbit-agent-today-workspace.tsx>)

静态来源入口：`/app/agent`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 243 | OrbitAgentTodayWorkspace | details |  | brief-action-more |
| 244 | OrbitAgentTodayWorkspace | summary | t({ en: `More options for ${row.title}`, zh: `${row.title}的更多操作`, }) |  |

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 50 | [signals, setSignals] = useState&lt;readonly AgentTodaySignalView[]&gt;([]) |
| 51 | [loading, setLoading] = useState(true) |
| 52 | [refreshing, setRefreshing] = useState(false) |
| 53 | [error, setError] = useState&lt;string \| null&gt;(null) |
| 54 | [updatingId, setUpdatingId] = useState&lt;string \| null&gt;(null) |
| 55 | [activeSurface, setActiveSurface] = useState(false) |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 222 | button/button · OrbitAgentTodayWorkspace | {action.label} {&lt;Icon name="arrow" size={14} /&gt;} / {null} | onclick: () =&gt; { if (action.kind === "ask" && action.prompt) { onAsk(action.prompt); } else if (action.href) { navigate(action.href); } } | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 244 | disclosure/summary · OrbitAgentTodayWorkspace | t({ en: `More options for ${row.title}`, zh: `${row.title}的更多操作`, }) |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 253 | button/button · OrbitAgentTodayWorkspace | Remind tomorrow / 明天提醒 | onclick: () =&gt; void updateStatus(row.signal, "snoozed") | {"disabled":"updatingId === row.signal.signalId","renderGateProps":[],"conditions":[]} |
| 262 | button/button · OrbitAgentTodayWorkspace | Dismiss / 忽略 | onclick: () =&gt; void updateStatus(row.signal, "dismissed") | {"disabled":"updatingId === row.signal.signalId","renderGateProps":[],"conditions":[]} |
| 289 | button/button · OrbitAgentTodayWorkspace | Refreshing / 刷新中 / Refresh / 刷新 | onclick: () =&gt; void refresh(true) | {"disabled":"refreshing","renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 74 | OrbitAgentTodayWorkspace | 调用 | POST | "/api/agent/signals?view=home" |
| 74 | OrbitAgentTodayWorkspace | 路径常量 | 见调用/handler | "/api/agent/signals?view=home" |
| 119 | updateStatus | 调用 | PATCH | `/api/agent/signals/${encodeURIComponent(signal.signalId)}` |
| 120 | updateStatus | 路径常量 | 见调用/handler | `/api/agent/signals/${encodeURIComponent(signal.signalId)}` |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 183 | 翻译 en | "Checking relationship changes…" |
| 183 | 翻译 zh | "正在核对关系变化…" |
| 189 | 翻译 en | "Based on what changed, start with these next steps." |
| 190 | 翻译 zh | "根据你的真实状态，先处理这几件事。" |
| 205 | 属性 title | row.context |
| 244 | 属性 aria-label | t({ en: `More options for ${row.title}`, zh: `${row.title}的更多操作`, }) |
| 246 | 翻译 en | `More options for ${row.title}` |
| 247 | 翻译 zh | `${row.title}的更多操作` |
| 260 | 翻译 en | "Remind tomorrow" |
| 260 | 翻译 zh | "明天提醒" |
| 269 | 翻译 en | "Dismiss" |
| 269 | 翻译 zh | "忽略" |
| 283 | 翻译 en | "You are caught up — the next meaningful relationship change will land here." |
| 284 | 翻译 zh | "今天没有必须处理的变化——下一条重要的关系变化会出现在这里。" |
| 298 | 翻译 en | "Refreshing" |
| 298 | 翻译 zh | "刷新中" |
| 299 | 翻译 en | "Refresh" |
| 299 | 翻译 zh | "刷新" |

## repos/orbits/app/(app)/app/agent/orbit-real-agent.tsx

源码：[orbit-real-agent.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/agent/orbit-real-agent.tsx>)

静态来源入口：`/app/agent`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 1382 | AgentHistoryDeleteDialog | h2 | t({ en: "Delete this conversation?", zh: "删除这个对话？" }) |  |
| 1636 | AgentWelcome | h3 | t({ en: "What should iOrbit do for you?", zh: "你想让 iOrbit 做什么？" }) |  |
| 3710 | OrbitRealAgent | h1 | t({ en: "iOrbit workspace", zh: "iOrbit 工作区" }) |  |
| 3734 | OrbitRealAgent | aside |  | agent-history orbit-agent-history |

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 1017 | [copied, setCopied] = useState(false) |
| 1070 | [historyMenuOpenId, setHistoryMenuOpenId] = useState&lt;string \| null&gt;(null) |
| 1071 | [hoveredHistoryId, setHoveredHistoryId] = useState&lt;string \| null&gt;(null) |
| 1072 | [renamingHistoryId, setRenamingHistoryId] = useState&lt;string \| null&gt;(null) |
| 1073 | [renamingHistoryTitle, setRenamingHistoryTitle] = useState("") |
| 1663 | [state, setState] = useState&lt;"idle" \| "generating" \| "ready" \| "handed" \| "error"&gt;("idle") |
| 1664 | [errorCode, setErrorCode] = useState&lt;string \| null&gt;(null) |
| 1665 | [subject, setSubject] = useState("") |
| 1666 | [body, setBody] = useState("") |
| 1667 | [handedAt, setHandedAt] = useState&lt;string \| null&gt;(null) |
| 1670 | [generatedPurpose, setGeneratedPurpose] = useState&lt;string \| null&gt;(null) |
| 1714 | [copied, setCopied] = useState(false) |
| 2039 | [open, setOpen] = useState(false) |
| 2042 | [selected, setSelected] = useState&lt;ReadonlySet&lt;string&gt;&gt;( () =&gt; new Set((promised.length &gt; 0 ? promised : group.items).map((item) =&gt; item.id)), ) |
| 2156 | [showAll, setShowAll] = useState(false) |
| 2279 | [phase, setPhase] = useState(0) |
| 2596 | [chatOpen, setChatOpen] = useState(false) |
| 2597 | [agentPrefill, setAgentPrefill] = useState&lt;OrbitAgentPrefill \| null&gt;(null) |
| 2598 | [messages, setMessages] = useState&lt;AgentMessage[]&gt;([]) |
| 2607 | [panel, setPanel] = useState&lt;AgentPanel \| null&gt;(null) |
| 2608 | [thinking, setThinking] = useState(false) |
| 2609 | [chatDraft, setChatDraft] = useState("") |
| 2610 | [histOpen, setHistOpen] = useState(false) |
| 2611 | [activeQ, setActiveQ] = useState("") |
| 2612 | [activeSessionId, setActiveSessionId] = useState&lt;string \| null&gt;(null) |
| 2613 | [historySidebarResizing, setHistorySidebarResizing] = useState(false) |
| 2614 | [historySidebarWidth, setHistorySidebarWidth] = useState( HISTORY_SIDEBAR_DEFAULT_WIDTH, ) |
| 2617 | [storedSessions, setStoredSessions] = useState&lt;AgentStoredChatSession[]&gt;([]) |
| 2618 | [sessionGroups, setSessionGroups] = useState&lt;AiSessionGroupContract[]&gt;([]) |
| 2619 | [selectedSessionGroupId, setSelectedSessionGroupId] = useState&lt;string \| null&gt;(null) |
| 2620 | [groupMutationPending, setGroupMutationPending] = useState(false) |
| 2621 | [historyMutationQueue] = useState(createAgentChatSessionMutationQueue) |
| 2622 | [historyDeleteError, setHistoryDeleteError] = useState&lt;string \| null&gt;(null) |
| 2623 | [historyFeedback, setHistoryFeedback] = useState&lt;AgentHistoryFeedback \| null&gt;(null) |
| 2624 | [historyMutationSessionId, setHistoryMutationSessionId] = useState&lt;string \| null&gt;(null) |
| 2625 | [pendingDeleteHistory, setPendingDeleteHistory] = useState&lt;OrbitAgentHistoryView \| null&gt;(null) |

### 弹层根/原生确认

| 行 | 类型 | 名称/标题表达式 |
| --- | --- | --- |
| 1363 | alertdialog | Delete this conversation? / 删除这个对话？ {t({ en: `“${history.title}” and its messages will be permanently removed from your chat history. This cannot be undone.`, zh: `“${history.title}”及其中的消息将从你的对话历史中永久删除，且无法撤销。`, })} {&lt;p role="alert" style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}&gt; {error} &lt;/p&gt;} / {null} Keep conversation / 保留对话 Deleting… / 正在删除… / Delete conversation / 删除对话 |
| 1490 | dialog | Chat history / 对话历史 New chat / 新对话 Go to / 前往 {[ ["/", "home", t({ en: "Home", zh: "首页" })], ["/explore", "calendar", t({ en: "Events", zh: "活动" })], ["/home/schedule", "clock", t({ en: "Calendar", zh: "日程" })], ["/home/cards", "wallet", t({ en: "Contacts", zh: "人脉" })], ].map(([href, icon, label]) =&gt; ( &lt;button className="btn btn-quiet" key={href} onClick={() =&gt; { onClose(); onNavigate(href); }} style={{ height: "auto", justifyContent: "flex-star …（完整表达式见源码） |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 997 | link/a · AgentMarkdown | {children} | href | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1020 | button/button · AgentMessageCopyButton | t({ en: "Copy message", zh: "复制消息" }) | onclick: async () =&gt; setCopied(await copyAgentMessageText(text)) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1156 | form-submit-boundary/form · AgentHistoryList |  | onsubmit: (event) =&gt; { event.preventDefault(); finishRename(item); } | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1163 | field/input · AgentHistoryList | t({ en: "Rename conversation", zh: "重命名对话" }) | onchange: (event) =&gt; setRenamingHistoryTitle(event.target.value); onkeydown: (event) =&gt; { if (event.key === "Escape") { event.preventDefault(); cancelRename(); } } | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1189 | button/button · AgentHistoryList | t({ en: "Save conversation name", zh: "保存对话名称" }) |  | {"disabled":"!renamingHistoryTitle.trim()","renderGateProps":[],"conditions":[]} |
| 1200 | button/button · AgentHistoryList | t({ en: "Cancel conversation rename", zh: "取消重命名对话" }) | onclick: cancelRename | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1213 | button/button · AgentHistoryList | item.q \|\| item.title | onclick: () =&gt; { setHistoryMenuOpenId(null); onPick(item); } | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1231 | button/button · AgentHistoryList | t({ en: "More actions", zh: "更多操作" }) | onclick: () =&gt; setHistoryMenuOpenId(menuOpen ? null : item.id) | {"disabled":"pending","renderGateProps":[],"conditions":[]} |
| 1269 | button/button · AgentHistoryList | Unpin / 取消置顶 / Pin / 置顶 | onclick: () =&gt; { setHistoryMenuOpenId(null); onTogglePin(item); } | {"disabled":"pending","renderGateProps":[],"conditions":[]} |
| 1284 | button/button · AgentHistoryList | Rename / 重命名 | onclick: () =&gt; startRename(item) | {"disabled":"pending","renderGateProps":[],"conditions":[]} |
| 1297 | button/button · AgentHistoryList | Ungrouped / 未分组 | onclick: () =&gt; { setHistoryMenuOpenId(null); onMove(item, null); } | {"disabled":"pending \|\| item.groupId === null","renderGateProps":[],"conditions":[]} |
| 1298 | button/button · AgentHistoryList | {group.name} | onclick: () =&gt; { setHistoryMenuOpenId(null); onMove(item, group.id); } | {"disabled":"pending \|\| item.groupId === group.id","renderGateProps":[],"conditions":[]} |
| 1300 | button/button · AgentHistoryList | Delete / 删除对话 | onclick: () =&gt; { setHistoryMenuOpenId(null); onDelete(item); } | {"disabled":"pending","renderGateProps":[],"conditions":[]} |
| 1403 | button/button · AgentHistoryDeleteDialog | Keep conversation / 保留对话 | onclick: onCancel | {"disabled":"pending","renderGateProps":[],"conditions":[]} |
| 1412 | button/button · AgentHistoryDeleteDialog | Deleting… / 正在删除… / Delete conversation / 删除对话 | onclick: onConfirm | {"disabled":"pending","renderGateProps":[],"conditions":[]} |
| 1485 | callback-control/div · AgentMobileHistoryDrawer |  | onclick: onClose | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1503 | callback-control/IconButton · AgentMobileHistoryDrawer |  | onclick: onClose | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1506 | button/button · AgentMobileHistoryDrawer | New chat / 新对话 | onclick: onNewChat | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1511 | callback-control/AgentChatHistoryOrganization · AgentMobileHistoryDrawer |  | oncreate: onCreateGroup; ondelete: onDeleteGroup | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1530 | button/button · AgentMobileHistoryDrawer | {label} | onclick: () =&gt; { onClose(); onNavigate(href); } | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1548 | callback-control/AgentHistoryList · AgentMobileHistoryDrawer |  | ondelete: onDelete; ontogglepin: onTogglePin | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1595 | form-submit-boundary/form · AgentChatComposer |  | onsubmit: (event) =&gt; { event.preventDefault(); onSubmit(); } | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1605 | field/input · AgentChatComposer | t({ en: "Ask Orbit about contacts, events, and relationship to-dos", zh: "询问 Orbit 人脉、活动与关系待办", }) | onchange: (event) =&gt; onChange(event.target.value) | {"disabled":"busy","renderGateProps":[],"conditions":[]} |
| 1617 | button/button · AgentChatComposer | t({ en: "Send Ask Orbit message", zh: "发送给 Orbit" }) |  | {"disabled":"busy \|\| !value.trim()","renderGateProps":[],"conditions":[]} |
| 1645 | button/button · AgentWelcome | {agentSuggestLabel(suggest.label, language === "ja" ? "en" : language)} | onclick: () =&gt; onPick(suggest.q) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1734 | button/button · AgentInlineDraftResult | Retry / 重试 | onclick: () =&gt; void draft.generate(currentPurpose) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1756 | button/button · AgentInlineDraftResult | Open drafts / 打开草稿箱 | onclick: () =&gt; openRelationshipInbox() | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1759 | button/button · AgentInlineDraftResult | View draft / 查看草稿 | onclick: () =&gt; draft.reopen() | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1783 | button/button · AgentInlineDraftResult | Regenerate / 重新生成 | onclick: () =&gt; void draft.generate(currentPurpose) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1788 | field/input · AgentInlineDraftResult | t({ en: "Subject", zh: "主题" }) | onchange: (event) =&gt; draft.setSubject(event.target.value) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1789 | field/textarea · AgentInlineDraftResult | t({ en: "Message", zh: "正文" }) | onchange: (event) =&gt; draft.setBody(event.target.value) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1799 | button/button · AgentInlineDraftResult | Copied / 已复制 / Copy draft / 复制草稿 | onclick: async () =&gt; setCopied(await copyAgentMessageText(`${draft.subject}\n\n${draft.body}`)) | {"disabled":"!draft.subject.trim() \|\| !draft.body.trim()","renderGateProps":[],"conditions":[]} |
| 1808 | button/button · AgentInlineDraftResult | Continue in drafts / 继续到草稿箱 | onclick: () =&gt; { openRelationshipInboxCompose({ body: draft.body, contactId, organization, recipient: recipientName, subject: draft.subject, }); // 交接即记录：卡片翻到回执态，主按钮同步降级为「重新起草」。 draft.markHanded(); } | {"disabled":"!draft.subject.trim() \|\| !draft.body.trim()","renderGateProps":[],"conditions":[]} |
| 1855 | button/button · AgentPeopleRow | View / 查看 | onclick: () =&gt; navigate(`/app/contacts/${connection.id}`) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1867 | button/button · AgentPeopleRow | {label} | onclick: () =&gt; void draft.generate() | {"disabled":"draft.state === \"generating\"","renderGateProps":[],"conditions":[]} |
| 1906 | button/button · AgentEventRow | View / 查看 | onclick: () =&gt; navigate(`/events/${event.code}`) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 2088 | field/input · renderItem | {item.title} | onchange: () =&gt; toggleItem(item.id) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 2102 | button/button · AgentTodoRow | Collapse / 收起 / {summary} | onclick: () =&gt; setOpen((value) =&gt; !value) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 2122 | button/button · AgentTodoRow | {label} | onclick: () =&gt; void draft.generate(purpose) | {"disabled":"draft.state === \"generating\" \|\| chosen.length === 0","renderGateProps":[],"conditions":[]} |
| 2145 | button/button · AgentTodoRow | View contact / 查看联系人 | onclick: viewContact | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 2204 | button/button · PanelCards | Show top 3 only / 只看前三位 / {t({ en: `View ${hiddenCount} more`, zh: `查看另外 ${hiddenCount} 位` })} | onclick: () =&gt; setShowAll((value) =&gt; !value) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 3574 | button/button · renderBubbles | 重新提交请求 / Retry request | onclick: () =&gt; void ask(message.retryRequest!, index) | {"disabled":"thinking","renderGateProps":[],"conditions":[]} |
| 3654 | button/button · OrbitRealAgent | t({ en: "Back to workspace", zh: "返回工作台" }) | onclick: backToDashboard | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 3726 | button/button · OrbitRealAgent | t({ en: "Chat history", zh: "对话历史" }) | onclick: () =&gt; setHistOpen(true) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 3736 | button/button · OrbitRealAgent | New chat / 新对话 | onclick: newChat | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 3744 | callback-control/AgentChatHistoryOrganization · OrbitRealAgent |  | oncreate: (name) =&gt; { void createHistoryGroup(name); }; ondelete: (group) =&gt; { void deleteHistoryGroup(group); } | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 3756 | callback-control/AgentHistoryList · OrbitRealAgent |  | ondelete: deleteHistorySession; ontogglepin: togglePinnedHistorySession | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 3759 | button/button · OrbitRealAgent | t({ en: "Resize chat history", zh: "调整历史宽度" }) | onkeydown: resizeHistorySidebarWithKeyboard; onpointerdown: startHistorySidebarResize | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 3792 | callback-control/AgentChatComposer · OrbitRealAgent |  | onchange: setChatDraft; onsubmit: submitChatDraft | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 3810 | callback-control/AgentChatComposer · OrbitRealAgent |  | onchange: setChatDraft; onsubmit: submitChatDraft | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 3822 | callback-control/AgentMobileHistoryDrawer · OrbitRealAgent |  | onclose: () =&gt; setHistOpen(false); ondelete: deleteHistorySession; oncreategroup: (name) =&gt; { void createHistoryGroup(name); }; ondeletegroup: (group) =&gt; { void deleteHistoryGroup(group); }; ontogglepin: togglePinnedHistorySession | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 3847 | callback-control/AgentHistoryDeleteDialog · OrbitRealAgent |  | oncancel: () =&gt; { setHistoryDeleteError(null); setPendingDeleteHistory(null); }; onconfirm: () =&gt; { void confirmDeleteHistorySession(); } | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 3882 | button/button · OrbitRealAgent | t({ en: "Dismiss", zh: "关闭提示" }) | onclick: () =&gt; setHistoryFeedback(null) | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 221 | (module / render callback) | 路径常量 | 见调用/handler | "/api/ai/conversations/sessions" |
| 882 | loadStoredAgentChatSessions | 调用 | GET | `${agentChatSessionsApiPath()}?${query}` |
| 906 | loadStoredAgentChatSession | 调用 | GET | agentChatSessionsApiPath(sessionId) |
| 924 | persistStoredAgentChatSession | 调用 | POST | agentChatSessionsApiPath() |
| 941 | deleteStoredAgentChatSession | 调用 | DELETE | agentChatSessionsApiPath(sessionId) |
| 2253 | fetchAgentConversation | 调用 | POST | "/api/ai/conversations" |
| 2253 | fetchAgentConversation | 路径常量 | 见调用/handler | "/api/ai/conversations" |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 1020 | 属性 title | copied ? t({ en: "Copied", zh: "已复制" }) : t({ en: "Copy", zh: "复制" }) |
| 1020 | 属性 aria-label | t({ en: "Copy message", zh: "复制消息" }) |
| 1021 | 翻译 en | "Copy message" |
| 1021 | 翻译 zh | "复制消息" |
| 1025 | 翻译 en | "Copied" |
| 1025 | 翻译 zh | "已复制" |
| 1025 | 翻译 en | "Copy" |
| 1025 | 翻译 zh | "复制" |
| 1121 | 属性 aria-label | `${group} · ${history.filter((item) =&gt; item.group === group).length}` |
| 1163 | 属性 aria-label | t({ en: "Rename conversation", zh: "重命名对话" }) |
| 1164 | 翻译 en | "Rename conversation" |
| 1164 | 翻译 zh | "重命名对话" |
| 1189 | 属性 title | t({ en: "Save", zh: "保存" }) |
| 1189 | 属性 aria-label | t({ en: "Save conversation name", zh: "保存对话名称" }) |
| 1190 | 翻译 en | "Save conversation name" |
| 1190 | 翻译 zh | "保存对话名称" |
| 1194 | 翻译 en | "Save" |
| 1194 | 翻译 zh | "保存" |
| 1200 | 属性 title | t({ en: "Cancel", zh: "取消" }) |
| 1200 | 属性 aria-label | t({ en: "Cancel conversation rename", zh: "取消重命名对话" }) |
| 1201 | 翻译 en | "Cancel conversation rename" |
| 1201 | 翻译 zh | "取消重命名对话" |
| 1205 | 翻译 en | "Cancel" |
| 1205 | 翻译 zh | "取消" |
| 1213 | 属性 title | item.q \|\| item.title |
| 1231 | 属性 title | t({ en: "More actions", zh: "更多操作" }) |
| 1234 | 翻译 en | "More actions" |
| 1234 | 翻译 zh | "更多操作" |
| 1239 | 翻译 en | "More actions" |
| 1239 | 翻译 zh | "更多操作" |
| 1282 | 翻译 en | "Unpin" |
| 1282 | 翻译 zh | "取消置顶" |
| 1282 | 翻译 en | "Pin" |
| 1282 | 翻译 zh | "置顶" |
| 1294 | 翻译 en | "Rename" |
| 1294 | 翻译 zh | "重命名" |
| 1296 | 翻译 en | "Move to" |
| 1296 | 翻译 zh | "移动到" |
| 1297 | 翻译 en | "Ungrouped" |
| 1297 | 翻译 zh | "未分组" |
| 1312 | 翻译 en | "Delete" |
| 1312 | 翻译 zh | "删除对话" |
| 1386 | 翻译 en | "Delete this conversation?" |
| 1386 | 翻译 zh | "删除这个对话？" |
| 1393 | 翻译 en | `“${history.title}” and its messages will be permanently removed from your chat history. This cannot be undone.` |
| 1394 | 翻译 zh | `“${history.title}”及其中的消息将从你的对话历史中永久删除，且无法撤销。` |
| 1410 | 翻译 en | "Keep conversation" |
| 1410 | 翻译 zh | "保留对话" |
