import { createHash } from "node:crypto";

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
import type {
  LiveContactDetailState,
  LiveContactsGraphProvider,
} from "./live-service";

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
  "business_card_ocr",
  "event_import",
  "external_contacts",
  "email_signal",
  "calendar_signal",
  "referral",
  "qr_scan",
]);

const sourceTypeLabels: Record<ContactDetailSourceType, string> = {
  business_card_ocr: "Business card scan",
  calendar_signal: "Calendar signal",
  email_signal: "Email signal",
  event_import: "Event import",
  external_contacts: "Imported contact",
  manual: "Manual note",
  qr_scan: "QR scan",
  referral: "Referral",
};

const relationshipTokenLabels: Record<string, string> = {
  commercial_opportunity: "commercial opportunity",
  community_context: "community context",
  cross_border_ecommerce: "cross-border ecommerce",
  education_training: "education and training",
  knowledge_exchange: "knowledge exchange",
  legal_accounting: "legal and accounting",
  referral_path: "referral path",
  retail_omnichannel: "retail omnichannel",
  strategic_fit: "strategic fit",
  tourism_hospitality: "tourism and hospitality",
  venture_capital: "investment interest",
};

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

function labelRelationshipToken(value: string): string {
  const normalized = value.trim();
  return (
    relationshipTokenLabels[normalized] ??
    normalized.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim()
  );
}

function labelRelationshipText(value: string): string {
  return value.replace(/\b[a-z][a-z0-9]+(?:_[a-z0-9]+)+\b/g, (token) =>
    labelRelationshipToken(token),
  );
}

function labelRelationshipValues(values: readonly string[]): string[] {
  return uniqueStrings(values.map((value) => labelRelationshipToken(value)));
}

