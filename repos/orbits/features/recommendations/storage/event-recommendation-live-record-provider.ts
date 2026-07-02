import type {
  ConnectionDTO,
  ContactDTO,
  EventDTO,
  EventParticipantIntentDTO,
  MatchRecommendationDTO,
  NetworkPersonDTO,
  RelationshipEvidenceDTO,
} from "../../../shared/domain/contracts";
import {
  isMatchRecommendationType,
  isPreferredLanguage,
  isRelationshipStage,
  isRelationshipTrustLevel,
  isRelationshipValueType,
  isSourceType,
} from "../../../shared/domain/source-types";
import type { LiveDatabaseEnv } from "../../../shared/storage/live-database-config";
import { createConfiguredPostgresLiveRecordStore } from "../../../shared/storage/configured-live-record-store";
import type {
  LiveRecord,
  LiveRecordStoreLike,
} from "../../../shared/storage/live-record-store";
import type { LiveEventRecommendationProvider } from "../live-service";

export interface LiveEventRecommendationAttendeeDTO {
  id: string;
  eventId: string;
  personId?: string;
  contactId?: string;
  displayName: string;
  organization?: string;
  role?: string;
  status?: string;
  source: EventDTO["source"];
  evidenceIds: readonly [string, ...string[]];
  createdAt: string;
  updatedAt: string;
}

export interface LiveEventRecommendationGraph {
  attendees: readonly LiveEventRecommendationAttendeeDTO[];
  connections: readonly ConnectionDTO[];
  contacts: readonly ContactDTO[];
  event: EventDTO | null;
  evidence: readonly RelationshipEvidenceDTO[];
  generatedAt: string;
  intents: readonly EventParticipantIntentDTO[];
  networkPeople: readonly NetworkPersonDTO[];
  recommendations: readonly MatchRecommendationDTO[];
}

export const EVENT_RECOMMENDATION_LIVE_RECORD_COLLECTIONS = {
  attendees: "attendees",
  connections: "connections",
  contacts: "contacts",
  eventParticipantIntents: "eventParticipantIntents",
  events: "events",
  evidence: "evidence",
  matchRecommendations: "matchRecommendations",
  networkPeople: "networkPeople",
} as const;

export interface StorageEventRecommendationProviderOptions {
  source?: string;
  sourceLabel?: string;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}

export interface ConfiguredStorageEventRecommendationProviderOptions {
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
): EventDTO["source"] | ContactDTO["source"] | ConnectionDTO["source"] | null {
  if (!isRecord(value) || !isSourceType(value.type) || !nonEmptyString(value.id)) {
    return null;
  }

  return {
    type: value.type,
    id: value.id,
    label: optionalString(value.label),
  };
}

function eventFromRecord(
  record: LiveRecord<Record<string, unknown>>,
): EventDTO | null {
  const payload = record.payload;
  const source = sourceReference(payload.source);
  const ids = evidenceIds(payload.evidenceIds);

  if (
    !nonEmptyString(payload.id) ||
    !nonEmptyString(payload.name) ||
    !nonEmptyString(payload.startsAt) ||
    !source ||
    !ids
  ) {
    return null;
  }

  return {
    id: payload.id,
    name: payload.name,
    location: optionalString(payload.location),
    startsAt: payload.startsAt,
    endsAt: optionalString(payload.endsAt),
    source,
    evidenceIds: ids,
  };
}

