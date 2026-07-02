import type {
  ContactDTO,
  EventDTO,
  EventParticipantIntentDTO,
  NetworkPersonDTO,
  RelationshipEvidenceDTO,
} from "../../../shared/domain/contracts";
import { isSourceType } from "../../../shared/domain/source-types";
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
  LiveEventAttendeeImportGraph,
  LiveEventAttendeeImportProvider,
  LiveEventAttendeeRecordDTO,
} from "../live-event-attendee-import-service";

export const EVENT_ATTENDEE_IMPORT_LIVE_RECORD_COLLECTIONS = {
  attendees: "attendees",
  contacts: "contacts",
  events: "events",
  evidence: "evidence",
  eventParticipantIntents: "eventParticipantIntents",
  networkPeople: "networkPeople",
} as const;

export interface StorageEventAttendeeImportProviderOptions {
  source?: string;
  sourceLabel?: string;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}

export interface ConfiguredStorageEventAttendeeImportProviderOptions {
  env?: LiveDatabaseEnv;
  sourceLabel?: string;
}

interface CachedConfiguredStorageEventAttendeeImportProvider {
  key: string;
  provider: LiveEventAttendeeImportProvider;
}

let cachedDefaultProvider: CachedConfiguredStorageEventAttendeeImportProvider | null =
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

function sourceReference(value: unknown): EventDTO["source"] | null {
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
  record: LiveRecord<Record<string, unknown>> | null,
): EventDTO | null {
  if (!record) {
    return null;
  }

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
): LiveEventAttendeeRecordDTO | null {
  const payload = record.payload;
  const source = sourceReference(payload.source);
  const ids = evidenceIds(payload.evidenceIds);

  if (
    !nonEmptyString(payload.id) ||
    !nonEmptyString(payload.eventId) ||
    !nonEmptyString(payload.displayName) ||
    !nonEmptyString(payload.status) ||
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
    status: payload.status,
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

function contactFromRecord(
  record: LiveRecord<Record<string, unknown>>,
): ContactDTO | null {
  const payload = record.payload;
  const source = sourceReference(payload.source);
  const ids = evidenceIds(payload.evidenceIds);

  if (
    !nonEmptyString(payload.id) ||
    !nonEmptyString(payload.displayName) ||
    !nonEmptyString(payload.stage) ||
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
    stage: payload.stage as ContactDTO["stage"],
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
    !(
      payload.preferredLanguage === "ja" ||
      payload.preferredLanguage === "zh" ||
      payload.preferredLanguage === "en"
    ) ||
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

function recordIdsFrom(
  records: readonly { evidenceIds: readonly string[] }[],
): readonly string[] {
  return [...new Set(records.flatMap((record) => record.evidenceIds))];
}

export function createStorageEventAttendeeImportProvider({
  source,
  sourceLabel = "Event attendee shared live storage",
  store,
  workspaceId,
}: StorageEventAttendeeImportProviderOptions): LiveEventAttendeeImportProvider {
  return {
    source: source ?? `live-record-store:event-attendee-import:${workspaceId}`,
    sourceLabel,
    async readEventAttendeeGraph(eventId): Promise<LiveEventAttendeeImportGraph | null> {
      const eventRecord = await store.getRecord({
        workspaceId,
        collectionName: EVENT_ATTENDEE_IMPORT_LIVE_RECORD_COLLECTIONS.events,
        recordId: eventId,
      });
      const event = eventFromRecord(eventRecord);

      if (!event) {
        return null;
      }

      const [attendeeRecords, intentRecords, personRecords, contactRecords] =
        await Promise.all([
          store.listRecords({
            workspaceId,
            collectionName: EVENT_ATTENDEE_IMPORT_LIVE_RECORD_COLLECTIONS.attendees,
          }),
          store.listRecords({
            workspaceId,
            collectionName:
              EVENT_ATTENDEE_IMPORT_LIVE_RECORD_COLLECTIONS.eventParticipantIntents,
          }),
          store.listRecords({
            workspaceId,
            collectionName:
              EVENT_ATTENDEE_IMPORT_LIVE_RECORD_COLLECTIONS.networkPeople,
          }),
          store.listRecords({
            workspaceId,
            collectionName: EVENT_ATTENDEE_IMPORT_LIVE_RECORD_COLLECTIONS.contacts,
          }),
        ]);
      const attendees = attendeeRecords
        .map(attendeeFromRecord)
        .filter(
          (attendee): attendee is LiveEventAttendeeRecordDTO =>
            attendee !== null && attendee.eventId === eventId,
        );
      const attendeeIds = new Set(attendees.map((attendee) => attendee.id));
      const personIds = new Set(
        attendees
          .map((attendee) => attendee.personId)
          .filter((personId): personId is string => personId !== undefined),
      );
      const contactIds = new Set(
        attendees
          .map((attendee) => attendee.contactId)
          .filter((contactId): contactId is string => contactId !== undefined),
      );
      const intents = intentRecords
        .map(intentFromRecord)
        .filter(
          (intent): intent is EventParticipantIntentDTO =>
            intent !== null &&
            intent.eventId === eventId &&
            attendeeIds.has(intent.attendeeId),
        );

      for (const intent of intents) {
        if (intent.personId) {
          personIds.add(intent.personId);
        }

        if (intent.contactId) {
          contactIds.add(intent.contactId);
        }
      }

      const contacts = contactRecords
        .map(contactFromRecord)
        .filter(
          (contact): contact is ContactDTO =>
            contact !== null &&
            (contactIds.has(contact.id) ||
              (contact.personId ? personIds.has(contact.personId) : false)),
        );

      for (const contact of contacts) {
        if (contact.personId) {
          personIds.add(contact.personId);
        }
      }

      const networkPeople = personRecords
        .map(networkPersonFromRecord)
        .filter(
          (person): person is NetworkPersonDTO =>
            person !== null && personIds.has(person.id),
        );
      const evidenceIds = recordIdsFrom([
        event,
        ...attendees,
        ...intents,
        ...contacts,
        ...networkPeople,
      ]);
      const evidenceRecords = evidenceIds.length > 0
        ? await store.listRecords({
            workspaceId,
            collectionName: EVENT_ATTENDEE_IMPORT_LIVE_RECORD_COLLECTIONS.evidence,
            recordIds: evidenceIds,
          })
        : [];

      return {
        attendees,
        contacts,
        event,
        evidence: evidenceRecords
          .map(evidenceFromRecord)
          .filter(
            (evidence): evidence is RelationshipEvidenceDTO => evidence !== null,
          ),
        generatedAt: latestTimestamp([
          eventRecord,
          ...attendeeRecords,
          ...intentRecords,
          ...personRecords,
          ...contactRecords,
          ...evidenceRecords,
        ].filter((record): record is LiveRecord<Record<string, unknown>> => record !== null)),
        intents,
        networkPeople,
      };
    },
  };
}

export function createConfiguredStorageEventAttendeeImportProvider({
  env,
  sourceLabel = "Event attendee Postgres live storage",
}: ConfiguredStorageEventAttendeeImportProviderOptions = {}): LiveEventAttendeeImportProvider | null {
  const config = resolveLiveDatabaseConnectionConfig(env);

  if (!config) {
    return null;
  }

  const canUseDefaultCache =
    env === undefined && sourceLabel === "Event attendee Postgres live storage";
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

  const provider = createStorageEventAttendeeImportProvider({
    source: `postgres-live-record-store:event-attendee-import:${config.workspaceId}`,
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
