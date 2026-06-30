/**
 * 权限状态 fixture。
 *
 * 数据覆盖 Gmail/Calendar/Contacts 等权限的当前状态，以及日历权限请求结果。
 * 这些 fixture 只模拟授权状态视图，不会真的连接外部账号。
 */
import type {
  PermissionEvidence,
  PermissionRequestPayload,
  PermissionStatePayload,
  PermissionStateProvenance,
  PermissionStateRecord,
} from "./contract";

export const PERMISSION_STATE_FIXTURE_SOURCE =
  "fixture:features/permissions/fixtures.ts" as const;

const fixtureCollectedAt = "2026-06-24T14:00:00.000Z";
const fixtureRequestedAt = "2026-06-24T14:05:00.000Z";

export const mockPermissionStateProvenance: PermissionStateProvenance = {
  source: PERMISSION_STATE_FIXTURE_SOURCE,
  sourceLabel: "Mock permission state fixture",
  evidenceIds: [
    "evidence:manual-contacts-import",
    "evidence:event-calendar-staging",
    "evidence:notification-sandbox",
    "evidence:event-roster-import",
  ],
  collectedAt: fixtureCollectedAt,
  privacy: "demo-permission-state-only",
  generationMethod: "fixture",
};

export const mockEmptyPermissionStateProvenance: PermissionStateProvenance = {
  ...mockPermissionStateProvenance,
  sourceLabel: "Mock empty permission state rule",
  evidenceIds: ["evidence:permission-workflow-not-selected"],
  generationMethod: "rule-based-staged-authorization",
};

export const mockPendingPermissionStateProvenance: PermissionStateProvenance = {
  ...mockPermissionStateProvenance,
  sourceLabel: "Mock calendar staged authorization rule",
  evidenceIds: ["evidence:calendar-request-review"],
  generationMethod: "rule-based-staged-authorization",
};

export const mockPermissionStateFailureProvenance: PermissionStateProvenance = {
  ...mockPermissionStateProvenance,
  sourceLabel: "Mock permission state controlled failure rule",
  evidenceIds: ["evidence:permission-state-controlled-failure"],
  generationMethod: "rule-based-staged-authorization",
};

const contactsEvidence: PermissionEvidence = {
  evidenceId: "evidence:manual-contacts-import",
  sourceLabel: "Manual contacts setup",
  excerpt:
    "Imported relationship context can be read from the mock contacts store.",
  collectedAt: fixtureCollectedAt,
};

const calendarEvidence: PermissionEvidence = {
  evidenceId: "evidence:event-calendar-staging",
  sourceLabel: "Calendar staging review",
  excerpt:
    "Event readiness can stage calendar access without leaving the mock boundary.",
  collectedAt: fixtureCollectedAt,
};

const notificationEvidence: PermissionEvidence = {
  evidenceId: "evidence:notification-sandbox",
  sourceLabel: "Notification sandbox",
  excerpt:
    "Follow-up reminders are rendered as mock actions until delivery is replaced.",
  collectedAt: fixtureCollectedAt,
};

const eventEvidence: PermissionEvidence = {
  evidenceId: "evidence:event-roster-import",
  sourceLabel: "Event data import rehearsal",
  excerpt:
    "Attendee data can be loaded from a typed fixture with source labels intact.",
  collectedAt: fixtureCollectedAt,
};

const cameraEvidence: PermissionEvidence = {
  evidenceId: "evidence:camera-not-requested",
  sourceLabel: "Camera access deferred",
  excerpt:
    "Business-card capture waits for explicit operator review before scanning.",
  collectedAt: fixtureCollectedAt,
};

const emailEvidence: PermissionEvidence = {
  evidenceId: "evidence:email-not-requested",
  sourceLabel: "Email context deferred",
  excerpt:
    "Inbox context remains unavailable until a staged authorization is reviewed.",
  collectedAt: fixtureCollectedAt,
};

const chatAnalysisEvidence: PermissionEvidence = {
  evidenceId: "evidence:chat-analysis-not-requested",
  sourceLabel: "Chat analysis deferred",
  excerpt:
    "Chat summaries stay outside the mock permission boundary until requested.",
  collectedAt: fixtureCollectedAt,
};

