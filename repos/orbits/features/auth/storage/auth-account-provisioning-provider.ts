import type { AccountDTO, UserProfileDTO } from "../../../shared/domain/contracts";
import {
  createConfiguredPostgresLiveRecordStore,
} from "../../../shared/storage/configured-live-record-store";
import type { LiveDatabaseEnv } from "../../../shared/storage/live-database-config";
import type {
  LiveRecord,
  LiveRecordStoreLike,
} from "../../../shared/storage/live-record-store";
import type { AuthUserDTO } from "../contract";

export interface AuthAccountProvisioningProvider {
  ensureAccountForUser: (user: AuthUserDTO) => Promise<void>;
}

export interface StorageAuthAccountProvisioningProviderOptions {
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}

function accountRecord(
  user: AuthUserDTO,
  workspaceId: string,
): LiveRecord<Record<string, unknown>> {
  const account: AccountDTO = {
    id: user.id,
    name: `${user.displayName} 的 Orbit`,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };

  return {
    workspaceId,
    collectionName: "accounts",
    recordId: account.id,
    userId: account.id,
    sourceType: "manual",
    sourceId: `auth-account:${user.id}`,
    sourceLabel: "Orbit account registration",
    provider: "auth-account-provisioning",
    providerRecordId: user.id,
    evidenceIds: [`evidence:auth-account:${user.id}`],
    occurredAt: user.createdAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lifecycleState: "active",
    searchText: `${user.displayName} ${user.email}`,
    payload: account as unknown as Record<string, unknown>,
  };
}

function profileRecord(
  user: AuthUserDTO,
  workspaceId: string,
): LiveRecord<Record<string, unknown>> {
  const profile: UserProfileDTO = {
    id: `profile:${user.id}`,
    accountId: user.id,
    displayName: user.displayName,
    timezone: "Asia/Tokyo",
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };

  return {
    workspaceId,
    collectionName: "profiles",
    recordId: profile.id,
    userId: user.id,
    sourceType: "manual",
    sourceId: `auth-profile:${user.id}`,
    sourceLabel: "Orbit account registration",
    provider: "auth-account-provisioning",
    providerRecordId: user.id,
    evidenceIds: [`evidence:auth-profile:${user.id}`],
    occurredAt: user.createdAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lifecycleState: "active",
    searchText: `${user.displayName} ${user.email}`,
    payload: profile as unknown as Record<string, unknown>,
  };
}

export function createStorageAuthAccountProvisioningProvider({
  store,
  workspaceId,
}: StorageAuthAccountProvisioningProviderOptions): AuthAccountProvisioningProvider {
  return {
    async ensureAccountForUser(user) {
      const account = await store.getRecord({
        workspaceId,
        collectionName: "accounts",
        recordId: user.id,
      });
      const profileId = `profile:${user.id}`;
      const profile = await store.getRecord({
        workspaceId,
        collectionName: "profiles",
        recordId: profileId,
      });

      if (!account) {
        await store.upsertRecord(accountRecord(user, workspaceId));
      }

      if (!profile) {
        await store.upsertRecord(profileRecord(user, workspaceId));
      }
    },
  };
}

export function createConfiguredAuthAccountProvisioningProvider(
  env?: LiveDatabaseEnv,
): AuthAccountProvisioningProvider | null {
  const configuredStore = createConfiguredPostgresLiveRecordStore({ env });

  if (!configuredStore) {
    return null;
  }

  return createStorageAuthAccountProvisioningProvider({
    store: configuredStore.store,
    workspaceId: configuredStore.workspaceId,
  });
}
