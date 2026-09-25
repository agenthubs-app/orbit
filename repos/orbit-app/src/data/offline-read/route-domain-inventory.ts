import type { ReadSurface } from '../../api/contract/universal-read';

type SurfaceKey = readonly [consumerFile: string, method: string, endpointTemplate: string];

function domainFor(path: string): string {
  if (path.startsWith('/device/note-drafts')) return 'notes';
  if (path.startsWith('/api/auth/') || path === '/api/account/session/sign-out') return 'account';
  if (path === '/api/account/me') return 'account';
  if (path.startsWith('/api/account/language-preference') || path.startsWith('/api/notification-preferences')) return 'preferences';
  if (path.startsWith('/api/profile/update-suggestions')) return 'profile';
  if (path.startsWith('/api/profile')) return 'profile';
  if (path.startsWith('/api/notes')) return 'notes';
  if (path.startsWith('/api/task-suggestions')) return 'task-suggestions';
  if (path.startsWith('/api/tasks')) return 'tasks';
  if (path === '/api/relationship-tasks' || path === '/api/relationship-tasks/page') return 'tasks';
  if (path.startsWith('/api/reminders')) return 'followups';
  if (path.includes('/meeting-details')) return 'meetings';
  if (path.startsWith('/api/appointments')) return 'appointments';
  if (path === '/api/schedule-items/association-options/notes') return 'notes';
  if (path === '/api/schedule-items/association-options/contacts') return 'contacts';
  if (path.startsWith('/api/schedule-items')) return 'personal-schedule';
  if (path.startsWith('/api/contact-drafts')) return 'acquisition';
  if (path.startsWith('/api/contacts/needs-matches')) return 'contact-needs';
  if (path.startsWith('/api/contacts')) return 'contacts';
  if (path.startsWith('/api/connections')) return path.includes('/evidence') ? 'relationship-evidence' : 'connections';
  if (path.startsWith('/api/analysis/relationship-value')) return 'relationship-evidence';
  if (path.startsWith('/api/search/')) return 'contacts';
  if (path.startsWith('/api/relationship-signals')) return 'relationship-signals';
  if (path.startsWith('/api/relationship-communication/invitations') || path.startsWith('/api/contact-invitations')) return 'connections';
  if (path.startsWith('/api/relationship-communication/conversations') && path.endsWith('/read')) return 'message-read-state';
  if (path.startsWith('/api/relationship-communication/conversations') && path.endsWith('/messages')) return 'messages';
  if (path.startsWith('/api/relationship-communication') || path.startsWith('/api/chat/conversations')) return 'conversations';
  if (path.startsWith('/api/chat/privacy')) return 'chat-privacy';
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
  if (path.startsWith('/api/recommendations/')) return 'event-recommendations';
  if (path.includes('/registration') || path.includes('/admission/application')) return 'registrations';
  if (path.includes('/access/') || path.includes('/admission/reviews')) return 'event-roles';
  if (path.endsWith('/operations') || path.includes('/operations/')) return 'event-operations';
  if (path.includes('/analytics/')) return 'event-analytics';
  if (path.includes('/experience')) return 'event-experience';
  if (path.includes('/goal') || path.includes('/readiness') || path.includes('/encounters') || path.includes('/post-event')) return 'event-goals';
  if (path.includes('/attendees') || path.includes('/matches') || path.includes('/want-to-connect')) return 'event-memberships';
  if (path.startsWith('/api/events')) return 'events';
  if (path.startsWith('/api/dashboard/distributions')) return 'distributions';
  if (path.startsWith('/api/dashboard/opportunities')) return 'opportunities';
  if (path.startsWith('/api/dashboard/network-gaps') || path.startsWith('/api/audit/provenance')) return 'sources';
  if (path.startsWith('/api/dashboard')) return 'dashboard';
  if (path.startsWith('/api/mobile/contacts-dashboard')) return 'home';
  if (path.startsWith('/api/today')) return 'today';
  if (path.startsWith('/api/permissions')) return 'preferences';
  if (path.startsWith('/api/health')) return 'account';
  // /api/sync 是喂养所有域镜像的传输通道，本身不是业务域；登记为独立 id 以便审计完整，
  // 其 durable_normalized 语义准确——响应就是要落成 canonical 镜像行的数据。
  if (path === '/api/sync' || path.startsWith('/api/sync/')) return 'sync';
  throw new Error(`UNREGISTERED_DOMAIN:${path}`);
}

