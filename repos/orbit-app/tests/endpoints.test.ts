import assert from "node:assert/strict";
import test from "node:test";
import {
  agentActionAcceptPath,
  agentActionDismissPath,
  chatConversationMessagesPath,
  chatConversationPath,
  connectionDetailPath,
  contactsListPath,
  contactDraftConfirmPath,
  dashboardAggregatePath,
  eventOpeningLinePath,
  eventReadinessPath,
  eventRecommendationsPath,
  ORBIT_API_ENDPOINTS,
  profileUpdateSuggestionAcceptPath
} from "../src/api/endpoints";
import * as endpoints from "../src/api/endpoints";

test("Orbit API endpoints expose the proactive Orbit AI chat turn route", () => {
  assert.equal(ORBIT_API_ENDPOINTS.proactiveTurns, "/api/ai/proactive-turns");
});

test("Orbit API endpoints expose the relationship inbox route", () => {
  assert.equal(
    ORBIT_API_ENDPOINTS.relationshipInbox,
    "/api/chat/relationship-inbox"
  );
});

test("Orbit API endpoints expose notifications for the inbox", () => {
  assert.equal(ORBIT_API_ENDPOINTS.notifications, "/api/notifications");
});

test("Orbit API endpoints expose contact draft confirmation routes", () => {
  assert.equal(
    contactDraftConfirmPath("manual-draft:live:测试/001"),
    "/api/contact-drafts/manual-draft%3Alive%3A%E6%B5%8B%E8%AF%95%2F001/confirm"
  );
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
});

test("Orbit API endpoints expose read-only connection evidence routes", () => {
  assert.equal(ORBIT_API_ENDPOINTS.connections, "/api/connections");
  assert.equal(connectionDetailPath("connection 001"), "/api/connections/connection%20001");
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
  assert.equal(dashboardAggregatePath(3), "/api/dashboard?activityLimit=3");
  assert.equal(dashboardAggregatePath(), "/api/dashboard");
});

test("Orbit API endpoints expose actionable Agent action routes", () => {
  assert.equal(ORBIT_API_ENDPOINTS.agentActions, "/api/agent/actions");
  assert.equal(ORBIT_API_ENDPOINTS.agentSettings, "/api/agent/settings");
  assert.equal(
    agentActionAcceptPath("agent action/001"),
    "/api/agent/actions/agent%20action%2F001/accept"
  );
  assert.equal(
    agentActionDismissPath("agent action/001"),
    "/api/agent/actions/agent%20action%2F001/dismiss"
  );
});

test("Orbit API endpoints expose the current account session route", () => {
  assert.equal(ORBIT_API_ENDPOINTS.accountMe, "/api/account/me");
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
});

test("Orbit API endpoints expose event preparation and recommendation routes", () => {
  assert.equal(
    eventReadinessPath("event 001/next"),
    "/api/events/event%20001%2Fnext/readiness"
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
