import type {
  AgentActionDTO,
  ConnectionDTO,
  ContactDTO,
  MatchRecommendationDTO,
  NetworkPersonDTO,
  RelationshipEvidenceDTO,
} from "../../../shared/domain/contracts";
import {
  isMatchRecommendationType,
  isRelationshipStage,
  isRelationshipTrustLevel,
  isRelationshipValueType,
  isSourceType,
} from "../../../shared/domain/source-types";
import { createConfiguredPostgresLiveRecordStore } from "../../../shared/storage/configured-live-record-store";
import {
  resolveLiveDatabaseConnectionConfig,
  type LiveDatabaseEnv,
} from "../../../shared/storage/live-database-config";
import type {
  LiveRecord,
  LiveRecordStoreLike,
} from "../../../shared/storage/live-record-store";
import type {
  LiveAgentActionGraph,
  LiveAgentActionQueueProvider,
} from "../live-service";

export const AGENT_ACTION_LIVE_RECORD_COLLECTIONS = {
  agentActions: "agentActions",
  connections: "connections",
  contacts: "contacts",
  evidence: "evidence",
  matchRecommendations: "matchRecommendations",
  networkPeople: "networkPeople",
} as const;

export interface StorageAgentActionQueueProviderOptions {
  source?: string;
  sourceLabel?: string;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}

export interface ConfiguredStorageAgentActionQueueProviderOptions {
  env?: LiveDatabaseEnv;
  sourceLabel?: string;
}

interface CachedConfiguredStorageAgentActionQueueProvider {
  key: string;
  provider: LiveAgentActionQueueProvider;
}

let cachedDefaultProvider: CachedConfiguredStorageAgentActionQueueProvider | null =
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

function evidenceIds(value: unknown): readonly [string, ...string[]] | null {
  const ids = stringArray(value);

  return ids.length > 0 ? [ids[0], ...ids.slice(1)] : null;
}

function sourceReference(
  value: unknown,
):
  | AgentActionDTO["source"]
  | ConnectionDTO["source"]
  | ContactDTO["source"]
  | MatchRecommendationDTO["source"]
  | NetworkPersonDTO["source"]
  | null {
  if (!isRecord(value) || !isSourceType(value.type) || !nonEmptyString(value.id)) {
    return null;
  }

  return {
    type: value.type,
    id: value.id,
    label: optionalString(value.label),
  };
}

