import { createHash } from "node:crypto";

import type {
  ConnectionDTO,
  ContactDTO,
  RelationshipEvidenceDTO,
} from "../../shared/domain/contracts";
import {
  isConnectionStage,
  isSeniorityLevel,
  type SourceType,
} from "../../shared/domain/source-types";
import { normalizeRegion } from "../../shared/domain/regions";
import { AppError } from "../../shared/errors/app-error";
import { parseStrictTokyoInstant, tokyoCalendarDaysUntil } from "../../shared/compute/tokyo-calendar-days";
import type { OrbitLanguage } from "../../shared/contract/language";
import type { IndustrySelectionContract } from "../../shared/contract/industries";
import {
  industryLabel,
  isIndustryIdCode,
  mergeIndustrySelection,
  secondaryIndustryLabel,
  validateIndustrySelection,
} from "../../shared/domain/industries";
import { resolveOrbitLanguage } from "../../shared/i18n/orbit-language";
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
  ContactEnrichmentEdit,
  LiveContactDetailState,
  LiveContactsGraphProvider,
} from "./live-service";
import {
  contactDetailCopy,
  contactSourceTypeLabel,
  localizeContactSourceLabel,
  localizeRelationshipText,
  selectContactEvidenceText,
} from "./contact-detail-localization";

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

function labelRelationshipText(
  value: string,
  language: OrbitLanguage,
): string {
  return localizeRelationshipText(value, language);
}

function labelRelationshipValues(
  values: readonly string[],
  language: OrbitLanguage,
): string[] {
  return uniqueStrings(
    values.map((value) => localizeRelationshipText(value, language)),
  );
}

