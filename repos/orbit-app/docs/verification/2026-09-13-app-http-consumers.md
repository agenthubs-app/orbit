# R-01：App 路由与 HTTP 消费点源码盘点

状态：源码盘点检查点；不是连通性通过报告。R-01 整项仍开放。

采集：2026-09-13 09:16–09:21 JST；源码 HEAD `f194d7b3cdfe3dd39f4c20a67656613bc1749ca2`，生产代码与 `1efc95508` 相同。关联[执行记录](2026-09-13-app-connectivity.md)及[剩余计划](../superpowers/plans/2026-09-13-app-remaining-functionality-and-connectivity.md)。

## 1. 范围、计数与限制

- 使用 TypeScript AST／类型信息扫描 `app/` 与 `src/` 的 263 个 TS/TSX 文件。66 个 `app/` 文件含 2 个 layout，不称为 66 个业务页面。
- 下表保留 204 处匹配：90 个资源 hook 调用、102 个 client 调用、10 个 fetch／转发点、2 个鉴权派发调用。它们不是 204 个独立 API；底层转发和上层消费者会重复指向同一请求。
- 类型筛选排除了 `inFlightGetsByFetch.get` 这一 Map 读取；另显式纳入 `client[method]`。再用源码核对了 6 个收件箱回调及 2 个 import client 别名调用，列在动态补充表中，不重复计入 204。
- 补查未发现 App 源码另有 axios、XMLHttpRequest、EventSource、WebSocket 或 HEAD/OPTIONS 请求实现。这不包括依赖包内部通信、原生图片加载、OAuth 系统浏览器或 Expo 推送服务。
- 固定端点常量展开成字符串；路径 helper 保留名称及实参，定义见 [endpoints.ts](../../src/api/endpoints.ts)。动态变量的业务目标见第 3 节。没有把尚未调用的端点常量全算作已接入功能。
- 源码盘点覆盖当前匹配规则与人工补查，不构成无遗漏的数学证明。动态参数、服务端实际角色／能力、已加载 API 版本、非空样本、响应协议与副作用须继续逐场景核对；没有因此勾选 R-01 的完整验收。
- 统一环境：当前 Simulator 设置是 `http://localhost:3000`；这只关联到已采集设备，不证明每个路由已运行，也不证明实体机可访问。后续记录须重新绑定实际 App/API 版本、账号与对象。

## 2. 实际路由文件与 Screen 绑定

下面列的是直接 import／重定向的静态事实，不是已登录、具备权限或按钮可用的证明。根级访问边界可能另加约束；入口名含 admin 不能代替服务端角色验证。

| 路由文件 | 直接 Screen 绑定／特殊入口 |
| --- | --- |
| [app/(app)/_layout.tsx](<../../app/(app)/_layout.tsx>) | 布局／Provider／导航边界 |
| [app/(app)/ai.tsx](<../../app/(app)/ai.tsx>) | AiScreen |
| [app/(app)/contacts.tsx](<../../app/(app)/contacts.tsx>) | ContactsScreen |
| [app/(app)/events.tsx](<../../app/(app)/events.tsx>) | EventsScreen |
| [app/(app)/inbox.tsx](<../../app/(app)/inbox.tsx>) | RelationshipInboxScreen |
| [app/(app)/profile.tsx](<../../app/(app)/profile.tsx>) | ProfileScreen |
| [app/(app)/schedule.tsx](<../../app/(app)/schedule.tsx>) | ScheduleScreen |
| [app/[...legacy].tsx](<../../app/[...legacy].tsx>) | href={resolveInitialRouteHref(configuredRoute) as Href} |
| [app/_layout.tsx](<../../app/_layout.tsx>) | 布局／Provider／导航边界 |
| [app/account.tsx](<../../app/account.tsx>) | AccountScreen |
| [app/account/forgot-password.tsx](<../../app/account/forgot-password.tsx>) | AccountAuthScreen |
| [app/account/login.tsx](<../../app/account/login.tsx>) | AccountAuthScreen |
| [app/account/mobile-google.tsx](<../../app/account/mobile-google.tsx>) | href="/account/login" |
| [app/account/permissions.tsx](<../../app/account/permissions.tsx>) | AccountPermissionsScreen |
| [app/account/reset-password.tsx](<../../app/account/reset-password.tsx>) | PasswordResetScreen |
| [app/account/signup.tsx](<../../app/account/signup.tsx>) | AccountAuthScreen |
| [app/admin.tsx](<../../app/admin.tsx>) | AdminScreen |
| [app/admin/access.tsx](<../../app/admin/access.tsx>) | AdminScreen |
| [app/admin/events.tsx](<../../app/admin/events.tsx>) | AdminScreen |
| [app/agent.tsx](<../../app/agent.tsx>) | AgentActionsScreen |
| [app/ai/[id].tsx](<../../app/ai/[id].tsx>) | AiConversationScreen, type AiConversationJournal |
| [app/chat.tsx](<../../app/chat.tsx>) | RelationshipChatScreen |
| [app/chat/[id].tsx](<../../app/chat/[id].tsx>) | RelationshipChatDetailScreen |
| [app/contacts/[id].tsx](<../../app/contacts/[id].tsx>) | ContactDetailScreen |
| [app/contacts/all-actions.tsx](<../../app/contacts/all-actions.tsx>) | AllActionsAgentLedgerScreen |
| [app/contacts/analysis/[dimension]/[bucketId].tsx](<../../app/contacts/analysis/[dimension]/[bucketId].tsx>) | ContactStructureDetailScreen |
| [app/contacts/dashboard.tsx](<../../app/contacts/dashboard.tsx>) | ContactsDashboardScreen |
| [app/contacts/graph.tsx](<../../app/contacts/graph.tsx>) | ContactsDashboardScreen |
| [app/contacts/intros.tsx](<../../app/contacts/intros.tsx>) | ContactIntrosScreen |
| [app/contacts/list.tsx](<../../app/contacts/list.tsx>) | ContactsScreen |
| [app/contacts/new.tsx](<../../app/contacts/new.tsx>) | ContactAcquisitionScreen |
| [app/contacts/new/batch/[id].tsx](<../../app/contacts/new/batch/[id].tsx>) | BusinessCardBatchScreen |
| [app/contacts/new/batch2/[id].tsx](<../../app/contacts/new/batch2/[id].tsx>) | BusinessCardIngestScreen |
| [app/contacts/new/batch2/index.tsx](<../../app/contacts/new/batch2/index.tsx>) | BusinessCardIngestStartScreen |
| [app/contacts/new/import/[id].tsx](<../../app/contacts/new/import/[id].tsx>) | BusinessCardImportScreen |
| [app/contacts/pipeline.tsx](<../../app/contacts/pipeline.tsx>) | ContactPipelineScreen |
| [app/dashboard.tsx](<../../app/dashboard.tsx>) | DashboardScreen |
| [app/events/[id].tsx](<../../app/events/[id].tsx>) | EventDetailScreen |
| [app/events/[id]/analytics.tsx](<../../app/events/[id]/analytics.tsx>) | EventAnalyticsScreen |
| [app/events/[id]/attendees.tsx](<../../app/events/[id]/attendees.tsx>) | EventAttendeesScreen |
| [app/events/[id]/operations.tsx](<../../app/events/[id]/operations.tsx>) | EventOperationsScreen |
| [app/events/[id]/operations/admission.tsx](<../../app/events/[id]/operations/admission.tsx>) | EventAdmissionReviewScreen |
| [app/events/[id]/operations/check-in.tsx](<../../app/events/[id]/operations/check-in.tsx>) | EventCheckInScreen |
| [app/events/[id]/operations/experience.tsx](<../../app/events/[id]/operations/experience.tsx>) | EventExperienceScreen |
| [app/events/[id]/operations/roles.tsx](<../../app/events/[id]/operations/roles.tsx>) | EventRolesScreen |
| [app/events/[id]/register.tsx](<../../app/events/[id]/register.tsx>) | EventRegistrationScreen |
| [app/events/center.tsx](<../../app/events/center.tsx>) | EventCenterScreen |
| [app/followups.tsx](<../../app/followups.tsx>) | FollowupsScreen |
| [app/home.tsx](<../../app/home.tsx>) | HomeDashboardScreen |
| [app/home/events.tsx](<../../app/home/events.tsx>) | HomeScreen |
| [app/inbox/[id].tsx](<../../app/inbox/[id].tsx>) | RelationshipInboxThreadScreen |
| [app/index.tsx](<../../app/index.tsx>) | href={resolveInitialRouteHref() as Href} |
| [app/login-admin.tsx](<../../app/login-admin.tsx>) | AdminLoginScreen |
| [app/o/[slug].tsx](<../../app/o/[slug].tsx>) | OrganizerPublicScreen |
| [app/party.tsx](<../../app/party.tsx>) | PartyModeScreen |
| [app/party/checkin.tsx](<../../app/party/checkin.tsx>) | PartyModeScreen |
| [app/party/graph.tsx](<../../app/party/graph.tsx>) | PartyModeScreen |
| [app/platform.tsx](<../../app/platform.tsx>) | PlatformScreen |
| [app/register.tsx](<../../app/register.tsx>) | RegisterInviteScreen |
| [app/register/[code].tsx](<../../app/register/[code].tsx>) | RegisterInviteScreen |
| [app/schedule/events/[id].tsx](<../../app/schedule/events/[id].tsx>) | ScheduleEventPreviewScreen |
| [app/settings.tsx](<../../app/settings.tsx>) | SettingsScreen |
| [app/settings/api.tsx](<../../app/settings/api.tsx>) | ApiSettingsScreen |
| [app/tasks.tsx](<../../app/tasks.tsx>) | TasksScreen |
| [app/tasks/[id].tsx](<../../app/tasks/[id].tsx>) | TaskDetailScreen |
| [app/today.tsx](<../../app/today.tsx>) | TodayScreen |

