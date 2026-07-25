import assert from "node:assert/strict";
import test from "node:test";
import {
  agentActionAcceptPath,
  agentActionDismissPath,
  agentLedgerTransitionPath,
  aiRunPath,
  externalActionSandboxAuditPath,
  externalActionSandboxSendMessagePath,
  aiConversationSessionPath,
  chatPrivacyAnalysisTogglePath,
  chatPrivacyControlsPath,
  chatConversationExtractionsPath,
  chatAssistFollowupDraftPath,
  chatConversationMessagesPath,
  chatConversationPath,
  chatConversationSummaryPath,
  confirmationApprovePath,
  confirmationRejectPath,
  connectionDetailPath,
  connectionEvidencePath,
  connectionProfilePath,
  contactDraftExternalCandidatesPath,
  contactDraftExternalImportPath,
  contactDraftPath,
  contactDraftMergeSuggestionApplyPath,
  contactDraftMergeSuggestionsPath,
  contactDraftsPath,
  contactDraftEventAttendeesImportPath,
  contactsListPath,
  contactsSearchPath,
  contactDraftConfirmPath,
  dashboardAggregatePath,
  dashboardProvenanceAuditPath,
  dashboardProvenanceAuditRunPath,
  dashboardOpportunitiesRecomputePath,
  eventEncountersPath,
  eventAttendeesImportPath,
  eventGoalPath,
  eventPostEventConfirmPath,
  eventOpeningLinePath,
  eventPostEventPath,
  eventReadinessPath,
  eventValueRecommendationAcceptPath,
  eventValueRecommendationsPath,
  eventRecommendationsPath,
  ORBIT_API_ENDPOINTS,
  profileBusinessCardExtractionPath,
  profileResumeExtractionPath,
  profileUpdateSuggestionAcceptPath,
  relationshipValueAnalysisPath,
  relationshipValueRecomputePath,
  relationshipSignalConfirmPath,
  relationshipSignalsEmailCalendarPath
} from "../src/api/endpoints";
import * as endpoints from "../src/api/endpoints";

test("Orbit API endpoints expose the proactive Orbit AI chat turn route", () => {
  assert.equal(ORBIT_API_ENDPOINTS.proactiveTurns, "/api/ai/proactive-turns");
});

test("Orbit API endpoints expose web Orbit AI history sessions", () => {
  assert.equal(
    ORBIT_API_ENDPOINTS.aiConversationSessions,
    "/api/ai/conversations/sessions"
  );
  assert.equal(
    aiConversationSessionPath("agent-session/a b"),
    "/api/ai/conversations/sessions/agent-session%2Fa%20b"
  );
});

test("Orbit API endpoints expose AI run detail lookup", () => {
  assert.equal(ORBIT_API_ENDPOINTS.aiRuns, "/api/ai/runs");
  assert.equal(aiRunPath("demo run/1"), "/api/ai/runs/demo%20run%2F1");
  assert.equal(
    aiRunPath("demo-ai-run-1", "pending"),
    "/api/ai/runs/demo-ai-run-1?scenario=pending"
  );
});

test("Orbit API endpoints expose the relationship inbox route", () => {
  assert.equal(
    ORBIT_API_ENDPOINTS.relationshipInbox,
    "/api/chat/relationship-inbox"
  );
  assert.equal(
    ORBIT_API_ENDPOINTS.relationshipSignalsEmailCalendar,
    "/api/relationship-signals/email-calendar"
  );
  assert.equal(ORBIT_API_ENDPOINTS.chatAssistRewrite, "/api/chat/assist/rewrite");
  assert.equal(
    ORBIT_API_ENDPOINTS.chatAssistFollowupDraft,
    "/api/chat/assist/followup-draft"
  );
  assert.equal(ORBIT_API_ENDPOINTS.chatPrivacyControls, "/api/chat/privacy");
  assert.equal(
    ORBIT_API_ENDPOINTS.chatPrivacyAnalysisToggle,
    "/api/chat/privacy/analysis-toggle"
  );
  assert.equal(
    chatPrivacyControlsPath("conversation demo/aoba"),
    "/api/chat/privacy?conversationId=conversation%20demo%2Faoba"
  );
  assert.equal(
    chatPrivacyAnalysisTogglePath("conversation demo/aoba"),
    "/api/chat/privacy/analysis-toggle?conversationId=conversation%20demo%2Faoba"
  );
  assert.equal(chatAssistFollowupDraftPath(), "/api/chat/assist/followup-draft");
  assert.equal(
    chatAssistFollowupDraftPath("pending"),
    "/api/chat/assist/followup-draft?scenario=pending"
  );
  assert.equal(
    relationshipSignalsEmailCalendarPath({
      scenario: "success",
      sourceKind: "google_calendar"
    }),
    "/api/relationship-signals/email-calendar?sourceKind=google_calendar&scenario=success"
  );
  assert.equal(
    relationshipSignalConfirmPath("signal 001/next"),
    "/api/relationship-signals/signal%20001%2Fnext/confirm"
  );
});

