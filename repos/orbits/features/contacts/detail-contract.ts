import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import type { SourceReferenceDTO, SourceType } from "../../shared/domain/source-types";
import type { AppErrorCode } from "../../shared/errors/app-error";
import { AppError } from "../../shared/errors/app-error";
import type { ContactStatusFilter, ContactTagFilter } from "./contract";

export const CONTACT_DETAIL_TAG_STATUS_FIXTURE_SOURCE =
  "fixture:features/contacts/detail-contract.ts" as const;

export const CONTACT_DETAIL_TAG_OPTIONS = [
  "event:climate-founders-dinner",
  "topic:storage-pilots",
  "priority:warm-follow-up",
  "source:external-import",
  "topic:community",
  "topic:venture-ecosystem",
  "priority:nurture",
  "source:event-import",
] as const satisfies readonly ContactTagFilter[];

export type ContactDetailTagOption =
  (typeof CONTACT_DETAIL_TAG_OPTIONS)[number];

export const CONTACT_DETAIL_STATUS_OPTIONS = [
  "active",
  "needs_follow_up",
  "nurture",
  "archived",
] as const satisfies readonly ContactStatusFilter[];

export type ContactDetailStatusOption =
  (typeof CONTACT_DETAIL_STATUS_OPTIONS)[number];

export const CONTACT_DETAIL_TAG_STATUS_ERROR_CODES = [
  "CONTACT_DETAIL_NOT_FOUND",
  "CONTACT_DETAIL_INVALID_PATCH_BODY",
  "CONTACT_DETAIL_TAG_NOT_SUPPORTED",
  "CONTACT_DETAIL_STATUS_NOT_SUPPORTED",
  "CONTACT_DETAIL_UPDATE_PENDING",
  "CONTACT_DETAIL_TAG_STATUS_MOCK_FAILED",
] as const;

export type ContactDetailTagStatusErrorCode =
  (typeof CONTACT_DETAIL_TAG_STATUS_ERROR_CODES)[number];

export type ContactDetailTagStatusScenario =
  | "success"
  | "empty"
  | "pending"
  | "failure";

export type ContactDetailTagStatusState = "success" | "empty" | "pending";

export interface ContactDetailTagStatusErrorDefinition {
  code: ContactDetailTagStatusErrorCode;
  appCode: AppErrorCode;
  message: string;
  recovery: string;
}

export const CONTACT_DETAIL_TAG_STATUS_ERROR_DEFINITIONS = {
  CONTACT_DETAIL_NOT_FOUND: {
    code: "CONTACT_DETAIL_NOT_FOUND",
    appCode: "NOT_FOUND",
    message: "That mock contact detail is not available in this sprint boundary.",
    recovery:
      "Use demo-contact-1 or select an explicit empty-state scenario for the contact detail panel.",
  },
  CONTACT_DETAIL_INVALID_PATCH_BODY: {
    code: "CONTACT_DETAIL_INVALID_PATCH_BODY",
    appCode: "VALIDATION_ERROR",
    message: "The mock contact detail update request body must be valid JSON.",
    recovery:
      "Send a JSON object with supported tags, status, note, or last interaction fields before previewing a mock update.",
  },
  CONTACT_DETAIL_TAG_NOT_SUPPORTED: {
    code: "CONTACT_DETAIL_TAG_NOT_SUPPORTED",
    appCode: "VALIDATION_ERROR",
    message: "That mock contact tag is not supported by this sprint boundary.",
    recovery:
      "Use one of the local contact detail tag options declared in the detail contract.",
  },
  CONTACT_DETAIL_STATUS_NOT_SUPPORTED: {
    code: "CONTACT_DETAIL_STATUS_NOT_SUPPORTED",
    appCode: "VALIDATION_ERROR",
    message: "That mock contact status is not supported by this sprint boundary.",
    recovery:
      "Use active, needs_follow_up, nurture, or archived for the mock contact detail status.",
  },
  CONTACT_DETAIL_UPDATE_PENDING: {
    code: "CONTACT_DETAIL_UPDATE_PENDING",
    appCode: "CONFLICT",
    message:
      "The mock contact detail tag and status update is waiting for fixture review.",
    recovery:
      "Render the pending state and avoid live contact persistence or production audit writes.",
  },
  CONTACT_DETAIL_TAG_STATUS_MOCK_FAILED: {
    code: "CONTACT_DETAIL_TAG_STATUS_MOCK_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "The mock contact detail tag and status boundary is pinned to a controlled failure scenario.",
    recovery:
      "Render the controlled failure state and do not retry a contact store, production audit log, provider, AI, calendar, email, notification, or device call.",
  },
} as const satisfies Record<
  ContactDetailTagStatusErrorCode,
  ContactDetailTagStatusErrorDefinition
