import type { ApiErrorContext } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import type { SourceReferenceDTO } from "../../shared/domain/source-types";
import { AppError, type AppErrorCode } from "../../shared/errors/app-error";

export const APP_BOOTSTRAP_FIXTURE_SOURCE =
  "fixture:features/bootstrap/contract.ts" as const;

export const APP_BOOTSTRAP_ERROR_CODES = [
  "APP_BOOTSTRAP_MOCK_FAILED",
] as const;

export type AppBootstrapErrorCode = (typeof APP_BOOTSTRAP_ERROR_CODES)[number];

export type AppBootstrapScenario = "success" | "empty" | "pending" | "failure";

export type AppBootstrapState = "success" | "empty" | "pending";

export interface AppBootstrapInput {
  scenario?: AppBootstrapScenario | string | null;
  taskLimit?: number | null;
}

export interface AppBootstrapErrorDefinition {
  code: AppBootstrapErrorCode;
  appCode: AppErrorCode;
  message: string;
  recovery: string;
}

export const APP_BOOTSTRAP_ERROR_DEFINITIONS = {
  APP_BOOTSTRAP_MOCK_FAILED: {
    code: "APP_BOOTSTRAP_MOCK_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "The app bootstrap mock aggregator is pinned to a controlled failure scenario.",
    recovery:
      "Render the app bootstrap mock aggregator failure state and do not run server-side personalization, live database aggregation, provider calls, devices, or external networks.",
  },
} as const satisfies Record<AppBootstrapErrorCode, AppBootstrapErrorDefinition>;

export type AppBootstrapSourceReference = SourceReferenceDTO & {
  label: string;
  providerRecordId: string;
  generatedBy: "mock-app-bootstrap-rules";
};

export interface AppBootstrapProvenance {
  source: typeof APP_BOOTSTRAP_FIXTURE_SOURCE;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy: "demo-app-bootstrap-only";
  generationMethod:
    | "fixture"
    | "rule-based-empty-state"
    | "rule-based-pending-state"
    | "rule-based-task-limit";
  serverSidePersonalizationExecuted: false;
  liveDatabaseAggregationExecuted: false;
  externalNetworkRequested: false;
  databaseReadExecuted: false;
  databaseWriteExecuted: false;
  aiProviderRequested: false;
  calendarProviderRequested: false;
  emailProviderRequested: false;
  notificationProviderRequested: false;
  deviceRequested: false;
}

export interface AppBootstrapAccount {
  accountId: string;
  workspaceName: string;
  role: string;
  plan: "mock-pro";
  timezone: string;
  evidenceIds: readonly string[];
  sourceRefs: readonly AppBootstrapSourceReference[];
}

export interface AppBootstrapProfile {
  profileId: string;
  displayName: string;
  headline: string;
  relationshipGoal: string;
  homeMarket: string;
  preferredFollowUpWindow: string;
  evidenceIds: readonly string[];
  sourceRefs: readonly AppBootstrapSourceReference[];
}

export interface AppBootstrapUpcomingEvent {
  eventId: string;
  title: string;
  startsAt: string;
  locationLabel: string;
  readinessLabel: string;
  goal: string;
  evidenceIds: readonly string[];
  sourceRefs: readonly AppBootstrapSourceReference[];
}

export interface AppBootstrapConnectionSummary {
  totalContacts: number;
  totalConnections: number;
  evidenceBackedConnections: number;
  highValueRelationships: number;
  dormantContacts: number;
  evidenceIds: readonly string[];
}

export interface AppBootstrapPendingTask {
  taskId: string;
  title: string;
  dueLabel: string;
  contactName: string;
  recommendedAction: string;
  evidenceIds: readonly string[];
  sourceRefs: readonly AppBootstrapSourceReference[];
}

export type AppBootstrapAgentActionType =
  | "event_reminder"
  | "post_event_followup"
  | "dormant_activation";

export interface AppBootstrapAgentAction {
  actionId: string;
  actionType: AppBootstrapAgentActionType;
  title: string;
  recommendedAction: string;
  confirmationRequired: boolean;
  evidenceIds: readonly string[];
  sourceRefs: readonly AppBootstrapSourceReference[];
}