test("Orbit API endpoints expose sensitive action confirmation decisions", () => {
  assert.equal(
    confirmationApprovePath("confirmation:external-action:message:maya-chen"),
    "/api/confirmations/confirmation%3Aexternal-action%3Amessage%3Amaya-chen/approve"
  );
  assert.equal(
    confirmationRejectPath("confirmation:external-action:calendar/demo"),
    "/api/confirmations/confirmation%3Aexternal-action%3Acalendar%2Fdemo/reject"
  );
  assert.equal(
    confirmationApprovePath("demo-confirmation-1", "blocked"),
    "/api/confirmations/demo-confirmation-1/approve?scenario=blocked"
  );
});

test("Orbit API endpoints expose notifications for the inbox", () => {
  assert.equal(ORBIT_API_ENDPOINTS.notifications, "/api/notifications");
});

test("Orbit API endpoints expose staged permission routes", () => {
  const permissionsPath = (
    endpoints as typeof endpoints & {
      permissionsPath?: (scenario?: string | null) => string;
    }
  ).permissionsPath;
  const calendarPermissionRequestPath = (
    endpoints as typeof endpoints & {
      calendarPermissionRequestPath?: (scenario?: string | null) => string;
    }
  ).calendarPermissionRequestPath;

  assert.equal(ORBIT_API_ENDPOINTS.permissions, "/api/permissions");
  assert.equal(
    ORBIT_API_ENDPOINTS.calendarPermissionRequest,
    "/api/permissions/calendar/request"
  );
  assert.equal(typeof permissionsPath, "function");
  assert.equal(permissionsPath?.(), "/api/permissions");
  assert.equal(permissionsPath?.("pending"), "/api/permissions?scenario=pending");
  assert.equal(typeof calendarPermissionRequestPath, "function");
  assert.equal(
    calendarPermissionRequestPath?.("blocked"),
    "/api/permissions/calendar/request?scenario=blocked"
  );
});

test("Orbit API endpoints expose follow-up task generation", () => {
  assert.equal(ORBIT_API_ENDPOINTS.taskGeneration, "/api/tasks/generate");
});

test("Orbit API endpoints expose follow-up reminder generation", () => {
  assert.equal(
    ORBIT_API_ENDPOINTS.reminderGeneration,
    "/api/notifications/reminders/generate"
  );
});

test("Orbit API endpoints expose follow-up message draft routes", () => {
  const messageDraftPath = (
    endpoints as typeof endpoints & {
      messageDraftPath?: (id: string) => string;
    }
  ).messageDraftPath;

  assert.equal(ORBIT_API_ENDPOINTS.messageDrafts, "/api/message-drafts");
  assert.equal(typeof messageDraftPath, "function");
  assert.equal(
    messageDraftPath?.("draft 001/next"),
    "/api/message-drafts/draft%20001%2Fnext"
  );
});

