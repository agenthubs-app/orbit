# 03-contacts：源码明细

证据级别：当前工作区源码。此表列出符号级静态可达实现，不宣称每项都在某个角色/状态实际显示。按钮按 JSX 实现记录；数组 map 可生成多项按钮，条件分支互斥，不能把实现数当 DOM 按钮数。

调用表按所属函数提供 HTTP 路径/方法证据；与按钮 handler 是否连通应结合 handler 源码核对。仅同一文件出现的 API 不等于该按钮调用它。路径常量不是一次额外请求。跨文件、动态路径和 callback 不强行配对。

文案包含原有中文/英文/日文及动态表达式。表格中的长表达式节选有标记；完整内容在对应源码。布局表只证明 HTML/ARIA 分区，不证明实际视觉位置。全局 shell 与 layout 另见 01、02。开发页共享组件的来源入口会标为 /dev，不算客户页面。

## repos/orbits/app/(app)/app/contacts/[id]/appointment-memo-capture.tsx

源码：[appointment-memo-capture.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/[id]/appointment-memo-capture.tsx>)

静态来源入口：`/app/contacts/[id]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 59 | AppointmentMemoCapture | section | 正在核验约谈与联系人… | card-flat |
| 91 | AppointmentMemoCapture | section | saved ? &lt;p role="status" style={{ color: "var(--success)", margin: 0 }}&gt;纪要已保存为该联系人的私密互动证据，等待投影到联系人详情。&lt;/p&gt; : ( &lt;form onSubmit={submit} style={{ display: "grid", gap: 10 }}&gt; &lt;label style={{ display: "grid", gap: 5 }}&gt; &lt;span&gt;纪要&lt;/span&gt; &lt;textarea className="field" maxLength={5000} onChange={(event) =&gt; setNoteText(event.targ …（完整表达式见源码） | card-flat |

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 32 | [entry, setEntry] = useState&lt;MemoEntry \| null&gt;(null) |
| 33 | [error, setError] = useState("") |
| 34 | [loading, setLoading] = useState(Boolean(appointmentId && eventId)) |
| 35 | [saving, setSaving] = useState(false) |
| 36 | [saved, setSaved] = useState(false) |
| 37 | [noteText, setNoteText] = useState("") |
| 38 | [nextStep, setNextStep] = useState("") |
| 39 | [commitments, setCommitments] = useState("") |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 99 | form-submit-boundary/form · AppointmentMemoCapture | 纪要 下一步 承诺事项（每行一项） 保存中… / 保存纪要 {&lt;p role="alert" style={{ color: "var(--danger)", margin: 0 }}&gt;{error}&lt;/p&gt;} / {null} | onsubmit: submit | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 102 | field/textarea · AppointmentMemoCapture | 纪要 | onchange: (event) =&gt; setNoteText(event.target.value) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 106 | field/input · AppointmentMemoCapture | 下一步 | onchange: (event) =&gt; setNextStep(event.target.value) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 110 | field/textarea · AppointmentMemoCapture | 承诺事项（每行一项） | onchange: (event) =&gt; setCommitments(event.target.value) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 112 | button/button · AppointmentMemoCapture | 保存中… / 保存纪要 |  | {"disabled":"saving \|\| !noteText.trim()","renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 46 | AppointmentMemoCapture | 调用 | GET/由封装决定 | `/api/appointments/${encodeURIComponent(appointmentId)}/memo?${query}` |
| 46 | AppointmentMemoCapture | 路径常量 | 见调用/handler | `/api/appointments/${encodeURIComponent(appointmentId)}/memo?${query}` |
| 69 | submit | 调用 | POST | `/api/appointments/${encodeURIComponent(entry.appointmentId)}/memo` |
| 69 | submit | 路径常量 | 见调用/handler | `/api/appointments/${encodeURIComponent(entry.appointmentId)}/memo` |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 57 | JSX文字 | 纪要链接无效：需要唯一的 capture=meeting-memo、appointmentId 和 eventId。 |
| 59 | JSX文字 | 正在核验约谈与联系人… |
| 93 | JSX文字 | 会后纪要 |
| 95 | JSX文字 | 已核验约谈完成记录： |
| 98 | JSX文字 | 纪要已保存为该联系人的私密互动证据，等待投影到联系人详情。 |
| 101 | JSX文字 | 纪要 |
| 105 | JSX文字 | 下一步 |
| 109 | JSX文字 | 承诺事项（每行一项） |

## repos/orbits/app/(app)/app/contacts/[id]/page.tsx

源码：[page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/[id]/page.tsx>)

静态来源入口：`/app/contacts/[id]`

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 66 | 属性 title | routeModel.title |
| 70 | 翻译 en | "Contact detail" |
| 70 | 翻译 ja | "連絡先の詳細" |
| 70 | 翻译 zh | "联系人详情" |
| 72 | 翻译 en | "No contact detail, evidence, relationship value, AI, message, notification, or external provider work is executed from this route state." |
| 73 | 翻译 ja | "このルート状態では、連絡先の詳細、根拠、関係価値、AI、メッセージ、通知、外部プロバイダーの処理は一切実行されません。" |
| 74 | 翻译 zh | "此路由状态不会执行任何联系人详情、证据、关系价值、AI、消息、通知或外部提供方操作。" |
| 165 | JSX文字 | 约谈链接无效：需要唯一的 appointmentId 和 eventId。 |

## repos/orbits/app/(app)/app/contacts/all-actions/orbit-all-actions-controls.tsx

源码：[orbit-all-actions-controls.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/all-actions/orbit-all-actions-controls.tsx>)

静态来源入口：`/app/contacts/all-actions`

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 36 | [pending, setPending] = useState(false) |
| 37 | [error, setError] = useState&lt;string \| null&gt;(null) |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 80 | button/button · OrbitAllActionsControls | 重试失败项 | onclick: () =&gt; void applyTransition("retry") | {"disabled":"pending","renderGateProps":[],"conditions":[]} |
| 90 | button/button · OrbitAllActionsControls | 撤销 | onclick: () =&gt; void applyTransition("undo") | {"disabled":"pending","renderGateProps":[],"conditions":[]} |
| 100 | button/button · OrbitAllActionsControls | 取消执行 | onclick: () =&gt; void applyTransition("cancel") | {"disabled":"pending","renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 47 | applyTransition | 调用 | POST | `/api/agent/ledger/${encodeURIComponent(entryId)}/transition` |
| 48 | applyTransition | 路径常量 | 见调用/handler | `/api/agent/ledger/${encodeURIComponent(entryId)}/transition` |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 86 | JSX文字 | 重试失败项 |
| 96 | JSX文字 | 撤销 |
| 106 | JSX文字 | 取消执行 |

## repos/orbits/app/(app)/app/contacts/all-actions/orbit-copy-draft-button.tsx

源码：[orbit-copy-draft-button.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/all-actions/orbit-copy-draft-button.tsx>)

静态来源入口：`/app/contacts/all-actions`

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 6 | [copied, setCopied] = useState(false) |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 16 | button/button · OrbitCopyDraftButton | 已复制 / 复制草稿 | onclick: () =&gt; void copy() | {"disabled":null,"renderGateProps":[],"conditions":[]} |

## repos/orbits/app/(app)/app/contacts/all-actions/orbit-edit-draft-button.tsx

源码：[orbit-edit-draft-button.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/all-actions/orbit-edit-draft-button.tsx>)

静态来源入口：`/app/contacts/all-actions`

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 17 | button/button · OrbitEditDraftButton | 打开沟通编辑器 | onclick: () =&gt; openRelationshipInboxCompose({ body, organization, recipient, subject, }) | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 29 | JSX文字 | 打开沟通编辑器 |

## repos/orbits/app/(app)/app/contacts/all-actions/orbit-real-all-actions.tsx

源码：[orbit-real-all-actions.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/all-actions/orbit-real-all-actions.tsx>)

静态来源入口：`/app/contacts/all-actions`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 149 | EntryRow | section |  |  |
| 150 | EntryRow | h3 | 内容预览 |  |
| 154 | EntryRow | section |  |  |
| 155 | EntryRow | h3 | 为什么出现 |  |
| 158 | EntryRow | section |  |  |
| 159 | EntryRow | h3 | 实际操作 |  |
| 219 | EntryRow | section |  |  |
| 220 | EntryRow | h3 | 证据与追踪 |  |
| 249 | OrbitRealAllActions | h1 | 安排账本暂时读不出来 |  |
| 259 | OrbitRealAllActions | h1 | 全部安排 |  |
| 263 | OrbitRealAllActions | nav | 开始新的安排 |  |
| 274 | OrbitRealAllActions | h1 | 全部安排 |  |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 105 | link/a · EntryRow | {entryTitle(entry.title)} | entryHref({ activeFilter, entryId: expanded ? undefined : entry.entryId, }) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 264 | link/a · OrbitRealAllActions | 添加联系人 | /app/contacts/new | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 265 | link/a · OrbitRealAllActions | 前往 iOrbit | /app/agent | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 281 | link/a · OrbitRealAllActions | {filter.label} {filter.count} | filter.key === "all" ? "/app/contacts/all-actions" : `/app/contacts/all-actions?status=${filter.key}` | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 123 | JSX文字 | 来源： |
| 126 | JSX文字 | 风险： |
| 126 | JSX文字 | · 更新： |
| 150 | JSX文字 | 内容预览 |
| 155 | JSX文字 | 为什么出现 |
| 159 | JSX文字 | 实际操作 |
| 173 | JSX文字 | · 状态： |
| 190 | JSX文字 | Operation： |
| 191 | JSX文字 | Executor： |
| 192 | JSX文字 | Idempotency： |
| 211 | JSX文字 | 只复制或继续编辑，不会自动发送。 |
| 220 | JSX文字 | 证据与追踪 |
| 229 | JSX文字 | Action： |
| 230 | JSX文字 | Run： |
| 231 | JSX文字 | Payload hash： |
| 248 | JSX文字 | 全部安排 |
| 249 | JSX文字 | 安排账本暂时读不出来 |
| 258 | JSX文字 | 人脉 |
| 259 | JSX文字 | 全部安排 |
| 261 | JSX文字 | 还没有任何安排。待决定、稍后处理和已执行的操作都会在这里统一留痕。 |
| 263 | 属性 aria-label | 开始新的安排 |
| 264 | JSX文字 | 添加联系人 |
| 265 | JSX文字 | 前往 iOrbit |
| 273 | JSX文字 | 人脉 |
| 274 | JSX文字 | 全部安排 |
| 276 | JSX文字 | 日程首页只保留最重要的 3–5 项；其余决定、草稿和执行记录都在这里，可追溯、可撤销。 |
| 310 | JSX文字 | 该状态下没有记录。 |

## repos/orbits/app/(app)/app/contacts/all-actions/page.tsx

源码：[page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/all-actions/page.tsx>)

静态来源入口：`/app/contacts/all-actions`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 34 | AppAllActionsPage | main |  |  |
| 51 | AppAllActionsPage | nav | 人脉分区 | orbit-all-actions-mtabs scroll noscroll |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 52 | link/a · AppAllActionsPage | 全部 | /app/contacts | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 53 | link/a · AppAllActionsPage | 关系进展 / Relationship progress | /app/contacts/pipeline | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 54 | link/a · AppAllActionsPage | 人脉分析 / 人脈分析 / Network analysis | /app/contacts/dashboard | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 55 | link/a · AppAllActionsPage | 引荐 | /app/contacts/intros | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 56 | link/a · AppAllActionsPage | 全部安排 | /app/contacts/all-actions | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 51 | 属性 aria-label | 人脉分区 |
| 52 | JSX文字 | 全部 |
| 55 | JSX文字 | 引荐 |
| 56 | JSX文字 | 全部安排 |

## repos/orbits/app/(app)/app/contacts/analysis/analysis-goal-editor.tsx

源码：[analysis-goal-editor.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/analysis/analysis-goal-editor.tsx>)

静态来源入口：`/app/contacts/dashboard`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 45 | AnalysisGoalEditor | h2 | title | h-section |

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 13 | [baseline, setBaseline] = useState(initialGoal) |
| 14 | [draft, setDraft] = useState(initialGoal) |
| 15 | [status, setStatus] = useState&lt;"idle" \| "saving" \| "error"&gt;("idle") |

### 弹层根/原生确认

| 行 | 类型 | 名称/标题表达式 |
| --- | --- | --- |
| 44 | dialog | title |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 46 | field/textarea · AnalysisGoalEditor | t({ zh: "关系目标", en: "Relationship goal", ja: "関係づくりの目標" }) | onchange: (event) =&gt; { setDraft(event.target.value); setStatus("idle"); } | {"disabled":"status === \"saving\"","renderGateProps":[],"conditions":[]} |
| 49 | button/button · AnalysisGoalEditor | 关闭 / Close / 閉じる | onclick: onClose | {"disabled":"status === \"saving\"","renderGateProps":[],"conditions":[]} |
| 49 | button/button · AnalysisGoalEditor | 正在保存… / Saving… / 保存中… / 保存目标 / Save goal / 目標を保存 | onclick: save | {"disabled":"status === \"saving\" \|\| !changed","renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 32 | save | 调用 | PUT | "/api/profile" |
| 32 | save | 路径常量 | 见调用/handler | "/api/profile" |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 42 | 翻译 zh | "编辑关系目标" |
| 42 | 翻译 en | "Edit relationship goal" |
| 42 | 翻译 ja | "関係づくりの目標を編集" |
| 44 | 属性 aria-label | title |
| 46 | 翻译 zh | "关系目标" |
| 46 | 翻译 en | "Relationship goal" |
| 46 | 翻译 ja | "関係づくりの目標" |
| 46 | 属性 aria-label | t({ zh: "关系目标", en: "Relationship goal", ja: "関係づくりの目標" }) |
| 47 | 翻译 zh | "写下你希望认识谁、推进什么合作。留空保存可清除目标。" |
| 47 | 翻译 en | "Describe who you want to meet and what you want to work on. Save an empty field to clear your goal." |
| 47 | 翻译 ja | "会いたい相手や進めたい協力について入力してください。空欄で保存すると目標を削除できます。" |
| 48 | 翻译 zh | "未能确认保存结果。输入已保留，请重试。" |
| 48 | 翻译 en | "Could not confirm the save. Your input is still here; please retry." |
| 48 | 翻译 ja | "保存結果を確認できませんでした。入力内容は残っています。再試行してください。" |
| 49 | 翻译 zh | "关闭" |
| 49 | 翻译 en | "Close" |
| 49 | 翻译 ja | "閉じる" |
| 49 | 翻译 zh | "正在保存…" |
| 49 | 翻译 en | "Saving…" |
| 49 | 翻译 ja | "保存中…" |
| 49 | 翻译 zh | "保存目标" |
| 49 | 翻译 en | "Save goal" |
| 49 | 翻译 ja | "目標を保存" |

## repos/orbits/app/(app)/app/contacts/analysis/contacts-analysis-view-model.ts

源码：[contacts-analysis-view-model.ts](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/analysis/contacts-analysis-view-model.ts>)

静态来源入口：`/app/contacts/dashboard`

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 98 | 文案/数据常量 zh | "查看联系人" |
| 98 | 文案/数据常量 en | "View contact" |
| 98 | 文案/数据常量 ja | "連絡先を見る" |

## repos/orbits/app/(app)/app/contacts/analysis/contacts-analysis-workspace.tsx

源码：[contacts-analysis-workspace.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/analysis/contacts-analysis-workspace.tsx>)

静态来源入口：`/app/contacts/analysis/[dimension]/[bucketId]`、`/app/contacts/dashboard`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 17 | ContactsAnalysisShell | main |  | orbit-page |
| 22 | ContactsAnalysisShell | nav | t({ zh: "人脉分区", en: "Contact sections", ja: "人脈メニュー" }) | analysis-mobile-nav noscroll |
| 118 | ContactsAnalysisContent | section | "data" in view.coverage ? &lt;&gt;&lt;div style={{ fontSize: 36, color: "var(--accent)" }}&gt;{view.coverage.data.score}&lt;span style={{ fontSize: 16 }}&gt; / 100&lt;/span&gt;&lt;/div&gt;&lt;p className="analysis-muted"&gt;{view.coverage.data.summary}&lt;/p&gt;{view.coverage.data.gaps.map((gap) =&gt; &lt;div key={gap.id} className="analysis-notice"&gt;&lt;strong&gt;{gap.lab …（完整表达式见源码） | card analysis-card |
| 118 | ContactsAnalysisContent | h2 | t({ zh: "目标覆盖", en: "Goal coverage", ja: "目標のカバー率" }) |  |
| 122 | ContactsAnalysisContent | header |  | analysis-head |
| 122 | ContactsAnalysisContent | h1 | t({ zh: "人脉分析", en: "Network analysis", ja: "人脈分析" }) | h-display |
| 124 | ContactsAnalysisContent | section | unavailable("analysis", view.state) | card analysis-card |
| 125 | ContactsAnalysisContent | section |  | card analysis-card |
| 131 | ContactsAnalysisContent | section |  | card analysis-card |
| 134 | ContactsAnalysisContent | h2 | t({ zh: "iOrbit 人脉报告", en: "iOrbit network report", ja: "iOrbit 人脈レポート" }) |  |
| 152 | ContactsAnalysisContent | div/tablist | t({ zh: "人脉分析视图", en: "Analysis views", ja: "分析ビュー" }) | analysis-tabs |
| 152 | ContactsAnalysisContent | button/tab | label | `btn ${tab === id ? "btn-primary" : "btn-ghost"}` |
| 154 | ContactsAnalysisContent | div/tabpanel | tab === "overview" ? &lt;&gt; &lt;p className="analysis-muted"&gt;{view.summary}&lt;/p&gt; &lt;div className="analysis-metrics" data-analysis-metrics&gt;{[ [t({ zh: "总人脉", en: "Contacts", ja: "人脈数" }), view.metrics.contacts], [t({ zh: "高价值关系", en: "High-value ties", ja: "価値の高い関係" }), view.metrics.highValue], [t({ zh: "待联系", en: "To contact", …（完整表达式见源码） |  |
| 160 | ContactsAnalysisContent | section |  | card analysis-card |
| 161 | ContactsAnalysisContent | section | view.activity.length ? view.activity.map((item) =&gt; &lt;div key={item.id} className="analysis-notice"&gt;&lt;p&gt;{item.label}&lt;/p&gt;&lt;div className="analysis-muted"&gt;{item.source} · &lt;time dateTime={item.occurredAt}&gt;{item.occurredAt.slice(0, 10)}&lt;/time&gt;&lt;/div&gt;&lt;/div&gt;) : &lt;p className="analysis-muted"&gt;{t({ zh: "暂无最近动态", en: "No recent activ …（完整表达式见源码） | card analysis-card |
| 161 | ContactsAnalysisContent | h2 | t({ zh: "最近动态", en: "Recent activity", ja: "最近の動き" }) |  |
| 163 | ContactsAnalysisContent | section | (() =&gt; { const buckets = view.structure.data.dimensions[dimension]; const active = buckets.find((bucket) =&gt; bucket.id === selected) ?? buckets[0]; let offset = 0; return buckets.length ? &lt;&gt;&lt;div className="analysis-chart"&gt;&lt;svg viewBox="0 0 240 240" role="img" aria-label={t({ zh: "当前维度的占比分布", en: "Distribution in the sel …（完整表达式见源码） | card analysis-card |
| 163 | ContactsAnalysisContent | h2 | t({ zh: "人脉结构", en: "Network structure", ja: "人脈の構成" }) |  |
| 169 | ContactsAnalysisContent | section | view.structure.data.health.map((item) =&gt; &lt;div className="analysis-notice" key={item.id}&gt;&lt;strong&gt;{item.id === "strong" ? t({ zh: "强关系", en: "Strong", ja: "強い関係" }) : item.id === "warm" ? t({ zh: "中关系", en: "Warm", ja: "中程度の関係" }) : t({ zh: "弱关系", en: "Weak", ja: "弱い関係" })}&lt;/strong&gt;&lt;p&gt;{item.count} · {item.percentage}%&lt;/p …（完整表达式见源码） | card analysis-card |
| 169 | ContactsAnalysisContent | h2 | t({ zh: "关系健康", en: "Relationship health", ja: "関係の健全性" }) |  |
| 170 | ContactsAnalysisContent | h2 | t({ zh: "下一步行动", en: "Next actions", ja: "次の行動" }) | h-section |
| 170 | ContactsAnalysisContent | h3 | action.title |  |
| 170 | ContactsAnalysisContent | h4 | t({ zh: "依据", en: "Evidence", ja: "根拠" }) |  |
| 170 | ContactsAnalysisContent | h4 | t({ zh: "建议步骤", en: "Suggested steps", ja: "推奨する手順" }) |  |
| 170 | ContactsAnalysisContent | h3 |  |  |

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 55 | [view, setView] = useState(initialView) |
| 56 | [tab, setTab] = useState&lt;AnalysisTab&gt;(initialTab) |
| 57 | [dimension, setDimension] = useState&lt;AnalysisDimension&gt;("industry") |
| 58 | [selected, setSelected] = useState&lt;string \| null&gt;(null) |
| 59 | [busy, setBusy] = useState(false) |
| 60 | [error, setError] = useState("") |
| 61 | [editingGoal, setEditingGoal] = useState(false) |
| 62 | [goalSaved, setGoalSaved] = useState(false) |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 23 | link/a · ContactsAnalysisShell | 全部 / All / すべて | preserveHref("/app/contacts") | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 24 | link/a · ContactsAnalysisShell | 关系进展 / Relationship progress / 関係の進展 | preserveHref("/app/contacts/pipeline") | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 25 | link/a · ContactsAnalysisShell | 人脉分析 / Network analysis / 人脈分析 | preserveHref("/app/contacts/dashboard") | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 26 | link/a · ContactsAnalysisShell | 引荐 / Introductions / 紹介 | preserveHref("/app/contacts/intros") | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 27 | link/a · ContactsAnalysisShell | 操作记录 / All actions / 操作履歴 | preserveHref("/app/contacts/all-actions") | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 119 | link/a · ContactsAnalysisContent | 查看人脉 / View contacts / 人脈を見る | preserveHref("/app/contacts") | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 122 | button/button · ContactsAnalysisContent | 刷新 / Refresh / 再読み込み | onclick: () =&gt; refresh() | {"disabled":"busy","renderGateProps":[],"conditions":[]} |
| 125 | button/button · ContactsAnalysisContent | 编辑目标 / Edit goal / 目標を編集 | onclick: () =&gt; setEditingGoal(true) | {"disabled":"busy","renderGateProps":[],"conditions":[]} |
| 125 | link/a · ContactsAnalysisContent | 完善个人资料 / Complete profile / プロフィールを入力 | preserveHref("/app/profile") | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 127 | callback-control/AnalysisGoalEditor · ContactsAnalysisContent |  | onclose: () =&gt; setEditingGoal(false); onsaved: (text, updatedAt) =&gt; { setView((current) =&gt; current.state === "ready" && "data" in current.goal ? { ...current, goal: { ...current.goal, data: { ...current.goal.data, text, updatedAt } } } : current); setEditingGoal(false); setGoalSaved(true); } | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 147 | button/button · ContactsAnalysisContent | 交给 iOrbit 重新分析 / Analyze again with iOrbit / iOrbit で再分析 / 交给 iOrbit 分析 / Analyze with iOrbit / iOrbit で分析 | onclick: requestAnalysis | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 152 | button/button · ContactsAnalysisContent | {label} | onclick: () =&gt; setTab(id); onkeydown: (event) =&gt; { if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return; event.preventDefault(); const next = event.key === "Home" ? 0 : event.key === "End" ? 2 : (index + (event.key === "ArrowRight" ? 1 : 2)) % 3; setTab(tabs[next][0]); document.getElementById(`analysis-tab-${tabs[next][0]}`)?.focus(); } | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 153 | link/a · ContactsAnalysisContent | 添加联系人 / Add contact / 連絡先を追加 | preserveHref("/app/contacts/new") | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 163 | button/button · ContactsAnalysisContent | {label} | onclick: () =&gt; { setDimension(id); setSelected(null); } | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 168 | callback-control/circle · ContactsAnalysisContent | {`${bucket.label}: ${bucket.count} (${bucket.percentage}%)`} | onclick: () =&gt; setSelected(bucket.id) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 168 | button/button · ContactsAnalysisContent | {bucket.label} {bucket.count} · {bucket.percentage} % | onclick: () =&gt; setSelected(bucket.id) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 168 | link/a · ContactsAnalysisContent | 查看分组详情 / View group details / グループ詳細を見る | preserveHref(active.href) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 170 | button/button · ContactsAnalysisContent | 重算机会 / Recompute opportunities / 機会を再計算 | onclick: () =&gt; refresh(true) | {"disabled":"busy","renderGateProps":[],"conditions":[]} |
| 170 | link/a · ContactsAnalysisContent | {action.primary.label} | preserveHref(action.primary.href) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 170 | link/a · ContactsAnalysisContent | {action.secondary.label} | preserveHref(action.secondary.href) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 170 | link/a · ContactsAnalysisContent | {item.name} | preserveHref(item.href) | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 92 | refresh | 调用 | POST | "/api/dashboard/opportunities/recompute" |
| 92 | refresh | 路径常量 | 见调用/handler | "/api/dashboard/opportunities/recompute" |
| 97 | refresh | 调用 | GET/由封装决定 | "/api/mobile/contacts-dashboard" |
| 97 | refresh | 路径常量 | 见调用/handler | "/api/mobile/contacts-dashboard" |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 22 | 属性 aria-label | t({ zh: "人脉分区", en: "Contact sections", ja: "人脈メニュー" }) |
| 22 | 翻译 zh | "人脉分区" |
| 22 | 翻译 en | "Contact sections" |
| 22 | 翻译 ja | "人脈メニュー" |
| 23 | 翻译 zh | "全部" |
| 23 | 翻译 en | "All" |
| 23 | 翻译 ja | "すべて" |
| 24 | 翻译 zh | "关系进展" |
| 24 | 翻译 en | "Relationship progress" |
| 24 | 翻译 ja | "関係の進展" |
| 25 | 翻译 zh | "人脉分析" |
| 25 | 翻译 en | "Network analysis" |
| 25 | 翻译 ja | "人脈分析" |
| 26 | 翻译 zh | "引荐" |
| 26 | 翻译 en | "Introductions" |
| 26 | 翻译 ja | "紹介" |
| 27 | 翻译 zh | "操作记录" |
| 27 | 翻译 en | "All actions" |
| 27 | 翻译 ja | "操作履歴" |
| 78 | 翻译 zh | "请根据我的关系目标和当前人脉数据生成分析报告，指出结构缺口和最值得推进的下一步。" |
| 79 | 翻译 en | "Analyze my current network against my relationship goal, including structural gaps and the next steps worth prioritizing." |
| 80 | 翻译 ja | "現在の人脈を関係づくりの目標に照らして分析し、構成上の不足と優先すべき次の行動をまとめてください。" |
| 104 | 翻译 zh | "机会已重算，但新数据暂未加载。请刷新查看。" |
| 104 | 翻译 en | "Opportunities were recomputed, but the updated data could not load. Please refresh." |
| 104 | 翻译 ja | "再計算は完了しましたが、更新データを読み込めませんでした。再読み込みしてください。" |
| 105 | 翻译 zh | "操作未完成，已保留当前数据。请重试。" |
| 105 | 翻译 en | "The operation failed. Your current data is still shown. Please retry." |
| 105 | 翻译 ja | "操作に失敗しました。現在のデータを保持しています。再試行してください。" |
| 108 | 翻译 zh | "正在生成分析，请稍后刷新。" |
| 108 | 翻译 en | "Analysis is being prepared. Refresh shortly." |
| 108 | 翻译 ja | "分析を準備中です。しばらくして再読み込みしてください。" |
| 108 | 翻译 zh | "这部分数据暂不可用，请刷新重试。" |
| 108 | 翻译 en | "This section is unavailable. Refresh to retry." |
| 108 | 翻译 ja | "このデータは利用できません。再読み込みしてください。" |
| 110 | 翻译 zh | "概览" |
| 110 | 翻译 en | "Overview" |
| 110 | 翻译 ja | "概要" |
| 111 | 翻译 zh | "结构" |
| 111 | 翻译 en | "Structure" |
| 111 | 翻译 ja | "構成" |
| 112 | 翻译 zh | "机会" |
| 112 | 翻译 en | "Opportunities" |
| 112 | 翻译 ja | "機会" |
| 115 | 翻译 zh | "行业" |
| 115 | 翻译 en | "Industry" |
| 115 | 翻译 ja | "業種" |
| 115 | 翻译 zh | "地区" |
| 115 | 翻译 en | "Location" |
| 115 | 翻译 ja | "地域" |
| 116 | 翻译 zh | "角色" |
| 116 | 翻译 en | "Role" |
| 116 | 翻译 ja | "役割" |
| 116 | 翻译 zh | "关系" |
| 116 | 翻译 en | "Relationship" |
| 116 | 翻译 ja | "関係" |
| 118 | 翻译 zh | "目标覆盖" |
| 118 | 翻译 en | "Goal coverage" |
| 118 | 翻译 ja | "目標のカバー率" |
| 119 | JSX文字 | / 100 |
| 119 | 翻译 zh | "查看人脉" |
| 119 | 翻译 en | "View contacts" |
| 119 | 翻译 ja | "人脈を見る" |
| 122 | 翻译 zh | "人脉分析" |
| 122 | 翻译 en | "Network analysis" |
| 122 | 翻译 ja | "人脈分析" |
| 122 | 翻译 zh | "围绕你的关系目标，查看结构与下一步行动。" |
| 122 | 翻译 en | "Explore your network and next steps around your relationship goal." |
| 122 | 翻译 ja | "関係づくりの目標に合わせて、人脈の構成と次の行動を確認。" |
| 122 | 翻译 zh | "刷新" |
| 122 | 翻译 en | "Refresh" |
| 122 | 翻译 ja | "再読み込み" |
| 125 | 翻译 zh | "当前关系目标" |
| 125 | 翻译 en | "Relationship goal" |
| 125 | 翻译 ja | "現在の目標" |
| 125 | 翻译 zh | "尚未设置关系目标" |
| 125 | 翻译 en | "No relationship goal yet" |
| 125 | 翻译 ja | "目標はまだ設定されていません" |
| 125 | 翻译 zh | "编辑目标" |
| 125 | 翻译 en | "Edit goal" |
| 125 | 翻译 ja | "目標を編集" |
| 125 | 翻译 zh | "完善个人资料" |
| 125 | 翻译 en | "Complete profile" |
| 125 | 翻译 ja | "プロフィールを入力" |
| 126 | 翻译 zh | "目标已保存。已有报告仍保留上次结果；需要时可交给 iOrbit 重新分析。" |
| 126 | 翻译 en | "Goal saved. The existing report still reflects the previous run; ask iOrbit to analyze again when needed." |
| 126 | 翻译 ja | "目標を保存しました。既存のレポートは前回の結果のままです。必要に応じて iOrbit に再分析を依頼してください。" |
| 134 | 翻译 zh | "iOrbit 人脉报告" |
| 134 | 翻译 en | "iOrbit network report" |
| 134 | 翻译 ja | "iOrbit 人脈レポート" |
| 139 | 翻译 zh | "生成于" |
| 139 | 翻译 en | "Generated" |
| 139 | 翻译 ja | "生成日時" |
| 139 | JSX文字 | UTC |
| 140 | 翻译 zh | "分析版本" |
| 140 | 翻译 en | "Analysis version" |
| 140 | 翻译 ja | "分析バージョン" |
| 142 | 翻译 zh | "人脉数据已变化，这份报告需要重新分析。" |
| 142 | 翻译 en | "Your network data has changed. This report needs a new analysis." |
| 142 | 翻译 ja | "人脈データが更新されています。このレポートは再分析が必要です。" |
| 143 | 翻译 zh | "尚未生成过人脉报告。" |
| 143 | 翻译 en | "No network report has been generated yet." |
| 143 | 翻译 ja | "人脈レポートはまだ生成されていません。" |
| 144 | 翻译 zh | "当前版本" |
| 144 | 翻译 en | "Current version" |
| 144 | 翻译 ja | "現在のバージョン" |
| 148 | 翻译 zh | "交给 iOrbit 重新分析" |
| 148 | 翻译 en | "Analyze again with iOrbit" |
| 148 | 翻译 ja | "iOrbit で再分析" |
| 148 | 翻译 zh | "交给 iOrbit 分析" |
| 148 | 翻译 en | "Analyze with iOrbit" |
| 148 | 翻译 ja | "iOrbit で分析" |
| 152 | 属性 aria-label | t({ zh: "人脉分析视图", en: "Analysis views", ja: "分析ビュー" }) |
| 152 | 翻译 zh | "人脉分析视图" |
| 152 | 翻译 en | "Analysis views" |
| 152 | 翻译 ja | "分析ビュー" |
| 153 | 翻译 zh | "还没有联系人，添加后可查看人脉结构。" |
| 153 | 翻译 en | "Add your first contact to start exploring your network." |
| 153 | 翻译 ja | "連絡先を追加すると、人脈の構成を確認できます。" |
| 153 | 翻译 zh | "添加联系人" |
| 153 | 翻译 en | "Add contact" |
| 153 | 翻译 ja | "連絡先を追加" |
| 158 | 翻译 zh | "总人脉" |
| 158 | 翻译 en | "Contacts" |
| 158 | 翻译 ja | "人脈数" |
| 158 | 翻译 zh | "高价值关系" |
| 158 | 翻译 en | "High-value ties" |
| 158 | 翻译 ja | "価値の高い関係" |
| 159 | 翻译 zh | "待联系" |
| 159 | 翻译 en | "To contact" |
| 159 | 翻译 ja | "連絡予定" |
| 159 | 翻译 zh | "沉睡关系" |
| 159 | 翻译 en | "Dormant ties" |
| 159 | 翻译 ja | "休眠中の関係" |
| 161 | 翻译 zh | "最近动态" |
| 161 | 翻译 en | "Recent activity" |
| 161 | 翻译 ja | "最近の動き" |
| 161 | 翻译 zh | "暂无最近动态" |
| 161 | 翻译 en | "No recent activity" |
| 161 | 翻译 ja | "最近の動きはありません" |
| 163 | 翻译 zh | "人脉结构" |
| 163 | 翻译 en | "Network structure" |
| 163 | 翻译 ja | "人脈の構成" |
| 168 | 属性 aria-label | t({ zh: "当前维度的占比分布", en: "Distribution in the selected dimension", ja: "選択した区分の構成比" }) |
| 168 | 翻译 zh | "当前维度的占比分布" |
| 168 | 翻译 en | "Distribution in the selected dimension" |
| 168 | 翻译 ja | "選択した区分の構成比" |
| 168 | 翻译 zh | "这组联系人尚未填写该信息。" |
| 168 | 翻译 en | "These contacts have not provided this information." |
| 168 | 翻译 ja | "このグループでは、この情報が未入力です。" |
| 168 | 翻译 zh | "查看分组详情" |
| 168 | 翻译 en | "View group details" |
| 168 | 翻译 ja | "グループ詳細を見る" |
| 168 | 翻译 zh | "当前维度暂无数据" |
| 168 | 翻译 en | "No data in this dimension" |
| 168 | 翻译 ja | "この区分のデータはありません" |
| 169 | 翻译 zh | "关系健康" |
| 169 | 翻译 en | "Relationship health" |
| 169 | 翻译 ja | "関係の健全性" |
| 169 | 翻译 zh | "强关系" |
| 169 | 翻译 en | "Strong" |
| 169 | 翻译 ja | "強い関係" |
| 169 | 翻译 zh | "中关系" |
| 169 | 翻译 en | "Warm" |
| 169 | 翻译 ja | "中程度の関係" |
| 169 | 翻译 zh | "弱关系" |
| 169 | 翻译 en | "Weak" |
| 169 | 翻译 ja | "弱い関係" |
| 169 | 翻译 zh | "跟进风险" |
| 169 | 翻译 en | "Follow-up risk" |
| 169 | 翻译 ja | "フォローアップのリスク" |
| 169 | 翻译 zh | "高" |
| 169 | 翻译 en | "High" |
| 169 | 翻译 zh | "中" |
| 169 | 翻译 en | "Moderate" |
| 169 | 翻译 zh | "低" |
| 169 | 翻译 en | "Low" |
| 170 | 翻译 zh | "下一步行动" |
| 170 | 翻译 en | "Next actions" |
| 170 | 翻译 ja | "次の行動" |
| 170 | 翻译 zh | "重算机会" |
| 170 | 翻译 en | "Recompute opportunities" |
| 170 | 翻译 ja | "機会を再計算" |
| 170 | 翻译 zh | "依据" |
| 170 | 翻译 en | "Evidence" |
| 170 | 翻译 ja | "根拠" |
| 170 | 翻译 zh | "尚无可读依据，请打开联系人核对来源后再行动。" |
| 170 | 翻译 en | "Readable evidence is unavailable. Check the contact’s sources before acting." |
| 170 | 翻译 ja | "参照できる根拠がありません。行動する前に連絡先の情報源を確認してください。" |
| 170 | 翻译 zh | "建议步骤" |
| 170 | 翻译 en | "Suggested steps" |
| 170 | 翻译 ja | "推奨する手順" |
| 170 | 翻译 zh | "当前没有优先行动建议" |
| 170 | 翻译 en | "No priority actions right now" |
| 170 | 翻译 ja | "現在、優先する行動はありません" |

## repos/orbits/app/(app)/app/contacts/analysis/contacts-structure-detail.tsx

源码：[contacts-structure-detail.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/analysis/contacts-structure-detail.tsx>)

静态来源入口：`/app/contacts/analysis/[dimension]/[bucketId]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 11 | ContactsStructureDetail | section/alert |  | card analysis-card |
| 11 | ContactsStructureDetail | h1 | t({ zh: "暂时无法加载分组", en: "Could not load this group", ja: "グループを読み込めませんでした" }) | h-section |
| 12 | ContactsStructureDetail | header | view.missingData ? &lt;p className="analysis-muted"&gt;{t({ zh: "这些联系人尚未填写该信息，可在联系人详情中补充。", en: "These contacts are missing this information. You can add it in their profiles.", ja: "この情報が未入力の連絡先です。連絡先の詳細画面で補完できます。" })}&lt;/p&gt; : null |  |
| 12 | ContactsStructureDetail | h1 | view.label | h-display |
| 13 | ContactsStructureDetail | section | view.quality.map((item) =&gt; &lt;div key={item.id} style={{ marginBottom: 14 }}&gt;&lt;div style={{ display: "flex", justifyContent: "space-between" }}&gt;&lt;span&gt;{strengthLabel(item.id)}&lt;/span&gt;&lt;span&gt;{item.count} · {item.percentage}%&lt;/span&gt;&lt;/div&gt;&lt;meter aria-label={strengthLabel(item.id)} value={item.percentage} min={0} max={100} style …（完整表达式见源码） | card analysis-card |
| 13 | ContactsStructureDetail | h2 | t({ zh: "关系质量", en: "Relationship quality", ja: "関係の質" }) |  |
| 13 | ContactsStructureDetail | section | view.commonTags.length === 0 ? &lt;p className="analysis-muted"&gt;{t({ zh: "暂无共同标签", en: "No common tags", ja: "共通タグはありません" })}&lt;/p&gt; : null | card analysis-card |
| 13 | ContactsStructureDetail | h2 | t({ zh: "共同标签", en: "Common tags", ja: "共通タグ" }) |  |
| 14 | ContactsStructureDetail | section | view.contacts.map((contact) =&gt; &lt;a key={contact.id} href={preserveHref(contact.href)} className="analysis-notice" style={{ display: "flex", justifyContent: "space-between", gap: 14, color: "inherit", textDecoration: "none" }}&gt;&lt;div style={{ minWidth: 0 }}&gt;&lt;strong&gt;{contact.name}&lt;/strong&gt;&lt;p className="analysis-muted" style …（完整表达式见源码） | card analysis-card |
| 14 | ContactsStructureDetail | h2 | t({ zh: "这组联系人", en: "Contacts in this group", ja: "このグループの連絡先" }) · view.count |  |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 10 | link/a · ContactsStructureDetail | 返回人脉结构 / Back to network structure / 人脈の構成に戻る | preserveHref("/app/contacts/dashboard?tab=structure") | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 11 | button/button · ContactsStructureDetail | 重试 / Retry / 再試行 | onclick: () =&gt; window.location.reload() | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 14 | link/a · ContactsStructureDetail | {contact.name} {[contact.role, contact.organization, contact.location].filter(Boolean).join(" · ")} {contact.tags.map((tag) =&gt; &lt;span className="chip" key={tag}&gt;{tag}&lt;/span&gt;)} {strengthLabel(contact.strength)} | preserveHref(contact.href) | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 8 | 翻译 zh | "强关系" |
| 8 | 翻译 en | "Strong" |
| 8 | 翻译 ja | "強い関係" |
| 8 | 翻译 zh | "中关系" |
| 8 | 翻译 en | "Warm" |
| 8 | 翻译 ja | "中程度の関係" |
| 8 | 翻译 zh | "弱关系" |
| 8 | 翻译 en | "Weak" |
| 8 | 翻译 ja | "弱い関係" |
| 10 | 翻译 zh | "返回人脉结构" |
| 10 | 翻译 en | "Back to network structure" |
| 10 | 翻译 ja | "人脈の構成に戻る" |
| 11 | 翻译 zh | "暂时无法加载分组" |
| 11 | 翻译 en | "Could not load this group" |
| 11 | 翻译 ja | "グループを読み込めませんでした" |
| 11 | 翻译 zh | "请刷新重试，或返回人脉结构重新选择分组。" |
| 11 | 翻译 en | "Refresh to retry, or go back and select a group again." |
| 11 | 翻译 ja | "再読み込みするか、戻ってグループを選び直してください。" |
| 11 | 翻译 zh | "重试" |
| 11 | 翻译 en | "Retry" |
| 11 | 翻译 ja | "再試行" |
| 12 | 翻译 zh | "分组详情" |
| 12 | 翻译 en | "Group details" |
| 12 | 翻译 ja | "グループ詳細" |
| 12 | 翻译 zh | "这些联系人尚未填写该信息，可在联系人详情中补充。" |
| 12 | 翻译 en | "These contacts are missing this information. You can add it in their profiles." |
| 12 | 翻译 ja | "この情報が未入力の連絡先です。連絡先の詳細画面で補完できます。" |
| 13 | 翻译 zh | "关系质量" |
| 13 | 翻译 en | "Relationship quality" |
| 13 | 翻译 ja | "関係の質" |
| 13 | 属性 aria-label | strengthLabel(item.id) |
| 13 | 翻译 zh | "共同标签" |
| 13 | 翻译 en | "Common tags" |
| 13 | 翻译 ja | "共通タグ" |
| 13 | 翻译 zh | "暂无共同标签" |
| 13 | 翻译 en | "No common tags" |
| 13 | 翻译 ja | "共通タグはありません" |
| 14 | 翻译 zh | "这组联系人" |
| 14 | 翻译 en | "Contacts in this group" |
| 14 | 翻译 ja | "このグループの連絡先" |
| 14 | 翻译 zh | "这组暂无联系人" |
| 14 | 翻译 en | "No contacts in this group" |
| 14 | 翻译 ja | "このグループに連絡先はありません" |

## repos/orbits/app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-route-service.ts

源码：[contact-detail-route-service.ts](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-route-service.ts>)

静态来源入口：`/app/contacts/[id]`

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 178 | 文案/数据常量 en | "Return to contacts list" |
| 179 | 文案/数据常量 ja | "人脈リストに戻る" |
| 180 | 文案/数据常量 zh | "返回人脉列表" |
| 183 | 文案/数据常量 en | "Leave this relationship and keep working from the sourced list." |
| 184 | 文案/数据常量 ja | "この関係を離れ、出典付きのリストから作業を続けます。" |
| 185 | 文案/数据常量 zh | "离开这位联系人，回到有来源的列表继续。" |
| 195 | 文案/数据常量 en | "Choose a contact with source evidence before reviewing tags, status, connection context, or relationship value." |
| 196 | 文案/数据常量 ja | "タグ、ステータス、関係の背景、関係価値を確認する前に、出典の根拠がある連絡先を選んでください。" |
| 197 | 文案/数据常量 zh | "请先选择一位已有来源证据的联系人，再查看标签、状态、关系背景或关系价值。" |
| 201 | 文案/数据常量 en | "Return to the sourced contacts list and select a relationship with evidence." |
| 202 | 文案/数据常量 ja | "出典付きの人脈リストに戻り、根拠のある関係を選んでください。" |
| 203 | 文案/数据常量 zh | "返回有来源的人脉列表，选择一位已有证据的联系人。" |
| 210 | 文案/数据常量 en | "Go back to the sourced list and pick a relationship that already has evidence." |
| 211 | 文案/数据常量 ja | "出典付きのリストに戻り、すでに根拠がある関係を選んでください。" |
| 212 | 文案/数据常量 zh | "回到有来源的列表，选择一位已有证据的联系人。" |
| 217 | 文案/数据常量 en | "No contact detail is available" |
| 218 | 文案/数据常量 ja | "表示できる連絡先の詳細がありません" |
| 219 | 文案/数据常量 zh | "暂无可用的联系人详情" |
| 224 | 文案/数据常量 en | "The local relationship detail boundary returned a controlled failure." |
| 225 | 文案/数据常量 ja | "ローカルの関係詳細境界が制御されたエラーを返しました。" |
| 226 | 文案/数据常量 zh | "本地关系详情边界返回了受控失败。" |
| 230 | 文案/数据常量 en | "Retry the detail view after confirming the local capability boundary is available." |
| 231 | 文案/数据常量 ja | "ローカルの能力境界が利用可能であることを確認してから、詳細を再試行してください。" |
| 232 | 文案/数据常量 zh | "确认本地能力边界可用后，重试详情页。" |
| 238 | 文案/数据常量 en | "Retry contact detail" |
| 239 | 文案/数据常量 ja | "連絡先の詳細を再試行" |
| 240 | 文案/数据常量 zh | "重试联系人详情" |
| 243 | 文案/数据常量 en | "Load the detail again once the local capability boundary is available." |
| 244 | 文案/数据常量 ja | "ローカルの能力境界が利用可能になったら、詳細を再度読み込みます。" |
| 245 | 文案/数据常量 zh | "本地能力边界可用后，重新加载详情。" |
| 251 | 文案/数据常量 en | "Contact detail could not load" |
| 252 | 文案/数据常量 ja | "連絡先の詳細を読み込めませんでした" |
| 253 | 文案/数据常量 zh | "联系人详情加载失败" |
| 258 | 文案/数据常量 en | "Orbit is waiting for local source evidence before exposing this relationship profile." |
| 259 | 文案/数据常量 ja | "Orbit はローカルの出典根拠を待ってから、この関係プロフィールを表示します。" |
| 260 | 文案/数据常量 zh | "Orbit 正在等待本地来源证据，之后才会展示这份关系档案。" |
| 264 | 文案/数据常量 en | "Check the current detail once source evidence has settled." |
| 265 | 文案/数据常量 ja | "出典の根拠が確定したら、現在の詳細を確認してください。" |
| 266 | 文案/数据常量 zh | "来源证据稳定后，再查看当前详情。" |
| 272 | 文案/数据常量 en | "Check current detail" |
| 273 | 文案/数据常量 ja | "現在の詳細を確認" |
| 274 | 文案/数据常量 zh | "查看当前详情" |
| 277 | 文案/数据常量 en | "Re-read the detail after the pending source evidence settles." |
| 278 | 文案/数据常量 ja | "保留中の出典根拠が確定したら、詳細を再読み込みします。" |
| 279 | 文案/数据常量 zh | "待处理的来源证据稳定后，重新读取详情。" |
| 285 | 文案/数据常量 en | "Contact detail is loading" |
| 286 | 文案/数据常量 ja | "連絡先の詳細を読み込み中" |
| 287 | 文案/数据常量 zh | "联系人详情加载中" |

## repos/orbits/app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-view-model-adapter.ts

源码：[contact-detail-view-model-adapter.ts](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-view-model-adapter.ts>)

静态来源入口：`/app/contacts/[id]`

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 67 | 文案/数据常量 commercial_opportunity | "commercial opportunity" |
| 68 | 文案/数据常量 community_context | "community context" |
| 69 | 文案/数据常量 cross_border_ecommerce | "cross-border ecommerce" |
| 70 | 文案/数据常量 knowledge_exchange | "knowledge exchange" |
| 71 | 文案/数据常量 referral_path | "referral path" |
| 72 | 文案/数据常量 retail_omnichannel | "retail omnichannel" |
| 73 | 文案/数据常量 strategic_fit | "strategic fit" |
| 74 | 文案/数据常量 venture_capital | "investment interest" |
| 77 | 文案/数据常量 commercial_opportunity | "商业机会" |
| 78 | 文案/数据常量 community_context | "社群上下文" |
| 79 | 文案/数据常量 cross_border_ecommerce | "跨境电商" |
| 80 | 文案/数据常量 knowledge_exchange | "知识交换" |
| 81 | 文案/数据常量 referral_path | "引荐路径" |
| 82 | 文案/数据常量 retail_omnichannel | "零售全渠道" |
| 83 | 文案/数据常量 strategic_fit | "战略契合" |
| 84 | 文案/数据常量 venture_capital | "投资意向" |
| 188 | 文案/数据常量 warm-follow-up | "warm follow-up" |
| 189 | 文案/数据常量 nurture | "nurture" |
| 190 | 文案/数据常量 climate-founders-dinner | "climate founders dinner" |
| 191 | 文案/数据常量 storage-pilots | "storage pilots" |
| 192 | 文案/数据常量 community | "community" |
| 193 | 文案/数据常量 venture-ecosystem | "venture ecosystem" |
| 194 | 文案/数据常量 business-card | "business card" |
| 195 | 文案/数据常量 external-import | "external import" |
| 196 | 文案/数据常量 event-import | "event import" |
| 199 | 文案/数据常量 warm-follow-up | "热跟进" |
| 200 | 文案/数据常量 nurture | "待培育" |
| 201 | 文案/数据常量 climate-founders-dinner | "气候创始人晚宴" |
| 202 | 文案/数据常量 storage-pilots | "储能试点" |
