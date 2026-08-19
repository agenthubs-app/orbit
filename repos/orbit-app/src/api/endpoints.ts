export const ORBIT_API_ENDPOINTS = {
  accountMe: "/api/account/me",
  accountSessionSignOut: "/api/account/session/sign-out",
  bootstrap: "/api/app/bootstrap",
  authCredentialsCallback: "/api/auth/callback/credentials",
  authCsrf: "/api/auth/csrf",
  authMobileCredentials: "/api/auth/mobile/credentials",
  authMobileGoogleExchange: "/api/auth/mobile/google/exchange",
  authMobileGoogleStart: "/api/auth/mobile/google/start",
  authMobileProviders: "/api/auth/mobile/providers",
  authRegister: "/api/auth/register",
  authSession: "/api/auth/session",
  authSignOut: "/api/auth/signout",
  chatAssistFollowupDraft: "/api/chat/assist/followup-draft",
  chatAssistRewrite: "/api/chat/assist/rewrite",
  chatConversations: "/api/chat/conversations",
  chatPrivacyAnalysisToggle: "/api/chat/privacy/analysis-toggle",
  chatPrivacyControls: "/api/chat/privacy",
  externalActionSandboxAudit: "/api/sandbox/external-actions/audit",
  externalActionSandboxSendMessage: "/api/sandbox/external-actions/send-message",
  contactDrafts: "/api/contact-drafts",
  contactDraftBusinessCardScan: "/api/contact-drafts/business-card/scan",
  contactDraftEventAttendeesImport: "/api/contact-drafts/event-attendees/import",
  contactDraftExternalCandidates: "/api/contact-drafts/external/candidates",
  contactDraftExternalImport: "/api/contact-drafts/external/import",
  contactDraftManual: "/api/contact-drafts/manual",
  contactDraftMergeSuggestions: "/api/contact-drafts/merge-suggestions",
  contactDraftQrScan: "/api/contact-drafts/qr/scan",
  contactDraftReferral: "/api/contact-drafts/referral",
  contactDraftRecommended: "/api/contact-drafts/recommended",
  contactBusinessCardConfirm: "/api/contacts/business-card/confirm",
  contactInvitations: "/api/contact-invitations",
  agentActions: "/api/agent/actions",
  agentLedger: "/api/agent/ledger",
  agentPreferences: "/api/agent/preferences",
  agentSettings: "/api/agent/settings",
  connections: "/api/connections",
  contacts: "/api/contacts",
  contactsSearch: "/api/contacts/search",
  conversations: "/api/ai/conversations",
  aiConversationSessions: "/api/ai/conversations/sessions",
  aiRuns: "/api/ai/runs",
  dashboard: "/api/dashboard",
  dashboardDistributions: "/api/dashboard/distributions",
  dashboardNetworkGaps: "/api/dashboard/network-gaps",
  dashboardOpportunities: "/api/dashboard/opportunities",
  dashboardOpportunitiesRecompute: "/api/dashboard/opportunities/recompute",
  dashboardProvenanceAudit: "/api/audit/provenance",
  dashboardProvenanceAuditRun: "/api/audit/provenance/run",
  dashboardSummary: "/api/dashboard/summary",
  eventRecommendations: "/api/recommendations/event",
  eventValueRecommendations: "/api/recommendations/events",
  messageDrafts: "/api/message-drafts",
  notifications: "/api/notifications",
  pushTokens: "/api/devices/push-tokens",
  permissions: "/api/permissions",
  calendarPermissionRequest: "/api/permissions/calendar/request",
  reminderGeneration: "/api/notifications/reminders/generate",
  proactiveTurns: "/api/ai/proactive-turns",
  relationshipInbox: "/api/chat/relationship-inbox",
  relationshipSignalsEmailCalendar: "/api/relationship-signals/email-calendar",
  relationshipSearch: "/api/search/relationships",
  relationshipSearchSuggestions: "/api/search/suggestions",
  events: "/api/events",
  publicEvents: "/api/events/public",
  health: "/api/health",
  profile: "/api/profile",
  profileBusinessCardExtraction: "/api/profile/extractions/business-card",
  profileResumeExtraction: "/api/profile/extractions/resume",
  profileUpdateSuggestions: "/api/profile/update-suggestions",
  relationshipValueAnalysis: "/api/analysis/relationship-value",
  relationshipValueRecompute: "/api/analysis/relationship-value/recompute",
  tasks: "/api/tasks",
  taskGeneration: "/api/tasks/generate"
} as const;

