import {
  isSourceType,
  type SourceType,
} from "../../../../shared/domain/source-types";
import {
  resolveLiveDatabaseConnectionConfig,
  type LiveDatabaseEnv,
} from "../../../../shared/storage/live-database-config";
import type {
  LiveRecord,
  LiveRecordStoreLike,
} from "../../../../shared/storage/live-record-store";
import {
  createPgLiveRecordSqlClient,
  createPostgresLiveRecordStore,
} from "../../../../shared/storage/postgres-live-record-store";
import type {
  LiveEventStoreEvidence,
  LiveEventStoreManualEventInput,
  LiveEventStoreProvider,
  LiveEventStoreRecord,
} from "../live-service";

export const EVENTS_LIVE_RECORD_COLLECTION = "events" as const;

export interface StorageEventEvidencePayload extends Record<string, unknown> {
  capturedAt: string;
  createdBy: string;
  evidenceId: string;
  excerpt: string;
}

export interface StorageEventPayload extends Record<string, unknown> {
  description?: string | null;
  endsAt?: string | null;
  evidence?: readonly StorageEventEvidencePayload[] | null;
  nextAction?: string | null;
  recommendedPreparation?: string | null;
  relationshipContext?: string | null;
  startsAt?: string | null;
  status?: string | null;
  title: string;
  venue?: string | null;
}

export interface StorageEventStoreProviderOptions {
  createdBy?: string;
  now?: () => string;
  source?: string;
  sourceLabel?: string;
  store: LiveRecordStoreLike<StorageEventPayload>;
  workspaceId: string;
}

export interface ConfiguredStorageEventStoreProviderOptions {
  createdBy?: string;
  env?: LiveDatabaseEnv;
  now?: () => string;
  sourceLabel?: string;
}

interface CachedConfiguredStorageEventStoreProvider {
  key: string;
  provider: LiveEventStoreProvider;
}

let cachedDefaultProvider: CachedConfiguredStorageEventStoreProvider | null = null;

function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function sourceTypeFor(value: string): SourceType {
  return isSourceType(value) ? value : "system";
}

function slugFromTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function isEvidencePayload(value: unknown): value is StorageEventEvidencePayload {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { capturedAt?: unknown }).capturedAt === "string" &&
    typeof (value as { createdBy?: unknown }).createdBy === "string" &&
    typeof (value as { evidenceId?: unknown }).evidenceId === "string" &&
    typeof (value as { excerpt?: unknown }).excerpt === "string"
  );
}

function evidenceFor(record: LiveRecord<StorageEventPayload>): readonly LiveEventStoreEvidence[] {
  if (Array.isArray(record.payload.evidence)) {
    return record.payload.evidence.filter(isEvidencePayload).map((evidence) => ({
      capturedAt: evidence.capturedAt,
      createdBy: evidence.createdBy,
      evidenceId: evidence.evidenceId,
      excerpt: evidence.excerpt,
    }));
  }

  return record.evidenceIds.map((evidenceId) => ({
    capturedAt: record.occurredAt ?? record.createdAt,
    createdBy: "shared-live-record-storage",
    evidenceId,
    excerpt:
      readText(record.payload.description) ??
      `Event evidence ${evidenceId} was loaded from shared storage.`,
  }));
}

function toLiveEventStoreRecord(
  record: LiveRecord<StorageEventPayload>,
): LiveEventStoreRecord {
  return {
    id: record.recordId,
    title: record.payload.title,
    description: readText(record.payload.description),
    venue: readText(record.payload.venue),
    startsAt: readText(record.payload.startsAt) ?? record.occurredAt,
    endsAt:
      readText(record.payload.endsAt) ??
      readText(record.payload.startsAt) ??
      record.occurredAt,
    status: readText(record.payload.status),
    source: {
      type: sourceTypeFor(record.sourceType),
      id: record.sourceId,
      label: record.sourceLabel ?? undefined,
      provider: record.provider ?? "shared-live-record-storage",
      providerRecordId: record.providerRecordId ?? record.recordId,
      importedAt: record.createdAt,
    },
    evidence: evidenceFor(record),
    relationshipContext: readText(record.payload.relationshipContext),
    recommendedPreparation: readText(record.payload.recommendedPreparation),
    nextAction: readText(record.payload.nextAction),
  };
}

