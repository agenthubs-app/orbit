# R02 对照表：Ionicons → 新图标

给功能 Sprint 整屏重写旧屏时查用（RD-24）。新图标全部在 `repos/orbits/shared/design/icons.json`，两端用 `<Icon name="…" />`。**这里没有的语义先查本表；本表已按全部 Ionicons 用法一次画齐，功能 Sprint 不再各自补画。** 真的出现新语义时，按 `shared/design/README.md`「图标」一节补进图标源，并在本表加一行。

- 统计时间：2026-10-09，`redesign` HEAD `3a6ebb4d` 之后（R02 开工时）。
- 统计方法：用 TypeScript 类型检查器遍历 App `src/`、`app/` 全部 `.ts/.tsx`，凡字符串字面量的上下文类型是 Ionicons 图标名联合类型（`name` 属性、`keyof typeof Ionicons.glyphMap`、`ComponentProps<typeof Ionicons>["name"]`），或是写成字面量联合 / `as const` 的图标名，都计一次。脚本见 REPORT「证据」。
- 结果：**114 个 Ionicons 名，446 处用法**。图标名出现在 73 个文件里：72 个 import Ionicons 的文件中的 71 个（`src/screens/inbox/NotificationDetailScreen.tsx` 的图标名来自 `NotificationInboxList.tsx` 的映射，算在后者），加 2 个不 import Ionicons、只把图标名当数据传出去的文件（`src/screens/contacts/BusinessCardIngestScreen.tsx`、`src/view-models/events.ts`）。import Ionicons 的 72 个文件记在允许清单 `repos/orbit-app/tests/fixtures/ionicons-legacy-allowlist.json`。
- 「新图标」列带 `*` 的是本 Sprint 补画（`source: "drawn"`），其余来自设计稿 `kit`。

