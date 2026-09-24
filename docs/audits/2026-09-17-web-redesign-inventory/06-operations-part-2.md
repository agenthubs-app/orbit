| 77 | 文案/数据常量 description | "报名审阅与准入决定。" |
| 77 | 文案/数据常量 label | "审核" |
| 78 | 文案/数据常量 description | "仅活动汇总分析，不含个人名单。" |
| 78 | 文案/数据常量 label | "只读分析" |
| 321 | JSX文字 | 返回运营台 |
| 325 | JSX文字 | EVENT-SCOPED ACCESS |
| 328 | JSX文字 | 负责人来自 Event Core；所有委派角色仅对当前活动生效。每次变更都会先读取最新版本，避免覆盖并发更新。 |
| 332 | JSX文字 | 刷新角色 |
| 338 | JSX文字 | 正在读取当前角色… |
| 343 | JSX文字 | GRANT EVENT ROLE |
| 344 | JSX文字 | 授予活动范围角色 |
| 347 | JSX文字 | 可直接从本活动的已报名参会者中选择授权对象；活动之外的人员仍可粘贴准确的 |
| 347 | JSX文字 | 账号 ID |
| 348 | JSX文字 | 当前授权边界只保存账号 ID，未接入经过授权的姓名或邮箱目录。请粘贴准确的 |
| 348 | JSX文字 | 账号 ID |
| 348 | JSX文字 | ；不会做模糊全库搜索。 |
| 353 | JSX文字 | 从参会者选择 |
| 360 | JSX文字 | ——手动输入账号 ID—— |
| 368 | JSX文字 | 账号 ID（精确值） |
| 369 | 属性 placeholder | actor:operations-01 |
| 371 | JSX文字 | 参会者： |
| 375 | JSX文字 | 活动角色 |
| 381 | JSX文字 | 授权原因 |
| 382 | 属性 placeholder | 例如：负责现场签到和嘉宾接待 |
| 394 | JSX文字 | CURRENT EVENT ROLES |
| 395 | JSX文字 | 当前活动角色 |
| 397 | JSX文字 | 负责人不可改为委派角色。撤销后，账号不再出现在该活动的有效角色列表中；重新授予会读取其保留的版本号。 |
| 411 | JSX文字 | 账号 ID |
| 413 | JSX文字 | 当前版本 |
| 417 | JSX文字 | 负责人由 Event Core organizer 派生，不能在此撤销或变更。 |
| 419 | JSX文字 | 上次操作： |
| 433 | 属性 placeholder | 填写变更或撤销原因 |
| 443 | JSX文字 | 更新角色 |
| 444 | JSX文字 | 撤销 |
| 451 | JSX文字 | 除 Event Core 负责人外，尚无有效委派角色。 |

## repos/orbits/app/(app)/app/events/[id]/operations/roles/page.tsx

源码：[page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/events/[id]/operations/roles/page.tsx>)

静态来源入口：`/app/events/[id]/operations/roles`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 50 | EventRoleManagementPage | main |  |  |
| 52 | EventRoleManagementPage | h1 | 活动角色管理需要负责人权限 | h-display |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 54 | link/a · EventRoleManagementPage | 返回运营活动中心 | /app/events/center | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 51 | JSX文字 | EVENT ROLE ACCESS |
| 52 | JSX文字 | 活动角色管理需要负责人权限 |
| 53 | JSX文字 | 只有 Event Core 中的当前活动负责人可以查看或变更当前活动角色。 |
| 54 | JSX文字 | 返回运营活动中心 |

## repos/orbits/app/(app)/app/events/center/event-center-workspace.tsx

源码：[event-center-workspace.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/events/center/event-center-workspace.tsx>)

