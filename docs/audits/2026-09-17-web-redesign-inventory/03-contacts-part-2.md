| 203 | 文案/数据常量 community | "社群" |
| 204 | 文案/数据常量 venture-ecosystem | "创投生态" |
| 205 | 文案/数据常量 business-card | "名片来源" |
| 206 | 文案/数据常量 external-import | "外部导入" |
| 207 | 文案/数据常量 event-import | "活动导入" |
| 508 | 文案/数据常量 label | "待联系" |
| 509 | 文案/数据常量 label | "在推进" |
| 510 | 文案/数据常量 label | "已合作" |
| 511 | 文案/数据常量 label | "已归档" |

## repos/orbits/app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-route-view-model.ts

源码：[contacts-route-view-model.ts](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-route-view-model.ts>)

静态来源入口：`/app/agent`、`/app/contacts`、`/app/contacts/intros`、`/app/contacts/pipeline`、`/app/home/events`

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 501 | loadAppContactsRouteViewModel | 路径常量 | 见调用/handler | "Inspect GET /api/contacts." |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 367 | 文案/数据常量 label | "Show all sourced contacts" |
| 368 | 文案/数据常量 label | "Try storage filter" |
| 374 | 文案/数据常量 label | "Return to available contacts" |
| 379 | 文案/数据常量 label | "Reload contacts list" |
| 380 | 文案/数据常量 label | "Check source status" |
| 396 | 文案/数据常量 description | "Clear the search and filters, or add a contact with source evidence before reviewing follow-up." |
| 398 | 文案/数据常量 emptyState | "No source-backed contact rows are ready for review." |
| 399 | 文案/数据常量 eyebrow | "No contacts" |
| 400 | 文案/数据常量 guardrail | "Orbit cannot create contacts, tasks, messages, or merges from an empty list." |
| 405 | 文案/数据常量 purpose | "Keep the contacts page useful when no relationship row is reviewable." |
| 407 | 文案/数据常量 title | "No contacts match this view" |
| 422 | 文案/数据常量 description | "Contact rows stay hidden until their source evidence is ready." |
| 424 | 文案/数据常量 emptyState | "Contact rows stay hidden until source evidence is ready." |
| 426 | 文案/数据常量 eyebrow | "Checking sources" |
| 427 | 文案/数据常量 guardrail | "Checking contacts cannot read a search index, query a database, send messages, or deliver notifications." |
| 429 | 文案/数据常量 nextStep | "Wait for sourced contacts before taking action." |
| 430 | 文案/数据常量 purpose | "Keep the contacts page visible while search and filter state resolves." |
| 432 | 文案/数据常量 title | "Checking contact sources" |
| 446 | 文案/数据常量 description | "Contacts list search and filter is unavailable while local source evidence is being checked." |
| 448 | 文案/数据常量 emptyState | "No contact, task, message, notification, database, or outside account changed." |
| 450 | 文案/数据常量 eyebrow | "Needs retry" |
| 451 | 文案/数据常量 guardrail | "Retry keeps search, storage, email, calendar, AI, notification, and messaging disconnected." |
| 453 | 文案/数据常量 nextStep | "Reload the contacts list before reviewing follow-up actions." |
| 454 | 文案/数据常量 purpose | "Show a contacts recovery state without side effects." |
| 455 | 文案/数据常量 title | "Contacts could not load" |
| 494 | 文案/数据常量 description | "The contacts page could not compose the local contacts list search and filter state." |
| 496 | 文案/数据常量 emptyState | "A contacts filter or list boundary returned an unexpected state." |
| 499 | 文案/数据常量 eyebrow | "Contacts" |
| 500 | 文案/数据常量 guardrail | "No external action can run when contacts composition fails." |
| 501 | 文案/数据常量 nextStep | "Inspect GET /api/contacts." |
| 502 | 文案/数据常量 purpose | "Stop contacts review when source evidence cannot be composed." |
| 504 | 文案/数据常量 title | "Contacts relationship console could not load" |

## repos/orbits/app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-subroute-route-adapter.tsx

源码：[contacts-subroute-route-adapter.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-subroute-route-adapter.tsx>)

静态来源入口：`/app/contacts/intros`、`/app/contacts/pipeline`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 244 | ContactsSubrouteStateBoundary | main |  |  |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 198 | 文案/数据常量 label | "待设置关系" |
| 199 | 文案/数据常量 label | "待联系" |
| 200 | 文案/数据常量 label | "在推进" |
| 201 | 文案/数据常量 label | "已合作" |
| 202 | 文案/数据常量 label | "已归档" |
| 219 | 文案/数据常量 recoveryCopy | "Return to a contacts route that can re-check source records." |
| 241 | 文案/数据常量 label | "Reload contacts list" |
| 248 | 属性 title | copy.title |

## repos/orbits/app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-view-model-adapter.ts

源码：[contacts-view-model-adapter.ts](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-view-model-adapter.ts>)

静态来源入口：`/app/contacts`

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 192 | 文案/数据常量 label | "待设置关系" |
| 193 | 文案/数据常量 label | "待联系" |
| 194 | 文案/数据常量 label | "在推进" |
| 195 | 文案/数据常量 label | "已合作" |
| 196 | 文案/数据常量 label | "已归档" |

## repos/orbits/app/(app)/app/contacts/contact-industry-editor.tsx

源码：[contact-industry-editor.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/contact-industry-editor.tsx>)