| Ionicons | 新图标 | 用法（处 / 文件） | 说明 |
| --- | --- | --- | --- |
| `add` | `plus` | 12 / 11 |  |
| `add-circle-outline` | `plus` | 3 / 3 | 新图标放在圆形浅底上（01-system 功能图标规则），不另画带圈版 |
| `add-outline` | `plus` | 1 / 1 |  |
| `alert-circle-outline` | `alert` | 4 / 3 |  |
| `analytics-outline` | `chart` | 1 / 1 |  |
| `archive-outline` | `archive` * | 1 / 1 |  |
| `arrow-back` | `left` | 3 / 3 | 返回统一用设计稿的 left |
| `arrow-back-outline` | `left` | 3 / 3 | 同上 |
| `arrow-forward` | `arrow` * | 8 / 7 | 「下一步 / 前往」 |
| `arrow-forward-circle-outline` | `arrow` * | 1 / 1 | 放在圆形浅底上 |
| `arrow-forward-outline` | `arrow` * | 1 / 1 |  |
| `arrow-up-right-box-outline` | `out` | 3 / 1 | 打开外部页面 |
| `at` | `at` * | 1 / 1 | @ 提及 |
| `bulb-outline` | `bulb` * | 2 / 2 | 提示 / 建议 |
| `business-outline` | `brief` | 1 / 1 | 公司 |
| `calendar-clear-outline` | `calendar` | 1 / 1 |  |
| `calendar-outline` | `calendar` | 15 / 13 |  |
| `camera-outline` | `camera` * | 3 / 3 |  |
| `caret-down` | `down` | 3 / 2 |  |
| `caret-up` | `up` * | 2 / 1 |  |
| `chatbubble-ellipses-outline` | `chat` * | 1 / 1 |  |
| `chatbubble-outline` | `chat` * | 2 / 2 |  |
| `chatbubbles-outline` | `chat` * | 1 / 1 |  |
| `checkbox` | `task` | 1 / 1 | 已勾选；设计稿 task 即带勾方框 |
| `checkbox-outline` | `task` | 6 / 5 |  |
| `checkmark` | `check` | 9 / 9 |  |
| `checkmark-circle` | `check-circle` * | 3 / 3 | 完成态配 ok 色（RD-17） |
| `checkmark-circle-outline` | `check-circle` * | 11 / 9 |  |
| `checkmark-done` | `check-double` * | 1 / 1 |  |
| `checkmark-done-outline` | `check-double` * | 4 / 4 |  |
| `checkmark-outline` | `check` | 8 / 7 |  |
| `chevron-back` | `left` | 13 / 13 |  |
| `chevron-down` | `down` | 8 / 8 |  |
| `chevron-down-outline` | `down` | 1 / 1 |  |
| `chevron-forward` | `right` | 55 / 33 |  |
| `chevron-forward-outline` | `right` | 1 / 1 |  |
| `chevron-up` | `up` * | 7 / 7 |  |
| `chevron-up-outline` | `up` * | 1 / 1 |  |
| `close` | `x` | 9 / 8 |  |
| `close-circle` | `x-circle` * | 8 / 8 | 清空输入框 |
| `close-circle-outline` | `x-circle` * | 1 / 1 |  |
| `close-outline` | `x` | 6 / 5 |  |
| `cloud-upload-outline` | `upload` * | 2 / 2 |  |
| `construct-outline` | `settings` | 1 / 1 | 运营 / 管理入口 |
| `copy-outline` | `copy` | 2 / 2 |  |
| `create-outline` | `edit` | 6 / 5 |  |
| `diamond-outline` | `star` | 1 / 1 | 人脉价值标记 |
| `document-attach-outline` | `attach` * | 1 / 1 | 附件 |
| `document-outline` | `note` | 1 / 1 |  |
| `document-text-outline` | `note` | 4 / 4 |  |
| `ellipse` | `dot` * | 1 / 1 | 未读 / 状态小圆点 |
| `ellipse-outline` | `circle` * | 2 / 2 | 未选中的单选 |
| `ellipsis-horizontal` | `more` | 3 / 2 |  |
| `eye-off-outline` | `eye-off` * | 1 / 1 |  |
| `eye-outline` | `eye` * | 3 / 3 |  |
| `file-tray-full-outline` | `inbox` | 1 / 1 |  |
| `flag-outline` | `flag` | 4 / 3 |  |
| `flame-outline` | `flame` * | 1 / 1 | 热度 |
| `flash-outline` | `bolt` * | 1 / 1 | 快捷操作 |
| `folder-open-outline` | `folder` * | 1 / 1 | 分组 |
| `git-branch-outline` | `route` | 1 / 1 | 关系路径 |
| `git-compare-outline` | `swap` * | 1 / 1 | 介绍 / 互换 |
| `git-merge-outline` | `merge` * | 1 / 1 | 合并重复 |
| `git-network-outline` | `route` | 4 / 3 | 关系网络 |
| `heart-outline` | `heart` * | 2 / 1 |  |
| `id-card-outline` | `id-card` * | 1 / 1 | 名片 |
| `image-outline` | `image` | 6 / 4 |  |
| `images-outline` | `images` * | 4 / 4 | 多张照片 / 批量 |
| `information-circle-outline` | `info` * | 2 / 1 |  |
| `key-outline` | `key` * | 1 / 1 | 所有者权限 |
| `layers-outline` | `layers` | 1 / 1 |  |
| `list-outline` | `list` | 1 / 1 |  |
| `location-outline` | `pin` | 6 / 6 | 地点（设计稿 pin 是定位针） |
| `lock-closed` | `lock` * | 1 / 1 |  |
| `lock-closed-outline` | `lock` * | 6 / 5 |  |
| `log-in-outline` | `login` * | 3 / 3 |  |
| `logo-google` | （不收） | 1 / 1 | 品牌标志不进线性图标集：按 Google 登录按钮规范用官方多色 G 标，由账户 Sprint（R18）放进按钮 |
| `mail-outline` | `mail` | 2 / 2 |  |
| `mail-unread-outline` | `mail` | 1 / 1 | 未读用 dot 叠在右上 |
| `map-outline` | `map` * | 1 / 1 |  |
| `menu-outline` | `menu` | 1 / 1 |  |
| `navigate-outline` | `navigate` * | 1 / 1 | 导航 / 路线 |
| `notifications-outline` | `bell` | 1 / 1 |  |
| `options-outline` | `sliders` | 1 / 1 |  |
| `paper-plane-outline` | `send` | 2 / 2 |  |
| `pencil-outline` | `pen` | 2 / 1 |  |
| `people-circle-outline` | `users` | 1 / 1 |  |
| `people-outline` | `users` | 16 / 11 |  |
| `person-add-outline` | `user-plus` * | 5 / 4 |  |
| `person-circle-outline` | `user` | 3 / 3 |  |
| `person-outline` | `user` | 9 / 9 |  |
| `pie-chart-outline` | `chart` | 1 / 1 | 图表本身用 ring() 画；入口图标统一 chart |
| `pin-outline` | `pushpin` * | 2 / 2 | 置顶（不是地点，地点用 pin） |
| `play-skip-forward-outline` | `skip` * | 1 / 1 | 跳过 |
| `refresh` | `refresh` | 2 / 2 |  |
| `refresh-outline` | `refresh` | 18 / 10 |  |
| `remove` | `minus` * | 1 / 1 |  |
| `remove-circle-outline` | `minus` * | 2 / 2 | 放在圆形浅底上 |
| `save-outline` | `save` * | 4 / 4 | 保存 |
| `scan-outline` | `scan` | 6 / 5 |  |
| `search` | `search` | 5 / 5 |  |
| `search-outline` | `search` | 6 / 5 |  |
| `settings-outline` | `settings` | 1 / 1 |  |
| `share-outline` | `share` | 1 / 1 |  |
| `shield-checkmark-outline` | `shield` * | 4 / 4 | 隐私 / 安全 |
| `sparkles` | `sparkle` | 3 / 3 |  |
| `sparkles-outline` | `sparkle` | 11 / 10 |  |
| `square-outline` | `square` * | 3 / 2 | 未勾选 |
| `stats-chart-outline` | `chart` | 1 / 1 |  |
| `sunny-outline` | `sun` * | 1 / 1 | 与 moon 成对（外观设置） |
| `swap-horizontal-outline` | `swap` * | 2 / 2 |  |
| `ticket-outline` | `ticket` | 1 / 1 |  |
| `time-outline` | `clock` | 17 / 16 |  |
| `trash-outline` | `trash` | 3 / 3 |  |

## 补画清单（38 个）

