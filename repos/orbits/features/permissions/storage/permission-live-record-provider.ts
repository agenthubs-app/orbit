import type { PermissionStateDTO } from "../../../shared/domain/contracts";
import {
  isPermissionState,
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

export interface LivePermissionStateGraph {
  evidenceIds: readonly string[];
  generatedAt: string;
  permissions: readonly PermissionStateDTO[];
}

export type LivePermissionStateProviderResult<TResult> =
  | TResult
  | Promise<TResult>;

export interface LivePermissionStateProvider {
  source: string;
  sourceLabel: string;
  readPermissionGraph: () => LivePermissionStateProviderResult<LivePermissionStateGraph>;
}

export const PERMISSION_LIVE_RECORD_COLLECTIONS = {
  permissions: "permissions",
} as const;

export interface StoragePermissionStateProviderOptions {
  source?: string;
  sourceLabel?: string;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}

export interface ConfiguredStoragePermissionStateProviderOptions {
  env?: LiveDatabaseEnv;
  sourceLabel?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function evidenceIds(value: unknown): readonly [string, ...string[]] | null {
  const ids = Array.isArray(value)
    ? value.filter((item): item is string => nonEmptyString(item))
    : [];

  return ids.length > 0 ? [ids[0], ...ids.slice(1)] : null;
}

function permissionFromRecord(
  record: LiveRecord<Record<string, unknown>>,
): PermissionStateDTO | null {
  const payload = record.payload;
  const source = payload.source;
  const ids = evidenceIds(payload.evidenceIds);

  if (
    !nonEmptyString(payload.id) ||
    !nonEmptyString(payload.capability) ||
    !isPermissionState(payload.state) ||
    !nonEmptyString(payload.updatedAt) ||
    !isRecord(source) ||
    !isSourceType(source.type) ||
    !nonEmptyString(source.id) ||
    !ids
  ) {
    return null;
  }

  return {
    id: payload.id,
    capability: payload.capability,
    state: payload.state,
    updatedAt: payload.updatedAt,
    source: {
      type: source.type,
      id: source.id,
      label: nonEmptyString(source.label) ? source.label : undefined,
    },
    evidenceIds: ids,
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

function evidenceIdsFor(
  records: readonly LiveRecord<Record<string, unknown>>[],
): readonly string[] {
  const ids = records.flatMap((record) => record.evidenceIds);

  return ids.length > 0
    ? [...new Set(ids)]
    : ["evidence:permission-live-store-empty"];
}

export function createStoragePermissionStateProvider({
  source,
  sourceLabel = "Permissions shared live storage",
  store,
  workspaceId,
}: StoragePermissionStateProviderOptions): LivePermissionStateProvider {
  return {
    source: source ?? `live-record-store:permissions:${workspaceId}`,
    sourceLabel,
    async readPermissionGraph(): Promise<LivePermissionStateGraph> {
      const permissionRecords = await store.listRecords({
        workspaceId,
        collectionName: PERMISSION_LIVE_RECORD_COLLECTIONS.permissions,
      });

      return {
        evidenceIds: evidenceIdsFor(permissionRecords),
        generatedAt: latestTimestamp(permissionRecords),
        permissions: permissionRecords
          .map(permissionFromRecord)
          .filter(
            (permission): permission is PermissionStateDTO =>
              permission !== null,
          ),
      };
    },
  };
}

export function createConfiguredStoragePermissionStateProvider({
  env,
  sourceLabel = "Permissions Postgres live storage",
}: ConfiguredStoragePermissionStateProviderOptions = {}): LivePermissionStateProvider | null {
  const configuredStore = createConfiguredPostgresLiveRecordStore({
    env,
  });

  if (!configuredStore) {
    return null;
  }

  return createStoragePermissionStateProvider({
    source: `postgres-live-record-store:permissions:${configuredStore.workspaceId}`,
    sourceLabel,
    store: configuredStore.store,
    workspaceId: configuredStore.workspaceId,
  });
}
