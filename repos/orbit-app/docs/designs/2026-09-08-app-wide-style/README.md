# 全 App 视觉统一

日期：2026-09-08；更新：2026-09-09。状态：尚未完成全 App 交付。存储阻塞已解除，代码索引刷新成功，继续处理日历大字号布局及剩余验收；未删除或迁移用户文件。

## 范围

2026-09-10 合并补充：当前代码共有 63 个入口。下方 58 条视觉验收记录仍仅对应原快照；另行集成的 `/account/reset-password`、`/contacts/new/batch/[id]`、`/contacts/new/batch2`、`/contacts/new/batch2/[id]`、`/events/[id]/operations/experience` 不继承这 58 条的原生观察证据，运行时验收仍未完成。路由清单测试同时核对两组入口，继续拒绝遗漏、重复及未登记的新入口。

沿用已确认的蓝灰浅深色和原生排版，将统一页头、开放分区、表单及操作层级覆盖到全 App，不改变业务、API、权限或导航行为。

- [执行规格](../../superpowers/specs/2026-09-08-app-wide-style-design.md)
- [58 个路由入口与既有测试覆盖矩阵](../../superpowers/plans/2026-09-08-app-wide-native-qa-matrix.md)

58 个入口包含 4 个跳转，且部分入口复用同一组件；不是 58 个独立界面。抽屉、历史、菜单、筛选、编辑、采集确认及加载/空/错误状态也属于本轮验收。

## 分批结果

| 批次 | 实现与测试 | 独立审查 | 原生检查 |
| --- | --- | --- | --- |
| 共享基础 | 830 项测试通过；类型与 diff 检查通过 | 规格与质量通过，无阻断项 | 设置页浅色、深色、大字已查看；其余页面随领域批次复核 |
| 人脉、采集与分析 | 842 项测试通过；修补后 29 项聚焦回归通过，包含证据表单和拒绝权限；类型与 diff 检查通过 | 修补后复审通过，无新增阻断项 | 10 个入口已查看；结构详情显示 NOT_FOUND，成功内容由受控渲染覆盖；详情展开、键盘滚动、大字分析与深色弹层已查看 |
| 活动、现场与邀请 | 859 项测试通过；17 项聚焦回归通过；类型与 diff 检查通过 | 待修补重复标题与旧首页模式真实渲染覆盖 | 17 个入口已逐条查看；角色成功页及授权表单只读开关、零样本分析、深色大字详情与操作区另有原生证据 |
| AI、消息、任务与日程 | 首轮 27 项真实渲染回归通过；错误页/任务大字补测通过；存储恢复后继续日历大字时间栏修补 | 待执行 | 已检查真实任务详情、AI 历史与会话；日历大字发现仍需修补，尚未做最终 14 路由验收 |
| 账号、设置与管理 | 待执行 | 待执行 | 待执行 |
| 全量回归与路由验收 | 待执行 | 待执行 | 待执行 |

共享层新增真实渲染回归覆盖 320pt、长标题、可点击分区、输入与草稿保持、禁用操作、返回 fallback、浅深色对比度和放大文字重排。原来要求 `height:44` 字面量的页头源码断言已由真实尺寸及点击行为断言替代；不是移除触控要求。

## 原生验收边界

- 使用现有已登录模拟器，只读导航和本地草稿操作；不发送、保存、报名、签到、修改角色、注销或修改服务器配置。
- 真实活动 `event_signup_03` 的运营入口返回「当前账号没有权限完成这项操作」。该结果只验证权限提示；运营成功内容仍需受控渲染测试。
- 当前服务不提供结构详情 mock 成功数据；该页成功内容需受控 fixture，不能以 NOT_FOUND 界面代替成功验收。
- `event_signup_03` 的报名、参会者和现场入口显示 NOT_FOUND，运营/审核/签到/角色/分析入口显示权限提示。当前账号实际负责的活动可打开角色成功页、授权表单与零样本分析；其运营页显示未配置规则。成功内容和操作参数另由受控真实组件渲染覆盖，没有更改角色或配置来制造成功态。
- `/contacts/graph` 现有实现复用 `ContactsDashboardScreen`；未路由的 `ContactsGraphScreen` 不计为另一条已验收路线。
- startup/legacy resolver 的既有缺口已列在路由矩阵；视觉迁移不顺带更改兼容路由策略。
- 截图先生成到 `/tmp`，再归档到 `.tmp/app-wide-style/`；模拟器、截图和生成日志不提交。