特别注意：

- `app/contacts/graph.tsx` 当前导入 `ContactsDashboardScreen`；`ContactsGraphScreen.tsx` 中仍有 HTTP 代码，但本轮未发现其被其他 App 源文件导入。保留旧代码消费点，不能冒充该路由的真实 Graph 业务。
- `app/home.tsx` 使用 `HomeDashboardScreen`；`app/home/events.tsx` 使用旧的 `HomeScreen`。不能混用两者接口来解释当前首页。
- `BusinessCardImportScreen` 通过 `getJob/cancelJob` 调用专用 client；不能因 Screen 中没有直接 fetch 就漏记进度／取消接口。
- `app/account/mobile-google.tsx` 自身重定向到登录页；实际 OAuth 使用 AuthSessionProvider 的系统浏览器流程，不以该路由存在证明 OAuth 成功。

## 3. 动态路径与委托调用补充

下方 `:id`、`:batch` 等都是脱敏路径模式，不是可直接执行的真实对象。读取与修改权限均须由服务端验证。GET 代表请求方法，不保证业务实现完全无副作用。

| 消费者／源码锚点 | 确定的方法与路径模式 | 副作用／进入条件 |
| --- | --- | --- |
| HomeDashboardScreen:110；ProfileScreen:1172 | GET `/api/schedule-items`、`/api/tasks?status=open`、`/api/contacts` | 当前账号读取；资料统计组件接收相同三类路径 |
| ContactsScreen:1621 | GET `/api/contacts`，可带 query/status/source/tag/value | 当前账号；筛选参数由 contactsListPath 生成，不证明全库搜索范围 |
| AiConversationScreen:162/291 | GET conversations 根、`/:id` 或 `/sessions/:id`；POST 根或 `/:id`，前缀 `/api/ai/conversations` | 区分初始草稿、普通会话与 session；POST 可生成／调用工具，需预算。当前 initialMessage 自动发送仍为 R-02 未关闭项 |
| AiConversationScreen:354/367 | GET `/api/ai/runs/:id`；POST `/api/task-suggestions/:id/accept` 或 `/dismiss` | run 读取与建议写入分开；不能自动接受 |
| AgentActionsScreen:69 | POST `/api/agent/actions/:id/accept` 或 `/dismiss` | 可改变动作生命周期／后续执行 |
| BusinessCardImportScreen:93/138 → api/business-card-import.ts | GET `/api/contact-drafts/business-card/imports/:id`；POST 同路径 `/cancel` | 读取进度／取消导入；本次未执行。前者有专用 legacy envelope 适配 |
| BusinessCardBatchScreen:200；api/batch-images.ts:161 | GET legacy batch、`/items/:item/image`；POST `/items/:item/{confirm,skip,retry}` 或批次 `/finish`；前缀 `/api/contact-drafts/business-card/batches/:batch` | 图片是受保护字节响应，不按 JSON 检查；retry 可触发 OCR，confirm 可创建联系人 |
| BusinessCardIngestStartScreen:142/186 | GET `/api/contact-drafts/business-card/batches` 或 `/batches/v2`；POST `/batches/v2` | 历史／当前批次列表；创建批次是写入 |
| BusinessCardIngestScreen:191/268/304；view-models/business-card-ingest.ts:131 | 前缀 `/api/contact-drafts/business-card/batches/v2/:batch`；GET 批次／`items/:item/image`；PUT `items/:item/content`；POST 批次 `cancel/finalize` 或 item `exclude/confirm/manual-entry/skip/retry/replace` | 上传字节、替换、取消、复核、创建、重试分别验；不是单一无副作用轮询 |
| ContactAcquisitionScreen:398/437/473 | PATCH `/api/contact-drafts/:id`；POST `/api/contacts/business-card/confirm`、`/api/contact-drafts/:id/confirm` | 草稿修改与实际创建分开 |
| ContactAcquisitionScreen:539/587/620/653/689/722；contact-acquisition builder | POST `/api/contact-drafts/merge-suggestions/:id/apply`、`recommended/:id/confirm`、`event-attendees/import`、`external/import`、`referral`、`manual`、`qr/scan`、`business-card/scan` | 动态 sourceKind 参数见 builder；合并／引入／识别按对象和预算授权 |
| ContactIntrosScreen:180/228；contact-pipeline builder | POST／PATCH `/api/contact-invitations` | prepare 与 confirm；不得把手填接收人当作已绑定身份或把草稿当实际发送 |
| ContactsGraphScreen:137/169；connections-graph builder | POST `/api/connections/:id/evidence`；PATCH `/api/connections/:id/profile` | 当前无直接路由绑定的旧组件；保留记录，不先删除 |
| RelationshipChatDetailScreen:196 | POST `/api/chat/conversations/:id/messages` | 真实消息发送，需平台身份、会话资格和测试接收方授权 |
| RelationshipInboxScreen:444/713/1101/1146/1255/1398，经 clientGet/Post/Patch | PATCH `/api/agent/signals/:id`；POST `/api/chat/relationship-inbox`、`/api/chat/assist/rewrite`、`/api/relationship-signals/:id/confirm`、`/api/chat/privacy/analysis-toggle?conversationId=:id`；GET `/api/chat/privacy?conversationId=:id` | signal 状态、草稿／改写、信号确认、隐私开关分别有副作用；不等于通用通知已读接口 |
| EventAdmissionReviewScreen:43/112 | GET `/api/events/:id/admission/reviews?limit=30&view=pending或processed[&cursor=…]` | 活动审核能力／分页；不能使用客户端假角色 |
| EventCheckInScreen:30/59 | GET／POST `/api/events/:id/operations/admin/check-ins` | GET 名单；POST 真实签到，需运营权限 |
| EventExperienceScreen:108/150/151 | GET／PUT `/api/events/:id/experience`；POST `/preview`、`/publish` | 读取、存草稿、预览、发布独立；preview 不因名称被认定无副作用 |
| EventAttendeesScreen:255 | POST `/api/events/:id/attendees/import` | 活动 roster 导入；不同于 contact-drafts/event-attendees/import |
| ProfileScreen:263 | POST `/api/profile/extractions/business-card` 或 `/resume` | 上传／提取需要样本和预算；不是自动保存资料 |
| TaskDetailScreen:109，经 mutate:154/177/184/194/217 | PATCH／DELETE `/api/tasks/:id`；POST `/api/reminders`；PATCH `/api/reminders/:id` | 编辑／动作、删除事项、建提醒、取消提醒；DELETE 与清理须单独批准 |
| TodayScreen:57 | GET `/api/today?timeZone=…` | 具体时区源需 R-09 核对；AI 首页另固定传 Asia/Tokyo |
| mobile-auth.ts:266/402 | POST `/api/auth/mobile/credentials`、`/api/auth/mobile/google/exchange` | postForSession 的两个业务派发；改变会话，不是匿名只读检查 |

