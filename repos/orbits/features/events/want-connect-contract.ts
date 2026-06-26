import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import type { SourceReferenceDTO } from "../../shared/domain/source-types";
import { AppError, type AppErrorCode } from "../../shared/errors/app-error";

export const WANT_CONNECT_FIXTURE_SOURCE =
  "fixture:features/events/want-connect-contract.ts" as const;

export const WANT_CONNECT_ERROR_CODES = [
  "WANT_CONNECT_EVENT_ID_REQUIRED",
  "WANT_CONNECT_EVENT_NOT_FOUND",
  "WANT_CONNECT_TARGET_REQUIRED",
  "WANT_CONNECT_PENDING",
  "WANT_CONNECT_MOCK_FAILED",
] as const;

export type WantConnectErrorCode =
  (typeof WANT_CONNECT_ERROR_CODES)[number];

export type WantConnectScenario =
  | "success"
  | "empty"
  | "pending"
  | "failure";

export type WantConnectState = "success" | "empty" | "pending";
export type WantConnectMutualInterestState =
  | "mutual"
  | "none"
  | "pending_target";
export type WantConnectNoticeState = "ready";
export type WantConnectIntentStatus = "recorded" | "pending";

export interface WantConnectIntentInput {
  eventId?: string | null;
  actorContactId?: string | null;
  targetContactId?: string | null;
  scenario?: WantConnectScenario | string | null;
}

export interface WantConnectMatchesInput {
  eventId?: string | null;
  scenario?: WantConnectScenario | string | null;
}

export interface WantConnectErrorDefinition {
  code: WantConnectErrorCode;
  appCode: AppErrorCode;
  message: string;
  recovery: string;
}

export const WANT_CONNECT_ERROR_DEFINITIONS = {
  WANT_CONNECT_EVENT_ID_REQUIRED: {
    code: "WANT_CONNECT_EVENT_ID_REQUIRED",
    appCode: "VALIDATION_ERROR",
    message:
      "An event id is required before recording on-site want-to-connect intent.",
    recovery:
      "Keep the on-site intent surface empty until a known local event fixture is selected.",
  },
  WANT_CONNECT_EVENT_NOT_FOUND: {
    code: "WANT_CONNECT_EVENT_NOT_FOUND",
    appCode: "NOT_FOUND",
    message: "No mock on-site want-to-connect fixture matches that event id.",
    recovery:
      "Render the missing-event envelope and avoid real-time presence, peer notifications, databases, or external messaging work.",
  },
  WANT_CONNECT_TARGET_REQUIRED: {
    code: "WANT_CONNECT_TARGET_REQUIRED",
    appCode: "VALIDATION_ERROR",
    message:
      "A target contact id is required before recording want-to-connect intent.",
    recovery:
      "Ask the operator to choose a visible local attendee before creating the mock intent.",
  },
  WANT_CONNECT_PENDING: {
    code: "WANT_CONNECT_PENDING",
    appCode: "CONFLICT",
    message:
      "The mock on-site want-to-connect intent is waiting for mutual interest.",
    recovery:
      "Render the pending state and do not deliver peer notifications or external messages.",
  },
  WANT_CONNECT_MOCK_FAILED: {
    code: "WANT_CONNECT_MOCK_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "The mock on-site want-to-connect boundary is pinned to a controlled failure scenario.",
    recovery:
      "Render the controlled failure state and do not retry real-time presence, peer notifications, external messaging, database, calendar, email, or model work.",
  },
} as const satisfies Record<
  WantConnectErrorCode,
  WantConnectErrorDefinition
>;

export type WantConnectSourceReference = SourceReferenceDTO & {
  type: "event_import";
  label: string;
  eventId: string;
  contactId?: string;
  generatedBy: "mock-want-connect-service";
};

export interface WantConnectEventSummary {
  id: string;
  name: string;
  venue: string;
  startsAt: string;
  source: WantConnectSourceReference;
  realtimePresenceRequested: false;
  liveDatabaseWriteExecuted: false;
}

export interface WantConnectParticipant {
  contactId: string;
  displayName: string;
  organization: string;
  role: string;
  onSiteContext: string;
  source: WantConnectSourceReference;
  evidenceIds: readonly string[];
  realtimePresenceRequested: false;
  peerNotificationDelivered: false;
  externalMessageSent: false;
}