function attendeeFromRecord(
  record: LiveRecord<Record<string, unknown>>,
): LiveEventRecommendationAttendeeDTO | null {
  const payload = record.payload;
  const source = sourceReference(payload.source);
  const ids = evidenceIds(payload.evidenceIds);

  if (
    !nonEmptyString(payload.id) ||
    !nonEmptyString(payload.eventId) ||
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
    eventId: payload.eventId,
    personId: optionalString(payload.personId),
    contactId: optionalString(payload.contactId),
    displayName: payload.displayName,
    organization: optionalString(payload.organization),
    role: optionalString(payload.role),
    status: optionalString(payload.status),
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

function intentFromRecord(
  record: LiveRecord<Record<string, unknown>>,
): EventParticipantIntentDTO | null {
  const payload = record.payload;
  const source = sourceReference(payload.source);
  const ids = evidenceIds(payload.evidenceIds);

  if (
    !nonEmptyString(payload.id) ||
    !nonEmptyString(payload.eventId) ||
    !nonEmptyString(payload.attendeeId) ||
    !isPreferredLanguage(payload.preferredLanguage) ||
    typeof payload.confidence !== "number" ||
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
    attendeeId: payload.attendeeId,
    personId: optionalString(payload.personId),
    contactId: optionalString(payload.contactId),
    lookingFor: stringArray(payload.lookingFor),
    canOffer: stringArray(payload.canOffer),
    preferredLanguage: payload.preferredLanguage,
    confidence: payload.confidence,
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

function latestTimestamp(records: readonly LiveRecord<Record<string, unknown>>[]): string {
  return (
    records
      .map((record) => record.updatedAt)
      .filter(nonEmptyString)
      .sort()
      .at(-1) ?? new Date(0).toISOString()
  );
}

function uniqueStrings(values: readonly (string | undefined)[]): string[] {
  return Array.from(
    new Set(values.filter((value): value is string => nonEmptyString(value))),
  );
}

export function createStorageEventRecommendationProvider({
  source,
  sourceLabel = "Event recommendation shared live storage",
  store,
  workspaceId,
}: StorageEventRecommendationProviderOptions): LiveEventRecommendationProvider {
  return {
    source: source ?? `live-record-store:event-recommendations:${workspaceId}`,
    sourceLabel,
    async readEventRecommendationGraph(eventId): Promise<LiveEventRecommendationGraph> {
      const [eventRecord, recommendationRecords] = await Promise.all([
        store.getRecord({
          workspaceId,
          collectionName: EVENT_RECOMMENDATION_LIVE_RECORD_COLLECTIONS.events,
          recordId: eventId,
        }),
        store.listRecords({
          workspaceId,
          collectionName:
            EVENT_RECOMMENDATION_LIVE_RECORD_COLLECTIONS.matchRecommendations,
          targetId: eventId,
          targetType: "event",
        }),
      ]);
      const recommendations = recommendationRecords
        .map(recommendationFromRecord)
        .filter(
          (recommendation): recommendation is MatchRecommendationDTO =>
            recommendation !== null,
        );
      const attendeeIds = uniqueStrings(
        recommendations.map((recommendation) => recommendation.attendeeId),
      );
      const contactIds = uniqueStrings(
        recommendations.map((recommendation) => recommendation.contactId),
      );
      const connectionIds = uniqueStrings(
        recommendations.map((recommendation) => recommendation.connectionId),
      );
      const personIds = uniqueStrings(
        recommendations.map((recommendation) => recommendation.targetPersonId),
      );
      const evidenceIds = uniqueStrings([
        ...(eventRecord?.evidenceIds ?? []),
        ...recommendations.flatMap((recommendation) => recommendation.evidenceIds),
      ]);
      const [
        attendeeRecords,
        contactRecords,
        connectionRecords,
        intentRecords,
        personRecords,
        evidenceRecords,
      ] = await Promise.all([
        attendeeIds.length > 0
          ? store.listRecords({
              workspaceId,
              collectionName:
                EVENT_RECOMMENDATION_LIVE_RECORD_COLLECTIONS.attendees,
              recordIds: attendeeIds,
            })
          : [],
        contactIds.length > 0
          ? store.listRecords({
              workspaceId,
              collectionName:
                EVENT_RECOMMENDATION_LIVE_RECORD_COLLECTIONS.contacts,
              recordIds: contactIds,
            })
          : [],
        connectionIds.length > 0
          ? store.listRecords({
              workspaceId,
              collectionName:
                EVENT_RECOMMENDATION_LIVE_RECORD_COLLECTIONS.connections,
              recordIds: connectionIds,
            })
          : [],
        store.listRecords({
          workspaceId,
          collectionName:
            EVENT_RECOMMENDATION_LIVE_RECORD_COLLECTIONS.eventParticipantIntents,
        }),
        personIds.length > 0
          ? store.listRecords({
              workspaceId,
              collectionName:
                EVENT_RECOMMENDATION_LIVE_RECORD_COLLECTIONS.networkPeople,
              recordIds: personIds,
            })
          : [],
        evidenceIds.length > 0
          ? store.listRecords({
              workspaceId,
              collectionName: EVENT_RECOMMENDATION_LIVE_RECORD_COLLECTIONS.evidence,
              recordIds: evidenceIds,
            })
          : [],
      ]);

      return {
        attendees: attendeeRecords
          .map(attendeeFromRecord)
          .filter(
            (
              attendee,
            ): attendee is LiveEventRecommendationAttendeeDTO =>
              attendee !== null,
          ),
        connections: connectionRecords
          .map(connectionFromRecord)
          .filter((connection): connection is ConnectionDTO => connection !== null),
        contacts: contactRecords
          .map(contactFromRecord)
          .filter((contact): contact is ContactDTO => contact !== null),
        event: eventRecord ? eventFromRecord(eventRecord) : null,
        evidence: evidenceRecords
          .map(evidenceFromRecord)
          .filter(
            (evidence): evidence is RelationshipEvidenceDTO => evidence !== null,
          ),
        generatedAt: latestTimestamp([
          ...(eventRecord ? [eventRecord] : []),
          ...recommendationRecords,
          ...attendeeRecords,
          ...contactRecords,
          ...connectionRecords,
          ...intentRecords,
          ...personRecords,
          ...evidenceRecords,
        ]),
        intents: intentRecords
          .map(intentFromRecord)
          .filter((intent): intent is EventParticipantIntentDTO => {
            return intent !== null && attendeeIds.includes(intent.attendeeId);
          }),
        networkPeople: personRecords
          .map(networkPersonFromRecord)
          .filter((person): person is NetworkPersonDTO => person !== null),
        recommendations,
      };
    },
  };
}

export function createConfiguredStorageEventRecommendationProvider({
  env,
  sourceLabel = "Event recommendation Postgres live storage",
}: ConfiguredStorageEventRecommendationProviderOptions = {}): LiveEventRecommendationProvider | null {
  const configured = createConfiguredPostgresLiveRecordStore<
    Record<string, unknown>
  >({ env });

  if (!configured) {
    return null;
  }

  return createStorageEventRecommendationProvider({
    source: `postgres-live-record-store:event-recommendations:${configured.workspaceId}`,
    sourceLabel,
    store: configured.store,
    workspaceId: configured.workspaceId,
  });
}