function detailPath(collectionPath: string, id: string): string {
  return `${collectionPath}/${encodeURIComponent(id)}`;
}

export function eventDetailPath(id: string): string {
  return detailPath(ORBIT_API_ENDPOINTS.events, id);
}

export function publicEventDetailPath(id: string): string {
  return detailPath(ORBIT_API_ENDPOINTS.publicEvents, id);
}

export function agentActionAcceptPath(id: string): string {
  return `${detailPath(ORBIT_API_ENDPOINTS.agentActions, id)}/accept`;
}

export function pushTokenPath(id: string): string {
  return detailPath(ORBIT_API_ENDPOINTS.pushTokens, id);
}

export function notificationDeliveryPath(id: string): string {
  return `${ORBIT_API_ENDPOINTS.notifications}/deliveries/${encodeURIComponent(id)}`;
}

export function agentSignalPath(id: string): string {
  return detailPath("/api/agent/signals", id);
}

export function agentActionDismissPath(id: string): string {
  return `${detailPath(ORBIT_API_ENDPOINTS.agentActions, id)}/dismiss`;
}

export function agentLedgerTransitionPath(id: string): string {
  return `${detailPath(ORBIT_API_ENDPOINTS.agentLedger, id)}/transition`;
}

export function confirmationApprovePath(
  id: string,
  scenario?: string | null
): string {
  return scenarioPath(`${detailPath("/api/confirmations", id)}/approve`, scenario);
}

export function confirmationRejectPath(
  id: string,
  scenario?: string | null
): string {
  return scenarioPath(`${detailPath("/api/confirmations", id)}/reject`, scenario);
}

function scenarioPath(path: string, scenario?: string | null): string {
  const normalizedScenario = scenario?.trim();

  if (!normalizedScenario) {
    return path;
  }

  const searchParams = new URLSearchParams({
    scenario: normalizedScenario
  });

  return `${path}?${searchParams.toString()}`;
}

export function externalActionSandboxAuditPath(
  scenario?: string | null
): string {
  return scenarioPath(ORBIT_API_ENDPOINTS.externalActionSandboxAudit, scenario);
}

export function externalActionSandboxSendMessagePath(
  scenario?: string | null
): string {
  return scenarioPath(
    ORBIT_API_ENDPOINTS.externalActionSandboxSendMessage,
    scenario
  );
}

export function permissionsPath(scenario?: string | null): string {
  return scenarioPath(ORBIT_API_ENDPOINTS.permissions, scenario);
}

export function calendarPermissionRequestPath(
  scenario?: string | null
): string {
  return scenarioPath(ORBIT_API_ENDPOINTS.calendarPermissionRequest, scenario);
}

export function chatAssistFollowupDraftPath(
  scenario?: string | null
): string {
  return scenarioPath(ORBIT_API_ENDPOINTS.chatAssistFollowupDraft, scenario);
}

export function relationshipSearchSuggestionsPath(
  scenario?: string | null
): string {
  return scenarioPath(ORBIT_API_ENDPOINTS.relationshipSearchSuggestions, scenario);
}

export function relationshipSearchPath(): string {
  return ORBIT_API_ENDPOINTS.relationshipSearch;
}

export function contactDraftConfirmPath(id: string): string {
  return `${detailPath("/api/contact-drafts", id)}/confirm`;
}

export function businessCardContactConfirmPath(): string {
  return ORBIT_API_ENDPOINTS.contactBusinessCardConfirm;
}

export function contactDraftPath(id: string): string {
  return detailPath(ORBIT_API_ENDPOINTS.contactDrafts, id);
}

export function contactDraftsPath(scenario?: string | null): string {
  return scenarioPath(ORBIT_API_ENDPOINTS.contactDrafts, scenario);
}

export function contactDraftEventAttendeesImportPath(
  scenario?: string | null
): string {
  return scenarioPath(
    ORBIT_API_ENDPOINTS.contactDraftEventAttendeesImport,
    scenario
  );
}

export interface ContactDraftExternalPathInput {
  scenario?: string | null;
  sourceKind?: string | null;
}

