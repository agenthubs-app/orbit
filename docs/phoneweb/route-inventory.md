# Phoneweb 页面覆盖清单

来源：`f416887dc` 的实际 Expo Router 文件，共 81 个页面入口（含legacy/重定向及动态路由，不表示独立业务数量）。

PW-0003逐项登记真实浏览器结果、代表性记录及证据。动态路由使用隔离环境中真实存在的合成记录，权限入口按演示角色检查允许或拒绝。不通过“去掉未验入口”缩小范围。首次清单仅静态盘点，不代表页面可运行。

| 路由 | 页面源文件 | 浏览器验收 |
| --- | --- | --- |
| `/ai` | `repos/orbit-app/app/(app)/ai.tsx` | PW-0003 Chromium 390：已渲染（仅入口渲染） |
| `/contacts` | `repos/orbit-app/app/(app)/contacts.tsx` | PW-0003 Chromium 390：已渲染（仅入口渲染） |
| `/events` | `repos/orbit-app/app/(app)/events.tsx` | PW-0003 Chromium 390：已渲染（仅入口渲染） |
| `/inbox` | `repos/orbit-app/app/(app)/inbox.tsx` | PW-0003 Chromium 390：已渲染（仅入口渲染） |
| `/profile` | `repos/orbit-app/app/(app)/profile.tsx` | PW-0003 Chromium 390：已渲染（仅入口渲染） |
| `/schedule` | `repos/orbit-app/app/(app)/schedule.tsx` | PW-0003 Chromium 390：已渲染（仅入口渲染） |
| `/[...legacy]` | `repos/orbit-app/app/[...legacy].tsx` | PW-0003 Chromium 390：已渲染（仅入口渲染） |
| `/account` | `repos/orbit-app/app/account.tsx` | PW-0003 Chromium 390：已渲染（仅入口渲染） |
| `/account/forgot-password` | `repos/orbit-app/app/account/forgot-password.tsx` | PW-0003 Chromium 390：已渲染（仅入口渲染） |
| `/account/login` | `repos/orbit-app/app/account/login.tsx` | PW-0003 Chromium 390：已渲染（直接目标；旧 run 误分类已更正） |
| `/account/mobile-google` | `repos/orbit-app/app/account/mobile-google.tsx` | PW-0003 Chromium 390：回到登录页（Web 平台限制） |
| `/account/permissions` | `repos/orbit-app/app/account/permissions.tsx` | PW-0003 Chromium 390：已渲染（仅入口渲染） |
| `/account/reset-password` | `repos/orbit-app/app/account/reset-password.tsx` | PW-0003 Chromium 390：已渲染（仅入口渲染） |
| `/account/signup` | `repos/orbit-app/app/account/signup.tsx` | PW-0003 Chromium 390：已渲染（仅入口渲染） |
| `/admin` | `repos/orbit-app/app/admin.tsx` | PW-0003 Chromium 390：已渲染（仅入口渲染） |
| `/admin/access` | `repos/orbit-app/app/admin/access.tsx` | PW-0003 Chromium 390：已渲染（仅入口渲染） |
| `/admin/events` | `repos/orbit-app/app/admin/events.tsx` | PW-0003 Chromium 390：已渲染（仅入口渲染） |
| `/agent` | `repos/orbit-app/app/agent.tsx` | PW-0003 Chromium 390：已渲染（仅入口渲染） |
| `/ai/[id]` | `repos/orbit-app/app/ai/[id].tsx` | PW-0003 Chromium 390：已渲染（仅入口渲染） |
| `/chat` | `repos/orbit-app/app/chat.tsx` | PW-0003 Chromium 390：已渲染（仅入口渲染） |
| `/chat/[id]` | `repos/orbit-app/app/chat/[id].tsx` | PW-0003：缺真实样本（chatConversationId） |
| `/contacts/[id]` | `repos/orbit-app/app/contacts/[id].tsx` | PW-0003：缺真实样本（contactId） |
| `/contacts/all-actions` | `repos/orbit-app/app/contacts/all-actions.tsx` | PW-0003 Chromium 390：已渲染（仅入口渲染） |
| `/contacts/analysis/[dimension]/[bucketId]` | `repos/orbit-app/app/contacts/analysis/[dimension]/[bucketId].tsx` | PW-0003：缺真实样本（contactDimension） |
| `/contacts/dashboard` | `repos/orbit-app/app/contacts/dashboard.tsx` | PW-0003 Chromium 390：已渲染（仅入口渲染） |
| `/contacts/graph` | `repos/orbit-app/app/contacts/graph.tsx` | PW-0003 Chromium 390：已渲染（仅入口渲染） |
| `/contacts/intros` | `repos/orbit-app/app/contacts/intros.tsx` | PW-0003 Chromium 390：已渲染（仅入口渲染） |
| `/contacts/list` | `repos/orbit-app/app/contacts/list.tsx` | PW-0003 Chromium 390：已渲染（仅入口渲染） |
| `/contacts/matches` | `repos/orbit-app/app/contacts/matches.tsx` | PW-0003 Chromium 390：已渲染（仅入口渲染） |
| `/contacts/new` | `repos/orbit-app/app/contacts/new.tsx` | PW-0003 Chromium 390：已渲染（仅入口渲染） |
| `/contacts/new/batch/[id]` | `repos/orbit-app/app/contacts/new/batch/[id].tsx` | PW-0003：缺真实样本（contactDraftBatchId） |
| `/contacts/new/batch2/[id]` | `repos/orbit-app/app/contacts/new/batch2/[id].tsx` | PW-0003：缺真实样本（contactDraftBatchId） |
| `/contacts/new/batch2` | `repos/orbit-app/app/contacts/new/batch2/index.tsx` | PW-0003 Chromium 390：已渲染（仅入口渲染） |
| `/contacts/new/import/[id]` | `repos/orbit-app/app/contacts/new/import/[id].tsx` | PW-0003：缺真实样本（contactDraftBatchId） |
| `/contacts/pipeline` | `repos/orbit-app/app/contacts/pipeline.tsx` | PW-0003 Chromium 390：已渲染（仅入口渲染） |
| `/dashboard` | `repos/orbit-app/app/dashboard.tsx` | PW-0003 Chromium 390：已渲染（仅入口渲染） |
| `/events/[id]` | `repos/orbit-app/app/events/[id].tsx` | PW-0003 Chromium 390：运行错误（未通过） |
| `/events/[id]/analytics` | `repos/orbit-app/app/events/[id]/analytics.tsx` | PW-0003 Chromium 390：运行错误（未通过） |
| `/events/[id]/attendees` | `repos/orbit-app/app/events/[id]/attendees.tsx` | PW-0003 Chromium 390：运行错误（未通过） |
| `/events/[id]/operations` | `repos/orbit-app/app/events/[id]/operations.tsx` | PW-0003 Chromium 390：运行错误（未通过） |
| `/events/[id]/operations/admission` | `repos/orbit-app/app/events/[id]/operations/admission.tsx` | PW-0003 Chromium 390：运行错误（未通过） |
| `/events/[id]/operations/check-in` | `repos/orbit-app/app/events/[id]/operations/check-in.tsx` | PW-0003 Chromium 390：运行错误（未通过） |
| `/events/[id]/operations/experience` | `repos/orbit-app/app/events/[id]/operations/experience.tsx` | PW-0003 Chromium 390：运行错误（未通过） |
| `/events/[id]/operations/roles` | `repos/orbit-app/app/events/[id]/operations/roles.tsx` | PW-0003 Chromium 390：运行错误（未通过） |
| `/events/[id]/register` | `repos/orbit-app/app/events/[id]/register.tsx` | PW-0003 Chromium 390：已渲染（仅入口渲染） |
| `/events/center` | `repos/orbit-app/app/events/center.tsx` | PW-0003 Chromium 390：已渲染（仅入口渲染） |
| `/followups` | `repos/orbit-app/app/followups.tsx` | PW-0003 Chromium 390：已渲染（仅入口渲染） |
| `/home` | `repos/orbit-app/app/home.tsx` | PW-0003 Chromium 390：已渲染（仅入口渲染） |
| `/home/events` | `repos/orbit-app/app/home/events.tsx` | PW-0003 Chromium 390：已渲染（仅入口渲染） |
| `/inbox/[id]` | `repos/orbit-app/app/inbox/[id].tsx` | PW-0003：缺真实样本（inboxConversationId） |
| `/inbox/notifications/[id]` | `repos/orbit-app/app/inbox/notifications/[id].tsx` | PW-0003：缺真实样本（notificationId） |
| `/inbox/sources/[id]` | `repos/orbit-app/app/inbox/sources/[id].tsx` | PW-0003：缺真实样本（inboxSourceId） |
| `/` | `repos/orbit-app/app/index.tsx` | PW-0003 Chromium 390：已渲染（仅入口渲染） |
| `/invitations/[token]` | `repos/orbit-app/app/invitations/[token].tsx` | PW-0003：缺真实样本（invitationToken） |
| `/login-admin` | `repos/orbit-app/app/login-admin.tsx` | PW-0003 Chromium 390：已渲染（仅入口渲染） |
| `/notes/[id]` | `repos/orbit-app/app/notes/[id].tsx` | PW-0003：缺真实样本（noteId） |
| `/notes/[id]/edit` | `repos/orbit-app/app/notes/[id]/edit.tsx` | PW-0003：缺真实样本（noteId） |
| `/notes` | `repos/orbit-app/app/notes/index.tsx` | PW-0003 Chromium 390：已渲染（仅入口渲染） |
| `/notes/new` | `repos/orbit-app/app/notes/new.tsx` | PW-0003 Chromium 390：已渲染（仅入口渲染） |
| `/o/[slug]` | `repos/orbit-app/app/o/[slug].tsx` | PW-0003：缺真实样本（organizerSlug） |
| `/party` | `repos/orbit-app/app/party.tsx` | PW-0003 Chromium 390：已渲染（仅入口渲染） |
| `/party/checkin` | `repos/orbit-app/app/party/checkin.tsx` | PW-0003 Chromium 390：已渲染（仅入口渲染） |
| `/party/graph` | `repos/orbit-app/app/party/graph.tsx` | PW-0003 Chromium 390：已渲染（仅入口渲染） |
| `/platform` | `repos/orbit-app/app/platform.tsx` | PW-0003 Chromium 390：已渲染（仅入口渲染） |
| `/profile/edit` | `repos/orbit-app/app/profile/edit.tsx` | PW-0003 Chromium 390：持续加载（未通过） |
| `/profile/more` | `repos/orbit-app/app/profile/more.tsx` | PW-0003 Chromium 390：已渲染（仅入口渲染） |
| `/profile/preview` | `repos/orbit-app/app/profile/preview.tsx` | PW-0003 Chromium 390：已渲染（仅入口渲染） |
| `/profile/suggestions` | `repos/orbit-app/app/profile/suggestions.tsx` | PW-0003 Chromium 390：已渲染（仅入口渲染） |
| `/profile/tags` | `repos/orbit-app/app/profile/tags.tsx` | PW-0003 Chromium 390：已渲染（仅入口渲染） |
| `/register` | `repos/orbit-app/app/register.tsx` | PW-0003 Chromium 390：已渲染（仅入口渲染） |
| `/register/[code]` | `repos/orbit-app/app/register/[code].tsx` | PW-0003：缺真实样本（registrationCode） |
| `/schedule/events/[id]` | `repos/orbit-app/app/schedule/events/[id].tsx` | PW-0003 Chromium 390：已渲染（仅入口渲染） |
| `/schedule/meetings/[id]` | `repos/orbit-app/app/schedule/meetings/[id].tsx` | PW-0003：缺真实样本（appointmentId） |
| `/schedule/personal/[id]` | `repos/orbit-app/app/schedule/personal/[id].tsx` | PW-0003：缺真实样本（personalScheduleId） |
| `/schedule/personal/new` | `repos/orbit-app/app/schedule/personal/new.tsx` | PW-0003 Chromium 390：已渲染（仅入口渲染） |
| `/settings` | `repos/orbit-app/app/settings.tsx` | PW-0003 Chromium 390：运行错误（未通过） |
| `/settings/api` | `repos/orbit-app/app/settings/api.tsx` | PW-0003 Chromium 390：已渲染（仅入口渲染） |
| `/tasks` | `repos/orbit-app/app/tasks.tsx` | PW-0003 Chromium 390：已渲染（仅入口渲染） |
| `/tasks/[id]` | `repos/orbit-app/app/tasks/[id].tsx` | PW-0003 Chromium 390：已渲染（仅入口渲染） |
| `/tasks/personal` | `repos/orbit-app/app/tasks/personal.tsx` | PW-0003 Chromium 390：已渲染（仅入口渲染） |
| `/today` | `repos/orbit-app/app/today.tsx` | PW-0003 Chromium 390：已渲染（仅入口渲染） |