## 4. 认证、外部能力与原生副作用

认证前提是后续测试所需的最小区分，不是已经核实的服务端授权规则。精确 capability、拒绝原因、记录所有权及不同角色测试仍待真实账号／API 核验。

| 功能组 | 认证／对象前提 | 写入／外部边界 |
| --- | --- | --- |
| 公开发现、公开详情、主办方公开页 | 可匿名的公开 API；页面本身可能还有账号资源 | 只读目标；推荐接受另列 POST |
| 注册、密码登录、密码恢复、Google | 用户批准的账号、邮箱及环境；不导出凭据 | 创建账号／会话，密码重置邮件，系统 OAuth 与授权码交换 |
| 账号资料、首页、联系人、待办、日程、个人统计 | 当前账号及其有权访问的记录 | PUT/PATCH/DELETE 及建议接受须隔离对象；不直接读数据库 |
| AI、分析重算、任务／提醒生成、聊天辅助、OCR／资料提取 | 当前账号的工具／对象权限，模型或 OCR 可用，费用硬上限 | 可能有模型费用、工具执行、异步 worker、业务创建；不自动批量调用 |
| 报名、意向、相遇记录、会后确认、活动目标 | 当前账号、活动状态及服务端资格 | 提交／取消／导入／确认写入；报名辅助 interview/persona 单列费用 |
| 运营、体验发布、角色、审核、签到、分析报表 | 服务端授予的对应活动 capability；普通用户拒绝场景另测 | 发布／重试、改角色、审核、签到均可能影响他人 |
| 聊天、邀请、隐私、关系 signal | 已确认平台绑定、会话资格和接收方；私有联系人 ID 不等于平台身份 | 消息发送、邀请确认、隐私切换、signal 动作，不由只读授权涵盖 |
| 通知／提醒 | 当前用户与设备、通知权限、有效 projectId／设备 token | 注册／解绑、Expo 通信、原生提醒调度与取消；生命周期可能自动执行 |

| 原生能力与源码 | 通信／本机副作用 | 本轮状态 |
| --- | --- | --- |
| AuthSessionProvider.tsx:242、mobile-auth.ts 的 Google start builder | 系统浏览器打开 `/api/auth/mobile/google/start`（PKCE/state/回跳参数）；后续向服务端 exchange | 未执行；登录页路由成功不能代替回跳验收，不记录授权码／凭据 |
| native-auth-session-storage.ts | SecureStore 读取／保存／删除会话；不是 HTTP 消费点 | 未读取存储内容或清理身份 |
| ContactAcquisitionScreen.tsx:772/805 | 相册／相机权限及 ImagePicker；随后识别另算 HTTP 写入 | 未请求权限或拍摄；相机必须实体 iPhone 验证 |
| BusinessCardIngestStartScreen、BusinessCardIngestScreen、api/batch-images.ts | 本机选图、读取原始字节、摘要校验；受保护图片 GET 转 data URI | 未选图／上传；读取文件不是调用 OCR 成功 |
| ProfileScreen.tsx:622/657 | ImagePicker 与 DocumentPicker；文件读取及后续资料提取 | 未选择私人文件或触发提取 |
| NotificationLifecycle.tsx:84/91/96/106/120 | 通知权限、Expo token，POST `/api/devices/push-tokens`；并调用旧 `/api/devices/push-token` 注册路径 | 当前两种路径都存在；本轮未主动触发。普通打开／登录可能有注册副作用 |
| push-device-session.ts；native-notifications.ts | DELETE `/api/devices/push-tokens/:id` 或 `/api/devices/push-token`；退出／换号可触发解绑 | 未切换或退出当前账号 |
| OrbitNotificationsCoordinator、notification-sync.ts | GET reminders 后可 schedule/cancel 本地提醒；前后台生命周期另验 | GET 不能概括整条链为无副作用；未调度／取消测试提醒 |
| EventDetailScreen.tsx:117 | 系统 Share.share，可能由用户把活动信息发给外部应用 | 未打开分享或发送 |
| AiConversationScreen.tsx:1490 | Linking.openURL 打开模型结果中的外链 | 未打开外链；不属于 Orbit API 连通性证据 |
| 各 Screen 的 React Native Image | 原生图像 URI 加载可能有独立网络访问；受保护批次图见专用 bytes client | 不算入 fetch 调用数；第三方图片来源／认证／失败须另验 |

## 5. 请求相关调用索引

每行记录源码位置、调用种类和方法／第一参数。固定常量已展开，但没有执行任何路径。完整作用域、请求体、重试及触发条件以链接源码为准；尤其不能从方法名推断运行期成功、无费用或无写入。

