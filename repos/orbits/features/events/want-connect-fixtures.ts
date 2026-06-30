import type {
  WantConnectEventSummary,
  WantConnectIntent,
  WantConnectMatch,
  WantConnectMatchesPayload,
  WantConnectMatchNotice,
  WantConnectMutualInterest,
  WantConnectParticipant,
  WantConnectPayload,
  WantConnectProvenance,
  WantConnectSourceReference,
} from "./want-connect-contract";

export const WANT_CONNECT_FIXTURE_SOURCE =
  "fixture:features/events/want-connect-fixtures.ts" as const;

const fixtureCollectedAt = "2026-06-25T19:20:00.000+09:00";
const fixtureRecordedAt = "2026-06-25T19:24:00.000+09:00";

export const mockWantConnectSource: WantConnectSourceReference = {
  type: "event_import",
  id: "source:on-site-want-connect:demo-event-1",
  label: "on-site mutual-interest fixture",
  eventId: "demo-event-1",
  generatedBy: "mock-want-connect-service",
};

export const mockWantConnectEvent: WantConnectEventSummary = {
  id: "demo-event-1",
  name: "Climate founders dinner",
  venue: "Daikanyama Founders Room",
  startsAt: "2026-06-25T19:00:00.000+09:00",
  source: mockWantConnectSource,
  realtimePresenceRequested: false,
  liveDatabaseWriteExecuted: false,
};

export const mockWantConnectProvenance: WantConnectProvenance = {
  source: WANT_CONNECT_FIXTURE_SOURCE,
  sourceLabel: "Mock on-site want-to-connect fixture",
  evidenceIds: [
    "evidence:want-connect-local-intent",
    "evidence:want-connect-mutual-interest",
    "evidence:want-connect-success-notice",
  ],
  collectedAt: fixtureCollectedAt,
  privacy: "demo-on-site-want-connect-only",
  generationMethod: "fixture",
  realtimePresenceRequested: false,
  peerNotificationDelivered: false,
  externalMessageSent: false,
  externalNetworkRequested: false,
  liveDatabaseWriteExecuted: false,
  calendarProviderRequested: false,
  emailProviderRequested: false,
  notificationProviderRequested: false,
  modelProviderRequested: false,
};

export const mockEmptyWantConnectProvenance: WantConnectProvenance = {
  ...mockWantConnectProvenance,
  sourceLabel: "Mock empty on-site want-to-connect rule",
  evidenceIds: ["evidence:want-connect-empty"],
  generationMethod: "rule-based-empty",
};

export const mockPendingWantConnectProvenance: WantConnectProvenance = {
  ...mockWantConnectProvenance,
  sourceLabel: "Mock pending on-site want-to-connect rule",
  evidenceIds: ["evidence:want-connect-pending"],
  generationMethod: "rule-based-pending",
};

export const mockWantConnectFailureProvenance: WantConnectProvenance = {
  ...mockWantConnectProvenance,
  sourceLabel: "Mock on-site want-to-connect controlled failure rule",
  evidenceIds: ["evidence:want-connect-controlled-failure"],
  generationMethod: "rule-based-intent",
};

function participantSource(contactId: string): WantConnectSourceReference {
  return {
    ...mockWantConnectSource,
    contactId,
  };
}

export const mockWantConnectParticipants: readonly WantConnectParticipant[] = [
  {
    contactId: "contact:operator",
    displayName: "Orbit operator",
    organization: "Orbit demo workspace",
    role: "Founder",
    onSiteContext:
      "The operator wants a warm in-room introduction when mutual interest is confirmed.",
    source: participantSource("contact:operator"),
    evidenceIds: ["evidence:want-connect-local-intent"],
    realtimePresenceRequested: false,
    peerNotificationDelivered: false,
    externalMessageSent: false,
  },
  {
    contactId: "contact:priya-shah",
    displayName: "Priya Shah",
    organization: "Solace Battery",
    role: "CEO",
    onSiteContext:
      "Priya is open to storage pilot conversations after her event talk.",
    source: participantSource("contact:priya-shah"),
    evidenceIds: [
      "evidence:want-connect-mutual-interest",
      "evidence:want-connect-success-notice",
    ],
    realtimePresenceRequested: false,
    peerNotificationDelivered: false,
    externalMessageSent: false,
  },
  {
    contactId: "contact:aiko-mori",
    displayName: "Aiko Mori",
    organization: "Blue Harbor Climate",
    role: "VP Partnerships",
    onSiteContext:
      "Aiko is visible in the local event fixture, but no mutual interest has been confirmed.",
    source: participantSource("contact:aiko-mori"),
    evidenceIds: ["evidence:want-connect-pending"],
    realtimePresenceRequested: false,
    peerNotificationDelivered: false,
    externalMessageSent: false,
  },
];

export const mockWantConnectIntent: WantConnectIntent = {
  intentId: "want-connect:intent:demo-event-1:operator-priya",
  eventId: "demo-event-1",
  actorContactId: "contact:operator",
  targetContactId: "contact:priya-shah",
  status: "recorded",
  recordedAt: fixtureRecordedAt,
  source: participantSource("contact:priya-shah"),
  evidenceIds: ["evidence:want-connect-local-intent"],
  realtimePresenceRequested: false,
  peerNotificationDelivered: false,
  externalMessageSent: false,
};