## 待闭合检查

全量路由导航、各页面族成功/错误内容、浅深色、320pt、原生系统大字、键盘与弹层，以及最终完整测试和独立整体审查，均需在交付前补齐证据。本页未完成的表项不能作为通过记录。

---

# 2026-09-09 — Task 6 全路由覆盖与交接更新

下述记录更新上方阶段性进度表；旧段落原样保留用于追溯，不代表当前 Tasks 3–5 仍待执行。

- Acceptance status: **INCOMPLETE**
- Runtime Dynamic Type: **OPEN**
- Auth/profile software keyboard: **UNPROVEN**

Tasks 1–5 的领域实现、修补及独立复审已经闭合，58 个真实 `app/` 入口也都有 controller 查看过的原生实际状态记录；这不等于 58 个独立界面、58 个业务成功态或整个 App 已收敛。实时切换系统字号后原生文字 frame 陈旧的问题仍开放，账号/档案页只证明输入聚焦与滚动，没有证明软件键盘出现。最终完整回归、类型检查和全局独立审查由 controller 执行，本页不会提前写成通过。

## 范围与依据

沿用已确认的蓝灰浅深色、原生字体、22pt 页面留白、开放分区及共享控件层级；不改变业务、API、权限、路由或状态同步行为。

- [执行规格](../../superpowers/specs/2026-09-08-app-wide-style-design.md)
- [迁移前 58 路由审计矩阵](../../superpowers/plans/2026-09-08-app-wide-native-qa-matrix.md)
- 本轮真实渲染/交互证据：`tests/app-wide-primitives.test.ts`、`tests/app-wide-contacts.test.ts`、`tests/app-wide-events.test.ts`、`tests/app-wide-workspaces.test.ts`、`tests/app-wide-account.test.ts`。
- 本轮原生证据来源：`.tmp/app-wide-style/after/task2`、`task3`、`task4`、`task5` 及 `redirects` 内的 controller-confirmed observation JSON。截图路径只有在 observation 中标明已查看时才作为证据；文件存在本身不证明渲染成功。

## 分批结果

| 批次 | 实现与测试 | 独立审查 | 原生检查 |
| --- | --- | --- | --- |
| 共享基础 | 830 项聚合测试通过；聚焦、类型与 diff 检查通过 | 规格与质量通过，无阻断项 | 设置页浅/深/大字查看；共享能力随领域 consumer 复核 |
| 人脉、采集与分析 | 842 项聚合测试通过；修补后 29 项聚焦通过 | 修补复审通过 | 9 项主 JSON + 1 项独立 detail；结构详情 NOT_FOUND 另有受控 success |
| 活动、现场与邀请 | 859 项当时聚合测试通过；最终修补覆盖 36 项通过 | 重复标题/hub 渲染缺口修补复审通过 | 17 个入口逐项记录；权限/NOT_FOUND 与 owner 补证分开 |
| AI、消息、任务与日程 | 最终 36 项聚焦通过；类型与 diff 检查通过 | 领域审查通过 | 14 个入口、settled overlays、AI/inbox 软件键盘、冷启动大字已记录 |
| 账号、设置与管理 | 927 项聚合结果后又修补 5 处反馈半径；修补覆盖 40 项通过 | fix round 复审通过 | 13 个入口及深色冷启动大字补证；auth/profile 键盘未证明 |
| 全量回归与路由验收 | Task 6 独立扫描真实 58 入口并验证 README 矩阵 | whole-app review 待 controller 完成 | 58 个 actual state 已齐；live Dynamic Type 仍 OPEN |

共享层真实 consumer 回归覆盖 320pt、长标题、可点击分区、输入与草稿保持、禁用操作、返回 fallback、浅深色对比度和放大文字重排。旧 `height:44` 字面量断言已由真实尺寸及点击行为替代，不是移除触控要求。

## 58 个入口的最终覆盖记录

实现来源按表中状态统一解释，并适用于每一行：

- `screen`：表中精确列出的 canonical consumer 已在 Tasks 2–5 直接改造；`app/**.tsx` 入口仍是未改的薄 wrapper，并继续继承该 consumer 原先使用的 Task 1 `AppScreen`、`DataCard`、state/control primitives。
- `alias`：只有 `/contacts/graph`；未改薄 wrapper 复用已直接改造的 `ContactsDashboardScreen`，没有把未路由的 `ContactsGraphScreen` 算成 live route。
- `redirect`：精确为 `/`、`/home`、`/account/mobile-google`、`/[...legacy]`；四个 entry/resolver 行为均未改，只做原生目标观察和既有跳转契约验证。

