| 346 | field/input · OrbitAgentExecutionSettings | 安静时段结束 | oninput: (event) =&gt; { const end = event.currentTarget.value; setPreferences((current) =&gt; ({ ...current, quietHours: { ...current.quietHours, end, }, })); } | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 376 | field/input · OrbitAgentExecutionSettings | 通知时区 | onchange: (event) =&gt; { const timeZone = event.currentTarget.value; setPreferences((current) =&gt; ({ ...current, timeZone, })); } | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 397 | button/button · OrbitAgentExecutionSettings | 保存中… / 保存设置 | onclick: () =&gt; void save() | {"disabled":"loading \|\| saving","renderGateProps":[],"conditions":[]} |
| 465 | button/button · OrbitAgentExecutionSettings | 刷新中… / 刷新运行状态 | onclick: () =&gt; void refreshOperationsHealth() | {"disabled":"refreshingHealth","renderGateProps":[],"conditions":[]} |
| 539 | button/button · OrbitAgentExecutionSettings | 检查中… / 检查连接 | onclick: () =&gt; void checkIntegration(integration.provider) | {"disabled":"checkingProvider === integration.provider","renderGateProps":[],"conditions":[]} |
| 549 | button/button · OrbitAgentExecutionSettings | 断开 | onclick: () =&gt; void disconnect(integration.provider) | {"disabled":"checkingProvider === integration.provider","renderGateProps":[],"conditions":[]} |
| 559 | link/a · OrbitAgentExecutionSettings | 连接 | `/api/integrations/${integration.provider}/authorize` | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 119 | OrbitAgentExecutionSettings | 调用 | GET/由封装决定 | "/api/agent/preferences" |
| 119 | OrbitAgentExecutionSettings | 路径常量 | 见调用/handler | "/api/agent/preferences" |
| 120 | OrbitAgentExecutionSettings | 调用 | GET/由封装决定 | "/api/integrations" |
| 120 | OrbitAgentExecutionSettings | 路径常量 | 见调用/handler | "/api/integrations" |
| 121 | OrbitAgentExecutionSettings | 调用 | GET/由封装决定 | "/api/agent/operations/health" |
| 121 | OrbitAgentExecutionSettings | 路径常量 | 见调用/handler | "/api/agent/operations/health" |
| 159 | refreshOperationsHealth | 调用 | GET/由封装决定 | "/api/agent/operations/health" |
| 159 | refreshOperationsHealth | 路径常量 | 见调用/handler | "/api/agent/operations/health" |
| 180 | save | 调用 | PUT | "/api/agent/preferences" |
| 180 | save | 路径常量 | 见调用/handler | "/api/agent/preferences" |
| 197 | disconnect | 调用 | DELETE | `/api/integrations/${encodeURIComponent(provider)}` |
| 198 | disconnect | 路径常量 | 见调用/handler | `/api/integrations/${encodeURIComponent(provider)}` |
| 227 | checkIntegration | 调用 | POST | `/api/integrations/${encodeURIComponent(provider)}/health` |
| 228 | checkIntegration | 路径常量 | 见调用/handler | `/api/integrations/${encodeURIComponent(provider)}/health` |
| 561 | OrbitAgentExecutionSettings | 路径常量 | 见调用/handler | `/api/integrations/${integration.provider}/authorize` |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 261 | JSX文字 | Agent 执行与通知 |
| 272 | JSX文字 | 安全执行与外部连接 |
| 275 | JSX文字 | 读取与草稿自动完成；系统内写入逐次确认；对外消息永不自动发送。 |
| 278 | 属性 label | 自动准备会面笔记 |
| 288 | 属性 label | 允许逐次确认后写入外部日历 |
| 298 | 属性 label | 活动后推送跟进提醒 |
| 308 | 属性 label | 重要活动前推送未查看的会前简报 |
| 327 | JSX文字 | 安静时段 |
| 328 | 属性 aria-label | 安静时段开始 |
| 346 | 属性 aria-label | 安静时段结束 |
| 374 | JSX文字 | 通知时区 |
| 376 | 属性 placeholder | Asia/Tokyo |
| 376 | 属性 aria-label | 通知时区 |
| 412 | JSX文字 | 运行状态 |
| 415 | JSX文字 | 这里不展示密钥或 Token，只确认 AI、持久化存储与后台执行器是否真的可用。 |
| 425 | JSX文字 | AI 服务 |
| 435 | JSX文字 | 关系数据 |
| 445 | JSX文字 | 后台执行器 |
| 476 | JSX文字 | 外部数据连接 |
| 479 | JSX文字 | 登录与数据授权分离。健康检查只发起只读请求；外部日历写入逐次确认并记录回执，Orbit 永不自动发信。 |
| 555 | JSX文字 | 断开 |
| 563 | JSX文字 | 连接 |