function surfaceFrom([consumerFile, method, endpointTemplate]: SurfaceKey): ReadSurface {
  const domainId = domainFor(endpointTemplate);
  const providerTodo = endpointTemplate.startsWith('/api/relationship-signals/email-calendar');
  const secret = providerTodo || endpointTemplate.startsWith('/api/account/session/')
    || endpointTemplate.startsWith('/api/auth/') || endpointTemplate.startsWith('/api/devices/')
    // Private portraits remain network-only until trusted grant/epoch invalidation is available.
    || endpointTemplate === '/api/events/:id/registration/portrait'
    // Bounded private readers have no proven revoke/version cache protocol yet.
    || (method === 'GET' && ([
      '/api/contacts/page','/api/contacts/summary','/api/contacts/labels','/api/inbox/summary',
      '/api/relationship-tasks/page','/api/tasks/page','/api/task-suggestions/page',
      '/api/notifications/unread-summary','/api/relationship-communication/unread-summary',
      '/api/relationship-communication/conversation-summaries','/api/relationship-communication/conversations/:id/messages',
    ].includes(endpointTemplate) || [
      'src/api/inbox-badge-resource.ts','src/api/inbox-summary.ts',
      'src/api/legacy-notification-unread-summary.ts','src/api/relationship-unread-summary.ts',
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
    mutationPolicy: 'online_only',
    binaryPolicy: secret ? 'never_local' : binary ? 'on_demand_encrypted' : 'metadata_only',
  };
}

const surfaceKeys: readonly SurfaceKey[] = [
  ["src/api/ai-session-management.ts","POST","/api/ai/conversations/groups"],
  ["src/api/ai-session-management.ts","DELETE","/api/ai/conversations/groups/:id"],
  ["src/api/ai-session-management.ts","PATCH","/api/ai/conversations/groups/:id"],
  ["src/api/ai-session-management.ts","PATCH","/api/ai/conversations/sessions/:id"],
  ["src/api/auth-session.ts","POST","/api/account/session/sign-out"],
  ["src/data/sync/sync-client.ts","GET","/api/sync"],
  ["src/data/sync/sync-client.ts","GET","/api/sync/lease"],
  ["src/data/sync/sync-client.ts","GET","/api/sync/manifest"],
  ["src/data/sync/sync-client.ts","GET","/api/sync/domains/:domainId"],
  ["src/api/browser-auth.ts","GET","/api/auth/csrf"],
  ["src/api/browser-auth.ts","POST","/api/auth/callback/credentials"],
  ["src/api/auth-session.ts","POST","/api/auth/register"],
  ["src/api/auth-session.ts","POST","/api/auth/mobile/credentials"],
  ["src/api/auth-session.ts","POST","/api/auth/mobile/google/exchange"],
  ["src/api/AuthSessionProvider.tsx","GET","/api/account/me"],
  ["src/api/AuthSessionProvider.tsx","POST","/api/auth/mobile/credentials"],
  ["src/api/AuthSessionProvider.tsx","POST","/api/auth/mobile/google/exchange"],
  ["src/api/business-card-import.ts","GET","/api/contact-drafts/business-card/imports/:id"],
  ["src/api/business-card-import.ts","POST","/api/contact-drafts/business-card/imports/:id/cancel"],
  ["src/api/mobile-auth.ts","POST","/api/auth/mobile/credentials"],
  ["src/api/mobile-auth.ts","POST","/api/auth/mobile/google/exchange"],
  ["src/api/mobile-auth.ts","GET","/api/auth/mobile/providers"],
  ["src/api/mobile-auth.ts","GET","/api/auth/session"],
  ["src/hooks/useContactNeeds.ts","GET","/api/profile"],
  ["src/hooks/useContactNeeds.ts","PUT","/api/profile"],
  ["src/api/inbox-badge-resource.ts","GET","/api/inbox/notifications"],
  ["src/api/inbox-summary.ts","GET","/api/inbox/notifications"],
  ["src/api/inbox-summary.ts","GET","/api/inbox/summary"],
  ["src/api/legacy-notification-unread-summary.ts","GET","/api/notifications"],
  ["src/api/legacy-notification-unread-summary.ts","GET","/api/notifications/unread-summary"],
  ["src/api/relationship-unread-summary.ts","GET","/api/relationship-communication/conversations"],
  ["src/api/relationship-unread-summary.ts","GET","/api/relationship-communication/unread-summary"],
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
  ["src/screens/admin/AdminScreen.tsx","GET","/api/dashboard"],
  ["src/screens/admin/AdminScreen.tsx","GET","/api/events"],
  ["src/screens/admin/AdminScreen.tsx","GET","/api/profile"],
  ["src/screens/agent/AgentLedgerScreen.tsx","GET","/api/agent/ledger"],
  ["src/screens/agent/AgentLedgerScreen.tsx","POST","/api/agent/ledger/:id/transition"],
  ["src/screens/ai/AgentActionsScreen.tsx","GET","/api/agent/actions"],
  ["src/screens/ai/AgentActionsScreen.tsx","POST","/api/agent/actions/:id/accept"],
  ["src/screens/ai/AgentActionsScreen.tsx","POST","/api/agent/actions/:id/dismiss"],
  ["src/screens/ai/AiConversationScreen.tsx","GET","/api/ai/conversations"],
  ["src/screens/ai/AiConversationScreen.tsx","POST","/api/ai/conversations"],
  ["src/screens/ai/AiConversationScreen.tsx","GET","/api/ai/conversations/:id"],
  ["src/screens/ai/AiConversationScreen.tsx","POST","/api/ai/conversations/:id"],
  ["src/screens/ai/AiConversationScreen.tsx","POST","/api/ai/conversations/sessions"],
  ["src/screens/ai/AiConversationScreen.tsx","GET","/api/ai/conversations/sessions/:id"],
  ["src/screens/ai/AiConversationScreen.tsx","POST","/api/ai/entity-drafts/:id"],
  ["src/screens/ai/AiConversationScreen.tsx","GET","/api/contacts"],
  ["src/screens/ai/AiConversationScreen.tsx","GET","/api/events"],
  ["src/screens/ai/AiConversationScreen.tsx","GET","/api/profile"],
  ["src/screens/ai/AiConversationScreen.tsx","POST","/api/task-suggestions/:id/accept"],
  ["src/screens/ai/AiConversationScreen.tsx","POST","/api/task-suggestions/:id/dismiss"],
  ["src/screens/ai/AiConversationScreen.tsx","GET","/api/tasks"],
  ["src/screens/ai/AiScreen.tsx","GET","/api/ai/conversations"],
  ["src/screens/ai/AiScreen.tsx","GET","/api/ai/conversations/groups"],
  ["src/screens/ai/AiScreen.tsx","GET","/api/ai/conversations/sessions"],
  ["src/screens/ai/AiScreen.tsx","DELETE","/api/ai/conversations/sessions/:id"],
  ["src/screens/ai/AiScreen.tsx","GET","/api/today"],
  ["src/screens/chat/RelationshipChatDetailScreen.tsx","GET","/api/chat/conversations/:id/extractions"],
  ["src/screens/chat/RelationshipChatDetailScreen.tsx","GET","/api/relationship-communication/conversations/:id/messages"],
  ["src/screens/chat/RelationshipChatDetailScreen.tsx","POST","/api/relationship-communication/conversations/:id/messages"],
  ["src/screens/chat/RelationshipChatScreen.tsx","GET","/api/relationship-communication/conversation-summaries"],
  ["src/screens/inbox/NotificationDetailScreen.tsx","GET","/api/inbox/notifications/:id"],
  ["src/screens/inbox/NotificationDetailScreen.tsx","POST","/api/inbox/notifications/:id/actions"],
  ["src/screens/inbox/RelationshipInboxScreen.tsx","GET","/api/chat/privacy"],
  ["src/screens/inbox/RelationshipInboxScreen.tsx","GET","/api/notifications"],
  ["src/screens/inbox/RelationshipInboxScreen.tsx","GET","/api/notifications/deliveries/:id"],
  ["src/screens/inbox/RelationshipInboxScreen.tsx","GET","/api/relationship-communication/conversation-summaries"],
  ["src/screens/inbox/RelationshipInboxScreen.tsx","GET","/api/relationship-communication/conversations/:id/messages"],
  ["src/screens/inbox/RelationshipInboxScreen.tsx","GET","/api/relationship-communication/unread-summary"],
  ["src/screens/inbox/RelationshipInboxScreen.tsx","GET","/api/relationship-signals/email-calendar"],
  ["src/screens/inbox/RelationshipInboxScreen.tsx","PATCH","/api/agent/signals/:id"],
  ["src/screens/inbox/RelationshipInboxScreen.tsx","POST","/api/chat/privacy/analysis-toggle"],
  ["src/screens/inbox/RelationshipInboxScreen.tsx","POST","/api/chat/relationship-inbox"],
  ["src/screens/inbox/RelationshipInboxScreen.tsx","POST","/api/notifications/:id/state"],
  ["src/screens/inbox/RelationshipInboxScreen.tsx","POST","/api/relationship-communication/conversations/:id/messages"],
  ["src/screens/inbox/RelationshipInboxScreen.tsx","POST","/api/relationship-communication/conversations/:id/read"],
  ["src/screens/inbox/RelationshipInboxScreen.tsx","POST","/api/relationship-signals/:id/confirm"],
  ["src/screens/inbox/useNotificationInbox.ts","GET","/api/inbox/notifications"],
  ["src/screens/inbox/useNotificationInbox.ts","POST","/api/inbox/notifications/read"],
  ["src/screens/contacts/BusinessCardBatchScreen.tsx","GET","/api/contact-drafts/business-card/batches/:id:id"],
  ["src/screens/contacts/BusinessCardBatchScreen.tsx","POST","/api/contact-drafts/business-card/batches/:id:id"],
  ["src/screens/contacts/BusinessCardBatchScreen.tsx","GET","/api/contact-drafts/business-card/batches/:id/items/:id:id"],
  ["src/screens/contacts/BusinessCardBatchScreen.tsx","POST","/api/contact-drafts/business-card/batches/:id/items/:id:id"],
  ["src/screens/contacts/BusinessCardIngestScreen.tsx","GET","/api/contact-drafts/business-card/batches/v2/:id"],
  ["src/screens/contacts/BusinessCardIngestScreen.tsx","POST","/api/contact-drafts/business-card/batches/v2/:id/cancel"],
  ["src/screens/contacts/BusinessCardIngestScreen.tsx","POST","/api/contact-drafts/business-card/batches/v2/:id/exclude"],
  ["src/screens/contacts/BusinessCardIngestScreen.tsx","POST","/api/contact-drafts/business-card/batches/v2/:id/finalize"],
  ["src/screens/contacts/BusinessCardIngestScreen.tsx","POST","/api/contact-drafts/business-card/batches/v2/:id/items/:id/confirm"],
  ["src/screens/contacts/BusinessCardIngestScreen.tsx","POST","/api/contact-drafts/business-card/batches/v2/:id/items/:id/exclude"],
  ["src/screens/contacts/BusinessCardIngestScreen.tsx","GET","/api/contact-drafts/business-card/batches/v2/:id/items/:id/image"],
  ["src/screens/contacts/BusinessCardIngestScreen.tsx","POST","/api/contact-drafts/business-card/batches/v2/:id/items/:id/manual-entry"],
  ["src/screens/contacts/BusinessCardIngestScreen.tsx","POST","/api/contact-drafts/business-card/batches/v2/:id/items/:id/replace"],
  ["src/screens/contacts/BusinessCardIngestScreen.tsx","POST","/api/contact-drafts/business-card/batches/v2/:id/items/:id/retry"],
  ["src/screens/contacts/BusinessCardIngestScreen.tsx","POST","/api/contact-drafts/business-card/batches/v2/:id/items/:id/skip"],
  ["src/screens/contacts/BusinessCardIngestStartScreen.tsx","GET","/api/contact-drafts/business-card/batches"],
  ["src/screens/contacts/BusinessCardIngestStartScreen.tsx","GET","/api/contact-drafts/business-card/batches/v2"],
  ["src/screens/contacts/BusinessCardIngestStartScreen.tsx","POST","/api/contact-drafts/business-card/batches/v2"],
  ["src/screens/contacts/ContactAcquisitionScreen.tsx","GET","/api/contact-drafts"],
  ["src/screens/contacts/ContactAcquisitionScreen.tsx","PATCH","/api/contact-drafts/:id"],
  ["src/screens/contacts/ContactAcquisitionScreen.tsx","POST","/api/contact-drafts/:id/confirm"],
  ["src/screens/contacts/ContactAcquisitionScreen.tsx","POST","/api/contact-drafts/business-card/scan"],
  ["src/screens/contacts/ContactAcquisitionScreen.tsx","POST","/api/contact-drafts/event-attendees/import"],
  ["src/screens/contacts/ContactAcquisitionScreen.tsx","GET","/api/contact-drafts/external/candidates"],
  ["src/screens/contacts/ContactAcquisitionScreen.tsx","POST","/api/contact-drafts/external/import"],
  ["src/screens/contacts/ContactAcquisitionScreen.tsx","POST","/api/contact-drafts/manual"],
  ["src/screens/contacts/ContactAcquisitionScreen.tsx","GET","/api/contact-drafts/merge-suggestions"],
  ["src/screens/contacts/ContactAcquisitionScreen.tsx","POST","/api/contact-drafts/merge-suggestions/:id/apply"],
  ["src/screens/contacts/ContactAcquisitionScreen.tsx","POST","/api/contact-drafts/qr/scan"],
  ["src/screens/contacts/ContactAcquisitionScreen.tsx","POST","/api/contact-drafts/recommended/:id/confirm"],
  ["src/screens/contacts/ContactAcquisitionScreen.tsx","POST","/api/contact-drafts/referral"],
  ["src/screens/contacts/ContactAcquisitionScreen.tsx","POST","/api/contacts/business-card/confirm"],
  ["src/screens/contacts/ContactDetailScreen.tsx","GET","/api/analysis/relationship-value/:id"],
  ["src/screens/contacts/ContactDetailScreen.tsx","POST","/api/analysis/relationship-value/recompute"],
  ["src/screens/contacts/ContactDetailScreen.tsx","GET","/api/connections"],
  ["src/screens/contacts/ContactDetailScreen.tsx","GET","/api/contacts/:id"],
  ["src/screens/contacts/ContactDetailScreen.tsx","PATCH","/api/contacts/:id"],
  ["src/screens/contacts/ContactDetailScreen.tsx","GET","/api/relationship-communication/eligibility"],
  ["src/screens/contacts/ContactIntrosScreen.tsx","GET","/api/connections"],
  ["src/screens/contacts/ContactIntrosScreen.tsx","GET","/api/contacts"],
  ["src/screens/contacts/ContactIntrosScreen.tsx","POST","/api/relationship-communication/invitations"],
  ["src/screens/contacts/ContactNeedsMatchesScreen.tsx","GET","/api/contacts/needs-matches"],
  ["src/screens/contacts/ContactNotesSection.tsx","GET","/api/notes"],
  ["src/screens/contacts/ContactPipelineScreen.tsx","GET","/api/connections"],
  ["src/screens/contacts/ContactPipelineScreen.tsx","GET","/api/contacts"],
  ["src/screens/contacts/ContactPipelineScreen.tsx","GET","/api/tasks"],
  ["src/screens/contacts/ContactsDashboardScreen.tsx","POST","/api/dashboard/opportunities/recompute"],
  ["src/screens/contacts/ContactsDashboardScreen.tsx","GET","/api/mobile/contacts-dashboard"],
  ["src/screens/contacts/ContactsGraphScreen.tsx","GET","/api/connections"],
  ["src/screens/contacts/ContactsGraphScreen.tsx","GET","/api/connections/:id"],
  ["src/screens/contacts/ContactsGraphScreen.tsx","POST","/api/connections/:id/evidence"],
  ["src/screens/contacts/ContactsGraphScreen.tsx","PATCH","/api/connections/:id/profile"],
  ["src/screens/contacts/ContactsScreen.tsx","POST","/api/contacts/search"],
  ["src/screens/contacts/ContactsScreen.tsx","POST","/api/search/relationships"],
  ["src/screens/contacts/ContactsScreen.tsx","GET","/api/search/suggestions"],
  ["src/screens/contacts/ContactStructureDetailScreen.tsx","GET","/api/dashboard/structure/:id/:id"],
  ["src/screens/contacts/RelationshipInvitationScreen.tsx","GET","/api/relationship-communication/invitations/:id"],
  ["src/screens/contacts/RelationshipInvitationScreen.tsx","POST","/api/relationship-communication/invitations/:id/accept"],
  ["src/screens/dashboard/DashboardScreen.tsx","GET","/api/audit/provenance"],
  ["src/screens/dashboard/DashboardScreen.tsx","POST","/api/audit/provenance/run"],
  ["src/screens/dashboard/DashboardScreen.tsx","GET","/api/dashboard"],
  ["src/screens/dashboard/DashboardScreen.tsx","GET","/api/dashboard/distributions"],
  ["src/screens/dashboard/DashboardScreen.tsx","GET","/api/dashboard/network-gaps"],
  ["src/screens/dashboard/DashboardScreen.tsx","GET","/api/dashboard/opportunities"],
  ["src/screens/dashboard/DashboardScreen.tsx","POST","/api/dashboard/opportunities/recompute"],
  ["src/screens/dashboard/DashboardScreen.tsx","GET","/api/dashboard/summary"],
  ["src/screens/events/EventAdmissionReviewScreen.tsx","GET","/api/events/:id/admission/reviews"],
  ["src/screens/events/EventAdmissionReviewScreen.tsx","GET","/api/events/:id/admission/reviews/:id"],
  ["src/screens/events/EventAdmissionReviewScreen.tsx","POST","/api/events/:id/admission/reviews/:id/decision"],
  ["src/screens/events/EventAnalyticsScreen.tsx","GET","/api/events/:id/analytics/aggregate"],
  ["src/screens/events/EventAnalyticsScreen.tsx","GET","/api/events/:id/analytics/attendee"],
  ["src/screens/events/EventAttendeeRosterLink.tsx","GET","/api/events/:id"],
  ["src/view-models/event-attendee-controller.ts","GET","/api/events/:id/operations"],
  ["src/view-models/event-attendee-controller.ts","GET","/api/events/:id/operations/participants/:id"],
  ["src/view-models/event-attendee-controller.ts","POST","/api/events/:id/operations/check-in"],
  ["src/view-models/event-attendee-controller.ts","POST","/api/events/:id/operations/contact-requests"],
  ["src/view-models/event-attendee-controller.ts","POST","/api/events/:id/operations/contact-requests/:id/:id"],
  ["src/screens/tasks/RelationshipLifecycleList.tsx","GET","/api/relationship-tasks/page"],
  ["src/screens/tasks/RelationshipLifecycleScreen.tsx","GET","/api/connections/:id/lifecycle"],
  ["src/screens/tasks/RelationshipLifecycleScreen.tsx","POST","/api/connections/:id/lifecycle"],
  ["src/view-models/relationship-initialization.ts","GET","/api/connections"],
  ["src/view-models/relationship-initialization.ts","GET","/api/connections/:id/lifecycle"],
  ["src/view-models/relationship-initialization.ts","GET","/api/contacts/:id/relationship-initialization"],
  ["src/view-models/relationship-initialization.ts","POST","/api/contacts/:id/relationship-initialization"],
  ["src/screens/events/EventCenterScreen.tsx","GET","/api/events/center"],
  ["src/screens/events/EventCheckInScreen.tsx","GET","/api/events/:id/operations/admin/check-ins"],
  ["src/screens/events/EventCheckInScreen.tsx","POST","/api/events/:id/operations/admin/check-ins"],
  ["src/screens/events/EventDetailScreen.tsx","PUT","/api/events/:id/goal"],
  ["src/screens/events/CanonicalEventDetailModules.tsx","GET","/api/events/:id/registration"],
  ["src/screens/events/CanonicalEventDetailModules.tsx","GET","/api/events/:id/operations"],
  ["src/screens/events/CanonicalEventDetailModules.tsx","GET","/api/events/:id/post-event/artifact"],
  ["src/screens/events/CanonicalEventDetailModules.tsx","POST","/api/events/:id/registration/cancel"],
  ["src/screens/events/EventDetailScreen.tsx","GET","/api/events/:id/post-event"],
  ["src/screens/events/EventDetailScreen.tsx","POST","/api/events/:id/post-event/confirm"],
  ["src/screens/events/EventDetailScreen.tsx","GET","/api/events/:id/readiness"],
  ["src/screens/events/EventDetailScreen.tsx","GET","/api/events/:id/registration"],
  ["src/screens/events/EventDetailScreen.tsx","GET","/api/events/public/:id"],
  ["src/screens/events/EventDetailScreen.tsx","GET","/api/recommendations/event/:id"],
  ["src/screens/events/EventDetailScreen.tsx","POST","/api/recommendations/event/:id/opening-line"],
  ["src/screens/events/EventExperienceScreen.tsx","GET","/api/events/:id/experience"],
  ["src/screens/events/EventExperienceScreen.tsx","PUT","/api/events/:id/experience"],
  ["src/screens/events/EventExperienceScreen.tsx","POST","/api/events/:id/experience/:id"],
  ["src/screens/events/EventOperationsScreen.tsx","GET","/api/events/:id/operations/admin"],
  ["src/screens/events/EventOperationsScreen.tsx","POST","/api/events/:id/operations/admin/generations"],
  ["src/screens/events/EventOperationsScreen.tsx","POST","/api/events/:id/operations/admin/generations/:id/:id"],
  ["src/screens/events/EventRegistrationScreen.tsx","DELETE","/api/events/:id/admission/application"],
  ["src/screens/events/EventRegistrationScreen.tsx","POST","/api/events/:id/admission/application"],
  ["src/screens/events/EventRegistrationScreen.tsx","GET","/api/events/:id/registration"],
  ["src/screens/events/EventRegistrationScreen.tsx","POST","/api/events/:id/registration"],
  ["src/screens/events/EventRegistrationScreen.tsx","POST","/api/events/:id/registration/cancel"],
  ["src/screens/events/EventRegistrationScreen.tsx","POST","/api/events/:id/registration/interview"],
  ["src/screens/events/EventRegistrationScreen.tsx","POST","/api/events/:id/registration/persona"],
  ["src/screens/events/EventRegistrationScreen.tsx","GET","/api/events/:id/registration/portrait"],
  ["src/screens/events/EventRegistrationScreen.tsx","POST","/api/events/:id/registration/portrait"],
  ["src/screens/events/Registration7aRecommendationsResource.tsx","GET","/api/recommendations/event/:id"],
  ["src/screens/events/EventRegistrationScreen.tsx","GET","/api/events/public/:id"],
  ["src/screens/events/EventRolesScreen.tsx","DELETE","/api/events/:id/access/assignments/:id"],
  ["src/screens/events/EventRolesScreen.tsx","GET","/api/events/:id/access/assignments/:id"],
  ["src/screens/events/EventRolesScreen.tsx","PUT","/api/events/:id/access/assignments/:id"],
  ["src/screens/events/EventRolesScreen.tsx","GET","/api/events/:id/access/roles"],
  ["src/screens/events/EventsScreen.tsx","GET","/api/events/public"],
  ["src/screens/events/EventsScreen.tsx","GET","/api/recommendations/events"],
  ["src/screens/events/EventsScreen.tsx","POST","/api/recommendations/events/:id/accept"],
  ["src/screens/home/HomeDashboardScreen.tsx","GET","/api/recommendations/events"],
  ["src/screens/home/HomeDashboardScreen.tsx","GET","/api/schedule-items"],
  ["src/screens/home/HomeDashboardScreen.tsx","GET","/api/tasks/page"],
  ["src/screens/home/HomeDashboardScreen.tsx","PATCH","/api/tasks/:id"],
  ["src/screens/home/HomeScreen.tsx","GET","/api/contacts"],
  ["src/screens/home/HomeScreen.tsx","GET","/api/events/public"],
  ["src/screens/home/HomeScreen.tsx","GET","/api/profile"],
  ["src/screens/notes/EditNoteScreen.tsx","POST","/api/contacts/search"],
  ["src/screens/notes/EditNoteScreen.tsx","GET","/api/events"],
  ["src/screens/notes/EditNoteScreen.tsx","GET","/api/notes/:id"],
  ["src/screens/notes/EditNoteScreen.tsx","PATCH","/api/notes/:id"],
  ["src/screens/notes/NewNoteScreen.tsx","POST","/api/contacts/search"],
  ["src/screens/notes/NewNoteScreen.tsx","GET","/api/events"],
  ["src/screens/notes/NewNoteScreen.tsx","POST","/api/notes"],
  ["src/screens/notes/NoteDetailScreen.tsx","GET","/api/events"],
  ["src/screens/notes/NoteDetailScreen.tsx","GET","/api/notes/:id"],
  ["src/screens/notes/NoteDetailScreen.tsx","GET","/api/tasks"],
  ["src/screens/notes/NotesScreen.tsx","GET","/api/notes"],
  ["src/screens/notes/useNoteContactSummaries.ts","GET","/api/contacts/:id"],
  ["src/screens/organizer/OrganizerPublicScreen.tsx","GET","/api/events/public"],
  ["src/screens/party/PartyModeScreen.tsx","GET","/api/events/:id"],
  ["src/screens/party/PartyModeScreen.tsx","GET","/api/events/:id/attendees"],
  ["src/screens/party/PartyModeScreen.tsx","GET","/api/events/:id/matches"],
  ["src/screens/platform/PlatformScreen.tsx","GET","/api/events/public"],
  ["src/screens/profile/AccountAuthScreen.tsx","POST","/api/auth/password-reset/request"],
  ["src/screens/profile/AccountPermissionsScreen.tsx","GET","/api/permissions"],
  ["src/screens/profile/AccountPermissionsScreen.tsx","POST","/api/permissions/calendar/request"],
  ["src/screens/profile/AccountScreen.tsx","GET","/api/account/me"],
  ["src/screens/profile/EditProfileScreen.tsx","PUT","/api/profile"],
  ["src/screens/profile/PasswordResetScreen.tsx","POST","/api/auth/password-reset/confirm"],
  ["src/screens/profile/ProfileMoreScreen.tsx","POST","/api/profile/extractions/business-card"],
  ["src/screens/profile/ProfileMoreScreen.tsx","POST","/api/profile/extractions/resume"],
  ["src/screens/profile/ProfileScreen.tsx","GET","/api/contacts"],
  ["src/screens/profile/ProfileScreen.tsx","GET","/api/profile"],
  ["src/screens/profile/ProfileScreen.tsx","PUT","/api/profile"],
  ["src/screens/profile/ProfileScreen.tsx","POST","/api/profile/extractions/business-card"],
  ["src/screens/profile/ProfileScreen.tsx","POST","/api/profile/extractions/resume"],
  ["src/screens/profile/ProfileScreen.tsx","GET","/api/profile/update-suggestions"],
  ["src/screens/profile/ProfileScreen.tsx","POST","/api/profile/update-suggestions/:id/accept"],
  ["src/screens/profile/ProfileScreen.tsx","GET","/api/schedule-items"],
  ["src/screens/profile/ProfileScreen.tsx","GET","/api/tasks"],
  ["src/screens/profile/ProfileSuggestionsScreen.tsx","GET","/api/profile/update-suggestions"],
  ["src/screens/profile/ProfileSuggestionsScreen.tsx","POST","/api/profile/update-suggestions/:id/accept"],
  ["src/screens/profile/ProfileSuggestionsScreen.tsx","POST","/api/profile/update-suggestions/:id/dismiss"],
  ["src/screens/profile/useProfileEditSessionScreen.ts","GET","/api/profile"],
  ["src/screens/register/RegisterInviteScreen.tsx","GET","/api/events/public/:id"],
  ["src/screens/register/RegisterInviteScreen.tsx","GET","/api/profile"],
  ["src/screens/schedule/MeetingDetailScreen.tsx","GET","/api/appointments/:id"],
  ["src/screens/schedule/MeetingDetailScreen.tsx","PATCH","/api/appointments/:id"],
  ["src/screens/schedule/MeetingDetailScreen.tsx","GET","/api/appointments/:id/details"],
  ["src/screens/schedule/MeetingDetailScreen.tsx","PATCH","/api/appointments/:id/details"],
  ["src/screens/schedule/MeetingDetailScreen.tsx","GET","/api/schedule-items/:id/meeting-details"],
  ["src/screens/schedule/MeetingDetailScreen.tsx","PATCH","/api/schedule-items/:id/meeting-details"],
  ["src/screens/schedule/PersonalScheduleList.tsx","GET","/api/schedule-items"],
  ["src/screens/schedule/PersonalScheduleDetailScreen.tsx","GET","/api/schedule-items"],
  ["src/screens/schedule/PersonalScheduleDetailScreen.tsx","GET","/api/schedule-items/:id"],
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
  ["src/screens/schedule/ScheduleScreen.tsx","GET","/api/events/public"],
  ["src/screens/schedule/ScheduleScreen.tsx","GET","/api/schedule-items"],
  ["src/screens/schedule/ScheduleScreen.tsx","GET","/api/tasks"],
  ["src/screens/settings/ApiSettingsScreen.tsx","GET","/api/health"],
  ["src/screens/settings/NotificationDeliverySettings.tsx","GET","/api/inbox/delivery/preferences"],
  ["src/screens/settings/NotificationDeliverySettings.tsx","POST","/api/inbox/delivery/preferences"],
  ["src/screens/settings/NotificationDiscoverySettings.tsx","GET","/api/inbox/discovery/preferences"],
  ["src/screens/settings/NotificationDiscoverySettings.tsx","POST","/api/inbox/discovery/preferences"],
  ["src/screens/tasks/RelationshipTaskTools.tsx","GET","/api/notifications"],
  ["src/screens/tasks/PendingTaskSuggestions.tsx","GET","/api/task-suggestions/page"],
  ["src/screens/tasks/TaskDetailScreen.tsx","GET","/api/reminders"],
  ["src/screens/tasks/TaskDetailScreen.tsx","GET","/api/tasks/:id"],
  ["src/screens/tasks/TaskDetailScreen.tsx","GET","/api/tasks/:id/activities"],
  ["src/screens/tasks/TaskDetailScreen.tsx","DELETE","/api/tasks/:id"],
  ["src/screens/tasks/TaskDetailScreen.tsx","PATCH","/api/reminders/:id"],
  ["src/screens/tasks/TaskDetailScreen.tsx","PATCH","/api/tasks/:id"],
  ["src/screens/tasks/TaskDetailScreen.tsx","POST","/api/reminders"],
  ["src/hooks/useContactLabels.ts","GET","/api/contacts/labels"],
  ["src/screens/tasks/task-list-source.web.ts","GET","/api/tasks/page"],
  ["src/screens/tasks/TasksScreen.tsx","PATCH","/api/tasks/:id"],
  ["src/screens/today/TodayScreen.tsx","POST","/api/task-suggestions/:id/accept"],
  ["src/screens/today/TodayScreen.tsx","POST","/api/tasks"],
  ["src/screens/today/TodayScreen.tsx","PATCH","/api/tasks/:id"],
  ["src/screens/today/TodayScreen.tsx","GET","/api/today"],
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
