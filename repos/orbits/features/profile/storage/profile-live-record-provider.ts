import type { AccountDTO, PublicProfileDTO, UserProfileDTO } from "../../../shared/domain/contracts";
import type { OrbitLanguage } from "../../../shared/contract/language";
import { parseOrbitLanguage } from "../../../shared/i18n/orbit-language";
import { createPostgresLiveRecordStore } from "../../../shared/storage/postgres-live-record-store";
import { createConfiguredTransactionalPostgresRuntime, type TransactionalPostgresClient } from "../../../shared/storage/transactional-postgres";
import type { ManualProfileUpdateInput, ProfileResult } from "../contract";
import type { ContactHandlesContract } from "../../../shared/contract/profile";
import { runProfileMutation } from "./profile-mutations";
import {
  resolveLiveDatabaseConnectionConfig,
  type LiveDatabaseEnv,
} from "../../../shared/storage/live-database-config";
import type {
  LiveRecord,
  LiveRecordStoreLike,
} from "../../../shared/storage/live-record-store";
import {
  createProfileActorPostgresReader,
  type ProfileActorPostgresReadRecord,
} from "./profile-actor-postgres-reader";

export interface LiveProfileRecord extends UserProfileDTO {
  birthDate?: string | null;
  headline?: string;
  homeMarket?: string;
  organization?: string;
  preferredFollowUpWindow?: string;
  preferredIntroChannels?: readonly string[];
  preferredLanguage?: OrbitLanguage;
  relationshipGoal?: string;
  targetRelationshipTypes?: readonly string[];
  spokenLanguages?: readonly string[];
  handles?: ContactHandlesContract;
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
  withProfileMutation?: (
    input: ManualProfileUpdateInput,
    actorId: string,
    operation: (provider: LiveProfileProvider) => Promise<ProfileResult>,
  ) => Promise<ProfileResult>;
  readProfileGraph: (
    actorId: string,
  ) => LiveProfileProviderResult<LiveProfileGraph>;
  upsertProfile: (
    profile: LiveProfileRecord,
    actorId: string,
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

type ProfileMapperRecord = Pick<
  ProfileActorPostgresReadRecord,
  "createdAt" | "evidenceIds" | "payload" | "updatedAt"
>;

function accountFromRecord(
  record: ProfileMapperRecord,
): AccountDTO | null {
  const payload = record.payload as Record<string, unknown>;

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
  record: ProfileMapperRecord,
): LiveProfileRecord | null {
  const payload = record.payload as Record<string, unknown>;

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
    birthDate: payload.birthDate === null ? null : optionalString(payload.birthDate),
    role: optionalString(payload.role),
    timezone: optionalString(payload.timezone),
    headline: optionalString(payload.headline),
    handles: isRecord(payload.handles)
      ? (payload.handles as ContactHandlesContract)
      : undefined,
    homeMarket: optionalString(payload.homeMarket),
    organization: optionalString(payload.organization),
    preferredFollowUpWindow: optionalString(payload.preferredFollowUpWindow),
    preferredIntroChannels: stringArray(payload.preferredIntroChannels),
    preferredLanguage: parseOrbitLanguage(
      typeof payload.preferredLanguage === "string"
        ? payload.preferredLanguage
        : null,
    ) ?? "zh",
    relationshipGoal: optionalString(payload.relationshipGoal),
    targetRelationshipTypes: stringArray(payload.targetRelationshipTypes),
    spokenLanguages: stringArray(payload.spokenLanguages),
    publicProfile: (payload.publicProfile ?? undefined) as
      | PublicProfileDTO
      | undefined,
    evidenceIds:
      record.evidenceIds.length > 0
        ? record.evidenceIds
        : [`evidence:profile:${payload.id}`],
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
  };
}

function latestTimestamp(
  records: readonly Pick<ProfileActorPostgresReadRecord, "updatedAt">[],
): string {
  return (
    records
      .map((record) => record.updatedAt)
      .filter(nonEmptyString)
      .sort()
      .at(-1) ?? new Date(0).toISOString()
  );
}

function profileGraphFromPostgresRead(input: {
  accounts: readonly ProfileActorPostgresReadRecord[];
  profiles: readonly ProfileActorPostgresReadRecord[];
}): LiveProfileGraph {
  return {
    accounts: input.accounts
      .map(accountFromRecord)
      .filter((account): account is AccountDTO => account !== null),
    generatedAt: latestTimestamp([...input.accounts, ...input.profiles]),
    profiles: input.profiles
      .map(profileFromRecord)
      .filter((profile): profile is LiveProfileRecord => profile !== null),
  };
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
    profile.handles?.email,
    profile.handles?.lineId,
    profile.handles?.wechatId,
    profile.publicProfile?.bio,
    profile.publicProfile?.selfIntroduction,
    profile.publicProfile?.industry,
    ...profile.targetRelationshipTypes,
    ...profile.preferredIntroChannels,
    ...(profile.publicProfile?.offering ?? []),
    ...(profile.publicProfile?.seeking ?? []),
    ...(profile.publicProfile?.topics ?? []),
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
    actorId: string,
  ): Promise<LiveRecord<Record<string, unknown>> | null> {
    const records = await store.listRecords({
      workspaceId,
      collectionName: PROFILE_LIVE_RECORD_COLLECTIONS.profiles,
      includeDeleted: true,
    });
    const matches = records.filter(
      (record) => record.recordId === profileId || record.payload.id === profileId,
    );
    const activeMatches = matches.filter(
      (record) => record.lifecycleState !== "deleted",
    );
    const candidates = activeMatches.length > 0 ? activeMatches : matches;

    if (candidates.length > 1) {
      throw new Error("Profile storage identity is ambiguous.");
    }

    const existing = candidates[0] ?? null;
    if (
      existing &&
      (existing.payload.accountId !== actorId ||
        (existing.userId != null && existing.userId !== actorId))
    ) {
      throw new Error("Profile record belongs to a different actor.");
    }

    return existing;
  }

