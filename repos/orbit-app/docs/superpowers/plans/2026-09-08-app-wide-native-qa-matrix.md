# Orbit App 全路由原生 QA 矩阵（只读审计）

日期：2026-09-08  
范围：`repos/orbit-app` 的 58 个 `.tsx` 路由入口（不含 `_layout.tsx`）。本文只记录路由、现有测试证据和仓库内 fixture/test ID；不代表已完成模拟器验收，也不授权业务写操作。

## 使用规则

- 每个路由逐项记录原生可达性、实际显示状态和版式。按页面族补齐浅/深色、正常/大字、加载/空/离线/失败/成功、返回、键盘与弹层/编辑态；320pt 使用真实页面的受控渲染检查，不冒充当前 402pt 模拟器的测量结果。
- 动态页优先使用下文“仓库内可控 ID”。这些 ID 来自 fixture 或测试，不是凭证。标为“仅测试边界”的值只适合受控 render/Playwright stub，不能当作 live 数据存在性证明。
- 活动运营页即使共用同一个 event ID，也仍可能因当前 actor/role 呈现权限态；权限态不能替代成功内容验收。
- 现有 `route-parity.test.ts` 只证明路由文件存在；源码断言和 view-model 单测也不等于真实页面渲染。

## 58 个入口到 canonical screen 的映射

### AI（3）

| 路由 | canonical export | 参数/备注 |
| --- | --- | --- |
| `/ai` | `AiScreen` | 可选 `drawer=1`；private |
| `/ai/[id]` | `AiConversationScreen` | 必需 `id`；可选 `initialMessage`、`source=session`；`id=new` + `initialMessage` 是新会话草稿分支；private |
| `/agent` | `AgentActionsScreen` | 无路由参数；private |

### 人脉（10）

| 路由 | canonical export | 参数/备注 |
| --- | --- | --- |
| `/contacts` | `ContactsScreen` | 默认 overview；private |
| `/contacts/list` | `ContactsScreen` via `ContactsListRoute` | 固定 `mode=list`；可选 `q/query/source/status/tag/value/refreshToken`；失焦时返回 `null`；private |
| `/contacts/[id]` | `ContactDetailScreen` | 必需 `id`；private |
| `/contacts/new` | `ContactAcquisitionScreen` | 可选 `eventId`；private |
| `/contacts/dashboard` | `ContactsDashboardScreen` | 无路由参数；private |
| `/contacts/graph` | **`ContactsDashboardScreen`** | 与 dashboard 完全同一 export；仓库中的 `ContactsGraphScreen` 没有路由绑定；private |
| `/contacts/pipeline` | `ContactPipelineScreen` | 无路由参数；private |
| `/contacts/intros` | `ContactIntrosScreen` | 无路由参数；private |
| `/contacts/analysis/[dimension]/[bucketId]` | `ContactStructureDetailScreen` | 必需 `dimension`、`bucketId`；private |
| `/contacts/all-actions` | `AllActionsAgentLedgerScreen` | 无路由参数；private |

### 活动（10）

| 路由 | canonical export | 参数/备注 |
| --- | --- | --- |
| `/events` | `EventsScreen` | public |
| `/events/[id]` | `EventDetailScreen` | 必需 `id`；public |
| `/events/[id]/register` | `EventRegistrationScreen` | 必需 `id`；private |
| `/events/[id]/attendees` | `EventAttendeesScreen` | 必需 `id`；private |
| `/events/center` | `EventCenterScreen` | 无路由参数；private |
| `/events/[id]/operations` | `EventOperationsScreen` | 必需 `id`；private/role-sensitive |
| `/events/[id]/operations/admission` | `EventAdmissionReviewScreen` | 必需 `id`；可选 `view=processed`，否则 pending；private/role-sensitive |
| `/events/[id]/operations/check-in` | `EventCheckInScreen` | 必需 `id`；private/role-sensitive |
| `/events/[id]/operations/roles` | `EventRolesScreen` | 必需 `id`；private/role-sensitive |
| `/events/[id]/analytics` | `EventAnalyticsScreen` | 必需 `id`；private/role-sensitive |

### 消息（4）

