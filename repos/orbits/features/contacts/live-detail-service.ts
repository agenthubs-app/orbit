import type {
  ConnectionDTO,
  ContactDTO,
  RelationshipEvidenceDTO,
} from "../../shared/domain/contracts";
import type { SourceType } from "../../shared/domain/source-types";
import {
  CONTACT_DETAIL_STATUS_OPTIONS,
  CONTACT_DETAIL_TAG_OPTIONS,
  CONTACT_DETAIL_TAG_STATUS_ERROR_DEFINITIONS,
  type ContactDetail,
  type ContactDetailLastInteractionChannel,
  type ContactDetailLastInteractionInput,
  type ContactDetailLastInteractionMetadata,
  type ContactDetailNote,
  type ContactDetailNoteInput,
  type ContactDetailPublicProfile,
  type ContactDetailSourceReference,
  type ContactDetailSourceType,
  type ContactDetailStatusOption,
  type ContactDetailTagOption,
  type ContactDetailTagStatusErrorCode,
  type ContactDetailTagStatusFailure,
  type ContactDetailTagStatusFailureForCode,
  type ContactDetailTagStatusInvalidPatchBodyError,
  type ContactDetailTagStatusPayload,
  type ContactDetailTagStatusResult,
  type ContactDetailTagStatusService,
  type ContactDetailTagStatusUpdatePendingError,
  type ContactDetailUpdateInput,
} from "./detail-contract";
import type { LiveContactsGraphProvider } from "./live-service";

export interface LiveContactDetailTagStatusServiceOptions {
  now?: () => string;
  provider?: LiveContactsGraphProvider | null;
}

const supportedTags = new Set<ContactDetailTagOption>(
  CONTACT_DETAIL_TAG_OPTIONS,
);
const supportedStatuses = new Set<ContactDetailStatusOption>(
  CONTACT_DETAIL_STATUS_OPTIONS,
);
const supportedInteractionChannels = new Set<ContactDetailLastInteractionChannel>(
  ["event_note", "manual_note", "email_signal", "calendar_signal", "referral"],
);
const contactDetailSourceTypes = new Set<ContactDetailSourceType>([
  "manual",
  "event_import",
  "email_signal",
  "calendar_signal",
  "referral",
]);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function uniqueStrings(values: readonly (string | undefined)[]): string[] {
  return Array.from(
    new Set(
      values.filter(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0,
      ),
    ),
  );
}

function failure<TCode extends ContactDetailTagStatusErrorCode>(
  code: TCode,
  input: {
    collectedAt: string;
    databaseReadExecuted?: boolean;
    provider?: LiveContactsGraphProvider | null;
  },
): ContactDetailTagStatusFailureForCode<TCode> {
  const definition = CONTACT_DETAIL_TAG_STATUS_ERROR_DEFINITIONS[code];
  const evidenceIds = [`evidence:${code.toLowerCase()}`];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: {
        source: input.provider?.source ?? "live-record-store:contacts:unconfigured",
        sourceLabel:
          input.provider?.sourceLabel ?? "Unconfigured contact detail store",
        evidenceIds,
        collectedAt: input.collectedAt,
        privacy: "demo-contact-detail-tag-status-only",
        generationMethod: "live-store-query",
        databaseReadExecuted: input.databaseReadExecuted ?? false,
        databaseWriteExecuted: false,
        productionAuditLogWriteExecuted: false,
        externalNetworkRequested: false,
        deviceRequested: false,
        aiProviderRequested: false,
        calendarProviderRequested: false,
        emailProviderRequested: false,
        notificationDelivered: false,
      },
      evidenceIds,
    },
  } as unknown as ContactDetailTagStatusFailureForCode<TCode>;
}

function invalidPatchBodyFailure(input: {
  collectedAt: string;
  provider?: LiveContactsGraphProvider | null;
}): ContactDetailTagStatusInvalidPatchBodyError {
  return failure("CONTACT_DETAIL_INVALID_PATCH_BODY", input);
}

function updatePendingFailure(input: {
  collectedAt: string;
  provider?: LiveContactsGraphProvider | null;
}): ContactDetailTagStatusUpdatePendingError {
  return failure("CONTACT_DETAIL_UPDATE_PENDING", input);
}

