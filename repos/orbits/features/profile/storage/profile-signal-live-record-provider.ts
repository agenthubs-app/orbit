import type {
  ConnectionDTO,
  ContactDTO,
  InteractionMemoryDTO,
  MessageDTO,
  RelationshipEvidenceDTO,
  UserProfileDTO,
} from "../../../shared/domain/contracts";
import type { SourceReferenceDTO } from "../../../shared/domain/source-types";
import { createConfiguredPostgresLiveRecordStore } from "../../../shared/storage/configured-live-record-store";
import {
  resolveLiveDatabaseConnectionConfig,
  type LiveDatabaseEnv,
} from "../../../shared/storage/live-database-config";
import type {
  LiveRecord,
  LiveRecordStoreLike,
} from "../../../shared/storage/live-record-store";

export interface LiveProfileSignalProfileRecord extends UserProfileDTO {
  headline?: string;
  homeMarket?: string;
  organization?: string;
  preferredFollowUpWindow?: string;
  preferredIntroChannels?: readonly string[];
  relationshipGoal?: string;
  targetRelationshipTypes?: readonly string[];
  evidenceIds: readonly string[];
}

export interface LiveProfileSignalGraph {
  connections: readonly ConnectionDTO[];
  contacts: readonly ContactDTO[];
  evidence: readonly RelationshipEvidenceDTO[];
  generatedAt: string;
  interactionMemories: readonly InteractionMemoryDTO[];
  messages: readonly MessageDTO[];
  profiles: readonly LiveProfileSignalProfileRecord[];
}

export type LiveProfileSignalProviderResult<TResult> = TResult | Promise<TResult>;

export interface LiveProfileSignalProvider {
  source: string;
  sourceLabel: string;
  readSignalGraph: () => LiveProfileSignalProviderResult<LiveProfileSignalGraph>;
}

export const PROFILE_SIGNAL_LIVE_RECORD_COLLECTIONS = {
  connections: "connections",
  contacts: "contacts",
  evidence: "evidence",
  interactionMemories: "interactionMemories",
  messages: "messages",
  profiles: "profiles",
} as const;

export interface StorageProfileSignalProviderOptions {
  source?: string;
  sourceLabel?: string;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}

export interface ConfiguredStorageProfileSignalProviderOptions {
  env?: LiveDatabaseEnv;
  sourceLabel?: string;
}

interface CachedConfiguredStorageProfileSignalProvider {
  key: string;
  provider: LiveProfileSignalProvider;
}

let cachedDefaultProvider: CachedConfiguredStorageProfileSignalProvider | null =
  null;

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

function evidenceIdsFromRecord(
  record: LiveRecord<Record<string, unknown>>,
): readonly string[] {
  if (record.evidenceIds.length > 0) {
    return record.evidenceIds;
  }

  return stringArray(record.payload.evidenceIds);
}

function sourceFromValue(value: unknown): SourceReferenceDTO | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    !nonEmptyString(value.type) ||
    !nonEmptyString(value.id) ||
    !nonEmptyString(value.label)
  ) {
    return null;
  }

  return {
    type: value.type as SourceReferenceDTO["type"],
    id: value.id,
    label: value.label,
  };
}

function profileFromRecord(
  record: LiveRecord<Record<string, unknown>>,
): LiveProfileSignalProfileRecord | null {
  const payload = record.payload;

  if (
    !nonEmptyString(payload.id) ||
    !nonEmptyString(payload.accountId) ||
    !nonEmptyString(payload.displayName) ||
    !nonEmptyString(payload.createdAt) ||
    !nonEmptyString(payload.updatedAt)
  ) {
    return null;
  }

  return {
    id: payload.id,
    accountId: payload.accountId,
    displayName: payload.displayName,
    role: optionalString(payload.role),
    timezone: optionalString(payload.timezone),
    headline: optionalString(payload.headline),
    homeMarket: optionalString(payload.homeMarket),
    organization: optionalString(payload.organization),
    preferredFollowUpWindow: optionalString(payload.preferredFollowUpWindow),
    preferredIntroChannels: stringArray(payload.preferredIntroChannels),
    relationshipGoal: optionalString(payload.relationshipGoal),
    targetRelationshipTypes: stringArray(payload.targetRelationshipTypes),
    evidenceIds: evidenceIdsFromRecord(record),
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
  };
}

