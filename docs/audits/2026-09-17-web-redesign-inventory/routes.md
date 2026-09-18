# Web 路由与入口全表

基线：`e64357214a3bad99029a629558b7099d23819e5f`；64 个 page 文件，56 个非 dev、8 个 dev。入口并非独立终态界面。服务端 redirect 根据身份/条件执行；这里保留目标表达式，不猜测动态参数。

参数列是静态 detector 的候选读取证据，不是穷尽的 query 契约；共享组件参数可能出现在多个入口。例如活动目录 scope、分析 initialTab、today view、party 活动上下文请结合 page/模型源码。redirect 列也包含鉴权/条件分支，不表示该页面无条件总跳转。

| URL 模板 | 源码 | 文档分组 | redirect 源码证据 | query 读取证据 |
| --- | --- | --- | --- | --- |
| / | [page.tsx](</Users/li/work/orbit/repos/orbits/app/page.tsx>) | [01-entry-shell](01-entry-shell.md) |  | lang |
| /app | [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/page.tsx>) | [01-entry-shell](01-entry-shell.md) | "/app/home" | lang |
| /app/account/forgot-password | [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/account/forgot-password/page.tsx>) | [01-entry-shell](01-entry-shell.md) | normalizeOrbitAuthReturnPath(resolvedSearchParams?.next) | created, email, next, orbitVisualSeed |
| /app/account/login | [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/account/login/page.tsx>) | [01-entry-shell](01-entry-shell.md) | normalizeOrbitAuthReturnPath(resolvedSearchParams?.next) | created, email, next, orbitVisualSeed |
| /app/account/mobile-google | [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/account/mobile-google/page.tsx>) | [01-entry-shell](01-entry-shell.md) |  |  |
| /app/account/reset-password | [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/account/reset-password/page.tsx>) | [01-entry-shell](01-entry-shell.md) |  |  |
| /app/account/signup | [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/account/signup/page.tsx>) | [01-entry-shell](01-entry-shell.md) | normalizeOrbitAuthReturnPath(resolvedSearchParams?.next) | created, email, next, orbitVisualSeed |
| /app/admin | [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/admin/page.tsx>) | [08-profile-settings-admin](08-profile-settings-admin.md) | "/app/account/login?next=%2Fapp%2Fadmin" | orbitVisualSeed |
| /app/admin/access | [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/admin/access/page.tsx>) | [08-profile-settings-admin](08-profile-settings-admin.md) |  | orbitVisualSeed |
| /app/admin/events | [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/admin/events/page.tsx>) | [05-events](05-events.md) | "/app/account/login?next=%2Fapp%2Fadmin%2Fevents" | orbitVisualSeed |
| /app/agent | [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/agent/page.tsx>) | [02-ai](02-ai.md) | "/app/account/login?next=%2Fapp%2Fagent" | orbitVisualSeed, q, session |
| /app/chat | [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/chat/page.tsx>) | [07-schedule-tasks-chat](07-schedule-tasks-chat.md) | `/app/agent${suffix}` |  |
| /app/contacts | [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/page.tsx>) | [03-contacts](03-contacts.md) | "/app/account/login?next=%2Fapp%2Fcontacts" | orbitVisualSeed, query |
| /app/contacts/[id] | [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/[id]/page.tsx>) | [03-contacts](03-contacts.md) | `/app/account/login?next=${encodeURIComponent(`/app/contacts/${contactId}`)}`, | orbitVisualSeed |
| /app/contacts/all-actions | [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/all-actions/page.tsx>) | [03-contacts](03-contacts.md) |  | orbitVisualSeed |
| /app/contacts/analysis/[dimension]/[bucketId] | [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/analysis/[dimension]/[bucketId]/page.tsx>) | [03-contacts](03-contacts.md) | `/app/account/login?next=${encodeURIComponent(next)}` | orbitVisualSeed |
| /app/contacts/dashboard | [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/dashboard/page.tsx>) | [03-contacts](03-contacts.md) | "/app/account/login?next=%2Fapp%2Fcontacts%2Fdashboard" | orbitVisualSeed |
| /app/contacts/graph | [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/graph/page.tsx>) | [03-contacts](03-contacts.md) | withOrbitLanguageHref("/app/contacts/dashboard?tab=structure", language) |  |
| /app/contacts/intros | [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/intros/page.tsx>) | [03-contacts](03-contacts.md) | "/app/account/login?next=%2Fapp%2Fcontacts%2Fintros" | orbitVisualSeed, query |
| /app/contacts/new | [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/new/page.tsx>) | [04-acquisition](04-acquisition.md) | "/app/account/login?next=%2Fapp%2Fcontacts%2Fnew" | orbitVisualSeed |
| /app/contacts/new/batch/[id] | [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/new/batch/[id]/page.tsx>) | [04-acquisition](04-acquisition.md) | `/app/account/login?next=${encodeURIComponent(`/app/contacts/new/batch/${id}`)}` | orbitVisualSeed |
| /app/contacts/new/batch2 | [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/new/batch2/page.tsx>) | [04-acquisition](04-acquisition.md) | `/app/account/login?next=${encodeURIComponent("/app/contacts/new/batch2")}` | orbitVisualSeed |
| /app/contacts/new/batch2/[id] | [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/new/batch2/[id]/page.tsx>) | [04-acquisition](04-acquisition.md) | `/app/account/login?next=${encodeURIComponent(`/app/contacts/new/batch2/${id}`)}`, | orbitVisualSeed |
| /app/contacts/new/import/[id] | [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/new/import/[id]/page.tsx>) | [04-acquisition](04-acquisition.md) | `/app/account/login?next=${encodeURIComponent(`/app/contacts/new/import/${id}`)}` | orbitVisualSeed |
| /app/contacts/pipeline | [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/pipeline/page.tsx>) | [03-contacts](03-contacts.md) | "/app/account/login?next=%2Fapp%2Fcontacts%2Fpipeline" | orbitVisualSeed, query |
| /app/dashboard | [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/dashboard/page.tsx>) | [05-events](05-events.md) | "/app/account/login?next=%2Fapp%2Fdashboard" | orbitVisualSeed |
| /app/events | [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/events/page.tsx>) | [05-events](05-events.md) |  | orbitVisualSeed |
| /app/events/[id] | [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/events/[id]/page.tsx>) | [05-events](05-events.md) | `/app/account/login?next=${encodeURIComponent(`/app/events/${id}`)}`, | orbitVisualSeed, participant |
| /app/events/[id]/analytics | [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/events/[id]/analytics/page.tsx>) | [06-operations](06-operations.md) | `/app/account/login?next=${encodeURIComponent( `/app/events/${eventId}/analytics`, )}`, |  |
| /app/events/[id]/operations | [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/events/[id]/operations/page.tsx>) | [06-operations](06-operations.md) | `/app/account/login?next=${encodeURIComponent(`/app/events/${eventId}/operations`)}` |  |
| /app/events/[id]/operations/admission | [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/events/[id]/operations/admission/page.tsx>) | [06-operations](06-operations.md) | `/app/account/login?next=${encodeURIComponent(pathname)}` |  |
| /app/events/[id]/operations/check-in | [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/events/[id]/operations/check-in/page.tsx>) | [06-operations](06-operations.md) | `/app/account/login?next=${encodeURIComponent(pathname)}` |  |
| /app/events/[id]/operations/experience | [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/events/[id]/operations/experience/page.tsx>) | [06-operations](06-operations.md) |  |  |
| /app/events/[id]/operations/roles | [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/events/[id]/operations/roles/page.tsx>) | [06-operations](06-operations.md) | `/app/account/login?next=${encodeURIComponent(`/app/events/${eventId}/operations/roles`)}`, |  |
| /app/events/[id]/register | [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/events/[id]/register/page.tsx>) | [05-events](05-events.md) | `/app/account/login?next=${encodeURIComponent( eventRegistrationReturnPath(id, preferredLanguage), )}`, | language, orbitVisualSeed |
| /app/events/center | [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/events/center/page.tsx>) | [06-operations](06-operations.md) | "/app/account/login?next=%2Fapp%2Fevents%2Fcenter" |  |
| /app/followups | [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/followups/page.tsx>) | [01-entry-shell](01-entry-shell.md) | "/app/today?view=day" |  |
| /app/home | [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/home/page.tsx>) | [01-entry-shell](01-entry-shell.md) | "/app/agent" |  |
| /app/home/events | [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/home/events/page.tsx>) | [05-events](05-events.md) | "/app/account/login?next=%2Fapp%2Fhome%2Fevents" | orbitVisualSeed |
| /app/invitations/[token] | [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/invitations/[token]/page.tsx>) | [01-entry-shell](01-entry-shell.md) | `/app/account/login?${new URLSearchParams({ next: invitationPath })}` |  |
| /app/login-admin | [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/login-admin/page.tsx>) | [08-profile-settings-admin](08-profile-settings-admin.md) |  | orbitVisualSeed |
| /app/o/[slug] | [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/o/[slug]/page.tsx>) | [05-events](05-events.md) |  | orbitVisualSeed |
| /app/party | [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/party/page.tsx>) | [05-events](05-events.md) | partyLoginHref("/app/party", resolvedSearchParams) | orbitVisualSeed |
| /app/party/checkin | [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/party/checkin/page.tsx>) | [05-events](05-events.md) | partyLoginHref("/app/party/checkin", resolvedSearchParams) | orbitVisualSeed |
| /app/party/graph | [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/party/graph/page.tsx>) | [05-events](05-events.md) | partyLoginHref("/app/party/graph", resolvedSearchParams) | orbitVisualSeed |
| /app/platform | [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/platform/page.tsx>) | [08-profile-settings-admin](08-profile-settings-admin.md) | "/app/account/login?next=%2Fapp%2Fplatform" | orbitVisualSeed |
| /app/profile | [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/profile/page.tsx>) | [08-profile-settings-admin](08-profile-settings-admin.md) | "/app/account/login?next=%2Fapp%2Fprofile" | orbitVisualSeed |
| /app/register | [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/register/page.tsx>) | [05-events](05-events.md) | `/app/events/${encodeURIComponent(routeModel.register.event.id)}/register${suffix}#`, |  |
| /app/schedule | [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/schedule/page.tsx>) | [07-schedule-tasks-chat](07-schedule-tasks-chat.md) | "/app/today#arrangements" |  |
| /app/schedule/events/[id] | [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/schedule/events/[id]/page.tsx>) | [05-events](05-events.md) | `/app/account/login?next=${encodeURIComponent(`/app/schedule/events/${id}`)}`, | orbitVisualSeed |
| /app/settings | [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/settings/page.tsx>) | [08-profile-settings-admin](08-profile-settings-admin.md) |  | orbitVisualSeed |
| /app/tasks | [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/tasks/page.tsx>) | [07-schedule-tasks-chat](07-schedule-tasks-chat.md) | `/app/account/login?${new URLSearchParams({ next })}` |  |
| /app/tasks/[id] | [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/tasks/[id]/page.tsx>) | [07-schedule-tasks-chat](07-schedule-tasks-chat.md) | `/app/account/login?${new URLSearchParams({ next: `/app/tasks/${encodeURIComponent(taskId)}` })}` |  |
| /app/tasks/personal | [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/tasks/personal/page.tsx>) | [07-schedule-tasks-chat](07-schedule-tasks-chat.md) | "/app/account/login?next=%2Fapp%2Ftasks%2Fpersonal" |  |
| /app/tasks/relationship/[id] | [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/tasks/relationship/[id]/page.tsx>) | [07-schedule-tasks-chat](07-schedule-tasks-chat.md) |  |  |
| /app/today | [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/today/page.tsx>) | [07-schedule-tasks-chat](07-schedule-tasks-chat.md) | "/app/account/login?next=%2Fapp%2Ftoday" | orbitVisualSeed |
| /dev/agent-test-report | [page.tsx](</Users/li/work/orbit/repos/orbits/app/dev/agent-test-report/page.tsx>) | [09-dev](09-dev.md) |  |  |
| /dev/capabilities | [page.tsx](</Users/li/work/orbit/repos/orbits/app/dev/capabilities/page.tsx>) | [09-dev](09-dev.md) |  |  |
| /dev/capabilities/[slug] | [page.tsx](</Users/li/work/orbit/repos/orbits/app/dev/capabilities/[slug]/page.tsx>) | [09-dev](09-dev.md) |  |  |
| /dev/foundation/domain | [page.tsx](</Users/li/work/orbit/repos/orbits/app/dev/foundation/domain/page.tsx>) | [09-dev](09-dev.md) |  |  |
| /dev/foundation/mock-registry | [page.tsx](</Users/li/work/orbit/repos/orbits/app/dev/foundation/mock-registry/page.tsx>) | [09-dev](09-dev.md) |  |  |
| /dev/foundation/style | [page.tsx](</Users/li/work/orbit/repos/orbits/app/dev/foundation/style/page.tsx>) | [09-dev](09-dev.md) |  |  |
| /dev/knowledge | [page.tsx](</Users/li/work/orbit/repos/orbits/app/dev/knowledge/page.tsx>) | [09-dev](09-dev.md) |  |  |
| /dev/orbit-ai/trace | [page.tsx](</Users/li/work/orbit/repos/orbits/app/dev/orbit-ai/trace/page.tsx>) | [09-dev](09-dev.md) |  |  |