因此 54 个 screen/alias 入口是“直接改造 canonical consumer + 未改薄 wrapper + 既有共享组件继承”，4 个 redirect 是“未改跳转 wrapper”。原生栏只记录当时实际观察到的状态，受数据或角色限制时不会改写成成功态；渲染栏指向真实 screen/content 与交互测试或跳转契约，不以源码文件存在替代视觉证明。

<!-- route-coverage:start -->
| 路由 | Canonical consumer | 状态 | Controller 查看过的原生实际状态 | 真实渲染/交互或跳转契约 |
| --- | --- | --- | --- | --- |
| `/ai` | `AiScreen` | screen | `.tmp/app-wide-style/after/task4/native-route-observations.json`: 已登录 AI 首页与真实待办 | `tests/app-wide-workspaces.test.ts`: AI 下一步、共享布局和大字动作 |
| `/ai/[id]` | `AiConversationScreen` | screen | `.tmp/app-wide-style/after/task4/native-route-observations.json`: 已存会话；`.tmp/app-wide-style/after/task4/native-state-observations.json`: 深色冷启动大字 | `tests/app-wide-workspaces.test.ts`: 阅读画布、草稿与快捷入口 |
| `/agent` | `AgentActionsScreen` | screen | `.tmp/app-wide-style/after/task4/native-route-observations.json`: 0 条待确认空态 | `tests/app-wide-workspaces.test.ts`: 页面层级、动作大字边界 |
| `/contacts` | `ContactsScreen (overview)` | screen | `.tmp/app-wide-style/after/task2/native-route-observations.json`: success | `tests/app-wide-contacts.test.ts`: 导航与采集控件大字边界 |
| `/contacts/list` | `ContactsScreen (list)` | screen | `.tmp/app-wide-style/after/task2/native-route-observations.json`: success，真实联系人列表 | `tests/app-wide-contacts.test.ts`: 320pt 导航；`tests/contacts-redesign-interactions.test.ts`: 搜索/筛选 |
| `/contacts/[id]` | `ContactDetailScreen` | screen | `.tmp/app-wide-style/after/task2/native-detail-observation.json`: success，点击真实联系人进入 | `tests/app-wide-contacts.test.ts`: 联系人导航；`tests/contacts-redesign-interactions.test.ts`: 详情编辑与失败保留草稿 |
| `/contacts/new` | `ContactAcquisitionScreen` | screen | `.tmp/app-wide-style/after/task2/native-route-observations.json`: success | `tests/app-wide-contacts.test.ts`: 采集模式、权限拒绝恢复、无写入 |
| `/contacts/dashboard` | `ContactsDashboardScreen` | screen | `.tmp/app-wide-style/after/task2/native-route-observations.json`: success，完整分析 | `tests/app-wide-contacts.test.ts`: 320pt 分析、完整数值、深色弹层 |
| `/contacts/graph` | `ContactsDashboardScreen` | alias | `.tmp/app-wide-style/after/task2/native-route-observations.json`: success，同 dashboard 实屏 | `tests/app-wide-contacts.test.ts`: alias 动作与请求边界；`tests/contacts-analysis-route-source.test.ts`: canonical 绑定 |
| `/contacts/pipeline` | `ContactPipelineScreen` | screen | `.tmp/app-wide-style/after/task2/native-route-observations.json`: success_with_empty_scheduled_tasks | `tests/app-wide-contacts.test.ts`: 模式切换、44pt 目标、无推进写入 |
| `/contacts/intros` | `ContactIntrosScreen` | screen | `.tmp/app-wide-style/after/task2/native-route-observations.json`: success | `tests/app-wide-contacts.test.ts`: 可编辑邀请草稿且不准备/发送 |
| `/contacts/analysis/[dimension]/[bucketId]` | `ContactStructureDetailScreen` | screen | `.tmp/app-wide-style/after/task2/native-route-observations.json`: NOT_FOUND，未冒充成功 | `tests/app-wide-contacts.test.ts`: 受控 success 内容和 320pt 联系人入口 |
| `/contacts/all-actions` | `AllActionsAgentLedgerScreen` | screen | `.tmp/app-wide-style/after/task4/native-route-observations.json`: 0 条账本记录空态 | `tests/app-wide-workspaces.test.ts`: workspace 标题/动作；`tests/agent-ledger-screen-render.test.tsx`: 受控内容 |
| `/events` | `EventsScreen` | screen | `.tmp/app-wide-style/after/task3/native-route-observations.json`: success，真实活动列表 | `tests/app-wide-events.test.ts`: 封面、筛选、320pt 大字动作 |
| `/events/[id]` | `EventDetailScreen` | screen | `.tmp/app-wide-style/after/task3/native-route-observations.json`: success，`event_signup_03` | `tests/app-wide-events.test.ts`: 长标题、封面、报名/运营入口边界 |
| `/events/[id]/register` | `EventRegistrationScreen` | screen | `.tmp/app-wide-style/after/task3/native-route-observations.json`: NOT_FOUND | `tests/app-wide-events.test.ts`: 受控选项、失败提交保留选择 |
| `/events/[id]/attendees` | `EventAttendeesScreen` | screen | `.tmp/app-wide-style/after/task3/native-route-observations.json`: NOT_FOUND | `tests/app-wide-events.test.ts`: 受控参会者身份与只读到场状态 |
| `/events/center` | `EventCenterScreen` | screen | `.tmp/app-wide-style/after/task3/native-route-observations.json`: success | `tests/app-wide-events.test.ts`: 主动作独立换行及次级目的地 |
| `/events/[id]/operations` | `EventOperationsScreen` | screen | `.tmp/app-wide-style/after/task3/native-route-observations.json`: permission-denied；另有真实 owner 未配置规则态 | `tests/app-wide-events.test.ts`: 受控 success/failure 与 50pt 发布动作 |
| `/events/[id]/operations/admission` | `EventAdmissionReviewScreen` | screen | `.tmp/app-wide-style/after/task3/native-route-observations.json`: permission-denied | `tests/app-wide-events.test.ts`: 受控队列、资料弹层、处理态 guard |
| `/events/[id]/operations/check-in` | `EventCheckInScreen` | screen | `.tmp/app-wide-style/after/task3/native-route-observations.json`: permission-denied | `tests/app-wide-events.test.ts`: 受控搜索/筛选与不重复签到边界 |
| `/events/[id]/operations/roles` | `EventRolesScreen` | screen | `.tmp/app-wide-style/after/task3/native-route-observations.json`: permission-denied；另有真实 owner 角色页 | `tests/app-wide-events.test.ts`: 受控角色/grant 表单与失败草稿 |
| `/events/[id]/analytics` | `EventAnalyticsScreen` | screen | `.tmp/app-wide-style/after/task3/native-route-observations.json`: permission-denied；另有真实 owner 零样本态 | `tests/app-wide-events.test.ts`: 受控分数与报告切换 |
| `/inbox` | `RelationshipInboxScreen` | screen | `.tmp/app-wide-style/after/task4/native-route-observations.json`: 真实消息与 40 条提醒 | `tests/app-wide-workspaces.test.ts`: 编辑/取消；`tests/relationship-inbox-interactions.test.ts`: 搜索、失败与本地预览 |
| `/inbox/[id]` | `RelationshipInboxThreadScreen` | screen | `.tmp/app-wide-style/after/task4/native-route-observations.json`: 真实曾伟 thread 与无正文记录说明 | `tests/app-wide-workspaces.test.ts`: 编辑动作；`tests/relationship-inbox-interactions.test.ts`: 展开/预览/隐私 |
| `/chat` | `RelationshipChatScreen` | screen | `.tmp/app-wide-style/after/task4/native-route-observations.json`: empty | `tests/app-wide-workspaces.test.ts`: 受控列表、导航和消息 |
| `/chat/[id]` | `RelationshipChatDetailScreen` | screen | `.tmp/app-wide-style/after/task4/native-route-observations.json`: NOT_FOUND | `tests/app-wide-workspaces.test.ts`: 受控成功内容与失败草稿不发送 |
| `/schedule` | `ScheduleScreen` | screen | `.tmp/app-wide-style/after/task4/native-route-observations.json`: 日/周/月日历；`.tmp/app-wide-style/after/task4/native-state-observations.json`: 日/周冷启动大字 | `tests/app-wide-workspaces.test.ts`: 2x 小时栏、agenda 文字与时间几何 |
| `/schedule/events/[id]` | `ScheduleEventPreviewScreen` | screen | `.tmp/app-wide-style/after/task4/native-route-observations.json`: 实际活动预览 | `tests/app-wide-workspaces.test.ts`: 44pt 导航和 no-action 边界 |
| `/today` | `TodayScreen` | screen | `.tmp/app-wide-style/after/task4/native-route-observations.json`: 8 项真实待办 | `tests/app-wide-workspaces.test.ts`: 大字 workspace 动作；`tests/app-screen-touch-targets.test.ts`: 触控尺寸 |
| `/tasks` | `TasksScreen` | screen | `.tmp/app-wide-style/after/task4/native-route-observations.json`: 真实待办列表 | `tests/app-wide-workspaces.test.ts`: 大字动作与主动作字重 |
| `/tasks/[id]` | `TaskDetailScreen` | screen | `.tmp/app-wide-style/after/task4/native-route-observations.json`: 从真实首行进入，无完成/保存 | `tests/app-wide-workspaces.test.ts`: 完整大字日期；`tests/task-detail-interactions.test.ts`: 受控编辑/失败 |
| `/followups` | `FollowupsScreen` | screen | `.tmp/app-wide-style/after/task4/native-route-observations.json`: 64 待办/40 提醒 | `tests/app-wide-workspaces.test.ts`: 大字 workspace 动作与边界 |
| `/profile` | `ProfileScreen` | screen | `.tmp/app-wide-style/after/task5/native-route-observations.json`: 浅色身份成功；`.tmp/app-wide-style/after/task5/native-state-observations.json`: 深色大字仅 editor/focus，cold profile final 为 LOADING ONLY | `tests/app-wide-account.test.ts`: 实际 profile 边界；`tests/profile-screen-source.test.ts`: 保留标签/动作契约 |
| `/account` | `AccountScreen` | screen | `.tmp/app-wide-style/after/task5/native-route-observations.json`: 已登录身份和 workspace | `tests/app-wide-account.test.ts`: 账号导航及无 logout 写入 |
| `/account/login` | `AccountAuthScreen (login)` | screen | `.tmp/app-wide-style/after/task5/native-route-observations.json`: 登录表单；未提交 | `tests/app-wide-account.test.ts`: auth 表单布局与 signed-out 边界 |
| `/account/signup` | `AccountAuthScreen (signup)` | screen | `.tmp/app-wide-style/after/task5/native-route-observations.json`: 注册表单；未提交 | `tests/app-wide-account.test.ts`: auth 表单、反馈 inset 与无写入 |
| `/account/forgot-password` | `AccountAuthScreen (forgot)` | screen | `.tmp/app-wide-style/after/task5/native-route-observations.json`: 明确不可用，未发邮件 | `tests/app-wide-account.test.ts`: forgot fail-closed 与返回登录 |
| `/account/permissions` | `AccountPermissionsScreen` | screen | `.tmp/app-wide-style/after/task5/native-route-observations.json`: 0 pending 空态；未申请权限 | `tests/app-wide-account.test.ts`: signed-out/空态/受控失败反馈 |
| `/settings` | `SettingsScreen` | screen | `.tmp/app-wide-style/after/task5/native-route-observations.json`: 三个可达目的地；`.tmp/app-wide-style/after/task5/native-state-observations.json`: 深色冷启动大字 | `tests/app-wide-primitives.test.ts`: 真实 Settings 宽度与目的地；`tests/app-wide-account.test.ts`: 导航 |
| `/settings/api` | `ApiSettingsScreen` | screen | `.tmp/app-wide-style/after/task5/native-route-observations.json`: 当前服务器与草稿控件；未保存/检查/重置 | `tests/app-wide-account.test.ts`: 服务器草稿与无配置写入 |
| `/admin` | `AdminScreen (dashboard)` | screen | `.tmp/app-wide-style/after/task5/native-route-observations.json`: 3 场活动、只读统计 | `tests/app-wide-account.test.ts`: 管理统计、导航和只读边界 |
| `/admin/access` | `AdminScreen (access)` | screen | `.tmp/app-wide-style/after/task5/native-route-observations.json`: 无可验证成员邮箱，未虚构成员成功态 | `tests/app-wide-account.test.ts`: access 空成员和反馈布局 |
| `/admin/events` | `AdminScreen (events)` | screen | `.tmp/app-wide-style/after/task5/native-route-observations.json`: 3 场实际记录 | `tests/app-wide-account.test.ts`: 活动管理统计与已有导航 |
| `/login-admin` | `AdminLoginScreen` | screen | `.tmp/app-wide-style/after/task5/native-route-observations.json`: 当前账号只读后台入口 | `tests/app-wide-account.test.ts`: 只读入口且不授予角色 |
| `/platform` | `PlatformScreen` | screen | `.tmp/app-wide-style/after/task5/native-route-observations.json`: 13 目录/1 公开活动；`.tmp/app-wide-style/after/task5/native-state-observations.json`: 深色冷启动大字 | `tests/app-wide-account.test.ts`: 公开活动、统计和大字完整性 |
| `/o/[slug]` | `OrganizerPublicScreen` | screen | `.tmp/app-wide-style/after/task3/native-route-observations.json`: success，实际 organizer 内容 | `tests/app-wide-events.test.ts`: 封面与目的地，无报名写入 |
| `/register` | `RegisterInviteScreen` | screen | `.tmp/app-wide-style/after/task3/native-route-observations.json`: empty-missing-code | `tests/app-wide-events.test.ts`: 邀请准备及空 code 边界 |
| `/register/[code]` | `RegisterInviteScreen` | screen | `.tmp/app-wide-style/after/task3/native-route-observations.json`: success，`event_signup_03` | `tests/app-wide-events.test.ts`: 受控邀请内容与无报名写入 |
| `/party` | `PartyModeScreen (overview)` | screen | `.tmp/app-wide-style/after/task3/native-route-observations.json`: NOT_FOUND | `tests/app-wide-events.test.ts`: 受控 overview 身份与只读状态 |
| `/party/checkin` | `PartyModeScreen (checkin)` | screen | `.tmp/app-wide-style/after/task3/native-route-observations.json`: NOT_FOUND | `tests/app-wide-events.test.ts`: 受控 checkin 身份、路由与只读到场状态 |
| `/party/graph` | `PartyModeScreen (graph)` | screen | `.tmp/app-wide-style/after/task3/native-route-observations.json`: NOT_FOUND | `tests/app-wide-events.test.ts`: 受控 graph 身份、路由与只读到场状态 |
| `/home/events` | `HomeScreen (events)` | screen | `.tmp/app-wide-style/after/task3/native-route-observations.json`: success，单一页面标题 | `tests/app-wide-events.test.ts`: 活动模式大字与目的地；真实 hub 模式另受控渲染 |
| `/dashboard` | `DashboardScreen` | screen | `.tmp/app-wide-style/after/task2/native-route-observations.json`: success，legacy dashboard | `tests/app-wide-contacts.test.ts`: legacy dashboard 动作与请求边界 |
| `/` | `IndexRoute → resolveInitialRouteHref` | redirect | `.tmp/app-wide-style/after/redirects/final-native-route-observations.json`: 实际到达 AI | `tests/initial-route.test.ts`: 默认目标及 resolver 契约 |
| `/home` | `HomeRoute → /ai` | redirect | `.tmp/app-wide-style/after/redirects/final-native-route-observations.json`: 实际到达 AI | `tests/home-route-source.test.ts`: 固定 AI redirect；`tests/initial-route.test.ts`: canonical 目标 |
| `/account/mobile-google` | `MobileGoogleRoute → /account/login` | redirect | `.tmp/app-wide-style/after/redirects/final-native-route-observations.json`: 到达深色冷启动大字登录表单，未发起 OAuth | `tests/account-auth-screen-source.test.ts`: login fallback；`tests/initial-route.test.ts`: canonical 目标 |
| `/[...legacy]` | `LegacyDeepLinkRoute → resolveInitialRouteHref` | redirect | `.tmp/app-wide-style/after/redirects/final-native-route-observations.json`: unsupported URL 实际到达 AI | `tests/initial-route.test.ts`: legacy/query/hash canonicalization 与 unsupported fallback |
<!-- route-coverage:end -->

