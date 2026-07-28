# 界面清单

每一行是一个路由界面；弹层采用独立实现分母并记录每个父路由可达实例。完整文案、字段、状态、数据源、跳转和无障碍字段见 `inventory.json`。

| ID | 客户端 | 环境 | 路由 | 父界面 | 动态参数 | 可达弹层 | 控件 | 测试源码命中 | 运行时结论 |
| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | --- |
| `mobile:/` | mobile | production | `/` | — |  | 0 | 0 | 90 | inventory-complete-runtime-verification-pending |
| `mobile:/[...legacy]` | mobile | production | `/[...legacy]` | `mobile:/` | ...legacy | 0 | 0 | 0 | inventory-complete-runtime-verification-pending |
| `mobile:/account` | mobile | production | `/account` | `mobile:/` |  | 0 | 9 | 12 | runtime-partially-verified-expo-web-auth-profile-account |
| `mobile:/account/forgot-password` | mobile | production | `/account/forgot-password` | `mobile:/account` |  | 0 | 9 | 2 | inventory-complete-runtime-verification-pending |
| `mobile:/account/login` | mobile | production | `/account/login` | `mobile:/account` |  | 0 | 9 | 4 | runtime-partially-verified-expo-web-auth-profile-account |
| `mobile:/account/mobile-google` | mobile | production | `/account/mobile-google` | `mobile:/account` |  | 0 | 0 | 1 | inventory-complete-runtime-verification-pending |
| `mobile:/account/permissions` | mobile | production | `/account/permissions` | `mobile:/account` |  | 0 | 5 | 1 | runtime-partially-verified-expo-web-permission-persistence |
| `mobile:/account/signup` | mobile | production | `/account/signup` | `mobile:/account` |  | 0 | 9 | 4 | inventory-complete-runtime-verification-pending |
| `mobile:/admin` | mobile | production | `/admin` | `mobile:/` |  | 0 | 10 | 2 | inventory-complete-runtime-verification-pending |
| `mobile:/admin/access` | mobile | production | `/admin/access` | `mobile:/admin` |  | 0 | 10 | 1 | inventory-complete-runtime-verification-pending |
| `mobile:/admin/events` | mobile | production | `/admin/events` | `mobile:/admin` |  | 0 | 10 | 1 | inventory-complete-runtime-verification-pending |
| `mobile:/agent` | mobile | production | `/agent` | `mobile:/` |  | 0 | 9 | 9 | inventory-complete-runtime-verification-pending |
| `mobile:/ai` | mobile | production | `/ai` | `mobile:/` |  | 3 | 31 | 10 | runtime-partially-verified-expo-ai-history-persistence |
| `mobile:/ai/[id]` | mobile | production | `/ai/[id]` | `mobile:/ai` | id | 0 | 26 | 5 | runtime-partially-verified-expo-ai-conversation-readback |
| `mobile:/chat` | mobile | production | `/chat` | `mobile:/` |  | 0 | 7 | 9 | runtime-partially-verified-expo-chat-empty-boundary |
| `mobile:/chat/[id]` | mobile | production | `/chat/[id]` | `mobile:/chat` | id | 0 | 9 | 4 | runtime-partially-verified-expo-chat-missing-boundary |
| `mobile:/contacts` | mobile | production | `/contacts` | `mobile:/` |  | 0 | 34 | 16 | inventory-complete-runtime-verification-pending |
| `mobile:/contacts/[id]` | mobile | production | `/contacts/[id]` | `mobile:/contacts` | id | 0 | 19 | 8 | runtime-partially-verified-expo-contact-missing-boundary |
| `mobile:/contacts/all-actions` | mobile | production | `/contacts/all-actions` | `mobile:/contacts` |  | 0 | 8 | 0 | inventory-complete-runtime-verification-pending |
| `mobile:/contacts/dashboard` | mobile | production | `/contacts/dashboard` | `mobile:/contacts` |  | 0 | 12 | 1 | inventory-complete-runtime-verification-pending |
| `mobile:/contacts/graph` | mobile | production | `/contacts/graph` | `mobile:/contacts` |  | 0 | 10 | 1 | inventory-complete-runtime-verification-pending |
| `mobile:/contacts/intros` | mobile | production | `/contacts/intros` | `mobile:/contacts` |  | 0 | 14 | 0 | inventory-complete-runtime-verification-pending |
| `mobile:/contacts/list` | mobile | production | `/contacts/list` | `mobile:/contacts` |  | 0 | 34 | 2 | inventory-complete-runtime-verification-pending |
| `mobile:/contacts/new` | mobile | production | `/contacts/new` | `mobile:/contacts` |  | 0 | 54 | 2 | runtime-partially-verified-expo-contact-acquisition-live-boundaries |
| `mobile:/contacts/pipeline` | mobile | production | `/contacts/pipeline` | `mobile:/contacts` |  | 0 | 7 | 0 | inventory-complete-runtime-verification-pending |
| `mobile:/dashboard` | mobile | production | `/dashboard` | `mobile:/` |  | 0 | 7 | 9 | inventory-complete-runtime-verification-pending |
| `mobile:/events` | mobile | production | `/events` | `mobile:/` |  | 0 | 17 | 20 | runtime-partially-verified-expo-live-event-chain |
| `mobile:/events/[id]` | mobile | production | `/events/[id]` | `mobile:/events` | id | 0 | 15 | 11 | runtime-partially-verified-expo-live-event-chain |
| `mobile:/events/[id]/attendees` | mobile | production | `/events/[id]/attendees` | `mobile:/events/[id]` | id | 0 | 13 | 0 | runtime-partially-verified-expo-live-event-chain |
| `mobile:/events/[id]/register` | mobile | production | `/events/[id]/register` | `mobile:/events/[id]` | id | 0 | 13 | 0 | runtime-partially-verified-expo-live-event-chain |
| `mobile:/followups` | mobile | production | `/followups` | `mobile:/` |  | 0 | 11 | 5 | inventory-complete-runtime-verification-pending |
| `mobile:/home` | mobile | production | `/home` | `mobile:/` |  | 0 | 0 | 3 | inventory-complete-runtime-verification-pending |
| `mobile:/home/events` | mobile | production | `/home/events` | `mobile:/home` |  | 0 | 21 | 1 | inventory-complete-runtime-verification-pending |
| `mobile:/inbox` | mobile | production | `/inbox` | `mobile:/` |  | 0 | 32 | 3 | inventory-complete-runtime-verification-pending |
| `mobile:/login-admin` | mobile | production | `/login-admin` | `mobile:/` |  | 0 | 5 | 1 | inventory-complete-runtime-verification-pending |
| `mobile:/o/[slug]` | mobile | production | `/o/[slug]` | `mobile:/` | slug | 0 | 8 | 1 | runtime-partially-verified-expo-organizer-public-isolation |
| `mobile:/party` | mobile | production | `/party` | `mobile:/` |  | 0 | 13 | 4 | runtime-partially-verified-expo-party-truthful-boundary |
| `mobile:/party/checkin` | mobile | production | `/party/checkin` | `mobile:/party` |  | 0 | 13 | 1 | runtime-partially-verified-expo-party-truthful-boundary |
| `mobile:/party/graph` | mobile | production | `/party/graph` | `mobile:/party` |  | 0 | 13 | 1 | runtime-partially-verified-expo-party-truthful-boundary |
| `mobile:/platform` | mobile | production | `/platform` | `mobile:/` |  | 0 | 7 | 2 | inventory-complete-runtime-verification-pending |
| `mobile:/profile` | mobile | production | `/profile` | `mobile:/` |  | 0 | 24 | 17 | runtime-partially-verified-expo-web-auth-profile-account |
| `mobile:/register` | mobile | production | `/register` | `mobile:/` |  | 0 | 5 | 5 | inventory-complete-runtime-verification-pending |
| `mobile:/register/[code]` | mobile | production | `/register/[code]` | `mobile:/register` | code | 0 | 5 | 1 | inventory-complete-runtime-verification-pending |
| `mobile:/schedule` | mobile | production | `/schedule` | `mobile:/` |  | 0 | 7 | 7 | inventory-complete-runtime-verification-pending |
| `mobile:/schedule/events/[id]` | mobile | production | `/schedule/events/[id]` | `mobile:/schedule` | id | 0 | 4 | 2 | inventory-complete-runtime-verification-pending |
| `mobile:/settings` | mobile | production | `/settings` | `mobile:/` |  | 0 | 3 | 5 | inventory-complete-runtime-verification-pending |
| `mobile:/settings/api` | mobile | production | `/settings/api` | `mobile:/settings` |  | 0 | 6 | 1 | inventory-complete-runtime-verification-pending |
| `mobile:/today` | mobile | production | `/today` | `mobile:/` |  | 0 | 8 | 0 | inventory-complete-runtime-verification-pending |
| `web:/` | web | production | `/` | — |  | 0 | 42 | 286 | runtime-partially-verified-browser-base-state |
| `web:/app` | web | production | `/app` | `web:/` |  | 0 | 42 | 153 | runtime-partially-verified-browser-base-state |
| `web:/app/account/forgot-password` | web | production | `/app/account/forgot-password` | `web:/app` |  | 1 | 16 | 1 | runtime-partially-verified-browser-base-state |
| `web:/app/account/login` | web | production | `/app/account/login` | `web:/app` |  | 1 | 16 | 5 | runtime-partially-verified-browser-base-state |
| `web:/app/account/mobile-google` | web | production | `/app/account/mobile-google` | `web:/app` |  | 0 | 2 | 1 | runtime-partially-verified-browser-base-state |
| `web:/app/account/signup` | web | production | `/app/account/signup` | `web:/app` |  | 1 | 16 | 2 | runtime-partially-verified-browser-base-state |
| `web:/app/admin` | web | production | `/app/admin` | `web:/app` |  | 0 | 9 | 5 | runtime-partially-verified-browser-base-state |
| `web:/app/admin/access` | web | production | `/app/admin/access` | `web:/app/admin` |  | 0 | 5 | 1 | runtime-partially-verified-browser-base-state |
| `web:/app/admin/events` | web | production | `/app/admin/events` | `web:/app/admin` |  | 0 | 9 | 1 | runtime-partially-verified-browser-base-state |
| `web:/app/agent` | web | production | `/app/agent` | `web:/app` |  | 2 | 92 | 28 | inventory-complete-runtime-verification-pending |
| `web:/app/chat` | web | production | `/app/chat` | `web:/app` |  | 2 | 54 | 11 | inventory-complete-runtime-verification-pending |
| `web:/app/contacts` | web | production | `/app/contacts` | `web:/app` |  | 2 | 93 | 34 | runtime-partially-verified-live-contact-list |
| `web:/app/contacts/[id]` | web | production | `/app/contacts/[id]` | `web:/app/contacts` | id | 2 | 100 | 30 | runtime-partially-verified-live-contact-detail |
| `web:/app/contacts/all-actions` | web | production | `/app/contacts/all-actions` | `web:/app/contacts` |  | 2 | 60 | 9 | inventory-complete-runtime-verification-pending |
| `web:/app/contacts/dashboard` | web | production | `/app/contacts/dashboard` | `web:/app/contacts` |  | 2 | 56 | 2 | inventory-complete-runtime-verification-pending |
| `web:/app/contacts/graph` | web | production | `/app/contacts/graph` | `web:/app/contacts` |  | 2 | 93 | 2 | inventory-complete-runtime-verification-pending |
| `web:/app/contacts/intros` | web | production | `/app/contacts/intros` | `web:/app/contacts` |  | 2 | 93 | 2 | inventory-complete-runtime-verification-pending |
| `web:/app/contacts/new` | web | production | `/app/contacts/new` | `web:/app/contacts` |  | 2 | 77 | 4 | runtime-partially-verified-external-capability-restricted |
| `web:/app/contacts/pipeline` | web | production | `/app/contacts/pipeline` | `web:/app/contacts` |  | 2 | 94 | 2 | inventory-complete-runtime-verification-pending |
| `web:/app/dashboard` | web | production | `/app/dashboard` | `web:/app` |  | 0 | 0 | 8 | inventory-complete-runtime-verification-pending |
| `web:/app/events` | web | production | `/app/events` | `web:/app` |  | 0 | 36 | 28 | runtime-partially-verified-browser-base-state |
| `web:/app/events/[id]` | web | production | `/app/events/[id]` | `web:/app/events` | id | 2 | 84 | 24 | runtime-partially-verified-browser-base-state |
| `web:/app/events/[id]/register` | web | production | `/app/events/[id]/register` | `web:/app/events/[id]` | id | 1 | 30 | 5 | runtime-partially-verified-live-event-registration |
| `web:/app/followups` | web | production | `/app/followups` | `web:/app` |  | 0 | 0 | 7 | inventory-complete-runtime-verification-pending |
| `web:/app/home` | web | production | `/app/home` | `web:/app` |  | 2 | 65 | 7 | inventory-complete-runtime-verification-pending |
| `web:/app/home/events` | web | production | `/app/home/events` | `web:/app/home` |  | 2 | 65 | 3 | inventory-complete-runtime-verification-pending |
| `web:/app/login-admin` | web | production | `/app/login-admin` | `web:/app` |  | 0 | 5 | 1 | runtime-partially-verified-browser-base-state |
| `web:/app/o/[slug]` | web | production | `/app/o/[slug]` | `web:/app` | slug | 0 | 24 | 2 | runtime-partially-verified-browser-base-state |
| `web:/app/party` | web | production | `/app/party` | `web:/app` |  | 2 | 79 | 5 | inventory-complete-runtime-verification-pending |
| `web:/app/party/checkin` | web | production | `/app/party/checkin` | `web:/app/party` |  | 2 | 79 | 4 | inventory-complete-runtime-verification-pending |
| `web:/app/party/graph` | web | production | `/app/party/graph` | `web:/app/party` |  | 2 | 79 | 3 | inventory-complete-runtime-verification-pending |
| `web:/app/platform` | web | production | `/app/platform` | `web:/app` |  | 0 | 11 | 3 | runtime-partially-verified-browser-base-state |
| `web:/app/profile` | web | production | `/app/profile` | `web:/app` |  | 2 | 69 | 8 | runtime-partially-verified-live-profile-persistence |
| `web:/app/register` | web | production | `/app/register` | `web:/app` |  | 0 | 4 | 3 | runtime-partially-verified-browser-base-state |
| `web:/app/schedule` | web | production | `/app/schedule` | `web:/app` |  | 0 | 0 | 9 | inventory-complete-runtime-verification-pending |
| `web:/app/schedule/events/[id]` | web | production | `/app/schedule/events/[id]` | `web:/app/schedule` | id | 2 | 48 | 2 | inventory-complete-runtime-verification-pending |
| `web:/app/settings` | web | production | `/app/settings` | `web:/app` |  | 2 | 94 | 9 | inventory-complete-runtime-verification-pending |
| `web:/app/today` | web | production | `/app/today` | `web:/app` |  | 2 | 86 | 18 | inventory-complete-runtime-verification-pending |
| `web:/dev/agent-test-report` | web | development | `/dev/agent-test-report` | `web:/` |  | 0 | 5 | 1 | runtime-partially-verified-browser-base-state |
| `web:/dev/capabilities` | web | development | `/dev/capabilities` | `web:/` |  | 0 | 3 | 52 | runtime-partially-verified-browser-base-state |
| `web:/dev/capabilities/[slug]` | web | development | `/dev/capabilities/[slug]` | `web:/dev/capabilities` | slug | 0 | 337 | 52 | runtime-partially-verified-six-ids |
| `web:/dev/foundation/domain` | web | development | `/dev/foundation/domain` | `web:/` |  | 0 | 2 | 1 | runtime-partially-verified-browser-base-state |
| `web:/dev/foundation/mock-registry` | web | development | `/dev/foundation/mock-registry` | `web:/` |  | 0 | 2 | 1 | runtime-partially-verified-browser-base-state |
| `web:/dev/foundation/style` | web | development | `/dev/foundation/style` | `web:/` |  | 0 | 8 | 1 | runtime-partially-verified-browser-base-state |
| `web:/dev/knowledge` | web | development | `/dev/knowledge` | `web:/` |  | 0 | 22 | 2 | runtime-partially-verified-browser-base-state |
| `web:/dev/orbit-ai/trace` | web | development | `/dev/orbit-ai/trace` | `web:/` |  | 0 | 15 | 2 | runtime-partially-verified-browser-base-state |

