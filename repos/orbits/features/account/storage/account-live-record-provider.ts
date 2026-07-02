import type { AccountDTO, UserProfileDTO } from "../../../shared/domain/contracts";
import {
  createConfiguredPostgresLiveRecordStore,
} from "../../../shared/storage/configured-live-record-store";
import type { LiveDatabaseEnv } from "../../../shared/storage/live-database-config";
import type {
  LiveRecord,
  LiveRecordStoreLike,
} from "../../../shared/storage/live-record-store";

export interface LiveAccountProfileRecord extends UserProfileDTO {
  headline?: string;
  homeMarket?: string;
  preferredFollowUpWindow?: string;
  relationshipGoal?: string;
}

export interface LiveAccountSessionGraph {
  accounts: readonly AccountDTO[];
  evidenceIds: readonly string[];
  generatedAt: string;
  profiles: readonly LiveAccountProfileRecord[];
}

export type LiveAccountSessionProviderResult<TResult> = TResult | Promise<TResult>;

export interface LiveAccountSessionProvider {
  source: string;
  sourceLabel: string;
  readAccountSessionGraph: () => LiveAccountSessionProviderResult<LiveAccountSessionGraph>;
}

export const ACCOUNT_SESSION_LIVE_RECORD_COLLECTIONS = {
  accounts: "accounts",
  profiles: "profiles",
} as const;

export interface StorageAccountSessionProviderOptions {
  source?: string;
  sourceLabel?: string;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}

export interface ConfiguredStorageAccountSessionProviderOptions {
  env?: LiveDatabaseEnv;
  sourceLabel?: string;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function optionalString(value: unknown): string | undefined {
  return nonEmptyString(value) ? value : undefined;
}

function accountFromRecord(
  record: LiveRecord<Record<string, unknown>>,
): AccountDTO | null {
  const payload = record.payload;

  if (
    !nonEmptyString(payload.id) ||
    !nonEmptyString(payload.name) ||
    !nonEmptyString(payload.createdAt) ||
    !nonEmptyString(payload.updatedAt)
  ) {
    return null;
  }

  return {
    id: payload.id,
    name: payload.name,
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
  };
}

function profileFromRecord(
  record: LiveRecord<Record<string, unknown>>,
): LiveAccountProfileRecord | null {
  const payload = record.payload;

  if (
    !nonEmptyString(payload.id) ||
    !nonEmptyString(payload.accountId) ||
    !nonEmptyString(payload.displayName) ||
    !nonEmptyString(payload.createdAt) ||
    !nonEmptyString(payload.updatedAt)
  ) {
    return null;
  }

  return {
    id: payload.id,
    accountId: payload.accountId,
    displayName: payload.displayName,
    role: optionalString(payload.role),
    timezone: optionalString(payload.timezone),
    headline: optionalString(payload.headline),
    homeMarket: optionalString(payload.homeMarket),
    preferredFollowUpWindow: optionalString(payload.preferredFollowUpWindow),
    relationshipGoal: optionalString(payload.relationshipGoal),
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
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

  return ids.length > 0 ? [...new Set(ids)] : ["evidence:account-live-store-empty"];
}

export function createStorageAccountSessionProvider({
  source,
  sourceLabel = "Account shared live storage",
  store,
  workspaceId,
}: StorageAccountSessionProviderOptions): LiveAccountSessionProvider {
  return {
    source: source ?? `live-record-store:account-session:${workspaceId}`,
    sourceLabel,
    async readAccountSessionGraph(): Promise<LiveAccountSessionGraph> {
      const [accountRecords, profileRecords] = await Promise.all([
        store.listRecords({
          workspaceId,
          collectionName: ACCOUNT_SESSION_LIVE_RECORD_COLLECTIONS.accounts,
        }),
        store.listRecords({
          workspaceId,
          collectionName: ACCOUNT_SESSION_LIVE_RECORD_COLLECTIONS.profiles,
        }),
      ]);
      const records = [...accountRecords, ...profileRecords];

      return {
        accounts: accountRecords
          .map(accountFromRecord)
          .filter((account): account is AccountDTO => account !== null),
        evidenceIds: evidenceIdsFor(records),
        generatedAt: latestTimestamp(records),
        profiles: profileRecords
          .map(profileFromRecord)
          .filter(
            (profile): profile is LiveAccountProfileRecord => profile !== null,
          ),
      };
    },
  };
}

export function createConfiguredStorageAccountSessionProvider({
  env,
  sourceLabel = "Account Postgres live storage",
}: ConfiguredStorageAccountSessionProviderOptions = {}): LiveAccountSessionProvider | null {
  const configuredStore = createConfiguredPostgresLiveRecordStore({
    env,
  });

  if (!configuredStore) {
    return null;
  }

  return createStorageAccountSessionProvider({
    source: `postgres-live-record-store:account-session:${configuredStore.workspaceId}`,
    sourceLabel,
    store: configuredStore.store,
    workspaceId: configuredStore.workspaceId,
  });
}
