import type {
  ConnectionDTO,
  ContactDTO,
  RelationshipEvidenceDTO,
} from "../../../shared/domain/contracts";
import {
  isNetworkCategory,
  isRelationshipStage,
  isRelationshipTrustLevel,
  isRelationshipValueType,
  isSourceType,
} from "../../../shared/domain/source-types";
import {
  resolveLiveDatabaseConnectionConfig,
  type LiveDatabaseEnv,
} from "../../../shared/storage/live-database-config";
import { createConfiguredPostgresLiveRecordStore } from "../../../shared/storage/configured-live-record-store";
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

export const CONTACTS_LIVE_RECORD_COLLECTIONS = {
  connections: "connections",
  contacts: "contacts",
  detailStates: "contact_detail_states",
  evidence: "evidence",
} as const;

export interface StorageContactGraphProviderOptions {
  source?: string;
  sourceLabel?: string;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
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
    personId: optionalString(payload.personId),
    displayName: payload.displayName,
    organization: optionalString(payload.organization),
    role: optionalString(payload.role),
    location: optionalString(payload.location),
    primaryEmail: optionalString(payload.primaryEmail),
    primaryPhone: optionalString(payload.primaryPhone),
    profileSnippet: optionalString(payload.profileSnippet),
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
    nextAction: isRecord(payload.nextAction) && nonEmptyString(payload.nextAction.text)
      ? {
          text: payload.nextAction.text,
          reason: optionalString(payload.nextAction.reason),
          evidenceId: optionalString(payload.nextAction.evidenceId),
        }
      : undefined,
    stage: payload.stage,
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

function graphFromRecords(input: {
  contactRecords: readonly LiveRecord<Record<string, unknown>>[];
  connectionRecords: readonly LiveRecord<Record<string, unknown>>[];
  evidenceRecords: readonly LiveRecord<Record<string, unknown>>[];
}): LocalRemoteContactGraph {
  return {
    contacts: input.contactRecords
      .map(contactFromRecord)
      .filter((contact): contact is ContactDTO => contact !== null),
    connections: input.connectionRecords
      .map(connectionFromRecord)
      .filter((connection): connection is ConnectionDTO => connection !== null),
    evidence: input.evidenceRecords
      .map(evidenceFromRecord)
      .filter(
        (evidence): evidence is RelationshipEvidenceDTO => evidence !== null,
      ),
    generatedAt: latestTimestamp([
      ...input.contactRecords,
      ...input.connectionRecords,
      ...input.evidenceRecords,
    ]),
  };
}

async function readFocusedContactGraph(input: {
  actorId?: string;
  contactId?: string;
  listInput?: ContactsListSearchFilterInput;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}): Promise<LocalRemoteContactGraph> {
  const actorId = input.actorId?.trim();
  if (!actorId) {
    return graphFromRecords({
      contactRecords: [],
      connectionRecords: [],
      evidenceRecords: [],
    });
  }

  const query = input.listInput?.query?.trim();
  const [contactRecords, allConnectionRecords] = await Promise.all([
    input.store.listRecords({
      workspaceId: input.workspaceId,
      collectionName: CONTACTS_LIVE_RECORD_COLLECTIONS.contacts,
      ...(input.contactId ? { recordIds: [input.contactId] } : {}),
      ...(query ? { searchText: query } : {}),
    }),
    input.store.listRecords({
      workspaceId: input.workspaceId,
      collectionName: CONTACTS_LIVE_RECORD_COLLECTIONS.connections,
    }),
  ]);
  const actorConnectionRecords = allConnectionRecords.filter(
    (record) =>
      record.userId === actorId ||
      record.payload.accountId === actorId,
  );
  const actorContactIds = new Set(
    actorConnectionRecords
      .map((record) => record.payload.contactId)
      .filter(nonEmptyString),
  );
  const actorContactRecords = contactRecords.filter(
    (record) =>
      record.userId === actorId ||
      (nonEmptyString(record.payload.id) &&
        actorContactIds.has(record.payload.id)),
  );
  const contacts = actorContactRecords
    .map(contactFromRecord)
    .filter((contact): contact is ContactDTO => contact !== null);
  const contactIds = new Set(contacts.map((contact) => contact.id));
  const connectionRecords = actorConnectionRecords.filter((record) => {
    const connection = connectionFromRecord(record);

    return connection ? contactIds.has(connection.contactId) : false;
  });
  const connections = connectionRecords
    .map(connectionFromRecord)
    .filter((connection): connection is ConnectionDTO => connection !== null);
  const evidenceRecordIds = uniqueEvidenceIds(contacts, connections);
  const evidenceRecords =
    evidenceRecordIds.length > 0
      ? await input.store.listRecords({
          workspaceId: input.workspaceId,
          collectionName: CONTACTS_LIVE_RECORD_COLLECTIONS.evidence,
          recordIds: evidenceRecordIds,
        })
      : [];

  return graphFromRecords({
    contactRecords: actorContactRecords,
    connectionRecords,
    evidenceRecords,
  });
}

export function createStorageContactGraphProvider({
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
        store,
        workspaceId,
      });
    },
    readContactGraphForList(input, actorId) {
      return readFocusedContactGraph({
        actorId,
        listInput: input,
        store,
        workspaceId,
      });
    },
    readContactGraphForContact(contactId: string, actorId?: string) {
      return readFocusedContactGraph({
        actorId,
        contactId: contactId.trim(),
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
