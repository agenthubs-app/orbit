export const ORBIT_API_ENDPOINTS = {
  accountMe: "/api/account/me",
  bootstrap: "/api/app/bootstrap",
  authCredentialsCallback: "/api/auth/callback/credentials",
  authCsrf: "/api/auth/csrf",
  authRegister: "/api/auth/register",
  authSignOut: "/api/auth/signout",
  chatConversations: "/api/chat/conversations",
  contactDraftBusinessCardScan: "/api/contact-drafts/business-card/scan",
  contactDraftManual: "/api/contact-drafts/manual",
  contactDraftQrScan: "/api/contact-drafts/qr/scan",
  agentActions: "/api/agent/actions",
  agentSettings: "/api/agent/settings",
  connections: "/api/connections",
  contacts: "/api/contacts",
  conversations: "/api/ai/conversations",
  dashboard: "/api/dashboard",
  dashboardDistributions: "/api/dashboard/distributions",
  dashboardNetworkGaps: "/api/dashboard/network-gaps",
  dashboardOpportunities: "/api/dashboard/opportunities",
  dashboardSummary: "/api/dashboard/summary",
  eventRecommendations: "/api/recommendations/event",
  notifications: "/api/notifications",
  proactiveTurns: "/api/ai/proactive-turns",
  relationshipInbox: "/api/chat/relationship-inbox",
  events: "/api/events",
  health: "/api/health",
  profile: "/api/profile",
  tasks: "/api/tasks"
} as const;

function detailPath(collectionPath: string, id: string): string {
  return `${collectionPath}/${encodeURIComponent(id)}`;
}

export function eventDetailPath(id: string): string {
  return detailPath(ORBIT_API_ENDPOINTS.events, id);
}

export function agentActionAcceptPath(id: string): string {
  return `${detailPath(ORBIT_API_ENDPOINTS.agentActions, id)}/accept`;
}

export function agentActionDismissPath(id: string): string {
  return `${detailPath(ORBIT_API_ENDPOINTS.agentActions, id)}/dismiss`;
}

export function contactDraftConfirmPath(id: string): string {
  return `${detailPath("/api/contact-drafts", id)}/confirm`;
}

export function dashboardAggregatePath(activityLimit?: number): string {
  if (!activityLimit || !Number.isFinite(activityLimit) || activityLimit < 1) {
    return ORBIT_API_ENDPOINTS.dashboard;
  }

  return `${ORBIT_API_ENDPOINTS.dashboard}?activityLimit=${Math.floor(
    activityLimit
  )}`;
}

export function eventAttendeesPath(id: string): string {
  return `${eventDetailPath(id)}/attendees`;
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

export function eventReadinessPath(id: string): string {
  return `${eventDetailPath(id)}/readiness`;
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

export function contactDetailPath(id: string): string {
  return detailPath(ORBIT_API_ENDPOINTS.contacts, id);
}

export interface ContactsListPathInput {
  query?: string | null;
  status?: string | null;
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

  const queryString = searchParams.toString();
  return queryString
    ? `${ORBIT_API_ENDPOINTS.contacts}?${queryString}`
    : ORBIT_API_ENDPOINTS.contacts;
}

export function connectionDetailPath(id: string): string {
  return detailPath(ORBIT_API_ENDPOINTS.connections, id);
}

export function connectionStagePath(id: string): string {
  return `${connectionDetailPath(id)}/stage`;
}

export function chatConversationPath(id: string): string {
  return detailPath(ORBIT_API_ENDPOINTS.chatConversations, id);
}

export function chatConversationMessagesPath(id: string): string {
  return `${chatConversationPath(id)}/messages`;
}

export function aiConversationPath(id: string): string {
  return detailPath(ORBIT_API_ENDPOINTS.conversations, id);
}

export function relationshipInboxPath(conversationId?: string | null): string {
  if (!conversationId?.trim()) {
    return ORBIT_API_ENDPOINTS.relationshipInbox;
  }

  return `${ORBIT_API_ENDPOINTS.relationshipInbox}?conversationId=${encodeURIComponent(
    conversationId.trim()
  )}`;
}