test("Orbit API endpoints expose contact draft confirmation routes", () => {
  assert.equal(ORBIT_API_ENDPOINTS.contactDrafts, "/api/contact-drafts");
  assert.equal(
    ORBIT_API_ENDPOINTS.contactDraftEventAttendeesImport,
    "/api/contact-drafts/event-attendees/import"
  );
  assert.equal(
    ORBIT_API_ENDPOINTS.contactDraftExternalCandidates,
    "/api/contact-drafts/external/candidates"
  );
  assert.equal(
    ORBIT_API_ENDPOINTS.contactDraftExternalImport,
    "/api/contact-drafts/external/import"
  );
  assert.equal(
    ORBIT_API_ENDPOINTS.contactDraftMergeSuggestions,
    "/api/contact-drafts/merge-suggestions"
  );
  assert.equal(contactDraftsPath(), "/api/contact-drafts");
  assert.equal(
    contactDraftsPath("pending"),
    "/api/contact-drafts?scenario=pending"
  );
  assert.equal(
    contactDraftMergeSuggestionsPath(),
    "/api/contact-drafts/merge-suggestions"
  );
  assert.equal(
    contactDraftMergeSuggestionsPath("pending"),
    "/api/contact-drafts/merge-suggestions?scenario=pending"
  );
  assert.equal(
    contactDraftMergeSuggestionApplyPath("demo merge/1"),
    "/api/contact-drafts/merge-suggestions/demo%20merge%2F1/apply"
  );
  assert.equal(
    contactDraftConfirmPath("manual-draft:live:测试/001"),
    "/api/contact-drafts/manual-draft%3Alive%3A%E6%B5%8B%E8%AF%95%2F001/confirm"
  );
  assert.equal(
    contactDraftPath("demo business/001"),
    "/api/contact-drafts/demo%20business%2F001"
  );
  assert.equal(
    contactDraftEventAttendeesImportPath(),
    "/api/contact-drafts/event-attendees/import"
  );
  assert.equal(
    contactDraftEventAttendeesImportPath("pending"),
    "/api/contact-drafts/event-attendees/import?scenario=pending"
  );
  assert.equal(
    contactDraftExternalCandidatesPath(),
    "/api/contact-drafts/external/candidates"
  );
  assert.equal(
    contactDraftExternalCandidatesPath({
      scenario: "success",
      sourceKind: "google_contacts"
    }),
    "/api/contact-drafts/external/candidates?sourceKind=google_contacts&scenario=success"
  );
  assert.equal(
    contactDraftExternalImportPath(),
    "/api/contact-drafts/external/import"
  );
  assert.equal(
    contactDraftExternalImportPath({
      scenario: "pending",
      sourceKind: " phone "
    }),
    "/api/contact-drafts/external/import?sourceKind=phone&scenario=pending"
  );
});

test("Orbit API endpoints expose event value recommendation acceptance", () => {
  assert.equal(
    eventValueRecommendationAcceptPath("demo event/1"),
    "/api/recommendations/events/demo%20event%2F1/accept"
  );
  assert.equal(
    eventValueRecommendationAcceptPath("demo-event-1", "pending"),
    "/api/recommendations/events/demo-event-1/accept?scenario=pending"
  );
});

test("Orbit API endpoints expose staged contact invitations", () => {
  const contactInvitationPath = (
    endpoints as typeof endpoints & {
      contactInvitationPath?: () => string;
    }
  ).contactInvitationPath;

  assert.equal(
    (ORBIT_API_ENDPOINTS as Record<string, string>).contactInvitations,
    "/api/contact-invitations"
  );
  assert.equal(typeof contactInvitationPath, "function");
  assert.equal(contactInvitationPath?.(), "/api/contact-invitations");
});

test("Orbit API endpoints compose contact list search filters", () => {
  assert.equal(contactsListPath(), "/api/contacts");
  assert.equal(
    contactsListPath({
      query: " 认识餐饮老板 ",
      status: "needs_follow_up"
    }),
    "/api/contacts?query=%E8%AE%A4%E8%AF%86%E9%A4%90%E9%A5%AE%E8%80%81%E6%9D%BF&status=needs_follow_up"
  );
  assert.equal(
    contactsListPath({ query: "   ", status: "active" }),
    "/api/contacts?status=active"
  );
  assert.equal(
    contactsListPath({
      query: " storage ",
      sourceFilters: ["manual"],
      status: "needs_follow_up",
      tagFilters: ["topic:storage-pilots"],
      valueFilters: ["commercial_opportunity"]
    }),
    "/api/contacts?query=storage&status=needs_follow_up&source=manual&tag=topic%3Astorage-pilots&value=commercial_opportunity"
  );
});

test("Orbit API endpoints expose web contact deep search", () => {
  assert.equal(ORBIT_API_ENDPOINTS.contactsSearch, "/api/contacts/search");
  assert.equal(contactsSearchPath(), "/api/contacts/search");
});

