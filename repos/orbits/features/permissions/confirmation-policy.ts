import type {
  ConfirmationEvidence,
  ConfirmationGuardProvenance,
  ConfirmationRequirement,
  ConfirmationRequirementPayload,
} from "./confirmation-contract";

export const CONFIRMATION_GUARD_FIXTURE_SOURCE =
  "fixture:features/permissions/mock-confirmation-service.ts" as const;

// Fixed policy timestamps keep UI snapshots and contract tests stable.
export const confirmationPolicyCollectedAt = "2026-06-24T15:00:00.000Z";
export const confirmationPolicyCreatedAt = "2026-06-24T15:05:00.000Z";
export const confirmationPolicyDecidedAt = "2026-06-24T15:10:00.000Z";

export const confirmationPolicyGuardProvenance: ConfirmationGuardProvenance = {
  source: CONFIRMATION_GUARD_FIXTURE_SOURCE,
  sourceLabel: "Mock sensitive action confirmation fixture",
  evidenceIds: [
    "evidence:message-draft-review",
    "evidence:card-import-review",
    "evidence:calendar-intent-review",
    "evidence:profile-change-review",
  ],
  collectedAt: confirmationPolicyCollectedAt,
  privacy: "demo-confirmation-guard-only",
  generationMethod: "fixture",
};

export const confirmationPolicyEmptyGuardProvenance: ConfirmationGuardProvenance = {
  ...confirmationPolicyGuardProvenance,
  sourceLabel: "Mock empty confirmation guard rule",
  evidenceIds: ["evidence:no-sensitive-action-selected"],
  generationMethod: "rule-based-confirmation-guard",
};

export const confirmationPolicyPendingGuardProvenance: ConfirmationGuardProvenance = {
  ...confirmationPolicyGuardProvenance,
  sourceLabel: "Mock pending confirmation guard rule",
  evidenceIds: ["evidence:message-draft-review"],
  generationMethod: "rule-based-confirmation-guard",
};

export const confirmationPolicyFailureGuardProvenance: ConfirmationGuardProvenance = {
  ...confirmationPolicyGuardProvenance,
  sourceLabel: "Mock confirmation guard controlled failure rule",
  evidenceIds: ["evidence:confirmation-controlled-failure"],
  generationMethod: "rule-based-confirmation-guard",
};

const messageEvidence: ConfirmationEvidence = {
  evidenceId: "evidence:message-draft-review",
  sourceLabel: "Follow-up draft review",
  excerpt:
    "Draft message references the SaaS Summit conversation and waits for explicit approval.",
  collectedAt: confirmationPolicyCollectedAt,
};

const contactEvidence: ConfirmationEvidence = {
  evidenceId: "evidence:card-import-review",
  sourceLabel: "Business-card import review",
  excerpt:
    "New contact fields are staged from a sourced card import before any contact write.",
  collectedAt: confirmationPolicyCollectedAt,
};

const calendarEvidence: ConfirmationEvidence = {
  evidenceId: "evidence:calendar-intent-review",
  sourceLabel: "Calendar intent review",
  excerpt:
    "Meeting creation is represented as a confirmation request until the operator approves it.",
  collectedAt: confirmationPolicyCollectedAt,
};

const profileEvidence: ConfirmationEvidence = {
  evidenceId: "evidence:profile-change-review",
  sourceLabel: "Profile update review",
  excerpt:
    "Profile field changes remain staged until an explicit confirmation resolves them.",
  collectedAt: confirmationPolicyCollectedAt,
};

