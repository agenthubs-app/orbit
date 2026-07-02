import type {
  ContactDTO,
  MatchRecommendationDTO,
  NetworkPersonDTO,
  RelationshipEvidenceDTO,
} from "../../../shared/domain/contracts";
import {
  isMatchRecommendationType,
  isRelationshipStage,
  isSourceType,
} from "../../../shared/domain/source-types";
import {
  createConfiguredPostgresLiveRecordStore,
} from "../../../shared/storage/configured-live-record-store";
import type { LiveDatabaseEnv } from "../../../shared/storage/live-database-config";
import type {
  LiveRecord,
  LiveRecordStoreLike,
} from "../../../shared/storage/live-record-store";

export interface LiveReferralRecommendationGraph {
  contacts: readonly ContactDTO[];
  evidence: readonly RelationshipEvidenceDTO[];
  generatedAt: string;
  networkPeople: readonly NetworkPersonDTO[];
  recommendations: readonly MatchRecommendationDTO[];
}

export type LiveReferralRecommendationProviderResult<TResult> =
  TResult | Promise<TResult>;

export interface LiveReferralRecommendationProvider {
  source: string;
  sourceLabel: string;
  readReferralRecommendationGraph: () => LiveReferralRecommendationProviderResult<LiveReferralRecommendationGraph>;
}

export const REFERRAL_LIVE_RECORD_COLLECTIONS = {
  contacts: "contacts",
  evidence: "evidence",
  matchRecommendations: "matchRecommendations",
  networkPeople: "networkPeople",
} as const;

export interface StorageReferralRecommendationProviderOptions {
  source?: string;
  sourceLabel?: string;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}

export interface ConfiguredStorageReferralRecommendationProviderOptions {
  env?: LiveDatabaseEnv;
  sourceLabel?: string;
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

function evidenceIds(value: unknown): readonly [string, ...string[]] | null {
  const ids = stringArray(value);

  return ids.length > 0 ? [ids[0], ...ids.slice(1)] : null;
}

function sourceReference(
  value: unknown,
): ContactDTO["source"] | MatchRecommendationDTO["source"] | NetworkPersonDTO["source"] | null {
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

function networkPersonFromRecord(
  record: LiveRecord<Record<string, unknown>>,
): NetworkPersonDTO | null {
  const payload = record.payload;
  const source = sourceReference(payload.source);
  const ids = evidenceIds(payload.evidenceIds);

  if (
    !nonEmptyString(payload.id) ||
    !(
      payload.personKind === "platform_user" ||
      payload.personKind === "external_contact"
    ) ||
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

function recommendationFromRecord(
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

async function listCollection(
  store: LiveRecordStoreLike<Record<string, unknown>>,
  workspaceId: string,
  collectionName: string,
): Promise<readonly LiveRecord<Record<string, unknown>>[]> {
  return store.listRecords({
    workspaceId,
    collectionName,
  });
}

export function createStorageReferralRecommendationProvider({
  source,
  sourceLabel = "Referral recommendation shared live storage",
  store,
  workspaceId,
}: StorageReferralRecommendationProviderOptions): LiveReferralRecommendationProvider {
  return {
    source: source ?? `live-record-store:referral-recommendations:${workspaceId}`,
    sourceLabel,
    async readReferralRecommendationGraph(): Promise<LiveReferralRecommendationGraph> {
      const [
        contactRecords,
        evidenceRecords,
        personRecords,
        recommendationRecords,
      ] = await Promise.all([
        listCollection(store, workspaceId, REFERRAL_LIVE_RECORD_COLLECTIONS.contacts),
        listCollection(store, workspaceId, REFERRAL_LIVE_RECORD_COLLECTIONS.evidence),
        listCollection(store, workspaceId, REFERRAL_LIVE_RECORD_COLLECTIONS.networkPeople),
        listCollection(store, workspaceId, REFERRAL_LIVE_RECORD_COLLECTIONS.matchRecommendations),
      ]);

      return {
        contacts: contactRecords
          .map(contactFromRecord)
          .filter((contact): contact is ContactDTO => contact !== null),
        evidence: evidenceRecords
          .map(evidenceFromRecord)
          .filter(
            (evidence): evidence is RelationshipEvidenceDTO =>
              evidence !== null,
          ),
        generatedAt: latestTimestamp([
          ...contactRecords,
          ...evidenceRecords,
          ...personRecords,
          ...recommendationRecords,
        ]),
        networkPeople: personRecords
          .map(networkPersonFromRecord)
          .filter(
            (person): person is NetworkPersonDTO => person !== null,
          ),
        recommendations: recommendationRecords
          .map(recommendationFromRecord)
          .filter(
            (recommendation): recommendation is MatchRecommendationDTO =>
              recommendation !== null,
          ),
      };
    },
  };
}

export function createConfiguredStorageReferralRecommendationProvider({
  env,
  sourceLabel = "Referral recommendation Postgres live storage",
}: ConfiguredStorageReferralRecommendationProviderOptions = {}): LiveReferralRecommendationProvider | null {
  const configuredStore = createConfiguredPostgresLiveRecordStore({
    env,
  });

  if (!configuredStore) {
    return null;
  }

  return createStorageReferralRecommendationProvider({
    source: `postgres-live-record-store:referral-recommendations:${configuredStore.workspaceId}`,
    sourceLabel,
    store: configuredStore.store,
    workspaceId: configuredStore.workspaceId,
  });
}