test("Orbit API endpoints expose relationship natural search suggestions", () => {
  const relationshipSearchSuggestionsPath = (
    endpoints as typeof endpoints & {
      relationshipSearchSuggestionsPath?: (scenario?: string | null) => string;
    }
  ).relationshipSearchSuggestionsPath;
  const relationshipSearchPath = (
    endpoints as typeof endpoints & {
      relationshipSearchPath?: () => string;
    }
  ).relationshipSearchPath;

  assert.equal(
    ORBIT_API_ENDPOINTS.relationshipSearchSuggestions,
    "/api/search/suggestions"
  );
  assert.equal(ORBIT_API_ENDPOINTS.relationshipSearch, "/api/search/relationships");
  assert.equal(typeof relationshipSearchSuggestionsPath, "function");
  assert.equal(
    relationshipSearchSuggestionsPath?.("pending"),
    "/api/search/suggestions?scenario=pending"
  );
  assert.equal(typeof relationshipSearchPath, "function");
  assert.equal(relationshipSearchPath?.(), "/api/search/relationships");
});

test("Orbit API endpoints expose connection evidence and profile routes", () => {
  assert.equal(ORBIT_API_ENDPOINTS.connections, "/api/connections");
  assert.equal(connectionDetailPath("connection 001"), "/api/connections/connection%20001");
  assert.equal(
    connectionEvidencePath("connection 001/next"),
    "/api/connections/connection%20001%2Fnext/evidence"
  );
  assert.equal(
    connectionEvidencePath("connection 001/next", "pending"),
    "/api/connections/connection%20001%2Fnext/evidence?scenario=pending"
  );
  assert.equal(
    connectionProfilePath("connection 001/next"),
    "/api/connections/connection%20001%2Fnext/profile"
  );
  assert.equal(
    connectionProfilePath("connection 001/next", "pending"),
    "/api/connections/connection%20001%2Fnext/profile?scenario=pending"
  );
});

test("Orbit API endpoints expose relationship value analysis and recompute", () => {
  assert.equal(
    ORBIT_API_ENDPOINTS.relationshipValueAnalysis,
    "/api/analysis/relationship-value"
  );
  assert.equal(
    ORBIT_API_ENDPOINTS.relationshipValueRecompute,
    "/api/analysis/relationship-value/recompute"
  );
  assert.equal(
    relationshipValueAnalysisPath("connection 001/next"),
    "/api/analysis/relationship-value/connection%20001%2Fnext"
  );
  assert.equal(
    relationshipValueAnalysisPath("connection 001/next", "pending"),
    "/api/analysis/relationship-value/connection%20001%2Fnext?scenario=pending"
  );
  assert.equal(
    relationshipValueRecomputePath(),
    "/api/analysis/relationship-value/recompute"
  );
  assert.equal(
    relationshipValueRecomputePath("pending"),
    "/api/analysis/relationship-value/recompute?scenario=pending"
  );
});

test("Orbit API endpoints expose connection stage update routes", () => {
  const connectionStagePath = (
    endpoints as typeof endpoints & {
      connectionStagePath?: (id: string) => string;
    }
  ).connectionStagePath;

  assert.equal(typeof connectionStagePath, "function");
  assert.equal(
    connectionStagePath?.("connection 001/next"),
    "/api/connections/connection%20001%2Fnext/stage"
  );
});

test("Orbit API endpoints expose read-only dashboard analytics routes", () => {
  assert.equal(ORBIT_API_ENDPOINTS.dashboard, "/api/dashboard");
  assert.equal(ORBIT_API_ENDPOINTS.dashboardSummary, "/api/dashboard/summary");
  assert.equal(
    ORBIT_API_ENDPOINTS.dashboardOpportunities,
    "/api/dashboard/opportunities"
  );
  assert.equal(
    ORBIT_API_ENDPOINTS.dashboardNetworkGaps,
    "/api/dashboard/network-gaps"
  );
  assert.equal(
    ORBIT_API_ENDPOINTS.dashboardDistributions,
    "/api/dashboard/distributions"
  );
  assert.equal(
    ORBIT_API_ENDPOINTS.dashboardOpportunitiesRecompute,
    "/api/dashboard/opportunities/recompute"
  );
  assert.equal(
    ORBIT_API_ENDPOINTS.dashboardProvenanceAudit,
    "/api/audit/provenance"
  );
  assert.equal(
    ORBIT_API_ENDPOINTS.dashboardProvenanceAuditRun,
    "/api/audit/provenance/run"
  );
  assert.equal(dashboardAggregatePath(3), "/api/dashboard?activityLimit=3");
  assert.equal(dashboardAggregatePath(), "/api/dashboard");
  assert.equal(
    dashboardOpportunitiesRecomputePath(),
    "/api/dashboard/opportunities/recompute"
  );
  assert.equal(
    dashboardOpportunitiesRecomputePath("pending"),
    "/api/dashboard/opportunities/recompute?scenario=pending"
  );
  assert.equal(dashboardProvenanceAuditPath(), "/api/audit/provenance");
  assert.equal(
    dashboardProvenanceAuditPath("pending"),
    "/api/audit/provenance?scenario=pending"
  );
  assert.equal(dashboardProvenanceAuditRunPath(), "/api/audit/provenance/run");
  assert.equal(
    dashboardProvenanceAuditRunPath("failure"),
    "/api/audit/provenance/run?scenario=failure"
  );
});

