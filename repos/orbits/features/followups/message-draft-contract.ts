import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import type { SourceReferenceDTO } from "../../shared/domain/source-types";
import { AppError, type AppErrorCode } from "../../shared/errors/app-error";

export const MESSAGE_DRAFT_GENERATOR_FIXTURE_SOURCE =
  "fixture:features/followups/message-draft-contract.ts" as const;

export const MESSAGE_DRAFT_GENERATOR_DRAFT_KINDS = [
  "greeting",
  "follow_up",
  "appointment",
  "introduction_request",
  "invitation",
  "thank_you",
] as const;

export const MESSAGE_DRAFT_GENERATOR_ERROR_CODES = [
  "MESSAGE_DRAFT_GENERATOR_DRAFT_ID_REQUIRED",
  "MESSAGE_DRAFT_GENERATOR_DRAFT_NOT_FOUND",
  "MESSAGE_DRAFT_GENERATOR_EMPTY",
  "MESSAGE_DRAFT_GENERATOR_PENDING",
  "MESSAGE_DRAFT_GENERATOR_MOCK_FAILED",
] as const;

export type MessageDraftKind =
  (typeof MESSAGE_DRAFT_GENERATOR_DRAFT_KINDS)[number];

export type MessageDraftGeneratorErrorCode =
  (typeof MESSAGE_DRAFT_GENERATOR_ERROR_CODES)[number];

export type MessageDraftGeneratorScenario =
  | "success"
  | "empty"
  | "pending"
  | "failure";

export type MessageDraftGeneratorState = "success" | "empty" | "pending";

export type MessageDraftStatus =
  | "draft"
  | "held_for_review"
  | "ready_for_confirmation"
  | "revised";

export type MessageDraftChannel =
  | "email"
  | "linkedin"
  | "calendar_note"
  | "internal_note";

export interface MessageDraftGeneratorCreateInput {
  scenario?: MessageDraftGeneratorScenario | string | null;
  draftKind?: MessageDraftKind | string | null;
  recipientName?: string | null;
  organization?: string | null;
  contextNote?: string | null;
  channel?: MessageDraftChannel | string | null;
}

export interface MessageDraftGeneratorUpdateInput {
  draftId?: string | null;
  scenario?: MessageDraftGeneratorScenario | string | null;
  status?: MessageDraftStatus | string | null;
  userEdits?: string | null;
  reviewerLabel?: string | null;
}

export interface MessageDraftGeneratorService {
  createDraft: (
    input?: MessageDraftGeneratorCreateInput,
  ) => MessageDraftGeneratorResult;
  updateDraft: (
    input: MessageDraftGeneratorUpdateInput,
  ) => MessageDraftGeneratorResult;
}

export interface MessageDraftGeneratorErrorDefinition {
  code: MessageDraftGeneratorErrorCode;
  appCode: AppErrorCode;
  message: string;
  recovery: string;
}

export const MESSAGE_DRAFT_GENERATOR_ERROR_DEFINITIONS = {
  MESSAGE_DRAFT_GENERATOR_DRAFT_ID_REQUIRED: {
    code: "MESSAGE_DRAFT_GENERATOR_DRAFT_ID_REQUIRED",
    appCode: "VALIDATION_ERROR",
    message: "A message draft id is required before updating a draft fixture.",
    recovery:
      "Keep draft update controls disabled until a known local draft fixture is selected.",
  },
  MESSAGE_DRAFT_GENERATOR_DRAFT_NOT_FOUND: {
    code: "MESSAGE_DRAFT_GENERATOR_DRAFT_NOT_FOUND",
    appCode: "NOT_FOUND",
    message: "No mock message draft fixture matches that draft id.",
    recovery:
      "Render the missing-draft envelope and avoid querying AI writing providers, external send channels, email, calendar, notification, network, device, or database services.",
  },
  MESSAGE_DRAFT_GENERATOR_EMPTY: {
    code: "MESSAGE_DRAFT_GENERATOR_EMPTY",
    appCode: "CONFLICT",
    message:
      "No mock message draft can be generated because no source-backed relationship context is available.",
    recovery:
      "Add relationship context, contact evidence, or source notes before generating a message draft.",
  },
  MESSAGE_DRAFT_GENERATOR_PENDING: {
    code: "MESSAGE_DRAFT_GENERATOR_PENDING",
    appCode: "CONFLICT",
    message:
      "The mock message draft generator is waiting for a local confirmation guard.",
    recovery:
      "Render the pending state and do not call AI writing providers, external send channels, email, calendar, notification, network, device, or database services.",
  },
  MESSAGE_DRAFT_GENERATOR_MOCK_FAILED: {
    code: "MESSAGE_DRAFT_GENERATOR_MOCK_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "The mock message draft generator boundary is pinned to a controlled failure scenario.",
    recovery:
      "Render the controlled failure state and do not retry live AI writing providers, external send channels, email, calendar, notification, network, device, or database services.",
  },
} as const satisfies Record<
  MessageDraftGeneratorErrorCode,
  MessageDraftGeneratorErrorDefinition
