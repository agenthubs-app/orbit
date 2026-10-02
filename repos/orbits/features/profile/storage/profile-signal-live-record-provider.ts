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
import { createPostgresProfileSignalGraphRecordReader } from "./profile-signal-graph-postgres-reader";

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
  profiles: "profiles",
  suggestionDecisions: "profileSuggestionDecisions",
} as const;

export interface StorageProfileSignalProviderOptions {
  /**
   * W0042: an actor-scoped raw record reader (Postgres only). Without it the
   * provider lists the five signal collections whole and filters in memory.
   */
  graphRecordReader?: ProfileSignalGraphRecordReader;
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

/**
 * W0042: the payload fields the actor-scoped reader keeps, per collection, in
 * two columns. `derivation` are the fields the actor selection reads
 * (ownership `accountId`, the ids it matches and collects, `evidenceIds` for
 * the evidence references); `parser` are the fields the parser right below
 * reads. A parser that starts reading another field must add it here, or the
 * Postgres path silently drops it (the graph parity tests catch this).
 */
export const PROFILE_SIGNAL_PAYLOAD_FIELDS = {
  profiles: {
    derivation: ["accountId", "evidenceIds"],
    parser: [
      "id", "accountId", "displayName", "createdAt", "updatedAt", "role",
      "timezone", "headline", "homeMarket", "organization", "publicProfile",
      "preferredFollowUpWindow", "preferredIntroChannels", "relationshipGoal",
      "targetRelationshipTypes", "evidenceIds",
    ],
  },
  contacts: {
    derivation: ["accountId", "id", "evidenceIds"],
    parser: [
      "source", "id", "displayName", "stage", "createdAt", "updatedAt",
      "personId", "organization", "role", "location", "primaryEmail",
      "primaryPhone", "profileSnippet", "evidenceIds",
    ],
  },
  connections: {
    derivation: ["accountId", "id", "contactId", "evidenceIds"],
    parser: [
      "source", "id", "accountId", "contactId", "stage", "summary",
      "createdAt", "updatedAt", "valueTypes", "relationshipStrength",
      "trustLevel", "businessRelevanceScore", "sharedTopics",
      "suggestedActions", "evidenceIds",
    ],
  },
  interactionMemories: {
    derivation: ["accountId", "contactId", "connectionId", "evidenceIds"],
    parser: [
      "source", "id", "contactId", "memoryType", "summary", "occurredAt",
      "createdAt", "confidence", "connectionId", "conversationId",
      "messageId", "evidenceIds",
    ],
  },
  evidence: {
    derivation: ["accountId", "id"],
    parser: [
      "id", "sourceType", "sourceId", "summary", "occurredAt", "createdBy",
      "confidence",
    ],
  },
} as const satisfies Record<
  keyof ProfileSignalRawRecords,
  { derivation: readonly string[]; parser: readonly string[] }
>;

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

/** The five signal collections as raw live records, before the actor selection. */
export interface ProfileSignalRawRecords {
  connections: readonly LiveRecord<Record<string, unknown>>[];
  contacts: readonly LiveRecord<Record<string, unknown>>[];
  evidence: readonly LiveRecord<Record<string, unknown>>[];
  interactionMemories: readonly LiveRecord<Record<string, unknown>>[];
  profiles: readonly LiveRecord<Record<string, unknown>>[];
}

/**
 * W0042: reads, for one actor, the raw rows of the five signal collections
 * that `selectActorSignalRecords` can pick. It may return more rows (they are
 * filtered again) but never fewer, and keeps each collection's list order.
 */
export type ProfileSignalGraphRecordReader = (
  actorId: string,
) => Promise<ProfileSignalRawRecords>;

/** The actor's connections and the ids they contribute (only connections contribute contact ids). */
export function actorConnectionReferences(
  connectionRecords: readonly LiveRecord<Record<string, unknown>>[],
  actorId: string,
): {
  actorConnectionIds: ReadonlySet<string>;
  actorConnectionRecords: LiveRecord<Record<string, unknown>>[];
  actorContactIds: ReadonlySet<string>;
} {
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
  return { actorConnectionIds, actorConnectionRecords, actorContactIds };
}

/**
 * The actor selection of every collection except evidence, plus the evidence
 * ids those selected (raw, possibly invalid) records reference.
 */
export function selectActorRecordsBeforeEvidence(
  raw: Omit<ProfileSignalRawRecords, "evidence">,
  actorId: string,
): Omit<ProfileSignalRawRecords, "evidence"> & {
  actorEvidenceIds: ReadonlySet<string>;
} {
  const actorProfileRecords = raw.profiles.filter((record) =>
    belongsToActor(record, actorId),
  );
  const { actorConnectionIds, actorConnectionRecords, actorContactIds } =
    actorConnectionReferences(raw.connections, actorId);
  const actorContactRecords = raw.contacts.filter(
    (record) =>
      belongsToActor(record, actorId) ||
      (nonEmptyString(record.payload.id) &&
        actorContactIds.has(record.payload.id)),
  );
  const actorInteractionMemoryRecords = raw.interactionMemories.filter(
    (record) =>
      belongsToActor(record, actorId) ||
      (nonEmptyString(record.payload.contactId) &&
        actorContactIds.has(record.payload.contactId)) ||
      (nonEmptyString(record.payload.connectionId) &&
        actorConnectionIds.has(record.payload.connectionId)),
  );
  // Sprint 0109: the legacy chat `messages` collection has had no writer since
  // sprint 0104 and is no longer read. Relationship messages between two
  // accounts are not a profile signal source (message plan decision 1).
  const actorEvidenceIds = referencedEvidenceIds([
    ...actorProfileRecords,
    ...actorContactRecords,
    ...actorConnectionRecords,
    ...actorInteractionMemoryRecords,
  ]);
  return {
    actorEvidenceIds,
    connections: actorConnectionRecords,
    contacts: actorContactRecords,
    interactionMemories: actorInteractionMemoryRecords,
    profiles: actorProfileRecords,
  };
}

export function selectActorEvidenceRecords(
  evidenceRecords: readonly LiveRecord<Record<string, unknown>>[],
  actorEvidenceIds: ReadonlySet<string>,
  actorId: string,
): LiveRecord<Record<string, unknown>>[] {
  return evidenceRecords.filter(
    (record) =>
      belongsToActor(record, actorId) ||
      (nonEmptyString(record.payload.id) &&
        actorEvidenceIds.has(record.payload.id)),
  );
}

/** The actor's rows of the five signal collections, in input order (the pre-W0042 JavaScript filter). */
export function selectActorSignalRecords(
  raw: ProfileSignalRawRecords,
  actorId: string,
): ProfileSignalRawRecords {
  const { actorEvidenceIds, ...selected } = selectActorRecordsBeforeEvidence(
    raw,
    actorId,
  );
  return {
    ...selected,
    evidence: selectActorEvidenceRecords(raw.evidence, actorEvidenceIds, actorId),
  };
}

/** Raw records → actor selection → parsed graph. Shared by the whole-workspace path and the W0042 reader. */
export function buildProfileSignalGraph(
  raw: ProfileSignalRawRecords,
  suggestionDecisionRecords: readonly LiveRecord<Record<string, unknown>>[],
  actorId: string,
): LiveProfileSignalGraph {
  const selected = selectActorSignalRecords(raw, actorId);
  const actorMessageRecords: LiveRecord<Record<string, unknown>>[] = [];
  const actorRecords = [
    ...selected.profiles,
    ...selected.contacts,
    ...selected.connections,
    ...actorMessageRecords,
    ...selected.interactionMemories,
    ...selected.evidence,
  ];

  return {
    connections: selected.connections
      .map(connectionFromRecord)
      .filter((connection): connection is ConnectionDTO => connection !== null),
    contacts: selected.contacts
      .map(contactFromRecord)
      .filter((contact): contact is ContactDTO => contact !== null),
    evidence: selected.evidence
      .map(evidenceFromRecord)
      .filter(
        (evidence): evidence is RelationshipEvidenceDTO => evidence !== null,
      ),
    generatedAt: latestTimestamp(actorRecords),
    interactionMemories: selected.interactionMemories
      .map(interactionMemoryFromRecord)
      .filter(
        (memory): memory is InteractionMemoryDTO => memory !== null,
      ),
    messages: actorMessageRecords
      .map(messageFromRecord)
      .filter((message): message is MessageDTO => message !== null),
    profiles: selected.profiles
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
}

function suggestionDecisionRecordId(actorId: string, suggestionId: string): string {
  return `profile-suggestion-decision:${encodeURIComponent(actorId)}:${encodeURIComponent(suggestionId)}`;
}

export function createStorageProfileSignalProvider({
  graphRecordReader,
  source,
  sourceLabel = "Profile signal shared live storage",
  store,
  workspaceId,
}: StorageProfileSignalProviderOptions): LiveProfileSignalProvider {
  return {
    source: source ?? `live-record-store:profile-signals:${workspaceId}`,
    sourceLabel,
    async readSignalGraph(actorId): Promise<LiveProfileSignalGraph> {
      const readDecisionRecords = () =>
        store.listRecords({
          limit: "unbounded",
          workspaceId,
          collectionName: PROFILE_SIGNAL_LIVE_RECORD_COLLECTIONS.suggestionDecisions,
          userId: actorId,
        });

      if (graphRecordReader) {
        // W0042: the Postgres reader returns only rows the selection below can
        // pick (plus every non-object payload row), in the same order; the
        // selection itself is the unchanged JavaScript one.
        const [candidateRecords, suggestionDecisionRecords] = await Promise.all([
          graphRecordReader(actorId),
          readDecisionRecords(),
        ]);
        return buildProfileSignalGraph(
          candidateRecords,
          suggestionDecisionRecords,
          actorId,
        );
      }

      const [
        profileRecords,
        contactRecords,
        connectionRecords,
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
          collectionName:
            PROFILE_SIGNAL_LIVE_RECORD_COLLECTIONS.interactionMemories,
        }),
        store.listRecords({
          limit: "unbounded",
          workspaceId,
          collectionName: PROFILE_SIGNAL_LIVE_RECORD_COLLECTIONS.evidence,
        }),
        readDecisionRecords(),
      ]);

      return buildProfileSignalGraph(
        {
          connections: connectionRecords,
          contacts: contactRecords,
          evidence: evidenceRecords,
          interactionMemories: interactionMemoryRecords,
          profiles: profileRecords,
        },
        suggestionDecisionRecords,
        actorId,
      );
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
    // W0042: the signal graph reads only the actor's rows, through the same
    // (metered) client the store uses.
    graphRecordReader: createPostgresProfileSignalGraphRecordReader({
      client,
      workspaceId,
    }),
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
