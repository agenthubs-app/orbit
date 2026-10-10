# 旧屏归属表：每个现有页面由哪个 Sprint 重写

**版本 2（2026-10-09，小雨编制；未归属项已按用户决定补齐）。** 改版是按屏替换（`IMPLEMENTATION-PLAN.md` §0.1「边界 B」）：一张设计屏对应一个新组件文件，接真实数据；新屏上线、路由切过去之后，**删除旧屏文件和它写死的颜色**。功能 Sprint 的验收以「旧文件已删」为准，不接受「旧屏改了颜色」。

本表列出两端**全部**产品路由（App `repos/orbit-app/app/` 91 个，Web `repos/orbits/app/**/page.tsx` 48 个，不含 `/dev/**` 内部调试页和 `/api/**`），给每个指定归属。功能 Sprint 写 PLANNER 时，从本表认领自己的行；R09 骨架验收时核对本表没有空行。

## 怎么读

- **处理**：重写 = 按设计稿新做一屏，删除旧屏；并入 = 内容进入别的新屏，旧路由改重定向或删除；重定向 = 现在已是跳转，随目标页一起处理；删除 = 新设计里没有，直接删。
- **设计稿**：`docs/designs/redesign-2026-10/` 下对应的画板文件；`IMPLEMENTATION-PLAN.md` §1 有逐屏的数据映射。
- Sprint 编号按 [README](README.md) 分工：R10 首页、R11 人脈、R12 / R15 / R16 加人与邀请、R13 / R14 收件箱 · 秘書 · 推送、R17 主催、R18 账户、R19 小组件、R20 Task、R21 iOrbit、R22–R25 计划 v2.2、R26 / R27 活动、R28 引导、R29 运营后台换新。加人、收件箱、活动三组内部的拆分在写功能 Sprint 文档时定，本表先写到组。

## 骨架期间

骨架 R05 / R07 换导航壳后，所有旧屏先挂进新壳（RD-20），只换了 token 层的颜色、图标和通用组件；0918 各域写死的颜色保持旧样，直到下表的功能 Sprint 重写。

## App（`repos/orbit-app/app/`）

