# 05-events：明细索引

按源码顺序分卷；分卷只是文件大小划分，不表示独立页面。

- [明细 1](05-events-part-1.md)
- [明细 2](05-events-part-2.md)
- [明细 3](05-events-part-3.md)
- [明细 4](05-events-part-4.md)
- [明细 5](05-events-part-5.md)

## 实现来源

| 源码 | 控件实现 | 分区节点 | 文案片段 |
| --- | --- | --- | --- |
| [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/admin/events/page.tsx>) | 0 | 0 | 1 |
| [dashboard-service-factory.ts](</Users/li/work/orbit/repos/orbits/app/(app)/app/dashboard/compose-app-dashboard-from-previously-approved-mock-first-capabilities/dashboard-service-factory.ts>) | 0 | 0 | 1 |
| [orbit-real-dashboard.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/dashboard/orbit-real-dashboard.tsx>) | 0 | 26 | 92 |
| [orbit-real-party.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/dashboard/orbit-real-party.tsx>) | 31 | 28 | 299 |
| [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/dashboard/page.tsx>) | 0 | 0 | 1 |
| [orbit-appointment-negotiation.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/events/[id]/orbit-appointment-negotiation.tsx>) | 15 | 1 | 90 |
| [orbit-encounter-capture.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/events/[id]/orbit-encounter-capture.tsx>) | 7 | 0 | 45 |
| [orbit-event-matchmaking.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/events/[id]/orbit-event-matchmaking.tsx>) | 21 | 9 | 142 |
| [orbit-post-event-center.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/events/[id]/orbit-post-event-center.tsx>) | 10 | 2 | 120 |
| [orbit-real-event-detail.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/events/[id]/orbit-real-event-detail.tsx>) | 7 | 15 | 219 |
| [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/events/[id]/page.tsx>) | 0 | 2 | 9 |
| [event-admission-status-card.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/events/[id]/register/event-admission-status-card.tsx>) | 3 | 5 | 24 |
| [event-registration-workspace.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/events/[id]/register/event-registration-workspace.tsx>) | 22 | 19 | 187 |
| [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/events/[id]/register/page.tsx>) | 0 | 2 | 2 |
| [events-view-model-adapter.ts](</Users/li/work/orbit/repos/orbits/app/(app)/app/events/compose-app-events-from-previously-approved-mock-first-capabilities/events-view-model-adapter.ts>) | 0 | 0 | 3 |
| [orbit-event-cover.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/events/orbit-event-cover.tsx>) | 0 | 0 | 1 |
| [orbit-real-explore-client.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/events/orbit-real-explore-client.tsx>) | 19 | 11 | 91 |
| [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/o/[slug]/page.tsx>) | 0 | 0 | 1 |
| [organizer-public-route-view-model.ts](</Users/li/work/orbit/repos/orbits/app/(app)/app/o/compose-app-organizer-public-from-previously-approved-mock-first-capabilities/organizer-public-route-view-model.ts>) | 0 | 0 | 46 |
| [orbit-real-organizer-public.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/o/orbit-real-organizer-public.tsx>) | 2 | 4 | 23 |
| [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/party/checkin/page.tsx>) | 0 | 0 | 1 |
| [party-route-view-model.ts](</Users/li/work/orbit/repos/orbits/app/(app)/app/party/compose-app-party-from-previously-approved-mock-first-capabilities/party-route-view-model.ts>) | 0 | 0 | 61 |
| [event-operations-controls.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/party/event-operations-controls.tsx>) | 8 | 0 | 50 |
| [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/party/graph/page.tsx>) | 0 | 0 | 1 |
| [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/party/page.tsx>) | 0 | 0 | 1 |
| [register-route-view-model.ts](</Users/li/work/orbit/repos/orbits/app/(app)/app/register/compose-app-register-from-previously-approved-mock-first-capabilities/register-route-view-model.ts>) | 0 | 0 | 25 |
| [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/register/page.tsx>) | 0 | 0 | 1 |
| [event-preview-route-view-model.ts](</Users/li/work/orbit/repos/orbits/app/(app)/app/schedule/events/[id]/event-preview-route-view-model.ts>) | 0 | 0 | 10 |
| [orbit-real-schedule-event.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/schedule/events/[id]/orbit-real-schedule-event.tsx>) | 1 | 7 | 4 |
| [debug-view.tsx](</Users/li/work/orbit/repos/orbits/features/dashboard/dashboard-aggregate-mock/debug-view.tsx>) | 0 | 7 | 90 |
| [debug-view.tsx](</Users/li/work/orbit/repos/orbits/features/dashboard/network-distribution-analytics-mock/debug-view.tsx>) | 0 | 7 | 87 |
| [debug-view.tsx](</Users/li/work/orbit/repos/orbits/features/dashboard/opportunity-reminder-analytics-mock/debug-view.tsx>) | 3 | 7 | 90 |
| [debug-view.tsx](</Users/li/work/orbit/repos/orbits/features/events/attendee-roster/debug-view.tsx>) | 14 | 3 | 87 |
| [debug-view.tsx](</Users/li/work/orbit/repos/orbits/features/events/encounter-note/debug-view.tsx>) | 21 | 4 | 107 |
| [debug-view.tsx](</Users/li/work/orbit/repos/orbits/features/events/event-crud-and-import/debug-view.tsx>) | 17 | 3 | 87 |
| [debug-view.tsx](</Users/li/work/orbit/repos/orbits/features/events/goal-readiness/debug-view.tsx>) | 15 | 3 | 98 |
| [debug-view.tsx](</Users/li/work/orbit/repos/orbits/features/events/post-event-review/debug-view.tsx>) | 14 | 6 | 98 |
| [debug-view.tsx](</Users/li/work/orbit/repos/orbits/features/events/want-connect/debug-view.tsx>) | 14 | 4 | 90 |