function agentActionFromRecord(
  record: LiveRecord<Record<string, unknown>>,
): AgentActionDTO | null {
  const payload = record.payload;
  const source = sourceReference(payload.source);
  const ids = evidenceIds(payload.evidenceIds);

  if (
    !nonEmptyString(payload.id) ||
    !(
      payload.type === "draft_message" ||
      payload.type === "schedule_reminder" ||
      payload.type === "prepare_intro" ||
      payload.type === "summarize_context"
    ) ||
    !(
      payload.status === "queued" ||
      payload.status === "awaiting_confirmation" ||
      payload.status === "approved" ||
      payload.status === "rejected" ||
      payload.status === "completed"
    ) ||
    typeof payload.confirmationRequired !== "boolean" ||
    !source ||
    !ids ||
    !nonEmptyString(payload.createdAt) ||
    !nonEmptyString(payload.updatedAt)
  ) {
    return null;
  }

  return {
    id: payload.id,
    type: payload.type,
    status: payload.status,
    confirmationRequired: payload.confirmationRequired,
    source,
    evidenceIds: ids,
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
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

function matchRecommendationFromRecord(
  record: LiveRecord<Record<string, unknown>>,
): MatchRecommendationDTO | null {
  const payload = record.payload;
  const source = sourceReference(payload.source);
  const ids = evidenceIds(payload.evidenceIds);

  if (
    !nonEmptyString(payload.id) ||
    !nonEmptyString(payload.eventId) ||
    !isMatchRecommendationType(payload.recommendationType) ||
    typeof payload.score !== "number" ||
    typeof payload.businessRelevanceScore !== "number" ||
    !nonEmptyString(payload.reason) ||
    !source ||
    !ids ||
    !nonEmptyString(payload.createdAt) ||
    !nonEmptyString(payload.updatedAt)
  ) {
    return null;
  }

  return {
    id: payload.id,
    eventId: payload.eventId,
    attendeeId: optionalString(payload.attendeeId),
    targetPersonId: optionalString(payload.targetPersonId),
    contactId: optionalString(payload.contactId),
    connectionId: optionalString(payload.connectionId),
    introducedByPersonId: optionalString(payload.introducedByPersonId),
    recommendationType: payload.recommendationType,
    score: payload.score,
    businessRelevanceScore: payload.businessRelevanceScore,
    sharedTopics: stringArray(payload.sharedTopics),
    suggestedActions: stringArray(payload.suggestedActions),
    reason: payload.reason,
    source,
    evidenceIds: ids,
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
  };
}

function networkPersonFromRecord(
  record: LiveRecord<Record<string, unknown>>,
): NetworkPersonDTO | null {
  const payload = record.payload;
  const source = sourceReference(payload.source);
  const ids = evidenceIds(payload.evidenceIds);

  if (
    !nonEmptyString(payload.id) ||
    !(payload.personKind === "platform_user" || payload.personKind === "external_contact") ||
    !nonEmptyString(payload.displayName) ||
    !source ||
    !ids ||
    !nonEmptyString(payload.createdAt) ||
    !nonEmptyString(payload.updatedAt)
  ) {
    return null;
  }

  return {
    id: payload.id,
    personKind: payload.personKind,
    platformUserId: optionalString(payload.platformUserId),
    displayName: payload.displayName,
    organization: optionalString(payload.organization),
    role: optionalString(payload.role),
    location: optionalString(payload.location),
    primaryEmail: optionalString(payload.primaryEmail),
    profileSnippet: optionalString(payload.profileSnippet),
    source,
    evidenceIds: ids,
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
  };
}

function latestTimestamp(records: readonly LiveRecord<Record<string, unknown>>[]): string {
  return records
    .map((record) => record.updatedAt)
    .filter(nonEmptyString)
    .sort()
    .at(-1) ?? new Date(0).toISOString();
}

async function listCollection(
  store: LiveRecordStoreLike<Record<string, unknown>>,
  workspaceId: string,
  collectionName: string,
): Promise<readonly LiveRecord<Record<string, unknown>>[]> {
  return store.listRecords({
    collectionName,
    workspaceId,
  });
}

async function readGraph(
  store: LiveRecordStoreLike<Record<string, unknown>>,
  workspaceId: string,
): Promise<LiveAgentActionGraph> {
  const [
    actionRecords,
    contactRecords,
    connectionRecords,
    evidenceRecords,
    recommendationRecords,
    networkPersonRecords,
  ] = await Promise.all([
    listCollection(store, workspaceId, AGENT_ACTION_LIVE_RECORD_COLLECTIONS.agentActions),
    listCollection(store, workspaceId, AGENT_ACTION_LIVE_RECORD_COLLECTIONS.contacts),
    listCollection(store, workspaceId, AGENT_ACTION_LIVE_RECORD_COLLECTIONS.connections),
    listCollection(store, workspaceId, AGENT_ACTION_LIVE_RECORD_COLLECTIONS.evidence),
    listCollection(
      store,
      workspaceId,
      AGENT_ACTION_LIVE_RECORD_COLLECTIONS.matchRecommendations,
    ),
    listCollection(store, workspaceId, AGENT_ACTION_LIVE_RECORD_COLLECTIONS.networkPeople),
  ]);

  return {
    actions: actionRecords.flatMap((record) => {
      const action = agentActionFromRecord(record);

      return action ? [action] : [];
    }),
    contacts: contactRecords.flatMap((record) => {
      const contact = contactFromRecord(record);

      return contact ? [contact] : [];
    }),
    connections: connectionRecords.flatMap((record) => {
      const connection = connectionFromRecord(record);

      return connection ? [connection] : [];
    }),
    evidence: evidenceRecords.flatMap((record) => {
      const evidence = evidenceFromRecord(record);

      return evidence ? [evidence] : [];
    }),
    generatedAt: latestTimestamp([
      ...actionRecords,
      ...contactRecords,
      ...connectionRecords,
      ...evidenceRecords,
      ...recommendationRecords,
      ...networkPersonRecords,
    ]),
    matchRecommendations: recommendationRecords.flatMap((record) => {
      const recommendation = matchRecommendationFromRecord(record);

      return recommendation ? [recommendation] : [];
    }),
    networkPeople: networkPersonRecords.flatMap((record) => {
      const person = networkPersonFromRecord(record);

      return person ? [person] : [];
    }),
  };
}

async function updateDecision(
  input: {
    actionId: string;
    decision: "accepted" | "dismissed";
    decidedAt: string;
    store: LiveRecordStoreLike<Record<string, unknown>>;
    workspaceId: string;
  },
): Promise<LiveAgentActionGraph> {
  const record = await input.store.getRecord({
    collectionName: AGENT_ACTION_LIVE_RECORD_COLLECTIONS.agentActions,
    recordId: input.actionId,
    workspaceId: input.workspaceId,
  });

  if (!record) {
    return readGraph(input.store, input.workspaceId);
  }

  await input.store.upsertRecord({
    ...record,
    payload: {
      ...record.payload,
      status: input.decision === "accepted" ? "approved" : "rejected",
      updatedAt: input.decidedAt,
    },
    searchText: [
      record.searchText,
      input.decision === "accepted" ? "approved accepted" : "rejected dismissed",
    ]
      .filter(nonEmptyString)
      .join(" "),
    updatedAt: input.decidedAt,
  });

  return readGraph(input.store, input.workspaceId);
}

export function createStorageAgentActionQueueProvider({
  source,
  sourceLabel = "Agent action queue shared live storage",
  store,
  workspaceId,
}: StorageAgentActionQueueProviderOptions): LiveAgentActionQueueProvider {
  return {
    source: source ?? `live-record-store:agent-action-queue:${workspaceId}`,
    sourceLabel,
    readAgentActionGraph: () => readGraph(store, workspaceId),
    updateAgentActionDecision: (input) =>
      updateDecision({
        ...input,
        store,
        workspaceId,
      }),
  };
}

export function createConfiguredStorageAgentActionQueueProvider({
  env,
  sourceLabel = "Agent action queue Postgres live storage",
}: ConfiguredStorageAgentActionQueueProviderOptions = {}): LiveAgentActionQueueProvider | null {
  const config = resolveLiveDatabaseConnectionConfig(env);

  if (!config) {
    return null;
  }

  const key = [
    config.connectionString,
    config.workspaceId,
    sourceLabel,
  ].join("\u0000");

  if (cachedDefaultProvider?.key === key) {
    return cachedDefaultProvider.provider;
  }

  const configuredStore = createConfiguredPostgresLiveRecordStore({
    env,
  });

  if (!configuredStore) {
    return null;
  }

  const provider = createStorageAgentActionQueueProvider({
    source: `postgres-live-record-store:agent-action-queue:${config.workspaceId}`,
    sourceLabel,
    store: configuredStore.store,
    workspaceId: configuredStore.workspaceId,
  });

  cachedDefaultProvider = { key, provider };

  return provider;
}