| 区域 | 路由 | 旧屏 | 新设计画面 | 归属 | 处理 |
| --- | --- | --- | --- | --- | --- |
| 壳 | `index`、`[...legacy]` | 初始跳转 | — | R05 | 改为跳转新首页 |
| 首页 | `home` | `HomeDashboardScreen` | ホーム 组件容器（app.html、b3） | R10 | 重写 |
| 首页 | `dashboard` | `DashboardScreen` | 无（被新首页取代） | R10 | 删除 |
| 首页 | `home/events` | `HomeScreen`（活动列表） | イベント 主页 | R26 / R27 | 并入 |
| 人脈 | `(app)/contacts`、`contacts/list` | `ContactsScreen` | 人脈一覧 | R11 | 重写 |
| 人脈 | `contacts/[id]` | `ContactDetailScreen` | 連絡先詳細 | R11 | 重写 |
| 人脈 | `contacts/dashboard`、`contacts/graph`、`contacts/analysis/[dimension]/[bucketId]` | `ContactsDashboardScreen`、`ContactStructureDetailScreen` | 人脈分析（構造 / 機会 / インサイト） | R11 | 重写 |
| 人脈 | `contacts/intros` | `ContactIntrosScreen` | 无（邀请由招待コード、请人引荐由人物タイプ詳細「紹介ルート」承担） | R25 | R25 删除（已确认，2026-10-10；理由见 [plan-v2.2/DESIGN.md](plan-v2.2/DESIGN.md) §9 #20） |
| 人脈 | `contacts/pipeline` | `ContactPipelineScreen` | 无 | R11 | 删除 |
| 人脈 | `profile/suggestions` | `ProfileSuggestionsScreen` | 登録内容の更新提案 | R11 | 重写 |
| 加人 | `contacts/new` | `ContactAcquisitionScreen` | 「＋」sheet | R12 / R15 / R16 | 重写 |
| 加人 | `contacts/new/scan`、`contacts/new/batch/[id]`、`contacts/new/batch2`、`contacts/new/batch2/[id]`、`contacts/new/import/[id]` | 名片扫描 / 批量 / 导入 5 屏 | A1 名刺スキャン（b1、b9） | R12 / R15 / R16 | 重写（合并为一套流程） |
| 加人 | `contacts/new/manual` | `ManualContactAddScreen` | A3 手入力 | R12 / R15 / R16 | 重写 |
| 加人 | `invitations/[token]` | `RelationshipInvitationScreen` | A2 招待コード 受け取り側 | R12 / R15 / R16 | 重写 |
| iOrbit | `(app)/ai`、`ai/[id]` | `AiScreen`、`AiConversationScreen` | iOrbit 起始屏 / 会話中 / 会話リスト（b4） | R21 | 重写 |
| 活动 | `(app)/events` | `EventsScreen` | イベント 主页（評価 / 参加予定 / 探す）（b2） | R26 / R27 | 重写 |
| 活动 | `events/[id]` | `EventDetailScreen` | イベント詳細 + 会う準備 | R26 / R27 | 重写 |
| 活动 | `events/[id]/register`、`register`、`register/[code]` | `EventRegistrationScreen`、`RegisterInviteScreen` | 参加登録（AI 访谈式） | R26 / R27 | 重写 |
| 活动 | `events/[id]/live`、`events/[id]/attendees`、`events/[id]/participants/[participantId]`、`party`、`party/checkin`、`party/graph` | `EventLiveScreen`（其余为跳转） | 会場モード | R26 / R27 | 重写；跳转路由随之处理 |
| 主催 | `events/center` | `EventCenterScreen` | 運営センター（b6） | R17 | 重写 |
| 主催 | `events/[id]/operations`、`…/admission`、`…/check-in`、`…/experience`、`…/roles`、`events/[id]/analytics` | 运营 5 屏 + `EventAnalyticsScreen` | イベント運営 6 页签 / 受付 / レポート / 共同運営者 | R17 | 重写 |
| 主催 | `o/[slug]` | `OrganizerPublicScreen` | 主催者の公開ページ | R17 | 重写 |
| Task | `(app)/schedule`、`schedule/events/[id]`、`schedule/meetings/[id]`、`schedule/personal/[id]`、`schedule/personal/[id]/edit`、`schedule/personal/new`、`tasks/personal` | 日程 7 屏 | Task › カレンダー、面談の日程提案 | R20 | 重写 |
| Task | `today`、`tasks`、`tasks/[id]`、`tasks/relationship/[id]`、`followups` | `TodayScreen`、`TasksScreen`、`TaskDetailScreen`、`RelationshipLifecycleScreen`、`FollowupsScreen` | Task › To-do（判断待ち / 今日の一手 / フォロー）、下書きエディタ | R20 | 重写（合并） |
| Task | `agent`、`agent/actions`、`contacts/all-actions` | `AgentActionsScreen`、`AgentLedgerScreen` | To-do「判断待ち」 | R20 | 并入 |
| Task | `notes`、`notes/[id]`、`notes/[id]/edit`、`notes/new` | 笔记 4 屏 | Task › メモ | R20 | 重写 |
| 计划 | `contacts/matches` | `ContactNeedsMatchesScreen` | 人物タイプ詳細（候补） | R24（改跳转）/ R25（删除） | 重写 |
| 收件箱 | `(app)/inbox`、`inbox/[id]`、`inbox/notifications/[id]`、`inbox/sources/[id]` | `RelationshipInboxScreen`、`NotificationDetailScreen` | 受信箱（メッセージ / 通知、秘書）（b5） | R13 / R14 | 重写 |
| 收件箱 | `chat`、`chat/[id]` | `RelationshipChatScreen`、`RelationshipChatDetailScreen` | 受信箱 › メッセージ | R13 / R14 | 并入（**待核对**） |
| 账户 | `(app)/profile`、`profile/edit`、`profile/preview`、`profile/tags` | `ProfileScreen`、`EditProfileScreen`、`ProfilePreviewScreen`、`ProfileTagPickerScreen` | マイページ（b5、b7） | R18 | 重写 |
| 账户 | `settings`、`settings/api`、`profile/more` | `SettingsScreen`、`ApiSettingsScreen`、`ProfileMoreScreen` | 設定 | R18 | 重写 |
| 账户 | `account`、`account/login`、`account/signup`、`account/forgot-password`、`account/reset-password`、`account/permissions`、`account/mobile-google` | 认证 / 权限 6 屏 + 跳转 | 认证 4 态、権限（b7） | R18 | 重写 |
| 引导 | `profile/onboarding`、`profile/continue` | `ProfileOnboardingScreen`（continue 为跳转） | はじめの 3ステップ + 4 步引导（b1） | R28 | 重写 |
| 运营后台 | `admin`、`admin/access`、`admin/events`、`login-admin`、`platform` | `AdminScreen`、`AdminLoginScreen`、`PlatformScreen` | 无设计稿 | R29 | 换新 token + 新组件，不重画 |

## Web（`repos/orbits/app/`）

