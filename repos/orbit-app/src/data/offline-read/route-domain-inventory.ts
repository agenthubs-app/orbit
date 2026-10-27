import type { ReadSurface } from '../../api/contract/universal-read';

type SurfaceKey = readonly [consumerFile: string, method: string, endpointTemplate: string];

function domainFor(path: string): string {
  if (path.startsWith('/device/note-drafts')) return 'notes';
  if (path === '/api/dev/network-design-fixture') return 'network-design-fixture';
  if (path.startsWith('/api/auth/') || path === '/api/account/session/sign-out') return 'account';
  if (path === '/api/account/me' || path === '/api/account/status') return 'account';
  if (path.startsWith('/api/account/exports') || path.startsWith('/api/account/deletion-request')) return 'account';
  if (path.startsWith('/api/account/language-preference') || path.startsWith('/api/notification-preferences')) return 'preferences';
  if (path.startsWith('/api/profile/update-suggestions')) return 'profile';
  if (path.startsWith('/api/profile')) return 'profile';
  if (path.startsWith('/api/guide/')) return 'guide';
  if (path.startsWith('/api/integrations')) return 'integrations';
  if (path.startsWith('/api/agent/memory')) return 'agent-memory';
  if (path.startsWith('/api/notes')) return 'notes';
  if (path.startsWith('/api/task-suggestions')) return 'task-suggestions';
  if (path.startsWith('/api/tasks')) return 'tasks';
  if (path === '/api/todo/page') return 'todo';
  if (path === '/api/relationship-tasks' || path === '/api/relationship-tasks/page' || path === '/api/relationship-tasks/:id/resolve') return 'tasks';
  if (path.startsWith('/api/reminders')) return 'followups';
  if (path.includes('/meeting-details')) return 'meetings';
  if (path.startsWith('/api/appointments')) return 'appointments';
  if (path.startsWith('/api/calendar/external-events')) return 'external-calendar';
  if (path === '/api/schedule-items/association-options/notes') return 'notes';
  if (path === '/api/schedule-items/association-options/contacts') return 'contacts';
  if (path.startsWith('/api/schedule-items')) return 'personal-schedule';
  if (path.startsWith('/api/contact-drafts')) return 'acquisition';
  // R12: the card batch's event candidates (会った場所) belong to card acquisition.
  if (path.startsWith('/api/agent/event-attribution')) return 'acquisition';
  // R15: 招待コード (codes, the public preview, redeem, connections) — its own domain, never cached.
  if (path.startsWith('/api/invite-codes')) return 'invite-codes';
  if (path.startsWith('/api/contacts')) return 'contacts';
  if (path === '/api/encounters') return 'contacts';
  if (path.startsWith('/api/connections')) return path.includes('/evidence') ? 'relationship-evidence' : 'connections';
  if (path.startsWith('/api/analysis/relationship-value')) return 'relationship-evidence';
  if (path.startsWith('/api/search/')) return 'contacts';
  if (path.startsWith('/api/relationship-signals')) return 'relationship-signals';
  if (path.startsWith('/api/relationship-communication/invitations') || path.startsWith('/api/contact-invitations')) return 'connections';
  if (path.startsWith('/api/relationship-communication/conversations') && path.endsWith('/read')) return 'message-read-state';
  if (path.startsWith('/api/relationship-communication/conversations') && path.endsWith('/messages')) return 'messages';
  if (path.startsWith('/api/relationship-communication')) return 'conversations';
  if (path.startsWith('/api/chat/')) return 'conversations';
  if (path.startsWith('/api/inbox/delivery/')) return 'notification-delivery';
  if (path.startsWith('/api/inbox/discovery/')) return 'notification-discovery';
  if (path === '/api/inbox/notifications/read' || (path.startsWith('/api/notifications/') && path.endsWith('/state'))) return 'message-read-state';
  if (path.startsWith('/api/notifications') || path.startsWith('/api/inbox/')) return 'notifications';
  if (path.startsWith('/api/devices/')) return 'preferences';
  if (path.startsWith('/api/ai/conversations/groups')) return 'ai-groups';
  if (path.startsWith('/api/ai/conversations/sessions')) return 'ai-sessions';
  if (path.startsWith('/api/ai/conversations')) return 'ai-messages';
  if (path.startsWith('/api/ai/entity-drafts')) return 'ai-entity-drafts';
  if (path.startsWith('/api/ai/runs')) return 'ai-runs';
  if (path.startsWith('/api/ai/proactive-turns')) return 'agent-turns';
  if (path.startsWith('/api/agent/preferences')) return 'agent-preferences';
  if (path.startsWith('/api/agent/settings')) return 'agent-settings';
  if (path.startsWith('/api/agent/signals')) return 'agent-signals';
  if (path.startsWith('/api/agent/actions')) return 'agent-actions';
  if (path.startsWith('/api/agent/ledger')) return 'agent-ledger';
  // R23: the plan v2.2 generation flow (intakes, drafts, goal type, summary).
  if (path.startsWith('/api/agent/plans')) return 'plans';
  // R17 主催（運営センター / イベント運営 / 受付 / 共同運営）：主办实时运营。
  if (path.startsWith('/api/host/')) return 'event-operations';
  if (path.startsWith('/api/recommendations/')) return 'event-recommendations';
  if (path.includes('/registration') || path.includes('/admission/application')) return 'registrations';
  if (path.includes('/access/') || path.includes('/admission/reviews')) return 'event-roles';
  if (path.endsWith('/operations') || path.includes('/operations/')) return 'event-operations';
  if (path.includes('/analytics/')) return 'event-analytics';
  if (path.includes('/experience')) return 'event-experience';
  if (path.includes('/goal') || path.includes('/readiness') || path.includes('/encounters') || path.includes('/post-event')) return 'event-goals';
  if (path.includes('/attendees') || path.includes('/matches') || path.includes('/want-to-connect')) return 'event-memberships';
  if (path.startsWith('/api/events')) return 'events';
  // R27：关注主办方（探す / 詳細）随活动域。
  if (path.startsWith('/api/organizers/')) return 'events';
  if (path.startsWith('/api/dashboard/distributions')) return 'distributions';
  if (path.startsWith('/api/dashboard/opportunities')) return 'opportunities';
  if (path.startsWith('/api/dashboard/network-gaps') || path.startsWith('/api/audit/provenance')) return 'sources';
  if (path.startsWith('/api/dashboard')) return 'dashboard';
  if (path.startsWith('/api/home/')) return 'home';
  if (path.startsWith('/api/mobile/contacts-dashboard')) return 'home';
  // R11b 人脈分析: the deterministic view, its drill-down lists and the iOrbit snapshot (read + 見直す).
  if (path.startsWith('/api/network/')) return 'network-analysis';
  if (path.startsWith('/api/today')) return 'today';
  if (path.startsWith('/api/permissions')) return 'preferences';
  if (path.startsWith('/api/health')) return 'account';
  if (path === '/api/app/version') return 'app-version';
  // /api/sync 是喂养所有域镜像的传输通道，本身不是业务域；登记为独立 id 以便审计完整，
  // 其 durable_normalized 语义准确——响应就是要落成 canonical 镜像行的数据。
  if (path === '/api/sync' || path.startsWith('/api/sync/')) return 'sync';
  throw new Error(`UNREGISTERED_DOMAIN:${path}`);
}

function surfaceFrom([consumerFile, method, endpointTemplate]: SurfaceKey): ReadSurface {
  const domainId = domainFor(endpointTemplate);
  const taskOutboxWrite = (consumerFile === 'src/data/sync/task-outbox-upload.ts' && domainId === 'tasks'
    || consumerFile === 'src/data/sync/schedule-outbox-upload.ts' && domainId === 'personal-schedule')
    && ['POST', 'PATCH', 'DELETE'].includes(method);
  // Sprint 0135: the queued relationship message send (message plan M4).
  const messageOutboxWrite = consumerFile === 'src/data/sync/message-outbox-upload.ts' && domainId === 'messages' && method === 'POST';
  const aiSessionOutboxWrite = consumerFile === 'src/data/sync/ai-session-outbox-upload.ts' && domainId === 'ai-sessions'
    && (method === 'PATCH' || method === 'DELETE');
  // LF12: a contact deleted offline waits in the sync outbox and is sent by every sync round — an offline queue, not online-only.
  const contactDeleteQueueWrite = consumerFile === 'src/data/sync/contact-outbox-upload.ts' && method === 'DELETE';
  const providerTodo = endpointTemplate.startsWith('/api/relationship-signals/email-calendar');
  // The version response is public, but changes on the server and is no-store;
  // online_only_secret is this inventory's existing never-persisted read policy.
  // PX1's development-only fixture has an actor-partitioned, versioned snapshot in network-design-fixture.ts.
  // Keep its exact route in this inventory; the normal contacts policies must not absorb it.
  const secret = providerTodo || endpointTemplate === '/api/account/status' || endpointTemplate.startsWith('/api/account/session/')
    // Home layout and guide state have an actor-scoped owner cache; the generic read mirror must not persist either response.
    || endpointTemplate.startsWith('/api/home/')
    || endpointTemplate === '/api/guide/progress' || endpointTemplate === '/api/guide/state'
    || endpointTemplate === '/api/tasks/demo-status' || endpointTemplate === '/api/profile/onboarding-progress'
    || endpointTemplate.startsWith('/api/account/exports') || endpointTemplate.startsWith('/api/account/deletion-request')
    || endpointTemplate === '/api/app/version'
    // Push preferences are live account/device state; the settings screen does not read a device mirror.
    || endpointTemplate === '/api/inbox/delivery/preferences'
    || endpointTemplate.startsWith('/api/integrations') || endpointTemplate.startsWith('/api/agent/memory')
    || (consumerFile.startsWith('src/screens/me/') && ['/api/events/center', '/api/search/global', '/api/agent/plans/v2/summary'].includes(endpointTemplate))
    || endpointTemplate.startsWith('/api/auth/') || endpointTemplate.startsWith('/api/devices/')
    // Private portraits remain network-only until trusted grant/epoch invalidation is available.
    || endpointTemplate === '/api/events/:id/registration/portrait'
    // R17: host reads (center, console, kiosk, invites, organizer page) are online-only; the check-in roster has its own TTL cache (kiosk-store).
    || consumerFile === 'src/screens/host/host-api.ts'
    // R30: global search is online-only; a query and its answer are never kept on the device.
    || consumerFile === 'src/screens/search/search-api.ts'
    // Provider calendar rows are live/private; never persist them via the read inventory.
    || endpointTemplate.startsWith('/api/calendar/external-events')
    || endpointTemplate === '/api/encounters'
    // Proposal authority and initial send receipts remain private, online-only and never cached.
    || endpointTemplate === '/api/appointments/initial-proposal'
    // R23: the plan flow is online-only (paid AI drafts, versioned intakes); nothing is kept on the device.
    || consumerFile.startsWith('src/screens/plan/')
    || consumerFile === 'src/screens/guide/StartGuideScreen.tsx'
    // R15: invite codes, previews and connections are online-only; a code or a preview is never kept on the device.
    || endpointTemplate.startsWith('/api/invite-codes')
    // R16: import batches (the chosen people, merges to confirm) and the daily question are online-only; never kept on the device.
    || endpointTemplate.startsWith('/api/contacts/import') || endpointTemplate.startsWith('/api/contacts/completion-question')
    // Bounded private readers have no proven revoke/version cache protocol yet.
    || (method === 'GET' && ([
      '/api/contacts/page','/api/contacts/summary','/api/contacts/labels','/api/inbox/summary',
      '/api/relationship-tasks/page','/api/relationship-tasks/:id/resolve','/api/tasks/page','/api/task-suggestions/page','/api/tasks/note-page',
      '/api/contacts/pipeline',
      '/api/relationship-communication/conversation-summaries','/api/relationship-communication/conversations/:id/messages',
      // A private reply draft must disappear with the binding; never cache it (Sprint 0104).
      '/api/relationship-communication/conversations/:id/draft',
      // QA-C3: whether a person can be messaged follows the live binding; asked online only.
      '/api/relationship-communication/eligibility',
    ].includes(endpointTemplate) || [
      'src/api/inbox-badge-resource.ts','src/api/inbox-summary.ts',
    ].includes(consumerFile)));
  const binary = endpointTemplate.endsWith('/image') || endpointTemplate.endsWith('/content');
  return {
    consumerFile,
    endpointTemplate,
    method,
    domainId,
    selector: providerTodo ? 'todo:external-provider-oauth' : `${domainId}:${method}:${endpointTemplate}`,
    schemaVersion: 1,
    readPersistence: secret ? 'online_only_secret' : 'durable_normalized',
    mutationPolicy: taskOutboxWrite || messageOutboxWrite || aiSessionOutboxWrite || contactDeleteQueueWrite ? 'offline_queue' : 'online_only',
    binaryPolicy: secret ? 'never_local' : binary ? 'on_demand_encrypted' : 'metadata_only',
  };
}

