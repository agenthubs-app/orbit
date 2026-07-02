import type { LiveDatabaseEnv } from "../../../shared/storage/live-database-config";
import { createConfiguredPostgresLiveRecordStore } from "../../../shared/storage/configured-live-record-store";
import type {
  LiveRecord,
  LiveRecordStoreLike,
} from "../../../shared/storage/live-record-store";

export const EVENT_WORK_RECORD_COLLECTIONS = {
  attendeeRoster: "event_attendee_rosters",
  encounterNotes: "event_encounter_notes",
  goalReadiness: "event_goal_readiness",
  postEventReview: "post_event_reviews",
  wantConnect: "event_want_connect",
} as const;

export type EventWorkRecordCollectionName =
  (typeof EVENT_WORK_RECORD_COLLECTIONS)[keyof typeof EVENT_WORK_RECORD_COLLECTIONS];

export interface EventCapabilityStoredPayload<TPayload extends object>
  extends Record<string, unknown> {
  eventId: string;
  payload: TPayload;
}

export interface EventCapabilityRecordProvider<TPayload extends object> {
  source: string;
  sourceLabel: string;
  getPayload: (eventId: string) => Promise<TPayload | null>;
  upsertPayload: (
    eventId: string,
    payload: TPayload,
    options?: EventCapabilityRecordUpsertOptions,
  ) => Promise<TPayload>;
}

export interface EventCapabilityRecordUpsertOptions {
  evidenceIds?: readonly string[];
  now?: string;
  provider?: string;
  providerRecordId?: string;
  searchText?: string;
  sourceId?: string;
  sourceLabel?: string;
}

export interface EventCapabilityRecordProviderOptions {
  collectionName: EventWorkRecordCollectionName;
  now?: () => string;
  source?: string;
  sourceLabel?: string;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}

export interface ConfiguredEventCapabilityRecordProviderOptions {
  collectionName: EventWorkRecordCollectionName;
  env?: LiveDatabaseEnv;
  now?: () => string;
  sourceLabel?: string;
}

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function isStoredPayload<TPayload extends object>(
  value: Record<string, unknown>,
): value is EventCapabilityStoredPayload<TPayload> {
  return (
    typeof value.eventId === "string" &&
    typeof value.payload === "object" &&
    value.payload !== null
  );
}

function provenanceEvidenceIds(payload: object): readonly string[] {
  const provenance = (payload as { provenance?: { evidenceIds?: unknown } })
    .provenance;

  return Array.isArray(provenance?.evidenceIds)
    ? provenance.evidenceIds.filter(
        (evidenceId): evidenceId is string => typeof evidenceId === "string",
      )
    : [];
}

function recordFor<TPayload extends object>(input: {
  collectionName: EventWorkRecordCollectionName;
  eventId: string;
  now: string;
  options?: EventCapabilityRecordUpsertOptions;
  payload: TPayload;
  workspaceId: string;
}): LiveRecord<Record<string, unknown>> {
  const evidenceIds =
    input.options?.evidenceIds ?? provenanceEvidenceIds(input.payload);
  const sourceId =
    input.options?.sourceId ??
    `source:events:${input.collectionName}:${input.eventId}`;
  const provider =
    input.options?.provider ?? "events-live-work-record-provider";

  return {
    workspaceId: input.workspaceId,
    collectionName: input.collectionName,
    recordId: input.eventId,
    sourceType: "event_import",
    sourceId,
    sourceLabel: input.options?.sourceLabel ?? input.collectionName,
    provider,
    providerRecordId:
      input.options?.providerRecordId ??
      `${provider}:${input.collectionName}:${input.eventId}`,
    evidenceIds,
    targetType: "event",
    targetId: input.eventId,
    occurredAt: input.now,
    createdAt: input.now,
    updatedAt: input.now,
    lifecycleState: "active",
    searchText:
      input.options?.searchText ?? JSON.stringify(input.payload).slice(0, 5000),
    payload: {
      eventId: input.eventId,
      payload: clonePayload(input.payload),
    },
  };
}

export function createEventCapabilityRecordProvider<TPayload extends object>({
  collectionName,
  now = () => new Date().toISOString(),
  source,
  sourceLabel,
  store,
  workspaceId,
}: EventCapabilityRecordProviderOptions): EventCapabilityRecordProvider<TPayload> {
  const providerSource =
    source ?? `live-record-store:${collectionName}:${workspaceId}`;
  const providerSourceLabel = sourceLabel ?? `Events ${collectionName} storage`;

  return {
    source: providerSource,
    sourceLabel: providerSourceLabel,
    async getPayload(eventId) {
      const record = await store.getRecord({
        workspaceId,
        collectionName,
        recordId: eventId,
      });

      if (!record || !isStoredPayload<TPayload>(record.payload)) {
        return null;
      }

      return clonePayload(record.payload.payload);
    },
    async upsertPayload(eventId, payload, options = {}) {
      const nextPayload = clonePayload(payload);
      const record = recordFor({
        collectionName,
        eventId,
        now: options.now ?? now(),
        options: {
          sourceLabel: providerSourceLabel,
          ...options,
        },
        payload: nextPayload,
        workspaceId,
      });

      await store.upsertRecord(record);

      return clonePayload(nextPayload);
    },
  };
}

export function createConfiguredEventCapabilityRecordProvider<
  TPayload extends object,
>({
  collectionName,
  env,
  now,
  sourceLabel,
}: ConfiguredEventCapabilityRecordProviderOptions): EventCapabilityRecordProvider<TPayload> | null {
  const configured = createConfiguredPostgresLiveRecordStore<
    Record<string, unknown>
  >({ env });

  if (!configured) {
    return null;
  }

  return createEventCapabilityRecordProvider<TPayload>({
    collectionName,
    now,
    source: `postgres-live-record-store:${collectionName}:${configured.workspaceId}`,
    sourceLabel: sourceLabel ?? `Events ${collectionName} Postgres storage`,
    store: configured.store,
    workspaceId: configured.workspaceId,
  });
}
