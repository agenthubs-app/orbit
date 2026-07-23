// auth_users 集合的存取层。record_id 由规范化邮箱决定,保证同邮箱只有一条记录;
// payload 内含 passwordHash(OAuth 用户为空),读取方通过 toAuthUserDTO 剥掉它。
import {
  createConfiguredPostgresLiveRecordStore,
} from "../../../shared/storage/configured-live-record-store";
import type { LiveDatabaseEnv } from "../../../shared/storage/live-database-config";
import type {
  LiveRecord,
  LiveRecordStoreLike,
} from "../../../shared/storage/live-record-store";
import {
  normalizeAuthEmail,
  type AuthUserDTO,
  type AuthUserProvider,
} from "../contract";

export const AUTH_USER_LIVE_RECORD_COLLECTION = "auth_users";

export interface StoredAuthUser extends AuthUserDTO {
  passwordHash: string | null;
  providerAccountId: string | null;
}

export interface AuthUserStorageProvider {
  source: string;
  getUserByEmail: (email: string) => Promise<StoredAuthUser | null>;
  saveUser: (user: StoredAuthUser) => Promise<StoredAuthUser>;
}

export interface StorageAuthUserProviderOptions {
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}

export function authUserRecordId(email: string): string {
  return `auth_user:${normalizeAuthEmail(email)}`;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isProvider(value: unknown): value is AuthUserProvider {
  return value === "credentials" || value === "google";
}

function storedUserFromRecord(
  record: LiveRecord<Record<string, unknown>>,
): StoredAuthUser | null {
  const payload = record.payload;

  if (
    !nonEmptyString(payload.id) ||
    !nonEmptyString(payload.email) ||
    !nonEmptyString(payload.displayName) ||
    !isProvider(payload.provider) ||
    !nonEmptyString(payload.createdAt) ||
    !nonEmptyString(payload.updatedAt)
  ) {
    return null;
  }

  return {
    id: payload.id,
    email: payload.email,
    displayName: payload.displayName,
    provider: payload.provider,
    passwordHash: nonEmptyString(payload.passwordHash)
      ? payload.passwordHash
      : null,
    providerAccountId: nonEmptyString(payload.providerAccountId)
      ? payload.providerAccountId
      : null,
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
  };
}

export function toAuthUserDTO(user: StoredAuthUser): AuthUserDTO {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    provider: user.provider,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export function createStorageAuthUserProvider({
  store,
  workspaceId,
}: StorageAuthUserProviderOptions): AuthUserStorageProvider {
  return {
    source: `live-record-store:auth-users:${workspaceId}`,
    async getUserByEmail(email) {
      const record = await store.getRecord({
        workspaceId,
        collectionName: AUTH_USER_LIVE_RECORD_COLLECTION,
        recordId: authUserRecordId(email),
      });

      return record ? storedUserFromRecord(record) : null;
    },
    async saveUser(user) {
      await store.upsertRecord({
        workspaceId,
        collectionName: AUTH_USER_LIVE_RECORD_COLLECTION,
        recordId: authUserRecordId(user.email),
        userId: user.id,
        sourceType: "manual",
        sourceId: `auth:${user.provider}`,
        sourceLabel: "Orbit account sign-up",
        provider: user.provider,
        providerRecordId: user.providerAccountId,
        evidenceIds: [`evidence:auth:${user.id}`],
        occurredAt: user.createdAt,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        lifecycleState: "active",
        searchText: user.email,
        payload: { ...user },
      });

      return user;
    },
  };
}

export function createConfiguredStorageAuthUserProvider(
  env?: LiveDatabaseEnv,
): AuthUserStorageProvider | null {
  const configuredStore = createConfiguredPostgresLiveRecordStore({ env });

  if (!configuredStore) {
    return null;
  }

  return createStorageAuthUserProvider({
    store: configuredStore.store,
    workspaceId: configuredStore.workspaceId,
  });
}