const surfaceKeys: readonly SurfaceKey[] = [
  ["src/screens/me/AccountSettingsScreen.tsx","GET","/api/profile"],
  ["src/screens/me/MyPageScreen.tsx","GET","/api/events/center"],
  ["src/screens/me/MyPageScreen.tsx","GET","/api/events/mine"],
  ["src/screens/me/MyPageScreen.tsx","GET","/api/profile"],
  ["src/screens/me/account-api.ts","POST","/api/profile/seek-suggestions"],
  ["src/screens/me/useMyPageSummaries.ts","GET","/api/events/center"],
  ["src/screens/me/useMyPageSummaries.ts","GET","/api/events/mine"],
  ["src/screens/me/account-api.ts","PUT","/api/profile"],
  ["src/screens/me/settings-api.ts","DELETE","/api/agent/memory/:id"],
  ["src/screens/me/settings-api.ts","DELETE","/api/integrations/:id"],
  ["src/screens/me/settings-api.ts","GET","/api/agent/memory"],
  ["src/screens/me/settings-api.ts","GET","/api/agent/plans/v2/summary"],
  ["src/screens/me/settings-api.ts","GET","/api/integrations"],
  ["src/screens/me/settings-api.ts","GET","/api/search/global"],
  ["src/screens/me/settings-api.ts","POST","/api/profile/intro-draft"],
  ["src/screens/me/suggestions-api.ts","GET","/api/profile/update-suggestions"],
  ["src/screens/me/suggestions-api.ts","POST","/api/profile/extractions/business-card"],
  ["src/screens/me/suggestions-api.ts","POST","/api/profile/extractions/resume"],
  ["src/screens/me/suggestions-api.ts","POST","/api/profile/update-suggestions/:id/accept"],
  ["src/screens/me/suggestions-api.ts","POST","/api/profile/update-suggestions/:id/dismiss"],
  ["src/screens/me/suggestions-api.ts","PUT","/api/profile"],
  ["src/screens/me/useAccountEditor.ts","PUT","/api/profile"],
  ["src/screens/me/useAccountProfile.ts","GET","/api/profile"],
  // R28: onboarding progress and guide are private, online-only actor state.
  ["src/api/guide-progress.ts","GET","/api/guide/progress"],
  ["src/screens/task/TaskScreen.tsx","GET","/api/tasks/demo-status"],
  ["src/api/task-plan-demo.ts","PATCH","/api/guide/state"],
  ["src/api/profile-onboarding-progress.ts","GET","/api/profile/onboarding-progress"],
  ["src/api/profile-onboarding-progress.ts","POST","/api/profile/onboarding-progress"],
  // The native guide constructs the existing plan API; its transitive calls stay registered.
  ["src/screens/guide/StartGuideScreen.tsx","DELETE","/api/agent/plans/v2/:id"],
  ["src/screens/guide/StartGuideScreen.tsx","DELETE","/api/agent/plans/intakes/:id"],
  ["src/screens/guide/StartGuideScreen.tsx","DELETE","/api/agent/plans/v2/:id/types/:id"],
  ["src/screens/guide/StartGuideScreen.tsx","GET","/api/agent/plans/drafts/:id"],
  ["src/screens/guide/StartGuideScreen.tsx","GET","/api/agent/plans/intakes"],
  ["src/screens/guide/StartGuideScreen.tsx","GET","/api/agent/plans/intakes/:id"],
  ["src/screens/guide/StartGuideScreen.tsx","GET","/api/agent/plans/v2/:id"],
  ["src/screens/guide/StartGuideScreen.tsx","GET","/api/agent/plans/v2/:id/types/:id"],
  ["src/screens/guide/StartGuideScreen.tsx","GET","/api/agent/plans/v2/summary"],
  ["src/screens/guide/StartGuideScreen.tsx","PATCH","/api/agent/plans/intakes/:id"],
  ["src/screens/guide/StartGuideScreen.tsx","POST","/api/agent/plans/drafts/:id"],
  ["src/screens/guide/StartGuideScreen.tsx","POST","/api/agent/plans/goal-kind"],
  ["src/screens/guide/StartGuideScreen.tsx","POST","/api/agent/plans/intakes"],
  ["src/screens/guide/StartGuideScreen.tsx","POST","/api/agent/plans/intakes/:id"],
  ["src/screens/guide/StartGuideScreen.tsx","POST","/api/agent/plans/v2/:id"],
  ["src/screens/guide/StartGuideScreen.tsx","POST","/api/agent/plans/v2/:id/types/:id"],
  ["src/screens/guide/StartGuideScreen.tsx","POST","/api/agent/plans/v2/pending/:id"],
  ["src/screens/guide/StartGuideScreen.tsx","GET","/api/agent/plans/legacy"],
  ["src/screens/guide/StartGuideScreen.tsx","GET","/api/agent/plans/legacy/:id"],
  ["src/screens/guide/StartGuideScreen.tsx","GET","/api/agent/plans/v2/quota"],
  ["src/screens/guide/StartGuideScreen.tsx","PATCH","/api/agent/plans/v2/:id"],
  // R17 主催（App）：src/screens/host 的接口都经 host-api.ts。
  ["src/screens/host/host-api.ts","DELETE","/api/organizers/:id/follow"],
  ["src/screens/host/host-api.ts","GET","/api/events/by-slug/:id"],
  ["src/screens/host/host-api.ts","GET","/api/events/center"],
  ["src/screens/host/host-api.ts","GET","/api/host/center"],
  ["src/screens/host/host-api.ts","GET","/api/host/check-in-events"],
  ["src/screens/host/host-api.ts","GET","/api/host/cohost-invites/:id"],
  ["src/screens/host/host-api.ts","GET","/api/host/events/:id"],
  ["src/screens/host/host-api.ts","GET","/api/host/events/:id/kiosk"],
  ["src/screens/host/host-api.ts","GET","/api/host/events/:id/kiosk/roster"],
  ["src/screens/host/host-api.ts","GET","/api/host/events/:id/matching"],
  ["src/screens/host/host-api.ts","GET","/api/host/events/:id/overview"],
  ["src/screens/host/host-api.ts","GET","/api/host/events/:id/people"],
  ["src/screens/host/host-api.ts","GET","/api/host/events/:id/report"],
  ["src/screens/host/host-api.ts","GET","/api/host/organizer-profiles"],
  ["src/screens/host/host-api.ts","GET","/api/organizers/by-slug/:id"],
  ["src/screens/host/host-api.ts","POST","/api/events/:id/operations/admin/check-ins/:id"],
  ["src/screens/host/host-api.ts","POST","/api/events/:id/operations/admin/check-ins/:id/admit-on-site"],
  ["src/screens/host/host-api.ts","POST","/api/events/:id/operations/admin/check-ins/:id/undo"],
  ["src/screens/host/host-api.ts","POST","/api/events/:id/operations/admin/check-ins/scan"],
  ["src/screens/host/host-api.ts","POST","/api/events/:id/operations/kiosk-heartbeat"],
  ["src/screens/host/host-api.ts","POST","/api/host/cohost-invites/:id/accept"],
  ["src/screens/host/host-api.ts","POST","/api/host/desktop-link"],
  ["src/screens/host/host-api.ts","POST","/api/host/events/:id/matching/publish"],
  ["src/screens/host/host-api.ts","POST","/api/host/events/:id/notices/preview"],
  ["src/screens/host/host-api.ts","POST","/api/host/events/:id/notices/send"],
  ["src/screens/host/host-api.ts","POST","/api/host/events/:id/people/:id/decision"],
  ["src/screens/host/host-api.ts","POST","/api/organizers/:id/follow"],
  // R23: the plan v2.2 generation flow (src/screens/plan, all through plan-api.ts); online-only, never cached.
  ["src/screens/plan/plan-api.ts","GET","/api/agent/plans/v2/summary"],
  ["src/screens/plan/PlanAddMemberSheet.tsx","DELETE","/api/agent/plans/v2/:id"],
  ["src/screens/plan/PlanAddMemberSheet.tsx","DELETE","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/PlanAddMemberSheet.tsx","DELETE","/api/agent/plans/v2/:id/types/:id"],
  ["src/screens/plan/PlanAddMemberSheet.tsx","GET","/api/agent/plans/v2/:id"],
  ["src/screens/plan/PlanAddMemberSheet.tsx","GET","/api/agent/plans/v2/:id/types/:id"],
  ["src/screens/plan/PlanAddMemberSheet.tsx","POST","/api/agent/plans/v2/:id"],
  ["src/screens/plan/PlanAddMemberSheet.tsx","POST","/api/agent/plans/v2/:id/types/:id"],
  ["src/screens/plan/PlanAddMemberSheet.tsx","POST","/api/agent/plans/v2/pending/:id"],
  ["src/screens/plan/PlanFlowScreen.tsx","DELETE","/api/agent/plans/v2/:id"],
  ["src/screens/plan/PlanFlowScreen.tsx","DELETE","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/PlanFlowScreen.tsx","DELETE","/api/agent/plans/v2/:id/types/:id"],
  ["src/screens/plan/PlanFlowScreen.tsx","GET","/api/agent/plans/v2/:id"],
  ["src/screens/plan/PlanFlowScreen.tsx","GET","/api/agent/plans/v2/:id/types/:id"],
  ["src/screens/plan/PlanFlowScreen.tsx","POST","/api/agent/plans/v2/:id"],
  ["src/screens/plan/PlanFlowScreen.tsx","POST","/api/agent/plans/v2/:id/types/:id"],
  ["src/screens/plan/PlanFlowScreen.tsx","POST","/api/agent/plans/v2/pending/:id"],
  ["src/screens/plan/PlanGoalInput.tsx","DELETE","/api/agent/plans/v2/:id"],
  ["src/screens/plan/PlanGoalInput.tsx","DELETE","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/PlanGoalInput.tsx","DELETE","/api/agent/plans/v2/:id/types/:id"],
  ["src/screens/plan/PlanGoalInput.tsx","GET","/api/agent/plans/v2/:id"],
  ["src/screens/plan/PlanGoalInput.tsx","GET","/api/agent/plans/v2/:id/types/:id"],
  ["src/screens/plan/PlanGoalInput.tsx","POST","/api/agent/plans/v2/:id"],
  ["src/screens/plan/PlanGoalInput.tsx","POST","/api/agent/plans/v2/:id/types/:id"],
  ["src/screens/plan/PlanGoalInput.tsx","POST","/api/agent/plans/v2/pending/:id"],
  ["src/screens/plan/PlanManualEditScreen.tsx","DELETE","/api/agent/plans/v2/:id"],
  ["src/screens/plan/PlanManualEditScreen.tsx","DELETE","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/PlanManualEditScreen.tsx","DELETE","/api/agent/plans/v2/:id/types/:id"],
  ["src/screens/plan/PlanManualEditScreen.tsx","GET","/api/agent/plans/v2/:id"],
  ["src/screens/plan/PlanManualEditScreen.tsx","GET","/api/agent/plans/v2/:id/types/:id"],
  ["src/screens/plan/PlanManualEditScreen.tsx","POST","/api/agent/plans/v2/:id"],
  ["src/screens/plan/PlanManualEditScreen.tsx","POST","/api/agent/plans/v2/:id/types/:id"],
  ["src/screens/plan/PlanManualEditScreen.tsx","POST","/api/agent/plans/v2/pending/:id"],
  ["src/screens/plan/PlanOverview.tsx","DELETE","/api/agent/plans/v2/:id"],
  ["src/screens/plan/PlanOverview.tsx","DELETE","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/PlanOverview.tsx","DELETE","/api/agent/plans/v2/:id/types/:id"],
  ["src/screens/plan/PlanOverview.tsx","GET","/api/agent/plans/drafts/:id"],
  ["src/screens/plan/PlanOverview.tsx","GET","/api/agent/plans/intakes"],
  ["src/screens/plan/PlanOverview.tsx","GET","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/PlanOverview.tsx","GET","/api/agent/plans/v2/:id"],
  ["src/screens/plan/PlanOverview.tsx","GET","/api/agent/plans/v2/:id/types/:id"],
  ["src/screens/plan/PlanOverview.tsx","GET","/api/agent/plans/v2/summary"],
  ["src/screens/plan/PlanOverview.tsx","PATCH","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/PlanOverview.tsx","POST","/api/agent/plans/drafts/:id"],
  ["src/screens/plan/PlanOverview.tsx","POST","/api/agent/plans/goal-kind"],
  ["src/screens/plan/PlanOverview.tsx","POST","/api/agent/plans/intakes"],
  ["src/screens/plan/PlanOverview.tsx","POST","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/PlanOverview.tsx","POST","/api/agent/plans/v2/:id"],
  ["src/screens/plan/PlanOverview.tsx","POST","/api/agent/plans/v2/:id/types/:id"],
  ["src/screens/plan/PlanOverview.tsx","POST","/api/agent/plans/v2/pending/:id"],
  ["src/screens/plan/PlanProposalSheet.tsx","DELETE","/api/agent/plans/v2/:id"],
  ["src/screens/plan/PlanProposalSheet.tsx","DELETE","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/PlanProposalSheet.tsx","DELETE","/api/agent/plans/v2/:id/types/:id"],
  ["src/screens/plan/PlanProposalSheet.tsx","GET","/api/agent/plans/drafts/:id"],
  ["src/screens/plan/PlanProposalSheet.tsx","GET","/api/agent/plans/intakes"],
  ["src/screens/plan/PlanProposalSheet.tsx","GET","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/PlanProposalSheet.tsx","GET","/api/agent/plans/v2/:id"],
  ["src/screens/plan/PlanProposalSheet.tsx","GET","/api/agent/plans/v2/:id/types/:id"],
  ["src/screens/plan/PlanProposalSheet.tsx","GET","/api/agent/plans/v2/summary"],
  ["src/screens/plan/PlanProposalSheet.tsx","PATCH","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/PlanProposalSheet.tsx","POST","/api/agent/plans/drafts/:id"],
  ["src/screens/plan/PlanProposalSheet.tsx","POST","/api/agent/plans/goal-kind"],
  ["src/screens/plan/PlanProposalSheet.tsx","POST","/api/agent/plans/intakes"],
  ["src/screens/plan/PlanProposalSheet.tsx","POST","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/PlanProposalSheet.tsx","POST","/api/agent/plans/v2/:id"],
  ["src/screens/plan/PlanProposalSheet.tsx","POST","/api/agent/plans/v2/:id/types/:id"],
  ["src/screens/plan/PlanProposalSheet.tsx","POST","/api/agent/plans/v2/pending/:id"],
  ["src/screens/plan/PlanRecordSheet.tsx","DELETE","/api/agent/plans/v2/:id"],
  ["src/screens/plan/PlanRecordSheet.tsx","DELETE","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/PlanRecordSheet.tsx","DELETE","/api/agent/plans/v2/:id/types/:id"],
  ["src/screens/plan/PlanRecordSheet.tsx","GET","/api/agent/plans/drafts/:id"],
  ["src/screens/plan/PlanRecordSheet.tsx","GET","/api/agent/plans/intakes"],
  ["src/screens/plan/PlanRecordSheet.tsx","GET","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/PlanRecordSheet.tsx","GET","/api/agent/plans/v2/:id"],
  ["src/screens/plan/PlanRecordSheet.tsx","GET","/api/agent/plans/v2/:id/types/:id"],
  ["src/screens/plan/PlanRecordSheet.tsx","GET","/api/agent/plans/v2/summary"],
  ["src/screens/plan/PlanRecordSheet.tsx","PATCH","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/PlanRecordSheet.tsx","POST","/api/agent/plans/drafts/:id"],
  ["src/screens/plan/PlanRecordSheet.tsx","POST","/api/agent/plans/goal-kind"],
  ["src/screens/plan/PlanRecordSheet.tsx","POST","/api/agent/plans/intakes"],
  ["src/screens/plan/PlanRecordSheet.tsx","POST","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/PlanRecordSheet.tsx","POST","/api/agent/plans/v2/:id"],
  ["src/screens/plan/PlanRecordSheet.tsx","POST","/api/agent/plans/v2/:id/types/:id"],
  ["src/screens/plan/PlanRecordSheet.tsx","POST","/api/agent/plans/v2/pending/:id"],
  ["src/screens/plan/PlanSegment.tsx","DELETE","/api/agent/plans/v2/:id"],
  ["src/screens/plan/PlanSegment.tsx","DELETE","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/PlanSegment.tsx","DELETE","/api/agent/plans/v2/:id/types/:id"],
  ["src/screens/plan/PlanSegment.tsx","GET","/api/agent/plans/v2/:id"],
  ["src/screens/plan/PlanSegment.tsx","GET","/api/agent/plans/v2/:id/types/:id"],
  ["src/screens/plan/PlanSegment.tsx","POST","/api/agent/plans/v2/:id"],
  ["src/screens/plan/PlanSegment.tsx","POST","/api/agent/plans/v2/:id/types/:id"],
  ["src/screens/plan/PlanSegment.tsx","POST","/api/agent/plans/v2/pending/:id"],
  ["src/screens/plan/PlanTypeScreen.tsx","DELETE","/api/agent/plans/v2/:id"],
  ["src/screens/plan/PlanTypeScreen.tsx","DELETE","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/PlanTypeScreen.tsx","DELETE","/api/agent/plans/v2/:id/types/:id"],
  ["src/screens/plan/PlanTypeScreen.tsx","GET","/api/agent/plans/drafts/:id"],
  ["src/screens/plan/PlanTypeScreen.tsx","GET","/api/agent/plans/intakes"],
  ["src/screens/plan/PlanTypeScreen.tsx","GET","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/PlanTypeScreen.tsx","GET","/api/agent/plans/v2/:id"],
  ["src/screens/plan/PlanTypeScreen.tsx","GET","/api/agent/plans/v2/:id/types/:id"],
  ["src/screens/plan/PlanTypeScreen.tsx","GET","/api/agent/plans/v2/summary"],
  ["src/screens/plan/PlanTypeScreen.tsx","PATCH","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/PlanTypeScreen.tsx","POST","/api/agent/plans/drafts/:id"],
  ["src/screens/plan/PlanTypeScreen.tsx","POST","/api/agent/plans/goal-kind"],
  ["src/screens/plan/PlanTypeScreen.tsx","POST","/api/agent/plans/intakes"],
  ["src/screens/plan/PlanTypeScreen.tsx","POST","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/PlanTypeScreen.tsx","POST","/api/agent/plans/v2/:id"],
  ["src/screens/plan/PlanTypeScreen.tsx","POST","/api/agent/plans/v2/:id/types/:id"],
  ["src/screens/plan/PlanTypeScreen.tsx","POST","/api/agent/plans/v2/pending/:id"],
  ["src/screens/plan/plan-api.ts","DELETE","/api/agent/plans/v2/:id"],
  ["src/screens/plan/plan-api.ts","DELETE","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/plan-api.ts","DELETE","/api/agent/plans/v2/:id/types/:id"],
  ["src/screens/plan/plan-api.ts","GET","/api/agent/plans/v2/:id"],
  ["src/screens/plan/plan-api.ts","GET","/api/agent/plans/v2/:id/types/:id"],
  ["src/screens/plan/plan-api.ts","POST","/api/agent/plans/v2/:id"],
  ["src/screens/plan/plan-api.ts","POST","/api/agent/plans/v2/:id/types/:id"],
  ["src/screens/plan/plan-api.ts","POST","/api/agent/plans/v2/pending/:id"],
  ["src/screens/plan/usePlanAwardToast.ts","DELETE","/api/agent/plans/v2/:id"],
  ["src/screens/plan/usePlanAwardToast.ts","DELETE","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/usePlanAwardToast.ts","DELETE","/api/agent/plans/v2/:id/types/:id"],
  ["src/screens/plan/usePlanAwardToast.ts","GET","/api/agent/plans/drafts/:id"],
  ["src/screens/plan/usePlanAwardToast.ts","GET","/api/agent/plans/intakes"],
  ["src/screens/plan/usePlanAwardToast.ts","GET","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/usePlanAwardToast.ts","GET","/api/agent/plans/v2/:id"],
  ["src/screens/plan/usePlanAwardToast.ts","GET","/api/agent/plans/v2/:id/types/:id"],
  ["src/screens/plan/usePlanAwardToast.ts","GET","/api/agent/plans/v2/summary"],
  ["src/screens/plan/usePlanAwardToast.ts","PATCH","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/usePlanAwardToast.ts","POST","/api/agent/plans/drafts/:id"],
  ["src/screens/plan/usePlanAwardToast.ts","POST","/api/agent/plans/goal-kind"],
  ["src/screens/plan/usePlanAwardToast.ts","POST","/api/agent/plans/intakes"],
  ["src/screens/plan/usePlanAwardToast.ts","POST","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/usePlanAwardToast.ts","POST","/api/agent/plans/v2/:id"],
  ["src/screens/plan/usePlanAwardToast.ts","POST","/api/agent/plans/v2/:id/types/:id"],
  ["src/screens/plan/usePlanAwardToast.ts","POST","/api/agent/plans/v2/pending/:id"],
  ["src/screens/plan/plan-api.ts","GET","/api/agent/plans/intakes"],
  ["src/screens/plan/plan-api.ts","POST","/api/agent/plans/intakes"],
  ["src/screens/plan/plan-api.ts","GET","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/plan-api.ts","PATCH","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/plan-api.ts","POST","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/plan-api.ts","POST","/api/agent/plans/goal-kind"],
  ["src/screens/plan/plan-api.ts","GET","/api/agent/plans/drafts/:id"],
  ["src/screens/plan/plan-api.ts","POST","/api/agent/plans/drafts/:id"],
  ["src/screens/plan/PlanAddMemberSheet.tsx","GET","/api/agent/plans/v2/summary"],
  ["src/screens/plan/PlanAddMemberSheet.tsx","GET","/api/agent/plans/intakes"],
  ["src/screens/plan/PlanAddMemberSheet.tsx","POST","/api/agent/plans/intakes"],
  ["src/screens/plan/PlanAddMemberSheet.tsx","GET","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/PlanAddMemberSheet.tsx","PATCH","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/PlanAddMemberSheet.tsx","POST","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/PlanAddMemberSheet.tsx","POST","/api/agent/plans/goal-kind"],
  ["src/screens/plan/PlanAddMemberSheet.tsx","GET","/api/agent/plans/drafts/:id"],
  ["src/screens/plan/PlanAddMemberSheet.tsx","POST","/api/agent/plans/drafts/:id"],
  ["src/screens/plan/PlanFlowScreen.tsx","GET","/api/agent/plans/v2/summary"],
  ["src/screens/plan/PlanFlowScreen.tsx","GET","/api/agent/plans/intakes"],
  ["src/screens/plan/PlanFlowScreen.tsx","POST","/api/agent/plans/intakes"],
  ["src/screens/plan/PlanFlowScreen.tsx","GET","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/PlanFlowScreen.tsx","PATCH","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/PlanFlowScreen.tsx","POST","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/PlanFlowScreen.tsx","POST","/api/agent/plans/goal-kind"],
  ["src/screens/plan/PlanFlowScreen.tsx","GET","/api/agent/plans/drafts/:id"],
  ["src/screens/plan/PlanFlowScreen.tsx","POST","/api/agent/plans/drafts/:id"],
  ["src/screens/plan/PlanGoalInput.tsx","GET","/api/agent/plans/v2/summary"],
  ["src/screens/plan/PlanGoalInput.tsx","GET","/api/agent/plans/intakes"],
  ["src/screens/plan/PlanGoalInput.tsx","POST","/api/agent/plans/intakes"],
  ["src/screens/plan/PlanGoalInput.tsx","GET","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/PlanGoalInput.tsx","PATCH","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/PlanGoalInput.tsx","POST","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/PlanGoalInput.tsx","POST","/api/agent/plans/goal-kind"],
  ["src/screens/plan/PlanGoalInput.tsx","GET","/api/agent/plans/drafts/:id"],
  ["src/screens/plan/PlanGoalInput.tsx","POST","/api/agent/plans/drafts/:id"],
  ["src/screens/plan/PlanManualEditScreen.tsx","GET","/api/agent/plans/v2/summary"],
  ["src/screens/plan/PlanManualEditScreen.tsx","GET","/api/agent/plans/intakes"],
  ["src/screens/plan/PlanManualEditScreen.tsx","POST","/api/agent/plans/intakes"],
  ["src/screens/plan/PlanManualEditScreen.tsx","GET","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/PlanManualEditScreen.tsx","PATCH","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/PlanManualEditScreen.tsx","POST","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/PlanManualEditScreen.tsx","POST","/api/agent/plans/goal-kind"],
  ["src/screens/plan/PlanManualEditScreen.tsx","GET","/api/agent/plans/drafts/:id"],
  ["src/screens/plan/PlanManualEditScreen.tsx","POST","/api/agent/plans/drafts/:id"],
  ["src/screens/plan/PlanSegment.tsx","GET","/api/agent/plans/v2/summary"],
  ["src/screens/plan/PlanSegment.tsx","GET","/api/agent/plans/intakes"],
  ["src/screens/plan/PlanSegment.tsx","POST","/api/agent/plans/intakes"],
  ["src/screens/plan/PlanSegment.tsx","GET","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/PlanSegment.tsx","PATCH","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/PlanSegment.tsx","POST","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/PlanSegment.tsx","POST","/api/agent/plans/goal-kind"],
  ["src/screens/plan/PlanSegment.tsx","GET","/api/agent/plans/drafts/:id"],
  ["src/screens/plan/PlanSegment.tsx","POST","/api/agent/plans/drafts/:id"],
  ["src/screens/plan/plan-api.ts","GET","/api/contacts"],
  // R25 見直し / 達成 / goals / 以前のプラン: the plan v2 endpoints each usePlanApi() consumer can reach.
  ["src/screens/plan/PlanAddMemberSheet.tsx","GET","/api/agent/plans/legacy"],
  ["src/screens/plan/PlanAddMemberSheet.tsx","GET","/api/agent/plans/legacy/:id"],
  ["src/screens/plan/PlanAddMemberSheet.tsx","GET","/api/agent/plans/v2/quota"],
  ["src/screens/plan/PlanAddMemberSheet.tsx","PATCH","/api/agent/plans/v2/:id"],
  ["src/screens/plan/PlanDoneScreen.tsx","DELETE","/api/agent/plans/v2/:id"],
  ["src/screens/plan/PlanDoneScreen.tsx","DELETE","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/PlanDoneScreen.tsx","DELETE","/api/agent/plans/v2/:id/types/:id"],
  ["src/screens/plan/PlanDoneScreen.tsx","GET","/api/agent/plans/drafts/:id"],
  ["src/screens/plan/PlanDoneScreen.tsx","GET","/api/agent/plans/intakes"],
  ["src/screens/plan/PlanDoneScreen.tsx","GET","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/PlanDoneScreen.tsx","GET","/api/agent/plans/legacy"],
  ["src/screens/plan/PlanDoneScreen.tsx","GET","/api/agent/plans/legacy/:id"],
  ["src/screens/plan/PlanDoneScreen.tsx","GET","/api/agent/plans/v2/:id"],
  ["src/screens/plan/PlanDoneScreen.tsx","GET","/api/agent/plans/v2/:id/types/:id"],
  ["src/screens/plan/PlanDoneScreen.tsx","GET","/api/agent/plans/v2/quota"],
  ["src/screens/plan/PlanDoneScreen.tsx","GET","/api/agent/plans/v2/summary"],
  ["src/screens/plan/PlanDoneScreen.tsx","PATCH","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/PlanDoneScreen.tsx","PATCH","/api/agent/plans/v2/:id"],
  ["src/screens/plan/PlanDoneScreen.tsx","POST","/api/agent/plans/drafts/:id"],
  ["src/screens/plan/PlanDoneScreen.tsx","POST","/api/agent/plans/goal-kind"],
  ["src/screens/plan/PlanDoneScreen.tsx","POST","/api/agent/plans/intakes"],
  ["src/screens/plan/PlanDoneScreen.tsx","POST","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/PlanDoneScreen.tsx","POST","/api/agent/plans/v2/:id"],
  ["src/screens/plan/PlanDoneScreen.tsx","POST","/api/agent/plans/v2/:id/types/:id"],
  ["src/screens/plan/PlanDoneScreen.tsx","POST","/api/agent/plans/v2/pending/:id"],
  ["src/screens/plan/PlanNextGoalScreen.tsx","DELETE","/api/agent/plans/v2/:id"],
  ["src/screens/plan/PlanNextGoalScreen.tsx","DELETE","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/PlanNextGoalScreen.tsx","DELETE","/api/agent/plans/v2/:id/types/:id"],
  ["src/screens/plan/PlanNextGoalScreen.tsx","GET","/api/agent/plans/drafts/:id"],
  ["src/screens/plan/PlanNextGoalScreen.tsx","GET","/api/agent/plans/intakes"],
  ["src/screens/plan/PlanNextGoalScreen.tsx","GET","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/PlanNextGoalScreen.tsx","GET","/api/agent/plans/legacy"],
  ["src/screens/plan/PlanNextGoalScreen.tsx","GET","/api/agent/plans/legacy/:id"],
  ["src/screens/plan/PlanNextGoalScreen.tsx","GET","/api/agent/plans/v2/:id"],
  ["src/screens/plan/PlanNextGoalScreen.tsx","GET","/api/agent/plans/v2/:id/types/:id"],
  ["src/screens/plan/PlanNextGoalScreen.tsx","GET","/api/agent/plans/v2/quota"],
  ["src/screens/plan/PlanNextGoalScreen.tsx","GET","/api/agent/plans/v2/summary"],
  ["src/screens/plan/PlanNextGoalScreen.tsx","PATCH","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/PlanNextGoalScreen.tsx","PATCH","/api/agent/plans/v2/:id"],
  ["src/screens/plan/PlanNextGoalScreen.tsx","POST","/api/agent/plans/drafts/:id"],
  ["src/screens/plan/PlanNextGoalScreen.tsx","POST","/api/agent/plans/goal-kind"],
  ["src/screens/plan/PlanNextGoalScreen.tsx","POST","/api/agent/plans/intakes"],
  ["src/screens/plan/PlanNextGoalScreen.tsx","POST","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/PlanNextGoalScreen.tsx","POST","/api/agent/plans/v2/:id"],
  ["src/screens/plan/PlanNextGoalScreen.tsx","POST","/api/agent/plans/v2/:id/types/:id"],
  ["src/screens/plan/PlanNextGoalScreen.tsx","POST","/api/agent/plans/v2/pending/:id"],
  ["src/screens/plan/PlanFlowScreen.tsx","GET","/api/agent/plans/legacy"],
  ["src/screens/plan/PlanFlowScreen.tsx","GET","/api/agent/plans/legacy/:id"],
  ["src/screens/plan/PlanFlowScreen.tsx","GET","/api/agent/plans/v2/quota"],
  ["src/screens/plan/PlanFlowScreen.tsx","PATCH","/api/agent/plans/v2/:id"],
  ["src/screens/plan/PlanGoalInput.tsx","GET","/api/agent/plans/legacy"],
  ["src/screens/plan/PlanGoalInput.tsx","GET","/api/agent/plans/legacy/:id"],
  ["src/screens/plan/PlanGoalInput.tsx","GET","/api/agent/plans/v2/quota"],
  ["src/screens/plan/PlanGoalInput.tsx","PATCH","/api/agent/plans/v2/:id"],
  ["src/screens/plan/PlanGoalSwitcher.tsx","DELETE","/api/agent/plans/v2/:id"],
  ["src/screens/plan/PlanGoalSwitcher.tsx","DELETE","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/PlanGoalSwitcher.tsx","DELETE","/api/agent/plans/v2/:id/types/:id"],
  ["src/screens/plan/PlanGoalSwitcher.tsx","GET","/api/agent/plans/drafts/:id"],
  ["src/screens/plan/PlanGoalSwitcher.tsx","GET","/api/agent/plans/intakes"],
  ["src/screens/plan/PlanGoalSwitcher.tsx","GET","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/PlanGoalSwitcher.tsx","GET","/api/agent/plans/legacy"],
  ["src/screens/plan/PlanGoalSwitcher.tsx","GET","/api/agent/plans/legacy/:id"],
  ["src/screens/plan/PlanGoalSwitcher.tsx","GET","/api/agent/plans/v2/:id"],
  ["src/screens/plan/PlanGoalSwitcher.tsx","GET","/api/agent/plans/v2/:id/types/:id"],
  ["src/screens/plan/PlanGoalSwitcher.tsx","GET","/api/agent/plans/v2/quota"],
  ["src/screens/plan/PlanGoalSwitcher.tsx","GET","/api/agent/plans/v2/summary"],
  ["src/screens/plan/PlanGoalSwitcher.tsx","PATCH","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/PlanGoalSwitcher.tsx","PATCH","/api/agent/plans/v2/:id"],
  ["src/screens/plan/PlanGoalSwitcher.tsx","POST","/api/agent/plans/drafts/:id"],
  ["src/screens/plan/PlanGoalSwitcher.tsx","POST","/api/agent/plans/goal-kind"],
  ["src/screens/plan/PlanGoalSwitcher.tsx","POST","/api/agent/plans/intakes"],
  ["src/screens/plan/PlanGoalSwitcher.tsx","POST","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/PlanGoalSwitcher.tsx","POST","/api/agent/plans/v2/:id"],
  ["src/screens/plan/PlanGoalSwitcher.tsx","POST","/api/agent/plans/v2/:id/types/:id"],
  ["src/screens/plan/PlanGoalSwitcher.tsx","POST","/api/agent/plans/v2/pending/:id"],
  ["src/screens/plan/PlanLegacy.tsx","DELETE","/api/agent/plans/v2/:id"],
  ["src/screens/plan/PlanLegacy.tsx","DELETE","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/PlanLegacy.tsx","DELETE","/api/agent/plans/v2/:id/types/:id"],
  ["src/screens/plan/PlanLegacy.tsx","GET","/api/agent/plans/drafts/:id"],
  ["src/screens/plan/PlanLegacy.tsx","GET","/api/agent/plans/intakes"],
  ["src/screens/plan/PlanLegacy.tsx","GET","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/PlanLegacy.tsx","GET","/api/agent/plans/legacy"],
  ["src/screens/plan/PlanLegacy.tsx","GET","/api/agent/plans/legacy/:id"],
  ["src/screens/plan/PlanLegacy.tsx","GET","/api/agent/plans/v2/:id"],
  ["src/screens/plan/PlanLegacy.tsx","GET","/api/agent/plans/v2/:id/types/:id"],
  ["src/screens/plan/PlanLegacy.tsx","GET","/api/agent/plans/v2/quota"],
  ["src/screens/plan/PlanLegacy.tsx","GET","/api/agent/plans/v2/summary"],
  ["src/screens/plan/PlanLegacy.tsx","PATCH","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/PlanLegacy.tsx","PATCH","/api/agent/plans/v2/:id"],
  ["src/screens/plan/PlanLegacy.tsx","POST","/api/agent/plans/drafts/:id"],
  ["src/screens/plan/PlanLegacy.tsx","POST","/api/agent/plans/goal-kind"],
  ["src/screens/plan/PlanLegacy.tsx","POST","/api/agent/plans/intakes"],
  ["src/screens/plan/PlanLegacy.tsx","POST","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/PlanLegacy.tsx","POST","/api/agent/plans/v2/:id"],
  ["src/screens/plan/PlanLegacy.tsx","POST","/api/agent/plans/v2/:id/types/:id"],
  ["src/screens/plan/PlanLegacy.tsx","POST","/api/agent/plans/v2/pending/:id"],
  ["src/screens/plan/PlanManualEditScreen.tsx","GET","/api/agent/plans/legacy"],
  ["src/screens/plan/PlanManualEditScreen.tsx","GET","/api/agent/plans/legacy/:id"],
  ["src/screens/plan/PlanManualEditScreen.tsx","GET","/api/agent/plans/v2/quota"],
  ["src/screens/plan/PlanManualEditScreen.tsx","PATCH","/api/agent/plans/v2/:id"],
  ["src/screens/plan/PlanOverview.tsx","GET","/api/agent/plans/legacy"],
  ["src/screens/plan/PlanOverview.tsx","GET","/api/agent/plans/legacy/:id"],
  ["src/screens/plan/PlanOverview.tsx","GET","/api/agent/plans/v2/quota"],
  ["src/screens/plan/PlanOverview.tsx","PATCH","/api/agent/plans/v2/:id"],
  ["src/screens/plan/PlanProposalSheet.tsx","GET","/api/agent/plans/legacy"],
  ["src/screens/plan/PlanProposalSheet.tsx","GET","/api/agent/plans/legacy/:id"],
  ["src/screens/plan/PlanProposalSheet.tsx","GET","/api/agent/plans/v2/quota"],
  ["src/screens/plan/PlanProposalSheet.tsx","PATCH","/api/agent/plans/v2/:id"],
  ["src/screens/plan/PlanRecordSheet.tsx","GET","/api/agent/plans/legacy"],
  ["src/screens/plan/PlanRecordSheet.tsx","GET","/api/agent/plans/legacy/:id"],
  ["src/screens/plan/PlanRecordSheet.tsx","GET","/api/agent/plans/v2/quota"],
  ["src/screens/plan/PlanRecordSheet.tsx","PATCH","/api/agent/plans/v2/:id"],
  ["src/screens/plan/PlanReviewEntrySheet.tsx","DELETE","/api/agent/plans/v2/:id"],
  ["src/screens/plan/PlanReviewEntrySheet.tsx","DELETE","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/PlanReviewEntrySheet.tsx","DELETE","/api/agent/plans/v2/:id/types/:id"],
  ["src/screens/plan/PlanReviewEntrySheet.tsx","GET","/api/agent/plans/drafts/:id"],
  ["src/screens/plan/PlanReviewEntrySheet.tsx","GET","/api/agent/plans/intakes"],
  ["src/screens/plan/PlanReviewEntrySheet.tsx","GET","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/PlanReviewEntrySheet.tsx","GET","/api/agent/plans/legacy"],
  ["src/screens/plan/PlanReviewEntrySheet.tsx","GET","/api/agent/plans/legacy/:id"],
  ["src/screens/plan/PlanReviewEntrySheet.tsx","GET","/api/agent/plans/v2/:id"],
  ["src/screens/plan/PlanReviewEntrySheet.tsx","GET","/api/agent/plans/v2/:id/types/:id"],
  ["src/screens/plan/PlanReviewEntrySheet.tsx","GET","/api/agent/plans/v2/quota"],
  ["src/screens/plan/PlanReviewEntrySheet.tsx","GET","/api/agent/plans/v2/summary"],
  ["src/screens/plan/PlanReviewEntrySheet.tsx","PATCH","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/PlanReviewEntrySheet.tsx","PATCH","/api/agent/plans/v2/:id"],
  ["src/screens/plan/PlanReviewEntrySheet.tsx","POST","/api/agent/plans/drafts/:id"],
  ["src/screens/plan/PlanReviewEntrySheet.tsx","POST","/api/agent/plans/goal-kind"],
  ["src/screens/plan/PlanReviewEntrySheet.tsx","POST","/api/agent/plans/intakes"],
  ["src/screens/plan/PlanReviewEntrySheet.tsx","POST","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/PlanReviewEntrySheet.tsx","POST","/api/agent/plans/v2/:id"],
  ["src/screens/plan/PlanReviewEntrySheet.tsx","POST","/api/agent/plans/v2/:id/types/:id"],
  ["src/screens/plan/PlanReviewEntrySheet.tsx","POST","/api/agent/plans/v2/pending/:id"],
  ["src/screens/plan/PlanReviewScreen.tsx","DELETE","/api/agent/plans/v2/:id"],
  ["src/screens/plan/PlanReviewScreen.tsx","DELETE","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/PlanReviewScreen.tsx","DELETE","/api/agent/plans/v2/:id/types/:id"],
  ["src/screens/plan/PlanReviewScreen.tsx","GET","/api/agent/plans/drafts/:id"],
  ["src/screens/plan/PlanReviewScreen.tsx","GET","/api/agent/plans/intakes"],
  ["src/screens/plan/PlanReviewScreen.tsx","GET","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/PlanReviewScreen.tsx","GET","/api/agent/plans/legacy"],
  ["src/screens/plan/PlanReviewScreen.tsx","GET","/api/agent/plans/legacy/:id"],
  ["src/screens/plan/PlanReviewScreen.tsx","GET","/api/agent/plans/v2/:id"],
  ["src/screens/plan/PlanReviewScreen.tsx","GET","/api/agent/plans/v2/:id/types/:id"],
  ["src/screens/plan/PlanReviewScreen.tsx","GET","/api/agent/plans/v2/quota"],
  ["src/screens/plan/PlanReviewScreen.tsx","GET","/api/agent/plans/v2/summary"],
  ["src/screens/plan/PlanReviewScreen.tsx","PATCH","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/PlanReviewScreen.tsx","PATCH","/api/agent/plans/v2/:id"],
  ["src/screens/plan/PlanReviewScreen.tsx","POST","/api/agent/plans/drafts/:id"],
  ["src/screens/plan/PlanReviewScreen.tsx","POST","/api/agent/plans/goal-kind"],
  ["src/screens/plan/PlanReviewScreen.tsx","POST","/api/agent/plans/intakes"],
  ["src/screens/plan/PlanReviewScreen.tsx","POST","/api/agent/plans/intakes/:id"],
  ["src/screens/plan/PlanReviewScreen.tsx","POST","/api/agent/plans/v2/:id"],
  ["src/screens/plan/PlanReviewScreen.tsx","POST","/api/agent/plans/v2/:id/types/:id"],
  ["src/screens/plan/PlanReviewScreen.tsx","POST","/api/agent/plans/v2/pending/:id"],
  ["src/screens/plan/PlanSegment.tsx","GET","/api/agent/plans/legacy"],
  ["src/screens/plan/PlanSegment.tsx","GET","/api/agent/plans/legacy/:id"],
  ["src/screens/plan/PlanSegment.tsx","GET","/api/agent/plans/v2/quota"],
  ["src/screens/plan/PlanSegment.tsx","PATCH","/api/agent/plans/v2/:id"],
  ["src/screens/plan/PlanTypeScreen.tsx","GET","/api/agent/plans/legacy"],
  ["src/screens/plan/PlanTypeScreen.tsx","GET","/api/agent/plans/legacy/:id"],
  ["src/screens/plan/PlanTypeScreen.tsx","GET","/api/agent/plans/v2/quota"],
  ["src/screens/plan/PlanTypeScreen.tsx","PATCH","/api/agent/plans/v2/:id"],
  ["src/screens/plan/plan-api.ts","GET","/api/agent/plans/legacy"],
  ["src/screens/plan/plan-api.ts","GET","/api/agent/plans/legacy/:id"],
  ["src/screens/plan/plan-api.ts","GET","/api/agent/plans/v2/quota"],
  ["src/screens/plan/plan-api.ts","PATCH","/api/agent/plans/v2/:id"],
  ["src/screens/plan/usePlanAwardToast.ts","GET","/api/agent/plans/legacy"],
  ["src/screens/plan/usePlanAwardToast.ts","GET","/api/agent/plans/legacy/:id"],
  ["src/screens/plan/usePlanAwardToast.ts","GET","/api/agent/plans/v2/quota"],
  ["src/screens/plan/usePlanAwardToast.ts","PATCH","/api/agent/plans/v2/:id"],
  ["src/api/ai-session-management.ts","POST","/api/ai/conversations/groups"],
  ["src/api/ai-session-management.ts","DELETE","/api/ai/conversations/groups/:id"],
  ["src/api/ai-session-management.ts","PATCH","/api/ai/conversations/groups/:id"],
  ["src/api/ai-session-management.ts","PATCH","/api/ai/conversations/sessions/:id"],
  ["src/api/ai-session-management.ts","DELETE","/api/ai/conversations/sessions/:id"],
  ["src/api/ai-session-management.ts","POST","/api/ai/conversations/sessions/:id/restore"],
  ["src/api/auth-session.ts","POST","/api/account/session/sign-out"],
  ["src/api/app-version.ts","GET","/api/app/version"],
  ["src/data/sync/sync-client.ts","GET","/api/sync"],
  ["src/data/sync/sync-client.ts","GET","/api/sync/lease"],
  ["src/data/sync/sync-client.ts","GET","/api/sync/manifest"],
  ["src/data/sync/sync-client.ts","GET","/api/sync/domains/:domainId"],
  ["src/data/sync/note-outbox-upload.ts","POST","/api/notes"],
  ["src/data/sync/note-outbox-upload.ts","PATCH","/api/notes/:id"],
  ["src/data/sync/task-outbox-upload.ts","POST","/api/tasks"],
  ["src/data/sync/task-outbox-upload.ts","PATCH","/api/tasks/:id"],
  ["src/data/sync/task-outbox-upload.ts","DELETE","/api/tasks/:id"],
  ["src/data/sync/schedule-outbox-upload.ts","POST","/api/schedule-items"],
  ["src/data/sync/schedule-outbox-upload.ts","PATCH","/api/schedule-items/:id"],
  ["src/data/sync/schedule-outbox-upload.ts","DELETE","/api/schedule-items/:id"],
  ["src/data/sync/message-outbox-upload.ts","POST","/api/relationship-communication/conversations/:id/messages"],
  ["src/data/sync/ai-session-outbox-upload.ts","PATCH","/api/ai/conversations/sessions/:id"],
  ["src/data/sync/ai-session-outbox-upload.ts","DELETE","/api/ai/conversations/sessions/:id"],
  ["src/api/browser-auth.ts","GET","/api/auth/csrf"],
  ["src/api/browser-auth.ts","POST","/api/auth/callback/credentials"],
  ["src/api/auth-session.ts","POST","/api/auth/register"],
  ["src/api/auth-session.ts","POST","/api/auth/mobile/credentials"],
  ["src/api/auth-session.ts","POST","/api/auth/mobile/google/exchange"],
  ["src/api/AuthSessionProvider.tsx","GET","/api/account/me"],
  ["src/api/mobile-auth.ts","GET","/api/account/status"],
  ["src/api/AuthSessionProvider.tsx","POST","/api/auth/mobile/credentials"],
  ["src/api/AuthSessionProvider.tsx","POST","/api/auth/mobile/google/exchange"],
  ["src/api/mobile-auth.ts","POST","/api/auth/mobile/credentials"],
  ["src/api/mobile-auth.ts","POST","/api/auth/mobile/google/exchange"],
  ["src/api/mobile-auth.ts","GET","/api/auth/mobile/providers"],
  ["src/api/mobile-auth.ts","GET","/api/auth/session"],
  ["src/api/profile-onboarding.ts","GET","/api/contact-drafts/business-card/batches/v2"],
  ["src/api/profile-onboarding.ts","GET","/api/contact-drafts/business-card/batches/v2/:id"],
  ["src/api/profile-onboarding.ts","GET","/api/profile"],
  ["src/api/profile-onboarding.ts","POST","/api/contact-drafts/business-card/scan"],
  ["src/api/profile-onboarding.ts","POST","/api/profile/intro-draft"],
  ["src/api/profile-onboarding.ts","PUT","/api/profile"],
  ["src/api/inbox-summary.ts","GET","/api/inbox/summary"],
  // Sprint 0131: the reconnect probe and the online-only boundary's retry read the unauthenticated health route.
  ["src/components/OnlineOnlyBoundary.tsx","GET","/api/health"],
  ["src/hooks/useSyncedCollection.ts","GET","/api/health"],
  // Sprint 0131: the profile edit session (preview, tags, edit, more, suggestions) reads the profile through its hook.
  ["src/hooks/useContactCardPages.ts","GET","/api/contacts/page"],
  ["src/hooks/useContactCardPages.ts","GET","/api/contacts/summary"],
  ["src/i18n/OrbitLocaleProvider.tsx","GET","/api/account/language-preference"],
  ["src/i18n/OrbitLocaleProvider.tsx","PUT","/api/account/language-preference"],
  ["src/notifications/delivery-ownership.ts","GET","/api/inbox/delivery/owner"],
  ["src/notifications/delivery-ownership.ts","POST","/api/inbox/delivery/owner"],
  ["src/notifications/native-notifications.ts","GET","/api/reminders"],
  ["src/notifications/NotificationLifecycle.tsx","POST","/api/devices/push-tokens"],
  ["src/notifications/push-device-session.ts","DELETE","/api/devices/push-token"],
  ["src/notifications/push-device-session.ts","DELETE","/api/devices/push-tokens/:id"],
  ["src/screens/add/add-api.ts","GET","/api/agent/event-attribution/candidates"],
  ["src/screens/add/add-api.ts","GET","/api/contact-drafts"],
  ["src/screens/add/add-api.ts","GET","/api/contact-drafts/business-card/batches/v2/:id"],
  ["src/screens/add/add-api.ts","GET","/api/contacts/manual/organizations"],
  ["src/screens/add/add-api.ts","GET","/api/events/mine"],
  ["src/screens/add/add-api.ts","POST","/api/contact-drafts/:id/confirm"],
  ["src/screens/add/add-api.ts","POST","/api/contact-drafts/:id/discard"],
  ["src/screens/add/add-api.ts","POST","/api/contact-drafts/business-card/batches/v2"],
  ["src/screens/add/add-api.ts","POST","/api/contact-drafts/business-card/batches/v2/:id/duplicates"],
  ["src/screens/add/add-api.ts","POST","/api/contact-drafts/business-card/batches/v2/:id/finalize"],
  ["src/screens/add/add-api.ts","POST","/api/contact-drafts/business-card/batches/v2/:id/items/:id/confirm"],
  ["src/screens/add/add-api.ts","POST","/api/contact-drafts/business-card/batches/v2/:id/items/:id/manual-entry"],
  ["src/screens/add/add-api.ts","POST","/api/contact-drafts/business-card/batches/v2/:id/items/:id/replace"],
  ["src/screens/add/add-api.ts","POST","/api/contact-drafts/business-card/batches/v2/:id/items/:id/retry"],
  ["src/screens/add/add-api.ts","POST","/api/contact-drafts/business-card/batches/v2/:id/items/:id/skip"],
  ["src/screens/add/add-api.ts","POST","/api/contact-drafts/event-attendees/import"],
  ["src/screens/add/add-api.ts","POST","/api/contacts/manual"],
  ["src/screens/add/add-api.ts","POST","/api/contacts/manual/:id/undo"],
  ["src/screens/add/add-api.ts","POST","/api/contacts/manual/duplicates"],
  // R15 招待コード (src/screens/add/invite/invite-api.ts): the sender, the receiver and the share / unlink sheets.
  ["src/screens/add/invite/invite-api.ts","GET","/api/invite-codes"],
  ["src/screens/add/invite/invite-api.ts","GET","/api/invite-codes/:id/preview"],
  ["src/screens/add/invite/invite-api.ts","GET","/api/invite-codes/connections/:id"],
  ["src/screens/add/invite/invite-api.ts","GET","/api/invite-codes/current"],
  ["src/screens/add/invite/invite-api.ts","GET","/api/profile"],
  ["src/screens/add/invite/invite-api.ts","POST","/api/invite-codes"],
  ["src/screens/add/invite/invite-api.ts","POST","/api/invite-codes/:id/redeem"],
  ["src/screens/add/invite/invite-api.ts","POST","/api/invite-codes/:id/revoke"],
  ["src/screens/add/invite/invite-api.ts","POST","/api/invite-codes/connections/:id/merge"],
  ["src/screens/add/invite/invite-api.ts","POST","/api/invite-codes/connections/:id/merge/dismiss"],
  ["src/screens/add/invite/invite-api.ts","POST","/api/invite-codes/connections/:id/unlink"],
  ["src/screens/add/invite/invite-api.ts","PUT","/api/invite-codes/connections/:id/share"],
  ["src/screens/add/invite/invite-api.ts","PUT","/api/invite-codes/current/share"],
  // R16 取り込み (src/screens/add/import/import-api.ts) and 今日の 1問 (CompletionQuestionCard).
  ["src/screens/add/import/import-api.ts","GET","/api/contacts/import/:id"],
  ["src/screens/add/import/import-api.ts","PATCH","/api/contacts/import/:id"],
  ["src/screens/add/import/import-api.ts","POST","/api/contacts/import"],
  ["src/screens/add/import/import-api.ts","POST","/api/contacts/import/:id"],
  ["src/screens/add/CompletionQuestionCard.tsx","GET","/api/contacts/completion-question"],
  ["src/screens/add/CompletionQuestionCard.tsx","POST","/api/contacts/completion-question/:id/answer"],
  ["src/screens/add/CompletionQuestionCard.tsx","POST","/api/contacts/completion-question/:id/skip"],
  ["src/screens/add/invite/invite-api.ts","PUT","/api/profile"],
  ["src/screens/admin/AdminScreen.tsx","GET","/api/dashboard"],
  ["src/screens/admin/AdminScreen.tsx","GET","/api/events"],
  ["src/screens/admin/AdminScreen.tsx","GET","/api/profile"],
  ["src/screens/agent/AgentLedgerScreen.tsx","GET","/api/agent/ledger"],
  ["src/screens/agent/AgentLedgerScreen.tsx","POST","/api/agent/ledger/:id/transition"],
  // R20: meeting negotiation uses live participant visibility and has no device snapshot.
  ["src/screens/calendar/meeting-detail-actions.ts","POST","/api/appointments/:id/commands"],
  ["src/screens/calendar/meeting-proposal-flow.ts","GET","/api/appointments/:id"],
  ["src/screens/calendar/meeting-proposal-flow.ts","GET","/api/appointments/initial-proposal"],
  ["src/screens/calendar/meeting-proposal-flow.ts","POST","/api/appointments/initial-proposal"],
  ["src/screens/calendar/meeting-proposal-flow.ts","POST","/api/appointments/:id/commands"],
  ["src/screens/calendar/useCalendarExternalEvents.ts","GET","/api/calendar/external-events"],
  ["src/screens/ai/AgentActionsScreen.tsx","GET","/api/agent/actions"],
  ["src/screens/ai/AgentActionsScreen.tsx","POST","/api/agent/actions/:id/accept"],
  ["src/screens/ai/AgentActionsScreen.tsx","POST","/api/agent/actions/:id/dismiss"],
  ["src/screens/ai/AiConversationScreen.tsx","GET","/api/ai/conversations"],
  ["src/screens/ai/AiConversationScreen.tsx","POST","/api/ai/conversations"],
  ["src/screens/ai/AiConversationScreen.tsx","GET","/api/ai/conversations/:id"],
  ["src/screens/ai/AiConversationScreen.tsx","POST","/api/ai/conversations/:id"],
  ["src/screens/ai/AiConversationScreen.tsx","POST","/api/ai/conversations/sessions"],
  ["src/screens/ai/AiConversationScreen.tsx","GET","/api/ai/conversations/sessions/:id"],
  ["src/screens/ai/AiConversationScreen.tsx","GET","/api/ai/entity-drafts"],
  ["src/screens/ai/AiConversationScreen.tsx","POST","/api/ai/entity-drafts/:id"],
  ["src/screens/ai/ContactMentionPicker.tsx","GET","/api/contacts/page"],
  ["src/screens/ai/ContactReferenceChip.tsx","GET","/api/contacts/:id"],
  ["src/screens/ai/AiConversationScreen.tsx","POST","/api/task-suggestions/:id/accept"],
  ["src/screens/ai/AiConversationScreen.tsx","POST","/api/task-suggestions/:id/dismiss"],
  ["src/screens/ai/AiScreen.tsx","GET","/api/ai/conversations"],
  ["src/screens/ai/AiScreen.tsx","GET","/api/ai/conversations/groups"],
  ["src/screens/ai/AiScreen.tsx","GET","/api/ai/conversations/sessions"],
  ["src/screens/ai/AiScreen.tsx","GET","/api/agent/plans/intakes"],
  ["src/screens/ai/AiScreen.tsx","GET","/api/agent/plans/v2/summary"],
  ["src/screens/ai/AiScreen.tsx","GET","/api/contacts/summary"],
  ["src/screens/ai/AiScreen.tsx","GET","/api/today"],
  ["src/screens/chat/RelationshipChatDetailScreen.tsx","GET","/api/relationship-communication/conversations/:id/messages"],
  ["src/screens/chat/RelationshipChatScreen.tsx","GET","/api/relationship-communication/conversation-summaries"],
  ["src/screens/inbox/NotificationDetailScreen.tsx","GET","/api/inbox/notifications/:id"],
  ["src/screens/inbox/NotificationDetailScreen.tsx","POST","/api/inbox/notifications/:id/actions"],
  ["src/screens/inbox/RelationshipInboxScreen.tsx","GET","/api/notifications/deliveries/:id"],
  ["src/screens/inbox/RelationshipInboxScreen.tsx","GET","/api/relationship-communication/conversation-summaries"],
  ["src/screens/inbox/RelationshipInboxScreen.tsx","GET","/api/inbox/summary"],
  ["src/screens/inbox/RelationshipInboxScreen.tsx","GET","/api/relationship-communication/conversations/:id/messages"],
  ["src/screens/inbox/RelationshipInboxScreen.tsx","GET","/api/relationship-communication/unread-summary"],
  ["src/screens/inbox/RelationshipInboxScreen.tsx","GET","/api/relationship-communication/conversations/:id/draft"],
  ["src/screens/inbox/RelationshipInboxScreen.tsx","PUT","/api/relationship-communication/conversations/:id/draft"],
  ["src/screens/inbox/RelationshipInboxScreen.tsx","PATCH","/api/agent/signals/:id"],
  ["src/screens/inbox/RelationshipInboxScreen.tsx","POST","/api/relationship-communication/conversations/:id/read"],
  ["src/screens/inbox/useNotificationInbox.ts","GET","/api/inbox/notifications"],
  ["src/screens/inbox/useNotificationInbox.ts","GET","/api/inbox/delivery/preferences"],
  ["src/screens/inbox/useNotificationInbox.ts","POST","/api/inbox/notifications/read"],
  ["src/screens/inbox/useNotificationInbox.ts","POST","/api/inbox/notifications/:id/actions"],
  // R11a 人脈（一覧・連絡先詳細・編集・削除）。
  ["src/screens/network/ContactEditScreen.tsx","GET","/api/contacts/:id"],
  ["src/screens/network/ContactEditScreen.tsx","PATCH","/api/contacts/:id"],
  ["src/screens/network/ContactEditScreen.tsx","PATCH","/api/contacts/:id/fields"],
  ["src/screens/network/NetworkContactScreen.tsx","GET","/api/agent/plans/v2/contacts/:id/fit"],
  ["src/screens/network/NetworkContactScreen.tsx","GET","/api/contacts/:id"],
  ["src/screens/network/NetworkContactScreen.tsx","GET","/api/contacts/value-lines"],
  ["src/screens/network/NetworkContactScreen.tsx","GET","/api/relationship-communication/eligibility"],
  ["src/screens/network/NetworkContactScreen.tsx","POST","/api/agent/plans/v2/:id/types/:id/candidates/:id/decision"],
  ["src/screens/network/NetworkContactScreen.tsx","POST","/api/relationship-communication/conversations/start"],
  ["src/screens/network/NetworkScreen.tsx","POST","/api/contacts/:id/restore"],
  ["src/data/sync/contact-outbox-upload.ts","DELETE","/api/contacts/:id"],
  ["src/screens/network/useDeleteContact.ts","DELETE","/api/contacts/:id"],
  ["src/screens/network/useNetworkList.ts","GET","/api/contacts/page"],
  ["src/screens/network/useNetworkList.ts","GET","/api/contacts/summary"],
  ["src/screens/network/network-design-fixture.ts","GET","/api/dev/network-design-fixture"],
  ["src/screens/network/useNetworkMerge.ts","GET","/api/contacts/goal-related-ids"],
  // R11b 人脈分析 (src/screens/network-analysis, all through analysis-api.ts): the view and the first list page are kept
  // in the page snapshot store for offline reading; the snapshot is read online only; 見直す is an online write.
  ["src/screens/network-analysis/analysis-api.ts","GET","/api/network/analysis"],
  ["src/screens/network-analysis/analysis-api.ts","GET","/api/network/analysis/people"],
  ["src/screens/network-analysis/analysis-api.ts","GET","/api/network/snapshot"],
  ["src/screens/network-analysis/analysis-api.ts","POST","/api/network/snapshot/recompute"],
  ["src/screens/search/search-api.ts","GET","/api/search/global"],
  ["src/screens/search/useGlobalSearchSource.ts","GET","/api/search/global"],
  ["src/screens/events/v2/PrepPage.tsx","POST","/api/schedule-items"],
  ["src/screens/events/v2/VenuePage.tsx","POST","/api/events/:id/operations/contact-requests"],
  ["src/screens/events/v2/VenuePage.tsx","POST","/api/events/:id/operations/contact-requests/:id/respond"],
  ["src/screens/events/v2/journey-api.ts","DELETE","/api/organizers/:id/follow"],
  ["src/screens/events/v2/journey-api.ts","GET","/api/events/:id/after"],
  ["src/screens/events/v2/journey-api.ts","GET","/api/events/:id/overview"],
  ["src/screens/events/v2/journey-api.ts","GET","/api/events/:id/prep"],
  ["src/screens/events/v2/journey-api.ts","GET","/api/events/:id/venue"],
  ["src/screens/events/v2/journey-api.ts","GET","/api/events/by-code/:id"],
  ["src/screens/events/v2/journey-api.ts","GET","/api/events/discover"],
  ["src/screens/events/v2/journey-api.ts","GET","/api/events/search"],
  ["src/screens/events/v2/journey-api.ts","PATCH","/api/events/:id/prep/checklist"],
  ["src/screens/events/v2/journey-api.ts","POST","/api/events/:id/after/confirm"],
  ["src/screens/events/v2/journey-api.ts","POST","/api/events/:id/join/cancel"],
  ["src/screens/events/v2/journey-api.ts","POST","/api/events/:id/join/next"],
  ["src/screens/events/v2/journey-api.ts","POST","/api/events/:id/join/profile"],
  ["src/screens/events/v2/journey-api.ts","POST","/api/events/:id/join/submit"],
  ["src/screens/events/v2/journey-api.ts","POST","/api/events/:id/join/tentative"],
  ["src/screens/events/v2/journey-api.ts","POST","/api/events/:id/venue/memo"],
  ["src/screens/events/v2/journey-api.ts","POST","/api/organizers/:id/follow"],
  ["src/screens/events/v2/journey-api.ts","POST","/api/recommendations/events/:id/dismiss"],
  ["src/screens/events/v2/events-api.ts","GET","/api/events/assessments"],
  ["src/screens/events/v2/events-api.ts","GET","/api/events/assessments/:id"],
  ["src/screens/events/v2/events-api.ts","DELETE","/api/events/assessments/:id"],
  ["src/screens/events/v2/events-api.ts","GET","/api/events/assessments/availability"],
  ["src/screens/events/v2/events-api.ts","GET","/api/events/mine"],
  // LF2: the events tab reads its three lists as page copies (event-assessments, events-mine).
  ["src/screens/events/v2/EventsHome.tsx","GET","/api/events/assessments"],
  ["src/screens/events/v2/EventsHome.tsx","GET","/api/events/mine"],
  ["src/screens/events/v2/events-api.ts","PATCH","/api/events/assessments/:id"],
  ["src/screens/events/v2/events-api.ts","POST","/api/events/assessments"],
  ["src/screens/events/v2/events-api.ts","POST","/api/events/assessments/:id/add-to-plan"],
  ["src/screens/events/v2/events-api.ts","POST","/api/events/assessments/:id/dismiss"],
  ["src/screens/events/v2/events-api.ts","POST","/api/events/assessments/posters"],
  ["src/screens/tasks/RelationshipLifecycleList.tsx","GET","/api/relationship-tasks/page"],
  ["src/screens/tasks/RelationshipLifecycleScreen.tsx","GET","/api/connections/:id/lifecycle"],
  ["src/screens/tasks/RelationshipLifecycleScreen.tsx","POST","/api/connections/:id/lifecycle"],
  ["src/view-models/relationship-initialization.ts","GET","/api/connections/:id/lifecycle"],
  ["src/view-models/relationship-initialization.ts","GET","/api/contacts/:id/relationship-initialization"],
  ["src/view-models/relationship-initialization.ts","POST","/api/contacts/:id/relationship-initialization"],
  ["src/screens/home/HomeDashboardScreen.tsx","GET","/api/recommendations/events"],
  ["src/screens/home/HomeDashboardScreen.tsx","GET","/api/schedule-items"],
  ["src/screens/home/HomeDashboardScreen.tsx","GET","/api/tasks/page"],
  ["src/screens/home/HomeDashboardScreen.tsx","PATCH","/api/tasks/:id"],
  ["src/screens/home/HomeScreen.tsx","GET","/api/events/public"],
  // R10 Home widgets read only their mounted sources; the layout hook owns its actor-scoped offline draft.
  ["src/screens/home/HomeWidgetCards.tsx","GET","/api/agent/plans/v2/summary"],
  // LF1: the next five are fallbacks only — read when the browser has no device mirror; native Home reads its domains.
  ["src/screens/home/HomeWidgetCards.tsx","GET","/api/contacts/page"],
  ["src/screens/home/HomeWidgetCards.tsx","GET","/api/contacts/summary"],
  ["src/screens/home/HomeWidgetCards.tsx","GET","/api/events/mine"],
  ["src/screens/home/HomeWidgetCards.tsx","GET","/api/inbox/secretary/preview"],
  ["src/screens/home/HomeWidgetCards.tsx","GET","/api/notes"],
  ["src/screens/home/HomeWidgetCards.tsx","GET","/api/recommendations/events"],
  ["src/screens/home/HomeWidgetCards.tsx","GET","/api/relationship-tasks/page"],
  ["src/screens/home/HomeWidgetCards.tsx","GET","/api/schedule-items"],
  ["src/screens/home/HomeWidgetCards.tsx","GET","/api/todo/page"],
  // R19 projects the same R10 GETs into a bounded WidgetKit snapshot; it adds no write route.
  ["src/widgets/read-home-sources.ts","GET","/api/agent/plans/v2/summary"],
  ["src/widgets/read-home-sources.ts","GET","/api/contacts/page"],
  ["src/widgets/read-home-sources.ts","GET","/api/contacts/summary"],
  ["src/widgets/read-home-sources.ts","GET","/api/events/mine"],
  ["src/widgets/read-home-sources.ts","GET","/api/inbox/secretary/preview"],
  ["src/widgets/read-home-sources.ts","GET","/api/schedule-items"],
  ["src/widgets/read-home-sources.ts","GET","/api/todo/page"],
  ["src/screens/home/HomeWidgetsScreen.tsx","GET","/api/home/guide-progress"],
  ["src/screens/home/HomeWidgetsScreen.tsx","GET","/api/profile"],
  ["src/screens/home/home-layout-sync.ts","PUT","/api/home/layout"],
  ["src/screens/home/use-home-layout.ts","GET","/api/home/layout"],
  ["src/screens/home/use-home-layout.ts","PUT","/api/home/layout"],
  ["src/screens/memo/EditMemoScreen.tsx","POST","/api/contacts/search"],
  ["src/screens/memo/EditMemoScreen.tsx","GET","/api/events"],
  ["src/screens/memo/EditMemoScreen.tsx","PATCH","/api/notes/:id"],
  ["src/screens/memo/delete-note.ts","DELETE","/api/notes/:id"],
  ["src/screens/memo/NewMemoScreen.tsx","POST","/api/contacts/search"],
  ["src/screens/memo/NewMemoScreen.tsx","GET","/api/events"],
  ["src/screens/memo/NewMemoScreen.tsx","POST","/api/notes"],
  ["src/screens/memo/MemoDetailScreen.tsx","GET","/api/events"],
  // Sprint 0108: native notes read the device mirror. Sprint 0125: the browser too when its mirror is available; these are its fallback reads.
  ["src/screens/notes/note-source-tasks-source.web.ts","GET","/api/tasks/note-page"],
  ["src/screens/notes/notes-source.web.ts","GET","/api/notes"],
  ["src/screens/notes/notes-source.web.ts","GET","/api/notes/:id"],
  ["src/screens/notes/useNoteContactSummaries.ts","GET","/api/contacts/:id"],
  ["src/screens/platform/PlatformScreen.tsx","GET","/api/events/public"],
  ["src/screens/profile/AccountAuthScreen.tsx","POST","/api/auth/password-reset/request"],
  ["src/screens/profile/AccountScreen.tsx","GET","/api/account/me"],
  ["src/screens/account-rights/api.ts","GET","/api/account/exports"],
  ["src/screens/account-rights/api.ts","POST","/api/account/exports"],
  ["src/screens/account-rights/api.ts","GET","/api/account/deletion-request"],
  ["src/screens/account-rights/api.ts","GET","/api/account/deletion-request/method"],
  ["src/screens/account-rights/api.ts","POST","/api/account/deletion-request/reauth"],
  ["src/screens/account-rights/api.ts","POST","/api/account/deletion-request/reauth/google/start"],
  ["src/screens/account-rights/api.ts","POST","/api/account/deletion-request"],
  ["src/screens/account-rights/api.ts","DELETE","/api/account/deletion-request"],
  ["src/screens/profile/PasswordResetScreen.tsx","POST","/api/auth/password-reset/confirm"],
  ["src/screens/profile/useProfileEditSessionScreen.ts","GET","/api/profile"],
  ["src/screens/schedule/MeetingDetailScreen.tsx","GET","/api/appointments/:id"],
  ["src/screens/schedule/MeetingDetailScreen.tsx","PATCH","/api/appointments/:id"],
  ["src/screens/schedule/MeetingDetailScreen.tsx","GET","/api/appointments/:id/details"],
  ["src/screens/schedule/MeetingDetailScreen.tsx","PATCH","/api/appointments/:id/details"],
  ["src/screens/schedule/MeetingDetailScreen.tsx","GET","/api/schedule-items/:id/meeting-details"],
  ["src/screens/schedule/MeetingDetailScreen.tsx","PATCH","/api/schedule-items/:id/meeting-details"],
  // Sprint 0108: native reads the device mirror; the browser is mirror-first, this read is its fallback.
  ["src/screens/schedule/personal-schedule-source.web.ts","GET","/api/schedule-items"],
  ["src/screens/schedule/personal-schedule-source.web.ts","GET","/api/schedule-items/:id"],
  ["src/screens/schedule/PersonalScheduleAssociations.tsx","GET","/api/contacts/:id"],
  ["src/screens/schedule/PersonalScheduleAssociations.tsx","GET","/api/notes/:id"],
  ["src/screens/schedule/PersonalScheduleAssociations.tsx","GET","/api/schedule-items/association-options/notes"],
  ["src/screens/schedule/PersonalScheduleAssociations.tsx","GET","/api/schedule-items/association-options/contacts"],
  ["src/screens/schedule/PersonalScheduleScreen.tsx","GET","/api/schedule-items"],
  ["src/screens/schedule/PersonalScheduleScreen.tsx","GET","/api/schedule-items/:id"],
  ["src/screens/schedule/PersonalScheduleScreen.tsx","DELETE","/api/schedule-items"],
  ["src/screens/schedule/PersonalScheduleScreen.tsx","DELETE","/api/schedule-items/:id"],
  ["src/screens/schedule/PersonalScheduleScreen.tsx","PATCH","/api/schedule-items"],
  ["src/screens/schedule/PersonalScheduleScreen.tsx","PATCH","/api/schedule-items/:id"],
  ["src/screens/schedule/PersonalScheduleScreen.tsx","POST","/api/schedule-items"],
  ["src/screens/schedule/PersonalScheduleScreen.tsx","POST","/api/schedule-items/:id"],
  ["src/screens/schedule/ScheduleEventPreviewScreen.tsx","GET","/api/events/public/:id"],
  // Sprint 0115: the calendar reads the device mirror; these are the browser's fallback reads when its mirror is unavailable.
  ["src/screens/schedule/schedule-calendar-source.web.ts","GET","/api/events/public"],
  ["src/screens/schedule/schedule-calendar-source.web.ts","GET","/api/schedule-items"],
  // Transport inventory must agree across consumers of this route; the filtered native meeting copy has its own calendar.read action in offline-policy.ts.
  ["src/screens/calendar/useCalendarMeetings.ts","GET","/api/schedule-items"],
  ["src/screens/schedule/schedule-calendar-source.web.ts","GET","/api/tasks/page"],
  ["src/screens/settings/ApiSettingsScreen.tsx","GET","/api/health"],
  ["src/screens/settings/NotificationDeliverySettings.tsx","GET","/api/inbox/delivery/preferences"],
  ["src/screens/settings/NotificationDeliverySettings.tsx","POST","/api/inbox/delivery/preferences"],
  ["src/screens/settings/NotificationDiscoverySettings.tsx","GET","/api/inbox/discovery/preferences"],
  ["src/screens/settings/NotificationDiscoverySettings.tsx","POST","/api/inbox/discovery/preferences"],
  ["src/screens/tasks/RelationshipTaskTools.tsx","GET","/api/inbox/notifications"],
  ["src/screens/tasks/PendingTaskSuggestions.tsx","GET","/api/task-suggestions/page"],
  ["src/screens/tasks/TaskDetailScreen.tsx","GET","/api/reminders"],
  ["src/screens/tasks/TaskDetailScreen.tsx","GET","/api/tasks/:id"],
  ["src/screens/tasks/TaskDetailScreen.tsx","DELETE","/api/tasks/:id"],
  ["src/screens/tasks/TaskDetailScreen.tsx","PATCH","/api/reminders/:id"],
  ["src/screens/tasks/TaskDetailScreen.tsx","PATCH","/api/tasks/:id"],
  ["src/screens/tasks/TaskDetailScreen.tsx","POST","/api/reminders"],
  ["src/hooks/useContactLabels.ts","GET","/api/contacts/labels"],
  ["src/screens/tasks/task-list-source.web.ts","GET","/api/tasks/page"],
  // UX-7: the one To-do list reads the open follow-ups' first page (page copy "relationship-tasks"/"open") via useOpenFollowUps.
  ["src/screens/tasks/TasksScreen.tsx","GET","/api/relationship-tasks/page"],
  ["src/screens/tasks/TasksScreen.tsx","PATCH","/api/tasks/:id"],
  ["src/screens/task/TaskQuickAdd.tsx","POST","/api/tasks"],
  ["src/hooks/useTodayTaskPages.ts","GET","/api/today"],
  ["src/screens/todo/useTodoPage.ts","GET","/api/todo/page"],
  ["src/screens/todo/TodoScreen.tsx","GET","/api/tasks/:id"],
  ["src/screens/todo/TodoScreen.tsx","GET","/api/relationship-tasks/:id/resolve"],
  ["src/screens/todo/TodoScreen.tsx","GET","/api/todo/page"],
  ["src/screens/todo/TodoScreen.tsx","PATCH","/api/tasks/:id"],
  ["src/screens/todo/TodoScreen.tsx","POST","/api/encounters"],
  ["src/screens/todo/TodoScreen.tsx","POST","/api/agent/actions/:id/accept"],
  ["src/screens/todo/TodoScreen.tsx","POST","/api/agent/actions/:id/dismiss"],
  ["src/screens/todo/TodoScreen.tsx","POST","/api/agent/ledger/:id/transition"],
  ["src/screens/todo/TodoScreen.tsx","POST","/api/agent/plans/v2/pending/:id/accept"],
  ["src/screens/todo/TodoScreen.tsx","POST","/api/agent/plans/v2/pending/:id/dismiss"],
  ["src/screens/todo/TodoScreen.tsx","POST","/api/task-suggestions/:id/accept"],
  ["src/screens/todo/TodoScreen.tsx","POST","/api/task-suggestions/:id/dismiss"],
  ["src/screens/todo/TodoScreen.tsx","POST","/api/task-suggestions/:id/snooze"],
  ["src/hooks/useTodayTaskPages.ts","GET","/api/tasks/page"],
  ["src/view-models/business-card-ingest.ts","PUT","/api/contact-drafts/business-card/batches/v2/:id/items/:id/content"],
] as const;