静态来源入口：`/app/contacts/[id]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 72 | ContactIndustryEditor | h2 | copy.title | h-section |

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 24 | [value, setValue] = useState(initialIndustryId ?? "") |
| 25 | [secondaryValue, setSecondaryValue] = useState(initialSecondaryIndustryId ?? "") |
| 26 | [savedValue, setSavedValue] = useState(initialIndustryId ?? "") |
| 27 | [savedSecondaryValue, setSavedSecondaryValue] = useState(initialSecondaryIndustryId ?? "") |
| 28 | [status, setStatus] = useState&lt;"idle" \| "saving" \| "saved" \| "error"&gt;("idle") |

### 弹层根/原生确认

| 行 | 类型 | 名称/标题表达式 |
| --- | --- | --- |
| 71 | dialog | copy.title |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 73 | field/select · ContactIndustryEditor | copy.title | onchange: (event) =&gt; { setValue(event.target.value); if (event.target.value !== value) setSecondaryValue(""); setStatus("idle"); } | {"disabled":"status === \"saving\"","renderGateProps":[],"conditions":[]} |
| 80 | field/select · ContactIndustryEditor | secondaryTitle | onchange: event =&gt; { setSecondaryValue(event.target.value); setStatus("idle"); } | {"disabled":"status === \"saving\" \|\| !isIndustryIdCode(value)","renderGateProps":[],"conditions":[]} |
| 88 | button/button · ContactIndustryEditor | {copy.close} | onclick: onClose | {"disabled":"status === \"saving\"","renderGateProps":[],"conditions":[]} |
| 89 | button/button · ContactIndustryEditor | {copy.saving} / {copy.save} | onclick: save | {"disabled":"status === \"saving\" \|\| unchanged \|\| !selectionValid","renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 47 | save | 调用 | PATCH | `/api/contacts/${encodeURIComponent(contactId)}` |
| 47 | save | 路径常量 | 见调用/handler | `/api/contacts/${encodeURIComponent(contactId)}` |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 18 | 文案/数据常量 title | "主要行业" |
| 18 | 文案/数据常量 empty | "未分类" |
| 18 | 文案/数据常量 save | "保存行业" |
| 18 | 文案/数据常量 saving | "正在保存…" |
| 18 | 文案/数据常量 close | "关闭" |
| 18 | 文案/数据常量 saved | "行业已保存" |
| 18 | 文案/数据常量 error | "未能确认保存结果。你的选择已保留，请重试。" |
| 19 | 文案/数据常量 title | "Primary industry" |
| 19 | 文案/数据常量 empty | "Unclassified" |
| 19 | 文案/数据常量 save | "Save industry" |
| 19 | 文案/数据常量 saving | "Saving…" |
| 19 | 文案/数据常量 close | "Close" |
| 19 | 文案/数据常量 saved | "Industry saved" |
| 19 | 文案/数据常量 error | "Could not confirm the save. Your selection is still here; please retry." |
| 20 | 文案/数据常量 title | "主な業種" |
| 20 | 文案/数据常量 empty | "未分類" |
| 20 | 文案/数据常量 save | "業種を保存" |
| 20 | 文案/数据常量 saving | "保存中…" |
| 20 | 文案/数据常量 close | "閉じる" |
| 20 | 文案/数据常量 saved | "業種を保存しました" |
| 20 | 文案/数据常量 error | "保存結果を確認できませんでした。選択内容は残っています。もう一度お試しください。" |
| 22 | 文案/数据常量 zh | "二级行业" |
| 22 | 文案/数据常量 en | "Secondary industry" |
| 22 | 文案/数据常量 ja | "詳細業種" |
| 23 | 文案/数据常量 zh | "二级未填写" |
| 23 | 文案/数据常量 en | "Secondary industry not set" |
| 23 | 文案/数据常量 ja | "詳細業種未入力" |
| 71 | 属性 aria-label | copy.title |
| 73 | 属性 aria-label | copy.title |
| 80 | 属性 aria-label | secondaryTitle |

## repos/orbits/app/(app)/app/contacts/contact-interaction-editor.tsx

源码：[contact-interaction-editor.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/contact-interaction-editor.tsx>)

静态来源入口：`/app/contacts/[id]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 81 | ContactInteractionEditor | h2 | copy.title | h-section |

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 31 | [baseline, setBaseline] = useState(initialInteraction) |
| 32 | [channel, setChannel] = useState(initialInteraction.channel) |
| 33 | [time, setTime] = useState(() =&gt; localDateTime(initialInteraction.occurredAt)) |
| 34 | [summary, setSummary] = useState(initialInteraction.summary) |
| 35 | [status, setStatus] = useState&lt;"idle" \| "saving" \| "error" \| "invalid"&gt;("idle") |

### 弹层根/原生确认