>;

export type MessageDraftGeneratorSourceReference = SourceReferenceDTO & {
  type:
    | "manual"
    | "event_import"
    | "email_signal"
    | "calendar_signal"
    | "referral"
    | "chat_summary"
    | "system";
  label: string;
  providerRecordId: string;
  generatedBy: "mock-message-draft-rules";
};

export interface MessageDraftAudit {
  sourceLabel: string;
  providerBoundary: "AI false, external send false, persistence false";
  verificationAction: "Review source evidence";
}

export interface MessageDraft {
  draftId: string;
  kind: MessageDraftKind;
  channel: MessageDraftChannel;
  status: MessageDraftStatus;
  recipientName: string;
  organization: string;
  subject: string;
  body: string;
  relationshipContext: string;
  recommendedSendWindow: string;
  rationale: string;
  source: MessageDraftGeneratorSourceReference;
  evidenceIds: readonly string[];
  generatedBy: "mock-message-draft-rules";
  audit: MessageDraftAudit;
  sendActionRequiresConfirmation: true;
  aiProviderRequested: false;
  externalSendRequested: false;
  externalNetworkRequested: false;
  emailProviderRequested: false;
  calendarProviderRequested: false;
  notificationDelivered: false;
  deviceRequested: false;
  liveDatabaseReadExecuted: false;
  liveDatabaseWriteExecuted: false;
  productionAuditLogWriteExecuted: false;
}

export interface MessageDraftGeneratorProvenance {
  source: typeof MESSAGE_DRAFT_GENERATOR_FIXTURE_SOURCE;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy: "demo-message-draft-generator-only";
  generationMethod:
    | "fixture"
    | "rule-based-draft-generation"
    | "rule-based-update"
    | "rule-based-state";
  aiProviderRequested: false;
  externalSendRequested: false;
  externalNetworkRequested: false;
  emailProviderRequested: false;
  calendarProviderRequested: false;
  notificationDelivered: false;
  deviceRequested: false;
  liveDatabaseReadExecuted: false;
  liveDatabaseWriteExecuted: false;
  productionAuditLogWriteExecuted: false;
}

export interface MessageDraftGeneratorPayload {
  state: MessageDraftGeneratorState;
  drafts: readonly MessageDraft[];
  summary: string;
  provenance: MessageDraftGeneratorProvenance;
  nextAction: string;
}

export interface MessageDraftGeneratorSuccess {
  success: true;
  data: MessageDraftGeneratorPayload;
}

export interface MessageDraftGeneratorFailure {
  success: false;
  error: MessageDraftGeneratorErrorDefinition & {
    state: "failure";
    provenance: MessageDraftGeneratorProvenance;
    evidenceIds: readonly string[];
  };
}

export type MessageDraftGeneratorResult =
  | MessageDraftGeneratorSuccess
  | MessageDraftGeneratorFailure;

const fixtureCollectedAt = "2026-06-25T23:40:00.000Z";

function source(input: {
  type: MessageDraftGeneratorSourceReference["type"];
  id: string;
  label: string;
  providerRecordId: string;
}): MessageDraftGeneratorSourceReference {
  return {
    ...input,
    generatedBy: "mock-message-draft-rules",
  };
}

const climateBreakfastNote = source({
  type: "manual",
  id: "source:message-draft:climate-breakfast-note",
  label: "Tokyo climate operator breakfast note",
  providerRecordId: "note:tokyo-climate-breakfast:maya",
});

const hallwayCaseStudyNote = source({
  type: "manual",
  id: "source:message-draft:hallway-case-study-note",
  label: "Hallway case study request note",
  providerRecordId: "encounter:diego:case-study-request",
});

const partnerIntroSignal = source({
  type: "referral",
  id: "source:message-draft:partner-intro-signal",
  label: "Partner referral fit note",
  providerRecordId: "referral:amina:helio-works",
});

const eventRosterContext = source({
  type: "event_import",
  id: "source:message-draft:event-roster-context",
  label: "Founder dinner attendee roster",
  providerRecordId: "event:founder-dinner:attendee:kenji",
});

const postEventThanksNote = source({
  type: "chat_summary",
  id: "source:message-draft:post-event-thanks",
  label: "Post-event conversation summary",
  providerRecordId: "chat-summary:sofia:operator-roundtable",
});

