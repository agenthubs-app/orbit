import {
  resolveLiveDatabaseConnectionConfig,
  type LiveDatabaseEnv,
} from "../../../shared/storage/live-database-config";
import type {
  LiveRecord,
  LiveRecordStoreLike,
} from "../../../shared/storage/live-record-store";
import { createConfiguredPostgresLiveRecordStore } from "../../../shared/storage/configured-live-record-store";
import type {
  LiveSourceConsistencyAuditCollectionRecords,
  LiveSourceConsistencyProvenanceAuditProvider,
  LiveSourceConsistencyProvenanceGraph,
} from "../live-provenance-audit-service";

export const SOURCE_CONSISTENCY_PROVENANCE_AUDIT_LIVE_RECORD_COLLECTIONS = {
  agent_action: "agentActions",
  chat_summary: "conversations",
  connection: "connections",
  contact: "contacts",
  evidence: "evidence",
  recommendation: "matchRecommendations",
  task: "tasks",
} as const;

export interface StorageSourceConsistencyProvenanceAuditProviderOptions {
  source?: string;
  sourceLabel?: string;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}

export interface ConfiguredStorageSourceConsistencyProvenanceAuditProviderOptions {
  env?: LiveDatabaseEnv;
  sourceLabel?: string;
}

interface CachedConfiguredStorageSourceConsistencyProvenanceAuditProvider {
  key: string;
  provider: LiveSourceConsistencyProvenanceAuditProvider;
}

let cachedDefaultProvider:
  | CachedConfiguredStorageSourceConsistencyProvenanceAuditProvider
  | null = null;

function latestTimestamp(
  records: readonly LiveRecord<Record<string, unknown>>[],
): string {
  return (
    records
      .map((record) => record.updatedAt)
      .filter((value): value is string => Boolean(value?.trim()))
      .sort()
      .at(-1) ?? new Date(0).toISOString()
  );
}

export function createStorageSourceConsistencyProvenanceAuditProvider({
  source,
  sourceLabel = "Source consistency provenance shared live storage",
  store,
  workspaceId,
}: StorageSourceConsistencyProvenanceAuditProviderOptions): LiveSourceConsistencyProvenanceAuditProvider {
  return {
    source:
      source ??
      `live-record-store:source-consistency-provenance-audit:${workspaceId}`,
    sourceLabel,
    async readAuditGraph(): Promise<LiveSourceConsistencyProvenanceGraph> {
      const collections = await Promise.all(
        Object.entries(
          SOURCE_CONSISTENCY_PROVENANCE_AUDIT_LIVE_RECORD_COLLECTIONS,
        ).map(async ([entityKind, collectionName]) => {
          const records = await store.listRecords({
            collectionName,
            workspaceId,
          });

          return {
            collectionName,
            entityKind,
            records,
          } as LiveSourceConsistencyAuditCollectionRecords;
        }),
      );
      const records = collections.flatMap((collection) => collection.records);

      return {
        collections,
        generatedAt: latestTimestamp(records),
      };
    },
  };
}

export function createConfiguredStorageSourceConsistencyProvenanceAuditProvider({
  env,
  sourceLabel = "Source consistency provenance Postgres live storage",
}: ConfiguredStorageSourceConsistencyProvenanceAuditProviderOptions = {}): LiveSourceConsistencyProvenanceAuditProvider | null {
  const config = resolveLiveDatabaseConnectionConfig(env);

  if (!config) {
    return null;
  }

  const canUseDefaultCache =
    env === undefined &&
    sourceLabel === "Source consistency provenance Postgres live storage";
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

  const provider = createStorageSourceConsistencyProvenanceAuditProvider({
    source: `postgres-live-record-store:source-consistency-provenance-audit:${config.workspaceId}`,
    sourceLabel,
    store: configuredStore.store,
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