>;

export type ContactDetailSourceType = Extract<
  SourceType,
  "manual" | "event_import" | "email_signal" | "calendar_signal" | "referral"
>;

export interface ContactDetailSourceReference extends SourceReferenceDTO {
  type: ContactDetailSourceType;
  label: string;
  evidenceId: string;
}

export type ContactDetailEvidenceField =
  | "relationship_context"
  | "status"
  | "tag"
  | "note"
  | "last_interaction";

export interface ContactDetailEvidence {
  evidenceId: string;
  source: ContactDetailSourceReference;
  field: ContactDetailEvidenceField;
  excerpt: string;
  capturedAt: string;
  createdBy: "mock-contact-detail-tag-status-service";
}

export type ContactDetailLastInteractionChannel =
  | "event_note"
  | "manual_note"
  | "email_signal"
  | "calendar_signal"
  | "referral";

export interface ContactDetailLastInteractionMetadata {
  interactionId: string;
  channel: ContactDetailLastInteractionChannel;
  occurredAt: string;
  summary: string;
  source: ContactDetailSourceReference;
  evidenceIds: readonly string[];
  calendarProviderRequested: false;
  emailProviderRequested: false;
  notificationDelivered: false;
  externalNetworkRequested: false;
  productionAuditLogWriteExecuted: false;
}

export interface ContactDetailNote {
  noteId: string;
  body: string;
  authorLabel: string;
  createdAt: string;
  source: ContactDetailSourceReference;
  evidenceIds: readonly string[];
  noteWriteExecuted: false;
  productionAuditLogWriteExecuted: false;
}

export interface ContactDetail {
  id: string;
  displayName: string;
  role: string;
  organization: string;
  location: string;
  relationshipContext: string;
  source: ContactDetailSourceReference;
  evidence: readonly ContactDetailEvidence[];
  tags: readonly ContactDetailTagOption[];
  status: ContactDetailStatusOption;
  notes: readonly ContactDetailNote[];
  lastInteraction: ContactDetailLastInteractionMetadata;
  nextAction: string;
  updatedAt: string;
  tagWriteExecuted: false;
  statusWriteExecuted: false;
  noteWriteExecuted: false;
  productionAuditLogWriteExecuted: false;
  databaseReadExecuted: false;
  databaseWriteExecuted: false;
  externalNetworkRequested: false;
  deviceRequested: false;
  aiProviderRequested: false;
  calendarProviderRequested: false;
  emailProviderRequested: false;
  notificationDelivered: false;
}

export interface ContactDetailTagStatusProvenance {
  source: string;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy: "demo-contact-detail-tag-status-only";
  generationMethod: "fixture" | "rule-based-contact-detail-tag-status";
  databaseReadExecuted: false;
  databaseWriteExecuted: false;
  productionAuditLogWriteExecuted: false;
  externalNetworkRequested: false;
  deviceRequested: false;
  aiProviderRequested: false;
  calendarProviderRequested: false;
  emailProviderRequested: false;
  notificationDelivered: false;
}

export interface ContactDetailTagStatusPayload {
  state: ContactDetailTagStatusState;
  contact: ContactDetail | null;
  editableTagOptions: readonly ContactDetailTagOption[];
  editableStatusOptions: readonly ContactDetailStatusOption[];
  summary: string;
  provenance: ContactDetailTagStatusProvenance;
  nextAction: string;
  updateSummary?: string;
}

export interface ContactDetailLookupInput {
  contactId: string;
  scenario?: ContactDetailTagStatusScenario | string | null;
}

export interface ContactDetailNoteInput {
  body: string;
  authorLabel?: string | null;
}

export interface ContactDetailLastInteractionInput {
  channel?: ContactDetailLastInteractionChannel | string | null;
  occurredAt?: string | null;
  summary?: string | null;
}