function contactDraftExternalPath(
  path: string,
  input: ContactDraftExternalPathInput = {}
): string {
  const searchParams = new URLSearchParams();
  const sourceKind = input.sourceKind?.trim();
  const scenario = input.scenario?.trim();

  if (sourceKind) {
    searchParams.set("sourceKind", sourceKind);
  }

  if (scenario) {
    searchParams.set("scenario", scenario);
  }

  const queryString = searchParams.toString();
  return queryString ? `${path}?${queryString}` : path;
}

export function contactDraftExternalCandidatesPath(
  input: ContactDraftExternalPathInput = {}
): string {
  return contactDraftExternalPath(
    ORBIT_API_ENDPOINTS.contactDraftExternalCandidates,
    input
  );
}

export function contactDraftExternalImportPath(
  input: ContactDraftExternalPathInput = {}
): string {
  return contactDraftExternalPath(
    ORBIT_API_ENDPOINTS.contactDraftExternalImport,
    input
  );
}

export function contactDraftReferralPath(
  input: ContactDraftExternalPathInput = {}
): string {
  return contactDraftExternalPath(ORBIT_API_ENDPOINTS.contactDraftReferral, input);
}

export function contactDraftRecommendedConfirmPath(id: string): string {
  return `${detailPath(ORBIT_API_ENDPOINTS.contactDraftRecommended, id)}/confirm`;
}

export function contactDraftMergeSuggestionsPath(
  scenario?: string | null
): string {
  return scenarioPath(ORBIT_API_ENDPOINTS.contactDraftMergeSuggestions, scenario);
}

export function contactDraftMergeSuggestionApplyPath(id: string): string {
  return `${detailPath(
    ORBIT_API_ENDPOINTS.contactDraftMergeSuggestions,
    id
  )}/apply`;
}

export function contactInvitationPath(): string {
  return ORBIT_API_ENDPOINTS.contactInvitations;
}

export function profileBusinessCardExtractionPath(
  scenario?: string | null
): string {
  return scenarioPath(ORBIT_API_ENDPOINTS.profileBusinessCardExtraction, scenario);
}

export function profileResumeExtractionPath(scenario?: string | null): string {
  return scenarioPath(ORBIT_API_ENDPOINTS.profileResumeExtraction, scenario);
}

export function dashboardAggregatePath(activityLimit?: number): string {
  if (!activityLimit || !Number.isFinite(activityLimit) || activityLimit < 1) {
    return ORBIT_API_ENDPOINTS.dashboard;
  }

  return `${ORBIT_API_ENDPOINTS.dashboard}?activityLimit=${Math.floor(
    activityLimit
  )}`;
}

export function dashboardOpportunitiesRecomputePath(
  scenario?: string | null
): string {
  return scenarioPath(
    ORBIT_API_ENDPOINTS.dashboardOpportunitiesRecompute,
    scenario
  );
}

export function dashboardProvenanceAuditPath(
  scenario?: string | null
): string {
  return scenarioPath(ORBIT_API_ENDPOINTS.dashboardProvenanceAudit, scenario);
}

export function dashboardProvenanceAuditRunPath(
  scenario?: string | null
): string {
  return scenarioPath(ORBIT_API_ENDPOINTS.dashboardProvenanceAuditRun, scenario);
}

export function eventAttendeesPath(id: string): string {
  return `${eventDetailPath(id)}/attendees`;
}

export function eventAttendeesImportPath(id: string): string {
  return `${eventAttendeesPath(id)}/import`;
}

export function eventMatchesPath(id: string): string {
  return `${eventDetailPath(id)}/matches`;
}

export function eventRegistrationPath(id: string): string {
  return `${eventDetailPath(id)}/registration`;
}

export function eventRegistrationCancelPath(id: string): string {
  return `${eventRegistrationPath(id)}/cancel`;
}

export function eventRegistrationInterviewPath(id: string): string {
  return `${eventRegistrationPath(id)}/interview`;
}

export function eventRegistrationPersonaPath(id: string): string {
  return `${eventRegistrationPath(id)}/persona`;
}

export function eventReadinessPath(id: string): string {
  return `${eventDetailPath(id)}/readiness`;
}

export function eventEncountersPath(id: string): string {
  return `${eventDetailPath(id)}/encounters`;
}

