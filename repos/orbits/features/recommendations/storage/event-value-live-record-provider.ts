import {
  isSourceType,
  type SourceType,
} from "../../../shared/domain/source-types";
import {
  createConfiguredPostgresLiveRecordStore,
  type CreateConfiguredPostgresLiveRecordStoreOptions,
} from "../../../shared/storage/configured-live-record-store";
import type {
  LiveRecord,
  LiveRecordStoreLike,
} from "../../../shared/storage/live-record-store";

export const EVENT_VALUE_LIVE_RECORD_COLLECTIONS = {
  attendees: "attendees",
  events: "events",
  matchRecommendations: "matchRecommendations",
} as const;

export interface LiveEventValueStoreSource {
  type: SourceType;
  id: string;
  label: string;
  providerRecordId: string;
  importedAt: string;
}

export interface LiveEventValueStoreRecord {
  attendeeDensity: number;
  description: string;
  endsAt: string;
  evidenceIds: readonly string[];
  id: string;
  industry: string;
  location: string;
  recommendationCount: number;
  source: LiveEventValueStoreSource;
  startsAt: string;
  title: string;
  updatedAt: string;
  venue: string;
}

export interface LiveEventValueRecommendationProvider {
  source: string;
  sourceLabel: string;
  getEvent: (eventId: string) => Promise<LiveEventValueStoreRecord | null>;
  listEvents: () => Promise<readonly LiveEventValueStoreRecord[]>;
}

export interface StorageEventValueRecommendationProviderOptions {
  source?: string;
  sourceLabel?: string;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}