| ID | 源码文件：行 | 种类／方法 | 路径或转发输入 |
| --- | --- | --- | --- |
| C001 | [src/api/auth-session.ts:378](<../../src/api/auth-session.ts>) | transport / POST | ``authUrl(baseUrl, "/api/auth/register")`` |
| C002 | [src/api/auth-session.ts:433](<../../src/api/auth-session.ts>) | transport / POST | ``authUrl(baseUrl, "/api/account/session/sign-out")`` |
| C003 | [src/api/batch-images.ts:161](<../../src/api/batch-images.ts>) | client / GET | ``protectedImagePath`` |
| C004 | [src/api/business-card-import.ts:89](<../../src/api/business-card-import.ts>) | transport / DYNAMIC | ``url`` |
| C005 | [src/api/business-card-import.ts:114](<../../src/api/business-card-import.ts>) | client / POST | ``path + "/cancel"`` |
| C006 | [src/api/business-card-import.ts:115](<../../src/api/business-card-import.ts>) | client / GET | ``path`` |
| C007 | [src/api/client.ts:282](<../../src/api/client.ts>) | transport / DYNAMIC | ``pathToUrl(baseUrl, path)`` |
| C008 | [src/api/mobile-auth.ts:172](<../../src/api/mobile-auth.ts>) | transport / POST | ``endpoint(baseUrl, path)`` |
| C009 | [src/api/mobile-auth.ts:214](<../../src/api/mobile-auth.ts>) | transport / GET | ``endpoint(baseUrl, "/api/auth/mobile/providers")`` |
| C010 | [src/api/mobile-auth.ts:266](<../../src/api/mobile-auth.ts>) | auth-dispatch / POST | ``{ baseUrl, body: { email: normalizedEmail, password }, fallbackCode: "ORBIT_APP_AUTH_INVALID_CREDENTIALS", fallbackMessage: "邮箱或密码不正确。", fetchImpl, path: "/api/auth/mobile/credentials" }`` |
| C011 | [src/api/mobile-auth.ts:402](<../../src/api/mobile-auth.ts>) | auth-dispatch / POST | ``{ baseUrl, body: { code, codeVerifier, state }, fallbackCode: "ORBIT_APP_GOOGLE_EXCHANGE_FAILED", fallbackMessage: "Google 登录没有完成，请重新登录。", fetchImpl, path: "/api/auth/mobile/google/exchange" }`` |
| C012 | [src/api/mobile-auth.ts:427](<../../src/api/mobile-auth.ts>) | transport / GET | ``endpoint(baseUrl, "/api/auth/session")`` |
| C013 | [src/hooks/useApiResource.ts:38](<../../src/hooks/useApiResource.ts>) | transport / DYNAMIC | ``input`` |
| C014 | [src/hooks/useApiResource.ts:110](<../../src/hooks/useApiResource.ts>) | client / GET | ``path`` |
| C015 | [src/hooks/useHomeDashboardClient.ts:16](<../../src/hooks/useHomeDashboardClient.ts>) | transport / DYNAMIC | ``input`` |
| C016 | [src/hooks/useOrbitApiClient.ts:10](<../../src/hooks/useOrbitApiClient.ts>) | transport / DYNAMIC | ``input`` |
| C017 | [src/hooks/useRelationshipInboxBadgeCount.ts:10](<../../src/hooks/useRelationshipInboxBadgeCount.ts>) | resource / GET | ``relationshipInboxPath()`` |
| C018 | [src/hooks/useRelationshipInboxBadgeCount.ts:15](<../../src/hooks/useRelationshipInboxBadgeCount.ts>) | resource / GET | ``"/api/notifications"`` |
| C019 | [src/hooks/useValidatedApiResource.ts:13](<../../src/hooks/useValidatedApiResource.ts>) | resource / GET | ``path`` |
| C020 | [src/notifications/NotificationLifecycle.tsx:106](<../../src/notifications/NotificationLifecycle.tsx>) | client / POST | ``"/api/devices/push-tokens"`` |
| C021 | [src/notifications/native-notifications.ts:83](<../../src/notifications/native-notifications.ts>) | client / GET | ``remindersPath()`` |
| C022 | [src/notifications/native-notifications.ts:123](<../../src/notifications/native-notifications.ts>) | client / POST | ``"/api/devices/push-token"`` |
| C023 | [src/notifications/native-notifications.ts:140](<../../src/notifications/native-notifications.ts>) | client / DELETE | ``"/api/devices/push-token"`` |
| C024 | [src/notifications/push-device-session.ts:55](<../../src/notifications/push-device-session.ts>) | client / DELETE | ``pushTokenPath(deviceId)`` |
| C025 | [src/screens/admin/AdminScreen.tsx:44](<../../src/screens/admin/AdminScreen.tsx>) | resource / GET | ``"/api/events"`` |
| C026 | [src/screens/admin/AdminScreen.tsx:48](<../../src/screens/admin/AdminScreen.tsx>) | resource / GET | ``"/api/profile"`` |
| C027 | [src/screens/admin/AdminScreen.tsx:52](<../../src/screens/admin/AdminScreen.tsx>) | resource / GET | ``dashboardAggregatePath(4)`` |
| C028 | [src/screens/agent/AgentLedgerScreen.tsx:55](<../../src/screens/agent/AgentLedgerScreen.tsx>) | resource / GET | ``"/api/agent/ledger"`` |
| C029 | [src/screens/agent/AgentLedgerScreen.tsx:85](<../../src/screens/agent/AgentLedgerScreen.tsx>) | client / POST | ``agentLedgerTransitionPath(entry.id)`` |
| C030 | [src/screens/ai/AgentActionsScreen.tsx:41](<../../src/screens/ai/AgentActionsScreen.tsx>) | resource / GET | ``"/api/agent/actions"`` |
| C031 | [src/screens/ai/AgentActionsScreen.tsx:69](<../../src/screens/ai/AgentActionsScreen.tsx>) | client / POST | ``path`` |
| C032 | [src/screens/ai/AiConversationScreen.tsx:162](<../../src/screens/ai/AiConversationScreen.tsx>) | resource / GET | ``path`` |
| C033 | [src/screens/ai/AiConversationScreen.tsx:163](<../../src/screens/ai/AiConversationScreen.tsx>) | resource / GET | ``"/api/events"`` |
| C034 | [src/screens/ai/AiConversationScreen.tsx:164](<../../src/screens/ai/AiConversationScreen.tsx>) | resource / GET | ``"/api/contacts"`` |
| C035 | [src/screens/ai/AiConversationScreen.tsx:165](<../../src/screens/ai/AiConversationScreen.tsx>) | resource / GET | ``"/api/tasks"`` |
| C036 | [src/screens/ai/AiConversationScreen.tsx:166](<../../src/screens/ai/AiConversationScreen.tsx>) | resource / GET | ``"/api/profile"`` |
| C037 | [src/screens/ai/AiConversationScreen.tsx:263](<../../src/screens/ai/AiConversationScreen.tsx>) | client / POST | ``"/api/ai/conversations/sessions"`` |
| C038 | [src/screens/ai/AiConversationScreen.tsx:291](<../../src/screens/ai/AiConversationScreen.tsx>) | client / POST | ``request.path`` |
| C039 | [src/screens/ai/AiConversationScreen.tsx:354](<../../src/screens/ai/AiConversationScreen.tsx>) | client / GET | ``request.request.path`` |
| C040 | [src/screens/ai/AiConversationScreen.tsx:367](<../../src/screens/ai/AiConversationScreen.tsx>) | client / POST | ``endpoint`` |
| C041 | [src/screens/ai/AiScreen.tsx:201](<../../src/screens/ai/AiScreen.tsx>) | resource / GET | ``"/api/ai/conversations"`` |
| C042 | [src/screens/ai/AiScreen.tsx:206](<../../src/screens/ai/AiScreen.tsx>) | resource / GET | ``"/api/ai/conversations/sessions"`` |
| C043 | [src/screens/ai/AiScreen.tsx:211](<../../src/screens/ai/AiScreen.tsx>) | resource / GET | ``todayPath("Asia/Tokyo")`` |
| C044 | [src/screens/ai/AiScreen.tsx:363](<../../src/screens/ai/AiScreen.tsx>) | client / DELETE | ``aiConversationSessionPath(item.id)`` |
| C045 | [src/screens/chat/RelationshipChatDetailScreen.tsx:52](<../../src/screens/chat/RelationshipChatDetailScreen.tsx>) | resource / GET | ``chatConversationPath(conversationId \|\| "missing")`` |
| C046 | [src/screens/chat/RelationshipChatDetailScreen.tsx:56](<../../src/screens/chat/RelationshipChatDetailScreen.tsx>) | resource / GET | ``chatConversationExtractionsPath(conversationId \|\| "missing")`` |
| C047 | [src/screens/chat/RelationshipChatDetailScreen.tsx:155](<../../src/screens/chat/RelationshipChatDetailScreen.tsx>) | client / POST | ``chatConversationSummaryPath(view.conversationId)`` |
| C048 | [src/screens/chat/RelationshipChatDetailScreen.tsx:196](<../../src/screens/chat/RelationshipChatDetailScreen.tsx>) | client / POST | ``request.request.endpoint`` |
| C049 | [src/screens/chat/RelationshipChatScreen.tsx:21](<../../src/screens/chat/RelationshipChatScreen.tsx>) | resource / GET | ``"/api/chat/conversations"`` |
| C050 | [src/screens/contacts/BusinessCardBatchScreen.tsx:151](<../../src/screens/contacts/BusinessCardBatchScreen.tsx>) | client / GET | ``legacyBatchPath(batchId)`` |
| C051 | [src/screens/contacts/BusinessCardBatchScreen.tsx:200](<../../src/screens/contacts/BusinessCardBatchScreen.tsx>) | client / POST | ``path`` |
| C052 | [src/screens/contacts/BusinessCardIngestScreen.tsx:90](<../../src/screens/contacts/BusinessCardIngestScreen.tsx>) | client / GET | ``ingestBatchPath(scope.batchId)`` |
| C053 | [src/screens/contacts/BusinessCardIngestScreen.tsx:191](<../../src/screens/contacts/BusinessCardIngestScreen.tsx>) | client / POST | ``path`` |
| C054 | [src/screens/contacts/BusinessCardIngestScreen.tsx:268](<../../src/screens/contacts/BusinessCardIngestScreen.tsx>) | client / POST | ``ingestItemPath(scope.batchId, snapshot.item.id) + "/" + action`` |
| C055 | [src/screens/contacts/BusinessCardIngestScreen.tsx:304](<../../src/screens/contacts/BusinessCardIngestScreen.tsx>) | client / POST | ``itemReplacePath(scope.batchId, snapshot.item.id)`` |
| C056 | [src/screens/contacts/BusinessCardIngestStartScreen.tsx:142](<../../src/screens/contacts/BusinessCardIngestStartScreen.tsx>) | client / GET | ``source === "current" ? INGEST_COLLECTION_PATH : LEGACY_COLLECTION_PATH`` |
| C057 | [src/screens/contacts/BusinessCardIngestStartScreen.tsx:186](<../../src/screens/contacts/BusinessCardIngestStartScreen.tsx>) | client / POST | ``INGEST_COLLECTION_PATH`` |
| C058 | [src/screens/contacts/ContactAcquisitionScreen.tsx:204](<../../src/screens/contacts/ContactAcquisitionScreen.tsx>) | resource / GET | ``"/api/contact-drafts/external/candidates"`` |
| C059 | [src/screens/contacts/ContactAcquisitionScreen.tsx:213](<../../src/screens/contacts/ContactAcquisitionScreen.tsx>) | resource / GET | ``"/api/contact-drafts"`` |
| C060 | [src/screens/contacts/ContactAcquisitionScreen.tsx:221](<../../src/screens/contacts/ContactAcquisitionScreen.tsx>) | resource / GET | ``"/api/contact-drafts/merge-suggestions"`` |
| C061 | [src/screens/contacts/ContactAcquisitionScreen.tsx:398](<../../src/screens/contacts/ContactAcquisitionScreen.tsx>) | client / PATCH | ``request.request.endpoint`` |
| C062 | [src/screens/contacts/ContactAcquisitionScreen.tsx:437](<../../src/screens/contacts/ContactAcquisitionScreen.tsx>) | client / POST | ``request.request.endpoint`` |
| C063 | [src/screens/contacts/ContactAcquisitionScreen.tsx:473](<../../src/screens/contacts/ContactAcquisitionScreen.tsx>) | client / POST | ``contactDraftConfirmPath(draftId)`` |
| C064 | [src/screens/contacts/ContactAcquisitionScreen.tsx:539](<../../src/screens/contacts/ContactAcquisitionScreen.tsx>) | client / POST | ``request.request.endpoint`` |
| C065 | [src/screens/contacts/ContactAcquisitionScreen.tsx:587](<../../src/screens/contacts/ContactAcquisitionScreen.tsx>) | client / POST | ``request.request.endpoint \|\| contactDraftMergeSuggestionApplyPath(suggestion.id)`` |
| C066 | [src/screens/contacts/ContactAcquisitionScreen.tsx:620](<../../src/screens/contacts/ContactAcquisitionScreen.tsx>) | client / POST | ``request.request.endpoint`` |
| C067 | [src/screens/contacts/ContactAcquisitionScreen.tsx:653](<../../src/screens/contacts/ContactAcquisitionScreen.tsx>) | client / POST | ``"/api/contact-drafts/event-attendees/import"`` |
| C068 | [src/screens/contacts/ContactAcquisitionScreen.tsx:689](<../../src/screens/contacts/ContactAcquisitionScreen.tsx>) | client / POST | ``request.request.endpoint`` |
| C069 | [src/screens/contacts/ContactAcquisitionScreen.tsx:722](<../../src/screens/contacts/ContactAcquisitionScreen.tsx>) | client / POST | ``request.request.endpoint`` |
| C070 | [src/screens/contacts/ContactDetailScreen.tsx:89](<../../src/screens/contacts/ContactDetailScreen.tsx>) | resource / GET | ``contactDetailPath(contactId)`` |
| C071 | [src/screens/contacts/ContactDetailScreen.tsx:95](<../../src/screens/contacts/ContactDetailScreen.tsx>) | resource / GET | ``"/api/connections"`` |
| C072 | [src/screens/contacts/ContactDetailScreen.tsx:108](<../../src/screens/contacts/ContactDetailScreen.tsx>) | resource / GET | ``relationshipValueAnalysisPath(connectionId)`` |
| C073 | [src/screens/contacts/ContactDetailScreen.tsx:178](<../../src/screens/contacts/ContactDetailScreen.tsx>) | client / POST | ``relationshipValueRecomputePath()`` |
| C074 | [src/screens/contacts/ContactDetailScreen.tsx:222](<../../src/screens/contacts/ContactDetailScreen.tsx>) | client / PATCH | ``contactDetailPath(contactId)`` |
| C075 | [src/screens/contacts/ContactIntrosScreen.tsx:40](<../../src/screens/contacts/ContactIntrosScreen.tsx>) | resource / GET | ``"/api/contacts"`` |
| C076 | [src/screens/contacts/ContactIntrosScreen.tsx:48](<../../src/screens/contacts/ContactIntrosScreen.tsx>) | resource / GET | ``"/api/connections"`` |
| C077 | [src/screens/contacts/ContactIntrosScreen.tsx:180](<../../src/screens/contacts/ContactIntrosScreen.tsx>) | client / POST | ``request.request.endpoint`` |
| C078 | [src/screens/contacts/ContactIntrosScreen.tsx:228](<../../src/screens/contacts/ContactIntrosScreen.tsx>) | client / PATCH | ``request.request.endpoint`` |
| C079 | [src/screens/contacts/ContactNotesSection.tsx:76](<../../src/screens/contacts/ContactNotesSection.tsx>) | client / PATCH | ``contactDetailPath(contactId)`` |
| C080 | [src/screens/contacts/ContactPipelineScreen.tsx:42](<../../src/screens/contacts/ContactPipelineScreen.tsx>) | resource / GET | ``"/api/contacts"`` |
| C081 | [src/screens/contacts/ContactPipelineScreen.tsx:50](<../../src/screens/contacts/ContactPipelineScreen.tsx>) | resource / GET | ``"/api/connections"`` |
| C082 | [src/screens/contacts/ContactPipelineScreen.tsx:54](<../../src/screens/contacts/ContactPipelineScreen.tsx>) | resource / GET | ``"/api/tasks"`` |
| C083 | [src/screens/contacts/ContactPipelineScreen.tsx:167](<../../src/screens/contacts/ContactPipelineScreen.tsx>) | client / PATCH | ``connectionStagePath(action.connectionId)`` |
| C084 | [src/screens/contacts/ContactStructureDetailScreen.tsx:35](<../../src/screens/contacts/ContactStructureDetailScreen.tsx>) | resource / GET | ``contactStructureDetailPath(dimension, bucketId)`` |
| C085 | [src/screens/contacts/ContactsDashboardScreen.tsx:115](<../../src/screens/contacts/ContactsDashboardScreen.tsx>) | resource / GET | ``"/api/mobile/contacts-dashboard"`` |
| C086 | [src/screens/contacts/ContactsDashboardScreen.tsx:147](<../../src/screens/contacts/ContactsDashboardScreen.tsx>) | client / POST | ``dashboardOpportunitiesRecomputePath()`` |
| C087 | [src/screens/contacts/ContactsDashboardScreen.tsx:186](<../../src/screens/contacts/ContactsDashboardScreen.tsx>) | client / PUT | ``"/api/profile"`` |
| C088 | [src/screens/contacts/ContactsGraphScreen.tsx:46](<../../src/screens/contacts/ContactsGraphScreen.tsx>) | resource / GET | ``"/api/connections"`` |
| C089 | [src/screens/contacts/ContactsGraphScreen.tsx:103](<../../src/screens/contacts/ContactsGraphScreen.tsx>) | client / GET | ``connectionDetailPath(connection.id)`` |
| C090 | [src/screens/contacts/ContactsGraphScreen.tsx:137](<../../src/screens/contacts/ContactsGraphScreen.tsx>) | client / POST | ``request.request.endpoint`` |
| C091 | [src/screens/contacts/ContactsGraphScreen.tsx:169](<../../src/screens/contacts/ContactsGraphScreen.tsx>) | client / PATCH | ``request.request.endpoint`` |
| C092 | [src/screens/contacts/ContactsScreen.tsx:1621](<../../src/screens/contacts/ContactsScreen.tsx>) | resource / GET | ``contactsPath`` |
| C093 | [src/screens/contacts/ContactsScreen.tsx:1629](<../../src/screens/contacts/ContactsScreen.tsx>) | resource / GET | ``"/api/search/suggestions"`` |
| C094 | [src/screens/contacts/ContactsScreen.tsx:1803](<../../src/screens/contacts/ContactsScreen.tsx>) | client / POST | ``"/api/search/relationships"`` |
| C095 | [src/screens/contacts/ContactsScreen.tsx:1848](<../../src/screens/contacts/ContactsScreen.tsx>) | client / POST | ``"/api/contacts/search"`` |
| C096 | [src/screens/dashboard/DashboardScreen.tsx:58](<../../src/screens/dashboard/DashboardScreen.tsx>) | resource / GET | ``dashboardAggregatePath(4)`` |
| C097 | [src/screens/dashboard/DashboardScreen.tsx:62](<../../src/screens/dashboard/DashboardScreen.tsx>) | resource / GET | ``"/api/dashboard/summary"`` |
| C098 | [src/screens/dashboard/DashboardScreen.tsx:66](<../../src/screens/dashboard/DashboardScreen.tsx>) | resource / GET | ``"/api/dashboard/opportunities"`` |
| C099 | [src/screens/dashboard/DashboardScreen.tsx:70](<../../src/screens/dashboard/DashboardScreen.tsx>) | resource / GET | ``"/api/dashboard/network-gaps"`` |
| C100 | [src/screens/dashboard/DashboardScreen.tsx:74](<../../src/screens/dashboard/DashboardScreen.tsx>) | resource / GET | ``"/api/dashboard/distributions"`` |
| C101 | [src/screens/dashboard/DashboardScreen.tsx:78](<../../src/screens/dashboard/DashboardScreen.tsx>) | resource / GET | ``dashboardProvenanceAuditPath()`` |
| C102 | [src/screens/dashboard/DashboardScreen.tsx:100](<../../src/screens/dashboard/DashboardScreen.tsx>) | client / POST | ``dashboardOpportunitiesRecomputePath()`` |
| C103 | [src/screens/dashboard/DashboardScreen.tsx:127](<../../src/screens/dashboard/DashboardScreen.tsx>) | client / POST | ``dashboardProvenanceAuditRunPath()`` |
| C104 | [src/screens/events/EventAdmissionReviewScreen.tsx:43](<../../src/screens/events/EventAdmissionReviewScreen.tsx>) | resource / GET | ``path`` |
| C105 | [src/screens/events/EventAdmissionReviewScreen.tsx:91](<../../src/screens/events/EventAdmissionReviewScreen.tsx>) | client / GET | ``eventAdmissionReviewDetailPath(eventId, actorId)`` |
| C106 | [src/screens/events/EventAdmissionReviewScreen.tsx:112](<../../src/screens/events/EventAdmissionReviewScreen.tsx>) | client / GET | ``eventAdmissionReviewsPath(eventId, view, nextCursor)`` |
| C107 | [src/screens/events/EventAdmissionReviewScreen.tsx:131](<../../src/screens/events/EventAdmissionReviewScreen.tsx>) | client / POST | ``eventAdmissionReviewDecisionPath(eventId, detail.actorId)`` |
| C108 | [src/screens/events/EventAnalyticsScreen.tsx:20](<../../src/screens/events/EventAnalyticsScreen.tsx>) | resource / GET | ``eventAnalyticsAggregatePath(eventId)`` |
| C109 | [src/screens/events/EventAnalyticsScreen.tsx:21](<../../src/screens/events/EventAnalyticsScreen.tsx>) | resource / GET | ``eventAnalyticsAttendeePath(eventId)`` |
| C110 | [src/screens/events/EventAttendeesScreen.tsx:75](<../../src/screens/events/EventAttendeesScreen.tsx>) | resource / GET | ``eventDetailPath(eventId)`` |
| C111 | [src/screens/events/EventAttendeesScreen.tsx:76](<../../src/screens/events/EventAttendeesScreen.tsx>) | resource / GET | ``eventAttendeesPath(eventId)`` |
| C112 | [src/screens/events/EventAttendeesScreen.tsx:80](<../../src/screens/events/EventAttendeesScreen.tsx>) | resource / GET | ``eventMatchesPath(eventId)`` |
| C113 | [src/screens/events/EventAttendeesScreen.tsx:128](<../../src/screens/events/EventAttendeesScreen.tsx>) | client / POST | ``eventWantToConnectPath(eventId)`` |
| C114 | [src/screens/events/EventAttendeesScreen.tsx:157](<../../src/screens/events/EventAttendeesScreen.tsx>) | client / POST | ``eventEncountersPath(eventId)`` |
| C115 | [src/screens/events/EventAttendeesScreen.tsx:194](<../../src/screens/events/EventAttendeesScreen.tsx>) | client / POST | ``eventEncounterEvidencePath(eventId, encounter.encounterId)`` |
| C116 | [src/screens/events/EventAttendeesScreen.tsx:225](<../../src/screens/events/EventAttendeesScreen.tsx>) | client / POST | ``"/api/contact-drafts/event-attendees/import"`` |
| C117 | [src/screens/events/EventAttendeesScreen.tsx:255](<../../src/screens/events/EventAttendeesScreen.tsx>) | client / POST | ``request.request.endpoint`` |
| C118 | [src/screens/events/EventCenterScreen.tsx:18](<../../src/screens/events/EventCenterScreen.tsx>) | resource / GET | ``"/api/events/center"`` |
| C119 | [src/screens/events/EventCheckInScreen.tsx:30](<../../src/screens/events/EventCheckInScreen.tsx>) | resource / GET | ``path`` |
| C120 | [src/screens/events/EventCheckInScreen.tsx:59](<../../src/screens/events/EventCheckInScreen.tsx>) | client / POST | ``path`` |
| C121 | [src/screens/events/EventDetailScreen.tsx:90](<../../src/screens/events/EventDetailScreen.tsx>) | resource / GET | ``publicEventDetailPath(eventId)`` |
| C122 | [src/screens/events/EventDetailScreen.tsx:381](<../../src/screens/events/EventDetailScreen.tsx>) | resource / GET | ``eventReadinessPath(eventId)`` |
| C123 | [src/screens/events/EventDetailScreen.tsx:383](<../../src/screens/events/EventDetailScreen.tsx>) | resource / GET | ``eventRecommendationsPath(eventId, 3)`` |
| C124 | [src/screens/events/EventDetailScreen.tsx:385](<../../src/screens/events/EventDetailScreen.tsx>) | resource / GET | ``eventPostEventPath(eventId)`` |
| C125 | [src/screens/events/EventDetailScreen.tsx:744](<../../src/screens/events/EventDetailScreen.tsx>) | client / PUT | ``eventGoalPath(eventId)`` |
| C126 | [src/screens/events/EventDetailScreen.tsx:937](<../../src/screens/events/EventDetailScreen.tsx>) | client / POST | ``eventOpeningLinePath(eventId, person.attendeeId, "context_question")`` |
| C127 | [src/screens/events/EventDetailScreen.tsx:1093](<../../src/screens/events/EventDetailScreen.tsx>) | client / POST | ``eventPostEventConfirmPath(eventId)`` |
| C128 | [src/screens/events/EventExperienceScreen.tsx:108](<../../src/screens/events/EventExperienceScreen.tsx>) | client / GET | ``eventExperiencePath(eventId)`` |
| C129 | [src/screens/events/EventExperienceScreen.tsx:150](<../../src/screens/events/EventExperienceScreen.tsx>) | client / PUT | ``path`` |
| C130 | [src/screens/events/EventExperienceScreen.tsx:151](<../../src/screens/events/EventExperienceScreen.tsx>) | client / POST | ```${path}/${operation}``` |
| C131 | [src/screens/events/EventOperationsScreen.tsx:24](<../../src/screens/events/EventOperationsScreen.tsx>) | resource / GET | ``eventOperationsAdminPath(eventId)`` |
| C132 | [src/screens/events/EventOperationsScreen.tsx:47](<../../src/screens/events/EventOperationsScreen.tsx>) | client / POST | ``eventOperationsGenerationsPath(eventId)`` |
| C133 | [src/screens/events/EventOperationsScreen.tsx:64](<../../src/screens/events/EventOperationsScreen.tsx>) | client / POST | ``eventOperationsGenerationActionPath(eventId, generation.generationId, generation.action)`` |
| C134 | [src/screens/events/EventRegistrationScreen.tsx:63](<../../src/screens/events/EventRegistrationScreen.tsx>) | resource / GET | ``eventDetailPath(eventId)`` |
| C135 | [src/screens/events/EventRegistrationScreen.tsx:64](<../../src/screens/events/EventRegistrationScreen.tsx>) | resource / GET | ```${eventRegistrationPath(eventId)}?language=zh``` |
| C136 | [src/screens/events/EventRegistrationScreen.tsx:154](<../../src/screens/events/EventRegistrationScreen.tsx>) | client / POST | ``eventRegistrationInterviewPath(eventId)`` |
| C137 | [src/screens/events/EventRegistrationScreen.tsx:187](<../../src/screens/events/EventRegistrationScreen.tsx>) | client / POST | ``eventRegistrationPersonaPath(eventId)`` |
| C138 | [src/screens/events/EventRegistrationScreen.tsx:212](<../../src/screens/events/EventRegistrationScreen.tsx>) | client / POST | ``eventRegistrationPath(eventId)`` |
| C139 | [src/screens/events/EventRegistrationScreen.tsx:240](<../../src/screens/events/EventRegistrationScreen.tsx>) | client / POST | ``eventRegistrationCancelPath(eventId)`` |
| C140 | [src/screens/events/EventRolesScreen.tsx:34](<../../src/screens/events/EventRolesScreen.tsx>) | resource / GET | ``eventAccessRolesPath(eventId)`` |
| C141 | [src/screens/events/EventRolesScreen.tsx:71](<../../src/screens/events/EventRolesScreen.tsx>) | client / GET | ``eventAccessAssignmentPath(eventId, subjectActorId.trim())`` |
| C142 | [src/screens/events/EventRolesScreen.tsx:103](<../../src/screens/events/EventRolesScreen.tsx>) | client / PUT | ``eventAccessAssignmentPath(eventId, subjectActorId.trim())`` |
| C143 | [src/screens/events/EventRolesScreen.tsx:152](<../../src/screens/events/EventRolesScreen.tsx>) | client / DELETE | ``eventAccessAssignmentPath(eventId, subjectActorId.trim())`` |
| C144 | [src/screens/events/EventsScreen.tsx:484](<../../src/screens/events/EventsScreen.tsx>) | resource / GET | ``"/api/events/public"`` |
| C145 | [src/screens/events/EventsScreen.tsx:703](<../../src/screens/events/EventsScreen.tsx>) | resource / GET | ``eventValueRecommendationsPath({ limit: 3 })`` |
| C146 | [src/screens/events/EventsScreen.tsx:737](<../../src/screens/events/EventsScreen.tsx>) | client / POST | ``eventValueRecommendationAcceptPath(recommendation.id)`` |
| C147 | [src/screens/followups/FollowupsScreen.tsx:75](<../../src/screens/followups/FollowupsScreen.tsx>) | resource / GET | ``"/api/tasks"`` |
| C148 | [src/screens/followups/FollowupsScreen.tsx:82](<../../src/screens/followups/FollowupsScreen.tsx>) | resource / GET | ``"/api/notifications"`` |
| C149 | [src/screens/followups/FollowupsScreen.tsx:86](<../../src/screens/followups/FollowupsScreen.tsx>) | resource / GET | ``"/api/contacts"`` |
| C150 | [src/screens/followups/FollowupsScreen.tsx:101](<../../src/screens/followups/FollowupsScreen.tsx>) | client / PATCH | ``taskPath(row.id)`` |
| C151 | [src/screens/followups/FollowupsScreen.tsx:118](<../../src/screens/followups/FollowupsScreen.tsx>) | client / POST | ``"/api/tasks/generate"`` |
| C152 | [src/screens/followups/FollowupsScreen.tsx:135](<../../src/screens/followups/FollowupsScreen.tsx>) | client / POST | ``"/api/notifications/reminders/generate"`` |
| C153 | [src/screens/followups/FollowupsScreen.tsx:155](<../../src/screens/followups/FollowupsScreen.tsx>) | client / POST | ``"/api/message-drafts"`` |
| C154 | [src/screens/followups/FollowupsScreen.tsx:172](<../../src/screens/followups/FollowupsScreen.tsx>) | client / POST | ``chatAssistFollowupDraftPath()`` |
| C155 | [src/screens/followups/FollowupsScreen.tsx:189](<../../src/screens/followups/FollowupsScreen.tsx>) | client / PATCH | ``messageDraftPath(draft.id)`` |
| C156 | [src/screens/home/HomeDashboardScreen.tsx:110](<../../src/screens/home/HomeDashboardScreen.tsx>) | client / GET | ``paths[section]`` |
| C157 | [src/screens/home/HomeDashboardScreen.tsx:152](<../../src/screens/home/HomeDashboardScreen.tsx>) | client / PATCH | ``taskPath(id)`` |
| C158 | [src/screens/home/HomeScreen.tsx:95](<../../src/screens/home/HomeScreen.tsx>) | resource / GET | ``"/api/profile"`` |
| C159 | [src/screens/home/HomeScreen.tsx:99](<../../src/screens/home/HomeScreen.tsx>) | resource / GET | ``"/api/events"`` |
| C160 | [src/screens/home/HomeScreen.tsx:103](<../../src/screens/home/HomeScreen.tsx>) | resource / GET | ``"/api/contacts"`` |
| C161 | [src/screens/inbox/RelationshipInboxScreen.tsx:139](<../../src/screens/inbox/RelationshipInboxScreen.tsx>) | client / GET | ``endpoint`` |
| C162 | [src/screens/inbox/RelationshipInboxScreen.tsx:143](<../../src/screens/inbox/RelationshipInboxScreen.tsx>) | client / POST | ``endpoint`` |
| C163 | [src/screens/inbox/RelationshipInboxScreen.tsx:147](<../../src/screens/inbox/RelationshipInboxScreen.tsx>) | client / PATCH | ``endpoint`` |
| C164 | [src/screens/inbox/RelationshipInboxScreen.tsx:156](<../../src/screens/inbox/RelationshipInboxScreen.tsx>) | resource / GET | ``relationshipInboxPath(null)`` |
| C165 | [src/screens/inbox/RelationshipInboxScreen.tsx:160](<../../src/screens/inbox/RelationshipInboxScreen.tsx>) | resource / GET | ``"/api/notifications"`` |
| C166 | [src/screens/inbox/RelationshipInboxScreen.tsx:164](<../../src/screens/inbox/RelationshipInboxScreen.tsx>) | resource / GET | ``"/api/relationship-signals/email-calendar"`` |
| C167 | [src/screens/inbox/RelationshipInboxScreen.tsx:182](<../../src/screens/inbox/RelationshipInboxScreen.tsx>) | client / GET | ``notificationDeliveryPath(deliveryId)`` |
| C168 | [src/screens/inbox/RelationshipInboxScreen.tsx:315](<../../src/screens/inbox/RelationshipInboxScreen.tsx>) | client / GET | ``endpoint`` |
| C169 | [src/screens/inbox/RelationshipInboxScreen.tsx:319](<../../src/screens/inbox/RelationshipInboxScreen.tsx>) | client / POST | ``endpoint`` |
| C170 | [src/screens/inbox/RelationshipInboxScreen.tsx:322](<../../src/screens/inbox/RelationshipInboxScreen.tsx>) | resource / GET | ``relationshipInboxPath(conversationId)`` |
| C171 | [src/screens/organizer/OrganizerPublicScreen.tsx:49](<../../src/screens/organizer/OrganizerPublicScreen.tsx>) | resource / GET | ``"/api/events/public"`` |
| C172 | [src/screens/party/PartyModeScreen.tsx:133](<../../src/screens/party/PartyModeScreen.tsx>) | resource / GET | ``eventDetailPath(eventId)`` |
| C173 | [src/screens/party/PartyModeScreen.tsx:134](<../../src/screens/party/PartyModeScreen.tsx>) | resource / GET | ``eventAttendeesPath(eventId)`` |
| C174 | [src/screens/party/PartyModeScreen.tsx:138](<../../src/screens/party/PartyModeScreen.tsx>) | resource / GET | ``eventMatchesPath(eventId)`` |
| C175 | [src/screens/platform/PlatformScreen.tsx:36](<../../src/screens/platform/PlatformScreen.tsx>) | resource / GET | ``"/api/events/public"`` |
| C176 | [src/screens/profile/AccountAuthScreen.tsx:115](<../../src/screens/profile/AccountAuthScreen.tsx>) | client / POST | ``"/api/auth/password-reset/request"`` |
| C177 | [src/screens/profile/AccountPermissionsScreen.tsx:69](<../../src/screens/profile/AccountPermissionsScreen.tsx>) | resource / GET | ``"/api/permissions"`` |
| C178 | [src/screens/profile/AccountPermissionsScreen.tsx:84](<../../src/screens/profile/AccountPermissionsScreen.tsx>) | client / POST | ``calendarPermissionRequestPath()`` |
| C179 | [src/screens/profile/AccountScreen.tsx:24](<../../src/screens/profile/AccountScreen.tsx>) | resource / GET | ``"/api/account/me"`` |
| C180 | [src/screens/profile/PasswordResetScreen.tsx:102](<../../src/screens/profile/PasswordResetScreen.tsx>) | client / POST | ``"/api/auth/password-reset/confirm"`` |
| C181 | [src/screens/profile/ProfileScreen.tsx:178](<../../src/screens/profile/ProfileScreen.tsx>) | resource / GET | ``"/api/profile"`` |
| C182 | [src/screens/profile/ProfileScreen.tsx:180](<../../src/screens/profile/ProfileScreen.tsx>) | resource / GET | ``"/api/profile/update-suggestions"`` |
| C183 | [src/screens/profile/ProfileScreen.tsx:216](<../../src/screens/profile/ProfileScreen.tsx>) | client / POST | ``profileUpdateSuggestionAcceptPath(id)`` |
| C184 | [src/screens/profile/ProfileScreen.tsx:263](<../../src/screens/profile/ProfileScreen.tsx>) | client / POST | ``request.endpoint`` |
| C185 | [src/screens/profile/ProfileScreen.tsx:309](<../../src/screens/profile/ProfileScreen.tsx>) | client / PUT | ``"/api/profile"`` |
| C186 | [src/screens/profile/ProfileScreen.tsx:1172](<../../src/screens/profile/ProfileScreen.tsx>) | resource / GET | ``path`` |
| C187 | [src/screens/register/RegisterInviteScreen.tsx:99](<../../src/screens/register/RegisterInviteScreen.tsx>) | resource / GET | ``"/api/profile"`` |
| C188 | [src/screens/register/RegisterInviteScreen.tsx:123](<../../src/screens/register/RegisterInviteScreen.tsx>) | resource / GET | ``publicEventDetailPath(inviteCode)`` |
| C189 | [src/screens/schedule/ScheduleEventPreviewScreen.tsx:31](<../../src/screens/schedule/ScheduleEventPreviewScreen.tsx>) | resource / GET | ``publicEventDetailPath(eventId)`` |
| C190 | [src/screens/schedule/ScheduleScreen.tsx:117](<../../src/screens/schedule/ScheduleScreen.tsx>) | resource / GET | ``"/api/tasks"`` |
| C191 | [src/screens/schedule/ScheduleScreen.tsx:118](<../../src/screens/schedule/ScheduleScreen.tsx>) | resource / GET | ``"/api/events/public"`` |
| C192 | [src/screens/schedule/ScheduleScreen.tsx:122](<../../src/screens/schedule/ScheduleScreen.tsx>) | resource / GET | ``"/api/schedule-items"`` |
| C193 | [src/screens/settings/ApiSettingsScreen.tsx:50](<../../src/screens/settings/ApiSettingsScreen.tsx>) | client / GET | ``"/api/health"`` |
| C194 | [src/screens/tasks/TaskDetailScreen.tsx:59](<../../src/screens/tasks/TaskDetailScreen.tsx>) | resource / GET | ``detailPath`` |
| C195 | [src/screens/tasks/TaskDetailScreen.tsx:60](<../../src/screens/tasks/TaskDetailScreen.tsx>) | resource / GET | ``activitiesPath`` |
| C196 | [src/screens/tasks/TaskDetailScreen.tsx:61](<../../src/screens/tasks/TaskDetailScreen.tsx>) | resource / GET | ``reminderResourcePath`` |
| C197 | [src/screens/tasks/TaskDetailScreen.tsx:109](<../../src/screens/tasks/TaskDetailScreen.tsx>) | client / PATCH \| POST \| DELETE | ``path`` |
| C198 | [src/screens/tasks/TasksScreen.tsx:37](<../../src/screens/tasks/TasksScreen.tsx>) | resource / GET | ``tasksPath()`` |
| C199 | [src/screens/tasks/TasksScreen.tsx:62](<../../src/screens/tasks/TasksScreen.tsx>) | client / PATCH | ``taskPath(item.id)`` |
| C200 | [src/screens/today/TodayScreen.tsx:57](<../../src/screens/today/TodayScreen.tsx>) | resource / GET | ``path`` |
| C201 | [src/screens/today/TodayScreen.tsx:69](<../../src/screens/today/TodayScreen.tsx>) | client / POST | ``"/api/tasks"`` |
| C202 | [src/screens/today/TodayScreen.tsx:89](<../../src/screens/today/TodayScreen.tsx>) | client / PATCH | ``taskPath(taskId)`` |
| C203 | [src/screens/today/TodayScreen.tsx:106](<../../src/screens/today/TodayScreen.tsx>) | client / POST | ``taskSuggestionAcceptPath(suggestionId)`` |
| C204 | [src/view-models/business-card-ingest.ts:131](<../../src/view-models/business-card-ingest.ts>) | client / PUT | ``itemContentPath(detail.batch.id, item.id)`` |