export function eventEncounterEvidencePath(
  eventId: string,
  encounterId: string
): string {
  return `${eventEncountersPath(eventId)}/${encodeURIComponent(
    encounterId
  )}/evidence`;
}

export function eventGoalPath(id: string): string {
  return `${eventDetailPath(id)}/goal`;
}

export function eventPostEventPath(id: string): string {
  return `${eventDetailPath(id)}/post-event`;
}

export function eventPostEventConfirmPath(id: string): string {
  return `${eventPostEventPath(id)}/confirm`;
}

export function eventRecommendationsPath(id: string, limit?: number): string {
  const path = `${ORBIT_API_ENDPOINTS.eventRecommendations}/${encodeURIComponent(
    id
  )}`;

  if (!limit || !Number.isFinite(limit) || limit < 1) {
    return path;
  }

  return `${path}?limit=${Math.floor(limit)}`;
}

export interface EventValueRecommendationsPathInput {
  calendarFit?: string | null;
  industryPreference?: string | null;
  limit?: number | null;
  location?: string | null;
  profileGoal?: string | null;
  scenario?: string | null;
}

export function eventValueRecommendationsPath(
  input: EventValueRecommendationsPathInput = {}
): string {
  const searchParams = new URLSearchParams();
  const profileGoal = input.profileGoal?.trim();
  const location = input.location?.trim();
  const industryPreference = input.industryPreference?.trim();
  const calendarFit = input.calendarFit?.trim();
  const scenario = input.scenario?.trim();

  if (profileGoal) {
    searchParams.set("profileGoal", profileGoal);
  }

  if (location) {
    searchParams.set("location", location);
  }

  if (industryPreference) {
    searchParams.set("industryPreference", industryPreference);
  }

  if (calendarFit) {
    searchParams.set("calendarFit", calendarFit);
  }

  if (scenario) {
    searchParams.set("scenario", scenario);
  }

  if (input.limit && Number.isFinite(input.limit) && input.limit > 0) {
    searchParams.set("limit", String(Math.floor(input.limit)));
  }

  const queryString = searchParams.toString();
  return queryString
    ? `${ORBIT_API_ENDPOINTS.eventValueRecommendations}?${queryString}`
    : ORBIT_API_ENDPOINTS.eventValueRecommendations;
}

export function eventValueRecommendationAcceptPath(
  id: string,
  scenario?: string | null
): string {
  return scenarioPath(
    `${detailPath(ORBIT_API_ENDPOINTS.eventValueRecommendations, id)}/accept`,
    scenario
  );
}

export function eventOpeningLinePath(
  id: string,
  attendeeId?: string | null,
  style?: string | null
): string {
  const searchParams = new URLSearchParams();

  if (attendeeId?.trim()) {
    searchParams.set("attendeeId", attendeeId.trim());
  }

  if (style?.trim()) {
    searchParams.set("style", style.trim());
  }

  const queryString = searchParams.toString();
  const path = `${eventRecommendationsPath(id)}/opening-line`;
  return queryString ? `${path}?${queryString}` : path;
}

export function eventWantToConnectPath(id: string): string {
  return `${eventDetailPath(id)}/want-to-connect`;
}

export function messageDraftPath(id: string): string {
  return detailPath(ORBIT_API_ENDPOINTS.messageDrafts, id);
}

export function contactDetailPath(id: string): string {
  return detailPath(ORBIT_API_ENDPOINTS.contacts, id);
}

export interface ContactsListPathInput {
  query?: string | null;
  sourceFilters?: readonly string[] | null;
  status?: string | null;
  tagFilters?: readonly string[] | null;
  valueFilters?: readonly string[] | null;
}

function appendListFilters(
  searchParams: URLSearchParams,
  paramName: string,
  values?: readonly string[] | null
): void {
  values
    ?.map((value) => value.trim())
    .filter(Boolean)
    .forEach((value) => searchParams.append(paramName, value));
}

export function contactsListPath(input: ContactsListPathInput = {}): string {
  const searchParams = new URLSearchParams();
  const query = input.query?.trim();

  if (query) {
    searchParams.set("query", query);
  }

  if (input.status) {
    searchParams.set("status", input.status);
  }

  appendListFilters(searchParams, "source", input.sourceFilters);
  appendListFilters(searchParams, "tag", input.tagFilters);
  appendListFilters(searchParams, "value", input.valueFilters);

  const queryString = searchParams.toString();
  return queryString
    ? `${ORBIT_API_ENDPOINTS.contacts}?${queryString}`
    : ORBIT_API_ENDPOINTS.contacts;
}

