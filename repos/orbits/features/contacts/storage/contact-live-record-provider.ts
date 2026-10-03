import { AppError } from "../../../shared/errors/app-error";
import { contactRecordOwnedByActor } from "./contact-read-authorization";
import { applyEnrichedValues, type AppliedEnrichmentField, type EnrichedValue } from "../enrichment/apply-enrichment";

import type {
  ConnectionDTO,
  ContactDTO,
  RelationshipEvidenceDTO,
} from "../../../shared/domain/contracts";
import type { IndustryIdCode, SecondaryIndustryIdCode } from "../../../shared/contract/industries";
import { isIndustryIdCode, mergeIndustrySelection, validateIndustrySelection } from "../../../shared/domain/industries";
import { readStoredEnrichment, withEnrichmentProvenance } from "../../../shared/domain/enrichment";
import { normalizeRegion, readStoredRegion } from "../../../shared/domain/regions";
import {
  isNetworkCategory,
  isConnectionStage,
  isRelationshipStage,
  isRelationshipTrustLevel,
  isRelationshipValueType,
  isSeniorityLevel,
  isSourceType,
} from "../../../shared/domain/source-types";
import {
  resolveLiveDatabaseConnectionConfig,
  type LiveDatabaseEnv,
} from "../../../shared/storage/live-database-config";
import {
  createConfiguredPostgresLiveRecordStore,
  type ConfiguredPostgresLiveRecordStore,
} from "../../../shared/storage/configured-live-record-store";
import type {
  LiveRecord,
  LiveRecordStoreLike,
} from "../../../shared/storage/live-record-store";
import type { ContactsListSearchFilterInput } from "../contract";
import type {
  LiveContactDetailState,
  LiveContactDetailStoredInteraction,
  LiveContactDetailStoredNote,
  LiveContactsGraphProvider,
  ContactEnrichmentEdit,
} from "../live-service";
import type { LocalRemoteContactGraph } from "../contact-graph-provider";
import type { ContactsFacetCounts } from "../contact-graph-query";
import { createPostgresContactScopeRecordReader, type ContactScopeRecordReader } from "./contact-scope-postgres-reader";
import {
  createPostgresContactListPageReader,
  type ContactListSortKey,
  type ContactRecordPage,
  type ContactRecordPageReader,
} from "./contact-list-postgres-reader";

/** W0058：名片推测写回的条件更新冲突重试次数（重读，不调用模型）。 */
export const CARD_INFERENCE_WRITE_RETRIES = 2;

export const CONTACTS_LIVE_RECORD_COLLECTIONS = {
  connections: "connections",
  contacts: "contacts",
  detailStates: "contact_detail_states",
  evidence: "evidence",
} as const;

// The list DTO does not consume private notes, raw captures, handles or full
// detail-state history. Keep those in the explicit contact-detail read path.
const contactListPayloadFields = [
  "id", "version", "accountId", "displayName", "organization", "role", "location",
  "profileSnippet", "primaryIndustryId", "secondaryIndustryId", "nextAction",
  "stage", "lifecycleInitialization", "source", "evidenceIds", "createdAt", "updatedAt",
] as const;
const connectionListPayloadFields = [
  "id", "version", "lifecycleInitialization", "accountId", "contactId", "stage",
  "valueTypes", "summary", "source", "evidenceIds", "createdAt", "updatedAt",
] as const;
const detailStateListPayloadFields = ["actorId", "contactId", "tags", "status", "updatedAt"] as const;
const evidenceListPayloadFields = ["id", "sourceType", "sourceId", "summary", "occurredAt", "confidence", "createdBy"] as const;

export interface StorageContactGraphProviderOptions {
  contactRecordPageReader?: ContactRecordPageReader;
  contactScopeRecordReader?: ContactScopeRecordReader;
  source?: string;
  sourceLabel?: string;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}

interface BoundedContactGraph extends LocalRemoteContactGraph {
  contactListFallback?: {
    cursorScope: string;
    sortKeys: readonly ContactListSortKey[];
  };
  boundedPage?: {
    facetCounts?: ContactsFacetCounts;
    nextCursor?: string;
    total: number;
  };
}

export interface ConfiguredStorageContactGraphProviderOptions {
  env?: LiveDatabaseEnv;
  sourceLabel?: string;
}

interface CachedConfiguredStorageContactGraphProvider {
  key: string;
  provider: LiveContactsGraphProvider;
}

let cachedDefaultProvider: CachedConfiguredStorageContactGraphProvider | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function optionalString(value: unknown): string | undefined {
  return nonEmptyString(value) ? value : undefined;
}

function stringArray(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => nonEmptyString(item))
    : [];
}

function storedNote(value: unknown): LiveContactDetailStoredNote | null {
  if (
    !isRecord(value) ||
    !nonEmptyString(value.noteId) ||
    !nonEmptyString(value.body) ||
    !nonEmptyString(value.authorLabel) ||
    !nonEmptyString(value.createdAt)
  ) {
    return null;
  }

  return {
    noteId: value.noteId,
    body: value.body,
    authorLabel: value.authorLabel,
    createdAt: value.createdAt,
    privacy:
      value.privacy === "private" || value.privacy === "relationship_shared"
        ? value.privacy
        : undefined,
    sourceLabel: optionalString(value.sourceLabel),
    // W0046 memo 字段：原样保留，下一次任何 PATCH／encounters 投影都不丢。
    ...(typeof value.occurredAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.occurredAt) ? { occurredAt: value.occurredAt } : {}),
    ...(nonEmptyString(value.eventId) ? { eventId: value.eventId } : {}),
    ...(value.kind === "memo" ? { kind: "memo" as const } : {}),
  };
}

function storedInteraction(
  value: unknown,
): LiveContactDetailStoredInteraction | undefined {
  if (
    !isRecord(value) ||
    !nonEmptyString(value.channel) ||
    !nonEmptyString(value.occurredAt) ||
    !nonEmptyString(value.summary)
  ) {
    return undefined;
  }

  return {
    channel: value.channel,
    occurredAt: value.occurredAt,
    summary: value.summary,
  };
}