| 区域 | 路由 | 旧页面 | 新设计画面 | 归属 | 处理 |
| --- | --- | --- | --- | --- | --- |
| 公开 | `/`、`/app`（未登录） | `orbit-landing-0918` | 无新画板 | R18 | 换新 token + 新组件，不重画 |
| 首页 | `/app/home` | 重定向到 `/app/agent` | ホーム 组件容器（web.html） | R10 | 重写（新首页真正落在这里） |
| 首页 | `/app/home/events` | 活动列表 | イベント 主页 | R26 / R27 | 并入 |
| 人脈 | `/app/contacts` | `network-0918/network-all` | 人脈一覧 | R11 | 重写 |
| 人脈 | `/app/contacts/[id]` | 联系人详情（W0059） | 連絡先詳細 | R11 | 重写 |
| 人脈 | `/app/contacts/dashboard`、`/app/contacts/analysis/[dimension]/[bucketId]` | 人脉分析 | 人脈分析 | R11 | 重写 |
| 人脈 | `/app/contacts/pipeline` | pipeline | 无 | R11 | 删除 |
| 加人 | `/app/contacts/new` | `card-batch-0918`、network-import | 「＋」/ 名刺スキャン / 手入力 / 取り込み | R12 / R15 / R16 | 重写 |
| 加人 | `/app/invitations/[token]`；新增 `/i/[code]` | 一对一邀请 | A2 招待コード 受け取り側（响应式） | R12 / R15 / R16 | 重写 + 新建 |
| iOrbit | `/app/agent` | `iorbit-0918`（含星空首页、历史抽屉） | iOrbit 起始屏 / 会話中 / 会話リスト（b4） | R21 | 重写 |
| 活动 | `/app/events`、`/app/events/[id]`、`/app/events/[id]/register`、`/app/register` | `events-0918`、报名工作台 | イベント 主页 / 詳細 / 参加登録（b2） | R26 / R27 | 重写 |
| 活动 | `/app/events/[id]/live` | 会场页 | 会場モード | R26 / R27 | 重写 |
| 主催 | `/app/events/center`、`/app/events/[id]/operations`、`…/admission`、`…/check-in`、`…/experience`、`/app/events/[id]/analytics` | `ops-0918` | 運営センター / イベント運営 / 受付 kiosk / レポート（b6） | R17 | 重写 |
| 主催 | `/app/o/[slug]` | `orbit-real-organizer-public` | 主催者の公開ページ | R17 | 重写 |
| Task | `/app/tasks`、`/app/tasks/[id]`、`/app/tasks/relationship/[id]`、`/app/agent/actions` | 任务页、Agent 决策 | Task › To-do | R20 | 重写 |
| Task | `/app/tasks/personal` | 个人日程 | Task › カレンダー | R20 | 重写 |
| Task | 新增 Web メモ | 无 | Task › メモ | R20 | 新建 |
| 计划 | `/app/agent/plan`、`/app/agent/strategy` | `iorbit-plan`、策略页 | Task › プラン、計画 v2.2 生成流程、人物タイプ詳細（b4、b9、b10） | R23–R25（插槽分三步换，R25 删旧页与兼容跳转） | 重写 |
| 收件箱 | `/app/inbox/sources/[id]`；新增 `/app/inbox` | 右侧滑出面板 | 受信箱 列表页（b5） | R13 / R14 | 重写 + 新建 |
| 账户 | `/app/profile`、`/app/settings` | `profile-0918` | マイページ / 設定（b5、b7） | R18 | 重写 |
| 账户 | `/app/account/login`、`…/signup`、`…/forgot-password`、`…/reset-password`、`…/mobile-google` | `auth-0918` | 认证 4 态（b7） | R18 | 重写 |
| 引导 | `/app/start`、`/app/profile/onboarding`、`/app/profile/continue` | 开始指南、`onboarding-0918` | はじめの 3ステップ + 4 步引导（b1） | R28 | 重写 |
| 运营后台 | `/app/admin`、`/app/admin/access`、`/app/admin/events`、`/app/admin/read-cost`、`/app/login-admin`、`/app/platform` | 后台页面 | 无设计稿 | R29 | 换新 token + 新组件，不重画 |

## 已决定（2026-10-09，用户：都按推荐）

| # | 内容 | 决定 |
| --- | --- | --- |
| 1 | 新用户引导（App `profile/onboarding`，Web `/app/start`、`/app/profile/onboarding`） | 新开 **R28 引导**，按 b1 和 iOrbit 引导定稿（4 步，1–3 硬顺序）重写；第 4 步「生成计划」依赖 R22–R25，排在其后 |
| 2 | 运营后台（`admin`、`platform`、`read-cost`、`login-admin`） | 新开 **R29 运营后台换新**：不按设计稿重画，在 R04 / R06 组件库完成后只换新 token 和新组件 |
| 3 | 落地页（Web `/`） | 不重做，并入 **R18**：只换新 token 和新组件 |
| 4 | `contacts/pipeline`（两端） | 由 **R11** 删除；阶段信息在人脈一覧和 Task 里体现 |
| 5 | App `contacts/intros`、`chat` | 暂按表中归属（R22–R25 / R13·R14 并入）；写这两组功能 Sprint 文档时核对，确认并入还是删除。**`contacts/intros` 已核对（2026-10-10，计划 v2.2 文档）：R25 删除（用户已确认 2026-10-10）** |

R28、R29 的负责人在写功能 Sprint 文档时由用户指定。

## 维护规则

- 新增路由时同时登记本表。
- 功能 Sprint 的 PLANNER 引用本表的行作为范围；REPORT 写明哪些旧文件已删。
- R09 骨架验收核对：每一行都有归属，「未分配」和「待定」都已有决定。