  return {
    source: source ?? `live-record-store:profiles:${workspaceId}`,
    sourceLabel,
    async readProfileGraph(actorId): Promise<LiveProfileGraph> {
      if (!actorId.trim()) {
        throw new Error("Profile actor is required");
      }

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
      const actorProfiles = profileRecords.filter(
        (record) =>
          record.payload.accountId === actorId &&
          (record.userId == null || record.userId === actorId),
      );
      const actorAccounts = accountRecords.filter(
        (record) =>
          record.userId === actorId ||
          record.payload.id === actorId,
      );

      return {
        accounts: actorAccounts
          .map(accountFromRecord)
          .filter((account): account is AccountDTO => account !== null),
        profiles: actorProfiles
          .map(profileFromRecord)
          .filter((profile): profile is LiveProfileRecord => profile !== null),
        generatedAt: latestTimestamp([...actorAccounts, ...actorProfiles]),
      };
    },
    async upsertProfile(profile, actorId): Promise<LiveProfileRecord> {
      if (profile.accountId !== actorId) {
        throw new Error("Profile actor does not match the target account.");
      }

      const existing = await existingProfileRecord(profile.id, actorId);
      const evidenceIds =
        existing && existing.evidenceIds.length > 0
          ? existing.evidenceIds
          : profile.evidenceIds;
      const record: LiveRecord<Record<string, unknown>> = {
        workspaceId,
        collectionName: PROFILE_LIVE_RECORD_COLLECTIONS.profiles,
        recordId: existing?.recordId ?? profile.id,
        userId: actorId,
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

export function createTransactionalStorageProfileProvider({
  client, workspaceId, source, sourceLabel = "Profile shared live storage",
}: {
  client: TransactionalPostgresClient;
  workspaceId: string;
  source?: string;
  sourceLabel?: string;
}): LiveProfileProvider {
  const options = { workspaceId, source, sourceLabel };
  const storeProvider = createStorageProfileProvider({
    ...options,
    store: createPostgresLiveRecordStore({ client }),
  });
  const actorReader = createProfileActorPostgresReader({ client, workspaceId });
  return {
    ...storeProvider,
    async readProfileGraph(actorId) {
      return profileGraphFromPostgresRead(await actorReader(actorId));
    },
    withProfileMutation(input, actorId, operation) {
      return runProfileMutation({ client, workspaceId, actorId, input,
        operation: store => operation(createStorageProfileProvider({ ...options, store })),
      });
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

  const runtime = createConfiguredTransactionalPostgresRuntime({
    env,
  });

  if (!runtime) {
    return null;
  }

  const provider = createTransactionalStorageProfileProvider({
    source: `postgres-live-record-store:profiles:${config.workspaceId}`,
    sourceLabel,
    client: runtime.client,
    workspaceId: runtime.workspaceId,
  });

  if (canUseDefaultCache) {
    cachedDefaultProvider = {
      key: cacheKey,
      provider,
    };
  }

  return provider;
}