function contactFromRecord(
  record: LiveRecord<Record<string, unknown>>,
): ContactDTO | null {
  const payload = record.payload;
  const source = sourceFromValue(payload.source);

  if (
    !nonEmptyString(payload.id) ||
    !nonEmptyString(payload.displayName) ||
    !nonEmptyString(payload.stage) ||
    !nonEmptyString(payload.createdAt) ||
    !nonEmptyString(payload.updatedAt) ||
    source === null
  ) {
    return null;
  }

  const evidenceIds = evidenceIdsFromRecord(record);

  if (evidenceIds.length === 0) {
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
    stage: payload.stage as ContactDTO["stage"],
    source,
    evidenceIds: evidenceIds as ContactDTO["evidenceIds"],
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
  };
}

function connectionFromRecord(
  record: LiveRecord<Record<string, unknown>>,
): ConnectionDTO | null {
  const payload = record.payload;
  const source = sourceFromValue(payload.source);

  if (
    !nonEmptyString(payload.id) ||
    !nonEmptyString(payload.accountId) ||
    !nonEmptyString(payload.contactId) ||
    !nonEmptyString(payload.stage) ||
    !nonEmptyString(payload.summary) ||
    !nonEmptyString(payload.createdAt) ||
    !nonEmptyString(payload.updatedAt) ||
    source === null
  ) {
    return null;
  }

  const evidenceIds = evidenceIdsFromRecord(record);

  if (evidenceIds.length === 0) {
    return null;
  }

  return {
    id: payload.id,
    accountId: payload.accountId,
    contactId: payload.contactId,
    stage: payload.stage as ConnectionDTO["stage"],
    valueTypes: stringArray(payload.valueTypes) as ConnectionDTO["valueTypes"],
    summary: payload.summary,
    relationshipStrength:
      typeof payload.relationshipStrength === "number"
        ? payload.relationshipStrength
        : undefined,
    trustLevel: nonEmptyString(payload.trustLevel)
      ? (payload.trustLevel as ConnectionDTO["trustLevel"])
      : undefined,
    businessRelevanceScore:
      typeof payload.businessRelevanceScore === "number"
        ? payload.businessRelevanceScore
        : undefined,
    sharedTopics: stringArray(payload.sharedTopics),
    suggestedActions: stringArray(payload.suggestedActions),
    source,
    evidenceIds: evidenceIds as ConnectionDTO["evidenceIds"],
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
  };
}

function messageFromRecord(
  record: LiveRecord<Record<string, unknown>>,
): MessageDTO | null {
  const payload = record.payload;
  const source = sourceFromValue(payload.source);

  if (
    !nonEmptyString(payload.id) ||
    !nonEmptyString(payload.conversationId) ||
    !nonEmptyString(payload.direction) ||
    !nonEmptyString(payload.body) ||
    !nonEmptyString(payload.occurredAt) ||
    !nonEmptyString(payload.createdBy) ||
    source === null
  ) {
    return null;
  }

  const evidenceIds = evidenceIdsFromRecord(record);

  if (evidenceIds.length === 0) {
    return null;
  }

  return {
    id: payload.id,
    conversationId: payload.conversationId,
    direction: payload.direction as MessageDTO["direction"],
    body: payload.body,
    occurredAt: payload.occurredAt,
    createdBy: payload.createdBy,
    source,
    evidenceIds: evidenceIds as MessageDTO["evidenceIds"],
  };
}

function interactionMemoryFromRecord(
  record: LiveRecord<Record<string, unknown>>,
): InteractionMemoryDTO | null {
  const payload = record.payload;
  const source = sourceFromValue(payload.source);

  if (
    !nonEmptyString(payload.id) ||
    !nonEmptyString(payload.contactId) ||
    !nonEmptyString(payload.memoryType) ||
    !nonEmptyString(payload.summary) ||
    !nonEmptyString(payload.occurredAt) ||
    !nonEmptyString(payload.createdAt) ||
    typeof payload.confidence !== "number" ||
    source === null
  ) {
    return null;
  }

  const evidenceIds = evidenceIdsFromRecord(record);

  if (evidenceIds.length === 0) {
    return null;
  }

  return {
    id: payload.id,
    contactId: payload.contactId,
    connectionId: optionalString(payload.connectionId),
    conversationId: optionalString(payload.conversationId),
    messageId: optionalString(payload.messageId),
    memoryType: payload.memoryType as InteractionMemoryDTO["memoryType"],
    summary: payload.summary,
    occurredAt: payload.occurredAt,
    confidence: payload.confidence,
    source,
    evidenceIds: evidenceIds as InteractionMemoryDTO["evidenceIds"],
    createdAt: payload.createdAt,
  };
}

