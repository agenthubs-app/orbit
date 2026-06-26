import {
  CONTACT_DETAIL_STATUS_OPTIONS,
  CONTACT_DETAIL_TAG_OPTIONS,
  CONTACT_DETAIL_TAG_STATUS_ERROR_DEFINITIONS,
  mockContactDetail,
  mockContactDetailFailureProvenance,
  mockContactDetailFixture,
  mockContactDetailSource,
  mockEmptyContactDetailFixture,
  mockPendingContactDetailFixture,
  mockUpdatedContactDetailLastInteraction,
  mockUpdatedContactDetailNote,
  mockUpdatedContactDetailProvenance,
  type ContactDetail,
  type ContactDetailLastInteractionChannel,
  type ContactDetailLastInteractionInput,
  type ContactDetailLastInteractionMetadata,
  type ContactDetailNote,
  type ContactDetailNoteInput,
  type ContactDetailStatusOption,
  type ContactDetailTagOption,
  type ContactDetailTagStatusErrorCode,
  type ContactDetailTagStatusFailure,
  type ContactDetailTagStatusFailureForCode,
  type ContactDetailTagStatusInvalidPatchBodyError,
  type ContactDetailTagStatusPayload,
  type ContactDetailTagStatusResult,
  type ContactDetailTagStatusScenario,
  type ContactDetailTagStatusService,
  type ContactDetailTagStatusUpdatePendingError,
  type ContactDetailUpdateInput,
} from "./detail-contract";

const supportedScenarios = new Set<ContactDetailTagStatusScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

const supportedTags = new Set<ContactDetailTagOption>(
  CONTACT_DETAIL_TAG_OPTIONS,
);
const supportedStatuses = new Set<ContactDetailStatusOption>(
  CONTACT_DETAIL_STATUS_OPTIONS,
);
const supportedInteractionChannels = new Set<ContactDetailLastInteractionChannel>(
  ["event_note", "manual_note", "email_signal", "calendar_signal", "referral"],
);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function success(
  payload: ContactDetailTagStatusPayload,
): ContactDetailTagStatusResult {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function failure<TCode extends ContactDetailTagStatusErrorCode>(
  code: TCode,
): ContactDetailTagStatusFailureForCode<TCode> {
  const definition = CONTACT_DETAIL_TAG_STATUS_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: mockContactDetailFailureProvenance,
      evidenceIds: mockContactDetailFailureProvenance.evidenceIds,
    },
  } as ContactDetailTagStatusFailureForCode<TCode>;
}

function normalizeScenario(
  scenario?: ContactDetailUpdateInput["scenario"],
): ContactDetailTagStatusScenario {
  if (
    scenario &&
    supportedScenarios.has(scenario as ContactDetailTagStatusScenario)
  ) {
    return scenario as ContactDetailTagStatusScenario;
  }

  return "success";
}

function scenarioResult(
  scenario: ContactDetailTagStatusScenario,
): ContactDetailTagStatusResult | null {
  switch (scenario) {
    case "empty":
      return success(mockEmptyContactDetailFixture);
    case "pending":
      return success(mockPendingContactDetailFixture);
    case "failure":
      return failure("CONTACT_DETAIL_TAG_STATUS_MOCK_FAILED");
    case "success":
    default:
      return null;
  }
}

function updateScenarioResult(
  scenario: ContactDetailTagStatusScenario,
): ContactDetailTagStatusResult | null {
  if (scenario === "pending") {
    return updatePendingFailure();
  }

  return scenarioResult(scenario);
}

function invalidPatchBodyFailure(): ContactDetailTagStatusInvalidPatchBodyError {
  return failure("CONTACT_DETAIL_INVALID_PATCH_BODY");
}

function updatePendingFailure(): ContactDetailTagStatusUpdatePendingError {
  return failure("CONTACT_DETAIL_UPDATE_PENDING");
}

function isDemoContact(contactId: string): boolean {
  return contactId.trim() === "demo-contact-1";
}

function normalizedValues(
  values?: readonly (string | null | undefined)[] | null,
): string[] {
  return (
    values
      ?.map((value) => value?.trim() ?? "")
      .filter((value) => value.length > 0) ?? []
  );
}

function unsupportedTagFailure(
  input: ContactDetailUpdateInput,
): ContactDetailTagStatusFailure | null {
  const requestedTags = [
    ...normalizedValues(input.tags),
    ...normalizedValues(input.addTags),
    ...normalizedValues(input.removeTags),
  ];
  const hasUnsupportedTag = requestedTags.some(
    (tag) => !supportedTags.has(tag as ContactDetailTagOption),
  );

  return hasUnsupportedTag ? failure("CONTACT_DETAIL_TAG_NOT_SUPPORTED") : null;
}

function unsupportedStatusFailure(
  status?: ContactDetailUpdateInput["status"],
): ContactDetailTagStatusFailure | null {
  const normalizedStatus = status?.trim();

  if (
    normalizedStatus &&
    !supportedStatuses.has(normalizedStatus as ContactDetailStatusOption)
  ) {
    return failure("CONTACT_DETAIL_STATUS_NOT_SUPPORTED");
  }

  return null;
}

