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
import type { LiveRecordSqlClient } from "../../../shared/storage/postgres-live-record-store";
import {
  normalizeAuthEmail,
  type AuthUserDTO,
  type AuthUserProvider,
} from "../contract";

export const AUTH_USER_LIVE_RECORD_COLLECTION = "auth_users";

export interface StoredAuthUser extends AuthUserDTO {
  passwordHash: string | null;
  providerAccountId: string | null;
  /** 建号时写入，之后没有任何代码改它（只追加不改写）。 */
  consents?: readonly AuthConsentRecord[];
}

/** 同意了哪一版条款。 */
export interface AuthConsentRecord {
  termsVersion: string;
  privacyVersion: string;
  agreedAt: string;
  client: "web" | "app";
  method: "credentials" | "google";
}

export interface AuthUserStorageProvider {
  source: string;
  insertUserIfAbsent?: (user: StoredAuthUser) => Promise<StoredAuthUser | null>;
  getUserByEmail: (email: string) => Promise<StoredAuthUser | null>;
  saveUser: (user: StoredAuthUser) => Promise<StoredAuthUser>;
  /**
   * 同邮箱第一次用 Google 登录，而这个密码账号的邮箱没验证过：设密码的不一定是邮箱的主人（抢注）。
   * 标为已验证、改为 Google 账号、作废原密码和它发出的所有会话；已验证的账号什么都不动。返回是否改了。
   */
  absorbUnverifiedCredentials?: (email: string, now: string) => Promise<boolean>;
}

export interface StorageAuthUserProviderOptions {
  /** 有它时 absorbUnverifiedCredentials 是一条带条件的 UPDATE；内存存储（mock）没有。 */
  client?: LiveRecordSqlClient;
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
  client,
  store,
  workspaceId,
}: StorageAuthUserProviderOptions): AuthUserStorageProvider {
  function recordFor(user: StoredAuthUser): LiveRecord<Record<string, unknown>> {
    return {
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
    };
  }
  return {
    source: `live-record-store:auth-users:${workspaceId}`,
    async insertUserIfAbsent(user) {
      if (!store.insertRecordIfAbsent) throw new Error("Auth storage requires atomic insert support.");
      const inserted = await store.insertRecordIfAbsent(recordFor(user));
      return inserted ? storedUserFromRecord(inserted) : null;
    },
    async getUserByEmail(email) {
      const record = await store.getRecord({
        workspaceId,
        collectionName: AUTH_USER_LIVE_RECORD_COLLECTION,
        recordId: authUserRecordId(email),
      });

      return record ? storedUserFromRecord(record) : null;
    },
    async saveUser(user) {
      await store.upsertRecord(recordFor(user));

      return user;
    },
    async absorbUnverifiedCredentials(email, now) {
      const recordId = authUserRecordId(email);
      if (client) {
        const result = await client.query(`UPDATE orbit_records SET provider = 'google',
            payload = (payload - 'passwordReset' - 'mustChangePassword') || jsonb_build_object('provider', 'google', 'passwordHash', null,
              'emailVerifiedAt', $4::text, 'passwordChangedAt', $4::text, 'passwordRevokedAt', $4::text, 'updatedAt', $4::text),
            updated_at = $4::timestamptz
          WHERE workspace_id = $1 AND collection_name = $2 AND record_id = $3 AND lifecycle_state = 'active'
            AND payload->>'provider' = 'credentials' AND coalesce(payload->>'emailVerifiedAt', '') = ''
          RETURNING record_id`, [workspaceId, AUTH_USER_LIVE_RECORD_COLLECTION, recordId, now]);
        return result.rows.length === 1;
      }
      const record = await store.getRecord({ workspaceId, collectionName: AUTH_USER_LIVE_RECORD_COLLECTION, recordId });
      if (!record || record.payload.provider !== "credentials" || nonEmptyString(record.payload.emailVerifiedAt)) return false;
      const { passwordReset: _reset, mustChangePassword: _must, ...rest } = record.payload;
      await store.upsertRecord({ ...record, provider: "google", updatedAt: now, payload: { ...rest, provider: "google", passwordHash: null,
        emailVerifiedAt: now, passwordChangedAt: now, passwordRevokedAt: now, updatedAt: now } });
      return true;
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
    client: configuredStore.client,
    store: configuredStore.store,
    workspaceId: configuredStore.workspaceId,
  });
}