function contactDetailStateFromRecord(
  record: LiveRecord<Record<string, unknown>> | null,
  actorId: string,
  contactId: string,
): LiveContactDetailState | null {
  if (
    !record ||
    record.userId !== actorId ||
    !isRecord(record.payload) ||
    record.payload.actorId !== actorId ||
    record.payload.contactId !== contactId ||
    !nonEmptyString(record.payload.status) ||
    !nonEmptyString(record.payload.updatedAt)
  ) {
    return null;
  }
  const notes = Array.isArray(record.payload.notes)
    ? record.payload.notes
        .map(storedNote)
        .filter((note): note is LiveContactDetailStoredNote => note !== null)
    : [];

  return {
    actorId,
    contactId,
    tags: stringArray(record.payload.tags),
    status: record.payload.status,
    notes,
    lastInteraction: storedInteraction(record.payload.lastInteraction),
    updatedAt: record.payload.updatedAt,
  };
}

function contactDetailStateRecordId(actorId: string, contactId: string): string {
  return `contact-detail:${encodeURIComponent(actorId)}:${encodeURIComponent(contactId)}`;
}

function evidenceIds(value: unknown): readonly [string, ...string[]] | null {
  const ids = stringArray(value);

  return ids.length > 0 ? [ids[0], ...ids.slice(1)] : null;
}

function sourceReference(
  value: unknown,
): ContactDTO["source"] | ConnectionDTO["source"] | null {
  if (!isRecord(value) || !isSourceType(value.type) || !nonEmptyString(value.id)) {
    return null;
  }

  return {
    type: value.type,
    id: value.id,
    label: optionalString(value.label),
  };
}

function contactFromRecord(
  record: LiveRecord<Record<string, unknown>>,
): ContactDTO | null {
  const payload = record.payload;
  if (payload.version !== undefined && (!Number.isSafeInteger(payload.version) || (payload.version as number) < 1)) {
    throw new Error("Invalid contact lifecycle version");
  }
  const source = sourceReference(payload.source);
  const ids = evidenceIds(payload.evidenceIds);

  if (
    !nonEmptyString(payload.id) ||
    !nonEmptyString(payload.displayName) ||
    !isRelationshipStage(payload.stage) ||
    !source ||
    !ids ||
    !nonEmptyString(payload.createdAt) ||
    !nonEmptyString(payload.updatedAt)
  ) {
    return null;
  }

  return {
    id: payload.id,
    version: payload.version as number | undefined,
    personId: optionalString(payload.personId),
    displayName: payload.displayName,
    organization: optionalString(payload.organization),
    role: optionalString(payload.role),
    location: optionalString(payload.location),
    primaryEmail: optionalString(payload.primaryEmail),
    primaryPhone: optionalString(payload.primaryPhone),
    profileSnippet: optionalString(payload.profileSnippet),
    notes: optionalString(payload.notes),
    handles: isRecord(payload.handles)
      ? {
          email: optionalString(payload.handles.email),
          phone: optionalString(payload.handles.phone),
          wechatId: optionalString(payload.handles.wechatId),
          lineId: optionalString(payload.handles.lineId),
          website: optionalString(payload.handles.website),
        }
      : undefined,
    publicProfile: isRecord(payload.publicProfile)
      ? {
          bio: optionalString(payload.publicProfile.bio),
          selfIntroduction: optionalString(
            payload.publicProfile.selfIntroduction,
          ),
          industry: optionalString(payload.publicProfile.industry),
          // W0045：职级唯一存储；白名单映射，漏了详情就读不到。
          seniorityLevel: isSeniorityLevel(payload.publicProfile.seniorityLevel)
            ? payload.publicProfile.seniorityLevel
            : undefined,
          offering: stringArray(payload.publicProfile.offering),
          seeking: stringArray(payload.publicProfile.seeking),
          topics: stringArray(payload.publicProfile.topics),
          conversationPrompts: stringArray(
            payload.publicProfile.conversationPrompts,
          ),
        }
      : undefined,
    networkCategory: isNetworkCategory(payload.networkCategory)
      ? payload.networkCategory
      : undefined,
    primaryIndustryId: isIndustryIdCode(payload.primaryIndustryId)
      ? payload.primaryIndustryId
      : undefined,
    secondaryIndustryId: typeof payload.secondaryIndustryId === "string" && validateIndustrySelection(payload).valid
      ? payload.secondaryIndustryId as SecondaryIndustryIdCode
      : undefined,
    region: readStoredRegion(payload.region) ?? undefined,
    enrichment: readStoredEnrichment(payload.enrichment) ?? undefined,
    nextAction: isRecord(payload.nextAction) && nonEmptyString(payload.nextAction.text)
      ? {
          text: payload.nextAction.text,
          reason: optionalString(payload.nextAction.reason),
          evidenceId: optionalString(payload.nextAction.evidenceId),
        }
      : undefined,
    stage: payload.stage,
    lifecycleInitialization: payload.lifecycleInitialization === "pending" || payload.lifecycleInitialization === "ready" ? payload.lifecycleInitialization : undefined,
    source,
    evidenceIds: ids,
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
  };
}