const deviceDraftRead: ReadSurface = {
  ...surfaceFrom(['src/storage/note-draft-storage.ts', 'GET', '/device/note-drafts/:id']),
  readPersistence: 'device_only', mutationPolicy: 'local_only', binaryPolicy: 'never_local',
};
const deviceDraftWrite: ReadSurface = {
  ...surfaceFrom(['src/storage/note-draft-storage.ts', 'PUT', '/device/note-drafts/:id']),
  readPersistence: 'device_only', mutationPolicy: 'local_only', binaryPolicy: 'never_local',
};

export const surfaces: readonly ReadSurface[] = [
  ...surfaceKeys.map(surfaceFrom),
  surfaceFrom(['src/api/endpoints.ts', 'GET', '/api/relationship-signals/email-calendar']),
  deviceDraftRead,
  deviceDraftWrite,
];

export function matchTemplate(template: string, path: string): boolean {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('#') || path.includes('\\')) return false;
  const pathname = path.split('?')[0]!;
  const parts = pathname.split('/');
  const expected = template.split('/');
  if (parts.length !== expected.length) return false;
  return expected.every((part, index) => {
    const value = parts[index]!;
    if (index === 0) return value === '';
    try {
      const decoded = decodeURIComponent(value);
      if (!decoded || decoded === '.' || decoded === '..' || /[\\/\x00-\x1f]/u.test(decoded)) return false;
    } catch { return false; }
    return part.startsWith(':') ? value.length > 0 : part === value;
  });
}

export function resolveReadSurface(method: string, path: string): ReadSurface {
  const candidates = surfaces.filter(row => row.method === method && matchTemplate(row.endpointTemplate, path));
  // Literal routes such as /contacts/page outrank /contacts/:id, just as on
  // the server. Equally specific conflicting policies still fail closed.
  const specificity = (template: string) => template.split('/').filter(part => part && !part.startsWith(':')).length;
  const score = Math.max(-1, ...candidates.map(row => specificity(row.endpointTemplate)));
  const matches = candidates.filter(row => specificity(row.endpointTemplate) === score);
  // Several consumers may share a route; they must all declare the same policy.
  const policies = new Map(matches.map(({ consumerFile: _, ...policy }) => [JSON.stringify(policy), policy]));
  if (policies.size !== 1) throw new Error('UNREGISTERED_READ');
  return matches[0]!;
}
