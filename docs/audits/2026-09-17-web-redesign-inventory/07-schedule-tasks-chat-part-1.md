# 07-schedule-tasks-chat：源码明细

证据级别：当前工作区源码。此表列出符号级静态可达实现，不宣称每项都在某个角色/状态实际显示。按钮按 JSX 实现记录；数组 map 可生成多项按钮，条件分支互斥，不能把实现数当 DOM 按钮数。

调用表按所属函数提供 HTTP 路径/方法证据；与按钮 handler 是否连通应结合 handler 源码核对。仅同一文件出现的 API 不等于该按钮调用它。路径常量不是一次额外请求。跨文件、动态路径和 callback 不强行配对。

文案包含原有中文/英文/日文及动态表达式。表格中的长表达式节选有标记；完整内容在对应源码。布局表只证明 HTML/ARIA 分区，不证明实际视觉位置。全局 shell 与 layout 另见 01、02。开发页共享组件的来源入口会标为 /dev，不算客户页面。

## repos/orbits/app/(app)/app/chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-route-view-model.ts

源码：[chat-route-view-model.ts](</Users/li/work/orbit/repos/orbits/app/(app)/app/chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-route-view-model.ts>)

静态来源入口：`/app/agent`

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 290 | 文案/数据常量 description | "Add source-backed relationship context before reviewing conversations, assists, summaries, and privacy controls." |
| 292 | 文案/数据常量 emptyState | "No conversation has enough source evidence for chat review." |
| 294 | 文案/数据常量 guardrail | "Orbit cannot prepare replies, summaries, profile updates, or sharing previews from an empty conversation queue." |
| 296 | 文案/数据常量 nextStep | "Return when a conversation has source evidence and consent." |
| 297 | 文案/数据常量 purpose | "Keep chat review useful when no sourced relationship context is available." |
| 299 | 文案/数据常量 title | "No chat context is ready" |
| 305 | 文案/数据常量 description | "Conversation review stays paused while local consent and source evidence are checked." |
| 307 | 文案/数据常量 emptyState | "Conversation records stay hidden while consent is still being checked." |
| 309 | 文案/数据常量 guardrail | "Orbit will not prepare replies, summarize context, update profiles, or share private notes while review is pending." |
| 311 | 文案/数据常量 nextStep | "Return to chat after consent and source evidence are ready." |
| 312 | 文案/数据常量 purpose | "Keep chat work visible without exposing an unfinished conversation review." |
| 314 | 文案/数据常量 title | "Chat context is still checking consent" |
| 319 | 文案/数据常量 description | "Conversation review is unavailable while source evidence and privacy controls are checked." |
| 321 | 文案/数据常量 emptyState | "The chat workspace is unavailable until source evidence recovers." |
| 323 | 文案/数据常量 guardrail | "Orbit will not prepare replies, summarize context, update profiles, or share private notes while this is unavailable." |
| 325 | 文案/数据常量 nextStep | "Reload chat before taking action." |
| 326 | 文案/数据常量 purpose | "Show a visible recovery path when source-backed chat context is unavailable." |
| 328 | 文案/数据常量 title | "Chat workspace could not load" |
| 337 | 文案/数据常量 description | "The requested conversation is not available in the current source-backed chat list." |
| 339 | 文案/数据常量 emptyState | "No sourced conversation matches this conversation ID." |
| 340 | 文案/数据常量 guardrail | "Orbit will not substitute another person's thread, summary, relationship context, or writing suggestion." |
| 342 | 文案/数据常量 nextStep | "Return to Chat and choose a conversation from the current sourced list." |
| 344 | 文案/数据常量 purpose | "Keep conversation identity exact when a bookmarked or shared link is no longer available." |
| 346 | 文案/数据常量 title | "Conversation not found" |

## repos/orbits/app/(app)/app/chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-service-factory.ts

源码：[chat-service-factory.ts](</Users/li/work/orbit/repos/orbits/app/(app)/app/chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-service-factory.ts>)

静态来源入口：`/app/agent`

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 110 | 文案/数据常量 message | "Chat page services are unavailable in the requested mode." |

## repos/orbits/app/(app)/app/chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-view-model-adapter.ts

源码：[chat-view-model-adapter.ts](</Users/li/work/orbit/repos/orbits/app/(app)/app/chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-view-model-adapter.ts>)

静态来源入口：`/app/agent`

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 116 | 文案/数据常量 label | "生成跟进消息" |
| 117 | 文案/数据常量 label | "润色当前回复" |
| 118 | 文案/数据常量 label | "总结关系上下文" |

## repos/orbits/app/(app)/app/tasks/personal-schedule-client.ts

源码：[personal-schedule-client.ts](</Users/li/work/orbit/repos/orbits/app/(app)/app/tasks/personal-schedule-client.ts>)

静态来源入口：`/app/tasks/personal`

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 6 | path | 路径常量 | 见调用/handler | `/api/schedule-items${id ? "/" + encodeURIComponent(id) : ""}` |
| 31 | createPersonalScheduleClient | 调用 | GET/由封装决定 | path(id) |
| 32 | createPersonalScheduleClient | 调用 | GET/由封装决定 | path() |
| 37 | createPersonalScheduleClient | 调用 | GET/由封装决定 | path(baseline?.id) |
| 38 | createPersonalScheduleClient | 调用 | GET/由封装决定 | path(baseline.id) |

## repos/orbits/app/(app)/app/tasks/personal-schedule-workspace.tsx

源码：[personal-schedule-workspace.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/tasks/personal-schedule-workspace.tsx>)