export const confirmationPolicyRequirements: readonly ConfirmationRequirement[] = [
  {
    id: "demo-confirmation-1",
    status: "pending_confirmation",
    action: {
      kind: "send-message",
      label: "Send message",
      summary: "Send the drafted follow-up to Emi Tanaka after SaaS Summit.",
      requestedBy: "Orbit operator",
      targetLabel: "Emi Tanaka",
      payloadPreview:
        "Great meeting you at SaaS Summit. I can introduce you to the API partnerships team next week.",
      replacesOutboundAction: true,
      externalActionExecuted: false,
      mockEffect: "No message is sent.",
    },
    confirmationQuestion: "Approve sending this follow-up message?",
    riskLabel: "Outbound communication",
    guardReason:
      "Relationship messages must be explicitly confirmed before delivery.",
    createdAt: confirmationPolicyCreatedAt,
    evidence: [messageEvidence],
    provenance: confirmationPolicyGuardProvenance,
  },
  {
    id: "demo-confirmation-2",
    status: "pending_confirmation",
    action: {
      kind: "add-contact",
      label: "Add contact",
      summary: "Add Mateo Rivera from the Fintech Forum badge import.",
      requestedBy: "Orbit operator",
      targetLabel: "Mateo Rivera",
      payloadPreview:
        "Mateo Rivera, Partnerships Lead, ArcPay. Source: Fintech Forum badge.",
      replacesOutboundAction: true,
      externalActionExecuted: false,
      mockEffect: "No contact is written.",
    },
    confirmationQuestion: "Approve adding this contact record?",
    riskLabel: "Irreversible relationship write",
    guardReason:
      "New contacts need confirmation because they change the relationship graph.",
    createdAt: confirmationPolicyCreatedAt,
    evidence: [contactEvidence],
    provenance: confirmationPolicyGuardProvenance,
  },
  {
    id: "demo-confirmation-3",
    status: "pending_confirmation",
    action: {
      kind: "create-calendar-event",
      label: "Create calendar event",
      summary: "Create a 30 minute investor intro hold with Priya Shah.",
      requestedBy: "Orbit operator",
      targetLabel: "Priya Shah",
      payloadPreview:
        "Investor intro hold, Tuesday 10:30, context: requested warm intro.",
      replacesOutboundAction: true,
      externalActionExecuted: false,
      mockEffect: "No calendar event is created.",
    },
    confirmationQuestion: "Approve creating this calendar event?",
    riskLabel: "Calendar mutation",
    guardReason:
      "Calendar writes must stay behind an explicit confirmation boundary.",
    createdAt: confirmationPolicyCreatedAt,
    evidence: [calendarEvidence],
    provenance: confirmationPolicyGuardProvenance,
  },
  {
    id: "demo-confirmation-4",
    status: "pending_confirmation",
    action: {
      kind: "update-profile",
      label: "Update profile",
      summary: "Add Tokyo fintech expansion focus to the relationship profile.",
      requestedBy: "Orbit operator",
      targetLabel: "Orbit profile",
      payloadPreview: "relationshipGoal: Tokyo fintech expansion",
      replacesOutboundAction: true,
      externalActionExecuted: false,
      mockEffect: "No profile field is saved.",
    },
    confirmationQuestion: "Approve saving this profile update?",
    riskLabel: "Profile mutation",
    guardReason:
      "Profile updates need confirmation before changing stored relationship context.",
    createdAt: confirmationPolicyCreatedAt,
    evidence: [profileEvidence],
    provenance: confirmationPolicyGuardProvenance,
  },
];

export const confirmationPolicyGuardFixture: ConfirmationRequirementPayload = {
  state: "success",
  requirements: confirmationPolicyRequirements,
  summary:
    "Four sensitive relationship actions are staged behind deterministic confirmation requirements.",
  provenance: confirmationPolicyGuardProvenance,
  nextAction:
    "Approve or reject each action inside the mock guard before any live implementation can run.",
};

export const confirmationPolicyEmptyGuardFixture: ConfirmationRequirementPayload = {
  state: "empty",
  requirements: [],
  summary: "No sensitive action is waiting for confirmation.",
  provenance: confirmationPolicyEmptyGuardProvenance,
  nextAction:
    "Wait until a sensitive relationship action creates a sourced confirmation request.",
};

export const confirmationPolicyPendingGuardFixture: ConfirmationRequirementPayload = {
  state: "pending",
  requirements: [confirmationPolicyRequirements[0]],
  summary: "One outbound message is waiting for explicit confirmation.",
  provenance: confirmationPolicyPendingGuardProvenance,
  nextAction:
    "Review the message draft before approving or rejecting the action.",
};
