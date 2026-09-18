import type {
  ConnectionDTO,
  ContactDTO,
  InteractionMemoryDTO,
  MessageDTO,
  RelationshipEvidenceDTO,
  UserProfileDTO,
} from "../../../shared/domain/contracts";
import type { SourceReferenceDTO } from "../../../shared/domain/source-types";
import {
  resolveLiveDatabaseConnectionConfig,
  type LiveDatabaseEnv,
} from "../../../shared/storage/live-database-config";
import type {
  LiveRecord,
  LiveRecordStoreLike,
} from "../../../shared/storage/live-record-store";
import { createPostgresLiveRecordStore } from "../../../shared/storage/postgres-live-record-store";
import {
  createConfiguredTransactionalPostgresRuntime,
  type TransactionalPostgresClient,
} from "../../../shared/storage/transactional-postgres";
import type { ProfileSignalSuggestionStatus } from "../signal-contract";

export interface LiveProfileSignalDecision {
  actorId: string;
  suggestionId: string;
  status: Exclude<ProfileSignalSuggestionStatus, "pending">;
  mutationId: string;
  decidedAt: string;
}

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
  suggestionDecisions: readonly LiveProfileSignalDecision[];
}

export type LiveProfileSignalProviderResult<TResult> = TResult | Promise<TResult>;

export interface LiveProfileSignalProvider {
  source: string;
  sourceLabel: string;
  readSignalGraph: (
    actorId: string,
  ) => LiveProfileSignalProviderResult<LiveProfileSignalGraph>;
  saveSuggestionDecision: (
    decision: LiveProfileSignalDecision,
    actorId: string,
  ) => LiveProfileSignalProviderResult<LiveProfileSignalDecision>;
}

export const PROFILE_SIGNAL_LIVE_RECORD_COLLECTIONS = {
  connections: "connections",
  contacts: "contacts",
  evidence: "evidence",
  interactionMemories: "interactionMemories",
  messages: "messages",
  profiles: "profiles",
  suggestionDecisions: "profileSuggestionDecisions",
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
const decisionLocks = new WeakMap<object, Map<string, Promise<void>>>();

async function withDecisionLock<TResult>(
  store: LiveRecordStoreLike<Record<string, unknown>>,
  key: string,
  operation: () => Promise<TResult>,
): Promise<TResult> {
  let queue = decisionLocks.get(store);
  if (!queue) {
    queue = new Map();
    decisionLocks.set(store, queue);
  }
  const previous = queue.get(key) ?? Promise.resolve();
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  queue.set(key, held);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (queue.get(key) === held) queue.delete(key);
  }
}

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
    publicProfile: isRecord(payload.publicProfile)
      ? (payload.publicProfile as UserProfileDTO["publicProfile"])
      : undefined,
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

function belongsToActor(
  record: LiveRecord<Record<string, unknown>>,
  actorId: string,
): boolean {
  return record.userId === actorId || record.payload.accountId === actorId;
}

function referencedEvidenceIds(
  records: readonly LiveRecord<Record<string, unknown>>[],
): ReadonlySet<string> {
  return new Set(records.flatMap((record) => evidenceIdsFromRecord(record)));
}

function suggestionDecisionFromRecord(
  record: LiveRecord<Record<string, unknown>>,
): LiveProfileSignalDecision | null {
  const payload = record.payload;
  if (
    !nonEmptyString(payload.actorId) ||
    !nonEmptyString(payload.suggestionId) ||
    !nonEmptyString(payload.mutationId) ||
    !nonEmptyString(payload.decidedAt) ||
    (payload.status !== "accepted" && payload.status !== "dismissed") ||
    record.userId !== payload.actorId
  ) return null;
  return {
    actorId: payload.actorId,
    suggestionId: payload.suggestionId,
    mutationId: payload.mutationId,
    decidedAt: payload.decidedAt,
    status: payload.status,
  };
}

