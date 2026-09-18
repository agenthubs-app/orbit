| 24 | callback-control/TaskRows · TodayTasksSummary |  | ontoggle: (task) =&gt; { void mutation.run(() =&gt; client.setCompleted(task.id, true), resource.refresh, t({ zh: "已完成待办", en: "Task completed" })); } | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 15 | 属性 aria-label | t({ zh: "今天的待办", en: "Today's tasks" }) |
| 15 | 翻译 zh | "今天的待办" |
| 15 | 翻译 en | "Today's tasks" |
| 17 | 翻译 zh | "待办" |
| 17 | 翻译 en | "Tasks" |
| 17 | 翻译 zh | "全部待办" |
| 17 | 翻译 en | "All tasks" |
| 18 | 翻译 zh | "待办已添加" |
| 18 | 翻译 en | "Task added" |
| 21 | 翻译 zh | "正在读取待办…" |
| 21 | 翻译 en | "Loading tasks…" |
| 23 | 翻译 zh | "今天暂无待办" |
| 23 | 翻译 en | "No tasks planned for today" |
| 25 | 翻译 zh | "已完成待办" |
| 25 | 翻译 en | "Task completed" |
| 28 | 翻译 zh | "建议已加入待办" |
| 28 | 翻译 en | "Suggestion added to tasks" |
| 28 | 翻译 zh | "已忽略建议" |
| 28 | 翻译 en | "Suggestion dismissed" |

## repos/orbits/app/(app)/app/today/compose-app-today-from-agent-ledger/today-appointment-schedule.ts

源码：[today-appointment-schedule.ts](</Users/li/work/orbit/repos/orbits/app/(app)/app/today/compose-app-today-from-agent-ledger/today-appointment-schedule.ts>)

静态来源入口：`/app/today`

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 145 | 文案/数据常量 title | "已确认活动" |

## repos/orbits/app/(app)/app/today/compose-app-today-from-agent-ledger/today-merged-view-model.ts

源码：[today-merged-view-model.ts](</Users/li/work/orbit/repos/orbits/app/(app)/app/today/compose-app-today-from-agent-ledger/today-merged-view-model.ts>)

静态来源入口：`/app/today`

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 183 | 文案/数据常量 guardrail | "来源不可用期间，Orbit 不会把跟进任务、提醒或 AI 建议冒充为日程。" |
| 184 | 文案/数据常量 label | "重新加载" |
| 185 | 文案/数据常量 title | "真实约谈暂时无法加载" |

## repos/orbits/app/(app)/app/today/orbit-real-today.tsx

源码：[orbit-real-today.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/today/orbit-real-today.tsx>)