风格照搬 `kit/ui.css:15`：24 × 24 视框，1.7 描边，圆头圆角，无填充；实心小点用 `fill="currentColor"`。圆角矩形外框的圆角与设计稿同档（3 / 3.5 / 4.5）。

| 名字 | 替代的 Ionicons | 用途 |
| --- | --- | --- |
| `arrow` | `arrow-forward`, `arrow-forward-circle-outline`, `arrow-forward-outline` | 「下一步 / 前往」 |
| `up` | `caret-up`, `chevron-up`, `chevron-up-outline` |  |
| `minus` | `remove`, `remove-circle-outline` | 放在圆形浅底上 |
| `circle` | `ellipse-outline` | 未选中的单选 |
| `dot` | `ellipse` | 未读 / 状态小圆点 |
| `square` | `square-outline` | 未勾选 |
| `check-circle` | `checkmark-circle`, `checkmark-circle-outline` | 完成态配 ok 色（RD-17） |
| `check-double` | `checkmark-done`, `checkmark-done-outline` |  |
| `x-circle` | `close-circle`, `close-circle-outline` | 清空输入框 |
| `info` | `information-circle-outline` |  |
| `at` | `at` | @ 提及 |
| `chat` | `chatbubble-ellipses-outline`, `chatbubble-outline`, `chatbubbles-outline` |  |
| `camera` | `camera-outline` |  |
| `images` | `images-outline` | 多张照片 / 批量 |
| `id-card` | `id-card-outline` | 名片 |
| `user-plus` | `person-add-outline` |  |
| `lock` | `lock-closed`, `lock-closed-outline` |  |
| `key` | `key-outline` | 所有者权限 |
| `shield` | `shield-checkmark-outline` | 隐私 / 安全 |
| `login` | `log-in-outline` |  |
| `eye` | `eye-outline` |  |
| `eye-off` | `eye-off-outline` |  |
| `bulb` | `bulb-outline` | 提示 / 建议 |
| `bolt` | `flash-outline` | 快捷操作 |
| `flame` | `flame-outline` | 热度 |
| `heart` | `heart-outline` |  |
| `sun` | `sunny-outline` | 与 moon 成对（外观设置） |
| `folder` | `folder-open-outline` | 分组 |
| `archive` | `archive-outline` |  |
| `attach` | `document-attach-outline` | 附件 |
| `upload` | `cloud-upload-outline` |  |
| `save` | `save-outline` | 保存 |
| `swap` | `git-compare-outline`, `swap-horizontal-outline` | 介绍 / 互换 |
| `merge` | `git-merge-outline` | 合并重复 |
| `map` | `map-outline` |  |
| `navigate` | `navigate-outline` | 导航 / 路线 |
| `pushpin` | `pin-outline` | 置顶（不是地点，地点用 pin） |
| `skip` | `play-skip-forward-outline` | 跳过 |

## 不收进图标集的

- `logo-google`：品牌标志，按 Google 登录按钮规范使用官方多色 G 标（成熟做法：Google Identity 品牌规范要求用官方标志，不允许改成单色线性图标）。由账户 Sprint（R18）重写登录页时放进按钮。

## 使用位置

每个 Ionicons 名的具体文件和行号（开工时快照，之后旧屏删掉会变少）：

<details><summary>展开</summary>