计数来源相互独立：批准规格显式列出 58 项；测试从真实 `app/` 递归扫描并排除 `_layout`；README 表由测试再次解析。原生 observation 分布为 Task 2 主 JSON 9 项 + 独立 detail 1 项 + Task 3 17 项 + Task 4 14 项 + Task 5 13 项 + final redirects 4 项 = 58。

## 非路由状态与证据边界

- Task 4 的 `.tmp/app-wide-style/after/task4/native-state-observations.json` 记录 settled AI history、输入菜单、真实 AI/收件箱软件键盘、键盘滚动及只在本地 staging 的回复预览；预览文字已清除，没有保存或发送。
- Task 2 的 acquisition 软件键盘及通用 `AppScreen` 键盘滚动是 controller 查看过的原生证据；acquisition artifact 为 `.tmp/app-wide-style/after/task2/orbit-global-task2-acquisition-keyboard.png`，没有为它虚构 supplemental JSON。Task 5 的 auth/profile 只观察到输入聚焦和滚动，截图中没有软件键盘，因此不计为该页面族键盘通过；`orbit-task5-profile-large-dark-final.png` 是 LOADING ONLY，不是深色身份成功证据。
- Task 4 冷启动 `accessibility-medium` 记录日/周日历、drawer、conversation 的可读性。它不解决运行中改变字号后 glyph 变大但 frame 陈旧的问题；对应截图保存在 `.tmp/app-wide-style/open-issues/`，问题继续为 **OPEN**。
- `/contacts/graph` 的 routed consumer 是 `ContactsDashboardScreen`。未路由的 `ContactsGraphScreen`（含 evidence form）只有受控真实组件渲染和 GET/失败 POST 草稿证据，不是原生 route 证据。
- `HomeScreen` 的 events 模式有 `/home/events` 原生记录；未路由的 legacy hub 模式只有真实受控 render，不是另一条 live route。
- loading、empty、offline、failure、成功数据和 mutation 边界由各 `app-wide-*` 真实 consumer 测试及相邻交互测试补足。受控 HTTP/native fixture 没有触达真实 API；截图也不证明真实写入成功。