| 路由 | canonical export | 参数/备注 |
| --- | --- | --- |
| `/inbox` | `RelationshipInboxScreen` | 可选新草稿 seed：`contactId/participantName/organization`；private |
| `/inbox/[id]` | `RelationshipInboxThreadScreen` | 必需 `id`（conversation ID）；private |
| `/chat` | `RelationshipChatScreen` | 无路由参数；private |
| `/chat/[id]` | `RelationshipChatDetailScreen` | 必需 `id`（conversation ID）；private |

### 日程与任务（6）

| 路由 | canonical export | 参数/备注 |
| --- | --- | --- |
| `/schedule` | `ScheduleScreen` | 无路由参数；private |
| `/schedule/events/[id]` | `ScheduleEventPreviewScreen` | 必需 `id`（event ID）；private |
| `/today` | `TodayScreen` | 无路由参数；private |
| `/tasks` | `TasksScreen` | 可选 `view=completed`，其余值回到 open；private |
| `/tasks/[id]` | `TaskDetailScreen` | 必需 `id`；private |
| `/followups` | `FollowupsScreen` | 无路由参数；private |

### 账号与设置（8）

| 路由 | canonical export | 参数/备注 |
| --- | --- | --- |
| `/profile` | `ProfileScreen` | private |
| `/account` | `AccountScreen` | public shell |
| `/account/login` | `AccountAuthScreen mode=login` | 可选 `email/next/created=1` |
| `/account/signup` | `AccountAuthScreen mode=signup` | 可选 `email/next/created=1` |
| `/account/forgot-password` | `AccountAuthScreen mode=forgot` | 可选 `email/next/created=1` |
| `/account/permissions` | `AccountPermissionsScreen` | public |
| `/settings` | `SettingsScreen` | private |
| `/settings/api` | `ApiSettingsScreen` | private |

### 运营与其他（13）

| 路由 | canonical export | 参数/备注 |
| --- | --- | --- |
| `/admin` | `AdminScreen surface=dashboard` | private |
| `/admin/access` | `AdminScreen surface=access` | public entry |
| `/admin/events` | `AdminScreen surface=events` | private |
| `/login-admin` | `AdminLoginScreen` | public entry |
| `/platform` | `PlatformScreen` | private |
| `/o/[slug]` | `OrganizerPublicScreen` | 必需 `slug`；native 实现用 event `id/code` 匹配并按 organizer 分组；public |
| `/register` | `RegisterInviteScreen` | 无 `code` 时是“尚未选择活动”空态；public |
| `/register/[code]` | `RegisterInviteScreen` | 必需 `code`，当前直接作为 public event ID 请求；public |
| `/party` | `PartyModeScreen variant=overview` | 内容需要 query `eventId` 或 `code`；private |
| `/party/checkin` | `PartyModeScreen variant=checkin` | 内容需要 query `eventId` 或 `code`；private |
| `/party/graph` | `PartyModeScreen variant=graph` | 内容需要 query `eventId` 或 `code`；private |
| `/home/events` | `HomeScreen mode=events` | private |
| `/dashboard` | `DashboardScreen` | private |

### 跳转兼容（4）

| 路由 | 行为 |
| --- | --- |
| `/` | `IndexRoute` → `resolveInitialRouteHref()`，默认 `/ai` |
| `/home` | private wrapper 后固定 redirect `/ai` |
| `/account/mobile-google` | 固定 redirect `/account/login` |
| `/[...legacy]` | 保留 query，交给 `resolveInitialRouteHref(configuredRoute)`；不支持的路径回退 `/ai` |

计数：3 + 10 + 10 + 4 + 6 + 8 + 13 + 4 = **58**。

## Legacy/alias 规则与缺口

已覆盖的 canonicalization：

- 去掉首段 `/app`；`/app/events` → `/events`。
- `/explore` → `/events`。
- `/home/cards` → `/contacts/list`；`/home/cards/scan` → `/contacts/new`；`/home/cards/:id` → `/contacts/:id`。
- `/home/schedule` → `/followups`；`/home/profile` → `/profile`。
- `/register?code=event_signup_03` → `/register/event_signup_03`。
- `/contacts` 带 `q/query/source/status/tag/value` 时 → `/contacts/list` 并保留 query。
- `/home` 和无效/未知 startup route → `/ai`；query/hash 在已支持路由上保留。

高优先级兼容缺口：