test("Orbit API endpoints expose actionable Agent action routes", () => {
  assert.equal(ORBIT_API_ENDPOINTS.agentActions, "/api/agent/actions");
  assert.equal(ORBIT_API_ENDPOINTS.agentLedger, "/api/agent/ledger");
  assert.equal(ORBIT_API_ENDPOINTS.agentSettings, "/api/agent/settings");
  assert.equal(
    ORBIT_API_ENDPOINTS.externalActionSandboxAudit,
    "/api/sandbox/external-actions/audit"
  );
  assert.equal(
    ORBIT_API_ENDPOINTS.externalActionSandboxSendMessage,
    "/api/sandbox/external-actions/send-message"
  );
  assert.equal(
    externalActionSandboxAuditPath("pending"),
    "/api/sandbox/external-actions/audit?scenario=pending"
  );
  assert.equal(
    externalActionSandboxAuditPath(),
    "/api/sandbox/external-actions/audit"
  );
  assert.equal(
    externalActionSandboxSendMessagePath("failure"),
    "/api/sandbox/external-actions/send-message?scenario=failure"
  );
  assert.equal(
    externalActionSandboxSendMessagePath(),
    "/api/sandbox/external-actions/send-message"
  );
  assert.equal(
    agentActionAcceptPath("agent action/001"),
    "/api/agent/actions/agent%20action%2F001/accept"
  );
  assert.equal(
    agentActionDismissPath("agent action/001"),
    "/api/agent/actions/agent%20action%2F001/dismiss"
  );
  assert.equal(
    agentLedgerTransitionPath("action:followup/task 001"),
    "/api/agent/ledger/action%3Afollowup%2Ftask%20001/transition"
  );
});

test("Orbit API endpoints expose the current account session route", () => {
  assert.equal(ORBIT_API_ENDPOINTS.accountMe, "/api/account/me");
  assert.equal(
    ORBIT_API_ENDPOINTS.accountSessionSignOut,
    "/api/account/session/sign-out"
  );
  assert.equal(ORBIT_API_ENDPOINTS.authCsrf, "/api/auth/csrf");
  assert.equal(
    ORBIT_API_ENDPOINTS.authCredentialsCallback,
    "/api/auth/callback/credentials"
  );
  assert.equal(ORBIT_API_ENDPOINTS.authRegister, "/api/auth/register");
  assert.equal(ORBIT_API_ENDPOINTS.authSignOut, "/api/auth/signout");
  assert.equal(
    ORBIT_API_ENDPOINTS.authMobileCredentials,
    "/api/auth/mobile/credentials"
  );
  assert.equal(
    ORBIT_API_ENDPOINTS.authMobileGoogleExchange,
    "/api/auth/mobile/google/exchange"
  );
  assert.equal(
    ORBIT_API_ENDPOINTS.authMobileGoogleStart,
    "/api/auth/mobile/google/start"
  );
  assert.equal(
    ORBIT_API_ENDPOINTS.authMobileProviders,
    "/api/auth/mobile/providers"
  );
  assert.equal(ORBIT_API_ENDPOINTS.authSession, "/api/auth/session");
});