## 弹层实现

| 实现 ID | 类型 | 名称 | 源码 | 运行时结论 |
| --- | --- | --- | --- | --- |
| `repos/orbit-app/src/screens/ai/AiScreen.tsx:601` | Modal | 扫名片 新对话 | `repos/orbit-app/src/screens/ai/AiScreen.tsx:601` | not-runtime-verified |
| `repos/orbit-app/src/screens/ai/AiScreen.tsx:658` | Modal | 人脉入口 {featuredCapabilities.map((entry) => ( <FeaturedCapabilityTile badge={entry.href === "/inbox" ? inboxBadge : undefined} entry={entry} key={String(entry.href)} onPress={() => onOpenCapability(entry.href)} /> ))} 更多入口 {secondaryCapabilities.map((entry) => ( <CapabilityRow entry={entry} key={String(entry.href)} onPress={() => onOpenCapability(entry.href)} /> ))} | `repos/orbit-app/src/screens/ai/AiScreen.tsx:658` | not-runtime-verified |
| `repos/orbit-app/src/screens/ai/AiScreen.tsx:838` | Modal | 历史记录 {<Text style={styles.errorText}>{historyDeleteError}</Text>} / {null} | `repos/orbit-app/src/screens/ai/AiScreen.tsx:838` | not-runtime-verified |
| `repos/orbits/app/(app)/app/account/orbit-real-account-auth.tsx:175` | dialog | viewModel.title | `repos/orbits/app/(app)/app/account/orbit-real-account-auth.tsx:175` | not-runtime-verified |
| `repos/orbits/app/(app)/app/events/[id]/register/event-registration-workspace.tsx:1244` | alertdialog | Cancel this event registration? / 确认取消这次活动报名？ You will leave attendee matching. Your saved answers remain attached to this registration so you can reactivate the same record later. / 取消后你将退出本场活动撮合。已保存的回答仍归属于这条报名记录，之后可重新激活同一记录。 {<div className="orbit-alert error" role="alert"> {error} </div>} / {null} Keep registration / 保留报名 Cancelling… / 取消中… / Confirm cancellation / 确认取消报名 | `repos/orbits/app/(app)/app/events/[id]/register/event-registration-workspace.tsx:1244` | not-runtime-verified |
| `repos/orbits/app/(app)/app/inbox/relationship-inbox-panel.tsx:1070` | dialog | t({ en: "Relationship inbox", zh: "关系收件箱" }) | `repos/orbits/app/(app)/app/inbox/relationship-inbox-panel.tsx:1070` | not-runtime-verified |
| `repos/orbits/app/(app)/app/orbit-account-shell.tsx:162` | dialog | label ?? t({ en: "Dialog", zh: "对话框" }) | `repos/orbits/app/(app)/app/orbit-account-shell.tsx:162` | not-runtime-verified |