- `resolveInitialRouteHref` 当前不接受 `/tasks`、`/tasks/[id]`、`/inbox/[id]`、`/contacts/analysis/...`、`/events/[id]/analytics`、`/events/[id]/operations...`。这些路由可由 Expo Router 直接打开，但从 legacy catch-all/startup 配置进入会回退 `/ai`。
- legacy 动态 ID 正则只允许 `[A-Za-z0-9_-]+`；含 `:` 或 `/` 的 fixture ID 即使直接 Expo URL 可编码打开，也不能经 startup resolver 进入。
- `/contacts/graph` 实际与 `/contacts/dashboard` 同屏；需产品/QA 明确这是否是刻意 alias，不能把未路由的 `ContactsGraphScreen` 当成已验收。

## 仓库内可控动态 ID

| 页面族 | 首选 ID / 路由 | 来源和限制 |
| --- | --- | --- |
| 联系人详情 | `/contacts/demo-contact-1` | 后端 `features/contacts/detail-fixtures.ts` 的 `mockContactDetail.id`；mock fixture。列表 fixture 还含 `contact:kenji-watanabe` 等，但 detail mock 的稳定首选是 `demo-contact-1`。 |
| 联系人 native harness | `/contacts/contact%3A0` | `contacts-redesign-interactions.test.ts`；**仅测试边界**。startup resolver 不接受冒号 ID。 |
| 联系人 startup 示例 | `/contacts/contact_029` | `initial-route.test.ts` 明确作为 simulator-review route；只证明 resolver，不证明当前数据账号存在该记录。 |
| 结构详情 | `/contacts/analysis/location/tokyo` | `contact-structure-detail-view-model.test.ts` 的 success payload；**仅 view-model/test fixture**。后端 mock distribution 的 `getStructureDetail()` 当前固定 NOT_FOUND，因此不能把 mock server 当成功态。分布 fixture 的真实 bucket 示例为 `industry:climate-infrastructure`（URL 需编码），但同样没有 mock detail success。 |
| 任务详情 | `/tasks/task%3Aedit` | `task-detail-interactions.test.ts` 的完整 screen fixture；**仅测试边界**。`task_mina_intro_draft` 存在于 shared mock graph，但 `/api/tasks` 是 actor-scoped task store，不能假定该 ID 在 simulator session 可读。 |
| AI 对话 mock | `/ai/demo-orbit-agent-conversation-1` | 后端 `features/orbit-ai/mock-conversation-service.ts` 默认 conversation fixture。 |
| AI native render | `/ai/reading-test` | `ai-reading-canvas-render.test.tsx`；**仅测试边界**。`live-orbit-agent-conversation` 还出现在 AI home/initial-route tests。 |
| Relationship chat | `/chat/demo-conversation-1` | 后端 `features/chat/fixtures.ts`，且 `initial-route.test.ts` 使用同一 ID。 |
| Relationship inbox | `/inbox/conversation_demo_aoba` | 后端 async correspondence fixture `features/chat/mock-service.ts`。native interaction harness 的 `thread:wei` 仅测试边界。 |
| Event/detail/register/attendees/schedule/org/invite | `event_signup_03` | `initial-route.test.ts` 同时覆盖 detail、attendees、register、schedule preview、`/o/event_signup_03`、`/register/event_signup_03`；也在 event canonical/organizer fixture manifest 中。它是测试 event ID，不是秘密邀请码。 |
| 通用 event mock | `demo-event-1` | `features/events/event-crud-and-import/fixtures.ts`；多项 attendee/post-event fixture 也复用它。 |
| Event operations | `event_signup_01` | `EVENT_OPERATIONS_E2E_EVENT_ID`；只说明种子目标。成功仍取决于当前 actor 具备 owner/role 数据，未满足时只能验权限态。 |
| Party variants | `/party?eventId=event_signup_03`（checkin/graph 同 query） | `initial-route.test.ts` 验证 query 保留；若需完全 mock 的 event/attendee 数据，可改用 `demo-event-1`，但仍需受控服务状态。 |

## 当前真实 render/interaction 证据（更新至 2026-09-14）

2026-09-08 初版后的新增测试已经纳入当前功能基线；这里按当前仓库重列，不再把后来已跟踪的文件或已存在的完整 screen render 写成缺项。以下只计真实 React screen/content render 或 RN Web/Playwright interaction；source/view-model tests 不计视觉成功，Sprint 0002 也没有重跑这些套件。