function sourceLabelFor(input: {
  displayName: string;
  source: ContactDTO["source"];
  sourceType: ContactDetailSourceType;
}): string {
  const label = input.source.label?.trim();

  if (input.sourceType === "qr_scan") {
    if (!label) {
      return "QR scan";
    }

    const namedEvent = label.replace(/\s*QR scan$/i, "").trim();
    const directPerson = label.replace(/^Direct QR scan for\s+/i, "").trim();

    if (namedEvent && namedEvent !== label && namedEvent !== input.displayName) {
      return `QR scan at ${namedEvent}`;
    }

    if (directPerson && directPerson !== label) {
      return `QR scan for ${directPerson}`;
    }

    return label.includes("QR scan") ? label : `QR scan at ${label}`;
  }

  return label || sourceTypeLabels[input.sourceType];
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
  const sourceType = contactDetailSourceTypeFor(input.contact.source.type);

  return {
    type: sourceType,
    id: input.contact.source.id,
    label: sourceLabelFor({
      displayName: input.contact.displayName,
      source: input.contact.source,
      sourceType,
    }),
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
  if (contact.stage === "captured") {
    return "needs_follow_up";
  }

  if (contact.stage === "reviewing") {
    return "active";
  }

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
  const sourceTag: ContactDetailTagOption =
    input.contact.source.type === "event_import"
      ? "source:event-import"
      : input.contact.source.type === "business_card_ocr"
        ? "source:business-card"
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
  const profile = input.contact.publicProfile;
  const sharedTopics = labelRelationshipValues(input.connection?.sharedTopics ?? []);
  const suggestedActions = (input.connection?.suggestedActions ?? []).map(
    (action) => labelRelationshipText(action),
  );
  const relationshipOffering = labelRelationshipValues(
    input.connection?.valueTypes ?? [],
  );

  return {
    bio:
      labelRelationshipText(profile?.bio ?? "") ||
      labelRelationshipText(input.contact.profileSnippet ?? "") ||
      labelRelationshipText(input.connection?.summary ?? "") ||
      "Live contact profile is available from shared relationship records.",
    selfIntroduction:
      labelRelationshipText(profile?.selfIntroduction ?? "") ||
      labelRelationshipText(input.contact.profileSnippet ?? "") ||
      "Generated from live contact and relationship context.",
    industry:
      labelRelationshipText(profile?.industry ?? "") ||
      sharedTopics[0] ||
      "relationship context",
    offering:
      profile?.offering?.length
        ? profile.offering.map((value) => labelRelationshipText(value))
        : relationshipOffering,
    seeking:
      profile?.seeking?.length
        ? profile.seeking.map((value) => labelRelationshipText(value))
        : suggestedActions,
    topics:
      profile?.topics?.length
        ? profile.topics.map((value) => labelRelationshipText(value))
        : sharedTopics,
    conversationPrompts:
      profile?.conversationPrompts?.length
        ? profile.conversationPrompts.map((value) =>
            labelRelationshipText(value),
          )
        : suggestedActions.slice(0, 2),
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

function sourceForEvidence(
  evidence: RelationshipEvidenceDTO,
  fallback: ContactDetailSourceReference,
): ContactDetailSourceReference {
  const sourceType = contactDetailSourceTypeFor(evidence.sourceType);

  return {
    type: sourceType,
    id: evidence.sourceId,
    label:
      sourceType === fallback.type
        ? fallback.label
        : sourceTypeLabels[sourceType],
    evidenceId: evidence.id,
  };
}

function notesFor(input: {
  collectedAt: string;
  contact: ContactDTO;
  evidence: readonly RelationshipEvidenceDTO[];
  evidenceIds: readonly string[];
  relationshipContext: string;
  source: ContactDetailSourceReference;
}): ContactDetailNote[] {
  const notes = [...input.evidence]
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
    .map((evidence) => ({
      noteId: `note:relationship-evidence:${input.contact.id}:${evidence.id}`,
      body: labelRelationshipText(evidence.summary),
      authorLabel: sourceTypeLabels[
        contactDetailSourceTypeFor(evidence.sourceType)
      ],
      createdAt: evidence.occurredAt,
      source: sourceForEvidence(evidence, input.source),
      evidenceIds: [evidence.id],
      noteWriteExecuted: false as const,
      productionAuditLogWriteExecuted: false as const,
    }));

  return notes.length
    ? notes
    : [
        noteFor({
          collectedAt: input.collectedAt,
          contact: input.contact,
          evidenceIds: input.evidenceIds,
          relationshipContext: input.relationshipContext,
          source: input.source,
        }),
      ];
}

function lastInteractionFor(input: {
  contact: ContactDTO;
  evidence?: RelationshipEvidenceDTO;
  evidenceIds: readonly string[];
  occurredAt: string;
  relationshipContext: string;
  source: ContactDetailSourceReference;
}): ContactDetailLastInteractionMetadata {
  const evidenceSource = input.evidence
    ? sourceForEvidence(input.evidence, input.source)
    : input.source;

  return {
    interactionId: `interaction:live-contact-detail:${input.contact.id}`,
    channel: channelFor(evidenceSource.type),
    occurredAt: input.evidence?.occurredAt ?? input.occurredAt,
    summary:
      labelRelationshipText(input.evidence?.summary ?? "") ||
      input.relationshipContext,
    source: evidenceSource,
    evidenceIds: input.evidence ? [input.evidence.id] : input.evidenceIds,
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
  persistedState?: LiveContactDetailState | null;
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
  const latestEvidence = [...evidenceRecords].sort((left, right) =>
    right.occurredAt.localeCompare(left.occurredAt),
  )[0];
  const relationshipContext =
    labelRelationshipText(input.connection?.summary ?? "") ||
    labelRelationshipText(input.contact.profileSnippet ?? "") ||
    "Live relationship context is available for this contact.";
  const baseNotes = notesFor({
    collectedAt: input.collectedAt,
    contact: input.contact,
    evidence: evidenceRecords,
    evidenceIds,
    relationshipContext,
    source,
  });
  const persistedNotes = (input.persistedState?.notes ?? []).map((note) => ({
    ...note,
    source,
    evidenceIds: input.contact.evidenceIds,
    noteWriteExecuted: false,
    productionAuditLogWriteExecuted: false as const,
  }));
  const baseLastInteraction = lastInteractionFor({
    contact: input.contact,
    evidence: latestEvidence,
    evidenceIds,
    occurredAt: input.connection?.updatedAt ?? input.contact.updatedAt,
    relationshipContext,
    source,
  });
  const persistedLastInteraction = input.persistedState?.lastInteraction;

  return {
    id: input.contact.id,
    displayName: input.contact.displayName,
    role: input.contact.role ?? "Relationship contact",
    organization: input.contact.organization ?? "Unknown organization",
    location: input.contact.location ?? "Unknown location",
    primaryEmail:
      input.contact.primaryEmail ?? input.contact.handles?.email ?? "",
    primaryPhone:
      input.contact.primaryPhone ?? input.contact.handles?.phone ?? "",
    wechatId: input.contact.handles?.wechatId ?? "",
    lineId: input.contact.handles?.lineId ?? "",
    website: input.contact.handles?.website ?? "",
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
      source: sourceForEvidence(record, source),
      field: "relationship_context",
      excerpt: labelRelationshipText(record.summary),
      capturedAt: record.occurredAt,
      createdBy: "mock-contact-detail-tag-status-service",
    })),
    tags: input.persistedState
      ? (input.persistedState.tags.filter((tag) =>
          supportedTags.has(tag as ContactDetailTagOption),
        ) as ContactDetailTagOption[])
      : tagsFor({
          contact: input.contact,
          connection: input.connection,
        }),
    status:
      input.persistedState &&
      supportedStatuses.has(
        input.persistedState.status as ContactDetailStatusOption,
      )
        ? (input.persistedState.status as ContactDetailStatusOption)
        : statusFor(input.contact),
    notes: [...baseNotes, ...persistedNotes],
    lastInteraction: persistedLastInteraction
      ? {
          ...baseLastInteraction,
          channel: normalizeInteractionChannel(
            persistedLastInteraction.channel,
          ),
          occurredAt: persistedLastInteraction.occurredAt,
          summary: persistedLastInteraction.summary,
        }
      : baseLastInteraction,
    nextAction:
      labelRelationshipText(input.connection?.suggestedActions[0] ?? "") ||
      "Review the live contact detail before taking action.",
    updatedAt: input.persistedState?.updatedAt ?? input.contact.updatedAt,
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
  persistedState?: LiveContactDetailState | null;
  provider: LiveContactsGraphProvider;
}): ContactDetailTagStatusPayload {
  const contact = detailFor({
    collectedAt: input.collectedAt,
    contact: input.contact,
    connection: input.connection,
    evidence: input.evidence,
    persistedState: input.persistedState,
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
  actorId: string;
  contact: ContactDetail;
  note?: ContactDetailUpdateInput["note"];
  now: string;
}): ContactDetailNote | null {
  const noteInput = normalizeNoteInput(input.note);

  if (!noteInput) {
    return null;
  }

  const noteId = createHash("sha256")
    .update(
      [
        input.actorId,
        input.contact.id,
        noteInput.authorLabel || "Orbit operator",
        noteInput.body,
      ].join("\u0000"),
    )
    .digest("hex")
    .slice(0, 24);

  return {
    noteId: `note:live-contact-detail-update:${noteId}`,
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
  actorId: string;
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
    actorId: input.actorId,
    contact,
    note: input.update.note,
    now: input.collectedAt,
  });
  const notes = note
    ? [
        ...contact.notes.filter(
          (existingNote) => existingNote.noteId !== note.noteId,
        ),
        note,
      ]
    : contact.notes;
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

function persistedStateFor(input: {
  actorId: string;
  collectedAt: string;
  contact: ContactDetail;
}): LiveContactDetailState {
  return {
    actorId: input.actorId,
    contactId: input.contact.id,
    tags: [...input.contact.tags],
    status: input.contact.status,
    notes: input.contact.notes
      .filter((note) =>
        note.noteId.startsWith("note:live-contact-detail-update:"),
      )
      .map((note) => ({
        noteId: note.noteId,
        body: note.body,
        authorLabel: note.authorLabel,
        createdAt: note.createdAt,
      })),
    lastInteraction: {
      channel: input.contact.lastInteraction.channel,
      occurredAt: input.contact.lastInteraction.occurredAt,
      summary: input.contact.lastInteraction.summary,
    },
    updatedAt: input.collectedAt,
  };
}

function persistedUpdatePayload(input: {
  payload: ContactDetailTagStatusPayload;
  update: ContactDetailUpdateInput;
}): ContactDetailTagStatusPayload {
  const contact = input.payload.contact;
  if (!contact) {
    return input.payload;
  }
  const wroteTags =
    input.update.tags !== undefined ||
    input.update.addTags !== undefined ||
    input.update.removeTags !== undefined;
  const wroteStatus = Boolean(input.update.status?.trim());
  const noteInput = normalizeNoteInput(input.update.note);

  return {
    ...input.payload,
    contact: {
      ...contact,
      notes: contact.notes.map((note) => ({
        ...note,
        noteWriteExecuted:
          noteInput !== null &&
          note.noteId.startsWith("note:live-contact-detail-update:") &&
          note.body === noteInput.body &&
          note.authorLabel === (noteInput.authorLabel || "Orbit operator"),
      })),
      tagWriteExecuted: wroteTags,
      statusWriteExecuted: wroteStatus,
      noteWriteExecuted: noteInput !== null,
      databaseWriteExecuted: true,
    },
    summary: "Live contact detail update was persisted.",
    provenance: {
      ...input.payload.provenance,
      generationMethod: "live-store-update",
      databaseReadExecuted: true,
      databaseWriteExecuted: true,
    },
    nextAction: "The actor-scoped update is saved and ready for refresh.",
    updateSummary: `Saved ${contact.displayName} with ${contact.status}, ${contact.tags.length} tags and ${contact.notes.length} notes.`,
  };
}

export function createLiveContactDetailTagStatusService({
  now = () => new Date().toISOString(),
  provider = null,
}: LiveContactDetailTagStatusServiceOptions = {}): ContactDetailTagStatusService {
  async function loadPayload(input: {
    actorId?: string | null;
    contactId: string;
    collectedAt: string;
  }): Promise<ContactDetailTagStatusResult> {
    const actorId = input.actorId?.trim();
    if (!actorId) {
      return failure("CONTACT_DETAIL_ACTOR_REQUIRED", {
        collectedAt: input.collectedAt,
        provider,
      });
    }

    if (!provider) {
      return failure("CONTACT_DETAIL_LIVE_STORE_UNCONFIGURED", {
        collectedAt: input.collectedAt,
        provider,
      });
    }

    const [graph, persistedState] = await Promise.all([
      provider.readContactGraphForContact
        ? provider.readContactGraphForContact(input.contactId.trim(), actorId)
        : provider.readContactGraph(actorId),
      provider.readContactDetailState
        ? provider.readContactDetailState(input.contactId.trim(), actorId)
        : null,
    ]);
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
          persistedState,
          provider,
        }),
      ),
    };
  }

  return {
    async getContactDetail(input): Promise<ContactDetailTagStatusResult> {
      return loadPayload({
        actorId: input.actorId,
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
        actorId: input.actorId,
        contactId: input.contactId,
        collectedAt,
      });

      if (loaded.success === false) {
        return loaded;
      }

      if (!provider?.upsertContactDetailState) {
        return failure("CONTACT_DETAIL_LIVE_STORE_WRITE_FAILED", {
          collectedAt,
          databaseReadExecuted: true,
          provider,
        });
      }
      const actorId = input.actorId?.trim();
      if (!actorId) {
        return failure("CONTACT_DETAIL_ACTOR_REQUIRED", {
          collectedAt,
          provider,
        });
      }
      const preview = previewUpdatePayload({
        actorId,
        base: loaded.data,
        collectedAt,
        update: input,
      });
      if (!preview.contact) {
        return failure("CONTACT_DETAIL_NOT_FOUND", {
          collectedAt,
          databaseReadExecuted: true,
          provider,
        });
      }
      try {
        await provider.upsertContactDetailState(
          persistedStateFor({
            actorId,
            collectedAt,
            contact: preview.contact,
          }),
        );
      } catch {
        return failure("CONTACT_DETAIL_LIVE_STORE_WRITE_FAILED", {
          collectedAt,
          databaseReadExecuted: true,
          provider,
        });
      }

      return {
        success: true,
        data: clonePayload(
          persistedUpdatePayload({
            payload: preview,
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