export function contactsSearchPath(): string {
  return ORBIT_API_ENDPOINTS.contactsSearch;
}

export function connectionDetailPath(id: string): string {
  return detailPath(ORBIT_API_ENDPOINTS.connections, id);
}

export function connectionEvidencePath(
  id: string,
  scenario?: string | null
): string {
  return scenarioPath(`${connectionDetailPath(id)}/evidence`, scenario);
}

export function connectionProfilePath(
  id: string,
  scenario?: string | null
): string {
  return scenarioPath(`${connectionDetailPath(id)}/profile`, scenario);
}

export function connectionStagePath(id: string): string {
  return `${connectionDetailPath(id)}/stage`;
}

export function relationshipValueAnalysisPath(
  id: string,
  scenario?: string | null
): string {
  return scenarioPath(
    detailPath(ORBIT_API_ENDPOINTS.relationshipValueAnalysis, id),
    scenario
  );
}

export function relationshipValueRecomputePath(
  scenario?: string | null
): string {
  return scenarioPath(ORBIT_API_ENDPOINTS.relationshipValueRecompute, scenario);
}

export function chatConversationPath(id: string): string {
  return detailPath(ORBIT_API_ENDPOINTS.chatConversations, id);
}

export function chatConversationMessagesPath(id: string): string {
  return `${chatConversationPath(id)}/messages`;
}

export function chatConversationSummaryPath(id: string): string {
  return `${chatConversationPath(id)}/summary`;
}

export function chatConversationExtractionsPath(id: string): string {
  return `${chatConversationPath(id)}/extractions`;
}

export function aiConversationPath(id: string): string {
  return detailPath(ORBIT_API_ENDPOINTS.conversations, id);
}

export function aiConversationSessionPath(id: string): string {
  return detailPath(ORBIT_API_ENDPOINTS.aiConversationSessions, id);
}

export function aiRunPath(id: string, scenario?: string | null): string {
  return scenarioPath(detailPath(ORBIT_API_ENDPOINTS.aiRuns, id), scenario);
}

export function relationshipInboxPath(conversationId?: string | null): string {
  if (!conversationId?.trim()) {
    return ORBIT_API_ENDPOINTS.relationshipInbox;
  }

  return `${ORBIT_API_ENDPOINTS.relationshipInbox}?conversationId=${encodeURIComponent(
    conversationId.trim()
  )}`;
}

export interface RelationshipSignalsEmailCalendarPathInput {
  scenario?: string | null;
  sourceKind?: string | null;
}

export function relationshipSignalsEmailCalendarPath(
  input: RelationshipSignalsEmailCalendarPathInput = {}
): string {
  const searchParams = new URLSearchParams();
  const sourceKind = input.sourceKind?.trim();
  const scenario = input.scenario?.trim();

  if (sourceKind) {
    searchParams.set("sourceKind", sourceKind);
  }

  if (scenario) {
    searchParams.set("scenario", scenario);
  }

  const queryString = searchParams.toString();
  return queryString
    ? `${ORBIT_API_ENDPOINTS.relationshipSignalsEmailCalendar}?${queryString}`
    : ORBIT_API_ENDPOINTS.relationshipSignalsEmailCalendar;
}

export function relationshipSignalConfirmPath(id: string): string {
  return `${detailPath("/api/relationship-signals", id)}/confirm`;
}

function queryPath(path: string, params: Record<string, string>): string {
  const queryString = Object.entries(params)
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value.trim())}`
    )
    .join("&");

  return queryString ? `${path}?${queryString}` : path;
}

export function chatPrivacyControlsPath(conversationId: string): string {
  return queryPath(ORBIT_API_ENDPOINTS.chatPrivacyControls, {
    conversationId: conversationId.trim()
  });
}

export function chatPrivacyAnalysisTogglePath(conversationId: string): string {
  return queryPath(ORBIT_API_ENDPOINTS.chatPrivacyAnalysisToggle, {
    conversationId: conversationId.trim()
  });
}

export function profileUpdateSuggestionAcceptPath(id: string): string {
  return `${detailPath(ORBIT_API_ENDPOINTS.profileUpdateSuggestions, id)}/accept`;
}