function draft(input: {
  draftId: string;
  kind: MessageDraftKind;
  channel: MessageDraftChannel;
  status?: MessageDraftStatus;
  recipientName: string;
  organization: string;
  subject: string;
  body: string;
  relationshipContext: string;
  recommendedSendWindow: string;
  rationale: string;
  source: MessageDraftGeneratorSourceReference;
  evidenceIds: readonly string[];
}): MessageDraft {
  return {
    ...input,
    status: input.status ?? "draft",
    generatedBy: "mock-message-draft-rules",
    audit: {
      sourceLabel: input.source.label,
      providerBoundary: "AI false, external send false, persistence false",
      verificationAction: "Review source evidence",
    },
    sendActionRequiresConfirmation: true,
    aiProviderRequested: false,
    externalSendRequested: false,
    externalNetworkRequested: false,
    emailProviderRequested: false,
    calendarProviderRequested: false,
    notificationDelivered: false,
    deviceRequested: false,
    liveDatabaseReadExecuted: false,
    liveDatabaseWriteExecuted: false,
    productionAuditLogWriteExecuted: false,
  };
}

export const mockMessageDrafts: readonly MessageDraft[] = [
  draft({
    draftId: "demo-draft-1",
    kind: "greeting",
    channel: "email",
    recipientName: "Maya Chen",
    organization: "Kumo Grid",
    subject: "Good meeting you at the climate operator breakfast",
    body:
      "Hi Maya, it was good meeting you at the Tokyo climate operator breakfast. I appreciated the way you framed grid storage pilots around operator readiness, and I would like to keep the conversation anchored in that context.",
    relationshipContext:
      "First-touch greeting grounded in the event note and shared grid storage interest.",
    recommendedSendWindow: "same day",
    rationale:
      "Fresh event context makes a concise greeting more useful than a generic cold note.",
    source: climateBreakfastNote,
    evidenceIds: [
      "evidence:message-draft:greeting",
      "evidence:message-draft:climate-breakfast",
    ],
  }),
  draft({
    draftId: "demo-draft-2",
    kind: "follow_up",
    channel: "email",
    recipientName: "Maya Chen",
    organization: "Kumo Grid",
    subject: "Following up on pilot timing",
    body:
      "Hi Maya, following up on your point about pilot timing from the breakfast. If useful, I can send a short comparison of deployment windows and the operator questions that usually decide whether a pilot is ready.",
    relationshipContext:
      "Follow-up message tied to a specific pilot-timing question from the event.",
    recommendedSendWindow: "within 24 hours",
    rationale:
      "The draft preserves the event context and names the requested business topic.",
    source: climateBreakfastNote,
    evidenceIds: [
      "evidence:message-draft:follow-up",
      "evidence:message-draft:pilot-timing",
    ],
  }),
  draft({
    draftId: "demo-draft-3",
    kind: "appointment",
    channel: "calendar_note",
    recipientName: "Diego Rivera",
    organization: "Northstar Fleet",
    subject: "Finding time for the procurement case study",
    body:
      "Hi Diego, I noted your request for the procurement case study after our hallway conversation. Would Tuesday or Wednesday afternoon work for a short review of the material and the fleet rollout assumptions?",
    relationshipContext:
      "Appointment draft created from a source note with a requested case study.",
    recommendedSendWindow: "next business day",
    rationale:
      "The appointment ask is specific because the source note names the requested asset.",
    source: hallwayCaseStudyNote,
    evidenceIds: [
      "evidence:message-draft:appointment",
      "evidence:message-draft:case-study-request",
    ],
  }),
  draft({
    draftId: "demo-draft-4",
    kind: "introduction_request",
    channel: "email",
    recipientName: "Amina Okafor",
    organization: "Helio Works",
    subject: "Could you introduce me to your grid partnerships lead?",
    body:
      "Hi Amina, based on our partner-fit conversation, would you be open to introducing me to the person who leads grid partnerships at Helio Works? I can keep the ask tight and include the climate operator context.",
    relationshipContext:
      "Introduction request tied to a referral-fit signal and prior partner discussion.",
    recommendedSendWindow: "this week",
    rationale:
      "The request names the relationship path instead of treating the contact as a generic lead.",
    source: partnerIntroSignal,
    evidenceIds: [
      "evidence:message-draft:introduction-request",
      "evidence:message-draft:partner-fit",
    ],
  }),
  draft({
    draftId: "demo-draft-5",
    kind: "invitation",
    channel: "linkedin",
    recipientName: "Kenji Sato",
    organization: "Mori Ventures",
    subject: "Invitation to the operator dinner",
    body:
      "Kenji, we are keeping the next operator dinner small and focused on climate infrastructure partnerships. Your work with Mori Ventures would add useful investor context if you are open to joining.",
    relationshipContext:
      "Invitation draft based on event roster fit and community context.",
    recommendedSendWindow: "three days before RSVP close",
    rationale:
      "The invitation explains why this person belongs in the room.",
    source: eventRosterContext,
    evidenceIds: [
      "evidence:message-draft:invitation",
      "evidence:message-draft:operator-dinner-roster",
    ],
  }),
  draft({
    draftId: "demo-draft-6",
    kind: "thank_you",
    channel: "email",
    recipientName: "Sofia Marin",
    organization: "Harbor Labs",
    subject: "Thank you for the operator roundtable notes",
    body:
      "Hi Sofia, thank you for sharing your operator roundtable notes. The point about evidence quality in partner follow-up was especially useful, and I will keep that attached to the next relationship review.",
    relationshipContext:
      "Thank-you note grounded in a summarized conversation and provided notes.",
    recommendedSendWindow: "same day",
    rationale:
      "The message acknowledges the concrete contribution instead of sending a generic thanks.",
    source: postEventThanksNote,
    evidenceIds: [
      "evidence:message-draft:thank-you",
      "evidence:message-draft:operator-roundtable-notes",
    ],
  }),
];