export interface AppBootstrapDashboardSummary {
  relationshipAssets: number;
  newContactsThisWeek: number;
  highValueRelationships: number;
  pendingFollowups: number;
  dormantContacts: number;
  evidenceIds: readonly string[];
}

export interface AppBootstrapPermissionSummary {
  grantedPermissions: readonly string[];
  stagedPermissions: readonly string[];
  blockedPermissions: readonly string[];
  nextPermissionPrompt: string;
  evidenceIds: readonly string[];
}

export interface AppBootstrapNotificationSummary {
  unreadCount: number;
  pendingDeliveryCount: number;
  quietHoursActive: boolean;
  latestNotification: string;
  evidenceIds: readonly string[];
}

export interface AppBootstrapPayload {
  state: AppBootstrapState;
  account: AppBootstrapAccount | null;
  profile: AppBootstrapProfile | null;
  upcomingEvents: readonly AppBootstrapUpcomingEvent[];
  connectionSummary: AppBootstrapConnectionSummary;
  pendingTasks: readonly AppBootstrapPendingTask[];
  topAgentActions: readonly AppBootstrapAgentAction[];
  dashboardSummary: AppBootstrapDashboardSummary;
  permissionSummary: AppBootstrapPermissionSummary;
  notificationSummary: AppBootstrapNotificationSummary;
  provenance: AppBootstrapProvenance;
  summary: string;
  nextAction: string;
}

export interface AppBootstrapSuccess {
  success: true;
  data: AppBootstrapPayload;
}

export interface AppBootstrapFailure {
  success: false;
  error: AppBootstrapErrorDefinition & {
    state: "failure";
    provenance: AppBootstrapProvenance;
    evidenceIds: readonly string[];
  };
}

export type AppBootstrapResult = AppBootstrapSuccess | AppBootstrapFailure;

const fixtureCollectedAt = "2026-06-26T09:00:00.000+09:00";

function source(input: {
  type: AppBootstrapSourceReference["type"];
  id: string;
  label: string;
  providerRecordId: string;
}): AppBootstrapSourceReference {
  return {
    ...input,
    generatedBy: "mock-app-bootstrap-rules",
  };
}

function provenance(input?: {
  sourceLabel?: string;
  evidenceIds?: readonly string[];
  generationMethod?: AppBootstrapProvenance["generationMethod"];
}): AppBootstrapProvenance {
  return {
    source: APP_BOOTSTRAP_FIXTURE_SOURCE,
    sourceLabel: input?.sourceLabel ?? "Mock app bootstrap fixture",
    evidenceIds: input?.evidenceIds ?? ["bootstrap-fixture-1"],
    collectedAt: fixtureCollectedAt,
    privacy: "demo-app-bootstrap-only",
    generationMethod: input?.generationMethod ?? "fixture",
    serverSidePersonalizationExecuted: false,
    liveDatabaseAggregationExecuted: false,
    externalNetworkRequested: false,
    databaseReadExecuted: false,
    databaseWriteExecuted: false,
    aiProviderRequested: false,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationProviderRequested: false,
    deviceRequested: false,
  };
}

const accountSource = source({
  type: "manual",
  id: "src-account-manual",
  label: "Demo account setup",
  providerRecordId: "mock-account-1",
});

const profileSource = source({
  type: "manual",
  id: "src-profile-manual",
  label: "Manual founder profile",
  providerRecordId: "mock-profile-1",
});

const eventSource = source({
  type: "event_import",
  id: "src-event-import-1",
  label: "Tokyo SaaS Leaders attendee import",
  providerRecordId: "mock-event-import-1",
});

const emailSource = source({
  type: "email_signal",
  id: "src-email-signal-1",
  label: "Mock email relationship signal",
  providerRecordId: "mock-email-signal-1",
});

const calendarSource = source({
  type: "calendar_signal",
  id: "src-calendar-signal-1",
  label: "Mock calendar relationship signal",
  providerRecordId: "mock-calendar-signal-1",
});

const agentSource = source({
  type: "agent_action",
  id: "src-agent-action-1",
  label: "Mock agent action queue",
  providerRecordId: "mock-agent-action-1",
});

const baseConnectionSummary: AppBootstrapConnectionSummary = {
  totalContacts: 42,
  totalConnections: 31,
  evidenceBackedConnections: 29,
  highValueRelationships: 5,
  dormantContacts: 4,
  evidenceIds: ["connection-summary-fixture-1", "evidence-rollup-1"],
};