export interface ConfiguredStorageEventValueRecommendationProviderOptions
  extends Pick<CreateConfiguredPostgresLiveRecordStoreOptions, "env"> {
  sourceLabel?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function sourceTypeFor(value: unknown): SourceType {
  return typeof value === "string" && isSourceType(value)
    ? value
    : "event_import";
}

function sourceFor(
  record: LiveRecord<Record<string, unknown>>,
): LiveEventValueStoreSource {
  const payloadSource = record.payload.source;

  if (isRecord(payloadSource)) {
    return {
      type: sourceTypeFor(payloadSource.type),
      id:
        readText(payloadSource.id) ??
        readText(record.sourceId) ??
        `source:event-value:${record.recordId}`,
      label:
        readText(payloadSource.label) ??
        readText(record.sourceLabel) ??
        "Live event value source",
      providerRecordId:
        readText(record.providerRecordId) ?? record.recordId,
      importedAt: record.createdAt,
    };
  }

  return {
    type: sourceTypeFor(record.sourceType),
    id: record.sourceId,
    label: readText(record.sourceLabel) ?? "Live event value source",
    providerRecordId: readText(record.providerRecordId) ?? record.recordId,
    importedAt: record.createdAt,
  };
}

function evidenceIdsFor(
  record: LiveRecord<Record<string, unknown>>,
): readonly string[] {
  const payloadEvidenceIds = record.payload.evidenceIds;

  if (Array.isArray(payloadEvidenceIds)) {
    const ids = payloadEvidenceIds.filter(
      (evidenceId): evidenceId is string => readText(evidenceId) !== null,
    );

    if (ids.length > 0) {
      return ids;
    }
  }

  return record.evidenceIds.length > 0
    ? record.evidenceIds
    : [`evidence:event-value:${record.recordId}`];
}

function deriveIndustry(text: string): string {
  const normalizedText = text.toLowerCase();

  if (/(ai|人工知能|業務自動化|automation|poc)/i.test(normalizedText)) {
    return "AI automation";
  }

  if (/(climate|脱炭素|sustainability|carbon)/i.test(normalizedText)) {
    return "climate";
  }

  if (/(ec|ecommerce|commerce|越境)/i.test(normalizedText)) {
    return "cross-border ecommerce";
  }

  if (/(restaurant|飲食|hospitality|inbound)/i.test(normalizedText)) {
    return "hospitality";
  }

  if (/(fintech|finance|bank|決済)/i.test(normalizedText)) {
    return "fintech";
  }

  return "relationship development";
}

function eventIdForRelatedRecord(
  record: LiveRecord<Record<string, unknown>>,
): string | null {
  return (
    readText(record.payload.eventId) ??
    (record.targetType === "event" ? readText(record.targetId) : null)
  );
}

function countByEventId(
  records: readonly LiveRecord<Record<string, unknown>>[],
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();

  for (const record of records) {
    const eventId = eventIdForRelatedRecord(record);

    if (eventId) {
      counts.set(eventId, (counts.get(eventId) ?? 0) + 1);
    }
  }

  return counts;
}

function eventValueRecordFromLiveRecord(input: {
  attendeeCounts: ReadonlyMap<string, number>;
  recommendationCounts: ReadonlyMap<string, number>;
  record: LiveRecord<Record<string, unknown>>;
}): LiveEventValueStoreRecord {
  const title =
    readText(input.record.payload.title) ??
    readText(input.record.payload.name) ??
    readText(input.record.searchText) ??
    input.record.recordId;
  const description =
    readText(input.record.payload.description) ??
    readText(input.record.searchText) ??
    title;
  const location =
    readText(input.record.payload.location) ??
    readText(input.record.payload.venue) ??
    readText(input.record.sourceLabel) ??
    "Live event source";
  const source = sourceFor(input.record);
  const industry =
    readText(input.record.payload.industry) ??
    deriveIndustry(`${title} ${description} ${source.label}`);

  return {
    attendeeDensity: input.attendeeCounts.get(input.record.recordId) ?? 0,
    description,
    endsAt:
      readText(input.record.payload.endsAt) ??
      readText(input.record.payload.startsAt) ??
      input.record.occurredAt ??
      input.record.createdAt,
    evidenceIds: evidenceIdsFor(input.record),
    id: input.record.recordId,
    industry,
    location,
    recommendationCount:
      input.recommendationCounts.get(input.record.recordId) ?? 0,
    source,
    startsAt:
      readText(input.record.payload.startsAt) ??
      input.record.occurredAt ??
      input.record.createdAt,
    title,
    updatedAt: input.record.updatedAt,
    venue: readText(input.record.payload.venue) ?? location,
  };
}

export function createStorageEventValueRecommendationProvider({
  source,
  sourceLabel = "Event value shared live storage",
  store,
  workspaceId,
}: StorageEventValueRecommendationProviderOptions): LiveEventValueRecommendationProvider {
  async function listEvents(): Promise<readonly LiveEventValueStoreRecord[]> {
    const [eventRecords, attendeeRecords, recommendationRecords] =
      await Promise.all([
        store.listRecords({
          workspaceId,
          collectionName: EVENT_VALUE_LIVE_RECORD_COLLECTIONS.events,
        }),
        store.listRecords({
          workspaceId,
          collectionName: EVENT_VALUE_LIVE_RECORD_COLLECTIONS.attendees,
        }),
        store.listRecords({
          workspaceId,
          collectionName:
            EVENT_VALUE_LIVE_RECORD_COLLECTIONS.matchRecommendations,
        }),
      ]);
    const attendeeCounts = countByEventId(attendeeRecords);
    const recommendationCounts = countByEventId(recommendationRecords);

    return eventRecords.map((record) =>
      eventValueRecordFromLiveRecord({
        attendeeCounts,
        recommendationCounts,
        record,
      }),
    );
  }

  return {
    source: source ?? `live-record-store:event-value-recommendations:${workspaceId}`,
    sourceLabel,
    async getEvent(eventId) {
      const events = await listEvents();

      return events.find((event) => event.id === eventId) ?? null;
    },
    listEvents,
  };
}

export function createConfiguredStorageEventValueRecommendationProvider({
  env,
  sourceLabel = "Event value Postgres live storage",
}: ConfiguredStorageEventValueRecommendationProviderOptions = {}): LiveEventValueRecommendationProvider | null {
  const configured = createConfiguredPostgresLiveRecordStore<
    Record<string, unknown>
  >({ env });

  if (!configured) {
    return null;
  }

  return createStorageEventValueRecommendationProvider({
    source: `postgres-live-record-store:event-value-recommendations:${configured.workspaceId}`,
    sourceLabel,
    store: configured.store,
    workspaceId: configured.workspaceId,
  });
}