## 仍未闭合的全局标准

1. 实时 Runtime Dynamic Type 在 AI/联系人等 screen 上仍可出现文字与 native frame 不同步；冷启动大字通过不能替代 live change 验收，也没有用禁用缩放、强制 remount 或依赖升级掩盖。
2. Auth/profile 软件键盘未证明；仅有 focus/scroll。已经确认的软件键盘范围是 AI、inbox，以及 Task 2 的通用 `AppScreen` contact/acquisition 路径。
3. 当前账号下的结构详情、chat detail、活动报名/参会/party 等实际为 NOT_FOUND，部分运营页为 permission-denied，permissions 为 0 pending，forgot-password 明确不可用，admin access 无可验证成员邮箱。这些是实际边界，不是对应业务成功验收；成功/失败内容只在受控真实 consumer 中验证。
4. 没有执行消息发送、保存档案/服务器、完成待办、报名、签到、角色/权限修改、密码重置、登录/注销或其他业务写入。也未声明完整 VoiceOver 手势、iPad/Android、所有字号与键盘组合通过。
5. Legacy/startup resolver 对部分直接 Expo Router 可达的动态路由仍有迁移前缺口；本次视觉迁移没有修改兼容策略。
6. 最终完整测试、类型检查、diff scope 和 whole-app 独立审查仍由 controller 收尾；最新 927/927 聚合结果早于 Task 5 feedback-radius 修补及本 Task 6 文档/测试，不作为最终整体验证。