静态来源入口：`/app/events/center`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 166 | EventCenterWorkspace | main | error ? &lt;div className="card" role="alert" style={{ borderColor: "var(--rose)", color: "var(--rose)", marginTop: 20, padding: 16 }}&gt;{error}&lt;/div&gt; : null loading ? &lt;div className="card" role="status" style={{ marginTop: 20, padding: 18 }}&gt;正在读取你可访问的活动…&lt;/div&gt; : null !loading && !error && events.length === 0 ? ( &lt;section c …（完整表达式见源码） |  |
| 170 | EventCenterWorkspace | h1 | 运营活动中心 | h-display |
| 184 | EventCenterWorkspace | section |  | card |
| 186 | EventCenterWorkspace | h2 | 还没有可运营的活动 | h-title |
| 193 | EventCenterWorkspace | section | 可访问活动 |  |
| 208 | EventCenterWorkspace | h2 | eventTitle(event) | h-title |

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 141 | [events, setEvents] = useState&lt;readonly EventCenterItem[]&gt;([]) |
| 142 | [error, setError] = useState&lt;string \| null&gt;(null) |
| 143 | [loading, setLoading] = useState(true) |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 175 | button/button · EventCenterWorkspace | 正在刷新… / 刷新列表 | onclick: () =&gt; void load() | {"disabled":"loading","renderGateProps":[],"conditions":[]} |
| 271 | link/a · EventCenterWorkspace | {action.label} | action.href | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 132 | requestJson | 调用 | GET/由封装决定 | url |
| 148 | EventCenterWorkspace | 调用 | GET/由封装决定 | "/api/events/center" |
| 148 | EventCenterWorkspace | 路径常量 | 见调用/handler | "/api/events/center" |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 37 | 文案/数据常量 label | "活动负责人" |
| 41 | 文案/数据常量 label | "运营" |
| 45 | 文案/数据常量 label | "签到" |
| 49 | 文案/数据常量 label | "审核" |
| 53 | 文案/数据常量 label | "只读分析" |
| 169 | JSX文字 | EVENT OPERATIONS CENTER |
| 170 | JSX文字 | 运营活动中心 |
| 172 | JSX文字 | 这里只显示你作为活动负责人，或拥有当前有效活动角色的活动。权限按活动隔离，不存在工作区级运营角色。 |
| 181 | JSX文字 | 正在读取你可访问的活动… |
| 185 | JSX文字 | NO ACTIVE EVENT ACCESS |
| 186 | JSX文字 | 还没有可运营的活动 |
| 188 | JSX文字 | 当你成为某个活动的 Event Core 负责人，或被该活动负责人授予有效角色后，活动会出现在这里。 |
| 193 | 属性 aria-label | 可访问活动 |
| 216 | JSX文字 | 该活动尚未完成 Event Core 主数据迁移。为避免从旧活动域读取或授权，运营、签到、分析与角色管理暂不可用。 |
| 238 | JSX文字 | 首次运营配置必须由活动负责人初始化；初始化完成后，运营角色才能继续调整配置并执行现场流程。 |
| 255 | 文案/数据常量 label | "打开运营台" |
| 256 | 文案/数据常量 label | "报名审核" |
| 257 | 文案/数据常量 label | "签到台" |
| 258 | 文案/数据常量 label | "查看活动分析" |
| 259 | 文案/数据常量 label | "查看活动" |
| 260 | 文案/数据常量 label | "管理角色" |

## repos/orbits/features/events/event-analytics/report.tsx

源码：[report.tsx](</Users/li/work/orbit/repos/orbits/features/events/event-analytics/report.tsx>)

静态来源入口：`/app/events/[id]/analytics`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 69 | Section | section | children | card-flat |
| 70 | Section | h3 | title |  |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 56 | 属性 label | 草稿约谈 |
| 57 | 属性 label | 等待回复 |
| 58 | 属性 label | 协商中 |
| 59 | 属性 label | 已确认 |
| 60 | 属性 label | 待改期 |
| 61 | 属性 label | 已完成 |
| 62 | 属性 label | 已取消 |
| 112 | 属性 title | 活动聚合分析 |
| 114 | JSX文字 | 仅展示活动级汇总；不含参会者身份、档案或单条互动内容。 |
| 117 | 属性 label | 有效报名 |
| 118 | 属性 label | 已取消报名 |
| 119 | 属性 label | 已签到 |
| 120 | 属性 label | 已同意联系 |
| 121 | 属性 label | 人工交流证据 |
| 122 | 属性 label | 已投影交流 |
| 125 | 属性 title | 联系与分组证据 |
| 127 | 属性 label | 等待同意 |
| 128 | 属性 label | 已拒绝联系 |
| 129 | 属性 label | 已撤回联系 |
| 130 | 属性 label | 第一轮桌数 |
| 131 | 属性 label | 第一轮座位 |
| 132 | 属性 label | 第二轮桌数 |
| 133 | 属性 label | 第二轮座位 |
| 136 | JSX文字 | 分组发布状态： |
| 139 | 属性 title | 可解释比率 |
| 141 | JSX文字 | 百分比仅为整数四舍五入，始终同时给出真实分子/分母；分母为零时不显示伪精度。 |
| 144 | 属性 label | 签到率 |
| 145 | 属性 label | 联系同意率 |
| 146 | 属性 label | 完成约谈率 |
| 149 | 属性 title | 双向连接与后续行动 |
| 151 | JSX文字 | 双向连接参与仅统计已接受关系中双方均签到的参会者；后续行动仅统计完成账本中带完整强 eventOrigin 的操作，不按标题或联系人反推活动。 |
| 154 | 属性 label | 已接受双向关系 |
| 158 | 属性 label | 双方均签到关系 |
| 162 | 属性 label | 强归因完成行动 |
| 166 | 属性 label | 有效连接关系 |
| 170 | 属性 label | 有效连接参与者 |
| 174 | 属性 label | 双向连接参与率 |
| 179 | 属性 label | 行动归因覆盖率 |
| 184 | 属性 label | 有效连接率 |
| 191 | 属性 label | 强行动·交流记录 |
| 192 | 属性 label | 强行动·消息草稿 |
| 193 | 属性 label | 强行动·跟进提醒 |
| 194 | 属性 label | 强行动·非取消约谈 |
| 197 | JSX文字 | ROI 窗口截止： |
| 202 | 属性 title | 约谈进展 |
| 227 | 属性 title | 我的活动报告 |
| 229 | JSX文字 | 此报告仅汇总本人可见的活动证据。 |
| 232 | 属性 label | 已同意联系 |
| 233 | 属性 label | 本人交流记录 |
| 234 | 属性 label | 已投影交流 |
| 235 | 属性 label | 已完成约谈 |
| 238 | JSX文字 | 签到： |
| 242 | JSX文字 | 分组： |
| 249 | 属性 title | 我的联系与约谈 |
| 251 | 属性 label | 等待同意 |
| 252 | 属性 label | 已拒绝 |
| 253 | 属性 label | 已撤回 |
| 257 | 属性 title | AI 会后产物（只读） |
| 259 | JSX文字 | 状态： |
| 271 | JSX文字 | 失败代码： |
| 278 | JSX文字 | 消息草稿 |