export interface WantConnectIntent {
  intentId: string;
  eventId: string;
  actorContactId: string;
  targetContactId: string;
  status: WantConnectIntentStatus;
  recordedAt: string;
  source: WantConnectSourceReference;
  evidenceIds: readonly string[];
  realtimePresenceRequested: false;
  peerNotificationDelivered: false;
  externalMessageSent: false;
}

export interface WantConnectMutualInterest {
  state: WantConnectMutualInterestState;
  actorWantsToConnect: boolean;
  targetWantsToConnect: boolean;
  rule: string;
  evidenceIds: readonly string[];
  realtimePresenceRequested: false;
  peerNotificationDelivered: false;
  externalMessageSent: false;
}

export interface WantConnectMatchNotice {
  state: WantConnectNoticeState;
  title: string;
  message: string;
  nextAction: string;
  evidenceIds: readonly string[];
  notificationProviderRequested: false;
  peerNotificationDelivered: false;
  externalMessageSent: false;
}

export interface WantConnectProvenance {
  source: string;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy: "demo-on-site-want-connect-only";
  generationMethod:
    | "fixture"
    | "rule-based-intent"
    | "rule-based-match-list"
    | "rule-based-pending"
    | "rule-based-empty";
  realtimePresenceRequested: false;
  peerNotificationDelivered: false;
  externalMessageSent: false;
  externalNetworkRequested: false;
  liveDatabaseWriteExecuted: false;
  calendarProviderRequested: false;
  emailProviderRequested: false;
  notificationProviderRequested: false;
  modelProviderRequested: false;
}

export interface WantConnectPayload {
  state: WantConnectState;
  event: WantConnectEventSummary;
  participants: readonly WantConnectParticipant[];
  intent: WantConnectIntent | null;
  mutualInterest: WantConnectMutualInterest;
  matchNotice: WantConnectMatchNotice | null;
  summary: string;
  provenance: WantConnectProvenance;
  nextAction: string;
}

export interface WantConnectMatch {
  matchId: string;
  eventId: string;
  participantContactIds: readonly string[];
  participantNames: readonly string[];
  mutualInterest: WantConnectMutualInterest;
  successNotice: WantConnectMatchNotice;
  source: WantConnectSourceReference;
  evidenceIds: readonly string[];
  realtimePresenceRequested: false;
  peerNotificationDelivered: false;
  externalMessageSent: false;
}

export interface WantConnectMatchesPayload {
  state: WantConnectState;
  event: WantConnectEventSummary;
  matches: readonly WantConnectMatch[];
  summary: string;
  provenance: WantConnectProvenance;
  nextAction: string;
}

export interface WantConnectSuccess {
  success: true;
  data: WantConnectPayload;
}

export interface WantConnectMatchesSuccess {
  success: true;
  data: WantConnectMatchesPayload;
}

export interface WantConnectFailure {
  success: false;
  error: WantConnectErrorDefinition & {
    state: "failure";
    provenance: WantConnectProvenance;
    evidenceIds: readonly string[];
  };
}

export type WantConnectResult = WantConnectSuccess | WantConnectFailure;
export type WantConnectMatchesResult =
  | WantConnectMatchesSuccess
  | WantConnectFailure;

export interface WantConnectService {
  createWantToConnectIntent: (
    input?: WantConnectIntentInput,
  ) => WantConnectResult;
  listMatches: (
    input?: WantConnectMatchesInput,
  ) => WantConnectMatchesResult;
}

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

export function wantConnectErrorToAppError(
  errorCode: WantConnectErrorCode,
): AppError {
  const definition = WANT_CONNECT_ERROR_DEFINITIONS[errorCode];

  return new AppError(definition.appCode, definition.message);
}

export function wantConnectFailureToAppError(
  failure: WantConnectFailure,
): AppError {
  return wantConnectErrorToAppError(failure.error.code);
}

export function wantConnectErrorContext(
  errorCode: WantConnectErrorCode,
  mode: FeatureMode,
): ApiErrorContext {
  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance:
      "Mock on-site want-to-connect failure came from deterministic fixture rules.",
    service: "on-site-want-to-connect-mock",
    wantConnectErrorCode: errorCode,
  };
}

export function wantConnectFailureContext(
  failure: WantConnectFailure,
  mode: FeatureMode,
): ApiErrorContext {
  return wantConnectErrorContext(failure.error.code, mode);
}