| 页面族 | 当前受控 render／interaction | 当前仍缺；不重复建设已有测试 |
| --- | --- | --- |
| AI 与 Agent | `ink-signal-ai-home.test.ts`、`ink-signal-ai-conversation.test.ts` 和 `app-wide-workspaces.test.ts` 已覆盖真实 home/detail、新会话与 session 分支、失败恢复、窄屏／大字／深色以及 Agent actions/ledger 的受控状态。较早的 `ai-home-guidance-render.test.tsx` 也已跟踪。 | B3 的服务端幂等／未知结果和 Web 双向恢复不是 render 缺口；设备层仍缺完整 drawer／系统返回／深链矩阵。 |
| 人脉、分析与采集 | `app-wide-contacts.test.ts`、`ink-signal-contacts.test.ts`、`ink-signal-contact-detail.test.ts`、`contacts-redesign-interactions.test.ts` 及 business-card suites 已覆盖 overview/list/detail、acquisition、dashboard、pipeline、structure、intros、graph、窄屏／主题和受控相机权限；后者已跟踪。 | 实体相机、双面同卡、真实 OCR／上传／一次创建及跨端回读仍缺；`/contacts/graph` 路由仍绑定 dashboard 而非测试中单独可渲染的 `ContactsGraphScreen`。 |
| 活动与运营 | `ink-signal-events.test.ts`、`ink-signal-event-detail.test.ts`、`event-registration-interactions.test.ts`、`app-wide-events.test.ts` 与 operations render suites 已覆盖 catalogue/detail/register/attendees/center/party/organizer/invite、运营内容、状态、320pt／大字／主题。 | 问卷 500、真实角色／非空对象、报名／取消／运营写入及原生 58 路由导航仍缺；受控 RNW 不能证明实际 actor 权限或系统回跳。 |
| 收件箱与聊天 | `ink-signal-inbox.test.ts`、`relationship-inbox-interactions.test.ts`、`relationship-chat-draft-interactions.test.ts` 和 `app-wide-workspaces.test.ts` 已覆盖真实 inbox list/thread、chat list/detail、草稿、刷新／失败、窄屏与主题；inbox suite 已跟踪。 | B4 真实身份绑定／投递、持续前台状态、真实已读、有效通知目标、实体推送及跨端回读仍缺。 |
| 今日、任务、日程与跟进 | `ink-signal-tasks.test.ts`、`task-detail-interactions.test.ts`、`task-date-interactions.test.ts`、`ink-signal-schedule.test.ts`、`ink-signal-followups.test.ts` 和 `app-wide-workspaces.test.ts` 已覆盖完整 Tasks/Today/Schedule/preview/Followups screens、日周月、错误、草稿、320pt／大字／主题。 | B6 个人日程／地点／清空／提醒协议、授权真实写回，以及 0009 的时区／DST／全天／草稿决策仍缺；不是补已有 screen render。 |
| 账号、资料、设置、Admin 与 Platform | `ink-signal-auth.test.ts`、`ink-signal-profile.test.ts`、`ink-signal-settings-account.test.ts` 和 `app-wide-account.test.ts` 已覆盖真实 auth/profile/account/settings/API settings/permissions/admin/admin login/platform screens 的受控状态、错误、导航、320pt／大字／主题。`app-wide-primitives.test.ts` 也已跟踪，但只作为补充。 | Google 系统回跳、真实角色／账号切换、B1/D2 资料完成语义与写回仍缺；设备导航和 VoiceOver 另列。 |
| Redirect／legacy | `initial-route.test.ts`、`mobile-route-access.test.ts` 仍是纯函数／source 证据，unsupported 回退有单测。 | 原生冷启动 redirect loop、catch-all URL/query/hash、登录系统回跳、通知直达及无历史返回仍未形成同版本设备矩阵。 |

## 最小设备与导航矩阵（2026-09-14 增量）

下表只登记现有证据和真实缺测；不同运行层不能互相替代。Sprint 0002 没有重跑其中任何一项，也没有把“待执行”填成通过。