function evidenceFromRecord(
  record: LiveRecord<Record<string, unknown>>,
): RelationshipEvidenceDTO | null {
  const payload = record.payload;

  if (
    !nonEmptyString(payload.id) ||
    !nonEmptyString(payload.sourceType) ||
    !nonEmptyString(payload.sourceId) ||
    !nonEmptyString(payload.summary) ||
    !nonEmptyString(payload.occurredAt) ||
    !nonEmptyString(payload.createdBy) ||
    typeof payload.confidence !== "number"
  ) {
    return null;
  }

  return {
    id: payload.id,
    sourceType: payload.sourceType as RelationshipEvidenceDTO["sourceType"],
    sourceId: payload.sourceId,
    summary: payload.summary,
    occurredAt: payload.occurredAt,
    confidence: payload.confidence,
    createdBy: payload.createdBy,
  };
}

function latestTimestamp(
  records: readonly LiveRecord<Record<string, unknown>>[],
): string {
  return (
    records
      .map((record) => record.updatedAt)
      .filter(nonEmptyString)
      .sort()
      .at(-1) ?? new Date(0).toISOString()
  );
}

export function createStorageProfileSignalProvider({
  source,
  sourceLabel = "Profile signal shared live storage",
  store,
  workspaceId,
}: StorageProfileSignalProviderOptions): LiveProfileSignalProvider {
  return {
    source: source ?? `live-record-store:profile-signals:${workspaceId}`,
    sourceLabel,
    async readSignalGraph(): Promise<LiveProfileSignalGraph> {
      const [
        profileRecords,
        contactRecords,
        connectionRecords,
        messageRecords,
        interactionMemoryRecords,
        evidenceRecords,
      ] = await Promise.all([
        store.listRecords({
          workspaceId,
          collectionName: PROFILE_SIGNAL_LIVE_RECORD_COLLECTIONS.profiles,
        }),
        store.listRecords({
          workspaceId,
          collectionName: PROFILE_SIGNAL_LIVE_RECORD_COLLECTIONS.contacts,
        }),
        store.listRecords({
          workspaceId,
          collectionName: PROFILE_SIGNAL_LIVE_RECORD_COLLECTIONS.connections,
        }),
        store.listRecords({
          workspaceId,
          collectionName: PROFILE_SIGNAL_LIVE_RECORD_COLLECTIONS.messages,
        }),
        store.listRecords({
          workspaceId,
          collectionName:
            PROFILE_SIGNAL_LIVE_RECORD_COLLECTIONS.interactionMemories,
        }),
        store.listRecords({
          workspaceId,
          collectionName: PROFILE_SIGNAL_LIVE_RECORD_COLLECTIONS.evidence,
        }),
      ]);

      const records = [
        ...profileRecords,
        ...contactRecords,
        ...connectionRecords,
        ...messageRecords,
        ...interactionMemoryRecords,
        ...evidenceRecords,
      ];

      return {
        connections: connectionRecords
          .map(connectionFromRecord)
          .filter((connection): connection is ConnectionDTO => connection !== null),
        contacts: contactRecords
          .map(contactFromRecord)
          .filter((contact): contact is ContactDTO => contact !== null),
        evidence: evidenceRecords
          .map(evidenceFromRecord)
          .filter(
            (evidence): evidence is RelationshipEvidenceDTO => evidence !== null,
          ),
        generatedAt: latestTimestamp(records),
        interactionMemories: interactionMemoryRecords
          .map(interactionMemoryFromRecord)
          .filter(
            (memory): memory is InteractionMemoryDTO => memory !== null,
          ),
        messages: messageRecords
          .map(messageFromRecord)
          .filter((message): message is MessageDTO => message !== null),
        profiles: profileRecords
          .map(profileFromRecord)
          .filter(
            (profile): profile is LiveProfileSignalProfileRecord =>
              profile !== null,
          ),
      };
    },
  };
}

export function createConfiguredStorageProfileSignalProvider({
  env,
  sourceLabel = "Profile signal Postgres live storage",
}: ConfiguredStorageProfileSignalProviderOptions = {}): LiveProfileSignalProvider | null {
  const config = resolveLiveDatabaseConnectionConfig(env);

  if (!config) {
    return null;
  }

  const canUseDefaultCache =
    env === undefined && sourceLabel === "Profile signal Postgres live storage";
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

  const provider = createStorageProfileSignalProvider({
    source: `postgres-live-record-store:profile-signals:${config.workspaceId}`,
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