function manualRecord(input: {
  createdBy: string;
  input: LiveEventStoreManualEventInput;
  now: string;
  workspaceId: string;
}): LiveRecord<StorageEventPayload> {
  const slug = slugFromTitle(input.input.title);
  const eventId = `event:live-record:${slug}`;
  const evidenceId = `evidence:live-record:${slug}`;
  const startsAt = readText(input.input.startsAt) ?? input.now;
  const endsAt = readText(input.input.endsAt) ?? startsAt;

  return {
    workspaceId: input.workspaceId,
    collectionName: EVENTS_LIVE_RECORD_COLLECTION,
    recordId: eventId,
    sourceType: "manual",
    sourceId: `source:events:manual:${slug}`,
    sourceLabel: input.input.sourceNote,
    provider: "shared-live-record-storage",
    providerRecordId: eventId,
    evidenceIds: [evidenceId],
    targetType: "event",
    targetId: eventId,
    occurredAt: startsAt,
    createdAt: input.now,
    updatedAt: input.now,
    lifecycleState: "active",
    searchText: [
      input.input.title,
      input.input.description,
      input.input.venue,
      input.input.sourceNote,
    ]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .join(" "),
    payload: {
      title: input.input.title,
      description: readText(input.input.description),
      venue: readText(input.input.venue),
      startsAt,
      endsAt,
      status: "confirmed",
      evidence: [
        {
          evidenceId,
          excerpt: input.input.sourceNote,
          capturedAt: startsAt,
          createdBy: input.createdBy,
        },
      ],
      relationshipContext: input.input.sourceNote,
      recommendedPreparation:
        "Review the storage-backed event before attaching attendees.",
      nextAction: "Prepare relationship context for the storage-backed event.",
    },
  };
}

export function createStorageEventStoreProvider({
  createdBy = "shared-storage-event-provider",
  now = () => new Date().toISOString(),
  source,
  sourceLabel = "Events shared storage",
  store,
  workspaceId,
}: StorageEventStoreProviderOptions): LiveEventStoreProvider {
  return {
    source: source ?? `live-record-store:events:${workspaceId}`,
    sourceLabel,
    async listEvents() {
      const records = await store.listRecords({
          workspaceId,
          collectionName: EVENTS_LIVE_RECORD_COLLECTION,
        });

      return records.map(toLiveEventStoreRecord);
    },
    async getEvent(eventId) {
      const record = await store.getRecord({
        workspaceId,
        collectionName: EVENTS_LIVE_RECORD_COLLECTION,
        recordId: eventId,
      });

      return record ? toLiveEventStoreRecord(record) : null;
    },
    async createManualEvent(input) {
      return toLiveEventStoreRecord(
        await store.upsertRecord(
          manualRecord({
            createdBy,
            input,
            now: now(),
            workspaceId,
          }),
        ),
      );
    },
  };
}

export function createConfiguredStorageEventStoreProvider({
  createdBy,
  env,
  now,
  sourceLabel = "Events Postgres live storage",
}: ConfiguredStorageEventStoreProviderOptions = {}): LiveEventStoreProvider | null {
  const config = resolveLiveDatabaseConnectionConfig(env);

  if (!config) {
    return null;
  }

  const canUseDefaultCache =
    createdBy === undefined &&
    env === undefined &&
    now === undefined &&
    sourceLabel === "Events Postgres live storage";
  const cacheKey = `${config.connectionString}\u0000${config.workspaceId}`;

  if (canUseDefaultCache && cachedDefaultProvider?.key === cacheKey) {
    return cachedDefaultProvider.provider;
  }

  const client = createPgLiveRecordSqlClient({
    connectionString: config.connectionString,
  });
  const store = createPostgresLiveRecordStore<StorageEventPayload>({ client });

  const provider = createStorageEventStoreProvider({
    createdBy,
    now,
    source: `postgres-live-record-store:events:${config.workspaceId}`,
    sourceLabel,
    store,
    workspaceId: config.workspaceId,
  });

  if (canUseDefaultCache) {
    cachedDefaultProvider = {
      key: cacheKey,
      provider,
    };
  }

  return provider;
}