function connectionFromRecord(
  record: LiveRecord<Record<string, unknown>>,
): ConnectionDTO | null {
  const payload = record.payload;
  if (payload.version !== undefined && (!Number.isSafeInteger(payload.version) || (payload.version as number) < 1)) {
    throw new Error("Invalid connection lifecycle version");
  }
  const source = sourceReference(payload.source);
  const ids = evidenceIds(payload.evidenceIds);
  const valueTypes = stringArray(payload.valueTypes).filter(isRelationshipValueType);

  if (
    !nonEmptyString(payload.id) ||
    !nonEmptyString(payload.accountId) ||
    !nonEmptyString(payload.contactId) ||
    !isRelationshipStage(payload.stage) ||
    !nonEmptyString(payload.summary) ||
    !source ||
    !ids ||
    !nonEmptyString(payload.createdAt) ||
    !nonEmptyString(payload.updatedAt)
  ) {
    return null;
  }

  return {
    id: payload.id,
    version: payload.version as number | undefined,
    lifecycleInitialization: payload.lifecycleInitialization === "pending" || payload.lifecycleInitialization === "ready" ? payload.lifecycleInitialization : undefined,
    accountId: payload.accountId,
    contactId: payload.contactId,
    stage: payload.stage,
    valueTypes,
    summary: payload.summary,
    relationshipStrength:
      typeof payload.relationshipStrength === "number"
        ? payload.relationshipStrength
        : undefined,
    trustLevel: isRelationshipTrustLevel(payload.trustLevel)
      ? payload.trustLevel
      : undefined,
    businessRelevanceScore:
      typeof payload.businessRelevanceScore === "number"
        ? payload.businessRelevanceScore
        : undefined,
    sharedTopics: stringArray(payload.sharedTopics),
    suggestedActions: stringArray(payload.suggestedActions),
    source,
    evidenceIds: ids,
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
  };
}

function evidenceFromRecord(
  record: LiveRecord<Record<string, unknown>>,
): RelationshipEvidenceDTO | null {
  const payload = record.payload;

  if (
    !nonEmptyString(payload.id) ||
    !isSourceType(payload.sourceType) ||
    !nonEmptyString(payload.sourceId) ||
    !nonEmptyString(payload.summary) ||
    !nonEmptyString(payload.occurredAt) ||
    typeof payload.confidence !== "number" ||
    !nonEmptyString(payload.createdBy)
  ) {
    return null;
  }

  return {
    id: payload.id,
    sourceType: payload.sourceType,
    sourceId: payload.sourceId,
    summary: payload.summary,
    occurredAt: payload.occurredAt,
    confidence: payload.confidence,
    createdBy: payload.createdBy,
  };
}

function latestTimestamp(records: readonly LiveRecord<Record<string, unknown>>[]): string {
  return (
    records
      .map((record) => record.updatedAt)
      .filter(nonEmptyString)
      .sort()
      .at(-1) ?? new Date(0).toISOString()
  );
}

function uniqueEvidenceIds(
  contacts: readonly ContactDTO[],
  connections: readonly ConnectionDTO[],
): string[] {
  return Array.from(
    new Set([
      ...contacts.flatMap((contact) => contact.evidenceIds),
      ...connections.flatMap((connection) => connection.evidenceIds),
    ]),
  );
}

async function readEvidenceRecordsByDomainId(input: {
  evidenceIds: readonly string[];
  evidenceRecordIds?: readonly string[];
  listInput?: ContactsListSearchFilterInput;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}): Promise<readonly LiveRecord<Record<string, unknown>>[]> {
  if (input.evidenceRecordIds !== undefined) {
    if (input.evidenceRecordIds.length === 0) return [];
    const expectedIds = new Set(input.evidenceIds);
    const records = await input.store.listRecords({
      // Bounded by the id list itself, so it states that bound rather than
      // counting against the unbounded-read ratchet.
      limit: input.evidenceRecordIds.length,
      workspaceId: input.workspaceId,
      collectionName: CONTACTS_LIVE_RECORD_COLLECTIONS.evidence,
      recordIds: input.evidenceRecordIds,
      ...(input.listInput ? { payloadFields: evidenceListPayloadFields, omitSearchText: true } : {}),
    });
    return records.filter((record) =>
      nonEmptyString(record.payload.id) && expectedIds.has(record.payload.id),
    );
  }

  // Compatibility fallback for injected scope readers that predate the batch
  // evidence keys. Preserve the old targeted record-id batch; never fan out by
  // payload id and never widen this path to a workspace evidence scan.
  const expectedIds = new Set(input.evidenceIds);
  const records = input.evidenceIds.length > 0
    ? await input.store.listRecords({
        limit: input.evidenceIds.length,
        workspaceId: input.workspaceId,
        collectionName: CONTACTS_LIVE_RECORD_COLLECTIONS.evidence,
        recordIds: input.evidenceIds,
        ...(input.listInput ? { payloadFields: evidenceListPayloadFields, omitSearchText: true } : {}),
      })
    : [];
  return records.filter((record) =>
    nonEmptyString(record.payload.id) && expectedIds.has(record.payload.id),
  );
}