export const mockMessageDraftGeneratorProvenance: MessageDraftGeneratorProvenance =
  {
    source: MESSAGE_DRAFT_GENERATOR_FIXTURE_SOURCE,
    sourceLabel: "Mock message draft generator fixture",
    evidenceIds: mockMessageDrafts.flatMap((draftItem) => draftItem.evidenceIds),
    collectedAt: fixtureCollectedAt,
    privacy: "demo-message-draft-generator-only",
    generationMethod: "fixture",
    aiProviderRequested: false,
    externalSendRequested: false,
    externalNetworkRequested: false,
    emailProviderRequested: false,
    calendarProviderRequested: false,
    notificationDelivered: false,
    deviceRequested: false,
    liveDatabaseReadExecuted: false,
    liveDatabaseWriteExecuted: false,
    productionAuditLogWriteExecuted: false,
  };

export const mockEmptyMessageDraftGeneratorProvenance: MessageDraftGeneratorProvenance =
  {
    ...mockMessageDraftGeneratorProvenance,
    sourceLabel: "Mock empty message draft generator rule",
    evidenceIds: ["evidence:message-draft-empty"],
    generationMethod: "rule-based-state",
  };

export const mockPendingMessageDraftGeneratorProvenance: MessageDraftGeneratorProvenance =
  {
    ...mockMessageDraftGeneratorProvenance,
    sourceLabel: "Mock pending message draft generator guard",
    evidenceIds: ["evidence:message-draft-pending"],
    generationMethod: "rule-based-state",
  };

export const mockMessageDraftGeneratorFailureProvenance: MessageDraftGeneratorProvenance =
  {
    ...mockMessageDraftGeneratorProvenance,
    sourceLabel: "Mock message draft generator controlled failure",
    evidenceIds: ["evidence:message-draft-controlled-failure"],
    generationMethod: "rule-based-state",
  };

export const mockMessageDraftGeneratorFixture: MessageDraftGeneratorPayload = {
  state: "success",
  drafts: mockMessageDrafts,
  summary:
    "Local rules prepared greeting, follow-up, appointment, introduction request, invitation, and thank-you drafts from relationship evidence.",
  provenance: mockMessageDraftGeneratorProvenance,
  nextAction:
    "Review source evidence and confirmation requirements before any external send action.",
};

export const mockEmptyMessageDraftGeneratorFixture: MessageDraftGeneratorPayload =
  {
    state: "empty",
    drafts: [],
    summary:
      "No source-backed relationship context is available for message drafting.",
    provenance: mockEmptyMessageDraftGeneratorProvenance,
    nextAction:
      "Add relationship context, contact evidence, or a source note before generating a message draft.",
  };

export const mockPendingMessageDraftGeneratorFixture: MessageDraftGeneratorPayload =
  {
    state: "pending",
    drafts: [],
    summary:
      "Message draft generation is waiting for a local confirmation guard before exposing draft copy.",
    provenance: mockPendingMessageDraftGeneratorProvenance,
    nextAction:
      "Resolve the local confirmation guard before reviewing generated message drafts.",
  };

export function messageDraftGeneratorFailureToAppError(
  failure: MessageDraftGeneratorFailure,
): AppError {
  return new AppError(failure.error.appCode, failure.error.message);
}

export function messageDraftGeneratorFailureContext(
  failure: MessageDraftGeneratorFailure,
  mode: FeatureMode,
): ApiErrorContext {
  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    messageDraftGeneratorErrorCode: failure.error.code,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance:
      "Mock message draft generator failure came from deterministic fixture rules.",
    service: "message-draft-generator-mock",
  };
}
