import type {
  EventDTO,
  EventParticipantIntentDTO,
  NetworkPersonDTO,
  RelationshipEvidenceDTO,
} from "../../../shared/domain/contracts";
import {
  isPreferredLanguage,
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
import {
  CONTACT_ACQUISITION_DRAFT_SOURCE_TYPES,
  type ContactAcquisitionDraft,
  type ContactDraftSourceReference,
} from "../contract";

export interface LiveContactAcquisitionAttendeeRecord {
  id: string;
  eventId: string;
  personId?: string;
  contactId?: string;
  displayName: string;
  organization?: string;
  role?: string;
  status: string;
  source: EventDTO["source"];
  evidenceIds: readonly [string, ...string[]];
  createdAt: string;
  updatedAt: string;
}

export interface LiveContactAcquisitionDraftGraph {
  attendees: readonly LiveContactAcquisitionAttendeeRecord[];
  contactDrafts: readonly ContactAcquisitionDraft[];
  events: readonly EventDTO[];
  evidence: readonly RelationshipEvidenceDTO[];
  generatedAt: string;
  intents: readonly EventParticipantIntentDTO[];
  networkPeople: readonly NetworkPersonDTO[];
}

export type LiveContactAcquisitionDraftProviderResult<TResult> =
  TResult | Promise<TResult>;

export interface LiveContactAcquisitionDraftProvider {
  source: string;
  sourceLabel: string;
  readDraftGraph: () => LiveContactAcquisitionDraftProviderResult<LiveContactAcquisitionDraftGraph>;
  upsertContactDraft: (
    draft: ContactAcquisitionDraft,
    updatedAt: string,
  ) => LiveContactAcquisitionDraftProviderResult<ContactAcquisitionDraft>;
}

export const CONTACT_DRAFT_LIVE_RECORD_COLLECTIONS = {
  attendees: "attendees",
  contactDrafts: "contactDrafts",
  events: "events",
  evidence: "evidence",
  eventParticipantIntents: "eventParticipantIntents",
  networkPeople: "networkPeople",
} as const;

export interface StorageContactAcquisitionDraftProviderOptions {
  source?: string;
  sourceLabel?: string;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}

export interface ConfiguredStorageContactAcquisitionDraftProviderOptions {
  env?: LiveDatabaseEnv;
  sourceLabel?: string;
}

const draftSourceTypes = new Set<string>(CONTACT_ACQUISITION_DRAFT_SOURCE_TYPES);

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

function draftSourceReference(value: unknown): ContactDraftSourceReference | null {
  if (
    !isRecord(value) ||
    !nonEmptyString(value.type) ||
    !draftSourceTypes.has(value.type) ||
    !nonEmptyString(value.id)
  ) {
    return null;
  }

  return {
    type: value.type as ContactDraftSourceReference["type"],
    id: value.id,
    label: optionalString(value.label) ?? value.id,
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
): LiveContactAcquisitionAttendeeRecord | null {
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

function draftFromRecord(
  record: LiveRecord<Record<string, unknown>>,
): ContactAcquisitionDraft | null {
  const payload = record.payload;
  const source = draftSourceReference(payload.source);
  const provenance = isRecord(payload.provenance) ? payload.provenance : null;
  const evidence = Array.isArray(payload.evidence) ? payload.evidence : [];
  const confirmation = isRecord(payload.confirmation)
    ? payload.confirmation
    : null;

  if (
    !nonEmptyString(payload.id) ||
    !(payload.status === "pending_confirmation" || payload.status === "confirmed") ||
    !source ||
    !nonEmptyString(payload.displayName) ||
    !nonEmptyString(payload.role) ||
    !nonEmptyString(payload.organization) ||
    !nonEmptyString(payload.relationshipContext) ||
    !nonEmptyString(payload.suggestedNextAction) ||
    !(payload.confidence === "high" || payload.confidence === "medium" || payload.confidence === "low") ||
    !nonEmptyString(payload.createdAt) ||
    !confirmation ||
    !provenance
  ) {
    return null;
  }

  return payload as unknown as ContactAcquisitionDraft;
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

export function createStorageContactAcquisitionDraftProvider({
  source,
  sourceLabel = "Contact acquisition draft shared live storage",
  store,
  workspaceId,
}: StorageContactAcquisitionDraftProviderOptions): LiveContactAcquisitionDraftProvider {
  return {
    source: source ?? `live-record-store:contact-drafts:${workspaceId}`,
    sourceLabel,
    async readDraftGraph(): Promise<LiveContactAcquisitionDraftGraph> {
      const [
        draftRecords,
        eventRecords,
        attendeeRecords,
        intentRecords,
        personRecords,
        evidenceRecords,
      ] = await Promise.all([
        listCollection(store, workspaceId, CONTACT_DRAFT_LIVE_RECORD_COLLECTIONS.contactDrafts),
        listCollection(store, workspaceId, CONTACT_DRAFT_LIVE_RECORD_COLLECTIONS.events),
        listCollection(store, workspaceId, CONTACT_DRAFT_LIVE_RECORD_COLLECTIONS.attendees),
        listCollection(store, workspaceId, CONTACT_DRAFT_LIVE_RECORD_COLLECTIONS.eventParticipantIntents),
        listCollection(store, workspaceId, CONTACT_DRAFT_LIVE_RECORD_COLLECTIONS.networkPeople),
        listCollection(store, workspaceId, CONTACT_DRAFT_LIVE_RECORD_COLLECTIONS.evidence),
      ]);

      return {
        attendees: attendeeRecords
          .map(attendeeFromRecord)
          .filter(
            (attendee): attendee is LiveContactAcquisitionAttendeeRecord =>
              attendee !== null,
          ),
        contactDrafts: draftRecords
          .map(draftFromRecord)
          .filter(
            (draft): draft is ContactAcquisitionDraft => draft !== null,
          ),
        events: eventRecords
          .map(eventFromRecord)
          .filter((event): event is EventDTO => event !== null),
        evidence: evidenceRecords
          .map(evidenceFromRecord)
          .filter(
            (evidence): evidence is RelationshipEvidenceDTO =>
              evidence !== null,
          ),
        generatedAt: latestTimestamp([
          ...draftRecords,
          ...eventRecords,
          ...attendeeRecords,
          ...intentRecords,
          ...personRecords,
          ...evidenceRecords,
        ]),
        intents: intentRecords
          .map(intentFromRecord)
          .filter(
            (intent): intent is EventParticipantIntentDTO => intent !== null,
          ),
        networkPeople: personRecords
          .map(networkPersonFromRecord)
          .filter(
            (person): person is NetworkPersonDTO => person !== null,
          ),
      };
    },
    async upsertContactDraft(
      draft: ContactAcquisitionDraft,
      updatedAt: string,
    ): Promise<ContactAcquisitionDraft> {
      const record: LiveRecord<Record<string, unknown>> = {
        workspaceId,
        collectionName: CONTACT_DRAFT_LIVE_RECORD_COLLECTIONS.contactDrafts,
        recordId: draft.id,
        userId: null,
        sourceType: draft.source.type,
        sourceId: draft.source.id,
        sourceLabel: draft.source.label,
        provider: "orbit-contact-acquisition-draft-live-service",
        providerRecordId: draft.id,
        evidenceIds: draft.provenance.evidenceIds,
        targetType: "contact",
        targetId: draft.id,
        occurredAt: draft.createdAt,
        createdAt: draft.createdAt,
        updatedAt,
        lifecycleState: "active",
        searchText: [
          draft.displayName,
          draft.organization,
          draft.role,
          draft.relationshipContext,
        ].join(" "),
        payload: draft as unknown as Record<string, unknown>,
      };
      const saved = await store.upsertRecord(record);

      return (draftFromRecord(saved) ?? draft);
    },
  };
}

export function createConfiguredStorageContactAcquisitionDraftProvider({
  env,
  sourceLabel = "Contact acquisition draft Postgres live storage",
}: ConfiguredStorageContactAcquisitionDraftProviderOptions = {}): LiveContactAcquisitionDraftProvider | null {
  const configuredStore = createConfiguredPostgresLiveRecordStore({
    env,
  });

  if (!configuredStore) {
    return null;
  }

  return createStorageContactAcquisitionDraftProvider({
    source: `postgres-live-record-store:contact-drafts:${configuredStore.workspaceId}`,
    sourceLabel,
    store: configuredStore.store,
    workspaceId: configuredStore.workspaceId,
  });
}