function graphFromRecords(input: {
  contactRecords: readonly LiveRecord<Record<string, unknown>>[];
  connectionRecords: readonly LiveRecord<Record<string, unknown>>[];
  detailStateRecords?: readonly LiveRecord<Record<string, unknown>>[];
  actorId?: string;
  evidenceRecords: readonly LiveRecord<Record<string, unknown>>[];
  deferAmbiguity?: boolean;
}): LocalRemoteContactGraph {
  // Once explicitly initialized, Connection is the lifecycle authority. The
  // acquisition Contact and legacy detail state are not a second stage store.
  const parsedConnections = input.connectionRecords
    .map(connectionFromRecord)
    .filter((connection): connection is ConnectionDTO => connection !== null);
  const ownedConnections = input.actorId
    ? input.connectionRecords
        .filter(
          (record) =>
            contactRecordOwnedByActor(record, input.actorId!),
        )
        .map(connectionFromRecord)
        .filter((connection): connection is ConnectionDTO => connection !== null)
    : [];
  const connectionCandidatesByContactId = new Map<string, ConnectionDTO[]>();
  const ambiguousContactIds: string[] = [];
  for (const connection of ownedConnections) {
    const candidates = connectionCandidatesByContactId.get(connection.contactId) ?? [];
    candidates.push(connection);
    connectionCandidatesByContactId.set(connection.contactId, candidates);
  }
  for (const candidates of connectionCandidatesByContactId.values()) {
    if (candidates.length > 1 && candidates.some((connection) => connection.version !== undefined || connection.lifecycleInitialization !== undefined)) {
      ambiguousContactIds.push(candidates[0]!.contactId);
    }
  }
  if (ambiguousContactIds.length > 0 && !input.deferAmbiguity) {
    throw new Error("CONTACT_DETAIL_AMBIGUOUS_CONNECTION");
  }
  const canonicalConnections = new Map<string, ConnectionDTO>();
  const ambiguousContactIdSet = new Set(ambiguousContactIds);
  const contacts = input.contactRecords
    .map(contactFromRecord)
    .filter((contact): contact is ContactDTO => contact !== null);
  const contactsById = new Map(contacts.map((contact) => [contact.id, contact]));
  for (const [contactId, candidates] of connectionCandidatesByContactId) {
    const connection = candidates[0];
    const contact = contactsById.get(contactId);
    if (
      connection &&
      !ambiguousContactIdSet.has(contactId) &&
      (connection.version !== undefined || connection.lifecycleInitialization === "ready") &&
      contact?.lifecycleInitialization !== "pending" &&
      connection.lifecycleInitialization !== "pending" &&
      isConnectionStage(connection.stage)
    ) {
      canonicalConnections.set(contactId, connection);
    }
  }
  const customTagsByContactId = new Map<string, readonly string[]>();
  if (input.actorId) {
    for (const record of input.detailStateRecords ?? []) {
      const contactId = optionalString(record.payload.contactId);
      if (!contactId) continue;
      const state = contactDetailStateFromRecord(record, input.actorId, contactId);
      if (state) customTagsByContactId.set(contactId, state.tags);
    }
  }

  return {
    contacts: contacts
      .map((contact) => ({
        ...contact,
        ...(canonicalConnections.has(contact.id)
          ? { stage: canonicalConnections.get(contact.id)!.stage, updatedAt: canonicalConnections.get(contact.id)!.updatedAt }
          : {}),
        customTags: customTagsByContactId.get(contact.id) ?? [],
      })),
    connections: parsedConnections,
    evidence: input.evidenceRecords
      .map(evidenceFromRecord)
      .filter(
        (evidence): evidence is RelationshipEvidenceDTO => evidence !== null,
      ),
    generatedAt: latestTimestamp([
      ...input.contactRecords,
      ...input.connectionRecords,
      ...(input.detailStateRecords ?? []),
      ...input.evidenceRecords,
    ]),
    ...(ambiguousContactIds.length > 0 ? { ambiguousContactIds } : {}),
  };
}