// 权限状态覆盖已授权、待授权和可请求等状态，供权限中心和 API 测试复用。
export const mockPermissionStates: readonly PermissionStateRecord[] = [
  {
    capability: "contacts",
    label: "Contacts",
    status: "authorized",
    authorizationStage: "ready",
    actionLabel: "Use contact context",
    requiredFor: "Manual add, imports, merge review, and relationship search.",
    rationale:
      "Contact context is already available from sourced demo fixtures.",
    evidence: [contactsEvidence],
    provenance: mockPermissionStateProvenance,
  },
  {
    capability: "calendar",
    label: "Calendar",
    status: "authorized",
    authorizationStage: "ready",
    actionLabel: "Use calendar context",
    requiredFor: "Event readiness, meeting context, and follow-up timing.",
    rationale:
      "Calendar access is represented by a deterministic staged authorization fixture.",
    evidence: [calendarEvidence],
    provenance: mockPermissionStateProvenance,
  },
  {
    capability: "email",
    label: "Email",
    status: "not_requested",
    authorizationStage: "not-started",
    actionLabel: "Stage email context review",
    requiredFor: "Email signals and follow-up context.",
    rationale:
      "Email context is withheld until the operator asks for a staged review.",
    evidence: [emailEvidence],
    provenance: mockPermissionStateProvenance,
  },
  {
    capability: "notifications",
    label: "Notifications",
    status: "authorized",
    authorizationStage: "ready",
    actionLabel: "Use reminder sandbox",
    requiredFor: "Follow-up reminders and action queue prompts.",
    rationale:
      "Reminder delivery is mocked as an in-app sandbox action with provenance.",
    evidence: [notificationEvidence],
    provenance: mockPermissionStateProvenance,
  },
  {
    capability: "camera",
    label: "Camera",
    status: "not_requested",
    authorizationStage: "not-started",
    actionLabel: "Stage camera review",
    requiredFor: "Business-card image capture.",
    rationale:
      "Camera access is represented as a review state instead of device access.",
    evidence: [cameraEvidence],
    provenance: mockPermissionStateProvenance,
  },
  {
    capability: "business-card-scan",
    label: "Business-card scan",
    status: "available_after_camera",
    authorizationStage: "blocked-by-dependency",
    actionLabel: "Wait for camera review",
    requiredFor: "Business-card OCR rehearsal.",
    rationale:
      "Scan capability remains staged behind the camera permission review.",
    evidence: [cameraEvidence],
    provenance: mockPermissionStateProvenance,
  },
  {
    capability: "event-data",
    label: "Event data",
    status: "authorized",
    authorizationStage: "ready",
    actionLabel: "Use event roster data",
    requiredFor: "Event attendee import, goals, and readiness context.",
    rationale:
      "Event data is available from a typed attendee fixture with evidence ids.",
    evidence: [eventEvidence],
    provenance: mockPermissionStateProvenance,
  },
  {
    capability: "chat-analysis",
    label: "Chat analysis",
    status: "not_requested",
    authorizationStage: "not-started",
    actionLabel: "Stage chat analysis review",
    requiredFor: "Chat summary extraction and writing assist.",
    rationale:
      "Chat analysis waits for explicit review before summaries are generated.",
    evidence: [chatAnalysisEvidence],
    provenance: mockPermissionStateProvenance,
  },
];

export const mockPermissionStateFixture: PermissionStatePayload = {
  state: "success",
  permissions: mockPermissionStates,
  summary:
    "Eight permission boundaries are represented by deterministic mock states.",
  provenance: mockPermissionStateProvenance,
  nextAction:
    "Use staged authorization review before any sensitive relationship workflow runs.",
};

export const mockEmptyPermissionStateFixture: PermissionStatePayload = {
  state: "empty",
  permissions: [],
  summary: "No permission workflow has been selected in this empty scenario.",
  provenance: mockEmptyPermissionStateProvenance,
  nextAction:
    "Select a relationship workflow before requesting any staged permission.",
};

export const mockPendingPermissionStateFixture: PermissionStatePayload = {
  state: "pending",
  permissions: [
    {
      ...mockPermissionStates[1],
      status: "pending",
      authorizationStage: "staged-review",
      actionLabel: "Review calendar request",
      rationale:
        "Calendar access is waiting for explicit staged authorization review.",
      evidence: [calendarEvidence],
      provenance: mockPendingPermissionStateProvenance,
    },
  ],
  summary: "Calendar authorization is staged for operator review.",
  provenance: mockPendingPermissionStateProvenance,
  nextAction:
    "Review the calendar intent and keep the user inside the mock boundary.",
};

export const mockCalendarPermissionRequestFixture: PermissionRequestPayload = {
  state: "pending",
  request: {
    id: "permission-request:calendar:event-readiness",
    capability: "calendar",
    intent: "connect-event-calendar",
    status: "pending",
    requestedAt: fixtureRequestedAt,
    replacesProviderFlow: true,
    reviewLabel: "Calendar event readiness review",
    evidenceIds: mockPendingPermissionStateProvenance.evidenceIds,
  },
  permission: mockPendingPermissionStateFixture.permissions[0],
  provenance: mockPendingPermissionStateProvenance,
  nextAction:
    "Show a staged authorization review instead of opening a provider flow.",
};