export const mockAppBootstrapFixture: AppBootstrapPayload = {
  state: "success",
  account: {
    accountId: "mock-account-1",
    workspaceName: "Orbit Demo",
    role: "Founder",
    plan: "mock-pro",
    timezone: "Asia/Tokyo",
    evidenceIds: ["account-fixture-1"],
    sourceRefs: [accountSource],
  },
  profile: {
    profileId: "mock-profile-1",
    displayName: "Mina Tanaka",
    headline: "Founder building partner-led growth in Tokyo",
    relationshipGoal:
      "Prioritize investor, design partner, and distribution relationships from recent events.",
    homeMarket: "Tokyo",
    preferredFollowUpWindow: "within 48 hours",
    evidenceIds: ["profile-fixture-1"],
    sourceRefs: [profileSource],
  },
  upcomingEvents: [
    {
      eventId: "event-tokyo-saas-leaders",
      title: "Tokyo SaaS Leaders Roundtable",
      startsAt: "2026-06-28T18:30:00.000+09:00",
      locationLabel: "Marunouchi",
      readinessLabel: "3 priority attendees ready",
      goal: "Find two channel partners with founder-led sales motion.",
      evidenceIds: ["event-fixture-1", "attendee-roster-1"],
      sourceRefs: [eventSource],
    },
    {
      eventId: "event-founder-breakfast",
      title: "Founder Operator Breakfast",
      startsAt: "2026-07-01T08:00:00.000+09:00",
      locationLabel: "Shibuya",
      readinessLabel: "Goal drafted",
      goal: "Reconnect with dormant operator relationships.",
      evidenceIds: ["event-fixture-2", "calendar-signal-1"],
      sourceRefs: [calendarSource],
    },
  ],
  connectionSummary: baseConnectionSummary,
  pendingTasks: [
    {
      taskId: "task-follow-up-akari",
      title: "Send recap to Akari Mori",
      dueLabel: "Today",
      contactName: "Akari Mori",
      recommendedAction:
        "Send a short recap with the partner-introduction ask and source the event note.",
      evidenceIds: ["encounter-note-1", "connection-summary-fixture-1"],
      sourceRefs: [eventSource],
    },
    {
      taskId: "task-book-haruto",
      title: "Book next coffee with Haruto Sato",
      dueLabel: "Tomorrow",
      contactName: "Haruto Sato",
      recommendedAction:
        "Confirm a morning coffee slot before the follow-up window closes.",
      evidenceIds: ["calendar-signal-1", "email-signal-1"],
      sourceRefs: [calendarSource, emailSource],
    },
    {
      taskId: "task-review-dormant",
      title: "Review dormant investor relationship",
      dueLabel: "This week",
      contactName: "Naomi Ito",
      recommendedAction:
        "Attach the latest product milestone before drafting the reactivation note.",
      evidenceIds: ["dormant-relationship-1"],
      sourceRefs: [agentSource],
    },
  ],
  topAgentActions: [
    {
      actionId: "agent-action-confirm-intro",
      actionType: "post_event_followup",
      title: "Confirm intro draft before sending",
      recommendedAction:
        "Review and confirm the drafted introduction to a channel partner.",
      confirmationRequired: true,
      evidenceIds: ["agent-action-1", "message-draft-1"],
      sourceRefs: [agentSource],
    },
    {
      actionId: "agent-action-event-reminder",
      actionType: "event_reminder",
      title: "Prepare tomorrow's attendee shortlist",
      recommendedAction:
        "Open the event readiness view and check the top three attendee matches.",
      confirmationRequired: false,
      evidenceIds: ["agent-action-2", "event-fixture-1"],
      sourceRefs: [eventSource, agentSource],
    },
    {
      actionId: "agent-action-dormant",
      actionType: "dormant_activation",
      title: "Revive dormant operator relationship",
      recommendedAction:
        "Use the latest evidence before drafting a low-pressure update.",
      confirmationRequired: true,
      evidenceIds: ["agent-action-3", "dormant-relationship-1"],
      sourceRefs: [agentSource],
    },
  ],
  dashboardSummary: {
    relationshipAssets: 42,
    newContactsThisWeek: 6,
    highValueRelationships: 5,
    pendingFollowups: 7,
    dormantContacts: 4,
    evidenceIds: ["dashboard-summary-1", "connection-summary-fixture-1"],
  },
  permissionSummary: {
    grantedPermissions: ["profile"],
    stagedPermissions: ["calendar", "email", "notifications"],
    blockedPermissions: [],
    nextPermissionPrompt:
      "Ask for calendar permission only when event readiness needs live schedule context.",
    evidenceIds: ["permission-summary-1"],
  },
  notificationSummary: {
    unreadCount: 5,
    pendingDeliveryCount: 2,
    quietHoursActive: false,
    latestNotification: "Akari Mori follow-up is due today.",
    evidenceIds: ["notification-summary-1"],
  },
  provenance: provenance({
    evidenceIds: [
      "bootstrap-fixture-1",
      "connection-summary-fixture-1",
      "dashboard-summary-1",
    ],
  }),
  summary:
    "Mock app bootstrap assembled account, profile, events, relationship work, dashboard, permissions, and notifications from deterministic local fixtures.",
  nextAction: "Review the pending follow-up tasks before the next event.",
};