async function readFocusedContactGraph(input: {
  actorId?: string;
  contactRecordPageReader?: ContactRecordPageReader;
  contactScopeRecordReader?: ContactScopeRecordReader;
  contactId?: string;
  listInput?: ContactsListSearchFilterInput;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}): Promise<BoundedContactGraph> {
  // Sprint 0101: an explicit id list is a focused read, never a list page.
  const requestedContactIds = input.listInput?.contactIds ?? undefined;
  const actorId = input.actorId?.trim();
  if (!actorId) {
    return graphFromRecords({
      contactRecords: [],
      connectionRecords: [],
      detailStateRecords: [],
      evidenceRecords: [],
    });
  }

  const boundedPage = input.listInput && input.contactRecordPageReader && !requestedContactIds
    ? await input.contactRecordPageReader(input.listInput, actorId)
    : null;
  const usesFastBoundedPage = boundedPage !== null && boundedPage.mode !== "fallback";
  const snapshotPage = boundedPage?.contactRecords ? boundedPage : null;
  const focusedIds = input.contactId ? [input.contactId] : boundedPage?.recordIds;
  const scope = snapshotPage
    ? null
    : input.contactScopeRecordReader
    ? requestedContactIds
      ? await input.contactScopeRecordReader(actorId, requestedContactIds, "domain")
      : await input.contactScopeRecordReader(actorId, focusedIds)
    : null;
  const legacyListQuery = input.listInput?.query?.trim().toLocaleLowerCase();
  const useLegacyListPrefilter =
    legacyListQuery !== undefined &&
    !snapshotPage &&
    scope === null;
  let contactRecords: readonly LiveRecord<Record<string, unknown>>[];
  let allConnectionRecords: readonly LiveRecord<Record<string, unknown>>[];
  let detailStateRecords: readonly LiveRecord<Record<string, unknown>>[];
  if (snapshotPage) {
    contactRecords = snapshotPage.contactRecords;
    allConnectionRecords = snapshotPage.connectionRecords;
    detailStateRecords = snapshotPage.detailStateRecords;
  } else {
    [contactRecords, allConnectionRecords, detailStateRecords] = await Promise.all([
      input.store.listRecords({
        limit: "unbounded",
        workspaceId: input.workspaceId,
        collectionName: CONTACTS_LIVE_RECORD_COLLECTIONS.contacts,
        ...(input.contactId ? { recordIds: [input.contactId] } : {}),
        ...(boundedPage ? { recordIds: boundedPage.recordIds } : {}),
        ...(scope?.contactIds ? { recordIds: scope.contactIds } : {}),
        ...(input.listInput
          ? {
              payloadFields: contactListPayloadFields,
              omitSearchText: !useLegacyListPrefilter,
            }
          : {}),
      }),
      input.store.listRecords({
        limit: "unbounded",
        workspaceId: input.workspaceId,
        collectionName: CONTACTS_LIVE_RECORD_COLLECTIONS.connections,
        ...(scope ? { recordIds: scope.connectionIds } : boundedPage ? { userId: actorId } : {}),
        ...(input.listInput ? { payloadFields: connectionListPayloadFields, omitSearchText: true } : {}),
      }),
      input.store.listRecords({
        limit: "unbounded",
        workspaceId: input.workspaceId,
        collectionName: CONTACTS_LIVE_RECORD_COLLECTIONS.detailStates,
        ...(scope ? { recordIds: scope.detailStateIds } : boundedPage ? { userId: actorId } : {}),
        ...(input.listInput ? { payloadFields: detailStateListPayloadFields, omitSearchText: true } : {}),
      }),
    ]);
  }
  const actorConnectionRecords = allConnectionRecords.filter(
    (record) =>
      contactRecordOwnedByActor(record, actorId),
  );
  const actorDetailStateRecords = detailStateRecords.filter(
    (record) => record.userId === actorId,
  );
  const legacyCustomTagContactIds = new Set(
    legacyListQuery
      ? actorDetailStateRecords
          .filter((record) =>
            stringArray(record.payload.tags).some((tag) =>
              tag.toLocaleLowerCase().includes(legacyListQuery),
            ),
          )
          .map((record) => record.payload.contactId)
          .filter(nonEmptyString)
      : [],
  );
  const legacyRelationshipContactIds = new Set(
    legacyListQuery
      ? actorConnectionRecords
          .filter((record) =>
            (record.searchText ?? "").toLocaleLowerCase().includes(legacyListQuery),
          )
          .map((record) => record.payload.contactId)
          .filter(nonEmptyString)
      : [],
  );
  const orderedContactRecords = usesFastBoundedPage
    ? boundedPage.recordIds
        .map((recordId) => contactRecords.find((record) => record.recordId === recordId))
        .filter((record): record is LiveRecord<Record<string, unknown>> => record !== undefined)
    : contactRecords;
  const allActorContactRecords = orderedContactRecords.filter(
    (record) => {
      const actorCanSeeContact =
        contactRecordOwnedByActor(record, actorId);
      if (!actorCanSeeContact || !useLegacyListPrefilter) return actorCanSeeContact;
      const contactId = optionalString(record.payload.id);
      return (
        (record.searchText ?? "").toLocaleLowerCase().includes(legacyListQuery) ||
        (contactId !== undefined &&
          (legacyCustomTagContactIds.has(contactId) ||
            legacyRelationshipContactIds.has(contactId)))
      );
    },
  );
  const allContacts = allActorContactRecords
    .map(contactFromRecord)
    .filter((contact): contact is ContactDTO => contact !== null);
  const allContactIds = new Set(allContacts.map((contact) => contact.id));
  const contactConnectionRecords = actorConnectionRecords.filter((record) => {
    const connection = connectionFromRecord(record);

    return connection ? allContactIds.has(connection.contactId) : false;
  });
  const allConnections = contactConnectionRecords
    .map(connectionFromRecord)
    .filter((connection): connection is ConnectionDTO => connection !== null);
  const allEvidenceIds = uniqueEvidenceIds(allContacts, allConnections);
  const allEvidenceRecords = snapshotPage
    ? snapshotPage.evidenceRecords
    : allEvidenceIds.length > 0
      ? await readEvidenceRecordsByDomainId({
          evidenceIds: allEvidenceIds,
          ...(scope?.evidenceRecordIds !== undefined
            ? { evidenceRecordIds: scope.evidenceRecordIds }
            : {}),
          listInput: input.listInput,
          store: input.store,
          workspaceId: input.workspaceId,
        })
      : [];

  const graph = graphFromRecords({
    actorId,
    contactRecords: allActorContactRecords,
    connectionRecords: contactConnectionRecords,
    detailStateRecords: actorDetailStateRecords,
    evidenceRecords: allEvidenceRecords,
    deferAmbiguity:
      Boolean(input.listInput?.query?.trim()) ||
      (input.listInput?.limit !== undefined && input.listInput.limit !== null),
  });
  if (boundedPage?.mode === "fallback") {
    return {
      ...graph,
      contactListFallback: {
        cursorScope: boundedPage.cursorScope ?? "",
        sortKeys: boundedPage.sortKeys ?? [],
      },
    };
  }
  return usesFastBoundedPage
    ? {
        ...graph,
        boundedPage: {
          ...(boundedPage.facetCounts ? { facetCounts: boundedPage.facetCounts } : {}),
          total: boundedPage.total,
          ...(boundedPage.nextCursor ? { nextCursor: boundedPage.nextCursor } : {}),
        },
      }
    : graph;
}

export interface OwnedContactDetailInputs {
  graph: LocalRemoteContactGraph;
  /** The owner's detail state per contact id (the record the detail read uses), or null. */
  detailStates: ReadonlyMap<string, LiveContactDetailState | null>;
}

/**
 * Sprint 0116: the detail inputs of many contacts in one batch, for the
 * contacts sync domain. The same selection as readContactGraphForContact (the
 * scoped key reader, owned contacts, owned relationships of those contacts, the
 * owner's detail state), read once for a whole sync page. Sources are limited
 * to rows the owner holds: an owner-less or foreign source cited by a contact
 * is left out of what a device receives.
 */
