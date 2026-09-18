# 03-contacts：明细索引

按源码顺序分卷；分卷只是文件大小划分，不表示独立页面。

- [明细 1](03-contacts-part-1.md)
- [明细 2](03-contacts-part-2.md)
- [明细 3](03-contacts-part-3.md)

## 实现来源

| 源码 | 控件实现 | 分区节点 | 文案片段 |
| --- | --- | --- | --- |
| [appointment-memo-capture.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/[id]/appointment-memo-capture.tsx>) | 5 | 2 | 8 |
| [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/[id]/page.tsx>) | 0 | 0 | 8 |
| [orbit-all-actions-controls.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/all-actions/orbit-all-actions-controls.tsx>) | 3 | 0 | 3 |
| [orbit-copy-draft-button.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/all-actions/orbit-copy-draft-button.tsx>) | 1 | 0 | 0 |
| [orbit-edit-draft-button.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/all-actions/orbit-edit-draft-button.tsx>) | 1 | 0 | 1 |
| [orbit-real-all-actions.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/all-actions/orbit-real-all-actions.tsx>) | 4 | 12 | 27 |
| [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/all-actions/page.tsx>) | 5 | 2 | 4 |
| [analysis-goal-editor.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/analysis/analysis-goal-editor.tsx>) | 3 | 1 | 23 |
| [contacts-analysis-view-model.ts](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/analysis/contacts-analysis-view-model.ts>) | 0 | 0 | 3 |
| [contacts-analysis-workspace.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/analysis/contacts-analysis-workspace.tsx>) | 21 | 25 | 194 |
| [contacts-structure-detail.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/analysis/contacts-structure-detail.tsx>) | 3 | 10 | 43 |
| [contact-detail-route-service.ts](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-route-service.ts>) | 0 | 0 | 48 |
| [contact-detail-view-model-adapter.ts](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-view-model-adapter.ts>) | 0 | 0 | 38 |
| [contacts-route-view-model.ts](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-route-view-model.ts>) | 0 | 0 | 32 |
| [contacts-subroute-route-adapter.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-subroute-route-adapter.tsx>) | 0 | 1 | 8 |
| [contacts-view-model-adapter.ts](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-view-model-adapter.ts>) | 0 | 0 | 5 |
| [contact-industry-editor.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/contact-industry-editor.tsx>) | 4 | 1 | 30 |
| [contact-interaction-editor.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/contact-interaction-editor.tsx>) | 5 | 1 | 34 |
| [contact-notes-editor.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/contact-notes-editor.tsx>) | 3 | 1 | 27 |
| [contact-relationship-initialization-view-model.ts](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/contact-relationship-initialization-view-model.ts>) | 0 | 0 | 8 |
| [contact-relationship-initialization.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/contact-relationship-initialization.tsx>) | 8 | 2 | 5 |
| [contact-tag-editor.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/contact-tag-editor.tsx>) | 5 | 1 | 36 |
| [orbit-contact-avatar.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/orbit-contact-avatar.tsx>) | 0 | 0 | 3 |
| [orbit-crm-sidebar.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/orbit-crm-sidebar.tsx>) | 2 | 1 | 22 |
| [orbit-real-card-connection.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/orbit-real-card-connection.tsx>) | 19 | 5 | 159 |
| [orbit-real-cards-pipeline-view.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/orbit-real-cards-pipeline-view.tsx>) | 1 | 5 | 18 |
| [orbit-real-contacts.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/orbit-real-contacts.tsx>) | 40 | 13 | 222 |
| [page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/contacts/page.tsx>) | 0 | 0 | 1 |
| [orbit-contacts-presentation.ts](</Users/li/work/orbit/repos/orbits/app/(app)/app/orbit-contacts-presentation.ts>) | 0 | 0 | 105 |
| [api-probe-controls.tsx](</Users/li/work/orbit/repos/orbits/features/contacts/contact-detail-tag-and-status-mock/api-probe-controls.tsx>) | 13 | 0 | 20 |
| [debug-view.tsx](</Users/li/work/orbit/repos/orbits/features/contacts/contact-detail-tag-and-status-mock/debug-view.tsx>) | 0 | 5 | 84 |
| [debug-view.tsx](</Users/li/work/orbit/repos/orbits/features/contacts/contacts-list-search-and-filter-mock/debug-view.tsx>) | 13 | 5 | 113 |