- `add`：`src/screens/ai/AiConversationScreen.tsx`:1078；`src/screens/ai/AiScreen.tsx`:1040；`src/screens/contacts/ContactDetailScreen.tsx`:762；`src/screens/contacts/ContactNotesSection.tsx`:158；`src/screens/contacts/ContactsScreen.tsx`:2094；`src/screens/events/EventExperienceContent.tsx`:106,136；`src/screens/notes/NoteContactPicker.tsx`:93；`src/screens/notes/NoteEventPicker.tsx`:21；`src/screens/notes/NotesScreen.tsx`:65；`src/screens/schedule/ScheduleScreen.tsx`:161；`src/screens/tasks/TasksScreen.tsx`:145
- `add-circle-outline`：`src/screens/contacts/BusinessCardIngestStartScreen.tsx`:235；`src/screens/contacts/ContactsScreen.tsx`:1322；`src/screens/today/TodayScreen.tsx`:271
- `add-outline`：`src/screens/contacts/ContactAcquisitionScreen.tsx`:837
- `alert-circle-outline`：`src/screens/ai/AiConversationScreen.tsx`:1034,1126；`src/screens/events/EventCenterContent.tsx`:83；`src/screens/register/RegisterInviteScreen.tsx`:236
- `analytics-outline`：`src/screens/contacts/ContactsScreen.tsx`:1285
- `archive-outline`：`src/screens/contacts/ContactAcquisitionScreen.tsx`:2031
- `arrow-back`：`src/screens/events/EventAdmissionReviewContent.tsx`:72；`src/screens/events/EventExperienceContent.tsx`:77；`src/screens/events/EventRolesScreen.tsx`:196
- `arrow-back-outline`：`src/screens/ai/AiConversationScreen.tsx`:692；`src/screens/events/EventRegistrationScreen.tsx`:853；`src/screens/inbox/RelationshipInboxScreen.tsx`:558
- `arrow-forward`：`src/screens/admin/AdminLoginScreen.tsx`:36；`src/screens/ai/AiScreen.tsx`:745；`src/screens/contacts/ContactsDashboardScreen.tsx`:703,982；`src/screens/events/EventCenterContent.tsx`:90；`src/screens/profile/AccountAuthScreen.tsx`:311；`src/screens/profile/AccountScreen.tsx`:260；`src/screens/profile/PasswordResetScreen.tsx`:149
- `arrow-forward-circle-outline`：`src/screens/register/RegisterInviteScreen.tsx`:229
- `arrow-forward-outline`：`src/screens/inbox/RelationshipInboxScreen.tsx`:727
- `arrow-up-right-box-outline`：`src/screens/ai/AiConversationScreen.tsx`:1178,1183,1264
- `at`：`src/screens/notes/NoteMentionEditor.tsx`:88
- `bulb-outline`：`src/screens/contacts/ContactStructureDetailScreen.tsx`:162；`src/screens/contacts/ContactsDashboardScreen.tsx`:1000
- `business-outline`：`src/screens/contacts/ContactsDashboardScreen.tsx`:1240
- `calendar-clear-outline`：`src/screens/schedule/ScheduleScreen.tsx`:534
- `calendar-outline`：`src/screens/ai/AiConversationScreen.tsx`:1200,1262；`src/screens/ai/AiScreen.tsx`:95,743；`src/screens/ai/OrbitNextActions.tsx`:84；`src/screens/ai/cards/AiEntityCard.tsx`:18；`src/screens/ai/cards/AiEntityDraftCard.tsx`:18；`src/screens/events/live/EventLiveScreen.tsx`:281；`src/screens/home/HomeDashboardScreen.tsx`:356；`src/screens/notes/NoteDetailScreen.tsx`:165；`src/screens/notes/NoteEventPicker.tsx`:22；`src/screens/notes/NotesScreen.tsx`:90；`src/screens/profile/AccountPermissionsScreen.tsx`:207；`src/screens/schedule/ScheduleEventPreviewScreen.tsx`:117；`src/screens/schedule/ScheduleScreen.tsx`:101
- `camera-outline`：`src/screens/contacts/BusinessCardScanScreen.tsx`:262；`src/screens/contacts/ContactAcquisitionScreen.tsx`:799；`src/screens/profile/EditProfileScreen.tsx`:118
- `caret-down`：`src/screens/contacts/ContactDetailScreen.tsx`:792,838；`src/screens/events/EventsScreen.tsx`:365
- `caret-up`：`src/screens/contacts/ContactDetailScreen.tsx`:792,838
- `chatbubble-ellipses-outline`：`src/screens/events/EventDetailScreen.tsx`:1124
- `chatbubble-outline`：`src/screens/ai/AiScreen.tsx`:1248；`src/screens/events/EventRegistrationScreen.tsx`:1023
- `chatbubbles-outline`：`src/screens/chat/RelationshipChatScreen.tsx`:108
- `checkbox`：`src/screens/contacts/BusinessCardScanScreen.tsx`:235
- `checkbox-outline`：`src/screens/ai/AiConversationScreen.tsx`:1262；`src/screens/ai/AiScreen.tsx`:743；`src/screens/ai/cards/AiEntityCard.tsx`:21；`src/screens/ai/cards/AiEntityDraftCard.tsx`:21；`src/screens/contacts/ContactAcquisitionScreen.tsx`:1240,1251
- `checkmark`：`src/screens/ai/AiConversationScreen.tsx`:1126；`src/screens/ai/AiSessionOrganization.tsx`:86；`src/screens/contacts/ContactDetailScreen.tsx`:874；`src/screens/events/EventAdmissionReviewContent.tsx`:141；`src/screens/events/EventCheckInContent.tsx`:145；`src/screens/events/live/EventLiveScreen.tsx`:179；`src/screens/profile/onboarding/ProfileOnboardingScreen.tsx`:417；`src/screens/tasks/TaskDetailScreen.tsx`:526；`src/screens/tasks/TasksScreen.tsx`:189
- `checkmark-circle`：`src/screens/events/EventCheckInContent.tsx`:145；`src/screens/notes/NoteContactPicker.tsx`:122；`src/screens/notes/NoteEventPicker.tsx`:23
- `checkmark-circle-outline`：`src/screens/ai/AgentActionsScreen.tsx`:179；`src/screens/contacts/BusinessCardScanScreen.tsx`:185；`src/screens/contacts/ContactAcquisitionScreen.tsx`:1671,1812,1999；`src/screens/contacts/ContactsDashboardScreen.tsx`:644；`src/screens/contacts/ManualContactAddScreen.tsx`:121；`src/screens/dashboard/DashboardScreen.tsx`:667；`src/screens/events/EventAdmissionReviewContent.tsx`:147；`src/screens/events/EventCenterContent.tsx`:124；`src/screens/register/RegisterInviteScreen.tsx`:225
- `checkmark-done`：`src/screens/today/TodayScreen.tsx`:318
- `checkmark-done-outline`：`src/components/BusinessCardBatchReviewForm.tsx`:86；`src/screens/ai/AiConversationScreen.tsx`:1204；`src/screens/contacts/BusinessCardBatchScreen.tsx`:298；`src/screens/events/EventDetailScreen.tsx`:1305
- `checkmark-outline`：`src/components/BusinessCardBatchReviewForm.tsx`:90；`src/screens/ai/AgentActionsScreen.tsx`:265；`src/screens/contacts/ContactAcquisitionScreen.tsx`:1286,1892；`src/screens/events/EventDetailScreen.tsx`:1009；`src/screens/events/EventRegistrationScreen.tsx`:892；`src/screens/inbox/RelationshipInboxScreen.tsx`:1582；`src/screens/profile/ProfileScreen.tsx`:1504
- `chevron-back`：`src/components/AppScreen.tsx`:71；`src/screens/ai/AiConversationScreen.tsx`:885；`src/screens/ai/AiScreen.tsx`:894；`src/screens/contacts/BusinessCardImportScreen.tsx`:168；`src/screens/contacts/ContactPage.tsx`:58；`src/screens/events/EventDetailScreen.tsx`:173；`src/screens/events/Registration7aViews.tsx`:41；`src/screens/events/live/EventLiveScreen.tsx`:95；`src/screens/inbox/RelationshipInboxScreen.tsx`:783；`src/screens/profile/AccountAuthScreen.tsx`:270；`src/screens/profile/ProfilePagePrimitives.tsx`:38；`src/screens/profile/onboarding/OnboardingParts.tsx`:29；`src/screens/schedule/ScheduleScreen.tsx`:342
- `chevron-down`：`src/screens/contacts/ContactDetailScreen.tsx`:653；`src/screens/contacts/ContactNotesSection.tsx`:124；`src/screens/contacts/ContactsDashboardScreen.tsx`:1662；`src/screens/contacts/ContactsScreen.tsx`:524；`src/screens/contacts/ManualContactAddScreen.tsx`:179；`src/screens/events/EventExperienceContent.tsx`:113；`src/screens/events/EventsScreen.tsx`:669；`src/screens/profile/onboarding/ProfileOnboardingScreen.tsx`:393
- `chevron-down-outline`：`src/screens/inbox/RelationshipInboxScreen.tsx`:1013
- `chevron-forward`：`src/screens/ai/AiScreen.tsx`:753,760,1345；`src/screens/ai/OrbitNextActions.tsx`:93,107；`src/screens/ai/cards/AiEntityCard.tsx`:43；`src/screens/chat/RelationshipChatScreen.tsx`:148；`src/screens/contacts/BusinessCardScanScreen.tsx`:301；`src/screens/contacts/ContactAcquisitionScreen.tsx`:1041；`src/screens/contacts/ContactNeedsEditor.tsx`:66；`src/screens/contacts/ContactNeedsMatchesContent.tsx`:134；`src/screens/contacts/ContactNotesSection.tsx`:131；`src/screens/contacts/ContactPipelineScreen.tsx`:253；`src/screens/contacts/ContactStructureDetailScreen.tsx`:230；`src/screens/contacts/ContactsDashboardScreen.tsx`:1436,1526；`src/screens/contacts/ContactsScreen.tsx`:789,1194,1229,1273,1514,1517；`src/screens/dashboard/DashboardScreen.tsx`:683；`src/screens/events/EventAdmissionReviewContent.tsx`:251；`src/screens/events/EventCenterContent.tsx`:170；`src/screens/events/EventsScreen.tsx`:219,418,470；`src/screens/events/Registration7aViews.tsx`:60；`src/screens/events/live/EventLiveScreen.tsx`:192；`src/screens/home/HomeDashboardScreen.tsx`:276,362；`src/screens/notes/NoteDetailScreen.tsx`:165；`src/screens/organizer/OrganizerPublicScreen.tsx`:201；`src/screens/profile/AccountScreen.tsx`:175,232,240；`src/screens/profile/ProfilePagePrimitives.tsx`:97；`src/screens/profile/ProfileScreen.tsx`:632,1342；`src/screens/register/RegisterInviteScreen.tsx`:66,377；`src/screens/schedule/MeetingDetailScreen.tsx`:245；`src/screens/schedule/ScheduleEventPreviewScreen.tsx`:151；`src/screens/schedule/ScheduleScreen.tsx`:346,784；`src/screens/settings/SettingsScreen.tsx`:236；`src/screens/tasks/TaskDetailScreen.tsx`:551,556,561,567,584；`src/screens/tasks/TasksScreen.tsx`:208；`src/screens/today/TodayScreen.tsx`:320,407
- `chevron-forward-outline`：`src/screens/contacts/BusinessCardIngestStartScreen.tsx`:257
- `chevron-up`：`src/screens/contacts/ContactDetailScreen.tsx`:653；`src/screens/contacts/ContactNotesSection.tsx`:124；`src/screens/contacts/ContactsDashboardScreen.tsx`:1662；`src/screens/contacts/ContactsScreen.tsx`:524；`src/screens/contacts/ManualContactAddScreen.tsx`:179；`src/screens/events/EventsScreen.tsx`:669；`src/screens/profile/onboarding/ProfileOnboardingScreen.tsx`:393
- `chevron-up-outline`：`src/screens/inbox/RelationshipInboxScreen.tsx`:728
- `close`：`src/screens/ai/AiScreen.tsx`:1193,1446；`src/screens/ai/AiSessionOrganization.tsx`:71；`src/screens/contacts/ContactDetailScreen.tsx`:761；`src/screens/contacts/ContactsDashboardScreen.tsx`:621；`src/screens/events/live/LivePersonSheet.tsx`:70；`src/screens/notes/NoteContactPicker.tsx`:93；`src/screens/notes/NoteEventPicker.tsx`:21；`src/screens/tasks/TaskDetailScreen.tsx`:606
- `close-circle`：`src/screens/contacts/ContactNotesSection.tsx`:138；`src/screens/contacts/ContactsScreen.tsx`:1462；`src/screens/events/EventCheckInContent.tsx`:107；`src/screens/events/EventsScreen.tsx`:357；`src/screens/home/HomeScreen.tsx`:241；`src/screens/notes/NoteContactPicker.tsx`:101；`src/screens/notes/NoteEventPicker.tsx`:22；`src/screens/notes/NotesScreen.tsx`:75
- `close-circle-outline`：`src/screens/contacts/BusinessCardIngestScreen.tsx`:432
- `close-outline`：`src/screens/ai/AgentActionsScreen.tsx`:281；`src/screens/contacts/BusinessCardIngestStartScreen.tsx`:248；`src/screens/contacts/ContactAcquisitionScreen.tsx`:978；`src/screens/events/EventRegistrationScreen.tsx`:908；`src/screens/inbox/RelationshipInboxScreen.tsx`:905,1575
- `cloud-upload-outline`：`src/screens/contacts/BusinessCardIngestScreen.tsx`:429；`src/screens/contacts/ContactAcquisitionScreen.tsx`:1539
- `construct-outline`：`src/screens/events/EventCenterContent.tsx`:157
- `copy-outline`：`src/screens/contacts/BusinessCardIngestScreen.tsx`:400；`src/screens/contacts/BusinessCardIngestStartScreen.tsx`:246
- `create-outline`：`src/screens/ai/AiScreen.tsx`:1115,1208；`src/screens/contacts/BusinessCardIngestScreen.tsx`:438；`src/screens/contacts/ContactAcquisitionScreen.tsx`:805；`src/screens/profile/ProfileScreen.tsx`:970；`src/screens/tasks/TaskDetailScreen.tsx`:492
- `diamond-outline`：`src/screens/contacts/ContactsDashboardScreen.tsx`:1463
- `document-attach-outline`：`src/screens/profile/ProfileScreen.tsx`:841
- `document-outline`：`src/screens/contacts/BusinessCardBatchScreen.tsx`:292
- `document-text-outline`：`src/screens/ai/cards/AiEntityCard.tsx`:19；`src/screens/ai/cards/AiEntityDraftCard.tsx`:19；`src/screens/contacts/ContactNotesSection.tsx`:130；`src/screens/profile/ProfileScreen.tsx`:823
- `ellipse`：`src/screens/inbox/RelationshipInboxScreen.tsx`:1129
- `ellipse-outline`：`src/screens/notes/NoteContactPicker.tsx`:122；`src/screens/notes/NoteEventPicker.tsx`:23
- `ellipsis-horizontal`：`src/screens/ai/AiConversationScreen.tsx`:903,1092；`src/screens/ai/AiScreen.tsx`:1614
- `eye-off-outline`：`src/screens/profile/AccountAuthScreen.tsx`:480
- `eye-outline`：`src/screens/events/EventExperienceContent.tsx`:141；`src/screens/inbox/RelationshipInboxScreen.tsx`:891；`src/screens/profile/AccountAuthScreen.tsx`:480
- `file-tray-full-outline`：`src/screens/ai/AiScreen.tsx`:1184
- `flag-outline`：`src/screens/contacts/ContactsDashboardScreen.tsx`:1572；`src/screens/events/EventDetailScreen.tsx`:913；`src/view-models/events.ts`:507,560
- `flame-outline`：`src/screens/contacts/ContactsDashboardScreen.tsx`:1294
- `flash-outline`：`src/screens/ai/AiConversationScreen.tsx`:1262
- `folder-open-outline`：`src/screens/ai/AiScreen.tsx`:1436
- `git-branch-outline`：`src/screens/contacts/ContactsDashboardScreen.tsx`:1456
- `git-compare-outline`：`src/screens/contacts/ContactIntrosScreen.tsx`:208
- `git-merge-outline`：`src/screens/contacts/ContactAcquisitionScreen.tsx`:2095
- `git-network-outline`：`src/screens/contacts/ContactAcquisitionScreen.tsx`:1839；`src/screens/contacts/ContactsScreen.tsx`:1500；`src/view-models/events.ts`:503,554
- `heart-outline`：`src/screens/contacts/ContactsDashboardScreen.tsx`:1237,1283
- `id-card-outline`：`src/screens/profile/ProfileScreen.tsx`:817
- `image-outline`：`src/screens/contacts/BusinessCardBatchScreen.tsx`:278；`src/screens/contacts/BusinessCardIngestScreen.tsx`:400,424,439；`src/screens/contacts/BusinessCardScanScreen.tsx`:269；`src/screens/profile/ProfileScreen.tsx`:829
- `images-outline`：`src/screens/contacts/BusinessCardIngestScreen.tsx`:428；`src/screens/contacts/BusinessCardIngestStartScreen.tsx`:235；`src/screens/contacts/ContactAcquisitionScreen.tsx`:811；`src/screens/profile/ProfileScreen.tsx`:835
- `information-circle-outline`：`src/view-models/events.ts`:514,548
- `key-outline`：`src/screens/events/EventRolesContent.tsx`:60
- `layers-outline`：`src/screens/contacts/ContactsDashboardScreen.tsx`:1276
- `list-outline`：`src/screens/contacts/ContactsScreen.tsx`:1314
- `location-outline`：`src/screens/admin/AdminScreen.tsx`:297；`src/screens/contacts/ContactsDashboardScreen.tsx`:1229；`src/screens/events/EventCenterContent.tsx`:67；`src/screens/home/HomeScreen.tsx`:393；`src/screens/platform/PlatformScreen.tsx`:176；`src/screens/schedule/MeetingDetailScreen.tsx`:186
- `lock-closed`：`src/screens/admin/AdminScreen.tsx`:334
- `lock-closed-outline`：`src/screens/events/EventOperationsContent.tsx`:73；`src/screens/events/live/EventLiveScreen.tsx`:133；`src/screens/notes/NoteDetailScreen.tsx`:135；`src/screens/register/RegisterInviteScreen.tsx`:212,233；`src/screens/schedule/ScheduleEventPreviewScreen.tsx`:84
- `log-in-outline`：`src/screens/admin/AdminLoginScreen.tsx`:36；`src/screens/profile/AccountPermissionsScreen.tsx`:149；`src/screens/profile/ProfileScreen.tsx`:485
- `logo-google`：`src/screens/profile/AccountAuthScreen.tsx`:391
- `mail-outline`：`src/screens/contacts/ContactIntrosScreen.tsx`:394；`src/screens/events/EventDetailScreen.tsx`:1284
- `mail-unread-outline`：`src/screens/inbox/RelationshipInboxScreen.tsx`:1436
- `map-outline`：`src/view-models/events.ts`:511
- `menu-outline`：`src/screens/ai/AiScreen.tsx`:1120
- `navigate-outline`：`src/screens/contacts/ContactsDashboardScreen.tsx`:1370
- `notifications-outline`：`src/screens/contacts/ContactsDashboardScreen.tsx`:1297
- `options-outline`：`src/screens/contacts/ContactsScreen.tsx`:1467
- `paper-plane-outline`：`src/screens/ai/AiConversationScreen.tsx`:1092；`src/screens/ai/AiScreen.tsx`:1055
- `pencil-outline`：`src/screens/inbox/RelationshipInboxScreen.tsx`:1386,1528
- `people-circle-outline`：`src/screens/events/EventOperationsContent.tsx`:117
- `people-outline`：`src/screens/ai/AiConversationScreen.tsx`:1202；`src/screens/ai/AiScreen.tsx`:102,743；`src/screens/contacts/BusinessCardBatchScreen.tsx`:254,283；`src/screens/contacts/ContactAcquisitionScreen.tsx`:1318；`src/screens/contacts/ContactsDashboardScreen.tsx`:1233,1280,1448,1702；`src/screens/contacts/ContactsScreen.tsx`:1219；`src/screens/events/EventCenterContent.tsx`:112；`src/screens/events/EventDetailScreen.tsx`:1327；`src/screens/notes/NotesScreen.tsx`:89；`src/screens/schedule/ScheduleScreen.tsx`:86；`src/view-models/events.ts`:499
- `person-add-outline`：`src/screens/contacts/ContactAcquisitionScreen.tsx`:1103,1268；`src/screens/contacts/ContactsDashboardScreen.tsx`:1290；`src/screens/events/EventCenterContent.tsx`:147；`src/screens/events/EventRolesContent.tsx`:51
- `person-circle-outline`：`src/screens/ai/AiConversationScreen.tsx`:1206；`src/screens/contacts/ContactAcquisitionScreen.tsx`:1363；`src/screens/profile/AccountScreen.tsx`:210
- `person-outline`：`src/components/BusinessCardBatchReviewForm.tsx`:85；`src/screens/ai/AiConversationScreen.tsx`:1262；`src/screens/ai/AiScreen.tsx`:1271；`src/screens/ai/cards/AiEntityCard.tsx`:17；`src/screens/contacts/BusinessCardBatchScreen.tsx`:291；`src/screens/contacts/BusinessCardIngestScreen.tsx`:440；`src/screens/contacts/ContactAcquisitionScreen.tsx`:1306；`src/screens/events/EventRolesContent.tsx`:60；`src/screens/schedule/ScheduleScreen.tsx`:78
- `pie-chart-outline`：`src/screens/contacts/ContactStructureDetailScreen.tsx`:128
- `pin-outline`：`src/screens/ai/AiScreen.tsx`:1601；`src/screens/ai/AiSessionOrganization.tsx`:82
- `play-skip-forward-outline`：`src/components/BusinessCardBatchReviewForm.tsx`:92
- `refresh`：`src/screens/ai/OrbitNextActions.tsx`:49；`src/screens/profile/onboarding/ProfileOnboardingScreen.tsx`:585
- `refresh-outline`：`src/components/BusinessCardBatchReviewForm.tsx`:93；`src/screens/contacts/BusinessCardBatchScreen.tsx`:253,277,282；`src/screens/contacts/BusinessCardIngestScreen.tsx`:423,426；`src/screens/contacts/BusinessCardIngestStartScreen.tsx`:251；`src/screens/contacts/ContactDetailScreen.tsx`:1111；`src/screens/contacts/ContactsDashboardScreen.tsx`:1340；`src/screens/dashboard/DashboardScreen.tsx`:415,432,460,596；`src/screens/events/EventDetailScreen.tsx`:1153；`src/screens/events/EventExperienceContent.tsx`:78,89,97；`src/screens/profile/ProfileScreen.tsx`:1432
- `remove`：`src/screens/events/EventExperienceContent.tsx`:134
- `remove-circle-outline`：`src/screens/contacts/BusinessCardIngestScreen.tsx`:437；`src/screens/contacts/BusinessCardIngestStartScreen.tsx`:247
- `save-outline`：`src/screens/contacts/ContactAcquisitionScreen.tsx`:1442；`src/screens/events/EventExperienceContent.tsx`:140；`src/screens/inbox/RelationshipInboxScreen.tsx`:1428；`src/screens/profile/ProfileScreen.tsx`:1202
- `scan-outline`：`src/screens/ai/AiScreen.tsx`:1102；`src/screens/contacts/BusinessCardIngestScreen.tsx`:430；`src/screens/contacts/ContactAcquisitionScreen.tsx`:993；`src/screens/contacts/ContactsDashboardScreen.tsx`:1572；`src/screens/profile/onboarding/ProfileOnboardingScreen.tsx`:400,611
- `search`：`src/screens/contacts/ContactNotesSection.tsx`:136；`src/screens/events/EventCheckInContent.tsx`:95；`src/screens/events/live/EventLiveScreen.tsx`:222；`src/screens/notes/NoteContactPicker.tsx`:107；`src/screens/notes/NotesScreen.tsx`:73
- `search-outline`：`src/screens/ai/AiScreen.tsx`:1212,1469；`src/screens/contacts/ContactsScreen.tsx`:1441；`src/screens/events/EventsScreen.tsx`:339；`src/screens/home/HomeScreen.tsx`:223；`src/screens/inbox/RelationshipInboxScreen.tsx`:1145
- `settings-outline`：`src/screens/ai/AiScreen.tsx`:1286
- `share-outline`：`src/screens/events/EventDetailScreen.tsx`:181
- `shield-checkmark-outline`：`src/screens/ai/AgentActionsScreen.tsx`:166；`src/screens/chat/RelationshipChatDetailScreen.tsx`:260；`src/screens/dashboard/DashboardScreen.tsx`:553；`src/screens/profile/AccountPermissionsScreen.tsx`:267
- `sparkles`：`src/screens/ai/OrbitNextActions.tsx`:36；`src/screens/notes/NoteDetailScreen.tsx`:169；`src/screens/today/TodayScreen.tsx`:334
- `sparkles-outline`：`src/screens/ai/AiConversationScreen.tsx`:1126；`src/screens/ai/AiScreen.tsx`:987；`src/screens/ai/OrbitNextActions.tsx`:105；`src/screens/chat/RelationshipChatScreen.tsx`:140；`src/screens/contacts/ContactsDashboardScreen.tsx`:774,795；`src/screens/contacts/ContactsScreen.tsx`:1483；`src/screens/events/EventOperationsContent.tsx`:109；`src/screens/events/EventRegistrationScreen.tsx`:1038；`src/screens/inbox/NotificationInboxList.tsx`:6；`src/screens/inbox/RelationshipInboxScreen.tsx`:1420
- `square-outline`：`src/screens/contacts/BusinessCardScanScreen.tsx`:235；`src/screens/contacts/ContactAcquisitionScreen.tsx`:1240,1251
- `stats-chart-outline`：`src/screens/events/EventCenterContent.tsx`:136
- `sunny-outline`：`src/screens/profile/ProfileScreen.tsx`:462
- `swap-horizontal-outline`：`src/components/BusinessCardBatchReviewForm.tsx`:77；`src/screens/inbox/NotificationInboxList.tsx`:6
- `ticket-outline`：`src/screens/ai/AiScreen.tsx`:109
- `time-outline`：`src/screens/admin/AdminScreen.tsx`:291；`src/screens/ai/AiConversationScreen.tsx`:1205；`src/screens/ai/AiScreen.tsx`:906；`src/screens/ai/cards/AiEntityCard.tsx`:20；`src/screens/ai/cards/AiEntityDraftCard.tsx`:20；`src/screens/contacts/ContactDetailScreen.tsx`:610；`src/screens/contacts/ContactsScreen.tsx`:1094；`src/screens/events/EventCenterContent.tsx`:73；`src/screens/home/HomeScreen.tsx`:386；`src/screens/inbox/NotificationInboxList.tsx`:6；`src/screens/inbox/RelationshipInboxScreen.tsx`:898；`src/screens/platform/PlatformScreen.tsx`:170；`src/screens/profile/AccountPermissionsScreen.tsx`:207；`src/screens/profile/ProfileScreen.tsx`:1202,1504；`src/screens/schedule/MeetingDetailScreen.tsx`:185；`src/screens/schedule/ScheduleScreen.tsx`:94
- `trash-outline`：`src/screens/ai/AiScreen.tsx`:1629；`src/screens/events/EventExperienceContent.tsx`:114；`src/screens/tasks/TaskDetailScreen.tsx`:666

</details>