export interface ContactDetailUpdateInput extends ContactDetailLookupInput {
  tags?: readonly (ContactDetailTagOption | string)[] | null;
  addTags?: readonly (ContactDetailTagOption | string)[] | null;
  removeTags?: readonly (ContactDetailTagOption | string)[] | null;
  status?: ContactDetailStatusOption | string | null;
  note?: ContactDetailNoteInput | string | null;
  lastInteraction?: ContactDetailLastInteractionInput | null;
}

export interface ContactDetailTagStatusSuccess {
  success: true;
  data: ContactDetailTagStatusPayload;
}

export interface ContactDetailTagStatusFailure {
  success: false;
  error: ContactDetailTagStatusErrorDefinition & {
    state: "failure";
    provenance: ContactDetailTagStatusProvenance;
    evidenceIds: readonly string[];
  };
}

export type ContactDetailTagStatusResult =
  | ContactDetailTagStatusSuccess
  | ContactDetailTagStatusFailure;

export type ContactDetailTagStatusFailureForCode<
  TCode extends ContactDetailTagStatusErrorCode,
> = Omit<ContactDetailTagStatusFailure, "error"> & {
  error: ContactDetailTagStatusFailure["error"] & {
    code: TCode;
  };
};

export type ContactDetailTagStatusInvalidPatchBodyError =
  ContactDetailTagStatusFailureForCode<"CONTACT_DETAIL_INVALID_PATCH_BODY">;

export type ContactDetailTagStatusUpdatePendingError =
  ContactDetailTagStatusFailureForCode<"CONTACT_DETAIL_UPDATE_PENDING">;

export interface ContactDetailTagStatusService {
  getContactDetail: (
    input: ContactDetailLookupInput,
  ) => ContactDetailTagStatusResult;
  updateContactDetail: (
    input: ContactDetailUpdateInput,
  ) => ContactDetailTagStatusResult;
  invalidPatchBody: () => ContactDetailTagStatusInvalidPatchBodyError;
}

const fixtureCollectedAt = "2026-06-25T17:30:00.000Z";
const fixtureCapturedAt = "2026-06-25T17:35:00.000Z";

export const mockContactDetailSource: ContactDetailSourceReference = {
  type: "manual",
  id: "source:contact-detail:kenji-manual-note",
  label: "Manual note",
  evidenceId: "evidence:contact-detail-intro-request",
};

export const mockContactDetailEvidence: readonly ContactDetailEvidence[] = [
  {
    evidenceId: "evidence:contact-detail-intro-request",
    source: mockContactDetailSource,
    field: "relationship_context",
    excerpt:
      "Manual note says Kenji asked for a storage pilot operator intro after the climate founders dinner.",
    capturedAt: fixtureCapturedAt,
    createdBy: "mock-contact-detail-tag-status-service",
  },
  {
    evidenceId: "evidence:contact-detail-status",
    source: mockContactDetailSource,
    field: "status",
    excerpt:
      "Status is needs_follow_up because the operator introduction has not been sent yet.",
    capturedAt: fixtureCapturedAt,
    createdBy: "mock-contact-detail-tag-status-service",
  },
  {
    evidenceId: "evidence:contact-detail-note",
    source: mockContactDetailSource,
    field: "note",
    excerpt:
      "Follow-up note keeps the source context beside the contact detail before any live write exists.",
    capturedAt: fixtureCapturedAt,
    createdBy: "mock-contact-detail-tag-status-service",
  },
];

export const mockContactDetailNotes: readonly ContactDetailNote[] = [
  {
    noteId: "note:demo-contact-1-intro-context",
    body: "Kenji asked for a storage pilot operator intro after the climate founders dinner.",
    authorLabel: "Orbit operator",
    createdAt: "2026-06-18T20:40:00.000Z",
    source: mockContactDetailSource,
    evidenceIds: ["evidence:contact-detail-intro-request"],
    noteWriteExecuted: false,
    productionAuditLogWriteExecuted: false,
  },
  {
    noteId: "note:demo-contact-1-follow-up",
    body: "Keep the follow-up warm and send the operator intro before Friday.",
    authorLabel: "Orbit operator",
    createdAt: "2026-06-19T09:10:00.000Z",
    source: mockContactDetailSource,
    evidenceIds: ["evidence:contact-detail-note"],
    noteWriteExecuted: false,
    productionAuditLogWriteExecuted: false,
  },
];