export async function readOwnedContactDetailInputs(input: {
  actorId: string;
  contactRecordIds: readonly string[];
  scopeReader: ContactScopeRecordReader;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}): Promise<OwnedContactDetailInputs> {
  const actorId = input.actorId.trim();
  if (!actorId || input.contactRecordIds.length === 0) {
    return { graph: graphFromRecords({ contactRecords: [], connectionRecords: [], detailStateRecords: [], evidenceRecords: [] }), detailStates: new Map() };
  }
  const scope = await input.scopeReader(actorId, input.contactRecordIds);
  const read = (collectionName: string, recordIds: readonly string[] | undefined) => recordIds && recordIds.length > 0
    // Bounded by the scoped id list itself.
    ? input.store.listRecords({ limit: recordIds.length, workspaceId: input.workspaceId, collectionName, recordIds })
    : Promise.resolve([] as readonly LiveRecord<Record<string, unknown>>[]);
  const [contactRecords, connectionRecords, detailStateRecords, evidenceRecords] = await Promise.all([
    read(CONTACTS_LIVE_RECORD_COLLECTIONS.contacts, scope.contactIds),
    read(CONTACTS_LIVE_RECORD_COLLECTIONS.connections, scope.connectionIds),
    read(CONTACTS_LIVE_RECORD_COLLECTIONS.detailStates, scope.detailStateIds),
    read(CONTACTS_LIVE_RECORD_COLLECTIONS.evidence, scope.evidenceRecordIds),
  ]);
  const ownedContacts = contactRecords.filter((record) => contactRecordOwnedByActor(record, actorId));
  const contactIds = new Set(ownedContacts.map((record) => optionalString(record.payload.id)).filter(nonEmptyString));
  const ownedConnections = connectionRecords.filter((record) => {
    const connection = contactRecordOwnedByActor(record, actorId) ? connectionFromRecord(record) : null;
    return connection ? contactIds.has(connection.contactId) : false;
  });
  const ownedDetailStates = detailStateRecords.filter((record) => record.userId === actorId);
  const citedIds = new Set([...ownedContacts, ...ownedConnections].flatMap((record) => stringArray(record.payload.evidenceIds)));
  const ownedEvidence = evidenceRecords.filter((record) => record.userId === actorId && nonEmptyString(record.payload.id) && citedIds.has(record.payload.id));
  const graph = graphFromRecords({
    actorId,
    contactRecords: ownedContacts,
    connectionRecords: ownedConnections,
    detailStateRecords: ownedDetailStates,
    evidenceRecords: ownedEvidence,
    deferAmbiguity: true,
  });
  const byRecordId = new Map(ownedDetailStates.map((record) => [record.recordId, record]));
  const detailStates = new Map<string, LiveContactDetailState | null>();
  for (const contactId of contactIds) {
    detailStates.set(contactId, contactDetailStateFromRecord(byRecordId.get(contactDetailStateRecordId(actorId, contactId)) ?? null, actorId, contactId));
  }
  return { graph, detailStates };
}

// Preserve the graph-resolved export used by existing callers while the
// implementation lives in its own single-snapshot reader module.
export const createPostgresContactRecordPageReader = createPostgresContactListPageReader;