静态来源入口：`/app/today`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 192 | OrbitRealToday | h2 | 决策账本暂时不可用 |  |
| 206 | OrbitRealToday | h2 | 今天没有需要你决定的事 |  |
| 270 | OrbitRealToday | section | rows viewModel.hiddenDecisionCount &gt; 0 ? ( &lt;a className="btn btn-ghost btn-sm" data-orbit-today-hidden-decisions href="/app/contacts/all-actions" style={{ marginTop: 10 }} &gt; {language === "zh" ? `另外 ${viewModel.hiddenDecisionCount} 项已按联系人收进全部安排` : language === "ja" ? `残り ${viewModel.hiddenDecisionCount} 件は連絡先ごとに「すべての予定 …（完整表达式见源码） |  |
| 305 | OrbitRealToday | details | rows |  |
| 310 | OrbitRealToday | summary | heading |  |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 123 | link/a · DecisionEntryCard | {entry.title} {entry.organization ?? entry.contactName ?? STATUS_LABELS[language][entry.status]} {STATUS_LABELS[language][entry.status]} | href | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 283 | link/a · OrbitRealToday | {`另外 ${viewModel.hiddenDecisionCount} 项已按联系人收进全部安排`} / {`残り ${viewModel.hiddenDecisionCount} 件は連絡先ごとに「すべての予定」へ整理済み`} / {`${viewModel.hiddenDecisionCount} more grouped by contact in All arrangements`} | /app/contacts/all-actions | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 310 | disclosure/summary · OrbitRealToday | {heading} |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 31 | 文案/数据常量 approved | "Confirmed" |
| 32 | 文案/数据常量 awaiting_confirmation | "Awaiting confirmation" |
| 33 | 文案/数据常量 canceled | "Canceled" |
| 34 | 文案/数据常量 completed | "Completed" |
| 35 | 文案/数据常量 deferred | "Later" |
| 36 | 文案/数据常量 executing | "Executing" |
| 37 | 文案/数据常量 failed | "Failed" |
| 38 | 文案/数据常量 partially_failed | "Partially failed" |
| 39 | 文案/数据常量 rejected | "Ignored" |
| 40 | 文案/数据常量 undone | "Undone" |
| 43 | 文案/数据常量 approved | "確認済み" |
| 44 | 文案/数据常量 awaiting_confirmation | "確認待ち" |
| 45 | 文案/数据常量 canceled | "キャンセル済み" |
| 46 | 文案/数据常量 completed | "完了" |
| 47 | 文案/数据常量 deferred | "後で対応" |
| 48 | 文案/数据常量 executing | "実行中" |
| 49 | 文案/数据常量 failed | "失敗" |
| 50 | 文案/数据常量 partially_failed | "一部失敗" |
| 51 | 文案/数据常量 rejected | "見送り" |
| 52 | 文案/数据常量 undone | "取り消し済み" |
| 55 | 文案/数据常量 approved | "已确认" |
| 56 | 文案/数据常量 awaiting_confirmation | "等待确认" |
| 57 | 文案/数据常量 canceled | "已取消" |
| 58 | 文案/数据常量 completed | "已完成" |
| 59 | 文案/数据常量 deferred | "稍后处理" |
| 60 | 文案/数据常量 executing | "正在执行" |
| 61 | 文案/数据常量 failed | "失败" |
| 62 | 文案/数据常量 partially_failed | "部分失败" |
| 63 | 文案/数据常量 rejected | "已忽略" |
| 64 | 文案/数据常量 undone | "已撤销" |
| 191 | JSX文字 | 需要你决定 |
| 192 | JSX文字 | 决策账本暂时不可用 |
| 205 | JSX文字 | 需要你决定 |
| 206 | JSX文字 | 今天没有需要你决定的事 |
| 208 | JSX文字 | Orbit 会在有新的跟进窗口时把决策放到这里。 |

## repos/orbits/app/(app)/app/today/orbit-today-decision-form.tsx

源码：[orbit-today-decision-form.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/today/orbit-today-decision-form.tsx>)

静态来源入口：`/app/today`

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 88 | [selected, setSelected] = useState&lt;readonly string[]&gt;( operations .filter((operation) =&gt; operation.selectedByDefault) .map((operation) =&gt; operation.operationId), ) |
| 93 | [pending, setPending] = useState(false) |
| 94 | [error, setError] = useState&lt;string \| null&gt;(null) |
| 95 | [editableValues, setEditableValues] = useState&lt; Readonly&lt;Record&lt;string, EditableOperationValues&gt;&gt; &gt;(() =&gt; Object.fromEntries( operations.flatMap((operation) =&gt; { const values = editableOperationValues(operation); return values ? [[operation.operationId, values]] : []; }), ), ) |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 213 | field/input · OrbitTodayDecisionForm | {operation.title} {operation.effectSummary} | onchange: (event) =&gt; setSelected((current) =&gt; event.target.checked ? [...current, operation.operationId] : current.filter((id) =&gt; id !== operation.operationId), ) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 248 | field/textarea · OrbitTodayDecisionForm | operation.operationType === "save_event_goal" ? "本场活动目标" : "消息草稿" | onchange: (event) =&gt; setEditableValues((current) =&gt; ({ ...current, [operation.operationId]: { ...current[operation.operationId], text: event.target.value, }, })) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 299 | field/input · OrbitTodayDecisionForm | operation.operationType === "create_followup_task" ? "任务标题" : "提醒标题" | onchange: (event) =&gt; setEditableValues((current) =&gt; ({ ...current, [operation.operationId]: { ...current[operation.operationId], title: event.target.value, }, })) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 324 | field/input · OrbitTodayDecisionForm | operation.operationType === "create_followup_task" ? "任务截止时间" : "提醒时间" | onchange: (event) =&gt; setEditableValues((current) =&gt; ({ ...current, [operation.operationId]: { ...current[operation.operationId], dueAt: event.target.value, }, })) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 359 | button/button · OrbitTodayDecisionForm | 确认执行 | onclick: () =&gt; void applyTransition("confirm") | {"disabled":"pending \|\| selected.length === 0","renderGateProps":[],"conditions":[]} |
| 369 | button/button · OrbitTodayDecisionForm | 稍后处理 | onclick: () =&gt; void applyTransition("defer") | {"disabled":"pending","renderGateProps":[],"conditions":[]} |
| 379 | button/button · OrbitTodayDecisionForm | 忽略 | onclick: () =&gt; void applyTransition("reject") | {"disabled":"pending","renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 172 | applyTransition | 调用 | POST | `/api/agent/ledger/${encodeURIComponent(entryId)}/transition` |
| 173 | applyTransition | 路径常量 | 见调用/handler | `/api/agent/ledger/${encodeURIComponent(entryId)}/transition` |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 248 | 属性 placeholder | operation.operationType === "save_event_goal" ? "例如：确认储能试点的决策人和下一步时间" : "编辑草稿内容；Orbit 不会自动发送" |
| 248 | 属性 aria-label | operation.operationType === "save_event_goal" ? "本场活动目标" : "消息草稿" |
| 299 | 属性 aria-label | operation.operationType === "create_followup_task" ? "任务标题" : "提醒标题" |
| 324 | 属性 aria-label | operation.operationType === "create_followup_task" ? "任务截止时间" : "提醒时间" |
| 365 | JSX文字 | 确认执行 |
| 375 | JSX文字 | 稍后处理 |
| 385 | JSX文字 | 忽略 |

## repos/orbits/app/(app)/app/today/orbit-today-decision-panel.tsx

源码：[orbit-today-decision-panel.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/today/orbit-today-decision-panel.tsx>)

静态来源入口：`/app/today`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 42 | OrbitTodayDecisionPanelBody | section |  |  |
| 43 | OrbitTodayDecisionPanelBody | h3 | 为什么现在出现? |  |
| 51 | OrbitTodayDecisionPanelBody | section |  |  |
| 52 | OrbitTodayDecisionPanelBody | h3 | 建议基于什么信息? |  |
| 65 | OrbitTodayDecisionPanelBody | section |  |  |
| 66 | OrbitTodayDecisionPanelBody | h3 | 确认后将会 |  |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 44 | JSX文字 | 为什么现在出现? |
| 53 | JSX文字 | 建议基于什么信息? |
| 67 | JSX文字 | 确认后将会 |
| 87 | JSX文字 | 消息只保存为草稿，不会自动发送；已执行的操作可在「全部安排」里撤销。 |

## repos/orbits/app/(app)/app/today/orbit-today-header-actions.tsx

源码：[orbit-today-header-actions.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/today/orbit-today-header-actions.tsx>)

静态来源入口：`/app/today`

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 30 | [addOpen, setAddOpen] = useState(false) |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 36 | button/button · OrbitTodayHeaderActions | {scheduleLabel} | onclick: () =&gt; setAddOpen(true) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 44 | link/a · OrbitTodayHeaderActions | Add a source / 添加来源 | /app/contacts/new | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 48 | button/button · OrbitTodayHeaderActions | scheduleLabel | onclick: () =&gt; setAddOpen(true) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 57 | callback-control/AddScheduleModal · OrbitTodayHeaderActions |  | onclose: () =&gt; setAddOpen(false) | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 32 | 翻译 en | "Schedule a meeting" |
| 32 | 翻译 zh | "安排约见" |
| 46 | 翻译 en | "Add a source" |
| 46 | 翻译 zh | "添加来源" |
| 48 | 属性 aria-label | scheduleLabel |

## repos/orbits/app/(app)/app/today/orbit-today-item-opened.tsx

源码：[orbit-today-item-opened.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/today/orbit-today-item-opened.tsx>)

静态来源入口：`/app/today`

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 8 | OrbitTodayItemOpened | 调用 | POST | `/api/agent/actions/${encodeURIComponent(actionId)}/view` |
| 9 | OrbitTodayItemOpened | 路径常量 | 见调用/handler | `/api/agent/actions/${encodeURIComponent(actionId)}/view` |

## repos/orbits/app/(app)/app/today/orbit-today-pre-event-brief.tsx

源码：[orbit-today-pre-event-brief.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/today/orbit-today-pre-event-brief.tsx>)

静态来源入口：`/app/today`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 42 | OrbitTodayPreEventBrief | section | brief.preparationGaps.length &gt; 0 ? ( &lt;div&gt; &lt;div className="eyebrow" style={{ marginBottom: 4 }}&gt;准备缺口&lt;/div&gt; &lt;ul style={{ color: "var(--text-2)", fontSize: 13, lineHeight: 1.7, margin: 0, paddingLeft: 18 }}&gt; {brief.preparationGaps.map((gap) =&gt; &lt;li key={gap}&gt;{gap}&lt;/li&gt;)} &lt;/ul&gt; &lt;/div&gt; ) : null |  |
| 56 | OrbitTodayPreEventBrief | h3 | brief.title |  |
| 98 | OrbitTodayPreEventBrief | h4 | person.displayName person.organization ? ` · ${person.organization}` : "" |  |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 55 | JSX文字 | 会前 Brief |
| 66 | JSX文字 | 本场目标 |
| 74 | JSX文字 | 准备缺口 |
| 82 | JSX文字 | 重点人物 · 最多 3 位 |
| 106 | JSX文字 | 上次互动： |
| 108 | 属性 label | 证据 |
| 117 | 属性 label | 建议话题 |
| 118 | 属性 label | 未完成承诺 |

## repos/orbits/app/(app)/app/today/orbit-today-time-spine.tsx

源码：[orbit-today-time-spine.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/today/orbit-today-time-spine.tsx>)

静态来源入口：`/app/today`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 196 | MonthCalendar | h2 | language === "en" ? `${MON_EN[m]} ${y}` : `${y} 年 ${m + 1} 月` | h-title |
| 427 | ScheduleListPanel | h3 | mode === "day" && selDate ? dateTitle(selDate) : language === "en" ? `${MON_EN[view.m]} schedule` : `${view.m + 1} 月安排` | h-section |
| 529 | AddScheduleModal | h2 | t({ en: "Schedule a meeting", zh: "安排约见" }) | h-title |

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 64 | [open, setOpen] = useState(Boolean(defaultOpen)) |
| 310 | [weekStart, setWeekStart] = useState&lt;Date&gt;(() =&gt; startOfWeekSun(anchor.y, anchor.m, anchor.d ?? today.d), ) |
| 396 | [modeState, setModeState] = useState&lt;"day" \| "month"&gt;(modeProp ?? "day") |
| 575 | [view, setView] = useState&lt;CalendarView&gt;({ y: viewModel.today.y, m: viewModel.today.m }) |
| 576 | [selected, setSelectedState] = useState&lt;CalendarView&gt;( () =&gt; (initialSelected.d != null ? initialSelected : firstDayWithMeetings(viewModel)), ) |
| 581 | [monthSheetOpen, setMonthSheetOpen] = useState(false) |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 77 | button/button · SchedRow | `${schedule.time} ${connection.displayName}，${open ? t({ en: "collapse details", zh: "收起详情" }) : t({ en: "expand details", zh: "展开详情" })}` | onclick: () =&gt; setOpen((value) =&gt; !value) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 112 | link/a · SchedRow | View contact / 查看名片 | detailHref | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 115 | button/button · SchedRow | Draft email / 起草邮件 | onclick: () =&gt; openRelationshipInboxCompose({ contactId, organization: connection.company, recipient: connection.displayName, subject: topic, }) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 198 | button/button · MonthCalendar | t({ en: "Previous month", zh: "上个月" }) | onclick: () =&gt; shift(-1) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 201 | button/button · MonthCalendar | Today / 今天 | onclick: () =&gt; setView({ y: today.y, m: today.m }) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 204 | button/button · MonthCalendar | t({ en: "Next month", zh: "下个月" }) | onclick: () =&gt; shift(1) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 222 | button/button · MonthCalendar | {day} {&lt;span style={{ display: "flex", gap: 4, justifyContent: "center" }}&gt; {events.slice(0, 3).map((event, eventIndex) =&gt; &lt;span key={`${event.id}-${eventIndex}`} style={{ background: scheduleStatusColor(event.status).c, borderRadius: "var(--r-pill)", height: 5, width: 5 }} /&gt;)} &lt;/span&gt;} / {null} / {&lt;span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}&gt; {events.slice(0, 2).map((event) =&gt; { const status = scheduleStatusColor(event.status); return ( &lt;s …（完整表达式见源码） | onclick: () =&gt; setSelected({ y, m, d: day }) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 276 | button/button · WeekNavButton | ariaLabel | onclick: onClick | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 337 | callback-control/WeekNavButton · WeekStrip |  | onclick: () =&gt; shiftWeek(-1) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 338 | button/button · WeekStrip | Full month / 全月 | onclick: onOpenMonth | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 341 | callback-control/WeekNavButton · WeekStrip |  | onclick: () =&gt; shiftWeek(1) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 353 | button/button · WeekStrip | {weekdays[date.getDay()]} {d} {&lt;span className="orbit-week-strip-dot" /&gt;} / {null} | onclick: () =&gt; setSelected({ d, m, y }) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 442 | button/button · ScheduleListPanel | This day / 当日 | onclick: () =&gt; setMode("day") | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 445 | button/button · ScheduleListPanel | This month / 本月全部 | onclick: () =&gt; setMode("month") | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 480 | button/button · ScheduleListPanel | {`${MON_EN[view.m]} ${day}`} / {`${view.m + 1}月${day}日`} {weekdayName(date)} / {`周${weekdayName(date)}`} {monthList.filter((s) =&gt; s.date === dateStr).length} | onclick: () =&gt; setSelected({ y: date.getFullYear(), m: date.getMonth(), d: day }) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 528 | callback-control/ModalShell · AddScheduleModal | Schedule a meeting / 安排约见 Meeting scheduling is not configured yet. Orbit will not create a meeting, update relationship history, write to a calendar, or send an invitation. / 约见服务暂未配置。Orbit 不会创建约见、更新交往记录、写入日历或发送邀请。 Got it / 知道了 | onclose: onClose | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 541 | button/button · AddScheduleModal | Got it / 知道了 | onclick: onClose | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 621 | callback-control/WeekStrip · OrbitTodayTimeSpine |  | onopenmonth: () =&gt; setMonthSheetOpen(true) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 642 | callback-control/ModalShell · OrbitTodayTimeSpine |  | onclose: () =&gt; setMonthSheetOpen(false) | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 77 | 属性 aria-label | `${schedule.time} ${connection.displayName}，${open ? t({ en: "collapse details", zh: "收起详情" }) : t({ en: "expand details", zh: "展开详情" })}` |
| 79 | 翻译 en | "collapse details" |
| 79 | 翻译 zh | "收起详情" |
| 79 | 翻译 en | "expand details" |
| 79 | 翻译 zh | "展开详情" |
| 113 | 翻译 en | "View contact" |
| 113 | 翻译 zh | "查看名片" |
| 128 | 翻译 en | "Draft email" |
| 128 | 翻译 zh | "起草邮件" |
| 134 | 翻译 en | "No contact is linked to this item." |
| 135 | 翻译 zh | "这条安排还没关联联系人；在活动里交换名片后，这里就能直接查看名片、起草邮件。" |
| 198 | 属性 aria-label | t({ en: "Previous month", zh: "上个月" }) |
| 198 | 翻译 en | "Previous month" |
| 198 | 翻译 zh | "上个月" |
| 202 | 翻译 en | "Today" |
| 202 | 翻译 zh | "今天" |
| 204 | 属性 aria-label | t({ en: "Next month", zh: "下个月" }) |
| 204 | 翻译 en | "Next month" |
| 204 | 翻译 zh | "下个月" |
| 276 | 属性 aria-label | ariaLabel |
| 337 | 翻译 en | "Previous week" |
| 337 | 翻译 zh | "上一周" |
| 339 | 翻译 en | "Full month" |
| 339 | 翻译 zh | "全月" |
| 341 | 翻译 en | "Next week" |
| 341 | 翻译 zh | "下一周" |
| 438 | 翻译 en | `${count} meetings` |
| 438 | 翻译 zh | `${count} 场` |
| 443 | 翻译 en | "This day" |
| 443 | 翻译 zh | "当日" |
| 446 | 翻译 en | "This month" |
| 446 | 翻译 zh | "本月全部" |
| 467 | 翻译 en | "No meetings on this day." |
| 467 | 翻译 zh | "这一天暂无安排。" |
| 468 | 翻译 en | "Pick another date, or view the whole month." |
| 468 | 翻译 zh | "换一天，或查看本月全部。" |
| 511 | 翻译 en | "No meetings this month." |
| 511 | 翻译 zh | "本月暂无约见。" |
| 512 | 翻译 en | "Pick a date on the calendar to schedule one." |
| 512 | 翻译 zh | "点左侧日历安排一场。" |
| 528 | 翻译 en | "Schedule a meeting" |
| 528 | 翻译 zh | "安排约见" |
| 529 | 翻译 en | "Schedule a meeting" |
| 529 | 翻译 zh | "安排约见" |
| 536 | 翻译 en | "Meeting scheduling is not configured yet. Orbit will not create a meeting, update relationship history, write to a calendar, or send an invitation." |
| 537 | 翻译 zh | "约见服务暂未配置。Orbit 不会创建约见、更新交往记录、写入日历或发送邀请。" |
| 542 | 翻译 en | "Got it" |
| 542 | 翻译 zh | "知道了" |
| 642 | 属性 label | t({ en: "Full month", zh: "全月" }) |
| 643 | 翻译 en | "Full month" |
| 643 | 翻译 zh | "全月" |
| 645 | 翻译 en | "Full month" |
| 645 | 翻译 zh | "全月" |

## repos/orbits/app/(app)/app/today/today-page-content.tsx

源码：[today-page-content.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/today/today-page-content.tsx>)

静态来源入口：`/app/today`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 92 | TimeSpineErrorCard | h2 | error.title |  |
| 174 | AppTodayPageContent | main |  |  |
| 201 | AppTodayPageContent | header |  |  |
| 213 | AppTodayPageContent | h1 | greetingHeadline(merged) |  |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 76 | link/a · RouteStateRecoveryActions | {action.label} | action.href | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 74 | 属性 aria-label | 恢复操作 |
| 91 | JSX文字 | 日程 |

## repos/orbits/app/(app)/app/today/today-section-presentation.ts

源码：[today-section-presentation.ts](</Users/li/work/orbit/repos/orbits/app/(app)/app/today/today-section-presentation.ts>)

静态来源入口：`/app/today`

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 12 | 文案/数据常量 decide | "Needs your decision" |
| 13 | 文案/数据常量 prepared | "Prepared by Orbit" |
| 14 | 文案/数据常量 recent | "Recent activity" |
| 17 | 文案/数据常量 decide | "判断が必要" |
| 18 | 文案/数据常量 prepared | "Orbit が準備済み" |
| 19 | 文案/数据常量 recent | "最近の動き" |
| 22 | 文案/数据常量 decide | "需要你决定" |
| 23 | 文案/数据常量 prepared | "已准备的操作" |
| 24 | 文案/数据常量 recent | "最近动态" |
| 33 | 文案/数据常量 保存到 Agent Memory | "Save to Agent Memory" |
| 34 | 文案/数据常量 保存消息草稿 | "Save message draft" |
| 35 | 文案/数据常量 创建提醒 | "Create reminder" |
| 36 | 文案/数据常量 创建跟进任务 | "Create follow-up task" |
| 37 | 文案/数据常量 同步到 Google Calendar | "Sync to Google Calendar" |
| 38 | 文案/数据常量 同步到 Microsoft Calendar | "Sync to Microsoft Calendar" |
| 41 | 文案/数据常量 保存到 Agent Memory | "Agent Memory に保存" |
| 42 | 文案/数据常量 保存消息草稿 | "メッセージ下書きを保存" |
| 43 | 文案/数据常量 创建提醒 | "リマインダーを作成" |
| 44 | 文案/数据常量 创建跟进任务 | "フォローアップタスクを作成" |
| 45 | 文案/数据常量 同步到 Google Calendar | "Google カレンダーに同期" |
| 46 | 文案/数据常量 同步到 Microsoft Calendar | "Microsoft カレンダーに同期" |

## repos/orbits/features/chat/chat-conversation-and-message-mock/debug-view.tsx

源码：[debug-view.tsx](</Users/li/work/orbit/repos/orbits/features/chat/chat-conversation-and-message-mock/debug-view.tsx>)

静态来源入口：`/dev/capabilities/[slug]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 465 | ChatConversationAndMessageMockDemo | header |  | workbench-header |
| 467 | ChatConversationAndMessageMockDemo | h1 | Chat conversation and message mock |  |
| 487 | ChatConversationAndMessageMockDemo | header |  | workbench-header |
| 489 | ChatConversationAndMessageMockDemo | h1 | Chat conversation and message mock |  |
| 503 | ChatConversationAndMessageMockDemo | section | Chat conversation capability details | workbench-grid |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 90 | (module / render callback) | 路径常量 | 见调用/handler | "/api/chat/conversations" |
| 98 | (module / render callback) | 路径常量 | 见调用/handler | "/api/chat/conversations/demo-conversation-1" |
| 106 | (module / render callback) | 路径常量 | 见调用/handler | "/api/chat/conversations/demo-conversation-1/messages" |
| 119 | (module / render callback) | 路径常量 | 见调用/handler | "/api/chat/conversations?scenario=empty" |
| 127 | (module / render callback) | 路径常量 | 见调用/handler | "/api/chat/conversations?scenario=pending" |
| 135 | (module / render callback) | 路径常量 | 见调用/handler | "/api/chat/conversations?scenario=failure" |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 88 | 文案/数据常量 label | "List conversations" |
| 96 | 文案/数据常量 label | "Read message thread" |
| 104 | 文案/数据常量 label | "Record local mock message" |
| 117 | 文案/数据常量 label | "Empty conversation list" |
| 125 | 文案/数据常量 label | "Pending local transport" |
| 133 | 文案/数据常量 label | "Controlled failure" |
| 168 | JSX文字 | Request body: |
| 169 | JSX文字 | CHAT_MESSAGE_BODY_REQUIRED |
| 180 | 属性 aria-label | Chat conversation evidence |
| 196 | 属性 aria-label | Chat conversation summaries |
| 212 | JSX文字 | One-to-one context: |
| 229 | 属性 aria-label | Chat message thread |
| 238 | JSX文字 | Source: |
| 238 | JSX文字 | . Delivery: |
| 254 | 属性 aria-label | Mock-only chat conversation execution checks |
| 259 | JSX文字 | Realtime boundary |
| 260 | JSX文字 | realtime transport false |
| 263 | JSX文字 | Subscription boundary |
| 264 | JSX文字 | websocket subscription false |
| 267 | JSX文字 | Storage boundary |
| 268 | JSX文字 | production message storage false |
| 271 | JSX文字 | Notification boundary |
| 292 | 属性 title | Ready for verifier review |
| 298 | JSX文字 | Scan this first: chat conversations and messages are assembled from local relationship evidence, not live transport, subscription channels, production message storage, AI, email, calendar, device, or notification services. |
| 303 | 属性 aria-label | Chat conversation operator checkpoint |
| 308 | JSX文字 | Conversation count |
| 309 | JSX文字 | source-backed conversations |
| 312 | JSX文字 | Top conversation |
| 318 | JSX文字 | One-to-one contact |
| 322 | JSX文字 | Send-message state |
| 326 | JSX文字 | Storage boundary |
| 327 | JSX文字 | production message storage false |
| 347 | 属性 title | Harness-visible states |
| 348 | 属性 aria-label | Chat conversation state matrix |
| 353 | JSX文字 | Success state |
| 356 | JSX文字 | Success probe: GET /api/chat/conversations |
| 359 | JSX文字 | Success: |
| 359 | JSX文字 | conversations |
| 363 | JSX文字 | Empty state |
| 366 | JSX文字 | Empty probe: GET /api/chat/conversations?scenario=empty |
| 369 | JSX文字 | Empty: no one-to-one chat context |
| 373 | JSX文字 | Pending state |
| 376 | JSX文字 | Pending probe: GET /api/chat/conversations?scenario=pending |
| 379 | JSX文字 | Pending: local transport handshake |
| 383 | JSX文字 | Failure state |
| 386 | JSX文字 | Failure probe: GET /api/chat/conversations?scenario=failure |
| 389 | JSX文字 | Failure: controlled error |
| 394 | JSX文字 | Empty and pending states stay successful envelopes; controlled failures are explicit service-unavailable envelopes. |
| 466 | JSX文字 | Developer capability runtime |
| 467 | JSX文字 | Chat conversation and message mock |
| 469 | JSX文字 | The deterministic chat fixtures did not load, so the dev surface stopped inside a controlled local state. |
| 488 | JSX文字 | Developer capability runtime |
| 489 | JSX文字 | Chat conversation and message mock |
| 491 | JSX文字 | Dev-only surface for verifying the chat conversation boundary. It renders conversation lists, a message thread, one-to-one context, and send-message state from deterministic local fixtures. |
| 503 | 属性 aria-label | Chat conversation capability details |
| 507 | 属性 title | Two source-backed one-to-one chats |
| 516 | 属性 title | Maya Chen messages |
| 521 | 属性 title | Provider boundaries |
| 524 | JSX文字 | Message previews stay local until live provider files, confirmation rules, and replacement tests are explicitly added. |
| 537 | 属性 title | Declared probes |
| 543 | JSX文字 | Expected status: |
| 552 | 属性 title | Replacement notes |
| 555 | JSX文字 | Handoff doc |
| 561 | JSX文字 | Switch mechanism |
| 563 | JSX文字 | ORBIT_CHAT_CONVERSATION_PROVIDER |
| 563 | JSX文字 | remains documented before any live service is wired. |

## repos/orbits/features/chat/chat-privacy-controls-mock/debug-view.tsx

源码：[debug-view.tsx](</Users/li/work/orbit/repos/orbits/features/chat/chat-privacy-controls-mock/debug-view.tsx>)

静态来源入口：`/dev/capabilities/[slug]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 437 | ChatPrivacyControlsMockDemo | header |  | workbench-header |
| 439 | ChatPrivacyControlsMockDemo | h1 | Chat privacy controls mock |  |
| 459 | ChatPrivacyControlsMockDemo | header |  | workbench-header |
| 461 | ChatPrivacyControlsMockDemo | h1 | Chat privacy controls mock |  |
| 472 | ChatPrivacyControlsMockDemo | section | Chat privacy controls capability details | workbench-grid |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 177 | form-submit-boundary/form · ApiProbeForm | probe.ariaLabel |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 184 | button/button · ApiProbeForm | {probe.submitLabel} |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 86 | (module / render callback) | 路径常量 | 见调用/handler | "/api/chat/privacy" |
| 96 | (module / render callback) | 路径常量 | 见调用/handler | "/api/chat/privacy/analysis-toggle" |
| 106 | (module / render callback) | 路径常量 | 见调用/handler | "/api/chat/privacy?scenario=empty" |
| 116 | (module / render callback) | 路径常量 | 见调用/handler | "/api/chat/privacy?scenario=pending" |
| 126 | (module / render callback) | 路径常量 | 见调用/handler | "/api/chat/privacy?scenario=failure" |
| 174 | ApiProbeForm | 路径常量 | 见调用/handler | "/api/chat/privacy/analysis-toggle" |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 84 | 文案/数据常量 label | "Privacy controls" |
| 94 | 文案/数据常量 label | "Analysis opt-in toggle" |
| 104 | 文案/数据常量 label | "Empty privacy controls" |
| 114 | 文案/数据常量 label | "Pending privacy controls" |
| 124 | 文案/数据常量 label | "Controlled failure" |
| 177 | 属性 aria-label | probe.ariaLabel |
| 193 | 属性 aria-label | Chat privacy controls evidence |
| 228 | 属性 aria-label | Hidden private notes |
| 234 | JSX文字 | Private notes hidden |
| 239 | JSX文字 | body redacted true |
| 240 | JSX文字 | visible to AI analysis false |
| 241 | JSX文字 | visible in share preview false |
| 256 | 属性 aria-label | Mock-only chat privacy execution checks |
| 261 | JSX文字 | AI analysis provider |
| 262 | JSX文字 | AI provider false |
| 265 | JSX文字 | External network |
| 266 | JSX文字 | external network false |
| 269 | JSX文字 | Settings persistence |
| 270 | JSX文字 | database write false |
| 273 | JSX文字 | Production audit |
| 274 | JSX文字 | privacy audit log false |
| 277 | JSX文字 | Deletion worker |
| 278 | JSX文字 | production deletion false |
| 290 | 属性 title | Ready for verifier review |
| 296 | JSX文字 | Scan this first: chat privacy controls use deterministic local fixtures for Maya Chen and do not call AI providers, live databases, production deletion workers, privacy audit logs, external share actions, email, calendar, notification, network, or device services. |
| 301 | 属性 aria-label | Chat privacy controls operator checkpoint |
| 306 | JSX文字 | Relationship |
| 308 | JSX文字 | at |
| 312 | JSX文字 | AI analysis opt-in |
| 316 | JSX文字 | Delete-analysis state |
| 318 | JSX文字 | ; production deletion false |
| 322 | JSX文字 | Private notes hidden |
| 324 | JSX文字 | body redacted true; visible to AI analysis false |
| 328 | JSX文字 | Sensitive share confirmation |
| 329 | JSX文字 | confirmation required true |
| 349 | 属性 title | Harness-visible states |
| 350 | 属性 aria-label | Chat privacy controls state matrix |
| 355 | JSX文字 | Success state |
| 358 | JSX文字 | Success probe: GET /api/chat/privacy |
| 361 | JSX文字 | Success: opted in with hidden private notes |
| 365 | JSX文字 | Empty state |
| 368 | JSX文字 | Empty probe: GET /api/chat/privacy?scenario=empty |
| 371 | JSX文字 | Empty: no source-backed chat conversation |
| 375 | JSX文字 | Pending state |
| 378 | JSX文字 | Pending probe: GET /api/chat/privacy?scenario=pending |
| 381 | JSX文字 | Pending: local privacy confirmation |
| 385 | JSX文字 | Failure state |
| 388 | JSX文字 | Failure probe: GET /api/chat/privacy?scenario=failure |
| 391 | JSX文字 | Failure: controlled error |
| 396 | JSX文字 | Empty and pending states stay successful envelopes; controlled failures are explicit service-unavailable envelopes. |
| 438 | JSX文字 | Developer capability runtime |
| 439 | JSX文字 | Chat privacy controls mock |
| 441 | JSX文字 | The deterministic chat privacy controls fixtures did not load, so the dev surface stopped inside a controlled local state. |
| 460 | JSX文字 | Developer capability runtime |
| 461 | JSX文字 | Chat privacy controls mock |
| 463 | JSX文字 | Dev-only surface for verifying chat AI analysis opt-in, delete-analysis state, hidden private notes, and confirmation before sharing sensitive chat data. This page consumes the typed mock service and does not own privacy business logic. |
| 472 | 属性 aria-label | Chat privacy controls capability details |
| 476 | 属性 title | Controls stay source-backed |
| 485 | 属性 title | Provider boundaries |
| 488 | JSX文字 | Analysis opt-in changes, deletion state, private-note hiding, and sensitive-share confirmation are all deterministic mock outcomes. |
| 501 | 属性 title | Declared probes |
| 503 | JSX文字 | Browser-submit these probes to collect real envelopes. |
| 510 | JSX文字 | Expected status: |
| 523 | 属性 title | Replacement notes |
| 526 | JSX文字 | Handoff doc |
| 532 | JSX文字 | Switch mechanism |
| 534 | JSX文字 | ORBIT_MODULE_MODE=live |
| 534 | JSX文字 | uses the shared live database provider when database configuration is present. |

## repos/orbits/features/chat/chat-summary-and-extraction-mock/debug-view.tsx

源码：[debug-view.tsx](</Users/li/work/orbit/repos/orbits/features/chat/chat-summary-and-extraction-mock/debug-view.tsx>)

静态来源入口：`/dev/capabilities/[slug]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 504 | ChatSummaryExtractionMockDemo | header |  | workbench-header |
| 506 | ChatSummaryExtractionMockDemo | h1 | Chat summary and extraction mock |  |
| 526 | ChatSummaryExtractionMockDemo | header |  | workbench-header |
| 528 | ChatSummaryExtractionMockDemo | h1 | Chat summary and extraction mock |  |
| 539 | ChatSummaryExtractionMockDemo | section | Chat summary extraction capability details | workbench-grid |
| 563 | ChatSummaryExtractionMockDemo | section | Chat summary extraction groups | workbench-grid |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 180 | form-submit-boundary/form · ApiProbeForm | probe.ariaLabel |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 186 | button/button · ApiProbeForm | {probe.submitLabel} |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 90 | (module / render callback) | 路径常量 | 见调用/handler | "/api/chat/conversations/demo-conversation-1/summary" |
| 100 | (module / render callback) | 路径常量 | 见调用/handler | "/api/chat/conversations/demo-conversation-1/extractions" |
| 110 | (module / render callback) | 路径常量 | 见调用/handler | "/api/chat/conversations/demo-conversation-1/summary?scenario=empty" |
| 120 | (module / render callback) | 路径常量 | 见调用/handler | "/api/chat/conversations/demo-conversation-1/extractions?scenario=pending" |
| 130 | (module / render callback) | 路径常量 | 见调用/handler | "/api/chat/conversations/demo-conversation-1/extractions?scenario=failure" |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 88 | 文案/数据常量 label | "Summary success" |
| 98 | 文案/数据常量 label | "Extraction success" |
| 108 | 文案/数据常量 label | "Empty summary" |
| 118 | 文案/数据常量 label | "Pending extraction" |
| 128 | 文案/数据常量 label | "Controlled failure" |
| 180 | 属性 aria-label | probe.ariaLabel |
| 195 | 属性 aria-label | Chat summary extraction evidence |
| 210 | JSX文字 | Extracted needs |
| 226 | JSX文字 | Extracted tasks |
| 247 | JSX文字 | Relationship profile updates |
| 252 | JSX文字 | auto-applied false |
| 270 | JSX文字 | Confirmation-required profile suggestions |
| 276 | JSX文字 | confirmation required true, auto-applied false |
| 293 | 属性 aria-label | Mock-only chat summary extraction execution checks |
| 298 | JSX文字 | Summary provider |
| 299 | JSX文字 | AI provider false |
| 302 | JSX文字 | Network boundary |
| 303 | JSX文字 | external network false |
| 306 | JSX文字 | Profile persistence |
| 307 | JSX文字 | database write false |
| 310 | JSX文字 | Automatic profile mutation |
| 327 | 属性 title | Ready for verifier review |
| 333 | JSX文字 | Scan this first: chat summary and extraction are generated from local source evidence for Maya Chen without AI providers, external network, live database writes, email, calendar, notification, device access, or automatic profile mutation. |
| 338 | 属性 aria-label | Chat summary extraction operator checkpoint |
| 343 | JSX文字 | Conversation |
| 349 | JSX文字 | Summary |
| 353 | JSX文字 | Extraction groups |
| 354 | JSX文字 | 4 source-backed groups |
| 357 | JSX文字 | Provider boundary |
| 358 | JSX文字 | AI provider false |
| 361 | JSX文字 | Profile boundary |
| 362 | JSX文字 | auto-applied false |
| 382 | 属性 title | Harness-visible states |
| 383 | 属性 aria-label | Chat summary extraction state matrix |
| 388 | JSX文字 | Success state |
| 391 | JSX文字 | Success probe: POST /api/chat/conversations/demo-conversation-1/summary |
| 394 | JSX文字 | Success: summary and 4 extraction groups |
| 398 | JSX文字 | Empty state |
| 401 | JSX文字 | Empty probe: POST /api/chat/conversations/demo-conversation-1/summary?scenario=empty |
| 404 | JSX文字 | Empty: no source-backed chat messages |
| 408 | JSX文字 | Pending state |
| 411 | JSX文字 | Pending probe: GET /api/chat/conversations/demo-conversation-1/extractions?scenario=pending |
| 414 | JSX文字 | Pending: local extraction guard |
| 418 | JSX文字 | Failure state |
| 421 | JSX文字 | Failure probe: GET /api/chat/conversations/demo-conversation-1/extractions?scenario=failure |
| 424 | JSX文字 | Failure: controlled error |
| 429 | JSX文字 | Empty and pending states stay successful envelopes; controlled failures are explicit service-unavailable envelopes. |
| 505 | JSX文字 | Developer capability runtime |
| 506 | JSX文字 | Chat summary and extraction mock |
| 508 | JSX文字 | The deterministic chat summary fixtures did not load, so the dev surface stopped inside a controlled local state. |
| 527 | JSX文字 | Developer capability runtime |
| 528 | JSX文字 | Chat summary and extraction mock |
| 530 | JSX文字 | Dev-only surface for verifying the chat summary and extraction boundary. It converts source-backed chat evidence into a summary, extracted needs, tasks, and profile suggestions without mutating relationship data automatically. |
| 539 | 属性 aria-label | Chat summary extraction capability details |
| 543 | 属性 title | Source-backed summary |
| 554 | 属性 title | Provider boundaries |
| 557 | JSX文字 | Extracted profile changes stay local until a confirmation guard and live service switch are explicitly added. |
| 563 | 属性 aria-label | Chat summary extraction groups |
| 567 | 属性 title | Extracted needs |
| 570 | 属性 title | Extracted tasks |
| 573 | 属性 title | Relationship profile updates |
| 581 | 属性 title | Confirmation-required profile suggestions |
| 600 | 属性 title | Declared probes |
| 606 | JSX文字 | Expected status: |
| 614 | JSX文字 | Browser-submit these probes to collect real envelopes from the mock-backed route handlers. |
| 617 | 属性 aria-label | Browser-submittable chat summary extraction API probes |
| 628 | 属性 title | Replacement notes |
| 631 | JSX文字 | Handoff doc |
| 637 | JSX文字 | Switch mechanism |
| 639 | JSX文字 | ORBIT_CHAT_SUMMARY_EXTRACTION_PROVIDER |
| 639 | JSX文字 | remains documented before any live service is wired. |

## repos/orbits/features/chat/chat-writing-assist-mock/debug-view.tsx

源码：[debug-view.tsx](</Users/li/work/orbit/repos/orbits/features/chat/chat-writing-assist-mock/debug-view.tsx>)

静态来源入口：`/dev/capabilities/[slug]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 459 | ChatWritingAssistMockDemo | header |  | workbench-header |
| 461 | ChatWritingAssistMockDemo | h1 | Chat writing assist mock |  |
| 481 | ChatWritingAssistMockDemo | header |  | workbench-header |
| 483 | ChatWritingAssistMockDemo | h1 | Chat writing assist mock |  |
| 493 | ChatWritingAssistMockDemo | section | Chat writing assist capability details | workbench-grid |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 89 | (module / render callback) | 路径常量 | 见调用/handler | "/api/chat/assist/rewrite" |
| 97 | (module / render callback) | 路径常量 | 见调用/handler | "/api/chat/assist/followup-draft" |
| 105 | (module / render callback) | 路径常量 | 见调用/handler | "/api/chat/assist/followup-draft?scenario=empty" |
| 113 | (module / render callback) | 路径常量 | 见调用/handler | "/api/chat/assist/rewrite?scenario=pending" |
| 121 | (module / render callback) | 路径常量 | 见调用/handler | "/api/chat/assist/rewrite?scenario=failure" |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 87 | 文案/数据常量 label | "Polite rewrite" |
| 95 | 文案/数据常量 label | "Follow-up draft" |
| 103 | 文案/数据常量 label | "Empty follow-up draft" |
| 111 | 文案/数据常量 label | "Pending polite rewrite" |
| 119 | 文案/数据常量 label | "Controlled failure" |
| 179 | 属性 aria-label | Chat writing assist evidence |
| 195 | 属性 aria-label | Generated chat assists with assist-level audits |
| 209 | 属性 aria-label | `Audit chat assist ${assist.assistId}` |
| 213 | JSX文字 | Source: |
| 215 | JSX文字 | Provider boundary: |
| 219 | JSX文字 | Verification instruction: |
| 236 | 属性 aria-label | Mock-only chat writing assist execution checks |
| 241 | JSX文字 | Writing provider |
| 242 | JSX文字 | AI provider false |
| 245 | JSX文字 | External delivery |
| 246 | JSX文字 | external send false |
| 249 | JSX文字 | Message persistence |
| 250 | JSX文字 | database write false |
| 253 | JSX文字 | Notification delivery |
| 270 | 属性 title | Ready for verifier review |
| 276 | JSX文字 | Scan this first: chat writing assistance is generated from local relationship evidence, not AI writing providers, external send channels, live persistence, email, calendar, or notification services. |
| 280 | 属性 aria-label | Chat writing assist operator checkpoint |
| 285 | JSX文字 | Assist count |
| 286 | JSX文字 | source-backed assists |
| 289 | JSX文字 | Top assist |
| 295 | JSX文字 | First assist kind |
| 299 | JSX文字 | Writing boundary |
| 300 | JSX文字 | AI provider false |
| 303 | JSX文字 | Delivery boundary |
| 304 | JSX文字 | external send false |
| 324 | 属性 title | Harness-visible states |
| 325 | 属性 aria-label | Chat writing assist state matrix |
| 330 | JSX文字 | Success state |
| 333 | JSX文字 | Success probe: POST /api/chat/assist/rewrite |
| 336 | JSX文字 | Success: |
| 336 | JSX文字 | chat assists |
| 340 | JSX文字 | Empty state |
| 343 | JSX文字 | Empty probe: POST /api/chat/assist/followup-draft?scenario=empty |
| 346 | JSX文字 | Empty: no source-backed chat context |
| 350 | JSX文字 | Pending state |
| 353 | JSX文字 | Pending probe: POST /api/chat/assist/rewrite?scenario=pending |
| 356 | JSX文字 | Pending: local writing guard |
| 360 | JSX文字 | Failure state |
| 363 | JSX文字 | Failure probe: POST /api/chat/assist/rewrite?scenario=failure |
| 366 | JSX文字 | Failure: controlled error |
| 371 | JSX文字 | Empty and pending states stay successful envelopes; controlled failures are explicit service-unavailable envelopes. |
| 422 | 文案/数据常量 summary | "Local rules prepared polite rewrite, follow-up draft, appointment suggestion, and quick greeting assists from source-backed chat context." |
| 460 | JSX文字 | Developer capability runtime |
| 461 | JSX文字 | Chat writing assist mock |
| 463 | JSX文字 | The deterministic chat writing assist fixtures did not load, so the dev surface stopped inside a controlled local state. |
| 482 | JSX文字 | Developer capability runtime |
| 483 | JSX文字 | Chat writing assist mock |
| 485 | JSX文字 | Dev-only surface for verifying the chat writing assist boundary. It turns relationship evidence into chat assistance without AI writing, external send channels, live persistence, or delivery services. |
| 493 | 属性 aria-label | Chat writing assist capability details |
| 497 | 属性 title | Four chat assists |
| 506 | 属性 title | Provider boundaries |
| 509 | JSX文字 | Chat copy stays local until a confirmation guard and live provider switch are explicitly added. |
| 522 | 属性 title | Declared probes |
| 528 | JSX文字 | Expected status: |
| 536 | 属性 title | Replacement notes |
| 539 | JSX文字 | Handoff doc |
| 545 | JSX文字 | Switch mechanism |
| 547 | JSX文字 | ORBIT_MODULE_MODE=live |
| 547 | JSX文字 | uses the shared live database provider when database configuration is present. |