function sourceLabelFor(input: {
  displayName: string;
  language: OrbitLanguage;
  source: ContactDTO["source"];
  sourceType: ContactDetailSourceType;
}): string {
  // Legacy rows may store the confirming actor in the label. The capture
  // method is the stable, user-facing source for every business-card row.
  if (input.sourceType === "business_card_ocr") {
    return "Business card scan";
  }

  return localizeContactSourceLabel({
    displayName: input.displayName,
    label: input.source.label,
    language: input.language,
    sourceType: input.sourceType,
  });
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
  language: OrbitLanguage;
}): ContactDetailSourceReference {
  const sourceType = contactDetailSourceTypeFor(input.contact.source.type);

  return {
    type: sourceType,
    id: input.contact.source.id,
    label: sourceLabelFor({
      displayName: input.contact.displayName,
      language: input.language,
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
  const candidates = connections.filter(
    (connection) => connection.contactId === contact.id,
  );
  if (candidates.length > 1 && candidates.some((connection) => connection.version !== undefined || connection.lifecycleInitialization !== undefined)) {
    throw new Error("CONTACT_DETAIL_AMBIGUOUS_CONNECTION");
  }

  return candidates[0] ?? null;
}

function canonicalConnectionFor(
  connection: ConnectionDTO | null,
): (ConnectionDTO & { stage: ContactDetailStatusOption }) | null {
  if (!connection || connection.lifecycleInitialization === "pending" ||
      (connection.version === undefined && connection.lifecycleInitialization !== "ready") ||
      !isConnectionStage(connection.stage)) {
    return null;
  }

  return connection as ConnectionDTO & { stage: ContactDetailStatusOption };
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
  language: OrbitLanguage;
  source: ContactDetailSourceReference;
}): ContactDetailPublicProfile {
  const profile = input.contact.publicProfile;
  const sharedTopics = labelRelationshipValues(
    input.connection?.sharedTopics ?? [],
    input.language,
  );
  const suggestedActions = (input.connection?.suggestedActions ?? []).map(
    (action) => labelRelationshipText(action, input.language),
  );
  const relationshipOffering = labelRelationshipValues(
    input.connection?.valueTypes ?? [],
    input.language,
  );

  return {
    // 空画像不应被说明性占位文案伪装成真实资料。
    bio:
      labelRelationshipText(profile?.bio ?? "", input.language) ||
      labelRelationshipText(input.contact.profileSnippet ?? "", input.language) ||
      labelRelationshipText(input.connection?.summary ?? "", input.language) ||
      "",
    selfIntroduction:
      labelRelationshipText(profile?.selfIntroduction ?? "", input.language) ||
      labelRelationshipText(input.contact.profileSnippet ?? "", input.language) ||
      "",
    industry:
      labelRelationshipText(profile?.industry ?? "", input.language) ||
      sharedTopics[0] ||
      "",
    offering:
      profile?.offering?.length
        ? profile.offering.map((value) =>
            labelRelationshipText(value, input.language),
          )
        : relationshipOffering,
    seeking:
      profile?.seeking?.length
        ? profile.seeking.map((value) =>
            labelRelationshipText(value, input.language),
          )
        : suggestedActions,
    topics:
      profile?.topics?.length
        ? profile.topics.map((value) =>
            labelRelationshipText(value, input.language),
          )
        : sharedTopics,
    conversationPrompts:
      profile?.conversationPrompts?.length
        ? profile.conversationPrompts.map((value) =>
            labelRelationshipText(value, input.language),
          )
        : suggestedActions.slice(0, 2),
    source: input.source,
    evidenceIds: input.evidenceIds,
    ...profileFieldSources(input.contact),
    ...profileFallbackFields(profile, { offering: relationshipOffering, seeking: suggestedActions, topics: sharedTopics }),
  };
}

/** W0060：哪些字段用了关系回退值（资料里该字段为空、而回退值非空）。 */
function profileFallbackFields(
  profile: ContactDTO["publicProfile"],
  fallbacks: Record<"offering" | "seeking" | "topics", readonly string[]>,
): Pick<ContactDetailPublicProfile, "fallbackFields"> {
  const fields = (["offering", "seeking", "topics"] as const).filter((field) => !profile?.[field]?.length && fallbacks[field].length > 0);
  return fields.length ? { fallbackFields: fields } : {};
}

/** W0058：三栏的值来自联系人资料且有来源记录时带上来源 via（回退到关系值的字段不带）。 */
function profileFieldSources(contact: ContactDTO): Pick<ContactDetailPublicProfile, "fieldSources"> {
  const fields = contact.enrichment?.fields;
  const profile = contact.publicProfile;
  if (!fields || !profile) return {};
  const sources: NonNullable<ContactDetailPublicProfile["fieldSources"]> = {};
  for (const field of ["offering", "seeking", "topics"] as const) {
    const via = fields[field]?.via;
    if (via && profile[field]?.length) sources[field] = via;
  }
  return Object.keys(sources).length ? { fieldSources: sources } : {};
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
  language: OrbitLanguage,
): ContactDetailSourceReference {
  const sourceType = contactDetailSourceTypeFor(evidence.sourceType);

  return {
    type: sourceType,
    id: evidence.sourceId,
    label:
      sourceType === fallback.type
        ? fallback.label
        : contactSourceTypeLabel(language, sourceType),
    evidenceId: evidence.id,
  };
}

function notesFor(input: {
  collectedAt: string;
  contact: ContactDTO;
  evidence: readonly RelationshipEvidenceDTO[];
  evidenceIds: readonly string[];
  language: OrbitLanguage;
  relationshipContext: string;
  source: ContactDetailSourceReference;
}): ContactDetailNote[] {
  // 名片确认时聚合的「备注」字符串以一条置顶笔记进入时间线，保证零信息丢失可见。
  const cardNotes = input.contact.notes?.trim()
    ? [
        {
          authorLabel: "名片备注",
          body: input.contact.notes,
          createdAt: input.contact.updatedAt,
          evidenceIds: input.contact.evidenceIds,
          noteId: `note:business-card-notes:${input.contact.id}`,
          noteWriteExecuted: false as const,
          productionAuditLogWriteExecuted: false as const,
          source: input.source,
        },
      ]
    : [];
  const notes = [...input.evidence]
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
    .map((evidence) => {
      const localized = selectContactEvidenceText(
        evidence.summary,
        input.language,
      );
      const sourceType = contactDetailSourceTypeFor(evidence.sourceType);

      return {
        noteId: `note:relationship-evidence:${input.contact.id}:${evidence.id}`,
        body: localized.text,
        authorLabel: contactSourceTypeLabel(input.language, sourceType),
        createdAt: evidence.occurredAt,
        source: sourceForEvidence(evidence, input.source, input.language),
        evidenceIds: [evidence.id],
        noteWriteExecuted: false as const,
        productionAuditLogWriteExecuted: false as const,
      };
    });

  if (cardNotes.length || notes.length) {
    return [...cardNotes, ...notes];
  }

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
  language: OrbitLanguage;
  occurredAt: string;
  relationshipContext: string;
  source: ContactDetailSourceReference;
}): ContactDetailLastInteractionMetadata {
  const evidenceSource = input.evidence
    ? sourceForEvidence(input.evidence, input.source, input.language)
    : input.source;

  return {
    interactionId: `interaction:live-contact-detail:${input.contact.id}`,
    channel: channelFor(evidenceSource.type),
    occurredAt: input.evidence?.occurredAt ?? input.occurredAt,
    summary: input.evidence
      ? selectContactEvidenceText(
          input.evidence.summary,
          input.language,
        ).text
      : input.relationshipContext,
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
  language: OrbitLanguage;
  persistedState?: LiveContactDetailState | null;
}): ContactDetail {
  const canonicalConnection = input.contact.lifecycleInitialization === "pending"
    ? null : canonicalConnectionFor(input.connection);
  const pureLegacyContact =
    input.connection === null &&
    input.contact.lifecycleInitialization === undefined;
  const evidenceIds = uniqueStrings([
    ...input.contact.evidenceIds,
    ...(input.connection?.evidenceIds ?? []),
  ]);
  const firstEvidenceId = evidenceIds[0] ?? `evidence:contact-detail:${input.contact.id}`;
  const source = sourceFor({
    contact: input.contact,
    evidenceId: firstEvidenceId,
    language: input.language,
  });
  const evidenceRecords = evidenceFor(evidenceIds, input.evidence);
  const latestEvidence = [...evidenceRecords].sort((left, right) =>
    right.occurredAt.localeCompare(left.occurredAt),
  )[0];
  const relationshipContext =
    labelRelationshipText(input.connection?.summary ?? "", input.language) ||
    labelRelationshipText(input.contact.profileSnippet ?? "", input.language) ||
    contactDetailCopy(input.language).generatedContext;
  const baseNotes = notesFor({
    collectedAt: input.collectedAt,
    contact: input.contact,
    evidence: evidenceRecords,
    evidenceIds,
    language: input.language,
    relationshipContext,
    source,
  });
  const persistedNotes = (input.persistedState?.notes ?? []).map((stored) => {
    // W0046：memo 的 occurredAt／eventId／kind 只在存储与时间线里用；详情 payload（App 同步）的 notes 字段保持不变。
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { occurredAt: _occurredAt, eventId: _eventId, kind: _kind, ...note } = stored;
    const manual = note.noteId.startsWith("note:live-contact-detail-update:") && note.privacy !== "relationship_shared";
    return {
      ...note,
      ...(manual ? { privacy: "private" as const, sourceLabel: note.sourceLabel ?? "联系人备注" } : {}),
      source: manual ? { type: "manual" as const, id: note.noteId, label: "联系人备注", evidenceId: "" } : source,
      evidenceIds: manual ? [] : input.contact.evidenceIds,
      noteWriteExecuted: false,
      productionAuditLogWriteExecuted: false as const,
    };
  });
  const baseLastInteraction = lastInteractionFor({
    contact: input.contact,
    evidence: latestEvidence,
    evidenceIds,
    language: input.language,
    occurredAt: input.connection?.updatedAt ?? input.contact.updatedAt,
    relationshipContext,
    source,
  });
  const persistedLastInteraction = input.persistedState?.lastInteraction;

  return {
    id: input.contact.id,
    ...(input.connection ? { connectionId: input.connection.id } : {}),
    lifecycleInitialization: input.contact.lifecycleInitialization,
    displayName: input.contact.displayName,
    contentLanguage: input.language,
    // 缺失字段保持为空，由展示层条件渲染省略，而不是显示成虚构值。
    role: input.contact.role ?? "",
    organization: input.contact.organization ?? "",
    location: input.contact.location ?? "",
    primaryIndustryId: input.contact.primaryIndustryId,
    secondaryIndustryId: input.contact.secondaryIndustryId,
    secondaryIndustryLabel: input.contact.secondaryIndustryId
      ? secondaryIndustryLabel(input.contact.secondaryIndustryId, input.language)
      : undefined,
    primaryIndustryLabel: input.contact.primaryIndustryId
      ? industryLabel(input.contact.primaryIndustryId, input.language)
      : undefined,
    ...(input.contact.publicProfile?.seniorityLevel ? { seniorityLevel: input.contact.publicProfile.seniorityLevel } : {}),
    ...(input.contact.region ? { region: { ...input.contact.region } } : {}),
    ...(input.contact.enrichment ? { enrichment: { version: 1 as const, fields: { ...input.contact.enrichment.fields } } } : {}),
    primaryEmail:
      input.contact.primaryEmail ?? input.contact.handles?.email ?? "",
    primaryPhone:
      input.contact.primaryPhone ?? input.contact.handles?.phone ?? "",
    wechatId: input.contact.handles?.wechatId ?? "",
    lineId: input.contact.handles?.lineId ?? "",
    website: input.contact.handles?.website ?? "",
    ...(input.contact.notes?.trim() ? { cardNotes: input.contact.notes.trim() } : {}),
    relationshipContext,
    publicProfile: publicProfileFor({
      contact: input.contact,
      connection: input.connection,
      evidenceIds,
      language: input.language,
      source,
    }),
    source,
    evidence: evidenceRecords.map((record) => {
      const localized = selectContactEvidenceText(
        record.summary,
        input.language,
      );

      return {
        evidenceId: record.id,
        source: sourceForEvidence(record, source, input.language),
        field: "relationship_context" as const,
        excerpt: localized.text,
        contentLanguage: localized.contentLanguage,
        capturedAt: record.occurredAt,
        createdBy: "mock-contact-detail-tag-status-service" as const,
      };
    }),
    tags: input.persistedState
      ? ([...input.persistedState.tags] as ContactDetailTagOption[])
      : tagsFor({
          contact: input.contact,
          connection: input.connection,
        }),
    status:
      canonicalConnection?.stage ??
      (pureLegacyContact && input.persistedState &&
      supportedStatuses.has(
        input.persistedState.status as ContactDetailStatusOption,
      )
        ? (input.persistedState.status as ContactDetailStatusOption)
        : statusFor(input.contact)),
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
    nextAction: labelRelationshipText(
      input.connection?.suggestedActions?.[0] ?? "",
      input.language,
    ),
    updatedAt:
      canonicalConnection?.updatedAt ??
      (pureLegacyContact ? input.persistedState?.updatedAt : undefined) ??
      input.contact.updatedAt,
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
  language: OrbitLanguage;
  persistedState?: LiveContactDetailState | null;
  provider: LiveContactsGraphProvider;
}): ContactDetailTagStatusPayload {
  const contact = detailFor({
    collectedAt: input.collectedAt,
    contact: input.contact,
    connection: input.connection,
    evidence: input.evidence,
    language: input.language,
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

/**
 * Sprint 0116: the detail read of a contact whose graph is already loaded (the
 * contacts sync domain reads a whole page of graphs at once). The same mapping
 * getContactDetail runs; null when the contact has more than one owned
 * relationship candidate (getContactDetail answers CONTACT_DETAIL_AMBIGUOUS_CONNECTION).
 */
export function contactDetailPayloadFromGraph(input: {
  collectedAt: string;
  contact: ContactDTO;
  connections: readonly ConnectionDTO[];
  evidence: readonly RelationshipEvidenceDTO[];
  persistedState: LiveContactDetailState | null;
  provider: Pick<LiveContactsGraphProvider, "source" | "sourceLabel">;
  language?: OrbitLanguage;
}): ContactDetailTagStatusPayload | null {
  let connection: ConnectionDTO | null;
  try {
    connection = connectionFor(input.contact, input.connections);
  } catch (error) {
    if (error instanceof Error && error.message === "CONTACT_DETAIL_AMBIGUOUS_CONNECTION") return null;
    throw error;
  }
  return clonePayload(payloadFor({
    collectedAt: input.collectedAt,
    contact: input.contact,
    connection,
    evidence: input.evidence,
    language: resolveOrbitLanguage({ requestLanguage: input.language }),
    persistedState: input.persistedState,
    provider: input.provider as LiveContactsGraphProvider,
  }));
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
  ];
  const uniqueRequestedTags = new Set(
    requestedTags.map((tag) => tag.toLocaleLowerCase()),
  );
  const hasUnsupportedTag =
    uniqueRequestedTags.size > 20 ||
    requestedTags.some((tag) => Array.from(tag).length > 32);

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
  const seen = new Set<string>();

  return tags.filter((tag) => {
    const key = tag.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }) as ContactDetailTagOption[];
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

  const memo = memoFieldsFor(note);
  return {
    body,
    authorLabel: note.authorLabel?.trim() || "Orbit operator",
    ...(memo ?? {}),
  };
}

const MEMO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * W0046：「写 memo」的附加字段。kind = "memo" 且日期是合法东京日期时才生效（handler 已拒绝非法形状）；
 * 其余写法（App 的 `{ note: "文本" }`／`{ body, authorLabel }`）返回 null，行为与改前一致。
 */
function memoFieldsFor(note: ContactDetailNoteInput): { kind: "memo"; occurredAt: string; eventId?: string } | null {
  if (note.kind !== "memo") return null;
  const day = note.occurredAt?.trim() ?? "";
  if (!MEMO_DAY.test(day) || parseStrictTokyoInstant(day) === null) return null;
  const eventId = note.eventId?.trim();
  return { kind: "memo", occurredAt: day, ...(eventId ? { eventId } : {}) };
}

/** memo 选的东京日期 → 该日东京 00:00 的 UTC ISO。 */
function memoDayStartIso(day: string): string {
  return new Date(parseStrictTokyoInstant(day) as number).toISOString();
}

/**
 * W0046：memo 推进「上次互动」——只有 memo 日期（东京日）≥ 现有 lastInteraction 的东京日才推进，
 * 补记旧事不覆盖更新的互动。当天的 memo 用写入时刻；同一天但现有时刻更晚时保留现有时刻。
 */
function memoLastInteraction(input: {
  current: ContactDetailLastInteractionMetadata;
  explicit?: ContactDetailLastInteractionInput | null;
  memo: { occurredAt: string; body: string };
  now: string;
}): ContactDetailLastInteractionInput | null {
  const currentAt = input.current.occurredAt;
  const days = tokyoCalendarDaysUntil(input.memo.occurredAt, currentAt);
  if (days !== null && days < 0) return null;
  const today = tokyoCalendarDaysUntil(input.memo.occurredAt, input.now) === 0;
  const candidate = today ? input.now : memoDayStartIso(input.memo.occurredAt);
  const currentTime = parseStrictTokyoInstant(currentAt);
  const occurredAt = days === 0 && currentTime !== null && currentTime > (parseStrictTokyoInstant(candidate) ?? 0) ? currentAt : candidate;
  const firstLine = input.memo.body.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? input.memo.body.trim();
  return {
    channel: input.explicit?.channel ?? "manual_note",
    occurredAt,
    summary: input.explicit?.summary?.trim() || Array.from(firstLine).slice(0, 120).join(""),
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
        // W0046：memo 的日期参与身份——同正文不同日是两条；旧写法哈希不变（App 重试仍幂等）。
        ...(noteInput.kind === "memo" && noteInput.occurredAt ? [`memo@${noteInput.occurredAt}`] : []),
      ].join("\u0000"),
    )
    .digest("hex")
    .slice(0, 24);

  const id = `note:live-contact-detail-update:${noteId}`;
  const existing = input.contact.notes.find((note) => note.noteId === id || (
    noteInput.kind !== "memo" &&
    note.noteId.startsWith("note:live-contact-detail-update:") &&
    note.privacy === "private" &&
    note.body.trim() === noteInput.body &&
    note.authorLabel.trim() === (noteInput.authorLabel || "Orbit operator")
  ));
  if (existing) return existing;

  return {
    noteId: id,
    body: noteInput.body,
    authorLabel: noteInput.authorLabel || "Orbit operator",
    createdAt: input.now,
    privacy: "private",
    sourceLabel: "联系人备注",
    source: { type: "manual", id, label: "联系人备注", evidenceId: "" },
    evidenceIds: [],
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
  /** W0046：冲突重试时，「上次互动」单调取大（不让本次的旧日期覆盖并发写入的更新互动）。 */
  keepNewerLastInteraction?: boolean;
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
  const noteInput = normalizeNoteInput(input.update.note);
  const lastInteractionInput = noteInput?.kind === "memo" && noteInput.occurredAt
    ? memoLastInteraction({ current: contact.lastInteraction, explicit: input.update.lastInteraction, memo: { occurredAt: noteInput.occurredAt, body: noteInput.body }, now: input.collectedAt })
    : input.update.lastInteraction;
  const builtLastInteraction = buildLastInteraction(
    contact,
    lastInteractionInput,
  );
  const lastInteraction = input.keepNewerLastInteraction &&
    (parseStrictTokyoInstant(contact.lastInteraction.occurredAt) ?? 0) > (parseStrictTokyoInstant(builtLastInteraction.occurredAt) ?? 0)
    ? clonePayload(contact.lastInteraction)
    : builtLastInteraction;
  const updatedContact: ContactDetail = {
    ...contact,
    primaryIndustryId:
      input.update.primaryIndustryId === null
        ? undefined
        : isIndustryIdCode(input.update.primaryIndustryId)
          ? input.update.primaryIndustryId
          : contact.primaryIndustryId,
    primaryIndustryLabel:
      input.update.primaryIndustryId === null
        ? undefined
        : isIndustryIdCode(input.update.primaryIndustryId)
          ? industryLabel(input.update.primaryIndustryId, contact.contentLanguage)
          : contact.primaryIndustryLabel,
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
  /** W0046：本次写入的 memo（noteId + 附加字段）。 */
  memo?: { noteId: string; occurredAt: string; eventId?: string } | null;
  persistedState: LiveContactDetailState | null;
  statusRequested: boolean;
}): LiveContactDetailState {
  const storedNoteIds = new Set(
    input.persistedState?.notes.map((note) => note.noteId),
  );
  // 详情 payload 的 notes 不带 memo 字段，这里按 noteId 从存储行（或本次写入）补回，任何 PATCH 都不丢。
  const memoFields = new Map<string, { occurredAt?: string; eventId?: string; kind?: "memo" }>();
  for (const note of input.persistedState?.notes ?? []) {
    if (note.occurredAt || note.eventId || note.kind) {
      memoFields.set(note.noteId, {
        ...(note.occurredAt ? { occurredAt: note.occurredAt } : {}),
        ...(note.eventId ? { eventId: note.eventId } : {}),
        ...(note.kind ? { kind: note.kind } : {}),
      });
    }
  }
  if (input.memo && !memoFields.has(input.memo.noteId)) {
    memoFields.set(input.memo.noteId, { occurredAt: input.memo.occurredAt, ...(input.memo.eventId ? { eventId: input.memo.eventId } : {}), kind: "memo" });
  }
  return {
    actorId: input.actorId,
    contactId: input.contact.id,
    tags: [...input.contact.tags],
    status: input.statusRequested ? input.contact.status : input.persistedState?.status ?? input.contact.status,
    notes: input.contact.notes
      .filter(
        (note) =>
          storedNoteIds.has(note.noteId) ||
          note.noteId.startsWith("note:live-contact-detail-update:"),
      )
      .map((note) => ({
        noteId: note.noteId,
        body: note.body,
        authorLabel: note.authorLabel,
        createdAt: note.createdAt,
        privacy: note.privacy,
        sourceLabel: note.sourceLabel,
        ...(memoFields.get(note.noteId) ?? {}),
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

/** W0045：PATCH 里的职级／地区 → provider 编辑输入；都没传返回 null，不合法返回 "invalid"。 */
function contactEnrichmentEditFor(input: ContactDetailUpdateInput): ContactEnrichmentEdit | null | "invalid" {
  const edit: ContactEnrichmentEdit = {};
  if (input.seniorityLevel !== undefined) {
    const level = input.seniorityLevel;
    if (level === null) edit.seniorityLevel = null;
    else if (isSeniorityLevel(level)) edit.seniorityLevel = level;
    else return "invalid";
  }
  if (input.region !== undefined) {
    if (input.region === null) edit.region = null;
    else {
      const region = normalizeRegion(input.region.countryCode, input.region.city ?? null);
      if (!region) return "invalid";
      edit.region = region;
    }
  }
  return Object.keys(edit).length ? edit : null;
}

/** W0046：详情状态条件写入的最大尝试次数（首次 + 2 次冲突重试）。 */
export const CONTACT_DETAIL_STATE_WRITE_ATTEMPTS = 3;

export function createLiveContactDetailTagStatusService({
  now = () => new Date().toISOString(),
  provider = null,
}: LiveContactDetailTagStatusServiceOptions = {}): ContactDetailTagStatusService {
  async function loadPayload(input: {
    actorId?: string | null;
    contactId: string;
    collectedAt: string;
    language?: OrbitLanguage;
  }): Promise<{
    result: ContactDetailTagStatusResult;
    connection: ConnectionDTO | null;
    persistedState: LiveContactDetailState | null;
  }> {
    const actorId = input.actorId?.trim();
    if (!actorId) {
      return {
        connection: null,
        persistedState: null,
        result: failure("CONTACT_DETAIL_ACTOR_REQUIRED", {
          collectedAt: input.collectedAt,
          provider,
        }),
      };
    }

    if (!provider) {
      return {
        connection: null,
        persistedState: null,
        result: failure("CONTACT_DETAIL_LIVE_STORE_UNCONFIGURED", {
          collectedAt: input.collectedAt,
          provider,
        }),
      };
    }

    try {
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
        return {
          connection: null,
          persistedState: null,
          result: failure("CONTACT_DETAIL_NOT_FOUND", {
            collectedAt: input.collectedAt,
            databaseReadExecuted: true,
            provider,
          }),
        };
      }

      const connection = connectionFor(contact, graph.connections);
      return {
        connection,
        persistedState,
        result: {
          success: true,
          data: clonePayload(
            payloadFor({
              collectedAt: input.collectedAt,
              contact,
              connection,
              evidence: graph.evidence,
              language: resolveOrbitLanguage({ requestLanguage: input.language }),
              persistedState,
              provider,
            }),
          ),
        },
      };
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "CONTACT_DETAIL_AMBIGUOUS_CONNECTION"
      ) {
        return {
          connection: null,
          persistedState: null,
          result: failure("CONTACT_DETAIL_AMBIGUOUS_CONNECTION", {
            collectedAt: input.collectedAt,
            databaseReadExecuted: true,
            provider,
          }),
        };
      }

      throw error;
    }
  }

  return {
    async getContactDetail(input): Promise<ContactDetailTagStatusResult> {
      const loaded = await loadPayload({
        actorId: input.actorId,
        contactId: input.contactId,
        collectedAt: now(),
        language: input.language,
      });
      return loaded.result;
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

      if (
        input.primaryIndustryId !== undefined &&
        input.primaryIndustryId !== null &&
        !isIndustryIdCode(input.primaryIndustryId)
      ) {
        return failure("CONTACT_DETAIL_INDUSTRY_NOT_SUPPORTED", {
          collectedAt,
          provider,
        });
      }

      // W0045：职级只收六档、地区国家码须是合法 ISO 码（城市可空）；null 表示清空。
      const enrichmentEdit = contactEnrichmentEditFor(input);
      if (enrichmentEdit === "invalid") {
        return failure("CONTACT_DETAIL_ENRICHMENT_NOT_SUPPORTED", { collectedAt, provider });
      }

      const { connection, result: loaded, persistedState } = await loadPayload({
        actorId: input.actorId,
        contactId: input.contactId,
        collectedAt,
        language: input.language,
      });

      if (loaded.success === false) {
        return loaded;
      }

      if (
        input.status !== undefined &&
        (connection !== null || loaded.data.contact?.lifecycleInitialization !== undefined)
      ) {
        return failure("CONTACT_DETAIL_CANONICAL_STATUS_LIFECYCLE_ONLY", {
          collectedAt,
          databaseReadExecuted: true,
          provider,
        });
      }

      const writesDetailState =
        input.tags !== undefined ||
        input.addTags !== undefined ||
        input.removeTags !== undefined ||
        input.status !== undefined ||
        input.note !== undefined ||
        input.lastInteraction !== undefined;
      const writesPrimaryIndustry = input.primaryIndustryId !== undefined || input.secondaryIndustryId !== undefined;
      const selection = mergeIndustrySelection(loaded.data.contact ?? {}, input as IndustrySelectionContract);
      if (writesPrimaryIndustry && !validateIndustrySelection(selection).valid) {
        return failure("CONTACT_DETAIL_INDUSTRY_NOT_SUPPORTED", { collectedAt, provider });
      }

      // W0045 review P1：同一联系人 payload 的行业／职级／地区合并为一次条件更新（一次 CAS），
      // 不会出现「行业已保存、职级冲突」的部分落库。
      const payloadEdit: ContactEnrichmentEdit = {
        ...(enrichmentEdit ?? {}),
        ...(writesPrimaryIndustry
          ? { industry: { primaryIndustryId: selection.primaryIndustryId ?? null, secondaryIndustryId: selection.primaryIndustryId ? selection.secondaryIndustryId ?? null : null } }
          : {}),
      };
      const writesPayload = Object.keys(payloadEdit).length > 0;
      // 只改行业、provider 又没有合并写入方法时（旧 provider），沿用 updateContactPrimaryIndustry。
      const legacyIndustryOnly = writesPrimaryIndustry && enrichmentEdit === null && !provider?.updateContactEnrichment;
      if (
        (writesDetailState && !provider?.upsertContactDetailState) ||
        (writesPayload && !provider?.updateContactEnrichment && !(legacyIndustryOnly && provider?.updateContactPrimaryIndustry))
      ) {
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
        if (legacyIndustryOnly) {
          await provider.updateContactPrimaryIndustry?.(
            input.contactId.trim(),
            actorId,
            selection.primaryIndustryId ?? null,
            selection.secondaryIndustryId ?? null,
          );
        } else if (writesPayload) {
          await provider.updateContactEnrichment?.(input.contactId.trim(), actorId, payloadEdit);
        }
      } catch (error) {
        if (error instanceof AppError && error.code === "CONFLICT") {
          return failure("CONTACT_DETAIL_CONFLICT", { collectedAt, databaseReadExecuted: true, provider });
        }
        return failure("CONTACT_DETAIL_LIVE_STORE_WRITE_FAILED", {
          collectedAt,
          databaseReadExecuted: true,
          provider,
        });
      }

      // 详情状态（标签／状态／备注／最近互动）在另一条记录（contact_detail_states），与上面的 payload 更新不在同一事务：
      // payload 先提交，详情状态写失败时 payload 已保存（W0045 前即如此，REPORT 已登记）。
      // W0046：以读到的版本为前提条件写入；冲突时重读，按本次窄 delta（备注追加去重、标签增删、上次互动单调取大）
      // 重新合并后重试，至多 3 次，仍冲突返回 409。
      let savedNoteId: string | undefined;
      if (writesDetailState) {
        let base = loaded.data;
        let state = persistedState;
        let attemptPreview = preview;
        for (let attempt = 0; ; attempt += 1) {
          if (attempt > 0) {
            attemptPreview = previewUpdatePayload({ actorId, base, collectedAt, update: input, keepNewerLastInteraction: true });
            if (!attemptPreview.contact) {
              return failure("CONTACT_DETAIL_NOT_FOUND", { collectedAt, databaseReadExecuted: true, provider });
            }
          }
          const noteInput = normalizeNoteInput(input.note);
          const note = noteInput ? buildNote({ actorId, contact: base.contact ?? attemptPreview.contact!, note: input.note, now: collectedAt }) : null;
          const memoWrite = note && noteInput?.kind === "memo" && noteInput.occurredAt
            ? { noteId: note.noteId, occurredAt: noteInput.occurredAt, ...(noteInput.eventId ? { eventId: noteInput.eventId } : {}) }
            : null;
          try {
            await provider.upsertContactDetailState?.(
              persistedStateFor({
                actorId,
                collectedAt,
                contact: attemptPreview.contact!,
                memo: memoWrite,
                persistedState: state,
                statusRequested: input.status !== undefined,
              }),
              state ? { updatedAt: state.updatedAt } : null,
            );
            savedNoteId = note?.noteId;
            break;
          } catch (error) {
            const conflict = error instanceof AppError && error.code === "CONFLICT";
            if (conflict && attempt < CONTACT_DETAIL_STATE_WRITE_ATTEMPTS - 1) {
              const reread = await loadPayload({ actorId, contactId: input.contactId, collectedAt, language: input.language });
              if (!reread.result.success) return reread.result;
              base = reread.result.data;
              state = reread.persistedState;
              continue;
            }
            if (conflict) return failure("CONTACT_DETAIL_CONFLICT", { collectedAt, databaseReadExecuted: true, provider });
            return failure("CONTACT_DETAIL_LIVE_STORE_WRITE_FAILED", {
              collectedAt,
              databaseReadExecuted: true,
              provider,
            });
          }
        }
      }

      const { result: reloaded } = await loadPayload({
        actorId,
        contactId: input.contactId,
        collectedAt,
        language: input.language,
      });
      if (!reloaded.success) return reloaded;

      return {
        success: true,
        data: clonePayload({
          ...persistedUpdatePayload({
            payload: reloaded.data,
            update: input,
          }),
          ...(savedNoteId ? { savedNoteId } : {}),
        }),
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