export function createStorageContactGraphProvider({
  contactRecordPageReader,
  contactScopeRecordReader,
  source,
  sourceLabel = "Contacts shared live storage",
  store,
  workspaceId,
}: StorageContactGraphProviderOptions): LiveContactsGraphProvider {
  /**
   * W0046／W0058：AI 写回专长／需求／话题（publicProfile.offering／seeking／topics）。只接受这三个列表字段、
   * 来源 ai + 指定 via；逐项过 canWriteEnrichedValue（完整来源判定），一次条件更新；没有可写项时不写。
   * 条件更新冲突：`retries` 次以内重读重算，仍冲突抛 AppError CONFLICT。
   */
  async function applyProfileListValues(input: {
    contactId: string;
    actorId: string;
    values: readonly EnrichedValue[];
    at: string;
    via: "memo_extraction" | "card_inference";
    retries: number;
  }): Promise<AppliedEnrichmentField[]> {
    const normalizedActorId = input.actorId.trim();
    const normalizedContactId = input.contactId.trim();
    if (!normalizedActorId || !normalizedContactId) {
      throw new Error("Profile write-back requires actor and contact identifiers.");
    }
    const allowed = input.values.filter((entry) =>
      (entry.field === "offering" || entry.field === "seeking" || entry.field === "topics") && entry.origin === "ai" && entry.via === input.via);
    if (!store.updateRecordIfCurrent) {
      throw new AppError("SERVICE_UNAVAILABLE", "Contact storage requires conditional update support.");
    }
    for (let attempt = 0; ; attempt += 1) {
      const contactRecord = await store.getRecord({
        workspaceId,
        collectionName: CONTACTS_LIVE_RECORD_COLLECTIONS.contacts,
        recordId: normalizedContactId,
      });
      if (!contactRecord || !contactRecordOwnedByActor(contactRecord, normalizedActorId)) {
        throw new Error("Profile write-back is outside the actor boundary.");
      }
      const nextPayload: Record<string, unknown> = { ...contactRecord.payload };
      const written = applyEnrichedValues(nextPayload, allowed, input.at);
      if (!written.length) return [];
      const updatedAt = new Date(Math.max(Date.now(), Date.parse(contactRecord.updatedAt) + 1)).toISOString();
      nextPayload.updatedAt = updatedAt;
      const record = await store.updateRecordIfCurrent({ ...contactRecord, updatedAt, payload: nextPayload }, {
        userId: contactRecord.userId ?? null,
        updatedAt: contactRecord.updatedAt,
      });
      if (record) return written;
      if (attempt >= input.retries) {
        throw new AppError("CONFLICT", input.via === "memo_extraction"
          ? "Contact changed while applying memo extraction."
          : "Contact changed while applying card inference.");
      }
    }
  }

  return {
    source: source ?? `live-record-store:contacts:${workspaceId}`,
    sourceLabel,
    readContactGraph(actorId): Promise<LocalRemoteContactGraph> {
      return readFocusedContactGraph({
        actorId,
        contactScopeRecordReader,
        store,
        workspaceId,
      });
    },
    readContactGraphForList(input, actorId) {
      return readFocusedContactGraph({
        actorId,
        contactRecordPageReader,
        contactScopeRecordReader,
        listInput: input,
        store,
        workspaceId,
      });
    },
    readContactGraphForContact(contactId: string, actorId?: string) {
      return readFocusedContactGraph({
        actorId,
        contactId: contactId.trim(),
        contactScopeRecordReader,
        store,
        workspaceId,
      });
    },
    async readContactDetailState(contactId: string, actorId: string) {
      const normalizedActorId = actorId.trim();
      const normalizedContactId = contactId.trim();
      if (!normalizedActorId || !normalizedContactId) {
        return null;
      }
      const record = await store.getRecord({
        workspaceId,
        collectionName: CONTACTS_LIVE_RECORD_COLLECTIONS.detailStates,
        recordId: contactDetailStateRecordId(
          normalizedActorId,
          normalizedContactId,
        ),
      });

      return contactDetailStateFromRecord(
        record,
        normalizedActorId,
        normalizedContactId,
      );
    },
    async upsertContactDetailState(state: LiveContactDetailState, expected?: { updatedAt: string } | null) {
      const actorId = state.actorId.trim();
      const contactId = state.contactId.trim();
      if (!actorId || !contactId) {
        throw new Error(
          "Contact detail state requires an actor and contact identifier.",
        );
      }
      const recordId = contactDetailStateRecordId(actorId, contactId);
      const existing = await store.getRecord({
        workspaceId,
        collectionName: CONTACTS_LIVE_RECORD_COLLECTIONS.detailStates,
        recordId,
        includeDeleted: true,
      });
      const existingActive = existing && existing.lifecycleState !== "deleted" ? existing : null;
      // W0046：乐观锁——调用方读到的版本必须仍是当前版本，否则 CONFLICT（由详情服务重读合并后重试）。
      if (expected !== undefined) {
        const current = contactDetailStateFromRecord(existingActive, actorId, contactId);
        if (expected === null ? current !== null : current?.updatedAt !== expected.updatedAt) {
          throw new AppError("CONFLICT", "Contact detail state changed. Re-read and merge.");
        }
      }
      // 版本时间严格递增（CAS 前提，也让并发写入有先后）。
      const updatedAt = existing
        ? new Date(Math.max(Date.parse(state.updatedAt), Date.parse(existing.updatedAt) + 1)).toISOString()
        : state.updatedAt;
      const nextRecord = {
        workspaceId,
        collectionName: CONTACTS_LIVE_RECORD_COLLECTIONS.detailStates,
        recordId,
        userId: actorId,
        sourceType: "manual",
        sourceId: `contact-detail:${contactId}`,
        sourceLabel: sourceLabel,
        provider: source ?? `live-record-store:contacts:${workspaceId}`,
        providerRecordId: contactId,
        evidenceIds: [],
        targetType: "contact",
        targetId: contactId,
        occurredAt: updatedAt,
        createdAt: existing?.createdAt ?? updatedAt,
        updatedAt,
        deletedAt: null,
        lifecycleState: "active" as const,
        searchText: [
          state.status,
          ...state.tags,
          ...state.notes.map((note) => note.body),
          state.lastInteraction?.summary ?? "",
        ].join(" "),
        payload: {
          actorId,
          contactId,
          tags: [...state.tags],
          status: state.status,
          notes: state.notes.map((note) => ({ ...note })),
          lastInteraction: state.lastInteraction
            ? { ...state.lastInteraction }
            : undefined,
          updatedAt,
        },
      };
      let record;
      if (expected !== undefined && existingActive && store.updateRecordIfCurrent) {
        record = await store.updateRecordIfCurrent(nextRecord, { userId: existingActive.userId ?? null, updatedAt: existingActive.updatedAt });
        if (!record) throw new AppError("CONFLICT", "Contact detail state changed. Re-read and merge.");
      } else if (expected === null && !existing && store.insertRecordIfAbsent) {
        record = await store.insertRecordIfAbsent(nextRecord);
        if (!record) throw new AppError("CONFLICT", "Contact detail state changed. Re-read and merge.");
      } else {
        record = await store.upsertRecord(nextRecord);
      }
      const persisted = contactDetailStateFromRecord(record, actorId, contactId);
      if (!persisted) {
        throw new Error("Persisted contact detail state failed validation.");
      }

      return persisted;
    },
    async updateContactPrimaryIndustry(
      contactId: string,
      actorId: string,
      primaryIndustryId: IndustryIdCode | null,
      secondaryIndustryId?: SecondaryIndustryIdCode | null,
    ) {
      const normalizedActorId = actorId.trim();
      const normalizedContactId = contactId.trim();
      if (!normalizedActorId || !normalizedContactId) {
        throw new Error("Contact industry update requires actor and contact identifiers.");
      }
      const contactRecord = await store.getRecord({
        workspaceId,
        collectionName: CONTACTS_LIVE_RECORD_COLLECTIONS.contacts,
        recordId: normalizedContactId,
      });
      const actorCanEdit =
        contactRecord && contactRecordOwnedByActor(contactRecord, normalizedActorId);
      if (!contactRecord || !actorCanEdit) {
        throw new Error("Contact industry update is outside the actor boundary.");
      }
      const nextPayload = { ...contactRecord.payload };
      const selection = mergeIndustrySelection(contactFromRecord(contactRecord) ?? {}, {
        primaryIndustryId,
        secondaryIndustryId,
      });
      if (!validateIndustrySelection(selection).valid) {
        throw new Error("Contact industry selection is invalid.");
      }
      if (primaryIndustryId) {
        nextPayload.primaryIndustryId = primaryIndustryId;
      } else {
        delete nextPayload.primaryIndustryId;
      }
      if (selection.secondaryIndustryId) {
        nextPayload.secondaryIndustryId = selection.secondaryIndustryId;
      } else {
        delete nextPayload.secondaryIndustryId;
      }
      const updatedAt = new Date(Math.max(Date.now(), Date.parse(contactRecord.updatedAt) + 1)).toISOString();
      nextPayload.updatedAt = updatedAt;
      // W0045：联系人编辑里改（含清空）行业 = 用户值，补全不再覆盖。
      nextPayload.enrichment = withEnrichmentProvenance(readStoredEnrichment(nextPayload.enrichment), "industry", {
        origin: "user",
        updatedAt,
        via: "contact_edit",
      });
      const nextRecord = {
        ...contactRecord,
        updatedAt,
        searchText: [contactRecord.searchText, primaryIndustryId ?? ""]
          .filter(Boolean)
          .join(" "),
        payload: nextPayload,
      };
      if (!store.updateRecordIfCurrent) {
        throw new AppError("SERVICE_UNAVAILABLE", "Contact storage requires conditional update support.");
      }
      const record = await store.updateRecordIfCurrent(nextRecord, {
        userId: contactRecord.userId ?? null,
        updatedAt: contactRecord.updatedAt,
      });
      if (!record) throw new AppError("CONFLICT", "Contact changed. Refresh and retry your edit.");
      const contact = contactFromRecord(record);
      if (!contact) {
        throw new Error("Persisted contact industry failed validation.");
      }

      return contact;
    },
    async updateContactEnrichment(contactId: string, actorId: string, update: ContactEnrichmentEdit) {
      const normalizedActorId = actorId.trim();
      const normalizedContactId = contactId.trim();
      if (!normalizedActorId || !normalizedContactId) {
        throw new Error("Contact enrichment update requires actor and contact identifiers.");
      }
      const contactRecord = await store.getRecord({
        workspaceId,
        collectionName: CONTACTS_LIVE_RECORD_COLLECTIONS.contacts,
        recordId: normalizedContactId,
      });
      if (!contactRecord || !contactRecordOwnedByActor(contactRecord, normalizedActorId)) {
        throw new Error("Contact enrichment update is outside the actor boundary.");
      }
      const seniorityLevel = update.seniorityLevel;
      if (seniorityLevel !== undefined && seniorityLevel !== null && !isSeniorityLevel(seniorityLevel)) {
        throw new Error("Contact seniority level is invalid.");
      }
      const region = update.region === undefined || update.region === null
        ? update.region
        : normalizeRegion(update.region.countryCode, update.region.city ?? null);
      if (region === null && update.region !== null && update.region !== undefined) {
        throw new Error("Contact region is invalid.");
      }
      if (update.industry && !validateIndustrySelection(update.industry).valid) {
        throw new Error("Contact industry selection is invalid.");
      }
      const nextPayload: Record<string, unknown> = { ...contactRecord.payload };
      const updatedAt = new Date(Math.max(Date.now(), Date.parse(contactRecord.updatedAt) + 1)).toISOString();
      let enrichment = readStoredEnrichment(nextPayload.enrichment);
      const provenance = { origin: "user" as const, updatedAt, via: "contact_edit" as const };
      let searchText = contactRecord.searchText;
      if (update.industry) {
        if (update.industry.primaryIndustryId) nextPayload.primaryIndustryId = update.industry.primaryIndustryId;
        else delete nextPayload.primaryIndustryId;
        if (update.industry.primaryIndustryId && update.industry.secondaryIndustryId) nextPayload.secondaryIndustryId = update.industry.secondaryIndustryId;
        else delete nextPayload.secondaryIndustryId;
        enrichment = withEnrichmentProvenance(enrichment, "industry", provenance);
        // 与 updateContactPrimaryIndustry 同口径：行业 id 追加进 searchText。
        searchText = [contactRecord.searchText, update.industry.primaryIndustryId ?? ""].filter(Boolean).join(" ");
      }
      if (seniorityLevel !== undefined) {
        const profile = isRecord(nextPayload.publicProfile) ? { ...nextPayload.publicProfile } : {};
        if (seniorityLevel) profile.seniorityLevel = seniorityLevel;
        else delete profile.seniorityLevel;
        nextPayload.publicProfile = profile;
        enrichment = withEnrichmentProvenance(enrichment, "seniorityLevel", provenance);
      }
      if (region !== undefined) {
        if (region) nextPayload.region = region;
        else delete nextPayload.region;
        enrichment = withEnrichmentProvenance(enrichment, "region", provenance);
      }
      if (enrichment) nextPayload.enrichment = enrichment;
      nextPayload.updatedAt = updatedAt;
      if (!store.updateRecordIfCurrent) {
        throw new AppError("SERVICE_UNAVAILABLE", "Contact storage requires conditional update support.");
      }
      const record = await store.updateRecordIfCurrent({ ...contactRecord, updatedAt, searchText, payload: nextPayload }, {
        userId: contactRecord.userId ?? null,
        updatedAt: contactRecord.updatedAt,
      });
      if (!record) throw new AppError("CONFLICT", "Contact changed. Refresh and retry your edit.");
      const contact = contactFromRecord(record);
      if (!contact) {
        throw new Error("Persisted contact enrichment failed validation.");
      }
      return contact;
    },
    async applyContactMemoExtraction(contactId: string, actorId: string, values: readonly EnrichedValue[], at: string) {
      return applyProfileListValues({ actorId, at, contactId, retries: 0, values, via: "memo_extraction" });
    },
    async applyContactCardInference(contactId: string, actorId: string, values: readonly EnrichedValue[], at: string) {
      // W0058（G-10）：条件更新冲突后重读、最多再试 2 次（不调用模型）。
      return applyProfileListValues({ actorId, at, contactId, retries: CARD_INFERENCE_WRITE_RETRIES, values, via: "card_inference" });
    },
  };
}