export const mockContactDetailLastInteraction: ContactDetailLastInteractionMetadata =
  {
    interactionId: "interaction:demo-contact-1-climate-dinner",
    channel: "event_note",
    occurredAt: "2026-06-18T20:30:00.000Z",
    summary:
      "Kenji asked for an operator introduction after the climate founders dinner.",
    source: mockContactDetailSource,
    evidenceIds: ["evidence:contact-detail-intro-request"],
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationDelivered: false,
    externalNetworkRequested: false,
    productionAuditLogWriteExecuted: false,
  };

export const mockContactDetail: ContactDetail = {
  id: "demo-contact-1",
  displayName: "Kenji Watanabe",
  role: "Founder",
  organization: "Aster Grid",
  location: "Tokyo",
  relationshipContext:
    "Met at the climate founders dinner and discussed storage pilot operators.",
  source: mockContactDetailSource,
  evidence: mockContactDetailEvidence,
  tags: [
    "event:climate-founders-dinner",
    "topic:storage-pilots",
    "priority:warm-follow-up",
  ],
  status: "needs_follow_up",
  notes: mockContactDetailNotes,
  lastInteraction: mockContactDetailLastInteraction,
  nextAction: "Send Kenji the storage pilot operator intro by Friday.",
  updatedAt: "2026-06-19T09:10:00.000Z",
  tagWriteExecuted: false,
  statusWriteExecuted: false,
  noteWriteExecuted: false,
  productionAuditLogWriteExecuted: false,
  databaseReadExecuted: false,
  databaseWriteExecuted: false,
  externalNetworkRequested: false,
  deviceRequested: false,
  aiProviderRequested: false,
  calendarProviderRequested: false,
  emailProviderRequested: false,
  notificationDelivered: false,
};

export const mockContactDetailProvenance: ContactDetailTagStatusProvenance = {
  source: CONTACT_DETAIL_TAG_STATUS_FIXTURE_SOURCE,
  sourceLabel: "Mock contact detail tag and status fixture",
  evidenceIds: [
    "evidence:contact-detail-intro-request",
    "evidence:contact-detail-status",
    "evidence:contact-detail-note",
  ],
  collectedAt: fixtureCollectedAt,
  privacy: "demo-contact-detail-tag-status-only",
  generationMethod: "fixture",
  databaseReadExecuted: false,
  databaseWriteExecuted: false,
  productionAuditLogWriteExecuted: false,
  externalNetworkRequested: false,
  deviceRequested: false,
  aiProviderRequested: false,
  calendarProviderRequested: false,
  emailProviderRequested: false,
  notificationDelivered: false,
};

export const mockUpdatedContactDetailNote: ContactDetailNote = {
  noteId: "note:demo-contact-1-api-patch",
  body: "Confirmed partner review context before changing status.",
  authorLabel: "Orbit operator",
  createdAt: "2026-06-25T18:45:00.000Z",
  source: mockContactDetailSource,
  evidenceIds: ["evidence:contact-detail-tag-status-update"],
  noteWriteExecuted: false,
  productionAuditLogWriteExecuted: false,
};

export const mockUpdatedContactDetailLastInteraction: ContactDetailLastInteractionMetadata =
  {
    interactionId: "interaction:demo-contact-1-api-patch",
    channel: "manual_note",
    occurredAt: "2026-06-25T18:45:00.000Z",
    summary: "Operator confirmed the venture ecosystem follow-up path.",
    source: mockContactDetailSource,
    evidenceIds: ["evidence:contact-detail-tag-status-update"],
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationDelivered: false,
    externalNetworkRequested: false,
    productionAuditLogWriteExecuted: false,
  };

export const mockUpdatedContactDetail: ContactDetail = {
  ...mockContactDetail,
  tags: [
    "topic:storage-pilots",
    "priority:warm-follow-up",
    "topic:venture-ecosystem",
  ],
  status: "active",
  notes: [...mockContactDetailNotes, mockUpdatedContactDetailNote],
  lastInteraction: mockUpdatedContactDetailLastInteraction,
  updatedAt: "2026-06-25T18:45:00.000Z",
};

