import type { AccountDTO, UserProfileDTO } from "../../../shared/domain/contracts";
import { createConfiguredPostgresLiveRecordStore } from "../../../shared/storage/configured-live-record-store";
import {
  resolveLiveDatabaseConnectionConfig,
  type LiveDatabaseEnv,
} from "../../../shared/storage/live-database-config";
import type {
  LiveRecord,
  LiveRecordStoreLike,
} from "../../../shared/storage/live-record-store";

export interface LiveProfileRecord extends UserProfileDTO {
  headline?: string;
  homeMarket?: string;
  organization?: string;
  preferredFollowUpWindow?: string;
  preferredIntroChannels?: readonly string[];
  relationshipGoal?: string;
  targetRelationshipTypes?: readonly string[];
  evidenceIds: readonly string[];
}

export interface LiveProfileGraph {
  accounts: readonly AccountDTO[];
  generatedAt: string;
  profiles: readonly LiveProfileRecord[];
}

export type LiveProfileProviderResult<TResult> = TResult | Promise<TResult>;

export interface LiveProfileProvider {
  source: string;
  sourceLabel: string;
  readProfileGraph: () => LiveProfileProviderResult<LiveProfileGraph>;
  upsertProfile: (
    profile: LiveProfileRecord,
  ) => LiveProfileProviderResult<LiveProfileRecord>;
}

export const PROFILE_LIVE_RECORD_COLLECTIONS = {
  accounts: "accounts",
  profiles: "profiles",
} as const;

export interface StorageProfileProviderOptions {
  source?: string;
  sourceLabel?: string;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}

export interface ConfiguredStorageProfileProviderOptions {
  env?: LiveDatabaseEnv;
  sourceLabel?: string;
}

interface CachedConfiguredStorageProfileProvider {
  key: string;
  provider: LiveProfileProvider;
}

let cachedDefaultProvider: CachedConfiguredStorageProfileProvider | null = null;

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
): LiveProfileRecord | null {
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
    organization: optionalString(payload.organization),
    preferredFollowUpWindow: optionalString(payload.preferredFollowUpWindow),
    preferredIntroChannels: stringArray(payload.preferredIntroChannels),
    relationshipGoal: optionalString(payload.relationshipGoal),
    targetRelationshipTypes: stringArray(payload.targetRelationshipTypes),
    evidenceIds:
      record.evidenceIds.length > 0
        ? record.evidenceIds
        : [`evidence:profile:${payload.id}`],
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

function searchTextFor(profile: LiveProfileRecord): string {
  return [
    profile.displayName,
    profile.role,
    profile.organization,
    profile.headline,
    profile.homeMarket,
    profile.relationshipGoal,
    profile.preferredFollowUpWindow,
    ...profile.targetRelationshipTypes,
    ...profile.preferredIntroChannels,
  ]
    .filter(Boolean)
    .join(" ");
}

export function createStorageProfileProvider({
  source,
  sourceLabel = "Profile shared live storage",
  store,
  workspaceId,
}: StorageProfileProviderOptions): LiveProfileProvider {
  async function existingProfileRecord(
    profileId: string,
  ): Promise<LiveRecord<Record<string, unknown>> | null> {
    return store.getRecord({
      workspaceId,
      collectionName: PROFILE_LIVE_RECORD_COLLECTIONS.profiles,
      recordId: profileId,
      includeDeleted: true,
    });
  }

  return {
    source: source ?? `live-record-store:profiles:${workspaceId}`,
    sourceLabel,
    async readProfileGraph(): Promise<LiveProfileGraph> {
      const [accountRecords, profileRecords] = await Promise.all([
        store.listRecords({
          workspaceId,
          collectionName: PROFILE_LIVE_RECORD_COLLECTIONS.accounts,
        }),
        store.listRecords({
          workspaceId,
          collectionName: PROFILE_LIVE_RECORD_COLLECTIONS.profiles,
        }),
      ]);

      return {
        accounts: accountRecords
          .map(accountFromRecord)
          .filter((account): account is AccountDTO => account !== null),
        profiles: profileRecords
          .map(profileFromRecord)
          .filter((profile): profile is LiveProfileRecord => profile !== null),
        generatedAt: latestTimestamp([...accountRecords, ...profileRecords]),
      };
    },
    async upsertProfile(profile): Promise<LiveProfileRecord> {
      const existing = await existingProfileRecord(profile.id);
      const evidenceIds =
        existing && existing.evidenceIds.length > 0
          ? existing.evidenceIds
          : profile.evidenceIds;
      const record: LiveRecord<Record<string, unknown>> = {
        workspaceId,
        collectionName: PROFILE_LIVE_RECORD_COLLECTIONS.profiles,
        recordId: profile.id,
        userId: existing?.userId ?? null,
        sourceType: existing?.sourceType ?? "manual",
        sourceId: existing?.sourceId ?? `source:profile:${profile.id}`,
        sourceLabel: existing?.sourceLabel ?? sourceLabel,
        provider: existing?.provider ?? "profile-live-record-provider",
        providerRecordId: existing?.providerRecordId ?? profile.id,
        evidenceIds,
        targetType: "profile",
        targetId: profile.id,
        occurredAt: profile.updatedAt,
        createdAt: existing?.createdAt ?? profile.createdAt,
        updatedAt: profile.updatedAt,
        deletedAt: null,
        lifecycleState: "active",
        searchText: searchTextFor(profile),
        payload: {
          ...profile,
          evidenceIds,
        },
      };

      const saved = await store.upsertRecord(record);
      const parsed = profileFromRecord(saved);

      if (!parsed) {
        throw new Error("Profile live record provider wrote an invalid profile record.");
      }

      return parsed;
    },
  };
}

export function createConfiguredStorageProfileProvider({
  env,
  sourceLabel = "Profile Postgres live storage",
}: ConfiguredStorageProfileProviderOptions = {}): LiveProfileProvider | null {
  const config = resolveLiveDatabaseConnectionConfig(env);

  if (!config) {
    return null;
  }

  const canUseDefaultCache =
    env === undefined && sourceLabel === "Profile Postgres live storage";
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

  const provider = createStorageProfileProvider({
    source: `postgres-live-record-store:profiles:${config.workspaceId}`,
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