| 运行层／设备 | 现有证据 | 仍需执行的最小导航场景 | 执行前置 |
| --- | --- | --- | --- |
| RN Web／受控 Playwright | 上表当前 suites 已对六大页面族提供广泛的真实 screen/content interaction；Sprint 0001 报告还记录 `/events` 受控路由 render。它证明对应 React 状态和交互，不证明原生 router、手势、系统回跳或设备权限。 | 不再安排重建 chat、schedule/followups、event detail/register、profile/settings 等已有 render。仅在某个后续实现实际改变对应页面且现有 suite 缺直接状态时补局部回归；设备导航缺口交给下列独立层。 | 可控 fixture、固定 viewport/theme/font scale；禁止把业务服务数据或写操作混入视觉夹具。 |
| iOS Simulator | 既有连通性记录已在 iPhone 17 Pro / iOS 26.4 对 AI 新会话／生成与重开、资料、任务日期、首页／IORBIT／收件箱前后台恢复等做过局部原生检查；Sprint 0001 对 `/events` 记录 13→上海 3→清空 13。 | 冷启动 `/`、`/home` 和未知 legacy 回退；底部根页与 IORBIT 往返；每类动态深链成功／无权限／不存在；登录成功与取消回跳；通知目标直达；模态、键盘、系统返回、浅深色和运行中字号切换。现有局部页面不能算 58 路由总矩阵。 | 冻结 App/API 版本与账号；为动态页准备脱敏有效 ID 和权限角色；只读轮禁止点击会写入的按钮。 |
| 实体 iPhone：相机／相册 | 无实体相机证据；现有名片审阅只是受控 RNW，连通性记录也明确双面 OCR、上传和一次创建未执行。 | 首次拒绝、稍后授权、相机取消、相册选择、正反面替换、单面／双面／重复卡、上传中断与恢复；最终一次确认只创建一个联系人，并做两端回读。 | B5 契约、已初始化且授权的 OCR 环境、隔离图片／联系人、相机与相册权限、迁移／上传／OCR／联系人写入批准；费用沿用原总账本。 |
| 实体 iPhone：通知／推送 | Simulator 仅覆盖列表、角标、后台返回和受控动作语义；没有实体 token、系统通知到达或点击启动证据。 | 拒绝→授权、token 注册／轮换／解绑、前台／后台／终止态到达、冷启动点击目标、无效／无权限／已删除目标、安全回退、已读／忽略后 Web/App 回读。 | B4 与消息／投递契约、可读取的 vault 配置、有效投递和准确目标、双用户与实体设备；注册、解绑、动作写入和真实推送分别授权。 |
| Android 实体机或受支持 Emulator | 无 Android 运行证据。 | 冷启动与根页、tab／drawer 往返、硬件/系统 back 的 detail→list→root 顺序、深链与登录回跳、模态／键盘 back、通知点击和无效目标回退；再抽查 320dp 与大字。 | 明确受支持 Android 版本和构建；冻结同版本服务与账号；准备有效动态 ID／通知样本。若产品不支持 Android，应由批准规格移除，而不是记作通过。 |
| iOS VoiceOver（实体机优先） | 无 VoiceOver 走查证据；测试中的 accessibility 属性断言不等于读屏顺序和手势。 | 冷启动、底部导航、IORBIT 打开／关闭、列表→详情→返回、表单错误、弹层焦点圈闭／恢复、动态内容更新提示、通知直达；核对名称／角色／状态／顺序和大字组合。 | 批准辅助功能走查范围；准备非空动态页和不触发写入的账号／样本；需要修原生补丁时另行审批。 |

最小判定单位是“设备／版本 + App/API 版本 + 账号角色 + 路由／样本 + 结果”。缺任一项时只登记未测或受阻；RNW 通过不能填入 Simulator、实体 iPhone、Android 或 VoiceOver 栏。

## 建议的只读全路由 QA 顺序

1. 先跑 4 个 redirect/legacy 入口，确认不会循环且 query/hash 保留。
2. 用静态/无写页面铺开全局视觉：AI home、contacts overview/list、events、schedule、profile、settings、account/admin/platform。
3. 用上表 ID 检查 dynamic read states：contact、AI、chat、inbox、event detail/schedule/org/invite。
4. 运营、报名、party、任务编辑只读观察；任何会触发 PATCH/POST/DELETE/报名/签到/角色变更的按钮均不执行。成功内容改由受控 render fixture 覆盖。
5. 最后专门补目前最高风险的视觉空洞：无 render 的 chat/schedule/events discovery/account-admin families；`/contacts/graph` alias；structure-detail mock NOT_FOUND；legacy resolver 遗漏的新路由；所有 320pt + 大字 + error state。
