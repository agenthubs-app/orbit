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

## 现有真实 render/interaction 证据

以下只列真实 React screen/content render 或 RN Web/Playwright interaction；source/view-model tests 未计为视觉成功。

| 页面族 | success | empty/loading/offline/failure | 仍缺 |
| --- | --- | --- | --- |
| AI home `/ai` | `ai-home-guidance-render.test.tsx` 多种成功内容；真实 `AiScreen` | Today 的 empty/loading/failure/offline 只验证问题建议 fallback | AI conversation API 本身的 top-level state、drawer/history/menu、320pt/大字；该测试当前为工作区未跟踪文件，不能当已提交基线 |
| AI detail `/ai/[id]` | `ai-reading-canvas-render.test.tsx` 真实 `AiConversationScreen`，浅/深色、消息和 record links | 只测空 composer；resource 始终 success | loading/empty/offline/failure、`source=session`、`id=new`、键盘/窄屏 |
| Agent/ledger | `agent-ledger-screen-render.test.tsx` 仅 `AgentLedgerContent` success | 无 | `/agent` 和 `/contacts/all-actions` 完整 screen；empty/loading/error/交互/窄屏 |
| Contacts list/detail | `contacts-redesign-interactions.test.ts` 真实 screens：搜索、过滤、详情、编辑展开、320pt | list/detail offline 返回；mutation failure 保留草稿 | top-level loading/empty/failure；深色/大字；当前测试为工作区未跟踪文件 |
| Contact acquisition | `business-card-review-interactions.test.ts` 真实 screen，扫码审阅/确认流程 | 业务风险/失败分支，非统一 resource states | loading/offline/empty、320pt/大字、其它采集模式视觉 |
| Contact pipeline | `contact-pipeline-render.test.tsx` 真实 screen success | 无 | empty/loading/offline/failure、交互、窄屏 |
| Contact dashboard/analysis | `analysis-pie-orbit-chart-render.test.tsx` 仅 chart component success/selection/wrapping | 无完整 screen state | `/contacts/dashboard`、graph alias、structure detail、intros 全屏；四维 success + empty/error；窄屏/大字 |
| Event operations contents | admission、center、check-in、roles content：success + empty + failure；operations content：success + failure；analytics content：success | 见左列 | 都不是 route wrapper；operations 缺 empty；analytics 缺 empty/error；role/permission、320pt/大字、实际参数/API wiring |
| Event discovery/detail flows | 无真实 screen render | 无 | `/events`、detail、register、attendees、party 3 variants、public organizer、invite、home/events 全部状态 |
| Inbox | `relationship-inbox-interactions.test.ts` 真实 list/thread、搜索、草稿、提醒、隐私、pending | loading/offline/failure；空 body history | 真正 empty inbox/thread-not-found、深色/大字、320pt；当前测试为工作区未跟踪文件 |
| Relationship chat | 无 | 无 | `/chat`、`/chat/[id]` success/empty/loading/offline/failure、composer/keyboard/窄屏 |
| Tasks | `task-detail-interactions.test.ts` 真实 detail screen，多轮保存/刷新/权限/并发 | mutation failure/throw；resource 恒 success | `/tasks` 列表所有状态；detail top-level loading/empty/offline/failure；窄屏/深色/大字 |
| Today | `orbit-next-actions-screen-render.test.tsx` 仅子组件 success | 子组件 loading/empty/error + refresh failure | 完整 `/today` screen、交互、窄屏/主题 |
| Schedule/followups | 无真实完整 screen render | 无 | `/schedule` calendar 日/周/月、event preview、`/followups` 全状态和交互 |
| Account/settings/admin/platform/profile | 无已提交完整 screen render；generic `theme-render.test.tsx` 仅 shared state/cards | generic Empty/Loading/Error 两主题 | 所有完整页面；auth 输入错误保留、settings navigation、permissions、admin role states、320pt/大字。`app-wide-primitives.test.ts` 正在工作区生成，不计既有基线 |
| Redirect/legacy | `initial-route.test.ts`、`mobile-route-access.test.ts` 是纯函数/source 证据 | unsupported 回退有单测 | 原生 redirect loop、catch-all URL/query/hash 的实机可达性 |

## 建议的只读全路由 QA 顺序

1. 先跑 4 个 redirect/legacy 入口，确认不会循环且 query/hash 保留。
2. 用静态/无写页面铺开全局视觉：AI home、contacts overview/list、events、schedule、profile、settings、account/admin/platform。
3. 用上表 ID 检查 dynamic read states：contact、AI、chat、inbox、event detail/schedule/org/invite。
4. 运营、报名、party、任务编辑只读观察；任何会触发 PATCH/POST/DELETE/报名/签到/角色变更的按钮均不执行。成功内容改由受控 render fixture 覆盖。
5. 最后专门补目前最高风险的视觉空洞：无 render 的 chat/schedule/events discovery/account-admin families；`/contacts/graph` alias；structure-detail mock NOT_FOUND；legacy resolver 遗漏的新路由；所有 320pt + 大字 + error state。