function uniqueTags(tags: readonly string[]): ContactDetailTagOption[] {
  return Array.from(new Set(tags)) as ContactDetailTagOption[];
}

function applyTagRules(
  input: ContactDetailUpdateInput,
): ContactDetailTagOption[] {
  const replacementTags = normalizedValues(input.tags);

  if (input.tags) {
    return uniqueTags(replacementTags);
  }

  const removeTags = new Set(normalizedValues(input.removeTags));
  const retainedTags = mockContactDetail.tags.filter(
    (tag) => !removeTags.has(tag),
  );

  return uniqueTags([...retainedTags, ...normalizedValues(input.addTags)]);
}

function normalizeStatus(
  status?: ContactDetailUpdateInput["status"],
): ContactDetailStatusOption {
  return (status?.trim() as ContactDetailStatusOption) || mockContactDetail.status;
}

function normalizeNoteInput(
  note?: ContactDetailUpdateInput["note"],
): ContactDetailNoteInput | null {
  if (typeof note === "string") {
    const body = note.trim();

    return body ? { body } : null;
  }

  if (!note) {
    return null;
  }

  const body = note.body.trim();

  if (!body) {
    return null;
  }

  return {
    body,
    authorLabel: note.authorLabel?.trim() || "Orbit operator",
  };
}

function buildNote(note?: ContactDetailUpdateInput["note"]): ContactDetailNote | null {
  const noteInput = normalizeNoteInput(note);

  if (!noteInput) {
    return null;
  }

  return {
    ...mockUpdatedContactDetailNote,
    body: noteInput.body,
    authorLabel: noteInput.authorLabel || "Orbit operator",
  };
}

function normalizeInteractionChannel(
  channel?: string | null,
): ContactDetailLastInteractionChannel {
  if (
    channel &&
    supportedInteractionChannels.has(channel as ContactDetailLastInteractionChannel)
  ) {
    return channel as ContactDetailLastInteractionChannel;
  }

  return "manual_note";
}

function buildLastInteraction(
  input?: ContactDetailLastInteractionInput | null,
): ContactDetailLastInteractionMetadata {
  if (!input) {
    return clonePayload(mockUpdatedContactDetailLastInteraction);
  }

  return {
    ...mockUpdatedContactDetailLastInteraction,
    channel: normalizeInteractionChannel(input.channel),
    occurredAt:
      input.occurredAt?.trim() ||
      mockUpdatedContactDetailLastInteraction.occurredAt,
    summary:
      input.summary?.trim() || mockUpdatedContactDetailLastInteraction.summary,
    source: mockContactDetailSource,
    evidenceIds: ["evidence:contact-detail-tag-status-update"],
  };
}

function buildUpdatePayload(
  input: ContactDetailUpdateInput,
): ContactDetailTagStatusPayload {
  const tags = applyTagRules(input);
  const status = normalizeStatus(input.status);
  const note = buildNote(input.note);
  const notes = note ? [...mockContactDetail.notes, note] : mockContactDetail.notes;
  const lastInteraction = buildLastInteraction(input.lastInteraction);
  const updatedContact: ContactDetail = {
    ...mockContactDetail,
    tags,
    status,
    notes,
    lastInteraction,
    updatedAt: lastInteraction.occurredAt,
  };

  return {
    state: "success",
    contact: updatedContact,
    editableTagOptions: CONTACT_DETAIL_TAG_OPTIONS,
    editableStatusOptions: CONTACT_DETAIL_STATUS_OPTIONS,
    summary:
      "Kenji Watanabe has a mock status and tag update ready for review.",
    provenance: clonePayload(mockUpdatedContactDetailProvenance),
    nextAction: "Use the updated tags and active status to plan the next follow-up.",
    updateSummary: `Mock update changed Kenji Watanabe to ${status} with ${tags.length} tags and ${notes.length} notes.`,
  };
}

export function createMockContactDetailTagStatusService(): ContactDetailTagStatusService {
  return {
    getContactDetail(input): ContactDetailTagStatusResult {
      const resolvedScenario = scenarioResult(normalizeScenario(input.scenario));

      if (resolvedScenario) {
        return resolvedScenario;
      }

      if (!isDemoContact(input.contactId)) {
        return failure("CONTACT_DETAIL_NOT_FOUND");
      }

      return success(mockContactDetailFixture);
    },

    updateContactDetail(input): ContactDetailTagStatusResult {
      const resolvedScenario = updateScenarioResult(
        normalizeScenario(input.scenario),
      );

      if (resolvedScenario) {
        return resolvedScenario;
      }

      if (!isDemoContact(input.contactId)) {
        return failure("CONTACT_DETAIL_NOT_FOUND");
      }

      const unsupportedStatus = unsupportedStatusFailure(input.status);

      if (unsupportedStatus) {
        return unsupportedStatus;
      }

      const unsupportedTags = unsupportedTagFailure(input);

      if (unsupportedTags) {
        return unsupportedTags;
      }

      return success(buildUpdatePayload(input));
    },

    invalidPatchBody(): ContactDetailTagStatusInvalidPatchBodyError {
      return invalidPatchBodyFailure();
    },
  };
}

export type { ContactDetailTagStatusResult };
