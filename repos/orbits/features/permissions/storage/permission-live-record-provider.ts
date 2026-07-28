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

export interface LivePermissionRequestWrite {
  capability: string;
  intent: string;
  requestedAt: string;
}

export type LivePermissionStateProviderResult<TResult> =
  | TResult
  | Promise<TResult>;

export interface LivePermissionStateProvider {
  source: string;
  sourceLabel: string;
  readPermissionGraph: () => LivePermissionStateProviderResult<LivePermissionStateGraph>;
  readPermissionGraphForAccount?: (
    accountId: string,
  ) => LivePermissionStateProviderResult<LivePermissionStateGraph>;
  requestPermission?: (
    input: LivePermissionRequestWrite,
  ) => LivePermissionStateProviderResult<PermissionStateDTO>;
  requestPermissionForAccount?: (
    accountId: string,
    input: LivePermissionRequestWrite,
  ) => LivePermissionStateProviderResult<PermissionStateDTO>;
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
  async function readPermissionGraph(
    accountId?: string,
  ): Promise<LivePermissionStateGraph> {
    const permissionRecords = await store.listRecords({
      workspaceId,
      collectionName: PERMISSION_LIVE_RECORD_COLLECTIONS.permissions,
      userId: accountId,
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
  }

  async function requestPermissionForAccount(
    accountId: string,
    input: LivePermissionRequestWrite,
  ): Promise<PermissionStateDTO> {
    const normalizedAccountId = accountId.trim();
    const capability = input.capability.trim();
    const intent = input.intent.trim();
    const requestedAt = input.requestedAt.trim();

    if (!normalizedAccountId || !capability || !intent || !requestedAt) {
      throw new Error("Permission request storage input is incomplete.");
    }

    const recordId = `permission:${normalizedAccountId}:${capability}`;
    const existing = await store.getRecord({
      workspaceId,
      collectionName: PERMISSION_LIVE_RECORD_COLLECTIONS.permissions,
      recordId,
      includeDeleted: true,
    });

    if (existing?.userId && existing.userId !== normalizedAccountId) {
      throw new Error("Permission record belongs to a different actor.");
    }

    const evidenceId = `evidence:${recordId}:requested`;
    const sourceId = `source:${recordId}`;
    const permission: PermissionStateDTO = {
      id: recordId,
      capability,
      state: "requested",
      updatedAt: requestedAt,
      source: {
        type: "manual",
        id: sourceId,
        label: "Orbit permission review",
      },
      evidenceIds: [evidenceId],
    };
    const saved = await store.upsertRecord({
      workspaceId,
      collectionName: PERMISSION_LIVE_RECORD_COLLECTIONS.permissions,
      recordId,
      userId: normalizedAccountId,
      sourceType: "manual",
      sourceId,
      sourceLabel: "Orbit permission review",
      provider: "permission-live-record-provider",
      providerRecordId: recordId,
      evidenceIds: permission.evidenceIds,
      targetType: "permission",
      targetId: recordId,
      occurredAt: requestedAt,
      createdAt: existing?.createdAt ?? requestedAt,
      updatedAt: requestedAt,
      deletedAt: null,
      lifecycleState: "active",
      searchText: `${capability} ${intent} requested`,
      payload: {
        ...permission,
        intent,
        requestedAt,
      },
    });
    const parsed = permissionFromRecord(saved);

    if (!parsed) {
      throw new Error("Permission live record provider wrote an invalid record.");
    }

    return parsed;
  }

  return {
    source: source ?? `live-record-store:permissions:${workspaceId}`,
    sourceLabel,
    readPermissionGraph: () => readPermissionGraph(),
    readPermissionGraphForAccount: (accountId) =>
      readPermissionGraph(accountId),
    requestPermissionForAccount,
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
