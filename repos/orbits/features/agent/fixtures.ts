/**
 * Agent 动作队列 fixture。
 *
 * 队列项表示 Agent 建议用户复核的下一步动作，例如发送消息、添加联系人或安排日程。
 * accept/dismiss fixture 只记录本地决定，不代表外部动作已经执行。
 */
import type {
  AgentActionDecisionPayload,
  AgentActionQueueItem,
  AgentActionQueuePayload,
  AgentActionQueueProvenance,
  AgentActionSourceReference,
} from "./contract";

export const AGENT_ACTION_QUEUE_FIXTURE_SOURCE =
  "fixture:features/agent/fixtures.ts" as const;

const fixtureCollectedAt = "2026-06-25T23:50:00.000+09:00";
const decisionAt = "2026-06-25T23:51:00.000+09:00";

function source(input: {
  type: AgentActionSourceReference["type"];
  id: string;
  label: string;
  providerRecordId: string;
}): AgentActionSourceReference {
  return {
    ...input,
    generatedBy: "mock-agent-action-rules",
  };
}

export const mockAgentActionQueueProvenance: AgentActionQueueProvenance = {
  source: AGENT_ACTION_QUEUE_FIXTURE_SOURCE,
  sourceLabel: "Mock agent action queue fixture",
  evidenceIds: [
    "evidence:agent:event-reminder:climate-breakfast",
    "evidence:agent:followup:maya-chen",
    "evidence:agent:dormant:kenji-sato",
    "evidence:agent:draft:ren-takahashi",
    "evidence:agent:appointment:diego-rivera",
  ],
  collectedAt: fixtureCollectedAt,
  privacy: "demo-agent-action-queue-only",
  generationMethod: "fixture",
  autonomousExecutionStarted: false,
  externalSideEffectExecuted: false,
  externalNetworkRequested: false,
  liveDatabaseReadExecuted: false,
  liveDatabaseWriteExecuted: false,
  productionAuditLogWriteExecuted: false,
  aiProviderRequested: false,
  calendarProviderRequested: false,
  emailProviderRequested: false,
  notificationProviderRequested: false,
  deviceRequested: false,
};

export const mockAgentActionQueueFailureProvenance: AgentActionQueueProvenance =
  {
    ...mockAgentActionQueueProvenance,
    sourceLabel: "Mock agent action queue controlled failure",
    evidenceIds: ["evidence:agent:controlled-failure"],
    generationMethod: "rule-based-state",
  };

const emptyStateProvenance: AgentActionQueueProvenance = {
  ...mockAgentActionQueueProvenance,
  sourceLabel: "Mock empty agent action queue state",
  evidenceIds: ["evidence:agent:empty-state"],
  generationMethod: "rule-based-state",
};

const pendingStateProvenance: AgentActionQueueProvenance = {
  ...mockAgentActionQueueProvenance,
  sourceLabel: "Mock pending agent action queue state",
  evidenceIds: ["evidence:agent:pending-state"],
  generationMethod: "rule-based-state",
};

const decisionProvenance: AgentActionQueueProvenance = {
  ...mockAgentActionQueueProvenance,
  sourceLabel: "Mock agent action queue user decision",
  evidenceIds: ["evidence:agent:event-reminder:climate-breakfast"],
  generationMethod: "rule-based-user-decision",
};

const climateBreakfastSource = source({
  type: "event_import",
  id: "source:agent:climate-operator-breakfast",
  label: "Climate Operator Breakfast attendee plan",
  providerRecordId: "event:climate-operator-breakfast",
});

const mayaFollowupSource = source({
  type: "email_signal",
  id: "source:agent:maya-post-event-thread",
  label: "Maya Chen post-event email context",
  providerRecordId: "email-thread:maya-post-event",
});

const kenjiDormantSource = source({
  type: "chat_summary",
  id: "source:agent:kenji-dormant-summary",
  label: "Kenji Sato dormant relationship summary",
  providerRecordId: "chat-summary:kenji-dormant",
});

const renDraftSource = source({
  type: "agent_action",
  id: "source:agent:ren-message-draft",
  label: "Ren Takahashi bridge round draft suggestion",
  providerRecordId: "agent-draft:ren-bridge-round",
});

const diegoAppointmentSource = source({
  type: "calendar_signal",
  id: "source:agent:diego-appointment-window",
  label: "Diego Rivera pilot appointment window",
  providerRecordId: "calendar-window:diego-pilot",
});

