import { AppError } from "../../../shared/errors/app-error";
import { contactRecordOwnedByActor } from "./contact-read-authorization";

import type {
  ConnectionDTO,
  ContactDTO,
  RelationshipEvidenceDTO,
} from "../../../shared/domain/contracts";
import type { IndustryIdCode, SecondaryIndustryIdCode } from "../../../shared/contract/industries";
import { isIndustryIdCode, mergeIndustrySelection, validateIndustrySelection } from "../../../shared/domain/industries";
import {
  isNetworkCategory,
  isConnectionStage,
  isRelationshipStage,
  isRelationshipTrustLevel,
  isRelationshipValueType,
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
  const actorId = input.actorId?.trim();
  if (!actorId) {
    return graphFromRecords({
      contactRecords: [],
      connectionRecords: [],
      detailStateRecords: [],
      evidenceRecords: [],
    });
  }

  const boundedPage = input.listInput && input.contactRecordPageReader
    ? await input.contactRecordPageReader(input.listInput, actorId)
    : null;
  const usesFastBoundedPage = boundedPage !== null && boundedPage.mode !== "fallback";
  const snapshotPage = boundedPage?.contactRecords ? boundedPage : null;
  const focusedIds = input.contactId ? [input.contactId] : boundedPage?.recordIds;
  const scope = snapshotPage
    ? null
    : input.contactScopeRecordReader
    ? await input.contactScopeRecordReader(actorId, focusedIds)
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
    async upsertContactDetailState(state: LiveContactDetailState) {
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
      const record = await store.upsertRecord({
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
        occurredAt: state.updatedAt,
        createdAt: existing?.createdAt ?? state.updatedAt,
        updatedAt: state.updatedAt,
        deletedAt: null,
        lifecycleState: "active",
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
          updatedAt: state.updatedAt,
        },
      });
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