| 行 | 类型 | 名称/标题表达式 |
| --- | --- | --- |
| 80 | dialog | copy.title |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 83 | field/select · ContactInteractionEditor | copy.channel | onchange: (event) =&gt; { setChannel(event.target.value); setStatus("idle"); } | {"disabled":"status === \"saving\"","renderGateProps":[],"conditions":[]} |
| 86 | field/input · ContactInteractionEditor | copy.time | onchange: (event) =&gt; { setTime(event.target.value); setStatus("idle"); } | {"disabled":"status === \"saving\"","renderGateProps":[],"conditions":[]} |
| 87 | field/textarea · ContactInteractionEditor | copy.summary | onchange: (event) =&gt; { setSummary(event.target.value); setStatus("idle"); } | {"disabled":"status === \"saving\"","renderGateProps":[],"conditions":[]} |
| 92 | button/button · ContactInteractionEditor | {copy.close} | onclick: onClose | {"disabled":"status === \"saving\"","renderGateProps":[],"conditions":[]} |
| 93 | button/button · ContactInteractionEditor | {copy.saving} / {copy.save} | onclick: save | {"disabled":"status === \"saving\" \|\| !changed","renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 55 | save | 调用 | PATCH | `/api/contacts/${encodeURIComponent(contactId)}` |
| 55 | save | 路径常量 | 见调用/handler | `/api/contacts/${encodeURIComponent(contactId)}` |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 27 | 文案/数据常量 title | "最近互动" |
| 27 | 文案/数据常量 channel | "互动渠道" |
| 27 | 文案/数据常量 time | "互动时间" |
| 27 | 文案/数据常量 summary | "互动摘要" |
| 27 | 文案/数据常量 hint | "时间按当前设备时区填写。留空保留原值；保存不会发送消息或创建日程。" |
| 27 | 文案/数据常量 save | "保存互动" |
| 27 | 文案/数据常量 saving | "正在保存…" |
| 27 | 文案/数据常量 close | "关闭" |
| 27 | 文案/数据常量 error | "未能确认保存结果。输入已保留，请重试。" |
| 27 | 文案/数据常量 invalid | "请填写有效的互动时间。" |
| 28 | 文案/数据常量 title | "Last interaction" |
| 28 | 文案/数据常量 channel | "Channel" |
| 28 | 文案/数据常量 time | "Interaction time" |
| 28 | 文案/数据常量 summary | "Summary" |
| 28 | 文案/数据常量 hint | "Use your device’s time zone. Blank fields keep their current values. Saving does not send messages or create events." |
| 28 | 文案/数据常量 save | "Save interaction" |
| 28 | 文案/数据常量 saving | "Saving…" |
| 28 | 文案/数据常量 close | "Close" |
| 28 | 文案/数据常量 error | "Could not confirm the save. Your input is still here; please retry." |
| 28 | 文案/数据常量 invalid | "Enter a valid interaction time." |
| 29 | 文案/数据常量 title | "最近のやり取り" |
| 29 | 文案/数据常量 channel | "連絡方法" |
| 29 | 文案/数据常量 time | "日時" |
| 29 | 文案/数据常量 summary | "概要" |
| 29 | 文案/数据常量 hint | "端末のタイムゾーンで入力してください。空欄は元の値を保持します。保存してもメッセージの送信や予定の作成は行いません。" |
| 29 | 文案/数据常量 save | "やり取りを保存" |
| 29 | 文案/数据常量 saving | "保存中…" |
| 29 | 文案/数据常量 close | "閉じる" |
| 29 | 文案/数据常量 error | "保存結果を確認できませんでした。入力内容は残っています。もう一度お試しください。" |
| 29 | 文案/数据常量 invalid | "有効な日時を入力してください。" |
| 80 | 属性 aria-label | copy.title |
| 83 | 属性 aria-label | copy.channel |
| 86 | 属性 aria-label | copy.time |
| 87 | 属性 aria-label | copy.summary |

## repos/orbits/app/(app)/app/contacts/contact-notes-editor.tsx

源码：[contact-notes-editor.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/contact-notes-editor.tsx>)

静态来源入口：`/app/contacts/[id]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 57 | ContactNotesEditor | h2 | copy.title | h-section |

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 21 | [draft, setDraft] = useState("") |
| 22 | [status, setStatus] = useState&lt;"idle" \| "saving" \| "saved" \| "error"&gt;("idle") |

### 弹层根/原生确认

| 行 | 类型 | 名称/标题表达式 |
| --- | --- | --- |
| 56 | dialog | copy.title |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 59 | field/textarea · ContactNotesEditor | copy.title | onchange: (event) =&gt; { setDraft(event.target.value); setStatus("idle"); } | {"disabled":"status === \"saving\"","renderGateProps":[],"conditions":[]} |
| 63 | button/button · ContactNotesEditor | {copy.close} | onclick: onClose | {"disabled":"status === \"saving\"","renderGateProps":[],"conditions":[]} |
| 64 | button/button · ContactNotesEditor | {copy.saving} / {copy.save} | onclick: save | {"disabled":"status === \"saving\" \|\| !draft.trim()","renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 34 | save | 调用 | PATCH | `/api/contacts/${encodeURIComponent(contactId)}` |
| 34 | save | 路径常量 | 见调用/handler | `/api/contacts/${encodeURIComponent(contactId)}` |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 17 | 文案/数据常量 title | "添加联系人备注" |
| 17 | 文案/数据常量 privacy | "仅自己可见，不会发送给对方。" |
| 17 | 文案/数据常量 placeholder | "记下想留给自己看的信息" |
| 17 | 文案/数据常量 save | "保存备注" |
| 17 | 文案/数据常量 saving | "正在保存…" |
| 17 | 文案/数据常量 close | "关闭" |
| 17 | 文案/数据常量 saved | "备注已保存" |
| 17 | 文案/数据常量 error | "未能确认保存结果。备注内容已保留，请重试。" |
| 18 | 文案/数据常量 title | "Add contact note" |
| 18 | 文案/数据常量 privacy | "Only visible to you. Nothing is sent to this contact." |
| 18 | 文案/数据常量 placeholder | "Write something to remember" |
| 18 | 文案/数据常量 save | "Save note" |
| 18 | 文案/数据常量 saving | "Saving…" |
| 18 | 文案/数据常量 close | "Close" |
| 18 | 文案/数据常量 saved | "Note saved" |
| 18 | 文案/数据常量 error | "Could not confirm the save. Your note is still here; please retry." |
| 19 | 文案/数据常量 title | "連絡先メモを追加" |
| 19 | 文案/数据常量 privacy | "自分だけに表示されます。相手には送信されません。" |
| 19 | 文案/数据常量 placeholder | "覚えておきたいことを記入" |
| 19 | 文案/数据常量 save | "メモを保存" |
| 19 | 文案/数据常量 saving | "保存中…" |
| 19 | 文案/数据常量 close | "閉じる" |
| 19 | 文案/数据常量 saved | "メモを保存しました" |
| 19 | 文案/数据常量 error | "保存結果を確認できませんでした。内容は残っています。もう一度お試しください。" |
| 56 | 属性 aria-label | copy.title |
| 59 | 属性 placeholder | copy.placeholder |
| 59 | 属性 aria-label | copy.title |

## repos/orbits/app/(app)/app/contacts/contact-relationship-initialization-view-model.ts

源码：[contact-relationship-initialization-view-model.ts](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/contact-relationship-initialization-view-model.ts>)

静态来源入口：`/app/contacts`、`/app/contacts/[id]`、`/app/contacts/intros`、`/app/contacts/pipeline`

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 46 | endpoint | 路径常量 | 见调用/handler | `/api/contacts/${encodeURIComponent(contactId)}/relationship-initialization` |
| 48 | readContactInitialization | 调用 | GET/由封装决定 | endpoint(contactId) |
| 80 | saveContactInitialization | 调用 | POST | endpoint(contactId) |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 19 | 文案/数据常量 zh | "进行中" |
| 19 | 文案/数据常量 en | "Active" |
| 20 | 文案/数据常量 zh | "需要跟进" |
| 20 | 文案/数据常量 en | "Needs follow-up" |
| 21 | 文案/数据常量 zh | "维护中" |
| 21 | 文案/数据常量 en | "Nurture" |
| 22 | 文案/数据常量 zh | "已归档" |
| 22 | 文案/数据常量 en | "Archived" |

## repos/orbits/app/(app)/app/contacts/contact-relationship-initialization.tsx

源码：[contact-relationship-initialization.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/contact-relationship-initialization.tsx>)

静态来源入口：`/app/contacts/[id]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 79 | ContactRelationshipInitializationPanel | section | text("我的关系设置", "My relationship settings") | nc-card |
| 80 | ContactRelationshipInitializationPanel | h2 | text("我的关系设置", "My relationship settings") | h-section |

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 11 | [view, setView] = useState&lt;InitializationView&gt;({ state: "loading" }) |
| 12 | [draft, setDraft] = useState(blankDraft) |
| 13 | [error, setError] = useState("") |
| 14 | [notice, setNotice] = useState&lt;"saved" \| "replayed" \| null&gt;(null) |
| 15 | [busy, setBusy] = useState(true) |
| 16 | [locked, setLocked] = useState(false) |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 87 | form-submit-boundary/form · ContactRelationshipInitializationPanel | {text("关系阶段", "Relationship stage")} {text("请明确选择", "Choose explicitly")} {Object.entries(initializationStageLabels).map(([stage, label]) =&gt; &lt;option key={stage} value={stage}&gt;{label[language]}&lt;/option&gt;)} {&lt;label style={fieldStyle}&gt;{text("关系目标", "Relationship goal")}&lt;textarea aria-label={text("关系目标", "Relationship goal")} required maxLength={2000} value={c.draft.goal} disabled={disabled} onChange={event =&gt; c.change("goal", event.target.value)} /&gt;&lt;/label&gt;} / {null} {&lt;&gt; &lt;label s …（完整表达式见源码） | onsubmit: async event =&gt; { event.preventDefault(); await c.submit(); } | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 88 | field/select · ContactRelationshipInitializationPanel | text("关系阶段", "Relationship stage") | onchange: event =&gt; c.change("stage", event.target.value) | {"disabled":"disabled","renderGateProps":[],"conditions":[]} |
| 92 | field/textarea · ContactRelationshipInitializationPanel | text("关系目标", "Relationship goal") | onchange: event =&gt; c.change("goal", event.target.value) | {"disabled":"disabled","renderGateProps":[],"conditions":[]} |
| 94 | field/input · ContactRelationshipInitializationPanel | text("跟进内容", "Next step") | onchange: event =&gt; c.change("title", event.target.value) | {"disabled":"disabled","renderGateProps":[],"conditions":[]} |
| 95 | field/input · ContactRelationshipInitializationPanel | text("下次跟进时间", "Next step date") | onchange: event =&gt; c.change("due", event.target.value) | {"disabled":"disabled","renderGateProps":[],"conditions":[]} |
| 99 | button/button · ContactRelationshipInitializationPanel | {text("保存中…", "Saving…")} / {text("重试原提交", "Retry original submission")} / {text("确认我的选择", "Confirm my choice")} |  | {"disabled":"c.busy \|\| !c.draft.stage","renderGateProps":[],"conditions":[]} |
| 106 | link/a · ContactRelationshipInitializationPanel | {text("处理关系跟进", "Manage relationship follow-up")} | c.view.taskHref | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 108 | button/button · ContactRelationshipInitializationPanel | {text("刷新关系状态", "Refresh relationship state")} | onclick: c.refresh | {"disabled":"c.busy","renderGateProps":[],"conditions":[]} |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 79 | 属性 aria-label | text("我的关系设置", "My relationship settings") |
| 88 | 属性 aria-label | text("关系阶段", "Relationship stage") |
| 92 | 属性 aria-label | text("关系目标", "Relationship goal") |
| 94 | 属性 aria-label | text("跟进内容", "Next step") |
| 95 | 属性 aria-label | text("下次跟进时间", "Next step date") |

## repos/orbits/app/(app)/app/contacts/contact-tag-editor.tsx

源码：[contact-tag-editor.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/contact-tag-editor.tsx>)

静态来源入口：`/app/contacts/[id]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 85 | ContactTagEditor | h2 | copy.title | h-section |

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 20 | [labels] = useState(() =&gt; new Map(initialTags.map((tag) =&gt; [tag.value, tag.label]))) |
| 21 | [tags, setTags] = useState(() =&gt; initialTags.map((tag) =&gt; tag.value)) |
| 22 | [savedTags, setSavedTags] = useState(() =&gt; initialTags.map((tag) =&gt; tag.value)) |
| 23 | [input, setInput] = useState("") |
| 24 | [error, setError] = useState&lt;string \| null&gt;(null) |
| 25 | [status, setStatus] = useState&lt;"idle" \| "saving" \| "saved"&gt;("idle") |

### 弹层根/原生确认

| 行 | 类型 | 名称/标题表达式 |
| --- | --- | --- |
| 84 | dialog | copy.title |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 89 | button/button · ContactTagEditor | `${copy.remove}${labels.get(tag) ?? tag}` | onclick: () =&gt; { if (!pending.current) { setTags(tags.filter((value) =&gt; value !== tag)); setError(null); setStatus("idle"); } } | {"disabled":"status === \"saving\"","renderGateProps":[],"conditions":[]} |
| 94 | field/input · ContactTagEditor | copy.add | onchange: (event) =&gt; setInput(event.target.value); onkeydown: (event) =&gt; { if (event.key === "Enter") { event.preventDefault(); add(); } } | {"disabled":"status === \"saving\"","renderGateProps":[],"conditions":[]} |
| 95 | button/button · ContactTagEditor | {copy.add} | onclick: add | {"disabled":"status === \"saving\" \|\| !input.trim()","renderGateProps":[],"conditions":[]} |
| 100 | button/button · ContactTagEditor | {copy.close} | onclick: onClose | {"disabled":"status === \"saving\"","renderGateProps":[],"conditions":[]} |
| 101 | button/button · ContactTagEditor | {copy.saving} / {copy.save} | onclick: save | {"disabled":"status === \"saving\" \|\| (!addTags.length && !removeTags.length)","renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 53 | save | 调用 | PATCH | `/api/contacts/${encodeURIComponent(contactId)}` |
| 53 | save | 路径常量 | 见调用/handler | `/api/contacts/${encodeURIComponent(contactId)}` |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 16 | 文案/数据常量 title | "自定义标签" |
| 16 | 文案/数据常量 add | "添加标签" |
| 16 | 文案/数据常量 remove | "移除标签：" |
| 16 | 文案/数据常量 save | "保存标签" |
| 16 | 文案/数据常量 saving | "正在保存…" |
| 16 | 文案/数据常量 close | "关闭" |
| 16 | 文案/数据常量 empty | "暂无标签" |
| 16 | 文案/数据常量 saved | "标签已保存" |
| 16 | 文案/数据常量 duplicate | "这个标签已经存在。" |
| 16 | 文案/数据常量 limit | "最多 20 个标签，每个新标签不超过 32 个字。" |
| 16 | 文案/数据常量 error | "未能确认保存结果。你的修改已保留，请重试。" |
| 17 | 文案/数据常量 title | "Custom tags" |
| 17 | 文案/数据常量 add | "Add tag" |
| 17 | 文案/数据常量 remove | "Remove tag: " |
| 17 | 文案/数据常量 save | "Save tags" |
| 17 | 文案/数据常量 saving | "Saving…" |
| 17 | 文案/数据常量 close | "Close" |
| 17 | 文案/数据常量 empty | "No tags yet" |
| 17 | 文案/数据常量 saved | "Tags saved" |
| 17 | 文案/数据常量 duplicate | "This tag already exists." |
| 17 | 文案/数据常量 limit | "Keep up to 20 tags, with no more than 32 characters per new tag." |
| 17 | 文案/数据常量 error | "Could not confirm the save. Your changes are still here; please retry." |
| 18 | 文案/数据常量 title | "カスタムタグ" |
| 18 | 文案/数据常量 add | "タグを追加" |
| 18 | 文案/数据常量 remove | "タグを削除：" |
| 18 | 文案/数据常量 save | "タグを保存" |
| 18 | 文案/数据常量 saving | "保存中…" |
| 18 | 文案/数据常量 close | "閉じる" |
| 18 | 文案/数据常量 empty | "タグはありません" |
| 18 | 文案/数据常量 saved | "タグを保存しました" |
| 18 | 文案/数据常量 duplicate | "このタグは既にあります。" |
| 18 | 文案/数据常量 limit | "タグは20個まで、新しいタグは32文字以内で追加できます。" |
| 18 | 文案/数据常量 error | "保存結果を確認できませんでした。変更内容は残っています。もう一度お試しください。" |
| 84 | 属性 aria-label | copy.title |
| 89 | 属性 aria-label | `${copy.remove}${labels.get(tag) ?? tag}` |
| 94 | 属性 aria-label | copy.add |

## repos/orbits/app/(app)/app/contacts/orbit-contact-avatar.tsx

源码：[orbit-contact-avatar.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/orbit-contact-avatar.tsx>)

静态来源入口：`/app/contacts`、`/app/contacts/[id]`

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 21 | 属性 title | contact.displayName |
| 31 | 属性 title | contact.displayName |
| 39 | 属性 alt | asset.alt |

## repos/orbits/app/(app)/app/contacts/orbit-crm-sidebar.tsx

源码：[orbit-crm-sidebar.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/orbit-crm-sidebar.tsx>)

静态来源入口：`/app/contacts`、`/app/contacts/[id]`、`/app/contacts/all-actions`、`/app/contacts/analysis/[dimension]/[bucketId]`、`/app/contacts/dashboard`、`/app/contacts/intros`、`/app/contacts/new`、`/app/contacts/pipeline`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 121 | CrmSidebar | aside |  |  |

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 111 | [expanded, setExpanded] = useState(false) |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 69 | link/a · NavGroup | {t(item.label)} {&lt;span style={{ fontFamily: "var(--ff-mono)", fontSize: 12, opacity: 0.8 }}&gt;{count}&lt;/span&gt;} / {null} | item.href | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 124 | button/button · CrmSidebar | Hide extra views / 收起更多分析与记录 / More analysis & records / 更多分析与记录 | onclick: () =&gt; setExpanded((value) =&gt; !value) | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 38 | 文案/数据常量 en | "All contacts" |
| 38 | 文案/数据常量 zh | "全部人脉" |
| 39 | 文案/数据常量 en | "Relationship progress" |
| 39 | 文案/数据常量 zh | "关系进展" |
| 40 | 文案/数据常量 en | "Introductions" |
| 40 | 文案/数据常量 zh | "引荐记录" |
| 41 | 文案/数据常量 en | "Network analysis" |
| 41 | 文案/数据常量 zh | "人脉分析" |
| 42 | 文案/数据常量 en | "All arrangements" |
| 42 | 文案/数据常量 zh | "全部安排" |
| 46 | 文案/数据常量 en | "Import hub" |
| 46 | 文案/数据常量 zh | "导入中心" |
| 123 | 属性 label | { en: "Wallet", zh: "名片夹" } |
| 123 | 文案/数据常量 en | "Wallet" |
| 123 | 文案/数据常量 zh | "名片夹" |
| 134 | 翻译 en | "Hide extra views" |
| 134 | 翻译 zh | "收起更多分析与记录" |
| 135 | 翻译 en | "More analysis & records" |
| 135 | 翻译 zh | "更多分析与记录" |
| 139 | 属性 label | { en: "Capture", zh: "采集" } |
| 139 | 文案/数据常量 en | "Capture" |
| 139 | 文案/数据常量 zh | "采集" |

## repos/orbits/app/(app)/app/contacts/orbit-real-card-connection.tsx

源码：[orbit-real-card-connection.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/orbit-real-card-connection.tsx>)

静态来源入口：`/app/contacts/[id]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 122 | CardTitle | h2 | children | h-section |
| 246 | TwoWayCard | h2 | t({ en: "Two-way value", zh: "双向价值分析" }) | h-section |
| 350 | ContactNotesCard | section | copy.title | card nc-card-pad |
| 465 | OrbitRealCardConnection | main | noteEditContactId === contact.id ? ( &lt;ContactNotesEditor key={contact.id} contactId={contact.id} language={language} onClose={() =&gt; setNoteEditContactId(null)} onSaved={(notes) =&gt; { setNoteUpdate({ contactId: sourceContact.id, notes }); setNoteEditContactId(null); }} /&gt; ) : null interactionEditContactId === contact.id …（完整表达式见源码） | orbit-page |
| 479 | OrbitRealCardConnection | h1 | contact.displayName \|\| t({ en: "Unnamed contact", zh: "未命名联系人" }) | h-display |

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 414 | [industryEditContactId, setIndustryEditContactId] = useState&lt;string \| null&gt;(null) |
| 415 | [industryUpdate, setIndustryUpdate] = useState&lt;{ source: OrbitContactView; value: string \| null; secondaryValue: string \| null } \| null&gt;(null) |
| 416 | [tagEditContactId, setTagEditContactId] = useState&lt;string \| null&gt;(null) |
| 417 | [tagUpdate, setTagUpdate] = useState&lt;{ source: OrbitContactView; tags: { value: string; label: string }[] } \| null&gt;(null) |
| 418 | [interactionEditContactId, setInteractionEditContactId] = useState&lt;string \| null&gt;(null) |
| 419 | [interactionUpdate, setInteractionUpdate] = useState&lt;{ source: OrbitContactView; value: NonNullable&lt;OrbitContactView["editableInteraction"]&gt; } \| null&gt;(null) |
| 420 | [noteEditContactId, setNoteEditContactId] = useState&lt;string \| null&gt;(null) |
| 423 | [noteUpdate, setNoteUpdate] = useState&lt;{ contactId: string; notes: OrbitContactView["notes"] } \| null&gt;(null) |
| 447 | [toast, setToast] = useState&lt;string \| null&gt;(null) |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 147 | button/button · ContactCard | t({ en: "Edit primary industry", zh: "编辑主要行业" }) | onclick: onEditIndustry | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 153 | button/button · ContactCard | t({ en: "Edit last interaction", zh: "编辑最近互动" }) | onclick: onEditInteraction | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 224 | button/button · TagsCard | t({ en: "Edit custom tags", zh: "编辑自定义标签" }) | onclick: onEdit | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 359 | button/button · ContactNotesCard | copy.label | onclick: onAdd | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 392 | link/a · NextStepCard | View relationship progress / 查看关系进展 | /app/contacts/pipeline | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 473 | link/a · OrbitRealCardConnection | Back to contacts / 返回名片夹 | /app/contacts | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 490 | link/a · OrbitRealCardConnection | Ask iOrbit / 问 iOrbit | askAgentHref | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 491 | button/button · OrbitRealCardConnection | Draft email / 起草邮件 | onclick: draftEmail | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 499 | callback-control/ContactCard · OrbitRealCardConnection |  | oneditindustry: () =&gt; setIndustryEditContactId(contact.id); oneditinteraction: () =&gt; setInteractionEditContactId(contact.id) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 500 | callback-control/TagsCard · OrbitRealCardConnection |  | onedit: () =&gt; setTagEditContactId(contact.id) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 517 | link/a · OrbitRealCardConnection | t({ en: "Back to contacts", zh: "返回名片夹" }) | /app/contacts | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 541 | link/a · OrbitRealCardConnection | Ask iOrbit / 问 iOrbit | askAgentHref | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 542 | button/button · OrbitRealCardConnection | Draft email / 起草邮件 | onclick: draftEmail | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 548 | callback-control/ContactCard · OrbitRealCardConnection |  | oneditindustry: () =&gt; setIndustryEditContactId(contact.id); oneditinteraction: () =&gt; setInteractionEditContactId(contact.id) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 549 | callback-control/TagsCard · OrbitRealCardConnection |  | onedit: () =&gt; setTagEditContactId(contact.id) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 559 | callback-control/ContactNotesEditor · OrbitRealCardConnection |  | onclose: () =&gt; setNoteEditContactId(null); onsaved: (notes) =&gt; { setNoteUpdate({ contactId: sourceContact.id, notes }); setNoteEditContactId(null); } | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 566 | callback-control/ContactInteractionEditor · OrbitRealCardConnection |  | onclose: () =&gt; setInteractionEditContactId(null); onsaved: (value) =&gt; { setInteractionUpdate({ source: sourceContact, value }); setInteractionEditContactId(null); } | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 573 | callback-control/ContactTagEditor · OrbitRealCardConnection |  | onclose: () =&gt; setTagEditContactId(null); onsaved: (values) =&gt; { setTagUpdate({ source: sourceContact, tags: values.map((value) =&gt; ({ value, label: tagLabel(value, language) })) }); setTagEditContactId(null); } | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 580 | callback-control/ContactIndustryEditor · OrbitRealCardConnection |  | onclose: () =&gt; setIndustryEditContactId(null); onsaved: (value, secondaryValue) =&gt; { setIndustryUpdate({ source: sourceContact, value, secondaryValue }); setIndustryEditContactId(null); } | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 35 | 文案/数据常量 en | "Strong" |
| 35 | 文案/数据常量 zh | "强关系" |
| 36 | 文案/数据常量 en | "Medium" |
| 36 | 文案/数据常量 zh | "中关系" |
| 37 | 文案/数据常量 en | "Weak" |
| 37 | 文案/数据常量 zh | "弱关系" |
| 38 | 文案/数据常量 en | "Dormant" |
| 38 | 文案/数据常量 zh | "沉睡" |
| 39 | 文案/数据常量 en | "Unscored" |
| 39 | 文案/数据常量 zh | "未评分" |
| 47 | 翻译 en | "No company or title yet" |
| 47 | 翻译 zh | "暂无公司职位" |
| 54 | 文案/数据常量 en | "Business card scan" |
| 54 | 文案/数据常量 zh | "名片扫描确认" |
| 55 | 文案/数据常量 en | "Business card exchange" |
| 55 | 文案/数据常量 zh | "名片交换" |
| 56 | 文案/数据常量 en | "QR scan" |
| 56 | 文案/数据常量 zh | "现场扫码" |
| 57 | 文案/数据常量 en | "Event import" |
| 57 | 文案/数据常量 zh | "活动导入" |
| 58 | 文案/数据常量 en | "Imported contact" |
| 58 | 文案/数据常量 zh | "通讯录导入" |
| 59 | 文案/数据常量 en | "Referral" |
| 59 | 文案/数据常量 zh | "朋友推荐" |
| 60 | 文案/数据常量 en | "Manual entry" |
| 60 | 文案/数据常量 zh | "手动添加" |
| 111 | 翻译 en | "Stage" |
| 111 | 翻译 zh | "关系阶段" |
| 113 | 翻译 en | "Source-backed · read only" |
| 113 | 翻译 zh | "来源数据 · 只读" |
| 140 | 翻译 en | "Contact" |
| 140 | 翻译 zh | "联系方式" |
| 141 | 翻译 en | "Email" |
| 141 | 翻译 zh | "邮箱" |
| 142 | 翻译 en | "Phone" |
| 142 | 翻译 zh | "电话" |
| 144 | 翻译 en | "Industry" |
| 144 | 翻译 zh | "行业" |
| 145 | 翻译 en | "Unclassified" |
| 145 | 翻译 zh | "未分类" |
| 146 | 翻译 en | "Secondary industry not set" |
| 146 | 翻译 zh | "二级未填写" |
| 147 | 属性 aria-label | t({ en: "Edit primary industry", zh: "编辑主要行业" }) |
| 147 | 翻译 en | "Edit primary industry" |
| 147 | 翻译 zh | "编辑主要行业" |
| 147 | 翻译 en | "Edit" |
| 147 | 翻译 zh | "编辑" |
| 149 | 翻译 en | "Location" |
| 149 | 翻译 zh | "所在地" |
| 150 | 翻译 en | "Met via" |
| 150 | 翻译 zh | "认识来源" |
| 151 | 翻译 en | "Last touch" |
| 151 | 翻译 zh | "最近互动" |
| 152 | 翻译 en | "No interaction recorded" |
| 152 | 翻译 zh | "暂无互动记录" |
| 153 | 属性 aria-label | t({ en: "Edit last interaction", zh: "编辑最近互动" }) |
| 153 | 翻译 en | "Edit last interaction" |
| 153 | 翻译 zh | "编辑最近互动" |
| 153 | 翻译 en | "Edit" |
| 153 | 翻译 zh | "编辑" |
| 175 | 翻译 en | "Profile" |
| 175 | 翻译 zh | "个人资料" |
| 178 | 翻译 en | "Relationship context" |
| 178 | 翻译 zh | "关系背景" |
| 184 | 翻译 en | "Bio" |
| 184 | 翻译 zh | "简介" |
| 190 | 翻译 en | "Self-introduction" |
| 190 | 翻译 zh | "自我介绍" |
| 196 | 翻译 en | "Topics" |
| 196 | 翻译 zh | "关注话题" |
| 204 | 翻译 en | "Conversation starters" |
| 204 | 翻译 zh | "对话切入点" |
| 223 | 翻译 en | "Tags" |
| 223 | 翻译 zh | "标签" |
| 224 | 属性 aria-label | t({ en: "Edit custom tags", zh: "编辑自定义标签" }) |
| 224 | 翻译 en | "Edit custom tags" |
| 224 | 翻译 zh | "编辑自定义标签" |
| 224 | 翻译 en | "Edit tags" |
| 224 | 翻译 zh | "编辑标签" |
| 233 | 翻译 en | "them" |
| 233 | 翻译 zh | "对方" |
| 246 | 翻译 en | "Two-way value" |
| 246 | 翻译 zh | "双向价值分析" |
| 250 | 文案/数据常量 en | "Basis: contact profile offering / seeking" |
| 250 | 文案/数据常量 zh | "依据：联系人画像的 offering / seeking" |
| 256 | 翻译 en | `${name} is looking for` |
| 256 | 翻译 zh | "对方希望获得" |
| 260 | 翻译 en | "No stated needs yet" |
| 260 | 翻译 zh | "暂无对方的需求信息" |
| 264 | 翻译 en | `${name} offers` |
| 264 | 翻译 zh | "对方能提供" |
| 268 | 翻译 en | "No stated offerings yet" |
| 268 | 翻译 zh | "暂无对方的资源信息" |
| 290 | 文案/数据常量 dateStyle | "medium" |
| 291 | 文案/数据常量 timeStyle | "short" |
| 294 | 文案/数据常量 dateStyle | "long" |
| 295 | 文案/数据常量 timeStyle | "short" |
| 313 | 翻译 en | "Timeline" |
| 313 | 翻译 zh | "互动时间线" |
| 322 | 翻译 en | "Relationship shared" |
| 322 | 翻译 zh | "关系双方可见" |
| 329 | 翻译 en | "Evidence" |
| 329 | 翻译 zh | "来源证据" |
| 336 | 翻译 en | "No sourced interaction evidence is available for this contact." |
| 336 | 翻译 zh | "该联系人暂无可核验的互动证据。" |
| 344 | 文案/数据常量 title | "联系人备注" |
| 344 | 文案/数据常量 privacy | "仅自己可见" |
| 344 | 文案/数据常量 add | "添加备注" |
| 344 | 文案/数据常量 label | "添加联系人备注" |
| 344 | 文案/数据常量 empty | "还没有备注，可以记下想留给自己看的信息。" |
| 345 | 文案/数据常量 title | "Contact notes" |
| 345 | 文案/数据常量 privacy | "Only visible to you" |
| 345 | 文案/数据常量 add | "Add note" |
| 345 | 文案/数据常量 label | "Add contact note" |
| 345 | 文案/数据常量 empty | "No notes yet. Write something you want to remember." |
| 346 | 文案/数据常量 title | "連絡先メモ" |
| 346 | 文案/数据常量 privacy | "自分だけに表示" |
| 346 | 文案/数据常量 add | "メモを追加" |
| 346 | 文案/数据常量 label | "連絡先メモを追加" |
| 346 | 文案/数据常量 empty | "メモはまだありません。覚えておきたいことを記入できます。" |
| 350 | 属性 aria-label | copy.title |
| 359 | 属性 aria-label | copy.label |
| 373 | 翻译 en | "Next step" |
| 373 | 翻译 zh | "下一步建议" |
| 376 | 翻译 en | "No sourced next step is available." |
| 376 | 翻译 zh | "暂无来源明确的下一步建议。" |
| 384 | 文案/数据常量 en | `Basis: ${reason}` |
| 384 | 文案/数据常量 zh | `依据：${reason}` |
| 385 | 文案/数据常量 en | "Basis: sourced contact record" |
| 385 | 文案/数据常量 zh | "依据：联系人来源记录" |
| 393 | 翻译 en | "View relationship progress" |
| 393 | 翻译 zh | "查看关系进展" |
| 406 | 翻译 en | "Pending initialization" |
| 406 | 翻译 zh | "待设置关系" |
| 409 | 翻译 en | "Relationship state unavailable" |
| 409 | 翻译 zh | "关系状态尚未确认" |
| 462 | 翻译 en | "Draft started in inbox" |
| 462 | 翻译 zh | "已在收件箱开始起草" |
| 473 | 翻译 en | "Back to contacts" |
| 473 | 翻译 zh | "返回名片夹" |
| 479 | 翻译 en | "Unnamed contact" |
| 479 | 翻译 zh | "未命名联系人" |
| 486 | 翻译 en | "Met via" |
| 486 | 翻译 zh | "认识于" |
| 490 | 翻译 en | "Ask iOrbit" |
| 490 | 翻译 zh | "问 iOrbit" |
| 491 | 翻译 en | "Draft email" |
| 491 | 翻译 zh | "起草邮件" |
| 517 | 属性 aria-label | t({ en: "Back to contacts", zh: "返回名片夹" }) |
| 517 | 翻译 en | "Back to contacts" |
| 517 | 翻译 zh | "返回名片夹" |
| 522 | 翻译 en | "Contacts" |
| 522 | 翻译 zh | "人脉" |
| 529 | 翻译 en | "Unnamed contact" |
| 529 | 翻译 zh | "未命名联系人" |
| 541 | 翻译 en | "Ask iOrbit" |
| 541 | 翻译 zh | "问 iOrbit" |
| 542 | 翻译 en | "Draft email" |
| 542 | 翻译 zh | "起草邮件" |

## repos/orbits/app/(app)/app/contacts/orbit-real-cards-pipeline-view.tsx

源码：[orbit-real-cards-pipeline-view.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/orbit-real-cards-pipeline-view.tsx>)

静态来源入口：`/app/contacts/pipeline`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 178 | OrbitRealCardsPipelineView | main |  | orbit-page |
| 215 | OrbitRealCardsPipelineView | h1 | t({ en: "Relationship progress", zh: "关系进展" }) | h-display |
| 239 | OrbitRealCardsPipelineView | section |  | nc-kcol |
| 240 | OrbitRealCardsPipelineView | header |  | nc-kcol-head |
| 282 | OrbitRealCardsPipelineView | h1 | t({ en: "Relationship progress", zh: "关系进展" }) | h-title |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 62 | link/a · PipelineCard | {contact.displayName} {contact.company} {` · ${contact.title}`} {&lt;StrengthTag strength={ contact.strength === "dormant" ? "dormant" : "strong" } t={t} /&gt;} / {null} {&lt;span className="nc-tag nc-tag-value"&gt;{contact.valueTags[0]}&lt;/span&gt;} / {null} {&lt;div className="nc-knext"&gt; &lt;Icon name={contact.dormant ? "refresh" : "arrow"} size={16} /&gt; &lt;span style={{ flex: 1 }}&gt;{contact.nextAction.text}&lt;/span&gt; &lt;Basis copy={{ en: contact.nextAction.reason, zh: contact.nextAction.reason, }} eviden …（完整表达式见源码） | `/app/contacts/${contact.id}` | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 23 | 文案/数据常量 en | "Strong" |
| 23 | 文案/数据常量 zh | "强" |
| 24 | 文案/数据常量 en | "Medium" |
| 24 | 文案/数据常量 zh | "中" |
| 25 | 文案/数据常量 en | "Dormant" |
| 25 | 文案/数据常量 zh | "沉睡" |
| 109 | 翻译 en | "Open contact" |
| 109 | 翻译 zh | "打开联系人" |
| 173 | 翻译 en | "Read-only grouping from follow-up signals and relationship-value evidence. Open a contact to review its source records." |
| 174 | 翻译 zh | "只读分类，依据跟进信号与关系价值证据生成。打开联系人可查看来源记录。" |
| 216 | 翻译 en | "Relationship progress" |
| 216 | 翻译 zh | "关系进展" |
| 226 | 翻译 en | `${total} source-backed contacts grouped for review` |
| 227 | 翻译 zh | `${total} 位有来源依据的联系人，按关系信号分类` |
| 283 | 翻译 en | "Relationship progress" |
| 283 | 翻译 zh | "关系进展" |
| 293 | 翻译 en | `${total} source-backed contacts` |
| 294 | 翻译 zh | `${total} 位有来源依据的联系人` |

## repos/orbits/app/(app)/app/contacts/orbit-real-contacts.tsx

源码：[orbit-real-contacts.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/orbit-real-contacts.tsx>)

静态来源入口：`/app/contacts`、`/app/contacts/[id]`、`/app/contacts/intros`、`/app/contacts/pipeline`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 171 | MobileCrmHeader | h1 | t({ en: "All contacts", zh: "全部人脉" }) | h-display |
| 344 | PersonCard | h2 | item.displayName \|\| t({ en: "Unnamed contact", zh: "未命名联系人" }) | h-section |
| 520 | OrbitRealCardsList | main |  | orbit-page |
| 529 | OrbitRealCardsList | h1 | t({ en: "All contacts", zh: "全部人脉" }) | h-display |
| 1092 | IntroDetailModal | h2 | intro.labelA intro.labelB | h-title |
| 1100 | IntroDetailModal | section |  | card-flat |
| 1288 | IntroComposerModal | h2 | picking === "a" ? t({ en: "Pick the first contact", zh: "选择第一位联系人" }) : t({ en: "Pick the second contact", zh: "选择第二位联系人" }) | h-title |
| 1338 | IntroComposerModal | h2 | t({ en: "Make an introduction", zh: "发起引荐" }) | h-title |
| 1383 | OrbitRealCardsIntros | section |  | orbit-intro-stats |
| 1391 | OrbitRealCardsIntros | main | composerOpen ? &lt;IntroComposerModal onClose={() =&gt; setComposerOpen(false)} onCreated={(introduction) =&gt; { setIntroductions((current) =&gt; [introduction, ...current]); setComposerOpen(false); }} t={t} viewModel={viewModel} /&gt; : null selectedIntroduction ? &lt;IntroDetailModal intro={selectedIntroduction} onClose={() =&gt; setSel …（完整表达式见源码） | orbit-personal-page |
| 1399 | OrbitRealCardsIntros | h1 | t({ en: "Introductions", zh: "引荐记录" }) | h-display |
| 1413 | OrbitRealCardsIntros | section | visible.map((intro) =&gt; &lt;IntroRow intro={intro} key={intro.id} onOpen={() =&gt; setSelectedIntroduction(intro)} t={t} /&gt;) | orbit-intro-list |
| 1437 | OrbitRealCardsIntros | section | visible.map((intro) =&gt; &lt;IntroRow intro={intro} key={intro.id} onOpen={() =&gt; setSelectedIntroduction(intro)} t={t} /&gt;) | orbit-intro-list |

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 471 | [query, setQuery] = useState("") |
| 472 | [stage, setStage] = useState&lt;"all" \| OrbitContactPipelineStatus&gt;("all") |
| 473 | [valueTag, setValueTag] = useState&lt;string \| null&gt;(null) |
| 1189 | [aId, setAId] = useState("") |
| 1190 | [bId, setBId] = useState("") |