function contactDetailSourceTypeFor(
  sourceType: SourceType,
): ContactDetailSourceType {
  return contactDetailSourceTypes.has(sourceType as ContactDetailSourceType)
    ? (sourceType as ContactDetailSourceType)
    : "manual";
}

function sourceFor(input: {
  contact: ContactDTO;
  evidenceId: string;
}): ContactDetailSourceReference {
  return {
    type: contactDetailSourceTypeFor(input.contact.source.type),
    id: input.contact.source.id,
    label: input.contact.source.label ?? input.contact.source.id,
    evidenceId: input.evidenceId,
  };
}

function connectionFor(
  contact: ContactDTO,
  connections: readonly ConnectionDTO[],
): ConnectionDTO | null {
  return (
    connections.find((connection) => connection.contactId === contact.id) ?? null
  );
}

function evidenceFor(
  evidenceIds: readonly string[],
  evidence: readonly RelationshipEvidenceDTO[],
): RelationshipEvidenceDTO[] {
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));

  return evidenceIds
    .map((evidenceId) => evidenceById.get(evidenceId))
    .filter((item): item is RelationshipEvidenceDTO => item !== undefined);
}

function statusFor(contact: ContactDTO): ContactDetailStatusOption {
  if (
    contact.stage === "active" ||
    contact.stage === "needs_follow_up" ||
    contact.stage === "nurture" ||
    contact.stage === "archived"
  ) {
    return contact.stage;
  }

  return "needs_follow_up";
}