## App-side Bridge handoff

- App 版本：当前 HEAD `a7f42c78a7e3ad98293432f0ad16c92936e40136` 上的本地未提交 UI delta；外部 private-notes integration 保持原样，没有归入本迁移。
- 另一端影响：本 UI 任务没有修改 API、contract、backend 或 state-sync 行为；未验证跨客户端写入对齐，不能标记业务对齐完成。
- 未完成：原生 live Dynamic Type 仍开放；auth/profile 软件键盘仍未证明；最终全量回归与整体审查待 controller 记录。
- 验证范围：App 路由与受控 consumer 证据如上；未修改根目录 `bridge/status.md`、`bridge/handoffs.md` 或其他 Bridge 台账。

## 本地交付状态

证据和截图保留在忽略的 `.tmp/` 目录，不提交、不推送、不发布。本文是可追溯的覆盖/限制记录，不是 whole-app convergence 声明。

---

## 2026-09-09 23:07 — Controller 最终验证更新

本节取代上方“最终测试待执行”的阶段性状态，保留历史原文。全 App UI 改造已覆盖上述入口；整体验收仍为 **INCOMPLETE**，不能因自动化测试通过而关闭原生字号问题。

- 最后修补：9 个生产文件中 28 个可达表单、反馈和对话内嵌面，从 14pt 圆角统一到批准的 12pt；逐行比较确认只有这 28 处 token 替换，没有 JSX、handler、文案或全局 token 改动。未使用的 dashboard `PriorityCard.callout` 不在修补范围。
- 先用 20 个浅/深色真实 consumer 用例观察到实际 14px 与预期 12px 的失败，再修补转绿；覆盖全部 28 个面，包括受控的资料待保存提示、persona、现场记录反馈、聊天草稿、收件箱润色/预览和 AI 依据结果。成功路径仅使用测试边界，不调用真实业务写入。
- 最终生产/测试冻结后，controller 执行 `npm test`：**961 passed，0 failed/cancelled/skipped/todo**，25.610 秒；`npm run typecheck && git diff --check` 退出 0。日志 `/tmp/orbit-app-final-verified-20260909.log`；第 909 行仍有原有负向会话过期测试故意产生的 `boom`，不是断言失败，未被静默删除。
- Task 6 独立复审确认重复路由检测及原生补充证据引用两项缺口已修复。全量独立审查已完成，最后圆角修补的单次限定复审结果另附；原生 live Dynamic Type 仍为 Important / OPEN。
- 新原生抽查：`.tmp/app-wide-style/after/final-insets/native-observations.json` 与两张 `orbit-final-inset-admin-access*.png`。controller 实际查看最终访问管理提示的浅色、运行中切深色截图，文字和图标完整。只抽查 1 个改动面、2 种外观；全部 28 个面的精确圆角由真实组件渲染测试证明。此前 58 入口截图是路由/状态证据，不能说成最后圆角修补后的全部像素证据。
- 工作版本仍为 `a7f42c78a7e3ad98293432f0ad16c92936e40136` 上的本地修改；保留已有其他工作。未提交、推送、发布，未修改 backend、契约、鉴权、权限、真实业务数据或 Bridge 台账。