function suggestionDecisionRecordId(actorId: string, suggestionId: string): string {
  return `profile-suggestion-decision:${encodeURIComponent(actorId)}:${encodeURIComponent(suggestionId)}`;
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
    async readSignalGraph(actorId): Promise<LiveProfileSignalGraph> {
      const [
        profileRecords,
        contactRecords,
        connectionRecords,
        messageRecords,
        interactionMemoryRecords,
        evidenceRecords,
        suggestionDecisionRecords,
      ] = await Promise.all([
        store.listRecords({
          limit: "unbounded",
          workspaceId,
          collectionName: PROFILE_SIGNAL_LIVE_RECORD_COLLECTIONS.profiles,
        }),
        store.listRecords({
          limit: "unbounded",
          workspaceId,
          collectionName: PROFILE_SIGNAL_LIVE_RECORD_COLLECTIONS.contacts,
        }),
        store.listRecords({
          limit: "unbounded",
          workspaceId,
          collectionName: PROFILE_SIGNAL_LIVE_RECORD_COLLECTIONS.connections,
        }),
        store.listRecords({
          limit: "unbounded",
          workspaceId,
          collectionName: PROFILE_SIGNAL_LIVE_RECORD_COLLECTIONS.messages,
        }),
        store.listRecords({
          limit: "unbounded",
          workspaceId,
          collectionName:
            PROFILE_SIGNAL_LIVE_RECORD_COLLECTIONS.interactionMemories,
        }),
        store.listRecords({
          limit: "unbounded",
          workspaceId,
          collectionName: PROFILE_SIGNAL_LIVE_RECORD_COLLECTIONS.evidence,
        }),
        store.listRecords({
          limit: "unbounded",
          workspaceId,
          collectionName: PROFILE_SIGNAL_LIVE_RECORD_COLLECTIONS.suggestionDecisions,
          userId: actorId,
        }),
      ]);

      const actorProfileRecords = profileRecords.filter((record) =>
        belongsToActor(record, actorId),
      );
      const actorConnectionRecords = connectionRecords.filter((record) =>
        belongsToActor(record, actorId),
      );
      const actorConnectionIds = new Set(
        actorConnectionRecords
          .map((record) => record.payload.id)
          .filter(nonEmptyString),
      );
      const actorContactIds = new Set(
        actorConnectionRecords
          .map((record) => record.payload.contactId)
          .filter(nonEmptyString),
      );
      const actorContactRecords = contactRecords.filter(
        (record) =>
          belongsToActor(record, actorId) ||
          (nonEmptyString(record.payload.id) &&
            actorContactIds.has(record.payload.id)),
      );
      const actorInteractionMemoryRecords = interactionMemoryRecords.filter(
        (record) =>
          belongsToActor(record, actorId) ||
          (nonEmptyString(record.payload.contactId) &&
            actorContactIds.has(record.payload.contactId)) ||
          (nonEmptyString(record.payload.connectionId) &&
            actorConnectionIds.has(record.payload.connectionId)),
      );
      const actorConversationIds = new Set(
        actorInteractionMemoryRecords
          .map((record) => record.payload.conversationId)
          .filter(nonEmptyString),
      );
      const actorMessageIds = new Set(
        actorInteractionMemoryRecords
          .map((record) => record.payload.messageId)
          .filter(nonEmptyString),
      );
      const actorMessageRecords = messageRecords.filter(
        (record) =>
          belongsToActor(record, actorId) ||
          (nonEmptyString(record.payload.conversationId) &&
            actorConversationIds.has(record.payload.conversationId)) ||
          (nonEmptyString(record.payload.id) &&
            actorMessageIds.has(record.payload.id)),
      );
      const actorEvidenceIds = referencedEvidenceIds([
        ...actorProfileRecords,
        ...actorContactRecords,
        ...actorConnectionRecords,
        ...actorMessageRecords,
        ...actorInteractionMemoryRecords,
      ]);
      const actorEvidenceRecords = evidenceRecords.filter(
        (record) =>
          belongsToActor(record, actorId) ||
          (nonEmptyString(record.payload.id) &&
            actorEvidenceIds.has(record.payload.id)),
      );
      const actorRecords = [
        ...actorProfileRecords,
        ...actorContactRecords,
        ...actorConnectionRecords,
        ...actorMessageRecords,
        ...actorInteractionMemoryRecords,
        ...actorEvidenceRecords,
      ];

      return {
        connections: actorConnectionRecords
          .map(connectionFromRecord)
          .filter((connection): connection is ConnectionDTO => connection !== null),
        contacts: actorContactRecords
          .map(contactFromRecord)
          .filter((contact): contact is ContactDTO => contact !== null),
        evidence: actorEvidenceRecords
          .map(evidenceFromRecord)
          .filter(
            (evidence): evidence is RelationshipEvidenceDTO => evidence !== null,
          ),
        generatedAt: latestTimestamp(actorRecords),
        interactionMemories: actorInteractionMemoryRecords
          .map(interactionMemoryFromRecord)
          .filter(
            (memory): memory is InteractionMemoryDTO => memory !== null,
          ),
        messages: actorMessageRecords
          .map(messageFromRecord)
          .filter((message): message is MessageDTO => message !== null),
        profiles: actorProfileRecords
          .map(profileFromRecord)
          .filter(
            (profile): profile is LiveProfileSignalProfileRecord =>
              profile !== null,
          ),
        suggestionDecisions: suggestionDecisionRecords
          .map(suggestionDecisionFromRecord)
          .filter((decision): decision is LiveProfileSignalDecision =>
            decision !== null && decision.actorId === actorId),
      };
    },
    async saveSuggestionDecision(decision, actorId) {
      return withDecisionLock(store, JSON.stringify([workspaceId, actorId, decision.suggestionId]), async () => {
        if (decision.actorId !== actorId) {
          throw new Error("Profile suggestion decision belongs to a different actor.");
        }
        const recordId = suggestionDecisionRecordId(actorId, decision.suggestionId);
        const existing = await store.getRecord({
          workspaceId,
          collectionName: PROFILE_SIGNAL_LIVE_RECORD_COLLECTIONS.suggestionDecisions,
          recordId,
        });
        if (existing) {
          const parsed = suggestionDecisionFromRecord(existing);
          if (!parsed || parsed.actorId !== actorId) {
            throw new Error("Profile suggestion decision ownership is invalid.");
          }
          return parsed;
        }
        const saved = await store.upsertRecord({
          workspaceId,
          collectionName: PROFILE_SIGNAL_LIVE_RECORD_COLLECTIONS.suggestionDecisions,
          recordId,
          userId: actorId,
          sourceType: "manual",
          sourceId: `source:${recordId}`,
          sourceLabel,
          provider: "profile-signal-live-record-provider",
          providerRecordId: recordId,
          evidenceIds: [`evidence:${recordId}`],
          targetType: "profile",
          targetId: decision.suggestionId,
          occurredAt: decision.decidedAt,
          createdAt: decision.decidedAt,
          updatedAt: decision.decidedAt,
          deletedAt: null,
          lifecycleState: "active",
          searchText: null,
          payload: { ...decision },
        });
        const parsed = suggestionDecisionFromRecord(saved);
        if (!parsed) throw new Error("Profile suggestion decision write was invalid.");
        return parsed;
      });
    },
  };
}