## repos/orbits/app/(app)/app/settings/orbit-agent-feedback-settings.tsx

源码：[orbit-agent-feedback-settings.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/settings/orbit-agent-feedback-settings.tsx>)

静态来源入口：`/app/settings`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 128 | OrbitAgentFeedbackSettings | section |  | card |
| 151 | OrbitAgentFeedbackSettings | h2 | t({ en: "Result learning", zh: "结果学习" }) |  |

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 25 | [feedback, setFeedback] = useState&lt;AgentFeedback[]&gt;([]) |
| 26 | [loading, setLoading] = useState(true) |
| 27 | [pendingRunId, setPendingRunId] = useState&lt;string \| null&gt;(null) |
| 28 | [error, setError] = useState&lt;string \| null&gt;(null) |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 202 | button/button · OrbitAgentFeedbackSettings | Deleting… / 正在删除… / Delete learning record / 删除学习记录 | onclick: () =&gt; void remove(item.runId) | {"disabled":"pendingRunId === item.runId","renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 32 | OrbitAgentFeedbackSettings | 调用 | GET/由封装决定 | "/api/agent/feedback" |
| 32 | OrbitAgentFeedbackSettings | 路径常量 | 见调用/handler | "/api/agent/feedback" |
| 80 | remove | 调用 | DELETE | `/api/agent/feedback/${encodeURIComponent(runId)}` |
| 81 | remove | 路径常量 | 见调用/handler | `/api/agent/feedback/${encodeURIComponent(runId)}` |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 42 | 翻译 en | "Agent learning history could not be loaded." |
| 43 | 翻译 zh | "Agent 学习记录暂时无法读取。" |
| 62 | 翻译 en | "Agent learning history could not be loaded." |
| 63 | 翻译 zh | "Agent 学习记录暂时无法读取。" |
| 89 | 翻译 en | "The learning record was not deleted." |
| 90 | 翻译 zh | "这条学习记录没有删除成功。" |
| 103 | 翻译 en | "The learning record was not deleted." |
| 104 | 翻译 zh | "这条学习记录没有删除成功。" |
| 114 | 翻译 en | "Helpful" |
| 114 | 翻译 zh | "有帮助" |
| 116 | 翻译 en | "Not relevant" |
| 116 | 翻译 zh | "不相关" |
| 117 | 翻译 en | "No rating" |
| 117 | 翻译 zh | "未评价" |
| 120 | 翻译 en | "Contacted" |
| 120 | 翻译 zh | "已联系" |
| 122 | 翻译 en | "Meeting booked" |
| 122 | 翻译 zh | "已约见" |
| 124 | 翻译 en | "Goal advanced" |
| 124 | 翻译 zh | "目标有推进" |
| 125 | 翻译 en | "No outcome yet" |
| 125 | 翻译 zh | "暂无后续结果" |
| 152 | 翻译 en | "Result learning" |
| 152 | 翻译 zh | "结果学习" |
| 156 | 翻译 en | "Only feedback and outcomes you explicitly record may influence later recommendations. Delete any record to stop using it." |
| 157 | 翻译 zh | "只有你主动记录的评价和业务结果会影响后续推荐；删除后将不再使用。" |
| 167 | 翻译 en | "Loading…" |
| 167 | 翻译 zh | "正在加载…" |
| 172 | 翻译 en | "No result learning records yet." |
| 173 | 翻译 zh | "还没有结果学习记录。" |
| 209 | 翻译 en | "Deleting…" |
| 209 | 翻译 zh | "正在删除…" |
| 210 | 翻译 en | "Delete learning record" |
| 210 | 翻译 zh | "删除学习记录" |

## repos/orbits/app/(app)/app/settings/orbit-agent-memory-settings.tsx

源码：[orbit-agent-memory-settings.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/settings/orbit-agent-memory-settings.tsx>)

静态来源入口：`/app/settings`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 338 | OrbitAgentMemorySettings | section |  | card |
| 362 | OrbitAgentMemorySettings | h2 | t({ en: "Agent memory", zh: "Agent 记忆" }) |  |

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 74 | [memories, setMemories] = useState&lt;AgentMemory[]&gt;([]) |
| 76 | [settings, setSettings] = useState&lt;AgentMemorySettings&gt;(defaultSettings) |
| 78 | [category, setCategory] = useState&lt;AgentMemoryCategory&gt;("preference") |
| 79 | [content, setContent] = useState("") |
| 80 | [editingId, setEditingId] = useState&lt;string \| null&gt;(null) |
| 82 | [editCategory, setEditCategory] = useState&lt;AgentMemoryCategory&gt;("preference") |
| 83 | [editContent, setEditContent] = useState("") |
| 84 | [deleteConfirmId, setDeleteConfirmId] = useState&lt;string \| null&gt;( null, ) |
| 87 | [loading, setLoading] = useState(true) |
| 88 | [saving, setSaving] = useState(false) |
| 89 | [pendingId, setPendingId] = useState&lt;string \| null&gt;(null) |
| 90 | [error, setError] = useState&lt;string \| null&gt;(null) |
| 91 | [notice, setNotice] = useState&lt;string \| null&gt;(null) |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 383 | button/button · OrbitAgentMemorySettings | Use memory in Agent replies / 在 Agent 回复中使用记忆 On / 开启 / Off / 关闭 | onclick: () =&gt; void updateSettings({ enabled: !settings.enabled }) | {"disabled":"saving \|\| loading","renderGateProps":[],"conditions":[]} |
| 403 | button/button · OrbitAgentMemorySettings | Allow approved learning from conversations / 允许从对话中经确认后学习 On / 开启 / Off / 关闭 | onclick: () =&gt; void updateSettings({ allowConversationLearning: !settings.allowConversationLearning, }) | {"disabled":"saving \|\| loading","renderGateProps":[],"conditions":[]} |
| 453 | field/select · OrbitAgentMemorySettings | t({ en: "Memory category", zh: "记忆分类" }) | onchange: (event) =&gt; setCategory(event.target.value as AgentMemoryCategory) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 470 | field/textarea · OrbitAgentMemorySettings | t({ en: "Memory content", zh: "记忆内容", }) | onchange: (event) =&gt; setContent(event.target.value) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 488 | button/button · OrbitAgentMemorySettings | Saving… / 正在保存… / Save memory / 保存记忆 | onclick: () =&gt; void createMemory() | {"disabled":"saving \|\| !content.trim()","renderGateProps":[],"conditions":[]} |
| 555 | field/select · OrbitAgentMemorySettings | t({ en: "Edit memory category", zh: "编辑记忆分类", }) | onchange: (event) =&gt; setEditCategory( event.target.value as AgentMemoryCategory, ) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 574 | field/textarea · OrbitAgentMemorySettings | t({ en: "Edit memory content", zh: "编辑记忆内容", }) | onchange: (event) =&gt; setEditContent(event.target.value) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 594 | button/button · OrbitAgentMemorySettings | Save changes / 保存修改 | onclick: () =&gt; void saveEdit(memory) | {"disabled":"pending \|\| !editContent.trim()","renderGateProps":[],"conditions":[]} |
| 602 | button/button · OrbitAgentMemorySettings | Cancel / 取消 | onclick: () =&gt; setEditingId(null) | {"disabled":"pending","renderGateProps":[],"conditions":[]} |
| 653 | button/button · OrbitAgentMemorySettings | Edit / 编辑 | onclick: () =&gt; startEditing(memory) | {"disabled":"pending","renderGateProps":[],"conditions":[]} |
| 661 | button/button · OrbitAgentMemorySettings | Confirm delete / 确认删除 / Delete / 删除 | onclick: () =&gt; void remove(memory) | {"disabled":"pending","renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 97 | load | 调用 | GET/由封装决定 | "/api/agent/memory" |
| 97 | load | 路径常量 | 见调用/handler | "/api/agent/memory" |
| 144 | createMemory | 调用 | POST | "/api/agent/memory" |
| 144 | createMemory | 路径常量 | 见调用/handler | "/api/agent/memory" |
| 193 | updateSettings | 调用 | PATCH | "/api/agent/memory/settings" |
| 193 | updateSettings | 路径常量 | 见调用/handler | "/api/agent/memory/settings" |
| 241 | saveEdit | 调用 | PATCH | `/api/agent/memory/${encodeURIComponent(memory.memoryId)}` |
| 242 | saveEdit | 路径常量 | 见调用/handler | `/api/agent/memory/${encodeURIComponent(memory.memoryId)}` |
| 298 | remove | 调用 | DELETE | `/api/agent/memory/${encodeURIComponent(memory.memoryId)}` |
| 299 | remove | 路径常量 | 见调用/handler | `/api/agent/memory/${encodeURIComponent(memory.memoryId)}` |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 13 | 文案/数据常量 en | "About me" |
| 13 | 文案/数据常量 zh | "关于我" |
| 14 | 文案/数据常量 en | "Goals" |
| 14 | 文案/数据常量 zh | "目标" |
| 15 | 文案/数据常量 en | "Preferences" |
| 15 | 文案/数据常量 zh | "偏好" |
| 16 | 文案/数据常量 en | "Boundaries" |
| 16 | 文案/数据常量 zh | "约束" |
| 111 | 翻译 en | "Agent memory could not be loaded." |
| 112 | 翻译 zh | "Agent 记忆暂时无法读取。" |
| 126 | 翻译 en | "Agent memory could not be loaded." |
| 127 | 翻译 zh | "Agent 记忆暂时无法读取。" |
| 158 | 翻译 en | "The memory was not saved." |
| 159 | 翻译 zh | "这条记忆没有保存成功。" |
| 166 | 翻译 en | "Memory saved." |
| 166 | 翻译 zh | "记忆已保存。" |
| 172 | 翻译 en | "The memory was not saved." |
| 173 | 翻译 zh | "这条记忆没有保存成功。" |
| 207 | 翻译 en | "Memory settings were not changed." |
| 208 | 翻译 zh | "记忆设置没有更新成功。" |
| 214 | 翻译 en | "Memory settings updated." |
| 214 | 翻译 zh | "记忆设置已更新。" |
| 220 | 翻译 en | "Memory settings were not changed." |
| 221 | 翻译 zh | "记忆设置没有更新成功。" |
| 261 | 翻译 en | "The memory was not updated." |
| 262 | 翻译 zh | "这条记忆没有更新成功。" |
| 273 | 翻译 en | "Memory updated." |
| 273 | 翻译 zh | "记忆已更新。" |
| 279 | 翻译 en | "The memory was not updated." |
| 280 | 翻译 zh | "这条记忆没有更新成功。" |
| 307 | 翻译 en | "The memory was not deleted." |
| 308 | 翻译 zh | "这条记忆没有删除成功。" |
| 317 | 翻译 en | "Memory deleted." |
| 317 | 翻译 zh | "记忆已删除。" |
| 323 | 翻译 en | "The memory was not deleted." |
| 324 | 翻译 zh | "这条记忆没有删除成功。" |
| 366 | 翻译 en | "Agent memory" |
| 366 | 翻译 zh | "Agent 记忆" |
| 377 | 翻译 en | "Control the long-term context Orbit may use. Relationship facts remain in Contacts and their evidence." |
| 378 | 翻译 zh | "管理 Orbit 可以使用的长期上下文。关系事实仍保留在人脉及其证据中。" |
| 395 | 翻译 en | "Use memory in Agent replies" |
| 395 | 翻译 zh | "在 Agent 回复中使用记忆" |
| 399 | 翻译 en | "On" |
| 399 | 翻译 zh | "开启" |
| 400 | 翻译 en | "Off" |
| 400 | 翻译 zh | "关闭" |
| 419 | 翻译 en | "Allow approved learning from conversations" |
| 420 | 翻译 zh | "允许从对话中经确认后学习" |
| 425 | 翻译 en | "On" |
| 425 | 翻译 zh | "开启" |
| 426 | 翻译 en | "Off" |
| 426 | 翻译 zh | "关闭" |
| 441 | 翻译 en | "Add a memory" |
| 441 | 翻译 zh | "添加一条记忆" |
| 452 | 翻译 en | "Category" |
| 452 | 翻译 zh | "分类" |
| 453 | 属性 aria-label | t({ en: "Memory category", zh: "记忆分类" }) |
| 454 | 翻译 en | "Memory category" |
| 454 | 翻译 zh | "记忆分类" |
| 469 | 翻译 en | "What should Orbit remember?" |
| 469 | 翻译 zh | "希望 Orbit 记住什么？" |
| 470 | 属性 placeholder | t({ en: "Prefer concise Chinese replies.", zh: "偏好简洁的中文回复。", }) |
| 470 | 属性 aria-label | t({ en: "Memory content", zh: "记忆内容", }) |
| 472 | 翻译 en | "Memory content" |
| 473 | 翻译 zh | "记忆内容" |
| 478 | 翻译 en | "Prefer concise Chinese replies." |
| 479 | 翻译 zh | "偏好简洁的中文回复。" |
| 496 | 翻译 en | "Saving…" |
| 496 | 翻译 zh | "正在保存…" |
| 497 | 翻译 en | "Save memory" |
| 497 | 翻译 zh | "保存记忆" |
| 523 | 翻译 en | "Saved memories" |
| 523 | 翻译 zh | "已保存的记忆" |
| 527 | 翻译 en | "Loading…" |
| 527 | 翻译 zh | "正在加载…" |
| 532 | 翻译 en | "No saved memories. Orbit will not infer one silently." |
| 533 | 翻译 zh | "还没有记忆，Orbit 不会静默推断并保存。" |
| 555 | 属性 aria-label | t({ en: "Edit memory category", zh: "编辑记忆分类", }) |
| 557 | 翻译 en | "Edit memory category" |
| 558 | 翻译 zh | "编辑记忆分类" |
| 574 | 属性 aria-label | t({ en: "Edit memory content", zh: "编辑记忆内容", }) |
| 576 | 翻译 en | "Edit memory content" |
| 577 | 翻译 zh | "编辑记忆内容" |
| 600 | 翻译 en | "Save changes" |
| 600 | 翻译 zh | "保存修改" |
| 608 | 翻译 en | "Cancel" |
| 608 | 翻译 zh | "取消" |
| 629 | 翻译 en | "Added by you" |
| 629 | 翻译 zh | "由你添加" |
| 631 | 翻译 en | "Approved from chat" |
| 632 | 翻译 zh | "经你确认后来自对话" |
| 659 | 翻译 en | "Edit" |
| 659 | 翻译 zh | "编辑" |
| 668 | 翻译 en | "Confirm delete" |
| 668 | 翻译 zh | "确认删除" |
| 669 | 翻译 en | "Delete" |
| 669 | 翻译 zh | "删除" |

## repos/orbits/app/(app)/app/settings/orbit-appearance-settings.tsx

源码：[orbit-appearance-settings.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/settings/orbit-appearance-settings.tsx>)

静态来源入口：`/app/settings`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 25 | OrbitAppearanceSettings | section |  | card |
| 44 | OrbitAppearanceSettings | h2 | t({ en: "Appearance", zh: "外观" }) |  |

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 11 | [theme, setTheme] = useState&lt;OrbitTheme \| null&gt;(null) |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 58 | button/button · OrbitAppearanceSettings | Light / 浅色 | onclick: () =&gt; chooseTheme("light") | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 67 | button/button · OrbitAppearanceSettings | Dark / 深色 | onclick: () =&gt; chooseTheme("dark") | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 45 | 翻译 en | "Appearance" |
| 45 | 翻译 zh | "外观" |
| 49 | 翻译 en | "Choose the color mode used across Orbit on this device." |
| 50 | 翻译 zh | "选择此设备上 Orbit 全站使用的明暗配色。" |
| 53 | 属性 aria-label | t({ en: "Color mode", zh: "颜色模式" }) |
| 54 | 翻译 en | "Color mode" |
| 54 | 翻译 zh | "颜色模式" |
| 65 | 翻译 en | "Light" |
| 65 | 翻译 zh | "浅色" |
| 74 | 翻译 en | "Dark" |
| 74 | 翻译 zh | "深色" |

## repos/orbits/app/(app)/app/settings/orbit-settings-content.tsx

源码：[orbit-settings-content.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/settings/orbit-settings-content.tsx>)

静态来源入口：`/app/settings`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 15 | OrbitSettingsContent | header |  |  |
| 17 | OrbitSettingsContent | h1 | t({ en: "Settings", zh: "设置" }) |  |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 16 | JSX文字 | Orbit |
| 25 | 翻译 en | "Settings" |
| 25 | 翻译 zh | "设置" |
| 36 | 翻译 en | "Manage how Orbit looks and behaves on this device." |
| 37 | 翻译 zh | "管理你在当前设备上的 Orbit 使用偏好。" |

## repos/orbits/app/(app)/app/settings/page.tsx

源码：[page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/settings/page.tsx>)

静态来源入口：`/app/settings`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 13 | AppSettingsPage | main |  |  |

## repos/orbits/features/profile/profile-document-extraction-mock/debug-view.tsx

源码：[debug-view.tsx](</Users/li/work/orbit/repos/orbits/features/profile/profile-document-extraction-mock/debug-view.tsx>)

静态来源入口：`/dev/capabilities/[slug]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 95 | ProfileDocumentExtractionCapabilityDemo | header |  | workbench-header |
| 97 | ProfileDocumentExtractionCapabilityDemo | h1 | Profile document extraction mock |  |
| 105 | ProfileDocumentExtractionCapabilityDemo | section | Profile document extraction states | workbench-grid |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 24 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/profile/extractions/resume" |
| 26 | (module / render callback) | 路径常量 | 见调用/handler | "curl -s -X POST http://localhost:3000/api/profile/extractions/resume" |
| 32 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/profile/extractions/business-card" |
| 34 | (module / render callback) | 路径常量 | 见调用/handler | "curl -s -X POST http://localhost:3000/api/profile/extractions/business-card" |
| 41 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/profile/extractions/resume?scenario=empty" |
| 43 | (module / render callback) | 路径常量 | 见调用/handler | "curl -s -X POST http://localhost:3000/api/profile/extractions/resume?scenario=empty" |
| 49 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/profile/extractions/business-card?scenario=pending" |
| 51 | (module / render callback) | 路径常量 | 见调用/handler | "curl -s -X POST http://localhost:3000/api/profile/extractions/business-card?scenario=pending" |
| 57 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/profile/extractions/business-card?scenario=failure" |
| 59 | (module / render callback) | 路径常量 | 见调用/handler | "curl -s -X POST http://localhost:3000/api/profile/extractions/business-card?scenario=failure" |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 23 | 文案/数据常量 label | "Resume draft" |
| 31 | 文案/数据常量 label | "Business card draft" |
| 40 | 文案/数据常量 label | "Empty resume" |
| 48 | 文案/数据常量 label | "Pending card review" |
| 56 | 文案/数据常量 label | "Controlled failure" |
| 68 | 属性 aria-label | Profile document extraction evidence |
| 96 | JSX文字 | Developer capability runtime |
| 97 | JSX文字 | Profile document extraction mock |
| 99 | JSX文字 | Mock-first boundary for turning onboarding resume and business-card inputs into source-backed profile drafts without OCR, document parsing systems, AI calls, storage, or device access. |
| 105 | 属性 aria-label | Profile document extraction states |
| 109 | 属性 title | Success state |
| 116 | JSX文字 | Resume draft |
| 119 | JSX文字 | Operator |
| 123 | JSX文字 | Headline |
| 127 | JSX文字 | Relationship goal |
| 131 | JSX文字 | Confidence |
| 134 | JSX文字 | confidence from |
| 146 | 属性 title | Business card draft |
| 152 | JSX文字 | Contact |
| 159 | JSX文字 | Organization |
| 163 | JSX文字 | Suggested profile fields |
| 167 | JSX文字 | in |
| 182 | 属性 title | Empty state |
| 188 | JSX文字 | Draft |
| 189 | JSX文字 | No onboarding draft was extracted in this scenario. |
| 192 | JSX文字 | Source |
| 203 | 属性 title | Pending state |
| 209 | JSX文字 | Draft |
| 211 | JSX文字 | Business-card lines are held until the operator confirms the source text. |
| 216 | JSX文字 | Source |
| 227 | 属性 title | Failure state |
| 235 | JSX文字 | Error code |
| 241 | JSX文字 | Message |
| 245 | JSX文字 | Recovery |
| 255 | 属性 title | Profile extraction routes use shared envelopes |
| 260 | JSX文字 | Run these probes against the dev server to verify success, empty, pending, and failure envelopes without leaving the mock extraction boundary. |
| 266 | JSX文字 | Resume extraction |
| 268 | JSX文字 | POST /api/profile/extractions/resume |
| 268 | JSX文字 | returns a source-backed onboarding draft from the demo resume fixture. |
| 273 | JSX文字 | Business-card extraction |
| 275 | JSX文字 | POST /api/profile/extractions/business-card |
| 276 | JSX文字 | returns identity and contact fields from the demo card fixture. |
| 280 | JSX文字 | Controlled failure |
| 288 | JSX文字 | maps to a shared failure envelope and includes profile document context. |
| 293 | 属性 aria-label | Profile document extraction API probes |
| 305 | JSX文字 | Expected status: |
| 312 | 属性 aria-label | Profile document extraction guardrails |
| 316 | JSX文字 | mock only |
| 317 | JSX文字 | source-backed draft |
| 318 | JSX文字 | review before use |
| 322 | 属性 title | Replacement notes stay with the extraction capability |
| 328 | JSX文字 | Handoff doc |
| 334 | JSX文字 | Required coverage |
| 336 | JSX文字 | Live service files, the switch mechanism, required environment values and permissions, privacy and provenance constraints, and replacement tests are documented before live extraction is wired. |

## repos/orbits/features/profile/profile-onboarding-and-manual-profile-editor/debug-view.tsx

源码：[debug-view.tsx](</Users/li/work/orbit/repos/orbits/features/profile/profile-onboarding-and-manual-profile-editor/debug-view.tsx>)

静态来源入口：`/dev/capabilities/[slug]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 105 | ProfileOnboardingCapabilityDemo | header |  | workbench-header |
| 107 | ProfileOnboardingCapabilityDemo | h1 | Profile onboarding and manual profile editor |  |
| 115 | ProfileOnboardingCapabilityDemo | section | Profile onboarding states | workbench-grid |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 26 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/profile" |
| 31 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/profile?scenario=empty" |
| 36 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/profile?scenario=pending" |
| 41 | (module / render callback) | 路径常量 | 见调用/handler | "PUT /api/profile" |
| 47 | (module / render callback) | 路径常量 | 见调用/handler | 'PUT /api/profile {"displayName":""}' |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 25 | 文案/数据常量 label | "Read profile" |
| 30 | 文案/数据常量 label | "Empty onboarding" |
| 35 | 文案/数据常量 label | "Pending review" |
| 40 | 文案/数据常量 label | "Save profile" |
| 46 | 文案/数据常量 label | "Validation guard" |
| 55 | 属性 aria-label | Profile evidence |
| 106 | JSX文字 | Developer capability runtime |
| 107 | JSX文字 | Profile onboarding and manual profile editor |
| 109 | JSX文字 | Mock-first profile boundary for onboarding an operator, editing manual relationship context, and scoring profile completeness without storage, auth, or external services. |
| 115 | 属性 aria-label | Profile onboarding states |
| 119 | 属性 title | Success state |
| 128 | JSX文字 | Operator |
| 132 | JSX文字 | Headline |
| 136 | JSX文字 | Relationship goal |
| 140 | JSX文字 | Completeness |
| 142 | JSX文字 | % complete |
| 143 | JSX文字 | with |
| 147 | JSX文字 | next. |
| 158 | 属性 title | Empty state |
| 164 | JSX文字 | Profile |
| 165 | JSX文字 | No manual profile has been created in this scenario. |
| 168 | JSX文字 | Completeness |
| 170 | JSX文字 | % complete |
| 174 | JSX文字 | Source |
| 185 | 属性 title | Pending state |
| 191 | JSX文字 | Pending fields |
| 199 | JSX文字 | Source |
| 210 | 属性 title | Failure state |
| 215 | JSX文字 | Error code |
| 221 | JSX文字 | Message |
| 225 | JSX文字 | Recovery |
| 235 | 属性 title | Rule-based saves return scored profile context |
| 242 | 属性 aria-label | Read-only saved mock profile snapshot |
| 247 | JSX文字 | This snapshot displays the result returned by the mock update; it is not an editable save form. |
| 252 | JSX文字 | Display name |
| 256 | JSX文字 | Relationship goal |
| 260 | JSX文字 | Follow-up window |
| 264 | JSX文字 | Intro channels |
| 273 | JSX文字 | Saved profile |
| 275 | JSX文字 | at |
| 280 | JSX文字 | Completeness |
| 282 | JSX文字 | % complete |
| 283 | JSX文字 | after the mock editor save. |
| 287 | JSX文字 | Profile-informed follow-up |
| 289 | JSX文字 | Use |
| 289 | JSX文字 | and |
| 290 | JSX文字 | to shape the next relationship action for |
| 296 | JSX文字 | Editor state |
| 298 | JSX文字 | Last saved at |
| 306 | 属性 title | Profile routes use shared envelopes |
| 311 | JSX文字 | Run these probes against the dev server to verify success, empty, pending, update, and failure envelopes without leaving the mock boundary. |
| 317 | JSX文字 | Profile read |
| 319 | JSX文字 | GET /api/profile |
| 319 | JSX文字 | returns the demo manual profile, with query scenarios for empty and pending paths. |
| 324 | JSX文字 | Profile update |
| 326 | JSX文字 | PUT /api/profile |
| 326 | JSX文字 | scores completeness from the submitted manual fields without changing stored state. |
| 331 | JSX文字 | Controlled failure |
| 336 | JSX文字 | maps to a shared failure envelope and includes profile-specific context. |
| 341 | 属性 aria-label | Profile API probes |
| 353 | 属性 aria-label | Profile guardrails |
| 354 | JSX文字 | mock only |
| 355 | JSX文字 | source-backed fixture |
| 356 | JSX文字 | validation guard |
| 360 | 属性 title | Replacement notes stay with the profile capability |
| 366 | JSX文字 | Handoff doc |
| 372 | JSX文字 | Required coverage |
| 374 | JSX文字 | Live service files, the switch mechanism, required environment values and permissions, privacy and provenance constraints, and replacement tests are documented before live profile persistence is wired. |

## repos/orbits/features/profile/profile-signal-review-queue/debug-view.tsx

源码：[debug-view.tsx](</Users/li/work/orbit/repos/orbits/features/profile/profile-signal-review-queue/debug-view.tsx>)

静态来源入口：`/dev/capabilities/[slug]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 190 | ProfileSignalReviewQueueCapabilityDemo | header |  | workbench-header |
| 192 | ProfileSignalReviewQueueCapabilityDemo | h1 | Profile signal review queue |  |
| 200 | ProfileSignalReviewQueueCapabilityDemo | section | Profile signal review queue states | workbench-grid |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 31 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/profile/update-suggestions" |
| 32 | (module / render callback) | 路径常量 | 见调用/handler | "curl -s http://localhost:3000/api/profile/update-suggestions" |
| 39 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/profile/update-suggestions/demo-profile-suggestion-1/accept" |
| 41 | (module / render callback) | 路径常量 | 见调用/handler | "curl -s -X POST http://localhost:3000/api/profile/update-suggestions/demo-profile-suggestion-1/accept" |
| 47 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/profile/update-suggestions?scenario=empty" |
| 49 | (module / render callback) | 路径常量 | 见调用/handler | "curl -s http://localhost:3000/api/profile/update-suggestions?scenario=empty" |
| 55 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/profile/update-suggestions?scenario=pending" |
| 57 | (module / render callback) | 路径常量 | 见调用/handler | "curl -s http://localhost:3000/api/profile/update-suggestions?scenario=pending" |
| 63 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/profile/update-suggestions?scenario=failure" |
| 65 | (module / render callback) | 路径常量 | 见调用/handler | "curl -s http://localhost:3000/api/profile/update-suggestions?scenario=failure" |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 30 | 文案/数据常量 label | "Review queue" |
| 37 | 文案/数据常量 label | "Accept suggestion" |
| 46 | 文案/数据常量 label | "Empty queue" |
| 54 | 文案/数据常量 label | "Pending signal" |
| 62 | 文案/数据常量 label | "Controlled failure" |
| 74 | 属性 aria-label | Profile signal evidence |
| 94 | 属性 title | Source review rehearsal |
| 99 | JSX文字 | No automatic profile mutation happens in this mock boundary. The route returns a review suggestion and an accepted patch for the operator to inspect before saving. |
| 105 | JSX文字 | Inspect source excerpt |
| 109 | JSX文字 | Return patch only |
| 111 | JSX文字 | becomes |
| 116 | JSX文字 | Operator save required |
| 118 | JSX文字 | Keep the patch separate from persistence until the profile editor confirmation guard accepts it. |
| 123 | 属性 aria-label | Profile signal review rehearsal |
| 124 | JSX文字 | No automatic profile mutation |
| 126 | JSX文字 | operator confirmed save |
| 191 | JSX文字 | Developer capability runtime |
| 192 | JSX文字 | Profile signal review queue |
| 194 | JSX文字 | Mock-first boundary for profile update suggestions from chat, activity, and contact signals. Suggestions stay in review until the operator accepts a source-backed patch. |
| 200 | 属性 aria-label | Profile signal review queue states |
| 204 | 属性 title | Success state |
| 217 | JSX文字 | suggests |
| 218 | JSX文字 | from |
| 219 | JSX文字 | to |
| 231 | 属性 title | Empty state |
| 237 | JSX文字 | Queue |
| 238 | JSX文字 | No profile suggestions are ready in this scenario. |
| 241 | JSX文字 | Source |
| 252 | 属性 title | Pending state |
| 258 | JSX文字 | Suggestion |
| 260 | JSX文字 | is held as |
| 265 | JSX文字 | Generation |
| 276 | 属性 title | Failure state |
| 281 | JSX文字 | Error code |
| 287 | JSX文字 | Message |
| 291 | JSX文字 | Recovery |
| 301 | 属性 title | Accepting a suggestion returns a patch, not a background mutation |
| 310 | JSX文字 | Accepted suggestion |
| 312 | JSX文字 | moved to |
| 317 | JSX文字 | Patch field |
| 323 | JSX文字 | Patch value |
| 327 | 属性 aria-label | Profile signal guardrails |
| 328 | JSX文字 | mock only |
| 329 | JSX文字 | source-backed patch |
| 330 | JSX文字 | review before save |
| 343 | 属性 title | Profile signal routes use shared envelopes |
| 348 | JSX文字 | Run these probes against the dev server to verify review, empty, pending, accept, and failure envelopes inside the mock boundary. |
| 353 | JSX文字 | Suggestion queue |
| 355 | JSX文字 | GET /api/profile/update-suggestions |
| 355 | JSX文字 | returns sourced suggestions from chat, activity, and contact fixtures. |
| 360 | JSX文字 | Accept suggestion |
| 363 | JSX文字 | POST /api/profile/update-suggestions/demo-profile-suggestion-1/accept |
| 366 | JSX文字 | returns the accepted suggestion and a profile patch. |
| 370 | JSX文字 | Controlled failure |
| 378 | JSX文字 | maps to a shared failure envelope. |
| 382 | 属性 aria-label | Profile signal review queue API probes |
| 394 | JSX文字 | Expected status: |
| 403 | 属性 title | Replacement notes stay with the profile signal capability |
| 409 | JSX文字 | Handoff doc |
| 415 | JSX文字 | Required coverage |
| 417 | JSX文字 | Live service files, the switch mechanism, required environment values and permissions, privacy and provenance constraints, and replacement tests are documented before live signal analysis is wired. |
| 424 | JSX文字 | Provider files |
| 427 | JSX文字 | features/profile/live-signal-service.ts |
| 429 | JSX文字 | plus chat, activity, and contact adapters inside the capability provider folder. |
| 434 | JSX文字 | Switch and env |
| 436 | JSX文字 | Feature mode stays explicit, and live mode requires |
| 437 | JSX文字 | ORBIT_PROFILE_SIGNAL_PROVIDER |
| 437 | JSX文字 | before provider adapters can replace the mock service. |
| 442 | JSX文字 | Privacy and tests |
| 444 | JSX文字 | Replacement tests must preserve evidence provenance, hide raw provider errors, and prove suggestions never write directly to profile fields. |