export const mockUpdatedContactDetailProvenance: ContactDetailTagStatusProvenance =
  {
    ...mockContactDetailProvenance,
    sourceLabel: "Mock contact detail tag and status rule update",
    evidenceIds: [
      ...mockContactDetailProvenance.evidenceIds,
      "evidence:contact-detail-tag-status-update",
    ],
    generationMethod: "rule-based-contact-detail-tag-status",
  };

export const mockEmptyContactDetailProvenance: ContactDetailTagStatusProvenance =
  {
    ...mockContactDetailProvenance,
    sourceLabel: "Mock empty contact detail tag and status rule",
    evidenceIds: ["evidence:contact-detail-empty"],
    generationMethod: "rule-based-contact-detail-tag-status",
  };

export const mockPendingContactDetailProvenance: ContactDetailTagStatusProvenance =
  {
    ...mockContactDetailProvenance,
    sourceLabel: "Mock pending contact detail tag and status rule",
    evidenceIds: ["evidence:contact-detail-pending"],
    generationMethod: "rule-based-contact-detail-tag-status",
  };

export const mockContactDetailFailureProvenance: ContactDetailTagStatusProvenance =
  {
    ...mockContactDetailProvenance,
    sourceLabel: "Mock contact detail tag and status controlled failure rule",
    evidenceIds: ["evidence:contact-detail-controlled-failure"],
    generationMethod: "rule-based-contact-detail-tag-status",
  };

export const mockContactDetailFixture: ContactDetailTagStatusPayload = {
  state: "success",
  contact: mockContactDetail,
  editableTagOptions: CONTACT_DETAIL_TAG_OPTIONS,
  editableStatusOptions: CONTACT_DETAIL_STATUS_OPTIONS,
  summary:
    "Kenji Watanabe is ready for a source-backed detail review with tags, status, notes, and last interaction metadata.",
  provenance: mockContactDetailProvenance,
  nextAction: "Review the source-backed status before sending the operator intro.",
  updateSummary: "No mock update has been applied.",
};

export const mockUpdatedContactDetailFixture: ContactDetailTagStatusPayload = {
  state: "success",
  contact: mockUpdatedContactDetail,
  editableTagOptions: CONTACT_DETAIL_TAG_OPTIONS,
  editableStatusOptions: CONTACT_DETAIL_STATUS_OPTIONS,
  summary:
    "Kenji Watanabe has a mock status and tag update ready for review.",
  provenance: mockUpdatedContactDetailProvenance,
  nextAction: "Use the updated tags and active status to plan the next follow-up.",
  updateSummary:
    "Mock update changed Kenji Watanabe to active with 3 tags and 3 notes.",
};

export const mockEmptyContactDetailFixture: ContactDetailTagStatusPayload = {
  state: "empty",
  contact: null,
  editableTagOptions: CONTACT_DETAIL_TAG_OPTIONS,
  editableStatusOptions: CONTACT_DETAIL_STATUS_OPTIONS,
  summary: "No mock contact detail is selected for this local detail panel.",
  provenance: mockEmptyContactDetailProvenance,
  nextAction:
    "Select a different mock contact or keep the detail panel in its empty state.",
  updateSummary: "No tag, status, note, or last interaction update is staged.",
};

export const mockPendingContactDetailFixture: ContactDetailTagStatusPayload = {
  ...mockEmptyContactDetailFixture,
  state: "pending",
  summary:
    "Contact detail tag and status review is pending local fixture approval.",
  provenance: mockPendingContactDetailProvenance,
  nextAction: "Wait for mock contact detail fixture review before editing.",
};

export function contactDetailTagStatusFailureToAppError(
  failure: ContactDetailTagStatusFailure,
): AppError {
  return new AppError(failure.error.appCode, failure.error.message);
}

export function contactDetailTagStatusErrorContext(
  code: ContactDetailTagStatusErrorCode,
  mode: FeatureMode,
): ApiErrorContext {
  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    contactDetailTagStatusErrorCode: code,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance:
      "Mock contact detail tag and status failure came from deterministic fixture rules.",
    service: "contact-detail-tag-and-status-mock",
  };
}

export function contactDetailTagStatusFailureContext(
  failure: ContactDetailTagStatusFailure,
  mode: FeatureMode,
): ApiErrorContext {
  return contactDetailTagStatusErrorContext(failure.error.code, mode);
}