### 未解决项与验证限制

必须继续解决的是运行中切换系统字号：AI/联系人原生截图存在字形增大而布局 frame 未更新的裁切。冷启动大字可读不是同一验收。React Native 0.86 的[上游问题 #57512](https://github.com/react/react-native/issues/57512)描述相同现象；已读本地原生字号通知与布局缓存代码，存在吻合的失效链路假设，但尚无运行时追踪证明本项目根因。没有升级依赖、修改原生框架、强制 remount 或禁用字号缩放。下一步需单独的原生最小复现/插桩诊断；框架补丁或升级不属于本轮已批准的纯 UI 修补。

Auth/profile 软件键盘仍是 **UNPROVEN**，不是已证明的键盘缺陷；已确认路径是 AI、inbox 和 contact/acquisition。NOT_FOUND、权限提示和空态仍不能冒充业务成功。完整 VoiceOver、其他设备/平台及所有字号键盘组合未验证。

低优先级事项如实保留：四个页面的重复内容标题、workspace 图标替身缺尺寸、旧聊天失败用例仅计请求数量、非空 admin 成员换行未覆盖、预期负向测试日志。新成功草稿用例已核对精确 endpoint/method/body，但不把旧失败用例自动算作已加强。新增测试字符串中的 `insetData` 首次影响查询晚于其初次添加，返回 UNKNOWN；所有生产样式入口的影响查询先于编辑。该流程偏差不能追补成“事前已查询”。

### 23:12 独立限定复审结论

最后一次独立复审确认：28/28 可达 inset 的圆角缺口 **ADDRESSED**，未发现修补引入的新 Critical/Important/Minor 问题；上述五个低优先级事项仍保留。运行中字号变化 **NOT ADDRESSED / OPEN**，因此整体仍未收敛。复审核对了失败/通过日志与实际差异，未重复执行整套测试。

最终处置：保留已验证的本地 UI 修改及全部证据，不发起第二轮扩大修补、不提交或发布。字号问题需要转入单独的原生框架诊断范围；低优先级事项没有被隐藏为通过。App-side handoff 的版本及另一端影响不变，最终自动化/独立审查已记录，不再是“待执行”。

### 执行中的范围判断（按发生顺序）

1. 将 `HomeScreen` 的未路由 hub 模式纳入该文件的 UI 改造，并补直接渲染测试：同一文件归该批所有，业务行为保留。判断错误的代价是一个旧模式得到不需要的可逆样式改动。
2. 在 Task 6 文档复审期间并行进行只读整体审查，修补差异随后补交，所有验收门禁保持：没有并行生产写入。判断错误的代价是复查一小段文档/测试差异。
3. 从最终圆角清单排除未使用的 `PriorityCard.callout`：代码引用及独立复查均未找到运行入口，没有为测试导出死代码。判断错误的代价是一个实际可达的角落仍为 14pt；目前没有该可达路径的证据。