// 动作队列覆盖不同风险等级和工具族，帮助 UI 展示确认、接受和忽略操作。
export const mockAgentActions: readonly AgentActionQueueItem[] = [
  {
    actionId: "demo-action-1",
    actionType: "event_reminder",
    title: "Prepare for Climate Operator Breakfast",
    contactName: "Aiko Tanaka",
    organization: "Tokyo Climate Guild",
    priority: "high",
    recommendedAction:
      "Review the attendee roster and pin two evidence-backed conversation goals before the event.",
    reason:
      "The active climate pilot goal has two warm attendees on the roster and one missing buyer-objection note.",
    dueLabel: "Before tomorrow morning",
    confirmationRequired: true,
    sourceRefs: [climateBreakfastSource],
    evidenceIds: ["evidence:agent:event-reminder:climate-breakfast"],
    provenance: mockAgentActionQueueProvenance,
    autonomousExecutionStarted: false,
    externalSideEffectExecuted: false,
    externalNetworkRequested: false,
    liveDatabaseWriteExecuted: false,
  },
  {
    actionId: "demo-action-2",
    actionType: "post_event_followup",
    title: "Follow up with Maya Chen",
    contactName: "Maya Chen",
    organization: "Kumo Grid",
    priority: "high",
    recommendedAction:
      "Send Maya the promised reliability memo and ask for pilot-scope feedback.",
    reason:
      "Maya asked for concrete reliability proof after the Tokyo Climate Dinner.",
    dueLabel: "This week",
    confirmationRequired: true,
    sourceRefs: [mayaFollowupSource],
    evidenceIds: ["evidence:agent:followup:maya-chen"],
    provenance: mockAgentActionQueueProvenance,
    autonomousExecutionStarted: false,
    externalSideEffectExecuted: false,
    externalNetworkRequested: false,
    liveDatabaseWriteExecuted: false,
  },
  {
    actionId: "demo-action-3",
    actionType: "dormant_activation",
    title: "Reactivate Kenji Sato",
    contactName: "Kenji Sato",
    organization: "Cedar Robotics",
    priority: "medium",
    recommendedAction:
      "Ask Kenji for one adjacent channel partner intro tied to the bridge round goal.",
    reason:
      "Kenji is a strong referral path with no sourced touchpoint in 67 days.",
    dueLabel: "Next 3 days",
    confirmationRequired: true,
    sourceRefs: [kenjiDormantSource],
    evidenceIds: ["evidence:agent:dormant:kenji-sato"],
    provenance: mockAgentActionQueueProvenance,
    autonomousExecutionStarted: false,
    externalSideEffectExecuted: false,
    externalNetworkRequested: false,
    liveDatabaseWriteExecuted: false,
  },
  {
    actionId: "demo-action-4",
    actionType: "message_draft_suggestion",
    title: "Review Ren bridge round draft",
    contactName: "Ren Takahashi",
    organization: "Mori Ventures",
    priority: "medium",
    recommendedAction:
      "Review the bridge round feedback draft before any external send action is considered.",
    reason:
      "Ren has recent investor context and a warm intro path through Kenji.",
    dueLabel: "Today",
    confirmationRequired: true,
    sourceRefs: [renDraftSource],
    evidenceIds: ["evidence:agent:draft:ren-takahashi"],
    provenance: mockAgentActionQueueProvenance,
    autonomousExecutionStarted: false,
    externalSideEffectExecuted: false,
    externalNetworkRequested: false,
    liveDatabaseWriteExecuted: false,
  },
  {
    actionId: "demo-action-5",
    actionType: "appointment_suggestion",
    title: "Suggest Diego pilot scoping call",
    contactName: "Diego Rivera",
    organization: "Northstar Fleet",
    priority: "low",
    recommendedAction:
      "Prepare a proposed 20-minute pilot scoping slot for Diego, held for explicit confirmation.",
    reason:
      "Diego can validate buyer objections for climate infrastructure pilot timing.",
    dueLabel: "Next week",
    confirmationRequired: true,
    sourceRefs: [diegoAppointmentSource],
    evidenceIds: ["evidence:agent:appointment:diego-rivera"],
    provenance: mockAgentActionQueueProvenance,
    autonomousExecutionStarted: false,
    externalSideEffectExecuted: false,
    externalNetworkRequested: false,
    liveDatabaseWriteExecuted: false,
  },
] as const;

export const mockAgentActionQueueFixture: AgentActionQueuePayload = {
  state: "success",
  actions: mockAgentActions,
  summary:
    "Mock agent action queue uses deterministic event, follow-up, dormancy, draft, and appointment rules without autonomous execution or provider calls.",
  provenance: mockAgentActionQueueProvenance,
  nextAction:
    "Review each action's evidence and require explicit confirmation before any live external action could run.",
};

export const mockEmptyAgentActionQueueFixture: AgentActionQueuePayload = {
  state: "empty",
  actions: [],
  summary:
    "The local agent action queue mock has no relationship context, event evidence, or source-backed next step to evaluate.",
  provenance: emptyStateProvenance,
  nextAction:
    "Add relationship context, event evidence, or a sourced follow-up before showing agent action queue suggestions.",
};

export const mockPendingAgentActionQueueFixture: AgentActionQueuePayload = {
  state: "pending",
  actions: [],
  summary:
    "The local agent action queue mock is waiting for a confirmation review checkpoint.",
  provenance: pendingStateProvenance,
  nextAction:
    "Keep agent action suggestions pending until the local confirmation review is approved.",
};

export const mockAcceptedAgentActionFixture: AgentActionDecisionPayload = {
  state: "success",
  actionId: "demo-action-1",
  actionTitle: "Prepare for Climate Operator Breakfast",
  decision: "accepted",
  actorLabel: "Mock operator",
  decidedAt: decisionAt,
  confirmationRequired: true,
  externalSideEffectExecuted: false,
  autonomousExecutionStarted: false,
  evidenceIds: ["evidence:agent:event-reminder:climate-breakfast"],
  provenance: decisionProvenance,
  nextAction:
    "Queue this action for explicit confirmation; do not run calendars, email, notifications, databases, AI providers, devices, or external networks.",
};

export const mockDismissedAgentActionFixture: AgentActionDecisionPayload = {
  ...mockAcceptedAgentActionFixture,
  decision: "dismissed",
  confirmationRequired: false,
  nextAction:
    "Keep the dismissal local to the mock fixture and leave all external providers untouched.",
};