## 6. 本检查点的验收与后续

- 本轮只改文档；静态扫描、路由映射、动态委托补查、链接／计数及差异检查作为本检查点验证，不重新命名成业务通过。
- 文档检查重跑 exit 0：204 个连续且唯一的 C 编号、66 个路由文件与实际文件集合一致，三份相关文档共 281 个相对链接存在，表格列数与调用行锚点检查通过。第一次临时检查误用不支持文件名方括号的标签正则，得出 58；已改为从链接目标提取并对比真实文件集合，不隐去该次检查失败。
- 本轮未新增 HTTP 探针。此前 11 个匿名探针的时间、结果与 L1–L5 限度均保留在[执行记录](2026-09-13-app-connectivity.md)，不把旧结果写成这次新测。
- R-00 仍有本地 API 依赖阻塞；恢复现有 lockfile 依赖及必要的 Next 重启仍待用户授权或 Web 负责人处理。未安装、重启、改配置或改后端源码。
- R-01 仍缺逐角色能力核验、获准的真实请求、非空样本、响应协议、数据版本、持久化／跨端与原生结果。下一批真实测试从对应源码消费者选择场景，不从全部端点常量盲扫。
- 登录／OAuth、AI/OCR、报名、消息、通知、其他真实写入须先明确环境、账号角色、测试对象、外部副作用及费用硬上限；未获得授权就保持未执行，不用演示数据绕过。