静态来源入口：`/app/tasks/personal`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 26 | PersonalScheduleWorkspace | section | list.error ? &lt;p role="alert"&gt;个人日程读取失败，请重试。&lt;/p&gt; : null list.loading ? &lt;p role="status"&gt;正在读取个人日程…&lt;/p&gt; : null list.data?.length === 0 ? &lt;p&gt;暂无个人日程&lt;/p&gt; : null selected !== undefined && (selected === null \|\| item) ? &lt;PersonalEditor key={actorId + ":" + (selected ?? "new")} item={item} client={client} onSaved={value =&gt; { setL …（完整表达式见源码） |  |
| 42 | PersonalEditor | section | 个人日程编辑 |  |
| 42 | PersonalEditor | h2 | baseline ? "编辑个人日程" : "新建个人日程" |  |

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 22 | [selected, setSelected] = useState&lt;string \| null \| undefined&gt;(undefined) |
| 23 | [lastSaved, setLastSaved] = useState&lt;PersonalScheduleContract \| null&gt;(null) |
| 36 | [zone] = useState(() =&gt; { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ""; } }) |
| 37 | [baseline, setBaseline] = useState(item) |
| 37 | [draft, setDraft] = useState(() =&gt; personalScheduleDraft(item, validTimeZone(zone) ? zone : "UTC")) |
| 38 | [validation, setValidation] = useState("") |
| 38 | [confirm, setConfirm] = useState(false) |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 27 | button/button · PersonalScheduleWorkspace | 新建个人日程 | onclick: () =&gt; setSelected(null) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 27 | button/button · PersonalScheduleWorkspace | 刷新个人日程 | onclick: list.refresh | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 31 | button/button · PersonalScheduleWorkspace | {item.title} {[p.date + " " + p.time, item.location, item.state === "ended" ? "已结束" : item.state === "ongoing" ? "进行中" : "已安排"].filter(Boolean).join(" · ")} | onclick: () =&gt; setSelected(item.id) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 32 | callback-control/PersonalEditor · PersonalScheduleWorkspace |  | onsaved: value =&gt; { setLastSaved(value); setSelected(value?.id); list.refresh(); } | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 43 | form-submit-boundary/form · PersonalEditor | {([["title", "日程标题", "text"], ["startDate", "开始日期", "date"], ["startTime", "开始时间", "time"], ["endDate", "结束日期", "date"], ["endTime", "结束时间", "time"], ["location", "日程地点", "text"]] as const).map(([field, label, type]) =&gt; &lt;label key={field}&gt;{label}&lt;input aria-label={label} type={type} value={draft[field]} disabled={mutation.busy} onChange={event =&gt; { const value = event.target.value; setDraft(previous =&gt; ({ ...previous, [field]: value })); }} /&gt;&lt;/label&gt;)} 保存个人日程 | onsubmit: async event =&gt; { event.preventDefault(); if (mutation.busy \|\| stale) return; const change = buildPersonalScheduleChange(baseline, draft, zone); if (change.kind === "invalid") { setValidation(change.message); return; } if (change.kind === "unchanged") return; setValidation(""); await mutation.run(() =&gt; client.save(baseline, change.fields), updated =&gt; { setBaseline(updated); setDraft(personalScheduleDraft(updated, zone)); onSaved(updated); }, "个人日程已保存"); } | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 49 | field/input · PersonalEditor | label | onchange: event =&gt; { const value = event.target.value; setDraft(previous =&gt; ({ ...previous, [field]: value })); } | {"disabled":"mutation.busy","renderGateProps":[],"conditions":[]} |
| 50 | button/button · PersonalEditor | 保存个人日程 |  | {"disabled":"mutation.busy \|\| stale","renderGateProps":[],"conditions":[]} |
| 52 | button/button · PersonalEditor | 放弃草稿并载入最新内容 | onclick: () =&gt; { setBaseline(item); setDraft(personalScheduleDraft(item, zone)); } | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 53 | button/button · PersonalEditor | 删除个人日程 | onclick: () =&gt; setConfirm(true) | {"disabled":"mutation.busy \|\| stale","renderGateProps":[],"conditions":[]} |
| 54 | button/button · PersonalEditor | 确认删除个人日程 | onclick: () =&gt; void mutation.run(() =&gt; client.remove(baseline), () =&gt; onSaved(null), "个人日程已删除") | {"disabled":"mutation.busy \|\| stale","renderGateProps":[],"conditions":[]} |
| 54 | button/button · PersonalEditor | 保留日程 | onclick: () =&gt; setConfirm(false) | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 17 | PersonalScheduleWorkspace | 调用 | GET/由封装决定 | url |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 27 | JSX文字 | 新建个人日程 |
| 27 | JSX文字 | 刷新个人日程 |
| 28 | JSX文字 | 个人日程读取失败，请重试。 |
| 29 | JSX文字 | 正在读取个人日程… |
| 30 | JSX文字 | 暂无个人日程 |
| 42 | 属性 aria-label | 个人日程编辑 |
| 42 | JSX文字 | 时间使用 |
| 42 | JSX文字 | 。结束时间和地点可以清空。 |
| 49 | 属性 aria-label | label |
| 50 | JSX文字 | 保存个人日程 |
| 52 | JSX文字 | 日程已更新，草稿已保留。 |
| 52 | JSX文字 | 放弃草稿并载入最新内容 |
| 53 | JSX文字 | 删除个人日程 |
| 54 | JSX文字 | 删除后，日程将从列表和日历移除。 |
| 54 | JSX文字 | 确认删除个人日程 |
| 54 | JSX文字 | 保留日程 |

## repos/orbits/app/(app)/app/tasks/personal/page.tsx

源码：[page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/tasks/personal/page.tsx>)

静态来源入口：`/app/tasks/personal`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 20 | PersonalSchedulePage | main |  |  |
| 20 | PersonalSchedulePage | h1 | 个人日程 |  |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 20 | link/a · PersonalSchedulePage | 返回待办 | /app/tasks | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 20 | JSX文字 | 返回待办 |
| 20 | JSX文字 | 个人日程 |

## repos/orbits/app/(app)/app/tasks/relationship-lifecycle-tasks-section.tsx

源码：[relationship-lifecycle-tasks-section.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/tasks/relationship-lifecycle-tasks-section.tsx>)

静态来源入口：`/app/tasks`、`/app/tasks/[id]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 79 | TaskGroup | h3 | label | relationship-lifecycle-task-group-heading |
| 93 | RelationshipLifecycleTasksSection | section | t({ zh: "人脉跟进", en: "Relationship follow-ups" }) | relationship-lifecycle-tasks |
| 94 | RelationshipLifecycleTasksSection | header |  | relationship-lifecycle-task-heading |
| 96 | RelationshipLifecycleTasksSection | h2 | t({ zh: "人脉跟进", en: "Relationship follow-ups" }) |  |
| 113 | RelationshipLifecycleTasksSection | details |  | relationship-lifecycle-task-history |
| 114 | RelationshipLifecycleTasksSection | summary | t({ zh: `历史跟进（${model.historyCount}）`, en: `Follow-up history (${model.historyCount})` }) |  |
| 120 | RelationshipLifecycleTasksSection | section | t({ zh: "无法关联的人脉跟进", en: "Unlinked relationship follow-ups" }) | relationship-lifecycle-task-orphans |
| 121 | RelationshipLifecycleTasksSection | h3 | t({ zh: `无法关联（${model.orphanCount}）`, en: `Unlinked (${model.orphanCount})` }) | relationship-lifecycle-task-group-heading |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 62 | link/a · RelationshipLifecycleTaskRow | 处理跟进 / Resolve follow-up | preserveHref(`/app/tasks/relationship/${encodeURIComponent(task.connectionId)}`) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 63 | link/a · RelationshipLifecycleTaskRow | 查看联系人 / View contact | preserveHref(task.operationHref) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 114 | disclosure/summary · RelationshipLifecycleTasksSection | {t({ zh: `历史跟进（${model.historyCount}）`, en: `Follow-up history (${model.historyCount})` })} |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 58 | 翻译 zh | "到期" |
| 58 | 翻译 en | "Due" |
| 62 | 翻译 zh | "处理跟进" |
| 62 | 翻译 en | "Resolve follow-up" |
| 64 | 翻译 zh | "查看联系人" |
| 64 | 翻译 en | "View contact" |
| 66 | 翻译 zh | "未关联，暂不可查看" |
| 66 | 翻译 en | "Unlinked; unavailable" |
| 82 | JSX文字 | 暂无记录。 |
| 93 | 属性 aria-label | t({ zh: "人脉跟进", en: "Relationship follow-ups" }) |
| 93 | 翻译 zh | "人脉跟进" |
| 93 | 翻译 en | "Relationship follow-ups" |
| 96 | 翻译 zh | "人脉跟进" |
| 96 | 翻译 en | "Relationship follow-ups" |
| 99 | 翻译 zh | "处理跟进时确认关系下一步；普通待办的完成不会改写人脉关系。" |
| 100 | 翻译 en | "Resolve a follow-up with an explicit next step for the relationship." |
| 107 | 翻译 zh | "人脉跟进暂不可用。" |
| 107 | 翻译 en | "Relationship follow-ups are unavailable." |
| 109 | 属性 label | t({ zh: `当前跟进（${model.currentCount}）`, en: `Current follow-ups (${model.currentCount})` }) |
| 111 | 翻译 zh | `当前跟进（${model.currentCount}）` |
| 111 | 翻译 en | `Current follow-ups (${model.currentCount})` |
| 114 | 翻译 zh | `历史跟进（${model.historyCount}）` |
| 114 | 翻译 en | `Follow-up history (${model.historyCount})` |
| 115 | 属性 label | t({ zh: "已完成/已忽略", en: "Completed / dismissed" }) |
| 117 | 翻译 zh | "已完成/已忽略" |
| 117 | 翻译 en | "Completed / dismissed" |
| 120 | 属性 aria-label | t({ zh: "无法关联的人脉跟进", en: "Unlinked relationship follow-ups" }) |
| 120 | 翻译 zh | "无法关联的人脉跟进" |
| 120 | 翻译 en | "Unlinked relationship follow-ups" |
| 121 | 翻译 zh | `无法关联（${model.orphanCount}）` |
| 121 | 翻译 en | `Unlinked (${model.orphanCount})` |

## repos/orbits/app/(app)/app/tasks/relationship/[id]/relationship-lifecycle-editor.tsx

源码：[relationship-lifecycle-editor.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/tasks/relationship/[id]/relationship-lifecycle-editor.tsx>)

静态来源入口：`/app/tasks/relationship/[id]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 65 | RelationshipLifecycleEditor | section | message ? &lt;p role="status"&gt;{message}&lt;/p&gt; : null model ? &lt;&gt;&lt;p&gt;当前阶段：{({ captured: "已记录", reviewing: "复核中", needs_follow_up: "需要跟进", active: "进行中", nurture: "培育中", archived: "已归档" } as Record&lt;string, string&gt;)[model.stage]} · &lt;a href={`/app/contacts/${encodeURIComponent(model.contactId)}`}&gt;查看联系人&lt;/a&gt;&lt;/p&gt; {currentTasks.lengt …（完整表达式见源码） | tasks-workspace |
| 66 | RelationshipLifecycleEditor | h1 | 处理人脉跟进 |  |
| 81 | RelationshipLifecycleEditor | h2 | 历史跟进 |  |

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 13 | [model, setModel] = useState&lt;Model \| null&gt;(null) |
| 14 | [taskId, setTaskId] = useState("") |
| 15 | [kind, setKind] = useState&lt;RelationshipCompletionInput["outcome"]["kind"]&gt;("next_task") |
| 16 | [title, setTitle] = useState("") |
| 17 | [due, setDue] = useState("") |
| 18 | [goal, setGoal] = useState("") |
| 19 | [archiveConfirmed, setArchiveConfirmed] = useState(false) |
| 20 | [busy, setBusy] = useState(false) |
| 21 | [message, setMessage] = useState("") |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 66 | link/a · RelationshipLifecycleEditor | 返回待办 | /app/tasks | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 68 | button/button · RelationshipLifecycleEditor | 刷新关系状态 | onclick: () =&gt; { setMessage(""); void load(); } | {"disabled":"busy","renderGateProps":[],"conditions":[]} |
| 70 | link/a · RelationshipLifecycleEditor | 查看联系人 | `/app/contacts/${encodeURIComponent(model.contactId)}` | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 71 | form-submit-boundary/form · RelationshipLifecycleEditor | 本次完成的跟进 请选择 {currentTasks.map(task =&gt; &lt;option key={task.id} value={task.id}&gt;{task.title}&lt;/option&gt;)} 关系下一步 继续跟进 转为进行中 定期维护 归档关系 {&lt;&gt;&lt;label&gt;下一次跟进内容&lt;input required maxLength={500} aria-label="下一次跟进内容" value={title} disabled={busy} onChange={event =&gt; setTitle(event.target.value)} /&gt;&lt;/label&gt;&lt;label&gt;下次时间（当前设备时区）&lt;input required aria-label="下次跟进时间" type="datetime-local" value={due} disabled={busy} onChange={event =&gt; setDue(event.target.value)} /&gt;&lt;/label&gt;&lt;/&gt;} / {null} {&lt;label&gt;关系目标&lt;input …（完整表达式见源码） | onsubmit: submit | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 72 | field/select · RelationshipLifecycleEditor | 本次完成的跟进 | onchange: event =&gt; setTaskId(event.target.value) | {"disabled":"busy","renderGateProps":[],"conditions":[]} |
| 73 | field/select · RelationshipLifecycleEditor | 关系下一步 | onchange: event =&gt; setKind(event.target.value as typeof kind) | {"disabled":"busy","renderGateProps":[],"conditions":[]} |
| 76 | field/input · RelationshipLifecycleEditor | 下一次跟进内容 | onchange: event =&gt; setTitle(event.target.value) | {"disabled":"busy","renderGateProps":[],"conditions":[]} |
| 76 | field/input · RelationshipLifecycleEditor | 下次跟进时间 | onchange: event =&gt; setDue(event.target.value) | {"disabled":"busy","renderGateProps":[],"conditions":[]} |
| 77 | field/input · RelationshipLifecycleEditor | 关系目标 | onchange: event =&gt; setGoal(event.target.value) | {"disabled":"busy","renderGateProps":[],"conditions":[]} |
| 78 | field/input · RelationshipLifecycleEditor | 确认归档，并忽略其余 {Math.max(0, currentTasks.length - 1)} 条未完成跟进 | onchange: event =&gt; setArchiveConfirmed(event.target.checked) | {"disabled":"busy","renderGateProps":[],"conditions":[]} |
| 79 | button/button · RelationshipLifecycleEditor | 保存中… / 完成并保存下一步 |  | {"disabled":"busy \|\| !taskId","renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 23 | RelationshipLifecycleEditor | 路径常量 | 见调用/handler | `/api/connections/${encodeURIComponent(connectionId)}/lifecycle` |
| 27 | RelationshipLifecycleEditor | 调用 | GET/由封装决定 | endpoint |
| 54 | submit | 调用 | POST | endpoint |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 66 | JSX文字 | 返回待办 |
| 66 | JSX文字 | 处理人脉跟进 |
| 67 | JSX文字 | 完成当前跟进时，一并确认关系下一步；不会向联系人发送消息。 |
| 68 | JSX文字 | 刷新关系状态 |
| 70 | JSX文字 | 当前阶段： |
| 70 | JSX文字 | 查看联系人 |
| 72 | JSX文字 | 本次完成的跟进 |
| 72 | JSX文字 | 请选择 |
| 73 | JSX文字 | 关系下一步 |
| 74 | JSX文字 | 继续跟进 |
| 74 | JSX文字 | 转为进行中 |
| 74 | JSX文字 | 定期维护 |
| 74 | JSX文字 | 归档关系 |
| 76 | JSX文字 | 下一次跟进内容 |
| 76 | JSX文字 | 下次时间（当前设备时区） |
| 76 | 属性 aria-label | 下次跟进时间 |
| 77 | JSX文字 | 关系目标 |
| 78 | JSX文字 | 确认归档，并忽略其余 |
| 78 | JSX文字 | 条未完成跟进 |
| 80 | JSX文字 | 没有待处理的人脉跟进。 |
| 81 | JSX文字 | 历史跟进 |

## repos/orbits/app/(app)/app/tasks/task-detail-workspace.tsx

源码：[task-detail-workspace.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/tasks/task-detail-workspace.tsx>)

静态来源入口：`/app/tasks`、`/app/tasks/[id]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 39 | TaskDetail | section | back | orbit-tasks |
| 41 | TaskDetail | section | task.loading && !task.data ? &lt;p role="status"&gt;{t({ zh: "正在读取待办…", en: "Loading task…" })}&lt;/p&gt; : null task.data ? &lt;&gt; &lt;div className="task-detail-grid"&gt; &lt;div&gt; &lt;p className="task-meta"&gt;{task.data.status === "completed" ? t({ zh: "已完成", en: "Completed" }) : task.data.status === "cancelled" ? t({ zh: "已取消", en: "Cancelled" …（完整表达式见源码） | orbit-tasks |
| 76 | TaskDetail | aside | t({ zh: "待办信息", en: "Task information" }) | task-details |
| 80 | TaskDetail | section | reminders.data?.length === 0 ? &lt;p className="task-meta"&gt;{t({ zh: "未设置提醒", en: "No reminders set" })}&lt;/p&gt; : null task.data.status === "open" ? &lt;button className="btn btn-ghost btn-sm" disabled={mutation.busy} onClick={() =&gt; mutation.run(() =&gt; client.addReminder(task.data!), reminders.refresh, t({ zh: "已设置 1 小时后的站内提醒", e …（完整表达式见源码） |  |
| 80 | TaskDetail | h2 | t({ zh: "提醒", en: "Reminders" }) |  |
| 87 | TaskDetail | section | activities.data?.length === 0 ? &lt;p className="task-meta"&gt;{t({ zh: "暂无变更记录", en: "No activity yet" })}&lt;/p&gt; : null |  |
| 87 | TaskDetail | h2 | t({ zh: "变更历史", en: "Activity" }) |  |

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 23 | [title, setTitle] = useState("") |
| 24 | [notes, setNotes] = useState("") |
| 25 | [confirmDelete, setConfirmDelete] = useState(false) |
| 26 | [deleted, setDeleted] = useState(false) |
| 27 | [baseline, setBaseline] = useState&lt;TaskView \| null&gt;(null) |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 37 | link/a · TaskDetail | 全部待办 / All tasks | preserveHref("/app/tasks") | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 42 | button/button · TaskDetail | 刷新 / Refresh | onclick: refresh | {"disabled":"task.loading \|\| mutation.busy","renderGateProps":[],"conditions":[]} |
| 43 | callback-control/TasksReadError · TaskDetail |  | onretry: refresh | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 49 | form-submit-boundary/form · TaskDetail | t({ zh: "编辑待办表单", en: "Edit task form" }) | onsubmit: async (event) =&gt; { event.preventDefault(); await mutation.run(() =&gt; client.update(baseline!, title, notes), (updated) =&gt; { task.replace(updated); setBaseline(updated); setTitle(updated.title); setNotes(updated.notes); activities.refresh(); }, t({ zh: "已保存修改", en: "Changes saved" })); } | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 55 | field/textarea · TaskDetail | t({ zh: "待办标题", en: "Task title" }) | onchange: (event) =&gt; setTitle(event.target.value) | {"disabled":"mutation.busy","renderGateProps":[],"conditions":[]} |
| 56 | field/textarea · TaskDetail | t({ zh: "备注", en: "Notes" }) | onchange: (event) =&gt; setNotes(event.target.value) | {"disabled":"mutation.busy","renderGateProps":[],"conditions":[]} |
| 57 | button/button · TaskDetail | 保存修改 / Save changes |  | {"disabled":"mutation.busy \|\| !baseline \|\| staleDraft \|\| !title.trim() \|\| (title === baseline.title && notes === baseline.notes)","renderGateProps":[],"conditions":[]} |
| 59 | button/button · TaskDetail | 放弃草稿并载入最新内容 / Discard draft and load latest | onclick: () =&gt; { setBaseline(task.data); setTitle(task.data!.title); setNotes(task.data!.notes); } | {"disabled":"mutation.busy","renderGateProps":[],"conditions":[]} |
| 62 | button/button · TaskDetail | task.data.status === "completed" ? t({ zh: "恢复待办", en: "Reopen task" }) : t({ zh: "标记完成", en: "Mark complete" }) | onclick: () =&gt; mutation.run( () =&gt; client.setCompleted(taskId, task.data!.status !== "completed"), (updated) =&gt; { task.replace(updated); refresh(); }, task.data!.status === "completed" ? t({ zh: "已恢复待办", en: "Task reopened" }) : t({ zh: "已完成待办", en: "Task completed" }), ) | {"disabled":"mutation.busy","renderGateProps":[],"conditions":[]} |
| 66 | button/button · TaskDetail | t({ zh: "删除待办", en: "Delete task" }) | onclick: () =&gt; setConfirmDelete(true) | {"disabled":"mutation.busy","renderGateProps":[],"conditions":[]} |
| 71 | button/button · TaskDetail | t({ zh: "保留待办", en: "Keep task" }) | onclick: () =&gt; setConfirmDelete(false) | {"disabled":"mutation.busy","renderGateProps":[],"conditions":[]} |
| 72 | button/button · TaskDetail | t({ zh: "确认删除待办", en: "Confirm delete task" }) | onclick: () =&gt; mutation.run(() =&gt; client.remove(taskId), () =&gt; setDeleted(true), "") | {"disabled":"mutation.busy","renderGateProps":[],"conditions":[]} |
| 79 | callback-control/TaskScheduleEditor · TaskDetail |  | onsaved: updated =&gt; { task.replace(updated); activities.refresh(); reminders.refresh(); } | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 82 | callback-control/TasksReadError · TaskDetail |  | onretry: reminders.refresh | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 84 | button/button · TaskDetail | 取消 / Cancel | onclick: () =&gt; mutation.run(() =&gt; client.cancelReminder(reminder.id), reminders.refresh, t({ zh: "提醒已取消", en: "Reminder cancelled" })) | {"disabled":"mutation.busy","renderGateProps":[],"conditions":[]} |
| 85 | button/button · TaskDetail | 1 小时后提醒 / Remind me in 1 hour | onclick: () =&gt; mutation.run(() =&gt; client.addReminder(task.data!), reminders.refresh, t({ zh: "已设置 1 小时后的站内提醒", en: "In-app reminder set for one hour from now" })) | {"disabled":"mutation.busy","renderGateProps":[],"conditions":[]} |
| 88 | callback-control/TasksReadError · TaskDetail |  | onretry: activities.refresh | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 37 | 翻译 zh | "全部待办" |
| 37 | 翻译 en | "All tasks" |
| 39 | 翻译 zh | "待办已删除" |
| 39 | 翻译 en | "Task deleted" |
| 42 | 翻译 zh | "刷新" |
| 42 | 翻译 en | "Refresh" |
| 44 | 翻译 zh | "正在读取待办…" |
| 44 | 翻译 en | "Loading task…" |
| 48 | 翻译 zh | "已完成" |
| 48 | 翻译 en | "Completed" |
| 48 | 翻译 zh | "已取消" |
| 48 | 翻译 en | "Cancelled" |
| 48 | 翻译 zh | "待办" |
| 48 | 翻译 en | "Open" |
| 49 | 属性 aria-label | t({ zh: "编辑待办表单", en: "Edit task form" }) |
| 49 | 翻译 zh | "编辑待办表单" |
| 49 | 翻译 en | "Edit task form" |
| 53 | 翻译 zh | "已保存修改" |
| 53 | 翻译 en | "Changes saved" |
| 55 | 翻译 zh | "标题" |
| 55 | 翻译 en | "Title" |
| 55 | 属性 aria-label | t({ zh: "待办标题", en: "Task title" }) |
| 55 | 翻译 zh | "待办标题" |
| 55 | 翻译 en | "Task title" |
| 56 | 翻译 zh | "备注" |
| 56 | 翻译 en | "Notes" |
| 56 | 属性 placeholder | t({ zh: "写一点备注", en: "Add a note" }) |
| 56 | 属性 aria-label | t({ zh: "备注", en: "Notes" }) |
| 56 | 翻译 zh | "写一点备注" |
| 56 | 翻译 en | "Add a note" |
| 57 | 翻译 zh | "保存修改" |
| 57 | 翻译 en | "Save changes" |
| 59 | 翻译 zh | "这条待办已有新版本，草稿已保留。请复制需要保留的内容，再载入最新版本。" |
| 59 | 翻译 en | "This task has a newer version. Your draft is kept. Copy any edits you need before loading the latest version." |
| 59 | 翻译 zh | "放弃草稿并载入最新内容" |
| 59 | 翻译 en | "Discard draft and load latest" |
| 62 | 属性 aria-label | task.data.status === "completed" ? t({ zh: "恢复待办", en: "Reopen task" }) : t({ zh: "标记完成", en: "Mark complete" }) |
| 62 | 翻译 zh | "恢复待办" |
| 62 | 翻译 en | "Reopen task" |
| 62 | 翻译 zh | "标记完成" |
| 62 | 翻译 en | "Mark complete" |
| 64 | 翻译 zh | "已恢复待办" |
| 64 | 翻译 en | "Task reopened" |
| 64 | 翻译 zh | "已完成待办" |
| 64 | 翻译 en | "Task completed" |
| 65 | 翻译 zh | "恢复待办" |
| 65 | 翻译 en | "Reopen task" |
| 65 | 翻译 zh | "标记完成" |
| 65 | 翻译 en | "Mark complete" |
| 66 | 属性 aria-label | t({ zh: "删除待办", en: "Delete task" }) |
| 66 | 翻译 zh | "删除待办" |
| 66 | 翻译 en | "Delete task" |
| 66 | 翻译 zh | "删除" |
| 66 | 翻译 en | "Delete" |
| 68 | 属性 aria-label | t({ zh: "删除确认", en: "Confirm deletion" }) |
| 68 | 翻译 zh | "删除确认" |
| 68 | 翻译 en | "Confirm deletion" |
| 69 | 翻译 zh | "删除这条待办？它将从待办列表中移除。" |
| 69 | 翻译 en | "Delete this task? It will be removed from your task list." |
| 71 | 属性 aria-label | t({ zh: "保留待办", en: "Keep task" }) |
| 71 | 翻译 zh | "保留待办" |
| 71 | 翻译 en | "Keep task" |
| 71 | 翻译 zh | "保留" |
| 71 | 翻译 en | "Keep" |
| 72 | 属性 aria-label | t({ zh: "确认删除待办", en: "Confirm delete task" }) |
| 72 | 翻译 zh | "确认删除待办" |
| 72 | 翻译 en | "Confirm delete task" |
| 72 | 翻译 zh | "确认删除" |
| 72 | 翻译 en | "Delete task" |
| 76 | 属性 aria-label | t({ zh: "待办信息", en: "Task information" }) |
| 76 | 翻译 zh | "待办信息" |
| 76 | 翻译 en | "Task information" |
| 77 | 翻译 zh | "安排" |
| 77 | 翻译 en | "Planned for" |
| 77 | 翻译 zh | "分类" |
| 77 | 翻译 en | "Category" |
| 78 | JSX文字 | 地点： |
| 80 | 翻译 zh | "提醒" |
| 80 | 翻译 en | "Reminders" |
| 81 | 翻译 zh | "网页设置站内提醒；不代表已开启手机推送。" |
| 81 | 翻译 en | "Web reminders appear in Orbit. They do not enable phone push notifications." |
| 83 | 翻译 zh | "未设置提醒" |
| 83 | 翻译 en | "No reminders set" |
| 84 | 翻译 zh | "提醒已取消" |
| 84 | 翻译 en | "Reminder cancelled" |
| 84 | 翻译 zh | "取消" |
| 84 | 翻译 en | "Cancel" |
| 85 | 翻译 zh | "已设置 1 小时后的站内提醒" |
| 85 | 翻译 en | "In-app reminder set for one hour from now" |
| 85 | 翻译 zh | "1 小时后提醒" |
| 85 | 翻译 en | "Remind me in 1 hour" |
| 87 | 翻译 zh | "变更历史" |
| 87 | 翻译 en | "Activity" |
| 89 | 翻译 zh | "暂无变更记录" |
| 89 | 翻译 en | "No activity yet" |

## repos/orbits/app/(app)/app/tasks/task-schedule-editor.tsx

源码：[task-schedule-editor.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/tasks/task-schedule-editor.tsx>)

静态来源入口：`/app/tasks`、`/app/tasks/[id]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 26 | TaskScheduleEditor | section | 日期、时间和地点 |  |
| 26 | TaskScheduleEditor | h2 | 日期、时间和地点 |  |

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 15 | [zone, setZone] = useState(() =&gt; { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ""; } }) |
| 16 | [baseline, setBaseline] = useState(task) |
| 17 | [draft, setDraft] = useState(() =&gt; draftFor(task, validTimeZone(zone) ? zone : "UTC")) |
| 18 | [validation, setValidation] = useState("") |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 28 | form-submit-boundary/form · TaskScheduleEditor | {([["plannedDate", "安排日期", "date"], ["dueDate", "截止日期", "date"], ["dueTime", "截止时间", "time"], ["location", "地点", "text"]] as const).map(([field, label, type]) =&gt; &lt;label key={field}&gt;{label}&lt;input aria-label={label} type={type} value={draft[field]} disabled={mutation.busy \|\| task.status === "cancelled"} onChange={event =&gt; { const value = event.target.value; setDraft(previous =&gt; ({ ...previous, [field]: value })); }} /&gt;&lt;/label&gt;)} 保存日期和地点 | onsubmit: async event =&gt; { event.preventDefault(); if (stale \|\| mutation.busy \|\| task.status === "cancelled") return; if (!validTimeZone(zone)) { setValidation("无法读取设备时区，草稿已保留。"); return; } const previous = draftFor(baseline, zone); if ((draft.plannedDate && !calendarDate(draft.plannedDate)) \|\| Boolean(draft.dueDate) !== Boolean(draft.dueTime)) { setValidation("请输入有效日期，截止日期和时间需一起填写。"); return; } const patch: { plannedDate?: string \| null; dueAt?: string \| null; location?: string \| null } = {}; if (draft.plannedDate !== previous.plannedDate) patch.plannedDate = draft.plannedDate \|\| null; if (draft.location.trim() …（完整表达式见源码） | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 43 | field/input · TaskScheduleEditor | label | onchange: event =&gt; { const value = event.target.value; setDraft(previous =&gt; ({ ...previous, [field]: value })); } | {"disabled":"mutation.busy \|\| task.status === \"cancelled\"","renderGateProps":[],"conditions":[]} |
| 44 | button/button · TaskScheduleEditor | 保存日期和地点 |  | {"disabled":"mutation.busy \|\| stale \|\| clean \|\| task.status === \"cancelled\"","renderGateProps":[],"conditions":[]} |
| 46 | button/button · TaskScheduleEditor | 放弃日期草稿并载入最新内容 | onclick: discard | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 26 | 属性 aria-label | 日期、时间和地点 |
| 27 | JSX文字 | 截止时间使用 |
| 27 | JSX文字 | 。只安排日期时不必填写截止时间。清空后保存即可移除。已有提醒保持原定时间。 |
| 43 | 属性 aria-label | label |
| 44 | JSX文字 | 保存日期和地点 |
| 46 | JSX文字 | 事项已更新，草稿已保留。 |
| 46 | JSX文字 | 放弃日期草稿并载入最新内容 |

## repos/orbits/app/(app)/app/tasks/tasks-client.ts

源码：[tasks-client.ts](</Users/li/work/orbit/repos/orbits/app/(app)/app/tasks/tasks-client.ts>)

静态来源入口：`/app/agent`、`/app/tasks`、`/app/tasks/[id]`、`/app/today`

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 63 | pathFor | 路径常量 | 见调用/handler | `/api/tasks/${encodeURIComponent(id)}` |
| 75 | createTasksClient | 调用 | GET/由封装决定 | `/api/tasks?status=${status}` |
| 75 | createTasksClient | 路径常量 | 见调用/handler | `/api/tasks?status=${status}` |
| 76 | createTasksClient | 调用 | GET/由封装决定 | pathFor(id) |
| 77 | createTasksClient | 调用 | GET/由封装决定 | "/api/today?timeZone=Asia%2FTokyo" |
| 77 | createTasksClient | 路径常量 | 见调用/handler | "/api/today?timeZone=Asia%2FTokyo" |
| 78 | createTasksClient | 调用 | GET/由封装决定 | "/api/task-suggestions" |
| 78 | createTasksClient | 路径常量 | 见调用/handler | "/api/task-suggestions" |
| 79 | createTasksClient | 调用 | GET/由封装决定 | `${pathFor(id)}/activities` |
| 80 | createTasksClient | 调用 | GET/由封装决定 | `/api/reminders?${new URLSearchParams({ targetType: "task", targetId: id })}` |
| 80 | createTasksClient | 路径常量 | 见调用/handler | `/api/reminders?${new URLSearchParams({ targetType: "task", targetId: id })}` |
| 85 | createTasksClient | 调用 | GET/由封装决定 | "/api/tasks" |
| 85 | createTasksClient | 路径常量 | 见调用/handler | "/api/tasks" |
| 92 | createTasksClient | 调用 | GET/由封装决定 | pathFor(task.id) |
| 97 | createTasksClient | 调用 | GET/由封装决定 | pathFor(baseline.id) |
| 106 | createTasksClient | 调用 | GET/由封装决定 | pathFor(id) |
| 109 | createTasksClient | 调用 | GET/由封装决定 | pathFor(id) |
| 110 | createTasksClient | 调用 | GET/由封装决定 | `/api/task-suggestions/${encodeURIComponent(id)}/${action}` |
| 111 | createTasksClient | 路径常量 | 见调用/handler | `/api/task-suggestions/${encodeURIComponent(id)}/${action}` |
| 118 | createTasksClient | 调用 | GET/由封装决定 | "/api/reminders" |
| 118 | createTasksClient | 路径常量 | 见调用/handler | "/api/reminders" |
| 125 | createTasksClient | 调用 | GET/由封装决定 | `/api/reminders/${encodeURIComponent(id)}` |
| 125 | createTasksClient | 路径常量 | 见调用/handler | `/api/reminders/${encodeURIComponent(id)}` |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 120 | 文案/数据常量 title | "待办提醒" |

## repos/orbits/app/(app)/app/tasks/tasks-controls.tsx

源码：[tasks-controls.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/tasks/tasks-controls.tsx>)

静态来源入口：`/app/tasks`、`/app/tasks/[id]`、`/app/today`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 60 | TaskSuggestions | section | t({ zh: "待办建议", en: "Task suggestions" }) | task-suggestions |
| 61 | TaskSuggestions | h2 | t({ zh: "Orbit 建议", en: "Orbit suggestions" }) |  |
| 63 | TaskSuggestions | h3 | item.title |  |

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 28 | [draft, setDraft] = useState("") |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 22 | button/button · TasksReadError | 重试 / Retry | onclick: onRetry | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 30 | form-submit-boundary/form · TaskComposer | t({ zh: "新增待办表单", en: "New task form" }) | onsubmit: async (event) =&gt; { event.preventDefault(); if (pending.current \|\| busy \|\| !draft.trim()) return; pending.current = true; try { if (await onCreate(draft)) setDraft(""); } finally { pending.current = false; } } | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 37 | field/input · TaskComposer | t({ zh: "添加待办", en: "Add a task" }) | onchange: (event) =&gt; setDraft(event.target.value) | {"disabled":"busy","renderGateProps":[],"conditions":[]} |
| 38 | button/button · TaskComposer | 添加 / Add |  | {"disabled":"busy \|\| !draft.trim()","renderGateProps":[],"conditions":[]} |
| 47 | field/input · TaskRows | `${task.status === "completed" ? t({ zh: "恢复", en: "Reopen" }) : t({ zh: "完成", en: "Complete" })}：${task.title}` | onchange: () =&gt; onToggle(task) | {"disabled":"busy","renderGateProps":[],"conditions":[]} |
| 48 | link/a · TaskRows | {task.title} {taskCategoryLabel(task.category, english)} · {taskTimeLabel(task.dueAt ?? task.plannedDate, english)} | preserveHref(task.href) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 65 | button/button · TaskSuggestions | 加入待办 / Add to tasks | onclick: () =&gt; onResolve(item.id, "accept") | {"disabled":"busy","renderGateProps":[],"conditions":[]} |
| 66 | button/button · TaskSuggestions | 忽略 / Dismiss | onclick: () =&gt; onResolve(item.id, "dismiss") | {"disabled":"busy","renderGateProps":[],"conditions":[]} |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 20 | 翻译 zh | "刷新未完成，当前仍显示上次读取的内容。" |
| 20 | 翻译 en | "Refresh failed. Previously loaded data is still shown." |
| 22 | 翻译 zh | "重试" |
| 22 | 翻译 en | "Retry" |
| 30 | 属性 aria-label | t({ zh: "新增待办表单", en: "New task form" }) |
| 30 | 翻译 zh | "新增待办表单" |
| 30 | 翻译 en | "New task form" |
| 37 | 属性 placeholder | t({ zh: "添加待办", en: "Add a task" }) |
| 37 | 翻译 zh | "添加待办" |
| 37 | 翻译 en | "Add a task" |
| 38 | 翻译 zh | "添加" |
| 38 | 翻译 en | "Add" |
| 47 | 属性 aria-label | `${task.status === "completed" ? t({ zh: "恢复", en: "Reopen" }) : t({ zh: "完成", en: "Complete" })}：${task.title}` |
| 47 | 翻译 zh | "恢复" |
| 47 | 翻译 en | "Reopen" |
| 47 | 翻译 zh | "完成" |
| 47 | 翻译 en | "Complete" |
| 60 | 属性 aria-label | t({ zh: "待办建议", en: "Task suggestions" }) |
| 60 | 翻译 zh | "待办建议" |
| 60 | 翻译 en | "Task suggestions" |
| 61 | 翻译 zh | "Orbit 建议" |
| 61 | 翻译 en | "Orbit suggestions" |
| 65 | 翻译 zh | "加入待办" |
| 65 | 翻译 en | "Add to tasks" |
| 66 | 翻译 zh | "忽略" |
| 66 | 翻译 en | "Dismiss" |

## repos/orbits/app/(app)/app/tasks/tasks-page-content.tsx

源码：[tasks-page-content.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/tasks/tasks-page-content.tsx>)

静态来源入口：`/app/tasks`、`/app/tasks/[id]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 22 | TasksPageContent | main |  |  |

## repos/orbits/app/(app)/app/tasks/tasks-page-heading.tsx

源码：[tasks-page-heading.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/tasks/tasks-page-heading.tsx>)

静态来源入口：`/app/tasks`、`/app/tasks/[id]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 7 | TasksPageHeading | header |  |  |
| 9 | TasksPageHeading | h1 | detail ? t({ zh: "待办详情", en: "Task details" }) : t({ zh: "待办事项", en: "Tasks" }) |  |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 8 | link/a · TasksPageHeading | 返回今天 / Back to today | preserveHref("/app/today") | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 10 | link/a · TasksPageHeading | 个人日程 / Personal schedule | preserveHref("/app/tasks/personal") | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 8 | 翻译 zh | "返回今天" |
| 8 | 翻译 en | "Back to today" |
| 9 | 翻译 zh | "待办详情" |
| 9 | 翻译 en | "Task details" |
| 9 | 翻译 zh | "待办事项" |
| 9 | 翻译 en | "Tasks" |
| 10 | 翻译 zh | "个人日程" |
| 10 | 翻译 en | "Personal schedule" |

## repos/orbits/app/(app)/app/tasks/tasks-workspace.tsx

源码：[tasks-workspace.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/tasks/tasks-workspace.tsx>)

静态来源入口：`/app/tasks`、`/app/tasks/[id]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 20 | TasksWorkspace | section | t({ zh: "待办事项", en: "Tasks" }) | orbit-tasks |

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 12 | [status, setStatus] = useState(initialStatus) |
| 13 | [query, setQuery] = useState("") |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 23 | button/button · TasksWorkspace | t({ zh: "查看待办", en: "View open tasks" }) | onclick: () =&gt; setStatus("open") | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 24 | button/button · TasksWorkspace | t({ zh: "查看已完成待办", en: "View completed tasks" }) | onclick: () =&gt; setStatus("completed") | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 26 | button/button · TasksWorkspace | 刷新 / Refresh | onclick: refresh | {"disabled":"tasks.loading \|\| mutation.busy","renderGateProps":[],"conditions":[]} |
| 28 | callback-control/TaskComposer · TasksWorkspace |  | oncreate: (title) =&gt; mutation.run(() =&gt; client.create(title), () =&gt; { setStatus("open"); setQuery(""); refresh(); }, t({ zh: "待办已添加", en: "Task added" })) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 29 | field/input · TasksWorkspace | 搜索待办 / Search tasks | onchange: (event) =&gt; setQuery(event.target.value) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 31 | callback-control/TasksReadError · TasksWorkspace |  | onretry: tasks.refresh | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 34 | callback-control/TaskRows · TasksWorkspace |  | ontoggle: (task) =&gt; { void mutation.run(() =&gt; client.setCompleted(task.id, task.status !== "completed"), refresh, task.status === "completed" ? t({ zh: "已恢复待办", en: "Task reopened" }) : t({ zh: "已完成待办", en: "Task completed" })); } | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 39 | callback-control/TasksReadError · TasksWorkspace |  | onretry: suggestions.refresh | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 20 | 属性 aria-label | t({ zh: "待办事项", en: "Tasks" }) |
| 20 | 翻译 zh | "待办事项" |
| 20 | 翻译 en | "Tasks" |
| 22 | 属性 aria-label | t({ zh: "待办状态", en: "Task status" }) |
| 22 | 翻译 zh | "待办状态" |
| 22 | 翻译 en | "Task status" |
| 23 | 属性 aria-label | t({ zh: "查看待办", en: "View open tasks" }) |
| 23 | 翻译 zh | "查看待办" |
| 23 | 翻译 en | "View open tasks" |
| 23 | 翻译 zh | "待办" |
| 23 | 翻译 en | "Open" |
| 24 | 属性 aria-label | t({ zh: "查看已完成待办", en: "View completed tasks" }) |
| 24 | 翻译 zh | "查看已完成待办" |
| 24 | 翻译 en | "View completed tasks" |
| 24 | 翻译 zh | "已完成" |
| 24 | 翻译 en | "Completed" |
| 26 | 翻译 zh | "刷新" |
| 26 | 翻译 en | "Refresh" |
| 28 | 翻译 zh | "待办已添加" |
| 28 | 翻译 en | "Task added" |
| 29 | 翻译 zh | "搜索待办" |
| 29 | 翻译 en | "Search tasks" |
| 32 | 翻译 zh | "正在读取待办…" |
| 32 | 翻译 en | "Loading tasks…" |
| 33 | 翻译 zh | "没有匹配的待办" |
| 33 | 翻译 en | "No matching tasks" |
| 33 | 翻译 zh | "暂无待办，可以在上方添加。" |
| 33 | 翻译 en | "No open tasks. Add one above." |
| 33 | 翻译 zh | "暂无完成记录" |
| 33 | 翻译 en | "No completed tasks yet" |
| 36 | 翻译 zh | "已恢复待办" |
| 36 | 翻译 en | "Task reopened" |
| 36 | 翻译 zh | "已完成待办" |
| 36 | 翻译 en | "Task completed" |
| 41 | 翻译 zh | "建议已加入待办" |
| 41 | 翻译 en | "Suggestion added to tasks" |
| 41 | 翻译 zh | "已忽略建议" |
| 41 | 翻译 en | "Suggestion dismissed" |

## repos/orbits/app/(app)/app/tasks/today-tasks-summary.tsx

源码：[today-tasks-summary.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/tasks/today-tasks-summary.tsx>)

静态来源入口：`/app/today`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 15 | TodayTasksSummary | section | t({ zh: "今天的待办", en: "Today's tasks" }) | orbit-tasks task-summary |
| 17 | TodayTasksSummary | header |  | task-toolbar |
| 17 | TodayTasksSummary | h2 | t({ zh: "待办", en: "Tasks" }) resource.data ? &lt;span className="task-count"&gt;{resource.data.count}&lt;/span&gt; : null |  |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 17 | link/a · TodayTasksSummary | 全部待办 / All tasks | preserveHref("/app/tasks") | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 18 | callback-control/TaskComposer · TodayTasksSummary |  | oncreate: (title) =&gt; mutation.run(() =&gt; client.create(title), resource.refresh, t({ zh: "待办已添加", en: "Task added" })) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 20 | callback-control/TasksReadError · TodayTasksSummary |  | onretry: resource.refresh | {"disabled":null,"renderGateProps":[],"conditions":[]} |