test("Orbit API endpoints expose profile update suggestion routes", () => {
  assert.equal(
    ORBIT_API_ENDPOINTS.profileUpdateSuggestions,
    "/api/profile/update-suggestions"
  );
  assert.equal(
    profileUpdateSuggestionAcceptPath("suggestion 001/next"),
    "/api/profile/update-suggestions/suggestion%20001%2Fnext/accept"
  );
});

test("Orbit API endpoints expose profile document extraction routes", () => {
  assert.equal(
    ORBIT_API_ENDPOINTS.profileBusinessCardExtraction,
    "/api/profile/extractions/business-card"
  );
  assert.equal(
    ORBIT_API_ENDPOINTS.profileResumeExtraction,
    "/api/profile/extractions/resume"
  );
  assert.equal(
    profileBusinessCardExtractionPath("success"),
    "/api/profile/extractions/business-card?scenario=success"
  );
  assert.equal(
    profileResumeExtractionPath("empty"),
    "/api/profile/extractions/resume?scenario=empty"
  );
  assert.equal(
    profileResumeExtractionPath(),
    "/api/profile/extractions/resume"
  );
});

test("Orbit API endpoints expose relationship chat conversation routes", () => {
  assert.equal(ORBIT_API_ENDPOINTS.chatConversations, "/api/chat/conversations");
  assert.equal(
    chatConversationPath("conversation 001"),
    "/api/chat/conversations/conversation%20001"
  );
  assert.equal(
    chatConversationMessagesPath("conversation 001"),
    "/api/chat/conversations/conversation%20001/messages"
  );
  assert.equal(
    chatConversationSummaryPath("conversation 001"),
    "/api/chat/conversations/conversation%20001/summary"
  );
  assert.equal(
    chatConversationExtractionsPath("conversation 001"),
    "/api/chat/conversations/conversation%20001/extractions"
  );
});

test("Orbit API endpoints expose event preparation and recommendation routes", () => {
  const eventEncounterEvidencePath = (
    endpoints as typeof endpoints & {
      eventEncounterEvidencePath?: (eventId: string, encounterId: string) => string;
    }
  ).eventEncounterEvidencePath;

  assert.equal(
    ORBIT_API_ENDPOINTS.eventValueRecommendations,
    "/api/recommendations/events"
  );
  assert.equal(
    eventValueRecommendationsPath({ limit: 3 }),
    "/api/recommendations/events?limit=3"
  );
  assert.equal(
    eventValueRecommendationsPath({
      calendarFit: "open",
      industryPreference: "climate",
      limit: 2,
      location: "Tokyo",
      profileGoal: "meet operators"
    }),
    "/api/recommendations/events?profileGoal=meet+operators&location=Tokyo&industryPreference=climate&calendarFit=open&limit=2"
  );
  assert.equal(
    eventReadinessPath("event 001/next"),
    "/api/events/event%20001%2Fnext/readiness"
  );
  assert.equal(
    eventGoalPath("event 001/next"),
    "/api/events/event%20001%2Fnext/goal"
  );
  assert.equal(
    eventEncountersPath("event 001/next"),
    "/api/events/event%20001%2Fnext/encounters"
  );
  assert.equal(
    eventAttendeesImportPath("event 001/next"),
    "/api/events/event%20001%2Fnext/attendees/import"
  );
  assert.equal(typeof eventEncounterEvidencePath, "function");
  assert.equal(
    eventEncounterEvidencePath?.("event 001/next", "encounter 001/next"),
    "/api/events/event%20001%2Fnext/encounters/encounter%20001%2Fnext/evidence"
  );
  assert.equal(
    eventPostEventPath("event 001/next"),
    "/api/events/event%20001%2Fnext/post-event"
  );
  assert.equal(
    eventPostEventConfirmPath("event 001/next"),
    "/api/events/event%20001%2Fnext/post-event/confirm"
  );
  assert.equal(
    eventRecommendationsPath("event 001/next", 3),
    "/api/recommendations/event/event%20001%2Fnext?limit=3"
  );
  assert.equal(
    eventRecommendationsPath("event 001/next"),
    "/api/recommendations/event/event%20001%2Fnext"
  );
  assert.equal(
    eventOpeningLinePath("event 001/next", "attendee:小雨", "context_question"),
    "/api/recommendations/event/event%20001%2Fnext/opening-line?attendeeId=attendee%3A%E5%B0%8F%E9%9B%A8&style=context_question"
  );
});