export const mockWantConnectMutualInterest: WantConnectMutualInterest = {
  state: "mutual",
  actorWantsToConnect: true,
  targetWantsToConnect: true,
  rule: "fixture confirms both local in-room intent records for Priya Shah",
  evidenceIds: ["evidence:want-connect-mutual-interest"],
  realtimePresenceRequested: false,
  peerNotificationDelivered: false,
  externalMessageSent: false,
};

export const mockPendingWantConnectMutualInterest: WantConnectMutualInterest = {
  state: "pending_target",
  actorWantsToConnect: true,
  targetWantsToConnect: false,
  rule: "fixture records only the operator intent; target interest remains pending",
  evidenceIds: ["evidence:want-connect-pending"],
  realtimePresenceRequested: false,
  peerNotificationDelivered: false,
  externalMessageSent: false,
};

export const mockEmptyWantConnectMutualInterest: WantConnectMutualInterest = {
  state: "none",
  actorWantsToConnect: false,
  targetWantsToConnect: false,
  rule: "no local want-to-connect intents exist for this event scenario",
  evidenceIds: ["evidence:want-connect-empty"],
  realtimePresenceRequested: false,
  peerNotificationDelivered: false,
  externalMessageSent: false,
};

export const mockWantConnectMatchNotice: WantConnectMatchNotice = {
  state: "ready",
  title: "Mutual interest confirmed",
  message:
    "Priya Shah also wants to connect. Keep the introduction on-site and attach the event context before follow-up.",
  nextAction:
    "Open the in-room introduction script and confirm before any external message is sent.",
  evidenceIds: ["evidence:want-connect-success-notice"],
  notificationProviderRequested: false,
  peerNotificationDelivered: false,
  externalMessageSent: false,
};

export const mockWantConnectMatch: WantConnectMatch = {
  matchId: "want-connect:match:demo-event-1:operator-priya",
  eventId: "demo-event-1",
  participantContactIds: ["contact:operator", "contact:priya-shah"],
  participantNames: ["Orbit operator", "Priya Shah"],
  mutualInterest: mockWantConnectMutualInterest,
  successNotice: mockWantConnectMatchNotice,
  source: participantSource("contact:priya-shah"),
  evidenceIds: mockWantConnectProvenance.evidenceIds,
  realtimePresenceRequested: false,
  peerNotificationDelivered: false,
  externalMessageSent: false,
};

export const mockWantConnectFixture: WantConnectPayload = {
  state: "success",
  event: mockWantConnectEvent,
  participants: mockWantConnectParticipants,
  intent: mockWantConnectIntent,
  mutualInterest: mockWantConnectMutualInterest,
  matchNotice: mockWantConnectMatchNotice,
  summary:
    "Local fixtures recorded want-to-connect intent and found a deterministic mutual-interest match.",
  provenance: mockWantConnectProvenance,
  nextAction:
    "Show the match success notice, then require confirmation before any external action.",
};

export const mockEmptyWantConnectFixture: WantConnectPayload = {
  state: "empty",
  event: mockWantConnectEvent,
  participants: [],
  intent: null,
  mutualInterest: mockEmptyWantConnectMutualInterest,
  matchNotice: null,
  summary: "No local want-to-connect intents have been recorded for this event.",
  provenance: mockEmptyWantConnectProvenance,
  nextAction:
    "Wait for a deterministic mutual-interest fixture before showing a match success notice.",
};

export const mockPendingWantConnectFixture: WantConnectPayload = {
  state: "pending",
  event: mockWantConnectEvent,
  participants: mockWantConnectParticipants,
  intent: {
    ...mockWantConnectIntent,
    intentId: "want-connect:intent:demo-event-1:operator-aiko",
    targetContactId: "contact:aiko-mori",
    status: "pending",
    source: participantSource("contact:aiko-mori"),
    evidenceIds: ["evidence:want-connect-pending"],
  },
  mutualInterest: mockPendingWantConnectMutualInterest,
  matchNotice: null,
  summary:
    "The operator intent is recorded locally, but the target attendee has not expressed mutual interest.",
  provenance: mockPendingWantConnectProvenance,
  nextAction:
    "Keep the on-site state pending and avoid peer notifications or external messages.",
};

export const mockWantConnectMatchesFixture: WantConnectMatchesPayload = {
  state: "success",
  event: mockWantConnectEvent,
  matches: [mockWantConnectMatch],
  summary:
    "One deterministic mutual-interest match is ready for on-site review.",
  provenance: {
    ...mockWantConnectProvenance,
    generationMethod: "rule-based-match-list",
    sourceLabel: "Mock on-site want-to-connect match list rule",
  },
  nextAction:
    "Review the success notice and require confirmation before taking action.",
};

export const mockEmptyWantConnectMatchesFixture: WantConnectMatchesPayload = {
  state: "empty",
  event: mockWantConnectEvent,
  matches: [],
  summary: "No deterministic mutual-interest matches exist for this event.",
  provenance: mockEmptyWantConnectProvenance,
  nextAction:
    "Wait for a deterministic mutual-interest fixture before showing a match success notice.",
};

export const mockPendingWantConnectMatchesFixture: WantConnectMatchesPayload = {
  state: "pending",
  event: mockWantConnectEvent,
  matches: [],
  summary:
    "On-site want-to-connect matching is waiting for a second local intent signal.",
  provenance: mockPendingWantConnectProvenance,
  nextAction:
    "Keep the pending state visible and do not send peer notifications.",
};