export function createConfiguredStorageContactGraphProvider({
  env,
  sourceLabel = "Contacts Postgres live storage",
}: ConfiguredStorageContactGraphProviderOptions = {}): LiveContactsGraphProvider | null {
  const config = resolveLiveDatabaseConnectionConfig(env);

  if (!config) {
    return null;
  }

  const canUseDefaultCache =
    env === undefined && sourceLabel === "Contacts Postgres live storage";
  const cacheKey = `${config.connectionString}\u0000${config.workspaceId}`;

  if (canUseDefaultCache && cachedDefaultProvider?.key === cacheKey) {
    return cachedDefaultProvider.provider;
  }

  const configuredStore = createConfiguredPostgresLiveRecordStore({
    env,
  });

  if (!configuredStore) {
    return null;
  }

  const provider = createStorageContactGraphProvider({
    contactScopeRecordReader: createPostgresContactScopeRecordReader({
      client: configuredStore.client,
      workspaceId: configuredStore.workspaceId,
    }),
    contactRecordPageReader: createPostgresContactRecordPageReader({
      client: configuredStore.client,
      workspaceId: configuredStore.workspaceId,
    }),
    source: `postgres-live-record-store:contacts:${config.workspaceId}`,
    sourceLabel,
    store: configuredStore.store,
    workspaceId: configuredStore.workspaceId,
  });

  if (canUseDefaultCache) {
    cachedDefaultProvider = {
      key: cacheKey,
      provider,
    };
  }

  return provider;
}
