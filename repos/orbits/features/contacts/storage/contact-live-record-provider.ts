import type {
  ConnectionDTO,
  ContactDTO,
  RelationshipEvidenceDTO,
} from "../../../shared/domain/contracts";
import {
  isRelationshipStage,
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
import type { LiveContactsGraphProvider } from "../live-service";
import type { LocalRemoteContactGraph } from "../contacts-list-search-and-filter-mock/providers/contact-local-remote-provider";

export const CONTACTS_LIVE_RECORD_COLLECTIONS = {
  connections: "connections",
  contacts: "contacts",
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
  contactId?: string;
  listInput?: ContactsListSearchFilterInput;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}): Promise<LocalRemoteContactGraph> {
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
  const contacts = contactRecords
    .map(contactFromRecord)
    .filter((contact): contact is ContactDTO => contact !== null);
  const contactIds = new Set(contacts.map((contact) => contact.id));
  const connectionRecords = allConnectionRecords.filter((record) => {
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
    contactRecords,
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
    async readContactGraph(): Promise<LocalRemoteContactGraph> {
      const [contactRecords, connectionRecords, evidenceRecords] =
        await Promise.all([
          store.listRecords({
            workspaceId,
            collectionName: CONTACTS_LIVE_RECORD_COLLECTIONS.contacts,
          }),
          store.listRecords({
            workspaceId,
            collectionName: CONTACTS_LIVE_RECORD_COLLECTIONS.connections,
          }),
          store.listRecords({
            workspaceId,
            collectionName: CONTACTS_LIVE_RECORD_COLLECTIONS.evidence,
          }),
        ]);

      return graphFromRecords({
        contactRecords,
        connectionRecords,
        evidenceRecords,
      });
    },
    readContactGraphForList(input = {}) {
      return readFocusedContactGraph({
        listInput: input,
        store,
        workspaceId,
      });
    },
    readContactGraphForContact(contactId: string) {
      return readFocusedContactGraph({
        contactId: contactId.trim(),
        store,
        workspaceId,
      });
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