export const mockEmptyAppBootstrapFixture: AppBootstrapPayload = {
  ...mockAppBootstrapFixture,
  state: "empty",
  upcomingEvents: [],
  connectionSummary: {
    totalContacts: 0,
    totalConnections: 0,
    evidenceBackedConnections: 0,
    highValueRelationships: 0,
    dormantContacts: 0,
    evidenceIds: ["empty-bootstrap-1"],
  },
  pendingTasks: [],
  topAgentActions: [],
  dashboardSummary: {
    relationshipAssets: 0,
    newContactsThisWeek: 0,
    highValueRelationships: 0,
    pendingFollowups: 0,
    dormantContacts: 0,
    evidenceIds: ["empty-bootstrap-1"],
  },
  notificationSummary: {
    unreadCount: 0,
    pendingDeliveryCount: 0,
    quietHoursActive: false,
    latestNotification: "No mock notifications are queued.",
    evidenceIds: ["empty-bootstrap-1"],
  },
  provenance: provenance({
    sourceLabel: "Mock app bootstrap empty state",
    evidenceIds: ["empty-bootstrap-1"],
    generationMethod: "rule-based-empty-state",
  }),
  summary:
    "No sourced relationships exist in the empty bootstrap scenario, so the first screen stays focused on acquisition.",
  nextAction: "Add a sourced contact or import an event attendee roster.",
};

export const mockPendingAppBootstrapFixture: AppBootstrapPayload = {
  ...mockAppBootstrapFixture,
  state: "pending",
  pendingTasks: [],
  topAgentActions: [
    {
      actionId: "agent-action-refresh-pending",
      actionType: "event_reminder",
      title: "Wait for mock bootstrap refresh",
      recommendedAction:
        "Keep the first screen in pending state until the deterministic refresh completes.",
      confirmationRequired: false,
      evidenceIds: ["pending-bootstrap-1"],
      sourceRefs: [agentSource],
    },
  ],
  provenance: provenance({
    sourceLabel: "Mock app bootstrap pending state",
    evidenceIds: ["pending-bootstrap-1"],
    generationMethod: "rule-based-pending-state",
  }),
  summary:
    "Mock app bootstrap is pending while local fixture rules simulate the first-screen aggregate refresh.",
  nextAction: "Keep the app shell visible and retry the mock bootstrap probe.",
};

export const mockAppBootstrapFailureProvenance = provenance({
  sourceLabel: "Mock app bootstrap failure state",
  evidenceIds: ["failure-bootstrap-1"],
});

export function appBootstrapFailureToAppError(
  result: AppBootstrapFailure,
): AppError {
  return new AppError(result.error.appCode, result.error.message);
}

export function appBootstrapFailureContext(
  result: AppBootstrapFailure,
  mode: FeatureMode,
): ApiErrorContext {
  return {
    appBootstrapErrorCode: result.error.code,
    boundary: "developer-admin",
    mode,
    privacy: "no-relationship-data",
    provenance:
      "Mock app bootstrap failure came from deterministic fixture rules.",
    service: "app-bootstrap-mock-aggregator",
  };
}