export function createTransactionalStorageProfileSignalProvider({
  client,
  source,
  sourceLabel = "Profile signal Postgres live storage",
  workspaceId,
}: {
  client: TransactionalPostgresClient;
  source?: string;
  sourceLabel?: string;
  workspaceId: string;
}): LiveProfileSignalProvider {
  const options = { source, sourceLabel, workspaceId };
  const provider = createStorageProfileSignalProvider({
    ...options,
    store: createPostgresLiveRecordStore({ client }),
  });
  return {
    ...provider,
    async saveSuggestionDecision(decision, actorId) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          return await client.transaction(async transaction => {
            await transaction.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
              JSON.stringify(["profile-suggestion-decision", workspaceId, actorId, decision.suggestionId]),
            ]);
            return createStorageProfileSignalProvider({
              ...options,
              store: createPostgresLiveRecordStore({ client: transaction }),
            }).saveSuggestionDecision(decision, actorId);
          });
        } catch (error) {
          const code = error && typeof error === "object" && "code" in error ? error.code : null;
          if ((code === "40001" || code === "40P01") && attempt < 2) continue;
          throw error;
        }
      }
      throw new Error("Profile suggestion decision retry limit reached.");
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

  const runtime = createConfiguredTransactionalPostgresRuntime({
    env,
  });

  if (!runtime) {
    return null;
  }

  const provider = createTransactionalStorageProfileSignalProvider({
    source: `postgres-live-record-store:profile-signals:${config.workspaceId}`,
    sourceLabel,
    client: runtime.client,
    workspaceId: runtime.workspaceId,
  });

  if (canUseDefaultCache) {
    cachedDefaultProvider = {
      key: cacheKey,
      provider,
    };
  }

  return provider;
}
