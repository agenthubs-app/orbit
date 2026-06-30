import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import type { SourceReferenceDTO } from "../../shared/domain/source-types";
import { AppError, type AppErrorCode } from "../../shared/errors/app-error";

// Want Connect contract 描述活动现场“我想认识 TA”的双向意图和匹配提示。
// 当前不启用实时 presence、同伴通知或外部消息发送。
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

// intent 输入记录某人想连接谁；matches 输入读取当前活动的匹配列表。
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

// want-connect 错误定义保证 pending 或失败时不发 peer notification。
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

// Participant 和 Intent 是本地匹配模型，不代表真实 presence 状态。
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

// MutualInterest 和 Notice 描述匹配结果，但不会真实投递通知。
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

// provenance 记录没有实时连接、同伴通知或外部消息副作用。
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