function tagsFor(input: {
  contact: ContactDTO;
  connection: ConnectionDTO | null;
}): ContactDetailTagOption[] {
  const sourceTag =
    input.contact.source.type === "event_import"
      ? "source:event-import"
      : "source:external-import";
  const text = [
    input.contact.profileSnippet,
    input.connection?.summary,
    ...(input.connection?.sharedTopics ?? []),
    ...(input.connection?.suggestedActions ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const tags: ContactDetailTagOption[] = [sourceTag];

  if (text.includes("storage") || text.includes("pilot")) {
    tags.push("topic:storage-pilots");
  }

  if (text.includes("community")) {
    tags.push("topic:community");
  }

  if (text.includes("venture") || text.includes("founder")) {
    tags.push("topic:venture-ecosystem");
  }

  if (input.contact.stage === "needs_follow_up" || text.includes("follow")) {
    tags.push("priority:warm-follow-up");
  }

  return uniqueStrings(tags) as ContactDetailTagOption[];
}

function publicProfileFor(input: {
  contact: ContactDTO;
  connection: ConnectionDTO | null;
  evidenceIds: readonly string[];
  source: ContactDetailSourceReference;
}): ContactDetailPublicProfile {
  const sharedTopics = input.connection?.sharedTopics ?? [];
  const suggestedActions = input.connection?.suggestedActions ?? [];

  return {
    bio:
      input.contact.profileSnippet ??
      input.connection?.summary ??
      "Live contact profile is available from shared relationship records.",
    selfIntroduction:
      input.contact.profileSnippet ??
      "Generated from live contact and relationship context.",
    industry: sharedTopics[0] ?? "relationship context",
    offering: input.connection?.valueTypes ?? [],
    seeking: suggestedActions,
    topics: sharedTopics,
    conversationPrompts: suggestedActions.slice(0, 2),
    source: input.source,
    evidenceIds: input.evidenceIds,
  };
}

function channelFor(sourceType: ContactDetailSourceType): ContactDetailLastInteractionChannel {
  if (sourceType === "event_import") {
    return "event_note";
  }

  if (sourceType === "email_signal" || sourceType === "calendar_signal") {
    return sourceType;
  }

  if (sourceType === "referral") {
    return "referral";
  }

  return "manual_note";
}

function noteFor(input: {
  collectedAt: string;
  contact: ContactDTO;
  evidenceIds: readonly string[];
  relationshipContext: string;
  source: ContactDetailSourceReference;
}): ContactDetailNote {
  return {
    noteId: `note:live-contact-detail:${input.contact.id}`,
    body: input.relationshipContext,
    authorLabel: "Live relationship record",
    createdAt: input.collectedAt,
    source: input.source,
    evidenceIds: input.evidenceIds,
    noteWriteExecuted: false,
    productionAuditLogWriteExecuted: false,
  };
}

function lastInteractionFor(input: {
  contact: ContactDTO;
  evidenceIds: readonly string[];
  occurredAt: string;
  relationshipContext: string;
  source: ContactDetailSourceReference;
}): ContactDetailLastInteractionMetadata {
  return {
    interactionId: `interaction:live-contact-detail:${input.contact.id}`,
    channel: channelFor(input.source.type),
    occurredAt: input.occurredAt,
    summary: input.relationshipContext,
    source: input.source,
    evidenceIds: input.evidenceIds,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationDelivered: false,
    externalNetworkRequested: false,
    productionAuditLogWriteExecuted: false,
  };
}

function detailFor(input: {
  collectedAt: string;
  contact: ContactDTO;
  connection: ConnectionDTO | null;
  evidence: readonly RelationshipEvidenceDTO[];
}): ContactDetail {
  const evidenceIds = uniqueStrings([
    ...input.contact.evidenceIds,
    ...(input.connection?.evidenceIds ?? []),
  ]);
  const firstEvidenceId = evidenceIds[0] ?? `evidence:contact-detail:${input.contact.id}`;
  const source = sourceFor({
    contact: input.contact,
    evidenceId: firstEvidenceId,
  });
  const evidenceRecords = evidenceFor(evidenceIds, input.evidence);
  const relationshipContext =
    input.connection?.summary ??
    input.contact.profileSnippet ??
    "Live relationship context is available for this contact.";

  return {
    id: input.contact.id,
    displayName: input.contact.displayName,
    role: input.contact.role ?? "Relationship contact",
    organization: input.contact.organization ?? "Unknown organization",
    location: input.contact.location ?? "Unknown location",
    relationshipContext,
    publicProfile: publicProfileFor({
      contact: input.contact,
      connection: input.connection,
      evidenceIds,
      source,
    }),
    source,
    evidence: evidenceRecords.map((record) => ({
      evidenceId: record.id,
      source,
      field: "relationship_context",
      excerpt: record.summary,
      capturedAt: record.occurredAt,
      createdBy: "mock-contact-detail-tag-status-service",
    })),
    tags: tagsFor({
      contact: input.contact,
      connection: input.connection,
    }),
    status: statusFor(input.contact),
    notes: [
      noteFor({
        collectedAt: input.collectedAt,
        contact: input.contact,
        evidenceIds,
        relationshipContext,
        source,
      }),
    ],
    lastInteraction: lastInteractionFor({
      contact: input.contact,
      evidenceIds,
      occurredAt: input.connection?.updatedAt ?? input.contact.updatedAt,
      relationshipContext,
      source,
    }),
    nextAction:
      input.connection?.suggestedActions[0] ??
      "Review the live contact detail before taking action.",
    updatedAt: input.contact.updatedAt,
    tagWriteExecuted: false,
    statusWriteExecuted: false,
    noteWriteExecuted: false,
    productionAuditLogWriteExecuted: false,
    databaseReadExecuted: true,
    databaseWriteExecuted: false,
    externalNetworkRequested: false,
    deviceRequested: false,
    aiProviderRequested: false,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationDelivered: false,
  };
}

function payloadFor(input: {
  collectedAt: string;
  contact: ContactDTO;
  connection: ConnectionDTO | null;
  evidence: readonly RelationshipEvidenceDTO[];
  provider: LiveContactsGraphProvider;
}): ContactDetailTagStatusPayload {
  const contact = detailFor({
    collectedAt: input.collectedAt,
    contact: input.contact,
    connection: input.connection,
    evidence: input.evidence,
  });

  return {
    state: "success",
    contact,
    editableTagOptions: CONTACT_DETAIL_TAG_OPTIONS,
    editableStatusOptions: CONTACT_DETAIL_STATUS_OPTIONS,
    summary: "Live contact detail was loaded from shared relationship storage.",
    provenance: {
      source: input.provider.source,
      sourceLabel: input.provider.sourceLabel,
      evidenceIds: contact.source.evidenceId
        ? uniqueStrings([contact.source.evidenceId, ...contact.publicProfile.evidenceIds])
        : contact.publicProfile.evidenceIds,
      collectedAt: input.collectedAt,
      privacy: "demo-contact-detail-tag-status-only",
      generationMethod: "live-store-query",
      databaseReadExecuted: true,
      databaseWriteExecuted: false,
      productionAuditLogWriteExecuted: false,
      externalNetworkRequested: false,
      deviceRequested: false,
      aiProviderRequested: false,
      calendarProviderRequested: false,
      emailProviderRequested: false,
      notificationDelivered: false,
    },
    nextAction:
      "Preview any tag, status, note, or last-interaction changes before persistence is wired.",
  };
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
  context: {
    collectedAt: string;
    provider?: LiveContactsGraphProvider | null;
  },
): ContactDetailTagStatusFailure | null {
  const requestedTags = [
    ...normalizedValues(input.tags),
    ...normalizedValues(input.addTags),
    ...normalizedValues(input.removeTags),
  ];
  const hasUnsupportedTag = requestedTags.some(
    (tag) => !supportedTags.has(tag as ContactDetailTagOption),
  );

  return hasUnsupportedTag
    ? failure("CONTACT_DETAIL_TAG_NOT_SUPPORTED", context)
    : null;
}

function unsupportedStatusFailure(
  status: ContactDetailUpdateInput["status"],
  context: {
    collectedAt: string;
    provider?: LiveContactsGraphProvider | null;
  },
): ContactDetailTagStatusFailure | null {
  const normalizedStatus = status?.trim();

  if (
    normalizedStatus &&
    !supportedStatuses.has(normalizedStatus as ContactDetailStatusOption)
  ) {
    return failure("CONTACT_DETAIL_STATUS_NOT_SUPPORTED", context);
  }

  return null;
}

function uniqueTags(tags: readonly string[]): ContactDetailTagOption[] {
  return Array.from(new Set(tags)) as ContactDetailTagOption[];
}

function applyTagRules(
  contact: ContactDetail,
  input: ContactDetailUpdateInput,
): ContactDetailTagOption[] {
  const replacementTags = normalizedValues(input.tags);

  if (input.tags) {
    return uniqueTags(replacementTags);
  }

  const removeTags = new Set(normalizedValues(input.removeTags));
  const retainedTags = contact.tags.filter((tag) => !removeTags.has(tag));

  return uniqueTags([...retainedTags, ...normalizedValues(input.addTags)]);
}

function normalizeStatus(
  contact: ContactDetail,
  status?: ContactDetailUpdateInput["status"],
): ContactDetailStatusOption {
  return (status?.trim() as ContactDetailStatusOption) || contact.status;
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

function buildNote(input: {
  contact: ContactDetail;
  note?: ContactDetailUpdateInput["note"];
  now: string;
}): ContactDetailNote | null {
  const noteInput = normalizeNoteInput(input.note);

  if (!noteInput) {
    return null;
  }

  return {
    noteId: `note:live-contact-detail-preview:${input.contact.id}:${input.now}`,
    body: noteInput.body,
    authorLabel: noteInput.authorLabel || "Orbit operator",
    createdAt: input.now,
    source: input.contact.source,
    evidenceIds: input.contact.source.evidenceId
      ? [input.contact.source.evidenceId]
      : input.contact.publicProfile.evidenceIds,
    noteWriteExecuted: false,
    productionAuditLogWriteExecuted: false,
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
  contact: ContactDetail,
  input?: ContactDetailLastInteractionInput | null,
): ContactDetailLastInteractionMetadata {
  if (!input) {
    return clonePayload(contact.lastInteraction);
  }

  return {
    ...contact.lastInteraction,
    channel: normalizeInteractionChannel(input.channel),
    occurredAt: input.occurredAt?.trim() || contact.lastInteraction.occurredAt,
    summary: input.summary?.trim() || contact.lastInteraction.summary,
    source: contact.source,
    evidenceIds: contact.lastInteraction.evidenceIds,
  };
}

function previewUpdatePayload(input: {
  base: ContactDetailTagStatusPayload;
  collectedAt: string;
  update: ContactDetailUpdateInput;
}): ContactDetailTagStatusPayload {
  const contact = input.base.contact;

  if (!contact) {
    return input.base;
  }

  const tags = applyTagRules(contact, input.update);
  const status = normalizeStatus(contact, input.update.status);
  const note = buildNote({
    contact,
    note: input.update.note,
    now: input.collectedAt,
  });
  const notes = note ? [...contact.notes, note] : contact.notes;
  const lastInteraction = buildLastInteraction(
    contact,
    input.update.lastInteraction,
  );
  const updatedContact: ContactDetail = {
    ...contact,
    tags,
    status,
    notes,
    lastInteraction,
    updatedAt: lastInteraction.occurredAt,
  };

  return {
    ...input.base,
    contact: updatedContact,
    summary: "Live contact detail update preview is ready for review.",
    provenance: {
      ...input.base.provenance,
      collectedAt: input.collectedAt,
      generationMethod: "live-store-preview-update",
      databaseReadExecuted: true,
      databaseWriteExecuted: false,
      productionAuditLogWriteExecuted: false,
    },
    nextAction:
      "Review this live preview before enabling contact persistence or audit writes.",
    updateSummary: `Live preview changed ${contact.displayName} to ${status} with ${tags.length} tags and ${notes.length} notes.`,
  };
}

export function createLiveContactDetailTagStatusService({
  now = () => new Date().toISOString(),
  provider = null,
}: LiveContactDetailTagStatusServiceOptions = {}): ContactDetailTagStatusService {
  async function loadPayload(input: {
    contactId: string;
    collectedAt: string;
  }): Promise<ContactDetailTagStatusResult> {
    if (!provider) {
      return failure("CONTACT_DETAIL_LIVE_STORE_UNCONFIGURED", {
        collectedAt: input.collectedAt,
        provider,
      });
    }

    const graph = provider.readContactGraphForContact
      ? await provider.readContactGraphForContact(input.contactId.trim())
      : await provider.readContactGraph();
    const contact =
      graph.contacts.find((item) => item.id === input.contactId.trim()) ?? null;

    if (!contact) {
      return failure("CONTACT_DETAIL_NOT_FOUND", {
        collectedAt: input.collectedAt,
        databaseReadExecuted: true,
        provider,
      });
    }

    return {
      success: true,
      data: clonePayload(
        payloadFor({
          collectedAt: input.collectedAt,
          contact,
          connection: connectionFor(contact, graph.connections),
          evidence: graph.evidence,
          provider,
        }),
      ),
    };
  }

  return {
    async getContactDetail(input): Promise<ContactDetailTagStatusResult> {
      return loadPayload({
        contactId: input.contactId,
        collectedAt: now(),
      });
    },

    async updateContactDetail(input): Promise<ContactDetailTagStatusResult> {
      const collectedAt = now();

      if (input.scenario === "pending") {
        return updatePendingFailure({
          collectedAt,
          provider,
        });
      }

      const unsupportedStatus = unsupportedStatusFailure(input.status, {
        collectedAt,
        provider,
      });

      if (unsupportedStatus) {
        return unsupportedStatus;
      }

      const unsupportedTag = unsupportedTagFailure(input, {
        collectedAt,
        provider,
      });

      if (unsupportedTag) {
        return unsupportedTag;
      }

      const loaded = await loadPayload({
        contactId: input.contactId,
        collectedAt,
      });

      if (loaded.success === false) {
        return loaded;
      }

      return {
        success: true,
        data: clonePayload(
          previewUpdatePayload({
            base: loaded.data,
            collectedAt,
            update: input,
          }),
        ),
      };
    },

    invalidPatchBody(): ContactDetailTagStatusInvalidPatchBodyError {
      return invalidPatchBodyFailure({
        collectedAt: now(),
        provider,
      });
    },
  };
}
